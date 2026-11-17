-- Narrow fixed-reference snapshots; never grant Bank access to personal assembly rows.
CREATE FUNCTION tsa.bank_fixed_reference_snapshot(actor_id uuid, run_id uuid)
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
