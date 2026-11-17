-- Additive question/3 and blueprint/4 support for explicit cloze and matching practice.
-- Existing question/1, question/2 and simulation blueprint/3 records keep their contracts.
ALTER TABLE tsa.question_versions DROP CONSTRAINT question_versions_schema_version_check;
ALTER TABLE tsa.question_versions ADD CONSTRAINT question_versions_schema_version_check
 CHECK(schema_version IN('question/1','question/2','question/3'));
ALTER TABLE tsa.question_versions DROP CONSTRAINT question_versions_schema_interaction_check;
ALTER TABLE tsa.question_versions ADD CONSTRAINT question_versions_schema_interaction_check CHECK(COALESCE(
 (schema_version='question/1' AND interaction->>'type' IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP')) OR
 (schema_version='question/2' AND interaction->>'type' IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP','NUMERIC_RESPONSE')) OR
 (schema_version='question/3' AND interaction->>'type' IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP','NUMERIC_RESPONSE','CLOZE','MATCHING')),false));

ALTER TABLE tsa.blueprint_versions DROP CONSTRAINT blueprint_versions_schema_version_check;
ALTER TABLE tsa.blueprint_versions ADD CONSTRAINT blueprint_versions_schema_version_check
 CHECK(schema_version IN('blueprint/1','blueprint/2','blueprint/3','blueprint/4'));

ALTER TABLE tsa_private.question_delivery_checks DROP CONSTRAINT question_delivery_checks_profile_check;
ALTER TABLE tsa_private.question_delivery_checks ADD CONSTRAINT question_delivery_checks_profile_check CHECK(profile IN(
 'text-math-table/1','text-math-table-inspected-image/2','text-math-table-numeric/2',
 'text-math-table-inspected-image-numeric/3','text-math-table-cloze-matching/4',
 'text-math-table-inspected-image-cloze-matching/5'));

CREATE FUNCTION tsa.exam_normalize_cloze(raw_value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$
 SELECT btrim(normalize(raw_value,NFC),U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
REVOKE ALL ON FUNCTION tsa.exam_normalize_cloze(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_normalize_cloze(text) TO tsa_exam,tsa_exam_worker,tsa_bank,tsa_factory;


CREATE FUNCTION tsa_private.cloze_interaction_valid(interaction jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE field jsonb; field_id text; label text; n integer; max_length integer;
BEGIN
 IF jsonb_typeof(interaction) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(interaction))<>4
  OR interaction->>'type' IS DISTINCT FROM 'CLOZE' OR jsonb_typeof(interaction->'fields') IS DISTINCT FROM 'array'
  OR jsonb_typeof(interaction->'maxLength') IS DISTINCT FROM 'number'
  OR interaction->>'maxLength' !~ '^[1-9][0-9]{0,2}$'
  OR (interaction->>'maxLength')::integer NOT BETWEEN 1 AND 256
  OR jsonb_typeof(interaction->'normalization') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(interaction->'normalization'))<>4
  OR interaction->'normalization'->'unicode' IS DISTINCT FROM '"NFC"'::jsonb
  OR interaction->'normalization'->'trim' IS DISTINCT FROM '"OUTER"'::jsonb
  OR interaction->'normalization'->'caseSensitive' IS DISTINCT FROM 'true'::jsonb
  OR interaction->'normalization'->'diacritics' IS DISTINCT FROM '"PRESERVE"'::jsonb THEN RETURN false; END IF;
 n:=jsonb_array_length(interaction->'fields'); max_length:=(interaction->>'maxLength')::integer;
 IF n NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
 FOR field IN SELECT value FROM jsonb_array_elements(interaction->'fields') AS items(value) LOOP
  IF jsonb_typeof(field) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(field))<>2
   OR jsonb_typeof(field->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(field->'label') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  field_id:=field->>'id'; label:=field->>'label';
  IF field_id !~ '^[a-z][a-z0-9_-]{0,39}$' OR char_length(label) NOT BETWEEN 1 AND 2000
   OR tsa.exam_normalize_cloze(label)='' OR label ~ '[[:cntrl:]<>]' THEN RETURN false; END IF;
 END LOOP;
 SELECT count(DISTINCT value->>'id') INTO n FROM jsonb_array_elements(interaction->'fields') AS items(value);
 RETURN n=jsonb_array_length(interaction->'fields');
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

CREATE FUNCTION tsa_private.matching_interaction_valid(interaction jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE entry jsonb; entry_id text; label text; n integer; rows_count integer; uses integer; max_uses integer;
BEGIN
 IF jsonb_typeof(interaction) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(interaction))<>3
  OR interaction->>'type' IS DISTINCT FROM 'MATCHING' OR jsonb_typeof(interaction->'rows') IS DISTINCT FROM 'array'
  OR jsonb_typeof(interaction->'targets') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 rows_count:=jsonb_array_length(interaction->'rows'); n:=jsonb_array_length(interaction->'targets');
 IF rows_count NOT BETWEEN 1 AND 40 OR n NOT BETWEEN 1 AND 40 THEN RETURN false; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(interaction->'rows') AS items(value) LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(entry))<>2
   OR jsonb_typeof(entry->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'label') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  entry_id:=entry->>'id'; label:=entry->>'label';
  IF entry_id !~ '^[a-z][a-z0-9_-]{0,39}$' OR char_length(label) NOT BETWEEN 1 AND 2000
   OR tsa.exam_normalize_cloze(label)='' OR label ~ '[[:cntrl:]<>]' THEN RETURN false; END IF;
 END LOOP;
 SELECT count(DISTINCT value->>'id') INTO n FROM jsonb_array_elements(interaction->'rows') AS items(value);
 IF n<>rows_count THEN RETURN false; END IF;
 uses:=0;
 FOR entry IN SELECT value FROM jsonb_array_elements(interaction->'targets') AS items(value) LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(entry))<>3
   OR jsonb_typeof(entry->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'label') IS DISTINCT FROM 'string'
   OR jsonb_typeof(entry->'maxUses') IS DISTINCT FROM 'number' OR entry->>'maxUses' !~ '^[1-9][0-9]{0,1}$' THEN RETURN false; END IF;
  entry_id:=entry->>'id'; label:=entry->>'label'; max_uses:=(entry->>'maxUses')::integer;
  IF entry_id !~ '^[a-z][a-z0-9_-]{0,39}$' OR char_length(label) NOT BETWEEN 1 AND 2000
   OR tsa.exam_normalize_cloze(label)='' OR label ~ '[[:cntrl:]<>]' OR max_uses NOT BETWEEN 1 AND 40 THEN RETURN false; END IF;
  uses:=uses+max_uses;
 END LOOP;
 SELECT count(DISTINCT value->>'id') INTO n FROM jsonb_array_elements(interaction->'targets') AS items(value);
 RETURN n=jsonb_array_length(interaction->'targets') AND uses>=rows_count;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

CREATE FUNCTION tsa_private.cloze_response_valid(interaction jsonb,response_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,tsa_private AS $$
DECLARE entry record; max_length integer;
BEGIN
 IF NOT tsa_private.cloze_interaction_valid(interaction) OR jsonb_typeof(response_value) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(response_value))<>2 OR response_value->>'type' IS DISTINCT FROM 'CLOZE'
  OR jsonb_typeof(response_value->'values') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(response_value->'values'))>20 THEN RETURN false; END IF;
 max_length:=(interaction->>'maxLength')::integer;
 FOR entry IN SELECT key,value FROM jsonb_each(response_value->'values') AS values(key,value) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'fields') AS fields(value) WHERE value->>'id'=entry.key)
   OR jsonb_typeof(entry.value) NOT IN('string','null') THEN RETURN false; END IF;
  IF jsonb_typeof(entry.value)='string' AND char_length(entry.value#>>'{}')>max_length THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

CREATE FUNCTION tsa_private.matching_response_valid(interaction jsonb,response_value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,tsa_private AS $$
DECLARE entry record; target jsonb; uses integer; target_id text; max_uses integer;
BEGIN
 IF NOT tsa_private.matching_interaction_valid(interaction) OR jsonb_typeof(response_value) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(response_value))<>2 OR response_value->>'type' IS DISTINCT FROM 'MATCHING'
  OR jsonb_typeof(response_value->'assignments') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(response_value->'assignments'))>40 THEN RETURN false; END IF;
 FOR entry IN SELECT key,value FROM jsonb_each(response_value->'assignments') AS assignments(key,value) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'rows') AS rows(value) WHERE value->>'id'=entry.key)
   OR jsonb_typeof(entry.value) NOT IN('string','null') THEN RETURN false; END IF;
  IF jsonb_typeof(entry.value)='string' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'targets') AS targets(value)
    WHERE value->>'id'=entry.value#>>'{}') THEN RETURN false; END IF;
 END LOOP;
 FOR target IN SELECT value FROM jsonb_array_elements(interaction->'targets') AS targets(value) LOOP
  target_id:=target->>'id'; max_uses:=(target->>'maxUses')::integer;
  SELECT count(*) INTO uses FROM jsonb_each(response_value->'assignments') AS assignments(key,value)
   WHERE value=to_jsonb(target_id);
  IF uses>max_uses THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

