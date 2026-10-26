-- B11 local personal NEW_ONLY profiles. Existing MVP schema and fixed guards stay unchanged.
CREATE TABLE tsa_private.short_practice_profiles (
 blueprint_version_id uuid PRIMARY KEY REFERENCES tsa.blueprint_versions(id),
 parent_blueprint_version_id uuid UNIQUE NOT NULL REFERENCES tsa.blueprint_versions(id),
 blueprint_hash text NOT NULL CHECK(blueprint_hash ~ '^sha256:[0-9a-f]{64}$'),
 parent_hash text NOT NULL CHECK(parent_hash ~ '^sha256:[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(blueprint_version_id<>parent_blueprint_version_id)
);
REVOKE ALL ON tsa_private.short_practice_profiles FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_exam_worker;
CREATE TRIGGER short_practice_profiles_immutable BEFORE UPDATE OR DELETE ON tsa_private.short_practice_profiles
 FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();

-- Owner-only helper; trusted fixture setup supplies exact immutable version/hash pins.
CREATE FUNCTION tsa_private.short_practice_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa_private.short_practice_profiles p
 JOIN tsa.blueprint_versions b ON b.id=p.blueprint_version_id
 JOIN tsa.blueprint_versions parent ON parent.id=p.parent_blueprint_version_id
 WHERE b.id=$1 AND b.content_hash=p.blueprint_hash AND parent.content_hash=p.parent_hash
  AND tsa.fixed_stock_blueprint_supported(parent.id)
  AND parent.taxonomy_version_id=b.taxonomy_version_id
  AND parent.config->'sections'->0->>'section'=b.config->'sections'->0->>'section'
  AND parent.config->'sections'->0->'count'='4'::jsonb
  AND b.config->>'profileKind'='INDEPENDENT_PRACTICE'
  AND b.config->>'bundlePolicy'='ALL_OR_NONE'
  AND b.config->>'scoringPolicy'='practice-binary-v1'
  AND b.config->>'releasePolicy'='after-grade-v1'
  AND jsonb_typeof(b.config->'sections')='array' AND jsonb_array_length(b.config->'sections')=1
  AND b.config->'sections'->0->>'section' IN('MATH','SCIENCE')
  AND b.config->'sections'->0->'count'='2'::jsonb
  AND b.config->'sections'->0->'durationSeconds'='180'::jsonb);
$$;
REVOKE ALL ON FUNCTION tsa_private.short_practice_supported(uuid) FROM PUBLIC;

CREATE FUNCTION tsa_private.validate_short_practice_pin() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa,tsa_private AS $$
BEGIN
 IF NOT tsa_private.short_practice_supported(NEW.blueprint_version_id) THEN
  RAISE EXCEPTION 'Unsupported short practice pin' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.validate_short_practice_pin() FROM PUBLIC;
CREATE TRIGGER validate_short_practice_pin AFTER INSERT ON tsa_private.short_practice_profiles
 FOR EACH ROW EXECUTE FUNCTION tsa_private.validate_short_practice_pin();

