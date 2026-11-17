import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256, sourceManifest } from '../../tools/corpus-ingest/reading-captures.mjs';
import { readMathBatches, compareMathBlindAnswers, saveMathVerificationProgress } from '../../tools/corpus-ingest/math-batches.mjs';

const writeJson = (path, value) => writeFile(path, JSON.stringify(value), { mode: 0o600 });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tsa-math-batches-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), output = join(root, 'private');
  const folder = 'TSA_ToanHoc_Test';
  await mkdir(source); await mkdir(join(source, folder)); await mkdir(output, { mode: 0o700 });
  for (let n = 1; n <= 20; n++) await writeFile(join(source, folder, `${String(n).padStart(6, '0')}.png`), `synthetic hash fixture ${n}`);
  const manifest = await sourceManifest(source);
  const item = { id: manifest[0].path, sourcePath: manifest[0].path, sourceHash: manifest[0].hash,
    public: { prompt: 'Synthetic expression?', options: ['A', 'B'].map((id) => ({ id, content: [{ type: 'text', text: id }] })) },
    private: { answerKey: { type: 'SINGLE_CHOICE', optionId: 'A' }, extractedKeyText: 'PRIVATE KEY MARKER', explanation: null } };
  const batch = { schemaVersion: 'corpus-math-transcription/1', batch: 1, folder, start: 1, end: 20, items: [item] };
  const batchBytes = Buffer.from(JSON.stringify(batch));
  const log = { schemaVersion: 'corpus-math-batch-log/1', batchSize: 20,
    batches: [{ batch: 1, file: 'scan-001.json', transcriptionHash: sha256(batchBytes), inspected: 20, accepted: 1 }],
    inspected: manifest.map((entry) => entry.path), deferred: manifest.slice(1).map((entry) => ({ sourcePath: entry.path, sourceHash: entry.hash })),
    needs_owner_attention: [] };
  await writeJson(join(output, 'source-manifest-before.json'), manifest);
  await writeFile(join(output, 'scan-001.json'), batchBytes, { mode: 0o600 });
  await writeJson(join(output, 'batch-log.json'), log);
  return { root, source, output, item, log, batch };
}

test('resumable batches bind complete source inspections, source bytes, and immutable saved transcriptions', async (t) => {
  const f = await fixture(t);
  const original = await readMathBatches(f.source, f.output);
  assert.equal(original.items.length, 1); assert.equal(original.uninspected.length, 0);
  await writeJson(join(f.output, 'scan-001.json'), { ...f.batch, items: [] });
  await assert.rejects(readMathBatches(f.source, f.output), /TRANSCRIPTION_CHANGED/);
  await writeJson(join(f.output, 'scan-001.json'), f.batch);
  await writeFile(join(f.source, f.item.sourcePath), 'changed source');
  await assert.rejects(readMathBatches(f.source, f.output), /SOURCE_MANIFEST_CHANGED/);
});

test('duplicate classification, incomplete batches, and exposed private key markers fail before import', async (t) => {
  const f = await fixture(t);
  f.log.deferred[0] = { sourcePath: f.item.sourcePath, sourceHash: f.item.sourceHash };
  await writeJson(join(f.output, 'batch-log.json'), f.log);
  await assert.rejects(readMathBatches(f.source, f.output), /DUPLICATE_CLASSIFICATION/);
  f.log.deferred[0] = { sourcePath: `${f.batch.folder}/000002.png`, sourceHash: (await sourceManifest(f.source))[1].hash };
  f.batch.end = 19;
  let bytes = Buffer.from(JSON.stringify(f.batch)); f.log.batches[0].transcriptionHash = sha256(bytes);
  await writeFile(join(f.output, 'scan-001.json'), bytes); await writeJson(join(f.output, 'batch-log.json'), f.log);
  await assert.rejects(readMathBatches(f.source, f.output));
  f.batch.end = 20; f.batch.items[0].public.prompt = 'PRIVATE KEY MARKER';
  bytes = Buffer.from(JSON.stringify(f.batch)); f.log.batches[0].transcriptionHash = sha256(bytes);
  await writeFile(join(f.output, 'scan-001.json'), bytes); await writeJson(join(f.output, 'batch-log.json'), f.log);
  await assert.rejects(readMathBatches(f.source, f.output), /PUBLIC_KEY_MARKER/);
});

test('blind checks require image recomparison on disagreement and never replace source keys', () => {
  const items = Array.from({ length: 20 }, (_, n) => ({ id: `image-${n}`, private: { answerKey: { type: 'SINGLE_CHOICE', optionId: 'A' } } }));
  const group = { blinded: true, checks: items.map((item) => ({ id: item.id, answerKey: item.private.answerKey, reason: 'Independent synthetic calculation.' })) };
  const before = structuredClone(items);
  assert.equal(compareMathBlindAnswers(items, [group]).length, 20);
  group.checks[0].answerKey = { type: 'SINGLE_CHOICE', optionId: 'B' };
  assert.throws(() => compareMathBlindAnswers(items, [group]), /IMAGE_RECOMPARISON_REQUIRED/);
  group.checks[0].imageRecomparison = 'MATCHES_SOURCE_TRANSCRIPTION; authoritative source key retained unchanged';
  const checks = compareMathBlindAnswers(items, [group]);
  assert.equal(checks[0].imageRecompared, true); assert.deepEqual(items, before);
  assert.equal(checks[0].sourceKeyPreserved, true);
  assert.throws(() => compareMathBlindAnswers(items, [{ ...group, checks: group.checks.slice(1) }]));
  group.checks[1].id = group.checks[0].id;
  assert.throws(() => compareMathBlindAnswers(items, [group]), /DUPLICATE_BLIND_CHECK/);
});

test('verification progress updates atomically while retaining inspection and earlier run evidence', async (t) => {
  const f = await fixture(t);
  await saveMathVerificationProgress(f.output, { outputDirectory: '/private/run-a', imported: 20, status: 'STARTED' });
  await saveMathVerificationProgress(f.output, { outputDirectory: '/private/run-a', imported: 40, status: 'VERIFIED' });
  await saveMathVerificationProgress(f.output, { outputDirectory: '/private/run-b', imported: 0, status: 'STARTED' });
  const log = JSON.parse(await readFile(join(f.output, 'batch-log.json')));
  assert.deepEqual(log.batches, f.log.batches);
  assert.equal(log.verificationRuns.length, 2); assert.equal(log.verificationRuns[0].imported, 40);
  assert.equal((await readdir(f.output)).filter((path) => path.startsWith('.batch-log-')).length, 0);
  await chmod(join(f.output, 'batch-log.json'), 0o644);
  await assert.rejects(saveMathVerificationProgress(f.output, { outputDirectory: '/private/run-c' }), /OWNER_ONLY/);
});
