import { createHash } from "node:crypto";
import { z } from "zod";
import { BlockSchema, QuestionVersionSchema, type QuestionVersion } from "./index.ts";

export type ReferenceKind = "taxonomy" | "question" | "stimulus" | "asset" | "provenance" | "evidence" | "source";
export type ReferenceKey = { kind: ReferenceKind; id: string };
export type ReferenceDigest = ReferenceKey & { contentHash: string };
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ReferenceNode = ReferenceKey & {
  payload: { [key: string]: JsonValue };
  references: ReferenceKey[];
  contentHash: string;
};

export type QuestionIdentity = { bytes: Uint8Array; contentHash: string };
export type DuplicateFingerprint = { bytes: Uint8Array; fingerprint: string };

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MAX_GRAPH_NODES = 2_000;
const MAX_DEPTH = 64;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const OPERATIONAL_PAYLOAD_KEYS = new Set([
  "workflow",
  "workflowState",
  "usageCounters",
  "eligibility",
  "currentRights",
  "events",
]);
const REFERENCE_KINDS = new Set<ReferenceKind>([
  "taxonomy",
  "question",
  "stimulus",
  "asset",
  "provenance",
  "evidence",
  "source",
]);
const utf8 = new TextEncoder();
const StimulusBlocksSchema = z.array(BlockSchema).min(1).max(100);

function fail(message: string): never {
  throw new TypeError(message);
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isArrayIndex(key: string, length: number): boolean {
  if (key === "") return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}

function copyJson(value: unknown, depth = 0, active = new Set<object>()): JsonValue {
  if (depth > MAX_DEPTH) fail("JSON depth exceeds 64");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (!isWellFormedUnicode(value)) fail("String contains an unpaired UTF-16 surrogate");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("JSON numbers must be finite");
    return value;
  }
  if (typeof value !== "object") fail("Value is not supported JSON");
  if (active.has(value)) fail("Cyclic values are not supported JSON");
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) fail("Array has an unsupported prototype");
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== "string" || (key !== "length" && !isArrayIndex(key, value.length)))) {
        fail("Array has unsupported properties");
      }
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("Sparse arrays and accessors are unsupported");
        result.push(copyJson(descriptor.value, depth + 1, active));
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail("Only plain JSON objects are supported");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) fail("Symbol object keys are unsupported");
    const result: { [key: string]: JsonValue } = Object.create(null) as { [key: string]: JsonValue };
    for (const key of keys as string[]) {
      if (!isWellFormedUnicode(key)) fail("Object key contains an unpaired UTF-16 surrogate");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("Accessors and non-enumerable properties are unsupported");
      result[key] = copyJson(descriptor.value, depth + 1, active);
    }
    return result;
  } finally {
    active.delete(value);
  }
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function encodeCanonical(value: JsonValue, depth = 0): string {
  if (depth > MAX_DEPTH) fail("JSON depth exceeds 64");
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) fail("Value is not supported JSON");
    return encoded;
  }
  if (Array.isArray(value)) return "[" + value.map((entry) => encodeCanonical(entry, depth + 1)).join(",") + "]";
  const keys = Object.keys(value).sort(compareUtf16);
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + encodeCanonical(value[key]!, depth + 1)).join(",") + "}";
}

/** Return the UTF-8 RFC 8785 JSON Canonicalization Scheme bytes for a JSON value. */
export function canonicalize(value: unknown): Uint8Array {
  return utf8.encode(encodeCanonical(copyJson(value)));
}

function sha256(bytes: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function strictObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !fields.includes(key))) fail(label + " has unknown fields");
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(label + " is missing " + field);
  }
  return value as Record<string, unknown>;
}

function referenceKey(value: unknown, label: string): ReferenceKey {
  const candidate = strictObject(value, ["kind", "id"], label);
  if (typeof candidate.kind !== "string" || !REFERENCE_KINDS.has(candidate.kind as ReferenceKind)) fail(label + " has an unsupported kind");
  if (typeof candidate.id !== "string" || candidate.id.length === 0 || !isWellFormedUnicode(candidate.id)) fail(label + " has an invalid id");
  return { kind: candidate.kind as ReferenceKind, id: candidate.id };
}

function nodeKey(reference: ReferenceKey): string {
  return reference.kind + "\u0000" + reference.id;
}

