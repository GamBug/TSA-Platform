import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize, AttemptHistoryPageSchema } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

async function setup(t, mode = 'graded') {
  const f = await createAllocationFixture({ questionCount: 8 });
  let workerPool;
  t.after(async () => { if (workerPool) await workerPool.end(); await f.close(); });
  const rate = { capacity: 100, refillPerSecond: 1 };
  const service = createAttemptService({ examPool: f.examPool, identityService: f.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  let blueprint = f.blueprint.versionId;
  if (mode !== 'graded') {
    const config = structuredClone(f.blueprint.config);
    config.sections[0].durationSeconds = mode === 'ttl' ? 600 : 1;
    const id = randomUUID(); blueprint = randomUUID();
    await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, 'Synthetic directory clock fixture']);
    await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
      VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [blueprint, id, config.taxonomyVersionId, config,
      `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`]);
    await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
      VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+$2::interval,600)`,
    [blueprint, mode === 'ttl' ? '2 seconds' : '1 hour']);
  }
  const p = f.principals.studentA;
  const created = (await service.create(p, randomUUID(), { blueprintVersionId: blueprint })).body;
  const attempt = created.attemptId;
  if (mode !== 'ttl') await service.start(p, attempt, randomUUID());
  if (mode === 'graded') {
    await service.submit(p, attempt, randomUUID());
    await f.pool.query('CREATE ROLE directory_worker LOGIN');
    await f.pool.query('GRANT tsa_exam_worker TO directory_worker');
    workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'directory_worker' });
    const worker = createExamWorker({ workerPool, executorId: 'directory-test', leaseSeconds: 30, retrySeconds: 1 });
    assert.equal((await worker.runOnce()).status, 'GRADED');
  }
  const history = (principal = p, limit = 20, cursor = null) => withTransaction(f.examPool, async (client) => {
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
    return (await client.query('SELECT tsa.exam_history_page($1,$2,$3) AS result',
      [limit, cursor?.createdAt ?? null, cursor?.id ?? null])).rows[0].result;
  }, { role: 'tsa_exam' });
  return { f, p, service, created, attempt, history };
}
async function waitDue(f, attempt, ttl = false) {
  const end = Date.now() + 5000;
  while (!(await f.pool.query(`SELECT clock_timestamp()>=${ttl ? 'start_before_at' : 'deadline_at'} AS due FROM tsa.attempts WHERE id=$1`, [attempt])).rows[0].due) {
    assert.ok(Date.now() < end, 'original immutable deadline elapses');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function state(f, attempt) {
  return (await f.pool.query(`SELECT state,started_at,deadline_at,closed_at,
    (SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=a.id) AS jobs,
    (SELECT count(*)::int FROM tsa.student_question_history WHERE first_attempt_id=a.id) AS history
    FROM tsa.attempts a WHERE id=$1`, [attempt])).rows[0];
}
function publicPage(raw) {
  return AttemptHistoryPageSchema.parse({ items: raw.items, nextCursor: raw.next === null ? null : 'opaque-test-cursor' });
}
function noPrivate(value) {
  const prohibited = new Set(['config', 'slots', 'answers', 'answerKey', 'correctAnswer', 'explanation',
    'provenance', 'questionVersionId', 'sourceVersionId', 'manifest', 'reviewNotes', 'userId']);
  function visit(item) {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) { assert.equal(prohibited.has(key), false, key); visit(child); }
  }
  visit(value);
}

test('owned history lazily commits elapsed start cancellation without delivering slots or consuming new history', async (t) => {
  const { f, attempt, history } = await setup(t, 'ttl');
  await waitDue(f, attempt, true);
  const raw = await history(), page = publicPage(raw);
  assert.equal(page.items[0].state, 'CANCELLED'); assert.equal(page.items[0].score, null);
  noPrivate(page);
  const actual = await state(f, attempt);
  assert.equal(actual.state, 'CANCELLED'); assert.equal(actual.started_at, null); assert.equal(actual.deadline_at, null);
  assert.equal(actual.jobs, 0); assert.equal(actual.history, 4);
});

test('history reconciliation persistence fault rolls back expiry and retry creates one exact job', async (t) => {
  const { f, attempt, history } = await setup(t, 'expired');
  await waitDue(f, attempt);
  const before = await state(f, attempt);
  await f.pool.query(`CREATE FUNCTION tsa.directory_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Synthetic history reconciliation fault'; END $$`);
  await f.pool.query(`CREATE TRIGGER directory_test_fault BEFORE INSERT ON tsa.jobs FOR EACH ROW EXECUTE FUNCTION tsa.directory_test_fault()`);
  await assert.rejects(history(), /Synthetic history reconciliation fault/);
  assert.deepEqual(await state(f, attempt), before);
  await f.pool.query('DROP TRIGGER directory_test_fault ON tsa.jobs');
  assert.equal(publicPage(await history()).items[0].state, 'EXPIRED');
  assert.equal(publicPage(await history()).items[0].score, null);
  const actual = await state(f, attempt);
  assert.equal(actual.jobs, 1); assert.equal(actual.history, 4);
  const digest = await f.pool.query(`SELECT j.dedup_key=a.id::text||':practice-binary-v1:'||tsa.exam_grading_input_hash(a.id) AS exact
    FROM tsa.attempts a JOIN tsa.jobs j ON j.attempt_id=a.id WHERE a.id=$1`, [attempt]);
  assert.deepEqual(digest.rows, [{ exact: true }]);
});

