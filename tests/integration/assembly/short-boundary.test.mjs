import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createAllocationFixture } from './fixtures.mjs';
import { seedShortStudentProfiles } from '../student-runtime/short-fixture.mjs';

const STATEMENT_TIMEOUT_MS = 10_000;
const BARRIER_TIMEOUT_MS = 7_500;

function shortBody(blueprintVersionId) {
  return { blueprintVersionId };
}

function interceptPool(pool, hook) {
  return {
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') return (...args) => hook(target.query.bind(target), ...args);
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

function mixedPersonalWinnerPool(pool, winnerKey) {
  let arrivals = 0;
  let abortReason = null;
  let announceReady;
  let announceWinnerQuery;
  let releaseWinner;
  const bothReady = new Promise((resolve) => { announceReady = resolve; });
  const winnerQuery = new Promise((resolve) => { announceWinnerQuery = resolve; });
  const winnerGate = new Promise((resolve) => { releaseWinner = resolve; });
  const wrapped = interceptPool(pool, async (query, text, values) => {
    if (text === 'BEGIN') {
      const result = await query(text, values);
      await query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      return result;
    }
    if (typeof text !== 'string' || !text.includes('tsa.assembly_commit_personal')) return query(text, values);
    arrivals += 1;
    if (arrivals === 2) announceReady();
    await bothReady;
    if (abortReason) throw abortReason;
    if (values?.[0] === winnerKey) {
      const result = await query(text, values);
      announceWinnerQuery();
      await winnerGate;
      if (abortReason) throw abortReason;
      return result;
    }
    await winnerQuery;
    if (abortReason) throw abortReason;
    return query(text, values);
  });
  return {
    pool: wrapped,
    winnerQuery,
    releaseWinner,
    abort(error) {
      abortReason ??= error;
      announceReady();
      announceWinnerQuery();
      releaseWinner();
    },
  };
}

async function waitForH1Lock(pool) {
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name='tsa-allocation-exam-test' AND wait_event_type='Lock'
        AND query LIKE '%assembly_commit_personal%'`);
    if (result.rows[0].waiting >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Competing full/short commit did not wait on the real PostgreSQL H1 lock');
}

async function waitFor(promise, label, timeoutMs = STATEMENT_TIMEOUT_MS + BARRIER_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not settle within ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runFullShortRace(fixture, { principal, fullWins, shortProfile }) {
  const fullKey = randomUUID();
  const shortKey = randomUUID();
  const winnerKey = fullWins ? fullKey : shortKey;
  const barrier = mixedPersonalWinnerPool(fixture.examPool, winnerKey);
  const service = createAllocationService({
    examPool: barrier.pool,
    identityService: fixture.identityService,
    enableShortPractice: true,
  });
  const pending = Promise.allSettled([
    service.create(principal, fullKey, { blueprintVersionId: fixture.blueprint.versionId }),
    service.create(principal, shortKey, shortBody(shortProfile.versionId)),
  ]);
  let complete = false;
  let barrierTimer;
  try {
    await Promise.race([
      barrier.winnerQuery,
      new Promise((_, reject) => {
        barrierTimer = setTimeout(() => {
          const error = new Error('Full/short commits did not reach the PostgreSQL H1 winner barrier');
          reject(error);
          barrier.abort(error);
        }, BARRIER_TIMEOUT_MS);
      }),
    ]);
    await waitForH1Lock(fixture.pool);
    barrier.releaseWinner();
    const outcomes = await waitFor(pending, 'full/short H1 race outcomes');
    complete = true;
    const [full, short] = outcomes;
    const winner = fullWins ? full : short;
    const loser = fullWins ? short : full;
    const questionCount = fullWins ? 4 : 2;
    assert.equal(winner.status, 'fulfilled');
    assert.equal(winner.value.status, 201);
    assert.equal(winner.value.body.reuseMode, 'NEW_ONLY');
    assert.equal(loser.status, 'rejected');
    assert.equal(loser.reason.status, 409);
    assert.equal(loser.reason.code, 'CONCURRENT_ATTEMPT_EXISTS');
    assert.deepEqual(loser.reason.details, { existingAttemptId: winner.value.body.attemptId });
    const rows = await fixture.pool.query(`SELECT
      (SELECT count(*)::int FROM tsa.assembly_runs WHERE user_id=$1) AS runs,
      (SELECT count(*)::int FROM tsa.forms WHERE owner_user_id=$1) AS forms,
      (SELECT count(*)::int FROM tsa.attempts WHERE user_id=$1) AS attempts,
      (SELECT count(*)::int FROM tsa.form_slots s JOIN tsa.forms f ON f.id=s.form_id WHERE f.owner_user_id=$1) AS slots,
      (SELECT count(*)::int FROM tsa.student_question_history WHERE user_id=$1) AS history,
      (SELECT count(*)::int FROM tsa.idempotency_records WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts') AS receipts`,
    [principal.userId]);
    assert.deepEqual(rows.rows[0], {
      runs: 1, forms: 1, attempts: 1, slots: questionCount, history: questionCount, receipts: 1,
    });
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.form_slots WHERE form_id=$1',
      [winner.value.body.formId])).rows[0].n, questionCount);
  } finally {
    clearTimeout(barrierTimer);
    if (complete) barrier.releaseWinner();
    else barrier.abort(new Error('Aborting full/short H1 race after assertion or barrier failure'));
    await waitFor(pending, 'settling full/short race cleanup');
  }
}