CREATE FUNCTION tsa_private.cloze_answer_key_valid(interaction jsonb,answer_key jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,tsa_private AS $$
DECLARE field jsonb; field_id text; variants jsonb; variant jsonb; normalized text; seen text[]; max_length integer;
BEGIN
 IF NOT tsa_private.cloze_interaction_valid(interaction) OR jsonb_typeof(answer_key) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(answer_key))<>2 OR answer_key->>'type' IS DISTINCT FROM 'CLOZE'
  OR jsonb_typeof(answer_key->'acceptedValues') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(answer_key->'acceptedValues'))<>jsonb_array_length(interaction->'fields') THEN RETURN false; END IF;
 max_length:=(interaction->>'maxLength')::integer;
 FOR field IN SELECT value FROM jsonb_array_elements(interaction->'fields') AS fields(value) LOOP
  field_id:=field->>'id';
  IF NOT(answer_key->'acceptedValues' ? field_id) OR jsonb_typeof(answer_key->'acceptedValues'->field_id) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  variants:=answer_key->'acceptedValues'->field_id;
  IF jsonb_array_length(variants) NOT BETWEEN 1 AND 16 THEN RETURN false; END IF;
  seen:='{}';
  FOR variant IN SELECT value FROM jsonb_array_elements(variants) AS values(value) LOOP
   IF jsonb_typeof(variant) IS DISTINCT FROM 'string' OR char_length(variant#>>'{}')>max_length THEN RETURN false; END IF;
   normalized:=tsa.exam_normalize_cloze(variant#>>'{}');
   IF normalized='' OR normalized=ANY(seen) THEN RETURN false; END IF;
   seen:=array_append(seen,normalized);
  END LOOP;
 END LOOP;
 RETURN NOT EXISTS(SELECT 1 FROM jsonb_object_keys(answer_key->'acceptedValues') AS keys(key)
  WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'fields') AS fields(value) WHERE value->>'id'=keys.key));
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

