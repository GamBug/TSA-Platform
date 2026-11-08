import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderErrorSchema } from '../../packages/contracts/dist/internal.js';
import { createFakeGenerationAdapter } from '../../src/modules/generation/fake-adapter.mjs';

const sections = ['MATH', 'READING', 'SCIENCE'];
const interactionTypes = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'];

function request(overrides = {}) {
  return {
    specificationVersion: 'generation/1',
    requestId: 'fixture-request-1',
    sourceVersionIds: ['fixture-source-version-1'],
    taxonomyVersionId: 'fixture-taxonomy-1',
    section: 'MATH',
    skillIds: ['fixture-skill-1'],
    interactionType: 'SINGLE_CHOICE',
    cognitiveLevel: null,
    language: 'vi-VN',
    count: 1,
    promptTemplateVersion: 'fixture-prompt/1',
    outputSchemaVersion: 'question/1',
    seed: 7,
    budget: { maxInputTokens: 100, maxOutputTokens: 100, maxCostMicros: 0 },
    ...overrides,
  };
}

function candidate(id = 'fixture-candidate-1') {
  return {
    id,
    opaqueDraft: { content: 'untrusted fixture candidate', nested: { marker: 'original' } },
  };
}

function result(req, candidates = Array.from({ length: req.count }, (_, index) => candidate(`candidate-${index + 1}`)), finishReason = 'COMPLETE') {
  return {
    candidates,
    providerRunRef: null,
    modelRevision: 'fixture/fake-generation-adapter/1',
    usage: { inputTokens: 0, outputTokens: 0, costMicros: 0 },
    finishReason,
  };
}

function fixtureCase(req = request(), payload = { source: { text: 'fixture source' } }, outcome = result(req)) {
  return { request: req, approvedSourcePayload: payload, resultOrError: outcome };
}

test('serves fixture results for all contract sections and interaction types with explicit zero-spend fixture provenance', async () => {
  const cases = [];
  for (const section of sections) {
    for (const interactionType of interactionTypes) {
      const req = request({ section, interactionType, requestId: `${section}-${interactionType}` });
      const payload = { source: { section, text: 'synthetic approved payload' } };
      cases.push(fixtureCase(req, payload, result(req, [candidate(`${section}-${interactionType}`)])));
    }
  }

  const adapter = createFakeGenerationAdapter(cases);
  const capabilities = adapter.capabilities();
  assert.deepEqual(capabilities.sections, sections);
  assert.deepEqual(capabilities.interactionTypes, interactionTypes);
  assert.deepEqual(capabilities.outputSchemas, ['question/1']);
  assert.equal(capabilities.providerFree, true);

  for (const item of cases) {
    const actual = await adapter.generate(item.request, item.approvedSourcePayload);
    assert.equal(actual.modelRevision, 'fixture/fake-generation-adapter/1');
    assert.equal(actual.providerRunRef, null);
    assert.deepEqual(actual.usage, { inputTokens: 0, outputTokens: 0, costMicros: 0 });
    assert.equal(actual.finishReason, 'COMPLETE');
    assert.deepEqual(actual.candidates, item.resultOrError.candidates);
    assert.equal(Object.hasOwn(actual.candidates[0], 'workflowState'), false);
    assert.equal(Object.hasOwn(actual.candidates[0], 'bankVersionId'), false);
  }
});

test('matches exact request and approved payload independent of object property order, preserving array order', async () => {
  const req = request({ budget: { maxInputTokens: 90, maxOutputTokens: 80, maxCostMicros: 0 } });
  const payload = { nested: { first: 'one', second: 'two' }, sourceIds: ['a', 'b'] };
  const adapter = createFakeGenerationAdapter([fixtureCase(req, payload, result(req))]);
  const reorderedRequest = {
    budget: { maxCostMicros: 0, maxOutputTokens: 80, maxInputTokens: 90 },
    seed: 7,
    outputSchemaVersion: 'question/1',
    promptTemplateVersion: 'fixture-prompt/1',
    count: 1,
    language: 'vi-VN',
    cognitiveLevel: null,
    interactionType: 'SINGLE_CHOICE',
    skillIds: ['fixture-skill-1'],
    section: 'MATH',
    taxonomyVersionId: 'fixture-taxonomy-1',
    sourceVersionIds: ['fixture-source-version-1'],
    requestId: 'fixture-request-1',
    specificationVersion: 'generation/1',
  };
  const reorderedPayload = { sourceIds: ['a', 'b'], nested: { second: 'two', first: 'one' } };

  assert.equal((await adapter.generate(reorderedRequest, reorderedPayload)).finishReason, 'COMPLETE');
  assert.deepEqual(await adapter.generate(req, { ...payload, sourceIds: ['b', 'a'] }), {
    code: 'UNAVAILABLE', retryable: false,
  });
  assert.deepEqual(await adapter.generate(request({ requestId: 'different-request' }), payload), {
    code: 'UNAVAILABLE', retryable: false,
  });
});