async function allocationCounts(pool, userId) {
  return (await pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.assembly_runs WHERE user_id=$1) AS runs,
    (SELECT count(*)::int FROM tsa.forms WHERE owner_user_id=$1) AS forms,
    (SELECT count(*)::int FROM tsa.attempts WHERE user_id=$1) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history WHERE user_id=$1) AS history,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts') AS receipts`,
  [userId])).rows[0];
}

async function createUnpinnedShort(fixture, shortProfile) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = structuredClone(shortProfile.config);
  config.name = `Unpinned synthetic short profile ${id}`;
  const contentHash = jsonDigest(config);
  await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
  [versionId, id, config.taxonomyVersionId, JSON.stringify(config), contentHash]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings
    (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
  return { id, versionId, contentHash, config };
}

async function captureShortPlan(fixture, shortProfile, principal) {
  let captured;
  const stop = Object.assign(new Error('Synthetic plan capture rollback'), { code: 'PLAN_CAPTURE_ONLY' });
  const capturePool = interceptPool(fixture.examPool, async (query, text, values) => {
    if (typeof text === 'string' && text.includes('tsa.assembly_commit_personal')) {
      captured = { key: values[0], bodyHash: values[1], plan: JSON.parse(values[2]) };
      throw stop;
    }
    return query(text, values);
  });
  const service = createAllocationService({
    examPool: capturePool,
    identityService: fixture.identityService,
    enableShortPractice: true,
  });
  await assert.rejects(service.create(principal, randomUUID(), shortBody(shortProfile.versionId)), (error) => error === stop);
  assert.ok(captured, 'enabled service reached its guarded short SQL commit');
  return captured;
}

async function directCommit(fixture, principal, captured, { shortFlag, plan = captured.plan } = {}) {
  return withTransaction(fixture.examPool, async (client) => {
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
    if (shortFlag !== undefined) {
      await client.query("SELECT set_config('tsa.enable_short_practice',$1,true)", [String(shortFlag)]);
    }
    const result = await client.query('SELECT tsa.assembly_commit_personal($1,$2,$3::jsonb) AS result',
      [captured.key, captured.bodyHash, JSON.stringify(plan)]);
    return result.rows[0].result;
  }, { role: 'tsa_exam' });
}

