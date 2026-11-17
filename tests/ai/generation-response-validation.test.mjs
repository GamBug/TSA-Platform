import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createFakeGenerationAdapter } from '../../src/modules/generation/fake-adapter.mjs';
import { GENERATION_RESPONSE_LIMITS, inspectGenerationResponse } from '../../src/modules/generation/response-validation.mjs';

const bytes = (value) => Buffer.from(JSON.stringify(value));
const clone = (value) => structuredClone(value);
const uuid = (group, ordinal = 1) => `${group}0000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
function request(overrides = {}) {
  return {
    specificationVersion: 'generation/1', requestId: 'synthetic-request',
    sourceVersionIds: ['synthetic-source'], taxonomyVersionId: uuid(3), section: 'MATH',
    skillIds: ['synthetic-skill'], interactionType: 'SINGLE_CHOICE', cognitiveLevel: 'M1',
    language: 'vi-VN', count: 1, promptTemplateVersion: 'synthetic/1',
    outputSchemaVersion: 'question/1', seed: 1,
    budget: { maxInputTokens: 20, maxOutputTokens: 20, maxCostMicros: 20 }, ...overrides,
  };
}
function question(req = request(), ordinal = 1) {
  const options = ['a', 'b'].map((id) => ({ id, content: [{ type: 'text', text: `Phương án ${id}` }] }));
  const interaction = req.interactionType === 'TRUE_FALSE_GROUP'
    ? { type: req.interactionType, statements: options }
    : { type: req.interactionType, options,
      ...(req.interactionType === 'MULTIPLE_CHOICE' ? { minSelections: 1, maxSelections: 2 } : {}) };
  const answerKey = req.interactionType === 'SINGLE_CHOICE'
    ? { type: req.interactionType, optionId: 'a' }
    : req.interactionType === 'MULTIPLE_CHOICE'
      ? { type: req.interactionType, optionIds: ['a'] }
      : { type: req.interactionType, values: { a: true, b: false } };
  return {
    schemaVersion: 'question/1', id: uuid(2, ordinal), questionId: uuid(1, ordinal), versionNo: 1,
    parentVersionId: null, language: 'vi-VN', section: req.section,
    taxonomyVersionId: req.taxonomyVersionId, domainId: 'synthetic-domain',
    skillIds: [...req.skillIds], subskillIds: [], cognitiveLevel: req.cognitiveLevel,
    difficulty: { target: null, predicted: null, empiricalStudyId: null },
    content: [{ type: 'text', text: 'Câu hỏi tổng hợp để kiểm thử.' }], stimulusVersionId: null,
    interaction, private: { answerKey, explanation: [{ type: 'text', text: 'Lời giải kiểm thử riêng.' }],
      evidenceRefs: [], scoringPolicy: 'practice-binary-v1' },
    origin: 'GENERATED', provenanceIds: ['synthetic-provenance'], generationRunId: null,
    createdBy: 'synthetic-author', createdAt: '2026-11-02T00:00:00Z', contentHash: 'unverified-model-claim',
  };
}
function result(req = request()) {
  return { candidates: Array.from({ length: req.count }, (_, index) => question(req, index + 1)),
    providerRunRef: null, modelRevision: 'fixture/fake-generation-adapter/1',
    usage: { inputTokens: 0, outputTokens: 0, costMicros: 0 }, finishReason: 'COMPLETE' };
}
const inspect = (req, response) => inspectGenerationResponse(bytes(req), bytes(response));
function rejected(actual, reason) {
  assert.equal(actual.status, 'REJECTED');
  assert.equal(actual.reason, reason);
  assert.equal(Object.hasOwn(actual, 'candidates'), false);
  assert.deepEqual(Object.keys(actual).sort(), ['reason', 'responseHash', 'status']);
}

test('generic fake-to-schema boundary covers all domains and interaction types without approval', async () => {
  for (const section of ['MATH', 'READING', 'SCIENCE']) {
    for (const interactionType of ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP']) {
      const req = request({ section, interactionType });
      const source = { synthetic: true };
      const adapter = createFakeGenerationAdapter([{ request: req, approvedSourcePayload: source, resultOrError: result(req) }]);
      const generated = await adapter.generate(req, source);
      const actual = inspect(req, generated);
      assert.equal(actual.status, 'STRUCTURALLY_VALID');
      assert.deepEqual(actual.candidates, generated.candidates);
      assert.ok(actual.remainingChecks.includes('INDEPENDENT_HUMAN_REVIEW'));
      assert.ok(actual.remainingChecks.includes('SOURCE_RIGHTS_AND_PROVENANCE'));
      assert.ok(actual.remainingChecks.includes('HASH_AND_TRUSTED_IDENTITY'));
      assert.equal(Object.hasOwn(actual, 'approved'), false);
    }
  }
});

test('exact raw response hash and isolated parsed output survive caller byte/result mutations', () => {
  const req = request();
  const raw = bytes(result(req));
  const expectedHash = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  const first = inspectGenerationResponse(bytes(req), raw);
  assert.equal(first.responseHash, expectedHash);
  first.candidates[0].private.answerKey.optionId = 'b';
  first.remainingChecks.length = 0;
  assert.equal(inspectGenerationResponse(bytes(req), raw).candidates[0].private.answerKey.optionId, 'a');
  raw.fill(0);
  assert.equal(first.responseHash, expectedHash);
});

test('request and response byte bounds reject unsupported objects without invoking their getters', () => {
  let invoked = false;
  const hostile = { get byteLength() { invoked = true; throw new Error('secret'); } };
  rejected(inspectGenerationResponse(bytes(request()), hostile), 'RESPONSE_BYTES_UNSUPPORTED_OR_TOO_LARGE');
  assert.equal(invoked, false);
  rejected(inspectGenerationResponse(bytes(request()), Buffer.alloc(GENERATION_RESPONSE_LIMITS.responseBytes + 1)), 'RESPONSE_BYTES_UNSUPPORTED_OR_TOO_LARGE');
  rejected(inspectGenerationResponse(Buffer.alloc(GENERATION_RESPONSE_LIMITS.requestBytes + 1), bytes(result())), 'INVALID_REQUEST');
  const shared = new Uint8Array(new SharedArrayBuffer(8));
  rejected(inspectGenerationResponse(bytes(request()), shared), 'RESPONSE_BYTES_UNSUPPORTED_OR_TOO_LARGE');
});

test('offset byte views use their exact native slice without evaluating shadow properties or proxies', () => {
  const raw = bytes(result());
  const container = Buffer.concat([Buffer.from('prefix'), raw, Buffer.from('suffix')]);
  const view = new Uint8Array(container.buffer, container.byteOffset + 6, raw.length);
  let invoked = false;
  const trap = () => { invoked = true; throw new Error('private getter'); };
  for (const key of ['buffer', 'byteOffset', 'byteLength']) Object.defineProperty(view, key, { get: trap });
  Object.defineProperty(view, Symbol.iterator, { get: trap });
  const actual = inspectGenerationResponse(bytes(request()), view);
  assert.equal(actual.status, 'STRUCTURALLY_VALID');
  assert.equal(actual.responseHash, `sha256:${createHash('sha256').update(raw).digest('hex')}`);
  assert.equal(invoked, false);
  rejected(inspectGenerationResponse(bytes(request()), new Proxy(view, { get: trap })), 'RESPONSE_BYTES_UNSUPPORTED_OR_TOO_LARGE');
  assert.equal(invoked, false);
});

test('fatal UTF-8, malformed JSON and unknown provider fields fail with private-free diagnostics', () => {
  for (const raw of [Buffer.from([0xc3, 0x28]), Buffer.from('{"private-secret":')]) {
    rejected(inspectGenerationResponse(bytes(request()), raw), 'INVALID_PROVIDER_RESULT');
  }
  const response = { ...result(), secretField: 'private-secret' };
  const actual = inspect(request(), response);
  rejected(actual, 'INVALID_PROVIDER_RESULT');
  assert.doesNotMatch(JSON.stringify(actual), /private-secret|secretField|Lời giải/);
  rejected(inspectGenerationResponse(Buffer.from([0xff]), bytes(result())), 'INVALID_REQUEST');
  rejected(inspect({ ...request(), studentHistory: ['secret'] }, result()), 'INVALID_REQUEST');
  const unsafeUsage = result();
  unsafeUsage.usage.inputTokens = Number.MAX_SAFE_INTEGER + 1;
  rejected(inspect(request(), unsafeUsage), 'INVALID_PROVIDER_RESULT');
});

test('unknown cost requires reconciliation and does not appear to be zero or yield usable candidates', () => {
  const response = result();
  response.usage.costMicros = null;
  const actual = inspect(request(), response);
  assert.equal(actual.status, 'REQUIRES_RECONCILIATION');
  assert.equal(actual.reason, 'UNKNOWN_COST');
  assert.equal(Object.hasOwn(actual, 'candidates'), false);
  assert.equal(Object.hasOwn(actual, 'usage'), false);
});

test('known cost and input/output token overruns reject at strict boundaries', () => {
  for (const key of ['inputTokens', 'outputTokens', 'costMicros']) {
    const response = result();
    response.usage[key] = 21;
    rejected(inspect(request(), response), 'BUDGET_EXCEEDED');
    response.usage[key] = 20;
    assert.equal(inspect(request(), response).status, 'STRUCTURALLY_VALID');
  }
});

test('complete exact counts are required and refused/truncated output cannot be partially salvaged', () => {
  rejected(inspect(request({ count: 2 }), result()), 'COUNT_MISMATCH');
  for (const finishReason of ['TRUNCATED', 'REFUSED']) {
    rejected(inspect(request(), { ...result(), finishReason }), `PROVIDER_${finishReason}`);
  }
  rejected(inspect(request(), { ...result(), candidates: new Array(501).fill(null) }), 'RESPONSE_CANDIDATE_LIMIT');
  rejected(inspect(request({ count: 501 }), result()), 'REQUEST_NOT_SUPPORTED');
});

test('invalid schema and answer keys reject the whole response without exposing partial candidate data', () => {
  const req = request({ count: 2 });
  for (const damage of [
    (q) => { q.private.answerKey.optionId = 'missing'; },
    (q) => { q.unknownField = 'private-secret'; },
    (q) => { q.private.explanation = 'not-blocks'; },
  ]) {
    const response = result(req);
    damage(response.candidates[1]);
    const actual = inspect(req, response);
    rejected(actual, 'INVALID_QUESTION_SCHEMA');
    assert.doesNotMatch(JSON.stringify(actual), /private-secret|Lời giải|synthetic-author/);
  }
});

test('domain/taxonomy/interaction/skills/requested-cognition drift rejects without rewriting output', () => {
  for (const damage of [
    (q) => { q.section = 'SCIENCE'; },
    (q) => { q.taxonomyVersionId = uuid(4); },
    (q) => { q.skillIds = ['different']; },
    (q) => { q.skillIds = [...q.skillIds, 'extra']; },
    (q) => { q.cognitiveLevel = 'M2'; },
  ]) {
    const response = result();
    damage(response.candidates[0]);
    const before = clone(response);
    rejected(inspect(request(), response), 'REQUEST_MISMATCH');
    assert.deepEqual(response, before);
  }
  rejected(inspect(request({ interactionType: 'MULTIPLE_CHOICE' }), result()), 'REQUEST_MISMATCH');
  rejected(inspect(request({ skillIds: ['duplicate', 'duplicate'] }), result()), 'REQUEST_NOT_SUPPORTED');
  const req = request({ cognitiveLevel: null, skillIds: ['one', 'two'] });
  const response = result(req);
  response.candidates[0].cognitiveLevel = 'M3';
  response.candidates[0].skillIds.reverse();
  assert.equal(inspect(req, response).status, 'STRUCTURALLY_VALID', 'null request cognition is unspecified; skill order is immaterial');
});

test('duplicate version or stable question identities reject the complete unit', () => {
  const req = request({ count: 2 });
  for (const field of ['id', 'questionId']) {
    const response = result(req);
    response.candidates[1][field] = response.candidates[0][field];
    rejected(inspect(req, response), 'DUPLICATE_IDENTITY');
  }
});

test('structural acceptance deliberately does not certify content safety, hash truth or answer correctness', () => {
  const response = result();
  response.candidates[0].content[0].text = '<script>untrusted text</script>';
  const actual = inspect(request(), response);
  assert.equal(actual.status, 'STRUCTURALLY_VALID');
  assert.ok(actual.remainingChecks.includes('CONTENT_SAFETY'));
  assert.ok(actual.remainingChecks.includes('ANSWER_CORRECTNESS'));
  assert.equal(actual.candidates[0].contentHash, 'unverified-model-claim');
});
