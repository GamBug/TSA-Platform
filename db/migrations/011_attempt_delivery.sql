-- Restricted persisted first-start and safe read commands. No key/result grants.
CREATE FUNCTION tsa.exam_instant(value timestamptz) RETURNS text
LANGUAGE sql STABLE STRICT SET search_path=pg_catalog AS $$
  SELECT to_char(value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
CREATE FUNCTION tsa.exam_form_rights_cover(target_form uuid,through_at timestamptz) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  SELECT tsa.bank_form_delivery_allowed(target_form) AND through_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM tsa.form_slots fs CROSS JOIN LATERAL tsa.bank_question_sources(fs.question_version_id) source
      JOIN tsa.source_rights sr ON sr.source_version_id=source.id JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id
      WHERE fs.form_id=target_form AND rd.valid_to IS NOT NULL AND rd.valid_to<through_at)
$$;
CREATE FUNCTION tsa.exam_reconcile_attempt(target_attempt uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); a record; policy text; input_hash text;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=who FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM form_id FROM tsa.form_availability WHERE form_id=a.form_id FOR SHARE;
  PERFORM tsa.student_attempt_delivery_state(a.id);
  SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt;
  IF a.state='CREATED' AND clock_timestamp()>=a.start_before_at THEN
    UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='START_TTL_EXPIRED' WHERE id=a.id;
    INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
      VALUES(gen_random_uuid(),who,'ATTEMPT_START_CANCELLED','attempt',a.id::text,'START_TTL_EXPIRED');
  ELSIF a.state='IN_PROGRESS' AND NOT tsa.exam_form_rights_cover(a.form_id,a.deadline_at) THEN
    UPDATE tsa.attempts SET state='INVALIDATED',invalidation_reason='Source rights do not cover attempt deadline' WHERE id=a.id;
    UPDATE tsa.result_releases SET revoked_at=clock_timestamp(),reason='Source rights do not cover attempt deadline'
      WHERE attempt_id=a.id AND revoked_at IS NULL;
    INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
      VALUES(gen_random_uuid(),who,'ATTEMPT_DELIVERY_INVALIDATED','attempt',a.id::text,'Rights coverage');
  ELSIF a.state='IN_PROGRESS' AND clock_timestamp()>=a.deadline_at THEN
    UPDATE tsa.attempts SET state='EXPIRED' WHERE id=a.id;
    input_hash:=tsa.exam_grading_input_hash(a.id);
    SELECT policy_version INTO STRICT policy FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id LIMIT 1;
    INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
      VALUES(gen_random_uuid(),'exam_grade_attempt',a.id::text||':'||policy||':'||input_hash,'attempt:'||a.id::text,a.id);
    INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
      VALUES(gen_random_uuid(),who,'ATTEMPT_EXPIRED','attempt',a.id::text,'DEADLINE');
  END IF;
  RETURN true;
END;
$$;
CREATE FUNCTION tsa.exam_attempt_read(target_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); a record; section_row record; section_start timestamptz; section_end timestamptz;
  view jsonb; guard jsonb; now_at timestamptz; guard_revision text;
