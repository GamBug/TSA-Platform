import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  AuthorizedReleasedReviewSchema,
  canonicalize,
  createHttpBoundaryHandler,
  releasedReviewRouteRegistry,
} from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { scoreAttempt } from '../../../src/modules/scoring/binary.mjs';
import { LOCAL_TAXONOMY } from '../../../src/local/seed.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
  attempt: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
});

function key(label) { return `${label}-${randomUUID()}`; }

function assertNoPrivateKeys(value) {
  const forbidden = new Set([
    'answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance', 'provenanceIds',
    'sourceVersionId', 'questionVersionId', 'normalizedFingerprint', 'reviewNotes', 'createdBy',
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

async function getReleasedResult(service, principal, attemptId) {
  return service.withReadBoundary(principal, (ports) => {
    const boundary = createHttpBoundaryHandler({
      authenticate: async () => principal,
      ...ports,
    });
    return boundary(new Request(`http://127.0.0.1/api/v1/attempts/${attemptId}/result`));
  });
}

async function workerFor(fixture) {
  const workerLogin = `result_grader_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${workerLogin} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${workerLogin}`);
  const workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: workerLogin }, {
    applicationName: 'tsa-result-grader-test',
    max: 2,
  });
  return {
    workerPool,
    worker: createExamWorker({ workerPool, executorId: 'result-grader-test', leaseSeconds: 30, retrySeconds: 30 }),
  };
}

async function createShortDurationBlueprint(fixture) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = {
    schemaVersion: 'blueprint/1',
    name: `Synthetic released-result expiry blueprint ${id}`,
    taxonomyVersionId: LOCAL_TAXONOMY.taxonomyVersionId,
    profileKind: 'INDEPENDENT_PRACTICE',
    evidenceIds: ['synthetic-result-delivery-fixture'],
    sections: [{ id: 'result-expiry-section', section: 'MATH', count: 4, durationSeconds: 1 }],
    allowedTypes: ['SINGLE_CHOICE'],
    quotas: [{ sectionId: 'result-expiry-section', dimension: 'SKILL', value: LOCAL_TAXONOMY.skillId, min: 4, max: 4 }],
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

async function waitUntilDeadline(pool, attemptId) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT clock_timestamp()>=deadline_at AS elapsed
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
    assert.equal(result.rowCount, 1);
    if (result.rows[0].elapsed) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The short result-fixture deadline did not elapse within the bounded wait');
}

test('closed attempts expose an unofficial released review only after trusted grading', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  let workerPool;
  t.after(async () => {
    if (workerPool) await workerPool.end();
    await fixture.close();
  });
  const attempts = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });

  const created = await attempts.create(fixture.principals.studentA, key('result-create'), {
    blueprintVersionId: fixture.blueprint.versionId,
  });
  const attemptId = created.body.attemptId;
  let response = await getReleasedResult(attempts, fixture.principals.studentA, attemptId);
  assert.equal(response.status, 409);
  const createdError = await response.json();
  releasedReviewRouteRegistry.releasedResult.responses[409].schema.parse(createdError);
  assertNoPrivateKeys(createdError);

  await attempts.start(fixture.principals.studentA, attemptId, key('result-start'), {});
  response = await getReleasedResult(attempts, fixture.principals.studentA, attemptId);
  assert.equal(response.status, 409);
  assertNoPrivateKeys(await response.json());

  const active = await attempts.read(fixture.principals.studentA, attemptId);
  assert.equal(active.state, 'IN_PROGRESS');
  assert.ok(active.slots.length > 0);
  for (const slot of active.slots) {
    await attempts.save(fixture.principals.studentA, attemptId, slot.slotId, key('result-save'), {
      expectedRevision: 0,
      value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id },
    });
  }
  const submitted = await attempts.submit(fixture.principals.studentA, attemptId, key('result-submit'), {});
  assert.equal(submitted.body.state, 'SUBMITTED');
  response = await getReleasedResult(attempts, fixture.principals.studentA, attemptId);
  assert.equal(response.status, 409);
  const submittedError = await response.json();
  releasedReviewRouteRegistry.releasedResult.responses[409].schema.parse(submittedError);
  assertNoPrivateKeys(submittedError);

  const studentWorkerMembership = await fixture.examPool.query(
    "SELECT pg_has_role(session_user,'tsa_exam_worker','MEMBER') AS worker");
  assert.deepEqual(studentWorkerMembership.rows, [{ worker: false }]);
  await assert.rejects(fixture.examPool.query(
    "SELECT tsa.exam_worker_claim('student-spoof'::text,30::integer)"), (error) => error.code === '42501');

  const workerState = await workerFor(fixture);
  workerPool = workerState.workerPool;
  const grade = await workerState.worker.runOnce();
  assert.equal(grade.status, 'GRADED');
  assert.equal(grade.attemptId, attemptId);

  const reconstructed = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  response = await getReleasedResult(reconstructed, fixture.principals.studentA, attemptId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const review = releasedReviewRouteRegistry.releasedResult.responses[200].schema.parse(await response.json());
  assert.deepEqual(AuthorizedReleasedReviewSchema.parse(review), review);
  assert.equal(review.attemptId, attemptId);
  assert.equal(review.scoreRunId, grade.scoreRunId);
  assert.equal(review.policyVersion, 'practice-binary-v1');
  assert.equal(review.scoreLabel, 'UNOFFICIAL_PRACTICE');
  assert.equal(review.items.length, review.totalCount);
  assert.ok(review.items.every((item) => item.correctAnswer && item.explanation.length > 0));
  assert.equal(JSON.stringify(review).includes('provenance'), false);
  assert.equal(JSON.stringify(review).includes('questionVersionId'), false);
  assert.equal(JSON.stringify(review).includes('reviewNotes'), false);

  const recomputed = scoreAttempt({
    policyVersion: review.policyVersion,
    slots: review.items.map((item) => ({
      slotId: item.slotId,
      sectionId: item.question.sectionId,
      section: review.domain,
      ordinal: item.question.ordinal,
      interaction: item.question.interaction,
      answerKey: item.correctAnswer,
      response: item.response,
    })),
  });
  assert.equal(recomputed.correctCount, review.correctCount);
  assert.equal(recomputed.totalCount, review.totalCount);
  assert.equal(recomputed.percentage, review.percentage);
  assert.deepEqual(recomputed.items, review.items.map(({ slotId, earned }) => ({ slotId, earned })));

  const ordinaryView = await reconstructed.read(fixture.principals.studentA, attemptId);
  assert.equal(ordinaryView.state, 'GRADED');
  assert.deepEqual(ordinaryView.slots, []);
  assert.deepEqual(ordinaryView.answers, []);
  assertNoPrivateKeys(ordinaryView);

  const expiringBlueprint = await createShortDurationBlueprint(fixture);
  const expiring = await reconstructed.create(fixture.principals.studentB, key('result-expiry-create'), {
    blueprintVersionId: expiringBlueprint,
  });
  await reconstructed.start(fixture.principals.studentB, expiring.body.attemptId, key('result-expiry-start'), {});
  await waitUntilDeadline(fixture.pool, expiring.body.attemptId);
  const expired = await reconstructed.submit(
    fixture.principals.studentB, expiring.body.attemptId, key('result-expiry-submit'), {});
  assert.equal(expired.body.state, 'EXPIRED');
  response = await getReleasedResult(reconstructed, fixture.principals.studentB, expiring.body.attemptId);
  assert.equal(response.status, 409);
  const expiredError = await response.json();
  releasedReviewRouteRegistry.releasedResult.responses[409].schema.parse(expiredError);
  assertNoPrivateKeys(expiredError);
});
