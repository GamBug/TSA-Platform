import assert from 'node:assert/strict';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AnswerKeySchema } from '../../packages/contracts/dist/internal.js';
import { readPrivateManualArtifact } from '../question-factory/manual-transport.mjs';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { assertNoRevealedAnswers, sha256, sourceManifest } from './reading-captures.mjs';

const readJson = async (path) => JSON.parse(await readPrivateManualArtifact(path));

// Resume from saved, hash-bound transcriptions. Never transcribe or solve on replay.
export async function readMathBatches(sourceRoot, directory) {
  const manifest = await sourceManifest(sourceRoot);
  assert.deepEqual(manifest, await readJson(join(directory, 'source-manifest-before.json')), 'SOURCE_MANIFEST_CHANGED');
  const sources = new Map(manifest.map((entry) => [entry.path, entry.hash]));
  const log = await readJson(join(directory, 'batch-log.json'));
  assert.equal(log.schemaVersion, 'corpus-math-batch-log/1');
  assert.equal(log.batchSize, 20);
  const items = [], inspected = [], files = new Set();
  for (const [index, entry] of log.batches.entries()) {
    assert.equal(entry.batch, index + 1);
    assert.match(entry.file, /^scan-\d{3}\.json$/u);
    assert.ok(!files.has(entry.file), 'DUPLICATE_TRANSCRIPTION_FILE'); files.add(entry.file);
    const bytes = await readPrivateManualArtifact(join(directory, entry.file));
    assert.equal(sha256(bytes), entry.transcriptionHash, 'TRANSCRIPTION_CHANGED');
    const batch = JSON.parse(bytes);
    assert.equal(batch.schemaVersion, 'corpus-math-transcription/1');
    assert.equal(batch.batch, entry.batch);
    assert.match(batch.folder, /^TSA_ToanHoc_[^/\\]+$/u);
    assert.ok(Number.isSafeInteger(batch.start) && batch.start > 0);
    assert.equal(batch.end - batch.start + 1, 20);
    assert.equal(entry.inspected, 20);
    assert.equal(batch.items.length, entry.accepted);
    const paths = Array.from({ length: 20 }, (_, n) => `${batch.folder}/${String(batch.start + n).padStart(6, '0')}.png`);
    for (const path of paths) assert.ok(sources.has(path), 'CAPTURE_NOT_IN_MANIFEST');
    inspected.push(...paths);
    for (const item of batch.items) {
      assert.equal(item.id, item.sourcePath);
      assert.ok(paths.includes(item.sourcePath), 'ITEM_OUTSIDE_INSPECTION_BATCH');
      assert.equal(item.sourceHash, sources.get(item.sourcePath), 'ITEM_SOURCE_HASH_MISMATCH');
      assertNoRevealedAnswers(item.public);
      assert.ok(item.private.extractedKeyText?.trim(), 'EXTRACTED_KEY_MARKER_REQUIRED');
      assert.equal(JSON.stringify(item.public).includes(item.private.extractedKeyText), false, 'PUBLIC_KEY_MARKER');
      AnswerKeySchema.parse(item.private.answerKey);
      items.push(item);
    }
  }
  assert.equal(new Set(inspected).size, inspected.length, 'DUPLICATE_INSPECTED_CAPTURE');
  assert.deepEqual(log.inspected, inspected);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length, 'DUPLICATE_MATH_ITEM');
  const classified = [...items.map((item) => ({ sourcePath: item.sourcePath, sourceHash: item.sourceHash })),
    ...log.deferred, ...log.needs_owner_attention];
  assert.equal(classified.length, inspected.length, 'INCOMPLETE_INSPECTION_LOG');
  assert.equal(new Set(classified.map((item) => item.sourcePath)).size, inspected.length, 'DUPLICATE_CLASSIFICATION');
  for (const item of classified) {
    assert.ok(inspected.includes(item.sourcePath), 'CLASSIFICATION_OUTSIDE_BATCHES');
    assert.equal(item.sourceHash, sources.get(item.sourcePath));
  }
  return { manifest, log, items, uninspected: manifest.filter((item) => item.path.endsWith('.png') && !inspected.includes(item.path)) };
}

export function compareMathBlindAnswers(items, groups) {
  const checks = [];
  for (const group of groups) {
    assert.equal(group.blinded, true);
    assert.equal(group.checks.length, 20, 'TWENTY_BLIND_CHECKS_REQUIRED');
    checks.push(...group.checks);
  }
  assert.equal(checks.length, items.length, 'INCOMPLETE_BLIND_SOLVE');
  const byId = new Map(checks.map((check) => [check.id, check]));
  assert.equal(byId.size, items.length, 'DUPLICATE_BLIND_CHECK');
  return items.map((item) => {
    const check = byId.get(item.id);
    assert.ok(check && typeof check.reason === 'string' && check.reason.trim(), 'MISSING_BLIND_CHECK');
    if (check.answerKey !== null) AnswerKeySchema.parse(check.answerKey);
    const differs = check.answerKey === null || jsonDigest(check.answerKey) !== jsonDigest(item.private.answerKey);
    if (differs) assert.equal(check.imageRecomparison,
      'MATCHES_SOURCE_TRANSCRIPTION; authoritative source key retained unchanged', 'IMAGE_RECOMPARISON_REQUIRED');
    // These are private transcription audit records, never owner-review doubts or new keys.
    return { id: item.id, checked: true, sourceKeyPreserved: true, imageRecompared: differs };
  });
}

export async function readMathBlindChecks(directory, items) {
  const groups = [];
  for (let n = 1; n <= Math.ceil(items.length / 20); n++) {
    groups.push(await readJson(join(directory, `blind-solve-${String(n).padStart(3, '0')}.json`)));
  }
  return compareMathBlindAnswers(items, groups);
}

export async function saveMathVerificationProgress(directory, run) {
  const path = join(directory, 'batch-log.json');
  const log = await readJson(path);
  log.verificationRuns ??= [];
  const index = log.verificationRuns.findIndex((entry) => entry.outputDirectory === run.outputDirectory);
  if (index === -1) log.verificationRuns.push(run); else log.verificationRuns[index] = run;
  const temporary = join(directory, `.batch-log-${randomUUID()}.json`);
  try {
    await writeFile(temporary, `${JSON.stringify(log, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}
