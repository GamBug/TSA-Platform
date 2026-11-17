-- Owner-bound topic practice profiles. Existing student DTOs and fixed profiles stay unchanged.
CREATE TABLE tsa_private.topic_practice_profiles (
  blueprint_version_id uuid PRIMARY KEY REFERENCES tsa.blueprint_versions(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES tsa.users(id) ON DELETE RESTRICT,
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  taxonomy_version_id uuid NOT NULL REFERENCES tsa.taxonomy_versions(id) ON DELETE RESTRICT,
  section tsa.question_section NOT NULL,
  topic_ids jsonb NOT NULL CHECK (jsonb_typeof(topic_ids)='array' AND jsonb_array_length(topic_ids) BETWEEN 1 AND 100),
  blueprint_hash text NOT NULL CHECK (blueprint_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  creation_key text NOT NULL CHECK(creation_key ~ '^[!-~]{1,128}$'),
  UNIQUE(owner_user_id,creation_key)
);
REVOKE ALL ON tsa_private.topic_practice_profiles FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_exam_worker;
CREATE TRIGGER topic_practice_profiles_immutable BEFORE UPDATE OR DELETE ON tsa_private.topic_practice_profiles
  FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_row();

CREATE FUNCTION tsa_private.canonical_jsonb(value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result text; item record;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      result:='{';
      FOR item IN SELECT key,val FROM jsonb_each(value) AS entry(key,val) ORDER BY key LOOP
        IF result<>'{' THEN result:=result||','; END IF;
        result:=result||to_json(item.key)::text||':'||tsa_private.canonical_jsonb(item.val);
      END LOOP;
      RETURN result||'}';
    WHEN 'array' THEN
      result:='[';
      FOR item IN SELECT val FROM jsonb_array_elements(value) WITH ORDINALITY entry(val,ordinal) ORDER BY ordinal LOOP
        IF result<>'[' THEN result:=result||','; END IF;
        result:=result||tsa_private.canonical_jsonb(item.val);
      END LOOP;
      RETURN result||']';
    ELSE RETURN value::text;
  END CASE;
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.canonical_jsonb(jsonb) FROM PUBLIC;

CREATE FUNCTION tsa_private.topic_practice_profile_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE who uuid:=tsa.assembly_candidate();
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM tsa_private.topic_practice_profiles p
    JOIN tsa.blueprint_versions b ON b.id=p.blueprint_version_id AND b.content_hash=p.blueprint_hash
    WHERE p.blueprint_version_id=target_blueprint AND p.owner_user_id=who
      AND p.taxonomy_version_id=b.taxonomy_version_id
      AND b.config->>'profileKind'='INDEPENDENT_PRACTICE'
      AND b.config->>'name' LIKE 'Topic practice/%'
      AND jsonb_typeof(b.config->'sections')='array'
      AND jsonb_array_length(b.config->'sections')=1
      AND b.config->'sections'->0->>'section'=p.section::text
      AND (b.config->'sections'->0->>'count')::integer BETWEEN 1 AND 100
      AND (b.config->'sections'->0->>'durationSeconds')::integer BETWEEN 60 AND 10800
      AND jsonb_array_length(b.config->'quotas')=0
  );
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.topic_practice_profile_supported(uuid) FROM PUBLIC;

CREATE FUNCTION tsa_private.topic_practice_profile_active(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
  SELECT COALESCE(current_setting('tsa.enable_topic_practice',true),'false')='true'
    AND current_setting('tsa.topic_practice_profile_id',true)=target_blueprint::text
    AND tsa_private.topic_practice_profile_supported(target_blueprint)
$$;
REVOKE ALL ON FUNCTION tsa_private.topic_practice_profile_active(uuid) FROM PUBLIC;

CREATE FUNCTION tsa_private.topic_practice_question_allowed(target_blueprint uuid,target_version uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
  SELECT tsa_private.topic_practice_profile_active(target_blueprint) AND EXISTS(
    WITH RECURSIVE selected_nodes(id,taxonomy_version_id,code,kind,parent_id) AS (
      SELECT n.id,n.taxonomy_version_id,n.code,n.kind,n.parent_id
      FROM tsa_private.topic_practice_profiles p
      CROSS JOIN LATERAL jsonb_array_elements_text(p.topic_ids) selected(id)
      JOIN tsa.taxonomy_nodes n ON n.id=selected.id::uuid AND n.taxonomy_version_id=p.taxonomy_version_id
      WHERE p.blueprint_version_id=target_blueprint
      UNION
      SELECT child.id,child.taxonomy_version_id,child.code,child.kind,child.parent_id
      FROM selected_nodes parent JOIN tsa.taxonomy_nodes child
        ON child.taxonomy_version_id=parent.taxonomy_version_id AND child.parent_id=parent.id
    )
    SELECT 1 FROM tsa.question_versions v
    WHERE v.id=target_version AND EXISTS(
      SELECT 1 FROM selected_nodes n WHERE n.taxonomy_version_id=v.taxonomy_version_id AND (
        (n.kind='DOMAIN' AND n.code=v.domain_id)
        OR EXISTS(SELECT 1 FROM tsa.question_taxonomy qt
          WHERE qt.question_version_id=v.id AND qt.taxonomy_version_id=v.taxonomy_version_id AND qt.node_code=n.code)
      )
    )
  )
$$;
REVOKE ALL ON FUNCTION tsa_private.topic_practice_question_allowed(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION tsa.exam_topic_practice_profile_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
BEGIN
  PERFORM tsa.assembly_candidate();
  RETURN tsa_private.topic_practice_profile_active(target_blueprint);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_topic_practice_profile_supported(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_topic_practice_profile_supported(uuid) TO tsa_exam;

CREATE FUNCTION tsa.exam_topic_catalog(requested_duration integer DEFAULT 120) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE who uuid:=tsa.assembly_candidate(); result jsonb;
BEGIN
  IF requested_duration IS NULL OR requested_duration NOT BETWEEN 60 AND 10800 THEN RAISE EXCEPTION 'Bounded practice duration required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  WITH RECURSIVE closure(taxonomy_version_id,ancestor_id,descendant_id) AS (
    SELECT taxonomy_version_id,id,id FROM tsa.taxonomy_nodes
    UNION
    SELECT c.taxonomy_version_id,c.ancestor_id,n.id FROM closure c
      JOIN tsa.taxonomy_nodes n ON n.taxonomy_version_id=c.taxonomy_version_id AND n.parent_id=c.descendant_id
  ), base AS MATERIALIZED (
    SELECT DISTINCT v.id,v.question_id,v.taxonomy_version_id,v.domain_id,v.stimulus_version_id,m.group_id,
      v.interaction->>'type' AS interaction_type,v.cognitive_level::text AS cognitive_level,
      v.difficulty->>'target' AS difficulty
    FROM tsa.questions q JOIN tsa.question_versions v ON v.id=q.eligible_version_id
    JOIN tsa.duplicate_group_members m ON m.question_id=q.id
    JOIN tsa.duplicate_groups g ON g.id=m.group_id AND g.merged_into_id IS NULL
    WHERE tsa.bank_question_selection_allowed(v.id)
      AND v.interaction->>'type' IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP')
      AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) src
        JOIN tsa.source_rights sr ON sr.source_version_id=src.id
        JOIN tsa.rights_decisions d ON d.id=sr.decision_id
        WHERE d.valid_to IS NOT NULL AND d.valid_to<clock_timestamp()+make_interval(secs=>requested_duration+600))
      AND NOT EXISTS(SELECT 1 FROM tsa.student_question_history h
        LEFT JOIN tsa.duplicate_group_members hm ON hm.question_id=h.question_id
        WHERE h.user_id=who AND (h.question_id=q.id OR hm.group_id=m.group_id))
  ), valid_bundles AS MATERIALIZED (
    SELECT b.id FROM tsa.bundles b WHERE
      (SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=b.id) BETWEEN 1 AND 200
      AND (SELECT min(ordinal) FROM tsa.bundle_members WHERE bundle_id=b.id)=0
      AND (SELECT max(ordinal)+1 FROM tsa.bundle_members WHERE bundle_id=b.id)=
        (SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members bm LEFT JOIN base c ON c.id=bm.question_version_id
        WHERE bm.bundle_id=b.id AND (c.id IS NULL OR c.stimulus_version_id IS DISTINCT FROM b.stimulus_version_id))
      AND (SELECT count(DISTINCT c.group_id) FROM tsa.bundle_members bm JOIN base c ON c.id=bm.question_version_id
        WHERE bm.bundle_id=b.id)=(SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members l JOIN tsa.bundle_members r ON r.bundle_id=l.bundle_id AND r.ordinal>l.ordinal
        JOIN tsa.duplicate_relations d ON ((d.left_version_id=l.question_version_id AND d.right_version_id=r.question_version_id)
          OR (d.left_version_id=r.question_version_id AND d.right_version_id=l.question_version_id))
        WHERE l.bundle_id=b.id AND d.resolution='CONFIRMED' AND d.kind IN('EXACT','NEAR_DUPLICATE','ENEMY'))
  ), eligible AS MATERIALIZED (
    SELECT c.* FROM base c WHERE (c.stimulus_version_id IS NULL AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members WHERE question_version_id=c.id))
      OR EXISTS(SELECT 1 FROM tsa.bundle_members bm JOIN valid_bundles b ON b.id=bm.bundle_id WHERE bm.question_version_id=c.id)
  ), node_members AS MATERIALIZED (
    SELECT DISTINCT n.id AS node_id,e.question_id,e.group_id,e.id AS version_id,e.interaction_type,e.cognitive_level,e.difficulty
    FROM tsa.taxonomy_nodes n JOIN closure c
      ON c.taxonomy_version_id=n.taxonomy_version_id AND c.ancestor_id=n.id
    JOIN eligible e ON e.taxonomy_version_id=n.taxonomy_version_id
    WHERE (n.kind='DOMAIN' AND n.code=e.domain_id)
      OR EXISTS(SELECT 1 FROM tsa.taxonomy_nodes descendant
        JOIN tsa.question_taxonomy qt ON qt.taxonomy_version_id=descendant.taxonomy_version_id
          AND qt.node_code=descendant.code AND qt.question_version_id=e.id
        WHERE descendant.id=c.descendant_id AND descendant.taxonomy_version_id=e.taxonomy_version_id)
  ), question_nodes AS MATERIALIZED (
    SELECT nm.* FROM node_members nm WHERE NOT EXISTS(
      SELECT 1 FROM tsa.bundle_members current_member JOIN tsa.bundle_members other ON other.bundle_id=current_member.bundle_id
      WHERE current_member.question_version_id=nm.version_id
        AND NOT EXISTS(SELECT 1 FROM node_members sibling WHERE sibling.node_id=nm.node_id AND sibling.version_id=other.question_version_id)
    )
  ), answered_versions AS MATERIALIZED (
    SELECT DISTINCT fs.question_version_id,fs.question_id,qv.taxonomy_version_id,qv.domain_id
    FROM tsa.attempts a JOIN tsa.form_slots fs ON fs.form_id=a.form_id
    JOIN tsa.answers ans ON ans.attempt_id=a.id AND ans.form_id=fs.form_id AND ans.slot_id=fs.slot_id
    JOIN tsa.question_versions qv ON qv.id=fs.question_version_id
    WHERE a.user_id=who AND tsa.bank_form_delivery_allowed(a.form_id) AND (
      ans.value->>'optionId' IS NOT NULL
      OR (jsonb_typeof(ans.value->'optionIds')='array' AND jsonb_array_length(ans.value->'optionIds')>0)
      OR EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(ans.value->'values')='object' THEN ans.value->'values' ELSE '{}'::jsonb END) choice WHERE choice.value<>'null'::jsonb)
    )
  ), attempted_nodes AS MATERIALIZED (
    SELECT DISTINCT n.id AS node_id,av.question_id FROM tsa.taxonomy_nodes n
    JOIN closure c ON c.taxonomy_version_id=n.taxonomy_version_id AND c.ancestor_id=n.id
    JOIN answered_versions av ON av.taxonomy_version_id=n.taxonomy_version_id
    WHERE (n.kind='DOMAIN' AND n.code=av.domain_id)
      OR EXISTS(SELECT 1 FROM tsa.taxonomy_nodes descendant JOIN tsa.question_taxonomy qt
        ON qt.taxonomy_version_id=descendant.taxonomy_version_id AND qt.node_code=descendant.code AND qt.question_version_id=av.question_version_id
        WHERE descendant.id=c.descendant_id AND descendant.taxonomy_version_id=av.taxonomy_version_id)
  ), graded AS MATERIALIZED (
    SELECT DISTINCT a.id AS attempt_id,fs.slot_id,fs.question_version_id,fs.question_id,qv.taxonomy_version_id,qv.domain_id,si.earned
    FROM tsa.attempts a JOIN tsa.score_runs sr ON sr.id=a.latest_score_id AND sr.attempt_id=a.id
    JOIN tsa.result_releases rr ON rr.score_run_id=sr.id AND rr.attempt_id=a.id
      AND rr.policy_version=sr.policy_version AND rr.revoked_at IS NULL
    JOIN tsa.form_slots fs ON fs.form_id=a.form_id
    JOIN tsa.question_versions qv ON qv.id=fs.question_version_id
    JOIN tsa.score_items si ON si.score_run_id=sr.id AND si.form_id=fs.form_id AND si.slot_id=fs.slot_id
    JOIN tsa.answers ans ON ans.attempt_id=a.id AND ans.form_id=fs.form_id AND ans.slot_id=fs.slot_id
    WHERE a.user_id=who AND a.state='GRADED' AND ans.value IS NOT NULL AND ans.value<>'null'::jsonb
      AND tsa.bank_form_delivery_allowed(a.form_id)
  ), graded_nodes AS MATERIALIZED (
    SELECT DISTINCT n.id AS node_id,g.attempt_id,g.slot_id,g.question_version_id,g.question_id,g.earned
    FROM tsa.taxonomy_nodes n JOIN closure c
      ON c.taxonomy_version_id=n.taxonomy_version_id AND c.ancestor_id=n.id
    JOIN graded g ON g.taxonomy_version_id=n.taxonomy_version_id
    WHERE (n.kind='DOMAIN' AND n.code=g.domain_id)
      OR EXISTS(SELECT 1 FROM tsa.taxonomy_nodes descendant
        JOIN tsa.question_taxonomy qt ON qt.taxonomy_version_id=descendant.taxonomy_version_id
          AND qt.node_code=descendant.code AND qt.question_version_id=g.question_version_id
        WHERE descendant.id=c.descendant_id AND descendant.taxonomy_version_id=g.taxonomy_version_id)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'taxonomyVersionId',tv.id,'name',tv.name,'versionNo',tv.version_no,
    'nodes',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',n.id,'code',n.code,'kind',n.kind,'parentId',n.parent_id,
      'label',COALESCE(n.metadata->>'label',n.metadata->>'name',n.metadata->>'labelVi',n.code),
      'questionFamily',n.metadata->'questionFamily',
      'eligibleCount',(SELECT count(DISTINCT qn.group_id)::integer FROM question_nodes qn WHERE qn.node_id=n.id),
      'attemptedCount',(SELECT count(DISTINCT an.question_id)::integer FROM attempted_nodes an WHERE an.node_id=n.id),
      'accuracy',(SELECT round(100.0*sum(gn.earned)::numeric/count(*),2) FROM graded_nodes gn WHERE gn.node_id=n.id),
      'interactionTypes',(SELECT COALESCE(jsonb_agg(DISTINCT qn.interaction_type ORDER BY qn.interaction_type),'[]'::jsonb)
        FROM question_nodes qn WHERE qn.node_id=n.id),
      'cognitiveLevels',(SELECT COALESCE(jsonb_agg(DISTINCT qn.cognitive_level ORDER BY qn.cognitive_level)
        FILTER(WHERE qn.cognitive_level IS NOT NULL),'[]'::jsonb) FROM question_nodes qn WHERE qn.node_id=n.id),
      'difficulties',(SELECT COALESCE(jsonb_agg(DISTINCT qn.difficulty ORDER BY qn.difficulty)
        FILTER(WHERE qn.difficulty IS NOT NULL),'[]'::jsonb) FROM question_nodes qn WHERE qn.node_id=n.id)
    ) ORDER BY n.code),'[]'::jsonb) FROM tsa.taxonomy_nodes n WHERE n.taxonomy_version_id=tv.id)
  ) ORDER BY tv.name,tv.version_no DESC,tv.id),'[]'::jsonb) INTO result FROM tsa.taxonomy_versions tv;
  RETURN jsonb_build_object('taxonomies',result);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_topic_catalog(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_topic_catalog(integer) TO tsa_exam;

CREATE FUNCTION tsa.exam_topic_practice_lookup(creation_key text,body_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE who uuid:=tsa.assembly_candidate(); profile record;
BEGIN
  IF creation_key IS NULL OR creation_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid topic lookup' USING ERRCODE='22023';
  END IF;
  SELECT p.*,b.config INTO profile FROM tsa_private.topic_practice_profiles p
    JOIN tsa.blueprint_versions b ON b.id=p.blueprint_version_id AND b.content_hash=p.blueprint_hash
    WHERE p.owner_user_id=who AND p.creation_key=exam_topic_practice_lookup.creation_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','ABSENT'); END IF;
  IF profile.request_hash<>body_hash THEN RETURN jsonb_build_object('status','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('status','READY','blueprintVersionId',profile.blueprint_version_id,
    'taxonomyVersionId',profile.taxonomy_version_id,'topicIds',profile.topic_ids,'domain',profile.section::text,
    'questionCount',(profile.config->'sections'->0->>'count')::integer,
    'durationSeconds',(profile.config->'sections'->0->>'durationSeconds')::integer,
    'hasReceipt',EXISTS(SELECT 1 FROM tsa.idempotency_records r WHERE r.actor_id=who
      AND r.route_scope='POST /api/v1/attempts' AND r.idempotency_key=exam_topic_practice_lookup.creation_key));
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_topic_practice_lookup(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_topic_practice_lookup(text,text) TO tsa_exam;

CREATE FUNCTION tsa.exam_topic_practice_prepare(
  selected_taxonomy uuid, selected_ids uuid[], requested_count integer, requested_duration integer,
  creation_key text, body_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE who uuid:=tsa.assembly_candidate(); selected_json jsonb; root_code text; selected_section tsa.question_section;
  available integer; request_hash text; profile_id uuid; blueprint_id uuid; config jsonb; config_hash text;
  root_ids uuid[]; root_sections text[]; stored_hash text; active_attempt jsonb;
BEGIN
  IF selected_taxonomy IS NULL OR selected_ids IS NULL OR cardinality(selected_ids)<1 OR cardinality(selected_ids)>100
    OR cardinality(selected_ids)<>(SELECT count(DISTINCT x) FROM unnest(selected_ids) x)
    OR requested_count IS NULL OR requested_count NOT BETWEEN 1 AND 100
    OR requested_duration IS NULL OR requested_duration NOT BETWEEN 60 AND 10800 THEN
    RAISE EXCEPTION 'Invalid topic practice request' USING ERRCODE='22023';
  END IF;
  IF creation_key IS NULL OR creation_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid topic creation key' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM tsa.taxonomy_nodes WHERE taxonomy_version_id=selected_taxonomy AND id=ANY(selected_ids)
       AND kind IN('DOMAIN','SKILL','SUBSKILL'))<>cardinality(selected_ids) THEN
    RAISE EXCEPTION 'Invalid topic selection' USING ERRCODE='22023';
  END IF;
  WITH RECURSIVE ancestry(selected_id,id,parent_id,kind,code,metadata) AS (
    SELECT n.id,n.id,n.parent_id,n.kind,n.code,n.metadata FROM tsa.taxonomy_nodes n
      WHERE n.taxonomy_version_id=selected_taxonomy AND n.id=ANY(selected_ids)
    UNION
    SELECT a.selected_id,p.id,p.parent_id,p.kind,p.code,p.metadata FROM ancestry a
      JOIN tsa.taxonomy_nodes p ON p.id=a.parent_id AND p.taxonomy_version_id=selected_taxonomy
  ) SELECT array_agg(DISTINCT id),array_agg(DISTINCT COALESCE(metadata->>'section',code))
    INTO root_ids,root_sections FROM ancestry WHERE kind='DOMAIN' AND parent_id IS NULL;
  IF cardinality(root_ids) IS DISTINCT FROM 1 OR cardinality(root_sections) IS DISTINCT FROM 1
    OR root_sections[1] NOT IN('MATH','READING','SCIENCE') THEN
    RAISE EXCEPTION 'Choose one registered domain and section' USING ERRCODE='22023';
  END IF;
  selected_section:=root_sections[1]::tsa.question_section;
  SELECT COALESCE(jsonb_agg(to_jsonb(id::text) ORDER BY id),'[]'::jsonb) INTO selected_json
    FROM (SELECT DISTINCT id FROM unnest(selected_ids) s(id)) sorted;
  request_hash:='sha256:'||encode(sha256(convert_to(tsa_private.canonical_jsonb(jsonb_build_object(
    'taxonomyVersionId',selected_taxonomy,'topicIds',selected_json,
    'questionCount',requested_count,'durationSeconds',requested_duration)),'UTF8')),'hex');
  IF request_hash<>body_hash THEN RAISE EXCEPTION 'Invalid request hash' USING ERRCODE='22023'; END IF;
  PERFORM tsa.assembly_user_lock();
  SELECT p.blueprint_version_id,p.request_hash INTO profile_id,stored_hash FROM tsa_private.topic_practice_profiles p
    WHERE p.owner_user_id=who AND p.creation_key=exam_topic_practice_prepare.creation_key;
  IF profile_id IS NOT NULL AND stored_hash<>body_hash THEN RETURN jsonb_build_object('status','IDEMPOTENCY_CONFLICT'); END IF;
  IF profile_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM tsa.idempotency_records WHERE actor_id=who
        AND route_scope='POST /api/v1/attempts' AND idempotency_key=exam_topic_practice_prepare.creation_key) THEN
      UPDATE tsa.blueprint_offerings SET available_until=greatest(available_until,clock_timestamp()+interval '10 minutes'),
        revision=revision+1 WHERE blueprint_version_id=profile_id;
    END IF;
    RETURN jsonb_build_object('status','READY','blueprintVersionId',profile_id,'taxonomyVersionId',selected_taxonomy,
      'topicIds',selected_json,'domain',selected_section::text,'questionCount',requested_count,'durationSeconds',requested_duration);
  END IF;
  active_attempt:=tsa.assembly_active_state(true);
  IF active_attempt->>'status'<>'READY' THEN RETURN active_attempt; END IF;
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  WITH matching AS MATERIALIZED (
    SELECT v.*,m.group_id
  FROM tsa.questions q JOIN tsa.question_versions v ON v.id=q.eligible_version_id
  JOIN tsa.duplicate_group_members m ON m.question_id=q.id
  JOIN tsa.duplicate_groups g ON g.id=m.group_id AND g.merged_into_id IS NULL
  WHERE v.taxonomy_version_id=selected_taxonomy AND v.section=selected_section
    AND tsa.bank_question_selection_allowed(v.id)
    AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) src
      JOIN tsa.source_rights sr ON sr.source_version_id=src.id JOIN tsa.rights_decisions d ON d.id=sr.decision_id
      WHERE d.valid_to IS NOT NULL AND d.valid_to<clock_timestamp()+make_interval(secs=>requested_duration+600))
    AND EXISTS(
      WITH RECURSIVE selected_nodes(id,taxonomy_version_id,code,kind,parent_id) AS (
        SELECT n.id,n.taxonomy_version_id,n.code,n.kind,n.parent_id FROM unnest(selected_ids) s(id)
          JOIN tsa.taxonomy_nodes n ON n.id=s.id AND n.taxonomy_version_id=selected_taxonomy
        UNION SELECT child.id,child.taxonomy_version_id,child.code,child.kind,child.parent_id
          FROM selected_nodes parent JOIN tsa.taxonomy_nodes child
            ON child.taxonomy_version_id=parent.taxonomy_version_id AND child.parent_id=parent.id
      ) SELECT 1 FROM selected_nodes n WHERE
        (n.kind='DOMAIN' AND n.code=v.domain_id)
        OR EXISTS(SELECT 1 FROM tsa.question_taxonomy qt WHERE qt.question_version_id=v.id AND qt.node_code=n.code)
    )
    AND NOT EXISTS(SELECT 1 FROM tsa.student_question_history h
      LEFT JOIN tsa.duplicate_group_members hm ON hm.question_id=h.question_id
      WHERE h.user_id=who AND (h.question_id=q.id OR hm.group_id=m.group_id))  ), valid_bundles AS MATERIALIZED (
    SELECT b.id FROM tsa.bundles b WHERE
      (SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=b.id) BETWEEN 1 AND 200
      AND (SELECT min(ordinal) FROM tsa.bundle_members WHERE bundle_id=b.id)=0
      AND (SELECT max(ordinal)+1 FROM tsa.bundle_members WHERE bundle_id=b.id)=
        (SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members bm LEFT JOIN matching c ON c.id=bm.question_version_id
        WHERE bm.bundle_id=b.id AND (c.id IS NULL OR c.stimulus_version_id IS DISTINCT FROM b.stimulus_version_id))
      AND (SELECT count(DISTINCT c.group_id) FROM tsa.bundle_members bm JOIN matching c ON c.id=bm.question_version_id
        WHERE bm.bundle_id=b.id)=(SELECT count(*) FROM tsa.bundle_members WHERE bundle_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members l JOIN tsa.bundle_members r ON r.bundle_id=l.bundle_id AND r.ordinal>l.ordinal
        JOIN tsa.duplicate_relations d ON ((d.left_version_id=l.question_version_id AND d.right_version_id=r.question_version_id)
          OR (d.left_version_id=r.question_version_id AND d.right_version_id=l.question_version_id))
        WHERE l.bundle_id=b.id AND d.resolution='CONFIRMED' AND d.kind IN('EXACT','NEAR_DUPLICATE','ENEMY'))
  ) SELECT count(DISTINCT c.group_id)::integer INTO available FROM matching c
    WHERE (c.stimulus_version_id IS NULL AND NOT EXISTS(SELECT 1 FROM tsa.bundle_members WHERE question_version_id=c.id))
      OR EXISTS(SELECT 1 FROM tsa.bundle_members bm JOIN valid_bundles b ON b.id=bm.bundle_id WHERE bm.question_version_id=c.id);
  IF available<requested_count THEN
    RETURN jsonb_build_object('status','INSUFFICIENT','requestedCount',requested_count,'availableQuestionCount',available);
  END IF;

    profile_id:=gen_random_uuid(); blueprint_id:=gen_random_uuid();
    config:=jsonb_build_object(
      'schemaVersion','blueprint/1','name','Topic practice/'||selected_section::text||'/'||profile_id::text,
      'taxonomyVersionId',selected_taxonomy,'profileKind','INDEPENDENT_PRACTICE','evidenceIds',jsonb_build_array('topic-practice/1'),
      'sections',jsonb_build_array(jsonb_build_object('id','topic-practice','section',selected_section::text,
        'count',requested_count,'durationSeconds',requested_duration)),
      'allowedTypes',jsonb_build_array('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP'),
      'quotas','[]'::jsonb,'maxPerSource','null'::jsonb,'excludedQuestionIds','[]'::jsonb,
      'bundlePolicy','ALL_OR_NONE','scoringPolicy','practice-binary-v1','releasePolicy','after-grade-v1');
    config_hash:='sha256:'||encode(sha256(convert_to(tsa_private.canonical_jsonb(config),'UTF8')),'hex');
    INSERT INTO tsa.blueprints(id,name) VALUES(blueprint_id,config->>'name');
    INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES(profile_id,blueprint_id,selected_taxonomy,1,'blueprint/1',config,config_hash);
    INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES(profile_id,true,clock_timestamp(),clock_timestamp()+interval '10 minutes',600);
    INSERT INTO tsa_private.topic_practice_profiles(blueprint_version_id,owner_user_id,request_hash,
      taxonomy_version_id,section,topic_ids,blueprint_hash,creation_key)
      VALUES(profile_id,who,request_hash,selected_taxonomy,selected_section,selected_json,config_hash,creation_key);
  RETURN jsonb_build_object('status','READY','blueprintVersionId',profile_id,'taxonomyVersionId',selected_taxonomy,
    'topicIds',selected_json,'domain',selected_section::text,'questionCount',requested_count,'durationSeconds',requested_duration,
    'availableQuestionCount',available);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_topic_practice_prepare(uuid,uuid[],integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_topic_practice_prepare(uuid,uuid[],integer,integer,text,text) TO tsa_exam;

-- Filter the existing capture and commit recheck by selected hierarchy, including subskills.
DO $$
DECLARE definition text; old_fragment text; new_fragment text;
BEGIN
  definition:=pg_get_functiondef('tsa.assembly_standalone_stock(uuid)'::regprocedure);
  old_fragment:=$old$WHERE v.taxonomy_version_id=b.taxonomy_version_id AND v.section::text=b.config->'sections'->0->>'section'
      AND b.config->'allowedTypes' ? (v.interaction->>'type')$old$;
  new_fragment:=$new$WHERE v.taxonomy_version_id=b.taxonomy_version_id AND v.section::text=b.config->'sections'->0->>'section'
      AND (NOT EXISTS(SELECT 1 FROM tsa_private.topic_practice_profiles p WHERE p.blueprint_version_id=b.id)
        OR tsa_private.topic_practice_question_allowed(b.id,v.id))
      AND b.config->'allowedTypes' ? (v.interaction->>'type')$new$;
  IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
    RAISE EXCEPTION 'Could not locate the unique standalone candidate boundary';
  END IF;
  EXECUTE replace(definition,old_fragment,new_fragment);

  definition:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
  old_fragment:=$old$OR (COALESCE(current_setting('tsa.enable_reading_experiment',true),'false')='true'
        AND tsa_private.reading_experiment_supported(b.id)))))$old$;
  new_fragment:=$new$OR (COALESCE(current_setting('tsa.enable_reading_experiment',true),'false')='true'
        AND tsa_private.reading_experiment_supported(b.id))
       OR (COALESCE(current_setting('tsa.enable_topic_practice',true),'false')='true'
        AND tsa_private.topic_practice_profile_active(b.id)))))$new$;
  IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
    RAISE EXCEPTION 'Could not locate the unique personal profile guard';
  END IF;
  EXECUTE replace(definition,old_fragment,new_fragment);
