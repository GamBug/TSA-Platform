-- Trusted examination service commands. No raw allocation-table grants, no
-- publication authority and no change to frozen student contracts.
CREATE FUNCTION tsa.assembly_candidate() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid;
BEGIN
  who:=nullif(current_setting('tsa.local_user_id',true),'')::uuid;
  IF NOT EXISTS(SELECT 1 FROM tsa.users u JOIN tsa.user_roles r ON r.user_id=u.id
    WHERE u.id=who AND u.disabled_at IS NULL AND r.role='CANDIDATE') THEN
    RAISE EXCEPTION 'Candidate context required' USING ERRCODE='42501';
  END IF;
  RETURN who;
END;
$$;
CREATE FUNCTION tsa.assembly_user_lock() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate();
BEGIN
  INSERT INTO tsa.student_allocation_state(user_id) VALUES(who) ON CONFLICT(user_id) DO NOTHING;
  PERFORM user_id FROM tsa.student_allocation_state WHERE user_id=who FOR UPDATE;
  RETURN who;
END;
$$;
CREATE FUNCTION tsa.assembly_receipt(creation_key text,body_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); r record;
BEGIN
  IF creation_key IS NULL OR creation_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR');
  END IF;
  -- Plain read: finalization locks attempt before updating retention receipts.
  SELECT * INTO r FROM tsa.idempotency_records WHERE actor_id=who
    AND route_scope='POST /api/v1/attempts' AND idempotency_key=creation_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.request_hash<>body_hash THEN RETURN jsonb_build_object('status','ERROR','code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('status','REPLAY','receipt',r.safe_response);
END;
$$;
CREATE FUNCTION tsa.assembly_offering_state(target_blueprint uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE o record;
BEGIN
  PERFORM tsa.assembly_candidate();
  IF NOT EXISTS(SELECT 1 FROM tsa.blueprint_versions WHERE id=target_blueprint) THEN
    RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND');
  END IF;
  SELECT * INTO o FROM tsa.blueprint_offerings WHERE blueprint_version_id=target_blueprint;
  IF NOT FOUND OR NOT o.enabled OR clock_timestamp()>=o.available_until THEN
    RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE');
  END IF;
  IF clock_timestamp()<o.available_from THEN RETURN jsonb_build_object('status','ERROR','code','FORM_NOT_OPEN'); END IF;
  RETURN jsonb_build_object('status','READY');
END;
$$;

-- Internal, versioned ordered SQL grading-input digest. Answers/keys are never
-- returned by reconciliation. The future grader must use this exact function.
CREATE FUNCTION tsa.exam_grading_input_hash(target_attempt uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
  SELECT 'sha256:'||encode(sha256(convert_to(jsonb_build_object(
    'schemaVersion','grading-input/sql-jsonb-1','attemptId',a.id,'formId',a.form_id,
    'slots',(SELECT jsonb_agg(jsonb_build_object('slotId',s.slot_id,'ordinal',s.ordinal,
      'key',k.key_snapshot,'policy',k.policy_version,'answer',ans.value) ORDER BY s.ordinal)
      FROM tsa.form_slots s JOIN tsa_private.form_slot_secrets k USING(form_id,slot_id)
      LEFT JOIN tsa.answers ans ON ans.attempt_id=a.id AND ans.form_id=s.form_id AND ans.slot_id=s.slot_id
      WHERE s.form_id=a.form_id))::text,'UTF8')),'hex') FROM tsa.attempts a WHERE a.id=target_attempt
$$;
CREATE FUNCTION tsa.assembly_active_state(reconcile boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); a record; permitted boolean; input_hash text; policy text;
BEGIN
  -- Caller has already locked the user's allocation row.
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  SELECT * INTO a FROM tsa.attempts WHERE user_id=who AND state IN('CREATED','IN_PROGRESS') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','READY'); END IF;
  permitted:=tsa.bank_form_delivery_allowed(a.form_id);
  IF NOT permitted OR (a.state='CREATED' AND clock_timestamp()>=a.start_before_at)
    OR (a.state='IN_PROGRESS' AND clock_timestamp()>=a.deadline_at) THEN
    IF NOT reconcile THEN RETURN jsonb_build_object('status','RECONCILE'); END IF;
    IF NOT permitted THEN
      PERFORM tsa.student_attempt_delivery_state(a.id);
    ELSIF a.state='CREATED' THEN
      UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='START_TTL_EXPIRED' WHERE id=a.id;
    ELSE
      UPDATE tsa.attempts SET state='EXPIRED' WHERE id=a.id;
      input_hash:=tsa.exam_grading_input_hash(a.id);
      SELECT policy_version INTO STRICT policy FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id LIMIT 1;
      INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
        VALUES(gen_random_uuid(),'exam_grade_attempt',a.id::text||':'||policy||':'||input_hash,
          'attempt:'||a.id::text,a.id);
    END IF;
    INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
      VALUES(gen_random_uuid(),who,'ALLOCATION_ACTIVE_RECONCILED','attempt',a.id::text,'Stored deadline or delivery restriction');
    RETURN jsonb_build_object('status','READY');
  END IF;
  RETURN jsonb_build_object('status','ACTIVE','attemptId',a.id);
END;
$$;
CREATE FUNCTION tsa.assembly_creation_check(creation_key text,body_hash text,target_blueprint uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid; outcome jsonb;
BEGIN
  who:=tsa.assembly_user_lock();
  outcome:=tsa.assembly_receipt(creation_key,body_hash);
  IF outcome IS NOT NULL THEN RETURN outcome; END IF;
  outcome:=tsa.assembly_active_state(true);
  IF outcome->>'status'<>'READY' THEN RETURN outcome; END IF;
  IF target_blueprint IS NOT NULL THEN RETURN tsa.assembly_offering_state(target_blueprint); END IF;
  RETURN outcome;
END;
$$;

CREATE FUNCTION tsa.assembly_snapshot_inputs(version_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE who uuid:=tsa.assembly_candidate(); result jsonb;
BEGIN
  IF cardinality(version_ids)>200 THEN RAISE EXCEPTION 'Too many snapshot inputs' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('questionVersionId',v.id,'questionId',v.question_id,
    'content',v.content,'interaction',v.interaction,'answerKey',s.answer_key,'explanation',s.explanation,
    'policyVersion',s.scoring_policy_version) ORDER BY v.id),'[]'::jsonb) INTO result
    FROM tsa.question_versions v JOIN tsa_private.question_secrets s ON s.question_version_id=v.id
    WHERE v.id=ANY(version_ids) AND v.stimulus_version_id IS NULL AND tsa.bank_question_selection_allowed(v.id);
  RETURN result;
END;
$$;

CREATE FUNCTION tsa.assembly_commit_personal(creation_key text,body_hash text,plan jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE
  who uuid; outcome jsonb; m jsonb:=plan->'manifest'; stock jsonb; b record; o record;
  selected jsonb:=plan->'result'->'slots'; slot jsonb; snap jsonb; item jsonb; quota jsonb;
  captured_members jsonb; fresh_members jsonb; rights_pins jsonb; current_rights jsonb;
  run_id uuid:=(plan->>'runId')::uuid; form_id uuid:=(plan->>'formId')::uuid;
  attempt_id uuid:=(plan->>'attemptId')::uuid; version_ids uuid[]; section_id text;
  form_projection jsonb; n integer; expected integer; contribution integer; next_revision bigint; a record; receipt jsonb;
BEGIN
  who:=tsa.assembly_user_lock();
  outcome:=tsa.assembly_receipt(creation_key,body_hash);
  IF outcome IS NOT NULL THEN RETURN outcome; END IF;
  outcome:=tsa.assembly_active_state(false);
  IF outcome->>'status'<>'READY' THEN RETURN outcome; END IF;
  outcome:=tsa.assembly_offering_state((m->>'blueprintVersionId')::uuid);
  IF outcome->>'status'<>'READY' THEN RETURN outcome; END IF;
  SELECT * INTO b FROM tsa.blueprint_versions WHERE id=(m->>'blueprintVersionId')::uuid;
  SELECT * INTO o FROM tsa.blueprint_offerings WHERE blueprint_version_id=b.id FOR SHARE;
  -- Admission may have changed while waiting for the offering row lock.
  outcome:=tsa.assembly_offering_state(b.id);
  IF outcome->>'status'<>'READY' THEN RETURN outcome; END IF;
  IF m->>'bankRevision' IS DISTINCT FROM (SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1)
    OR plan->>'historyRevision' IS DISTINCT FROM (SELECT revision::text FROM tsa.student_allocation_state WHERE user_id=who)
    OR plan->>'offeringRevision' IS DISTINCT FROM o.revision::text THEN RETURN jsonb_build_object('status','STALE'); END IF;
  IF m->>'schemaVersion' IS DISTINCT FROM 'assembly-manifest/1' OR m->>'algorithmVersion' IS DISTINCT FROM 'assembly/1'
    OR m->>'reuseMode' IS DISTINCT FROM 'NEW_ONLY' OR m->'blueprint' IS DISTINCT FROM b.config
    OR m->>'blueprintHash' IS DISTINCT FROM b.content_hash OR jsonb_array_length(b.config->'sections')<>1 THEN
    RAISE EXCEPTION 'Invalid allocation manifest' USING ERRCODE='22023';
  END IF;
  section_id:=b.config->'sections'->0->>'id'; expected:=(b.config->'sections'->0->>'count')::integer;
  IF expected<>(CASE b.config->'sections'->0->>'section' WHEN 'MATH' THEN 4 WHEN 'READING' THEN 2 WHEN 'SCIENCE' THEN 4 ELSE 0 END)
    OR (b.config->'sections'->0->>'durationSeconds')::integer NOT BETWEEN 1 AND 21600
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(b.config->'quotas') q
      WHERE q->>'dimension'='SKILL' AND NOT EXISTS(SELECT 1 FROM tsa.taxonomy_nodes t
        WHERE t.id=(q->>'value')::uuid AND t.taxonomy_version_id=b.taxonomy_version_id AND t.kind='SKILL')) THEN
    RAISE EXCEPTION 'Invalid MVP blueprint' USING ERRCODE='22023';
  END IF;
  stock:=tsa.assembly_standalone_stock(b.id);
  IF stock IS NULL THEN RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE'); END IF;
  -- Recheck the full captured pool, including expiry without a revision change.
  -- Lifetime analytics may advance when a different student seals a form; those
  -- counts remain the captured solver ranking inputs, never a global reservation.
  SELECT COALESCE(jsonb_agg(member-'exposureCount' ORDER BY member->>'versionId'),'[]'::jsonb) INTO captured_members
    FROM jsonb_array_elements(m->'units') u CROSS JOIN LATERAL jsonb_array_elements(u->'members') member;
  SELECT COALESCE(jsonb_agg(member-'exposureCount' ORDER BY member->>'versionId'),'[]'::jsonb) INTO fresh_members
    FROM jsonb_array_elements(stock->'candidates') member;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb)
    INTO rights_pins FROM jsonb_array_elements(m->'rightsVersions') r;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb)
    INTO current_rights FROM jsonb_array_elements(stock->'rightsVersions') r;
  IF captured_members IS DISTINCT FROM fresh_members OR rights_pins IS DISTINCT FROM current_rights
    OR m->'historyQuestionIds' IS DISTINCT FROM stock->'historyQuestionIds'
    OR m->'historyGroupIds' IS DISTINCT FROM stock->'historyGroupIds'
    OR m->'conflicts' IS DISTINCT FROM stock->'conflicts' THEN RETURN jsonb_build_object('status','STALE'); END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(m->'units') u WHERE jsonb_array_length(u->'members')<>1
      OR u->>'id' IS DISTINCT FROM u->'members'->0->>'versionId' OR u->>'sectionId' IS DISTINCT FROM section_id) THEN
    RAISE EXCEPTION 'Standalone units required' USING ERRCODE='22023';
  END IF;
  IF plan->'result'->>'status'='FAILURE' THEN
    IF plan->'result'->>'code' NOT IN('INSUFFICIENT_ELIGIBLE_INVENTORY','INSUFFICIENT_UNSEEN_INVENTORY','SEARCH_EXHAUSTED','CONSTRAINT_CONFLICT') THEN
      RAISE EXCEPTION 'Invalid assembly outcome' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('status','FAILURE','code',plan->'result'->>'code');
  END IF;
  IF plan->'result'->>'status' IS DISTINCT FROM 'SUCCESS' OR jsonb_array_length(selected)<>expected
    OR jsonb_array_length(plan->'snapshots')<>expected OR run_id IS NULL OR form_id IS NULL OR attempt_id IS NULL THEN
    RAISE EXCEPTION 'Incomplete allocation plan' USING ERRCODE='22023';
  END IF;
  SELECT array_agg((s->>'questionVersionId')::uuid ORDER BY s->>'questionVersionId') INTO version_ids FROM jsonb_array_elements(selected) s;
  IF (SELECT count(DISTINCT x) FROM unnest(version_ids) x)<>expected
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE s->>'sectionId' IS DISTINCT FROM section_id
      OR s->>'unitId' IS DISTINCT FROM s->>'questionVersionId'
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'candidates') c WHERE c->>'versionId'=s->>'questionVersionId'
        AND c->>'questionId'=s->>'questionId' AND c->>'contentHash'=s->>'contentHash'))
    OR (SELECT count(DISTINCT s->>'ordinal') FROM jsonb_array_elements(selected) s)<>expected
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE (s->>'ordinal')::integer NOT BETWEEN 0 AND expected-1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'candidates') c JOIN tsa.student_question_history h ON h.user_id=who
      LEFT JOIN tsa.duplicate_group_members hm ON hm.question_id=h.question_id
      WHERE (c->>'versionId')::uuid=ANY(version_ids) AND (h.question_id::text=c->>'questionId' OR hm.group_id::text=c->>'groupId'))
    OR (SELECT count(DISTINCT c->>'groupId') FROM jsonb_array_elements(stock->'candidates') c WHERE (c->>'versionId')::uuid=ANY(version_ids))<>expected
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'conflicts') c WHERE (c->>'leftUnitId')::uuid=ANY(version_ids) AND (c->>'rightUnitId')::uuid=ANY(version_ids)) THEN
    RAISE EXCEPTION 'Selected identities, history or conflicts invalid' USING ERRCODE='23514';
  END IF;
  FOR quota IN SELECT value FROM jsonb_array_elements(b.config->'quotas') LOOP
    SELECT count(*) INTO contribution FROM jsonb_array_elements(stock->'candidates') c
      WHERE (c->>'versionId')::uuid=ANY(version_ids) AND CASE quota->>'dimension'
        WHEN 'SKILL' THEN c->'skillIds' ? (quota->>'value')
        WHEN 'COGNITIVE_LEVEL' THEN c->>'cognitiveLevel'=quota->>'value'
        WHEN 'DIFFICULTY' THEN c->>'difficulty'=quota->>'value' ELSE false END;
    IF contribution<(quota->>'min')::integer OR contribution>(quota->>'max')::integer THEN
      RAISE EXCEPTION 'Selected quota invalid' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF b.config->'maxPerSource'<>'null'::jsonb AND EXISTS(
    SELECT source FROM jsonb_array_elements(stock->'candidates') c CROSS JOIN LATERAL jsonb_array_elements_text(c->'sourceIds') source
    WHERE (c->>'versionId')::uuid=ANY(version_ids) GROUP BY source HAVING count(*)>(b.config->>'maxPerSource')::integer) THEN
    RAISE EXCEPTION 'Source cap exceeded' USING ERRCODE='23514';
  END IF;
  IF (plan->>'manifestBytes')::jsonb IS DISTINCT FROM m
    OR plan->>'manifestHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(plan->>'manifestBytes','UTF8')),'hex')
    OR (plan->>'formBytes')::jsonb->>'mode' IS DISTINCT FROM 'PERSONALIZED_PRACTICE'
    OR (plan->>'formBytes')::jsonb->>'ownerUserId' IS DISTINCT FROM who::text
    OR plan->>'formHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(plan->>'formBytes','UTF8')),'hex') THEN
    RAISE EXCEPTION 'Allocation bytes/hash mismatch' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_build_object('schemaVersion','sealed-form/1','id',form_id,'blueprintVersionId',b.id,
    'mode','PERSONALIZED_PRACTICE','ownerUserId',who,
    'policyVersions',jsonb_build_object('scoring',b.config->>'scoringPolicy','release',b.config->>'releasePolicy'),
    'sections',b.config->'sections','slots',(SELECT jsonb_agg(jsonb_build_object(
      'slotId',psnap->'slotId','questionId',pslot->'questionId','questionVersionId',pslot->'questionVersionId',
      'sectionId',pslot->'sectionId','ordinal',(pslot->>'ordinal')::integer+1,
      'publicHash',psnap->'publicHash','privateHash',psnap->'privateHash') ORDER BY (pslot->>'ordinal')::integer)
      FROM jsonb_array_elements(selected) pslot JOIN jsonb_array_elements(plan->'snapshots') psnap
        ON psnap->>'questionVersionId'=pslot->>'questionVersionId')) INTO form_projection;
  IF (plan->>'formBytes')::jsonb IS DISTINCT FROM form_projection THEN
    RAISE EXCEPTION 'Form hash projection mismatch' USING ERRCODE='22023';
  END IF;
  INSERT INTO tsa.assembly_runs(id,blueprint_version_id,user_id,form_mode,reuse_mode,history_revision,bank_revision,
    request_hash,seed,algorithm_version,limits,manifest,manifest_hash,outcome,diagnostics)
    VALUES(run_id,b.id,who,'PERSONALIZED_PRACTICE','NEW_ONLY',(plan->>'historyRevision')::bigint,m->>'bankRevision',body_hash,
      (m->>'seed')::bigint,'assembly/1',m->'limits',m,plan->>'manifestHash','SUCCESS',jsonb_build_object('slotsHash',plan->'result'->>'slotsHash'));
  INSERT INTO tsa.forms(id,assembly_run_id,blueprint_version_id,mode,owner_user_id,content_hash,policy_versions,sealed_at)
    VALUES(form_id,run_id,b.id,'PERSONALIZED_PRACTICE',who,plan->>'formHash',
      jsonb_build_object('scoring',b.config->>'scoringPolicy','release',b.config->>'releasePolicy'),clock_timestamp());
  INSERT INTO tsa.form_sections(form_id,section_id,section,ordinal,duration_seconds,question_count)
    VALUES(form_id,section_id,(b.config->'sections'->0->>'section')::tsa.question_section,0,
      (b.config->'sections'->0->>'durationSeconds')::integer,expected);
  FOR slot IN SELECT value FROM jsonb_array_elements(selected) ORDER BY (value->>'ordinal')::integer LOOP
    SELECT value INTO STRICT snap FROM jsonb_array_elements(plan->'snapshots') WHERE value->>'questionVersionId'=slot->>'questionVersionId';
    IF (snap->>'publicBytes')::jsonb IS DISTINCT FROM snap->'publicSnapshot'
      OR (snap->>'privateBytes')::jsonb IS DISTINCT FROM snap->'privateSnapshot'
      OR snap->>'publicHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(snap->>'publicBytes','UTF8')),'hex')
      OR snap->>'privateHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(snap->>'privateBytes','UTF8')),'hex') THEN
      RAISE EXCEPTION 'Snapshot bytes/hash mismatch' USING ERRCODE='22023';
    END IF;
    INSERT INTO tsa.form_slots(form_id,slot_id,section_id,ordinal,question_id,question_version_id,public_snapshot,snapshot_hash)
      VALUES(form_id,(snap->>'slotId')::uuid,section_id,(slot->>'ordinal')::integer+1,(slot->>'questionId')::uuid,
        (slot->>'questionVersionId')::uuid,snap->'publicSnapshot',snap->>'publicHash');
    INSERT INTO tsa_private.form_slot_secrets(form_id,slot_id,key_snapshot,explanation_snapshot,policy_version,secret_hash)
      VALUES(form_id,(snap->>'slotId')::uuid,snap->'privateSnapshot'->'answerKey',snap->'privateSnapshot'->'explanation',
        snap->'privateSnapshot'->>'policyVersion',snap->>'privateHash');
  END LOOP;
  -- Existing deferred guard independently compares every public/private snapshot
  -- with its immutable source version and section counts with the blueprint.
  PERFORM tsa.assert_form_integrity(form_id);
  INSERT INTO tsa.form_availability(form_id,available_from,available_until) VALUES(form_id,o.available_from,o.available_until);
  INSERT INTO tsa.attempts(id,user_id,form_id,form_mode,reuse_mode,reuse_policy_version,created_at,admission_until_at_creation,start_before_at)
    VALUES(attempt_id,who,form_id,'PERSONALIZED_PRACTICE','NEW_ONLY','reuse/1',clock_timestamp(),o.available_until,o.available_until)
    RETURNING * INTO a;
  INSERT INTO tsa.student_question_history(user_id,question_id,first_attempt_id)
    SELECT who,(s->>'questionId')::uuid,attempt_id FROM jsonb_array_elements(selected) s;
  UPDATE tsa.student_allocation_state SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=who RETURNING revision INTO next_revision;
  receipt:=jsonb_build_object('attemptId',attempt_id,'formId',form_id,'state','CREATED','domain',b.config->'sections'->0->>'section',
    'formMode','PERSONALIZED_PRACTICE','reuseMode','NEW_ONLY','reusePolicyVersion','reuse/1',
    'startBefore',to_char(a.start_before_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
    VALUES(gen_random_uuid(),who,'POST /api/v1/attempts',creation_key,body_hash,201,receipt,attempt_id,attempt_id);
  INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,before_revision,after_revision)
    VALUES(gen_random_uuid(),who,'ATTEMPT_ALLOCATED','attempt',attempt_id::text,next_revision-1,next_revision);
  RETURN jsonb_build_object('status','CREATED','receipt',receipt);
END;
$$;
REVOKE ALL ON FUNCTION tsa.assembly_candidate(),tsa.assembly_user_lock(),tsa.assembly_receipt(text,text),
  tsa.assembly_offering_state(uuid),tsa.exam_grading_input_hash(uuid),tsa.assembly_active_state(boolean),
  tsa.assembly_creation_check(text,text,uuid),tsa.assembly_snapshot_inputs(uuid[]),tsa.assembly_commit_personal(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.assembly_offering_state(uuid),tsa.assembly_receipt(text,text),tsa.assembly_creation_check(text,text,uuid),tsa.assembly_snapshot_inputs(uuid[]),
  tsa.assembly_commit_personal(text,text,jsonb) TO tsa_exam;
