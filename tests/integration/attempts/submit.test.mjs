import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize, studentRouteRegistry } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { LOCAL_TAXONOMY } from '../../../src/local/seed.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 1, refillPerSecond: 0.000001 }),
  attempt: Object.freeze({ capacity: 1, refillPerSecond: 0.000001 }),
});

function key(label) { return `${label}-${randomUUID()}`; }
function createBody(blueprintVersionId) { return { blueprintVersionId }; }

async function assertSubmitError(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    studentRouteRegistry.submitAttempt.responses[status].schema.parse({
      error: { code, message: code, requestId: randomUUID(), details: error.details ?? {} },
    });
    return true;
  });
}

function assertNoPrivateKeys(value) {
  const forbidden = new Set([
    'answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance',
    'sourceVersionId', 'reviewNotes', 'normalizedFingerprint',
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

async function jobsFor(pool, attemptId) {
  const result = await pool.query(`SELECT kind,dedup_key,payload_ref FROM tsa.jobs
    WHERE kind='exam_grade_attempt' AND attempt_id=$1 ORDER BY created_at,id`, [attemptId]);
  return result.rows;
}

async function assertOneGradeJobMatchesDigest(pool, attemptId) {
  const rows = await jobsFor(pool, attemptId);
  assert.equal(rows.length, 1, 'each terminal attempt has exactly one durable grade job');
  assert.equal(rows[0].kind, 'exam_grade_attempt');
  assert.equal(rows[0].payload_ref, `attempt:${attemptId}`);
  const computed = await pool.query(`SELECT tsa.exam_grading_input_hash($1) AS input_hash,
      (SELECT policy_version FROM tsa_private.form_slot_secrets fs
       JOIN tsa.attempts a ON a.form_id=fs.form_id WHERE a.id=$1 LIMIT 1) AS policy`, [attemptId]);
  assert.equal(rows[0].dedup_key,
    `${attemptId}:${computed.rows[0].policy}:${computed.rows[0].input_hash}`,
    'job deduplication uses the database grading digest over the committed answer snapshot');
  assert.equal(JSON.stringify(rows[0]).includes('answerKey'), false);
  return rows[0];
}

async function createShortDurationBlueprint(fixture, durationSeconds) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = {
    schemaVersion: 'blueprint/1',
    name: `Synthetic submit deadline blueprint ${id}`,
    taxonomyVersionId: LOCAL_TAXONOMY.taxonomyVersionId,
    profileKind: 'INDEPENDENT_PRACTICE',
    evidenceIds: ['synthetic-submit-deadline-fixture'],
    sections: [{ id: 'submit-section', section: 'MATH', count: 4, durationSeconds }],
    allowedTypes: ['SINGLE_CHOICE'],
    quotas: [{ sectionId: 'submit-section', dimension: 'SKILL', value: LOCAL_TAXONOMY.skillId, min: 4, max: 4 }],
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE',
    scoringPolicy: 'practice-binary-v1',
    releasePolicy: 'after-grade-v1',
  };
  const contentHash = `sha256:${createHash('sha256').update(canonicalize(config)).digest('hex')}`;
  await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, config.name]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
  [versionId, id, LOCAL_TAXONOMY.taxonomyVersionId, JSON.stringify(config), contentHash]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings
    (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
  return versionId;
}

async function waitUntilAttemptDeadline(pool, attemptId) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT clock_timestamp()>=deadline_at AS elapsed
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.equal(result.rowCount, 1);
    if (result.rows[0].elapsed) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The short immutable submit deadline did not elapse within the bounded test wait');
}

test('PostgreSQL submit closes once, persists exact replays and jobs, and works with exhausted save budgets', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  t.after(() => fixture.close());
  const serviceA = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  const serviceB = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
  });

  const savedAttempt = await serviceA.create(
    fixture.principals.studentA, key('submit-saved-create'), createBody(fixture.blueprint.versionId));
  await serviceA.start(fixture.principals.studentA, savedAttempt.body.attemptId, key('submit-saved-start'), {});
  const active = await serviceA.read(fixture.principals.studentA, savedAttempt.body.attemptId);
  assert.deepEqual(active.answers, []);
  const slot = active.slots[0];
  await serviceA.save(fixture.principals.studentA, savedAttempt.body.attemptId, slot.slotId, key('submit-answer'), {
    expectedRevision: 0,
    value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id },
  });
  await assert.rejects(serviceA.save(
    fixture.principals.studentA, savedAttempt.body.attemptId, slot.slotId, key('submit-answer-denied'), {
      expectedRevision: 1,
      value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[1].id },
    }), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, 'RATE_LIMITED');
    studentRouteRegistry.saveAnswer.responses[429].schema.parse({
      error: { code: error.code, message: error.code, requestId: randomUUID(), details: error.details },
    });
    return true;
  });
  const exhaustedBuckets = await fixture.pool.query(`SELECT scope,tokens::text AS tokens FROM tsa.rate_limit_buckets
    WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope`);
  assert.equal(exhaustedBuckets.rowCount, 2, 'both independent save budgets were consumed before submit');
  for (const row of exhaustedBuckets.rows) assert.equal(Number(row.tokens), 0);

  await assertSubmitError(serviceA.submit(
    fixture.principals.studentB, savedAttempt.body.attemptId, key('submit-bola'), {}), 404, 'NOT_FOUND');
  await assertSubmitError(serviceA.submit(
    fixture.principals.author, savedAttempt.body.attemptId, key('submit-author'), {}), 403, 'FORBIDDEN');
  await assertSubmitError(serviceA.submit(
    fixture.principals.studentA, savedAttempt.body.attemptId, key('submit-forged-body'), { userId: fixture.principals.studentB.userId }),
  422, 'VALIDATION_ERROR');
  await assertSubmitError(serviceA.submit(
    fixture.principals.studentA, randomUUID(), key('submit-unknown'), {}), 404, 'NOT_FOUND');
  assert.deepEqual(await jobsFor(fixture.pool, savedAttempt.body.attemptId), [],
    'authorization and invalid-body failures do not enqueue grade work');

  const submittedKey = key('submit-saved');
  const simultaneous = await Promise.all([
    serviceA.submit(fixture.principals.studentA, savedAttempt.body.attemptId, submittedKey, {}),
    serviceB.submit(fixture.principals.studentA, savedAttempt.body.attemptId, submittedKey, {}),
  ]);
  assert.ok(simultaneous.every((result) => result.status === 200));
  assert.deepEqual(simultaneous[0].body, simultaneous[1].body);
  assert.equal(simultaneous.filter((result) => result.replayed).length, 1,
    'parallel identical submissions share the original durable closure receipt');
  assert.equal(simultaneous[0].body.state, 'SUBMITTED');
  assert.equal(simultaneous[0].body.terminalReason, 'EXPLICIT_SUBMIT');
  studentRouteRegistry.submitAttempt.responses[200].schema.parse(simultaneous[0].body);
  assertNoPrivateKeys(simultaneous[0].body);

  const reconstructed = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  const replay = await reconstructed.submit(
    fixture.principals.studentA, savedAttempt.body.attemptId, submittedKey, {});
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, simultaneous[0].body, 'the closure receipt survives service reconstruction');
  const newKeyClosed = await serviceB.submit(
    fixture.principals.studentA, savedAttempt.body.attemptId, key('submit-saved-new-key'), {});
  assert.equal(newKeyClosed.status, 200);
  assert.deepEqual(newKeyClosed.body, simultaneous[0].body,
    'a new key observes the same natural terminal closure without creating another job');
  const submitBuckets = await fixture.pool.query(`SELECT scope,tokens::text AS tokens FROM tsa.rate_limit_buckets
    WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope`);
  assert.deepEqual(submitBuckets.rows, exhaustedBuckets.rows,
  'submission does not consume or refill either exhausted save budget');
  await assertOneGradeJobMatchesDigest(fixture.pool, savedAttempt.body.attemptId);
  const persistedAnswers = await fixture.pool.query('SELECT slot_id,value,revision FROM tsa.answers WHERE attempt_id=$1',
    [savedAttempt.body.attemptId]);
  assert.equal(persistedAnswers.rowCount, 1, 'submission freezes but preserves the acknowledged answer');
  const closedView = await serviceA.read(fixture.principals.studentA, savedAttempt.body.attemptId);
  assert.equal(closedView.state, 'SUBMITTED');
  assert.deepEqual(closedView.slots, []);
  assert.deepEqual(closedView.answers, []);
  assertNoPrivateKeys(closedView);

  const createdAttempt = await serviceA.create(
    fixture.principals.studentB, key('submit-empty-create'), createBody(fixture.blueprint.versionId));
  await assertSubmitError(serviceA.submit(
    fixture.principals.studentB, createdAttempt.body.attemptId, key('submit-before-start'), {}), 409, 'ATTEMPT_CLOSED');
  assert.deepEqual(await jobsFor(fixture.pool, createdAttempt.body.attemptId), [], 'CREATED attempts do not enqueue grade work');
  const stillCreated = await fixture.pool.query(`SELECT state,started_at FROM tsa.attempts WHERE id=$1`,
    [createdAttempt.body.attemptId]);
  assert.equal(stillCreated.rows[0].state, 'CREATED');
  assert.equal(stillCreated.rows[0].started_at, null, 'a rejected submit does not start or mutate the attempt clock');
  await serviceA.start(fixture.principals.studentB, createdAttempt.body.attemptId, key('submit-empty-start'), {});
  const emptySubmissionKeys = [key('submit-empty-a'), key('submit-empty-b')];
  const parallelEmptyClosures = await Promise.all(emptySubmissionKeys.map((submitKey) =>
    serviceA.submit(fixture.principals.studentB, createdAttempt.body.attemptId, submitKey, {})));
  const emptyClosure = parallelEmptyClosures[0];
  assert.ok(parallelEmptyClosures.every((result) => result.status === 200));
  assert.deepEqual(parallelEmptyClosures[1].body, emptyClosure.body,
    'different concurrent keys observe the same immutable terminal closure');
  assert.equal(emptyClosure.body.state, 'SUBMITTED');
  assert.equal(emptyClosure.body.gradingStatus, 'PENDING');
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.answers WHERE attempt_id=$1',
    [createdAttempt.body.attemptId])).rows[0].n, 0, 'unanswered submission remains valid');
  await assertOneGradeJobMatchesDigest(fixture.pool, createdAttempt.body.attemptId);
  for (const submitKey of emptySubmissionKeys) {
    const emptyReplay = await reconstructed.submit(
      fixture.principals.studentB, createdAttempt.body.attemptId, submitKey, {});
    assert.equal(emptyReplay.replayed, true);
    assert.deepEqual(emptyReplay.body, emptyClosure.body);
  }

  const shortBlueprint = await createShortDurationBlueprint(fixture, 2);
  const expiringAttempt = await serviceA.create(
    fixture.principals.studentB, key('submit-expiry-create'), createBody(shortBlueprint));
  await serviceA.start(fixture.principals.studentB, expiringAttempt.body.attemptId, key('submit-expiry-start'), {});
  await waitUntilAttemptDeadline(fixture.pool, expiringAttempt.body.attemptId);
  const lateKey = key('submit-after-deadline');
  const expired = await serviceA.submit(
    fixture.principals.studentB, expiringAttempt.body.attemptId, lateKey, {});
  assert.equal(expired.status, 200);
  assert.equal(expired.body.state, 'EXPIRED');
  assert.equal(expired.body.terminalReason, 'DEADLINE');
  assert.equal(expired.body.gradingStatus, 'PENDING');
  studentRouteRegistry.submitAttempt.responses[200].schema.parse(expired.body);
  assertNoPrivateKeys(expired.body);
  const expiredReplay = await reconstructed.submit(
    fixture.principals.studentB, expiringAttempt.body.attemptId, lateKey, {});
  assert.equal(expiredReplay.replayed, true);
  assert.deepEqual(expiredReplay.body, expired.body);
  await assertOneGradeJobMatchesDigest(fixture.pool, expiringAttempt.body.attemptId);
});
