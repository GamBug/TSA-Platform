-- Trusted EXAM executor capability. Student and Factory credentials gain none.
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tsa_exam_worker') THEN
    CREATE ROLE tsa_exam_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
  ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='tsa_exam_worker' AND
    (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)) THEN
    RAISE EXCEPTION 'Unsafe worker capability role' USING ERRCODE='42501';
  END IF;
END $$;
GRANT USAGE ON SCHEMA tsa TO tsa_exam_worker;
REVOKE SELECT ON tsa_private.question_secrets FROM tsa_exam;

-- Lease GUCs scope reads; they cannot authenticate a student DB connection as a worker.
CREATE OR REPLACE FUNCTION tsa.exam_job_context_matches(p_attempt_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  SELECT pg_has_role(session_user,'tsa_exam_worker','MEMBER')
    AND (current_setting('role',true)='tsa_exam' OR session_user='tsa_exam')
    AND NULLIF(current_setting('tsa.exam_job_id',true),'') IS NOT NULL
    AND NULLIF(current_setting('tsa.executor_id',true),'') IS NOT NULL
    AND NULLIF(current_setting('tsa.lease_token',true),'') IS NOT NULL
    AND EXISTS(SELECT 1 FROM tsa.jobs j WHERE j.id::text=current_setting('tsa.exam_job_id',true)
      AND j.attempt_id=p_attempt_id AND j.kind='exam_grade_attempt' AND j.state='RUNNING'
      AND j.lease_owner=current_setting('tsa.executor_id',true)
      AND j.lease_token::text=current_setting('tsa.lease_token',true) AND j.lease_until>clock_timestamp())
$$;

CREATE FUNCTION tsa.exam_binary_earned(interaction jsonb,answer_key jsonb,response jsonb) RETURNS smallint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,tsa AS $$
DECLARE kind text:=interaction->>'type'; key_set jsonb; response_set jsonb;
BEGIN
  IF NOT COALESCE(tsa.exam_response_valid(interaction,answer_key),false)
    OR (kind='SINGLE_CHOICE' AND answer_key->'optionId'='null'::jsonb)
    OR (kind='MULTIPLE_CHOICE' AND jsonb_array_length(answer_key->'optionIds')=0)
    OR (kind='TRUE_FALSE_GROUP' AND EXISTS(SELECT 1 FROM jsonb_each(answer_key->'values') v WHERE jsonb_typeof(v.value)<>'boolean')) THEN
    RAISE EXCEPTION 'Invalid frozen grading key' USING ERRCODE='22023';
  END IF;
  IF response IS NULL OR response='null'::jsonb THEN RETURN 0; END IF;
  IF NOT COALESCE(tsa.exam_response_valid(interaction,response),false) THEN
    RAISE EXCEPTION 'Invalid frozen grading response' USING ERRCODE='22023';
  END IF;
  IF kind='MULTIPLE_CHOICE' THEN
    SELECT jsonb_agg(v ORDER BY v) INTO key_set FROM jsonb_array_elements(answer_key->'optionIds') v;
    SELECT jsonb_agg(v ORDER BY v) INTO response_set FROM jsonb_array_elements(response->'optionIds') v;
    RETURN CASE WHEN key_set=response_set THEN 1 ELSE 0 END;
  END IF;
  RETURN CASE WHEN answer_key=response THEN 1 ELSE 0 END;
END;
$$;

CREATE FUNCTION tsa.exam_worker_expected(target_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE items jsonb; sections jsonb; correct integer; total integer; hundredths bigint;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('slotId',s.slot_id,'earned',tsa.exam_binary_earned(
      s.public_snapshot->'interaction',k.key_snapshot,ans.value)) ORDER BY s.ordinal),count(*)::integer,
      sum(tsa.exam_binary_earned(s.public_snapshot->'interaction',k.key_snapshot,ans.value))::integer
    INTO items,total,correct FROM tsa.attempts a JOIN tsa.form_slots s ON s.form_id=a.form_id
    JOIN tsa_private.form_slot_secrets k ON k.form_id=s.form_id AND k.slot_id=s.slot_id
    LEFT JOIN tsa.answers ans ON ans.attempt_id=a.id AND ans.form_id=s.form_id AND ans.slot_id=s.slot_id
    WHERE a.id=target_attempt;
  IF total=0 THEN RAISE EXCEPTION 'No frozen grading slots' USING ERRCODE='22023'; END IF;
  SELECT jsonb_agg(jsonb_build_object('sectionId',section_id,'section',section,
    'correctCount',n,'totalCount',t) ORDER BY ordinal) INTO sections FROM (
      SELECT fs.section_id,fs.section,fs.ordinal,count(s.slot_id)::integer AS t,
        sum(tsa.exam_binary_earned(s.public_snapshot->'interaction',k.key_snapshot,ans.value))::integer AS n
      FROM tsa.attempts a JOIN tsa.form_sections fs ON fs.form_id=a.form_id
      JOIN tsa.form_slots s ON s.form_id=fs.form_id AND s.section_id=fs.section_id
      JOIN tsa_private.form_slot_secrets k ON k.form_id=s.form_id AND k.slot_id=s.slot_id
      LEFT JOIN tsa.answers ans ON ans.attempt_id=a.id AND ans.form_id=s.form_id AND ans.slot_id=s.slot_id
      WHERE a.id=target_attempt GROUP BY fs.section_id,fs.section,fs.ordinal) totals;
  hundredths:=(10000::bigint*correct)/total+CASE WHEN 2*((10000::bigint*correct)%total)>=total THEN 1 ELSE 0 END;
  RETURN jsonb_build_object('correctCount',correct,'totalCount',total,
    'percentage',(hundredths/100)::text||'.'||lpad((hundredths%100)::text,2,'0'),'sections',sections,'items',items);
END;
$$;

CREATE FUNCTION tsa.exam_worker_claim(executor text,lease_seconds integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE j record; observed timestamptz; exhausted boolean;
BEGIN
  IF executor IS NULL OR executor !~ '^[!-~]{1,128}$' OR lease_seconds IS NULL OR lease_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Explicit valid executor and bounded lease required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO j FROM tsa.jobs WHERE kind='exam_grade_attempt' AND
    ((state IN('QUEUED','FAILED_RETRYABLE') AND available_at<=clock_timestamp() AND attempts<max_attempts)
      OR (state='RUNNING' AND lease_until<=clock_timestamp()))
    ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','IDLE'); END IF;
  observed:=clock_timestamp(); exhausted:=j.attempts>=j.max_attempts;
  UPDATE tsa.jobs SET state='RUNNING',lease_owner=executor,lease_token=lease_token+1,
    lease_until=observed+make_interval(secs=>lease_seconds),attempts=CASE WHEN exhausted THEN attempts ELSE attempts+1 END,
    last_error_code=CASE WHEN exhausted THEN 'LEASE_RETRY_EXHAUSTED' ELSE NULL END
    WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('status','CLAIMED','attemptId',j.attempt_id,'leaseToken',j.lease_token::text,
    'leaseUntil',tsa.exam_instant(j.lease_until),'dispatch',jsonb_build_object('schemaVersion','job-dispatch/1',
      'jobId',j.id,'kind',j.kind,'dedupKey',j.dedup_key,'payloadRef',j.payload_ref,'state',j.state));
END;
$$;

-- Shared lock order: Bank -> attempt -> job. Claims hold only a job lock.
CREATE FUNCTION tsa.exam_worker_lock(target_job uuid,executor text,token bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE j record; a record;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  SELECT * INTO j FROM tsa.jobs WHERE id=target_job AND kind='exam_grade_attempt';
  IF NOT FOUND THEN RETURN jsonb_build_object('status','LOST_LEASE'); END IF;
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=j.attempt_id FOR UPDATE;
  SELECT * INTO STRICT j FROM tsa.jobs WHERE id=target_job FOR UPDATE;
  IF j.state='SUCCEEDED' AND j.lease_token=token AND a.state='GRADED' THEN
    RETURN jsonb_build_object('status','ALREADY_DONE','attemptId',a.id,'scoreRunId',a.latest_score_id);
  END IF;
  IF j.state<>'RUNNING' OR j.lease_owner IS DISTINCT FROM executor OR j.lease_token IS DISTINCT FROM token
    OR j.lease_until<=clock_timestamp() THEN RETURN jsonb_build_object('status','LOST_LEASE'); END IF;
  -- Derive ownership from the leased attempt, never from request-supplied claims.
  PERFORM set_config('tsa.local_user_id',a.user_id::text,true);
  PERFORM tsa.student_attempt_delivery_state(a.id);
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=a.id;
  IF a.state IN('INVALIDATED','CANCELLED') THEN
    UPDATE tsa.jobs SET state='CANCELLED',lease_owner=NULL,lease_until=NULL,last_error_code='CONTENT_WITHDRAWN' WHERE id=j.id;
    RETURN jsonb_build_object('status','CANCELLED');
  END IF;
  IF a.state='GRADED' THEN
    UPDATE tsa.jobs SET state='SUCCEEDED',lease_owner=NULL,lease_until=NULL,last_error_code=NULL WHERE id=j.id;
    RETURN jsonb_build_object('status','ALREADY_DONE','attemptId',a.id,'scoreRunId',a.latest_score_id);
  END IF;
  IF a.state NOT IN('SUBMITTED','EXPIRED') OR j.last_error_code='LEASE_RETRY_EXHAUSTED' THEN
    UPDATE tsa.jobs SET state='FAILED_FINAL',lease_owner=NULL,lease_until=NULL,
      last_error_code=CASE WHEN j.last_error_code='LEASE_RETRY_EXHAUSTED' THEN j.last_error_code ELSE 'INVALID_GRADING_INPUT' END WHERE id=j.id;
    IF a.state IN('SUBMITTED','EXPIRED') THEN UPDATE tsa.attempts SET grading_status='FAILED_FINAL' WHERE id=a.id; END IF;
    RETURN jsonb_build_object('status','FAILED_FINAL');
  END IF;
  RETURN jsonb_build_object('status','READY','attemptId',a.id,'formId',a.form_id);
END;
$$;

CREATE FUNCTION tsa.exam_worker_load(target_job uuid,executor text,token bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE guard jsonb; j record; a record; result jsonb; policy text; input_hash text;
BEGIN
  guard:=tsa.exam_worker_lock(target_job,executor,token);
  IF guard->>'status'<>'READY' THEN RETURN guard; END IF;
  SELECT * INTO STRICT j FROM tsa.jobs WHERE id=target_job;
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=j.attempt_id;
  SELECT min(policy_version) INTO policy FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id;
  input_hash:=tsa.exam_grading_input_hash(a.id);
  IF policy IS DISTINCT FROM 'practice-binary-v1'
    OR EXISTS(SELECT 1 FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id AND policy_version<>policy)
    OR (SELECT policy_versions->>'scoring' FROM tsa.forms WHERE id=a.form_id) IS DISTINCT FROM policy
    OR (SELECT policy_versions->>'release' FROM tsa.forms WHERE id=a.form_id) IS DISTINCT FROM 'after-grade-v1' THEN
    RETURN jsonb_build_object('status','ERROR','code','INVALID_GRADING_INPUT');
  END IF;
  IF j.dedup_key IS DISTINCT FROM a.id::text||':'||policy||':'||input_hash OR j.payload_ref IS DISTINCT FROM 'attempt:'||a.id::text THEN
    RETURN jsonb_build_object('status','ERROR','code','DIGEST_MISMATCH');
  END IF;
  SELECT jsonb_build_object('status','READY','attemptId',a.id,'formId',a.form_id,'policyVersion',policy,'inputHash',input_hash,
    'slots',jsonb_agg(jsonb_build_object('slotId',s.slot_id,'sectionId',s.section_id,'section',fs.section,'ordinal',s.ordinal,
      'interaction',s.public_snapshot->'interaction','answerKey',k.key_snapshot,'response',ans.value) ORDER BY s.ordinal)) INTO result
    FROM tsa.form_slots s JOIN tsa.form_sections fs USING(form_id,section_id)
    JOIN tsa_private.form_slot_secrets k ON k.form_id=s.form_id AND k.slot_id=s.slot_id
    LEFT JOIN tsa.answers ans ON ans.attempt_id=a.id AND ans.form_id=s.form_id AND ans.slot_id=s.slot_id WHERE s.form_id=a.form_id;
  UPDATE tsa.attempts SET grading_status='RUNNING' WHERE id=a.id;
  IF j.lease_until<=clock_timestamp() THEN RETURN jsonb_build_object('status','LOST_LEASE'); END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION tsa.exam_worker_fail(target_job uuid,executor text,token bigint,error_code text,retry_seconds integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE guard jsonb; j record; final boolean;
BEGIN
  IF error_code IS NULL OR error_code NOT IN('INVALID_GRADING_INPUT','DIGEST_MISMATCH','GRADING_ERROR','TEMPORARILY_UNAVAILABLE')
    OR retry_seconds IS NULL OR retry_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'Valid code and bounded retry interval required' USING ERRCODE='22023';
  END IF;
  guard:=tsa.exam_worker_lock(target_job,executor,token);
  IF guard->>'status'<>'READY' THEN RETURN guard; END IF;
  SELECT * INTO STRICT j FROM tsa.jobs WHERE id=target_job;
  final:=j.attempts>=j.max_attempts OR error_code IN('INVALID_GRADING_INPUT','DIGEST_MISMATCH');
  UPDATE tsa.jobs SET state=CASE WHEN final THEN 'FAILED_FINAL'::tsa.job_state ELSE 'FAILED_RETRYABLE'::tsa.job_state END,
    lease_owner=NULL,lease_until=NULL,last_error_code=error_code,available_at=clock_timestamp()+make_interval(secs=>retry_seconds) WHERE id=j.id;
  UPDATE tsa.attempts SET grading_status=CASE WHEN final THEN 'FAILED_FINAL' ELSE 'FAILED_RETRYABLE' END WHERE id=j.attempt_id;
  INSERT INTO tsa.audit_events(id,service_actor,action,entity_type,entity_id,reason)
    VALUES(gen_random_uuid(),'EXAM:'||executor,'EXAM_GRADE_FAILED','attempt',j.attempt_id::text,error_code);
  RETURN jsonb_build_object('status',CASE WHEN final THEN 'FAILED_FINAL' ELSE 'FAILED_RETRYABLE' END);
END;
$$;

CREATE FUNCTION tsa.exam_worker_finish(target_job uuid,executor text,token bigint,computed jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE guard jsonb; j record; a record; expected jsonb; input_hash text; policy text; score_id uuid; item jsonb;
BEGIN
  guard:=tsa.exam_worker_lock(target_job,executor,token);
  IF guard->>'status'<>'READY' THEN RETURN guard; END IF;
  SELECT * INTO STRICT j FROM tsa.jobs WHERE id=target_job;
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=j.attempt_id;
  SELECT min(policy_version) INTO policy FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id;
  input_hash:=tsa.exam_grading_input_hash(a.id);
  IF policy IS DISTINCT FROM 'practice-binary-v1' OR j.dedup_key IS DISTINCT FROM a.id::text||':'||policy||':'||input_hash
    OR j.payload_ref IS DISTINCT FROM 'attempt:'||a.id::text
    OR EXISTS(SELECT 1 FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id AND policy_version<>policy)
    OR (SELECT policy_versions->>'scoring' FROM tsa.forms WHERE id=a.form_id) IS DISTINCT FROM policy
    OR (SELECT policy_versions->>'release' FROM tsa.forms WHERE id=a.form_id) IS DISTINCT FROM 'after-grade-v1' THEN
    RETURN jsonb_build_object('status','ERROR','code','DIGEST_MISMATCH');
  END IF;
  BEGIN expected:=tsa.exam_worker_expected(a.id);
  EXCEPTION WHEN invalid_parameter_value THEN RETURN jsonb_build_object('status','ERROR','code','INVALID_GRADING_INPUT'); END;
  IF computed IS DISTINCT FROM expected THEN RETURN jsonb_build_object('status','ERROR','code','INVALID_GRADING_INPUT'); END IF;
  score_id:=gen_random_uuid();
  BEGIN
    INSERT INTO tsa.score_runs(id,attempt_id,form_id,policy_version,input_hash,correct_count,total_count,percentage,section_totals)
      VALUES(score_id,a.id,a.form_id,policy,input_hash,(expected->>'correctCount')::integer,(expected->>'totalCount')::integer,
        (expected->>'percentage')::numeric,expected->'sections');
    FOR item IN SELECT value FROM jsonb_array_elements(expected->'items') LOOP
      INSERT INTO tsa.score_items(score_run_id,form_id,slot_id,earned)
        VALUES(score_id,a.form_id,(item->>'slotId')::uuid,(item->>'earned')::smallint);
    END LOOP;
    INSERT INTO tsa.result_releases(id,attempt_id,score_run_id,policy_version) VALUES(gen_random_uuid(),a.id,score_id,policy);
    UPDATE tsa.attempts SET state='GRADED',latest_score_id=score_id WHERE id=a.id;
    UPDATE tsa.jobs SET state='SUCCEEDED',lease_owner=NULL,lease_until=NULL,last_error_code=NULL WHERE id=j.id;
    INSERT INTO tsa.audit_events(id,service_actor,action,entity_type,entity_id,reason)
      VALUES(gen_random_uuid(),'EXAM:'||executor,'ATTEMPT_GRADED','attempt',a.id::text,'practice-binary-v1');
    IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Grade lease elapsed' USING ERRCODE='ZX003'; END IF;
  EXCEPTION WHEN SQLSTATE 'ZX003' THEN RETURN jsonb_build_object('status','LOST_LEASE'); END;
  RETURN jsonb_build_object('status','GRADED','attemptId',a.id,'scoreRunId',score_id);
END;
$$;

REVOKE ALL ON FUNCTION tsa.exam_binary_earned(jsonb,jsonb,jsonb),tsa.exam_worker_expected(uuid),tsa.exam_worker_lock(uuid,text,bigint),
  tsa.exam_worker_claim(text,integer),tsa.exam_worker_load(uuid,text,bigint),tsa.exam_worker_finish(uuid,text,bigint,jsonb),
  tsa.exam_worker_fail(uuid,text,bigint,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_worker_claim(text,integer),tsa.exam_worker_load(uuid,text,bigint),
  tsa.exam_worker_finish(uuid,text,bigint,jsonb),tsa.exam_worker_fail(uuid,text,bigint,text,integer) TO tsa_exam_worker;

CREATE FUNCTION tsa.guard_grade_commit_lease() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
BEGIN
  IF OLD.state='RUNNING' AND NEW.state='SUCCEEDED' AND OLD.kind='exam_grade_attempt'
    AND OLD.lease_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'Grade lease elapsed before commit' USING ERRCODE='40001';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION tsa.guard_grade_commit_lease() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER jobs_grade_commit_lease
  AFTER UPDATE ON tsa.jobs DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tsa.guard_grade_commit_lease();
