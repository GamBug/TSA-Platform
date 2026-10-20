import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ensureLocalTaxonomy } from '../../../src/local/seed.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createBankHarness, loginActor, bankRequest } from './harness.mjs';

let harness;
let fixtureScopeId;
let service;
let normalService;
let authorBrowser;
let reviewerBrowser;
let managerBrowser;
let candidateBrowser;
let authorReviewerBrowser;
let author;
let reviewer;
let manager;
let candidate;
let authorReviewer;
let taxonomy;

const APPROVE_RUBRIC = Object.freeze({
  correctness: true,
  unambiguous: true,
  relevant: true,
  language: true,
  explanation: true,
  rights: true,
});

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function principal(browser) {
  return harness.identity.authenticate(new Request(harness.origin, {
    headers: { cookie: browser.cookies.join('; ') },
  }));
}

async function success(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

async function registerSource(browser = authorBrowser, { rightsStatus = 'OWNED', validTo = null } = {}) {
  const sourceId = randomUUID();
  const source = await bankRequest(harness, browser, '/api/v1/sources', {
    method: 'POST', key: `publication-source-${randomUUID()}`,
    body: { title: `Synthetic publication source ${sourceId}`, canonicalUri: null, origin: 'OWNED' },
  });
  const sourceReceipt = await success(source, 201);
  const version = await bankRequest(harness, browser, `/api/v1/sources/${sourceReceipt.sourceId}/versions`, {
    method: 'POST', key: `publication-source-version-${randomUUID()}`,
    body: {
      contentHash: sha256(`source:${sourceId}`),
      evidenceUri: 'manual://synthetic-publication-test',
      metadata: { purpose: 'synthetic workflow integration test' },
    },
  });
  const versionReceipt = await success(version, 201);
  const rights = await bankRequest(harness, managerBrowser, `/api/v1/source-versions/${versionReceipt.sourceVersionId}/rights`, {
    method: 'POST', key: `publication-rights-${randomUUID()}`,
    body: {
      status: rightsStatus,
      allowedUses: ['DISPLAY', 'ADAPT', 'GENERATE'],
      territory: ['VN'],
      validFrom: '2000-01-01T00:00:00Z',
      validTo,
      evidence: 'Synthetic test record. This is not a real rights attestation.',
      expectedRevision: 0,
    },
  });
  const rightsReceipt = await success(rights, 201);
  return { ...versionReceipt, decisionId: rightsReceipt.decisionId };
}

function questionDraft(source, text = `Synthetic publication fixture ${randomUUID()}`) {
  return {
    schemaVersion: 'question/1',
    language: 'vi-VN',
    section: 'MATH',
    taxonomyVersionId: taxonomy.taxonomyVersionId,
    domainId: taxonomy.domainId,
    skillIds: [taxonomy.skillId],
    subskillIds: [],
    cognitiveLevel: null,
    targetDifficulty: 'EASY',
    content: [{ type: 'text', text }],
    stimulusVersionId: null,
    interaction: {
      type: 'SINGLE_CHOICE',
      options: [
        { id: 'a', content: [{ type: 'text', text: 'Synthetic option A' }] },
        { id: 'b', content: [{ type: 'text', text: 'Synthetic option B' }] },
      ],
    },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' },
    explanation: [{ type: 'text', text: 'Synthetic private explanation.' }],
    evidenceRefs: [source.decisionId],
    origin: 'MANUAL',
    provenance: [{ sourceVersionId: source.sourceVersionId, span: null, transformation: 'synthetic original entry' }],
  };
}

async function createDraft({ browser = authorBrowser, source, rightsStatus, validTo, text } = {}) {
  const selectedSource = source ?? await registerSource(browser, { rightsStatus, validTo });
  const response = await bankRequest(harness, browser, '/api/v1/questions', {
    method: 'POST', key: `publication-question-${randomUUID()}`,
    body: questionDraft(selectedSource, text),
  });
  return { ...(await success(response, 201)), source: selectedSource };
}

function submitInput(expectedRevision = 1) {
  return { expectedRevision };
}

function reviewInput(question, overrides = {}) {
  return {
    expectedRevision: 2,
    contentHash: question.contentHash,
    decision: 'APPROVE',
    rubric: { ...APPROVE_RUBRIC },
    reason: 'Synthetic independent exact-hash review fixture.',
    ...overrides,
  };
}

async function submit(question, options = {}) {
  const result = await service.submitReview(
    options.principal ?? author, question.versionId,
    options.key ?? `submit-${randomUUID()}`, submitInput(options.expectedRevision ?? 1));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { versionId: question.versionId, state: 'IN_REVIEW', revision: 2 });
  return result;
}

