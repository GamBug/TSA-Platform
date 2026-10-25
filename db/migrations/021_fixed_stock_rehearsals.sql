-- Actual Bank eligibility capture, distinct from reference-only assembly_runs.
CREATE TABLE tsa_private.fixed_stock_rehearsals (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES tsa.users(id),
  blueprint_version_id uuid NOT NULL REFERENCES tsa.blueprint_versions(id),
  window_minutes integer NOT NULL CHECK(window_minutes BETWEEN 1 AND 1440),
  captured_at timestamptz NOT NULL CHECK(isfinite(captured_at)),
  available_until timestamptz NOT NULL CHECK(isfinite(available_until)),
  required_through timestamptz NOT NULL CHECK(isfinite(required_through)),
  manifest jsonb NOT NULL, manifest_hash text NOT NULL CHECK(manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=1024*1024),
  CHECK(available_until=captured_at+make_interval(mins=>window_minutes)),
  CHECK(required_through>available_until),
  CHECK(octet_length(manifest::text)<=20*1024*1024)
);
CREATE TRIGGER fixed_stock_rehearsals_immutable BEFORE UPDATE OR DELETE
  ON tsa_private.fixed_stock_rehearsals FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();
REVOKE ALL ON tsa_private.fixed_stock_rehearsals FROM PUBLIC,tsa_bank,tsa_web,tsa_exam,tsa_identity,tsa_factory;

CREATE FUNCTION tsa.fixed_stock_exam_actor(actor_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
  SELECT EXISTS(SELECT 1 FROM tsa.users u JOIN tsa.user_roles r ON r.user_id=u.id
    WHERE u.id=$1 AND u.disabled_at IS NULL AND r.role='EXAM_MANAGER');
$$;
REVOKE ALL ON FUNCTION tsa.fixed_stock_exam_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_stock_exam_actor(uuid) TO tsa_bank;
CREATE POLICY fixed_stock_receipt_scope ON tsa.idempotency_records FOR ALL TO tsa_bank
 USING(actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid
   AND related_attempt_id IS NULL AND route_scope='POST /api/v1/fixed-rehearsals'
   AND tsa.fixed_stock_exam_actor(actor_id))
 WITH CHECK(actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid
   AND related_attempt_id IS NULL AND route_scope='POST /api/v1/fixed-rehearsals'
   AND tsa.fixed_stock_exam_actor(actor_id));

-- Owner-only shared eligibility projection. No candidate identity/history/offering.
CREATE FUNCTION tsa_private.fixed_stock_pool(target_blueprint uuid,captured_at timestamptz,required_through timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE b record; result jsonb;
BEGIN
  SELECT * INTO b FROM tsa.blueprint_versions WHERE id=target_blueprint;
  IF NOT FOUND THEN RETURN NULL; END IF;
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
        JOIN tsa.rights_decisions d ON d.id=sr.decision_id WHERE (d.valid_from>captured_at OR (d.valid_to IS NOT NULL AND d.valid_to<required_through)))
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
    'blueprint',b.config,'blueprintHash',b.content_hash,
    'bankRevision',(SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1),
    'overflow',(SELECT count(*)>10000 FROM base),
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
REVOKE ALL ON FUNCTION tsa_private.fixed_stock_pool(uuid,timestamptz,timestamptz) FROM PUBLIC;

CREATE FUNCTION tsa.fixed_stock_blueprint_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.blueprint_versions b WHERE b.id=$1
   AND b.config->>'profileKind'='INDEPENDENT_PRACTICE'
   AND jsonb_array_length(b.config->'sections')=1
   AND (b.config->'sections'->0->>'count')::integer=CASE b.config->'sections'->0->>'section'
     WHEN 'MATH' THEN 4 WHEN 'READING' THEN 2 WHEN 'SCIENCE' THEN 4 ELSE 0 END
   AND (b.config->'sections'->0->>'durationSeconds')::integer BETWEEN 1 AND 21600
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.config->'quotas') q
     WHERE q->>'dimension'='SKILL' AND NOT EXISTS(SELECT 1 FROM tsa.taxonomy_nodes t
       WHERE t.id=(q->>'value')::uuid AND t.taxonomy_version_id=b.taxonomy_version_id AND t.kind='SKILL')));
$$;
REVOKE ALL ON FUNCTION tsa.fixed_stock_blueprint_supported(uuid) FROM PUBLIC;