CREATE FUNCTION tsa.exam_short_practice_alternatives(parent_blueprint uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE result jsonb;
BEGIN
 PERFORM tsa.assembly_candidate();
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind','SHORTER_PROFILE',
   'blueprintVersionId',b.id,'name',b.config->>'name') ORDER BY b.id),'[]'::jsonb) INTO result
 FROM tsa_private.short_practice_profiles p JOIN tsa.blueprint_versions b ON b.id=p.blueprint_version_id
 JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
 WHERE p.parent_blueprint_version_id=$1 AND tsa_private.short_practice_supported(b.id)
  AND o.enabled AND o.start_ttl_seconds=600 AND o.available_from<=clock_timestamp()
  AND clock_timestamp()<o.available_until;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_short_practice_alternatives(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_short_practice_alternatives(uuid) TO tsa_exam;

-- Existing frozen catalog/history GETs. Internal envelopes stay server-side.
CREATE FUNCTION tsa.exam_short_catalog_page(page_limit integer,after_blueprint uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE result jsonb; ids uuid[]; shown uuid[]; next_id uuid;
BEGIN
  PERFORM tsa.assembly_candidate();
  IF page_limit IS NULL OR page_limit<1 OR page_limit>100 THEN
    RAISE EXCEPTION 'Bounded catalog page required' USING ERRCODE='22023';
  END IF;
  WITH offered AS (
    SELECT b.id,b.config,o.available_from,o.available_until,o.start_ttl_seconds,
      CASE WHEN jsonb_typeof(b.config->'sections')='array' THEN b.config->'sections' ELSE '[]'::jsonb END AS sections
    FROM tsa.blueprint_versions b JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
    WHERE o.enabled AND clock_timestamp()<o.available_until
      AND (after_blueprint IS NULL OR b.id>after_blueprint)
      AND b.config->>'profileKind'='INDEPENDENT_PRACTICE'
      AND b.config->>'bundlePolicy'='ALL_OR_NONE'
      AND b.config->>'scoringPolicy'='practice-binary-v1'
      AND b.config->>'releasePolicy'='after-grade-v1'
  ), supported AS (
    SELECT id FROM offered WHERE jsonb_array_length(sections)=1
      AND ((sections->0->>'section'='MATH' AND sections->0->'count'='4'::jsonb)
        OR (sections->0->>'section'='READING' AND sections->0->'count'='2'::jsonb)
        OR (sections->0->>'section'='SCIENCE' AND sections->0->'count'='4'::jsonb)
        OR (tsa_private.short_practice_supported(id) AND available_from<=clock_timestamp() AND start_ttl_seconds=600))
      AND jsonb_typeof(sections->0->'durationSeconds')='number'
      AND CASE WHEN sections->0->>'durationSeconds' ~ '^[1-9][0-9]{0,4}$'
        THEN (sections->0->>'durationSeconds')::integer BETWEEN 1 AND 21600 ELSE false END
    ORDER BY id LIMIT page_limit+1
  ) SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO ids FROM supported;
  shown:=ids[1:page_limit];
  IF cardinality(ids)>page_limit THEN next_id:=shown[page_limit]; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'config',b.config,
    'entry',jsonb_build_object('name',b.config->>'name','domain',b.config->'sections'->0->>'section',
      'questionCount',b.config->'sections'->0->'count','durationSeconds',b.config->'sections'->0->'durationSeconds',
      'profileKind','INDEPENDENT_PRACTICE','availableFrom',tsa.exam_instant(o.available_from),
      'availableUntil',tsa.exam_instant(o.available_until),'mode','PERSONALIZED_PRACTICE',
      'blueprintVersionId',b.id,'reviewAllowed',false)) ORDER BY b.id),'[]'::jsonb)
    INTO result FROM tsa.blueprint_versions b JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
    WHERE b.id=ANY(shown) AND o.enabled AND clock_timestamp()<o.available_until;
  RETURN jsonb_build_object('items',result,'next',next_id);
END;
$$;


