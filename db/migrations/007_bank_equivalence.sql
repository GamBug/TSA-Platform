-- BANK-002: existing canonical groups become monotonic. No historical form,
-- assignment, question version or approval is rewritten by this migration.
CREATE FUNCTION tsa.guard_equivalence_group() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Equivalence groups and aliases cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.merged_into_id IS NOT NULL THEN
      RAISE EXCEPTION 'New groups must begin canonical' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.merged_into_id IS NOT NULL OR NEW.merged_into_id IS NULL OR NEW.merged_into_id=OLD.id THEN
    RAISE EXCEPTION 'Equivalence merges are one-way and append-only' USING ERRCODE='23514';
  END IF;
  -- Two active roots cannot form a cycle. Serializing on the Bank row is shared
  -- with publication/rights/import commands; direct Bank SQL takes it too.
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR UPDATE;
  PERFORM id FROM tsa.duplicate_groups WHERE id=NEW.merged_into_id AND merged_into_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merge target must be an active canonical group' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER equivalence_groups_monotonic BEFORE INSERT OR UPDATE OR DELETE ON tsa.duplicate_groups
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_equivalence_group();

CREATE FUNCTION tsa.guard_equivalence_member() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
DECLARE
  next_group uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Equivalence membership cannot be deleted' USING ERRCODE='23514';
  END IF;
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR UPDATE;
  PERFORM id FROM tsa.duplicate_groups WHERE id=NEW.group_id AND merged_into_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membership must reference a canonical group' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.question_id IS DISTINCT FROM OLD.question_id THEN
      RAISE EXCEPTION 'Stable membership identity cannot be changed' USING ERRCODE='23514';
    END IF;
    IF NEW.group_id=OLD.group_id THEN RETURN NEW; END IF;
    SELECT merged_into_id INTO next_group FROM tsa.duplicate_groups WHERE id=OLD.group_id;
    IF next_group IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'Membership may move only through its committed merge alias' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER equivalence_members_monotonic BEFORE INSERT OR UPDATE OR DELETE ON tsa.duplicate_group_members
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_equivalence_member();

-- The source alias is written before members move; enforce full movement at
-- transaction end, not halfway through an otherwise atomic merge.
CREATE FUNCTION tsa.check_equivalence_merge_complete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tsa.duplicate_group_members m JOIN tsa.duplicate_groups g ON g.id=m.group_id
    WHERE g.id=NEW.id AND g.merged_into_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A retired group cannot retain current memberships' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER equivalence_merge_complete AFTER UPDATE ON tsa.duplicate_groups
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tsa.check_equivalence_merge_complete();

CREATE FUNCTION tsa.guard_equivalence_resolution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Duplicate evidence is retained' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.resolution<>'OPEN' OR NEW.resolved_by IS NOT NULL OR NEW.resolution_evidence IS NOT NULL THEN
      RAISE EXCEPTION 'Duplicate findings must begin OPEN before independent adjudication' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.resolution<>'OPEN' OR NEW.resolution NOT IN ('CONFIRMED','DISMISSED')
    OR NEW.id IS DISTINCT FROM OLD.id OR NEW.left_version_id IS DISTINCT FROM OLD.left_version_id
    OR NEW.right_version_id IS DISTINCT FROM OLD.right_version_id OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.detector_version IS DISTINCT FROM OLD.detector_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.resolved_by IS NULL
    OR NEW.resolution_evidence IS NULL OR jsonb_typeof(NEW.resolution_evidence)<>'object' THEN
    RAISE EXCEPTION 'Resolution must append a final decision without changing detector evidence' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER equivalence_resolution_final BEFORE INSERT OR UPDATE OR DELETE ON tsa.duplicate_relations
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_equivalence_resolution();

REVOKE UPDATE, DELETE ON tsa.duplicate_groups, tsa.duplicate_group_members, tsa.duplicate_relations FROM tsa_bank;
GRANT UPDATE(merged_into_id) ON tsa.duplicate_groups TO tsa_bank;
GRANT UPDATE(group_id) ON tsa.duplicate_group_members TO tsa_bank;
GRANT UPDATE(resolution,resolved_by,resolution_evidence) ON tsa.duplicate_relations TO tsa_bank;
REVOKE ALL ON FUNCTION tsa.guard_equivalence_group(),tsa.guard_equivalence_member(),
  tsa.check_equivalence_merge_complete(),tsa.guard_equivalence_resolution() FROM PUBLIC;

