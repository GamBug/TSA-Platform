import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  canonicalize, computeDuplicateFingerprint, computeQuestionIdentity, createReferenceHash,
  parseFactoryPackageV2, ReferenceNodeV2Schema, RightsEvidenceRecordSchema,
} from '../../packages/contracts/dist/internal.js';
import { assertSafeQuestionContent } from '../../src/modules/bank/content-safety.mjs';
import { createFakeGenerationAdapter } from '../../src/modules/generation/fake-adapter.mjs';
import { inspectGenerationResponse } from '../../src/modules/generation/response-validation.mjs';

const LIMIT = 16 * 1024 * 1024;
const bindingFields = ['itemKey', 'candidateOrdinal', 'questionVersionId', 'questionId', 'versionNo',
  'parentVersionId', 'domainId', 'subskillIds', 'difficulty', 'stimulusVersionId', 'provenanceIds', 'evidenceRefs'];
const key = (ref) => `${ref.kind}\0${ref.id}`;
const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
function fail() { throw new Error('INVALID_GENERIC_FIXTURE'); }
function strict(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) fail();
}
function nonblank(value) {
  if (typeof value !== 'string' || value.length > 256 || value.trim() !== value || value === '') fail();
}
function safeInput(value) {
  const active = new Set(); let nodes = 0;
  function inspect(item, depth) {
    if (++nodes > 100_000 || depth > 32 || types.isProxy(item)) fail();
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail(); return; }
    if (typeof item === 'string') { if (item.length > LIMIT) fail(); return; }
    if (typeof item !== 'object' || active.has(item)) fail();
    const array = Array.isArray(item);
    if (![Object.prototype, null, ...(array ? [Array.prototype] : [])].includes(Object.getPrototypeOf(item))) fail();
    active.add(item);
    for (const name of Reflect.ownKeys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, name);
      if (typeof name !== 'string' || !Object.hasOwn(descriptor, 'value')) fail();
      if (array && name === 'length') continue;
      if (!descriptor.enumerable) fail();
      inspect(descriptor.value, depth + 1);
    }
    active.delete(item);
  }
  inspect(value, 0);
  const bytes = canonicalize(value);
  if (bytes.byteLength > LIMIT) fail();
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

function checkedReferences(values) {
  if (!Array.isArray(values) || values.length > 2_000) fail();
  const refs = values.map((value) => ReferenceNodeV2Schema.parse(value));
  const byKey = new Map();
  for (const ref of refs) { if (byKey.has(key(ref)) || ref.kind === 'asset') fail(); byKey.set(key(ref), ref); }
  const done = new Map(), visiting = new Set();
  function hash(ref, depth = 0) {
    if (!ref || depth > 32 || visiting.has(key(ref))) fail();
    if (done.has(key(ref))) return done.get(key(ref));
    visiting.add(key(ref));
    const edges = ref.references.map((edge) => ({ ...edge, contentHash: hash(byKey.get(key(edge)), depth + 1) }));
    const actual = createReferenceHash({ kind: ref.kind, id: ref.id, payload: ref.payload, references: edges });
    if (actual !== ref.contentHash) fail();
    visiting.delete(key(ref)); done.set(key(ref), actual); return actual;
  }
  refs.forEach((ref) => hash(ref));
  return { refs, byKey };
}

function closure(question, byKey) {
  const roots = [{ kind: 'taxonomy', id: question.taxonomyVersionId },
    ...question.provenanceIds.map((id) => ({ kind: 'provenance', id })),
    ...question.private.evidenceRefs.map((id) => ({ kind: 'evidence', id }))];
  if (question.parentVersionId) roots.push({ kind: 'question', id: question.parentVersionId });
  if (question.stimulusVersionId) roots.push({ kind: 'stimulus', id: question.stimulusVersionId });
  const found = new Map();
  function visit(edge, depth = 0) {
    if (depth > 32) fail();
    if (found.has(key(edge))) return;
    const ref = byKey.get(key(edge)); if (!ref) fail();
    found.set(key(edge), ref); ref.references.forEach((child) => visit(child, depth + 1));
  }
  roots.forEach((ref) => visit(ref));
  return [...found.values()];
}

function bind(question, binding, context) {
  strict(binding, bindingFields);
  nonblank(binding.itemKey);
  if (!Number.isSafeInteger(binding.candidateOrdinal) || binding.candidateOrdinal < 0) fail();
  const expected = { id: binding.questionVersionId, questionId: binding.questionId, versionNo: binding.versionNo,
    parentVersionId: binding.parentVersionId, domainId: binding.domainId, subskillIds: binding.subskillIds,
    difficulty: binding.difficulty, stimulusVersionId: binding.stimulusVersionId,
    provenanceIds: binding.provenanceIds, createdBy: context.operatorId, createdAt: context.at,
    generationRunId: null, origin: 'GENERATED' };
  for (const [field, value] of Object.entries(expected)) if (digest(question[field]) !== digest(value)) fail();
  if (digest(question.private.evidenceRefs) !== digest(binding.evidenceRefs)) fail();
}

