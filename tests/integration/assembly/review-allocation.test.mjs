import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  AttemptViewSchema,
  AuthorizedReleasedReviewSchema,
  createHttpBoundaryHandler,
  releasedReviewRouteRegistry,
} from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createStudentDirectoryService } from '../../../src/modules/attempts/directory.mjs';
import { captureStandaloneManifest } from '../../../src/modules/assembly/candidate-stock.mjs';
import { buildAllocationPlan } from '../../../src/modules/assembly/snapshot-builder.mjs';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createAllocationFixture } from './fixtures.mjs';
import { createBundleFixture } from './bundle-fixtures.mjs';

const CREATE_RATE = Object.freeze({ capacity: 100, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 100, refillPerSecond: 10 }),
  attempt: Object.freeze({ capacity: 100, refillPerSecond: 10 }),
});
const LIMITS = Object.freeze({ maxNodes: 50_000, maxUnits: 2_000 });

function key(label) { return `${label}-${randomUUID()}`; }
function newOnlyRequest(blueprintVersionId) { return { blueprintVersionId }; }
function reviewRequest(blueprintVersionId) {
  return {
    mode: 'PERSONALIZED_PRACTICE',
    blueprintVersionId,
    reuseMode: 'REVIEW_ALLOWED',
    acknowledgeRepeats: true,
  };
}

function attemptService(fixture, enableReviewPractice) {
  return createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
    ...(enableReviewPractice === undefined ? {} : { enableReviewPractice }),
  });
}

async function expectError(promise, status, code) {
  let observed;
  await assert.rejects(promise, (error) => {
    observed = error;
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
  return observed;
}

async function allocationSnapshot(pool, userId) {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.assembly_runs WHERE user_id=$1) AS runs,
    (SELECT count(*)::int FROM tsa.forms WHERE owner_user_id=$1) AS forms,
    (SELECT count(*)::int FROM tsa.attempts WHERE user_id=$1) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history WHERE user_id=$1) AS history,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts') AS receipts,
    (SELECT count(*)::int FROM tsa.audit_events WHERE actor_id=$1 AND action='ATTEMPT_ALLOCATED') AS allocation_audits,
    (SELECT count(*)::int FROM tsa.jobs j JOIN tsa.attempts a ON a.id=j.attempt_id WHERE a.user_id=$1) AS jobs,
    COALESCE((SELECT revision::text FROM tsa.student_allocation_state WHERE user_id=$1),'0') AS revision`, [userId]);
  return result.rows[0];
}

async function historyRows(pool, userId) {
  const result = await pool.query(`SELECT question_id,first_attempt_id,assigned_at
    FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id`, [userId]);
  return result.rows;
}

async function createBlueprintExcluding(fixture, baseBlueprint, excludedQuestionIds) {
  const id = randomUUID();
  const versionId = randomUUID();
  const config = structuredClone(baseBlueprint.config);
  config.name = `Synthetic explicit-review exclusion profile ${id}`;
  config.excludedQuestionIds = [...excludedQuestionIds];
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

function assertNoPrivateAttemptData(value) {
  const forbidden = new Set([
    'answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance', 'provenanceIds',
    'questionVersionId', 'sourceVersionId', 'normalizedFingerprint', 'manifest', 'manifestHash',
    'historyQuestionIds', 'candidateIds',
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

async function getReleasedReview(service, principal, attemptId) {
  return service.withReadBoundary(principal, (ports) => {
    const boundary = createHttpBoundaryHandler({ authenticate: async () => principal, ...ports });
    return boundary(new Request(`http://127.0.0.1/api/v1/attempts/${attemptId}/result`));
  });
}

async function workerFor(fixture) {
  const roleName = `review_grader_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${roleName} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${roleName}`);
  const workerPool = createDatabasePool(
    { ...fixture.harness.database.connectionConfig, user: roleName },
    { applicationName: 'tsa-review-practice-grader-test', max: 2 },
  );
  return {
    workerPool,
    worker: createExamWorker({ workerPool, executorId: 'review-practice-test', leaseSeconds: 30, retrySeconds: 30 }),
  };
}

