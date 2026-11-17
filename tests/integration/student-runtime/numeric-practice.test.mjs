import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createNumericFixture } from './numeric-fixture.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { normalizeDecimal } from '../../../packages/contracts/dist/numeric-response.js';
import { createStudentDirectoryService } from '../../../src/modules/attempts/directory.mjs';
import { createExamSweeper } from '../../../src/modules/jobs/exam-sweeper.mjs';

const rate = { capacity: 100, refillPerSecond: 10 };
function service(f, enableNumericPractice = true) {
  return createAttemptService({ examPool: f.examPool, identityService: f.identityService,
    enableNumericPractice, createRate: rate, saveRate: { user: rate, attempt: rate } });
}

test('numeric Bank inventory allocates, persists exact responses, grades and releases through the existing engine', { timeout: 30000 }, async t => {
  const f = await createNumericFixture(); t.after(() => f.close());
  const commands = service(f), legacy = service(f, false), owner = f.principals.studentA;
  const directory = createStudentDirectoryService({examPool:f.examPool,identityService:f.identityService,
    enableNumericPractice:true,enableReviewPractice:true});
  assert.equal((await directory.catalog(owner)).items[0].reviewAllowed,false,'numeric catalog never advertises unsupported repeat consent');
  for (const value of ['1',' -000.000 ', '\uFEFF+01,500\u00A0', '\t-0002.25000\r\n',
    '9'.repeat(40)+'.'+'1'.repeat(20), '0.'+'0'.repeat(19)+'1', '1,000', '1e3', '1/2', '',
    '1,2.3', '\u200B1', '１', '1'.repeat(41), '0.'+'0'.repeat(21)]) {
    const sql = (await f.pool.query('SELECT tsa.exam_normalize_decimal($1) AS value',[value])).rows[0].value;
    assert.equal(sql,normalizeDecimal(value),JSON.stringify(value));
  }
  await assert.rejects(legacy.create(owner, randomUUID(), { blueprintVersionId: f.blueprint.versionId }));
  const key = randomUUID(), request = { blueprintVersionId: f.blueprint.versionId };
  const created = await commands.create(owner, key, request), id = created.body.attemptId;
  assert.equal(created.status, 201);
  assert.equal((await commands.create(owner, key, request)).body.attemptId, id);
  assert.equal(await legacy.read(owner, id), null);
  assert.equal(await commands.read(f.principals.studentB, id), null);
  await commands.start(owner, id, randomUUID());
  let view = await commands.read(owner, id);
  assert.equal(view.slots.length, 4);
  assert.doesNotMatch(JSON.stringify(view), /SYNTHETIC_NUMERIC_PRIVATE|answerKey|scoringPolicyVersion/);
  const questionBySlot = new Map((await f.pool.query('SELECT slot_id,question_version_id FROM tsa.form_slots WHERE form_id=$1', [created.body.formId])).rows.map(r => [r.slot_id, r.question_version_id]));
  for (const slot of view.slots) {
    const correct = f.numericKeys.get(questionBySlot.get(slot.slotId));
    assert.equal(typeof correct, 'string');
    const raw = correct === '1.5' ? '  +01,500  ' : correct;
    const saveKey = randomUUID(), body = { expectedRevision: 0, value: { type: 'NUMERIC_RESPONSE', value: raw } };
    const ack = await commands.save(owner, id, slot.slotId, saveKey, body);
    assert.equal(ack.body.value.value, raw);
    assert.deepEqual((await commands.save(owner, id, slot.slotId, saveKey, body)).body, ack.body);
    await assert.rejects(commands.save(owner, id, slot.slotId, randomUUID(), body), e => e.code === 'REVISION_CONFLICT' && e.details.currentAnswer.value === raw);
    for (const invalid of ['1/2', '1e3', 'NaN', '1,2,3', '', '2 cm']) {
      await assert.rejects(commands.save(owner, id, slot.slotId, randomUUID(), { expectedRevision: 1,
        value: { type: 'NUMERIC_RESPONSE', value: invalid } }), e => e.code === 'VALIDATION_ERROR');
    }
  }
  view = await service(f).read(owner, id);
  assert.equal(view.answers.length, 4);
  const first = view.slots[0], old = view.answers.find(a => a.slotId === first.slotId);
  await commands.save(owner, id, first.slotId, randomUUID(), { expectedRevision: old.revision, value: { type: 'NUMERIC_RESPONSE', value: null } });
  await commands.save(owner, id, first.slotId, randomUUID(), { expectedRevision: old.revision + 1, value: old.value });
  await commands.submit(owner, id, randomUUID());
  await f.pool.query('CREATE ROLE numeric_grader LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO numeric_grader');
  const workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'numeric_grader' });
  try {
    const worker = createExamWorker({ workerPool, executorId: 'numeric-lifecycle', leaseSeconds: 30, retrySeconds: 1 });
    assert.equal((await worker.runOnce()).status, 'GRADED');
    assert.equal((await worker.runOnce()).status, 'IDLE');
  } finally { await workerPool.end(); }
  const graded = await commands.read(owner, id);
  assert.equal(graded.state, 'GRADED');
  const review = await commands.withReadBoundary(owner, async ports => {
    const access = await ports.readAccess({ attemptId: id, userId: owner.userId });
    return ports.loadReleasedReview({ attemptId: id, userId: owner.userId, access });
  });
  assert.equal(review.items.length, 4);
  assert.equal(review.correctCount, 4); assert.equal(review.policyVersion, 'practice-binary-v2');
  assert.equal(review.items.every(item => item.correctAnswer.type === 'NUMERIC_RESPONSE'), true);
  assert.equal(await legacy.read(owner, id), null);
});

