import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { chmod, writeFile } from 'node:fs/promises';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createAttemptAssetService } from '../../../src/modules/attempts/asset-service.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createImageFixture } from './image-fixture.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';

const rate = { capacity: 100, refillPerSecond: 10 };
const denied = (error) => error?.status === 404 && error?.code === 'NOT_FOUND';
async function setup(t, { short = false, start = true } = {}) {
  const f = await createImageFixture(t); await f.approveImage();
  let blueprintVersionId = f.blueprint.versionId;
  if (short) {
    const config = structuredClone(f.blueprint.config); config.sections[0].durationSeconds = 1;
    const id = randomUUID(); blueprintVersionId = randomUUID();
    await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, `Synthetic image deadline ${id}`]);
    await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [blueprintVersionId, id, config.taxonomyVersionId, config, jsonDigest(config)]);
    await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',600)`, [blueprintVersionId]);
  }
  f.commands = createAttemptService({ examPool: f.examPool, identityService: f.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  f.attempt = (await f.commands.create(f.principals.studentA, randomUUID(), { blueprintVersionId })).body;
  if (start) await f.commands.start(f.principals.studentA, f.attempt.attemptId, randomUUID());
  f.read = (purpose = 'question', store = f.imageStore) => createAttemptAssetService({
    examPool: f.examPool, identityService: f.identityService, imageStore: store,
  }).read(f.principals.studentA, f.attempt.attemptId, f.assets[purpose.toUpperCase()].id, purpose);
  return f;
}
async function rights(f, status) {
  const source = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
  return source.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
    status, allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic image authorization test, not a rights attestation.', expectedRevision: 1,
  });
}
async function deadline(f, leadMilliseconds = 0) {
  const until = Date.now()+2500;
  while (Date.now()<until) {
    const reached = (await f.pool.query(`SELECT clock_timestamp()>=deadline_at-($2::integer*interval '1 millisecond') AS reached
      FROM tsa.attempts WHERE id=$1`, [f.attempt.attemptId, leadMilliseconds])).rows[0].reached;
    if (reached) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('Authoritative PostgreSQL deadline was not observed');
}

for (const status of ['REVOKED', 'UNKNOWN', 'REFERENCE_ONLY']) test(`current ${status} rights deny both purposes and invalidate the owned attempt`, { timeout: 15000 }, async (t) => {
  const f = await setup(t); await rights(f, status);
  for (const purpose of ['question','explanation']) await assert.rejects(f.read(purpose), denied);
  assert.equal((await f.pool.query('SELECT state FROM tsa.attempts WHERE id=$1', [f.attempt.attemptId])).rows[0].state, 'INVALIDATED');
});

test('created and cancelled attempts deny bytes, and submitted queued/running/failed jobs never release explanations', { timeout: 15000 }, async (t) => {
  const f = await setup(t, { start: false });
  await assert.rejects(f.read(), denied); await assert.rejects(f.read('explanation'), denied);
  await f.commands.start(f.principals.studentA, f.attempt.attemptId, randomUUID());
  await f.commands.submit(f.principals.studentA, f.attempt.attemptId, randomUUID());
  await assert.rejects(f.read('explanation'), denied);
  const claimed = (await f.pool.query("SELECT tsa.exam_worker_claim('image-state-matrix',30) AS result")).rows[0].result;
  assert.equal(claimed.status, 'CLAIMED');
  await assert.rejects(f.read('explanation'), denied);
  const failed = (await f.pool.query("SELECT tsa.exam_worker_fail($1,'image-state-matrix',$2,'DIGEST_MISMATCH',1) AS result",
    [claimed.dispatch.jobId, claimed.leaseToken])).rows[0].result;
  assert.equal(failed.status, 'FAILED_FINAL');
  await assert.rejects(f.read(), denied); await assert.rejects(f.read('explanation'), denied);
  const created = (await f.commands.create(f.principals.studentB, randomUUID(), { blueprintVersionId: f.blueprint.versionId })).body;
  await rights(f, 'REVOKED');
  assert.equal((await f.pool.query('SELECT state FROM tsa.attempts WHERE id=$1', [created.attemptId])).rows[0].state, 'CANCELLED');
  const service = createAttemptAssetService({ examPool: f.examPool, identityService: f.identityService, imageStore: f.imageStore });
  await assert.rejects(service.read(f.principals.studentB, created.attemptId, f.assets.QUESTION.id, 'question'), denied);
});

test('a deadline crossed during the buffered image read denies bytes and commits one EXPIRED job', { timeout: 15000 }, async (t) => {
  const f = await setup(t, { short: true });
  await deadline(f, 180);
  let enter, release;
  const reached = new Promise((resolve) => { enter=resolve; });
  const gate = new Promise((resolve) => { release=resolve; });
  const store = { status: f.imageStore.status, async read(...args) { enter(); await gate; return f.imageStore.read(...args); } };
  const pending = f.read('question', store); const rejection = assert.rejects(pending, denied);
  let timeout;
  try {
    await Promise.race([reached, new Promise((_, fail) => { timeout=setTimeout(() => fail(new Error('Initial authorization never reached the read barrier')), 700); })]);
    await deadline(f); release(); await rejection;
  } finally { clearTimeout(timeout); release(); await Promise.allSettled([pending,rejection]); }
  const state = (await f.pool.query(`SELECT a.state,(SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=a.id) AS jobs
    FROM tsa.attempts a WHERE a.id=$1`, [f.attempt.attemptId])).rows[0];
  assert.deepEqual(state, { state: 'EXPIRED', jobs: 1 });
  await assert.rejects(f.read(), denied);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.jobs WHERE attempt_id=$1', [f.attempt.attemptId])).rows[0].n, 1);
});

test('an inspected but unreferenced asset stays private and the whole authorization transaction is bounded', { timeout: 15000 }, async (t) => {
  const f = await setup(t), id = randomUUID();
  await f.pool.query(`INSERT INTO tsa.asset_versions(id,source_version_id,object_key,content_hash,mime,byte_size,alt_metadata,security_class)
    SELECT $1::uuid,source_version_id,($1::uuid)::text,content_hash,mime,byte_size,alt_metadata,security_class FROM tsa.asset_versions WHERE id=$2`, [id, f.assets.QUESTION.id]);
  await f.pool.query(`INSERT INTO tsa_private.asset_inspections(asset_version_id,content_hash,media_type,byte_size,width,height,decoder_version)
    SELECT $1,content_hash,media_type,byte_size,width,height,decoder_version FROM tsa_private.asset_inspections WHERE asset_version_id=$2`, [id, f.assets.QUESTION.id]);
  const assets = createAttemptAssetService({ examPool: f.examPool, identityService: f.identityService, imageStore: f.imageStore });
  await assert.rejects(assets.read(f.principals.studentA, f.attempt.attemptId, id, 'question'), denied);
  const locker = await f.pool.connect();
  try {
    await locker.query('BEGIN'); await locker.query('SELECT pg_advisory_xact_lock(1414742321,1)');
    const before = Date.now(); await assert.rejects(f.read(), denied);
    assert.ok(Date.now()-before < 3500, 'the locked guard aborts within its bounded transaction budget');
  } finally { await locker.query('ROLLBACK'); locker.release(); }
});

test('natural rights expiry during a released explanation read denies bytes and commits revocation', { timeout: 15000 }, async (t) => {
  const f=await setup(t);
  await f.commands.submit(f.principals.studentA,f.attempt.attemptId,randomUUID());
  assert.equal((await createExamWorker({workerPool:f.pool,executorId:'image-rights-expiry',leaseSeconds:30,retrySeconds:1}).runOnce()).status,'GRADED');
  const validTo=(await f.pool.query("SELECT tsa.exam_instant(clock_timestamp()+interval '300 milliseconds') AS at")).rows[0].at;
  const sources=await createSourceService({bankPool:f.bankPool,identityService:f.identityService});
  await sources.registerRightsDecision(f.principals.bankManager,f.source.sourceVersionId,randomUUID(),{
    status:'OWNED',allowedUses:['DISPLAY'],territory:['VN'],validFrom:'2000-01-01T00:00:00Z',validTo,
    evidence:'Synthetic short-lived display authorization.',expectedRevision:1,
  });
  let entered,release;
  const reached=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const store={status:f.imageStore.status,async read(...args){entered();await gate;return f.imageStore.read(...args);}};
  const pending=f.read('explanation',store);const rejection=assert.rejects(pending,denied);
  let timeout;
  try{
    await Promise.race([reached,new Promise((_,fail)=>{timeout=setTimeout(()=>fail(new Error('Released image authorization did not reach the read barrier')),700);})]);
    const until=Date.now()+700;
    while(Date.now()<until){
      if((await f.pool.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[validTo])).rows[0].expired)break;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    release();await rejection;
  }finally{clearTimeout(timeout);release();await Promise.allSettled([pending,rejection]);}
  assert.equal((await f.pool.query('SELECT state FROM tsa.attempts WHERE id=$1',[f.attempt.attemptId])).rows[0].state,'INVALIDATED');
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.result_releases WHERE attempt_id=$1 AND revoked_at IS NULL',[f.attempt.attemptId])).rows[0].n,0);
});

test('unknown source rights roll back image inspection evidence and never write a passing question profile', { timeout: 15000 }, async (t) => {
  const f=await createImageFixture(t);await rights(f,'UNKNOWN');
  await assert.rejects(f.imageWorkflow.submitReview(f.principals.author,f.imageQuestion.versionId,randomUUID(),{expectedRevision:1}),
    error=>error?.code==='RIGHTS_BLOCKED');
  for(const table of ['asset_inspections','question_delivery_checks']) {
    assert.equal((await f.pool.query(`SELECT count(*)::int AS n FROM tsa_private.${table}`)).rows[0].n,0);
  }
  assert.equal((await f.pool.query('SELECT state FROM tsa.question_workflow WHERE question_version_id=$1',[f.imageQuestion.versionId])).rows[0].state,'DRAFT');
});

test('corrupt bytes cannot obtain an inspection or profile PASS, and a corrected object can be reviewed normally', { timeout: 15000 }, async (t) => {
  const f=await createImageFixture(t),image=f.assets.QUESTION;
  await chmod(image.path,0o600);await writeFile(image.path,Buffer.from('corrupt object'));
  await assert.rejects(f.imageWorkflow.submitReview(f.principals.author,f.imageQuestion.versionId,randomUUID(),{expectedRevision:1}),
    error=>error?.code==='ASSET_SANITIZATION_REQUIRED');
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_private.asset_inspections')).rows[0].n,0);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_private.question_delivery_checks')).rows[0].n,0);
  await writeFile(image.path,image.bytes);await chmod(image.path,0o400);await f.approveImage();
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_private.question_delivery_checks')).rows[0].n,4);
});