BEGIN
  IF NOT tsa.exam_reconcile_attempt(target_attempt) THEN RETURN NULL; END IF;
  SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
  SELECT * INTO STRICT section_row FROM tsa.form_sections WHERE form_id=a.form_id;
  SELECT starts_at,ends_at INTO section_start,section_end FROM tsa.attempt_sections WHERE attempt_id=a.id AND section_id=section_row.section_id;
  now_at:=clock_timestamp();
  IF (a.state='CREATED' AND now_at>=a.start_before_at) OR (a.state='IN_PROGRESS' AND now_at>=a.deadline_at) THEN
    PERFORM tsa.exam_reconcile_attempt(a.id);
    SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
  END IF;
  guard_revision:=(SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1)||':'||a.state::text||':'||
    (SELECT revision::text FROM tsa.form_availability WHERE form_id=a.form_id)||':'||
    COALESCE((SELECT sum(revision)::text FROM tsa.answers WHERE attempt_id=a.id),'0');
  guard:=jsonb_build_object('attemptId',a.id,'ownerId',who,'state',a.state,
    'withdrawn',a.state='INVALIDATED','releaseAuthorized',false,'revision',guard_revision);
  view:=jsonb_build_object('attemptId',a.id,'state',a.state,'formId',a.form_id,'domain',section_row.section,
    'formMode',a.form_mode,'reuseMode',a.reuse_mode,'reusePolicyVersion',a.reuse_policy_version,
    'serverNow',tsa.exam_instant(now_at),'startBefore',CASE WHEN a.state='CREATED' THEN tsa.exam_instant(a.start_before_at) ELSE NULL END,
    'startedAt',tsa.exam_instant(a.started_at),'deadlineAt',tsa.exam_instant(a.deadline_at),
    'activeSectionId',CASE WHEN a.state='IN_PROGRESS' THEN section_row.section_id ELSE NULL END,
    'sections',jsonb_build_array(jsonb_build_object('sectionId',section_row.section_id,'section',section_row.section,
      'startsAt',tsa.exam_instant(section_start),'endsAt',tsa.exam_instant(section_end),'count',section_row.question_count)),
    'slots',CASE WHEN a.state='IN_PROGRESS' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'slotId',s.slot_id,'sectionId',s.section_id,'ordinal',s.ordinal,
      'stimulus',s.public_snapshot->'stimulus','content',s.public_snapshot->'content','interaction',s.public_snapshot->'interaction')
      ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=a.form_id AND s.section_id=section_row.section_id),'[]'::jsonb) ELSE '[]'::jsonb END,
    'answers',CASE WHEN a.state='IN_PROGRESS' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'slotId',ans.slot_id,'value',ans.value,'revision',ans.revision,'savedAt',tsa.exam_instant(ans.saved_at)) ORDER BY s.ordinal)
      FROM tsa.answers ans JOIN tsa.form_slots s ON s.form_id=ans.form_id AND s.slot_id=ans.slot_id
      WHERE ans.attempt_id=a.id AND s.section_id=section_row.section_id),'[]'::jsonb) ELSE '[]'::jsonb END,
    'closure',jsonb_build_object('attemptId',a.id,'state',a.state,'terminalReason',a.terminal_reason,
      'cancellationReason',a.cancellation_reason,'closedAt',tsa.exam_instant(a.closed_at),'gradingStatus',a.grading_status));
  RETURN jsonb_build_object('guard',guard,'view',view);
END;
$$;
CREATE FUNCTION tsa.exam_attempt_start(target_attempt uuid,command_key text,body_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); a record; prior record; receipt jsonb; scope text;
  duration integer; failure_reason text; was_started boolean;
