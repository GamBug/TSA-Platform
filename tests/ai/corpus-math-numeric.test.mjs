import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildCorpusMathNumericPackage, canonicalNumericKey, NUMERIC_PRODUCER_NAMESPACE }
  from '../../tools/corpus-ingest/math-numeric-package.mjs';
import { buildCorpusMathPackage } from '../../tools/corpus-ingest/math-package.mjs';
import { parseManualFactoryPackageV3 } from '../../packages/contracts/dist/internal.js';
import { QuestionVersionV2Schema } from '../../packages/contracts/dist/question-v2.js';
import { configureCorpusImport } from '../../tools/corpus-ingest/verify-reading.mjs';
import { loadManualImportConfiguration, beginManualImportAdmission } from '../../src/modules/bank/manual-import-configuration.mjs';
import { factoryImportNamespace } from '../../src/modules/bank/factory-namespace.mjs';

function taxonomy(domainCode = 'MATH') {
  const domainId = randomUUID();
  return { schemaVersion: 'taxonomy/1', taxonomyVersionId: randomUUID(), name: `${domainCode} numeric test taxonomy`,
    versionNo: 1, definitionHash: `sha256:${'b'.repeat(64)}`, nodes: [
      { id: domainId, code: domainCode, kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: randomUUID(), code: `${domainCode}_REASONING`, kind: 'SKILL', parentId: domainId, metadata: {} },
    ] };
}

const KEYS = ['1156', '-1', '0.25', '135.5', '382112784'];

function numericItems(count = 5) {
  return Array.from({ length: count }, (_, index) => {
    const sourcePath = `TSA_Example_Questions/Toan/${index + 1}.png`;
    return { id: sourcePath, sourcePath, sourceHash: `sha256:${String(index + 1).padStart(64, '0')}`,
      public: { prompt: `Điền một số thích hợp vào chỗ trống cho bài ${index + 1}: $x^2=____$.` },
      private: { answerKey: { type: 'NUMERIC_RESPONSE', value: KEYS[index % KEYS.length] }, explanation: null,
        extractedKeyText: `Đáp án: ${KEYS[index % KEYS.length]}` },
      proposedTaxonomy: { section: 'MATH', topic: 'NUMBER_THEORY', status: 'REQUIRES_VERIFICATION' } };
  });
}

test('numeric Math packages carry independent question/2 DRAFTs with a private canonical decimal key', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-numeric-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceItems = numericItems();
  const prepared = await buildCorpusMathNumericPackage({ items: sourceItems, taxonomy: taxonomy(), authorId: randomUUID(),
    directory: join(root, 'package'), batchKey: 'math-numeric-001' });
  const pkg = parseManualFactoryPackageV3(prepared.package);

  assert.equal(pkg.profile, 'corpus-math-numeric-draft/1');
  assert.equal(pkg.producerNamespace, NUMERIC_PRODUCER_NAMESPACE);
  assert.match(factoryImportNamespace(pkg), /^factory\/3\/sha256:[a-f0-9]{64}$/u);
  assert.notEqual(factoryImportNamespace(pkg), factoryImportNamespace({ ...pkg, profile: 'corpus-math-draft/1' }));
  assert.equal(pkg.candidates.length, 5);
  assert.equal(pkg.manualRun.kind, 'SUBSCRIPTION_VISION_TRANSCRIPTION');
  assert.equal(pkg.manualRun.providerCalled, false);
  for (const [index, candidate] of pkg.candidates.entries()) {
    const question = candidate.question;
    assert.equal(question.schemaVersion, 'question/2');
    assert.equal(question.private.scoringPolicy, 'practice-binary-v2');
    assert.equal(question.section, 'MATH');
    assert.equal(question.stimulusVersionId, null);
    assert.equal(question.origin, 'IMPORTED');
    assert.deepEqual(question.interaction, { type: 'NUMERIC_RESPONSE', label: 'Đáp án (số thập phân)', format: 'DECIMAL' });
    assert.deepEqual(question.private.answerKey, { type: 'NUMERIC_RESPONSE', value: KEYS[index] });
    assert.equal(QuestionVersionV2Schema.safeParse(question).success, true);
    assert.equal(JSON.stringify({ content: question.content, interaction: question.interaction })
      .includes(sourceItems[index].private.extractedKeyText), false);
    assert.equal(candidate.itemKey, 'corpus-math-numeric-item');
  }
  const storedSourceText = JSON.parse(prepared.artifacts.input.toString()).sources[0].text;
  assert.equal(storedSourceText.includes('Đáp án:'), false);
});

