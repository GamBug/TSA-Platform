// Owner command: record a corpus document as a source version with the project owner's attested rights.
//   npm run bank:register-source -- --file <path> --title "Corpus <name>"            dry run
//   npm run bank:register-source -- --file <path> --title "Corpus <name>" --confirm "REGISTER SOURCE"
// The rights text is the OWNER_ATTESTED record of OPEN_DECISIONS (2026-11-11) and covers files the owner placed in the
// private corpus directory. Only the file's SHA-256 and name are stored, never its content. Prints the source version id.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { OWNER_RIGHTS } from '../src/local/owner-publication.mjs';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';
import { session } from './owner-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHRASE = 'REGISTER SOURCE';

export async function registerCorpusSource({ dataDirectory, file, title, confirm, log = (line) => process.stdout.write(`${line}\n`) }) {
  if (typeof title !== 'string' || !title.startsWith('Corpus ') || title.length > 200) throw new TypeError('The title must start with "Corpus " and be at most 200 characters');
  const hash = `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`;
  const database = await startPersistentPostgres(dataDirectory);
  let existing;
  try {
    existing = (await database.ownerPool.query(`SELECT sv.id FROM tsa.source_versions sv JOIN tsa.sources s ON s.id = sv.source_id WHERE s.title = $1 AND sv.content_hash = $2`, [title, hash])).rows[0];
  } finally { await database.stop(); }
  log(`${path.basename(file)}  ${hash}`);
  if (existing) { log(`Already registered: ${existing.id}`); return { sourceVersionId: existing.id, created: false }; }
  if (confirm === undefined) { log(`Dry run. To register it under the attested corpus rights, add --confirm "${PHRASE}".`); return { sourceVersionId: null, created: false }; }
  if (confirm !== PHRASE) throw new Error(`Confirmation does not match. Expected exactly: "${PHRASE}"`);
  // The workspace runtime backs the database up before this change.
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' }, dataDirectory, port: 0 });
  await runtime.close();
  const writer = await startPersistentPostgres(dataDirectory);
  const sourceId = randomUUID(), sourceVersionId = randomUUID();
  try {
    await writer.ownerPool.query(`INSERT INTO tsa.sources (id, title, canonical_uri, owner_reference, origin, created_by) VALUES ($1, $2, NULL, NULL, 'EXTERNAL', NULL)`, [sourceId, title]);
    await writer.ownerPool.query(`INSERT INTO tsa.source_versions (id, source_id, version_no, content_hash, metadata, evidence_uri) VALUES ($1, $2, 1, $3, $4::jsonb, NULL)`,
      [sourceVersionId, sourceId, hash, JSON.stringify({ file: path.basename(file), registeredBy: 'bank:register-source' })]);
  } finally { await writer.stop(); }
  const rights = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' }, dataDirectory, port: 0 });
  try {
    const manager = await session(rights.origin, 'bankManager');
    await manager(`/api/v1/source-versions/${sourceVersionId}/rights`, { ...OWNER_RIGHTS, expectedRevision: 0 });
  } finally { await rights.close(); }
  log(`Registered source version ${sourceVersionId} with the OWNER_ATTESTED rights record.`);
  return { sourceVersionId, created: true };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  const names = { '--file': 'file', '--title': 'title', '--confirm': 'confirm' };
  for (let index = 0; index < args.length; index += 2) {
    if (!names[args[index]] || typeof args[index + 1] !== 'string') { process.stderr.write('Usage: npm run bank:register-source -- --file <path> --title "Corpus <name>" [--confirm "REGISTER SOURCE"]\n'); process.exit(1); }
    options[names[args[index]]] = args[index + 1];
  }
  if (!options.file || !options.title) { process.stderr.write('--file and --title are required.\n'); process.exit(1); }
  try { await registerCorpusSource({ ...options, dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') }); }
  catch (error) { process.stderr.write(`Registration stopped: ${error.message}\n`); process.exitCode = 1; }
}