function staleShortFlagPool(pool, observations) {
  return {
    async connect() {
      const client = await pool.connect();
      await client.query("SELECT set_config('tsa.enable_short_practice','true',false)");
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') return async (text, values) => {
            const result = await target.query(text, values);
            if (typeof text === 'string' && text.includes("set_config('tsa.enable_short_practice'")) {
              const current = await target.query("SELECT current_setting('tsa.enable_short_practice',true) AS value");
              observations.push({ requested: values?.[0], current: current.rows[0]?.value });
            }
            return result;
          };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

async function expectCommand(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test('full and pinned short NEW_ONLY requests serialize on the same PostgreSQL H1 guard in both winner orders', { timeout: 90_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 6, blueprintCount: 4 });
  t.after(() => fixture.close());
  const [shortProfile] = await seedShortStudentProfiles(fixture);
  await t.test('four-question full profile wins; the two-question request writes no partial graph', async () => {
    await runFullShortRace(fixture, { principal: fixture.principals.studentA, fullWins: true, shortProfile });
  });
  await t.test('two-question pinned profile wins; the four-question request writes no partial graph', async () => {
    await runFullShortRace(fixture, { principal: fixture.principals.studentB, fullWins: false, shortProfile });
  });
});

test('short commit SQL requires its transaction-local flag, immutable pin and NEW_ONLY mode', { timeout: 60_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 6, blueprintCount: 4 });
  t.after(() => fixture.close());
  const [shortProfile] = await seedShortStudentProfiles(fixture);
  const principal = fixture.principals.studentA;
  const captured = await captureShortPlan(fixture, shortProfile, principal);
  const baseline = await allocationCounts(fixture.pool, principal.userId);

  await assert.rejects(directCommit(fixture, principal, captured), { code: '22023' });
  assert.deepEqual(await allocationCounts(fixture.pool, principal.userId), baseline,
    'missing trusted transaction-local flag cannot create a form, run, attempt, history or receipt');

  const reviewPlan = structuredClone(captured.plan);
  reviewPlan.manifest.reuseMode = 'REVIEW_ALLOWED';
  reviewPlan.acknowledgeRepeats = true;
  await assert.rejects(directCommit(fixture, principal, captured, { shortFlag: true, plan: reviewPlan }), { code: '22023' });
  assert.deepEqual(await allocationCounts(fixture.pool, principal.userId), baseline,
    'short pins cannot bypass NEW_ONLY even with explicit repeat acknowledgment');

  const committed = await directCommit(fixture, principal, captured, { shortFlag: true });
  assert.equal(committed.status, 'CREATED');
  assert.deepEqual(await allocationCounts(fixture.pool, principal.userId), {
    runs: 1, forms: 1, attempts: 1, history: 2, receipts: 1,
  });
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.form_slots WHERE form_id=$1',
    [committed.receipt.formId])).rows[0].n, 2);

  const unpinned = await createUnpinnedShort(fixture, shortProfile);
  const unpinnedPrincipal = fixture.principals.studentB;
  const enabled = createAllocationService({
    examPool: fixture.examPool, identityService: fixture.identityService, enableShortPractice: true,
  });
  const unpinnedBaseline = await allocationCounts(fixture.pool, unpinnedPrincipal.userId);
  await expectCommand(enabled.create(unpinnedPrincipal, randomUUID(), shortBody(unpinned.versionId)), 422, 'VALIDATION_ERROR');
  assert.deepEqual(await allocationCounts(fixture.pool, unpinnedPrincipal.userId), unpinnedBaseline,
    'an otherwise valid two-question/180-second blueprint without its private pin writes no partial graph');

  const acl = (await fixture.pool.query(`SELECT
    has_table_privilege('tsa_exam','tsa_private.short_practice_profiles','SELECT') AS exam_table_read,
    has_function_privilege('tsa_exam','tsa_private.short_practice_supported(uuid)','EXECUTE') AS exam_pin_helper,
    has_function_privilege('tsa_exam_worker','tsa_private.short_practice_supported(uuid)','EXECUTE') AS worker_pin_helper,
    has_function_privilege('tsa_bank','tsa_private.short_practice_supported(uuid)','EXECUTE') AS bank_pin_helper,
    has_function_privilege('tsa_exam','tsa.exam_short_practice_alternatives(uuid)','EXECUTE') AS exam_alternatives,
    has_function_privilege('tsa_exam','tsa.exam_short_catalog_page(integer,uuid)','EXECUTE') AS exam_catalog`)).rows[0];
  assert.deepEqual(acl, {
    exam_table_read: false, exam_pin_helper: false, worker_pin_helper: false, bank_pin_helper: false,
    exam_alternatives: true, exam_catalog: true,
  });
  await assert.rejects(withTransaction(fixture.examPool,
    (client) => client.query('SELECT * FROM tsa_private.short_practice_profiles'), { role: 'tsa_exam' }),
  { code: '42501' });
  const createdTables = (await fixture.pool.query(`SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE grantee IN ('tsa_exam','tsa_exam_worker','tsa_bank') AND table_schema='tsa_private'
      AND table_name='short_practice_profiles'`)).rows[0].n;
  assert.equal(createdTables, 0, 'short pin rows are not directly granted to runtime or staff roles');
});

