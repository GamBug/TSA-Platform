import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { computeQuestionIdentity } from '../../../packages/contracts/dist/internal.js';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createQuestionService } from '../../../src/modules/bank/questions.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { BankCommandError, jsonDigest } from '../../../src/modules/bank/common.mjs';
import { assertSafeQuestionContent } from '../../../src/modules/bank/content-safety.mjs';
import { loadStaffReviewSnapshot } from '../../../src/modules/bank/review-snapshot.mjs';
import { createManualImportFixture } from './manual-import-fixture.mjs';

let fixture;
let reviewer;

before(async () => {
  fixture = await createManualImportFixture();
  reviewer = await fixture.actor('reviewer');
});

after(async () => {
  await fixture?.close();
});

function isValidationError(error) {
  return error instanceof BankCommandError && error.status === 422 && error.code === 'VALIDATION_ERROR';
}

async function registerSource() {
  const sources = await createSourceService({ bankPool: fixture.bankPool, identityService: fixture.identity });
  const source = (await sources.registerSource(fixture.author.principal, randomUUID(), {
    title: 'Synthetic numeric question source',
    canonicalUri: null,
    origin: 'OWNED',
  })).body;
  const sourceVersion = (await sources.registerSourceVersion(fixture.author.principal, source.sourceId, randomUUID(), {
    contentHash: jsonDigest({ source: source.sourceId, kind: 'numeric-question-test' }),
    evidenceUri: 'manual://numeric-question-test',
    metadata: { purpose: 'synthetic integration fixture' },
  })).body;
  const rights = (await sources.registerRightsDecision(fixture.manager.principal, sourceVersion.sourceVersionId, randomUUID(), {
    status: 'OWNED',
    allowedUses: ['DISPLAY', 'GENERATE'],
    territory: ['VN'],
    validFrom: '2020-01-01T00:00:00Z',
    validTo: null,
    evidence: 'Synthetic integration record; no external rights claim.',
    expectedRevision: 0,
  })).body;
  return { sourceVersionId: sourceVersion.sourceVersionId, decisionId: rights.decisionId };
}

function draftFor(source, schemaVersion, text, overrides = {}) {
  const domain = fixture.taxonomy.nodes.find((node) => node.kind === 'DOMAIN');
  const skill = fixture.taxonomy.nodes.find((node) => node.kind === 'SKILL');
  const interaction = schemaVersion === 'question/2'
    ? { type: 'NUMERIC_RESPONSE', label: 'Answer', format: 'DECIMAL' }
    : {
      type: 'SINGLE_CHOICE',
      options: [
        { id: 'a', content: [{ type: 'text', text: 'First option' }] },
        { id: 'b', content: [{ type: 'text', text: 'Second option' }] },
      ],
    };
  const answerKey = schemaVersion === 'question/2'
    ? { type: 'NUMERIC_RESPONSE', value: '12.34' }
    : { type: 'SINGLE_CHOICE', optionId: 'b' };
  return {
    schemaVersion,
    language: 'vi-VN',
    section: 'READING',
    taxonomyVersionId: fixture.taxonomy.taxonomyVersionId,
    domainId: domain.id,
    skillIds: [skill.id],
    subskillIds: [],
    cognitiveLevel: 'M1',
    targetDifficulty: null,
    content: [{ type: 'text', text }],
    stimulusVersionId: null,
    interaction,
    answerKey,
    explanation: [{ type: 'text', text: 'Synthetic private explanation.' }],
    evidenceRefs: [source.decisionId],
    origin: 'MANUAL',
    provenance: [{ sourceVersionId: source.sourceVersionId, span: null, transformation: 'Synthetic original entry.' }],
    ...overrides,
  };
}

async function assertRouteScope(key, actorId, expected) {
  const result = await fixture.database.pool.query(
    'SELECT route_scope FROM tsa.idempotency_records WHERE actor_id=$1 AND idempotency_key=$2', [actorId, key]);
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].route_scope, expected);
}

