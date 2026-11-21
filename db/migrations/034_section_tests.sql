-- Single-section tests at the real exam length (Math 40 in 60 min, Reading 20 in 30 min, Science 40 in 60 min).
-- They are personal practice profiles like the frozen 4/2/4 ones, marked by a dedicated section id and no quotas.
-- The frozen 4/2/4 rule, the short practice and the Reading experiment profiles stay unchanged.
CREATE FUNCTION tsa.section_test_config(config jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_typeof(config->'sections')='array' AND jsonb_array_length(config->'sections')=1
  AND config->'quotas'='[]'::jsonb
  AND (config->'sections'->0->>'section',config->'sections'->0->>'id',
       config->'sections'->0->'count',config->'sections'->0->'durationSeconds') IN (
   ('MATH','math-section-test','40'::jsonb,'3600'::jsonb),
   ('READING','reading-section-test','20'::jsonb,'1800'::jsonb),
   ('SCIENCE','science-section-test','40'::jsonb,'3600'::jsonb));
$$;
REVOKE ALL ON FUNCTION tsa.section_test_config(jsonb) FROM PUBLIC;

-- Both personal catalogs list a section test wherever they list the frozen Science profile.
DO $$
DECLARE definition text; name text; old_fragment text; new_fragment text;
BEGIN
  old_fragment:=$old$(sections->0->>'section'='SCIENCE' AND sections->0->'count'='4'::jsonb)$old$;
  new_fragment:=old_fragment||$new$
        OR tsa.section_test_config(config)$new$;
  FOREACH name IN ARRAY ARRAY['tsa.exam_catalog_page(integer,uuid)','tsa.exam_short_catalog_page(integer,uuid)'] LOOP
    definition:=pg_get_functiondef(name::regprocedure);
    IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
      RAISE EXCEPTION 'Could not locate the unique catalog profile rule in %',name;
    END IF;
    EXECUTE replace(definition,old_fragment,new_fragment);
  END LOOP;

  -- Personal allocation accepts a section test where it would otherwise require the frozen 4/2/4 count.
  definition:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
  old_fragment:=$old$expected<>(CASE b.config->'sections'->0->>'section' WHEN 'MATH' THEN 4 WHEN 'READING' THEN 2 WHEN 'SCIENCE' THEN 4 ELSE 0 END)$old$;
  new_fragment:=old_fragment||$new$
    AND NOT tsa.section_test_config(b.config)$new$;
  IF position(old_fragment IN definition)=0 OR position(old_fragment IN replace(definition,old_fragment,''))>0 THEN
    RAISE EXCEPTION 'Could not locate the unique personal allocation count rule';
  END IF;
  EXECUTE replace(definition,old_fragment,new_fragment);
END $$;
