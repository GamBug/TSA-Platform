import { types as utilTypes } from 'node:util';
import {
  GenerationRequestSchema,
  ProviderErrorSchema,
  ProviderResultSchema,
} from '../../../packages/contracts/dist/internal.js';

const FIXTURE_ADAPTER_REVISION = 'fixture/fake-generation-adapter/1';
const FIXTURE_MODEL_REVISION = 'fixture/fake-generation-adapter/1';
const MAX_FIXTURE_CASES = 128;
const MAX_TOTAL_FIXTURE_BYTES = 16 * 1024 * 1024;
const MAX_CASE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_SOURCE_PAYLOAD_BYTES = 512 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_CANDIDATES = 256;
const MAX_DEPTH = 32;
const MAX_NODES = 50_000;
const MAX_FIXTURE_NODES = 200_000;

const capabilitiesSnapshot = deepFreeze({
  adapterRevision: FIXTURE_ADAPTER_REVISION,
  modelRevision: FIXTURE_MODEL_REVISION,
  outputSchemas: ['question/1'],
  sections: ['MATH', 'READING', 'SCIENCE'],
  interactionTypes: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'],
  providerFree: true,
  limits: {
    fixtureCases: MAX_FIXTURE_CASES,
    totalFixtureBytes: MAX_TOTAL_FIXTURE_BYTES,
    requestBytes: MAX_REQUEST_BYTES,
    approvedSourcePayloadBytes: MAX_SOURCE_PAYLOAD_BYTES,
    outputBytes: MAX_OUTPUT_BYTES,
    candidates: MAX_CANDIDATES,
    jsonDepth: MAX_DEPTH,
    jsonNodesPerValue: MAX_NODES,
    totalFixtureNodes: MAX_FIXTURE_NODES,
  },
});

class SnapshotError extends Error {}

/**
 * Create a deterministic in-memory adapter for isolated tests. The limits here
 * bound this fixture module only; they do not narrow the shared contracts.
 * Candidates are copied as untrusted JSON and are never validated, approved,
 * imported, or written to a Bank by this adapter.
 */
export function createFakeGenerationAdapter(fixtureCases) {
  let fixtureCaseValues;
  try {
    fixtureCaseValues = readFixtureCaseArray(fixtureCases);
  } catch {
    throw new TypeError('Invalid fake generation fixture');
  }

  const entries = new Map();
  const seenRequests = new Set();
  let totalBytes = 2;
  let totalNodes = 1;
  try {
    for (const rawFixtureCase of fixtureCaseValues) {
      const caseSnapshot = snapshotJson(rawFixtureCase, {
        maxBytes: MAX_CASE_BYTES,
        maxNodes: MAX_FIXTURE_NODES,
      });
      const fixtureCase = caseSnapshot.value;
      if (!isPlainRecord(fixtureCase) || !hasExactKeys(fixtureCase, [
        'request', 'approvedSourcePayload', 'resultOrError',
      ])) throw new SnapshotError();
      if (entries.size > 0) totalBytes += 1;
      totalBytes += caseSnapshot.bytes;
      totalNodes += caseSnapshot.nodes;
      if (totalBytes > MAX_TOTAL_FIXTURE_BYTES || totalNodes > MAX_FIXTURE_NODES) throw new SnapshotError();

      const requestSnapshot = snapshotJson(fixtureCase.request, {
        maxBytes: MAX_REQUEST_BYTES,
        maxNodes: MAX_NODES,
      });
      const requestParsed = GenerationRequestSchema.safeParse(requestSnapshot.value);
      if (!requestParsed.success) throw new SnapshotError();
      const requestKey = canonicalJson(requestParsed.data);
      if (seenRequests.has(requestKey)) throw new SnapshotError();

      const sourceSnapshot = snapshotJson(fixtureCase.approvedSourcePayload, {
        maxBytes: MAX_SOURCE_PAYLOAD_BYTES,
        maxNodes: MAX_NODES,
      });
      const outputSnapshot = snapshotJson(fixtureCase.resultOrError, {
        maxBytes: MAX_OUTPUT_BYTES,
        maxNodes: MAX_NODES,
      });
      const output = parseFixtureOutcome(outputSnapshot.value, requestParsed.data);
      const key = makeMatchKey(requestParsed.data, sourceSnapshot.value);
      if (entries.has(key)) throw new SnapshotError();
      seenRequests.add(requestKey);
      entries.set(key, deepFreeze({ request: requestParsed.data, source: sourceSnapshot.value, output }));
    }
  } catch {
    throw new TypeError('Invalid fake generation fixture');
  }

  return Object.freeze({
    capabilities() {
      return copyJson(capabilitiesSnapshot);
    },

    async generate(request, approvedSourcePayload, cancellationSignal) {
      throwIfAborted(cancellationSignal);

      let requestParsed;
      try {
        const requestSnapshot = snapshotJson(request, {
          maxBytes: MAX_REQUEST_BYTES,
          maxNodes: MAX_NODES,
        });
        const parsed = GenerationRequestSchema.safeParse(requestSnapshot.value);
        if (!parsed.success) {
          throwIfAborted(cancellationSignal);
          return providerError('INVALID_OUTPUT', false);
        }
        requestParsed = parsed.data;
      } catch {
        throwIfAborted(cancellationSignal);
        return providerError('INVALID_OUTPUT', false);
      }

      let sourceSnapshot;
      try {
        sourceSnapshot = snapshotJson(approvedSourcePayload, {
          maxBytes: MAX_SOURCE_PAYLOAD_BYTES,
          maxNodes: MAX_NODES,
        });
      } catch {
        throwIfAborted(cancellationSignal);
        return providerError('INVALID_OUTPUT', false);
      }

      throwIfAborted(cancellationSignal);
      const entry = entries.get(makeMatchKey(requestParsed, sourceSnapshot.value));
      const output = entry
        ? copyJson(entry.output)
        // A local missing case cannot be fixed by retrying the same inputs.
        : providerError('UNAVAILABLE', false);
      throwIfAborted(cancellationSignal);
      return output;
    },
  });
}