test('snapshots fixtures and returns independent result copies that cannot change later calls', async () => {
  const req = request();
  const payload = { source: { text: 'original source' } };
  const draft = candidate();
  const inputCase = fixtureCase(req, payload, result(req, [draft]));
  const adapter = createFakeGenerationAdapter([inputCase]);

  req.requestId = 'mutated-after-construction';
  payload.source.text = 'mutated after construction';
  draft.opaqueDraft.nested.marker = 'mutated after construction';

  const originalRequest = request();
  const originalPayload = { source: { text: 'original source' } };
  const first = await adapter.generate(originalRequest, originalPayload);
  assert.equal(first.candidates[0].opaqueDraft.nested.marker, 'original');
  assert.notStrictEqual(first.candidates, inputCase.resultOrError.candidates);
  first.candidates[0].opaqueDraft.nested.marker = 'caller mutation';
  first.candidates.push({ id: 'caller-only' });

  const second = await adapter.generate(originalRequest, originalPayload);
  assert.equal(second.candidates.length, 1);
  assert.equal(second.candidates[0].opaqueDraft.nested.marker, 'original');

  const firstCapabilities = adapter.capabilities();
  firstCapabilities.sections.push('CALLER_ONLY');
  assert.deepEqual(adapter.capabilities().sections, sections);
});

test('passes through all six frozen provider error codes and retryability without extra fields', async () => {
  const codes = ['RATE_LIMIT', 'TIMEOUT', 'REFUSAL', 'UNAVAILABLE', 'INVALID_OUTPUT', 'BUDGET_EXCEEDED'];
  const cases = codes.map((code, index) => {
    const req = request({ requestId: `error-${code}` });
    return fixtureCase(req, { case: index }, { code, retryable: index % 2 === 0 });
  });
  const adapter = createFakeGenerationAdapter(cases);

  for (const [index, item] of cases.entries()) {
    const actual = await adapter.generate(item.request, item.approvedSourcePayload);
    assert.deepEqual(actual, { code: codes[index], retryable: index % 2 === 0 });
  }
});

test('returns safe unavailable and invalid-output errors without reflecting private request or payload values', async () => {
  const privateMarker = 'fixture-private-marker-do-not-reflect';
  const adapter = createFakeGenerationAdapter([]);
  const req = request({ requestId: privateMarker, unknownPrivateField: privateMarker });
  const invalidRequest = await adapter.generate(req, { privateSource: privateMarker });
  assert.deepEqual(invalidRequest, { code: 'INVALID_OUTPUT', retryable: false });
  assert.equal(JSON.stringify(invalidRequest).includes(privateMarker), false);

  const unavailable = await adapter.generate(request({ requestId: privateMarker }), { privateSource: privateMarker });
  assert.deepEqual(unavailable, { code: 'UNAVAILABLE', retryable: false });
  assert.equal(JSON.stringify(unavailable).includes(privateMarker), false);

  const payloadWithGetter = {};
  let getterCalls = 0;
  Object.defineProperty(payloadWithGetter, 'secret', {
    enumerable: true,
    get() { getterCalls += 1; return privateMarker; },
  });
  assert.deepEqual(await adapter.generate(request(), payloadWithGetter), {
    code: 'INVALID_OUTPUT', retryable: false,
  });
  assert.equal(getterCalls, 0);
});