function lockWinnerCommit(pool, winnerKey) {
  let arrivals = 0;
  let abortReason = null;
  let announceReady;
  let announceWinnerQuery;
  let releaseWinner;
  const bothReady = new Promise((resolve) => { announceReady = resolve; });
  const winnerQuery = new Promise((resolve) => { announceWinnerQuery = resolve; });
  const winnerGate = new Promise((resolve) => { releaseWinner = resolve; });
  const wrapped = {
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') return async (...args) => {
            const [text, values] = args;
            if (text === 'BEGIN') {
              const result = await target.query(...args);
              await target.query('SET LOCAL statement_timeout=10000');
              return result;
            }
            if (typeof text !== 'string' || !text.includes('tsa.assembly_commit_personal')) {
              return target.query(...args);
            }
            arrivals += 1;
            const arrival = arrivals;
            if (arrivals === 2) announceReady();
            await bothReady;
            if (abortReason) throw abortReason;
            if (values[0] === winnerKey) {
              const result = await target.query(...args);
              announceWinnerQuery();
              await winnerGate;
              if (abortReason) throw abortReason;
              return result;
            }
            await winnerQuery;
            if (abortReason) throw abortReason;
            return target.query(...args);
          };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
  return {
    pool: wrapped, winnerQuery, releaseWinner,
    abort(error) { abortReason ??= error; announceReady(); announceWinnerQuery(); releaseWinner(); },
    get failure() { return abortReason; },
  };
}

