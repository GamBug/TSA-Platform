import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { scoreAttempt } from '../../../src/modules/scoring/binary.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

async function setup(t, { leaseSeconds = 30, badDispatch = false, maxAttempts } = {}) {
  const f = await createAllocationFixture({ questionCount: 4 });
  let workerPool;
  t.after(async () => { if (workerPool) await workerPool.end(); await f.close(); });
  const rate = { capacity: 100, refillPerSecond: 1 };
  const attempts = createAttemptService({ examPool: f.examPool, identityService: f.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const p = f.principals.studentA;
  const attemptId = (await attempts.create(p, randomUUID(), { blueprintVersionId: f.blueprint.versionId })).body.attemptId;
  await attempts.start(p, attemptId, randomUUID());
  const slot = (await attempts.read(p, attemptId)).slots[0];
  await attempts.save(p, attemptId, slot.slotId, randomUUID(), {
    expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'b' },
  });
  if (badDispatch) {
    // Simulate a defective queue producer at initial insertion. Sealed content,
    // answers and immutable existing dispatch records are never rewritten.
    await withTransaction(f.pool, async (client) => {
      await client.query("UPDATE tsa.attempts SET state='SUBMITTED' WHERE id=$1", [attemptId]);
      await client.query(`INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref,attempt_id)
        VALUES($1,'exam_grade_attempt',$2,$3,$4)`, [randomUUID(), `${attemptId}:practice-binary-v1:sha256:${'0'.repeat(64)}`, `attempt:${attemptId}`, attemptId]);
    });
  } else await attempts.submit(p, attemptId, randomUUID());
  if (maxAttempts) await f.pool.query('UPDATE tsa.jobs SET max_attempts=$2 WHERE attempt_id=$1', [attemptId, maxAttempts]);
  await f.pool.query('CREATE ROLE trusted_grader_runtime LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO trusted_grader_runtime');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'trusted_grader_runtime' },
    { applicationName: 'tsa-grade-transactions', max: 4 });
  const makeWorker = (executorId = 'transactions-a', seconds = leaseSeconds, pool = workerPool) => createExamWorker({
    workerPool: pool, executorId, leaseSeconds: seconds, retrySeconds: 1,
  });
  return { f, workerPool, makeWorker, worker: makeWorker(), attemptId, attempts, p };
}
async function artifacts(f, attemptId) {
  return (await f.pool.query(`SELECT state,latest_score_id,grading_status,
    (SELECT count(*)::int FROM tsa.score_runs WHERE attempt_id=a.id) AS scores,
    (SELECT count(*)::int FROM tsa.score_items i JOIN tsa.score_runs s ON s.id=i.score_run_id WHERE s.attempt_id=a.id) AS items,
    (SELECT count(*)::int FROM tsa.result_releases WHERE attempt_id=a.id AND revoked_at IS NULL) AS releases,
    (SELECT state FROM tsa.jobs WHERE attempt_id=a.id) AS job_state FROM tsa.attempts a WHERE id=$1`, [attemptId])).rows[0];
}
function pauseAfter(pool, pattern) {
  let release, reached, timer, paused = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { reached = resolve; });
  return { release, entered: () => Promise.race([entered, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Transaction barrier timeout')), 5000);
  })]).finally(() => clearTimeout(timer)), pool: {
    query: (...args) => pool.query(...args),
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, { get(target, property) {
        if (property === 'query') return async (...args) => {
          const result = await target.query(...args);
          if (!paused && typeof args[0] === 'string' && args[0].includes(pattern)) { paused = true; reached(); await gate; }
          return result;
        };
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
  } };
}
async function waiting(f, applicationName) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if ((await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName])).rows[0].n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Expected a real PostgreSQL lock waiter');
}

for (const fault of ['score', 'item', 'release', 'attempt', 'job', 'audit', 'commit']) test(`grade ${fault} failure leaves no partial score or release`, async (t) => {
  const { f, worker, attemptId } = await setup(t);
  const lease = await worker.claim(), loaded = await worker.load(lease), computed = scoreAttempt(loaded);
  const table = { score: 'score_runs', item: 'score_items', release: 'result_releases', attempt: 'attempts', job: 'jobs', audit: 'audit_events', commit: 'score_runs' }[fault];
  const predicate = fault === 'attempt' ? "NEW.state='GRADED'" : fault === 'job' ? "NEW.state='SUCCEEDED'"
    : fault === 'audit' ? "NEW.action='ATTEMPT_GRADED'" : 'true';
  await f.pool.query(`CREATE FUNCTION tsa.test_grade_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF ${predicate} THEN RAISE EXCEPTION 'Synthetic grade persistence fault'; END IF; RETURN NEW; END $$`);
  const event = ['attempt', 'job'].includes(fault) ? 'UPDATE' : 'INSERT';
  await f.pool.query(fault === 'commit'
    ? `CREATE CONSTRAINT TRIGGER test_grade_fault AFTER INSERT ON tsa.${table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tsa.test_grade_fault()`
    : `CREATE TRIGGER test_grade_fault BEFORE ${event} ON tsa.${table} FOR EACH ROW EXECUTE FUNCTION tsa.test_grade_fault()`);
  await assert.rejects(worker.finish(lease, computed), { code: 'TEMPORARILY_UNAVAILABLE' });
  assert.deepEqual(await artifacts(f, attemptId), { state: 'SUBMITTED', latest_score_id: null, grading_status: 'RUNNING', scores: 0, items: 0, releases: 0, job_state: 'RUNNING' });
  await f.pool.query(`DROP TRIGGER test_grade_fault ON tsa.${table}`);
  assert.equal((await worker.finish(lease, computed)).status, 'GRADED');
  const done = await artifacts(f, attemptId);
  assert.equal(done.scores, 1); assert.equal(done.items, 4); assert.equal(done.releases, 1); assert.equal(done.job_state, 'SUCCEEDED');
});