test('rejects malformed cases, getter-bearing output, unsafe JSON and ambiguous duplicate matches', () => {
  const req = request();
  const payload = { source: 'same' };
  const privateMarker = 'fixture-secret-output-marker';
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(req, payload, { code: 'TIMEOUT', retryable: true, vendorError: privateMarker }),
  ]), (error) => error instanceof TypeError && !error.message.includes(privateMarker));

  const externalProviderMetadata = result(req);
  externalProviderMetadata.modelRevision = 'unapproved-provider/model';
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(req, payload, externalProviderMetadata),
  ]), TypeError);
  const nonzeroFakeUsage = result(req);
  nonzeroFakeUsage.usage.costMicros = 1;
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(req, payload, nonzeroFakeUsage),
  ]), TypeError);
  const unknownFakeUsage = result(req);
  unknownFakeUsage.usage.costMicros = null;
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(req, payload, unknownFakeUsage),
  ]), TypeError);
  const fakeRunReference = result(req);
  fakeRunReference.providerRunRef = 'provider-run-reference';
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(req, payload, fakeRunReference),
  ]), TypeError);

  let getterCalls = 0;
  const getterOutput = result(req);
  Object.defineProperty(getterOutput, 'private', {
    enumerable: true,
    get() { getterCalls += 1; return privateMarker; },
  });
  assert.throws(() => createFakeGenerationAdapter([fixtureCase(req, payload, getterOutput)]), TypeError);
  assert.equal(getterCalls, 0);

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => createFakeGenerationAdapter([fixtureCase(req, payload, result(req, [cyclic]))]), TypeError);

  const reordered = { source: 'same' };
  const duplicateRequestOrder = { ...req, budget: { ...req.budget } };
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(req, payload, result(req)),
    fixtureCase(duplicateRequestOrder, reordered, result(req)),
  ]), TypeError);
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(req, payload, result(req)),
    fixtureCase({ ...req }, { source: 'different payload for same request' }, result(req)),
  ]), TypeError);
});

test('rejects malformed requests as typed errors without invoking getters', async () => {
  const adapter = createFakeGenerationAdapter([]);
  const req = request();
  let getterCalls = 0;
  Object.defineProperty(req, 'requestId', {
    enumerable: true,
    get() { getterCalls += 1; return 'must-not-be-read'; },
  });

  assert.deepEqual(await adapter.generate(req, { source: 'fixture' }), {
    code: 'INVALID_OUTPUT', retryable: false,
  });
  assert.equal(getterCalls, 0);

  const oversizedEscapedString = request({ requestId: '\u0000'.repeat(12_000) });
  assert.deepEqual(await adapter.generate(oversizedEscapedString, { source: 'fixture' }), {
    code: 'INVALID_OUTPUT', retryable: false,
  });
});

test('preserves own __proto__ candidate data without changing the copied object prototype', async () => {
  const req = request();
  const candidateWithProtoKey = JSON.parse('{"__proto__":{"marker":"fixture-data"},"id":"proto-key-candidate"}');
  const adapter = createFakeGenerationAdapter([
    fixtureCase(req, { source: 'fixture' }, result(req, [candidateWithProtoKey])),
  ]);
  const actual = await adapter.generate(req, { source: 'fixture' });
  const copiedCandidate = actual.candidates[0];

  assert.equal(Object.getPrototypeOf(copiedCandidate), Object.prototype);
  assert.equal(Object.hasOwn(copiedCandidate, '__proto__'), true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(copiedCandidate, '__proto__').value, { marker: 'fixture-data' });
  assert.equal(Object.prototype.marker, undefined);
});

test('requires complete results to meet requested count and preserves truncation and refusal states', async () => {
  const truncatedRequest = request({ requestId: 'truncated-case', count: 2 });
  const refusedRequest = request({ requestId: 'refused-case', count: 2 });
  const adapter = createFakeGenerationAdapter([
    fixtureCase(truncatedRequest, { source: 'truncated' }, result(truncatedRequest, [candidate()], 'TRUNCATED')),
    fixtureCase(refusedRequest, { source: 'refused' }, result(refusedRequest, [], 'REFUSED')),
  ]);

  assert.equal((await adapter.generate(truncatedRequest, { source: 'truncated' })).finishReason, 'TRUNCATED');
  assert.equal((await adapter.generate(refusedRequest, { source: 'refused' })).finishReason, 'REFUSED');

  const incompleteCompleteRequest = request({ requestId: 'incomplete-complete', count: 2 });
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(incompleteCompleteRequest, { source: 'invalid-complete' }, result(incompleteCompleteRequest, [candidate()])),
  ]), TypeError);
  assert.throws(() => createFakeGenerationAdapter([
    fixtureCase(refusedRequest, { source: 'bad-refusal' }, result(refusedRequest, [candidate()], 'REFUSED')),
  ]), TypeError);
});

test('cancellation rejects with AbortError before fixture matching and does not invent a provider error code', async () => {
  const req = request();
  const adapter = createFakeGenerationAdapter([fixtureCase(req, { source: 'fixture' }, result(req))]);
  const controller = new AbortController();
  controller.abort('private abort reason');

  await assert.rejects(adapter.generate(req, { source: 'missing fixture' }, controller.signal), (error) => {
    assert.equal(error.name, 'AbortError');
    assert.equal(error.message, 'The operation was aborted.');
    assert.notEqual(error.code, 'CANCELLED');
    assert.equal(ProviderErrorSchema.safeParse(error).success, false);
    assert.equal(error.message.includes('private abort reason'), false);
    return true;
  });
});