CREATE FUNCTION tsa_private.matching_answer_key_valid(interaction jsonb,answer_key jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,tsa_private AS $$
DECLARE row_item jsonb; row_id text; target_id text; uses integer; max_uses integer;
BEGIN
 IF NOT tsa_private.matching_interaction_valid(interaction) OR jsonb_typeof(answer_key) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(answer_key))<>2 OR answer_key->>'type' IS DISTINCT FROM 'MATCHING'
  OR jsonb_typeof(answer_key->'answers') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(answer_key->'answers'))<>jsonb_array_length(interaction->'rows') THEN RETURN false; END IF;
 FOR row_item IN SELECT value FROM jsonb_array_elements(interaction->'rows') AS rows(value) LOOP
  row_id:=row_item->>'id';
  IF NOT(answer_key->'answers' ? row_id) OR jsonb_typeof(answer_key->'answers'->row_id) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  target_id:=answer_key->'answers'->>row_id;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'targets') AS targets(value) WHERE value->>'id'=target_id) THEN RETURN false; END IF;
 END LOOP;
 FOR row_item IN SELECT value FROM jsonb_array_elements(interaction->'targets') AS targets(value) LOOP
  target_id:=row_item->>'id'; max_uses:=(row_item->>'maxUses')::integer;
  SELECT count(*) INTO uses FROM jsonb_each(answer_key->'answers') AS answers(key,value) WHERE value=to_jsonb(target_id);
  IF uses>max_uses THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION tsa_private.cloze_interaction_valid(jsonb),tsa_private.matching_interaction_valid(jsonb),
 tsa_private.cloze_response_valid(jsonb,jsonb),tsa_private.matching_response_valid(jsonb,jsonb),
 tsa_private.cloze_answer_key_valid(jsonb,jsonb),tsa_private.matching_answer_key_valid(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa_private.cloze_interaction_valid(jsonb),tsa_private.matching_interaction_valid(jsonb),
 tsa_private.cloze_response_valid(jsonb,jsonb),tsa_private.matching_response_valid(jsonb,jsonb) TO tsa_exam,tsa_exam_worker,tsa_bank,tsa_factory;
GRANT EXECUTE ON FUNCTION tsa_private.cloze_answer_key_valid(jsonb,jsonb),tsa_private.matching_answer_key_valid(jsonb,jsonb) TO tsa_exam_worker;

-- Extend the already-versioned response validator without altering its legacy branches.
DO $$
DECLARE definition text; fragment text;
BEGIN
 definition:=pg_get_functiondef('tsa.exam_response_valid(jsonb,jsonb)'::regprocedure);
 fragment:=$old$ELSIF kind='SINGLE_CHOICE' THEN$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing response validator dispatch'; END IF;
 definition:=replace(definition,fragment,$new$ELSIF kind='CLOZE' THEN
    RETURN tsa_private.cloze_response_valid(interaction,response_value);
  ELSIF kind='MATCHING' THEN
    RETURN tsa_private.matching_response_valid(interaction,response_value);
  ELSIF kind='SINGLE_CHOICE' THEN$new$);
 EXECUTE definition;
END $$;

DO $$
DECLARE definition text; fragment text;
BEGIN
 definition:=pg_get_functiondef('tsa.exam_binary_earned(jsonb,jsonb,jsonb)'::regprocedure);
 fragment:=$old$IF kind='NUMERIC_RESPONSE' THEN$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing binary grading dispatch'; END IF;
 definition:=replace(definition,fragment,$new$IF kind='CLOZE' THEN
   IF NOT tsa_private.cloze_answer_key_valid(interaction,answer_key) THEN
    RAISE EXCEPTION 'Invalid frozen cloze key' USING ERRCODE='22023';
   END IF;
   IF response IS NULL OR response='null'::jsonb THEN RETURN 0; END IF;
   IF NOT COALESCE(tsa.exam_response_valid(interaction,response),false) THEN
    RAISE EXCEPTION 'Invalid frozen cloze response' USING ERRCODE='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'fields') AS fields(value)
     WHERE NOT COALESCE(response->'values' ? (value->>'id'),false)
       OR response->'values'->(value->>'id')='null'::jsonb
       OR tsa.exam_normalize_cloze(response->'values'->>(value->>'id'))=''
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(answer_key->'acceptedValues'->(fields.value->>'id')) AS variants(value)
         WHERE tsa.exam_normalize_cloze(variants.value#>>'{}')=tsa.exam_normalize_cloze(response->'values'->>(fields.value->>'id')))) THEN RETURN 0; END IF;
   RETURN 1;
  ELSIF kind='MATCHING' THEN
   IF NOT tsa_private.matching_answer_key_valid(interaction,answer_key) THEN
    RAISE EXCEPTION 'Invalid frozen matching key' USING ERRCODE='22023';
   END IF;
   IF response IS NULL OR response='null'::jsonb THEN RETURN 0; END IF;
   IF NOT COALESCE(tsa.exam_response_valid(interaction,response),false) THEN
    RAISE EXCEPTION 'Invalid frozen matching response' USING ERRCODE='22023';
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'rows') AS rows(value)
     WHERE NOT COALESCE(response->'assignments' ? (value->>'id'),false)
       OR response->'assignments'->(value->>'id')='null'::jsonb) THEN RETURN 0; END IF;
   RETURN CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(interaction->'rows') AS rows(value)
     WHERE response->'assignments'->(value->>'id') IS DISTINCT FROM answer_key->'answers'->(value->>'id')) THEN 0 ELSE 1 END;
  END IF;
  IF kind='NUMERIC_RESPONSE' THEN$new$);
 EXECUTE definition;
