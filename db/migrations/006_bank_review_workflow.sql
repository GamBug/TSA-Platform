-- BANK-002 engineering: reuse existing review/workflow/audit tables. Empty by
-- default; only the migration owner can attest a disposable fixture lifecycle.
CREATE TABLE tsa_private.bank_workflow_fixture_scope (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  scope_id uuid NOT NULL UNIQUE,
  database_oid oid NOT NULL,
  postmaster_started_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER bank_workflow_fixture_scope_immutable
  BEFORE UPDATE OR DELETE ON tsa_private.bank_workflow_fixture_scope
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
REVOKE ALL ON tsa_private.bank_workflow_fixture_scope
  FROM PUBLIC, tsa_bank, tsa_web, tsa_factory, tsa_exam, tsa_identity;
GRANT SELECT ON tsa_private.bank_workflow_fixture_scope TO tsa_bank;

CREATE FUNCTION tsa.bank_fixture_scope_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, tsa_private AS $$
  SELECT EXISTS (
    SELECT 1 FROM tsa_private.bank_workflow_fixture_scope scope
    WHERE scope.scope_id::text = current_setting('tsa.bank_fixture_scope', true)
      AND scope.database_oid = (SELECT oid FROM pg_database WHERE datname=current_database())
      AND scope.postmaster_started_at = pg_postmaster_start_time()
  )
$$;
REVOKE ALL ON FUNCTION tsa.bank_fixture_scope_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_fixture_scope_active() TO tsa_bank;

-- Owner maintenance is separate from application credentials. Runtime approval
-- remains unavailable unless an explicitly initialized fixture scope is active.
CREATE FUNCTION tsa.guard_bank_runtime_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, tsa, tsa_private AS $$
DECLARE
  privileged_owner boolean;
  version_id uuid;
  independent_review boolean;
BEGIN
  SELECT role_row.rolsuper OR db.datdba=role_row.oid INTO privileged_owner
    FROM pg_roles role_row JOIN pg_database db ON db.datname=current_database()
    WHERE role_row.rolname=current_user;
  IF privileged_owner THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='questions' THEN
    IF NEW.eligible_version_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND NEW.eligible_version_id IS NOT DISTINCT FROM OLD.eligible_version_id THEN RETURN NEW; END IF;
    version_id := NEW.eligible_version_id;
  ELSE
    IF NEW.state <> 'APPROVED' THEN RETURN NEW; END IF;
    version_id := NEW.question_version_id;
  END IF;
  IF NOT tsa.bank_fixture_scope_active() THEN
    RAISE EXCEPTION 'Runtime publication is disabled outside a disposable fixture scope' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM tsa.question_versions qv
    JOIN tsa.question_workflow w ON w.question_version_id=qv.id
    JOIN tsa.reviews r ON r.id=CASE WHEN TG_TABLE_NAME='question_workflow'
      THEN (to_jsonb(NEW)->>'approved_review_id')::uuid ELSE w.approved_review_id END
      AND r.question_version_id=qv.id AND r.content_hash=qv.content_hash
    LEFT JOIN tsa_private.factory_import_receipts receipt ON receipt.question_version_id=qv.id
    LEFT JOIN tsa_private.factory_import_manifests manifest
      ON manifest.producer_namespace=receipt.producer_namespace AND manifest.batch_key=receipt.batch_key
    WHERE qv.id=version_id AND r.decision='APPROVE'
      AND r.reviewer_id::text<>qv.created_by
      AND (manifest.received_by IS NULL OR r.reviewer_id<>manifest.received_by)
      AND (TG_TABLE_NAME='question_workflow' OR w.state='APPROVED')
  ) INTO independent_review;
  IF NOT independent_review THEN
    RAISE EXCEPTION 'An exact independent approval is required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tsa.guard_bank_runtime_approval() FROM PUBLIC;
CREATE TRIGGER questions_runtime_publication_guard
  BEFORE INSERT OR UPDATE OF eligible_version_id ON tsa.questions
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_bank_runtime_approval();
CREATE TRIGGER workflow_runtime_publication_guard
  BEFORE INSERT OR UPDATE OF state, approved_review_id ON tsa.question_workflow
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_bank_runtime_approval();

-- Add only documented review routes and the private singleton adjudication
-- command to the existing actor-bound receipt policy. Existing policy stays intact.
CREATE POLICY bank_review_idempotency_actor_scope ON tsa.idempotency_records
  FOR ALL TO tsa_bank
  USING (
    actor_id = nullif(current_setting('tsa.bank_actor_id', true), '')::uuid
    AND related_attempt_id IS NULL
    AND route_scope ~ '^POST /api/v1/question-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(submit-review|reviews|quarantine|confirm-singleton)$'
  )
  WITH CHECK (
    actor_id = nullif(current_setting('tsa.bank_actor_id', true), '')::uuid
    AND related_attempt_id IS NULL
    AND route_scope ~ '^POST /api/v1/question-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(submit-review|reviews|quarantine|confirm-singleton)$'
  );

-- Narrow metadata probes avoid granting Bank access to student forms/history or
-- unrelated audit records. Existing sealed-form hold/fan-out is still separate.
CREATE FUNCTION tsa.bank_latest_quarantine_at(version_id uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tsa AS $$
  SELECT max(created_at) FROM tsa.audit_events
    WHERE entity_type='question_version' AND entity_id=version_id::text AND action='BANK_QUARANTINE'
$$;
CREATE FUNCTION tsa.bank_version_has_sealed_forms(version_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tsa AS $$
  SELECT EXISTS (SELECT 1 FROM tsa.form_slots WHERE question_version_id=version_id)
$$;
REVOKE ALL ON FUNCTION tsa.bank_latest_quarantine_at(uuid), tsa.bank_version_has_sealed_forms(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_latest_quarantine_at(uuid), tsa.bank_version_has_sealed_forms(uuid) TO tsa_bank;

CREATE FUNCTION tsa.bank_equivalence_reviewed(version_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tsa AS $$
  SELECT EXISTS (SELECT 1 FROM tsa.audit_events a
    WHERE a.entity_type='question_version' AND a.entity_id=version_id::text
      AND a.action='BANK_CONFIRM_SINGLETON' AND a.actor_id IS NOT NULL
      AND a.created_at>COALESCE(tsa.bank_latest_quarantine_at(version_id), '-infinity'::timestamptz))
$$;
REVOKE ALL ON FUNCTION tsa.bank_equivalence_reviewed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_equivalence_reviewed(uuid) TO tsa_bank;
