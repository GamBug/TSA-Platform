-- DATA-001 exam persistence. This migration adds relational integrity and
-- storage-boundary protections; it does not implement HTTP or allocation APIs.

ALTER TABLE tsa.question_versions ADD COLUMN authored_created_at text;
ALTER TABLE tsa.question_versions
  ADD CONSTRAINT question_versions_authored_created_at_format
  CHECK (authored_created_at IS NULL OR btrim(authored_created_at) <> '');
-- Existing immutable versions remain readable with a NULL marker. New versions
-- receive an xid used to ensure their immutable child evidence is committed in
-- the same transaction as the version itself.
ALTER TABLE tsa.question_versions ADD COLUMN creation_xid xid8;
ALTER TABLE tsa.stimulus_versions ADD COLUMN creation_xid xid8;
ALTER TABLE tsa.bundles ADD COLUMN creation_xid xid8;
ALTER TABLE tsa.taxonomy_versions ADD COLUMN creation_xid xid8;

CREATE TYPE tsa.form_mode AS ENUM ('PERSONALIZED_PRACTICE', 'PUBLISHED_FIXED');
CREATE TYPE tsa.reuse_mode AS ENUM ('NEW_ONLY', 'REVIEW_ALLOWED', 'FIXED_AS_PUBLISHED');
CREATE TYPE tsa.attempt_state AS ENUM (
  'CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'GRADED', 'CANCELLED', 'INVALIDATED'
);
CREATE TYPE tsa.job_state AS ENUM (
  'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED'
);
CREATE TYPE tsa.rate_limit_scope AS ENUM ('USER_CREATE', 'USER_SAVE', 'ATTEMPT_SAVE');