function parseFixtureOutcome(value, request) {
  const result = ProviderResultSchema.safeParse(value);
  if (result.success) {
    const candidateCount = result.data.candidates.length;
    const usage = result.data.usage;
    if (result.data.providerRunRef !== null
        || result.data.modelRevision !== FIXTURE_MODEL_REVISION
        || usage.inputTokens !== 0
        || usage.outputTokens !== 0
        || usage.costMicros !== 0) throw new SnapshotError();
    if (candidateCount > MAX_CANDIDATES) throw new SnapshotError();
    if (result.data.finishReason === 'COMPLETE' && candidateCount !== request.count) {
      throw new SnapshotError();
    }
    if (result.data.finishReason === 'TRUNCATED' && candidateCount > request.count) {
      throw new SnapshotError();
    }
    if (result.data.finishReason === 'REFUSED' && candidateCount !== 0) {
      throw new SnapshotError();
    }

    return ProviderResultSchema.parse(result.data);
  }

  const error = ProviderErrorSchema.safeParse(value);
  if (!error.success) throw new SnapshotError();
  return ProviderErrorSchema.parse(error.data);
}

function providerError(code, retryable) {
  return ProviderErrorSchema.parse({ code, retryable });
}

function throwIfAborted(signal) {
  if (signal === undefined || signal === null) return;
  if (utilTypes.isProxy(signal) || !(signal instanceof AbortSignal)) {
    throw new TypeError('cancellationSignal must be an AbortSignal');
  }
  if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function snapshotJson(value, { maxBytes, maxNodes = MAX_NODES, maxDepth = MAX_DEPTH }) {
  const context = { nodes: 0, bytes: 0, ancestors: new Set(), maxBytes, maxNodes, maxDepth };
  const copy = copyPlainJson(value, context, 0);
  return { value: copy, bytes: context.bytes, nodes: context.nodes };
}

function copyPlainJson(value, context, depth) {
  context.nodes += 1;
  if (context.nodes > context.maxNodes || depth > context.maxDepth) throw new SnapshotError();
  if (value === null) {
    addSerializedBytes(context, 4);
    return value;
  }
  if (typeof value === 'string') {
    addJsonStringBytes(context, value);
    return value;
  }
  if (typeof value === 'boolean') {
    addSerializedBytes(context, value ? 4 : 5);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SnapshotError();
    addSerializedBytes(context, JSON.stringify(value).length);
    return value;
  }
  if (typeof value !== 'object' || utilTypes.isProxy(value)) throw new SnapshotError();
  if (context.ancestors.has(value)) throw new SnapshotError();

  context.ancestors.add(value);
  try {
    if (Array.isArray(value)) return copyArray(value, context, depth);
    return copyRecord(value, context, depth);
  } finally {
    context.ancestors.delete(value);
  }
}

function copyArray(value, context, depth) {
  if (Object.getPrototypeOf(value) !== Array.prototype) throw new SnapshotError();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
    throw new SnapshotError();
  }
  const length = lengthDescriptor.value;
  const remainingNodes = context.maxNodes - context.nodes;
  const remainingBytes = context.maxBytes - context.bytes;
  if (length > remainingNodes || (length > 0 && 2 * length + 1 > remainingBytes) || (length === 0 && remainingBytes < 2)) {
    throw new SnapshotError();
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string') || keys.length !== length + 1) throw new SnapshotError();

  const output = new Array(length);
  addSerializedBytes(context, 2);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new SnapshotError();
    if (index > 0) addSerializedBytes(context, 1);
    output[index] = copyPlainJson(descriptor.value, context, depth + 1);
  }
  return output;
}

