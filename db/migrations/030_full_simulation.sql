-- Additive full-simulation protocol. Legacy forms keep their original clocks.
ALTER TABLE tsa.blueprint_versions DROP CONSTRAINT blueprint_versions_schema_version_check;
ALTER TABLE tsa.blueprint_versions ADD CONSTRAINT blueprint_versions_schema_version_check
 CHECK(schema_version IN('blueprint/1','blueprint/2','blueprint/3'));

CREATE FUNCTION tsa_private.simulation_form(target_form uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.forms f JOIN tsa.blueprint_versions b ON b.id=f.blueprint_version_id
 WHERE f.id=target_form AND b.schema_version='blueprint/3')
$$;
CREATE FUNCTION tsa_private.simulation_attempt(target_attempt uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.attempts a WHERE a.id=target_attempt AND tsa_private.simulation_form(a.form_id))
$$;
CREATE FUNCTION tsa_private.simulation_active(target_blueprint uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa AS $$
 SELECT COALESCE(current_setting('tsa.enable_full_simulation',true),'false')='true' AND EXISTS(
 SELECT 1 FROM tsa.blueprint_versions b WHERE b.id=target_blueprint AND b.schema_version='blueprint/3'
 AND b.config->>'schemaVersion'='blueprint/3' AND b.config->>'profileKind'='FULL_SIMULATION'
 AND b.config->>'scoringPolicy'='practice-binary-v1' AND b.config->>'releasePolicy'='after-grade-v1'
 AND b.config->>'bundlePolicy'='ALL_OR_NONE'
 AND b.config->'sections'='[{"id":"math","section":"MATH","count":40,"durationSeconds":3600},{"id":"reading","section":"READING","count":20,"durationSeconds":1800},{"id":"science","section":"SCIENCE","count":40,"durationSeconds":3600}]'::jsonb
 AND jsonb_array_length(b.config->'allowedTypes') BETWEEN 1 AND 3
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(b.config->'allowedTypes') t WHERE t NOT IN('SINGLE_CHOICE','MULTIPLE_CHOICE','TRUE_FALSE_GROUP')))
$$;

