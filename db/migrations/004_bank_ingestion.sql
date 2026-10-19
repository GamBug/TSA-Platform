-- BANK-001 bounded manual source and immutable draft ingestion foundation.
-- This migration adds no review or publication command.

ALTER TABLE tsa.sources
  ADD COLUMN origin text
    CHECK (origin IS NULL OR origin IN ('OWNED', 'EXTERNAL'));
ALTER TABLE tsa.sources
  ADD COLUMN created_by uuid REFERENCES tsa.users(id) ON DELETE RESTRICT;

CREATE TABLE tsa_private.reference_nodes (
  reference_namespace text NOT NULL CHECK (btrim(reference_namespace) <> ''),
  kind text NOT NULL CHECK (kind IN ('taxonomy', 'question', 'stimulus', 'asset', 'provenance', 'evidence', 'source')),
  id text NOT NULL CHECK (btrim(id) <> ''),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 1_048_576),
  dependency_refs jsonb NOT NULL CHECK (jsonb_typeof(dependency_refs) = 'array' AND pg_column_size(dependency_refs) <= 262_144),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (reference_namespace, kind, id)
);

CREATE TRIGGER sources_immutable
  BEFORE UPDATE OR DELETE ON tsa.sources
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();

CREATE TRIGGER reference_nodes_immutable
  BEFORE UPDATE OR DELETE ON tsa_private.reference_nodes
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();

ALTER TABLE tsa.question_versions
  ADD COLUMN reference_namespace text;
ALTER TABLE tsa.question_versions
  ADD CONSTRAINT question_versions_reference_namespace_nonempty
  CHECK (reference_namespace IS NULL OR btrim(reference_namespace) <> '');
CREATE FUNCTION tsa.source_has_delivery_dependencies(target_source_version uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tsa AS $$
  SELECT EXISTS (
           SELECT 1 FROM tsa.question_provenance qp
           JOIN tsa.question_versions qv ON qv.id = qp.question_version_id
           JOIN tsa.questions q ON q.id = qv.question_id AND q.eligible_version_id = qv.id
           WHERE qp.source_version_id = target_source_version
         ) OR EXISTS (
           SELECT 1 FROM tsa.form_slots fs
           JOIN tsa.question_versions qv ON qv.id = fs.question_version_id
           JOIN tsa.question_provenance qp ON qp.question_version_id = qv.id
           WHERE qp.source_version_id = target_source_version
         ) OR EXISTS (
           SELECT 1 FROM tsa.form_slots fs
           JOIN tsa.question_versions qv ON qv.id = fs.question_version_id
           JOIN tsa.stimulus_sources ss ON ss.stimulus_version_id = qv.stimulus_version_id
           WHERE ss.source_version_id = target_source_version
         ) OR EXISTS (
           SELECT 1 FROM tsa.asset_versions av
           JOIN tsa.form_assets fa ON fa.asset_version_id = av.id
           WHERE av.source_version_id = target_source_version
         ) OR EXISTS (
           SELECT 1 FROM tsa.question_versions qv
           JOIN tsa.questions q ON q.id = qv.question_id AND q.eligible_version_id = qv.id
           JOIN tsa.stimulus_sources ss ON ss.stimulus_version_id = qv.stimulus_version_id
           WHERE ss.source_version_id = target_source_version
         ) OR EXISTS (
           SELECT 1 FROM tsa.question_versions qv
           JOIN tsa.questions q ON q.id = qv.question_id AND q.eligible_version_id = qv.id
           JOIN tsa.stimulus_assets sa ON sa.stimulus_version_id = qv.stimulus_version_id
           JOIN tsa.asset_versions av ON av.id = sa.asset_version_id
           WHERE av.source_version_id = target_source_version
         ) OR EXISTS (
           SELECT 1 FROM tsa.question_versions qv
           JOIN tsa.questions q ON q.id = qv.question_id AND q.eligible_version_id = qv.id
           JOIN tsa.question_assets qa ON qa.question_version_id = qv.id
           JOIN tsa.asset_versions av ON av.id = qa.asset_version_id
           WHERE av.source_version_id = target_source_version
         ) OR EXISTS (
           SELECT 1 FROM tsa.form_slots fs
           JOIN tsa.question_assets qa ON qa.question_version_id = fs.question_version_id
           JOIN tsa.asset_versions av ON av.id = qa.asset_version_id
           WHERE av.source_version_id = target_source_version
         )
$$;
REVOKE ALL ON FUNCTION tsa.source_has_delivery_dependencies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.source_has_delivery_dependencies(uuid) TO tsa_bank;

-- Bank idempotency reads are restricted to the verified actor and these
-- normalized staff routes. Student attempt receipts are never visible here.
ALTER TABLE tsa.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tsa.idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_idempotency_actor_scope ON tsa.idempotency_records
  FOR ALL TO tsa_bank
  USING (
    actor_id = nullif(current_setting('tsa.bank_actor_id', true), '')::uuid
    AND (
      route_scope IN ('POST /api/v1/sources', 'POST /api/v1/questions')
      OR route_scope ~ '^POST /api/v1/sources/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
      OR route_scope ~ '^POST /api/v1/source-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/rights$'
      OR route_scope ~ '^POST /api/v1/questions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
    )
    AND related_attempt_id IS NULL
  )
  WITH CHECK (
    actor_id = nullif(current_setting('tsa.bank_actor_id', true), '')::uuid
    AND (
      route_scope IN ('POST /api/v1/sources', 'POST /api/v1/questions')
      OR route_scope ~ '^POST /api/v1/sources/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
      OR route_scope ~ '^POST /api/v1/source-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/rights$'
      OR route_scope ~ '^POST /api/v1/questions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
    )
    AND related_attempt_id IS NULL
  );
GRANT SELECT, INSERT ON tsa.idempotency_records TO tsa_bank;

-- Reference payloads may contain private question data. Only Bank may resolve
-- this graph; it is never exposed to website, Factory, Exam, or Identity roles.
REVOKE ALL ON tsa_private.reference_nodes FROM PUBLIC, tsa_web, tsa_factory, tsa_exam, tsa_identity, tsa_bank;
GRANT SELECT, INSERT ON tsa_private.reference_nodes TO tsa_bank;