for (const deferred of [false, true]) test(`expired lease during ${deferred ? 'deferred COMMIT' : 'grade writes'} cannot publish a score`, async (t) => {
  const { f, worker, makeWorker, attemptId } = await setup(t, { leaseSeconds: 1 });
  const lease = await worker.claim(), computed = scoreAttempt(await worker.load(lease));
  await f.pool.query(deferred ? `CREATE FUNCTION tsa.test_delay_grade() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.state='SUCCEEDED' THEN PERFORM pg_sleep(1.05); END IF; RETURN NULL; END $$;
    CREATE CONSTRAINT TRIGGER aaa_test_delay_grade AFTER UPDATE ON tsa.jobs DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION tsa.test_delay_grade()` : `CREATE FUNCTION tsa.test_delay_grade() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NOT EXISTS(SELECT 1 FROM tsa.score_items WHERE score_run_id=NEW.score_run_id) THEN PERFORM pg_sleep(1.05); END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_delay_grade BEFORE INSERT ON tsa.score_items FOR EACH ROW EXECUTE FUNCTION tsa.test_delay_grade()`);
  if (deferred) await assert.rejects(worker.finish(lease, computed), { code: 'TEMPORARILY_UNAVAILABLE' });
  else assert.deepEqual(await worker.finish(lease, computed), { status: 'LOST_LEASE' });
  const before = await artifacts(f, attemptId);
  assert.equal(before.scores, 0); assert.equal(before.releases, 0); assert.equal(before.job_state, 'RUNNING');
  await f.pool.query(deferred ? 'DROP TRIGGER aaa_test_delay_grade ON tsa.jobs' : 'DROP TRIGGER test_delay_grade ON tsa.score_items');
  const replacement = makeWorker('replacement', 30), next = await replacement.claim();
  assert.ok(BigInt(next.leaseToken) > BigInt(lease.leaseToken));
  assert.deepEqual(await worker.finish(lease, computed), { status: 'LOST_LEASE' });
  assert.equal((await replacement.finish(next, scoreAttempt(await replacement.load(next)))).status, 'GRADED');
});

test('retry delay and exhausted crashed lease use real time and never reset attempt limits', async (t) => {
  const { f, worker, makeWorker, attemptId } = await setup(t, { leaseSeconds: 1, maxAttempts: 2 });
  const first = await worker.claim();
  assert.deepEqual(await worker.fail(first, 'GRADING_ERROR'), { status: 'FAILED_RETRYABLE' });
  assert.deepEqual(await worker.claim(), { status: 'IDLE' });
  await f.pool.query('SELECT pg_sleep(1.05)');
  const second = await worker.claim(); assert.ok(BigInt(second.leaseToken) > BigInt(first.leaseToken));
  await f.pool.query('SELECT pg_sleep(1.05)');
  const replacement = makeWorker('exhaustion-recovery'), exhausted = await replacement.claim();
  assert.equal((await replacement.load(exhausted)).status, 'FAILED_FINAL');
  assert.deepEqual(await worker.fail(second, 'GRADING_ERROR'), { status: 'LOST_LEASE' });
  const actual = (await f.pool.query('SELECT state,attempts,max_attempts,last_error_code FROM tsa.jobs WHERE attempt_id=$1', [attemptId])).rows[0];
  assert.deepEqual(actual, { state: 'FAILED_FINAL', attempts: 2, max_attempts: 2, last_error_code: 'LEASE_RETRY_EXHAUSTED' });
  assert.equal((await artifacts(f, attemptId)).grading_status, 'FAILED_FINAL');
  assert.equal((await artifacts(f, attemptId)).scores, 0);
});

test('bad initial queue digest fails closed without rewriting immutable snapshots or dispatch', async (t) => {
  const { f, worker, attemptId } = await setup(t, { badDispatch: true });
  assert.deepEqual(await worker.runOnce(), { status: 'FAILED_FINAL' });
  const actual = await artifacts(f, attemptId);
  assert.equal(actual.scores, 0); assert.equal(actual.releases, 0);
  assert.equal((await f.pool.query('SELECT last_error_code FROM tsa.jobs WHERE attempt_id=$1', [attemptId])).rows[0].last_error_code, 'DIGEST_MISMATCH');
});