test('numeric expiry is reconciled and graded without a live student protocol context', { timeout: 30000 }, async t => {
  const f=await createNumericFixture({durationSeconds:1}); let workerPool;
  t.after(async()=>{await workerPool?.end();await f.close();});
  const commands=service(f), owner=f.principals.studentA;
  const created=await commands.create(owner,randomUUID(),{blueprintVersionId:f.blueprint.versionId}), id=created.body.attemptId;
  await commands.start(owner,id,randomUUID());
  await f.pool.query('CREATE ROLE numeric_expiry_worker LOGIN');await f.pool.query('GRANT tsa_exam_worker TO numeric_expiry_worker');
  workerPool=createDatabasePool({...f.harness.database.connectionConfig,user:'numeric_expiry_worker'});
  const sweeper=createExamSweeper({workerPool,executorId:'numeric-expiry',batchSize:10});
  const until=Date.now()+4000;
  do {await sweeper.sweepOnce();if((await commands.read(owner,id)).state==='EXPIRED')break;await new Promise(resolve=>setTimeout(resolve,40));}while(Date.now()<until);
  assert.equal((await commands.read(owner,id)).state,'EXPIRED');
  assert.equal((await createExamWorker({workerPool,executorId:'numeric-expiry',leaseSeconds:30,retrySeconds:1}).runOnce()).status,'GRADED');
  const review=await commands.withReadBoundary(owner,async ports=>{
    const access=await ports.readAccess({attemptId:id,userId:owner.userId});
    return ports.loadReleasedReview({attemptId:id,userId:owner.userId,access});
  });
  assert.equal(review.correctCount,0);assert.equal(review.totalCount,4);
});

