import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseReadingCapture, groupReadingCaptures, assertNoRevealedAnswers } from '../../tools/corpus-ingest/reading-captures.mjs';
import { buildCorpusReadingPackage, createPrivateOutputDirectory } from '../../tools/corpus-ingest/reading-package.mjs';
import { buildManualFactoryPackageV3, parseManualFactoryPackageV3 } from '../../packages/contracts/dist/internal.js';
import { compareBlindAnswers } from '../../tools/corpus-ingest/verify-reading.mjs';

function capture(index, { key = 'B', passage = 'A shared passage.', controls = false } = {}) {
  return Buffer.from(`Quay lại\nNgữ liệu chung\n\nDựa vào thông tin dưới đây\n\n${passage}\n${index}\nXem lại\nẨn đáp án\nLời giải\nS\n\nQuestion ${index}?\n${controls ? 'Statement\nĐúng\nSai' : ['A', 'B', 'C', 'D'].map((label) => `${label}${label === key ? ', đáp án đúng:' : ''}\n\nOption ${label}`).join('\n')}\nCâu trước\nCâu ${index} / 10\nCâu tiếp\n`);
}
const records = (options) => Array.from({ length: 10 }, (_, i) => parseReadingCapture(capture(i, options), `TSA_DocHieu_Test/${i}.txt`));

test('revealed keys and chrome are private; genuine option text remains intact', () => {
  for (const key of ['A', 'B', 'C', 'D']) {
    const item = parseReadingCapture(capture(1, { key }), 'folder/1.txt');
    assert.equal(item.private.answerKey.optionId, key);
    assert.equal(JSON.stringify(item.public).includes(item.private.extractedKeyText), false);
    assertNoRevealedAnswers(item.public);
    assert.equal(item.public.options.find((option) => option.id === key).content[0].text, `Option ${key}`);
  }
  assert.throws(() => assertNoRevealedAnswers({ prompt: 'B, đáp án đúng:' }), /PUBLIC_ANSWER/);
  assert.throws(() => parseReadingCapture(Buffer.from([255]), 'invalid.txt'));
});

test('passage dedupe tolerates capture whitespace and keeps complete ten-question bundles', () => {
  const items = records();
  items[9] = parseReadingCapture(capture(9, { passage: 'A  shared\npassage.' }), 'TSA_DocHieu_Test/9.txt');
  const grouped = groupReadingCaptures(items);
  assert.equal(grouped.selected.length, 1); assert.equal(grouped.selected[0].items.length, 10);
  assert.throws(() => groupReadingCaptures(items.slice(1)), /TEN_CAPTURE/);
  const missing = records(); missing[3] = parseReadingCapture(capture(3, { controls: true }), 'TSA_DocHieu_Test/3.txt');
  const deferred = groupReadingCaptures(missing);
  assert.equal(deferred.selected.length, 0); assert.equal(deferred.deferred[0].items.length, 10);
  assert.equal(deferred.needs_owner_keys.length, 1);
  assert.equal(missing[3].hasExplicitKey, false); assert.equal(missing[3].private, undefined);
});

test('corpus packages bind imported provenance and cannot masquerade as manual AI output', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-corpus-unit-')); t.after(() => rm(root, { recursive: true, force: true }));
  const domain = randomUUID();
  const taxonomy = { schemaVersion: 'taxonomy/1', taxonomyVersionId: randomUUID(), name: 'Test', versionNo: 1,
    definitionHash: `sha256:${'a'.repeat(64)}`, nodes: [
      { id: domain, code: 'READING', kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: randomUUID(), code: 'READING_REASONING', kind: 'SKILL', parentId: domain, metadata: {} }] };
  const prepared = await buildCorpusReadingPackage({ group: groupReadingCaptures(records()).selected[0], taxonomy,
    authorId: randomUUID(), directory: join(root, 'package') });
  const pkg = parseManualFactoryPackageV3(prepared.package);
  assert.equal(pkg.profile, 'corpus-reading-draft/1');
  assert.equal(pkg.sourceAuthoring[0].kind, 'CORPUS_IMPORTED');
  assert.equal(pkg.manualRun.kind, 'DETERMINISTIC_CORPUS_EXTRACTION');
  assert.equal((await stat(prepared.artifactPaths.response)).mode & 0o077, 0);
  for (const candidate of pkg.candidates) {
    assert.equal(candidate.question.origin, 'IMPORTED'); assert.equal(candidate.provenance.origin, 'IMPORTED');
    assert.equal(candidate.question.generationRunId, null); assertNoRevealedAnswers(candidate.question.content);
  }
  const changed = structuredClone(pkg); changed.profile = 'manual-reading-draft/1';
  assert.throws(() => parseManualFactoryPackageV3(changed), /authorship\/profile/);
  const relabeled = structuredClone(pkg); relabeled.sourceAuthoring[0].kind = 'AI_AUTHORED_EXPERIMENTAL';
  assert.throws(() => parseManualFactoryPackageV3(relabeled));
  const edited = structuredClone(pkg); edited.candidates[0].question.private.answerKey.optionId = 'A';
  assert.throws(() => parseManualFactoryPackageV3(edited));
  const source = JSON.parse(prepared.artifacts.sourceDeclaration);
  source.sourceCaptures[0].path = 'other/question.txt';
  assert.throws(() => buildManualFactoryPackageV3({ ...prepared,
    artifacts: { ...prepared.artifacts, sourceDeclaration: Buffer.from(JSON.stringify(source)) } }), /capture evidence/);
  await assert.rejects(createPrivateOutputDirectory(join(root, 'public', 'unsafe')), /OUTSIDE_PUBLIC/);
});

test('blind triage compares independent answers without changing supplied keys and rejects missing checks', () => {
  const corpus = groupReadingCaptures(records());
  const blind = { blinded: true, checks: corpus.selected[0].items.map((item) => ({ id: item.id,
    optionId: 'B', unambiguous: true, reason: 'Test evidence only.', evidenceQuote: 'A shared passage.' })) };
  blind.checks[0].optionId = 'A'; blind.checks[1].unambiguous = false; blind.checks[2].evidenceQuote = 'Invented';
  const before = structuredClone(corpus);
  const triage = compareBlindAnswers(corpus, blind);
  assert.deepEqual(corpus, before);
  assert.ok(triage[0].flags.includes('BLIND_KEY_MISMATCH'));
  assert.ok(triage[1].flags.includes('BLIND_AMBIGUITY'));
  assert.ok(triage[2].flags.includes('BLIND_EVIDENCE_UNSUPPORTED'));
  assert.ok(triage.every((item) => item.status === 'needs_owner_attention'));
  assert.throws(() => compareBlindAnswers(corpus, { ...blind, checks: blind.checks.slice(1) }));
  assert.throws(() => compareBlindAnswers(corpus, { ...blind, checks: [...blind.checks.slice(1), blind.checks[1]] }));
});
