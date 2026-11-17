-- DATA-001 bank-core foundation. This migration deliberately excludes forms,
-- attempts, Factory job tables, and application workflow commands.

DO $roles$
DECLARE
  role_name text;
  existing_role record;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['tsa_web', 'tsa_bank', 'tsa_factory', 'tsa_exam'] LOOP
    SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
           rolbypassrls, rolinherit
      INTO existing_role
      FROM pg_roles
     WHERE rolname = role_name;

    IF NOT FOUND THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT',
        role_name
      );
    ELSE
      IF existing_role.rolcanlogin OR existing_role.rolsuper OR existing_role.rolcreatedb
         OR existing_role.rolcreaterole OR existing_role.rolreplication
         OR existing_role.rolbypassrls OR existing_role.rolinherit THEN
        RAISE EXCEPTION 'Existing application role % has unsafe attributes', role_name
          USING ERRCODE = '42501';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_auth_members
         WHERE roleid = existing_role.oid OR member = existing_role.oid
      ) THEN
        RAISE EXCEPTION 'Existing application role % has role memberships', role_name
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;
END
$roles$;

CREATE SCHEMA tsa;
CREATE SCHEMA tsa_private;
REVOKE ALL ON SCHEMA tsa FROM PUBLIC;
REVOKE ALL ON SCHEMA tsa_private FROM PUBLIC;
REVOKE ALL ON SCHEMA tsa_meta FROM PUBLIC;

CREATE TYPE tsa.user_role AS ENUM ('CANDIDATE', 'AUTHOR', 'REVIEWER', 'BANK_MANAGER', 'EXAM_MANAGER');
CREATE TYPE tsa.rights_state AS ENUM (
  'OWNED', 'LICENSED', 'OPEN_LICENSE', 'PUBLIC_DOMAIN', 'REFERENCE_ONLY', 'UNKNOWN', 'REVOKED'
);
CREATE TYPE tsa.rights_use AS ENUM ('DISPLAY', 'ADAPT', 'GENERATE', 'TRAIN');
CREATE TYPE tsa.asset_security_class AS ENUM ('QUESTION', 'EXPLANATION');
CREATE TYPE tsa.question_section AS ENUM ('MATH', 'READING', 'SCIENCE');
CREATE TYPE tsa.cognitive_level AS ENUM ('M1', 'M2', 'M3');
CREATE TYPE tsa.question_origin AS ENUM ('MANUAL', 'IMPORTED', 'GENERATED', 'AUGMENTED');
CREATE TYPE tsa.question_asset_purpose AS ENUM ('QUESTION', 'EXPLANATION');
CREATE TYPE tsa.workflow_state AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'QUARANTINED', 'RETIRED');
CREATE TYPE tsa.validation_outcome AS ENUM ('PASS', 'FAIL', 'INCONCLUSIVE');
CREATE TYPE tsa.review_decision AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CHANGES');
CREATE TYPE tsa.duplicate_kind AS ENUM ('EXACT', 'NEAR_DUPLICATE', 'ENEMY', 'RELATED');
CREATE TYPE tsa.duplicate_resolution AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED', 'RESOLVED');

CREATE TABLE tsa.users (
  id uuid PRIMARY KEY,
  issuer text NOT NULL CHECK (btrim(issuer) <> ''),
  subject text NOT NULL CHECK (btrim(subject) <> ''),
  display_name text,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuer, subject)
);

