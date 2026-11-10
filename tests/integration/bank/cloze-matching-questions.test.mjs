import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { computeQuestionIdentity } from '../../../packages/contracts/dist/internal.js';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { assertSafeQuestionContent } from '../../../src/modules/bank/content-safety.mjs';
import { loadStaffReviewSnapshot } from '../../../src/modules/bank/review-snapshot.mjs';
import { createQuestionService } from '../../../src/modules/bank/questions.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { BankCommandError, jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createManualImportFixture } from './manual-import-fixture.mjs';

let fixture;

before(async () => {
  fixture = await createManualImportFixture();
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
    title: 'Synthetic cloze and matching authoring source', canonicalUri: null, origin: 'OWNED',
  })).body;
  const sourceVersion = (await sources.registerSourceVersion(fixture.author.principal, source.sourceId, randomUUID(), {
    contentHash: jsonDigest({ source: source.sourceId, kind: 'cloze-matching-authoring-test' }),
    evidenceUri: 'manual://cloze-matching-authoring-test', metadata: { purpose: 'synthetic integration fixture' },
  })).body;
  const rights = (await sources.registerRightsDecision(fixture.manager.principal, sourceVersion.sourceVersionId, randomUUID(), {
    status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2020-01-01T00:00:00Z',
    validTo: null, evidence: 'Synthetic integration record; no external rights claim.', expectedRevision: 0,
  })).body;
  return { sourceVersionId: sourceVersion.sourceVersionId, decisionId: rights.decisionId };
}

