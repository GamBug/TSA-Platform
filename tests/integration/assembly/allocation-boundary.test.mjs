import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { studentRouteRegistry, runAssemblyReference } from '../../../packages/contracts/dist/internal.js';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createAllocationFixture } from './fixtures.mjs';

function service(f, examPool=f.examPool) { return createAllocationService({examPool,identityService:f.identityService}); }
function body(blueprint) { return {blueprintVersionId:blueprint.versionId}; }
async function expectError(promise,status,code) {
  await assert.rejects(promise,error=>{
    assert.equal(error.status,status);assert.equal(error.code,code);
    studentRouteRegistry.createAttempt.responses[status].schema.parse({error:{code,message:code,requestId:randomUUID(),details:error.details??{}}});
    assert.equal(JSON.stringify(error.details??{}).includes('answerKey'),false);
    return true;
  });
}
async function waitPast(pool,instant) {
  while ((await pool.query('SELECT clock_timestamp()>=$1::timestamptz AS ready',[instant])).rows[0].ready!==true) {
    await new Promise(resolve=>setTimeout(resolve,25));
  }
}
async function blueprint(f,{duration=600,closeAfterSeconds=86400}={}) {
  const id=randomUUID(),versionId=randomUUID();
  const config={...f.blueprint.config,name:`Boundary ${id}`,sections:[{...f.blueprint.config.sections[0],durationSeconds:duration}]};
  await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)',[id,config.name]);
  await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`,[versionId,id,config.taxonomyVersionId,config,jsonDigest(config)]);
  await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 day',clock_timestamp()+make_interval(secs=>$2),600)`,[versionId,closeAfterSeconds]);
  return {versionId,config};
}
function interceptPool(pool,hook) {
  return {async connect(){const client=await pool.connect();return new Proxy(client,{get(target,key){
    if(key==='query') return (...args)=>hook(target.query.bind(target),...args);
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});}};
}
async function state(f,attemptId) {
  return (await f.pool.query(`SELECT a.state,a.cancellation_reason,a.grading_status,
    (SELECT count(*)::int FROM tsa.jobs j WHERE j.attempt_id=a.id) AS jobs,
    (SELECT count(*)::int FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    (SELECT expires_at FROM tsa.idempotency_records r WHERE r.related_attempt_id=a.id) AS expires_at
    FROM tsa.attempts a WHERE a.id=$1`,[attemptId])).rows[0];
}

test('creation boundary preserves lifecycle reconciliation, receipt precedence and database-clock admission',async t=>{
  const f=await createAllocationFixture({questionCount:8,blueprintCount:4});t.after(()=>f.close());
  const s=service(f),a=f.principals.studentA,b=f.principals.studentB;
  await t.test('TTL cleanup commits even when the requested offering is unavailable; old receipt replays unchanged',async()=>{
    const short=await blueprint(f,{closeAfterSeconds:2});
    const key=randomUUID();const created=await s.create(a,key,body(short));
    studentRouteRegistry.createAttempt.responses[201].schema.parse(created.body);
    await expectError(s.create(a,key,{...body(short),mode:'PERSONALIZED_PRACTICE',reuseMode:'NEW_ONLY'}),409,'IDEMPOTENCY_CONFLICT');
    for(const request of [
      {mode:'PERSONALIZED_PRACTICE',blueprintVersionId:short.versionId,reuseMode:'REVIEW_ALLOWED',acknowledgeRepeats:true},
      {mode:'PUBLISHED_FIXED',formId:randomUUID(),reuseMode:'FIXED_AS_PUBLISHED',acknowledgeRepeats:true},
    ]) await expectError(s.create(a,randomUUID(),request),409,'CONCURRENT_ATTEMPT_EXISTS');

    const before=(await f.pool.query('SELECT * FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id',[a.userId])).rows;
    const run=(await f.pool.query('SELECT * FROM tsa.assembly_runs WHERE user_id=$1',[a.userId])).rows[0];
    assert.equal(run.manifest_hash,jsonDigest(run.manifest));
    const replay=runAssemblyReference(run.manifest);
    assert.equal(replay.status,'SUCCESS');assert.equal(replay.slotsHash,run.diagnostics.slotsHash);
    const slots=(await f.pool.query('SELECT question_version_id,ordinal FROM tsa.form_slots WHERE form_id=$1 ORDER BY ordinal',[created.body.formId])).rows;
    assert.deepEqual(slots.map(row=>row.question_version_id),replay.slots.map(slot=>slot.questionVersionId));
    assert.deepEqual(slots.map(row=>row.ordinal),[1,2,3,4]);
    for(const sql of [
      "UPDATE tsa.assembly_runs SET manifest='{}' WHERE id=$1",
      "UPDATE tsa.forms SET content_hash='sha256:'||repeat('0',64) WHERE assembly_run_id=$1",
      "UPDATE tsa.form_slots SET public_snapshot='{}' WHERE form_id=(SELECT id FROM tsa.forms WHERE assembly_run_id=$1)",
    ]) await assert.rejects(f.pool.query(sql,[run.id]),{code:'55000'});

    await waitPast(f.pool,created.body.startBefore);
    await expectError(s.create(a,randomUUID(),{mode:'PERSONALIZED_PRACTICE',blueprintVersionId:short.versionId,
      reuseMode:'REVIEW_ALLOWED',acknowledgeRepeats:true}),503,'TEMPORARILY_UNAVAILABLE');
    assert.equal((await state(f,created.body.attemptId)).cancellation_reason,'START_TTL_EXPIRED',
      'an unsupported mode still commits global stale-attempt reconciliation');

    assert.deepEqual((await s.create(a,key,body(short))).body,created.body,'same key replays before TTL reconciliation');
    await expectError(s.create(a,randomUUID(),body(short)),410,'FORM_UNAVAILABLE');
    assert.equal((await state(f,created.body.attemptId)).state,'CANCELLED');
    assert.equal((await state(f,created.body.attemptId)).cancellation_reason,'START_TTL_EXPIRED');
    assert.equal((await state(f,created.body.attemptId)).jobs,0);
    assert.equal((await state(f,created.body.attemptId)).history,4);
    assert.ok((await state(f,created.body.attemptId)).expires_at,'terminal receipt retained at least seven days');
    assert.deepEqual((await f.pool.query('SELECT * FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id',[a.userId])).rows,before);
    const later=await s.create(a,randomUUID(),body(f.blueprint));
    assert.equal(later.status,201);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM tsa.student_question_history WHERE user_id=$1',[a.userId])).rows[0].n,8);
    await f.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1",[later.body.attemptId]);
  });
  await t.test('elapsed IN_PROGRESS closes with exactly one durable grading job before subsequent shortage',async()=>{
    const brief=await blueprint(f,{duration:1});const key=randomUUID();
    const created=await s.create(b,key,body(brief));
    await f.pool.query("UPDATE tsa.attempts SET state='IN_PROGRESS' WHERE id=$1",[created.body.attemptId]);
    const deadline=(await f.pool.query('SELECT deadline_at::text AS deadline_at FROM tsa.attempts WHERE id=$1',[created.body.attemptId])).rows[0].deadline_at;
    await waitPast(f.pool,deadline);
    // Exhaust every remaining identity to make the follow-up fail after cleanup.
    await f.pool.query(`INSERT INTO tsa.student_question_history(user_id,question_id)
      SELECT $1,q.id FROM tsa.questions q WHERE NOT EXISTS(SELECT 1 FROM tsa.student_question_history h WHERE h.user_id=$1 AND h.question_id=q.id)`,[b.userId]);
    await expectError(s.create(b,randomUUID(),body(f.blueprint)),422,'INSUFFICIENT_UNSEEN_INVENTORY');
    const actual=await state(f,created.body.attemptId);
    assert.equal(actual.state,'EXPIRED');assert.equal(actual.grading_status,'PENDING');assert.equal(actual.jobs,1);assert.equal(actual.expires_at,null);
    const job=(await f.pool.query('SELECT * FROM tsa.jobs WHERE attempt_id=$1',[created.body.attemptId])).rows[0];
    const hash=(await f.pool.query('SELECT tsa.exam_grading_input_hash($1) hash',[created.body.attemptId])).rows[0].hash;
    assert.equal(job.dedup_key,`${created.body.attemptId}:practice-binary-v1:${hash}`);
    assert.equal(job.kind,'exam_grade_attempt');assert.equal(job.state,'QUEUED');
    await expectError(s.create(b,randomUUID(),body(f.blueprint)),422,'INSUFFICIENT_UNSEEN_INVENTORY');
    assert.equal((await state(f,created.body.attemptId)).jobs,1);
    assert.deepEqual((await s.create(b,key,body(brief))).body,created.body);
  });
  await t.test('current SQL candidate authorization and own receipt scope cannot be bypassed',async()=>{
    const receipt=(await f.pool.query('SELECT idempotency_key,request_hash FROM tsa.idempotency_records WHERE actor_id=$1 LIMIT 1',[a.userId])).rows[0];
    const foreign=await withTransaction(f.examPool,async c=>{
      await c.query("SELECT set_config('tsa.local_user_id',$1,true)",[b.userId]);
      return (await c.query('SELECT tsa.assembly_receipt($1,$2) result',[receipt.idempotency_key,receipt.request_hash])).rows[0].result;
    },{role:'tsa_exam'});
    assert.equal(foreign,null);
    for(const role of ['tsa_web','tsa_bank','tsa_factory','tsa_identity']) await assert.rejects(
      withTransaction(f.pool,c=>c.query('SELECT tsa.assembly_commit_personal($1,$2,$3)',[randomUUID(),jsonDigest({}),{}]),{role}),{code:'42501'});
    await assert.rejects(withTransaction(f.examPool,c=>c.query('SELECT tsa.assembly_creation_check($1,$2,$3)',[randomUUID(),jsonDigest({}),f.blueprint.versionId]),{role:'tsa_exam'}),{code:'42501'});
  });
});

test('admission changes around capture and the required attempt insert use frozen route error mappings',async t=>{
  const f=await createAllocationFixture({questionCount:4,blueprintCount:4});t.after(()=>f.close());
  const a=f.principals.studentA;
  await t.test('offering closing after preflight maps to 410 during stock capture',async()=>{
    const short=await blueprint(f,{closeAfterSeconds:1});let paused=false;
    const wrapped=interceptPool(f.examPool,async(query,text,values)=>{
      if(!paused&&typeof text==='string'&&text.includes('tsa.assembly_standalone_stock')){
        paused=true;const until=(await f.pool.query('SELECT available_until FROM tsa.blueprint_offerings WHERE blueprint_version_id=$1',[short.versionId])).rows[0].available_until;
        await waitPast(f.pool,until);
      }
      return query(text,values);
    });
    await expectError(service(f,wrapped).create(a,randomUUID(),body(short)),410,'FORM_UNAVAILABLE');assert.ok(paused);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM tsa.forms')).rows[0].n,0);
  });
  await t.test('fresh-clock attempt admission failure rolls back every preceding seal write',async()=>{
    const short=await blueprint(f,{closeAfterSeconds:1});
    await f.pool.query(`CREATE FUNCTION tsa_private.test_delay_admission() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE remaining double precision; BEGIN
        SELECT greatest(extract(epoch FROM (available_until-clock_timestamp()))::double precision+0.05,0)
          INTO remaining FROM tsa.blueprint_offerings WHERE blueprint_version_id='${short.versionId}'::uuid;
        PERFORM pg_sleep(remaining);RETURN NEW;
      END $$`);
    await f.pool.query(`CREATE TRIGGER aaa_test_delay_admission BEFORE INSERT ON tsa.attempts FOR EACH ROW EXECUTE FUNCTION tsa_private.test_delay_admission()`);
    try {await expectError(service(f).create(a,randomUUID(),body(short)),410,'FORM_UNAVAILABLE');}
    finally {await f.pool.query('DROP TRIGGER aaa_test_delay_admission ON tsa.attempts');await f.pool.query('DROP FUNCTION tsa_private.test_delay_admission()');}
    for(const table of ['assembly_runs','forms','form_sections','form_slots','attempts','student_question_history'])
      assert.equal((await f.pool.query(`SELECT count(*)::int n FROM tsa.${table}`)).rows[0].n,0,table);
    assert.equal((await f.pool.query("SELECT count(*)::int n FROM tsa.idempotency_records WHERE route_scope='POST /api/v1/attempts'")).rows[0].n,0);
    assert.equal((await f.pool.query('SELECT count(*)::int n FROM tsa_private.form_slot_secrets')).rows[0].n,0);
  });
});