async function confirmSingleton(question, options = {}) {
  return service.confirmSingleton(options.principal ?? reviewer, question.versionId,
    options.key ?? `singleton-${randomUUID()}`, {
      expectedRevision: options.expectedRevision ?? 2,
      contentHash: options.contentHash ?? question.contentHash,
      reason: options.reason ?? 'Synthetic singleton equivalence decision for integration testing.',
    });
}

async function approve(question, options = {}) {
  const result = await service.review(options.principal ?? reviewer, question.versionId,
    options.key ?? `review-${randomUUID()}`, reviewInput(question, options.input ?? {}));
  assert.equal(result.status, 201);
  return result;
}

async function workflowState(versionId) {
  const result = await harness.database.pool.query(
    `SELECT qw.state::text AS state, qw.revision::text AS revision,
            qw.approved_review_id, q.eligible_version_id,
            (SELECT count(*)::int FROM tsa.reviews r WHERE r.question_version_id=qv.id) AS reviews,
            (SELECT count(*)::int FROM tsa.validation_runs v WHERE v.question_version_id=qv.id) AS validations,
            (SELECT count(*)::int FROM tsa.audit_events e
              WHERE e.entity_type='question_version' AND e.entity_id=qv.id::text) AS audit_events,
            (SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1) AS bank_revision
       FROM tsa.question_versions qv
       JOIN tsa.question_workflow qw ON qw.question_version_id=qv.id
       JOIN tsa.questions q ON q.id=qv.question_id
      WHERE qv.id=$1`, [versionId]);
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function assertCommandFailure(promise, status, code) {
  await assert.rejects(promise, (error) => error?.status === status && error?.code === code);
}

async function assertPublicationGateFailure(promise) {
  await assert.rejects(promise, (error) => Number.isInteger(error?.status) && error.status >= 400);
}

async function initializeFixtureScope() {
  const scopeId = randomUUID();
  await harness.database.pool.query(
    `INSERT INTO tsa_private.bank_workflow_fixture_scope
       (scope_id, database_oid, postmaster_started_at)
     SELECT $1, db.oid, pg_postmaster_start_time()
       FROM pg_database db WHERE db.datname=current_database()`, [scopeId]);
  return scopeId;
}

async function waitForBankLockWaits(count) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await harness.database.pool.query(
      `SELECT count(*)::int AS waiting
         FROM pg_stat_activity
        WHERE application_name='tsa-bank-api-test' AND wait_event_type='Lock'`);
    if (result.rows[0].waiting >= count) return result.rows[0].waiting;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${count} bank sessions to observe the bank row lock`);
}

before(async () => {
  harness = await createBankHarness();
  taxonomy = await ensureLocalTaxonomy(harness.database.pool);
  [authorBrowser, reviewerBrowser, managerBrowser, candidateBrowser, authorReviewerBrowser] = await Promise.all([
    loginActor(harness, 'author'),
    loginActor(harness, 'reviewer'),
    loginActor(harness, 'bankManager'),
    loginActor(harness, 'studentA'),
    loginActor(harness, 'authorReviewer'),
  ]);
  [author, reviewer, manager, candidate, authorReviewer] = await Promise.all([
    principal(authorBrowser), principal(reviewerBrowser), principal(managerBrowser),
    principal(candidateBrowser), principal(authorReviewerBrowser),
  ]);
  fixtureScopeId = await initializeFixtureScope();
  service = await createPublicationService({
    bankPool: harness.bankPool, identityService: harness.identity, fixtureScopeId,
  });
  normalService = await createPublicationService({ bankPool: harness.bankPool, identityService: harness.identity });
});

after(async () => { await harness?.close(); });

test('exact independent approval atomically records review, eligibility, audit, and bank revision', async () => {
  const question = await createDraft();
  await submit(question);
  const singleton = await confirmSingleton(question);
  assert.equal(singleton.body.versionId, question.versionId);
  assert.equal(singleton.body.created, true);
  const reaffirmed = await confirmSingleton(question);
  assert.equal(reaffirmed.body.groupId, singleton.body.groupId);
  assert.equal(reaffirmed.body.created, false);

  const before = await workflowState(question.versionId);
  const result = await approve(question);
  assert.deepEqual(Object.keys(result.body).sort(), ['reviewId', 'revision', 'state']);
  assert.equal(result.body.state, 'APPROVED');
  assert.equal(result.body.revision, 3);
  assert.equal(JSON.stringify(result.body).includes('answerKey'), false);
  assert.equal(JSON.stringify(result.body).includes('explanation'), false);

  const afterState = await workflowState(question.versionId);
  assert.equal(afterState.state, 'APPROVED');
  assert.equal(afterState.approved_review_id, result.body.reviewId);
  assert.equal(afterState.eligible_version_id, question.versionId);
  assert.equal(afterState.reviews, 1);
  assert.equal(Number(afterState.validations), 1);
  assert.equal(Number(afterState.audit_events), Number(before.audit_events) + 1);
  assert.equal(Number(afterState.bank_revision), Number(before.bank_revision) + 1);
  const validation = await harness.database.pool.query(
    `SELECT input_hash, validator_version, kind, outcome::text AS outcome, evidence, actor
       FROM tsa.validation_runs WHERE question_version_id=$1`, [question.versionId]);
  assert.deepEqual(validation.rows[0], {
    input_hash: question.contentHash,
    validator_version: 'bank-immutable/1',
    kind: 'BANK_IMMUTABLE',
    outcome: 'PASS',
    evidence: { syntheticWorkflow: true },
    actor: author.userId,
  });
});

test('AUTHOR+REVIEWER self-approval and factory-operator self-review fail closed', async () => {
  const selfAuthored = await createDraft({ browser: authorReviewerBrowser });
  const selfPrincipal = authorReviewer;
  await submit(selfAuthored, { principal: selfPrincipal });
  await assertCommandFailure(service.review(selfPrincipal, selfAuthored.versionId, `self-${randomUUID()}`,
    reviewInput(selfAuthored)), 403, 'FORBIDDEN');
  assert.equal((await workflowState(selfAuthored.versionId)).reviews, 0);

  const operatorAuthored = await createDraft();
  await submit(operatorAuthored);
  const producerNamespace = `workflow-test-${randomUUID()}`;
  const batchKey = randomUUID();
  await harness.database.pool.query(
    `INSERT INTO tsa_private.factory_import_manifests
       (producer_namespace, batch_key, manifest_hash, manifest, received_by)
     VALUES ($1, $2, $3, '{}'::jsonb, $4)`,
    [producerNamespace, batchKey, sha256(batchKey), reviewer.userId]);
  await harness.database.pool.query(
    `INSERT INTO tsa_private.factory_import_receipts
       (producer_namespace, batch_key, item_key, candidate_ordinal, input_hash, question_id, question_version_id)
     VALUES ($1, $2, 'fixture-item', 0, $3, $4, $5)`,
    [producerNamespace, batchKey, operatorAuthored.contentHash,
      operatorAuthored.questionId, operatorAuthored.versionId]);
  await assertCommandFailure(service.review(reviewer, operatorAuthored.versionId, `operator-${randomUUID()}`,
    reviewInput(operatorAuthored)), 403, 'FORBIDDEN');
  assert.equal((await workflowState(operatorAuthored.versionId)).reviews, 0);
});

test('stale revision/hash, changed versions, malformed fields, and forged principals create no review', async () => {
  const first = await createDraft();
  await submit(first);
  const revision = await bankRequest(harness, authorBrowser, `/api/v1/questions/${first.questionId}/versions`, {
    method: 'POST', key: `publication-revision-${randomUUID()}`,
    body: {
      parentVersionId: first.versionId,
      draft: questionDraft(first.source, `Corrected immutable revision ${randomUUID()}`),
    },
  });
  const second = await success(revision, 201);
  assert.equal(second.state, 'DRAFT');
  await assertCommandFailure(service.review(reviewer, first.versionId, `stale-hash-${randomUUID()}`,
    reviewInput(first, { contentHash: second.contentHash })), 409, 'CONTENT_HASH_MISMATCH');
  await assertCommandFailure(service.review(reviewer, first.versionId, `stale-revision-${randomUUID()}`,
    reviewInput(first, { expectedRevision: 1 })), 409, 'REVISION_CONFLICT');
  await assertCommandFailure(service.review(reviewer, first.versionId, `unknown-field-${randomUUID()}`,
    { ...reviewInput(first), hiddenDecision: true }), 422, 'VALIDATION_ERROR');
  const forged = { ...reviewer, userId: randomUUID() };
  await assertCommandFailure(service.review(forged, first.versionId, `forged-${randomUUID()}`,
    reviewInput(first)), 403, 'FORBIDDEN');

  const firstState = await workflowState(first.versionId);
  const secondState = await workflowState(second.versionId);
  assert.equal(firstState.reviews, 0);
  assert.equal(firstState.state, 'IN_REVIEW');
  assert.equal(secondState.state, 'DRAFT');
  assert.equal(secondState.approved_review_id, null);
  assert.equal(secondState.eligible_version_id, null);
});

test('an APPROVE with any false rubric item records no decision', async () => {
  const question = await createDraft();
  await submit(question);
  await confirmSingleton(question);
  await assertCommandFailure(service.review(reviewer, question.versionId, `false-rubric-${randomUUID()}`,
    reviewInput(question, { rubric: { ...APPROVE_RUBRIC, unambiguous: false } })),
  422, 'REVIEW_RUBRIC_INCOMPLETE');
  const state = await workflowState(question.versionId);
  assert.equal(state.state, 'IN_REVIEW');
  assert.equal(state.reviews, 0);
  assert.equal(state.eligible_version_id, null);
});

test('REJECT is append-only, never eligible, and revisions use a new immutable DRAFT', async () => {
  const question = await createDraft();
  await submit(question);
  const rejected = await service.review(reviewer, question.versionId, `reject-${randomUUID()}`,
    reviewInput(question, {
      decision: 'REJECT',
      rubric: { ...APPROVE_RUBRIC, correctness: false },
      reason: 'Synthetic answer-key defect for rejection-path testing.',
    }));
  assert.deepEqual(rejected.body, { reviewId: rejected.body.reviewId, state: 'REJECTED', revision: 3 });
  const state = await workflowState(question.versionId);
  assert.equal(state.state, 'REJECTED');
  assert.equal(state.eligible_version_id, null);
  assert.equal(state.approved_review_id, null);
  assert.equal(state.reviews, 1);

  await assertCommandFailure(service.submitReview(author, question.versionId, `reopen-rejected-${randomUUID()}`,
    submitInput(3)), 409, 'INVALID_WORKFLOW_TRANSITION');
  const revision = await bankRequest(harness, authorBrowser, `/api/v1/questions/${question.questionId}/versions`, {
    method: 'POST', key: `after-rejection-${randomUUID()}`,
    body: {
      parentVersionId: question.versionId,
      draft: questionDraft(question.source, `Corrected after rejection ${randomUUID()}`),
    },
  });
  const revised = await success(revision, 201);
  const oldVersion = await harness.database.pool.query(
    'SELECT content_hash FROM tsa.question_versions WHERE id=$1', [question.versionId]);
  assert.equal(oldVersion.rows[0].content_hash, question.contentHash);
  assert.notEqual(revised.contentHash, question.contentHash);
  assert.equal(revised.state, 'DRAFT');
  assert.equal((await workflowState(revised.versionId)).eligible_version_id, null);
});

test('unknown, expired, and missing current rights block approval without a review row', async () => {
  const unknown = await createDraft({ rightsStatus: 'UNKNOWN' });
  await submit(unknown);
  await confirmSingleton(unknown);
  await assertPublicationGateFailure(approve(unknown));
  assert.equal((await workflowState(unknown.versionId)).reviews, 0);

  const expired = await createDraft({ validTo: '2001-01-02T00:00:00Z' });
  await submit(expired);
  await confirmSingleton(expired);
  await assertPublicationGateFailure(approve(expired));
  assert.equal((await workflowState(expired.versionId)).reviews, 0);

  const missing = await createDraft();
  await submit(missing);
  await confirmSingleton(missing);
  await harness.database.pool.query('DELETE FROM tsa.source_rights WHERE source_version_id=$1', [missing.source.sourceVersionId]);
  await assertPublicationGateFailure(approve(missing));
  assert.equal((await workflowState(missing.versionId)).reviews, 0);
});

test('open duplicate relations block singleton confirmation and absent singleton blocks approval', async () => {
  const question = await createDraft();
  const other = await createDraft();
  await submit(question);
  const left = question.versionId < other.versionId ? question.versionId : other.versionId;
  const right = question.versionId < other.versionId ? other.versionId : question.versionId;
  await harness.database.pool.query(
    `INSERT INTO tsa.duplicate_relations
       (id, left_version_id, right_version_id, kind, evidence, detector_version)
     VALUES ($1, $2, $3, 'NEAR_DUPLICATE', '{}'::jsonb, 'workflow-test/1')`,
    [randomUUID(), left, right]);
  await assertPublicationGateFailure(confirmSingleton(question));
  assert.equal((await harness.database.pool.query(
    'SELECT count(*)::int AS count FROM tsa.duplicate_group_members WHERE question_id=$1',
    [question.questionId])).rows[0].count, 0);

  const clear = await createDraft();
  await submit(clear);
  await assertPublicationGateFailure(approve(clear));
  assert.equal((await workflowState(clear.versionId)).reviews, 0);
});

test('singleton confirmation will not attest an existing multi-identity group', async () => {
  const question = await createDraft();
  const other = await createDraft();
  await submit(question);
  const groupId = randomUUID();
  await harness.database.pool.query(
    `INSERT INTO tsa.duplicate_groups (id, reason, confirmed_by, merged_into_id)
     VALUES ($1, 'Synthetic preexisting multi-identity fixture', $2, NULL)`, [groupId, reviewer.userId]);
  await harness.database.pool.query(
    `INSERT INTO tsa.duplicate_group_members (group_id, question_id)
     VALUES ($1, $2), ($1, $3)`, [groupId, question.questionId, other.questionId]);
  const before = await workflowState(question.versionId);
  await assertCommandFailure(confirmSingleton(question), 422, 'CONSTRAINT_CONFLICT');
  const afterState = await workflowState(question.versionId);
  assert.equal(Number(afterState.audit_events), Number(before.audit_events));
  assert.equal(afterState.state, 'IN_REVIEW');
});

test('a new version cannot inherit prior singleton confirmation from the same identity group', async () => {
  const parent = await createDraft();
  await submit(parent);
  await confirmSingleton(parent);
  await approve(parent);

  const response = await bankRequest(harness, authorBrowser, `/api/v1/questions/${parent.questionId}/versions`, {
    method: 'POST', key: `group-revision-${randomUUID()}`,
    body: {
      parentVersionId: parent.versionId,
      draft: questionDraft(parent.source, `New exact-version singleton review ${randomUUID()}`),
    },
  });
  const revised = await success(response, 201);
  assert.equal(revised.state, 'DRAFT');
  await service.submitReview(author, revised.versionId, `submit-group-revision-${randomUUID()}`, submitInput());
  await assertPublicationGateFailure(approve(revised));
  assert.equal((await workflowState(revised.versionId)).reviews, 0);
  assert.equal((await workflowState(revised.versionId)).eligible_version_id, parent.versionId);

  await confirmSingleton(revised);
  await approve(revised);
  assert.equal((await workflowState(revised.versionId)).eligible_version_id, revised.versionId);
});

test('missing hard-validation evidence and normal runtime cannot approve', async () => {
  const missingValidation = await createDraft();
  await harness.database.pool.query(
    `UPDATE tsa.question_workflow SET state='IN_REVIEW', revision=2
      WHERE question_version_id=$1`, [missingValidation.versionId]);
  await confirmSingleton(missingValidation);
  await assertPublicationGateFailure(approve(missingValidation));
  assert.equal((await workflowState(missingValidation.versionId)).reviews, 0);

  const normalMode = await createDraft();
  await submit(normalMode);
  await confirmSingleton(normalMode);
  await assertPublicationGateFailure(normalService.review(reviewer, normalMode.versionId,
    `normal-mode-${randomUUID()}`, reviewInput(normalMode)));
  const state = await workflowState(normalMode.versionId);
  assert.equal(state.state, 'IN_REVIEW');
  assert.equal(state.reviews, 0);
  assert.equal(state.eligible_version_id, null);
});

test('authorization, strict revision inputs, and manager-only quarantine are enforced', async () => {
  const question = await createDraft();
  await assertCommandFailure(service.submitReview(candidate, question.versionId, `student-submit-${randomUUID()}`,
    submitInput()), 403, 'FORBIDDEN');
  await assertCommandFailure(service.submitReview(author, question.versionId, `extra-field-${randomUUID()}`,
    { expectedRevision: 1, ignoreValidators: true }), 422, 'VALIDATION_ERROR');
  await assertCommandFailure(service.submitReview(author, question.versionId, `bad-revision-${randomUUID()}`,
    { expectedRevision: 0 }), 422, 'VALIDATION_ERROR');
  await assertCommandFailure(service.submitReview(author, randomUUID().toUpperCase(), `bad-uuid-${randomUUID()}`,
    submitInput()), 404, 'NOT_FOUND');
  await assertCommandFailure(service.submitReview(null, question.versionId, `anonymous-${randomUUID()}`,
    submitInput()), 401, 'UNAUTHENTICATED');
  await assertCommandFailure(service.quarantine(author, question.versionId, `author-quarantine-${randomUUID()}`,
    { expectedRevision: 1, reason: 'Synthetic unauthorized quarantine.' }), 403, 'FORBIDDEN');
  await assertCommandFailure(service.quarantine(manager, question.versionId, `empty-reason-${randomUUID()}`,
    { expectedRevision: 1, reason: '   ' }), 422, 'VALIDATION_ERROR');

  const result = await service.quarantine(manager, question.versionId, `manager-quarantine-${randomUUID()}`,
    { expectedRevision: 1, reason: 'Synthetic manager quarantine path.' });
  assert.deepEqual(result.body, { state: 'QUARANTINED', revision: 2 });
  const state = await workflowState(question.versionId);
  assert.equal(state.state, 'QUARANTINED');
  assert.equal(state.eligible_version_id, null);
});

test('quarantine removes eligibility and requires fresh validation before reapproval', async () => {
  const approved = await createDraft();
  await submit(approved);
  await confirmSingleton(approved);
  await approve(approved);
  const approvedState = await workflowState(approved.versionId);
  assert.equal(approvedState.eligible_version_id, approved.versionId);

  const quarantined = await service.quarantine(manager, approved.versionId, `quarantine-approved-${randomUUID()}`,
    { expectedRevision: 3, reason: 'Synthetic withdrawal incident; no delivery forms exist.' });
  assert.deepEqual(quarantined.body, { state: 'QUARANTINED', revision: 4 });
  let state = await workflowState(approved.versionId);
  assert.equal(state.eligible_version_id, null);
  assert.equal(state.approved_review_id, null);
  assert.equal(state.state, 'QUARANTINED');

  const resubmitted = await service.submitReview(author, approved.versionId, `resubmit-${randomUUID()}`, submitInput(4));
  assert.equal(resubmitted.body.state, 'IN_REVIEW');
  assert.equal(resubmitted.body.revision, 5);
  await confirmSingleton(approved, { expectedRevision: 5 });
  const validationRuns = await harness.database.pool.query(
    `SELECT input_hash, validator_version, kind, outcome::text AS outcome, evidence, actor
       FROM tsa.validation_runs WHERE question_version_id=$1 ORDER BY created_at`, [approved.versionId]);
  assert.equal(validationRuns.rowCount, 2);
  assert.ok(validationRuns.rows.every((row) => row.input_hash === approved.contentHash
    && row.validator_version === 'bank-immutable/1' && row.kind === 'BANK_IMMUTABLE' && row.outcome === 'PASS'
    && row.actor === author.userId && JSON.stringify(row.evidence) === '{"syntheticWorkflow":true}'));

  await approve(approved, { input: { expectedRevision: 5 } });
  state = await workflowState(approved.versionId);
  assert.equal(state.state, 'APPROVED');
  assert.equal(state.eligible_version_id, approved.versionId);
  assert.equal(state.reviews, 2);

  const rejected = await createDraft();
  await submit(rejected);
  await service.review(reviewer, rejected.versionId, `terminal-reject-${randomUUID()}`,
    reviewInput(rejected, { decision: 'REJECT' }));
  await assertCommandFailure(service.quarantine(manager, rejected.versionId, `reject-quarantine-${randomUUID()}`,
    { expectedRevision: 3, reason: 'Rejected versions are terminal.' }), 409, 'INVALID_WORKFLOW_TRANSITION');
});

test('idempotent replay creates no duplicate validation, review, or audit and audit rows stay immutable', async () => {
  const question = await createDraft();
  const submitKey = `replay-submit-${randomUUID()}`;
  const firstSubmit = await service.submitReview(author, question.versionId, submitKey, submitInput());
  const replaySubmit = await service.submitReview(author, question.versionId, submitKey, submitInput());
  assert.deepEqual(replaySubmit.body, firstSubmit.body);
  assert.equal(replaySubmit.replayed, true);
  const singletonKey = `replay-singleton-${randomUUID()}`;
  const singletonInput = {
    expectedRevision: 2,
    contentHash: question.contentHash,
    reason: 'Synthetic singleton replay test.',
  };
  const firstSingleton = await service.confirmSingleton(reviewer, question.versionId, singletonKey, singletonInput);
  const replaySingleton = await service.confirmSingleton(reviewer, question.versionId, singletonKey, singletonInput);
  assert.deepEqual(replaySingleton.body, firstSingleton.body);
  assert.equal(replaySingleton.replayed, true);

  const reviewKey = `replay-review-${randomUUID()}`;
  const exactReview = reviewInput(question);
  const firstReview = await service.review(reviewer, question.versionId, reviewKey, exactReview);
  const replayReview = await service.review(reviewer, question.versionId, reviewKey, exactReview);
  assert.deepEqual(replayReview.body, firstReview.body);
  assert.equal(replayReview.replayed, true);
  const state = await workflowState(question.versionId);
  assert.equal(state.validations, 1);
  assert.equal(state.reviews, 1);
  // One creation audit plus submit, singleton confirmation, and approval.
  assert.equal(state.audit_events, 4);

  await harness.database.pool.query(
    `DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='REVIEWER'`, [reviewer.userId]);
  try {
    const revokedPrincipal = await principal(reviewerBrowser);
    assert.equal(revokedPrincipal.roles.includes('REVIEWER'), false);
    await assertCommandFailure(service.review(revokedPrincipal, question.versionId, reviewKey, exactReview),
      403, 'FORBIDDEN');
    await assertCommandFailure(service.confirmSingleton(revokedPrincipal, question.versionId, singletonKey, singletonInput),
      403, 'FORBIDDEN');
  } finally {
    await harness.database.pool.query(
      `INSERT INTO tsa.user_roles (user_id, role) VALUES ($1, 'REVIEWER') ON CONFLICT DO NOTHING`, [reviewer.userId]);
  }
  await assert.rejects(harness.database.pool.query(
    `UPDATE tsa.audit_events SET reason='tampered' WHERE entity_type='question_version' AND entity_id=$1`,
    [question.versionId]), { code: '55000' });
  await assert.rejects(harness.database.pool.query(
    'UPDATE tsa.reviews SET reason=$2 WHERE id=$1', [firstReview.body.reviewId, 'tampered']), { code: '23514' });
});

test('concurrent review/quarantine contend on the bank guard and exactly one expected-revision winner commits', async () => {
  for (const firstCommand of ['review', 'quarantine']) {
    const question = await createDraft();
    await submit(question);
    await confirmSingleton(question);
    const blocker = await harness.database.pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM tsa.bank_state WHERE id=1 FOR UPDATE');

    const start = (command) => command === 'review'
      ? service.review(reviewer, question.versionId, `race-review-${randomUUID()}`, reviewInput(question))
      : service.quarantine(manager, question.versionId, `race-quarantine-${randomUUID()}`,
        { expectedRevision: 2, reason: 'Synthetic concurrent withdrawal.' });
    const secondCommand = firstCommand === 'review' ? 'quarantine' : 'review';
    const firstPromise = start(firstCommand);
    try {
      await waitForBankLockWaits(1);
      const secondPromise = start(secondCommand);
      await waitForBankLockWaits(2);
      await blocker.query('COMMIT');
      const results = await Promise.allSettled([firstPromise, secondPromise]);
      assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
      const failure = results.find((item) => item.status === 'rejected');
      assert.equal(failure.reason.status, 409);
      assert.equal(failure.reason.code, 'REVISION_CONFLICT');
      const state = await workflowState(question.versionId);
      assert.equal(state.state, firstCommand === 'review' ? 'APPROVED' : 'QUARANTINED');
      assert.equal(state.reviews, firstCommand === 'review' ? 1 : 0);
      assert.equal(state.eligible_version_id, firstCommand === 'review' ? question.versionId : null);
    } finally {
      try { await blocker.query('ROLLBACK'); } catch { /* transaction already committed */ }
      blocker.release();
    }
  }
});

test('production process cannot construct the publication service', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(createPublicationService({
      bankPool: harness.bankPool, identityService: harness.identity, fixtureScopeId,
    }), /disabled in production/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