function compareReference(left: ReferenceKey, right: ReferenceKey): number {
  return compareUtf16(left.kind, right.kind) || compareUtf16(left.id, right.id);
}

function validatePayload(payload: unknown): { [key: string]: JsonValue } {
  const copied = copyJson(payload);
  if (copied === null || Array.isArray(copied) || typeof copied !== "object") fail("Reference payload must be an object");
  if (Object.hasOwn(copied, "contentHash")) fail("Reference payload must not contain contentHash");
  for (const key of Object.keys(copied)) {
    if (OPERATIONAL_PAYLOAD_KEYS.has(key)) fail("Reference payload contains operational key " + key);
  }
  return copied;
}

/** Hash a reference/1 envelope after its children have been resolved and sorted. */
export function createReferenceHash(input: {
  kind: ReferenceKind;
  id: string;
  payload: unknown;
  references: readonly ReferenceDigest[];
}): string {
  const copied = copyJson(input);
  if (copied === null || Array.isArray(copied) || typeof copied !== "object") fail("Reference input must be an object");
  const candidate = strictObject(copied, ["kind", "id", "payload", "references"], "Reference input");
  const copiedPayload = validatePayload(candidate.payload);
  if (typeof candidate.kind !== "string" || !REFERENCE_KINDS.has(candidate.kind as ReferenceKind)) fail("Reference has an unsupported kind");
  if (typeof candidate.id !== "string" || candidate.id.length === 0 || !isWellFormedUnicode(candidate.id)) fail("Reference has an invalid id");
  if (!Array.isArray(candidate.references)) fail("Reference dependencies must be an array");
  const seenReferences = new Set<string>();
  const references = candidate.references.map((entry) => {
    const digest = strictObject(entry, ["kind", "id", "contentHash"], "Reference dependency");
    const key = referenceKey({ kind: digest.kind, id: digest.id }, "Reference dependency");
    if (typeof digest.contentHash !== "string" || !HASH_PATTERN.test(digest.contentHash)) fail("Reference dependency has an invalid contentHash");
    const keyId = nodeKey(key);
    if (seenReferences.has(keyId)) fail("Reference dependencies must not contain duplicate edges");
    seenReferences.add(keyId);
    return { ...key, contentHash: digest.contentHash };
  }).sort(compareReference);
  const envelope = { version: "reference/1", kind: candidate.kind, id: candidate.id, payload: copiedPayload, references };
  return sha256(canonicalize(envelope));
}

type ValidatedGraph = {
  question: QuestionVersion;
  nodes: Map<string, ReferenceNode>;
  closure: ReferenceNode[];
};

function questionRoots(question: QuestionVersion): ReferenceKey[] {
  const roots: ReferenceKey[] = [{ kind: "taxonomy", id: question.taxonomyVersionId }];
  if (question.parentVersionId !== null) roots.push({ kind: "question", id: question.parentVersionId });
  if (question.stimulusVersionId !== null) roots.push({ kind: "stimulus", id: question.stimulusVersionId });
  for (const id of question.provenanceIds) roots.push({ kind: "provenance", id });
  for (const id of question.private.evidenceRefs) roots.push({ kind: "evidence", id });

  const visitImages = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visitImages(entry);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "image" && typeof record.assetVersionId === "string") {
      roots.push({ kind: "asset", id: record.assetVersionId });
    }
    for (const entry of Object.values(record)) visitImages(entry);
  };
  visitImages(question.content);
  visitImages(question.interaction);
  visitImages(question.private);
  return roots;
}

function parseQuestion(input: unknown): QuestionVersion {
  return QuestionVersionSchema.parse(copyJson(input));
}

