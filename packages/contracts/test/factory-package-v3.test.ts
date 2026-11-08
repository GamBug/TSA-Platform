import assert from "node:assert/strict";
import { test } from "node:test";

import { buildManualFactoryPackageV3, digestManualCanonical, parseManualFactoryPackageV3, parseManualImportMapping } from "../src/factory-package-v3.ts";

const enc = new TextEncoder();
import {buildManualFixture} from "./fixtures/manual-factory-package.ts";
import { computeQuestionIdentity, createReferenceHash, type ReferenceNode } from "../src/identity.ts";
import { parseManualJsonBytes } from "../src/manual-json.ts";

function rehash(pkg: ReturnType<typeof buildManualFactoryPackageV3>) {
  const nodes = pkg.references as ReferenceNode[];
  const byKey = new Map(nodes.map((node) => [node.kind + ':' + node.id, node]));
  const hashes = new Map<string, string>();
  const hash = (node: ReferenceNode): string => {
    const key = node.kind + ':' + node.id;
    if (hashes.has(key)) return hashes.get(key)!;
    const references = node.references.map((ref) => ({ ...ref, contentHash: hash(byKey.get(ref.kind + ':' + ref.id)!) }));
    const value = createReferenceHash({ kind: node.kind, id: node.id, payload: node.payload, references });
    hashes.set(key, value); node.contentHash = value; return value;
  };
  nodes.forEach(hash);
  for (const candidate of pkg.candidates) {
    const q = candidate.question;
    const found = new Map<string, ReferenceNode>();
    const visit = (kind: string, id: string): void => {
      const key = kind + ':' + id; if (found.has(key)) return;
      const node = byKey.get(key)!; found.set(key, node);
      node.references.forEach((ref) => visit(ref.kind, ref.id));
    };
    visit('taxonomy', q.taxonomyVersionId); visit('stimulus', q.stimulusVersionId!);
    q.provenanceIds.forEach((id) => visit('provenance', id)); q.private.evidenceRefs.forEach((id) => visit('evidence', id));
    const identity = computeQuestionIdentity(q, [...found.values()]);
    candidate.contentHash = identity.contentHash; q.contentHash = identity.contentHash;
    candidate.validations.forEach((validation) => { validation.inputHash = identity.contentHash; });
  }
  return pkg;
}

test("manual v3 builder validates its raw-to-canonical private package", () => {
  const value = buildManualFixture();
  const built = buildManualFactoryPackageV3(value);
  assert.equal(parseManualFactoryPackageV3(built).candidates.length, 10);
  assert.equal(parseManualFactoryPackageV3(JSON.stringify(built)).candidates.length, 10);
  assert.equal(parseManualFactoryPackageV3(enc.encode(JSON.stringify(built))).candidates.length, 10);
  assert.equal(built.manualRun.usage, null);
  assert.equal(built.assets.length, 0);
  assert.equal(parseManualImportMapping(value.mapping).candidates.length, 10);
  assert.throws(() => parseManualImportMapping({ ...value.mapping, candidates: value.mapping.candidates.slice(0, 9) }));
  assert.throws(() => parseManualFactoryPackageV3({ schemaVersion: "factory-package/3" }));
  assert.throws(() => parseManualFactoryPackageV3('{"schemaVersion":"factory-package/3","schemaVersion":"factory-package/3"}'), /Duplicate JSON object key/);
});

test('self-consistent canonical edits cannot replace the exact raw output or its source evidence', () => {
  const original = buildManualFactoryPackageV3(buildManualFixture());
  const changes = [
    (p: typeof original) => { p.candidates[0]!.question.private.answerKey = { type: 'SINGLE_CHOICE', optionId: 'a' }; },
    (p: typeof original) => { p.candidates[0]!.question.content[0] = { type: 'text', text: 'An edited prompt' }; },
    (p: typeof original) => { p.candidates[0]!.question.private.explanation[0] = { type: 'text', text: 'An edited explanation' }; },
    (p: typeof original) => { p.candidates[0]!.question.cognitiveLevel = 'M3'; },
    (p: typeof original) => { p.references.find((n) => n.id === 'manual-evidence-0')!.payload.distractorReasons = []; },
    (p: typeof original) => { p.references.find((n) => n.id === 'manual-map-0')!.payload.rawQuestionId = 'unrelated'; },
    (p: typeof original) => { p.candidates[0]!.question.difficulty.target = 'HARD'; },
  ];
  for (const change of changes) {
    const pkg = structuredClone(original); change(pkg); rehash(pkg);
    assert.throws(() => parseManualFactoryPackageV3(pkg));
  }
});

