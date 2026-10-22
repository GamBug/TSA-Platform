import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { LOCAL_TAXONOMY } from '../../../src/local/seed.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createExamSweeper } from '../../../src/modules/jobs/exam-sweeper.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
  attempt: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
});

function key(label) {
  return `${label}-${randomUUID()}`;
}

function fakePool(result, failure) {
  const queries = [];
  return {
    queries,
    async connect() {
      return {
        async query(sql, values = []) {
          queries.push({ sql, values });
          if (failure) throw failure;
          if (sql.includes('tsa.exam_worker_sweep')) return { rows: [{ result }] };
          return { rows: [] };
        },
        release() {},
      };
    },
  };
}

async function createBlueprint(fixture, { name, durationSeconds, availableUntil }) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = {
    schemaVersion: 'blueprint/1',
    name,
    taxonomyVersionId: LOCAL_TAXONOMY.taxonomyVersionId,
    profileKind: 'INDEPENDENT_PRACTICE',
    evidenceIds: ['synthetic-expiry-sweep-fixture'],
    sections: [{ id: 'sweep-section', section: 'MATH', count: 4, durationSeconds }],
    allowedTypes: ['SINGLE_CHOICE'],
    quotas: [{
      sectionId: 'sweep-section',
      dimension: 'SKILL',
      value: LOCAL_TAXONOMY.skillId,
      min: 4,
      max: 4,
    }],
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE',
    scoringPolicy: 'practice-binary-v1',
    releasePolicy: 'after-grade-v1',
  };
  const contentHash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
  await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, name]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
  [versionId, id, LOCAL_TAXONOMY.taxonomyVersionId, JSON.stringify(config), contentHash]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings
    (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',$2,600)`, [versionId, availableUntil]);
  return versionId;
}

