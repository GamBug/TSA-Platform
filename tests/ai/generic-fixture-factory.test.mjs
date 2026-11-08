import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFactoryPackageV2 } from '../../packages/contracts/dist/internal.js';
import { exportGenericFixturePackage } from '../../tools/question-factory/generic-fixture.mjs';
import { makeGenericFixtureInput, rehashFixtureReferences } from './fixtures/generic-generation.mjs';

test('generic fixture composition exports deterministic canonical Factory2 for all nine domain/type combinations', async () => {
  for (const section of ['MATH', 'READING', 'SCIENCE']) for (const interactionType of ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP']) {
    const input = makeGenericFixtureInput({ section, interactionType });
    const before = structuredClone(input);
    const first = await exportGenericFixturePackage(input), second = await exportGenericFixturePackage(input);
    assert.deepEqual(first.packageBytes, second.packageBytes);
    assert.deepEqual(input, before);
    assert.deepEqual(parseFactoryPackageV2(JSON.parse(first.packageBytes)), first.package);
    assert.equal(first.package.candidates[0].question.section, section);
    assert.equal(first.report.liveLlmCalled, false);
    assert.equal(first.report.humanReview, 'NOT_PERFORMED');
    assert.equal(first.report.publication, 'NOT_PERFORMED');
    assert.deepEqual(first.package.candidates[0].run.usage, { inputTokens: 0, outputTokens: 0, costMicros: 0 });
    assert.ok(first.package.candidates[0].validations.every((v) => !/ANSWER|HUMAN|RIGHTS/.test(v.validatorKind)));
  }
});

test('multiple requests compose one package and shared Reading stimulus remains a whole unit', async () => {
  const inputs = ['MATH', 'READING', 'SCIENCE'].map((section) => makeGenericFixtureInput({ section }));
  const combined = { context: inputs[0].context, calls: inputs.flatMap((input) => input.calls) };
  assert.equal((await exportGenericFixturePackage(combined)).package.candidates.length, 3);
  const input = makeGenericFixtureInput({ section: 'READING', count: 2, withStimulus: true });
  const output = await exportGenericFixturePackage(input);
  assert.equal(new Set(output.package.candidates.map((c) => c.question.stimulusVersionId)).size, 1);
  assert.deepEqual(output.package.candidates.map((c) => c.candidateOrdinal), [0, 1]);
  input.calls[0].fixtureResult.candidates[1].private.answerKey.optionId = 'missing';
  await assert.rejects(exportGenericFixturePackage(input), /^Error: INVALID_GENERIC_FIXTURE$/);
});

test('mismatched source/bindings, altered reference hashes and rights evidence never produce export bytes', async () => {
  const changes = [
    (i) => { i.calls[0].approvedSourcePayload.sources[0].title = 'different'; },
    (i) => { i.calls[0].fixtureResult.candidates[0].createdBy = 'forged'; },
    (i) => { i.calls[0].bindings[0].questionId = i.calls[0].bindings[0].questionVersionId; },
    (i) => { i.context.references.find((r) => r.kind === 'source').payload.title = 'altered'; },
    (i) => { i.context.rightsEvidence[0].allowedUses = ['DISPLAY']; },
    (i) => { i.context.rightsEvidence[0].evidence = 'altered'; },
    (i) => { i.context.references.pop(); },
    (i) => { i.calls[0].request.section = 'SCIENCE'; },
  ];
  for (const change of changes) {
    const input = makeGenericFixtureInput(); change(input);
    await assert.rejects(exportGenericFixturePackage(input), /^Error: INVALID_GENERIC_FIXTURE$/);
  }
});

test('unsafe content and cyclic dependencies are rejected by the original supported profile', async () => {
  for (const text of ['<script>private-secret</script>', '\\href{https://example.invalid}{bad}']) {
    const input = makeGenericFixtureInput();
    input.calls[0].fixtureResult.candidates[0].content = [{ type: text.startsWith('<') ? 'text' : 'math', ...(text.startsWith('<') ? { text } : { tex: text }) }];
    await assert.rejects(exportGenericFixturePackage(input), (error) => error.message === 'INVALID_GENERIC_FIXTURE' && !error.message.includes('private-secret'));
  }
  const input = makeGenericFixtureInput();
  input.context.references[0].references = [{ kind: input.context.references[0].kind, id: input.context.references[0].id }];
  await assert.rejects(exportGenericFixturePackage(input), /^Error: INVALID_GENERIC_FIXTURE$/);
  const image = makeGenericFixtureInput();
  image.calls[0].fixtureResult.candidates[0].content = [{ type: 'image', assetVersionId: '55555555-5555-4555-8555-555555555555', alt: 'Uninspected fixture' }];
  await assert.rejects(exportGenericFixturePackage(image), /^Error: INVALID_GENERIC_FIXTURE$/);
});

test('unknown cost, incomplete output, duplicate content and over-100 packages fail closed', async () => {
  for (const mutate of [
    (i) => { i.calls[0].fixtureResult.usage.costMicros = null; },
    (i) => { i.calls[0].fixtureResult.finishReason = 'TRUNCATED'; },
    (i) => { i.calls[0].fixtureResult.candidates[1].content = i.calls[0].fixtureResult.candidates[0].content; },
  ]) {
    const input = makeGenericFixtureInput({ count: 2 }); mutate(input);
    await assert.rejects(exportGenericFixturePackage(input), /^Error: INVALID_GENERIC_FIXTURE$/);
  }
  const hundred = makeGenericFixtureInput({ count: 100 });
  assert.equal((await exportGenericFixturePackage(hundred)).package.candidates.length, 100);
  const extra = makeGenericFixtureInput({ section: 'SCIENCE' });
  await assert.rejects(exportGenericFixturePackage({ context: hundred.context, calls: [...hundred.calls, ...extra.calls] }), /^Error: INVALID_GENERIC_FIXTURE$/);
});

test('accessor and prototype-active inputs are not evaluated', async () => {
  const input = makeGenericFixtureInput(); let invoked = false;
  Object.defineProperty(input.context, 'operatorId', { enumerable: true, get() { invoked = true; throw new Error('private'); } });
  await assert.rejects(exportGenericFixturePackage(input), /^Error: INVALID_GENERIC_FIXTURE$/);
  assert.equal(invoked, false);
  const clean = makeGenericFixtureInput();
  clean.context.references[0].payload.bad = new Proxy({}, { getPrototypeOf() { invoked = true; throw new Error('private'); } });
  await assert.rejects(exportGenericFixturePackage(clean), /^Error: INVALID_GENERIC_FIXTURE$/);
  assert.equal(invoked, false);
});