END $$;

CREATE TABLE tsa_private.cloze_matching_profiles(
 blueprint_version_id uuid PRIMARY KEY REFERENCES tsa.blueprint_versions(id),
 blueprint_hash text NOT NULL CHECK(blueprint_hash ~ '^sha256:[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER cloze_matching_profiles_immutable BEFORE UPDATE OR DELETE ON tsa_private.cloze_matching_profiles
 FOR EACH ROW EXECUTE FUNCTION tsa.reject_immutable_change();
REVOKE ALL ON tsa_private.cloze_matching_profiles FROM PUBLIC,tsa_web,tsa_bank,tsa_factory,tsa_exam,tsa_identity,tsa_exam_worker;

CREATE FUNCTION tsa_private.cloze_matching_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa_private.cloze_matching_profiles p JOIN tsa.blueprint_versions b
  ON b.id=p.blueprint_version_id AND b.content_hash=p.blueprint_hash
  WHERE b.id=target_blueprint AND b.schema_version='blueprint/4' AND b.config->>'schemaVersion'='blueprint/4'
   AND b.config->>'profileKind'='INDEPENDENT_PRACTICE' AND b.config->>'scoringPolicy'='practice-binary-v3'
   AND b.config->>'releasePolicy'='after-grade-v1' AND jsonb_array_length(b.config->'sections')=1
   AND jsonb_array_length(b.config->'allowedTypes') BETWEEN 1 AND 6
   AND jsonb_array_length(b.config->'allowedTypes')=(SELECT count(DISTINCT value)
    FROM jsonb_array_elements_text(b.config->'allowedTypes') AS types(value))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b.config->'allowedTypes') kind
    WHERE kind NOT IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP','NUMERIC_RESPONSE','CLOZE','MATCHING'))
   AND (b.config->'sections'->0->>'count')::integer BETWEEN 1 AND 100
   AND (b.config->'sections'->0->>'durationSeconds')::integer BETWEEN 1 AND 10800)
