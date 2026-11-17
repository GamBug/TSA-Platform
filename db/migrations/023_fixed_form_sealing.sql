-- Additive local fixed sealing. No candidate impersonation, history or student delivery.
CREATE TABLE tsa_private.fixed_form_seals (
 form_id uuid PRIMARY KEY REFERENCES tsa.forms(id) ON DELETE RESTRICT,
 assembly_run_id uuid UNIQUE NOT NULL REFERENCES tsa.assembly_runs(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND pg_column_size(receipt)<=65536
   AND receipt->>'formId'=form_id::text AND receipt->>'assemblyRunId'=assembly_run_id::text)
);
CREATE TRIGGER fixed_form_seals_immutable BEFORE UPDATE OR DELETE ON tsa_private.fixed_form_seals
 FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
REVOKE ALL ON tsa_private.fixed_form_seals FROM PUBLIC,tsa_bank,tsa_web,tsa_exam,tsa_identity,tsa_factory;
CREATE POLICY fixed_seal_receipt_scope ON tsa.idempotency_records FOR ALL TO tsa_bank
 USING(actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid
   AND related_attempt_id IS NULL AND route_scope='POST /api/v1/assemblies' AND tsa.fixed_stock_exam_actor(actor_id))
 WITH CHECK(actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid
   AND related_attempt_id IS NULL AND route_scope='POST /api/v1/assemblies' AND tsa.fixed_stock_exam_actor(actor_id));
CREATE POLICY fixed_seal_receipt_current_role ON tsa.idempotency_records AS RESTRICTIVE FOR ALL TO tsa_bank
 USING(route_scope<>'POST /api/v1/assemblies' OR tsa.fixed_stock_exam_actor(actor_id))
 WITH CHECK(route_scope<>'POST /api/v1/assemblies' OR tsa.fixed_stock_exam_actor(actor_id));