REVOKE ALL ON FUNCTION tsa.exam_short_catalog_page(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_short_catalog_page(integer,uuid) TO tsa_exam;

-- Preserve the bundle-aware personal command with one pinned short NEW_ONLY count branch.
-- CREATE OR REPLACE retains its owner, search_path, signature and narrow EXECUTE ACL.
-- No historical row, applied migration, default mode, clock or public DTO changes.
CREATE OR REPLACE FUNCTION tsa.assembly_commit_personal(creation_key text,body_hash text,plan jsonb) RETURNS jsonb
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
    OR ((m->>'reuseMode') IN ('NEW_ONLY','REVIEW_ALLOWED')) IS NOT TRUE OR m->'blueprint' IS DISTINCT FROM b.config
    OR m->>'blueprintHash' IS DISTINCT FROM b.content_hash OR jsonb_array_length(b.config->'sections')<>1 THEN
    RAISE EXCEPTION 'Invalid allocation manifest' USING ERRCODE='22023';
  END IF;
  IF (m->>'reuseMode'='REVIEW_ALLOWED' AND plan->'acknowledgeRepeats' IS DISTINCT FROM 'true'::jsonb)
    OR (m->>'reuseMode'='NEW_ONLY' AND plan ? 'acknowledgeRepeats') THEN
    RAISE EXCEPTION 'Explicit repeat consent required' USING ERRCODE='22023';
  END IF;
  section_id:=b.config->'sections'->0->>'id'; expected:=(b.config->'sections'->0->>'count')::integer;
  IF (expected<>(CASE b.config->'sections'->0->>'section' WHEN 'MATH' THEN 4 WHEN 'READING' THEN 2 WHEN 'SCIENCE' THEN 4 ELSE 0 END)
    AND NOT (m->>'reuseMode'='NEW_ONLY'
      AND COALESCE(current_setting('tsa.enable_short_practice',true),'false')='true'
      AND tsa_private.short_practice_supported(b.id)))
    OR (b.config->'sections'->0->>'durationSeconds')::integer NOT BETWEEN 1 AND 21600
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(b.config->'quotas') q
      WHERE q->>'dimension'='SKILL' AND NOT EXISTS(SELECT 1 FROM tsa.taxonomy_nodes t
        WHERE t.id=(q->>'value')::uuid AND t.taxonomy_version_id=b.taxonomy_version_id AND t.kind='SKILL')) THEN
    RAISE EXCEPTION 'Invalid MVP blueprint' USING ERRCODE='22023';
  END IF;
  stock:=tsa.assembly_standalone_stock(b.id);
  IF stock->'overflow'='true'::jsonb THEN RETURN jsonb_build_object('status','STALE'); END IF;
  IF stock IS NULL THEN RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE'); END IF;
  -- Recheck the full captured pool, including expiry without a revision change.
  -- Lifetime analytics may advance when a different student seals a form; those
  -- counts remain the captured solver ranking inputs, never a global reservation.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u->'id','sectionId',u->'sectionId',
    'members',(SELECT jsonb_agg(member-'exposureCount' ORDER BY ord) FROM jsonb_array_elements(u->'members') WITH ORDINALITY x(member,ord))) ORDER BY u->>'id'),'[]'::jsonb)
    INTO captured_members FROM jsonb_array_elements(m->'units') u;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u->'id','sectionId',u->'sectionId',
    'members',(SELECT jsonb_agg(member-'exposureCount' ORDER BY ord) FROM jsonb_array_elements(u->'members') WITH ORDINALITY x(member,ord))) ORDER BY u->>'id'),'[]'::jsonb)
    INTO fresh_members FROM jsonb_array_elements(stock->'units') u;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb)
    INTO rights_pins FROM jsonb_array_elements(m->'rightsVersions') r;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb)
    INTO current_rights FROM jsonb_array_elements(stock->'rightsVersions') r;
  IF captured_members IS DISTINCT FROM fresh_members OR rights_pins IS DISTINCT FROM current_rights
    OR m->'historyQuestionIds' IS DISTINCT FROM stock->'historyQuestionIds'
    OR m->'historyGroupIds' IS DISTINCT FROM stock->'historyGroupIds'
    OR m->'conflicts' IS DISTINCT FROM stock->'conflicts' THEN RETURN jsonb_build_object('status','STALE'); END IF;
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
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'units') u
        CROSS JOIN LATERAL jsonb_array_elements(u->'members') member WHERE u->>'id'=s->>'unitId'
          AND member->>'versionId'=s->>'questionVersionId')
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'candidates') c WHERE c->>'versionId'=s->>'questionVersionId'
        AND c->>'questionId'=s->>'questionId' AND c->>'contentHash'=s->>'contentHash'))
    OR (SELECT count(DISTINCT s->>'ordinal') FROM jsonb_array_elements(selected) s)<>expected
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE (s->>'ordinal')::integer NOT BETWEEN 0 AND expected-1)
    OR (m->>'reuseMode'='NEW_ONLY' AND EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'candidates') c JOIN tsa.student_question_history h ON h.user_id=who
      LEFT JOIN tsa.duplicate_group_members hm ON hm.question_id=h.question_id
      WHERE (c->>'versionId')::uuid=ANY(version_ids) AND (h.question_id::text=c->>'questionId' OR hm.group_id::text=c->>'groupId')))
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
    VALUES(run_id,b.id,who,'PERSONALIZED_PRACTICE',(m->>'reuseMode')::tsa.reuse_mode,(plan->>'historyRevision')::bigint,m->>'bankRevision',body_hash,
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
  INSERT INTO tsa.form_availability(form_id,available_from,available_until) VALUES(form_id,o.available_from,o.available_until);
  INSERT INTO tsa.attempts(id,user_id,form_id,form_mode,reuse_mode,reuse_policy_version,created_at,admission_until_at_creation,start_before_at)
    VALUES(attempt_id,who,form_id,'PERSONALIZED_PRACTICE',(m->>'reuseMode')::tsa.reuse_mode,'reuse/1',clock_timestamp(),o.available_until,o.available_until)
    RETURNING * INTO a;
  IF m->>'reuseMode'='REVIEW_ALLOWED' THEN
    -- Only explicit review preserves an existing first assignment. New identities
    -- still enter monotonic history and exclude future NEW_ONLY allocation.
    INSERT INTO tsa.student_question_history(user_id,question_id,first_attempt_id)
      SELECT who,(s->>'questionId')::uuid,attempt_id FROM jsonb_array_elements(selected) s
      ON CONFLICT(user_id,question_id) DO NOTHING;
  ELSE
  INSERT INTO tsa.student_question_history(user_id,question_id,first_attempt_id)
    SELECT who,(s->>'questionId')::uuid,attempt_id FROM jsonb_array_elements(selected) s;
  END IF;
  UPDATE tsa.student_allocation_state SET revision=revision+1,updated_at=clock_timestamp() WHERE user_id=who RETURNING revision INTO next_revision;
  receipt:=jsonb_build_object('attemptId',attempt_id,'formId',form_id,'state','CREATED','domain',b.config->'sections'->0->>'section',
    'formMode','PERSONALIZED_PRACTICE','reuseMode',m->>'reuseMode','reusePolicyVersion','reuse/1',
    'startBefore',to_char(a.start_before_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
    VALUES(gen_random_uuid(),who,'POST /api/v1/attempts',creation_key,body_hash,201,receipt,attempt_id,attempt_id);
  INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,before_revision,after_revision)
    VALUES(gen_random_uuid(),who,'ATTEMPT_ALLOCATED','attempt',attempt_id::text,next_revision-1,next_revision);
  RETURN jsonb_build_object('status','CREATED','receipt',receipt);
END;
$$;
