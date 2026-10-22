-- Existing frozen multi-member manifests and immutable bundle/stimulus tables.
-- No publication grant, public API change or edit to an applied migration.
CREATE FUNCTION tsa.guard_bundle_allocation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR UPDATE;
  UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1,updated_at=clock_timestamp() WHERE id=1;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION tsa.guard_bundle_allocation_revision() FROM PUBLIC;
CREATE TRIGGER bundles_allocation_revision BEFORE INSERT ON tsa.bundles
  FOR EACH STATEMENT EXECUTE FUNCTION tsa.guard_bundle_allocation_revision();
CREATE TRIGGER bundle_members_allocation_revision BEFORE INSERT ON tsa.bundle_members
  FOR EACH STATEMENT EXECUTE FUNCTION tsa.guard_bundle_allocation_revision();

-- Private manifest input only. No student HTTP route or allocation authority.
CREATE OR REPLACE FUNCTION tsa.assembly_standalone_stock(target_blueprint uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE b record; who uuid; result jsonb; horizon timestamptz;
BEGIN
  who:=nullif(current_setting('tsa.local_user_id',true),'')::uuid;
  IF NOT EXISTS(SELECT 1 FROM tsa.users u JOIN tsa.user_roles r ON r.user_id=u.id
    WHERE u.id=who AND u.disabled_at IS NULL AND r.role='CANDIDATE') THEN
    RAISE EXCEPTION 'Candidate context required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  SELECT bv.*,o.available_until,o.revision AS offering_revision INTO b
    FROM tsa.blueprint_versions bv JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=bv.id
    WHERE bv.id=target_blueprint AND o.enabled AND o.available_from<=clock_timestamp()
      AND clock_timestamp()<o.available_until AND o.start_ttl_seconds=600;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF jsonb_array_length(b.config->'sections')<>1 THEN
    RAISE EXCEPTION 'One-domain MVP blueprint required' USING ERRCODE='22023';
  END IF;
  horizon:=b.available_until+make_interval(secs=>(b.config->'sections'->0->>'durationSeconds')::integer);
  WITH base AS MATERIALIZED (
    SELECT v.*,m.group_id FROM tsa.questions q JOIN tsa.question_versions v ON v.id=q.eligible_version_id
      JOIN tsa.duplicate_group_members m ON m.question_id=q.id
      JOIN tsa.duplicate_groups g ON g.id=m.group_id AND g.merged_into_id IS NULL
    WHERE v.taxonomy_version_id=b.taxonomy_version_id AND v.section::text=b.config->'sections'->0->>'section'
      AND b.config->'allowedTypes' ? (v.interaction->>'type')
      AND NOT b.config->'excludedQuestionIds' ? v.question_id::text
      AND tsa.bank_question_selection_allowed(v.id)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v.skill_ids) tag(code) WHERE NOT EXISTS(SELECT 1 FROM tsa.taxonomy_nodes n WHERE n.taxonomy_version_id=v.taxonomy_version_id AND n.code=tag.code AND n.kind='SKILL'))
      AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) s JOIN tsa.source_rights sr ON sr.source_version_id=s.id
        JOIN tsa.rights_decisions d ON d.id=sr.decision_id WHERE d.valid_to IS NOT NULL AND d.valid_to<horizon)
    ORDER BY v.id LIMIT 10001

  ), enemies AS MATERIALIZED (
    SELECT DISTINCT l.question_id AS left_id,r.question_id AS right_id
    FROM tsa.duplicate_relations d JOIN tsa.question_versions l ON l.id=d.left_version_id
      JOIN tsa.question_versions r ON r.id=d.right_version_id
    WHERE d.resolution='CONFIRMED' AND d.kind IN('EXACT','NEAR_DUPLICATE','ENEMY')
  ), valid_bundles AS MATERIALIZED (
    SELECT bundle.id FROM tsa.bundles bundle
    WHERE bundle.id IN(SELECT bm.bundle_id FROM base c JOIN tsa.bundle_members bm ON bm.question_version_id=c.id)
      AND (SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=bundle.id) BETWEEN 1 AND 200
      AND (SELECT min(ordinal) FROM tsa.bundle_members WHERE bundle_id=bundle.id)=0
      AND (SELECT max(ordinal)+1 FROM tsa.bundle_members WHERE bundle_id=bundle.id)=
        (SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=bundle.id)
      AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members bm LEFT JOIN base c ON c.id=bm.question_version_id
        WHERE bm.bundle_id=bundle.id AND (c.id IS NULL OR c.stimulus_version_id IS DISTINCT FROM bundle.stimulus_version_id))
      AND (SELECT count(DISTINCT c.group_id) FROM tsa.bundle_members bm JOIN base c ON c.id=bm.question_version_id
        WHERE bm.bundle_id=bundle.id)=(SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=bundle.id)
      AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members l JOIN base lc ON lc.id=l.question_version_id
        JOIN tsa.bundle_members r ON r.bundle_id=l.bundle_id AND r.ordinal>l.ordinal
        JOIN base rc ON rc.id=r.question_version_id JOIN enemies e
        ON (e.left_id=lc.question_id AND e.right_id=rc.question_id) OR (e.right_id=lc.question_id AND e.left_id=rc.question_id)
        WHERE l.bundle_id=bundle.id)
  ), unit_versions AS MATERIALIZED (
    SELECT c.id,ARRAY[c.id] AS versions FROM base c WHERE c.stimulus_version_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members WHERE question_version_id=c.id)
    UNION ALL
    SELECT vb.id,array_agg(bm.question_version_id ORDER BY bm.ordinal) FROM valid_bundles vb
      JOIN tsa.bundle_members bm ON bm.bundle_id=vb.id GROUP BY vb.id
  ), expanded AS MATERIALIZED (
    SELECT u.id AS unit_id,member.version_id,member.ordinal FROM unit_versions u
      CROSS JOIN LATERAL unnest(u.versions) WITH ORDINALITY member(version_id,ordinal)
  ), candidates AS MATERIALIZED (
    SELECT DISTINCT c.* FROM base c JOIN expanded e ON e.version_id=c.id
  ), member_json AS MATERIALIZED (
    SELECT c.id,jsonb_build_object(
      'questionId',c.question_id,'versionId',c.id,'contentHash',c.content_hash,'groupId',c.group_id,
      'section',c.section,'taxonomyVersionId',c.taxonomy_version_id,'interactionType',c.interaction->>'type',
      'skillIds',(SELECT COALESCE(jsonb_agg(n.id ORDER BY n.id),'[]'::jsonb) FROM jsonb_array_elements_text(c.skill_ids) tag(code) JOIN tsa.taxonomy_nodes n ON n.taxonomy_version_id=c.taxonomy_version_id AND n.code=tag.code AND n.kind='SKILL'),'cognitiveLevel',c.cognitive_level,'difficulty',c.difficulty->'target',
      'sourceIds',(SELECT jsonb_agg(s.id ORDER BY s.id) FROM tsa.bank_question_sources(c.id) s),
      'exposureCount',(SELECT count(*) FROM tsa.form_slots fs WHERE fs.question_id=c.question_id)) AS value FROM candidates c
  ), used_sources AS (SELECT DISTINCT s.id FROM candidates c CROSS JOIN LATERAL tsa.bank_question_sources(c.id) s)
  SELECT jsonb_build_object(
    'blueprint',b.config,'blueprintHash',b.content_hash,'offeringRevision',b.offering_revision::text,
    'bankRevision',(SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1),
    'historyRevision',COALESCE((SELECT revision::text FROM tsa.student_allocation_state WHERE user_id=who),'0'),
    'historyQuestionIds',COALESCE((SELECT jsonb_agg(question_id ORDER BY question_id) FROM tsa.student_question_history WHERE user_id=who),'[]'::jsonb),
    'historyGroupIds',COALESCE((SELECT jsonb_agg(DISTINCT m.group_id ORDER BY m.group_id) FROM tsa.student_question_history h
      JOIN tsa.duplicate_group_members m ON m.question_id=h.question_id WHERE h.user_id=who),'[]'::jsonb),
    'overflow',(SELECT count(*)>10000 FROM base),
    'candidates',COALESCE((SELECT jsonb_agg(value ORDER BY id) FROM member_json),'[]'::jsonb),
    'units',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'sectionId',b.config->'sections'->0->>'id',
      'members',(SELECT jsonb_agg(m.value ORDER BY e.ordinal) FROM expanded e JOIN member_json m ON m.id=e.version_id
        WHERE e.unit_id=u.id)) ORDER BY u.id) FROM unit_versions u),'[]'::jsonb),
    'rightsVersions',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceId',s.id,'versionId',d.id,'decision',to_jsonb(d)) ORDER BY s.id)
      FROM used_sources s JOIN tsa.source_rights sr ON sr.source_version_id=s.id JOIN tsa.rights_decisions d ON d.id=sr.decision_id),'[]'::jsonb),
    'conflicts',COALESCE((SELECT jsonb_agg(jsonb_build_object('leftUnitId',left_id,'rightUnitId',right_id) ORDER BY left_id,right_id)
      FROM (SELECT DISTINCT least(l.unit_id,r.unit_id) AS left_id,greatest(l.unit_id,r.unit_id) AS right_id
        FROM enemies e JOIN candidates lc ON lc.question_id=e.left_id JOIN expanded l ON l.version_id=lc.id
        JOIN candidates rc ON rc.question_id=e.right_id JOIN expanded r ON r.version_id=rc.id
        WHERE l.unit_id<>r.unit_id) edges),'[]'::jsonb)
  ) INTO result;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'units') u GROUP BY u->>'id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Allocation unit identity collision' USING ERRCODE='22023';
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION tsa.assembly_snapshot_inputs(version_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE who uuid:=tsa.assembly_candidate(); result jsonb;
BEGIN
  IF cardinality(version_ids)>200 THEN RAISE EXCEPTION 'Too many snapshot inputs' USING ERRCODE='22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('questionVersionId',v.id,'questionId',v.question_id,
    'content',v.content,'interaction',v.interaction,'answerKey',s.answer_key,'explanation',s.explanation,
    'policyVersion',s.scoring_policy_version,'stimulus',CASE WHEN sv.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',sv.stimulus_id,'content',sv.content) END) ORDER BY v.id),'[]'::jsonb) INTO result
    FROM tsa.question_versions v JOIN tsa_private.question_secrets s ON s.question_version_id=v.id
    LEFT JOIN tsa.stimulus_versions sv ON sv.id=v.stimulus_version_id
    WHERE v.id=ANY(version_ids) AND tsa.bank_question_selection_allowed(v.id);
  RETURN result;
END;
$$;

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
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'candidates') c JOIN tsa.student_question_history h ON h.user_id=who
      LEFT JOIN tsa.duplicate_group_members hm ON hm.question_id=h.question_id
      WHERE (c->>'versionId')::uuid=ANY(version_ids) AND (h.question_id::text=c->>'questionId' OR hm.group_id::text=c->>'groupId'))
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
