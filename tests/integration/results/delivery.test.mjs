import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';

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
import { createPrivateTemplate, LOCAL_TAXONOMY } from '../../../src/local/seed.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { bankRequest } from '../bank/harness.mjs';

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

async function sealedAttemptSnapshot(pool, attemptId) {
  const result = await pool.query(`SELECT f.id AS form_id, f.content_hash AS form_hash,
      a.form_mode::text AS form_mode, a.reuse_mode::text AS reuse_mode,
      a.started_at, a.deadline_at, a.state::text AS state,
      to_jsonb(f) AS form_row,
      to_char(a.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_started_at,
      to_char(a.deadline_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_deadline_at,
      jsonb_agg(jsonb_build_object(
        'slotId',fs.slot_id,'questionId',fs.question_id,'questionVersionId',fs.question_version_id,
        'publicSnapshot',fs.public_snapshot,'snapshotHash',fs.snapshot_hash,
        'fullSlotRow',to_jsonb(fs),'fullSecretRow',to_jsonb(secret),
        'keySnapshot',secret.key_snapshot,'explanationSnapshot',secret.explanation_snapshot,
        'policyVersion',secret.policy_version,'secretHash',secret.secret_hash
      ) ORDER BY fs.ordinal) AS slots
    FROM tsa.attempts a
    JOIN tsa.forms f ON f.id=a.form_id
    JOIN tsa.form_slots fs ON fs.form_id=f.id
    JOIN tsa_private.form_slot_secrets secret ON secret.form_id=fs.form_id AND secret.slot_id=fs.slot_id
    WHERE a.id=$1
    GROUP BY f.id,f.content_hash,a.form_mode,a.reuse_mode,a.started_at,a.deadline_at,a.state`, [attemptId]);
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function studentQuestionHistory(pool, userId) {
  const result = await pool.query(`SELECT to_jsonb(h) AS value
    FROM tsa.student_question_history h WHERE user_id=$1 ORDER BY question_id`, [userId]);
  return result.rows.map(({ value }) => value);
}

async function publishCorrectedQuestionVersion(fixture, parent) {
  const template = createPrivateTemplate(fixture.source);
  const body = {
    parentVersionId: parent.versionId,
    draft: {
      schemaVersion: 'question/1',
      language: 'vi-VN',
      section: 'MATH',
      taxonomyVersionId: template.taxonomyVersionId,
      domainId: template.domainId,
      skillIds: template.skillIds,
      subskillIds: [],
      cognitiveLevel: null,
      targetDifficulty: 'EASY',
      content: [{ type: 'text', text: `Synthetic corrected result-delivery candidate ${randomUUID()}` }],
      interaction: privateQuestionFixture.interaction,
      answerKey: { type: 'SINGLE_CHOICE', optionId: 'a' },
      explanation: [{ type: 'text', text: 'Synthetic corrected-key explanation.' }],
      stimulusVersionId: null,
      evidenceRefs: template.evidenceRefs,
      origin: 'MANUAL',
      provenance: template.provenance,
    },
  };
  const response = await bankRequest(
    fixture.harness,
    fixture.browsers.author,
    `/api/v1/questions/${parent.questionId}/versions`,
    { method: 'POST', key: key('result-correction-create'), body },
  );
  const responseText = await response.text();
  assert.equal(response.status, 201, responseText);
  const corrected = JSON.parse(responseText);

  // The synthetic reviewer is fixture machinery, not qualified human review evidence.
  await fixture.workflow.submitReview(fixture.principals.author, corrected.versionId,
    key('result-correction-submit'), { expectedRevision: 1 });
  await fixture.workflow.confirmSingleton(fixture.principals.reviewer, corrected.versionId,
    key('result-correction-singleton'), {
      expectedRevision: 2,
      contentHash: corrected.contentHash,
      reason: 'Synthetic scenario G exact-version singleton decision.',
    });
  await fixture.workflow.review(fixture.principals.reviewer, corrected.versionId,
    key('result-correction-approve'), {
      expectedRevision: 2,
      contentHash: corrected.contentHash,
      decision: 'APPROVE',
      rubric: {
        correctness: true,
        unambiguous: true,
        relevant: true,
        language: true,
        explanation: true,
        rights: true,
      },
      reason: 'Synthetic correction approval for PostgreSQL regression machinery only.',
    });
  return {
    ...corrected,
    content: body.draft.content,
    answerKey: body.draft.answerKey,
  };
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

test('an in-progress attempt grades and releases its sealed original after a corrected version becomes eligible', async (t) => {
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

  const created = await attempts.create(fixture.principals.studentA, key('corrected-result-create'), {
    blueprintVersionId: fixture.blueprint.versionId,
  });
  assert.equal(created.body.state, 'CREATED');
  assert.equal(created.body.formMode, 'PERSONALIZED_PRACTICE');
  assert.equal(created.body.reuseMode, 'NEW_ONLY');
  const attemptId = created.body.attemptId;
  const started = await attempts.start(fixture.principals.studentA, attemptId, key('corrected-result-start'), {});

  const attemptBefore = await sealedAttemptSnapshot(fixture.pool, attemptId);
  assert.equal(attemptBefore.state, 'IN_PROGRESS');
  assert.equal(attemptBefore.form_mode, 'PERSONALIZED_PRACTICE');
  assert.equal(attemptBefore.reuse_mode, 'NEW_ONLY');
  assert.equal(Number((attemptBefore.deadline_at - attemptBefore.started_at) / 1000), 600);
  assert.equal(started.body.attemptId, attemptId);
  assert.equal(Date.parse(started.body.startedAt), attemptBefore.started_at.getTime());
  assert.equal(Date.parse(started.body.deadlineAt), attemptBefore.deadline_at.getTime());
  assert.equal(attemptBefore.slots.length, 4);
  const historyBeforePublication = await studentQuestionHistory(fixture.pool, fixture.principals.studentA.userId);
  assert.equal(historyBeforePublication.length, 4);
  assert.ok(historyBeforePublication.every((row) => row.first_attempt_id === attemptId));
  assert.deepEqual(new Set(historyBeforePublication.map((row) => row.question_id)),
    new Set(attemptBefore.slots.map((slot) => slot.questionId)));

  const active = await attempts.read(fixture.principals.studentA, attemptId);
  assert.equal(active.state, 'IN_PROGRESS');
  assert.equal(active.slots.length, attemptBefore.slots.length);
  for (const slot of active.slots) {
    const sealedSlot = attemptBefore.slots.find((item) => item.slotId === slot.slotId);
    assert.ok(sealedSlot, `active slot ${slot.slotId} is present in the sealed snapshot`);
    assert.deepEqual(sealedSlot.keySnapshot, { type: 'SINGLE_CHOICE', optionId: 'b' });
    await attempts.save(fixture.principals.studentA, attemptId, slot.slotId, key('correct-result-answer'), {
      expectedRevision: 0,
      value: sealedSlot.keySnapshot,
    });
  }

  const targetSealedSlot = attemptBefore.slots[0];
  const parent = fixture.questions.find((question) => question.questionId === targetSealedSlot.questionId);
  assert.ok(parent, 'selected stable question is part of the disposable allocation fixture');
  assert.equal(parent.versionId, targetSealedSlot.questionVersionId);
  const eligibleBefore = await fixture.pool.query(
    'SELECT eligible_version_id FROM tsa.questions WHERE id=$1', [targetSealedSlot.questionId]);
  assert.equal(eligibleBefore.rows[0].eligible_version_id, targetSealedSlot.questionVersionId);

  const gradingHashBeforePublication = (await fixture.pool.query(
    'SELECT tsa.exam_grading_input_hash($1) AS digest', [attemptId])).rows[0].digest;
  const corrected = await publishCorrectedQuestionVersion(fixture, parent);
  assert.notEqual(corrected.versionId, targetSealedSlot.questionVersionId);
  const correctedRecord = await fixture.pool.query(`SELECT v.content,s.answer_key,q.eligible_version_id
    FROM tsa.question_versions v
    JOIN tsa_private.question_secrets s ON s.question_version_id=v.id
    JOIN tsa.questions q ON q.id=v.question_id WHERE v.id=$1`, [corrected.versionId]);
  assert.equal(correctedRecord.rowCount, 1);
  assert.equal(correctedRecord.rows[0].eligible_version_id, corrected.versionId);
  assert.deepEqual(correctedRecord.rows[0].content, corrected.content);
  assert.deepEqual(correctedRecord.rows[0].answer_key, corrected.answerKey);
  assert.notDeepEqual(correctedRecord.rows[0].content, targetSealedSlot.publicSnapshot.content);
  assert.notDeepEqual(correctedRecord.rows[0].answer_key, targetSealedSlot.keySnapshot);

  const attemptAfterPublication = await sealedAttemptSnapshot(fixture.pool, attemptId);
  assert.deepEqual(attemptAfterPublication, attemptBefore);
  assert.equal((await fixture.pool.query(
    'SELECT tsa.exam_grading_input_hash($1) AS digest', [attemptId])).rows[0].digest,
  gradingHashBeforePublication);
  assert.deepEqual(await studentQuestionHistory(fixture.pool, fixture.principals.studentA.userId),
    historyBeforePublication);

  const submitted = await attempts.submit(fixture.principals.studentA, attemptId, key('corrected-result-submit'), {});
  assert.equal(submitted.body.state, 'SUBMITTED');
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
  const response = await getReleasedResult(reconstructed, fixture.principals.studentA, attemptId);
  assert.equal(response.status, 200);
  const review = AuthorizedReleasedReviewSchema.parse(await response.json());
  assert.equal(review.correctCount, 4);
  assert.equal(review.totalCount, 4);
  assert.ok(review.items.every((item) => item.earned === 1));
  for (const sealedSlot of attemptBefore.slots) {
    const item = review.items.find((reviewItem) => reviewItem.slotId === sealedSlot.slotId);
    assert.ok(item, `released review contains sealed slot ${sealedSlot.slotId}`);
    assert.deepEqual(item.correctAnswer, sealedSlot.keySnapshot);
    assert.deepEqual(item.explanation, sealedSlot.explanationSnapshot);
    assert.deepEqual(item.question.content, sealedSlot.publicSnapshot.content);
    assert.deepEqual(item.question.interaction, sealedSlot.publicSnapshot.interaction);
    assert.deepEqual(item.response, sealedSlot.keySnapshot);
  }
  const correctedSlotReview = review.items.find((item) => item.slotId === targetSealedSlot.slotId);
  assert.equal(correctedSlotReview.correctAnswer.optionId, 'b');
  assert.equal(correctedSlotReview.earned, 1);
  assert.equal(correctedRecord.rows[0].answer_key.optionId === correctedSlotReview.response.optionId ? 1 : 0, 0,
    'the corrected eligible key would score this original response as wrong');
  assert.notDeepEqual(correctedSlotReview.question.content, correctedRecord.rows[0].content);
  assert.notDeepEqual(correctedSlotReview.correctAnswer, correctedRecord.rows[0].answer_key);

  const next = await reconstructed.create(fixture.principals.studentA, key('corrected-result-next-attempt'), {
    blueprintVersionId: fixture.blueprint.versionId,
  });
  assert.equal(next.body.reuseMode, 'NEW_ONLY');
  const nextSnapshot = await sealedAttemptSnapshot(fixture.pool, next.body.attemptId);
  const originalQuestionIds = new Set(attemptBefore.slots.map((slot) => slot.questionId));
  assert.ok(nextSnapshot.slots.every((slot) => !originalQuestionIds.has(slot.questionId)),
    'NEW_ONLY history excludes every stable question assigned to the first attempt, including its corrected version');
  const finalHistory = await studentQuestionHistory(fixture.pool, fixture.principals.studentA.userId);
  assert.equal(finalHistory.length, 8);
  assert.ok(finalHistory.filter((row) => originalQuestionIds.has(row.question_id))
    .every((row) => row.first_attempt_id === attemptId));
  const nextQuestionIds = new Set(nextSnapshot.slots.map((slot) => slot.questionId));
  assert.ok(finalHistory.filter((row) => nextQuestionIds.has(row.question_id))
    .every((row) => row.first_attempt_id === next.body.attemptId));
  assert.deepEqual(new Set(finalHistory.map((row) => row.question_id)),
    new Set([...originalQuestionIds, ...nextQuestionIds]));
});
