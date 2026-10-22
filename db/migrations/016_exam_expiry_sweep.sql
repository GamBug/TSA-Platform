-- Trusted bounded recovery; no student request or active candidate role needed.
CREATE FUNCTION tsa.exam_worker_sweep(executor text,batch_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE
  a record; permitted boolean; cancellation text; policy text; input_hash text;
  cancelled integer:=0; expired integer:=0; invalidated integer:=0;
BEGIN
  IF executor IS NULL OR executor !~ '^[!-~]{1,128}$'
    OR batch_limit IS NULL OR batch_limit<1 OR batch_limit>100 THEN
    RAISE EXCEPTION 'Explicit bounded sweep configuration required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  -- The guard precedes attempt locks, as in start/save/submit/grading. Concurrent
  -- sweepers skip busy attempts instead of serializing unrelated students.
  FOR a IN
    SELECT candidate.* FROM tsa.attempts candidate
    WHERE candidate.state IN('CREATED','IN_PROGRESS') AND (
      (candidate.state='CREATED' AND clock_timestamp()>=candidate.start_before_at)
      OR (candidate.state='IN_PROGRESS' AND clock_timestamp()>=candidate.deadline_at)
      OR NOT tsa.bank_form_delivery_allowed(candidate.form_id)
      OR (candidate.state='IN_PROGRESS' AND NOT tsa.exam_form_rights_cover(candidate.form_id,candidate.deadline_at)))
    ORDER BY candidate.id LIMIT batch_limit FOR UPDATE OF candidate SKIP LOCKED
  LOOP
    PERFORM form_id FROM tsa.form_availability WHERE form_id=a.form_id FOR SHARE;
    permitted:=tsa.bank_form_delivery_allowed(a.form_id);
    IF NOT permitted THEN
      IF a.state='CREATED' THEN
        cancellation:=CASE
          WHEN EXISTS(SELECT 1 FROM tsa_private.form_delivery_holds h WHERE h.form_id=a.form_id AND h.kind='RIGHTS') THEN 'RIGHTS_BLOCKED'
          WHEN EXISTS(SELECT 1 FROM tsa.form_availability f WHERE f.form_id=a.form_id AND f.withdrawn_at IS NOT NULL) THEN 'FORM_WITHDRAWN'
          ELSE 'RIGHTS_BLOCKED' END;
        UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason=cancellation WHERE id=a.id;
        cancelled:=cancelled+1;
      ELSE
        UPDATE tsa.attempts SET state='INVALIDATED',invalidation_reason='Delivery permission unavailable' WHERE id=a.id;
        invalidated:=invalidated+1;
      END IF;
      UPDATE tsa.result_releases SET revoked_at=clock_timestamp(),reason='Delivery permission unavailable'
        WHERE attempt_id=a.id AND revoked_at IS NULL;
      INSERT INTO tsa.audit_events(id,service_actor,action,entity_type,entity_id,reason)
        VALUES(gen_random_uuid(),'EXAM:'||executor,'ATTEMPT_SWEEP_RESTRICTED','attempt',a.id::text,'Delivery permission unavailable');
    ELSIF a.state='CREATED' AND clock_timestamp()>=a.start_before_at THEN
      UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='START_TTL_EXPIRED' WHERE id=a.id;
      INSERT INTO tsa.audit_events(id,service_actor,action,entity_type,entity_id,reason)
        VALUES(gen_random_uuid(),'EXAM:'||executor,'ATTEMPT_START_CANCELLED','attempt',a.id::text,'START_TTL_EXPIRED');
      cancelled:=cancelled+1;
    ELSIF a.state='IN_PROGRESS' AND NOT tsa.exam_form_rights_cover(a.form_id,a.deadline_at) THEN
      UPDATE tsa.attempts SET state='INVALIDATED',invalidation_reason='Source rights do not cover attempt deadline' WHERE id=a.id;
      UPDATE tsa.result_releases SET revoked_at=clock_timestamp(),reason='Source rights do not cover attempt deadline'
        WHERE attempt_id=a.id AND revoked_at IS NULL;
      INSERT INTO tsa.audit_events(id,service_actor,action,entity_type,entity_id,reason)
        VALUES(gen_random_uuid(),'EXAM:'||executor,'ATTEMPT_DELIVERY_INVALIDATED','attempt',a.id::text,'Rights coverage');
      invalidated:=invalidated+1;
    ELSIF a.state='IN_PROGRESS' AND clock_timestamp()>=a.deadline_at THEN
      UPDATE tsa.attempts SET state='EXPIRED' WHERE id=a.id;
      input_hash:=tsa.exam_grading_input_hash(a.id);
      SELECT policy_version INTO STRICT policy FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id LIMIT 1;
      INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
        VALUES(gen_random_uuid(),'exam_grade_attempt',a.id::text||':'||policy||':'||input_hash,'attempt:'||a.id::text,a.id);
      INSERT INTO tsa.audit_events(id,service_actor,action,entity_type,entity_id,reason)
        VALUES(gen_random_uuid(),'EXAM:'||executor,'ATTEMPT_EXPIRED','attempt',a.id::text,'DEADLINE');
      expired:=expired+1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('status','SWEPT','reconciled',cancelled+expired+invalidated,
    'cancelled',cancelled,'expired',expired,'invalidated',invalidated);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_worker_sweep(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_worker_sweep(text,integer) TO tsa_exam_worker;
