import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildCorpusMathPackage } from '../../tools/corpus-ingest/math-package.mjs';
import { buildManualFactoryPackageV3, parseManualFactoryPackageV3 } from '../../packages/contracts/dist/internal.js';
import { computeQuestionIdentity, createReferenceHash } from '../../packages/contracts/dist/identity.js';
import { configureCorpusImport } from '../../tools/corpus-ingest/verify-reading.mjs';
import { loadManualImportConfiguration, beginManualImportAdmission, reconcileManualImportAdmission }
  from '../../src/modules/bank/manual-import-configuration.mjs';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { factoryImportNamespace } from '../../src/modules/bank/factory-namespace.mjs';

function taxonomy(domainCode = 'MATH') {
  const domainId = randomUUID();
  return { schemaVersion: 'taxonomy/1', taxonomyVersionId: randomUUID(), name: `${domainCode} test taxonomy`,
    versionNo: 1, definitionHash: `sha256:${'a'.repeat(64)}`, nodes: [
      { id: domainId, code: domainCode, kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: randomUUID(), code: `${domainCode}_REASONING`, kind: 'SKILL', parentId: domainId, metadata: {} },
    ] };
}

function items(count = 20) {
  return Array.from({ length: count }, (_, index) => {
    const sourcePath = `TSA_Example_Questions/Toan/${index + 1}.png`;
    const publicItem = index === 1
      ? { prompt: `Evaluate statement ${index + 1}.`, statements: [
        { id: 's1', content: [{ type: 'text', text: 'The value is positive.' }] },
        { id: 's2', content: [{ type: 'text', text: 'The value is odd.' }] },
      ] }
      : { prompt: `Solve expression ${index + 1}.`, options: ['A', 'B', 'C', 'D'].map((id) => ({
        id, content: [{ type: 'text', text: `Choice ${id} for problem ${index + 1}.` }],
      })) };
    return { id: sourcePath, sourcePath, sourceHash: `sha256:${String(index + 1).padStart(64, '0')}`,
      public: publicItem,
      private: { answerKey: index === 1
        ? { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } }
        : index === 2 ? { type: 'MULTIPLE_CHOICE', optionIds: ['B', 'C'] }
          : { type: 'SINGLE_CHOICE', optionId: 'B' },
      explanation: null, extractedKeyText: `revealed key marker ${index + 1}` },
      proposedTaxonomy: { section: 'MATH', topic: 'SEQUENCES', status: 'REQUIRES_VERIFICATION' } };
  });
}

function rehash(pkg) {
  const nodes = pkg.references;
  const byKey = new Map(nodes.map((node) => [`${node.kind}:${node.id}`, node]));
  const hashes = new Map();
  const hash = (node) => {
    const key = `${node.kind}:${node.id}`;
    if (hashes.has(key)) return hashes.get(key);
    const references = node.references.map((ref) => ({ ...ref, contentHash: hash(byKey.get(`${ref.kind}:${ref.id}`)) }));
    const value = createReferenceHash({ kind: node.kind, id: node.id, payload: node.payload, references });
    hashes.set(key, value); node.contentHash = value; return value;
  };
  nodes.forEach(hash);
  for (const candidate of pkg.candidates) {
    const question = candidate.question;
    const found = new Map();
    const visit = (kind, id) => {
      if (id === null) return;
      const key = `${kind}:${id}`;
      if (found.has(key)) return;
      const node = byKey.get(key); found.set(key, node);
      node.references.forEach((ref) => visit(ref.kind, ref.id));
    };
    visit('taxonomy', question.taxonomyVersionId);
    question.provenanceIds.forEach((id) => visit('provenance', id));
    question.private.evidenceRefs.forEach((id) => visit('evidence', id));
    const identity = computeQuestionIdentity(question, [...found.values()]);
    candidate.contentHash = identity.contentHash;
    question.contentHash = identity.contentHash;
    candidate.validations.forEach((validation) => { validation.inputHash = identity.contentHash; });
  }
  return pkg;
}