function validateGraph(questionInput: unknown, suppliedNodes: unknown): ValidatedGraph {
  const question = parseQuestion(questionInput);
  if (question.parentVersionId === question.id) fail("Question cannot reference itself as its parent");
  if (!Array.isArray(suppliedNodes)) fail("Reference graph must be an array");
  if (suppliedNodes.length > MAX_GRAPH_NODES) fail("Reference graph exceeds 2,000 nodes");
  const copiedNodes = copyJson(suppliedNodes);
  if (!Array.isArray(copiedNodes)) fail("Reference graph must be an array");

  const nodes = new Map<string, ReferenceNode>();
  for (const [index, rawNode] of copiedNodes.entries()) {
    const node = strictObject(rawNode, ["kind", "id", "payload", "references", "contentHash"], "Reference node " + index);
    const key = referenceKey({ kind: node.kind, id: node.id }, "Reference node " + index);
    if (typeof node.contentHash !== "string" || !HASH_PATTERN.test(node.contentHash)) fail("Reference node " + index + " has an invalid contentHash");
    if (!Array.isArray(node.references)) fail("Reference node " + index + " references must be an array");
    const references = node.references.map((entry, referenceIndex) => referenceKey(entry, "Reference node " + index + " reference " + referenceIndex));
    const referenceIds = new Set<string>();
    for (const reference of references) {
      const referenceId = nodeKey(reference);
      if (referenceIds.has(referenceId)) fail("Reference node " + index + " contains a duplicate edge");
      referenceIds.add(referenceId);
    }
    if (key.kind === "question" && key.id === question.id) fail("Reference graph cannot contain the root question identity");
    const parsed: ReferenceNode = {
      ...key,
      payload: validatePayload(node.payload),
      references,
      contentHash: node.contentHash,
    };
    const id = nodeKey(key);
    if (nodes.has(id)) fail("Duplicate reference node " + key.kind + "/" + key.id);
    nodes.set(id, parsed);
  }

  const roots = questionRoots(question);
  for (const node of nodes.values()) {
    for (const reference of node.references) {
      if (!nodes.has(nodeKey(reference))) fail("Missing reference node " + reference.kind + "/" + reference.id);
    }
  }
  for (const root of roots) {
    if (!nodes.has(nodeKey(root))) fail("Missing required reference node " + root.kind + "/" + root.id);
  }

  const state = new Map<string, "visiting" | "done">();
  const computed = new Map<string, { hash: string; depth: number }>();
  let referenceBytes = 0;
  const visit = (key: ReferenceKey, pathDepth: number): { hash: string; depth: number } => {
    if (pathDepth > MAX_DEPTH) fail("Reference graph depth exceeds 64");
    const id = nodeKey(key);
    const currentState = state.get(id);
    if (currentState === "visiting") fail("Reference graph contains a cycle at " + key.kind + "/" + key.id);
    if (currentState === "done") {
      const existing = computed.get(id)!;
      if (pathDepth + existing.depth - 1 > MAX_DEPTH) fail("Reference graph depth exceeds 64");
      return existing;
    }
    const node = nodes.get(id);
    if (!node) fail("Missing reference node " + key.kind + "/" + key.id);
    state.set(id, "visiting");
    const resolved = node.references.map((reference) => ({ reference, result: visit(reference, pathDepth + 1) }));
    const references: ReferenceDigest[] = resolved.map(({ reference, result }) => ({
      ...reference,
      contentHash: result.hash,
    }));
    let depth = 1;
    for (const { result } of resolved) depth = Math.max(depth, result.depth + 1);
    if (depth > MAX_DEPTH) fail("Reference graph depth exceeds 64");
    const hash = createReferenceHash({
      kind: node.kind,
      id: node.id,
      payload: node.payload,
      references,
    });
    const envelopeBytes = canonicalize({
      version: "reference/1",
      kind: node.kind,
      id: node.id,
      payload: node.payload,
      references: references.sort(compareReference),
    });
    referenceBytes += envelopeBytes.byteLength;
    if (referenceBytes > MAX_REFERENCE_BYTES) fail("Canonical reference data exceeds 8 MiB");
    if (hash !== node.contentHash) fail("Reference contentHash mismatch for " + node.kind + "/" + node.id);
    const result = { hash, depth };
    computed.set(id, result);
    state.set(id, "done");
    return result;
  };
  for (const node of nodes.values()) visit(node, 1);

  const reachable = new Set<string>();
  const collect = (key: ReferenceKey): void => {
    const id = nodeKey(key);
    if (reachable.has(id)) return;
    reachable.add(id);
    const node = nodes.get(id)!;
    for (const reference of node.references) collect(reference);
  };
  for (const root of roots) collect(root);
  if (reachable.size !== nodes.size) fail("Reference graph contains unreachable extra nodes");

  const closure = [...reachable].map((id) => nodes.get(id)!).sort(compareReference);
  return { question, nodes, closure };
}

