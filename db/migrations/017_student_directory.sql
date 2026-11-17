-- Existing frozen catalog/history GETs. Internal envelopes stay server-side.
CREATE FUNCTION tsa.exam_catalog_page(page_limit integer,after_blueprint uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE result jsonb; ids uuid[]; shown uuid[]; next_id uuid;
BEGIN
  PERFORM tsa.assembly_candidate();
  IF page_limit IS NULL OR page_limit<1 OR page_limit>100 THEN
    RAISE EXCEPTION 'Bounded catalog page required' USING ERRCODE='22023';
  END IF;
  WITH offered AS (
    SELECT b.id,b.config,o.available_from,o.available_until,
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
        OR (sections->0->>'section'='SCIENCE' AND sections->0->'count'='4'::jsonb))
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

CREATE FUNCTION tsa.exam_history_page(page_limit integer,before_created timestamptz DEFAULT NULL,before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
DECLARE who uuid:=tsa.assembly_candidate(); ids uuid[]; shown uuid[]; target uuid;
  result jsonb; next_cursor jsonb; last_created timestamptz; last_id uuid;
BEGIN
  IF page_limit IS NULL OR page_limit<1 OR page_limit>100
    OR (before_created IS NULL)<>(before_id IS NULL)
    OR (before_created IS NOT NULL AND NOT isfinite(before_created)) THEN
    RAISE EXCEPTION 'Bounded history page required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(1414742321,1);
  PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
  SELECT COALESCE(array_agg(id ORDER BY created_at DESC,id DESC),'{}'::uuid[]) INTO ids FROM (
    SELECT id,created_at FROM tsa.attempts WHERE user_id=who
      AND (before_created IS NULL OR (created_at,id)<(before_created,before_id))
    ORDER BY created_at DESC,id DESC LIMIT page_limit+1
  ) candidates;
  shown:=ids[1:page_limit];
  -- Lock overlapping pages in one stable order, compatible with hold fanout.
  FOR target IN SELECT unnest(shown) ORDER BY 1 LOOP
    PERFORM tsa.exam_reconcile_attempt(target);
  END LOOP;
  IF cardinality(ids)>page_limit THEN
    SELECT created_at,id INTO last_created,last_id FROM tsa.attempts WHERE id=shown[page_limit] AND user_id=who;
    next_cursor:=jsonb_build_object('createdAt',tsa.exam_instant(last_created),'id',last_id);
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('attemptId',a.id,'formId',a.form_id,'domain',section.section,
    'formMode',a.form_mode,'reuseMode',a.reuse_mode,'state',a.state,'startedAt',tsa.exam_instant(a.started_at),
    'closedAt',tsa.exam_instant(a.closed_at),
    'score',CASE WHEN a.state='GRADED' AND tsa.bank_form_delivery_allowed(a.form_id) THEN (
      SELECT jsonb_build_object('correctCount',s.correct_count,'totalCount',s.total_count,'percentage',s.percentage::text)
      FROM tsa.score_runs s JOIN tsa.result_releases r ON r.score_run_id=s.id AND r.attempt_id=s.attempt_id AND r.policy_version=s.policy_version
      WHERE s.id=a.latest_score_id AND s.attempt_id=a.id AND s.policy_version='practice-binary-v1' AND r.revoked_at IS NULL
    ) ELSE NULL END) ORDER BY a.created_at DESC,a.id DESC),'[]'::jsonb) INTO result
    FROM tsa.attempts a JOIN tsa.form_sections section ON section.form_id=a.form_id
    WHERE a.user_id=who AND a.id=ANY(shown);
  RETURN jsonb_build_object('items',result,'next',next_cursor);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_catalog_page(integer,uuid),tsa.exam_history_page(integer,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_catalog_page(integer,uuid),tsa.exam_history_page(integer,timestamptz,uuid) TO tsa_exam;
