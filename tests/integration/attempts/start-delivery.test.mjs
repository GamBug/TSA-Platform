import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AttemptViewSchema, studentRouteRegistry } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const CREATE_RATE = Object.freeze({ capacity: 100, refillPerSecond: 10 });
const BASE_RIGHTS = Object.freeze({
  status: 'OWNED',
  allowedUses: ['DISPLAY', 'ADAPT'],
  territory: ['VN'],
  validFrom: '2000-01-01T00:00:00Z',
  validTo: null,
});

function key(label) { return `${label}-${randomUUID()}`; }
function createBody(fixture, blueprintVersionId = fixture.blueprint.versionId) { return { blueprintVersionId }; }

function interceptPool(pool, queryHook) {
  return {
    query(...args) { return pool.query(...args); },
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') return (...args) => queryHook(target.query.bind(target), ...args);
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

function pauseAfterQueryPool(pool, predicate) {
  let entered = false;
  let announceReached;
  let release;
  const reached = new Promise((resolve) => { announceReached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    pool: interceptPool(pool, async (query, text, values) => {
      const result = await query(text, values);
      if (!entered && predicate(text)) {
        entered = true;
        announceReached();
        await gate;
      }
      return result;
    }),
    reached,
    release,
  };
}

async function waitForPgLock(pool, applicationName, queryPattern) {
  const deadline = Date.now() + 7_500;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name=$1 AND wait_event_type='Lock' AND query ILIKE $2`,
    [applicationName, queryPattern]);
    if (result.rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const active = await pool.query(`SELECT application_name,state,wait_event_type,wait_event,left(query,240) AS query
    FROM pg_stat_activity WHERE application_name IN ('tsa-bank-api-test','tsa-allocation-exam-test') AND state<>'idle'`);
  throw new Error(`Timed out waiting for PostgreSQL lock waiter ${applicationName} ${queryPattern}: ${JSON.stringify(active.rows)}`);
}

async function waitForSignal(promise, description, timeoutMs = 7_500) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntilStoredStartDeadline(pool, attemptId, expectedStartBefore, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT start_before_at, clock_timestamp() >= start_before_at AS elapsed
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.equal(result.rowCount, 1);
    assert.equal(new Date(result.rows[0].start_before_at).getTime(), Date.parse(expectedStartBefore),
      'the receipt matches the persisted immutable start deadline');
    if (result.rows[0].elapsed) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The immutable start deadline did not elapse within the bounded test wait');
}

async function assertServiceError(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    const route = code === 'FORM_UNAVAILABLE' || code === 'NOT_FOUND'
      ? studentRouteRegistry.startAttempt
      : studentRouteRegistry.createAttempt;
    route.responses[status].schema.parse({
      error: { code, message: code, requestId: randomUUID(), details: error.details ?? {} },
    });
    assert.equal(JSON.stringify(error.details ?? {}).includes('answerKey'), false);
    return true;
  });
}

function assertNoPrivateKeys(value) {
  const forbidden = new Set([
    'answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance', 'provenanceIds',
    'questionVersionId', 'reviewNotes', 'normalizedFingerprint', 'sourceVersionId',
  ]);
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (item === null || typeof item !== 'object') return;
    for (const [name, child] of Object.entries(item)) {
      assert.equal(forbidden.has(name), false, `private property leaked: ${name}`);
      visit(child);
    }
  };
  visit(value);
}

async function snapshot(fixture, formId) {
  const result = await fixture.pool.query(`SELECT f.content_hash,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.section_id,s.ordinal) FROM tsa.form_sections s WHERE s.form_id=f.id) AS sections,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.section_id,s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
      (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.slot_id) FROM tsa_private.form_slot_secrets k WHERE k.form_id=f.id) AS secrets
    FROM tsa.forms f WHERE f.id=$1`, [formId]);
  return result.rows[0];
}

async function reviseRights(fixture, sources, sourceVersionId, expectedRevision, patch) {
  return sources.registerRightsDecision(
    fixture.principals.bankManager,
    sourceVersionId,
    key('attempt-rights'),
    {
      ...BASE_RIGHTS,
      ...patch,
      evidence: 'Synthetic attempt delivery rights fixture; not a real attestation.',
      expectedRevision,
    },
  );
}

test('PostgreSQL start/read preserves receipts and snapshots, blocks BOLA, TTL and rights races', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  t.after(() => fixture.close());
  const sourceService = await createSourceService({
    bankPool: fixture.bankPool,
    identityService: fixture.identityService,
  });
  const serviceA = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
  });
  const serviceB = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
  });

  assert.throws(() => createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: { capacity: 1, refillPerSecond: 0.0000009 },
  }), TypeError, 'rates below PostgreSQL token precision are rejected');

  const createdA = await serviceA.create(fixture.principals.studentA, key('create-a'), createBody(fixture));
  const expiryBlueprint = await fixture.createBlueprint({
    count: fixture.blueprint.config.sections[0].count,
    availableUntil: new Date(Date.now() + 5_000),
  });
  const createdB = await serviceA.create(fixture.principals.studentB, key('create-b'), createBody(fixture, expiryBlueprint.versionId));
  const attemptA = createdA.body.attemptId;
  const attemptB = createdB.body.attemptId;
  const startBefore = await serviceA.read(fixture.principals.studentA, attemptA);
  assert.equal(startBefore.state, 'CREATED');
  assert.equal(startBefore.startBefore, createdA.body.startBefore);
  assert.deepEqual(startBefore.slots, []);
  assert.deepEqual(startBefore.answers, []);
  assertNoPrivateKeys(startBefore);
  assert.equal(await serviceA.read(fixture.principals.studentA, attemptB), null, 'foreign attempt is indistinguishable from missing');
  await assertServiceError(serviceA.start(fixture.principals.studentA, attemptB, key('foreign-start')), 404, 'NOT_FOUND');

  const beforeSnapshot = await snapshot(fixture, createdA.body.formId);
  const startKeyA = key('start-concurrent-a');
  const startKeyB = key('start-concurrent-b');
  const racedStarts = await Promise.all([
    serviceA.start(fixture.principals.studentA, attemptA, startKeyA),
    serviceB.start(fixture.principals.studentA, attemptA, startKeyB),
  ]);
  assert.equal(racedStarts[0].status, 200);
  assert.equal(racedStarts[1].status, 200);
  assert.deepEqual(racedStarts[0].body, racedStarts[1].body, 'row-locked starts share one immutable clock receipt');
  studentRouteRegistry.startAttempt.responses[200].schema.parse(racedStarts[0].body);
  const sameKeyReplay = await serviceB.start(
    fixture.principals.studentA, attemptA, startKeyA, {});
  assert.deepEqual(sameKeyReplay.body, racedStarts[0].body);

  const activeView = await createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
  }).read(fixture.principals.studentA, attemptA);
  AttemptViewSchema.parse(activeView);
  assert.equal(activeView.state, 'IN_PROGRESS');
  assert.equal(activeView.slots.length, fixture.blueprint.config.sections[0].count);
  assert.deepEqual(activeView.answers, []);
  assertNoPrivateKeys(activeView);
  const afterSnapshot = await snapshot(fixture, createdA.body.formId);
  assert.deepEqual(afterSnapshot, beforeSnapshot, 'starting changes only attempt clocks, not sealed public/private form snapshots');
  const activeInvariant = await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.attempts
    WHERE user_id=$1 AND state IN ('CREATED','IN_PROGRESS')`, [fixture.principals.studentA.userId]);
  assert.equal(activeInvariant.rows[0].n, 1);

  await waitUntilStoredStartDeadline(fixture.pool, attemptB, createdB.body.startBefore);
  await assertServiceError(serviceA.start(fixture.principals.studentB, attemptB, key('expired-start')), 410, 'FORM_UNAVAILABLE');
  const expiredByStart = await serviceA.read(fixture.principals.studentB, attemptB);
  assert.equal(expiredByStart.state, 'CANCELLED');
  assert.equal(expiredByStart.closure.cancellationReason, 'START_TTL_EXPIRED');
  assert.deepEqual(expiredByStart.slots, []);
  await assertServiceError(serviceA.start(fixture.principals.studentB, attemptB, key('cancelled-start')), 410, 'FORM_UNAVAILABLE');
  const retainedHistory = await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.student_question_history
    WHERE first_attempt_id=$1`, [attemptB]);
  assert.equal(retainedHistory.rows[0].n, fixture.blueprint.config.sections[0].count,
    'a cancelled reservation keeps every committed stable-identity history row');

  const secondB = await serviceA.create(fixture.principals.studentB, key('create-b-after-cancel'), createBody(fixture));
  const beforeShortRights = await fixture.pool.query('SELECT question_id FROM tsa.form_slots WHERE form_id=$1', [secondB.body.formId]);
  const seenByB = await fixture.pool.query('SELECT question_id FROM tsa.student_question_history WHERE user_id=$1', [fixture.principals.studentB.userId]);
  assert.equal(seenByB.rows.some((row) => row.question_id === beforeShortRights.rows[0].question_id), true);
  assert.equal(beforeShortRights.rows[0].question_id === (await fixture.pool.query(`SELECT s.question_id FROM tsa.form_slots s
    WHERE s.form_id=$1`, [createdB.body.formId])).rows[0].question_id, false,
  'NEW_ONLY excludes a cancelled attempt’s assigned stable question');

  await reviseRights(fixture, sourceService, fixture.source.sourceVersionId, 1, { validTo: new Date(Date.now() + 30_000).toISOString() });
  await assertServiceError(serviceA.start(fixture.principals.studentB, secondB.body.attemptId, key('short-rights-start')), 410, 'FORM_UNAVAILABLE');
  const rightsBlocked = await serviceA.read(fixture.principals.studentB, secondB.body.attemptId);
  assert.equal(rightsBlocked.state, 'CANCELLED');
  assert.equal(rightsBlocked.closure.cancellationReason, 'RIGHTS_BLOCKED');
  assert.deepEqual(rightsBlocked.slots, []);

  await reviseRights(fixture, sourceService, fixture.source.sourceVersionId, 2, {});
  const startFirstAttempt = await serviceA.create(
    fixture.principals.studentB, key('start-first-create'), createBody(fixture));
  const startBarrier = pauseAfterQueryPool(fixture.examPool,
    (text) => typeof text === 'string' && text.includes('tsa.exam_attempt_start'));
  const startFirstService = createAttemptService({
    examPool: startBarrier.pool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
  });
  let startFirst;
  let revokeAfterStart;
  try {
    startFirst = startFirstService.start(
      fixture.principals.studentB, startFirstAttempt.body.attemptId, key('start-first-race'));
    await waitForSignal(startBarrier.reached, 'the first-start SQL result while its PostgreSQL transaction remains open');
    revokeAfterStart = reviseRights(fixture, sourceService, fixture.source.sourceVersionId, 3, {
      status: 'REVOKED', allowedUses: ['DISPLAY'],
    });
    await waitForPgLock(fixture.pool, 'tsa-bank-api-test', '%1414742321%');
  } finally {
    startBarrier.release();
  }
  const [startFirstResult, revokeAfterStartResult] = await Promise.allSettled([startFirst, revokeAfterStart]);
  assert.equal(startFirstResult.status, 'fulfilled', 'the first start owns the Bank shared lock before revocation');
  assert.equal(startFirstResult.value.status, 200);
  studentRouteRegistry.startAttempt.responses[200].schema.parse(startFirstResult.value.body);
  assert.equal(revokeAfterStartResult.status, 'fulfilled');
  const invalidatedByRevocation = await serviceA.read(fixture.principals.studentB, startFirstAttempt.body.attemptId);
  assert.equal(invalidatedByRevocation.state, 'INVALIDATED');
  assert.deepEqual(invalidatedByRevocation.slots, [], 'later revocation removes student-safe content without rewriting the sealed form');
  assertNoPrivateKeys(invalidatedByRevocation);

  const independentSource = await fixture.registerSource();
  await Promise.all(Array.from({ length: fixture.blueprint.config.sections[0].count }, (_, index) =>
    fixture.createQuestion(independentSource, `rights-first-${index + 1}-${randomUUID()}`)));
  const independentBlueprint = await fixture.createBlueprint({ count: fixture.blueprint.config.sections[0].count });
  const rightsFirstAttempt = await serviceA.create(
    fixture.principals.studentA, key('rights-first-create'), createBody(fixture, independentBlueprint.versionId));
  const rightsBarrier = pauseAfterQueryPool(fixture.bankPool,
    (text) => typeof text === 'string' && text.includes('tsa.bank_apply_delivery_hold'));
  const rightsFirstService = await createSourceService({
    bankPool: rightsBarrier.pool,
    identityService: fixture.identityService,
  });
  let revokeFirst;
  let startAfterRevoke;
  try {
    revokeFirst = reviseRights(fixture, rightsFirstService, independentSource.sourceVersionId, 1, {
      status: 'REVOKED', allowedUses: ['DISPLAY'],
    });
    await waitForSignal(rightsBarrier.reached, 'the rights-hold SQL result while its PostgreSQL transaction remains open');
    startAfterRevoke = serviceB.start(
      fixture.principals.studentA, rightsFirstAttempt.body.attemptId, key('rights-first-race'));
    await waitForPgLock(fixture.pool, 'tsa-allocation-exam-test', '%exam_attempt_start%');
  } finally {
    rightsBarrier.release();
  }
  const [revokeFirstResult, startAfterRevokeResult] = await Promise.allSettled([revokeFirst, startAfterRevoke]);
  assert.equal(revokeFirstResult.status, 'fulfilled', 'revocation owns the Bank exclusive lock before first start');
  assert.equal(startAfterRevokeResult.status, 'rejected');
  assert.equal(startAfterRevokeResult.reason.status, 410);
  assert.equal(startAfterRevokeResult.reason.code, 'FORM_UNAVAILABLE');
  const cancelledBeforeStart = await serviceA.read(fixture.principals.studentA, rightsFirstAttempt.body.attemptId);
  assert.equal(cancelledBeforeStart.state, 'CANCELLED');
  assert.equal(cancelledBeforeStart.closure.cancellationReason, 'RIGHTS_BLOCKED');
  assert.deepEqual(cancelledBeforeStart.slots, []);
  assertNoPrivateKeys(cancelledBeforeStart);

  await assertServiceError(serviceA.create(fixture.principals.author, key('author-create'), createBody(fixture)), 403, 'FORBIDDEN');
  await assertServiceError(serviceA.create({
    authenticated: true,
    userId: fixture.principals.studentA.userId,
    roles: ['CANDIDATE'],
  }, key('forged-create'), createBody(fixture)), 403, 'FORBIDDEN');
  await assertServiceError(serviceA.create(fixture.principals.studentA, key('forged-body'), {
    ...createBody(fixture), userId: fixture.principals.studentB.userId,
  }), 422, 'VALIDATION_ERROR');
});