CREATE OR REPLACE FUNCTION tsa_private.attempt_protocol_allowed(target_attempt uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
 SELECT EXISTS(SELECT 1 FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
 WHERE a.id=target_attempt AND a.user_id::text=nullif(current_setting('tsa.local_user_id',true),'')
 AND CASE WHEN COALESCE(current_setting('tsa.enable_full_simulation',true),'false')='true'
 THEN tsa_private.simulation_form(f.id) ELSE NOT tsa_private.simulation_form(f.id) AND
 (f.policy_versions->>'scoring'='practice-binary-v1' OR
 (f.policy_versions->>'scoring'='practice-binary-v2' AND tsa_private.numeric_practice_active(f.blueprint_version_id))) END)
$$;

CREATE TABLE tsa_private.simulation_section_clocks(
 attempt_id uuid NOT NULL, form_id uuid NOT NULL, section_id text NOT NULL,
 budget_seconds integer NOT NULL CHECK(budget_seconds>0), elapsed_seconds numeric(20,6) NOT NULL DEFAULT 0,
 first_opened_at timestamptz, opened_at timestamptz,
 PRIMARY KEY(attempt_id,section_id),
 FOREIGN KEY(attempt_id,form_id) REFERENCES tsa.attempts(id,form_id),
 FOREIGN KEY(form_id,section_id) REFERENCES tsa.form_sections(form_id,section_id),
 CHECK(elapsed_seconds BETWEEN 0 AND budget_seconds),
 CHECK(opened_at IS NULL OR (first_opened_at IS NOT NULL AND elapsed_seconds<budget_seconds))
);
CREATE UNIQUE INDEX simulation_one_open_section ON tsa_private.simulation_section_clocks(attempt_id) WHERE opened_at IS NOT NULL;
REVOKE ALL ON tsa_private.simulation_section_clocks FROM PUBLIC,tsa_web,tsa_exam,tsa_bank,tsa_factory,tsa_identity,tsa_exam_worker;

CREATE FUNCTION tsa_private.simulation_remaining(target_attempt uuid, observed timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,tsa_private AS $$
 SELECT COALESCE(sum(greatest(0,budget_seconds-elapsed_seconds-CASE WHEN opened_at IS NULL THEN 0
 ELSE greatest(0,extract(epoch FROM observed-opened_at)) END)),9000)
 FROM tsa_private.simulation_section_clocks WHERE attempt_id=target_attempt
$$;
CREATE FUNCTION tsa_private.simulation_close_clocks(target_attempt uuid, observed timestamptz) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa_private AS $$
 UPDATE tsa_private.simulation_section_clocks SET elapsed_seconds=least(budget_seconds,elapsed_seconds+
 greatest(0,extract(epoch FROM observed-opened_at))),opened_at=NULL
 WHERE attempt_id=target_attempt AND opened_at IS NOT NULL
$$;
CREATE FUNCTION tsa_private.simulation_stop_clocks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa_private AS $$
BEGIN
 IF NEW.state<>'IN_PROGRESS' AND OLD.state='IN_PROGRESS' THEN
  PERFORM tsa_private.simulation_close_clocks(NEW.id,clock_timestamp());
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER simulation_stop_clocks AFTER UPDATE ON tsa.attempts FOR EACH ROW EXECUTE FUNCTION tsa_private.simulation_stop_clocks();

CREATE FUNCTION tsa_private.simulation_reconcile(target_attempt uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE a record; observed timestamptz; horizon timestamptz; policy text; input_hash text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1414742321,1);
 PERFORM id FROM tsa.bank_state WHERE id=1 FOR SHARE;
 SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt FOR UPDATE;
 IF NOT FOUND OR NOT tsa_private.simulation_form(a.form_id) THEN RETURN false; END IF;
 PERFORM form_id FROM tsa.form_availability WHERE form_id=a.form_id FOR SHARE;
 observed:=clock_timestamp();
 PERFORM set_config('tsa.simulation_observed_at',observed::text,true);
 IF a.state='IN_PROGRESS' THEN
  UPDATE tsa_private.simulation_section_clocks SET elapsed_seconds=budget_seconds,opened_at=NULL
   WHERE attempt_id=a.id AND opened_at IS NOT NULL
    AND observed>=opened_at+make_interval(secs=>(budget_seconds-elapsed_seconds)::double precision);
 END IF;
 horizon:=observed+make_interval(secs=>tsa_private.simulation_remaining(a.id,observed)::double precision);
 IF a.state IN('CREATED','IN_PROGRESS','SUBMITTED','EXPIRED','GRADED') AND (NOT tsa.bank_form_delivery_allowed(a.form_id)
  OR (a.state='IN_PROGRESS' AND NOT tsa.exam_form_rights_cover(a.form_id,horizon))) THEN
  IF a.state='CREATED' THEN
   UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='RIGHTS_BLOCKED' WHERE id=a.id;
  ELSE
   UPDATE tsa.attempts SET state='INVALIDATED',invalidation_reason='Simulation delivery rights unavailable' WHERE id=a.id;
  END IF;
  UPDATE tsa.result_releases SET revoked_at=observed,reason='Simulation delivery rights unavailable' WHERE attempt_id=a.id AND revoked_at IS NULL;
 ELSIF a.state='CREATED' AND observed>=a.start_before_at THEN
  UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='START_TTL_EXPIRED' WHERE id=a.id;
 ELSIF a.state='IN_PROGRESS' AND tsa_private.simulation_remaining(a.id,observed)=0 THEN
  UPDATE tsa.attempts SET state='EXPIRED' WHERE id=a.id;
  input_hash:=tsa.exam_grading_input_hash(a.id);
  SELECT policy_version INTO STRICT policy FROM tsa_private.form_slot_secrets WHERE form_id=a.form_id LIMIT 1;
  INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
   VALUES(gen_random_uuid(),'exam_grade_attempt',a.id::text||':'||policy||':'||input_hash,'attempt:'||a.id::text,a.id);
 END IF;
 IF (SELECT state FROM tsa.attempts WHERE id=a.id) IS DISTINCT FROM a.state THEN
  INSERT INTO tsa.audit_events(id,service_actor,action,entity_type,entity_id,reason)
   VALUES(gen_random_uuid(),'EXAM:simulation-clock','SIMULATION_RECONCILED','attempt',a.id::text,'Clock or delivery restriction');
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION tsa_private.simulation_read(target_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE a record; who uuid:=tsa.assembly_candidate(); observed timestamptz; sections jsonb; slots jsonb; answers jsonb; active text; view jsonb;
BEGIN
 IF NOT tsa_private.attempt_protocol_allowed(target_attempt) THEN RETURN NULL; END IF;
 PERFORM tsa_private.simulation_reconcile(target_attempt);
 SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
 IF NOT FOUND THEN RETURN NULL; END IF;
 observed:=current_setting('tsa.simulation_observed_at')::timestamptz;
 SELECT section_id INTO active FROM tsa_private.simulation_section_clocks WHERE attempt_id=a.id AND opened_at IS NOT NULL;
 SELECT jsonb_agg(jsonb_build_object('sectionId',fs.section_id,'section',fs.section,'count',fs.question_count,
  'budgetSeconds',fs.duration_seconds,'remainingSeconds',ceil(greatest(0,fs.duration_seconds-COALESCE(c.elapsed_seconds,0)-
    CASE WHEN c.opened_at IS NULL THEN 0 ELSE greatest(0,extract(epoch FROM observed-c.opened_at)) END)),
  'firstOpenedAt',tsa.exam_instant(c.first_opened_at),'openedAt',tsa.exam_instant(c.opened_at),
  'isOpen',c.opened_at IS NOT NULL,'isLocked',COALESCE(c.elapsed_seconds>=fs.duration_seconds,false)) ORDER BY fs.ordinal)
 INTO sections FROM tsa.form_sections fs LEFT JOIN tsa_private.simulation_section_clocks c ON c.attempt_id=a.id AND c.section_id=fs.section_id
 WHERE fs.form_id=a.form_id;
 SELECT COALESCE(jsonb_agg(s.public_snapshot ORDER BY s.ordinal),'[]'::jsonb) INTO slots
 FROM tsa.form_slots s JOIN tsa_private.simulation_section_clocks c ON c.attempt_id=a.id AND c.section_id=s.section_id
 WHERE s.form_id=a.form_id AND c.first_opened_at IS NOT NULL AND a.state='IN_PROGRESS';
 SELECT COALESCE(jsonb_agg(jsonb_build_object('slotId',ans.slot_id,'value',ans.value,'revision',ans.revision,
  'savedAt',tsa.exam_instant(ans.saved_at)) ORDER BY s.ordinal),'[]'::jsonb) INTO answers
 FROM tsa.answers ans JOIN tsa.form_slots s ON s.form_id=ans.form_id AND s.slot_id=ans.slot_id
 JOIN tsa_private.simulation_section_clocks c ON c.attempt_id=a.id AND c.section_id=s.section_id
 WHERE ans.attempt_id=a.id AND c.first_opened_at IS NOT NULL AND a.state='IN_PROGRESS';
 view:=jsonb_build_object('attemptId',a.id,'state',a.state,'formId',a.form_id,'formMode',a.form_mode,'reuseMode',a.reuse_mode,
 'reusePolicyVersion',a.reuse_policy_version,'serverNow',tsa.exam_instant(observed),
 'startBefore',CASE WHEN a.state='CREATED' THEN tsa.exam_instant(a.start_before_at) ELSE NULL END,
 'startedAt',tsa.exam_instant(a.started_at),'activeSectionId',active,'sections',sections,'slots',slots,'answers',answers,
 'closure',jsonb_build_object('attemptId',a.id,'state',a.state,'terminalReason',a.terminal_reason,'cancellationReason',a.cancellation_reason,
  'closedAt',tsa.exam_instant(a.closed_at),'gradingStatus',a.grading_status));
 RETURN jsonb_build_object('guard',jsonb_build_object('attemptId',a.id,'ownerId',who,'state',a.state,
  'withdrawn',a.state='INVALIDATED','releaseAuthorized',false,'revision',observed::text),'view',view);
END $$;

CREATE FUNCTION tsa_private.simulation_start(target_attempt uuid,command_key text,body_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE a record; prior record; receipt jsonb; who uuid:=tsa.assembly_candidate(); scope text;
BEGIN
 IF NOT tsa_private.attempt_protocol_allowed(target_attempt) THEN RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND'); END IF;
 IF command_key IS NULL OR command_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$' THEN
 RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR'); END IF;
 PERFORM tsa_private.simulation_reconcile(target_attempt);
 SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
 scope:='POST /api/v3/attempts/'||a.id::text||'/start';
 SELECT * INTO prior FROM tsa.idempotency_records WHERE actor_id=who AND route_scope=scope AND idempotency_key=command_key;
 IF FOUND THEN
  IF prior.request_hash<>body_hash THEN RETURN jsonb_build_object('status','ERROR','code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('status','REPLAY','receipt',prior.safe_response);
 END IF;
 IF a.state='CREATED' THEN
  IF NOT tsa.exam_form_rights_cover(a.form_id,clock_timestamp()+interval '150 minutes') THEN
   UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='RIGHTS_BLOCKED' WHERE id=a.id;
   RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE');
  END IF;
  UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=a.id RETURNING * INTO a;
  INSERT INTO tsa_private.simulation_section_clocks(attempt_id,form_id,section_id,budget_seconds,first_opened_at,opened_at)
   SELECT a.id,a.form_id,section_id,duration_seconds,CASE WHEN ordinal=0 THEN a.started_at END,CASE WHEN ordinal=0 THEN a.started_at END
   FROM tsa.form_sections WHERE form_id=a.form_id;
 ELSIF a.started_at IS NULL THEN RETURN jsonb_build_object('status','ERROR','code','FORM_UNAVAILABLE');
 END IF;
 receipt:=jsonb_build_object('attemptId',a.id,'startedAt',tsa.exam_instant(a.started_at),'activeSectionId','math','serverNow',tsa.exam_instant(a.started_at));
 INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
 VALUES(gen_random_uuid(),who,scope,command_key,body_hash,200,receipt,a.id,a.id);
 RETURN jsonb_build_object('status','STARTED','receipt',receipt);
END $$;

CREATE FUNCTION tsa.exam_simulation_switch(target_attempt uuid,command_key text,body_hash text,target_section text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE a record; c record; prior record; who uuid:=tsa.assembly_candidate(); scope text; observed timestamptz; receipt jsonb;
BEGIN
 IF NOT tsa_private.simulation_attempt(target_attempt) OR NOT tsa_private.attempt_protocol_allowed(target_attempt) THEN
 RETURN jsonb_build_object('status','ERROR','code','NOT_FOUND'); END IF;
 IF command_key IS NULL OR command_key !~ '^[!-~]{1,128}$' OR body_hash IS NULL OR body_hash !~ '^sha256:[0-9a-f]{64}$'
 OR target_section NOT IN('math','reading','science') OR target_section IS NULL THEN RETURN jsonb_build_object('status','ERROR','code','VALIDATION_ERROR'); END IF;
 PERFORM tsa_private.simulation_reconcile(target_attempt);
 SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt AND user_id=who;
 IF a.state='INVALIDATED' THEN RETURN jsonb_build_object('status','ERROR','code','CONTENT_WITHDRAWN'); END IF;
 scope:='POST /api/v3/attempts/'||a.id::text||'/section';
 SELECT * INTO prior FROM tsa.idempotency_records WHERE actor_id=who AND route_scope=scope AND idempotency_key=command_key;
 IF FOUND THEN
  IF prior.request_hash<>body_hash THEN RETURN jsonb_build_object('status','ERROR','code','IDEMPOTENCY_CONFLICT'); END IF;
  RETURN jsonb_build_object('status','REPLAY','receipt',prior.safe_response);
 END IF;
 IF a.state<>'IN_PROGRESS' THEN RETURN jsonb_build_object('status','ERROR','code','ATTEMPT_CLOSED'); END IF;
 SELECT * INTO c FROM tsa_private.simulation_section_clocks WHERE attempt_id=a.id AND section_id=target_section;
 IF NOT FOUND OR c.elapsed_seconds>=c.budget_seconds THEN RETURN jsonb_build_object('status','ERROR','code','SECTION_CLOSED'); END IF;
 observed:=clock_timestamp();
 PERFORM tsa_private.simulation_close_clocks(a.id,observed);
 UPDATE tsa_private.simulation_section_clocks SET first_opened_at=COALESCE(first_opened_at,observed),opened_at=observed
 WHERE attempt_id=a.id AND section_id=target_section AND elapsed_seconds<budget_seconds RETURNING * INTO c;
 IF NOT FOUND THEN PERFORM tsa_private.simulation_reconcile(a.id); RETURN jsonb_build_object('status','ERROR','code','SECTION_CLOSED'); END IF;
 receipt:=jsonb_build_object('attemptId',a.id,'activeSectionId',target_section,'switchedAt',tsa.exam_instant(observed),
 'remainingSeconds',ceil(c.budget_seconds-c.elapsed_seconds));
 INSERT INTO tsa.idempotency_records(id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id,related_attempt_id)
 VALUES(gen_random_uuid(),who,scope,command_key,body_hash,200,receipt,a.id,a.id);
 INSERT INTO tsa.audit_events(id,actor_id,action,entity_type,entity_id,reason)
 VALUES(gen_random_uuid(),who,'SIMULATION_SECTION_SWITCHED','attempt',a.id::text,target_section);
 RETURN jsonb_build_object('status','SWITCHED','receipt',receipt);
END $$;

-- NULL identifies ordinary practice; true/false identifies an owned simulation's writable slot.
CREATE FUNCTION tsa.exam_simulation_save_open(target_attempt uuid,target_slot uuid,observed timestamptz) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE a record;
BEGIN
 SELECT * INTO a FROM tsa.attempts WHERE id=target_attempt;
 IF NOT FOUND OR NOT tsa_private.simulation_form(a.form_id) THEN RETURN NULL; END IF;
 IF a.user_id IS DISTINCT FROM tsa.assembly_candidate() THEN RETURN false; END IF;
 RETURN tsa_private.attempt_protocol_allowed(a.id) AND a.state='IN_PROGRESS' AND EXISTS(
  SELECT 1 FROM tsa.form_slots s JOIN tsa_private.simulation_section_clocks c ON c.attempt_id=a.id AND c.section_id=s.section_id
  WHERE s.form_id=a.form_id AND s.slot_id=target_slot AND c.opened_at IS NOT NULL
   AND observed<c.opened_at+make_interval(secs=>(c.budget_seconds-c.elapsed_seconds)::double precision));
END $$;

CREATE FUNCTION tsa_private.simulation_sweep(batch_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE a record; next_state tsa.attempt_state; cancelled integer:=0; expired integer:=0; invalidated integer:=0;
BEGIN
 IF batch_limit<=0 THEN RETURN jsonb_build_object('cancelled',0,'expired',0,'invalidated',0); END IF;
 FOR a IN SELECT candidate.id,candidate.state FROM tsa.attempts candidate WHERE candidate.state IN('CREATED','IN_PROGRESS')
 AND tsa_private.simulation_form(candidate.form_id) AND (
 (candidate.state='CREATED' AND clock_timestamp()>=candidate.start_before_at)
 OR NOT tsa.bank_form_delivery_allowed(candidate.form_id)
 OR (candidate.state='IN_PROGRESS' AND (NOT tsa.exam_form_rights_cover(candidate.form_id,clock_timestamp()+make_interval(secs=>tsa_private.simulation_remaining(candidate.id,clock_timestamp())::double precision))
 OR EXISTS(SELECT 1 FROM tsa_private.simulation_section_clocks c WHERE c.attempt_id=candidate.id AND c.opened_at IS NOT NULL
 AND clock_timestamp()>=c.opened_at+make_interval(secs=>(c.budget_seconds-c.elapsed_seconds)::double precision)))))
 ORDER BY candidate.id LIMIT batch_limit FOR UPDATE OF candidate SKIP LOCKED LOOP
  PERFORM tsa_private.simulation_reconcile(a.id);
  SELECT state INTO next_state FROM tsa.attempts WHERE id=a.id;
  IF next_state='CANCELLED' THEN cancelled:=cancelled+1; ELSIF next_state='EXPIRED' THEN expired:=expired+1;
  ELSIF next_state='INVALIDATED' THEN invalidated:=invalidated+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('cancelled',cancelled,'expired',expired,'invalidated',invalidated);
END $$;

CREATE FUNCTION tsa.exam_simulation_catalog(page_limit integer,after_blueprint uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tsa,tsa_private AS $$
DECLARE result jsonb; ids uuid[]; shown uuid[];
BEGIN
 PERFORM tsa.assembly_candidate();
 IF page_limit NOT BETWEEN 1 AND 100 OR page_limit IS NULL THEN RAISE EXCEPTION 'Bounded page required' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO ids FROM (
 SELECT b.id FROM tsa.blueprint_versions b JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id
 WHERE o.enabled AND clock_timestamp()<o.available_until AND (after_blueprint IS NULL OR b.id>after_blueprint)
 AND tsa_private.simulation_active(b.id) ORDER BY b.id LIMIT page_limit+1) offered;
 shown:=ids[1:page_limit];
 SELECT COALESCE(jsonb_agg(jsonb_build_object('name',b.config->>'name','profileKind','FULL_SIMULATION',
 'sections',(SELECT jsonb_agg(jsonb_build_object('sectionId',s->>'id','section',s->>'section','questionCount',s->'count','durationSeconds',s->'durationSeconds') ORDER BY ord)
 FROM jsonb_array_elements(b.config->'sections') WITH ORDINALITY x(s,ord)),
 'questionCount',100,'durationSeconds',9000,'availableFrom',tsa.exam_instant(o.available_from),'availableUntil',tsa.exam_instant(o.available_until),
 'mode','PERSONALIZED_PRACTICE','reuseMode','NEW_ONLY','blueprintVersionId',b.id,'reviewAllowed',false) ORDER BY b.id),'[]'::jsonb)
 INTO result FROM tsa.blueprint_versions b JOIN tsa.blueprint_offerings o ON o.blueprint_version_id=b.id WHERE b.id=ANY(shown);
 RETURN jsonb_build_object('items',result,'next',CASE WHEN cardinality(ids)>page_limit THEN shown[page_limit] ELSE NULL END);
END $$;

-- Assert replacement seams so an unexpected database source aborts the whole migration.
CREATE FUNCTION pg_temp.simulation_patch(signature text,old_fragment text,new_fragment text) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef(signature::regprocedure);
 IF position(old_fragment IN definition)=0 THEN RAISE EXCEPTION 'Missing simulation seam in %: %',signature,old_fragment; END IF;
 EXECUTE replace(definition,old_fragment,new_fragment);
END $$;

DO $patch$
DECLARE d text; old text;
BEGIN
 PERFORM pg_temp.simulation_patch('tsa_private.attempt_api_root()',
  'SELECT CASE WHEN', 'SELECT CASE WHEN COALESCE(current_setting(''tsa.enable_full_simulation'',true),''false'')=''true'' THEN ''/api/v3/attempts'' WHEN');
 PERFORM pg_temp.simulation_patch('tsa_private.practice_question_compatible(uuid,uuid)',
  '((b.schema_version=''blueprint/1''', '((tsa_private.simulation_active(b.id) AND q.schema_version=''question/1'' AND s.scoring_policy_version=''practice-binary-v1'') OR (b.schema_version=''blueprint/1''');

 PERFORM pg_temp.simulation_patch('tsa.assembly_standalone_stock(uuid)',
  'IF jsonb_array_length(b.config->''sections'')<>1 THEN',
  'IF jsonb_array_length(b.config->''sections'')<>1 AND NOT tsa_private.simulation_active(b.id) THEN');
 PERFORM pg_temp.simulation_patch('tsa.assembly_standalone_stock(uuid)',
  'horizon:=b.available_until+make_interval(secs=>(b.config->''sections''->0->>''durationSeconds'')::integer);',
  'horizon:=b.available_until+make_interval(secs=>(SELECT sum((s->>''durationSeconds'')::integer)::integer FROM jsonb_array_elements(b.config->''sections'') s));');
 PERFORM pg_temp.simulation_patch('tsa.assembly_standalone_stock(uuid)',
  'v.section::text=b.config->''sections''->0->>''section''',
  'EXISTS(SELECT 1 FROM jsonb_array_elements(b.config->''sections'') sec WHERE sec->>''section''=v.section::text)');
 PERFORM pg_temp.simulation_patch('tsa.assembly_standalone_stock(uuid)',
  '''sectionId'',b.config->''sections''->0->>''id''',
  '''sectionId'',(SELECT sec->>''id'' FROM jsonb_array_elements(b.config->''sections'') sec WHERE sec->>''section''=(SELECT c.section::text FROM candidates c JOIN expanded e ON e.version_id=c.id WHERE e.unit_id=u.id LIMIT 1))');

 -- Derive a simulation-only atomic seal from the existing bundle-aware command.
 d:=pg_get_functiondef('tsa.assembly_commit_personal(text,text,jsonb)'::regprocedure);
 d:=replace(d,'tsa.assembly_commit_personal(','tsa.assembly_commit_simulation(');
 d:=replace(d,'SELECT * INTO b FROM tsa.blueprint_versions WHERE id=(m->>''blueprintVersionId'')::uuid;',
 'SELECT * INTO b FROM tsa.blueprint_versions WHERE id=(m->>''blueprintVersionId'')::uuid;
 IF NOT tsa_private.simulation_active(b.id) OR m->>''reuseMode'' IS DISTINCT FROM ''NEW_ONLY'' THEN RAISE EXCEPTION ''Simulation protocol required'' USING ERRCODE=''22023''; END IF;');
 d:=replace(d,'CASE WHEN b.schema_version=''blueprint/2'' AND tsa_private.numeric_practice_active(b.id) THEN ''assembly-manifest/2'' ELSE ''assembly-manifest/1'' END','''assembly-manifest/3''');
 d:=replace(d,'jsonb_array_length(b.config->''sections'')<>1','jsonb_array_length(b.config->''sections'')<>3');
 d:=replace(d,'expected:=(b.config->''sections''->0->>''count'')::integer;','expected:=100;');
 d:=replace(d,'OR tsa_private.numeric_practice_active(b.id)','OR tsa_private.numeric_practice_active(b.id) OR tsa_private.simulation_active(b.id)');
 d:=replace(d,'s->>''sectionId'' IS DISTINCT FROM section_id','NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.config->''sections'') sec WHERE sec->>''id''=s->>''sectionId'')');
 d:=replace(d,'AND CASE quota->>''dimension''','AND c->>''section''=(SELECT sec->>''section'' FROM jsonb_array_elements(b.config->''sections'') sec WHERE sec->>''id''=quota->>''sectionId'') AND CASE quota->>''dimension''');
 d:=replace(d,'CASE WHEN b.schema_version=''blueprint/2'' THEN ''sealed-form/2'' ELSE ''sealed-form/1'' END','''sealed-form/3''');
 old:=$old$VALUES(form_id,section_id,(b.config->'sections'->0->>'section')::tsa.question_section,0,
      (b.config->'sections'->0->>'durationSeconds')::integer,expected);$old$;
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'Missing simulation form sections seam'; END IF;
 d:=replace(d,old,$new$SELECT form_id,sec->>'id',(sec->>'section')::tsa.question_section,ord-1,
 (sec->>'durationSeconds')::integer,(sec->>'count')::integer FROM jsonb_array_elements(b.config->'sections') WITH ORDINALITY x(sec,ord);$new$);
 d:=replace(d,'VALUES(form_id,(snap->>''slotId'')::uuid,section_id,','VALUES(form_id,(snap->>''slotId'')::uuid,slot->>''sectionId'',');
 d:=replace(d,'''domain'',b.config->''sections''->0->>''section''','''profileKind'',''FULL_SIMULATION'',''questionCount'',100,''durationSeconds'',9000');
 EXECUTE d;

 PERFORM pg_temp.simulation_patch('tsa.guard_attempt_update()',
  'IF NOT FOUND OR (SELECT count(*) FROM tsa.form_sections WHERE form_id = OLD.form_id) <> 1 THEN',
  'IF (NOT FOUND OR (SELECT count(*) FROM tsa.form_sections WHERE form_id = OLD.form_id) <> 1) AND NOT tsa_private.simulation_form(OLD.form_id) THEN');
 PERFORM pg_temp.simulation_patch('tsa.guard_attempt_update()',
  'NEW.deadline_at := observed_at + make_interval(secs => section_row.duration_seconds);',
  'NEW.deadline_at := CASE WHEN tsa_private.simulation_form(OLD.form_id) THEN ''infinity''::timestamptz ELSE observed_at + make_interval(secs => section_row.duration_seconds) END;');
 PERFORM pg_temp.simulation_patch('tsa.guard_attempt_update()',
  'IF NEW.state = ''EXPIRED'' AND (OLD.deadline_at IS NULL OR observed_at < OLD.deadline_at) THEN',
  'IF NEW.state = ''EXPIRED'' AND ((NOT tsa_private.simulation_form(OLD.form_id) AND (OLD.deadline_at IS NULL OR observed_at < OLD.deadline_at)) OR (tsa_private.simulation_form(OLD.form_id) AND tsa_private.simulation_remaining(OLD.id,observed_at)>0)) THEN');
 PERFORM pg_temp.simulation_patch('tsa.guard_attempt_update()',
  'CASE WHEN NEW.state = ''EXPIRED'' THEN OLD.deadline_at ELSE observed_at END',
  'CASE WHEN NEW.state = ''EXPIRED'' AND NOT tsa_private.simulation_form(OLD.form_id) THEN OLD.deadline_at ELSE observed_at END');
 PERFORM pg_temp.simulation_patch('tsa.record_attempt_section_start()',
  'IF OLD.state = ''CREATED'' AND NEW.state = ''IN_PROGRESS'' THEN',
  'IF OLD.state = ''CREATED'' AND NEW.state = ''IN_PROGRESS'' AND NOT tsa_private.simulation_form(NEW.form_id) THEN');
 PERFORM pg_temp.simulation_patch('tsa.guard_answer_write()',
  'IF attempt_row.state <> ''IN_PROGRESS'' OR attempt_row.deadline_at IS NULL',
  'IF COALESCE(tsa.exam_simulation_save_open(NEW.attempt_id,NEW.slot_id,clock_timestamp()),true)=false THEN RAISE EXCEPTION ''Simulation section closed'' USING ERRCODE=''23514''; END IF;
  IF attempt_row.state <> ''IN_PROGRESS'' OR attempt_row.deadline_at IS NULL');

 PERFORM pg_temp.simulation_patch('tsa.exam_reconcile_attempt(uuid)','BEGIN',
 'BEGIN
 IF tsa_private.simulation_attempt(target_attempt) THEN
 IF NOT tsa_private.attempt_protocol_allowed(target_attempt) THEN RETURN false; END IF;
 RETURN tsa_private.simulation_reconcile(target_attempt); END IF;');
 PERFORM pg_temp.simulation_patch('tsa.exam_attempt_read(uuid)','BEGIN',
 'BEGIN
 IF tsa_private.simulation_attempt(target_attempt) THEN RETURN tsa_private.simulation_read(target_attempt); END IF;');
 PERFORM pg_temp.simulation_patch('tsa.exam_attempt_start(uuid,text,text)','BEGIN',
 'BEGIN
 IF tsa_private.simulation_attempt(target_attempt) THEN RETURN tsa_private.simulation_start(target_attempt,command_key,body_hash); END IF;');
 d:=pg_get_functiondef('tsa.exam_answer_save(uuid,uuid,text,text,jsonb)'::regprocedure);
 d:=replace(d,'IF NOT EXISTS(SELECT 1 FROM tsa.attempt_sections s WHERE s.attempt_id=a.id AND s.section_id=slot.section_id',
 'IF (tsa_private.simulation_form(a.form_id) AND NOT tsa.exam_simulation_save_open(a.id,target_slot,clock_timestamp())) OR (NOT tsa_private.simulation_form(a.form_id) AND NOT EXISTS(SELECT 1 FROM tsa.attempt_sections s WHERE s.attempt_id=a.id AND s.section_id=slot.section_id');
 d:=replace(d,'AND s.starts_at<=clock_timestamp() AND clock_timestamp()<s.ends_at) THEN','AND s.starts_at<=clock_timestamp() AND clock_timestamp()<s.ends_at)) THEN');
 EXECUTE d;
 PERFORM pg_temp.simulation_patch('tsa.exam_answer_save(uuid,uuid,text,text,jsonb)',
  'IF answer.saved_at>=a.deadline_at THEN',
  'IF answer.saved_at>=a.deadline_at OR tsa.exam_simulation_save_open(a.id,target_slot,answer.saved_at)=false THEN');
 PERFORM pg_temp.simulation_patch('tsa.exam_answer_save(uuid,uuid,text,text,jsonb)',
  'IF clock_timestamp()>=a.deadline_at THEN',
  'IF tsa_private.simulation_form(a.form_id) THEN PERFORM tsa.exam_reconcile_attempt(a.id); RETURN jsonb_build_object(''status'',''ERROR'',''code'',''SECTION_CLOSED''); ELSIF clock_timestamp()>=a.deadline_at THEN');

 PERFORM pg_temp.simulation_patch('tsa.assembly_active_state(boolean)',
  'permitted:=tsa.bank_form_delivery_allowed(a.form_id);',
  'IF tsa_private.simulation_form(a.form_id) THEN PERFORM tsa_private.simulation_reconcile(a.id);
   IF (SELECT state FROM tsa.attempts WHERE id=a.id) NOT IN(''CREATED'',''IN_PROGRESS'') THEN RETURN jsonb_build_object(''status'',''READY''); END IF;
   RETURN jsonb_build_object(''status'',''ACTIVE'',''attemptId'',a.id); END IF;
  permitted:=tsa.bank_form_delivery_allowed(a.form_id);');
 PERFORM pg_temp.simulation_patch('tsa.exam_worker_sweep(text,integer)','a record; permitted boolean;',
  'simulation_result jsonb; a record; permitted boolean;');
 PERFORM pg_temp.simulation_patch('tsa.exam_worker_sweep(text,integer)',
  'WHERE candidate.state IN(''CREATED'',''IN_PROGRESS'') AND (',
  'WHERE candidate.state IN(''CREATED'',''IN_PROGRESS'') AND NOT tsa_private.simulation_form(candidate.form_id) AND (');
 PERFORM pg_temp.simulation_patch('tsa.exam_worker_sweep(text,integer)',
  'RETURN jsonb_build_object(''status'',''SWEPT''',
  'simulation_result:=tsa_private.simulation_sweep(batch_limit-cancelled-expired-invalidated);
 cancelled:=cancelled+(simulation_result->>''cancelled'')::integer; expired:=expired+(simulation_result->>''expired'')::integer;
 invalidated:=invalidated+(simulation_result->>''invalidated'')::integer;
 RETURN jsonb_build_object(''status'',''SWEPT''');

 -- Opened simulation sections remain readable after exhaustion; unopened assets stay private.
 PERFORM pg_temp.simulation_patch('tsa.exam_attempt_asset(uuid,uuid,text)',
  'AND section.starts_at<=clock_timestamp() AND clock_timestamp()<section.ends_at))',
  'AND section.starts_at<=clock_timestamp() AND clock_timestamp()<section.ends_at) OR (tsa_private.simulation_form(a.form_id) AND EXISTS(SELECT 1 FROM tsa_private.simulation_section_clocks c WHERE c.attempt_id=a.id AND c.section_id=slot.section_id AND c.first_opened_at IS NOT NULL)))');

 PERFORM pg_temp.simulation_patch('tsa.exam_worker_load(uuid,text,bigint)',
  '''policyVersion'',policy,''inputHash'',input_hash,',
  '''policyVersion'',policy,''inputHash'',input_hash,''fullSimulation'',tsa_private.simulation_form(a.form_id),');

 d:=pg_get_functiondef('tsa.exam_history_page(integer,timestamptz,uuid)'::regprocedure);
 d:=replace(d,'tsa.exam_history_page(','tsa.exam_simulation_history(');
 d:=replace(d,'''domain'',section.section','''profileKind'',''FULL_SIMULATION''');
 d:=replace(d,'JOIN tsa.form_sections section ON section.form_id=a.form_id','JOIN tsa.form_sections section ON section.form_id=a.form_id AND section.ordinal=0');
 EXECUTE d;

 -- Result release uses the existing guarded query, with an explicit multi-section projection.
 d:=pg_get_functiondef('tsa.exam_released_review(uuid)'::regprocedure);
 d:=replace(d,'tsa.exam_released_review(','tsa.exam_simulation_released_review(');
 d:=replace(d,'SELECT section INTO STRICT domain FROM tsa.form_sections WHERE form_id=a.form_id;',
 'IF NOT tsa_private.simulation_form(a.form_id) THEN RETURN NULL; END IF;');
 d:=replace(d,'''domain'',domain,','');
 EXECUTE d;
END $patch$;

REVOKE ALL ON FUNCTION tsa_private.simulation_form(uuid),tsa_private.simulation_attempt(uuid),tsa_private.simulation_active(uuid),
 tsa_private.simulation_remaining(uuid,timestamptz),tsa_private.simulation_close_clocks(uuid,timestamptz),
 tsa_private.simulation_stop_clocks(),tsa_private.simulation_reconcile(uuid),tsa_private.simulation_read(uuid),
 tsa_private.simulation_start(uuid,text,text),tsa_private.simulation_sweep(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tsa.assembly_commit_simulation(text,text,jsonb),tsa.exam_simulation_switch(uuid,text,text,text),
 tsa.exam_simulation_save_open(uuid,uuid,timestamptz),tsa.exam_simulation_catalog(integer,uuid),tsa.exam_simulation_released_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.assembly_commit_simulation(text,text,jsonb),tsa.exam_simulation_switch(uuid,text,text,text),
 tsa.exam_simulation_save_open(uuid,uuid,timestamptz),tsa.exam_simulation_catalog(integer,uuid),tsa.exam_simulation_released_review(uuid) TO tsa_exam;

REVOKE ALL ON FUNCTION tsa.exam_simulation_history(integer,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tsa.exam_simulation_history(integer,timestamptz,uuid) TO tsa_exam;
