-- Versioned numeric practice. Existing question/1 rows and v1 wire contracts stay closed.
ALTER TABLE tsa.question_versions DROP CONSTRAINT question_versions_schema_version_check;
ALTER TABLE tsa.question_versions DROP CONSTRAINT question_versions_interaction_check1;
ALTER TABLE tsa.question_versions ADD CONSTRAINT question_versions_schema_version_check
 CHECK(schema_version IN ('question/1','question/2'));
ALTER TABLE tsa.question_versions ADD CONSTRAINT question_versions_schema_interaction_check CHECK(COALESCE(
 (schema_version='question/1' AND interaction->>'type' IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP')) OR
 (schema_version='question/2' AND interaction->>'type' IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP','NUMERIC_RESPONSE')),false));
ALTER TABLE tsa.blueprint_versions DROP CONSTRAINT blueprint_versions_schema_version_check;
ALTER TABLE tsa.blueprint_versions ADD CONSTRAINT blueprint_versions_schema_version_check CHECK(schema_version IN('blueprint/1','blueprint/2'));
ALTER TABLE tsa_private.question_delivery_checks DROP CONSTRAINT question_delivery_checks_profile_check;
ALTER TABLE tsa_private.question_delivery_checks ADD CONSTRAINT question_delivery_checks_profile_check CHECK(profile IN(
 'text-math-table/1','text-math-table-inspected-image/2','text-math-table-numeric/2','text-math-table-inspected-image-numeric/3'));

CREATE FUNCTION tsa.exam_normalize_decimal(raw_value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE value text; whole text; fraction text; negative boolean;
BEGIN
 IF char_length(raw_value)>64 THEN RETURN NULL; END IF;
 -- Pin the same Unicode outer whitespace set as JavaScript String.trim().
 value:=btrim(raw_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 IF value !~ '^[+-]?[0-9]{1,40}([.,][0-9]{1,20})?$' THEN RETURN NULL; END IF;
 negative:=left(value,1)='-';
 IF left(value,1) IN('+','-') THEN value:=substr(value,2); END IF;
 value:=replace(value,',','.'); whole:=ltrim(split_part(value,'.',1),'0');
 IF whole='' THEN whole:='0'; END IF;
 fraction:=rtrim(split_part(value,'.',2),'0');
 IF whole='0' AND fraction='' THEN RETURN '0'; END IF;
 RETURN CASE WHEN negative THEN '-' ELSE '' END||whole||CASE WHEN fraction<>'' THEN '.'||fraction ELSE '' END;
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_normalize_decimal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_normalize_decimal(text) TO tsa_exam,tsa_bank,tsa_exam_worker;

CREATE TABLE tsa_private.numeric_practice_profiles(
 blueprint_version_id uuid PRIMARY KEY REFERENCES tsa.blueprint_versions(id),
 blueprint_hash text NOT NULL CHECK(blueprint_hash ~ '^sha256:[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER numeric_profiles_immutable BEFORE UPDATE OR DELETE ON tsa_private.numeric_practice_profiles
 FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
REVOKE ALL ON tsa_private.numeric_practice_profiles FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_identity,tsa_exam_worker;

CREATE FUNCTION tsa_private.numeric_practice_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa_private.numeric_practice_profiles p JOIN tsa.blueprint_versions b
  ON b.id=p.blueprint_version_id AND b.content_hash=p.blueprint_hash
  WHERE b.id=target_blueprint AND b.schema_version='blueprint/2' AND b.config->>'schemaVersion'='blueprint/2'
   AND b.config->>'profileKind'='INDEPENDENT_PRACTICE' AND b.config->>'scoringPolicy'='practice-binary-v2'
   AND b.config->>'releasePolicy'='after-grade-v1' AND jsonb_array_length(b.config->'sections')=1
   AND jsonb_array_length(b.config->'allowedTypes') BETWEEN 1 AND 4
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b.config->'allowedTypes') kind
    WHERE kind NOT IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP','NUMERIC_RESPONSE'))
   AND (b.config->'sections'->0->>'count')::integer BETWEEN 1 AND 100
   AND (b.config->'sections'->0->>'durationSeconds')::integer BETWEEN 1 AND 10800)
$$;
CREATE FUNCTION tsa_private.numeric_practice_active(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT COALESCE(current_setting('tsa.enable_numeric_practice',true),'false')='true'
  AND tsa_private.numeric_practice_supported(target_blueprint)
$$;
CREATE FUNCTION tsa.exam_numeric_practice_profile_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
BEGIN
 PERFORM tsa.assembly_candidate(); RETURN tsa_private.numeric_practice_supported(target_blueprint);
END;
$$;
CREATE FUNCTION tsa_private.practice_question_compatible(target_blueprint uuid,target_question uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.blueprint_versions b CROSS JOIN tsa.question_versions q
  JOIN tsa_private.question_secrets s ON s.question_version_id=q.id
  WHERE b.id=target_blueprint AND q.id=target_question AND
   ((b.schema_version='blueprint/1' AND q.schema_version='question/1' AND s.scoring_policy_version='practice-binary-v1') OR
    (b.schema_version='blueprint/2' AND q.schema_version='question/2' AND s.scoring_policy_version='practice-binary-v2'
     AND tsa_private.numeric_practice_active(b.id))))
$$;
CREATE FUNCTION tsa_private.attempt_protocol_allowed(target_attempt uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
  WHERE a.id=target_attempt AND a.user_id::text=nullif(current_setting('tsa.local_user_id',true),'')
   AND (f.policy_versions->>'scoring'='practice-binary-v1' OR
    (f.policy_versions->>'scoring'='practice-binary-v2' AND tsa_private.numeric_practice_active(f.blueprint_version_id))))
$$;
REVOKE ALL ON FUNCTION tsa_private.numeric_practice_supported(uuid),tsa_private.numeric_practice_active(uuid),
 tsa_private.practice_question_compatible(uuid,uuid),tsa_private.attempt_protocol_allowed(uuid),tsa.exam_numeric_practice_profile_supported(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_numeric_practice_profile_supported(uuid) TO tsa_exam;

-- Preserve function OIDs, owners and ACLs; each replacement asserts its source seam.
DO $$
DECLARE definition text; fragment text;
BEGIN
 definition:=pg_get_functiondef('tsa.exam_response_valid(jsonb,jsonb)'::regprocedure);
 fragment:=$old$IF kind='SINGLE_CHOICE' THEN$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing response type dispatch'; END IF;
 EXECUTE replace(definition,fragment,$new$IF kind='NUMERIC_RESPONSE' THEN
   RETURN COALESCE(interaction->>'format'='DECIMAL' AND jsonb_typeof(interaction->'label')='string'
    AND char_length(interaction->>'label') BETWEEN 1 AND 200
    AND response_value ? 'value' AND (response_value->'value'='null'::jsonb OR
     (jsonb_typeof(response_value->'value')='string' AND tsa.exam_normalize_decimal(response_value->>'value') IS NOT NULL)),false);
  ELSIF kind='SINGLE_CHOICE' THEN$new$);

 definition:=pg_get_functiondef('tsa.exam_binary_earned(jsonb,jsonb,jsonb)'::regprocedure);
 fragment:=$old$BEGIN
  IF NOT COALESCE(tsa.exam_response_valid(interaction,answer_key),false)$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing grading dispatch'; END IF;
 EXECUTE replace(definition,fragment,$new$BEGIN
  IF kind='NUMERIC_RESPONSE' THEN
   IF NOT COALESCE(tsa.exam_response_valid(interaction,answer_key),false)
    OR jsonb_typeof(answer_key->'value') IS DISTINCT FROM 'string'
    OR answer_key->>'value' IS DISTINCT FROM tsa.exam_normalize_decimal(answer_key->>'value') THEN
    RAISE EXCEPTION 'Invalid frozen numeric key' USING ERRCODE='22023';
   END IF;
   IF response IS NULL OR response='null'::jsonb THEN RETURN 0; END IF;
   IF NOT COALESCE(tsa.exam_response_valid(interaction,response),false) THEN
    RAISE EXCEPTION 'Invalid frozen numeric response' USING ERRCODE='22023';
   END IF;
   RETURN CASE WHEN tsa.exam_normalize_decimal(response->>'value')=answer_key->>'value' THEN 1 ELSE 0 END;
  END IF;
  IF NOT COALESCE(tsa.exam_response_valid(interaction,answer_key),false)$new$);
END $$;

CREATE FUNCTION tsa.exam_numeric_catalog_page(page_limit integer,after_blueprint uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE ids uuid[]; shown uuid[]; next_id uuid; result jsonb;
BEGIN
 PERFORM tsa.assembly_candidate();
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Bounded catalog required' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO ids FROM (
  SELECT b.id FROM tsa.blueprint_versions b JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
  WHERE o.enabled AND clock_timestamp()<o.available_until AND (after_blueprint IS NULL OR b.id>after_blueprint)
   AND tsa_private.numeric_practice_active(b.id) ORDER BY b.id LIMIT page_limit+1) offered;
 shown:=ids[1:page_limit]; IF cardinality(ids)>page_limit THEN next_id:=shown[page_limit]; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('config',b.config,'entry',jsonb_build_object(
  'name',b.config->>'name','domain',b.config->'sections'->0->>'section',
  'questionCount',b.config->'sections'->0->'count','durationSeconds',b.config->'sections'->0->'durationSeconds',
  'profileKind','INDEPENDENT_PRACTICE','availableFrom',tsa.exam_instant(o.available_from),
  'availableUntil',tsa.exam_instant(o.available_until),'mode','PERSONALIZED_PRACTICE','blueprintVersionId',b.id,'reviewAllowed',false))
  ORDER BY b.id),'[]'::jsonb) INTO result FROM tsa.blueprint_versions b JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
  WHERE b.id=ANY(shown) AND o.enabled AND clock_timestamp()<o.available_until AND tsa_private.numeric_practice_active(b.id);
 RETURN jsonb_build_object('items',result,'next',next_id);
END;
$$;
REVOKE ALL ON FUNCTION tsa.exam_numeric_catalog_page(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_numeric_catalog_page(integer,uuid) TO tsa_exam;

CREATE FUNCTION tsa_private.attempt_api_root() RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN COALESCE(current_setting('tsa.enable_numeric_practice',true),'false')='true' THEN '/api/v2/attempts' ELSE '/api/v1/attempts' END
$$;
REVOKE ALL ON FUNCTION tsa_private.attempt_api_root() FROM PUBLIC;

CREATE FUNCTION tsa_private.guard_question_protocol() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
DECLARE version text;
BEGIN
 SELECT schema_version INTO STRICT version FROM tsa.question_versions WHERE id=NEW.question_version_id;
 IF (version='question/1' AND NEW.scoring_policy_version<>'practice-binary-v1')
  OR (version='question/2' AND NEW.scoring_policy_version<>'practice-binary-v2') THEN
  RAISE EXCEPTION 'Question schema and scoring policy must match' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.guard_question_protocol() FROM PUBLIC;
CREATE TRIGGER question_protocol BEFORE INSERT ON tsa_private.question_secrets
 FOR EACH ROW EXECUTE FUNCTION tsa_private.guard_question_protocol();

-- Additive Bank receipts retain the same authenticated actor and no attempt binding.
CREATE POLICY bank_numeric_idempotency_actor_scope ON tsa.idempotency_records FOR ALL TO tsa_bank
 USING (actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid AND related_attempt_id IS NULL AND (
  route_scope='POST /api/v2/questions'
  OR route_scope ~ '^POST /api/v2/questions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
  OR route_scope ~ '^POST /api/v2/question-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(submit-review|reviews|quarantine|confirm-singleton)$'))
 WITH CHECK (actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid AND related_attempt_id IS NULL AND (
  route_scope='POST /api/v2/questions'
  OR route_scope ~ '^POST /api/v2/questions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
  OR route_scope ~ '^POST /api/v2/question-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(submit-review|reviews|quarantine|confirm-singleton)$'));

DO $$
DECLARE definition text; fragment text; target text;
BEGIN
 definition:=pg_get_functiondef('tsa.bank_question_delivery_allowed(uuid)'::regprocedure);
 fragment:=$old$c.profile='text-math-table/1'$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing legacy delivery profile'; END IF;
 definition:=replace(definition,fragment,$new$((q.schema_version='question/1' AND c.profile='text-math-table/1') OR (q.schema_version='question/2' AND c.profile='text-math-table-numeric/2'))$new$);
 fragment:=$old$c.profile='text-math-table-inspected-image/2'$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing inspected delivery profile'; END IF;
 EXECUTE replace(definition,fragment,$new$((q.schema_version='question/1' AND c.profile='text-math-table-inspected-image/2') OR (q.schema_version='question/2' AND c.profile='text-math-table-inspected-image-numeric/3'))$new$);

 definition:=pg_get_functiondef('tsa.bank_question_selection_allowed(uuid)'::regprocedure);
 fragment:='WHERE qv.id=version_id AND tsa.bank_question_delivery_allowed(qv.id)';
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing selection protocol boundary'; END IF;
 EXECUTE replace(definition,fragment,fragment||$new$
  AND (qv.schema_version='question/1' OR (qv.schema_version='question/2'
   AND COALESCE(current_setting('tsa.enable_numeric_practice',true),'false')='true'))$new$);

 definition:=pg_get_functiondef('tsa.assembly_standalone_stock(uuid)'::regprocedure);
 fragment:='IF NOT FOUND THEN RETURN NULL; END IF;';
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing offering admission boundary'; END IF;
 definition:=replace(definition,fragment,fragment||$new$
  IF b.schema_version='blueprint/2' AND NOT tsa_private.numeric_practice_active(b.id) THEN RETURN NULL; END IF;
$new$);
 fragment:=$old$AND b.config->'allowedTypes' ? (v.interaction->>'type')$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing stock compatibility boundary'; END IF;
 EXECUTE replace(definition,fragment,fragment||' AND tsa_private.practice_question_compatible(b.id,v.id)');

 definition:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
 fragment:=$old$m->>'schemaVersion' IS DISTINCT FROM 'assembly-manifest/1'$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing manifest version boundary'; END IF;
 definition:=replace(definition,fragment,$new$m->>'schemaVersion' IS DISTINCT FROM (CASE WHEN b.schema_version='blueprint/2' AND tsa_private.numeric_practice_active(b.id) THEN 'assembly-manifest/2' ELSE 'assembly-manifest/1' END)$new$);
 fragment:=$old$OR (COALESCE(current_setting('tsa.enable_topic_practice',true),'false')='true'
        AND tsa_private.topic_practice_profile_active(b.id))$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing personal profile version guard'; END IF;
 definition:=replace(definition,fragment,fragment||' OR tsa_private.numeric_practice_active(b.id)');
 fragment:=$old$'schemaVersion','sealed-form/1'$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing sealed form protocol boundary'; END IF;
 EXECUTE replace(definition,fragment,$new$'schemaVersion',CASE WHEN b.schema_version='blueprint/2' THEN 'sealed-form/2' ELSE 'sealed-form/1' END$new$);

 definition:=pg_get_functiondef('tsa.exam_reconcile_attempt(uuid)'::regprocedure);
 fragment:='BEGIN';
 EXECUTE replace(definition,fragment,fragment||E'\n  IF NOT tsa_private.attempt_protocol_allowed(target_attempt) THEN RETURN false; END IF;');

 definition:=pg_get_functiondef('tsa.exam_history_page(integer,timestamptz,uuid)'::regprocedure);
 fragment:='SELECT id,created_at FROM tsa.attempts WHERE user_id=who';
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing history protocol boundary'; END IF;
 definition:=replace(definition,fragment,fragment||' AND tsa_private.attempt_protocol_allowed(id)');
 fragment:=$old$s.policy_version='practice-binary-v1'$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing history release policy'; END IF;
 EXECUTE replace(definition,fragment,$new$s.policy_version IN('practice-binary-v1','practice-binary-v2')$new$);

 -- Version idempotency namespaces by trusted route context; v1 strings are unchanged.
 FOREACH target IN ARRAY ARRAY['tsa.assembly_receipt(text,text)',
  'tsa.assembly_commit_personal(text,text,jsonb)','tsa.exam_attempt_start(uuid,text,text)',
  'tsa.exam_answer_save(uuid,uuid,text,text,jsonb)','tsa.exam_attempt_submit(uuid,text,text)'] LOOP
  definition:=pg_get_functiondef(target::regprocedure);
  IF position('/api/v1/attempts' IN definition)=0 THEN RAISE EXCEPTION 'Missing idempotency namespace in %',target; END IF;
  definition:=replace(definition,'''POST /api/v1/attempts''','''POST ''||tsa_private.attempt_api_root()');
  definition:=replace(definition,'''POST /api/v1/attempts/''','''POST ''||tsa_private.attempt_api_root()||''/''');
  definition:=replace(definition,'''PUT /api/v1/attempts/''','''PUT ''||tsa_private.attempt_api_root()||''/''');
  EXECUTE definition;
 END LOOP;

 FOREACH target IN ARRAY ARRAY['tsa.exam_worker_load(uuid,text,bigint)','tsa.exam_worker_finish(uuid,text,bigint,jsonb)'] LOOP
  definition:=pg_get_functiondef(target::regprocedure);
  fragment:=$old$policy IS DISTINCT FROM 'practice-binary-v1'$old$;
  IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing trusted grading policy boundary'; END IF;
  definition:=replace(definition,fragment,$new$(policy IS NULL OR policy NOT IN('practice-binary-v1','practice-binary-v2'))$new$);
  IF target='tsa.exam_worker_finish(uuid,text,bigint,jsonb)' THEN
   fragment:=$old$'ATTEMPT_GRADED','attempt',a.id::text,'practice-binary-v1'$old$;
   IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing grading audit policy'; END IF;
   definition:=replace(definition,fragment,$new$'ATTEMPT_GRADED','attempt',a.id::text,policy$new$);
  END IF;
  EXECUTE definition;
 END LOOP;
 FOREACH target IN ARRAY ARRAY['tsa.exam_attempt_access(uuid)','tsa.exam_attempt_asset(uuid,uuid,text)'] LOOP
  definition:=pg_get_functiondef(target::regprocedure);
  fragment:=$old$s.policy_version='practice-binary-v1'$old$;
  IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing released policy boundary'; END IF;
  EXECUTE replace(definition,fragment,$new$s.policy_version IN('practice-binary-v1','practice-binary-v2')$new$);
 END LOOP;
END $$;
