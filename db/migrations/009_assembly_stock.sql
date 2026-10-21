-- Private manifest input only. No student HTTP route or allocation authority.
CREATE FUNCTION tsa.assembly_standalone_stock(target_blueprint uuid) RETURNS jsonb
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
  -- The first adapter supports standalone inventory only. Never classify a
  -- partial pool as shortage when a shared-stimulus candidate may exist.
  IF EXISTS(SELECT 1 FROM tsa.questions q JOIN tsa.question_versions v ON v.id=q.eligible_version_id
    WHERE v.taxonomy_version_id=b.taxonomy_version_id AND v.section::text=b.config->'sections'->0->>'section'
      AND v.stimulus_version_id IS NOT NULL AND tsa.bank_question_selection_allowed(v.id)
      AND b.config->'allowedTypes' ? (v.interaction->>'type')
      AND NOT b.config->'excludedQuestionIds' ? v.question_id::text
      AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) s JOIN tsa.source_rights sr ON sr.source_version_id=s.id
        JOIN tsa.rights_decisions d ON d.id=sr.decision_id WHERE d.valid_to IS NOT NULL AND d.valid_to<horizon)) THEN
    RAISE EXCEPTION 'Bundle capture is not implemented' USING ERRCODE='0A000';
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT v.*,m.group_id FROM tsa.questions q JOIN tsa.question_versions v ON v.id=q.eligible_version_id
      JOIN tsa.duplicate_group_members m ON m.question_id=q.id
      JOIN tsa.duplicate_groups g ON g.id=m.group_id AND g.merged_into_id IS NULL
    WHERE v.taxonomy_version_id=b.taxonomy_version_id AND v.section::text=b.config->'sections'->0->>'section'
      AND b.config->'allowedTypes' ? (v.interaction->>'type')
      AND NOT b.config->'excludedQuestionIds' ? v.question_id::text
      AND v.stimulus_version_id IS NULL AND tsa.bank_question_selection_allowed(v.id)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v.skill_ids) tag(code) WHERE NOT EXISTS(SELECT 1 FROM tsa.taxonomy_nodes n WHERE n.taxonomy_version_id=v.taxonomy_version_id AND n.code=tag.code AND n.kind='SKILL'))
      AND NOT EXISTS(SELECT 1 FROM tsa.bank_question_sources(v.id) s JOIN tsa.source_rights sr ON sr.source_version_id=s.id
        JOIN tsa.rights_decisions d ON d.id=sr.decision_id WHERE d.valid_to IS NOT NULL AND d.valid_to<horizon)
    ORDER BY v.id LIMIT 10001
  ), used_sources AS (SELECT DISTINCT s.id FROM candidates c CROSS JOIN LATERAL tsa.bank_question_sources(c.id) s)
  SELECT jsonb_build_object(
    'blueprint',b.config,'blueprintHash',b.content_hash,'offeringRevision',b.offering_revision::text,
    'bankRevision',(SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1),
    'historyRevision',COALESCE((SELECT revision::text FROM tsa.student_allocation_state WHERE user_id=who),'0'),
    'historyQuestionIds',COALESCE((SELECT jsonb_agg(question_id ORDER BY question_id) FROM tsa.student_question_history WHERE user_id=who),'[]'::jsonb),
    'historyGroupIds',COALESCE((SELECT jsonb_agg(DISTINCT m.group_id ORDER BY m.group_id) FROM tsa.student_question_history h
      JOIN tsa.duplicate_group_members m ON m.question_id=h.question_id WHERE h.user_id=who),'[]'::jsonb),
    'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'questionId',c.question_id,'versionId',c.id,'contentHash',c.content_hash,'groupId',c.group_id,
      'section',c.section,'taxonomyVersionId',c.taxonomy_version_id,'interactionType',c.interaction->>'type',
      'skillIds',(SELECT COALESCE(jsonb_agg(n.id ORDER BY n.id),'[]'::jsonb) FROM jsonb_array_elements_text(c.skill_ids) tag(code) JOIN tsa.taxonomy_nodes n ON n.taxonomy_version_id=c.taxonomy_version_id AND n.code=tag.code AND n.kind='SKILL'),'cognitiveLevel',c.cognitive_level,'difficulty',c.difficulty->'target',
      'sourceIds',(SELECT jsonb_agg(s.id ORDER BY s.id) FROM tsa.bank_question_sources(c.id) s),
      'exposureCount',(SELECT count(*) FROM tsa.form_slots fs WHERE fs.question_id=c.question_id)) ORDER BY c.id) FROM candidates c),'[]'::jsonb),
    'rightsVersions',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceId',s.id,'versionId',d.id,'decision',to_jsonb(d)) ORDER BY s.id)
      FROM used_sources s JOIN tsa.source_rights sr ON sr.source_version_id=s.id JOIN tsa.rights_decisions d ON d.id=sr.decision_id),'[]'::jsonb),
    'conflicts',COALESCE((SELECT jsonb_agg(jsonb_build_object('leftUnitId',l.id,'rightUnitId',r.id) ORDER BY l.id,r.id)
      FROM candidates l JOIN candidates r ON l.id<r.id WHERE EXISTS(SELECT 1 FROM tsa.duplicate_relations d
        JOIN tsa.question_versions dl ON dl.id=d.left_version_id JOIN tsa.question_versions dr ON dr.id=d.right_version_id
        WHERE d.resolution='CONFIRMED' AND d.kind IN('EXACT','NEAR_DUPLICATE','ENEMY')
          AND ((dl.question_id=l.question_id AND dr.question_id=r.question_id) OR (dl.question_id=r.question_id AND dr.question_id=l.question_id)))),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION tsa.assembly_standalone_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.assembly_standalone_stock(uuid) TO tsa_exam;
