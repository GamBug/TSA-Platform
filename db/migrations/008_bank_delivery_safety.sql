-- Exact-hash checked content/dependencies; never inferred for legacy snapshots.
CREATE TABLE tsa_private.question_delivery_checks (
  question_version_id uuid PRIMARY KEY,
  input_hash text NOT NULL,
  profile text NOT NULL CHECK(profile='text-math-table/1'),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(question_version_id,input_hash) REFERENCES tsa.question_versions(id,content_hash) ON DELETE RESTRICT
);
CREATE TABLE tsa_private.question_source_dependencies (
  question_version_id uuid NOT NULL REFERENCES tsa_private.question_delivery_checks(question_version_id) ON DELETE RESTRICT,
  source_version_id uuid NOT NULL REFERENCES tsa.source_versions(id) ON DELETE RESTRICT,
  PRIMARY KEY(question_version_id,source_version_id)
);
CREATE TABLE tsa_private.form_delivery_holds (
  id uuid PRIMARY KEY,
  form_id uuid NOT NULL REFERENCES tsa.forms(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK(kind IN('RIGHTS','QUARANTINE')),
  target_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(btrim(reason)<>''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(form_id,kind,target_id)
);
CREATE TRIGGER delivery_checks_immutable BEFORE UPDATE OR DELETE ON tsa_private.question_delivery_checks FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
CREATE TRIGGER source_dependencies_immutable BEFORE UPDATE OR DELETE ON tsa_private.question_source_dependencies FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
CREATE TRIGGER form_holds_immutable BEFORE UPDATE OR DELETE ON tsa_private.form_delivery_holds FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
REVOKE ALL ON tsa_private.question_delivery_checks,tsa_private.question_source_dependencies,tsa_private.form_delivery_holds
  FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_identity;
GRANT SELECT,INSERT ON tsa_private.question_delivery_checks,tsa_private.question_source_dependencies TO tsa_bank;

CREATE FUNCTION tsa.bank_question_ancestors(version_id uuid) RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  WITH RECURSIVE ancestors(id,parent_id) AS (
    SELECT q.id,q.parent_version_id FROM tsa.question_versions q WHERE q.id=version_id
    UNION SELECT q.id,q.parent_version_id FROM tsa.question_versions q JOIN ancestors a ON q.id=a.parent_id
  ) SELECT id FROM ancestors
$$;
CREATE FUNCTION tsa.bank_question_sources(version_id uuid) RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
  SELECT source_version_id FROM tsa_private.question_source_dependencies WHERE question_version_id=version_id
  UNION SELECT qp.source_version_id FROM tsa.question_provenance qp JOIN tsa.bank_question_ancestors(version_id) a ON a.id=qp.question_version_id
  UNION SELECT ss.source_version_id FROM tsa.stimulus_sources ss JOIN tsa.question_versions q ON q.stimulus_version_id=ss.stimulus_version_id JOIN tsa.bank_question_ancestors(version_id) a ON a.id=q.id
  UNION SELECT av.source_version_id FROM tsa.asset_versions av JOIN tsa.question_assets qa ON qa.asset_version_id=av.id JOIN tsa.bank_question_ancestors(version_id) a ON a.id=qa.question_version_id
  UNION SELECT av.source_version_id FROM tsa.asset_versions av JOIN tsa.stimulus_assets sa ON sa.asset_version_id=av.id JOIN tsa.question_versions q ON q.stimulus_version_id=sa.stimulus_version_id JOIN tsa.bank_question_ancestors(version_id) a ON a.id=q.id
$$;
CREATE FUNCTION tsa.bank_source_display_allowed(source_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  SELECT EXISTS(SELECT 1 FROM tsa.source_rights sr JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id AND rd.source_version_id=sr.source_version_id
    JOIN tsa.users u ON u.id=rd.decided_by
    WHERE sr.source_version_id=source_id AND rd.status IN('OWNED','LICENSED','OPEN_LICENSE','PUBLIC_DOMAIN')
      AND 'DISPLAY'=ANY(rd.allowed_uses) AND ('VN'=ANY(rd.territory) OR 'WORLDWIDE'=ANY(rd.territory))
      AND rd.valid_from<=clock_timestamp() AND (rd.valid_to IS NULL OR clock_timestamp()<rd.valid_to)
      AND jsonb_typeof(rd.evidence->'text')='string' AND btrim(rd.evidence->>'text')<>'' AND u.disabled_at IS NULL)
$$;
CREATE FUNCTION tsa.bank_question_delivery_allowed(version_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
  SELECT EXISTS(SELECT 1 FROM tsa_private.question_delivery_checks c JOIN tsa.question_versions q
    ON q.id=c.question_version_id AND q.content_hash=c.input_hash WHERE q.id=version_id AND c.profile='text-math-table/1')
    AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_ancestors(version_id) a JOIN tsa.question_workflow w ON w.question_version_id=a.id WHERE w.state='QUARANTINED')
    AND EXISTS(SELECT 1 FROM tsa.bank_question_sources(version_id))
    AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(version_id) s WHERE NOT tsa.bank_source_display_allowed(s.id))
$$;
CREATE FUNCTION tsa.bank_form_delivery_allowed(target_form uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
  SELECT EXISTS(SELECT 1 FROM tsa.forms WHERE id=target_form)
    AND NOT EXISTS(SELECT 1 FROM tsa_private.form_delivery_holds WHERE form_id=target_form)
    AND EXISTS(SELECT 1 FROM tsa.form_availability WHERE form_id=target_form AND withdrawn_at IS NULL)
    AND EXISTS(SELECT 1 FROM tsa.form_slots WHERE form_id=target_form)
    AND NOT EXISTS(SELECT 1 FROM tsa.form_slots WHERE form_id=target_form AND NOT tsa.bank_question_delivery_allowed(question_version_id))
    AND NOT EXISTS(SELECT 1 FROM tsa.form_assets WHERE form_id=target_form)
$$;

-- Publication commits a durable hold before attempt fanout. Never acquire
-- attempt locks while holding the exclusive publication guard.
CREATE FUNCTION tsa.bank_apply_delivery_hold(hold_kind text,hold_target uuid,actor uuid,hold_reason text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE
  target_form uuid;
  affected integer:=0;
BEGIN
  IF hold_kind NOT IN('RIGHTS','QUARANTINE') OR hold_reason IS NULL OR btrim(hold_reason)='' OR
    actor::text IS DISTINCT FROM current_setting('tsa.bank_actor_id',true) OR
    NOT EXISTS(SELECT 1 FROM tsa.users u JOIN tsa.user_roles r ON r.user_id=u.id WHERE u.id=actor AND u.disabled_at IS NULL AND r.role='BANK_MANAGER') THEN
    RAISE EXCEPTION 'Authorized Bank manager and reason required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR UPDATE;
  FOR target_form IN
    SELECT DISTINCT fs.form_id FROM tsa.form_slots fs
    WHERE (hold_kind='QUARANTINE' AND EXISTS(SELECT 1 FROM tsa.bank_question_ancestors(fs.question_version_id) a WHERE a.id=hold_target))
      OR (hold_kind='RIGHTS' AND EXISTS(SELECT 1 FROM tsa.bank_question_sources(fs.question_version_id) s WHERE s.id=hold_target))
      OR (hold_kind='RIGHTS' AND EXISTS(SELECT 1 FROM tsa.form_assets fa JOIN tsa.asset_versions av ON av.id=fa.asset_version_id WHERE fa.form_id=fs.form_id AND av.source_version_id=hold_target))
    ORDER BY fs.form_id
  LOOP
    INSERT INTO tsa_private.form_delivery_holds(id,form_id,kind,target_id,actor_id,reason)
      VALUES(gen_random_uuid(),target_form,hold_kind,hold_target,actor,hold_reason) ON CONFLICT(form_id,kind,target_id) DO NOTHING;
    UPDATE tsa.form_availability SET withdrawn_at=clock_timestamp(),withdrawal_reason=hold_reason,revision=revision+1
      WHERE form_id=target_form AND withdrawn_at IS NULL;
    affected:=affected+1;
  END LOOP;
  RETURN affected;
END;
$$;

-- A hold is itself the durable pending-work record; completion is append-only.
CREATE TABLE tsa_private.delivery_hold_completions (
  hold_id uuid PRIMARY KEY REFERENCES tsa_private.form_delivery_holds(id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER hold_completions_immutable BEFORE UPDATE OR DELETE ON tsa_private.delivery_hold_completions
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
REVOKE ALL ON tsa_private.delivery_hold_completions FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_identity;
CREATE FUNCTION tsa.bank_drain_delivery_holds() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE hold_row record; attempt_row record; affected integer:=0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM tsa.users u JOIN tsa.user_roles r ON r.user_id=u.id
    WHERE u.id::text=current_setting('tsa.bank_actor_id',true) AND u.disabled_at IS NULL AND r.role='BANK_MANAGER') THEN
    RAISE EXCEPTION 'Authorized Bank manager required' USING ERRCODE='42501';
  END IF;
  -- Deliberately no Bank or user lock. Retries serialize on immutable hold rows.
  FOR hold_row IN SELECT h.* FROM tsa_private.form_delivery_holds h
    WHERE NOT EXISTS(SELECT 1 FROM tsa_private.delivery_hold_completions c WHERE c.hold_id=h.id)
    ORDER BY h.id FOR UPDATE OF h
  LOOP
    IF EXISTS(SELECT 1 FROM tsa_private.delivery_hold_completions WHERE hold_id=hold_row.id) THEN CONTINUE; END IF;
    FOR attempt_row IN SELECT id,state FROM tsa.attempts WHERE form_id=hold_row.form_id AND state NOT IN('CANCELLED','INVALIDATED') ORDER BY id FOR UPDATE LOOP
      UPDATE tsa.attempts SET state=CASE WHEN state='CREATED' THEN 'CANCELLED'::tsa.attempt_state ELSE 'INVALIDATED'::tsa.attempt_state END,
        cancellation_reason=CASE WHEN state='CREATED' THEN CASE WHEN hold_row.kind='RIGHTS' THEN 'RIGHTS_BLOCKED' ELSE 'FORM_WITHDRAWN' END ELSE cancellation_reason END,
        invalidation_reason=CASE WHEN state<>'CREATED' THEN hold_row.reason ELSE invalidation_reason END WHERE id=attempt_row.id;
      INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
        VALUES(gen_random_uuid(),hold_row.actor_id,'DELIVERY_HOLD_ATTEMPT','attempt',attempt_row.id::text,hold_row.reason);
    END LOOP;
    UPDATE tsa.result_releases r SET revoked_at=clock_timestamp(),reason=hold_row.reason
      FROM tsa.attempts a WHERE a.id=r.attempt_id AND a.form_id=hold_row.form_id AND r.revoked_at IS NULL;
    INSERT INTO tsa_private.delivery_hold_completions(hold_id) VALUES(hold_row.id);
    affected:=affected+1;
  END LOOP;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION tsa.bank_drain_delivery_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_drain_delivery_holds() TO tsa_bank;

-- Both public read and write consumers call this before payload/asset/result
-- access, under the Bank guard. Natural rights expiry fails closed as well.
CREATE FUNCTION tsa.student_attempt_delivery_state(target_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE a record; allowed boolean;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt
    AND user_id::text=nullif(current_setting('tsa.local_user_id',true),'') FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  allowed:=tsa.bank_form_delivery_allowed(a.form_id);
  IF NOT allowed AND a.state NOT IN('CANCELLED','INVALIDATED') THEN
    UPDATE tsa.attempts SET
      state=CASE WHEN state='CREATED' THEN 'CANCELLED'::tsa.attempt_state ELSE 'INVALIDATED'::tsa.attempt_state END,
      cancellation_reason=CASE WHEN state='CREATED' THEN CASE
        WHEN EXISTS(SELECT 1 FROM tsa_private.form_delivery_holds h WHERE h.form_id=a.form_id AND h.kind='RIGHTS') THEN 'RIGHTS_BLOCKED'
        WHEN EXISTS(SELECT 1 FROM tsa.form_availability f WHERE f.form_id=a.form_id AND f.withdrawn_at IS NOT NULL) THEN 'FORM_WITHDRAWN'
        ELSE 'RIGHTS_BLOCKED' END ELSE cancellation_reason END,
      invalidation_reason=CASE WHEN state<>'CREATED' THEN 'Delivery permission unavailable' ELSE invalidation_reason END
      WHERE id=a.id RETURNING * INTO a;
    UPDATE tsa.result_releases SET revoked_at=clock_timestamp(),reason='Delivery permission unavailable'
      WHERE attempt_id=a.id AND revoked_at IS NULL;
    INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
      VALUES(gen_random_uuid(),a.user_id,'DELIVERY_ACCESS_INVALIDATED','attempt',a.id::text,'Delivery permission unavailable');
  END IF;
  RETURN jsonb_build_object('attemptId',a.id,'state',a.state,'allowed',
    a.state NOT IN('CANCELLED','INVALIDATED') AND allowed);
END;
$$;
REVOKE ALL ON FUNCTION tsa.bank_question_ancestors(uuid),tsa.bank_question_sources(uuid),tsa.bank_source_display_allowed(uuid),
  tsa.bank_question_delivery_allowed(uuid),tsa.bank_form_delivery_allowed(uuid),tsa.bank_apply_delivery_hold(text,uuid,uuid,text),tsa.student_attempt_delivery_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_question_sources(uuid),tsa.bank_source_display_allowed(uuid),tsa.bank_question_delivery_allowed(uuid),
  tsa.bank_apply_delivery_hold(text,uuid,uuid,text) TO tsa_bank;
GRANT EXECUTE ON FUNCTION tsa.student_attempt_delivery_state(uuid) TO tsa_identity,tsa_web,tsa_exam;

CREATE FUNCTION tsa.bank_question_selection_allowed(version_id uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  SELECT EXISTS(SELECT 1 FROM tsa.question_versions qv JOIN tsa.questions q ON q.id=qv.question_id AND q.eligible_version_id=qv.id
    JOIN tsa.question_workflow w ON w.question_version_id=qv.id AND w.state='APPROVED'
    JOIN tsa.reviews r ON r.id=w.approved_review_id AND r.question_version_id=qv.id AND r.content_hash=qv.content_hash AND r.decision='APPROVE'
    JOIN tsa.duplicate_group_members m ON m.question_id=q.id JOIN tsa.duplicate_groups g ON g.id=m.group_id AND g.merged_into_id IS NULL
    WHERE qv.id=version_id AND tsa.bank_question_delivery_allowed(qv.id)
      AND NOT EXISTS(SELECT 1 FROM tsa.duplicate_relations d JOIN tsa.question_versions l ON l.id=d.left_version_id JOIN tsa.question_versions rr ON rr.id=d.right_version_id
        WHERE (l.question_id=q.id OR rr.question_id=q.id) AND d.resolution='OPEN')
      AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(qv.id) s JOIN tsa.source_rights sr ON sr.source_version_id=s.id JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id
        WHERE (qv.origin IN('GENERATED','AUGMENTED') AND NOT 'GENERATE'=ANY(rd.allowed_uses)) OR (qv.origin='AUGMENTED' AND NOT 'ADAPT'=ANY(rd.allowed_uses))))
$$;
REVOKE ALL ON FUNCTION tsa.bank_question_selection_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_question_selection_allowed(uuid) TO tsa_bank;
GRANT EXECUTE ON FUNCTION tsa.bank_question_ancestors(uuid) TO tsa_bank;
CREATE FUNCTION tsa.guard_delivery_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
DECLARE version_id uuid; privileged_owner boolean;
BEGIN
  SELECT r.rolsuper OR d.datdba=r.oid INTO privileged_owner FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user;
  IF privileged_owner THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='questions' THEN
    version_id:=NEW.eligible_version_id;
  ELSE
    IF NEW.state<>'APPROVED' THEN RETURN NEW; END IF;
    version_id:=NEW.question_version_id;
  END IF;
  IF version_id IS NOT NULL AND NOT tsa.bank_question_delivery_allowed(version_id) THEN
    RAISE EXCEPTION 'Current delivery checks and rights are required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tsa.guard_delivery_publication() FROM PUBLIC;
CREATE TRIGGER zz_bank_delivery_pointer BEFORE INSERT OR UPDATE OF eligible_version_id ON tsa.questions FOR EACH ROW EXECUTE FUNCTION tsa.guard_delivery_publication();
CREATE TRIGGER zz_bank_delivery_approval BEFORE INSERT OR UPDATE OF state,approved_review_id ON tsa.question_workflow FOR EACH ROW EXECUTE FUNCTION tsa.guard_delivery_publication();