CREATE TABLE tsa.blueprints (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tsa.blueprint_versions (
  id uuid PRIMARY KEY,
  blueprint_id uuid NOT NULL REFERENCES tsa.blueprints(id) ON DELETE RESTRICT,
  taxonomy_version_id uuid NOT NULL REFERENCES tsa.taxonomy_versions(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  schema_version text NOT NULL CHECK (schema_version = 'blueprint/1'),
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object' AND pg_column_size(config) <= 262144),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  approved_by uuid REFERENCES tsa.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (blueprint_id, version_no),
  UNIQUE (id, blueprint_id),
  UNIQUE (id, taxonomy_version_id),
  CHECK (COALESCE(config->>'schemaVersion' = schema_version, false)),
  CHECK (COALESCE(config->>'taxonomyVersionId' = taxonomy_version_id::text, false))
);
CREATE INDEX blueprint_versions_taxonomy_idx ON tsa.blueprint_versions (taxonomy_version_id);

CREATE TABLE tsa.blueprint_offerings (
  blueprint_version_id uuid PRIMARY KEY REFERENCES tsa.blueprint_versions(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  available_from timestamptz NOT NULL,
  available_until timestamptz NOT NULL,
  start_ttl_seconds integer NOT NULL CHECK (start_ttl_seconds = 600),
  review_enabled boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (isfinite(available_from) AND isfinite(available_until) AND available_until > available_from)
);

CREATE TABLE tsa.assembly_runs (
  id uuid PRIMARY KEY,
  blueprint_version_id uuid NOT NULL REFERENCES tsa.blueprint_versions(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES tsa.users(id) ON DELETE RESTRICT,
  form_mode tsa.form_mode NOT NULL,
  reuse_mode tsa.reuse_mode NOT NULL,
  history_revision bigint CHECK (history_revision IS NULL OR history_revision >= 0),
  bank_revision text NOT NULL CHECK (btrim(bank_revision) <> ''),
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  seed bigint NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
  algorithm_version text NOT NULL CHECK (algorithm_version = 'assembly/1'),
  limits jsonb NOT NULL CHECK (jsonb_typeof(limits) = 'object' AND pg_column_size(limits) <= 65536),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object' AND pg_column_size(manifest) <= 16777216),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(diagnostics) = 'object' AND pg_column_size(diagnostics) <= 262144),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((form_mode = 'PERSONALIZED_PRACTICE' AND user_id IS NOT NULL
          AND reuse_mode IN ('NEW_ONLY', 'REVIEW_ALLOWED')) OR
         (form_mode = 'PUBLISHED_FIXED' AND reuse_mode = 'FIXED_AS_PUBLISHED'))
);
CREATE INDEX assembly_runs_blueprint_idx ON tsa.assembly_runs (blueprint_version_id, created_at DESC);
CREATE INDEX assembly_runs_user_idx ON tsa.assembly_runs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX assembly_runs_created_outcome_idx ON tsa.assembly_runs (created_at, outcome);

CREATE TABLE tsa.forms (
  id uuid PRIMARY KEY,
  assembly_run_id uuid NOT NULL UNIQUE REFERENCES tsa.assembly_runs(id) ON DELETE RESTRICT,
  blueprint_version_id uuid NOT NULL REFERENCES tsa.blueprint_versions(id) ON DELETE RESTRICT,
  mode tsa.form_mode NOT NULL,
  owner_user_id uuid REFERENCES tsa.users(id) ON DELETE RESTRICT,
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  policy_versions jsonb NOT NULL CHECK (jsonb_typeof(policy_versions) = 'object' AND pg_column_size(policy_versions) <= 65536),
  creation_xid xid8 NOT NULL,
  sealed_at timestamptz NOT NULL,
  UNIQUE (id, mode),
  UNIQUE (id, mode, owner_user_id),
  CHECK ((mode = 'PERSONALIZED_PRACTICE' AND owner_user_id IS NOT NULL) OR
         (mode = 'PUBLISHED_FIXED' AND owner_user_id IS NULL))
);
CREATE INDEX forms_blueprint_idx ON tsa.forms (blueprint_version_id);
CREATE INDEX forms_owner_idx ON tsa.forms (owner_user_id) WHERE owner_user_id IS NOT NULL;

CREATE TABLE tsa.form_availability (
  form_id uuid PRIMARY KEY REFERENCES tsa.forms(id) ON DELETE RESTRICT,
  available_from timestamptz NOT NULL,
  available_until timestamptz NOT NULL,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (isfinite(available_from) AND isfinite(available_until) AND available_until > available_from),
  CHECK ((withdrawn_at IS NULL AND withdrawal_reason IS NULL) OR
         (withdrawn_at IS NOT NULL AND withdrawal_reason IS NOT NULL AND btrim(withdrawal_reason) <> ''))
);
CREATE INDEX form_availability_window_idx ON tsa.form_availability (available_from, available_until)
  WHERE withdrawn_at IS NULL;

CREATE TABLE tsa.form_sections (
  form_id uuid NOT NULL REFERENCES tsa.forms(id) ON DELETE RESTRICT,
  section_id text NOT NULL CHECK (btrim(section_id) <> ''),
  section tsa.question_section NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  question_count integer NOT NULL CHECK (question_count > 0),
  PRIMARY KEY (form_id, section_id),
  UNIQUE (form_id, ordinal)
);

CREATE TABLE tsa.form_slots (
  form_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  section_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  question_id uuid NOT NULL,
  question_version_id uuid NOT NULL,
  bundle_id uuid REFERENCES tsa.bundles(id) ON DELETE RESTRICT,
  public_snapshot jsonb NOT NULL CHECK (jsonb_typeof(public_snapshot) = 'object' AND pg_column_size(public_snapshot) <= 1048576),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^sha256:[0-9a-f]{64}$'),
  PRIMARY KEY (form_id, slot_id),
  UNIQUE (form_id, ordinal),
  UNIQUE (form_id, question_id),
  FOREIGN KEY (form_id, section_id) REFERENCES tsa.form_sections(form_id, section_id) ON DELETE RESTRICT,
  FOREIGN KEY (question_id, question_version_id)
    REFERENCES tsa.question_versions(question_id, id) ON DELETE RESTRICT
);
CREATE INDEX form_slots_question_version_idx ON tsa.form_slots (question_version_id);
CREATE INDEX form_slots_section_idx ON tsa.form_slots (form_id, section_id, ordinal);
CREATE INDEX form_slots_bundle_idx ON tsa.form_slots (bundle_id) WHERE bundle_id IS NOT NULL;

CREATE TABLE tsa_private.form_slot_secrets (
  form_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  key_snapshot jsonb NOT NULL CHECK (jsonb_typeof(key_snapshot) = 'object' AND pg_column_size(key_snapshot) <= 262144),
  explanation_snapshot jsonb NOT NULL CHECK (jsonb_typeof(explanation_snapshot) = 'array' AND pg_column_size(explanation_snapshot) <= 262144),
  policy_version text NOT NULL CHECK (btrim(policy_version) <> ''),
  secret_hash text NOT NULL CHECK (secret_hash ~ '^sha256:[0-9a-f]{64}$'),
  PRIMARY KEY (form_id, slot_id),
  FOREIGN KEY (form_id, slot_id) REFERENCES tsa.form_slots(form_id, slot_id) ON DELETE RESTRICT
);

CREATE TABLE tsa.form_assets (
  form_id uuid NOT NULL REFERENCES tsa.forms(id) ON DELETE RESTRICT,
  asset_version_id uuid NOT NULL REFERENCES tsa.asset_versions(id) ON DELETE RESTRICT,
  purpose tsa.question_asset_purpose NOT NULL,
  PRIMARY KEY (form_id, asset_version_id, purpose)
);
CREATE INDEX form_assets_asset_idx ON tsa.form_assets (asset_version_id, form_id);

CREATE TABLE tsa.attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  form_id uuid NOT NULL,
  form_mode tsa.form_mode NOT NULL,
  personal_owner_reference uuid,
  reuse_mode tsa.reuse_mode NOT NULL,
  reuse_policy_version text NOT NULL CHECK (btrim(reuse_policy_version) <> ''),
  state tsa.attempt_state NOT NULL DEFAULT 'CREATED',
  created_at timestamptz NOT NULL,
  admission_until_at_creation timestamptz NOT NULL,
  start_before_at timestamptz NOT NULL,
  started_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  finalized_at timestamptz,
  terminal_reason text,
  cancellation_reason text,
  grading_status text CHECK (grading_status IS NULL OR grading_status IN
    ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL')),
  latest_score_id uuid,
  invalidation_reason text,
  UNIQUE (id, user_id),
  UNIQUE (id, form_id),
  UNIQUE (id, form_mode, form_id),
  FOREIGN KEY (form_id, form_mode) REFERENCES tsa.forms(id, mode) ON DELETE RESTRICT,
  FOREIGN KEY (form_id, form_mode, personal_owner_reference)
    REFERENCES tsa.forms(id, mode, owner_user_id) ON DELETE RESTRICT,
  CHECK (created_at < start_before_at),
  CHECK (isfinite(admission_until_at_creation) AND isfinite(start_before_at)),
  CHECK ((form_mode = 'PERSONALIZED_PRACTICE' AND personal_owner_reference = user_id
          AND personal_owner_reference IS NOT NULL AND reuse_mode IN ('NEW_ONLY', 'REVIEW_ALLOWED')) OR
         (form_mode = 'PUBLISHED_FIXED' AND personal_owner_reference IS NULL
          AND reuse_mode = 'FIXED_AS_PUBLISHED')),
  CHECK ((started_at IS NULL AND deadline_at IS NULL) OR
         (started_at IS NOT NULL AND deadline_at IS NOT NULL AND deadline_at > started_at)),
  CHECK (closed_at IS NULL OR started_at IS NOT NULL OR state IN ('CANCELLED', 'INVALIDATED')),
  CHECK (finalized_at IS NULL OR state IN ('GRADED', 'CANCELLED', 'INVALIDATED'))
);
CREATE UNIQUE INDEX uq_personal_form_one_attempt ON tsa.attempts (form_id)
  WHERE form_mode = 'PERSONALIZED_PRACTICE';
CREATE UNIQUE INDEX uq_one_active_attempt_per_user ON tsa.attempts (user_id)
  WHERE state IN ('CREATED', 'IN_PROGRESS');
CREATE INDEX attempts_user_created_idx ON tsa.attempts (user_id, created_at DESC);
CREATE INDEX attempts_form_mode_idx ON tsa.attempts (form_id, form_mode);
CREATE INDEX attempts_form_owner_reference_idx ON tsa.attempts (form_id, form_mode, personal_owner_reference);
CREATE INDEX attempts_start_before_idx ON tsa.attempts (start_before_at) WHERE state = 'CREATED';
CREATE INDEX attempts_deadline_idx ON tsa.attempts (deadline_at) WHERE state = 'IN_PROGRESS';
CREATE INDEX attempts_form_created_idx ON tsa.attempts (form_id, created_at) WHERE state = 'CREATED';

CREATE TABLE tsa.attempt_sections (
  attempt_id uuid NOT NULL,
  form_id uuid NOT NULL,
  section_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  PRIMARY KEY (attempt_id, section_id),
  FOREIGN KEY (attempt_id, form_id) REFERENCES tsa.attempts(id, form_id) ON DELETE RESTRICT,
  FOREIGN KEY (form_id, section_id) REFERENCES tsa.form_sections(form_id, section_id) ON DELETE RESTRICT,
  CHECK (ends_at > starts_at)
);
CREATE INDEX attempt_sections_form_idx ON tsa.attempt_sections (form_id, section_id);

CREATE TABLE tsa.answers (
  attempt_id uuid NOT NULL,
  form_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  value jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (attempt_id, slot_id),
  FOREIGN KEY (attempt_id, form_id) REFERENCES tsa.attempts(id, form_id) ON DELETE RESTRICT,
  FOREIGN KEY (form_id, slot_id) REFERENCES tsa.form_slots(form_id, slot_id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(value) = 'object')
);
CREATE INDEX answers_form_slot_idx ON tsa.answers (form_id, slot_id);

CREATE TABLE tsa.score_runs (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL,
  form_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (btrim(policy_version) <> ''),
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  correct_count integer NOT NULL CHECK (correct_count >= 0),
  total_count integer NOT NULL CHECK (total_count > 0),
  percentage numeric(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  section_totals jsonb NOT NULL CHECK (jsonb_typeof(section_totals) = 'array' AND pg_column_size(section_totals) <= 65536),
  supersedes_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (attempt_id, form_id) REFERENCES tsa.attempts(id, form_id) ON DELETE RESTRICT,
  FOREIGN KEY (attempt_id, supersedes_id) REFERENCES tsa.score_runs(attempt_id, id) ON DELETE RESTRICT,
  CHECK (correct_count <= total_count),
  UNIQUE (attempt_id, id),
  UNIQUE (id, form_id),
  UNIQUE (attempt_id, policy_version, input_hash),
  UNIQUE (attempt_id, id, policy_version)
);
CREATE INDEX score_runs_form_idx ON tsa.score_runs (form_id, created_at DESC);
CREATE INDEX score_runs_attempt_form_idx ON tsa.score_runs (attempt_id, form_id);
CREATE INDEX score_runs_supersedes_idx ON tsa.score_runs (attempt_id, supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE TABLE tsa.score_items (
  score_run_id uuid NOT NULL,
  form_id uuid NOT NULL,
  slot_id uuid NOT NULL,
  earned smallint NOT NULL CHECK (earned IN (0, 1)),
  PRIMARY KEY (score_run_id, slot_id),
  FOREIGN KEY (score_run_id, form_id) REFERENCES tsa.score_runs(id, form_id) ON DELETE RESTRICT,
  FOREIGN KEY (form_id, slot_id) REFERENCES tsa.form_slots(form_id, slot_id) ON DELETE RESTRICT
);
CREATE INDEX score_items_form_slot_idx ON tsa.score_items (form_id, slot_id);
CREATE INDEX score_items_score_run_form_idx ON tsa.score_items (score_run_id, form_id);

ALTER TABLE tsa.attempts ADD CONSTRAINT attempts_latest_score_fk
  FOREIGN KEY (id, latest_score_id) REFERENCES tsa.score_runs(attempt_id, id) ON DELETE RESTRICT;

CREATE TABLE tsa.result_releases (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL,
  score_run_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (btrim(policy_version) <> ''),
  released_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  reason text,
  UNIQUE (attempt_id, score_run_id),
  FOREIGN KEY (attempt_id, score_run_id, policy_version)
    REFERENCES tsa.score_runs(attempt_id, id, policy_version) ON DELETE RESTRICT,
  CHECK (revoked_at IS NULL OR revoked_at >= released_at),
  CHECK (revoked_at IS NULL OR (reason IS NOT NULL AND btrim(reason) <> ''))
);
CREATE UNIQUE INDEX uq_active_result_release_per_attempt ON tsa.result_releases (attempt_id)
  WHERE revoked_at IS NULL;
CREATE INDEX result_releases_score_idx ON tsa.result_releases (score_run_id, attempt_id);
CREATE INDEX result_releases_attempt_score_policy_idx ON tsa.result_releases (attempt_id, score_run_id, policy_version);

CREATE TABLE tsa.jobs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('factory_produce_unit', 'exam_grade_attempt')),
  dedup_key text NOT NULL CHECK (btrim(dedup_key) <> ''),
  payload_ref text NOT NULL CHECK (btrim(payload_ref) <> ''),
  attempt_id uuid,
  state tsa.job_state NOT NULL DEFAULT 'QUEUED',
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  lease_owner text,
  lease_token bigint NOT NULL DEFAULT 0 CHECK (lease_token >= 0),
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (kind, dedup_key),
  FOREIGN KEY (attempt_id) REFERENCES tsa.attempts(id) ON DELETE RESTRICT,
  CHECK (attempts <= max_attempts),
  CHECK ((kind = 'exam_grade_attempt' AND attempt_id IS NOT NULL) OR
         (kind = 'factory_produce_unit' AND attempt_id IS NULL)),
  CHECK ((state = 'RUNNING' AND lease_owner IS NOT NULL AND btrim(lease_owner) <> '' AND lease_until IS NOT NULL
          AND lease_token > 0) OR
         (state <> 'RUNNING' AND lease_owner IS NULL AND lease_until IS NULL)),
  CHECK (last_error_code IS NULL OR btrim(last_error_code) <> '')
);
CREATE INDEX jobs_state_available_idx ON tsa.jobs (state, available_at) WHERE state IN ('QUEUED', 'FAILED_RETRYABLE');
CREATE INDEX jobs_attempt_idx ON tsa.jobs (attempt_id) WHERE attempt_id IS NOT NULL;

CREATE TABLE tsa.idempotency_records (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  route_scope text NOT NULL CHECK (btrim(route_scope) <> ''),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[!-~]{1,128}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  response_status integer NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  safe_response jsonb NOT NULL CHECK (jsonb_typeof(safe_response) = 'object' AND pg_column_size(safe_response) <= 262144),
  resource_id uuid,
  related_attempt_id uuid REFERENCES tsa.attempts(id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at >= completed_at + interval '7 days'),
  FOREIGN KEY (related_attempt_id, actor_id) REFERENCES tsa.attempts(id, user_id) ON DELETE RESTRICT,
  UNIQUE (actor_id, route_scope, idempotency_key)
);
CREATE INDEX idempotency_related_attempt_idx ON tsa.idempotency_records (related_attempt_id)
  WHERE related_attempt_id IS NOT NULL;
CREATE INDEX idempotency_expiry_idx ON tsa.idempotency_records (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE tsa.audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES tsa.users(id) ON DELETE RESTRICT,
  service_actor text,
  action text NOT NULL CHECK (btrim(action) <> ''),
  entity_type text NOT NULL CHECK (btrim(entity_type) <> ''),
  entity_id text NOT NULL CHECK (btrim(entity_id) <> ''),
  before_revision bigint CHECK (before_revision IS NULL OR before_revision >= 0),
  after_revision bigint CHECK (after_revision IS NULL OR after_revision >= 0),
  reason text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((actor_id IS NOT NULL AND service_actor IS NULL) OR
         (actor_id IS NULL AND service_actor IS NOT NULL AND btrim(service_actor) <> ''))
);
CREATE INDEX audit_events_entity_idx ON tsa.audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_events_actor_idx ON tsa.audit_events (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;

CREATE TABLE tsa.rate_limit_buckets (
  scope tsa.rate_limit_scope NOT NULL,
  subject_id text NOT NULL CHECK (btrim(subject_id) <> ''),
  tokens numeric(18,6) NOT NULL CHECK (tokens >= 0),
  refilled_at timestamptz NOT NULL,
  PRIMARY KEY (scope, subject_id)
);

CREATE TABLE tsa.student_allocation_state (
  user_id uuid PRIMARY KEY REFERENCES tsa.users(id) ON DELETE RESTRICT,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE tsa.student_question_history (
  user_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES tsa.questions(id) ON DELETE RESTRICT,
  first_attempt_id uuid,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, question_id),
  FOREIGN KEY (first_attempt_id, user_id) REFERENCES tsa.attempts(id, user_id) ON DELETE SET NULL (first_attempt_id)
);
CREATE INDEX student_question_history_question_idx ON tsa.student_question_history (question_id, user_id);
CREATE INDEX student_question_history_attempt_idx ON tsa.student_question_history (first_attempt_id)
  WHERE first_attempt_id IS NOT NULL;

CREATE FUNCTION tsa.reject_immutable_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION tsa.guard_authored_created_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.authored_created_at IS NULL OR btrim(NEW.authored_created_at) = '' THEN
    RAISE EXCEPTION 'New question versions require their original authored_created_at string' USING ERRCODE = '23514';
  END IF;
  NEW.creation_xid := pg_current_xact_id();
  RETURN NEW;
END;
$$;
CREATE TRIGGER question_versions_authored_created_at_required
  BEFORE INSERT ON tsa.question_versions
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_authored_created_at();

CREATE FUNCTION tsa.stamp_creation_xid() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.creation_xid := pg_current_xact_id();
  RETURN NEW;
END;
$$;
CREATE TRIGGER stimulus_versions_creation_xid
  BEFORE INSERT ON tsa.stimulus_versions FOR EACH ROW EXECUTE FUNCTION tsa.stamp_creation_xid();
CREATE TRIGGER bundles_creation_xid
  BEFORE INSERT ON tsa.bundles FOR EACH ROW EXECUTE FUNCTION tsa.stamp_creation_xid();
CREATE TRIGGER taxonomy_versions_creation_xid
  BEFORE INSERT ON tsa.taxonomy_versions FOR EACH ROW EXECUTE FUNCTION tsa.stamp_creation_xid();
CREATE TRIGGER forms_creation_xid
  BEFORE INSERT ON tsa.forms FOR EACH ROW EXECUTE FUNCTION tsa.stamp_creation_xid();

CREATE FUNCTION tsa.require_same_transaction_child() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_id uuid;
  parent_xid xid8;
BEGIN
  parent_id := (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
  CASE TG_ARGV[0]
    WHEN 'question_version' THEN
      SELECT creation_xid INTO parent_xid FROM tsa.question_versions WHERE id = parent_id;
    WHEN 'stimulus_version' THEN
      SELECT creation_xid INTO parent_xid FROM tsa.stimulus_versions WHERE id = parent_id;
    WHEN 'bundle' THEN
      SELECT creation_xid INTO parent_xid FROM tsa.bundles WHERE id = parent_id;
    WHEN 'form' THEN
      SELECT creation_xid INTO parent_xid FROM tsa.forms WHERE id = parent_id;
    WHEN 'taxonomy_version' THEN
      SELECT creation_xid INTO parent_xid FROM tsa.taxonomy_versions WHERE id = parent_id;
    ELSE
      RAISE EXCEPTION 'Unknown immutable parent kind %', TG_ARGV[0] USING ERRCODE = '22023';
  END CASE;
  IF parent_xid IS NULL OR parent_xid <> pg_current_xact_id() THEN
    RAISE EXCEPTION 'Immutable child rows must be committed with their parent version'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER question_taxonomy_same_transaction
  BEFORE INSERT ON tsa.question_taxonomy FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('question_version', 'question_version_id');
CREATE TRIGGER question_provenance_same_transaction
  BEFORE INSERT ON tsa.question_provenance FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('question_version', 'question_version_id');
CREATE TRIGGER question_assets_same_transaction
  BEFORE INSERT ON tsa.question_assets FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('question_version', 'question_version_id');
CREATE TRIGGER question_secrets_same_transaction
  BEFORE INSERT ON tsa_private.question_secrets FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('question_version', 'question_version_id');
CREATE TRIGGER stimulus_sources_same_transaction
  BEFORE INSERT ON tsa.stimulus_sources FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('stimulus_version', 'stimulus_version_id');
CREATE TRIGGER stimulus_assets_same_transaction
  BEFORE INSERT ON tsa.stimulus_assets FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('stimulus_version', 'stimulus_version_id');
CREATE TRIGGER bundle_members_same_transaction
  BEFORE INSERT ON tsa.bundle_members FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('bundle', 'bundle_id');
CREATE TRIGGER taxonomy_nodes_same_transaction
  BEFORE INSERT ON tsa.taxonomy_nodes FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('taxonomy_version', 'taxonomy_version_id');
CREATE TRIGGER form_sections_same_transaction
  BEFORE INSERT ON tsa.form_sections FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('form', 'form_id');
CREATE TRIGGER form_slots_same_transaction
  BEFORE INSERT ON tsa.form_slots FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('form', 'form_id');
CREATE TRIGGER form_assets_same_transaction
  BEFORE INSERT ON tsa.form_assets FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('form', 'form_id');
CREATE TRIGGER form_slot_secrets_same_transaction
  BEFORE INSERT ON tsa_private.form_slot_secrets FOR EACH ROW
  EXECUTE FUNCTION tsa.require_same_transaction_child('form', 'form_id');

CREATE FUNCTION tsa.start_deadline_is_open(p_now timestamptz, p_start_before timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT p_now < p_start_before
$$;

CREATE FUNCTION tsa.guard_offering_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Blueprint offering history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.blueprint_version_id IS DISTINCT FROM OLD.blueprint_version_id
     OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Offering identity is immutable and revision must increase by one'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER blueprint_offerings_revision_guard
  BEFORE UPDATE OR DELETE ON tsa.blueprint_offerings
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_offering_revision();

CREATE FUNCTION tsa.guard_form_availability_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Form availability history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.form_id IS DISTINCT FROM OLD.form_id OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Form availability identity is immutable and revision must increase by one'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER form_availability_revision_guard
  BEFORE UPDATE OR DELETE ON tsa.form_availability
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_form_availability_revision();

CREATE FUNCTION tsa.prepare_attempt_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  form_row record;
  availability_row record;
  offering_row record;
  observed_at timestamptz;
  admission_end timestamptz;
BEGIN
  IF NEW.state <> 'CREATED' THEN
    RAISE EXCEPTION 'Attempts must be created in CREATED state' USING ERRCODE = '23514';
  END IF;
  SELECT id, mode, owner_user_id, blueprint_version_id
    INTO form_row FROM tsa.forms WHERE id = NEW.form_id FOR SHARE;
  IF NOT FOUND OR form_row.mode <> NEW.form_mode THEN
    RAISE EXCEPTION 'Attempt form mode is missing or mismatched' USING ERRCODE = '23503';
  END IF;
  IF form_row.mode = 'PERSONALIZED_PRACTICE' AND form_row.owner_user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Personalized form owner does not match attempt user' USING ERRCODE = '23503';
  END IF;
  IF form_row.mode = 'PUBLISHED_FIXED' AND form_row.owner_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Fixed form cannot have a personal owner' USING ERRCODE = '23514';
  END IF;
  SELECT available_from, available_until, withdrawn_at
    INTO availability_row FROM tsa.form_availability WHERE form_id = NEW.form_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Form is not available for admission' USING ERRCODE = '23514';
  END IF;
  IF availability_row.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'Form is not available for admission' USING ERRCODE = '23514';
  END IF;
  admission_end := availability_row.available_until;
  IF form_row.mode = 'PERSONALIZED_PRACTICE' THEN
    SELECT enabled, available_from, available_until, start_ttl_seconds
      INTO offering_row FROM tsa.blueprint_offerings
     WHERE blueprint_version_id = form_row.blueprint_version_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Blueprint offering is unavailable or has an invalid start TTL' USING ERRCODE = '23514';
    END IF;
    IF NOT offering_row.enabled OR offering_row.start_ttl_seconds <> 600 THEN
      RAISE EXCEPTION 'Blueprint offering is unavailable or has an invalid start TTL' USING ERRCODE = '23514';
    END IF;
    admission_end := LEAST(admission_end, offering_row.available_until);
  END IF;
  -- Locks may have waited behind an availability edit. Admission is judged
  -- from fresh database time after every required row lock has been acquired.
  observed_at := clock_timestamp();
  IF availability_row.withdrawn_at IS NOT NULL OR observed_at < availability_row.available_from
     OR observed_at >= availability_row.available_until THEN
    RAISE EXCEPTION 'Form admission window closed while acquiring its lock' USING ERRCODE = '23514';
  END IF;
  IF form_row.mode = 'PERSONALIZED_PRACTICE' THEN
    IF NOT offering_row.enabled OR observed_at < offering_row.available_from
       OR observed_at >= offering_row.available_until THEN
      RAISE EXCEPTION 'Blueprint offering closed while acquiring its lock' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (form_row.mode = 'PERSONALIZED_PRACTICE' AND NEW.reuse_mode NOT IN ('NEW_ONLY', 'REVIEW_ALLOWED'))
     OR (form_row.mode = 'PUBLISHED_FIXED' AND NEW.reuse_mode <> 'FIXED_AS_PUBLISHED') THEN
    RAISE EXCEPTION 'Attempt form and reuse modes are inconsistent' USING ERRCODE = '23514';
  END IF;
  NEW.personal_owner_reference := CASE WHEN form_row.mode = 'PERSONALIZED_PRACTICE' THEN NEW.user_id ELSE NULL END;
  NEW.created_at := observed_at;
  NEW.admission_until_at_creation := admission_end;
  NEW.start_before_at := LEAST(observed_at + interval '600 seconds', admission_end);
  NEW.started_at := NULL;
  NEW.deadline_at := NULL;
  NEW.closed_at := NULL;
  NEW.finalized_at := NULL;
  NEW.terminal_reason := NULL;
  NEW.cancellation_reason := NULL;
  NEW.grading_status := NULL;
  NEW.latest_score_id := NULL;
  NEW.invalidation_reason := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attempts_prepare_insert
  BEFORE INSERT ON tsa.attempts
  FOR EACH ROW EXECUTE FUNCTION tsa.prepare_attempt_insert();

CREATE FUNCTION tsa.guard_attempt_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  observed_at timestamptz := clock_timestamp();
  section_row record;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.form_id IS DISTINCT FROM OLD.form_id OR NEW.form_mode IS DISTINCT FROM OLD.form_mode
     OR NEW.personal_owner_reference IS DISTINCT FROM OLD.personal_owner_reference
     OR NEW.reuse_mode IS DISTINCT FROM OLD.reuse_mode
     OR NEW.reuse_policy_version IS DISTINCT FROM OLD.reuse_policy_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.admission_until_at_creation IS DISTINCT FROM OLD.admission_until_at_creation
     OR NEW.start_before_at IS DISTINCT FROM OLD.start_before_at THEN
    RAISE EXCEPTION 'Attempt identity and creation-time bounds are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at AND NOT (OLD.state = 'CREATED' AND NEW.state = 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Attempt start time is set only by the first start transition' USING ERRCODE = '55000';
  END IF;
  IF NEW.deadline_at IS DISTINCT FROM OLD.deadline_at AND NOT (OLD.state = 'CREATED' AND NEW.state = 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Attempt deadline is set only by the first start transition' USING ERRCODE = '55000';
  END IF;
  IF NEW.closed_at IS DISTINCT FROM OLD.closed_at AND NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'Attempt closure time is controlled by its state transition' USING ERRCODE = '55000';
  END IF;
  IF NEW.finalized_at IS DISTINCT FROM OLD.finalized_at AND NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'Attempt finalization time is controlled by its state transition' USING ERRCODE = '55000';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
       (OLD.state = 'CREATED' AND NEW.state IN ('IN_PROGRESS', 'CANCELLED', 'INVALIDATED')) OR
       (OLD.state = 'IN_PROGRESS' AND NEW.state IN ('SUBMITTED', 'EXPIRED', 'INVALIDATED')) OR
       (OLD.state IN ('SUBMITTED', 'EXPIRED') AND NEW.state IN ('GRADED', 'INVALIDATED')) OR
       (OLD.state = 'GRADED' AND NEW.state = 'INVALIDATED')) THEN
    RAISE EXCEPTION 'Illegal attempt state transition from % to %', OLD.state, NEW.state USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'CREATED' AND NEW.state = 'IN_PROGRESS' THEN
    IF NOT tsa.start_deadline_is_open(observed_at, OLD.start_before_at) THEN
      RAISE EXCEPTION 'Attempt start deadline has elapsed' USING ERRCODE = '23514';
    END IF;
    SELECT section_id, duration_seconds INTO section_row
      FROM tsa.form_sections WHERE form_id = OLD.form_id;
    IF NOT FOUND OR (SELECT count(*) FROM tsa.form_sections WHERE form_id = OLD.form_id) <> 1 THEN
      RAISE EXCEPTION 'Only the approved one-section MVP profile can start' USING ERRCODE = '23514';
    END IF;
    NEW.started_at := observed_at;
    NEW.deadline_at := observed_at + make_interval(secs => section_row.duration_seconds);
    NEW.closed_at := NULL;
    NEW.finalized_at := NULL;
    NEW.grading_status := NULL;
  ELSIF NEW.state = 'CANCELLED' AND NEW.state IS DISTINCT FROM OLD.state THEN
    IF NEW.cancellation_reason IS NULL OR NEW.cancellation_reason NOT IN
       ('FORM_WITHDRAWN', 'RIGHTS_BLOCKED', 'START_TTL_EXPIRED') THEN
      RAISE EXCEPTION 'Cancelled attempts require a documented cancellation reason' USING ERRCODE = '23514';
    END IF;
    IF NEW.cancellation_reason = 'START_TTL_EXPIRED' AND observed_at < OLD.start_before_at THEN
      RAISE EXCEPTION 'Start-TTL cancellation requires the persisted start deadline to have elapsed' USING ERRCODE = '23514';
    END IF;
    NEW.started_at := NULL;
    NEW.deadline_at := NULL;
    NEW.closed_at := observed_at;
    NEW.finalized_at := observed_at;
  ELSIF NEW.state IN ('SUBMITTED', 'EXPIRED') AND NEW.state IS DISTINCT FROM OLD.state THEN
    IF NEW.state = 'SUBMITTED' AND (OLD.deadline_at IS NULL OR observed_at >= OLD.deadline_at) THEN
      RAISE EXCEPTION 'An attempt at or past its deadline must follow expiry, not submission' USING ERRCODE = '23514';
    END IF;
    IF NEW.state = 'EXPIRED' AND (OLD.deadline_at IS NULL OR observed_at < OLD.deadline_at) THEN
      RAISE EXCEPTION 'An attempt cannot expire before its deadline' USING ERRCODE = '23514';
    END IF;
    NEW.closed_at := CASE WHEN NEW.state = 'EXPIRED' THEN OLD.deadline_at ELSE observed_at END;
    NEW.grading_status := COALESCE(NEW.grading_status, 'PENDING');
    NEW.terminal_reason := CASE WHEN NEW.state = 'SUBMITTED' THEN 'EXPLICIT_SUBMIT' ELSE 'DEADLINE' END;
  ELSIF NEW.state = 'GRADED' AND NEW.state IS DISTINCT FROM OLD.state THEN
    NEW.closed_at := COALESCE(OLD.closed_at, observed_at);
    NEW.finalized_at := observed_at;
    NEW.grading_status := 'SUCCEEDED';
  ELSIF NEW.state = 'INVALIDATED' AND NEW.state IS DISTINCT FROM OLD.state THEN
    IF NEW.invalidation_reason IS NULL OR btrim(NEW.invalidation_reason) = '' THEN
      RAISE EXCEPTION 'Invalidated attempts require a reason' USING ERRCODE = '23514';
    END IF;
    NEW.closed_at := COALESCE(OLD.closed_at, observed_at);
    NEW.finalized_at := observed_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attempts_update_guard
  BEFORE UPDATE ON tsa.attempts
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_attempt_update();
CREATE TRIGGER attempts_no_delete
  BEFORE DELETE ON tsa.attempts
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();

CREATE FUNCTION tsa.record_attempt_section_start() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE section_id_value text;
BEGIN
  IF OLD.state = 'CREATED' AND NEW.state = 'IN_PROGRESS' THEN
    SELECT section_id INTO section_id_value FROM tsa.form_sections WHERE form_id = NEW.form_id;
    INSERT INTO tsa.attempt_sections (attempt_id, form_id, section_id, starts_at, ends_at)
      VALUES (NEW.id, NEW.form_id, section_id_value, NEW.started_at, NEW.deadline_at);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER attempts_start_section
  AFTER UPDATE ON tsa.attempts
  FOR EACH ROW EXECUTE FUNCTION tsa.record_attempt_section_start();

CREATE FUNCTION tsa.guard_answer_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE attempt_row record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Accepted answers are retained and cannot be deleted' USING ERRCODE = '55000';
  END IF;
  SELECT form_id, state, deadline_at INTO attempt_row
    FROM tsa.attempts WHERE id = NEW.attempt_id FOR UPDATE;
  IF NOT FOUND OR attempt_row.form_id <> NEW.form_id THEN
    RAISE EXCEPTION 'Answer attempt and form do not match' USING ERRCODE = '23503';
  END IF;
  IF attempt_row.state <> 'IN_PROGRESS' OR attempt_row.deadline_at IS NULL
     OR clock_timestamp() >= attempt_row.deadline_at THEN
    RAISE EXCEPTION 'Answers are writable only during an open IN_PROGRESS attempt' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 1 THEN
      RAISE EXCEPTION 'First acknowledged answer revision must be one' USING ERRCODE = '23514';
    END IF;
    NEW.saved_at := clock_timestamp();
    RETURN NEW;
  END IF;
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.form_id IS DISTINCT FROM OLD.form_id
     OR NEW.slot_id IS DISTINCT FROM OLD.slot_id OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Answer identity is immutable and revision must increase by one' USING ERRCODE = '23514';
  END IF;
  NEW.saved_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER answers_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON tsa.answers
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_answer_write();

CREATE FUNCTION tsa.guard_job_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Job dispatch history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.dedup_key IS DISTINCT FROM OLD.dedup_key OR NEW.payload_ref IS DISTINCT FROM OLD.payload_ref
     OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Job dispatch identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.lease_token < OLD.lease_token OR NEW.lease_token > OLD.lease_token + 1 THEN
    RAISE EXCEPTION 'Job fencing token must be monotonic and advance one claim at a time' USING ERRCODE = '23514';
  END IF;
  IF NEW.lease_token = OLD.lease_token + 1 AND NEW.state <> 'RUNNING' THEN
    RAISE EXCEPTION 'A new fencing token is issued only for a running lease' USING ERRCODE = '23514';
  END IF;
  IF NEW.state = 'RUNNING' AND OLD.state <> 'RUNNING' AND NEW.lease_token <> OLD.lease_token + 1 THEN
    RAISE EXCEPTION 'Starting a job lease must advance its fencing token' USING ERRCODE = '23514';
  END IF;
  IF NEW.state = 'RUNNING' AND OLD.state = 'RUNNING'
     AND NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
     AND NEW.lease_token <> OLD.lease_token + 1 THEN
    RAISE EXCEPTION 'Changing a running lease owner must advance its fencing token' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER jobs_update_guard
  BEFORE UPDATE OR DELETE ON tsa.jobs
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_job_update();

CREATE FUNCTION tsa.guard_result_release_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Result release history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.score_run_id IS DISTINCT FROM OLD.score_run_id
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.released_at IS DISTINCT FROM OLD.released_at
     OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'A release may only be revoked once, without changing its identity' USING ERRCODE = '55000';
  END IF;
  IF NEW.reason IS NULL OR btrim(NEW.reason) = '' THEN
    RAISE EXCEPTION 'Revocation requires an audit reason' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER result_releases_update_guard
  BEFORE UPDATE OR DELETE ON tsa.result_releases
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_result_release_update();

CREATE FUNCTION tsa.guard_idempotency_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE attempt_row record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.related_attempt_id IS NOT NULL THEN
      SELECT state, finalized_at INTO attempt_row
        FROM tsa.attempts WHERE id = OLD.related_attempt_id FOR UPDATE;
      IF NOT FOUND OR attempt_row.state IN ('CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED') THEN
        RAISE EXCEPTION 'Idempotency record is pinned while its attempt is unresolved' USING ERRCODE = '55000';
      END IF;
    END IF;
    IF OLD.expires_at IS NULL OR clock_timestamp() < OLD.expires_at THEN
      RAISE EXCEPTION 'Idempotency record retention period has not elapsed' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.id IS DISTINCT FROM OLD.id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
       OR NEW.route_scope IS DISTINCT FROM OLD.route_scope
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
       OR NEW.response_status IS DISTINCT FROM OLD.response_status
       OR NEW.safe_response IS DISTINCT FROM OLD.safe_response
       OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.related_attempt_id IS DISTINCT FROM OLD.related_attempt_id
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
    RAISE EXCEPTION 'Idempotency receipt identity and response are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.related_attempt_id IS NULL THEN
    NEW.expires_at := GREATEST(COALESCE(NEW.expires_at, NEW.completed_at + interval '7 days'),
                               NEW.completed_at + interval '7 days');
  ELSE
    SELECT state, finalized_at INTO attempt_row
      FROM tsa.attempts WHERE id = NEW.related_attempt_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Idempotency receipt references a missing attempt' USING ERRCODE = '23503';
    END IF;
    IF attempt_row.state IN ('CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED') THEN
      NEW.expires_at := NULL;
    ELSE
      NEW.expires_at := GREATEST(COALESCE(NEW.expires_at, attempt_row.finalized_at + interval '7 days'),
                                 attempt_row.finalized_at + interval '7 days');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER idempotency_records_retention_guard
  BEFORE INSERT OR UPDATE OR DELETE ON tsa.idempotency_records
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_idempotency_record();

CREATE FUNCTION tsa.extend_attempt_idempotency_retention() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state IN ('GRADED', 'CANCELLED', 'INVALIDATED') AND NEW.finalized_at IS DISTINCT FROM OLD.finalized_at THEN
    UPDATE tsa.idempotency_records
       SET expires_at = GREATEST(COALESCE(expires_at, NEW.finalized_at + interval '7 days'),
                                 NEW.finalized_at + interval '7 days')
     WHERE related_attempt_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER attempts_idempotency_retention
  AFTER UPDATE ON tsa.attempts
  FOR EACH ROW EXECUTE FUNCTION tsa.extend_attempt_idempotency_retention();

CREATE FUNCTION tsa.guard_audit_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON tsa.audit_events
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_audit_event();

CREATE FUNCTION tsa.guard_history_row() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE question_matches boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Question assignment history is retained' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.question_id IS DISTINCT FROM OLD.question_id
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at THEN
      RAISE EXCEPTION 'Question assignment identity and time are immutable' USING ERRCODE = '55000';
    END IF;
    IF OLD.first_attempt_id IS NOT NULL AND NEW.first_attempt_id IS NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.first_attempt_id IS DISTINCT FROM OLD.first_attempt_id THEN
      RAISE EXCEPTION 'First-attempt history cannot be replaced' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF NEW.first_attempt_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM tsa.attempts a
      JOIN tsa.form_slots s ON s.form_id = a.form_id
      WHERE a.id = NEW.first_attempt_id AND a.user_id = NEW.user_id AND s.question_id = NEW.question_id
    ) INTO question_matches;
    IF NOT question_matches THEN
      RAISE EXCEPTION 'First attempt form does not contain the assigned stable question identity'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER student_question_history_guard
  BEFORE INSERT OR UPDATE OR DELETE ON tsa.student_question_history
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_history_row();

CREATE FUNCTION tsa.guard_allocation_state_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Student allocation revision history cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Allocation identity is immutable and revision must increase by one'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER student_allocation_state_revision_guard
  BEFORE UPDATE OR DELETE ON tsa.student_allocation_state
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_allocation_state_revision();

CREATE FUNCTION tsa.assert_form_integrity(p_form_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  form_row record;
  section_total bigint;
  duration_total bigint;
  declared_total bigint;
  slot_total bigint;
  secret_total bigint;
  bad_section boolean;
  mismatched_question boolean;
  expected_sections jsonb;
  actual_sections jsonb;
BEGIN
  SELECT f.id, f.assembly_run_id, f.blueprint_version_id, f.mode, f.owner_user_id,
         bv.taxonomy_version_id, bv.config,
         ar.blueprint_version_id AS run_blueprint_version_id,
         ar.form_mode AS run_mode, ar.user_id AS run_user_id
    INTO form_row
    FROM tsa.forms f
    JOIN tsa.blueprint_versions bv ON bv.id = f.blueprint_version_id
    JOIN tsa.assembly_runs ar ON ar.id = f.assembly_run_id
   WHERE f.id = p_form_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF form_row.run_blueprint_version_id IS DISTINCT FROM form_row.blueprint_version_id
     OR form_row.run_mode IS DISTINCT FROM form_row.mode
     OR form_row.run_user_id IS DISTINCT FROM form_row.owner_user_id THEN
    RAISE EXCEPTION 'Form % does not match its immutable assembly-run identity', p_form_id
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*), COALESCE(sum(duration_seconds), 0), COALESCE(sum(question_count), 0)
    INTO section_total, duration_total, declared_total
    FROM tsa.form_sections WHERE form_id = p_form_id;
  expected_sections := form_row.config->'sections';
  SELECT jsonb_agg(jsonb_build_object(
           'id', section_id, 'section', section, 'count', question_count,
           'durationSeconds', duration_seconds
         ) ORDER BY ordinal)
    INTO actual_sections FROM tsa.form_sections WHERE form_id = p_form_id;
  SELECT count(*) INTO slot_total FROM tsa.form_slots WHERE form_id = p_form_id;
  SELECT count(*) INTO secret_total FROM tsa_private.form_slot_secrets WHERE form_id = p_form_id;
  SELECT EXISTS (
    SELECT 1 FROM tsa.form_sections s
    LEFT JOIN tsa.form_slots f ON f.form_id = s.form_id AND f.section_id = s.section_id
    WHERE s.form_id = p_form_id
    GROUP BY s.form_id, s.section_id, s.question_count
    HAVING count(f.slot_id) <> s.question_count
  ) INTO bad_section;
  SELECT EXISTS (
    SELECT 1 FROM tsa.form_slots f
    LEFT JOIN tsa.question_versions q ON q.id = f.question_version_id AND q.question_id = f.question_id
    LEFT JOIN tsa.stimulus_versions sv ON sv.id = q.stimulus_version_id
    LEFT JOIN tsa_private.form_slot_secrets fs ON fs.form_id = f.form_id AND fs.slot_id = f.slot_id
    LEFT JOIN tsa_private.question_secrets qs ON qs.question_version_id = q.id
    WHERE f.form_id = p_form_id AND (
      q.id IS NULL
      OR q.taxonomy_version_id <> form_row.taxonomy_version_id
      OR q.section <> (SELECT s.section FROM tsa.form_sections s
                        WHERE s.form_id = f.form_id AND s.section_id = f.section_id)
      OR f.public_snapshot - ARRAY['slotId', 'sectionId', 'ordinal', 'stimulus', 'content', 'interaction']::text[] <> '{}'::jsonb
      OR f.public_snapshot->'slotId' IS DISTINCT FROM to_jsonb(f.slot_id)
      OR f.public_snapshot->'sectionId' IS DISTINCT FROM to_jsonb(f.section_id)
      OR f.public_snapshot->'ordinal' IS DISTINCT FROM to_jsonb(f.ordinal)
      OR f.public_snapshot->'content' IS DISTINCT FROM q.content
      OR f.public_snapshot->'interaction' IS DISTINCT FROM q.interaction
      OR f.public_snapshot->'stimulus' IS DISTINCT FROM CASE
           WHEN q.stimulus_version_id IS NULL THEN 'null'::jsonb
           WHEN sv.id IS NULL THEN NULL
           ELSE jsonb_build_object('id', sv.stimulus_id, 'content', sv.content)
         END
      OR fs.form_id IS NULL
      OR qs.question_version_id IS NULL
      OR fs.key_snapshot IS DISTINCT FROM qs.answer_key
      OR fs.explanation_snapshot IS DISTINCT FROM qs.explanation
      OR fs.policy_version IS DISTINCT FROM qs.scoring_policy_version
    )
  ) INTO mismatched_question;
  IF section_total = 0 OR slot_total = 0 OR slot_total > 200 OR duration_total > 21600
     OR declared_total <> slot_total OR secret_total <> slot_total OR bad_section OR mismatched_question
     OR jsonb_typeof(expected_sections) <> 'array'
     OR actual_sections IS DISTINCT FROM expected_sections THEN
    RAISE EXCEPTION 'Form % failed deferred section, slot, snapshot-version, or private-secret sealing checks', p_form_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION tsa.check_form_integrity_deferred() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tsa.assert_form_integrity(
    COALESCE(to_jsonb(NEW)->>'form_id', to_jsonb(NEW)->>'id')::uuid
  );
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER forms_sealed_integrity
  AFTER INSERT ON tsa.forms DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_form_integrity_deferred();
CREATE CONSTRAINT TRIGGER form_sections_sealed_integrity
  AFTER INSERT ON tsa.form_sections DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_form_integrity_deferred();
CREATE CONSTRAINT TRIGGER form_slots_sealed_integrity
  AFTER INSERT ON tsa.form_slots DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_form_integrity_deferred();
CREATE CONSTRAINT TRIGGER form_secrets_sealed_integrity
  AFTER INSERT ON tsa_private.form_slot_secrets DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_form_integrity_deferred();
CREATE CONSTRAINT TRIGGER form_assets_sealed_integrity
  AFTER INSERT ON tsa.form_assets DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_form_integrity_deferred();

CREATE FUNCTION tsa.assert_score_integrity(p_score_run_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  score_row record;
  slot_total bigint;
  item_total bigint;
  correct_total bigint;
  expected_sections jsonb;
BEGIN
  SELECT * INTO score_row FROM tsa.score_runs WHERE id = p_score_run_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) INTO slot_total FROM tsa.form_slots WHERE form_id = score_row.form_id;
  SELECT count(*), COALESCE(sum(earned), 0) INTO item_total, correct_total
    FROM tsa.score_items WHERE score_run_id = p_score_run_id;
  SELECT jsonb_agg(jsonb_build_object(
           'sectionId', totals.section_id, 'section', totals.section,
           'correctCount', totals.correct_count, 'totalCount', totals.total_count
         ) ORDER BY totals.ordinal)
    INTO expected_sections
    FROM (
      SELECT s.section_id, s.section, s.ordinal,
             COALESCE(sum(i.earned), 0) AS correct_count,
             count(f.slot_id) AS total_count
        FROM tsa.form_sections s
        LEFT JOIN tsa.form_slots f ON f.form_id = s.form_id AND f.section_id = s.section_id
        LEFT JOIN tsa.score_items i ON i.score_run_id = p_score_run_id
          AND i.form_id = f.form_id AND i.slot_id = f.slot_id
       WHERE s.form_id = score_row.form_id
       GROUP BY s.form_id, s.section_id, s.section, s.ordinal
    ) totals;
  IF slot_total = 0 OR item_total <> slot_total OR item_total <> score_row.total_count
     OR correct_total <> score_row.correct_count
     OR score_row.percentage <> round((100::numeric * score_row.correct_count) / score_row.total_count, 2)
     OR score_row.section_totals IS DISTINCT FROM expected_sections THEN
    RAISE EXCEPTION 'Score run % has an incomplete or inconsistent aggregate', p_score_run_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION tsa.check_score_integrity_deferred() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tsa.assert_score_integrity(NEW.id);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER score_runs_aggregate_integrity
  AFTER INSERT ON tsa.score_runs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_score_integrity_deferred();

CREATE FUNCTION tsa.check_score_item_integrity_deferred() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tsa.assert_score_integrity(NEW.score_run_id);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER score_items_aggregate_integrity
  AFTER INSERT ON tsa.score_items DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_score_item_integrity_deferred();

CREATE FUNCTION tsa.assert_attempt_consistency(p_attempt_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  attempt_row record;
BEGIN
  SELECT id, state, grading_status, latest_score_id INTO attempt_row
    FROM tsa.attempts WHERE id = p_attempt_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF attempt_row.state IN ('SUBMITTED', 'EXPIRED') AND attempt_row.grading_status IN
       ('PENDING', 'RUNNING', 'FAILED_RETRYABLE', 'FAILED_FINAL')
     AND NOT EXISTS (
       SELECT 1 FROM tsa.jobs j WHERE j.attempt_id = p_attempt_id
         AND j.kind = 'exam_grade_attempt' AND j.state <> 'CANCELLED'
     ) THEN
    RAISE EXCEPTION 'Closed attempt and grading dispatch must commit together' USING ERRCODE = '23514';
  END IF;
  IF attempt_row.state = 'GRADED' AND (
       attempt_row.latest_score_id IS NULL OR attempt_row.grading_status <> 'SUCCEEDED'
       OR NOT EXISTS (
         SELECT 1 FROM tsa.result_releases r
         WHERE r.attempt_id = p_attempt_id AND r.score_run_id = attempt_row.latest_score_id
           AND r.revoked_at IS NULL
       )) THEN
    RAISE EXCEPTION 'GRADED attempt must reference its current score and active release' USING ERRCODE = '23514';
  END IF;
  IF attempt_row.state <> 'GRADED' AND EXISTS (
       SELECT 1 FROM tsa.result_releases r WHERE r.attempt_id = p_attempt_id AND r.revoked_at IS NULL
     ) THEN
    RAISE EXCEPTION 'Only a GRADED attempt may have an active result release' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION tsa.check_attempt_consistency_deferred() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tsa.assert_attempt_consistency(NEW.id);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER attempts_grading_integrity
  AFTER INSERT OR UPDATE ON tsa.attempts DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_attempt_consistency_deferred();

CREATE FUNCTION tsa.check_attempt_job_consistency_deferred() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.attempt_id IS NOT NULL THEN PERFORM tsa.assert_attempt_consistency(NEW.attempt_id); END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER jobs_grading_integrity
  AFTER INSERT OR UPDATE ON tsa.jobs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_attempt_job_consistency_deferred();

CREATE FUNCTION tsa.check_release_consistency_deferred() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tsa.assert_attempt_consistency(NEW.attempt_id);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER result_releases_grading_integrity
  AFTER INSERT OR UPDATE ON tsa.result_releases DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_release_consistency_deferred();

CREATE FUNCTION tsa.check_attempt_section_integrity_deferred() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tsa.attempts a
    JOIN tsa.form_sections s ON s.form_id = a.form_id AND s.section_id = NEW.section_id
    WHERE a.id = NEW.attempt_id AND a.form_id = NEW.form_id
      AND a.started_at = NEW.starts_at AND a.deadline_at = NEW.ends_at
  ) THEN
    RAISE EXCEPTION 'Attempt section window must match its immutable attempt and form section'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER attempt_sections_window_integrity
  AFTER INSERT ON tsa.attempt_sections DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.check_attempt_section_integrity_deferred();

-- A later trusted worker adapter sets these transaction-local claims. This is
-- lease scoping, not worker authentication; absent or stale claims fail closed.
CREATE FUNCTION tsa.exam_job_context_matches(p_attempt_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tsa AS $$
  SELECT (current_setting('role', true) = 'tsa_exam' OR session_user = 'tsa_exam')
     AND NULLIF(current_setting('tsa.exam_job_id', true), '') IS NOT NULL
     AND NULLIF(current_setting('tsa.executor_id', true), '') IS NOT NULL
     AND NULLIF(current_setting('tsa.lease_token', true), '') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM tsa.jobs j
        WHERE j.id::text = current_setting('tsa.exam_job_id', true)
          AND j.attempt_id = p_attempt_id
          AND j.kind = 'exam_grade_attempt'
          AND j.state = 'RUNNING'
          AND j.lease_owner = current_setting('tsa.executor_id', true)
          AND j.lease_token::text = current_setting('tsa.lease_token', true)
          AND j.lease_until > clock_timestamp()
     )
$$;

CREATE TRIGGER blueprint_versions_immutable
  BEFORE UPDATE OR DELETE ON tsa.blueprint_versions FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER assembly_runs_immutable
  BEFORE UPDATE OR DELETE ON tsa.assembly_runs FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER forms_immutable
  BEFORE UPDATE OR DELETE ON tsa.forms FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER form_sections_immutable
  BEFORE UPDATE OR DELETE ON tsa.form_sections FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER form_slots_immutable
  BEFORE UPDATE OR DELETE ON tsa.form_slots FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER form_slot_secrets_immutable
  BEFORE UPDATE OR DELETE ON tsa_private.form_slot_secrets FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER form_assets_immutable
  BEFORE UPDATE OR DELETE ON tsa.form_assets FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER attempt_sections_immutable
  BEFORE UPDATE OR DELETE ON tsa.attempt_sections FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER score_runs_immutable
  BEFORE UPDATE OR DELETE ON tsa.score_runs FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
CREATE TRIGGER score_items_immutable
  BEFORE UPDATE OR DELETE ON tsa.score_items FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();

ALTER TABLE tsa.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY factory_job_select ON tsa.jobs
  FOR SELECT TO tsa_factory USING (kind = 'factory_produce_unit');
CREATE POLICY factory_job_update ON tsa.jobs
  FOR UPDATE TO tsa_factory USING (kind = 'factory_produce_unit') WITH CHECK (kind = 'factory_produce_unit');
CREATE POLICY exam_job_select ON tsa.jobs
  FOR SELECT TO tsa_exam USING (kind = 'exam_grade_attempt' AND tsa.exam_job_context_matches(attempt_id));
CREATE POLICY exam_job_update ON tsa.jobs
  FOR UPDATE TO tsa_exam USING (kind = 'exam_grade_attempt' AND tsa.exam_job_context_matches(attempt_id))
  WITH CHECK (kind = 'exam_grade_attempt');

ALTER TABLE tsa.attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_attempt_select ON tsa.attempts FOR SELECT TO tsa_exam
  USING (tsa.exam_job_context_matches(attempts.id));
ALTER TABLE tsa.forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_form_select ON tsa.forms FOR SELECT TO tsa_exam
  USING (EXISTS (SELECT 1 FROM tsa.attempts a WHERE a.form_id = forms.id
    AND tsa.exam_job_context_matches(a.id)));
ALTER TABLE tsa.form_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_form_sections_select ON tsa.form_sections FOR SELECT TO tsa_exam
  USING (EXISTS (SELECT 1 FROM tsa.attempts a WHERE a.form_id = form_sections.form_id
    AND tsa.exam_job_context_matches(a.id)));
ALTER TABLE tsa.form_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_form_slots_select ON tsa.form_slots FOR SELECT TO tsa_exam
  USING (EXISTS (SELECT 1 FROM tsa.attempts a WHERE a.form_id = form_slots.form_id
    AND tsa.exam_job_context_matches(a.id)));
ALTER TABLE tsa.form_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_form_assets_select ON tsa.form_assets FOR SELECT TO tsa_exam
  USING (EXISTS (SELECT 1 FROM tsa.attempts a WHERE a.form_id = form_assets.form_id
    AND tsa.exam_job_context_matches(a.id)));
ALTER TABLE tsa.attempt_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_attempt_sections_select ON tsa.attempt_sections FOR SELECT TO tsa_exam
  USING (tsa.exam_job_context_matches(attempt_sections.attempt_id));
ALTER TABLE tsa.answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_answers_select ON tsa.answers FOR SELECT TO tsa_exam
  USING (tsa.exam_job_context_matches(answers.attempt_id));
ALTER TABLE tsa_private.form_slot_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_form_secrets_select ON tsa_private.form_slot_secrets FOR SELECT TO tsa_exam
  USING (EXISTS (SELECT 1 FROM tsa.attempts a WHERE a.form_id = form_slot_secrets.form_id
    AND tsa.exam_job_context_matches(a.id))
    AND EXISTS (SELECT 1 FROM tsa.form_slots s WHERE s.form_id = form_slot_secrets.form_id
      AND s.slot_id = form_slot_secrets.slot_id));

REVOKE ALL ON TABLE tsa.blueprints, tsa.blueprint_versions, tsa.blueprint_offerings,
  tsa.assembly_runs, tsa.forms, tsa.form_availability, tsa.form_sections, tsa.form_slots,
  tsa.form_assets, tsa.attempts, tsa.attempt_sections, tsa.answers, tsa.score_runs,
  tsa.score_items, tsa.result_releases, tsa.jobs, tsa.idempotency_records, tsa.audit_events,
  tsa.rate_limit_buckets, tsa.student_allocation_state, tsa.student_question_history
  FROM PUBLIC, tsa_web, tsa_factory, tsa_exam, tsa_bank;
REVOKE ALL ON TABLE tsa_private.form_slot_secrets FROM PUBLIC, tsa_web, tsa_factory, tsa_exam, tsa_bank;

GRANT SELECT, INSERT, UPDATE ON tsa.blueprints, tsa.blueprint_versions, tsa.blueprint_offerings TO tsa_bank;
GRANT INSERT ON tsa.audit_events TO tsa_bank;

GRANT SELECT ON tsa.jobs TO tsa_factory, tsa_exam;
GRANT UPDATE (state, available_at, attempts, max_attempts, lease_owner, lease_token, lease_until, last_error_code)
  ON tsa.jobs TO tsa_factory, tsa_exam;
GRANT SELECT ON tsa.attempts, tsa.forms, tsa.form_sections, tsa.form_slots, tsa.form_assets,
  tsa.attempt_sections, tsa.answers TO tsa_exam;
GRANT SELECT ON tsa_private.form_slot_secrets TO tsa_exam;

REVOKE ALL ON FUNCTION tsa.reject_immutable_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_authored_created_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.start_deadline_is_open(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_offering_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_form_availability_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.prepare_attempt_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_attempt_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.record_attempt_section_start() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_answer_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_job_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_result_release_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_idempotency_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.extend_attempt_idempotency_retention() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_history_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.guard_allocation_state_revision() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.assert_form_integrity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.check_form_integrity_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.assert_score_integrity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.check_score_integrity_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.check_score_item_integrity_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.assert_attempt_consistency(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.check_attempt_consistency_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.check_attempt_job_consistency_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.check_release_consistency_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.check_attempt_section_integrity_deferred() FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.exam_job_context_matches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_job_context_matches(uuid) TO tsa_exam;