CREATE FUNCTION tsa.fixed_seal_inputs(actor_id uuid,version_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE result jsonb;
BEGIN
 IF NOT tsa.fixed_stock_exam_actor($1) THEN RAISE EXCEPTION 'Exam manager required' USING ERRCODE='42501'; END IF;
 IF cardinality($2) NOT BETWEEN 1 AND 200 OR $2 IS NULL THEN RAISE EXCEPTION 'Invalid snapshot set' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('questionVersionId',v.id,'questionId',v.question_id,
  'content',v.content,'interaction',v.interaction,'answerKey',s.answer_key,'explanation',s.explanation,
  'policyVersion',s.scoring_policy_version,'stimulus',CASE WHEN sv.id IS NULL THEN 'null'::jsonb
   ELSE jsonb_build_object('id',sv.stimulus_id,'content',sv.content) END) ORDER BY v.id),'[]'::jsonb) INTO result
 FROM tsa.question_versions v JOIN tsa_private.question_secrets s ON s.question_version_id=v.id
 LEFT JOIN tsa.stimulus_versions sv ON sv.id=v.stimulus_version_id
 WHERE v.id=ANY($2) AND tsa.bank_question_selection_allowed(v.id);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION tsa.fixed_seal_inputs(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_seal_inputs(uuid,uuid[]) TO tsa_bank;

CREATE FUNCTION tsa.fixed_seal_commit(actor_id uuid,body_hash text,plan jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE
 m jsonb:=plan->'manifest'; b record; stock jsonb; selected jsonb:=plan->'result'->'slots';
 run_id uuid:=(plan->>'runId')::uuid; form_id uuid:=(plan->>'formId')::uuid;
 captured_at timestamptz:=(plan->>'capturedAt')::timestamptz;
 available_until timestamptz:=(plan->>'availableUntil')::timestamptz;
 required_through timestamptz:=(plan->>'requiredThrough')::timestamptz;
 window_minutes integer:=(plan->>'windowMinutes')::integer;
 sealed_at timestamptz; expected integer; section_id text; version_ids uuid[];
 captured_members jsonb; fresh_members jsonb; form_projection jsonb; receipt jsonb;
 slot jsonb; snap jsonb; quota jsonb; contribution integer;
BEGIN
 IF NOT tsa.fixed_stock_exam_actor($1) THEN RAISE EXCEPTION 'Exam manager required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(1414742321,1);
 PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
 SELECT * INTO b FROM tsa.blueprint_versions WHERE id=(m->>'blueprintVersionId')::uuid;
 IF NOT FOUND OR NOT tsa.fixed_stock_blueprint_supported(b.id) THEN RAISE EXCEPTION 'Unsupported blueprint' USING ERRCODE='22023'; END IF;
 IF captured_at IS NULL OR available_until IS NULL OR required_through IS NULL OR window_minutes IS NULL
   OR NOT isfinite(captured_at) OR NOT isfinite(available_until) OR NOT isfinite(required_through)
   OR window_minutes NOT BETWEEN 1 AND 1440 OR captured_at<transaction_timestamp() OR captured_at>clock_timestamp()
   OR available_until<>captured_at+make_interval(mins=>window_minutes)
   OR required_through<>available_until+make_interval(secs=>600+(b.config->'sections'->0->>'durationSeconds')::integer)
   OR clock_timestamp()>=available_until THEN RAISE EXCEPTION 'Invalid sealing window' USING ERRCODE='22023'; END IF;
 stock:=tsa_private.fixed_stock_pool(b.id,captured_at,required_through);
 IF stock->>'overflow' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Stock overflow' USING ERRCODE='54000'; END IF;
 IF m->>'schemaVersion' IS DISTINCT FROM 'fixed-assembly-manifest/1' OR m->>'algorithmVersion' IS DISTINCT FROM 'assembly/1'
   OR m->>'formMode' IS DISTINCT FROM 'PUBLISHED_FIXED' OR m->>'reuseMode' IS DISTINCT FROM 'FIXED_AS_PUBLISHED'
   OR m ?| ARRAY['historyQuestionIds','historyGroupIds','userId','historyRevision']
   OR m->'blueprint' IS DISTINCT FROM b.config OR m->>'blueprintHash' IS DISTINCT FROM b.content_hash
   OR m->>'bankRevision' IS DISTINCT FROM stock->>'bankRevision'
   OR m->'conflicts' IS DISTINCT FROM stock->'conflicts'
   OR m->'limits' IS DISTINCT FROM '{"maxNodes":50000,"maxUnits":2000}'::jsonb
   OR (m->>'seed')::bigint NOT BETWEEN 0 AND 4294967295 THEN RAISE EXCEPTION 'Invalid fixed manifest' USING ERRCODE='40001'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u->'id','sectionId',u->'sectionId',
  'members',(SELECT jsonb_agg(member-'exposureCount' ORDER BY ord) FROM jsonb_array_elements(u->'members') WITH ORDINALITY x(member,ord))) ORDER BY u->>'id'),'[]'::jsonb)
  INTO captured_members FROM jsonb_array_elements(m->'units') u;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u->'id','sectionId',u->'sectionId',
  'members',(SELECT jsonb_agg(member-'exposureCount' ORDER BY ord) FROM jsonb_array_elements(u->'members') WITH ORDINALITY x(member,ord))) ORDER BY u->>'id'),'[]'::jsonb)
  INTO fresh_members FROM jsonb_array_elements(stock->'units') u;
 IF captured_members IS DISTINCT FROM fresh_members OR
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb) FROM jsonb_array_elements(m->'rightsVersions') r)
  IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb) FROM jsonb_array_elements(stock->'rightsVersions') r)
 THEN RAISE EXCEPTION 'Stale fixed stock' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(plan->'rightsSnapshots') IS DISTINCT FROM 'array'
  OR jsonb_array_length(plan->'rightsSnapshots')<>jsonb_array_length(m->'rightsVersions')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(m->'rightsVersions') pin WHERE NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(plan->'rightsSnapshots') raw
    JOIN jsonb_array_elements(stock->'rightsVersions') current_pin ON current_pin->>'sourceId'=raw->>'sourceId' AND current_pin->>'versionId'=raw->>'versionId'
   WHERE raw->>'sourceId'=pin->>'sourceId' AND raw->>'versionId'=pin->>'versionId'
    AND (raw->>'decisionBytes')::jsonb=current_pin->'decision'
    AND pin->>'contentHash'='sha256:'||encode(sha256(convert_to(raw->>'decisionBytes','UTF8')),'hex')))
 THEN RAISE EXCEPTION 'Rights snapshot hash mismatch' USING ERRCODE='22023'; END IF;
 stock:=stock||jsonb_build_object('candidates',(SELECT COALESCE(jsonb_agg(member),'[]'::jsonb) FROM jsonb_array_elements(stock->'units') u CROSS JOIN LATERAL jsonb_array_elements(u->'members') member));
 section_id:=b.config->'sections'->0->>'id'; expected:=(b.config->'sections'->0->>'count')::integer;
 IF jsonb_typeof(plan->'result') IS DISTINCT FROM 'object'
   OR NOT (plan->'result' ?& ARRAY['status','manifestHash','visitedNodes','slots','slotsHash'])
   OR jsonb_typeof(plan->'result'->'visitedNodes') IS DISTINCT FROM 'number'
   OR (plan->>'slotsBytes')::jsonb IS DISTINCT FROM selected
   OR plan->'result'->>'slotsHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(plan->>'slotsBytes','UTF8')),'hex')
   OR ((plan->'result') - ARRAY['status','manifestHash','visitedNodes','slots','slotsHash']) IS DISTINCT FROM '{}'::jsonb
   OR (plan->'result'->>'visitedNodes')::integer NOT BETWEEN 0 AND 50000
   OR plan->'result'->>'status' IS DISTINCT FROM 'SUCCESS' OR plan->'result'->>'manifestHash' IS DISTINCT FROM plan->>'manifestHash'
   OR jsonb_typeof(selected) IS DISTINCT FROM 'array' OR jsonb_array_length(selected)<>expected
   OR jsonb_typeof(plan->'snapshots') IS DISTINCT FROM 'array' OR jsonb_array_length(plan->'snapshots')<>expected
   OR run_id IS NULL OR form_id IS NULL THEN RAISE EXCEPTION 'Incomplete fixed seal' USING ERRCODE='22023'; END IF;
  SELECT array_agg((s->>'questionVersionId')::uuid ORDER BY s->>'questionVersionId') INTO version_ids FROM jsonb_array_elements(selected) s;
  IF (SELECT count(DISTINCT x) FROM unnest(version_ids) x)<>expected
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE s->>'sectionId' IS DISTINCT FROM section_id
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'units') u
        CROSS JOIN LATERAL jsonb_array_elements(u->'members') member WHERE u->>'id'=s->>'unitId'
          AND member->>'versionId'=s->>'questionVersionId')
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'candidates') c WHERE c->>'versionId'=s->>'questionVersionId'
        AND c->>'questionId'=s->>'questionId' AND c->>'contentHash'=s->>'contentHash'))
    OR (SELECT count(DISTINCT s->>'ordinal') FROM jsonb_array_elements(selected) s)<>expected
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE (s->>'ordinal')::integer NOT BETWEEN 0 AND expected-1)
    OR (SELECT count(DISTINCT c->>'groupId') FROM jsonb_array_elements(stock->'candidates') c WHERE (c->>'versionId')::uuid=ANY(version_ids))<>expected
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'conflicts') c WHERE
      EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE s->>'unitId'=c->>'leftUnitId') AND
      EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE s->>'unitId'=c->>'rightUnitId')) THEN
    RAISE EXCEPTION 'Selected identities, history or conflicts invalid' USING ERRCODE='23514';
  END IF;
  -- Every chosen unit contributes all members, contiguously, in immutable order.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'units') u
    WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE s->>'unitId'=u->>'id') AND (
      (SELECT jsonb_agg(s->'questionVersionId' ORDER BY (s->>'ordinal')::integer)
        FROM jsonb_array_elements(selected) s WHERE s->>'unitId'=u->>'id') IS DISTINCT FROM
      (SELECT jsonb_agg(member->'versionId' ORDER BY ord) FROM jsonb_array_elements(u->'members') WITH ORDINALITY x(member,ord))
      OR (SELECT max((s->>'ordinal')::integer)-min((s->>'ordinal')::integer)+1
        FROM jsonb_array_elements(selected) s WHERE s->>'unitId'=u->>'id')<>jsonb_array_length(u->'members'))) THEN
    RAISE EXCEPTION 'Incomplete, reordered or interleaved allocation unit' USING ERRCODE='23514';
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
    OR (plan->>'formBytes')::jsonb->>'mode' IS DISTINCT FROM 'PUBLISHED_FIXED'
    OR (plan->>'formBytes')::jsonb->'ownerUserId' IS DISTINCT FROM 'null'::jsonb
    OR plan->>'formHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(plan->>'formBytes','UTF8')),'hex') THEN
    RAISE EXCEPTION 'Allocation bytes/hash mismatch' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_build_object('schemaVersion','fixed-sealed-form/1','id',form_id,'blueprintVersionId',b.id,
    'mode','PUBLISHED_FIXED','ownerUserId',NULL,
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
   VALUES(run_id,b.id,NULL,'PUBLISHED_FIXED','FIXED_AS_PUBLISHED',NULL,m->>'bankRevision',$2,
    (m->>'seed')::bigint,'assembly/1',m->'limits',m,plan->>'manifestHash','SUCCESS',plan->'result');
  sealed_at:=clock_timestamp();
  IF sealed_at>=available_until THEN RAISE EXCEPTION 'Sealing window elapsed' USING ERRCODE='40001'; END IF;
  INSERT INTO tsa.forms(id,assembly_run_id,blueprint_version_id,mode,owner_user_id,content_hash,policy_versions,sealed_at)
   VALUES(form_id,run_id,b.id,'PUBLISHED_FIXED',NULL,plan->>'formHash',
    jsonb_build_object('scoring',b.config->>'scoringPolicy','release',b.config->>'releasePolicy'),sealed_at);
  INSERT INTO tsa.form_sections(form_id,section_id,section,ordinal,duration_seconds,question_count)
    VALUES(form_id,section_id,(b.config->'sections'->0->>'section')::tsa.question_section,0,
      (b.config->'sections'->0->>'durationSeconds')::integer,expected);
  FOR slot IN SELECT value FROM jsonb_array_elements(selected) ORDER BY (value->>'ordinal')::integer LOOP
    SELECT value INTO STRICT snap FROM jsonb_array_elements(plan->'snapshots') WHERE value->>'questionVersionId'=slot->>'questionVersionId';
    IF snap->'privateSnapshot' IS DISTINCT FROM jsonb_build_object('answerKey',snap->'privateSnapshot'->'answerKey',
      'explanation',snap->'privateSnapshot'->'explanation','policyVersion',snap->'privateSnapshot'->'policyVersion')
      OR (snap->>'publicBytes')::jsonb IS DISTINCT FROM snap->'publicSnapshot'
      OR (snap->>'privateBytes')::jsonb IS DISTINCT FROM snap->'privateSnapshot'
      OR snap->>'publicHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(snap->>'publicBytes','UTF8')),'hex')
      OR snap->>'privateHash' IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(snap->>'privateBytes','UTF8')),'hex') THEN
      RAISE EXCEPTION 'Snapshot bytes/hash mismatch' USING ERRCODE='22023';
    END IF;
    INSERT INTO tsa.form_slots(form_id,slot_id,section_id,ordinal,question_id,question_version_id,bundle_id,public_snapshot,snapshot_hash)
      VALUES(form_id,(snap->>'slotId')::uuid,section_id,(slot->>'ordinal')::integer+1,(slot->>'questionId')::uuid,
        (slot->>'questionVersionId')::uuid,
        (SELECT bm.bundle_id FROM tsa.bundle_members bm WHERE bm.question_version_id=(slot->>'questionVersionId')::uuid AND bm.bundle_id=(slot->>'unitId')::uuid),snap->'publicSnapshot',snap->>'publicHash');
    INSERT INTO tsa_private.form_slot_secrets(form_id,slot_id,key_snapshot,explanation_snapshot,policy_version,secret_hash)
      VALUES(form_id,(snap->>'slotId')::uuid,snap->'privateSnapshot'->'answerKey',snap->'privateSnapshot'->'explanation',
        snap->'privateSnapshot'->>'policyVersion',snap->>'privateHash');
  END LOOP;
  -- Existing deferred guard independently compares every public/private snapshot
  -- with its immutable source version and section counts with the blueprint.
  PERFORM tsa.assert_form_integrity(form_id);
  INSERT INTO tsa.form_availability(form_id,available_from,available_until) VALUES(form_id,captured_at,available_until);
  receipt:=jsonb_build_object('schemaVersion','staff-fixed-seal-receipt/1','assemblyRunId',run_id,'formId',form_id,
   'blueprintVersionId',b.id,'blueprintHash',b.content_hash,'mode','PUBLISHED_FIXED','reuseMode','FIXED_AS_PUBLISHED',
   'seed',(m->>'seed')::bigint,'manifestHash',plan->>'manifestHash','formHash',plan->>'formHash','state','SEALED',
   'capturedAt',to_char(captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'sealedAt',to_char(sealed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'availableFrom',to_char(captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'availableUntil',to_char(available_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'requiredThrough',to_char(required_through AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'currentEligibility','NOT_REVALIDATED','studentDeliverySupported',false);
  INSERT INTO tsa_private.fixed_form_seals VALUES(form_id,run_id,$1,receipt);
  INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
   VALUES(gen_random_uuid(),$1,'FIXED_FORM_SEALED','fixed_form',form_id::text);
  PERFORM tsa.assert_form_integrity(form_id);
  RETURN receipt;
END;
$$;
REVOKE ALL ON FUNCTION tsa.fixed_seal_commit(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_seal_commit(uuid,text,jsonb) TO tsa_bank;

CREATE FUNCTION tsa.fixed_form_snapshot(actor_id uuid,target_form uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE observed_at text; items jsonb; item jsonb; availability jsonb;
BEGIN
 IF NOT tsa.fixed_stock_exam_actor($1) THEN RAISE EXCEPTION 'Exam manager required' USING ERRCODE='42501'; END IF;
 observed_at:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 IF $2 IS NULL THEN
  SELECT COALESCE(jsonb_agg(value ORDER BY value->>'sealedAt' DESC,value->>'formId' DESC),'[]'::jsonb) INTO items
  FROM (SELECT s.receipt||jsonb_build_object('domain',b.config->'sections'->0->>'section',
    'questionCount',(b.config->'sections'->0->>'count')::integer,'durationSeconds',(b.config->'sections'->0->>'durationSeconds')::integer) AS value
   FROM tsa_private.fixed_form_seals s JOIN tsa.forms f ON f.id=s.form_id
    JOIN tsa.blueprint_versions b ON b.id=f.blueprint_version_id
   ORDER BY s.receipt->>'sealedAt' DESC,s.form_id DESC LIMIT 21) rows;
  INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
   VALUES(gen_random_uuid(),$1,'FIXED_FORM_LIST_READ','fixed_form_list','fixed');
  RETURN jsonb_build_object('observedAt',observed_at,'items',(SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) FROM jsonb_array_elements(items) WITH ORDINALITY x(value,ord) WHERE ord<=20),'truncated',jsonb_array_length(items)>20);
 END IF;
 SELECT s.receipt||jsonb_build_object('domain',b.config->'sections'->0->>'section',
  'questionCount',(b.config->'sections'->0->>'count')::integer,'durationSeconds',(b.config->'sections'->0->>'durationSeconds')::integer),
  jsonb_build_object('revision',a.revision,'availableFrom',to_char(a.available_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'availableUntil',to_char(a.available_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'withdrawnAt',CASE WHEN a.withdrawn_at IS NULL THEN NULL ELSE to_char(a.withdrawn_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END)
 INTO item,availability FROM tsa_private.fixed_form_seals s JOIN tsa.forms f ON f.id=s.form_id
 JOIN tsa.blueprint_versions b ON b.id=f.blueprint_version_id JOIN tsa.form_availability a ON a.form_id=f.id WHERE s.form_id=$2;
 IF item IS NULL THEN RETURN NULL; END IF;
 INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id) VALUES(gen_random_uuid(),$1,'FIXED_FORM_READ','fixed_form',$2::text);
 RETURN jsonb_build_object('observedAt',observed_at,'form',item,'availability',availability);
END;
$$;
REVOKE ALL ON FUNCTION tsa.fixed_form_snapshot(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_form_snapshot(uuid,uuid) TO tsa_bank;

-- Preserve the original reference-only projection in both list and exact-ID paths.
-- Narrow fixed-reference snapshots; never grant Bank access to personal assembly rows.
CREATE OR REPLACE FUNCTION tsa.bank_fixed_reference_snapshot(actor_id uuid, run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, tsa
AS $$
DECLARE
  observed_at text;
  captured jsonb;
  visible jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tsa.users u JOIN tsa.user_roles r ON r.user_id=u.id
    WHERE u.id=$1 AND u.disabled_at IS NULL AND r.role='BANK_MANAGER') THEN
    RAISE EXCEPTION 'Current manager access required' USING ERRCODE='42501';
  END IF;
  observed_at := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  IF $2 IS NULL THEN
    SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO captured
    FROM (SELECT ar.id,ar.created_at,jsonb_build_object(
      'assemblyRunId',ar.id,'blueprintVersionId',ar.blueprint_version_id,'outcome',ar.outcome,
      'createdAt',to_char(ar.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS item
      FROM tsa.assembly_runs ar
      WHERE ar.user_id IS NULL AND ar.history_revision IS NULL
        AND NOT EXISTS(SELECT 1 FROM tsa.forms linked WHERE linked.assembly_run_id=ar.id)
        AND ar.form_mode='PUBLISHED_FIXED' AND ar.reuse_mode='FIXED_AS_PUBLISHED'
        AND ar.algorithm_version='assembly/1'
        AND ar.manifest->>'schemaVersion'='fixed-assembly-manifest/1'
        AND ar.manifest->>'formMode'='PUBLISHED_FIXED'
        AND ar.manifest->>'reuseMode'='FIXED_AS_PUBLISHED'
        AND NOT (ar.manifest ?| ARRAY['historyQuestionIds','historyGroupIds','userId','historyRevision'])
      ORDER BY ar.created_at DESC,ar.id DESC LIMIT 21) s;
    SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO visible
      FROM jsonb_array_elements(captured) WITH ORDINALITY v(value,ord) WHERE ord<=20;
    INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
      VALUES(gen_random_uuid(),$1,'BANK_FIXED_REFERENCE_LIST_READ','assembly_run_list','fixed-reference');
    RETURN jsonb_build_object('observedAt',observed_at,'runs',visible,'truncated',jsonb_array_length(captured)>20);
  END IF;
  SELECT jsonb_build_object(
    'assemblyRunId',ar.id,'blueprintVersionId',ar.blueprint_version_id,'outcome',ar.outcome,
    'createdAt',to_char(ar.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'bankRevision',ar.bank_revision,'seed',ar.seed,'algorithmVersion',ar.algorithm_version,
    'limits',ar.limits,'manifest',ar.manifest,'manifestHash',ar.manifest_hash,'diagnostics',ar.diagnostics)
    INTO captured FROM tsa.assembly_runs ar
    WHERE ar.id=$2 AND ar.user_id IS NULL AND ar.history_revision IS NULL
      AND NOT EXISTS(SELECT 1 FROM tsa.forms linked WHERE linked.assembly_run_id=ar.id)
        AND ar.form_mode='PUBLISHED_FIXED' AND ar.reuse_mode='FIXED_AS_PUBLISHED'
      AND ar.algorithm_version='assembly/1'
      AND ar.manifest->>'schemaVersion'='fixed-assembly-manifest/1'
      AND ar.manifest->>'formMode'='PUBLISHED_FIXED'
      AND ar.manifest->>'reuseMode'='FIXED_AS_PUBLISHED'
      AND NOT (ar.manifest ?| ARRAY['historyQuestionIds','historyGroupIds','userId','historyRevision']);
  IF captured IS NULL THEN RETURN NULL; END IF;
  INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
    VALUES(gen_random_uuid(),$1,'BANK_FIXED_REFERENCE_READ','assembly_run',$2::text);
  RETURN jsonb_build_object('observedAt',observed_at,'run',captured);
END;
$$;
REVOKE ALL ON FUNCTION tsa.bank_fixed_reference_snapshot(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.bank_fixed_reference_snapshot(uuid,uuid) TO tsa_bank;
