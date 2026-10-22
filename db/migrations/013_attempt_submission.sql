-- Frozen empty-command submission: closure, grade dispatch, receipt and audit.
CREATE FUNCTION tsa.exam_attempt_submit(target_attempt uuid,command_key text,body_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); a record; prior record; scope text;
  receipt jsonb; policy text; input_hash text; submitted boolean:=false;
BEGIN
  -- Reconciliation takes the shared Bank guard, owned attempt and availability
  -- locks. It may commit a required cancellation/expiry through this command.
  IF NOT tsa.exam_reconcile_attempt(target_attempt) THEN RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND'); END IF;
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
  IF a.state='INVALIDATED' OR NOT tsa.bank_form_delivery_allowed(a.form_id) THEN
    RETURN jsonb_build_object('status','ERROR','code','CONTENT_WITHDRAWN');
  END IF;
  IF command_key IS NULL OR command_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR');
  END IF;
  scope:='POST /api/v1/attempts/'||a.id::text||'/submit';
  SELECT * INTO prior FROM tsa.idempotency_records WHERE actor_id=who AND route_scope=scope AND idempotency_key=command_key;
  IF FOUND THEN
    IF prior.request_hash<>body_hash THEN RETURN jsonb_build_object('status','ERROR','code','IDEMPOTENCY_CONFLICT'); END IF;
    RETURN jsonb_build_object('status','REPLAY','receipt',prior.safe_response);
  END IF;
  IF a.state='CREATED' THEN RETURN jsonb_build_object('status','ERROR','code','ATTEMPT_CLOSED'); END IF;
  IF a.state='IN_PROGRESS' THEN
    BEGIN
      -- The existing state trigger judges fresh database time and fixes closed_at.
      UPDATE tsa.attempts SET state='SUBMITTED' WHERE id=a.id RETURNING * INTO a;
      submitted:=true;
    EXCEPTION WHEN check_violation THEN
      IF clock_timestamp()>=a.deadline_at THEN
        PERFORM tsa.exam_reconcile_attempt(a.id);
        SELECT * INTO STRICT a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
      ELSE RAISE;
      END IF;
    END;
    IF submitted THEN
      input_hash:=tsa.exam_grading_input_hash(a.id);
      SELECT policy_version INTO STRICT policy FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id LIMIT 1;
      INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
        VALUES(gen_random_uuid(),'exam_grade_attempt',a.id::text||':'||policy||':'||input_hash,'attempt:'||a.id::text,a.id);
      INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
        VALUES(gen_random_uuid(),who,'ATTEMPT_SUBMITTED','attempt',a.id::text,'EXPLICIT_SUBMIT');
    END IF;
  END IF;
  receipt:=jsonb_build_object('attemptId',a.id,'state',a.state,'terminalReason',a.terminal_reason,
    'cancellationReason',a.cancellation_reason,'closedAt',tsa.exam_instant(a.closed_at),'gradingStatus',a.grading_status);
  INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
    VALUES(gen_random_uuid(),who,scope,command_key,body_hash,200,receipt,a.id,a.id);
  RETURN jsonb_build_object('status',CASE WHEN submitted THEN 'SUBMITTED' ELSE 'CLOSED' END,'receipt',receipt);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_attempt_submit(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_attempt_submit(uuid,text,text) TO tsa_exam;