test('rights revocation blocks new short creation while its exact owned receipt remains replayable', { timeout: 45_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 6, blueprintCount: 4 });
  t.after(() => fixture.close());
  const [shortProfile] = await seedShortStudentProfiles(fixture);
  const principal = fixture.principals.studentA;
  const key = randomUUID();
  const body = shortBody(shortProfile.versionId);
  const service = createAllocationService({
    examPool: fixture.examPool, identityService: fixture.identityService, enableShortPractice: true,
  });
  const created = await service.create(principal, key, body);
  assert.equal(created.status, 201);
  assert.equal(created.body.reuseMode, 'NEW_ONLY');
  const sourceService = await createSourceService({ bankPool: fixture.bankPool, identityService: fixture.identityService });
  const revoked = await sourceService.registerRightsDecision(fixture.principals.bankManager,
    fixture.source.sourceVersionId, randomUUID(), {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'],
      validFrom: '2000-01-01T00:00:00Z', validTo: null,
      evidence: 'Synthetic local rights revocation test; not a real attestation.', expectedRevision: 1,
    });
  assert.equal(revoked.status, 201);
  await fixture.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1",
    [created.body.attemptId]);

  const replay = await service.create(principal, key, body);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, created.body);
  const beforeDenied = await allocationCounts(fixture.pool, principal.userId);
  await expectCommand(service.create(principal, randomUUID(), body), 422, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
  assert.deepEqual(await allocationCounts(fixture.pool, principal.userId), beforeDenied,
    'current rights remove the short candidate pool without changing its retained receipt/history graph');
});

test('current candidate role revocation rejects a direct short creation command', { timeout: 45_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 6, blueprintCount: 4 });
  t.after(() => fixture.close());
  const [shortProfile] = await seedShortStudentProfiles(fixture);
  const before = await allocationCounts(fixture.pool, fixture.principals.studentA.userId);
  await fixture.pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='CANDIDATE'",
    [fixture.principals.studentA.userId]);
  const principal = await fixture.identityService.authenticate(new Request(fixture.harness.origin, {
    headers: { cookie: fixture.browsers.studentA.cookies.join('; ') },
  }));
  assert.ok(principal?.authenticated);
  assert.equal(principal.roles.includes('CANDIDATE'), false);
  const service = createAllocationService({
    examPool: fixture.examPool, identityService: fixture.identityService, enableShortPractice: true,
  });
  await expectCommand(service.create(principal, randomUUID(), shortBody(shortProfile.versionId)), 403, 'FORBIDDEN');
  assert.deepEqual(await allocationCounts(fixture.pool, principal.userId), before);
});

test('default full-profile commits set the short-practice transaction flag false on a pooled connection', { timeout: 45_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 6, blueprintCount: 4 });
  t.after(() => fixture.close());
  const observations = [];
  const service = createAllocationService({
    examPool: staleShortFlagPool(fixture.examPool, observations),
    identityService: fixture.identityService,
  });
  const created = await service.create(fixture.principals.studentA, randomUUID(), {
    blueprintVersionId: fixture.blueprint.versionId,
  });
  assert.equal(created.status, 201);
  assert.ok(observations.some((entry) => entry.requested === 'false' && entry.current === 'false'),
    'a session-level true does not leak into the default service commit transaction');
  assert.deepEqual(await allocationCounts(fixture.pool, fixture.principals.studentA.userId), {
    runs: 1, forms: 1, attempts: 1, history: 4, receipts: 1,
  });
});