test('versioned numeric HTTP validates conflicts and protects v1 discovery and student disclosure', { timeout: 30000 }, async t => {
  const f = await createNumericFixture(); let runtime, workerPool;
  t.after(async () => { await runtime?.close(); await workerPool?.end(); await f.close(); });
  await f.pool.query('CREATE ROLE numeric_http_grader LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO numeric_http_grader');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'numeric_http_grader' });
  runtime = await createStudentRuntime({ identityPool: f.harness.authPool, examPool: f.examPool, workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0, enableNumericPractice: true,
    pollMilliseconds: 20, sweepBatchSize: 10, executorId: 'numeric-http', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const jar = new Map();
  async function send(path, method = 'GET', body, key = randomUUID()) {
    const headers = new Headers({ origin: runtime.origin });
    if (jar.size) headers.set('cookie', [...jar].map(([k,v]) => `${k}=${v}`).join('; '));
    if (body !== undefined) { headers.set('content-type', 'application/json'); headers.set('idempotency-key', key); }
    if (jar.has('tsa_local_csrf')) headers.set('x-csrf-token', jar.get('tsa_local_csrf'));
    const response = await fetch(runtime.origin+path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    for (const line of response.headers.getSetCookie()) { const [pair] = line.split(';'), at = pair.indexOf('='); jar.set(pair.slice(0,at), pair.slice(at+1)); }
    const data = await response.json(); return { status: response.status, data };
  }
  assert.equal((await send('/api/v2/catalog')).status, 401);
  assert.equal((await send('/local-auth/bootstrap', 'POST', {})).status, 201);
  assert.equal((await send('/local-auth/login', 'POST', { actorKey: 'studentA' })).status, 200);
  const catalog = await send('/api/v2/catalog'); assert.equal(catalog.status, 200);
  assert.equal(catalog.data.items.length, 1); assert.equal(catalog.data.items[0].blueprintVersionId, f.blueprint.versionId);
  assert.equal((await send('/api/v1/catalog')).data.items.length, 0);
  const created = await send('/api/v2/attempts', 'POST', { blueprintVersionId: f.blueprint.versionId });
  assert.equal(created.status, 201); const id = created.data.attemptId;
  assert.equal((await send('/api/v1/attempts')).data.items.length, 0);
  assert.equal((await send(`/api/v1/attempts/${id}`)).status, 404);
  assert.equal((await send(`/api/v2/attempts/${id}/start`, 'POST', {})).status, 200);
  const current = await send(`/api/v2/attempts/${id}`); assert.equal(current.status, 200);
  assert.doesNotMatch(JSON.stringify(current.data), /answerKey|correctAnswer|SYNTHETIC_NUMERIC_PRIVATE/);
  const slot = current.data.slots[0], raw = ' +0001,5000 ';
  const body = { expectedRevision: 0, value: { type: 'NUMERIC_RESPONSE', value: raw } }, saveKey = randomUUID();
  const url = `/api/v2/attempts/${id}/answers/${slot.slotId}`;
  assert.equal((await send(url.replace('/v2/','/v1/'), 'PUT', { expectedRevision:0,value:{type:'SINGLE_CHOICE',optionId:'a'} })).status,404);
  assert.equal((await send(`/api/v1/attempts/${id}/submit`, 'POST', {})).status,404);
  assert.equal((await send(url, 'PUT', body, saveKey)).status, 200);
  const replay = await send(url, 'PUT', body, saveKey); assert.equal(replay.status, 200); assert.equal(replay.data.value.value, raw);
  const conflict = await send(url, 'PUT', body); assert.equal(conflict.status, 409);
  assert.equal(conflict.data.error.details.currentAnswer.value, raw);
  assert.equal((await send(url, 'PUT', { ...body, value: { type: 'NUMERIC_RESPONSE', value: '1/2' } })).status, 422);
  assert.equal((await send(`/api/v2/attempts/${id}/result`)).status, 409);
  assert.equal((await send(`/api/v2/attempts/${id}/submit`, 'POST', {})).status, 200);
  let result; const until = Date.now()+5000;
  do { result = await send(`/api/v2/attempts/${id}/result`); if (result.status === 200) break; await new Promise(resolve => setTimeout(resolve,20)); } while (Date.now()<until);
  assert.equal(result.status, 200); assert.equal(result.data.policyVersion, 'practice-binary-v2');
  assert.equal(result.data.items.length, 4);
  const history = await send('/api/v2/attempts'); assert.equal(history.status, 200); assert.equal(history.data.items[0].score.totalCount, 4);
});