async function waitForAttemptTime(pool, attemptId, column, maxWaitMilliseconds = 20_000) {
  assert.ok(['start_before_at', 'deadline_at'].includes(column));
  const until = Date.now() + maxWaitMilliseconds;
  while (Date.now() < until) {
    const result = await pool.query(`SELECT clock_timestamp() >= ${column} AS elapsed
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.equal(result.rowCount, 1);
    if (result.rows[0].elapsed) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Persisted attempt ${column} did not elapse within the bounded wait`);
}

async function createWorkerPool(fixture, loginName, applicationName) {
  await fixture.pool.query(`CREATE ROLE ${loginName} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${loginName}`);
  return createDatabasePool({ ...fixture.harness.database.connectionConfig, user: loginName }, {
    applicationName,
    max: 3,
  });
}

test('exam sweeper validates bounded results and hides database failures', async () => {
  const workerPool = fakePool({
    status: 'SWEPT', reconciled: 3, cancelled: 1, expired: 1, invalidated: 1,
  });
  const sweeper = createExamSweeper({ workerPool, executorId: 'sweeper-test', batchSize: 3 });
  assert.deepEqual(await sweeper.sweepOnce(), {
    status: 'SWEPT', reconciled: 3, cancelled: 1, expired: 1, invalidated: 1,
  });
  assert.deepEqual(workerPool.queries.filter(({ sql }) => sql.startsWith('SET')), []);
  assert.deepEqual(workerPool.queries.find(({ sql }) => sql.includes('tsa.exam_worker_sweep')).values,
    ['sweeper-test', 3]);

  for (const executorId of ['', 'with spaces', 'with\nline', '\x7f', 'é', 'x'.repeat(129)]) {
    assert.throws(() => createExamSweeper({ workerPool, executorId, batchSize: 1 }), TypeError);
  }
  for (const batchSize of [0, 101, 1.5, Number.NaN]) {
    assert.throws(() => createExamSweeper({ workerPool, executorId: 'sweeper-test', batchSize }), RangeError);
  }

  const malformed = createExamSweeper({
    workerPool: fakePool({ status: 'SWEPT', reconciled: 2, cancelled: 0, expired: 0, invalidated: 0 }),
    executorId: 'sweeper-test',
    batchSize: 2,
  });
  await assert.rejects(malformed.sweepOnce(), (error) => error.code === 'TEMPORARILY_UNAVAILABLE'
    && error.message === 'TEMPORARILY_UNAVAILABLE');

  const broken = createExamSweeper({
    workerPool: fakePool(null, new Error('private database detail')),
    executorId: 'sweeper-test',
    batchSize: 1,
  });
  await assert.rejects(broken.sweepOnce(), (error) => error.code === 'TEMPORARILY_UNAVAILABLE'
    && error.message === 'TEMPORARILY_UNAVAILABLE'
    && !error.message.includes('private database detail'));
});

test('trusted bounded sweeps cancel expired starts and grade elapsed attempts exactly once', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  let workerPool;
  let factoryPool;
  t.after(async () => {
    if (factoryPool) await factoryPool.end();
    if (workerPool) await workerPool.end();
    await fixture.close();
  });

  const attempts = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  const executorId = `sweeper-runtime-${randomUUID()}`;
  workerPool = await createWorkerPool(fixture, `sweeper_${randomUUID().replaceAll('-', '')}`, 'tsa-expiry-sweeper-test');
  const sweeper = createExamSweeper({ workerPool, executorId, batchSize: 10 });

  const futureAttempt = await attempts.create(fixture.principals.studentB, key('sweep-future-create'), {
    blueprintVersionId: fixture.blueprint.versionId,
  });
  const futureBefore = await fixture.pool.query(`SELECT state, start_before_at::text AS start_before_at
    FROM tsa.attempts WHERE id=$1`, [futureAttempt.body.attemptId]);
  assert.equal(futureBefore.rows[0].state, 'CREATED');
  await fixture.pool.query(`UPDATE tsa.blueprint_offerings
    SET available_until=clock_timestamp()-interval '1 second',revision=revision+1
    WHERE blueprint_version_id=$1`, [fixture.blueprint.versionId]);
  await fixture.pool.query(`UPDATE tsa.form_availability
    SET available_until=clock_timestamp()-interval '1 second',revision=revision+1
    WHERE form_id=$1`, [futureAttempt.body.formId]);

  const ttlBlueprintVersionId = await createBlueprint(fixture, {
    name: `Synthetic short-admission sweep ${randomUUID()}`,
    durationSeconds: 600,
    availableUntil: new Date(Date.now() + 12_000),
  });
  const ttlAttempt = await attempts.create(fixture.principals.studentA, key('sweep-ttl-create'), {
    blueprintVersionId: ttlBlueprintVersionId,
  });
  const ttlDeadline = await fixture.pool.query('SELECT start_before_at FROM tsa.attempts WHERE id=$1', [ttlAttempt.body.attemptId]);
  await waitForAttemptTime(fixture.pool, ttlAttempt.body.attemptId, 'start_before_at');

  const ttlSweep = await sweeper.sweepOnce();
  assert.deepEqual(ttlSweep, { status: 'SWEPT', reconciled: 1, cancelled: 1, expired: 0, invalidated: 0 });
  const cancelled = await fixture.pool.query(`SELECT state,cancellation_reason,start_before_at
    FROM tsa.attempts WHERE id=$1`, [ttlAttempt.body.attemptId]);
  assert.equal(cancelled.rows[0].state, 'CANCELLED');
  assert.equal(cancelled.rows[0].cancellation_reason, 'START_TTL_EXPIRED');
  assert.equal(cancelled.rows[0].start_before_at.getTime(), ttlDeadline.rows[0].start_before_at.getTime());
  assert.deepEqual(await sweeper.sweepOnce(), {
    status: 'SWEPT', reconciled: 0, cancelled: 0, expired: 0, invalidated: 0,
  });

  const futureAfter = await fixture.pool.query(`SELECT state, start_before_at::text AS start_before_at
    FROM tsa.attempts WHERE id=$1`, [futureAttempt.body.attemptId]);
  assert.deepEqual(futureAfter.rows, [{
    state: 'CREATED', start_before_at: futureBefore.rows[0].start_before_at,
  }], 'a committed CREATED deadline survives an ordinary offering schedule edit');

  const expiryBlueprintVersionId = await createBlueprint(fixture, {
    name: `Synthetic one-second expiry sweep ${randomUUID()}`,
    durationSeconds: 1,
    availableUntil: new Date(Date.now() + 86_400_000),
  });
  const expiringAttempt = await attempts.create(fixture.principals.studentA, key('sweep-expiry-create'), {
    blueprintVersionId: expiryBlueprintVersionId,
  });
  const attemptId = expiringAttempt.body.attemptId;
  await attempts.start(fixture.principals.studentA, attemptId, key('sweep-expiry-start'));
  await fixture.pool.query('UPDATE tsa.users SET disabled_at=clock_timestamp() WHERE id=$1', [fixture.principals.studentA.userId]);
  await waitForAttemptTime(fixture.pool, attemptId, 'deadline_at');

  const expiredSweep = await sweeper.sweepOnce();
  assert.deepEqual(expiredSweep, { status: 'SWEPT', reconciled: 1, cancelled: 0, expired: 1, invalidated: 0 });
  const jobState = await fixture.pool.query(`SELECT a.state,a.grading_status,
      (SELECT count(*)::int FROM tsa.jobs j WHERE j.attempt_id=a.id AND j.kind='exam_grade_attempt') AS jobs
    FROM tsa.attempts a WHERE a.id=$1`, [attemptId]);
  assert.deepEqual(jobState.rows, [{ state: 'EXPIRED', grading_status: 'PENDING', jobs: 1 }]);
  assert.deepEqual(await sweeper.sweepOnce(), {
    status: 'SWEPT', reconciled: 0, cancelled: 0, expired: 0, invalidated: 0,
  });
  assert.equal((await fixture.pool.query(
    "SELECT count(*)::int AS n FROM tsa.jobs WHERE attempt_id=$1 AND kind='exam_grade_attempt'", [attemptId])).rows[0].n, 1);

  const worker = createExamWorker({ workerPool, executorId, leaseSeconds: 30, retrySeconds: 30 });
  const graded = await worker.runOnce();
  assert.equal(graded.status, 'GRADED');
  assert.equal(graded.attemptId, attemptId);
  const score = await fixture.pool.query(`SELECT correct_count,total_count,percentage::text AS percentage
    FROM tsa.score_runs WHERE attempt_id=$1`, [attemptId]);
  assert.deepEqual(score.rows, [{ correct_count: 0, total_count: 4, percentage: '0.00' }]);
  assert.equal((await fixture.pool.query(
    'SELECT count(*)::int AS n FROM tsa.result_releases WHERE attempt_id=$1 AND revoked_at IS NULL', [attemptId])).rows[0].n, 1);

  const factoryLogin = `sweep_factory_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${factoryLogin} LOGIN`);
  await fixture.pool.query(`GRANT tsa_factory TO ${factoryLogin}`);
  factoryPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: factoryLogin }, {
    applicationName: 'tsa-expiry-sweeper-factory-denial-test',
    max: 1,
  });

  for (const pool of [fixture.examPool, fixture.harness.authPool, fixture.bankPool, factoryPool]) {
    await assert.rejects(pool.query("SELECT tsa.exam_worker_sweep('unauthorized-probe',1)"),
      (error) => error.code === '42501');
  }
  await assert.rejects(workerPool.query("SELECT tsa.exam_worker_sweep('sweeper-test',0)"),
    (error) => error.code === '22023');
  await assert.rejects(workerPool.query("SELECT tsa.exam_worker_sweep(E'bad\\nexecutor',1)"),
    (error) => error.code === '22023');
});