CREATE POLICY bank_equivalence_receipt_scope ON tsa.idempotency_records FOR ALL TO tsa_bank
  USING (actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid
    AND related_attempt_id IS NULL AND route_scope='POST /internal/bank/equivalence')
  WITH CHECK (actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid
    AND related_attempt_id IS NULL AND route_scope='POST /internal/bank/equivalence');

CREATE TABLE tsa_private.equivalence_merge_incidents (
  id uuid PRIMARY KEY,
  canonical_group_id uuid NOT NULL REFERENCES tsa.duplicate_groups(id) ON DELETE RESTRICT,
  retired_group_id uuid NOT NULL UNIQUE REFERENCES tsa.duplicate_groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  affected_form_count bigint NOT NULL CHECK(affected_form_count>=0),
  within_form_collision_count bigint NOT NULL CHECK(within_form_collision_count>=0 AND within_form_collision_count<=affected_form_count),
  cross_group_student_count bigint NOT NULL CHECK(cross_group_student_count>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(canonical_group_id<>retired_group_id),
  CHECK(affected_form_count>0 OR cross_group_student_count>0)
);
CREATE TRIGGER equivalence_incidents_immutable BEFORE UPDATE OR DELETE ON tsa_private.equivalence_merge_incidents
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
REVOKE ALL ON tsa_private.equivalence_merge_incidents FROM PUBLIC,tsa_web,tsa_factory,tsa_exam,tsa_identity,tsa_bank;
GRANT SELECT,INSERT ON tsa_private.equivalence_merge_incidents TO tsa_bank;

CREATE FUNCTION tsa.bank_equivalence_impact(first_group uuid,second_group uuid)
RETURNS TABLE(affected_form_count bigint,within_form_collision_count bigint,cross_group_student_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  WITH forms AS (
    SELECT fs.form_id,bool_or(m.group_id=first_group) AS first_seen,bool_or(m.group_id=second_group) AS second_seen
      FROM tsa.form_slots fs JOIN tsa.duplicate_group_members m ON m.question_id=fs.question_id
      WHERE m.group_id IN (first_group,second_group) GROUP BY fs.form_id
  ), students AS (
    SELECT h.user_id FROM tsa.student_question_history h JOIN tsa.duplicate_group_members m ON m.question_id=h.question_id
      WHERE m.group_id IN(first_group,second_group) GROUP BY h.user_id
      HAVING bool_or(m.group_id=first_group) AND bool_or(m.group_id=second_group)
  ) SELECT (SELECT count(*) FROM forms),(SELECT count(*) FROM forms WHERE first_seen AND second_seen),(SELECT count(*) FROM students)
$$;
REVOKE ALL ON FUNCTION tsa.bank_equivalence_impact(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_equivalence_impact(uuid,uuid) TO tsa_bank;

CREATE FUNCTION tsa.check_equivalence_incident_merge() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM tsa.duplicate_groups WHERE id=NEW.retired_group_id AND merged_into_id=NEW.canonical_group_id) THEN
    RAISE EXCEPTION 'An incident must accompany its exact atomic merge' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER equivalence_incident_bound AFTER INSERT ON tsa_private.equivalence_merge_incidents
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tsa.check_equivalence_incident_merge();
REVOKE ALL ON FUNCTION tsa.check_equivalence_incident_merge() FROM PUBLIC;

CREATE OR REPLACE FUNCTION tsa.bank_equivalence_reviewed(version_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  SELECT EXISTS(SELECT 1 FROM tsa.audit_events a WHERE a.entity_type='question_version'
    AND a.entity_id=version_id::text AND a.action IN('BANK_CONFIRM_SINGLETON','BANK_EQUIVALENCE_CONFIRMED')
    AND a.actor_id IS NOT NULL
    AND a.created_at>COALESCE(tsa.bank_latest_quarantine_at(version_id),'-infinity'::timestamptz))
$$;