function revoke(f, pool) {
  return createSourceService({ bankPool: pool, identityService: f.identityService }).then((sources) =>
    sources.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
      evidence: 'Synthetic grade-rights ordering; not human review.', expectedRevision: 1,
    }));
}
for (const rightsFirst of [false, true]) test(`grade/rights lock ordering: ${rightsFirst ? 'rights' : 'grade'} commits first`, async (t) => {
  const { f, worker, workerPool, makeWorker, attemptId } = await setup(t);
  const lease = await worker.claim(), computed = scoreAttempt(await worker.load(lease));
  const barrier = pauseAfter(rightsFirst ? f.bankPool : workerPool,
    rightsFirst ? 'tsa.bank_apply_delivery_hold' : 'tsa.exam_worker_finish');
  let finish, rights;
  try {
    if (rightsFirst) rights = revoke(f, barrier.pool);
    else finish = makeWorker('transactions-a', 30, barrier.pool).finish(lease, computed);
    await barrier.entered();
    if (rightsFirst) finish = worker.finish(lease, computed);
    else rights = revoke(f, f.bankPool);
    const observed = finish.catch((e) => e);
    await waiting(f, rightsFirst ? 'tsa-grade-transactions' : 'tsa-bank-api-test');
    barrier.release(); await rights;
    assert.equal((await observed).status, rightsFirst ? 'CANCELLED' : 'GRADED');
  } finally { barrier.release(); await Promise.allSettled([finish, rights].filter(Boolean)); }
  const actual = await artifacts(f, attemptId);
  assert.equal(actual.state, 'INVALIDATED'); assert.equal(actual.releases, 0);
  assert.equal(actual.scores, rightsFirst ? 0 : 1);
});

test('SKIP LOCKED claim lets another worker claim a different student while the first claim is uncommitted', async (t) => {
  const { f, worker, workerPool, makeWorker, attempts } = await setup(t);
  const other = (await attempts.create(f.principals.studentB, randomUUID(), { blueprintVersionId: f.blueprint.versionId })).body.attemptId;
  await attempts.start(f.principals.studentB, other, randomUUID());
  await attempts.submit(f.principals.studentB, other, randomUUID());
  const barrier = pauseAfter(workerPool, 'tsa.exam_worker_claim');
  let first;
  try {
    first = makeWorker('first-reserved', 30, barrier.pool).claim();
    await barrier.entered();
    const second = await worker.claim();
    assert.equal(second.status, 'CLAIMED');
    barrier.release();
    const reserved = await first;
    assert.notEqual(reserved.dispatch.jobId, second.dispatch.jobId);
    assert.notEqual(reserved.attemptId, second.attemptId);
  } finally { barrier.release(); if (first) await first.catch(() => {}); }
});

test('PostgreSQL and pure scorer agree on all interaction types and reject corrupt persisted input', async (t) => {
  const { f } = await setup(t);
  const text = [{ type: 'text', text: 'Synthetic score parity' }];
  const options = ['a', 'b', 'c'].map((id) => ({ id, content: text }));
  const fixtures = [
    [{ type: 'SINGLE_CHOICE', options }, { type: 'SINGLE_CHOICE', optionId: 'b' },
      [{ type: 'SINGLE_CHOICE', optionId: 'b' }, { type: 'SINGLE_CHOICE', optionId: 'a' }, { type: 'SINGLE_CHOICE', optionId: null }, null]],
    [{ type: 'MULTIPLE_CHOICE', options, minSelections: 1, maxSelections: 3 }, { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'c'] },
      [{ type: 'MULTIPLE_CHOICE', optionIds: ['c', 'a'] }, { type: 'MULTIPLE_CHOICE', optionIds: ['a'] }, { type: 'MULTIPLE_CHOICE', optionIds: [] }, null]],
    [{ type: 'TRUE_FALSE_GROUP', statements: ['s1', 's2'].map((id) => ({ id, content: text })) }, { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } },
      [{ type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } }, { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: null } }, { type: 'TRUE_FALSE_GROUP', values: { s1: null, s2: null } }, null]],
  ];
  for (const [interaction, answerKey, responses] of fixtures) {
    for (const response of responses) {
      const pure = scoreAttempt({ policyVersion: 'practice-binary-v1', slots: [{ slotId: randomUUID(), sectionId: 'parity', section: 'MATH', ordinal: 1, interaction, answerKey, response }] });
      const actual = await f.pool.query('SELECT tsa.exam_binary_earned($1::jsonb,$2::jsonb,$3::jsonb) AS earned', [interaction, answerKey, response]);
      assert.equal(actual.rows[0].earned, pure.correctCount);
    }
  }
  await assert.rejects(f.pool.query('SELECT tsa.exam_binary_earned($1::jsonb,$2::jsonb,$3::jsonb)',
    [fixtures[0][0], fixtures[0][1], { type: 'SINGLE_CHOICE', optionId: 'unknown' }]), { code: '22023' });
});