test('numeric question v2 is opt-in through Bank creation, revision, listing, and publication gates', async () => {
  const source = await registerSource();
  const v1Questions = await createQuestionService({ bankPool: fixture.bankPool, identityService: fixture.identity });
  const v2Questions = await createQuestionService({
    bankPool: fixture.bankPool,
    identityService: fixture.identity,
    enableNumericQuestions: true,
  });

  const v1Key = randomUUID();
  const v1Question = (await v1Questions.createQuestionDraft(fixture.author.principal, v1Key,
    draftFor(source, 'question/1', `Synthetic v1 ${randomUUID()}`))).body;
  await assertRouteScope(v1Key, fixture.author.principal.userId, 'POST /api/v1/questions');

  const numericDraft = draftFor(source, 'question/2', `Synthetic numeric ${randomUUID()}`);
  await assert.rejects(
    v1Questions.createQuestionDraft(fixture.author.principal, randomUUID(), numericDraft), isValidationError,
  );
  await assert.rejects(
    v2Questions.createQuestionDraft(fixture.author.principal, randomUUID(),
      draftFor(source, 'question/1', `Rejected v1 numeric ${randomUUID()}`, {
        interaction: numericDraft.interaction,
        answerKey: numericDraft.answerKey,
      })),
    isValidationError,
  );
  await assert.rejects(
    v2Questions.createQuestionDraft(fixture.author.principal, randomUUID(),
      draftFor(source, 'question/2', `Rejected mismatched key ${randomUUID()}`, {
        answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' },
      })),
    isValidationError,
  );

  const numericKey = randomUUID();
  const numeric = (await v2Questions.createQuestionDraft(fixture.author.principal, numericKey, numericDraft)).body;
  await assertRouteScope(numericKey, fixture.author.principal.userId, 'POST /api/v2/questions');

  const revisionKey = randomUUID();
  const revision = (await v2Questions.createQuestionDraftVersion(fixture.author.principal, numeric.questionId, revisionKey, {
    parentVersionId: numeric.versionId,
    draft: draftFor(source, 'question/2', `Synthetic numeric revision ${randomUUID()}`),
  })).body;
  await assertRouteScope(revisionKey, fixture.author.principal.userId,
    `POST /api/v2/questions/${numeric.questionId}/versions`);

  const snapshots = await loadStaffReviewSnapshot(fixture.database.pool, fixture.identity,
    fixture.author.principal, revision.versionId, { enableNumericQuestions: true });
  assert.equal(snapshots.verified.question.schemaVersion, 'question/2');
  const questionNode = snapshots.verified.graph.find((node) => node.kind === 'question' && node.id === revision.versionId);
  assert.ok(questionNode);
  const references = snapshots.verified.graph.filter((node) => node !== questionNode);
  const identity = computeQuestionIdentity(snapshots.verified.question, references);
  assert.equal(identity.contentHash, revision.contentHash);
  assert.equal(assertSafeQuestionContent(snapshots.verified.question, references, { numericQuestions: true }), true);
  assert.throws(() => assertSafeQuestionContent(snapshots.verified.question, references), isValidationError);
  const unsafeLabelQuestion = structuredClone(snapshots.verified.question);
  unsafeLabelQuestion.interaction.label = 'javascript:alert(1)';
  assert.throws(() => assertSafeQuestionContent(unsafeLabelQuestion, references, { numericQuestions: true }), isValidationError);

  const versions = await fixture.database.pool.query(
    `SELECT qv.id, qv.parent_version_id, qv.content_hash, qv.schema_version,
            qs.scoring_policy_version, qs.answer_key
       FROM tsa.question_versions qv
       JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id
      WHERE qv.id=ANY($1::uuid[]) ORDER BY qv.version_no`,
    [[numeric.versionId, revision.versionId]]);
  assert.equal(versions.rowCount, 2);
  assert.equal(versions.rows[0].schema_version, 'question/2');
  assert.equal(versions.rows[0].scoring_policy_version, 'practice-binary-v2');
  assert.equal(versions.rows[0].answer_key.value, '12.34');
  assert.equal(versions.rows[0].parent_version_id, null);
  assert.equal(versions.rows[1].parent_version_id, numeric.versionId);
  assert.equal(versions.rows[1].scoring_policy_version, 'practice-binary-v2');
  assert.equal(versions.rows[0].content_hash, numeric.contentHash);

  const v1Page = await v1Questions.listQuestionSummaries(fixture.author.principal,
    new URLSearchParams('section=READING&state=DRAFT&limit=1'));
  assert.deepEqual(v1Page.items.map((item) => item.versionId), [v1Question.versionId]);
  const v2Page = await v2Questions.listQuestionSummaries(fixture.author.principal,
    new URLSearchParams('section=READING&state=DRAFT&limit=100'));
  assert.ok(v2Page.items.some((item) => item.versionId === numeric.versionId));
  assert.ok(v2Page.items.some((item) => item.versionId === revision.versionId));

  const fixtureScopeId = randomUUID();
  await fixture.database.pool.query(`INSERT INTO tsa_private.bank_workflow_fixture_scope
    (scope_id,database_oid,postmaster_started_at)
    SELECT $1,oid,pg_postmaster_start_time() FROM pg_database WHERE datname=current_database()`, [fixtureScopeId]);
  const v1Publication = await createPublicationService({
    bankPool: fixture.bankPool,
    identityService: fixture.identity,
    fixtureScopeId,
  });
  const v2Publication = await createPublicationService({
    bankPool: fixture.bankPool,
    identityService: fixture.identity,
    fixtureScopeId,
    enableNumericQuestions: true,
  });
  await assert.rejects(v1Publication.submitReview(fixture.author.principal, numeric.versionId, randomUUID(), {
    expectedRevision: 1,
  }), isValidationError);

  const submitKey = randomUUID();
  const submitted = await v2Publication.submitReview(fixture.author.principal, numeric.versionId, submitKey, {
    expectedRevision: 1,
  });
  assert.deepEqual(submitted.body, { versionId: numeric.versionId, state: 'IN_REVIEW', revision: 2 });
  await assertRouteScope(submitKey, fixture.author.principal.userId,
    `POST /api/v2/question-versions/${numeric.versionId}/submit-review`);

  const blockedReview = await v1Publication.review(reviewer.principal, numeric.versionId, randomUUID(), {
    expectedRevision: 2,
    contentHash: numeric.contentHash,
    decision: 'REJECT',
    rubric: { correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
    reason: 'This v1 service must not process a question/2 record.',
  }).then(() => null, (error) => error);
  assert.ok(isValidationError(blockedReview));

  const singletonKey = randomUUID();
  const singleton = await v2Publication.confirmSingleton(reviewer.principal, numeric.versionId, singletonKey, {
    expectedRevision: 2,
    contentHash: numeric.contentHash,
    reason: 'Synthetic singleton review for numeric publication test.',
  });
  assert.equal(singleton.body.created, true);
  await assertRouteScope(singletonKey, reviewer.principal.userId,
    `POST /api/v2/question-versions/${numeric.versionId}/confirm-singleton`);

  const reviewKey = randomUUID();
  const approved = await v2Publication.review(reviewer.principal, numeric.versionId, reviewKey, {
    expectedRevision: 2,
    contentHash: numeric.contentHash,
    decision: 'APPROVE',
    rubric: { correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true },
    reason: 'Synthetic isolated integration approval through explicit question/2 gates.',
  });
  assert.equal(approved.body.state, 'APPROVED');
  await assertRouteScope(reviewKey, reviewer.principal.userId,
    `POST /api/v2/question-versions/${numeric.versionId}/reviews`);

  const delivery = await fixture.database.pool.query(
    'SELECT profile FROM tsa_private.question_delivery_checks WHERE question_version_id=$1', [numeric.versionId]);
  assert.equal(delivery.rows[0]?.profile, 'text-math-table-numeric/2');
});
