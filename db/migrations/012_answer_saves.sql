-- Latest acknowledged answers only; no answer history or private-key grants.
CREATE FUNCTION tsa.exam_authorize_save(target_attempt uuid,target_slot uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  SELECT EXISTS(SELECT 1 FROM tsa.attempts a JOIN tsa.form_slots s ON s.form_id=a.form_id
    WHERE a.id=target_attempt AND a.user_id=tsa.assembly_candidate() AND s.slot_id=target_slot)
$$;

CREATE FUNCTION tsa.exam_consume_save_budget(target_attempt uuid,target_slot uuid,
  user_capacity numeric,user_refill numeric,attempt_capacity numeric,attempt_refill numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); ub record; ab record; observed timestamptz;
  user_tokens numeric; attempt_tokens numeric; retry_after integer;
BEGIN
  IF NOT tsa.exam_authorize_save(target_attempt,target_slot) THEN
    RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND');
  END IF;
  IF user_capacity IS NULL OR user_capacity<>trunc(user_capacity) OR NOT(user_capacity BETWEEN 1 AND 1000)
    OR attempt_capacity IS NULL OR attempt_capacity<>trunc(attempt_capacity) OR NOT(attempt_capacity BETWEEN 1 AND 1000)
    OR user_refill IS NULL OR NOT(user_refill BETWEEN 0.000001 AND 1000)
    OR attempt_refill IS NULL OR NOT(attempt_refill BETWEEN 0.000001 AND 1000) THEN
    RAISE EXCEPTION 'Explicit valid save budgets required' USING ERRCODE='22023';
  END IF;
  -- All save commands lock USER_SAVE before ATTEMPT_SAVE, before any attempt
  -- write lock. This transaction commits independently of the answer command.
  INSERT INTO tsa.rate_limit_buckets(scope,subject_id,tokens,refilled_at)
    VALUES('USER_SAVE',who::text,user_capacity,clock_timestamp()) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT ub FROM tsa.rate_limit_buckets WHERE scope='USER_SAVE' AND subject_id=who::text FOR UPDATE;
  INSERT INTO tsa.rate_limit_buckets(scope,subject_id,tokens,refilled_at)
    VALUES('ATTEMPT_SAVE',target_attempt::text,attempt_capacity,clock_timestamp()) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT ab FROM tsa.rate_limit_buckets WHERE scope='ATTEMPT_SAVE' AND subject_id=target_attempt::text FOR UPDATE;
  observed:=clock_timestamp();
  user_tokens:=trunc(greatest(0,least(user_capacity,ub.tokens+greatest(0,extract(epoch FROM observed-ub.refilled_at))*user_refill)),6);
  attempt_tokens:=trunc(greatest(0,least(attempt_capacity,ab.tokens+greatest(0,extract(epoch FROM observed-ab.refilled_at))*attempt_refill)),6);
  IF user_tokens<1 OR attempt_tokens<1 THEN
    retry_after:=greatest(1,ceil(greatest((1-user_tokens)/user_refill,(1-attempt_tokens)/attempt_refill))::integer);
    RETURN jsonb_build_object('allowed',false,'retryAfter',retry_after);
  END IF;
  UPDATE tsa.rate_limit_buckets SET tokens=user_tokens-1,refilled_at=observed WHERE scope='USER_SAVE' AND subject_id=who::text;
  UPDATE tsa.rate_limit_buckets SET tokens=attempt_tokens-1,refilled_at=observed WHERE scope='ATTEMPT_SAVE' AND subject_id=target_attempt::text;
  RETURN jsonb_build_object('allowed',true);
END;
$$;

CREATE FUNCTION tsa.exam_response_valid(interaction jsonb,response_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE kind text; n integer;
BEGIN
  IF jsonb_typeof(interaction) IS DISTINCT FROM 'object' OR jsonb_typeof(response_value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  kind:=interaction->>'type';
  IF response_value->>'type' IS DISTINCT FROM kind OR (SELECT count(*) FROM jsonb_object_keys(response_value))<>2 THEN RETURN false; END IF;
  IF kind='SINGLE_CHOICE' THEN
    IF NOT(response_value ? 'optionId') THEN RETURN false; END IF;
    RETURN response_value->'optionId'='null'::jsonb OR (jsonb_typeof(response_value->'optionId')='string'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'options') o WHERE o->>'id'=response_value->>'optionId'));
  ELSIF kind='MULTIPLE_CHOICE' THEN
    IF jsonb_typeof(response_value->'optionIds') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    n:=jsonb_array_length(response_value->'optionIds');
    IF n=0 THEN RETURN true; END IF;
    RETURN n BETWEEN (interaction->>'minSelections')::integer AND (interaction->>'maxSelections')::integer
      AND n=(SELECT count(DISTINCT v) FROM jsonb_array_elements(response_value->'optionIds') v)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(response_value->'optionIds') v
        WHERE jsonb_typeof(v)<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'options') o WHERE o->'id'=v));
  ELSIF kind='TRUE_FALSE_GROUP' THEN
    IF jsonb_typeof(response_value->'values') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    RETURN (SELECT count(*) FROM jsonb_object_keys(response_value->'values'))=jsonb_array_length(interaction->'statements')
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'statements') s WHERE NOT((response_value->'values') ? (s->>'id')))
      AND NOT EXISTS(SELECT 1 FROM jsonb_each(response_value->'values') v WHERE jsonb_typeof(v.value) NOT IN ('boolean','null'));
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION tsa.exam_answer_save(target_attempt uuid,target_slot uuid,command_key text,body_hash text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); a record; slot record; prior record; answer record;
  scope text; expected bigint; current_revision bigint; details jsonb; receipt jsonb;