/** Pure fixture composition. Transport validity is never rights or publication approval. */
export async function exportGenericFixturePackage(input) {
  try {
    const value = safeInput(input);
    strict(value, ['calls', 'context']);
    const { calls, context } = value;
    strict(context, ['fixture', 'namespace', 'batch', 'at', 'operatorId', 'references', 'rightsEvidence']);
    if (context.fixture !== true || !Array.isArray(calls) || calls.length === 0 || calls.length > 100) fail();
    for (const field of ['namespace', 'batch', 'at', 'operatorId']) nonblank(context[field]);
    if (!Number.isFinite(Date.parse(context.at))) fail();
    const { refs, byKey } = checkedReferences(context.references);
    if (!Array.isArray(context.rightsEvidence)) fail();
    const rightsEvidence = context.rightsEvidence.map((value) => RightsEvidenceRecordSchema.parse(value));
    const adapter = createFakeGenerationAdapter(calls.map((call) => {
      strict(call, ['request', 'approvedSourcePayload', 'fixtureResult', 'bindings']);
      return { request: call.request, approvedSourcePayload: call.approvedSourcePayload, resultOrError: call.fixtureResult };
    }));
    const candidates = [], fingerprints = new Set(), identities = new Set(), versions = new Set(), transportKeys = new Set();
    const runs = [];
    for (const call of calls) {
      const { request, approvedSourcePayload, bindings } = call;
      strict(approvedSourcePayload, ['schemaVersion', 'sources']);
      if (approvedSourcePayload.schemaVersion !== 'generic-approved-source/1'
          || !Array.isArray(approvedSourcePayload.sources) || !Array.isArray(bindings)
          || bindings.length !== request.count || digest(request.sourceVersionIds) !== digest(approvedSourcePayload.sources.map((s) => s.sourceVersionId))) fail();
      for (const source of approvedSourcePayload.sources) {
        strict(source, ['sourceVersionId', 'title', 'content']);
        const node = byKey.get(key({ kind: 'source', id: source.sourceVersionId }));
        if (!node || digest(node.payload) !== digest({ title: source.title, content: source.content })) fail();
      }
      const output = await adapter.generate(request, approvedSourcePayload);
      const responseBytes = Buffer.from(JSON.stringify(output));
      const checked = inspectGenerationResponse(Buffer.from(JSON.stringify(request)), responseBytes);
      if (checked.status !== 'STRUCTURALLY_VALID') fail();
      const run = { generationRunId: null, providerRunRef: null,
        adapterRevision: adapter.capabilities().adapterRevision, modelRevision: output.modelRevision,
        promptTemplateVersion: request.promptTemplateVersion, inputHash: digest({ request, approvedSourcePayload }),
        responseHash: checked.responseHash, sourceVersionIds: request.sourceVersionIds,
        seed: request.seed, usage: output.usage };
      runs.push({ requestId: request.requestId, inputHash: run.inputHash, responseHash: run.responseHash });
      for (const [index, question] of checked.candidates.entries()) {
        bind(question, bindings[index], context);
        const graph = closure(question, byKey);
        const fingerprint = computeDuplicateFingerprint(question, graph).fingerprint;
        if (fingerprints.has(fingerprint) || identities.has(question.questionId) || versions.has(question.id)) fail();
        fingerprints.add(fingerprint); identities.add(question.questionId); versions.add(question.id);
        const contentHash = computeQuestionIdentity(question, graph).contentHash;
        question.contentHash = contentHash;
        assertSafeQuestionContent(question, graph);
        const provenance = question.provenanceIds.map((id) => byKey.get(key({ kind: 'provenance', id }))?.payload);
        const binding = bindings[index];
        const transportKey = JSON.stringify([binding.itemKey, binding.candidateOrdinal]);
        if (transportKeys.has(transportKey)) fail(); transportKeys.add(transportKey);
        candidates.push({ itemKey: binding.itemKey, candidateOrdinal: binding.candidateOrdinal,
          contentHash, question, provenance, run,
          validations: ['GENERIC_SCHEMA', 'CONTENT_SAFETY', 'PACKAGE_EXACT_DUPLICATE'].map((validatorKind) => ({
            validatorKind, validatorVersion: 'generic-fixture/1', inputHash: contentHash, outcome: 'PASS',
            evidencePointer: `private-fixture:${run.responseHash}`, at: context.at, actor: context.operatorId,
          })) });
        if (candidates.length > 100) fail();
      }
    }
    const pkg = parseFactoryPackageV2({ schemaVersion: 'factory-package/2', producerNamespace: context.namespace,
      batchKey: context.batch, candidates, references: refs, assets: [], rightsEvidence });
    return { package: pkg, packageBytes: Buffer.from(canonicalize(pkg)),
      report: { fixture: true, liveLlmCalled: false, humanReview: 'NOT_PERFORMED', publication: 'NOT_PERFORMED',
        candidates: candidates.length, runs, limitations: ['No semantic answer or legal rights verification.', 'Canonical import still creates DRAFT only.'] } };
  } catch {
    throw new Error('INVALID_GENERIC_FIXTURE');
  }
}