test('corpus Math packages keep independent choice and true-false DRAFTs bound to private image provenance', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceItems = items();
  const prepared = await buildCorpusMathPackage({ items: sourceItems, taxonomy: taxonomy(), authorId: randomUUID(),
    directory: join(root, 'package'), batchKey: 'math-scan-001' });
  const pkg = parseManualFactoryPackageV3(prepared.package);

  assert.equal(pkg.profile, 'corpus-math-draft/1');
  assert.match(factoryImportNamespace(pkg), /^factory\/3\/sha256:[a-f0-9]{64}$/u);
  assert.notEqual(factoryImportNamespace(pkg), factoryImportNamespace({ ...pkg, profile: 'corpus-reading-draft/1' }));
  assert.equal(pkg.candidates.length, 20);
  assert.equal(pkg.manualRun.kind, 'SUBSCRIPTION_VISION_TRANSCRIPTION');
  assert.equal(pkg.manualRun.providerCalled, false);
  assert.equal(pkg.sourceAuthoring[0].kind, 'CORPUS_IMPORTED');
  assert.equal(pkg.candidates[0].question.section, 'MATH');
  assert.equal(pkg.candidates[0].question.domainId, 'MATH');
  assert.equal(pkg.candidates[0].question.stimulusVersionId, null);
  assert.equal(pkg.candidates[0].question.interaction.type, 'SINGLE_CHOICE');
  assert.equal(pkg.candidates[1].question.interaction.type, 'TRUE_FALSE_GROUP');
  assert.equal(pkg.candidates[2].question.interaction.type, 'MULTIPLE_CHOICE');
  assert.deepEqual({ min: pkg.candidates[2].question.interaction.minSelections,
    max: pkg.candidates[2].question.interaction.maxSelections }, { min: 1, max: 4 });
  assert.deepEqual(pkg.candidates[1].question.private.answerKey, { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } });
  assert.equal(pkg.candidates[0].question.private.explanation[0].text,
    'No explanation retained in the source capture. Owner review required.');
  for (let index = 0; index < pkg.candidates.length; index += 1) {
    const candidate = pkg.candidates[index];
    const extractedKeyText = sourceItems[index].private.extractedKeyText;
    assert.equal(JSON.stringify({ content: candidate.question.content, interaction: candidate.question.interaction })
      .includes(extractedKeyText), false);
    assert.equal(candidate.question.origin, 'IMPORTED');
  }
  const declaration = JSON.parse(prepared.artifacts.sourceDeclaration.toString());
  assert.equal(declaration.sourceCaptures.length, 20);
  assert.equal(declaration.sourceCaptures[0].path, sourceItems[0].sourcePath);
  assert.equal(declaration.sourceCaptures[0].hash, sourceItems[0].sourceHash);
  const storedSourceText = JSON.parse(prepared.artifacts.input.toString()).sources[0].text;
  assert.equal(storedSourceText.includes(sourceItems[0].private.extractedKeyText), false);
});

test('Math reconstruction rejects a rehashed canonical answer edit and wrong-domain package input', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-tamper-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = await buildCorpusMathPackage({ items: items(), taxonomy: taxonomy(), authorId: randomUUID(),
    directory: join(root, 'package'), batchKey: 'math-scan-002' });
  const changed = structuredClone(prepared.package);
  changed.candidates[0].question.private.answerKey.optionId = 'A';
  assert.throws(() => parseManualFactoryPackageV3(rehash(changed)));

  await assert.rejects(buildCorpusMathPackage({ items: items(), taxonomy: taxonomy('READING'), authorId: randomUUID(),
    directory: join(root, 'wrong-domain'), batchKey: 'math-wrong-domain' }));
});

test('Math packages accept a partial tail but reject duplicate capture identities and malformed source hashes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-tail-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prepared = await buildCorpusMathPackage({ items: items(3), taxonomy: taxonomy(), authorId: randomUUID(),
    directory: join(root, 'package'), batchKey: 'math-tail' });
  assert.equal(parseManualFactoryPackageV3(prepared.package).candidates.length, 3);
  const duplicates = items(2); duplicates[1].sourcePath = duplicates[0].sourcePath; duplicates[1].id = duplicates[0].id;
  await assert.rejects(buildCorpusMathPackage({ items: duplicates, taxonomy: taxonomy(), authorId: randomUUID(),
    directory: join(root, 'duplicate'), batchKey: 'math-duplicate' }));
  const invalidHash = items(1); invalidHash[0].sourceHash = 'not-a-hash';
  await assert.rejects(buildCorpusMathPackage({ items: invalidHash, taxonomy: taxonomy(), authorId: randomUUID(),
    directory: join(root, 'invalid-hash'), batchKey: 'math-invalid-hash' }));
});

test('Math admission journals reconcile twenty candidates and deny oversized admissions before writing', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tax = taxonomy();
  const prepared = await buildCorpusMathPackage({ items: items(), taxonomy: tax, authorId: randomUUID(),
    directory: join(root, 'package'), batchKey: 'math-journal' });
  const args = await configureCorpusImport(root, prepared, tax);
  const config = await loadManualImportConfiguration(args);
  const admission = await beginManualImportAdmission(config, prepared.package);
  const pending = await loadManualImportConfiguration({ ...args, allowPending: true });
  assert.equal(pending.pendingAdmissions.get(admission.admissionId).candidateVersionIds.length, 20);
  await reconcileManualImportAdmission({ ...args, admissionId: admission.admissionId,
    approvedReconciliationHash: jsonDigest({ activationHash: args.approvedActivationHash,
      admissionId: admission.admissionId, manifestHash: admission.manifestHash }), verify: async () => 'ABSENT' });
  assert.equal((await loadManualImportConfiguration(args)).pendingAdmissions.size, 0);
  await assert.rejects(beginManualImportAdmission(config,
    { ...prepared.package, candidates: [...prepared.package.candidates, prepared.package.candidates[0]] }),
  { code: 'MANUAL_IMPORT_CONFIGURATION_INVALID' });
  assert.equal((await loadManualImportConfiguration(args)).pendingAdmissions.size, 0);
});