END $$;

-- Topic recipes are private selections rather than generally offered exams.
DO $$
DECLARE definition text; name text; old_fragment text; new_fragment text;
BEGIN
  FOREACH name IN ARRAY ARRAY['tsa.exam_catalog_page(integer,uuid)','tsa.exam_short_catalog_page(integer,uuid)'] LOOP
    definition:=pg_get_functiondef(name::regprocedure);
    old_fragment:='WHERE o.enabled AND clock_timestamp()<o.available_until';
    IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Catalog boundary is missing'; END IF;
    new_fragment:='WHERE o.enabled AND clock_timestamp()<o.available_until AND NOT EXISTS(SELECT 1 FROM tsa_private.topic_practice_profiles p WHERE p.blueprint_version_id=b.id)';
    EXECUTE replace(definition,old_fragment,new_fragment);
  END LOOP;
  definition:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
  old_fragment:='SELECT * INTO b FROM tsa.blueprint_versions WHERE id=(m->>''blueprintVersionId'')::uuid;';
  IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Allocation ownership boundary is missing'; END IF;
  new_fragment:=old_fragment||$guard$
  IF EXISTS(SELECT 1 FROM tsa_private.topic_practice_profiles p WHERE p.blueprint_version_id=b.id)
    AND (m->>'reuseMode'<>'NEW_ONLY' OR NOT tsa_private.topic_practice_profile_active(b.id)) THEN
    RAISE EXCEPTION 'Owned topic context required' USING ERRCODE='42501';
  END IF;
$guard$;
  EXECUTE replace(definition,old_fragment,new_fragment);
END $$;
