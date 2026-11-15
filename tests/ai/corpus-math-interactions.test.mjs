import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readMathInteractionTranscription } from '../../tools/corpus-ingest/import-math-interactions.mjs';
import { sourceManifest } from '../../tools/corpus-ingest/reading-captures.mjs';

test('Math intake pins transcription bytes and every original source before accepting capture classifications', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-math-interaction-input-')); t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'sources'), folder = join(sourceRoot, 'TSA_ToanHoc_Test');
  await mkdir(folder, { recursive: true });
  const capture = join(folder, 'capture.txt'); await writeFile(capture, 'Original synthetic arithmetic source: calculate 1 + 2.');
  const manifest = await sourceManifest(sourceRoot), sourceManifestPath = join(root, 'manifest.json');
  await writeFile(sourceManifestPath, JSON.stringify(manifest));
  const transcriptionPath = join(root, 'transcription.json');
  const value = { schemaVersion: 'corpus-math-interactions-transcription/1',
    items: [{ sourcePath: manifest[0].path, sourceHash: manifest[0].hash, public: { prompt: 'Calculate $1+2$.' } }], deferred: [] };
  const save = async (v) => {
    const bytes = Buffer.from(JSON.stringify(v)); await writeFile(transcriptionPath, bytes);
    await writeFile(`${transcriptionPath}.sha256`, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  };
  const args = { sourceRoot, transcriptionPath, sourceManifestPath };
  await save(value); assert.equal((await readMathInteractionTranscription(args)).formulas, 1);
  await writeFile(transcriptionPath, ' ' + await readFile(transcriptionPath, 'utf8'));
  await assert.rejects(readMathInteractionTranscription(args), /TRANSCRIPTION_HASH_MISMATCH/);
  await save({ ...value, deferred: [value.items[0]] });
  await assert.rejects(readMathInteractionTranscription(args), /DUPLICATE_OR_NON_MATH_CAPTURE/);
  await save({ ...value, items: [{ ...value.items[0], sourceHash: 'sha256:' + '0'.repeat(64) }] });
  await assert.rejects(readMathInteractionTranscription(args), /CAPTURE_HASH_MISMATCH/);
  await save(value); await writeFile(capture, 'Changed source');
  await assert.rejects(readMathInteractionTranscription(args), /ORIGINAL_CORPUS_CHANGED/);
});