CREATE TABLE tsa.user_roles (
  user_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  role tsa.user_role NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE tsa.sources (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (btrim(title) <> ''),
  canonical_uri text,
  owner_reference text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tsa.source_versions (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES tsa.sources(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  -- Versioned source content and metadata are retained together for reference/1.
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 262144),
  evidence_uri text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_id, version_no),
  UNIQUE (source_id, id)
);
CREATE INDEX source_versions_source_idx ON tsa.source_versions (source_id, version_no DESC);

CREATE TABLE tsa.rights_decisions (
  id uuid PRIMARY KEY,
  source_version_id uuid NOT NULL REFERENCES tsa.source_versions(id) ON DELETE RESTRICT,
  status tsa.rights_state NOT NULL,
  allowed_uses tsa.rights_use[] NOT NULL CHECK (cardinality(allowed_uses) > 0),
  territory text[] NOT NULL CHECK (cardinality(territory) > 0),
  valid_from timestamptz,
  valid_to timestamptz,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object' AND pg_column_size(evidence) <= 65536),
  decided_by uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  supersedes_id uuid REFERENCES tsa.rights_decisions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  UNIQUE (source_version_id, id),
  UNIQUE (id, source_version_id),
  FOREIGN KEY (source_version_id, supersedes_id)
    REFERENCES tsa.rights_decisions(source_version_id, id) ON DELETE RESTRICT
);
CREATE INDEX rights_decisions_source_created_idx ON tsa.rights_decisions (source_version_id, created_at DESC);
CREATE INDEX rights_decisions_actor_idx ON tsa.rights_decisions (decided_by);
CREATE INDEX rights_decisions_supersedes_idx ON tsa.rights_decisions (supersedes_id);

CREATE TABLE tsa.source_rights (
  source_version_id uuid PRIMARY KEY REFERENCES tsa.source_versions(id) ON DELETE RESTRICT,
  decision_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (source_version_id, decision_id)
    REFERENCES tsa.rights_decisions(source_version_id, id) ON DELETE RESTRICT
);
CREATE INDEX source_rights_decision_idx ON tsa.source_rights (decision_id);

CREATE TABLE tsa.asset_versions (
  id uuid PRIMARY KEY,
  source_version_id uuid NOT NULL REFERENCES tsa.source_versions(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE CHECK (btrim(object_key) <> ''),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (btrim(mime) <> ''),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  alt_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(alt_metadata) = 'object' AND pg_column_size(alt_metadata) <= 65536),
  security_class tsa.asset_security_class NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_version_id, id)
);
CREATE INDEX asset_versions_source_idx ON tsa.asset_versions (source_version_id);

