import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createHttpBoundaryHandler } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

async function setup(t, ownerSession = false) {
  const f = await createAllocationFixture({ questionCount: 4 }); let workerPool;
  t.after(async () => { if (workerPool) await workerPool.end(); await f.close(); });
  const create = (examPool) => createAttemptService({ examPool, identityService: f.identityService,
    createRate: { capacity: 100, refillPerSecond: 1 } });
  const service = create(f.examPool), p = f.principals.studentA;
  const attemptId = (await service.create(p, randomUUID(), { blueprintVersionId: f.blueprint.versionId })).body.attemptId;
  await service.start(p, attemptId, randomUUID()); await service.submit(p, attemptId, randomUUID());
  await f.pool.query('CREATE ROLE result_test_grader LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO result_test_grader');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'result_test_grader' });
  assert.equal((await createExamWorker({ workerPool, executorId: 'result-test', leaseSeconds: 30, retrySeconds: 1 }).runOnce()).status, 'GRADED');
  const pool = ownerSession ? f.pool : f.examPool;
  const respond = (examPool = pool) => create(examPool).withReadBoundary(p, (ports) =>
    createHttpBoundaryHandler({ authenticate: async () => p, ...ports })(new Request(`http://127.0.0.1/api/v1/attempts/${attemptId}/result`)));
  return { f, attemptId, p, create, respond, pool };
}
function intercept(pool, hook) {
  return { query: (...args) => pool.query(...args), async connect() {
    const client = await pool.connect();
    return new Proxy(client, { get(target, prop) {
      if (prop === 'query') return (...args) => hook(target, ...args);
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}
function pauseAfter(pool, pattern) {
  let reached, release, paused = false, timer;
  const gate = new Promise((resolve) => { release = resolve; }); const entered = new Promise((resolve) => { reached = resolve; });
  return { release, entered: () => Promise.race([entered, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Result transaction barrier timeout')), 5000);
  })]).finally(() => clearTimeout(timer)), pool: intercept(pool, async (client, ...args) => {
    const result = await client.query(...args);
    if (!paused && typeof args[0] === 'string' && args[0].includes(pattern)) { paused = true; reached(); await gate; }
    return result;
  }) };
}
async function waiting(f, applicationName) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if ((await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName])).rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Expected a real PostgreSQL result/rights lock waiter');
}
function revoke(f, bankPool) {
  return createSourceService({ bankPool, identityService: f.identityService }).then((sources) =>
    sources.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
      evidence: 'Synthetic result-access ordering; not human rights review.', expectedRevision: 1,
    }));
}

test('fresh final result guard discards a private payload after valid in-transaction release invalidation', async (t) => {
  const { f, attemptId, respond, pool } = await setup(t, true);
  let changed = false;
  const wrapped = intercept(pool, async (client, ...args) => {
    const result = await client.query(...args);
    if (!changed && typeof args[0] === 'string' && args[0].includes('tsa.exam_released_review')) {
      changed = true;
      // Disposable fixture-owner session models a security invalidation after
      // loading. Ordinary runtime receives no UPDATE or role-switch authority.
      await client.query('RESET ROLE');
      await client.query("UPDATE tsa.attempts SET state='INVALIDATED',invalidation_reason='Synthetic result final-guard change' WHERE id=$1", [attemptId]);
      await client.query("UPDATE tsa.result_releases SET revoked_at=clock_timestamp(),reason='Synthetic result final-guard change' WHERE attempt_id=$1", [attemptId]);
      await client.query('SET LOCAL ROLE tsa_exam');
    }
    return result;
  });
  const response = await respond(wrapped);
  assert.equal(changed, true); assert.equal(response.status, 503);
  assert.equal(JSON.stringify(await response.json()).includes('correctAnswer'), false);
  assert.equal((await f.pool.query('SELECT state FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0].state, 'INVALIDATED');
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.result_releases WHERE attempt_id=$1 AND revoked_at IS NULL', [attemptId])).rows[0].n, 0);
});

for (const rightsFirst of [false, true]) test(`result/rights transactions: ${rightsFirst ? 'rights' : 'authorized read'} commits first`, async (t) => {
  const { f, attemptId, respond, pool } = await setup(t);
  const before = (await f.pool.query('SELECT to_jsonb(s) AS score FROM tsa.score_runs s WHERE attempt_id=$1', [attemptId])).rows;
  const barrier = pauseAfter(rightsFirst ? f.bankPool : pool, rightsFirst ? 'tsa.bank_apply_delivery_hold' : 'tsa.exam_released_review');
  let read, rights;
  try {
    if (rightsFirst) rights = revoke(f, barrier.pool); else read = respond(barrier.pool);
    await barrier.entered();
    if (rightsFirst) read = respond(); else rights = revoke(f, f.bankPool);
    await waiting(f, rightsFirst ? 'tsa-allocation-exam-test' : 'tsa-bank-api-test');
    barrier.release(); await rights;
    const result = await read;
    assert.equal(result.status, rightsFirst ? 410 : 200);
    const text = JSON.stringify(await result.json());
    assert.equal(text.includes('correctAnswer'), !rightsFirst);
  } finally { barrier.release(); await Promise.allSettled([read, rights].filter(Boolean)); }
  const denied = await respond(); assert.equal(denied.status, 410);
  assert.equal(JSON.stringify(await denied.json()).includes('correctAnswer'), false);
  assert.deepEqual((await f.pool.query('SELECT to_jsonb(s) AS score FROM tsa.score_runs s WHERE attempt_id=$1', [attemptId])).rows, before);
});

test('direct result commands expose neither a foreign review nor data before active release', async (t) => {
  const { f, attemptId } = await setup(t);
  const client = await f.examPool.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL ROLE tsa_exam');
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [f.principals.studentB.userId]);
    const result = await client.query('SELECT tsa.exam_released_review($1) AS review,tsa.exam_attempt_access($1) AS access', [attemptId]);
    assert.deepEqual(result.rows, [{ review: null, access: null }]);
    await client.query('ROLLBACK');
  } finally { client.release(); }
});