function draftFor(source, type, text = `Câu hỏi tổng hợp ${randomUUID()}`, overrides = {}) {
  const domain = fixture.taxonomy.nodes.find((node) => node.kind === 'DOMAIN');
  const skill = fixture.taxonomy.nodes.find((node) => node.kind === 'SKILL');
  const cloze = type === 'CLOZE';
  const matching = type === 'MATCHING';
  const interaction = cloze ? {
    type: 'CLOZE', fields: [{ id: 'blank-a', label: 'Đáp án thứ nhất' }], maxLength: 64,
    normalization: { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' },
  } : matching ? {
    type: 'MATCHING', rows: [{ id: 'row-a', label: 'Hàng thứ nhất' }],
    targets: [{ id: 'target-a', label: 'Đáp án thứ nhất', maxUses: 1 }],
  } : {
    type: 'SINGLE_CHOICE', options: [
      { id: 'a', content: [{ type: 'text', text: 'Lựa chọn thứ nhất' }] },
      { id: 'b', content: [{ type: 'text', text: 'Lựa chọn thứ hai' }] },
    ],
  };
  const answerKey = cloze ? { type: 'CLOZE', acceptedValues: { 'blank-a': ['café'] } }
    : matching ? { type: 'MATCHING', answers: { 'row-a': 'target-a' } }
      : { type: 'SINGLE_CHOICE', optionId: 'b' };
  return {
    schemaVersion: type === 'question/1' ? 'question/1' : 'question/3',
    language: 'vi-VN', section: 'READING', taxonomyVersionId: fixture.taxonomy.taxonomyVersionId,
    domainId: domain.id, skillIds: [skill.id], subskillIds: [], cognitiveLevel: 'M1', targetDifficulty: null,
    content: [{ type: 'text', text }], stimulusVersionId: null, interaction, answerKey,
    explanation: [{ type: 'text', text: 'Synthetic private explanation.' }], evidenceRefs: [source.decisionId],
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

test('question/3 authoring, parent versions, protocol isolation, and delivery checks are explicit', { timeout: 60_000 }, async () => {
  const source = await registerSource();
  const v1Questions = await createQuestionService({ bankPool: fixture.bankPool, identityService: fixture.identity });
  const v2Questions = await createQuestionService({
    bankPool: fixture.bankPool, identityService: fixture.identity, enableNumericQuestions: true,
  });
  const v4Questions = await createQuestionService({
    bankPool: fixture.bankPool, identityService: fixture.identity, enableClozeMatching: true,
  });

  const legacyThroughV2 = (await v2Questions.createQuestionDraft(fixture.author.principal, randomUUID(),
    draftFor(source, 'question/1', `Legacy through v2 ${randomUUID()}`))).body;
  const v2Key = randomUUID();
  const rejectedQ3 = draftFor(source, 'CLOZE');
  await assert.rejects(v1Questions.createQuestionDraft(fixture.author.principal, randomUUID(), rejectedQ3), isValidationError);
  await assert.rejects(v2Questions.createQuestionDraft(fixture.author.principal, randomUUID(), rejectedQ3), isValidationError);
  await assert.rejects(v4Questions.createQuestionDraft(fixture.author.principal, randomUUID(), {
    ...rejectedQ3, schemaVersion: 'question/2', interaction: { type: 'NUMERIC_RESPONSE', label: 'Answer', format: 'DECIMAL' },
    answerKey: { type: 'NUMERIC_RESPONSE', value: '1' },
  }), isValidationError);
  await assert.rejects(v4Questions.createQuestionDraft(fixture.author.principal, randomUUID(),
    draftFor(source, 'CLOZE', undefined, { answerKey: { type: 'CLOZE', acceptedValues: { other: ['café'] } } })), isValidationError);

  const q3Key = randomUUID();
  const clozeDraft = draftFor(source, 'CLOZE');
  const cloze = (await v4Questions.createQuestionDraft(fixture.author.principal, q3Key, clozeDraft)).body;
  assert.deepEqual((await v4Questions.createQuestionDraft(fixture.author.principal, q3Key, clozeDraft)).body, cloze);
  await assertRouteScope(q3Key, fixture.author.principal.userId, 'POST /api/v4/questions');
  await assert.rejects(v4Questions.createQuestionDraft(fixture.author.principal, q3Key,
    draftFor(source, 'CLOZE', `Changed retry ${randomUUID()}`)), (error) => error.status === 409);

  const matchingDraft = draftFor(source, 'MATCHING');
  const matching = (await v4Questions.createQuestionDraft(fixture.author.principal, randomUUID(), matchingDraft)).body;
  await assert.rejects(v4Questions.createQuestionDraft(fixture.author.principal, randomUUID(),
    draftFor(source, 'MATCHING', undefined, { answerKey: { type: 'MATCHING', answers: { 'unknown-row': 'target-a' } } })), isValidationError);
  const revisionKey = randomUUID();
  const revision = (await v4Questions.createQuestionDraftVersion(fixture.author.principal, cloze.questionId, revisionKey, {
    parentVersionId: cloze.versionId,
    draft: draftFor(source, 'CLOZE', `Cloze revision ${randomUUID()}`),
  })).body;
  assert.notEqual(revision.versionId, cloze.versionId);
  await assertRouteScope(revisionKey, fixture.author.principal.userId,
    `POST /api/v4/questions/${cloze.questionId}/versions`);

  const q3Rows = await fixture.database.pool.query(`SELECT id,question_id,parent_version_id,schema_version,content_hash,
      normalized_fingerprint,reference_namespace FROM tsa.question_versions WHERE id=ANY($1::uuid[]) ORDER BY id`,
    [[cloze.versionId, matching.versionId, revision.versionId]]);
  assert.equal(q3Rows.rowCount, 3);
  assert.ok(q3Rows.rows.every((row) => row.schema_version === 'question/3' && row.reference_namespace.startsWith('question/3/')));
  const revisionRow = q3Rows.rows.find((row) => row.id === revision.versionId);
  assert.equal(revisionRow.parent_version_id, cloze.versionId);
  const clozeSecrets = await fixture.database.pool.query(
    'SELECT answer_key,scoring_policy_version FROM tsa_private.question_secrets WHERE question_version_id=$1', [cloze.versionId]);
  assert.deepEqual(clozeSecrets.rows[0].answer_key, clozeDraft.answerKey);
  assert.equal(clozeSecrets.rows[0].scoring_policy_version, 'practice-binary-v3');

  const v1Page = await v1Questions.listQuestionSummaries(fixture.author.principal, new URLSearchParams('limit=100'));
  assert.ok(v1Page.items.every((item) => item.versionId !== cloze.versionId && item.versionId !== matching.versionId));
  const v2Page = await v2Questions.listQuestionSummaries(fixture.author.principal, new URLSearchParams('limit=100'));
  assert.ok(v2Page.items.some((item) => item.versionId === legacyThroughV2.versionId));
  assert.ok(v2Page.items.every((item) => ![cloze.versionId, matching.versionId, revision.versionId].includes(item.versionId)));
  const v4Page = await v4Questions.listQuestionSummaries(fixture.author.principal, new URLSearchParams('limit=100'));
  assert.deepEqual(new Set(v4Page.items.map((item) => item.versionId)), new Set([cloze.versionId, matching.versionId, revision.versionId]));
  assert.doesNotMatch(JSON.stringify(v4Page), /acceptedValues|answers|café|explanation/);

  for (const versionId of [cloze.versionId, matching.versionId]) {
    const snapshot = await loadStaffReviewSnapshot(fixture.database.pool, fixture.identity, fixture.author.principal, versionId,
      { enableClozeMatching: true });
    const questionNode = snapshot.verified.graph.find((node) => node.kind === 'question' && node.id === versionId);
    const references = snapshot.verified.graph.filter((node) => node !== questionNode);
    assert.equal(computeQuestionIdentity(snapshot.verified.question, references).contentHash, snapshot.target.content_hash);
    assert.equal(assertSafeQuestionContent(snapshot.verified.question, references, { clozeMatching: true }), true);
    assert.throws(() => assertSafeQuestionContent(snapshot.verified.question, references), isValidationError);
    const unsafe = structuredClone(snapshot.verified.question);
    if (unsafe.interaction.type === 'CLOZE') unsafe.interaction.fields[0].label = '<script>alert(1)</script>';
    else unsafe.interaction.targets[0].label = '<script>alert(1)</script>';
    assert.throws(() => assertSafeQuestionContent(unsafe, references, { clozeMatching: true }), isValidationError);
  }

  const publication = await createPublicationService({ bankPool: fixture.bankPool, identityService: fixture.identity,
    enableClozeMatching: true });
  for (const versionId of [cloze.versionId, matching.versionId]) {
    await publication.submitReview(fixture.author.principal, versionId, randomUUID(), { expectedRevision: 1 });
    const delivery = await fixture.database.pool.query(
      'SELECT profile FROM tsa_private.question_delivery_checks WHERE question_version_id=$1', [versionId]);
    assert.equal(delivery.rows[0]?.profile, 'text-math-table-cloze-matching/4');
  }
});