CREATE TABLE tsa.taxonomy_versions (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  version_no integer NOT NULL CHECK (version_no > 0),
  definition_hash text NOT NULL CHECK (definition_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (name, version_no)
);

CREATE TABLE tsa.taxonomy_nodes (
  id uuid PRIMARY KEY,
  taxonomy_version_id uuid NOT NULL REFERENCES tsa.taxonomy_versions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (btrim(code) <> ''),
  kind text NOT NULL CHECK (btrim(kind) <> ''),
  parent_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 32768),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (taxonomy_version_id, code),
  UNIQUE (taxonomy_version_id, id),
  FOREIGN KEY (taxonomy_version_id, parent_id)
    REFERENCES tsa.taxonomy_nodes(taxonomy_version_id, id) ON DELETE RESTRICT,
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX taxonomy_nodes_parent_idx ON tsa.taxonomy_nodes (taxonomy_version_id, parent_id);

CREATE TABLE tsa.stimuli (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tsa.stimulus_versions (
  id uuid PRIMARY KEY,
  stimulus_id uuid NOT NULL REFERENCES tsa.stimuli(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'array' AND pg_column_size(content) <= 262144),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (stimulus_id, version_no),
  UNIQUE (stimulus_id, id)
);
CREATE INDEX stimulus_versions_stimulus_idx ON tsa.stimulus_versions (stimulus_id, version_no DESC);

CREATE TABLE tsa.stimulus_sources (
  stimulus_version_id uuid NOT NULL REFERENCES tsa.stimulus_versions(id) ON DELETE RESTRICT,
  source_version_id uuid NOT NULL REFERENCES tsa.source_versions(id) ON DELETE RESTRICT,
  span jsonb,
  PRIMARY KEY (stimulus_version_id, source_version_id),
  CHECK (span IS NULL OR pg_column_size(span) <= 16384)
);
CREATE INDEX stimulus_sources_source_idx ON tsa.stimulus_sources (source_version_id, stimulus_version_id);

CREATE TABLE tsa.stimulus_assets (
  stimulus_version_id uuid NOT NULL REFERENCES tsa.stimulus_versions(id) ON DELETE RESTRICT,
  asset_version_id uuid NOT NULL REFERENCES tsa.asset_versions(id) ON DELETE RESTRICT,
  PRIMARY KEY (stimulus_version_id, asset_version_id)
);
CREATE INDEX stimulus_assets_asset_idx ON tsa.stimulus_assets (asset_version_id, stimulus_version_id);

CREATE TABLE tsa.questions (
  id uuid PRIMARY KEY,
  eligible_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, eligible_version_id)
);

CREATE TABLE tsa.question_versions (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES tsa.questions(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  parent_version_id uuid,
  schema_version text NOT NULL CHECK (schema_version = 'question/1'),
  language text NOT NULL CHECK (language = 'vi-VN'),
  section tsa.question_section NOT NULL,
  taxonomy_version_id uuid NOT NULL REFERENCES tsa.taxonomy_versions(id) ON DELETE RESTRICT,
  domain_id text NOT NULL CHECK (btrim(domain_id) <> ''),
  skill_ids jsonb NOT NULL CHECK (jsonb_typeof(skill_ids) = 'array' AND pg_column_size(skill_ids) <= 1048576),
  subskill_ids jsonb NOT NULL CHECK (jsonb_typeof(subskill_ids) = 'array' AND pg_column_size(subskill_ids) <= 1048576),
  cognitive_level tsa.cognitive_level,
  difficulty jsonb NOT NULL CHECK (jsonb_typeof(difficulty) = 'object' AND pg_column_size(difficulty) <= 1048576),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'array' AND pg_column_size(content) <= 1048576),
  stimulus_version_id uuid REFERENCES tsa.stimulus_versions(id) ON DELETE RESTRICT,
  interaction jsonb NOT NULL CHECK (jsonb_typeof(interaction) = 'object' AND pg_column_size(interaction) <= 1048576),
  origin tsa.question_origin NOT NULL,
  provenance_ids jsonb NOT NULL
    CHECK (jsonb_typeof(provenance_ids) = 'array' AND jsonb_array_length(provenance_ids) >= 1
      AND pg_column_size(provenance_ids) <= 1048576),
  generation_run_id uuid,
  created_by text NOT NULL CHECK (btrim(created_by) <> ''),
  created_at timestamptz NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  normalized_fingerprint text NOT NULL CHECK (normalized_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  UNIQUE (question_id, version_no),
  UNIQUE (question_id, id),
  UNIQUE (id, taxonomy_version_id),
  UNIQUE (id, content_hash),
  FOREIGN KEY (question_id, parent_version_id)
    REFERENCES tsa.question_versions(question_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (taxonomy_version_id, domain_id)
    REFERENCES tsa.taxonomy_nodes(taxonomy_version_id, code) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(interaction->'type') = 'string'
    AND interaction->>'type' IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP')),
  CHECK (difficulty ? 'target' AND difficulty ? 'predicted' AND difficulty ? 'empiricalStudyId'),
  CHECK (pg_column_size(skill_ids) + pg_column_size(subskill_ids) + pg_column_size(difficulty)
       + pg_column_size(content) + pg_column_size(interaction) + pg_column_size(provenance_ids) <= 1048576)
);
CREATE INDEX question_versions_question_idx ON tsa.question_versions (question_id, version_no DESC);
CREATE INDEX question_versions_parent_idx ON tsa.question_versions (question_id, parent_version_id);
CREATE INDEX question_versions_taxonomy_idx ON tsa.question_versions (taxonomy_version_id);
CREATE INDEX question_versions_stimulus_idx ON tsa.question_versions (stimulus_version_id);
CREATE INDEX question_versions_section_fingerprint_idx ON tsa.question_versions (section, normalized_fingerprint);
CREATE INDEX question_versions_generation_run_idx ON tsa.question_versions (generation_run_id) WHERE generation_run_id IS NOT NULL;
ALTER TABLE tsa.questions
  ADD CONSTRAINT questions_eligible_version_fk
  FOREIGN KEY (id, eligible_version_id) REFERENCES tsa.question_versions(question_id, id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX questions_eligible_version_idx ON tsa.questions (eligible_version_id) WHERE eligible_version_id IS NOT NULL;

CREATE TABLE tsa_private.question_secrets (
  question_version_id uuid PRIMARY KEY REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  answer_key jsonb NOT NULL CHECK (jsonb_typeof(answer_key) = 'object' AND pg_column_size(answer_key) <= 1048576),
  explanation jsonb NOT NULL CHECK (jsonb_typeof(explanation) = 'array' AND pg_column_size(explanation) <= 1048576),
  scoring_policy_version text NOT NULL CHECK (btrim(scoring_policy_version) <> ''),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND pg_column_size(evidence) <= 1048576),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION tsa_private.check_question_storage_size() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, tsa, tsa_private AS $$
DECLARE
  question_row tsa.question_versions%ROWTYPE;
  combined_size bigint;
BEGIN
  SELECT * INTO question_row FROM tsa.question_versions WHERE id = NEW.question_version_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  combined_size := pg_column_size(jsonb_build_object(
    'schemaVersion', question_row.schema_version,
    'id', question_row.id,
    'questionId', question_row.question_id,
    'versionNo', question_row.version_no,
    'parentVersionId', question_row.parent_version_id,
    'language', question_row.language,
    'section', question_row.section,
    'taxonomyVersionId', question_row.taxonomy_version_id,
    'domainId', question_row.domain_id,
    'skillIds', question_row.skill_ids,
    'subskillIds', question_row.subskill_ids,
    'cognitiveLevel', question_row.cognitive_level,
    'difficulty', question_row.difficulty,
    'content', question_row.content,
    'stimulusVersionId', question_row.stimulus_version_id,
    'interaction', question_row.interaction,
    'private', jsonb_build_object(
      'answerKey', NEW.answer_key,
      'explanation', NEW.explanation,
      'evidenceRefs', NEW.evidence,
      'scoringPolicy', NEW.scoring_policy_version
    ),
    'origin', question_row.origin,
    'provenanceIds', question_row.provenance_ids,
    'generationRunId', question_row.generation_run_id,
    'createdBy', question_row.created_by,
    'createdAt', question_row.created_at,
    'contentHash', question_row.content_hash
  ));
  IF combined_size > 1048576 THEN
    RAISE EXCEPTION 'Question storage representation exceeds 1 MiB guard' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER question_secrets_size_check
  BEFORE INSERT ON tsa_private.question_secrets
  FOR EACH ROW EXECUTE FUNCTION tsa_private.check_question_storage_size();

CREATE TABLE tsa.question_taxonomy (
  question_version_id uuid NOT NULL,
  taxonomy_version_id uuid NOT NULL,
  node_code text NOT NULL,
  dimension text NOT NULL CHECK (dimension IN ('DOMAIN', 'SKILL', 'SUBSKILL')),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (question_version_id, dimension, ordinal),
  UNIQUE (question_version_id, node_code),
  FOREIGN KEY (question_version_id, taxonomy_version_id)
    REFERENCES tsa.question_versions(id, taxonomy_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (taxonomy_version_id, node_code)
    REFERENCES tsa.taxonomy_nodes(taxonomy_version_id, code) ON DELETE RESTRICT
);
CREATE INDEX question_taxonomy_node_idx ON tsa.question_taxonomy (taxonomy_version_id, node_code);

CREATE TABLE tsa.question_provenance (
  question_version_id uuid NOT NULL REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  provenance_id text NOT NULL CHECK (btrim(provenance_id) <> ''),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  source_version_id uuid NOT NULL REFERENCES tsa.source_versions(id) ON DELETE RESTRICT,
  origin tsa.question_origin NOT NULL,
  source_span text,
  transformation text NOT NULL CHECK (btrim(transformation) <> ''),
  creator text NOT NULL CHECK (btrim(creator) <> ''),
  rights_decision_at_authoring uuid NOT NULL,
  PRIMARY KEY (question_version_id, provenance_id),
  UNIQUE (question_version_id, ordinal),
  FOREIGN KEY (source_version_id, rights_decision_at_authoring)
    REFERENCES tsa.rights_decisions(source_version_id, id) ON DELETE RESTRICT
);
CREATE INDEX question_provenance_source_idx ON tsa.question_provenance (source_version_id, question_version_id);
CREATE INDEX question_provenance_rights_idx ON tsa.question_provenance (rights_decision_at_authoring);

CREATE TABLE tsa.question_assets (
  question_version_id uuid NOT NULL REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  asset_version_id uuid NOT NULL REFERENCES tsa.asset_versions(id) ON DELETE RESTRICT,
  purpose tsa.question_asset_purpose NOT NULL,
  PRIMARY KEY (question_version_id, asset_version_id, purpose)
);
CREATE INDEX question_assets_asset_idx ON tsa.question_assets (asset_version_id, question_version_id);

CREATE TABLE tsa.question_workflow (
  question_version_id uuid PRIMARY KEY REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  state tsa.workflow_state NOT NULL DEFAULT 'DRAFT',
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  approved_review_id uuid,
  quarantine_reason text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX question_workflow_state_idx ON tsa.question_workflow (state, question_version_id);

CREATE TABLE tsa.validation_runs (
  id uuid PRIMARY KEY,
  question_version_id uuid NOT NULL REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  validator_version text NOT NULL CHECK (btrim(validator_version) <> ''),
  kind text NOT NULL CHECK (btrim(kind) <> ''),
  outcome tsa.validation_outcome NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) IN ('object', 'array') AND pg_column_size(evidence) <= 65536),
  job_id uuid,
  actor text NOT NULL CHECK (btrim(actor) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (question_version_id, input_hash)
    REFERENCES tsa.question_versions(id, content_hash) ON DELETE RESTRICT
);
CREATE INDEX validation_runs_version_created_idx ON tsa.validation_runs (question_version_id, created_at DESC);
CREATE INDEX validation_runs_job_idx ON tsa.validation_runs (job_id) WHERE job_id IS NOT NULL;

CREATE TABLE tsa.reviews (
  id uuid PRIMARY KEY,
  question_version_id uuid NOT NULL REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  reviewer_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  decision tsa.review_decision NOT NULL,
  rubric jsonb NOT NULL CHECK (jsonb_typeof(rubric) = 'object' AND pg_column_size(rubric) <= 32768),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (question_version_id, id),
  FOREIGN KEY (question_version_id, content_hash)
    REFERENCES tsa.question_versions(id, content_hash) ON DELETE RESTRICT
);
CREATE INDEX reviews_version_created_idx ON tsa.reviews (question_version_id, created_at DESC);
CREATE INDEX reviews_reviewer_idx ON tsa.reviews (reviewer_id);
ALTER TABLE tsa.question_workflow
  ADD CONSTRAINT question_workflow_approved_review_fk
  FOREIGN KEY (question_version_id, approved_review_id) REFERENCES tsa.reviews(question_version_id, id)
  ON DELETE RESTRICT;

CREATE TABLE tsa.duplicate_relations (
  id uuid PRIMARY KEY,
  left_version_id uuid NOT NULL REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  right_version_id uuid NOT NULL REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  kind tsa.duplicate_kind NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) IN ('object', 'array') AND pg_column_size(evidence) <= 65536),
  resolution tsa.duplicate_resolution NOT NULL DEFAULT 'OPEN',
  detector_version text NOT NULL CHECK (btrim(detector_version) <> ''),
  resolved_by uuid REFERENCES tsa.users(id) ON DELETE RESTRICT,
  resolution_evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (left_version_id < right_version_id),
  UNIQUE (left_version_id, right_version_id, kind),
  CHECK (resolution_evidence IS NULL OR pg_column_size(resolution_evidence) <= 65536)
);
CREATE INDEX duplicate_relations_left_idx ON tsa.duplicate_relations (left_version_id);
CREATE INDEX duplicate_relations_right_idx ON tsa.duplicate_relations (right_version_id);

CREATE TABLE tsa.duplicate_groups (
  id uuid PRIMARY KEY,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  confirmed_by uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  merged_into_id uuid REFERENCES tsa.duplicate_groups(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);
CREATE INDEX duplicate_groups_merged_idx ON tsa.duplicate_groups (merged_into_id) WHERE merged_into_id IS NOT NULL;

CREATE TABLE tsa.duplicate_group_members (
  group_id uuid NOT NULL REFERENCES tsa.duplicate_groups(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL UNIQUE REFERENCES tsa.questions(id) ON DELETE RESTRICT,
  PRIMARY KEY (group_id, question_id)
);
CREATE INDEX duplicate_group_members_question_idx ON tsa.duplicate_group_members (question_id, group_id);

CREATE TABLE tsa.bundles (
  id uuid PRIMARY KEY,
  stimulus_version_id uuid NOT NULL REFERENCES tsa.stimulus_versions(id) ON DELETE RESTRICT,
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bundles_stimulus_idx ON tsa.bundles (stimulus_version_id);

CREATE TABLE tsa.bundle_members (
  bundle_id uuid NOT NULL REFERENCES tsa.bundles(id) ON DELETE RESTRICT,
  question_version_id uuid NOT NULL UNIQUE REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  PRIMARY KEY (bundle_id, ordinal)
);
CREATE INDEX bundle_members_version_idx ON tsa.bundle_members (question_version_id, bundle_id);

CREATE TABLE tsa.bank_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  eligibility_revision bigint NOT NULL DEFAULT 0 CHECK (eligibility_revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO tsa.bank_state (id, eligibility_revision) VALUES (1, 0);

CREATE FUNCTION tsa.reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, tsa, tsa_private AS $$
BEGIN
  RAISE EXCEPTION 'Immutable record in %.% cannot be changed', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '23514';
END
$$;

DO $immutability$
DECLARE
  qualified_name text;
BEGIN
  FOREACH qualified_name IN ARRAY ARRAY[
    'tsa.source_versions', 'tsa.rights_decisions', 'tsa.asset_versions',
    'tsa.taxonomy_versions', 'tsa.taxonomy_nodes', 'tsa.stimulus_versions',
    'tsa.stimulus_sources', 'tsa.stimulus_assets', 'tsa.question_versions',
    'tsa.question_taxonomy', 'tsa.question_provenance', 'tsa.question_assets',
    'tsa.validation_runs', 'tsa.reviews', 'tsa.bundles', 'tsa.bundle_members',
    'tsa_private.question_secrets'
  ] LOOP
    EXECUTE format('CREATE TRIGGER immutable_record BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change()', qualified_name);
  END LOOP;
END
$immutability$;

REVOKE ALL ON ALL TABLES IN SCHEMA tsa FROM PUBLIC, tsa_web, tsa_factory, tsa_exam;
REVOKE ALL ON ALL TABLES IN SCHEMA tsa_private FROM PUBLIC, tsa_web, tsa_factory, tsa_exam;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tsa FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tsa_private FROM PUBLIC;
GRANT USAGE ON SCHEMA tsa TO tsa_web, tsa_bank, tsa_factory, tsa_exam;
GRANT USAGE ON SCHEMA tsa_private TO tsa_bank, tsa_exam;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tsa TO tsa_bank;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tsa_private TO tsa_bank;
GRANT SELECT ON tsa.sources, tsa.source_versions, tsa.rights_decisions, tsa.source_rights,
  tsa.taxonomy_versions, tsa.taxonomy_nodes TO tsa_factory;
GRANT SELECT ON tsa.question_versions, tsa.stimulus_versions, tsa.asset_versions TO tsa_exam;
GRANT SELECT ON tsa_private.question_secrets TO tsa_exam;