function copyRecord(value, context, depth) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new SnapshotError();
  const keys = Reflect.ownKeys(value);
  const remainingNodes = context.maxNodes - context.nodes;
  const remainingBytes = context.maxBytes - context.bytes;
  if (keys.length > remainingNodes || (keys.length > 0 && 5 * keys.length + 1 > remainingBytes)
      || (keys.length === 0 && remainingBytes < 2) || keys.some((key) => typeof key !== 'string')) {
    throw new SnapshotError();
  }

  const output = {};
  addSerializedBytes(context, 2);
  let index = 0;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new SnapshotError();
    if (index > 0) addSerializedBytes(context, 1);
    addJsonStringBytes(context, key);
    addSerializedBytes(context, 1);
    Object.defineProperty(output, key, {
      value: copyPlainJson(descriptor.value, context, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true,
    });
    index += 1;
  }
  return output;
}

function readFixtureCaseArray(value) {
  if (utilTypes.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new SnapshotError();
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value > MAX_FIXTURE_CASES) {
    throw new SnapshotError();
  }
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string') || keys.length !== length + 1) throw new SnapshotError();

  const cases = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new SnapshotError();
    cases.push(descriptor.value);
  }
  return cases;
}

function addSerializedBytes(context, count) {
  context.bytes += count;
  if (context.bytes > context.maxBytes) throw new SnapshotError();
}

function addJsonStringBytes(context, value) {
  const remaining = context.maxBytes - context.bytes;
  if (value.length + 2 > remaining) throw new SnapshotError();
  const rawUtf8Bytes = Buffer.byteLength(value, 'utf8');
  if (rawUtf8Bytes + 2 > remaining) throw new SnapshotError();

  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit === 0x22 || unit === 0x5c) {
      bytes += 2;
    } else if (unit <= 0x1f) {
      bytes += unit === 0x08 || unit === 0x09 || unit === 0x0a || unit === 0x0c || unit === 0x0d ? 2 : 6;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      bytes += 6;
    } else if (unit <= 0x7f) {
      bytes += 1;
    } else if (unit <= 0x7ff) {
      bytes += 2;
    } else {
      bytes += 3;
    }
    if (bytes > remaining) throw new SnapshotError();
  }
  addSerializedBytes(context, bytes);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function makeMatchKey(request, approvedSourcePayload) {
  return `[${canonicalJson(request)},${canonicalJson(approvedSourcePayload)}]`;
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function hasExactKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function copyJson(value) {
  return snapshotJson(value, {
    maxBytes: MAX_OUTPUT_BYTES,
    maxNodes: MAX_FIXTURE_NODES,
  }).value;
}