test('typed edges, orphan nodes, stale hashes and circular reference claims fail independently', () => {
  const original = buildManualFactoryPackageV3(buildManualFixture());
  const orphan = structuredClone(original);
  orphan.references.push({ kind: 'evidence', id: 'orphan', payload: { claim: 'orphan' }, references: [], contentHash: 'sha256:' + '0'.repeat(64) });
  rehash(orphan); assert.throws(() => parseManualFactoryPackageV3(orphan));
  const edge = structuredClone(original);
  edge.references.find((n) => n.kind === 'stimulus')!.references.push({ kind: 'source', id: original.sourcePermissions[0]!.sourceVersionId });
  rehash(edge); assert.throws(() => parseManualFactoryPackageV3(edge));
  const stale = structuredClone(original); stale.references[0]!.contentHash = 'sha256:' + '0'.repeat(64);
  assert.throws(() => parseManualFactoryPackageV3(stale));
  const cycle = structuredClone(original);
  cycle.references[0]!.references.push({ kind: cycle.references[0]!.kind, id: cycle.references[0]!.id });
  assert.throws(() => parseManualFactoryPackageV3(cycle));
});

test('raw artifact integrity and truthful manual metadata cannot be replaced by provider or rights claims', () => {
  const original = buildManualFactoryPackageV3(buildManualFixture());
  for (const mutate of [
    (p: typeof original) => { p.manualRun.usage = { inputTokens: 0 } as never; },
    (p: typeof original) => { p.manualRun.providerCalled = true as never; },
    (p: typeof original) => { p.sourcePermissions[0]!.state = 'OWNED' as never; },
    (p: typeof original) => { p.sourceAuthoring[0]!.scientificVerification = 'VERIFIED' as never; },
    (p: typeof original) => { p.references.find((n) => n.id === 'artifact-response')!.payload.bytesBase64 = 'e30='; },
    (p: typeof original) => { p.references.find((n) => n.id === 'artifact-response')!.payload.byteLength = 0; },
    (p: typeof original) => { p.candidates[0]!.validations[0]!.validatorKind = 'HUMAN_APPROVED'; },
  ]) { const pkg = structuredClone(original); mutate(pkg); assert.throws(() => parseManualFactoryPackageV3(pkg)); }
});

test('strict raw formats reject changed schema, declaration, source, answer evidence and cognition quota', () => {
  for (const [name, mutate] of [
    ['input', (v: any) => { v.sources[0].rights.state = 'OWNED'; }],
    ['input', (v: any) => { v.unexpected = true; }],
    ['response', (v: any) => { v.questions[0].evidence.quote = 'Invented'; }],
    ['response', (v: any) => { v.questions[0].cognitiveLevel = 'M3'; }],
    ['response', (v: any) => { v.questions[0].content = [{ type: 'text', text: '<script>unsafe</script>' }]; }],
    ['declaration', (v: any) => { v.usage = { inputTokens: 0, outputTokens: 0 }; }],
    ['declaration', (v: any) => { v.operatorId = '00000000-0000-4000-8000-000000000999'; }],
    ['prompt', (v: any) => { v.version = 'unknown-template'; }],
  ] as const) {
    const fixture = buildManualFixture();
    const value = JSON.parse(new TextDecoder().decode(fixture.artifacts[name])); mutate(value);
    fixture.artifacts[name] = enc.encode(JSON.stringify(value));
    assert.throws(() => buildManualFactoryPackageV3(fixture));
  }
  const oversized = buildManualFixture(); oversized.artifacts.response = new Uint8Array(128 * 1024 + 1);
  assert.throws(() => buildManualFactoryPackageV3(oversized));
});

test('JSON grammar rejects escaped duplicate keys, malformed Unicode, invalid UTF8 and excessive depth before object inspection', () => {
  for (const text of ['{"a":1,"\\u0061":2}', '{"\\n":1,"\\u000a":2}', '{"x":"\\ud800"}', '['.repeat(70) + '0' + ']'.repeat(70)]) {
    assert.throws(() => parseManualJsonBytes(enc.encode(text), 'untrusted'));
  }
  assert.throws(() => parseManualJsonBytes(new Uint8Array([123, 255, 125]), 'untrusted'));
  let accessed = 0;
  const proxy = new Proxy({}, { get() { accessed++; throw new Error('must not execute'); }, getPrototypeOf() { accessed++; return null; } });
  assert.throws(() => parseManualFactoryPackageV3(proxy)); assert.equal(accessed, 0);
  const accessor = Object.defineProperty({}, 'x', { enumerable: true, get() { accessed++; return true; } });
  assert.throws(() => parseManualFactoryPackageV3(accessor)); assert.equal(accessed, 0);
  const cyclic: any = {}; cyclic.self = cyclic; assert.throws(() => parseManualFactoryPackageV3(cyclic));
});

test('explicit identity mapping rejects duplicates, changed taxonomy kinds and incomplete bundle membership', () => {
  const fixture = buildManualFixture();
  const mapping = structuredClone(fixture.mapping); mapping.candidates[1]!.questionId = mapping.candidates[0]!.questionId;
  assert.throws(() => parseManualImportMapping(mapping));
  const skill = structuredClone(fixture); skill.mapping.taxonomy.nodes[1]!.registeredCode = 'other';
  assert.throws(() => buildManualFactoryPackageV3(skill));
  const stimulus = structuredClone(fixture.mapping); stimulus.candidates[1]!.stimulusVersionId = stimulus.candidates[1]!.questionId;
  assert.throws(() => parseManualImportMapping(stimulus));
});