CREATE FUNCTION tsa.fixed_stock_blueprints(actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE captured jsonb; visible jsonb;
BEGIN
 IF NOT tsa.fixed_stock_exam_actor($1) THEN RAISE EXCEPTION 'Exam manager required' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO captured FROM
 (SELECT b.id,b.created_at,jsonb_build_object('blueprintVersionId',b.id,'contentHash',b.content_hash,
   'name',b.config->>'name','section',b.config->'sections'->0->>'section',
   'questionCount',b.config->'sections'->0->'count','durationSeconds',b.config->'sections'->0->'durationSeconds') AS item
   FROM tsa.blueprint_versions b WHERE tsa.fixed_stock_blueprint_supported(b.id)
   ORDER BY b.created_at DESC,b.id DESC LIMIT 21) s;
 SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO visible
   FROM jsonb_array_elements(captured) WITH ORDINALITY v(value,ord) WHERE ord<=20;
 RETURN jsonb_build_object('observedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'items',visible,'truncated',jsonb_array_length(captured)>20);
END;
$$;
REVOKE ALL ON FUNCTION tsa.fixed_stock_blueprints(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_stock_blueprints(uuid) TO tsa_bank;

CREATE FUNCTION tsa.fixed_stock_capture(actor_id uuid,blueprint_id uuid,blueprint_hash text,window_minutes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE b record; captured_at timestamptz; available_until timestamptz; required_through timestamptz; stock jsonb;
BEGIN
 IF NOT tsa.fixed_stock_exam_actor($1) THEN RAISE EXCEPTION 'Exam manager required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(1414742321,1);
 PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
 SELECT * INTO b FROM tsa.blueprint_versions WHERE id=$2;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF b.content_hash IS DISTINCT FROM $3 THEN RAISE EXCEPTION 'Blueprint pin conflict' USING ERRCODE='40001'; END IF;
 IF NOT tsa.fixed_stock_blueprint_supported($2) OR $4 NOT BETWEEN 1 AND 1440 OR $4 IS NULL THEN
   RAISE EXCEPTION 'Unsupported rehearsal' USING ERRCODE='22023'; END IF;
 captured_at:=clock_timestamp(); available_until:=captured_at+make_interval(mins=>$4);
 required_through:=available_until+make_interval(secs=>600+(b.config->'sections'->0->>'durationSeconds')::integer);
 stock:=tsa_private.fixed_stock_pool($2,captured_at,required_through);
 RETURN jsonb_build_object('stock',stock,'capturedAt',to_char(captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'availableUntil',to_char(available_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'requiredThrough',to_char(required_through AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END;
$$;
REVOKE ALL ON FUNCTION tsa.fixed_stock_capture(uuid,uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_stock_capture(uuid,uuid,text,integer) TO tsa_bank;

CREATE FUNCTION tsa.fixed_stock_store(actor_id uuid,rehearsal_id uuid,window_minutes integer,
 captured_at timestamptz,available_until timestamptz,required_through timestamptz,
 manifest_bytes text,manifest_hash text,reference_result jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE m jsonb; stock jsonb; b record;
BEGIN
 IF NOT tsa.fixed_stock_exam_actor($1) THEN RAISE EXCEPTION 'Exam manager required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(1414742321,1);
 PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
 IF octet_length($7)>16*1024*1024 OR $7 IS NULL OR $9 IS NULL OR octet_length($9::text)>1024*1024 THEN RAISE EXCEPTION 'Manifest limit' USING ERRCODE='22023'; END IF;
 m:=$7::jsonb;
 SELECT * INTO b FROM tsa.blueprint_versions WHERE id=(m->>'blueprintVersionId')::uuid;
 IF NOT FOUND OR NOT tsa.fixed_stock_blueprint_supported(b.id) THEN RAISE EXCEPTION 'Unsupported blueprint' USING ERRCODE='22023'; END IF;
 IF $3 IS NULL OR $4 IS NULL OR $5 IS NULL OR $6 IS NULL OR $9 IS NULL OR $3 NOT BETWEEN 1 AND 1440 OR NOT isfinite($4) OR NOT isfinite($5) OR NOT isfinite($6)
   OR $4<transaction_timestamp() OR $4>clock_timestamp() OR $5<>$4+make_interval(mins=>$3)
   OR $6<>$5+make_interval(secs=>600+(b.config->'sections'->0->>'durationSeconds')::integer) THEN
   RAISE EXCEPTION 'Invalid capture window' USING ERRCODE='22023'; END IF;
 stock:=tsa_private.fixed_stock_pool(b.id,$4,$6);
 IF (stock->>'overflow' IS DISTINCT FROM 'false'
   OR m->>'schemaVersion' IS DISTINCT FROM 'fixed-assembly-manifest/1'
   OR m->>'algorithmVersion' IS DISTINCT FROM 'assembly/1'
   OR m->>'formMode' IS DISTINCT FROM 'PUBLISHED_FIXED' OR m->>'reuseMode' IS DISTINCT FROM 'FIXED_AS_PUBLISHED'
   OR m ?| ARRAY['historyQuestionIds','historyGroupIds','userId','historyRevision']
   OR m->'blueprint' IS DISTINCT FROM b.config OR m->>'blueprintHash' IS DISTINCT FROM b.content_hash
   OR m->>'bankRevision' IS DISTINCT FROM stock->>'bankRevision'
   OR m->'units' IS DISTINCT FROM stock->'units' OR m->'conflicts' IS DISTINCT FROM stock->'conflicts'
   OR (SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb) FROM jsonb_array_elements(m->'rightsVersions') r)
     IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb) FROM jsonb_array_elements(stock->'rightsVersions') r)
   OR $8 IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to($7,'UTF8')),'hex')
   OR jsonb_typeof($9) IS DISTINCT FROM 'object'
   OR ($9-ARRAY['manifestHash','status','slots','visitedNodes','slotsHash','code']) IS DISTINCT FROM '{}'::jsonb
   OR ($9->>'status'='SUCCESS' AND ($9 ? 'code' OR jsonb_array_length($9->'slots')<>(b.config->'sections'->0->>'count')::integer))
   OR jsonb_typeof($9->'visitedNodes') IS DISTINCT FROM 'number'
   OR NOT ($9 ?& ARRAY['manifestHash','status','slots','visitedNodes','slotsHash'])
   OR jsonb_typeof($9->'slots') IS DISTINCT FROM 'array'
   OR ($9->>'slotsHash' ~ '^sha256:[0-9a-f]{64}$') IS NOT TRUE
   OR $9->>'manifestHash' IS DISTINCT FROM $8 OR $9->>'status' NOT IN('SUCCESS','FAILURE')
   OR jsonb_array_length($9->'slots')>4 OR ($9->>'visitedNodes')::integer NOT BETWEEN 0 AND 50000
   OR ($9->>'status'='FAILURE' AND (jsonb_array_length($9->'slots')<>0 OR $9->>'code' NOT IN('CONSTRAINT_CONFLICT','INSUFFICIENT_ELIGIBLE_INVENTORY','SEARCH_EXHAUSTED')))) IS NOT FALSE THEN
   RAISE EXCEPTION 'Invalid captured stock' USING ERRCODE='22023'; END IF;
 INSERT INTO tsa_private.fixed_stock_rehearsals VALUES($2,$1,b.id,$3,$4,$5,$6,m,$8,$9);
 INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
  VALUES(gen_random_uuid(),$1,'FIXED_STOCK_REHEARSAL_CAPTURE','fixed_stock_rehearsal',$2::text);
END;
$$;
REVOKE ALL ON FUNCTION tsa.fixed_stock_store(uuid,uuid,integer,timestamptz,timestamptz,timestamptz,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_stock_store(uuid,uuid,integer,timestamptz,timestamptz,timestamptz,text,text,jsonb) TO tsa_bank;

CREATE FUNCTION tsa.fixed_stock_snapshot(actor_id uuid,rehearsal_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE captured jsonb; visible jsonb; observed_at text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tsa.users u JOIN tsa.user_roles r ON r.user_id=u.id
   WHERE u.id=$1 AND u.disabled_at IS NULL AND r.role='BANK_MANAGER') THEN
   RAISE EXCEPTION 'Bank manager required' USING ERRCODE='42501'; END IF;
 observed_at:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 IF $2 IS NULL THEN
   SELECT COALESCE(jsonb_agg(item ORDER BY captured_at DESC,id DESC),'[]'::jsonb) INTO captured FROM
   (SELECT r.id,r.captured_at,jsonb_build_object('rehearsalId',r.id,'blueprintVersionId',r.blueprint_version_id,
     'outcome',r.result->>'status','capturedAt',to_char(r.captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
     'windowMinutes',r.window_minutes) AS item FROM tsa_private.fixed_stock_rehearsals r
    ORDER BY r.captured_at DESC,r.id DESC LIMIT 21) s;
   SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO visible
     FROM jsonb_array_elements(captured) WITH ORDINALITY v(value,ord) WHERE ord<=20;
   INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
     VALUES(gen_random_uuid(),$1,'FIXED_STOCK_REHEARSAL_LIST_READ','fixed_stock_rehearsal_list','fixed-stock');
   RETURN jsonb_build_object('observedAt',observed_at,'items',visible,'truncated',jsonb_array_length(captured)>20);
 END IF;
 SELECT jsonb_build_object('rehearsalId',r.id,'blueprintVersionId',r.blueprint_version_id,'windowMinutes',r.window_minutes,
   'capturedAt',to_char(r.captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'availableUntil',to_char(r.available_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'requiredThrough',to_char(r.required_through AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'manifest',r.manifest,'manifestHash',r.manifest_hash,'result',r.result)
   INTO captured FROM tsa_private.fixed_stock_rehearsals r WHERE r.id=$2;
 IF captured IS NULL THEN RETURN NULL; END IF;
 INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id)
   VALUES(gen_random_uuid(),$1,'FIXED_STOCK_REHEARSAL_READ','fixed_stock_rehearsal',$2::text);
 RETURN jsonb_build_object('observedAt',observed_at,'rehearsal',captured);
END;
$$;
REVOKE ALL ON FUNCTION tsa.fixed_stock_snapshot(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.fixed_stock_snapshot(uuid,uuid) TO tsa_bank;
