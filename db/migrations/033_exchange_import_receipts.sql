-- Receipts for questions imported from the portable exchange format. They make imports idempotent and let a higher
-- content_version of the same exchange question_id become the next version of the same Bank question. Additive; the
-- question, version and workflow tables are unchanged.
CREATE TABLE tsa_private.exchange_import_receipts (
  exchange_question_id text NOT NULL CHECK (exchange_question_id ~ '^[A-Z][A-Z0-9]{1,11}(-[A-Z0-9]{2,12}){1,4}-[0-9]{3,8}$'),
  content_version integer NOT NULL CHECK (content_version >= 1),
  batch_id text NOT NULL CHECK (btrim(batch_id) <> ''),
  question_id uuid NOT NULL REFERENCES tsa.questions(id) ON DELETE RESTRICT,
  question_version_id uuid NOT NULL UNIQUE REFERENCES tsa.question_versions(id) ON DELETE RESTRICT,
  document_hash text NOT NULL CHECK (document_hash ~ '^sha256:[0-9a-f]{64}$'),
  imported_by uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (exchange_question_id, content_version)
);
CREATE INDEX exchange_import_receipts_question_idx ON tsa_private.exchange_import_receipts (question_id);

-- One exchange id always names one Bank question.
CREATE FUNCTION tsa_private.check_exchange_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, tsa_private AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tsa_private.exchange_import_receipts r
              WHERE r.exchange_question_id = NEW.exchange_question_id AND r.question_id <> NEW.question_id) THEN
    RAISE EXCEPTION 'Exchange question % already names a different Bank question', NEW.exchange_question_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER exchange_receipt_identity BEFORE INSERT ON tsa_private.exchange_import_receipts
  FOR EACH ROW EXECUTE FUNCTION tsa_private.check_exchange_receipt();
CREATE TRIGGER exchange_receipt_immutable BEFORE UPDATE OR DELETE ON tsa_private.exchange_import_receipts
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();

REVOKE ALL ON tsa_private.exchange_import_receipts FROM PUBLIC, tsa_web, tsa_bank, tsa_factory, tsa_exam, tsa_identity, tsa_exam_worker;
GRANT SELECT, INSERT ON tsa_private.exchange_import_receipts TO tsa_bank;
REVOKE ALL ON FUNCTION tsa_private.check_exchange_receipt() FROM PUBLIC;
