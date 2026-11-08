-- Local, explicitly enabled READING20 experiment. The frozen question/1,
-- blueprint/1 and H3/MvpBlueprintConfigSchema contracts remain unchanged.
CREATE TABLE tsa_private.reading_experiment_profiles (
  blueprint_version_id uuid PRIMARY KEY REFERENCES tsa.blueprint_versions(id),
  blueprint_hash text NOT NULL CHECK(blueprint_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON tsa_private.reading_experiment_profiles FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_exam_worker;
CREATE TRIGGER reading_experiment_profiles_immutable BEFORE UPDATE OR DELETE ON tsa_private.reading_experiment_profiles
 FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();

CREATE FUNCTION tsa_private.reading_experiment_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE config jsonb; section_id text; cognitive_count integer; level_count integer;
BEGIN
 SELECT b.config INTO config
 FROM tsa_private.reading_experiment_profiles p
 JOIN tsa.blueprint_versions b ON b.id=p.blueprint_version_id
 WHERE b.id=target_blueprint AND b.content_hash=p.blueprint_hash;
 IF NOT FOUND OR jsonb_typeof(config) IS DISTINCT FROM 'object'
   OR config->>'schemaVersion'<>'blueprint/1'
   OR config->>'profileKind'<>'INDEPENDENT_PRACTICE'
   OR config->>'bundlePolicy'<>'ALL_OR_NONE'
   OR config->>'scoringPolicy'<>'practice-binary-v1'
   OR config->>'releasePolicy'<>'after-grade-v1' THEN RETURN false; END IF;
 IF jsonb_typeof(config->'sections') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(config->'sections')<>1 THEN RETURN false; END IF;
 IF config->'sections'->0->>'section'<>'READING'
   OR config->'sections'->0->'count'<>'20'::jsonb
   OR config->'sections'->0->'durationSeconds'<>'1800'::jsonb THEN RETURN false; END IF;
 IF jsonb_typeof(config->'quotas') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 section_id:=config->'sections'->0->>'id';
 SELECT count(*) INTO cognitive_count FROM jsonb_array_elements(config->'quotas') q
 WHERE q->>'dimension'='COGNITIVE_LEVEL';
 IF cognitive_count<>3 THEN RETURN false; END IF;
 SELECT count(*) INTO level_count FROM jsonb_array_elements(config->'quotas') q
 WHERE q->>'dimension'='COGNITIVE_LEVEL' AND q->>'sectionId'=section_id
   AND q->>'value'='M1' AND q->'min'='8'::jsonb AND q->'max'='8'::jsonb;
 IF level_count<>1 THEN RETURN false; END IF;
 SELECT count(*) INTO level_count FROM jsonb_array_elements(config->'quotas') q
 WHERE q->>'dimension'='COGNITIVE_LEVEL' AND q->>'sectionId'=section_id
   AND q->>'value'='M2' AND q->'min'='6'::jsonb AND q->'max'='6'::jsonb;
 IF level_count<>1 THEN RETURN false; END IF;
 SELECT count(*) INTO level_count FROM jsonb_array_elements(config->'quotas') q
 WHERE q->>'dimension'='COGNITIVE_LEVEL' AND q->>'sectionId'=section_id
   AND q->>'value'='M3' AND q->'min'='6'::jsonb AND q->'max'='6'::jsonb;
 RETURN level_count=1;
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.reading_experiment_supported(uuid) FROM PUBLIC;

CREATE FUNCTION tsa_private.reading_experiment_unit_supported(unit jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE member_count integer; m1_count integer; m2_count integer; m3_count integer;
BEGIN
 IF jsonb_typeof(unit) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF jsonb_typeof(unit->'members') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(unit->'members')<>10 THEN RETURN false; END IF;
 SELECT count(*),count(*) FILTER(WHERE member->>'cognitiveLevel'='M1'),
   count(*) FILTER(WHERE member->>'cognitiveLevel'='M2'),
   count(*) FILTER(WHERE member->>'cognitiveLevel'='M3')
 INTO member_count,m1_count,m2_count,m3_count FROM jsonb_array_elements(unit->'members') member;
 RETURN member_count=10 AND m1_count=4 AND m2_count=3 AND m3_count=3;
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.reading_experiment_unit_supported(jsonb) FROM PUBLIC;

CREATE FUNCTION tsa_private.validate_reading_experiment_pin() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa,tsa_private AS $$
BEGIN
 IF NOT tsa_private.reading_experiment_supported(NEW.blueprint_version_id) THEN
  RAISE EXCEPTION 'Unsupported reading experiment pin' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.validate_reading_experiment_pin() FROM PUBLIC;
CREATE TRIGGER validate_reading_experiment_pin AFTER INSERT ON tsa_private.reading_experiment_profiles
 FOR EACH ROW EXECUTE FUNCTION tsa_private.validate_reading_experiment_pin();

-- This narrow server-side check returns only a boolean for an already-known ID.
CREATE FUNCTION tsa.exam_reading_experiment_profile_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
BEGIN
 PERFORM tsa.assembly_candidate();
 RETURN COALESCE(current_setting('tsa.enable_reading_experiment',true),'false')='true'
   AND tsa_private.reading_experiment_supported(target_blueprint);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_reading_experiment_profile_supported(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_reading_experiment_profile_supported(uuid) TO tsa_exam;

-- Separate catalog keeps the short-profile catalogue contract and guard intact.
CREATE FUNCTION tsa.exam_reading_experiment_catalog_page(page_limit integer,after_blueprint uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE result jsonb; ids uuid[]; shown uuid[]; next_id uuid;
BEGIN
  PERFORM tsa.assembly_candidate();
  IF page_limit IS NULL OR page_limit<1 OR page_limit>100 THEN
    RAISE EXCEPTION 'Bounded catalog page required' USING ERRCODE='22023';
  END IF;
  IF COALESCE(current_setting('tsa.enable_reading_experiment',true),'false')<>'true' THEN
    RETURN jsonb_build_object('items','[]'::jsonb,'next',NULL);
  END IF;
  WITH offered AS (
    SELECT b.id,b.config,o.available_from,o.available_until,o.start_ttl_seconds
    FROM tsa_private.reading_experiment_profiles p
    JOIN tsa.blueprint_versions b ON b.id=p.blueprint_version_id
    JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
    WHERE o.enabled AND o.start_ttl_seconds=600
      AND o.available_from<=clock_timestamp() AND clock_timestamp()<o.available_until
      AND (after_blueprint IS NULL OR b.id>after_blueprint)
      AND tsa_private.reading_experiment_supported(b.id)
  )
  SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO ids
  FROM (SELECT id FROM offered ORDER BY id LIMIT page_limit+1) selected;
  shown:=ids[1:page_limit];
  IF cardinality(ids)>page_limit THEN next_id:=shown[page_limit]; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'config',b.config,
    'entry',jsonb_build_object('name',b.config->>'name','domain','READING',
      'questionCount',20,'durationSeconds',1800,'profileKind','INDEPENDENT_PRACTICE',
      'availableFrom',tsa.exam_instant(o.available_from),'availableUntil',tsa.exam_instant(o.available_until),
      'mode','PERSONALIZED_PRACTICE','blueprintVersionId',b.id,'reviewAllowed',false)) ORDER BY b.id),'[]'::jsonb)
    INTO result FROM tsa.blueprint_versions b JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
    WHERE b.id=ANY(shown) AND o.enabled AND o.start_ttl_seconds=600
      AND o.available_from<=clock_timestamp() AND clock_timestamp()<o.available_until
      AND tsa_private.reading_experiment_supported(b.id);
  RETURN jsonb_build_object('items',result,'next',next_id);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_reading_experiment_catalog_page(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_reading_experiment_catalog_page(integer,uuid) TO tsa_exam;

-- Preserve the existing commit command and ACL, adding one separately opted-in
-- exact-hash profile branch beside (not inside) the short-profile branch.
DO $$
DECLARE definition text; old_fragment text; new_fragment text;
BEGIN
 definition:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
 old_fragment:=$old$AND COALESCE(current_setting('tsa.enable_short_practice',true),'false')='true'
      AND tsa_private.short_practice_supported(b.id)))$old$;
 new_fragment:=$new$AND ((COALESCE(current_setting('tsa.enable_short_practice',true),'false')='true'
        AND tsa_private.short_practice_supported(b.id))
       OR (COALESCE(current_setting('tsa.enable_reading_experiment',true),'false')='true'
        AND tsa_private.reading_experiment_supported(b.id)))))$new$;
 IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
  RAISE EXCEPTION 'Could not find unique short-profile allocation guard';
 END IF;
 EXECUTE replace(definition,old_fragment,new_fragment);

 definition:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
 old_fragment:=$old$captured_members jsonb; fresh_members jsonb; rights_pins jsonb; current_rights jsonb;$old$;
 new_fragment:=$new$captured_members jsonb; fresh_members jsonb; rights_pins jsonb; current_rights jsonb;
  fresh_conflicts jsonb; reading_experiment boolean:=false;$new$;
 IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
  RAISE EXCEPTION 'Could not find unique allocation freshness declarations';
 END IF;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$section_id:=b.config->'sections'->0->>'id'; expected:=(b.config->'sections'->0->>'count')::integer;$old$;
 new_fragment:=$new$section_id:=b.config->'sections'->0->>'id'; expected:=(b.config->'sections'->0->>'count')::integer;
  reading_experiment:=COALESCE(current_setting('tsa.enable_reading_experiment',true),'false')='true'
    AND tsa_private.reading_experiment_supported(b.id);$new$;
 IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
  RAISE EXCEPTION 'Could not find unique allocation profile declaration';
 END IF;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$INTO fresh_members FROM jsonb_array_elements(stock->'units') u;$old$;
 new_fragment:=$new$INTO fresh_members FROM jsonb_array_elements(stock->'units') u
    WHERE NOT reading_experiment OR tsa_private.reading_experiment_unit_supported(u);$new$;
 IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
  RAISE EXCEPTION 'Could not find unique fresh-unit capture';
 END IF;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb)
    INTO current_rights FROM jsonb_array_elements(stock->'rightsVersions') r;$old$;
 new_fragment:=$new$  SELECT COALESCE(jsonb_agg(edge ORDER BY edge->>'leftUnitId',edge->>'rightUnitId'),'[]'::jsonb)
    INTO fresh_conflicts FROM jsonb_array_elements(stock->'conflicts') edge
    WHERE NOT reading_experiment OR (EXISTS(SELECT 1 FROM jsonb_array_elements(fresh_members) u WHERE u->>'id'=edge->>'leftUnitId')
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(fresh_members) u WHERE u->>'id'=edge->>'rightUnitId'));
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sourceId',r->'sourceId','versionId',r->'versionId') ORDER BY r->>'sourceId'),'[]'::jsonb)
    INTO current_rights FROM jsonb_array_elements(stock->'rightsVersions') r
    WHERE NOT reading_experiment OR EXISTS(SELECT 1 FROM jsonb_array_elements(fresh_members) u
      CROSS JOIN LATERAL jsonb_array_elements(u->'members') member
      CROSS JOIN LATERAL jsonb_array_elements_text(member->'sourceIds') source_id
      WHERE source_id.value=r->>'sourceId');$new$;
 IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
  RAISE EXCEPTION 'Could not find unique allocation rights comparison';
 END IF;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$OR m->'conflicts' IS DISTINCT FROM stock->'conflicts' THEN RETURN jsonb_build_object('status','STALE'); END IF;$old$;
 new_fragment:=$new$OR (reading_experiment AND m->'conflicts' IS DISTINCT FROM fresh_conflicts)
    OR (NOT reading_experiment AND m->'conflicts' IS DISTINCT FROM stock->'conflicts')
    THEN RETURN jsonb_build_object('status','STALE'); END IF;$new$;
 IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
  RAISE EXCEPTION 'Could not find unique allocation conflict comparison';
 END IF;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$  -- Every chosen unit contributes all members, contiguously, in immutable order.$old$;
 new_fragment:=$new$  IF reading_experiment AND (
    (SELECT count(DISTINCT s->>'unitId') FROM jsonb_array_elements(selected) s)<>2
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(stock->'units') u
      WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(selected) s WHERE s->>'unitId'=u->>'id')
        AND NOT tsa_private.reading_experiment_unit_supported(u))) THEN
    RAISE EXCEPTION 'Invalid READING experiment bundle units' USING ERRCODE='23514';
  END IF;
  -- Every chosen unit contributes all members, contiguously, in immutable order.$new$;
 IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
  RAISE EXCEPTION 'Could not find unique selected-unit validation point';
 END IF;
 definition:=replace(definition,old_fragment,new_fragment);
 EXECUTE definition;
END;
$$;