async function waitForAllocationLock(pool) {
  const deadline = Date.now() + 7_500;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name='tsa-allocation-exam-test' AND wait_event_type='Lock'
        AND query LIKE '%assembly_commit_personal%'`);
    if (result.rows[0].waiting >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for a concurrent review-practice allocation on a real PostgreSQL lock');
}

test('explicit review practice preserves history, requires consent, and grades a fresh form', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  let workerPool;
  t.after(async () => {
    if (workerPool) await workerPool.end();
    await fixture.close();
  });

  const principal = fixture.principals.studentA;
  const firstBlueprint = fixture.blueprint;
  const disabled = attemptService(fixture);
  const enabled = attemptService(fixture, true);

  const first = await enabled.create(principal, key('review-history-first-new-only'), newOnlyRequest(firstBlueprint.versionId));
  assert.equal(first.status, 201);
  assert.equal(first.body.reuseMode, 'NEW_ONLY');
  const firstSlots = await fixture.pool.query(`SELECT question_id,question_version_id,ordinal
    FROM tsa.form_slots WHERE form_id=$1 ORDER BY ordinal`, [first.body.formId]);
  assert.equal(firstSlots.rowCount, 4);
  await fixture.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1", [first.body.attemptId]);

  const additionalQuestions = [];
  for (let index = 0; index < 3; index += 1) {
    additionalQuestions.push(await fixture.createQuestion(fixture.source, `review-new-stock-${index + 1}-${randomUUID()}`));
  }
  const reviewBlueprint = await createBlueprintExcluding(
    fixture,
    firstBlueprint,
    firstSlots.rows.slice(1).map((slot) => slot.question_id),
  );
  const reviewBody = reviewRequest(reviewBlueprint.versionId);

  const defaultCatalog = await createStudentDirectoryService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
  }).catalog(principal);
  const enabledCatalog = await createStudentDirectoryService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    enableReviewPractice: true,
  }).catalog(principal);
  assert.equal(defaultCatalog.items.find((item) => item.blueprintVersionId === reviewBlueprint.versionId).reviewAllowed, false);
  assert.equal(enabledCatalog.items.find((item) => item.blueprintVersionId === reviewBlueprint.versionId).reviewAllowed, true);

  const beforeFailure = await allocationSnapshot(fixture.pool, principal.userId);
  assert.deepEqual(beforeFailure, {
    runs: 1, forms: 1, attempts: 1, history: 4, receipts: 1,
    allocation_audits: 1, jobs: 0, revision: '1',
  });

  await expectError(disabled.create(principal, key('review-disabled'), reviewBody),
    503, 'TEMPORARILY_UNAVAILABLE');
  await expectError(enabled.create(principal, key('review-consent-omitted'), {
    mode: 'PERSONALIZED_PRACTICE',
    blueprintVersionId: reviewBlueprint.versionId,
    reuseMode: 'REVIEW_ALLOWED',
  }), 422, 'VALIDATION_ERROR');
  await expectError(enabled.create(principal, key('review-consent-false'), {
    ...reviewBody,
    acknowledgeRepeats: false,
  }), 422, 'VALIDATION_ERROR');
  assert.deepEqual(await allocationSnapshot(fixture.pool, principal.userId), beforeFailure,
    'disabled review and malformed consent requests write no allocation state');

  const shortage = await expectError(enabled.create(principal, key('review-shortage-new-only'),
    newOnlyRequest(reviewBlueprint.versionId)), 422, 'INSUFFICIENT_UNSEEN_INVENTORY');
  assert.equal(shortage.details.blueprintVersionId, reviewBlueprint.versionId);
  assert.equal(shortage.details.reuseMode, 'NEW_ONLY');
  assert.deepEqual(shortage.details.sectionDeficits, [{ sectionId: reviewBlueprint.config.sections[0].id, missingCount: 1 }]);
  assert.deepEqual(shortage.details.alternatives, [{
    kind: 'REVIEW_MODE',
    blueprintVersionId: reviewBlueprint.versionId,
    requiresRepeatConsent: true,
  }]);
  assert.deepEqual(await allocationSnapshot(fixture.pool, principal.userId), beforeFailure,
    'the offered alternative follows a no-allocation NEW_ONLY shortage');

  const historyBeforeReview = await historyRows(fixture.pool, principal.userId);
  const firstRevision = BigInt(beforeFailure.revision);
  const reviewKey = key('review-explicit-create');
  const created = await enabled.create(principal, reviewKey, reviewBody);
  assert.equal(created.status, 201);
  assert.equal(created.replayed, false);
  assert.equal(created.body.state, 'CREATED');
  assert.equal(created.body.domain, 'MATH');
  assert.equal(created.body.formMode, 'PERSONALIZED_PRACTICE');
  assert.equal(created.body.reuseMode, 'REVIEW_ALLOWED');
  assert.notEqual(created.body.attemptId, first.body.attemptId);
  assert.notEqual(created.body.formId, first.body.formId);

  const persisted = await fixture.pool.query(`SELECT a.id AS attempt_id,a.state::text AS state,
      a.reuse_mode::text AS reuse_mode,a.start_before_at,a.started_at,a.deadline_at,
      f.id AS form_id,f.blueprint_version_id,f.owner_user_id,f.content_hash,
      r.id AS run_id,r.manifest,r.manifest_hash
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
    JOIN tsa.assembly_runs r ON r.id=f.assembly_run_id WHERE a.id=$1`, [created.body.attemptId]);
  assert.equal(persisted.rowCount, 1);
  const reviewRow = persisted.rows[0];
  assert.equal(reviewRow.state, 'CREATED');
  assert.equal(reviewRow.reuse_mode, 'REVIEW_ALLOWED');
  assert.equal(reviewRow.form_id, created.body.formId);
  assert.equal(reviewRow.blueprint_version_id, reviewBlueprint.versionId);
  assert.equal(reviewRow.owner_user_id, principal.userId);
  assert.equal(reviewRow.manifest.blueprintVersionId, reviewBlueprint.versionId);
  assert.equal(reviewRow.manifest.blueprintHash, reviewBlueprint.contentHash);
  assert.equal(reviewRow.manifest.reuseMode, 'REVIEW_ALLOWED');
  assert.equal(reviewRow.manifest_hash, jsonDigest(reviewRow.manifest));
  assert.equal(Date.parse(created.body.startBefore), reviewRow.start_before_at.getTime());
  assert.equal(reviewRow.started_at, null);
  assert.equal(reviewRow.deadline_at, null);

  const reviewSlots = await fixture.pool.query(`SELECT fs.slot_id,fs.bundle_id,fs.question_id,fs.question_version_id,
      fs.ordinal,fs.public_snapshot,fs.snapshot_hash,secret.key_snapshot,secret.explanation_snapshot,secret.secret_hash
    FROM tsa.form_slots fs JOIN tsa_private.form_slot_secrets secret
      ON secret.form_id=fs.form_id AND secret.slot_id=fs.slot_id
    WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [created.body.formId]);
  assert.equal(reviewSlots.rowCount, 4);
  const expectedPairs = new Set([
    `${firstSlots.rows[0].question_id}:${firstSlots.rows[0].question_version_id}`,
    ...additionalQuestions.map((question) => `${question.questionId}:${question.versionId}`),
  ]);
  assert.deepEqual(new Set(reviewSlots.rows.map((slot) => `${slot.question_id}:${slot.question_version_id}`)), expectedPairs);
  for (const slot of reviewSlots.rows) {
    assert.equal(slot.bundle_id, null);
    assert.match(slot.snapshot_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(slot.secret_hash, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(slot.key_snapshot, { type: 'SINGLE_CHOICE', optionId: 'b' });
  }

  const currentEligibility = await fixture.pool.query(`SELECT q.id,q.eligible_version_id,
      tsa.bank_question_selection_allowed(q.eligible_version_id) AS allowed
    FROM tsa.questions q WHERE q.id=ANY($1::uuid[]) ORDER BY q.id`,
  [reviewSlots.rows.map((slot) => slot.question_id)]);
  assert.equal(currentEligibility.rowCount, 4);
  assert.ok(currentEligibility.rows.every((row) => row.allowed));
  assert.deepEqual(new Set(currentEligibility.rows.map((row) => `${row.id}:${row.eligible_version_id}`)), expectedPairs,
    'the new form pins currently eligible versions rather than older retained snapshots');

  const historyAfterReview = await historyRows(fixture.pool, principal.userId);
  assert.equal(historyAfterReview.length, 7);
  for (const oldRow of historyBeforeReview) {
    assert.deepEqual(historyAfterReview.find((row) => row.question_id === oldRow.question_id), oldRow,
      'first assignment attribution and timestamp remain immutable');
  }
  const previousQuestionIds = new Set(historyBeforeReview.map((row) => row.question_id));
  const newlyAssigned = historyAfterReview.filter((row) => !previousQuestionIds.has(row.question_id));
  assert.equal(newlyAssigned.length, 3);
  assert.ok(newlyAssigned.every((row) => row.first_attempt_id === created.body.attemptId));
  const revisionAfterReview = BigInt((await allocationSnapshot(fixture.pool, principal.userId)).revision);
  assert.ok(revisionAfterReview > firstRevision, 'successful review allocation advances assignment revision');

  const replay = await enabled.create(principal, reviewKey, reviewBody);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.body, created.body);
  await expectError(enabled.create(principal, reviewKey, reviewRequest(firstBlueprint.versionId)),
    409, 'IDEMPOTENCY_CONFLICT');
  const activeConflict = await expectError(enabled.create(principal, key('review-active-precedence'),
    newOnlyRequest(reviewBlueprint.versionId)), 409, 'CONCURRENT_ATTEMPT_EXISTS');
  assert.deepEqual(activeConflict.details, { existingAttemptId: created.body.attemptId });
  assert.deepEqual(await allocationSnapshot(fixture.pool, principal.userId), {
    runs: 2, forms: 2, attempts: 2, history: 7, receipts: 2,
    allocation_audits: 2, jobs: 0, revision: revisionAfterReview.toString(),
  }, 'replay, collision and active-attempt rejection create no additional allocation');

  const started = await enabled.start(principal, created.body.attemptId, key('review-start'), {});
  assert.equal(started.body.attemptId, created.body.attemptId);
  const active = AttemptViewSchema.parse(await enabled.read(principal, created.body.attemptId));
  assert.equal(active.state, 'IN_PROGRESS');
  assert.equal(active.reuseMode, 'REVIEW_ALLOWED');
  assertNoPrivateAttemptData(active);
  const beforeGrade = await getReleasedReview(enabled, principal, created.body.attemptId);
  assert.equal(beforeGrade.status, 409);
  const beforeGradeError = await beforeGrade.json();
  releasedReviewRouteRegistry.releasedResult.responses[409].schema.parse(beforeGradeError);
  assertNoPrivateAttemptData(beforeGradeError);

  for (const slot of reviewSlots.rows) {
    await enabled.save(principal, created.body.attemptId, slot.slot_id, key('review-answer'), {
      expectedRevision: 0,
      value: slot.key_snapshot,
    });
  }
  const submitted = await enabled.submit(principal, created.body.attemptId, key('review-submit'), {});
  assert.equal(submitted.body.state, 'SUBMITTED');
  const workerState = await workerFor(fixture);
  workerPool = workerState.workerPool;
  const grade = await workerState.worker.runOnce();
  assert.equal(grade.status, 'GRADED');
  assert.equal(grade.attemptId, created.body.attemptId);
  const released = await getReleasedReview(enabled, principal, created.body.attemptId);
  assert.equal(released.status, 200);
  assert.equal(released.headers.get('cache-control'), 'no-store');
  const review = AuthorizedReleasedReviewSchema.parse(await released.json());
  assert.equal(review.reuseMode, 'REVIEW_ALLOWED');
  assert.equal(review.correctCount, 4);
  assert.equal(review.totalCount, 4);
  assert.ok(review.items.every((item) => item.earned === 1));
  for (const slot of reviewSlots.rows) {
    const item = review.items.find((candidate) => candidate.slotId === slot.slot_id);
    assert.ok(item);
    assert.deepEqual(item.correctAnswer, slot.key_snapshot);
    assert.deepEqual(item.explanation, slot.explanation_snapshot);
    assert.deepEqual(item.question.content, slot.public_snapshot.content);
  }

  const directory = createStudentDirectoryService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    enableReviewPractice: true,
  });
  const historyPage = await directory.history(principal);
  const historyItem = historyPage.items.find((item) => item.attemptId === created.body.attemptId);
  assert.ok(historyItem);
  assert.equal(historyItem.reuseMode, 'REVIEW_ALLOWED');
  assert.equal(historyItem.state, 'GRADED');

  const beforeFinalShortage = await allocationSnapshot(fixture.pool, principal.userId);
  const finalShortage = await expectError(enabled.create(principal, key('review-still-new-only'),
    newOnlyRequest(reviewBlueprint.versionId)), 422, 'INSUFFICIENT_UNSEEN_INVENTORY');
  assert.deepEqual(finalShortage.details.alternatives, [{
    kind: 'REVIEW_MODE',
    blueprintVersionId: reviewBlueprint.versionId,
    requiresRepeatConsent: true,
  }]);
  assert.deepEqual(await allocationSnapshot(fixture.pool, principal.userId), beforeFinalShortage,
    'NEW_ONLY remains strict after review creation and grading');
});
test('review mode seals every selected current bundle member from its current eligible version pins', async (t) => {
  const fixture = await createBundleFixture({ section: 'MATH', bundleCount: 2 });
  t.after(() => fixture.close());
  const service = attemptService(fixture, true);
  const created = await service.create(fixture.principals.studentA, key('review-complete-bundles'),
    reviewRequest(fixture.blueprint.versionId));
  assert.equal(created.status, 201);
  assert.equal(created.body.reuseMode, 'REVIEW_ALLOWED');
  const rows = await fixture.pool.query(`SELECT fs.bundle_id,fs.question_id,fs.question_version_id,fs.ordinal,
      fs.public_snapshot,fs.snapshot_hash,secret.secret_hash
    FROM tsa.form_slots fs JOIN tsa_private.form_slot_secrets secret
      ON secret.form_id=fs.form_id AND secret.slot_id=fs.slot_id
    WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [created.body.formId]);
  assert.equal(rows.rowCount, 4);
  const expected = new Set(fixture.bundles.flatMap((bundle) => bundle.questions
    .map((question) => `${question.questionId}:${question.versionId}`)));
  assert.deepEqual(new Set(rows.rows.map((row) => `${row.question_id}:${row.question_version_id}`)), expected);
  const selectedBundles = new Map();
  for (const row of rows.rows) {
    const bundle = fixture.bundles.find((item) => item.id === row.bundle_id);
    assert.ok(bundle);
    assert.deepEqual(row.public_snapshot.stimulus, { id: bundle.stimulusId, content: bundle.content });
    assert.match(row.snapshot_hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(row.secret_hash, /^sha256:[0-9a-f]{64}$/);
    selectedBundles.set(row.bundle_id, [...(selectedBundles.get(row.bundle_id) ?? []), row]);
  }
  assert.equal(selectedBundles.size, 2);
  for (const members of selectedBundles.values()) {
    assert.equal(members.length, 2);
    assert.equal(Math.max(...members.map((member) => member.ordinal))
      - Math.min(...members.map((member) => member.ordinal)), 1);
  }
  const current = await fixture.pool.query(`SELECT q.id,q.eligible_version_id,
      tsa.bank_question_selection_allowed(q.eligible_version_id) AS allowed
    FROM tsa.questions q WHERE q.id=ANY($1::uuid[]) ORDER BY q.id`,
  [rows.rows.map((row) => row.question_id)]);
  assert.equal(current.rowCount, 4);
  assert.ok(current.rows.every((row) => row.allowed));
  assert.deepEqual(new Set(current.rows.map((row) => `${row.id}:${row.eligible_version_id}`)), expected);
});

test('review mode rejects currently quarantined or rights-revoked bundles without partial allocation', async (t) => {
  await t.test('a quarantined bundle cannot be replayed from historical stock', async (inner) => {
    const fixture = await createBundleFixture({ section: 'MATH', bundleCount: 2 });
    inner.after(() => fixture.close());
    const target = fixture.bundles[0].questions[0];
    const quarantined = await fixture.workflow.quarantine(fixture.principals.bankManager, target.versionId,
      key('review-quarantine'), {
        expectedRevision: 3,
        reason: 'Synthetic review-practice quarantine boundary fixture.',
      });
    assert.equal(quarantined.body.state, 'QUARANTINED');
    const service = attemptService(fixture, true);
    const before = await allocationSnapshot(fixture.pool, fixture.principals.studentA.userId);
    const error = await expectError(service.create(fixture.principals.studentA, key('review-quarantine-create'),
      reviewRequest(fixture.blueprint.versionId)), 422, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
    assert.deepEqual(error.details.alternatives, []);
    assert.deepEqual(await allocationSnapshot(fixture.pool, fixture.principals.studentA.userId), before);
  });

  await t.test('current source rights remove a bundle from review-eligible stock', async (inner) => {
    const fixture = await createBundleFixture({ section: 'MATH', bundleCount: 2 });
    inner.after(() => fixture.close());
    const sources = await createSourceService({
      bankPool: fixture.bankPool,
      identityService: fixture.identityService,
    });
    await sources.registerRightsDecision(fixture.principals.bankManager,
      fixture.bundles[0].source.sourceVersionId, key('review-rights-revoke'), {
        status: 'REVOKED',
        allowedUses: ['DISPLAY'],
        territory: ['VN'],
        validFrom: '2000-01-01T00:00:00Z',
        validTo: null,
        evidence: 'Synthetic review-practice rights revocation; not a real attestation.',
        expectedRevision: 1,
      });
    const service = attemptService(fixture, true);
    const before = await allocationSnapshot(fixture.pool, fixture.principals.studentA.userId);
    const error = await expectError(service.create(fixture.principals.studentA, key('review-rights-create'),
      reviewRequest(fixture.blueprint.versionId)), 422, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
    assert.deepEqual(error.details.alternatives, []);
    assert.deepEqual(await allocationSnapshot(fixture.pool, fixture.principals.studentA.userId), before);
  });
});

test('SQL requires a JSON boolean repeat acknowledgment for direct REVIEW_ALLOWED commits', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  t.after(() => fixture.close());
  const principal = fixture.principals.studentA;
  const request = reviewRequest(fixture.blueprint.versionId);
  const captured = await captureStandaloneManifest({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    principal,
    blueprintVersionId: fixture.blueprint.versionId,
    reuseMode: 'REVIEW_ALLOWED',
    seed: 7,
    limits: LIMITS,
  });
  assert.equal(captured.manifest.reuseMode, 'REVIEW_ALLOWED');
  assert.equal(captured.result.status, 'SUCCESS');
  const baseline = await allocationSnapshot(fixture.pool, principal.userId);
  const invalidValues = [
    { label: 'missing', omit: true },
    { label: 'null', value: null },
    { label: 'false', value: false },
    { label: 'string true', value: 'true' },
  ];
  for (const invalid of invalidValues) {
    const plan = await buildAllocationPlan(fixture.examPool, principal, captured);
    if (invalid.omit) delete plan.acknowledgeRepeats;
    else plan.acknowledgeRepeats = invalid.value;
    let outcome;
    let failure;
    try {
      outcome = await withTransaction(fixture.examPool, async (client) => {
        await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
        return (await client.query('SELECT tsa.assembly_commit_personal($1,$2,$3::jsonb) AS result', [
          key(`direct-review-${invalid.label.replaceAll(' ', '-')}`), jsonDigest(request), JSON.stringify(plan),
        ])).rows[0].result;
      }, { role: 'tsa_exam' });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, `${invalid.label} consent was accepted by SQL: ${JSON.stringify(outcome)}`);
    assert.equal(failure.code, '22023', `${invalid.label} consent must fail the SQL JSON-boolean guard`);
    assert.deepEqual(await allocationSnapshot(fixture.pool, principal.userId), baseline,
      `${invalid.label} consent leaves no run, form, attempt, history, receipt, audit, job or revision`);
  }
});

test('same-user NEW_ONLY and REVIEW_ALLOWED commits share one H1 lock in both winner orders', { timeout: 60_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  t.after(() => fixture.close());
  const newBlueprint = fixture.blueprint;
  const reviewBlueprint = await fixture.createBlueprint({ count: 4 });
  assert.notEqual(newBlueprint.versionId, reviewBlueprint.versionId);
  const serviceForRace = (pool) => createAttemptService({
    examPool: pool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    enableReviewPractice: true,
  });
  const scenarios = [
    { principal: fixture.principals.studentA, winnerMode: 'NEW_ONLY', winnerKey: key('h1-new-winner'), loserKey: key('h1-review-loser') },
    { principal: fixture.principals.studentB, winnerMode: 'REVIEW_ALLOWED', winnerKey: key('h1-review-winner'), loserKey: key('h1-new-loser') },
  ];
  for (const scenario of scenarios) await t.test(`${scenario.winnerMode} wins`, async () => {
    const barrier = lockWinnerCommit(fixture.examPool, scenario.winnerKey);
    const service = serviceForRace(barrier.pool);
    const newKey = scenario.winnerMode === 'NEW_ONLY' ? scenario.winnerKey : scenario.loserKey;
    const reviewKey = scenario.winnerMode === 'REVIEW_ALLOWED' ? scenario.winnerKey : scenario.loserKey;
    const pending = Promise.allSettled([
      service.create(scenario.principal, newKey, newOnlyRequest(newBlueprint.versionId)),
      service.create(scenario.principal, reviewKey, reviewRequest(reviewBlueprint.versionId)),
    ]);
    let barrierTimer;
    try {
      await Promise.race([barrier.winnerQuery, new Promise((_, reject) => {
        barrierTimer = setTimeout(() => {
          const error = new Error('Review-practice allocation did not reach its winner barrier');
          reject(error); barrier.abort(error);
        }, 7_500);
      })]);
      if (barrier.failure) throw barrier.failure;
      await waitForAllocationLock(fixture.pool);
    } catch (error) {
      barrier.abort(error);
      throw error;
    } finally {
      clearTimeout(barrierTimer); barrier.releaseWinner();
      await pending;
    }
    const [newResult, reviewResult] = await pending;
    const winner = scenario.winnerMode === 'NEW_ONLY' ? newResult : reviewResult;
    const loser = scenario.winnerMode === 'NEW_ONLY' ? reviewResult : newResult;
    assert.equal(winner.status, 'fulfilled');
    assert.equal(winner.value.status, 201);
    assert.equal(winner.value.replayed, false);
    assert.equal(winner.value.body.reuseMode, scenario.winnerMode);
    assert.equal(loser.status, 'rejected');
    assert.equal(loser.reason.status, 409);
    assert.equal(loser.reason.code, 'CONCURRENT_ATTEMPT_EXISTS');
    assert.deepEqual(loser.reason.details, { existingAttemptId: winner.value.body.attemptId });
    assert.deepEqual(await allocationSnapshot(fixture.pool, scenario.principal.userId), {
      runs: 1, forms: 1, attempts: 1, history: 4, receipts: 1,
      allocation_audits: 1, jobs: 0, revision: '1',
    });
    const receipts = await fixture.pool.query(`SELECT idempotency_key,related_attempt_id,safe_response
      FROM tsa.idempotency_records WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts'`,
    [scenario.principal.userId]);
    assert.deepEqual(receipts.rows, [{
      idempotency_key: scenario.winnerKey,
      related_attempt_id: winner.value.body.attemptId,
      safe_response: winner.value.body,
    }]);
  });
});
