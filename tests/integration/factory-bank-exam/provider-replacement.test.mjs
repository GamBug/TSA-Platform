import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import {
  createReadingFactoryFixture, expectedAnswer, publicFieldNamesForbidden,
} from './fixture.mjs';
import { configuredProvider, generateWithProvider } from '../../../tools/question-factory/providers.mjs';
import { generateDryRun } from '../../../tools/question-factory/reading.mjs';

const TEST_TIMEOUT_MS = 300_000;

function jsonValue(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function assertSemanticEqual(actual, expected, message) {
  assert.ok(isDeepStrictEqual(actual, expected), message);
}

function candidateKey(candidate) {
  return `${candidate.itemKey}\u0000${String(candidate.candidateOrdinal).padStart(2, '0')}`;
}

function semanticQuestions(fixture) {
  const stimuli = new Map(fixture.package.references
    .filter((node) => node.kind === 'stimulus')
    .map((node) => [node.id, node.payload.content]));
  return fixture.package.candidates
    .map((candidate) => ({
      key: { passage: candidate.itemKey, candidateOrdinal: candidate.candidateOrdinal },
      passageContent: stimuli.get(candidate.question.stimulusVersionId),
      language: candidate.question.language,
      section: candidate.question.section,
      skillIds: candidate.question.skillIds,
      cognitiveLevel: candidate.question.cognitiveLevel,
      content: candidate.question.content,
      interaction: candidate.question.interaction,
      answerKey: candidate.question.private.answerKey,
      explanation: candidate.question.private.explanation,
    }))
    .sort((left, right) => `${left.key.passage}\u0000${left.key.candidateOrdinal}`
      .localeCompare(`${right.key.passage}\u0000${right.key.candidateOrdinal}`));
}

function providerConfiguration() {
  return {
    schemaVersion: 'reading-command-provider/1',
    executable: process.execPath,
    args: [resolve('tests/ai/provider-command-fixture.mjs')],
    modelRevision: 'TEST_DOUBLE',
    adapterRevision: 'test-double/1',
    execution: 'LOCAL_NO_CHARGE',
    provenance: 'TEST_DOUBLE',
    credentialEnv: null,
    operatorNoChargeAttestation: 'Original local subprocess test double; no network and no charges.',
    budget: {
      maxCalls: 4,
      maxInputTokensPerCall: 10_000,
      maxOutputTokensPerCall: 10_000,
      maxCostMicros: 0,
    },
    timeoutMilliseconds: 5_000,
  };
}

function assertFixtureMetadata(fixture, path) {
  assert.equal(fixture.report.fixture, true);
  assert.equal(fixture.report.liveLlmCalled, false);
  assert.equal(fixture.report.humanReview, 'NOT_PERFORMED');
  assert.equal(fixture.report.publication, 'NOT_PERFORMED');
  assert.equal(fixture.package.candidates.length, 20);
  assert.equal(fixture.importReceipts.length, 20);
  assert.ok(fixture.importReceipts.every((receipt) => receipt.workflowState === 'DRAFT'));
  assert.equal(fixture.sameKeyConflict, 'IMPORT_CONFLICT');
  assertSemanticEqual(fixture.replayedReceipts, fixture.importReceipts,
    `${path} package replay returned original receipts`);

  if (path === 'direct') {
    assert.equal(fixture.report.critic.length, 0);
    assert.ok(fixture.package.candidates.every((candidate) => candidate.run.modelRevision === 'NO_LLM_FIXTURE'
      && candidate.run.usage.inputTokens === 0 && candidate.run.usage.outputTokens === 0
      && candidate.run.usage.costMicros === 0 && candidate.question.generationRunId === null));
    return;
  }

  assert.equal(fixture.report.critic.length, 2);
  assert.ok(fixture.package.candidates.every((candidate) => candidate.run.modelRevision === 'TEST_DOUBLE'
    && candidate.run.providerRunRef === 'test-double-reference'
    && candidate.run.usage.inputTokens === 11 && candidate.run.usage.outputTokens === 22
    && candidate.run.usage.costMicros === 0 && typeof candidate.question.generationRunId === 'string'));
  assert.ok(fixture.report.critic.every((critic) => critic.status === 'MODEL_AGREEMENT_REQUIRES_HUMAN_REVIEW'
    && critic.providerRunRef === 'test-double-reference'
    && critic.usage.inputTokens === 11 && critic.usage.outputTokens === 22 && critic.usage.costMicros === 0));
}

function assertProviderEvidence(tracker) {
  assert.equal(tracker.generationComplete, true);
  assert.equal(tracker.dispatchAttempts, 4, 'the bridge dispatched exactly four generation/critic subprocess calls');
  assert.equal(tracker.checkpoints.length, 12);
  assert.equal(tracker.checkpoints.filter((event) => event.name.endsWith('-reservation')).length, 4);
  assert.equal(tracker.checkpoints.filter((event) => event.name.endsWith('-raw')).length, 4);
  assert.equal(tracker.checkpoints.filter((event) => event.name.endsWith('-result')).length, 4);
  for (const callId of [
    'source-1-generate', 'source-1-verify', 'source-2-generate', 'source-2-verify',
  ]) {
    const reservation = tracker.checkpoints.findIndex((event) => event.name === `${callId}-reservation`);
    const raw = tracker.checkpoints.findIndex((event) => event.name === `${callId}-raw`);
    const result = tracker.checkpoints.findIndex((event) => event.name === `${callId}-result`);
    assert.ok(reservation >= 0 && reservation < raw && raw < result,
      `${callId} captured its raw bytes before its parsed result`);
    const rawEvidence = tracker.checkpoints[raw].value.raw;
    assert.ok(rawEvidence.byteLength > 0);
    assert.match(rawEvidence.bytesHash, /^sha256:[0-9a-f]{64}$/);
  }
}

function assertNoPrivateFields(value) {
  const forbidden = publicFieldNamesForbidden();
  if (Array.isArray(value)) {
    for (const item of value) assertNoPrivateFields(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, 'unreleased private field appeared in the student attempt response');
    assertNoPrivateFields(child);
  }
}

async function waitForGrade(api, attemptId, timeoutMilliseconds = 15_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  do {
    const { attempt } = await api.readAttempt(attemptId);
    if (attempt.state === 'GRADED') return attempt;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  } while (Date.now() < deadline);
  assert.fail('The existing grading worker did not release the synthetic Reading result');
}

async function exercisePublishedJourney(fixture, path) {
  const draftContexts = await fixture.prepareDrafts();
  assert.equal(draftContexts.listed.length, 20);
  assert.ok(draftContexts.contexts.every((context) => context.workflow.state === 'DRAFT'));
  assert.ok(draftContexts.contexts.every((context) => context.preview.status === 'AVAILABLE'));
  assert.ok(draftContexts.contexts.every((context) => context.rightsEvidenceIncluded === false));
  assert.equal(draftContexts.sourceRightsBeforeImport, 0);

  const unapproved = await fixture.proveDraftsUnselectable();
  assertSemanticEqual(unapproved, { error: 'INSUFFICIENT_ELIGIBLE_INVENTORY', forms: 0, attempts: 0, history: 0 },
    `${path} imported drafts stayed unselectable without allocation side effects`);
  assert.equal(fixture.bundles.length, 2);
  assert.ok(fixture.bundles.every((bundle) => bundle.questionVersionIds.length === 10
    && isDeepStrictEqual(bundle.cognitiveQuota, { M1: 4, M2: 3, M3: 3 })));

  const approvals = await fixture.submitReviewAndFixturePublish();
  assert.equal(approvals.length, 20);
  assert.equal(fixture.reviewHandoffReceipts.length, 20);
  assert.ok(fixture.reviewHandoffReceipts.every((receipt) => receipt.state === 'IN_REVIEW'));

  const runtime = await fixture.startStudentRuntime();
  const session = fixture.session();
  const api = session.api();
  await api.loginCandidate('studentA');
  const catalog = await api.loadCatalog();
  assert.equal(catalog.domains.length, 1);
  assertSemanticEqual(
    [catalog.domains[0].domain, catalog.domains[0].questionCount, catalog.domains[0].durationSeconds],
    ['READING', 20, 1800], `${path} published catalog profile matches the Reading fixture`,
  );

  const started = await api.startDemo('READING', fixture.blueprint.versionId);
  const attempt = started.attempt;
  assert.equal(attempt.domain, 'READING');
  assert.equal(attempt.slots.length, 20);
  assert.equal(attempt.durationSeconds, 1800);

  const attemptResponse = await session.fetchImpl(`/api/v1/attempts/${attempt.attemptId}`);
  assert.equal(attemptResponse.status, 200);
  const rawAttempt = await attemptResponse.json();
  assertNoPrivateFields(rawAttempt);
  assert.equal(rawAttempt.slots.length, 20);

  const formRowsResult = await fixture.pool.query(`SELECT fs.slot_id,fs.ordinal,fs.question_version_id,
      fs.public_snapshot,secret.key_snapshot,secret.explanation_snapshot,
      qv.language,qv.section,qv.skill_ids,qv.cognitive_level
    FROM tsa.form_slots fs
    JOIN tsa_private.form_slot_secrets secret USING(form_id,slot_id)
    JOIN tsa.question_versions qv ON qv.id=fs.question_version_id
    WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [rawAttempt.formId]);
  assert.equal(formRowsResult.rowCount, 20);
  const rowsBySlotId = new Map(formRowsResult.rows.map((row) => [row.slot_id, row]));
  const candidatesByQuestionId = new Map(fixture.package.candidates
    .map((candidate) => [candidate.question.id, candidate]));
  const questions = semanticQuestions(fixture);

  for (const row of formRowsResult.rows) {
    const candidate = candidatesByQuestionId.get(row.question_version_id);
    assert.ok(candidate, 'the allocated form references a question from this generated package');
    const expected = questions.find((question) => question.key.passage === candidate.itemKey
      && question.key.candidateOrdinal === candidate.candidateOrdinal);
    assert.ok(expected, 'the imported question has a stable passage/ordinal comparison key');
    const publicSnapshot = jsonValue(row.public_snapshot);
    assertSemanticEqual(publicSnapshot.content, expected.content, 'Bank import preserved question content');
    assertSemanticEqual(publicSnapshot.interaction, expected.interaction, 'Bank import preserved the interaction');
    assertSemanticEqual(publicSnapshot.stimulus.content, expected.passageContent, 'Bank import preserved passage content');
    assert.equal(row.language, expected.language);
    assert.equal(row.section, expected.section);
    assertSemanticEqual(jsonValue(row.skill_ids), expected.skillIds, 'Bank import preserved skill labels');
    assert.equal(row.cognitive_level, expected.cognitiveLevel);
    assertSemanticEqual(jsonValue(row.key_snapshot), expected.answerKey, 'exam sealing preserved the typed answer key');
    assertSemanticEqual(jsonValue(row.explanation_snapshot), expected.explanation, 'exam sealing preserved the explanation');
  }

  const publicSlotsById = new Map(rawAttempt.slots.map((slot) => [slot.slotId, slot]));
  for (const row of formRowsResult.rows) {
    const slot = publicSlotsById.get(row.slot_id);
    const snapshot = jsonValue(row.public_snapshot);
    assert.ok(slot, 'the attempt response contains the allocated slot');
    assertSemanticEqual(slot.content, snapshot.content, 'HTTP attempt content matches its immutable snapshot');
    assertSemanticEqual(slot.interaction, snapshot.interaction, 'HTTP interaction matches its immutable snapshot');
    assertSemanticEqual(slot.stimulus.content, snapshot.stimulus.content, 'HTTP passage content matches its immutable snapshot');
  }

  const creation = session.requests.find((request) => request.method === 'POST'
    && request.pathname === '/api/v1/attempts');
  assert.ok(creation?.idempotencyKey, 'HTTP attempt creation used an idempotency key');
  for (const slot of attempt.slots) {
    const row = rowsBySlotId.get(slot.slotId);
    assert.ok(row, 'each delivered slot maps to a sealed typed key');
    const key = jsonValue(row.key_snapshot);
    const typedAnswer = expectedAnswer({ question: { private: { answerKey: key } } });
    const input = typedAnswer.type === 'TRUE_FALSE_GROUP'
      ? { statementValues: Object.entries(typedAnswer.values).map(([statementId, value]) => ({ statementId, value })) }
      : typedAnswer;
    await api.saveAnswer(attempt.attemptId, slot.slotId, input);
  }

  const reloadedApi = session.api();
  await reloadedApi.loginCandidate('studentA');
  const saved = await reloadedApi.readAttempt(attempt.attemptId);
  assert.equal(saved.attempt.answeredCount, 20);
  await reloadedApi.submitAttempt(attempt.attemptId);
  const graded = await waitForGrade(reloadedApi, attempt.attemptId);
  const score = {
    label: graded.result.label,
    correctCount: graded.result.correctCount,
    totalCount: graded.result.totalCount,
    percentage: graded.result.percentage,
  };
  assertSemanticEqual(score, {
    label: 'KẾT QUẢ LUYỆN TẬP KHÔNG CHÍNH THỨC', correctCount: 20, totalCount: 20, percentage: '100.00',
  }, `${path} journey produced the expected synthetic practice result`);

  const releasedReview = await reloadedApi.readReview(attempt.attemptId);
  assert.equal(releasedReview.review.slots.length, 20);
  const releaseResponse = await session.fetchImpl(`/api/v1/attempts/${attempt.attemptId}/result`);
  assert.equal(releaseResponse.status, 200);
  const result = await releaseResponse.json();
  assert.equal(result.items.length, 20);
  assert.equal(result.scoreLabel, 'UNOFFICIAL_PRACTICE');
  assert.equal(result.percentage, '100.00');

  const releasedBySlot = new Map(result.items.map((item) => [item.slotId, item]));
  const releaseProjection = formRowsResult.rows.map((row) => {
    const candidate = candidatesByQuestionId.get(row.question_version_id);
    const release = releasedBySlot.get(row.slot_id);
    const expected = questions.find((question) => question.key.passage === candidate.itemKey
      && question.key.candidateOrdinal === candidate.candidateOrdinal);
    assert.ok(release, 'the published result releases every allocated question');
    assertSemanticEqual(release.question.content, expected.content, 'released question content matches the package');
    assertSemanticEqual(release.question.interaction, expected.interaction, 'released interaction matches the package');
    assertSemanticEqual(release.question.stimulus.content, expected.passageContent, 'released passage content matches the package');
    return {
      key: expected.key,
      passageContent: release.question.stimulus.content,
      language: row.language,
      section: row.section,
      skillIds: jsonValue(row.skill_ids),
      cognitiveLevel: row.cognitive_level,
      content: release.question.content,
      interaction: release.question.interaction,
      answerKey: release.correctAnswer,
      explanation: release.explanation,
      response: release.response,
      earned: release.earned,
    };
  }).sort((left, right) => candidateKey({ itemKey: left.key.passage, candidateOrdinal: left.key.candidateOrdinal })
    .localeCompare(candidateKey({ itemKey: right.key.passage, candidateOrdinal: right.key.candidateOrdinal })));
  assert.ok(releaseProjection.every((item) => item.earned === 1), 'all twenty correct typed answers earned credit');

  const submissionCount = session.requests.filter((request) => request.method === 'POST'
    && request.pathname === `/api/v1/attempts/${attempt.attemptId}/submit`).length;
  const savedCount = session.requests.filter((request) => request.method === 'PUT'
    && request.pathname.startsWith(`/api/v1/attempts/${attempt.attemptId}/answers/`)).length;
  assert.equal(savedCount, 20);
  assert.equal(submissionCount, 1);
  assert.equal(runtime.syntheticOnly, true);

  return { questions, releaseProjection, score };
}

test('direct and local command-test-double Reading generation retain equal semantics through Bank and exam release', {
  timeout: TEST_TIMEOUT_MS,
}, async (t) => {
  let activeFixture = null;
  const closeActiveFixture = async () => {
    const fixture = activeFixture;
    activeFixture = null;
    if (fixture) await fixture.close();
  };
  t.after(closeActiveFixture);

  try {
    activeFixture = await createReadingFactoryFixture({ generate: generateDryRun });
    assertFixtureMetadata(activeFixture, 'direct');
    const direct = await exercisePublishedJourney(activeFixture, 'direct');
    await closeActiveFixture();

    const tracker = { dispatchAttempts: 0, generationComplete: false, checkpoints: [] };
    const configured = configuredProvider(providerConfiguration());
    const provider = {
      ...configured,
      async call(request, options) {
        tracker.dispatchAttempts += 1;
        if (tracker.generationComplete) throw new Error('Provider dispatch attempted after fixture generation');
        return configured.call(request, options);
      },
    };
    const generateThroughCommand = async (input) => {
      const result = await generateWithProvider(input, provider, {
        checkpoint: async (name, value) => tracker.checkpoints.push({ name, value }),
      });
      tracker.generationComplete = true;
      return result;
    };

    activeFixture = await createReadingFactoryFixture({ generate: generateThroughCommand });
    assertFixtureMetadata(activeFixture, 'command');
    assertProviderEvidence(tracker);
    const command = await exercisePublishedJourney(activeFixture, 'command');
    assertProviderEvidence(tracker);
    await closeActiveFixture();

    assertSemanticEqual(command.questions, direct.questions,
      'controlled direct and command-test-double paths produce the same stable passage/question/key projection');
    assertSemanticEqual(command.releaseProjection, direct.releaseProjection,
      'both paths preserve equivalent questions and released outcomes through the existing exam engine');
    assertSemanticEqual(command.score, direct.score, 'both paths produce the same final score');
    assert.equal(tracker.dispatchAttempts, 4, 'student login and exam operations did not dispatch the provider');
  } finally {
    await closeActiveFixture();
  }
});