test('numeric packages reject non-canonical keys, wrong domains, duplicate captures and tampered keys', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-numeric-bad-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const build = (items, name, tax = taxonomy()) => buildCorpusMathNumericPackage({ items, taxonomy: tax, authorId: randomUUID(),
    directory: join(root, name), batchKey: name });
  for (const [name, value] of [['comma', '0,25'], ['fraction', '1/2'], ['padded', '007'], ['exponent', '1e3'], ['blank', '']]) {
    const bad = numericItems(1); bad[0].private.answerKey.value = value;
    await assert.rejects(build(bad, `key-${name}`), undefined, name);
  }
  await assert.rejects(build(numericItems(), 'wrong-domain', taxonomy('READING')));
  const duplicates = numericItems(2); duplicates[1].sourcePath = duplicates[0].sourcePath; duplicates[1].id = duplicates[0].id;
  await assert.rejects(build(duplicates, 'duplicate'));
  const leaked = numericItems(1); leaked[0].public.prompt += ` ${leaked[0].private.extractedKeyText}`;
  await assert.rejects(build(leaked, 'leak'), /ANSWER_TEXT_LEAK/u);
  const prepared = await build(numericItems(2), 'tamper');
  const changed = structuredClone(prepared.package);
  changed.candidates[0].question.private.answerKey.value = '999';
  assert.throws(() => parseManualFactoryPackageV3(changed));
  assert.throws(() => parseManualFactoryPackageV3({ ...prepared.package, profile: 'corpus-math-draft/1' }));
});

test('source-style decimals canonicalise for keys and a choice item is not accepted by the numeric profile', async (t) => {
  assert.equal(canonicalNumericKey('0,25'), '0.25');
  assert.equal(canonicalNumericKey(' 135,5 '), '135.5');
  assert.equal(canonicalNumericKey('-1'), '-1');
  assert.equal(canonicalNumericKey('1000'), '1000');
  assert.equal(canonicalNumericKey('007'), '7');
  assert.equal(canonicalNumericKey('1/2'), null);
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-numeric-choice-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const choice = [{ id: 'a.png', sourcePath: 'a.png', sourceHash: `sha256:${'1'.repeat(64)}`,
    public: { prompt: 'Pick', options: ['A', 'B'].map((id) => ({ id, content: [{ type: 'text', text: id }] })) },
    private: { answerKey: { type: 'SINGLE_CHOICE', optionId: 'A' }, explanation: null, extractedKeyText: 'Ẩn đáp án' },
    proposedTaxonomy: { section: 'MATH', topic: 'X', status: 'REQUIRES_VERIFICATION' } }];
  await assert.rejects(buildCorpusMathNumericPackage({ items: choice, taxonomy: taxonomy(), authorId: randomUUID(),
    directory: join(root, 'choice'), batchKey: 'choice' }));
  // The existing choice profile still builds and parses unchanged.
  const prepared = await buildCorpusMathPackage({ items: choice.map((item) => ({ ...item,
    id: item.sourcePath, public: item.public })), taxonomy: taxonomy(), authorId: randomUUID(),
  directory: join(root, 'choice-profile'), batchKey: 'choice-profile' });
  assert.equal(parseManualFactoryPackageV3(prepared.package).profile, 'corpus-math-draft/1');
});

test('numeric admission journals bind the numeric profile', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-math-numeric-journal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tax = taxonomy();
  const prepared = await buildCorpusMathNumericPackage({ items: numericItems(), taxonomy: tax, authorId: randomUUID(),
    directory: join(root, 'package'), batchKey: 'math-numeric-journal' });
  const args = await configureCorpusImport(root, prepared, tax);
  const config = await loadManualImportConfiguration(args);
  assert.equal(config.activation.profile, 'corpus-math-numeric-draft/1');
  const admission = await beginManualImportAdmission(config, prepared.package);
  assert.equal((await loadManualImportConfiguration({ ...args, allowPending: true }))
    .pendingAdmissions.get(admission.admissionId).candidateVersionIds.length, 5);
});