BEGIN
  IF command_key IS NULL OR command_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR');
  END IF;
  IF NOT tsa.exam_reconcile_attempt(target_attempt) THEN RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND'); END IF;
  SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
  scope:='POST /api/v1/attempts/'||a.id::text||'/start';
  SELECT * INTO prior FROM tsa.idempotency_records WHERE actor_id=who AND route_scope=scope AND idempotency_key=command_key;
  IF FOUND AND prior.request_hash<>body_hash THEN RETURN jsonb_build_object('status','ERROR','code','IDEMPOTENCY_CONFLICT'); END IF;
  -- Clock-only receipts never authorize payload access or re-admission.
  was_started:=a.started_at IS NOT NULL;
  IF was_started THEN
    IF prior.id IS NOT NULL THEN RETURN jsonb_build_object('status','REPLAY','receipt',prior.safe_response); END IF;
  ELSE
    IF a.state<>'CREATED' THEN RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE'); END IF;
    SELECT duration_seconds INTO STRICT duration FROM tsa.form_sections WHERE form_id=a.form_id;
    IF NOT tsa.exam_form_rights_cover(a.form_id,clock_timestamp()+make_interval(secs=>duration)) THEN
      failure_reason:='RIGHTS_BLOCKED';
    ELSE
      -- Trigger-generated times are authoritative. A savepoint rolls back a
      -- first start if the actual deadline is uncovered or the stored TTL passed.
      BEGIN
        UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=a.id RETURNING * INTO a;
        IF NOT tsa.exam_form_rights_cover(a.form_id,a.deadline_at) THEN
          RAISE EXCEPTION 'Actual start deadline is not rights-covered' USING ERRCODE='ZX001';
        END IF;
      EXCEPTION
        WHEN SQLSTATE 'ZX001' THEN failure_reason:='RIGHTS_BLOCKED';
        WHEN check_violation THEN
          IF clock_timestamp()>=a.start_before_at THEN failure_reason:='START_TTL_EXPIRED'; ELSE RAISE; END IF;
      END;
    END IF;
    IF failure_reason IS NOT NULL THEN
      UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason=failure_reason WHERE id=target_attempt;
      INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
        VALUES(gen_random_uuid(),who,'ATTEMPT_START_CANCELLED','attempt',target_attempt::text,failure_reason);
      RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE');
    END IF;
    INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
      VALUES(gen_random_uuid(),who,'ATTEMPT_STARTED','attempt',a.id::text);
  END IF;
  receipt:=jsonb_build_object('attemptId',a.id,'startedAt',tsa.exam_instant(a.started_at),'deadlineAt',tsa.exam_instant(a.deadline_at));
  INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
    VALUES(gen_random_uuid(),who,scope,command_key,body_hash,200,receipt,a.id,a.id);
  RETURN jsonb_build_object('status',CASE WHEN was_started THEN 'REPLAY' ELSE 'STARTED' END,'receipt',receipt);
END;
$$;
CREATE FUNCTION tsa.exam_consume_creation_budget(bucket_capacity numeric,refill_per_second numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); bucket record; observed timestamptz; available numeric; retry_after integer;
BEGIN
  IF bucket_capacity IS NULL OR bucket_capacity<>trunc(bucket_capacity) OR NOT(bucket_capacity BETWEEN 1 AND 1000)
    OR refill_per_second IS NULL OR NOT(refill_per_second BETWEEN 0.000001 AND 1000) THEN
    RAISE EXCEPTION 'Explicit valid creation budget required' USING ERRCODE='22023';
  END IF;
  INSERT INTO tsa.rate_limit_buckets(scope,subject_id,tokens,refilled_at)
    VALUES('USER_CREATE',who::text,bucket_capacity,clock_timestamp()) ON CONFLICT(scope,subject_id) DO NOTHING;
  SELECT * INTO STRICT bucket FROM tsa.rate_limit_buckets WHERE scope='USER_CREATE' AND subject_id=who::text FOR UPDATE;
  observed:=clock_timestamp();
  -- Persisted tokens have six decimal places; truncate to avoid rounding a
  -- fractional token upward into an unauthorized request.
  available:=trunc(greatest(0,least(bucket_capacity,bucket.tokens+greatest(0,extract(epoch FROM observed-bucket.refilled_at))*refill_per_second)),6);
  IF available<1 THEN
    retry_after:=greatest(1,ceil((1-available)/refill_per_second)::integer);
    UPDATE tsa.rate_limit_buckets SET tokens=available,refilled_at=observed WHERE scope='USER_CREATE' AND subject_id=who::text;
    RETURN jsonb_build_object('allowed',false,'retryAfter',retry_after);
  END IF;
  UPDATE tsa.rate_limit_buckets SET tokens=available-1,refilled_at=observed WHERE scope='USER_CREATE' AND subject_id=who::text;
  RETURN jsonb_build_object('allowed',true);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_instant(timestamptz),tsa.exam_form_rights_cover(uuid,timestamptz),tsa.exam_reconcile_attempt(uuid),
  tsa.exam_attempt_read(uuid),tsa.exam_attempt_start(uuid,text,text),tsa.exam_consume_creation_budget(numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_attempt_read(uuid),tsa.exam_attempt_start(uuid,text,text),tsa.exam_consume_creation_budget(numeric,numeric) TO tsa_exam;
