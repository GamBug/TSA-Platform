-- Canonical factory-package/2 persistence. This is a private DRAFT-only bridge.

ALTER TABLE tsa_private.reference_nodes
  DROP CONSTRAINT reference_nodes_payload_check;
ALTER TABLE tsa_private.reference_nodes
  ADD CONSTRAINT reference_nodes_payload_check
  CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 8_388_608);

-- Package assertions are immutable private claims, not a human current-rights decision.
ALTER TABLE tsa.question_provenance
  ALTER COLUMN rights_decision_at_authoring DROP NOT NULL;

CREATE TABLE tsa_private.factory_import_manifests (
  producer_namespace text NOT NULL CHECK (btrim(producer_namespace) <> ''),
  batch_key text NOT NULL CHECK (btrim(batch_key) <> ''),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object' AND pg_column_size(manifest) <= 16_777_216),
  received_by uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (producer_namespace, batch_key)
);

CREATE TABLE tsa_private.factory_import_receipts (
  producer_namespace text NOT NULL,
  batch_key text NOT NULL,
  item_key text NOT NULL,
  candidate_ordinal integer NOT NULL CHECK (candidate_ordinal >= 0),
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  question_id uuid NOT NULL REFERENCES tsa.questions(id) ON DELETE RESTRICT,
  question_version_id uuid NOT NULL REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  external_generation_run_id uuid,
  PRIMARY KEY (producer_namespace, batch_key, item_key, candidate_ordinal),
  UNIQUE (question_version_id),
  FOREIGN KEY (question_id, question_version_id)
    REFERENCES tsa.question_versions(question_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (question_version_id, input_hash)
    REFERENCES tsa.question_versions(id, content_hash) ON DELETE RESTRICT,
  FOREIGN KEY (producer_namespace, batch_key)
    REFERENCES tsa_private.factory_import_manifests(producer_namespace, batch_key) ON DELETE RESTRICT
);

CREATE TABLE tsa_private.factory_external_mappings (
  producer_namespace text NOT NULL,
  external_kind text NOT NULL CHECK (external_kind IN ('source', 'asset', 'stimulus')),
  external_id text NOT NULL CHECK (btrim(external_id) <> ''),
  local_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  PRIMARY KEY (producer_namespace, external_kind, external_id),
  UNIQUE (producer_namespace, external_kind, local_id)
);

CREATE TABLE tsa_private.factory_import_runs (
  question_version_id uuid PRIMARY KEY REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  external_generation_run_id uuid,
  run_metadata jsonb NOT NULL CHECK (jsonb_typeof(run_metadata) = 'object' AND pg_column_size(run_metadata) <= 262144),
  UNIQUE (external_generation_run_id, question_version_id)
);

CREATE TABLE tsa_private.factory_asset_bytes (
  asset_version_id uuid PRIMARY KEY REFERENCES tsa.asset_versions(id) ON DELETE RESTRICT,
  bytes bytea NOT NULL,
  CHECK (octet_length(bytes) > 0 AND octet_length(bytes) <= 2097152)
);

CREATE TRIGGER factory_import_manifests_immutable BEFORE UPDATE OR DELETE ON tsa_private.factory_import_manifests
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
CREATE TRIGGER factory_import_receipts_immutable BEFORE UPDATE OR DELETE ON tsa_private.factory_import_receipts
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
CREATE TRIGGER factory_external_mappings_immutable BEFORE UPDATE OR DELETE ON tsa_private.factory_external_mappings
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
CREATE TRIGGER factory_import_runs_immutable BEFORE UPDATE OR DELETE ON tsa_private.factory_import_runs
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
CREATE TRIGGER factory_asset_bytes_immutable BEFORE UPDATE OR DELETE ON tsa_private.factory_asset_bytes
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();

REVOKE ALL ON tsa_private.factory_import_manifests, tsa_private.factory_import_receipts,
  tsa_private.factory_external_mappings, tsa_private.factory_import_runs,
  tsa_private.factory_asset_bytes FROM PUBLIC, tsa_web, tsa_factory, tsa_exam, tsa_identity, tsa_bank;
GRANT SELECT, INSERT ON tsa_private.factory_import_manifests, tsa_private.factory_import_receipts,
  tsa_private.factory_external_mappings, tsa_private.factory_import_runs,
  tsa_private.factory_asset_bytes TO tsa_bank;