$$;
CREATE FUNCTION tsa_private.cloze_matching_active(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT COALESCE(current_setting('tsa.enable_cloze_matching',true),'false')='true'
  AND tsa_private.cloze_matching_supported(target_blueprint)
$$;
CREATE FUNCTION tsa.exam_cloze_matching_profile_supported(target_blueprint uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
BEGIN
 PERFORM tsa.assembly_candidate(); RETURN tsa_private.cloze_matching_supported(target_blueprint);
END;
$$;
REVOKE ALL ON FUNCTION tsa_private.cloze_matching_supported(uuid),tsa_private.cloze_matching_active(uuid),
 tsa.exam_cloze_matching_profile_supported(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_cloze_matching_profile_supported(uuid) TO tsa_exam;

CREATE OR REPLACE FUNCTION tsa_private.practice_question_compatible(target_blueprint uuid,target_question uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.blueprint_versions b CROSS JOIN tsa.question_versions q
  JOIN tsa_private.question_secrets s ON s.question_version_id=q.id
  WHERE b.id=target_blueprint AND q.id=target_question AND
   ((b.schema_version='blueprint/3' AND q.schema_version='question/1' AND s.scoring_policy_version='practice-binary-v1'
     AND tsa_private.simulation_active(b.id)) OR
    (b.schema_version='blueprint/1' AND q.schema_version='question/1' AND s.scoring_policy_version='practice-binary-v1') OR
    (b.schema_version='blueprint/2' AND q.schema_version='question/2' AND s.scoring_policy_version='practice-binary-v2'
     AND tsa_private.numeric_practice_active(b.id)) OR
    (b.schema_version='blueprint/4' AND q.schema_version='question/3' AND s.scoring_policy_version='practice-binary-v3'
     AND tsa_private.cloze_matching_active(b.id))))
$$;

CREATE OR REPLACE FUNCTION tsa_private.attempt_protocol_allowed(target_attempt uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
  WHERE a.id=target_attempt AND a.user_id::text=nullif(current_setting('tsa.local_user_id',true),'')
   AND CASE WHEN COALESCE(current_setting('tsa.enable_full_simulation',true),'false')='true'
    THEN tsa_private.simulation_form(f.id)
    WHEN COALESCE(current_setting('tsa.enable_cloze_matching',true),'false')='true'
    THEN NOT tsa_private.simulation_form(f.id) AND f.policy_versions->>'scoring'='practice-binary-v3'
     AND tsa_private.cloze_matching_active(f.blueprint_version_id)
    ELSE NOT tsa_private.simulation_form(f.id) AND (f.policy_versions->>'scoring'='practice-binary-v1' OR
     (f.policy_versions->>'scoring'='practice-binary-v2' AND tsa_private.numeric_practice_active(f.blueprint_version_id))) END)
$$;

CREATE OR REPLACE FUNCTION tsa_private.guard_question_protocol() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,tsa AS $$
DECLARE version text;
BEGIN
 SELECT schema_version INTO STRICT version FROM tsa.question_versions WHERE id=NEW.question_version_id;
 IF (version='question/1' AND NEW.scoring_policy_version<>'practice-binary-v1')
  OR (version='question/2' AND NEW.scoring_policy_version<>'practice-binary-v2')
  OR (version='question/3' AND NEW.scoring_policy_version<>'practice-binary-v3') THEN
  RAISE EXCEPTION 'Question schema and scoring policy must match' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tsa_private.attempt_api_root() RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN COALESCE(current_setting('tsa.enable_full_simulation',true),'false')='true' THEN '/api/v3/attempts'
  WHEN COALESCE(current_setting('tsa.enable_cloze_matching',true),'false')='true' THEN '/api/v4/attempts'
  WHEN COALESCE(current_setting('tsa.enable_numeric_practice',true),'false')='true' THEN '/api/v2/attempts'
  ELSE '/api/v1/attempts' END
$$;
REVOKE ALL ON FUNCTION tsa_private.attempt_api_root() FROM PUBLIC;

-- Keep the established catalog shape while selecting only the new immutable profile.
DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('tsa.exam_numeric_catalog_page(integer,uuid)'::regprocedure);
 definition:=replace(definition,'tsa.exam_numeric_catalog_page','tsa.exam_cloze_matching_catalog_page');
 definition:=replace(definition,'tsa_private.numeric_practice_active','tsa_private.cloze_matching_active');
 EXECUTE definition;
END $$;
REVOKE ALL ON FUNCTION tsa.exam_cloze_matching_catalog_page(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_cloze_matching_catalog_page(integer,uuid) TO tsa_exam;

-- Extend the Bank delivery profile matrix without changing any existing profile mapping.
DO $$
DECLARE definition text; fragment text;
BEGIN
 definition:=pg_get_functiondef('tsa.bank_question_delivery_allowed(uuid)'::regprocedure);
 fragment:=$old$((q.schema_version='question/1' AND c.profile='text-math-table/1') OR (q.schema_version='question/2' AND c.profile='text-math-table-numeric/2'))$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing text-only delivery profile seam'; END IF;
 definition:=replace(definition,fragment,$new$((q.schema_version='question/1' AND c.profile='text-math-table/1') OR (q.schema_version='question/2' AND c.profile='text-math-table-numeric/2') OR (q.schema_version='question/3' AND c.profile='text-math-table-cloze-matching/4'))$new$);
 fragment:=$old$((q.schema_version='question/1' AND c.profile='text-math-table-inspected-image/2') OR (q.schema_version='question/2' AND c.profile='text-math-table-inspected-image-numeric/3'))$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing inspected-image delivery profile seam'; END IF;
 definition:=replace(definition,fragment,$new$((q.schema_version='question/1' AND c.profile='text-math-table-inspected-image/2') OR (q.schema_version='question/2' AND c.profile='text-math-table-inspected-image-numeric/3') OR (q.schema_version='question/3' AND c.profile='text-math-table-inspected-image-cloze-matching/5'))$new$);
 EXECUTE definition;

 definition:=pg_get_functiondef('tsa.bank_question_selection_allowed(uuid)'::regprocedure);
 fragment:=$old$AND (qv.schema_version='question/1' OR (qv.schema_version='question/2'
   AND COALESCE(current_setting('tsa.enable_numeric_practice',true),'false')='true'))$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing question selection version gate'; END IF;
 EXECUTE replace(definition,fragment,$new$AND (qv.schema_version='question/1'
   OR (qv.schema_version='question/2' AND COALESCE(current_setting('tsa.enable_numeric_practice',true),'false')='true')
   OR (qv.schema_version='question/3' AND COALESCE(current_setting('tsa.enable_cloze_matching',true),'false')='true'))$new$);
END $$;

-- Only the new explicit profile can allocate question/3 with blueprint/4.
DO $$
DECLARE definition text; fragment text;
BEGIN
 definition:=pg_get_functiondef('tsa.assembly_standalone_stock(uuid)'::regprocedure);
 fragment:=$old$IF b.schema_version='blueprint/2' AND NOT tsa_private.numeric_practice_active(b.id) THEN RETURN NULL; END IF;$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing numeric profile admission seam'; END IF;
 definition:=replace(definition,fragment,fragment||E'\n  IF b.schema_version=''blueprint/4'' AND NOT tsa_private.cloze_matching_active(b.id) THEN RETURN NULL; END IF;');
 fragment:=$old$AND tsa_private.practice_question_compatible(b.id,v.id)$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing versioned question compatibility seam'; END IF;
 EXECUTE definition;

 definition:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
 fragment:=$old$m->>'schemaVersion' IS DISTINCT FROM (CASE WHEN b.schema_version='blueprint/2' AND tsa_private.numeric_practice_active(b.id) THEN 'assembly-manifest/2' ELSE 'assembly-manifest/1' END)$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing personal manifest version seam'; END IF;
 definition:=replace(definition,fragment,$new$m->>'schemaVersion' IS DISTINCT FROM (CASE
    WHEN b.schema_version='blueprint/4' AND tsa_private.cloze_matching_active(b.id) THEN 'assembly-manifest/4'
    WHEN b.schema_version='blueprint/2' AND tsa_private.numeric_practice_active(b.id) THEN 'assembly-manifest/2'
    ELSE 'assembly-manifest/1' END)$new$);
 fragment:=$old$OR tsa_private.numeric_practice_active(b.id)$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing personal profile admission seam'; END IF;
 definition:=replace(definition,fragment,fragment||' OR tsa_private.cloze_matching_active(b.id)');
 fragment:=$old$CASE WHEN b.schema_version='blueprint/2' THEN 'sealed-form/2' ELSE 'sealed-form/1' END$old$;
 IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing personal seal version seam'; END IF;
 EXECUTE replace(definition,fragment,$new$CASE WHEN b.schema_version='blueprint/4' THEN 'sealed-form/4'
    WHEN b.schema_version='blueprint/2' THEN 'sealed-form/2' ELSE 'sealed-form/1' END$new$);
END $$;

-- Use a separate idempotency namespace for the additive Bank v4 surface.
CREATE POLICY bank_cloze_matching_idempotency_actor_scope ON tsa.idempotency_records FOR ALL TO tsa_bank
 USING (actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid AND related_attempt_id IS NULL AND (
  route_scope='POST /api/v4/questions'
  OR route_scope ~ '^POST /api/v4/questions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
  OR route_scope ~ '^POST /api/v4/question-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(submit-review|reviews|quarantine|confirm-singleton)$'))
 WITH CHECK (actor_id=nullif(current_setting('tsa.bank_actor_id',true),'')::uuid AND related_attempt_id IS NULL AND (
  route_scope='POST /api/v4/questions'
  OR route_scope ~ '^POST /api/v4/questions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/versions$'
  OR route_scope ~ '^POST /api/v4/question-versions/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/(submit-review|reviews|quarantine|confirm-singleton)$'));




-- Extend only versioned policy predicates; the dedicated v3 simulation remains separate.
DO $$
DECLARE definition text; fragment text; target text;
BEGIN
 FOREACH target IN ARRAY ARRAY[
   'tsa.exam_attempt_access(uuid)',
   'tsa.exam_attempt_asset(uuid,uuid,text)',
   'tsa.exam_history_page(integer,timestamptz,uuid)'
 ] LOOP
  definition:=pg_get_functiondef(target::regprocedure);
  fragment:=$old$s.policy_version IN('practice-binary-v1','practice-binary-v2')$old$;
  IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing release/history policy seam in %',target; END IF;
  EXECUTE replace(definition,fragment,$new$s.policy_version IN('practice-binary-v1','practice-binary-v2','practice-binary-v3')$new$);
 END LOOP;

 FOREACH target IN ARRAY ARRAY[
   'tsa.exam_worker_load(uuid,text,bigint)',
   'tsa.exam_worker_finish(uuid,text,bigint,jsonb)'
 ] LOOP
  definition:=pg_get_functiondef(target::regprocedure);
  fragment:=$old$policy IS NULL OR policy NOT IN('practice-binary-v1','practice-binary-v2')$old$;
  IF position(fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing trusted worker policy seam in %',target; END IF;
  EXECUTE replace(definition,fragment,$new$policy IS NULL OR policy NOT IN('practice-binary-v1','practice-binary-v2','practice-binary-v3')$new$);
 END LOOP;
END $$;