BEGIN
  IF NOT tsa.exam_authorize_save(target_attempt,target_slot) THEN RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND'); END IF;
  IF NOT tsa.exam_reconcile_attempt(target_attempt) THEN RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND'); END IF;
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
  SELECT * INTO STRICT slot FROM tsa.form_slots WHERE form_id=a.form_id AND slot_id=target_slot;
  -- An answer receipt contains a student value. Effective holds suppress replay.
  IF a.state='INVALIDATED' OR NOT tsa.bank_form_delivery_allowed(a.form_id) THEN
    RETURN jsonb_build_object('status','ERROR','code','CONTENT_WITHDRAWN');
  END IF;
  IF command_key IS NULL OR command_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR');
  END IF;
  scope:='PUT /api/v1/attempts/'||a.id::text||'/answers/'||target_slot::text;
  SELECT * INTO prior FROM tsa.idempotency_records WHERE actor_id=who AND route_scope=scope AND idempotency_key=command_key;
  IF FOUND THEN
    IF prior.request_hash<>body_hash THEN RETURN jsonb_build_object('status','ERROR','code','IDEMPOTENCY_CONFLICT'); END IF;
    RETURN jsonb_build_object('status','REPLAY','receipt',prior.safe_response);
  END IF;
  IF a.state<>'IN_PROGRESS' THEN RETURN jsonb_build_object('status','ERROR','code','ATTEMPT_CLOSED'); END IF;
  IF NOT EXISTS(SELECT 1 FROM tsa.attempt_sections s WHERE s.attempt_id=a.id AND s.section_id=slot.section_id
    AND s.starts_at<=clock_timestamp() AND clock_timestamp()<s.ends_at) THEN
    PERFORM tsa.exam_reconcile_attempt(a.id);
    IF (SELECT state FROM tsa.attempts WHERE id=a.id)<>'IN_PROGRESS' THEN RETURN jsonb_build_object('status','ERROR','code','ATTEMPT_CLOSED'); END IF;
    RETURN jsonb_build_object('status','ERROR','code','SECTION_CLOSED');
  END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(payload))<>2 OR NOT(payload ? 'value')
    OR jsonb_typeof(payload->'expectedRevision') IS DISTINCT FROM 'number' THEN
    RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR');
  END IF;
  IF (payload->>'expectedRevision')::numeric<>trunc((payload->>'expectedRevision')::numeric)
    OR NOT((payload->>'expectedRevision')::numeric BETWEEN 0 AND 9007199254740991)
    OR NOT tsa.exam_response_valid(slot.public_snapshot->'interaction',payload->'value') THEN
    RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR');
  END IF;
  expected:=(payload->>'expectedRevision')::bigint;
  SELECT * INTO answer FROM tsa.answers WHERE attempt_id=a.id AND slot_id=target_slot;
  current_revision:=COALESCE(answer.revision,0);
  IF current_revision<>expected THEN
    details:=jsonb_build_object('currentRevision',current_revision);
    IF answer.revision IS NOT NULL THEN details:=details||jsonb_build_object('currentAnswer',answer.value); END IF;
    RETURN jsonb_build_object('status','ERROR','code','REVISION_CONFLICT','details',details);
  END IF;
  IF current_revision>=9007199254740991 THEN
    RETURN jsonb_build_object('status','ERROR','code','TEMPORARILY_UNAVAILABLE');
  END IF;
  BEGIN
    -- INSERT triggers enforce revision one before ON CONFLICT resolution, so
    -- existing rows use UPDATE under the already-held attempt lock.
    IF current_revision=0 THEN
      INSERT INTO tsa.answers(attempt_id,form_id,slot_id,value,revision)
        VALUES(a.id,a.form_id,target_slot,payload->'value',1) RETURNING * INTO answer;
    ELSE
      UPDATE tsa.answers SET value=payload->'value',revision=expected+1
        WHERE attempt_id=a.id AND slot_id=target_slot RETURNING * INTO answer;
    END IF;
    -- The existing trigger sets saved_at from a fresh clock. Never acknowledge a
    -- value whose actual storage timestamp crossed the exclusive deadline.
    IF answer.saved_at>=a.deadline_at THEN RAISE EXCEPTION 'Elapsed answer deadline' USING ERRCODE='ZX002'; END IF;
  EXCEPTION WHEN check_violation OR SQLSTATE 'ZX002' THEN
    IF clock_timestamp()>=a.deadline_at THEN
      PERFORM tsa.exam_reconcile_attempt(a.id);
      RETURN jsonb_build_object('status','ERROR','code','ATTEMPT_CLOSED');
    END IF;
    RAISE;
  END;
  receipt:=jsonb_build_object('slotId',target_slot,'value',answer.value,'revision',answer.revision,'savedAt',tsa.exam_instant(answer.saved_at));
  INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
    VALUES(gen_random_uuid(),who,scope,command_key,body_hash,200,receipt,a.id,a.id);
  INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,before_revision,after_revision)
    VALUES(gen_random_uuid(),who,'ANSWER_SAVED','attempt',a.id::text,current_revision,answer.revision);
  RETURN jsonb_build_object('status','SAVED','receipt',receipt);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_authorize_save(uuid,uuid),tsa.exam_consume_save_budget(uuid,uuid,numeric,numeric,numeric,numeric),
  tsa.exam_response_valid(jsonb,jsonb),tsa.exam_answer_save(uuid,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_authorize_save(uuid,uuid),tsa.exam_consume_save_budget(uuid,uuid,numeric,numeric,numeric,numeric),
  tsa.exam_answer_save(uuid,uuid,text,text,jsonb) TO tsa_exam;
