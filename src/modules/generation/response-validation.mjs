import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  GenerationRequestSchema,
  ProviderResultSchema,
  QuestionVersionSchema,
} from '../../../packages/contracts/dist/internal.js';

export const GENERATION_RESPONSE_LIMITS = Object.freeze({
  requestBytes: 64 * 1024,
  responseBytes: 2 * 1024 * 1024,
  candidates: 500,
});

const remainingChecks = Object.freeze([
  'CONTENT_SAFETY', 'REGISTERED_TAXONOMY', 'SOURCE_RIGHTS_AND_PROVENANCE',
  'HASH_AND_TRUSTED_IDENTITY', 'DUPLICATION_AND_EQUIVALENCE',
  'ANSWER_CORRECTNESS', 'INDEPENDENT_HUMAN_REVIEW',
]);
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const getter = (name) => Object.getOwnPropertyDescriptor(typedArrayPrototype, name).get;
const nativeBuffer = getter('buffer');
const nativeOffset = getter('byteOffset');
const nativeLength = getter('byteLength');
const setBytes = Uint8Array.prototype.set;
const providerKeys = ['candidates', 'providerRunRef', 'modelRevision', 'usage', 'finishReason'];

function snapshotBytes(value, maximum) {
  if (!types.isUint8Array(value)) throw new TypeError('Expected response bytes');
  const length = nativeLength.call(value);
  if (length > maximum) throw new RangeError('Fixture-independent response limit');
  const buffer = nativeBuffer.call(value);
  if (types.isSharedArrayBuffer(buffer)) throw new TypeError('Shared bytes are not supported');
  const copy = Buffer.alloc(length);
  setBytes.call(copy, new Uint8Array(buffer, nativeOffset.call(value), length));
  return copy;
}

function parseJson(bytes) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function sameSkills(actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return actualSet.size === actual.length && expectedSet.size === expected.length
    && actualSet.size === expectedSet.size && [...actualSet].every((id) => expectedSet.has(id));
}

/**
 * Inspect exact received bytes before canonical import. STRUCTURALLY_VALID is
 * intentionally narrower than safe content, verified answers, rights or approval.
 * Callers retain raw response/charge evidence; this function writes nothing.
 */
export function inspectGenerationResponse(requestBytes, responseBytes) {
  let response;
  let responseHash = null;
  const reject = (reason) => ({ status: 'REJECTED', reason, responseHash });
  try {
    response = snapshotBytes(responseBytes, GENERATION_RESPONSE_LIMITS.responseBytes);
    responseHash = `sha256:${createHash('sha256').update(response).digest('hex')}`;
  } catch {
    return reject('RESPONSE_BYTES_UNSUPPORTED_OR_TOO_LARGE');
  }

  let request;
  try {
    request = GenerationRequestSchema.parse(parseJson(snapshotBytes(
      requestBytes, GENERATION_RESPONSE_LIMITS.requestBytes,
    )));
    if (request.count > GENERATION_RESPONSE_LIMITS.candidates
        || new Set(request.skillIds).size !== request.skillIds.length) {
      return reject('REQUEST_NOT_SUPPORTED');
    }
  } catch {
    return reject('INVALID_REQUEST');
  }

  let result;
  try {
    const value = parseJson(response);
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== providerKeys.length
        || providerKeys.some((key) => !Object.hasOwn(value, key))) {
      return reject('INVALID_PROVIDER_RESULT');
    }
    if (Array.isArray(value.candidates)
        && value.candidates.length > GENERATION_RESPONSE_LIMITS.candidates) {
      return reject('RESPONSE_CANDIDATE_LIMIT');
    }
    result = ProviderResultSchema.parse(value);
  } catch {
    return reject('INVALID_PROVIDER_RESULT');
  }

  // Unknown billing must not become an apparent zero-cost accepted response.
  if (result.usage.costMicros === null) {
    return { status: 'REQUIRES_RECONCILIATION', reason: 'UNKNOWN_COST', responseHash };
  }
  if (result.usage.inputTokens > request.budget.maxInputTokens
      || result.usage.outputTokens > request.budget.maxOutputTokens
      || result.usage.costMicros > request.budget.maxCostMicros) {
    return reject('BUDGET_EXCEEDED');
  }
  if (result.finishReason !== 'COMPLETE') return reject(`PROVIDER_${result.finishReason}`);
  if (result.candidates.length !== request.count) return reject('COUNT_MISMATCH');

  const questions = [];
  const versionIds = new Set();
  const questionIds = new Set();
  for (const candidate of result.candidates) {
    const parsed = QuestionVersionSchema.safeParse(candidate);
    if (!parsed.success) return reject('INVALID_QUESTION_SCHEMA');
    const question = parsed.data;
    if (question.section !== request.section
        || question.taxonomyVersionId !== request.taxonomyVersionId
        || question.interaction.type !== request.interactionType
        || !sameSkills(question.skillIds, request.skillIds)
        || (request.cognitiveLevel !== null && question.cognitiveLevel !== request.cognitiveLevel)) {
      return reject('REQUEST_MISMATCH');
    }
    if (versionIds.has(question.id) || questionIds.has(question.questionId)) {
      return reject('DUPLICATE_IDENTITY');
    }
    versionIds.add(question.id);
    questionIds.add(question.questionId);
    questions.push(question);
  }

  return {
    status: 'STRUCTURALLY_VALID', responseHash,
    candidates: questions,
    providerMetadata: {
      providerRunRef: result.providerRunRef, modelRevision: result.modelRevision,
      usage: result.usage, finishReason: result.finishReason,
    },
    remainingChecks: [...remainingChecks],
  };
}
