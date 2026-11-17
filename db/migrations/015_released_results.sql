-- Owner-only released review. Ordinary attempt views remain student-safe.
CREATE FUNCTION tsa.exam_attempt_access(target_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE result jsonb; a record; release_id uuid; authorized boolean;
BEGIN
  result:=tsa.exam_attempt_read(target_attempt);
  IF result IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=target_attempt AND user_id=tsa.assembly_candidate();
  IF a.state='GRADED' THEN
    SELECT r.id INTO release_id FROM tsa.result_releases r JOIN tsa.score_runs s
      ON s.id=r.score_run_id AND s.attempt_id=r.attempt_id AND s.policy_version=r.policy_version
      WHERE r.attempt_id=a.id AND r.score_run_id=a.latest_score_id AND r.revoked_at IS NULL
        AND s.policy_version='practice-binary-v1';
  END IF;
  authorized:=a.state='GRADED' AND release_id IS NOT NULL AND tsa.bank_form_delivery_allowed(a.form_id);
  result:=jsonb_set(result,'{guard,releaseAuthorized}',to_jsonb(authorized));
  result:=jsonb_set(result,'{guard,revision}',to_jsonb((result->'guard'->>'revision')||':'||
    COALESCE(a.latest_score_id::text,'-')||':'||COALESCE(release_id::text,'-')));
  RETURN result;
END;
$$;

CREATE FUNCTION tsa.exam_released_review(target_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE access jsonb; a record; s record; r record; domain tsa.question_section; items jsonb;
BEGIN
  access:=tsa.exam_attempt_access(target_attempt);
  IF access IS NULL OR access->'guard'->>'state'<>'GRADED'
    OR access->'guard'->'releaseAuthorized' IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
  SELECT * INTO STRICT a FROM tsa.attempts WHERE id=target_attempt AND user_id=tsa.assembly_candidate();
  SELECT * INTO STRICT s FROM tsa.score_runs WHERE id=a.latest_score_id AND attempt_id=a.id;
  SELECT * INTO r FROM tsa.result_releases WHERE attempt_id=a.id AND score_run_id=s.id
    AND policy_version=s.policy_version AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT section INTO STRICT domain FROM tsa.form_sections WHERE form_id=a.form_id;
  SELECT jsonb_agg(jsonb_build_object('slotId',fs.slot_id,'earned',si.earned,'response',ans.value,
    'question',jsonb_build_object('slotId',fs.slot_id,'sectionId',fs.section_id,'ordinal',fs.ordinal,
      'stimulus',fs.public_snapshot->'stimulus','content',fs.public_snapshot->'content','interaction',fs.public_snapshot->'interaction'),
    'correctAnswer',k.key_snapshot,'explanation',k.explanation_snapshot) ORDER BY fs.ordinal) INTO items
    FROM tsa.form_slots fs JOIN tsa.score_items si ON si.score_run_id=s.id AND si.form_id=fs.form_id AND si.slot_id=fs.slot_id
    JOIN tsa_private.form_slot_secrets k ON k.form_id=fs.form_id AND k.slot_id=fs.slot_id
    LEFT JOIN tsa.answers ans ON ans.attempt_id=a.id AND ans.form_id=fs.form_id AND ans.slot_id=fs.slot_id
    WHERE fs.form_id=a.form_id;
  RETURN jsonb_build_object('attemptId',a.id,'scoreRunId',s.id,'domain',domain,'formMode',a.form_mode,'reuseMode',a.reuse_mode,
    'policyVersion',s.policy_version,'scoreLabel','UNOFFICIAL_PRACTICE','correctCount',s.correct_count,'totalCount',s.total_count,
    'percentage',s.percentage::text,'sections',s.section_totals,'releasedAt',tsa.exam_instant(r.released_at),'items',items);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_attempt_access(uuid),tsa.exam_released_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_attempt_access(uuid),tsa.exam_released_review(uuid) TO tsa_exam;
