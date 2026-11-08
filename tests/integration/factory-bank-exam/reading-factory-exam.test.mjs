import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAssemblyManifest, runAssemblyReference } from '../../../packages/contracts/dist/internal.js';
import { createReadingFactoryFixture, expectedAnswer, publicFieldNamesForbidden } from './fixture.mjs';

function assertNoPrivateFields(value) {
  const forbidden = publicFieldNamesForbidden();
  if (Array.isArray(value)) return value.forEach(assertNoPrivateFields);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, `student response exposed private field ${key}`);
    assertNoPrivateFields(child);
  }
}

async function waitForGrade(api, attemptId, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  do {
    const { attempt } = await api.readAttempt(attemptId);
    if (attempt.state === 'GRADED') return attempt;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  assert.fail('The existing grading worker did not release the reading result');
}

test('offline Factory drafts enter the existing Bank gate, form two immutable passage bundles, and complete the opt-in READING20 website journey', {
  timeout: 180_000,
}, async (t) => {
  const fixture = await createReadingFactoryFixture();
  t.after(() => fixture.close());

  assert.equal(fixture.report.fixture, true);
  assert.equal(fixture.report.liveLlmCalled, false);
  assert.equal(fixture.report.humanReview, 'NOT_PERFORMED');
  assert.equal(fixture.report.publication, 'NOT_PERFORMED');
  assert.equal(fixture.report.count, 20);
  assert.equal(fixture.report.durationSeconds, 1800);
  assert.deepEqual(fixture.report.quota, { M1: 8, M2: 6, M3: 6 });
  assert.equal(fixture.package.candidates.length, 20);
  assert.equal(fixture.importReceipts.length, 20);
  assert.ok(fixture.importReceipts.every((receipt) => receipt.workflowState === 'DRAFT'));
  assert.equal(fixture.sameKeyConflict, 'IMPORT_CONFLICT');
  assert.deepEqual(fixture.replayedReceipts, fixture.importReceipts);

  for (const candidate of fixture.package.candidates) {
    assert.equal(candidate.run.modelRevision, 'NO_LLM_FIXTURE');
    assert.equal(candidate.run.usage.inputTokens, 0);
    assert.equal(candidate.run.usage.outputTokens, 0);
    assert.equal(candidate.question.generationRunId, null);
    assert.equal(candidate.question.contentHash, candidate.contentHash);
    const evidence = fixture.package.references.find((node) =>
      node.kind === 'evidence' && node.id === candidate.question.private.evidenceRefs[0]);
    assert.ok(evidence, 'each draft keeps its exact supporting evidence reference');
    const source = fixture.input.sources.find((item) => item.sourceVersionId === evidence.payload.sourceVersionId);
    assert.ok(source);
    assert.equal(source.text.slice(evidence.payload.start, evidence.payload.end), evidence.payload.quote);
    assert.equal(evidence.payload.calibratedDifficulty, false);
  }

  const drafts = await fixture.prepareDrafts();
  assert.equal(drafts.listed.length, 20);
  assert.equal(drafts.contexts.length, 20);
  assert.ok(drafts.contexts.every((context) => context.workflow.state === 'DRAFT'));
  assert.ok(drafts.contexts.every((context) => context.preview.status === 'AVAILABLE'));
  assert.ok(drafts.contexts.every((context) => context.preview.question.answerKey));
  assert.ok(drafts.contexts.every((context) => context.preview.question.explanation.length > 0));
  assert.ok(drafts.contexts.every((context) => context.rightsEvidenceIncluded === false));
  const unapproved = await fixture.proveDraftsUnselectable();
  assert.deepEqual(unapproved, {
    error: 'INSUFFICIENT_ELIGIBLE_INVENTORY',
    forms: 0,
    attempts: 0,
    history: 0,
  });

  const bundles = fixture.bundles;
  assert.equal(bundles.length, 2);
  for (const bundle of bundles) {
    assert.equal(bundle.questionVersionIds.length, 10);
    assert.deepEqual(bundle.cognitiveQuota, { M1: 4, M2: 3, M3: 3 });
  }

  const reviewApprovals = await fixture.submitReviewAndFixturePublish();
  assert.equal(reviewApprovals.length, 20);
  assert.equal(fixture.reviewHandoffReceipts.length, 20);
  assert.ok(fixture.reviewHandoffReceipts.every((receipt) => receipt.state === 'IN_REVIEW'));

  const runtime = await fixture.startStudentRuntime();
  const session = fixture.session();
  let api = session.api();
  await api.loginCandidate('studentA');
  const catalog = await api.loadCatalog();
  assert.equal(catalog.domains.length, 1);
  assert.deepEqual(
    [catalog.domains[0].domain, catalog.domains[0].questionCount, catalog.domains[0].durationSeconds],
    ['READING', 20, 1800],
  );
  const blueprintVersionId = fixture.blueprint.versionId;
  const { attempt } = await api.startDemo('READING', blueprintVersionId);
  assert.equal(attempt.domain, 'READING');
  assert.equal(attempt.slots.length, 20);
  assert.equal(attempt.durationSeconds, 1800);
  const rawAttemptResponse = await session.fetchImpl(`/api/v1/attempts/${attempt.attemptId}`);
  assert.equal(rawAttemptResponse.status, 200);
  const rawAttempt = await rawAttemptResponse.json();
  assertNoPrivateFields(rawAttempt);
  assert.equal(rawAttempt.slots.length, 20);
  assert.deepEqual(rawAttempt.sections.map((section) => [section.section, section.count]), [['READING', 20]]);
  const createRequest = session.requests.find((request) => request.method === 'POST'
    && request.pathname === '/api/v1/attempts');
  assert.ok(createRequest?.idempotencyKey, 'website attempt creation uses an idempotency key');
  const replayResponse = await session.fetchImpl('/api/v1/attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken(),
      'idempotency-key': createRequest.idempotencyKey },
    body: JSON.stringify({ blueprintVersionId }),
  });
  assert.equal(replayResponse.status, 201);
  const replayReceipt = await replayResponse.json();
  assert.deepEqual([replayReceipt.attemptId, replayReceipt.formId], [attempt.attemptId, rawAttempt.formId]);
  const passageGroups = new Map();
  for (const slot of rawAttempt.slots) {
    assert.ok(slot.stimulus?.content?.length);
    const key = slot.stimulus.id;
    passageGroups.set(key, [...(passageGroups.get(key) ?? []), slot]);
  }
  assert.equal(passageGroups.size, 2);
  assert.ok([...passageGroups.values()].every((slots) => slots.length === 10));

  const formRows = await fixture.pool.query(`SELECT fs.slot_id,fs.ordinal,fs.question_version_id,fs.bundle_id,
      bm.ordinal AS bundle_ordinal,qv.cognitive_level,fs.public_snapshot,secret.key_snapshot,stimulus.stimulus_id
    FROM tsa.form_slots fs
    JOIN tsa_private.form_slot_secrets secret USING(form_id,slot_id)
    JOIN tsa.bundles bundle ON bundle.id=fs.bundle_id
    JOIN tsa.bundle_members bm ON bm.bundle_id=fs.bundle_id AND bm.question_version_id=fs.question_version_id
    JOIN tsa.question_versions qv ON qv.id=fs.question_version_id
    JOIN tsa.stimulus_versions stimulus ON stimulus.id=bundle.stimulus_version_id
    WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [rawAttempt.formId]);
  assert.equal(formRows.rowCount, 20);
  const expectedQuestionIds = new Set(fixture.package.candidates.map((candidate) => candidate.question.id));
  assert.deepEqual(new Set(formRows.rows.map((row) => row.question_version_id)), expectedQuestionIds);
  assert.equal(new Set(formRows.rows.map((row) => row.bundle_id)).size, 2);
  for (const bundleId of new Set(formRows.rows.map((row) => row.bundle_id))) {
    const members = formRows.rows.filter((row) => row.bundle_id === bundleId);
    assert.equal(members.length, 10);
    assert.deepEqual(members.map((row) => row.bundle_ordinal), [...Array(10).keys()]);
    assert.deepEqual(Object.fromEntries(['M1', 'M2', 'M3'].map((level) => [level,
      members.filter((row) => row.cognitive_level === level).length])), { M1: 4, M2: 3, M3: 3 });
  }
  for (const row of formRows.rows) {
    assert.equal(row.public_snapshot.stimulus.id, row.stimulus_id);
    assert.ok(row.bundle_id);
  }
  const storedRun = await fixture.pool.query(`SELECT run.seed,run.manifest,run.manifest_hash,
      run.diagnostics->>'slotsHash' AS slots_hash
    FROM tsa.forms form JOIN tsa.assembly_runs run ON run.id=form.assembly_run_id WHERE form.id=$1`, [rawAttempt.formId]);
  assert.equal(storedRun.rowCount, 1);
  const parsedManifest = parseAssemblyManifest(storedRun.rows[0].manifest);
  assert.equal(parsedManifest.manifestHash, storedRun.rows[0].manifest_hash);
  assert.equal(parsedManifest.manifest.seed, Number(storedRun.rows[0].seed));
  const replayedAssembly = runAssemblyReference(parsedManifest.manifest);
  assert.equal(replayedAssembly.status, 'SUCCESS');
  assert.equal(replayedAssembly.slotsHash, storedRun.rows[0].slots_hash);
  assert.deepEqual(new Set(replayedAssembly.slots.map((slot) => slot.questionVersionId)),
    new Set(formRows.rows.map((row) => row.question_version_id)));
  const clockBeforeReload = (await fixture.pool.query(
    'SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attempt.attemptId],
  )).rows[0];
  assert.equal(Date.parse(clockBeforeReload.deadline_at) - Date.parse(clockBeforeReload.started_at), 1_800_000);

  const answerByQuestion = new Map(formRows.rows.map((row) => [row.question_version_id,
    typeof row.key_snapshot === 'string' ? JSON.parse(row.key_snapshot) : row.key_snapshot]));
  for (const slot of attempt.slots) {
    const row = formRows.rows.find((candidate) => candidate.slot_id === slot.slotId);
    assert.ok(row);
    const key = answerByQuestion.get(row.question_version_id);
    const expected = expectedAnswer({ question: { private: { answerKey: key } } });
    const answer = expected.type === 'TRUE_FALSE_GROUP'
      ? { statementValues: Object.entries(expected.values).map(([statementId, value]) => ({ statementId, value })) }
      : expected;
    await api.saveAnswer(attempt.attemptId, slot.slotId, answer);
  }

  const newSessionApi = session.api();
  await newSessionApi.loginCandidate('studentA');
  const resumed = await newSessionApi.readAttempt(attempt.attemptId);
  assert.equal(resumed.attempt.answeredCount, 20);
  assert.deepEqual((await fixture.pool.query(
    'SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attempt.attemptId],
  )).rows[0], clockBeforeReload);
  const prematureReview = await session.fetchImpl(`/api/v1/attempts/${attempt.attemptId}/result`);
  assert.equal(prematureReview.status, 409);
  assertNoPrivateFields(await prematureReview.json());

  await newSessionApi.submitAttempt(attempt.attemptId);
  const graded = await waitForGrade(newSessionApi, attempt.attemptId);
  assert.deepEqual(graded.result, {
    label: 'KẾT QUẢ LUYỆN TẬP KHÔNG CHÍNH THỨC',
    correctCount: 20,
    totalCount: 20,
    percentage: '100.00',
  });
  const released = await newSessionApi.readReview(attempt.attemptId);
  assert.equal(released.review.slots.length, 20);
  assert.ok(released.review.slots.every((slot) => slot.explanation?.length));
  const resultResponse = await session.fetchImpl(`/api/v1/attempts/${attempt.attemptId}/result`);
  assert.equal(resultResponse.status, 200);
  const resultBody = await resultResponse.json();
  assert.equal(resultBody.items.length, 20);
  assert.equal(resultBody.percentage, '100.00');

  await assert.rejects(newSessionApi.startDemo('READING', blueprintVersionId), (error) => {
    assert.equal(error.code, 'INSUFFICIENT_UNSEEN_INVENTORY');
    return true;
  });
  const finalCounts = await fixture.pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.forms) AS forms,
    (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history,
    (SELECT count(*)::int FROM tsa.result_releases) AS releases`);
  assert.deepEqual(finalCounts.rows[0], { forms: 1, attempts: 1, history: 20, releases: 1 });

  const foreign = fixture.session();
  const foreignApi = foreign.api();
  await foreignApi.loginCandidate('studentB');
  const shared = await foreignApi.startDemo('READING', blueprintVersionId);
  assert.equal(shared.attempt.slots.length, 20, 'a different student may reuse the eligible questions');
  assert.deepEqual(new Set(shared.attempt.slots.map((slot) => slot.content[0]?.text)).size, 20);
  assert.notEqual(shared.attempt.attemptId, attempt.attemptId);
  assert.equal(runtime.syntheticOnly, true);
});
