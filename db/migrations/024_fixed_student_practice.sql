-- Existing frozen fixed student mode. No form creation, raw grants or personal policy changes.
CREATE FUNCTION tsa_private.fixed_student_form(target_form uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE target record; availability record; now_at timestamptz;
BEGIN
 SELECT f.id,f.mode,f.owner_user_id,b.id AS blueprint_id,b.config INTO target
 FROM tsa_private.fixed_form_seals seal JOIN tsa.forms f ON f.id=seal.form_id
 JOIN tsa.blueprint_versions b ON b.id=f.blueprint_version_id WHERE f.id=$1;
 IF NOT FOUND OR target.mode<>'PUBLISHED_FIXED' OR target.owner_user_id IS NOT NULL
  OR NOT tsa.fixed_stock_blueprint_supported(target.blueprint_id)
  OR target.config->>'bundlePolicy' IS DISTINCT FROM 'ALL_OR_NONE'
  OR target.config->>'scoringPolicy' IS DISTINCT FROM 'practice-binary-v1'
  OR target.config->>'releasePolicy' IS DISTINCT FROM 'after-grade-v1' THEN
  RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND');
 END IF;
 SELECT * INTO availability FROM tsa.form_availability WHERE form_id=$1;
 IF NOT FOUND OR NOT tsa.bank_form_delivery_allowed($1) THEN
  RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE');
 END IF;
 now_at:=clock_timestamp();
 IF now_at>=availability.available_until THEN RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE'); END IF;
 IF now_at<availability.available_from THEN RETURN jsonb_build_object('status','ERROR','code','FORM_NOT_OPEN'); END IF;
 RETURN jsonb_build_object('status','READY','config',target.config,'entry',jsonb_build_object(
  'name',target.config->>'name','domain',target.config->'sections'->0->>'section',
  'questionCount',target.config->'sections'->0->'count','durationSeconds',target.config->'sections'->0->'durationSeconds',
  'profileKind','INDEPENDENT_PRACTICE','mode','PUBLISHED_FIXED','formId',$1,'repeatsAllowed',true,
  'availableFrom',tsa.exam_instant(availability.available_from),'availableUntil',tsa.exam_instant(availability.available_until)));
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.fixed_student_form(uuid) FROM PUBLIC;

CREATE FUNCTION tsa.exam_fixed_catalog_page(page_limit integer,after_form uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE candidates jsonb; result jsonb; next_id text;
BEGIN
 PERFORM tsa.assembly_candidate();
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 WITH observed AS MATERIALIZED (
  SELECT s.form_id,tsa_private.fixed_student_form(s.form_id) AS value FROM tsa_private.fixed_form_seals s
  WHERE after_form IS NULL OR s.form_id>after_form
 ), eligible AS (
  SELECT form_id,value FROM observed WHERE value->>'status'='READY' ORDER BY form_id LIMIT page_limit+1
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('id',form_id,'value',value) ORDER BY form_id),'[]'::jsonb) INTO candidates FROM eligible;
 IF jsonb_array_length(candidates)>page_limit THEN next_id:=candidates->(page_limit-1)->>'id'; END IF;
 SELECT COALESCE(jsonb_agg((item->'value')-'status' ORDER BY ord),'[]'::jsonb) INTO result
  FROM jsonb_array_elements(candidates) WITH ORDINALITY x(item,ord) WHERE ord<=page_limit;
 RETURN jsonb_build_object('items',result,'next',next_id);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_fixed_catalog_page(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_fixed_catalog_page(integer,uuid) TO tsa_exam;

CREATE FUNCTION tsa.exam_fixed_attempt_create(creation_key text,body_hash text,request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE who uuid:=tsa.assembly_candidate(); target_form uuid; outcome jsonb; form_state jsonb;
 a record; next_revision bigint; receipt jsonb; until_at timestamptz;
BEGIN
 IF jsonb_typeof(request) IS DISTINCT FROM 'object'
  OR request->>'mode' IS DISTINCT FROM 'PUBLISHED_FIXED' OR request->>'reuseMode' IS DISTINCT FROM 'FIXED_AS_PUBLISHED'
  OR request->'acknowledgeRepeats' IS DISTINCT FROM 'true'::jsonb
  OR NOT(request ?& ARRAY['mode','formId','reuseMode','acknowledgeRepeats'])
  OR request-ARRAY['mode','formId','reuseMode','acknowledgeRepeats'] IS DISTINCT FROM '{}'::jsonb THEN
  RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR');
 END IF;
 target_form:=(request->>'formId')::uuid;
 who:=tsa.assembly_user_lock();
 outcome:=tsa.assembly_receipt(creation_key,body_hash);
 IF outcome IS NOT NULL THEN RETURN outcome; END IF;
 outcome:=tsa.assembly_active_state(false);
 IF outcome->>'status'<>'READY' THEN RETURN outcome; END IF;
 -- H1 holds the per-user row and shared publication/bank guard; availability
 -- edits must also finish before authoritative admission is evaluated.
 PERFORM availability_row.form_id FROM tsa.form_availability availability_row WHERE availability_row.form_id=target_form FOR SHARE;
 PERFORM tsa.assembly_candidate();
 form_state:=tsa_private.fixed_student_form(target_form);
 IF form_state->>'status'<>'READY' THEN RETURN form_state; END IF;
 until_at:=(form_state->'entry'->>'availableUntil')::timestamptz;
 BEGIN
 INSERT INTO tsa.attempts(id,user_id,form_id,form_mode,reuse_mode,reuse_policy_version,
  created_at,admission_until_at_creation,start_before_at)
 VALUES(gen_random_uuid(),who,target_form,'PUBLISHED_FIXED','FIXED_AS_PUBLISHED','reuse/1',
  clock_timestamp(),until_at,clock_timestamp()+interval '600 seconds') RETURNING * INTO a;
 EXCEPTION WHEN check_violation THEN
  form_state:=tsa_private.fixed_student_form(target_form);
  IF form_state->>'status'<>'READY' THEN RETURN form_state; END IF;
  RAISE;
 END;
 INSERT INTO tsa.student_question_history(user_id,question_id,first_attempt_id)
  SELECT who,s.question_id,a.id FROM tsa.form_slots s WHERE s.form_id=target_form ORDER BY s.question_id
  ON CONFLICT(user_id,question_id) DO NOTHING;
 UPDATE tsa.student_allocation_state SET revision=revision+1,updated_at=clock_timestamp()
  WHERE user_id=who RETURNING revision INTO next_revision;
 receipt:=jsonb_build_object('attemptId',a.id,'formId',a.form_id,'state','CREATED','domain',form_state->'entry'->>'domain',
  'formMode','PUBLISHED_FIXED','reuseMode','FIXED_AS_PUBLISHED','reusePolicyVersion','reuse/1','startBefore',tsa.exam_instant(a.start_before_at));
 INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
  VALUES(gen_random_uuid(),who,'POST /api/v1/attempts',creation_key,body_hash,201,receipt,a.id,a.id);
 INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,before_revision,after_revision)
  VALUES(gen_random_uuid(),who,'FIXED_ATTEMPT_ASSIGNED','attempt',a.id::text,next_revision-1,next_revision);
 RETURN jsonb_build_object('status','CREATED','receipt',receipt);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_fixed_attempt_create(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_fixed_attempt_create(text,text,jsonb) TO tsa_exam;