function questionProjection(question: QuestionVersion): Record<string, unknown> {
  const { contentHash: _contentHash, ...projection } = question;
  return projection;
}

/** Build identity/1 bytes and digest without comparing or changing question.contentHash. */
export function computeQuestionIdentity(questionInput: unknown, referenceInput: unknown): QuestionIdentity {
  const validated = validateGraph(questionInput, referenceInput);
  const references = validated.closure.map(({ kind, id, contentHash }) => ({ kind, id, contentHash }));
  const bytes = canonicalize({
    canonicalizationVersion: "identity/1",
    question: questionProjection(validated.question),
    references,
  });
  return { bytes, contentHash: sha256(bytes) };
}

const COLLAPSIBLE_WHITESPACE = /[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu;

function normalizeHumanStrings(value: unknown, key?: string): JsonValue {
  if (typeof value === "string") {
    return key === "tex" ? value : value.normalize("NFC").replace(COLLAPSIBLE_WHITESPACE, " ").replace(/^ | $/gu, "");
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeHumanStrings(entry));
  if (value !== null && typeof value === "object") {
    const result: { [key: string]: JsonValue } = Object.create(null) as { [key: string]: JsonValue };
    for (const [childKey, childValue] of Object.entries(value)) result[childKey] = normalizeHumanStrings(childValue, childKey);
    return result;
  }
  return value as JsonPrimitive;
}

function fingerprintBlocks(blocks: readonly unknown[], nodes: Map<string, ReferenceNode>): JsonValue[] {
  return blocks.map((rawBlock) => {
    const block = rawBlock as Record<string, unknown>;
    if (block.type !== "image") return normalizeHumanStrings(block);
    const key = { kind: "asset" as const, id: block.assetVersionId as string };
    const asset = nodes.get(nodeKey(key));
    if (!asset) fail("Missing resolved asset " + key.id);
    const projected: Record<string, unknown> = { ...block };
    delete projected.assetVersionId;
    projected.assetPayloadHash = sha256(canonicalize(asset.payload));
    return normalizeHumanStrings(projected);
  });
}

function fingerprintInteraction(interaction: QuestionVersion["interaction"], nodes: Map<string, ReferenceNode>): JsonValue {
  if (interaction.type === "TRUE_FALSE_GROUP") {
    return {
      type: interaction.type,
      statements: interaction.statements.map(({ id: _id, content }) => ({ content: fingerprintBlocks(content, nodes) })),
    };
  }
  const options = interaction.options.map(({ id: _id, content }) => ({ content: fingerprintBlocks(content, nodes) }));
  if (interaction.type === "SINGLE_CHOICE") return { type: interaction.type, options };
  return {
    type: interaction.type,
    options,
    minSelections: interaction.minSelections,
    maxSelections: interaction.maxSelections,
  };
}

/** Build fingerprint/1 bytes and digest from resolved immutable stimulus and asset payloads. */
export function computeDuplicateFingerprint(questionInput: unknown, referenceInput: unknown): DuplicateFingerprint {
  const validated = validateGraph(questionInput, referenceInput);
  let stimulus: JsonValue = null;
  if (validated.question.stimulusVersionId !== null) {
    const node = validated.nodes.get(nodeKey({ kind: "stimulus", id: validated.question.stimulusVersionId }));
    if (!node) fail("Missing resolved stimulus");
    if (!Object.hasOwn(node.payload, "content") || !Array.isArray(node.payload.content)) fail("Stimulus payload must include content blocks");
    const content = StimulusBlocksSchema.parse(node.payload.content);
    stimulus = fingerprintBlocks(content, validated.nodes);
  }
  const content = fingerprintBlocks(validated.question.content, validated.nodes);
  const interaction = fingerprintInteraction(validated.question.interaction, validated.nodes);
  const normalizedStimulus = stimulus === null ? null : normalizeHumanStrings(stimulus);
  const bytes = canonicalize({
    fingerprintVersion: "fingerprint/1",
    content: normalizeHumanStrings(content),
    interaction: normalizeHumanStrings(interaction),
    stimulus: normalizedStimulus,
  });
  return { bytes, fingerprint: sha256(bytes) };
}