test('history pagination remains owner-scoped and preserves full database timestamp precision', async (t) => {
  const { f, p, service, attempt, history } = await setup(t);
  const second = (await service.create(p, randomUUID(), { blueprintVersionId: f.blueprint.versionId })).body;
  const firstPage = await history(p, 1);
  assert.equal(firstPage.items.length, 1); assert.equal(firstPage.items[0].attemptId, second.attemptId);
  const exact = await f.pool.query('SELECT tsa.exam_instant(created_at) AS exact FROM tsa.attempts WHERE id=$1', [second.attemptId]);
  assert.deepEqual(firstPage.next, { createdAt: exact.rows[0].exact, id: second.attemptId });
  assert.match(firstPage.next.createdAt, /\.\d{6}Z$/);
  const nextPage = await history(p, 1, firstPage.next);
  assert.equal(nextPage.items[0].attemptId, attempt); assert.equal(nextPage.next, null);
  assert.deepEqual(nextPage.items[0].score, { correctCount: 0, totalCount: 4, percentage: '0.00' });
  const foreign = await history(f.principals.studentB, 100, firstPage.next);
  assert.deepEqual(foreign, { items: [], next: null });
  noPrivate(publicPage(firstPage)); noPrivate(publicPage(nextPage));
});

function pauseAfter(pool, pattern) {
  let release, reached, timer, paused = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { reached = resolve; });
  return { release, entered: () => Promise.race([entered, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Directory barrier timeout')), 5000);
  })]).finally(() => clearTimeout(timer)), pool: {
    query: (...args) => pool.query(...args),
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, { get(target, prop) {
        if (prop === 'query') return async (...args) => {
          const result = await target.query(...args);
          if (!paused && typeof args[0] === 'string' && args[0].includes(pattern)) { paused = true; reached(); await gate; }
          return result;
        };
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
  } };
}
async function waitLock(f, name) {
  const end = Date.now() + 5000;
  while (!(await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [name])).rows[0].n) {
    assert.ok(Date.now() < end, 'a real history/rights PostgreSQL lock waiter is observed');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function revoke(f, pool) {
  const source = await createSourceService({ bankPool: pool, identityService: f.identityService });
  return source.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic directory rights race; not a human rights attestation.', expectedRevision: 1,
  });
}
for (const rightsFirst of [true, false]) test(`history/rights ordering: ${rightsFirst ? 'rights' : 'history'} commits first`, async (t) => {
  const { f, p, history, attempt } = await setup(t);
  if (rightsFirst) {
    const barrier = pauseAfter(f.bankPool, 'tsa.bank_apply_delivery_hold');
    let rights, pending;
    try {
      rights = revoke(f, barrier.pool); await barrier.entered();
      pending = history(); await waitLock(f, 'tsa-allocation-exam-test');
      barrier.release(); await rights;
      const page = publicPage(await pending);
      assert.equal(page.items[0].state, 'INVALIDATED'); assert.equal(page.items[0].score, null); noPrivate(page);
    } finally { barrier.release(); await Promise.allSettled([rights, pending].filter(Boolean)); }
  } else {
    const client = await f.examPool.connect(); let rights;
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE tsa_exam');
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [p.userId]);
      const page = publicPage((await client.query('SELECT tsa.exam_history_page(20) AS result')).rows[0].result);
      assert.equal(page.items[0].state, 'GRADED'); assert.equal(page.items[0].score.percentage, '0.00'); noPrivate(page);
      rights = revoke(f, f.bankPool); await waitLock(f, 'tsa-bank-api-test');
      await client.query('COMMIT'); await rights;
    } finally { await client.query('ROLLBACK'); client.release(); if (rights) await rights; }
  }
  const latest = publicPage(await history());
  assert.equal(latest.items[0].state, 'INVALIDATED'); assert.equal(latest.items[0].score, null);
  assert.equal((await state(f, attempt)).history, 4);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.score_runs WHERE attempt_id=$1', [attempt])).rows[0].n, 1);
});
