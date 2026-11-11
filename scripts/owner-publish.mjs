// Owner command: publish the corpus DRAFTs of the retained Bank.
//   npm run bank:owner-publish                         dry run: counts and the confirmation phrase
//   npm run bank:owner-publish -- --section READING    limit to one section
//   npm run bank:owner-publish -- --confirm "PUBLISH 100 READING"
// Only the project owner runs the confirmed form; agents never approve items.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';
import {
  confirmationPhrase, createPassageBundles, listOwnerCandidates, OWNER_RIGHTS, OWNER_SECTIONS, ownerApprove, ownerConfirmSingleton,
} from '../src/local/owner-publication.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTHOR_ACTORS = Object.freeze({ '00000000-0000-4000-8000-000000000201': 'author' });

async function inspect(dataDirectory, section) {
  const database = await startPersistentPostgres(dataDirectory);
  try { return await listOwnerCandidates(database.ownerPool, { section }); }
  finally { await database.stop(); }
}

/** Log in one local account against the running workspace and return a request helper. */
async function session(origin, actorKey) {
  const pair = (headers, name) => headers.getSetCookie().find((value) => value.startsWith(`${name}=`)).split(';', 1)[0];
  const guest = await fetch(`${origin}/local-auth/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
  if (guest.status !== 201) throw new Error(`Local login bootstrap failed (${guest.status})`);
  const guestCookies = [pair(guest.headers, 'tsa_local_session'), pair(guest.headers, 'tsa_local_csrf')];
  const login = await fetch(`${origin}/local-auth/login`, { method: 'POST', body: JSON.stringify({ actorKey }), headers: {
    origin, cookie: guestCookies.join('; '), 'x-csrf-token': guestCookies[1].split('=')[1], 'content-type': 'application/json' } });
  if (login.status !== 200) throw new Error(`Local login as ${actorKey} failed (${login.status})`);
  const cookies = [pair(login.headers, 'tsa_local_session'), pair(login.headers, 'tsa_local_csrf')];
  return async (route, body) => {
    const response = await fetch(`${origin}${route}`, { method: 'POST', body: JSON.stringify(body), headers: {
      origin, cookie: cookies.join('; '), 'x-csrf-token': cookies[1].split('=')[1], 'content-type': 'application/json',
      'idempotency-key': `owner-publish-${crypto.randomUUID()}` } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} failed: ${response.status} ${value.error?.code ?? ''}`.trim());
    return value;
  };
}

export async function ownerPublish({ dataDirectory, section = null, confirm, log = (line) => process.stdout.write(`${line}\n`) }) {
  const before = await inspect(dataDirectory, section);
  const counts = Object.fromEntries(OWNER_SECTIONS.map((name) => [name, before.versions.filter((row) => row.section === name).length]));
  const unsupported = before.versions.filter((row) => !['question/1', 'question/2'].includes(row.schemaVersion) || !AUTHOR_ACTORS[row.createdBy]);
  const phrase = confirmationPhrase(before.versions.length - unsupported.length, section);
  log(`Corpus versions awaiting publication: ${OWNER_SECTIONS.map((name) => `${name} ${counts[name]}`).join(', ')}`);
  log(`Corpus sources without display rights: ${before.sources.filter((source) => !source.allowed).length} of ${before.sources.length}`);
  if (unsupported.length) log(`Skipped (other protocol or unknown author): ${unsupported.length}`);
  if (confirm === undefined) {
    log(`Dry run only. To approve and publish them as the owner, run:\n  npm run bank:owner-publish -- ${section ? `--section ${section} ` : ''}--confirm "${phrase}"`);
    return { published: 0, phrase };
  }
  if (confirm !== phrase) throw new Error(`Confirmation does not match. Expected exactly: "${phrase}"`);
  const targets = before.versions.filter((row) => !unsupported.includes(row));

  // Phase 1: the normal workspace (backup, migrations) and the existing Bank routes.
  // Numeric-answer versions (question/2) are served by the numeric routes, which need the numeric runtime opt-in.
  const numeric = targets.some((row) => row.schemaVersion === 'question/2');
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true',
    ...(numeric ? { LOCAL_STUDENT_ENABLED: 'true', LOCAL_NUMERIC_PRACTICE_ENABLED: 'true' } : {}) }, dataDirectory, port: 0 });
  try {
    const manager = await session(runtime.origin, 'bankManager');
    for (const source of before.sources.filter((row) => !row.allowed)) {
      await manager(`/api/v1/source-versions/${source.id}/rights`, { ...OWNER_RIGHTS, expectedRevision: source.revision });
    }
    log(`Rights recorded (OWNER_ATTESTED) on ${before.sources.filter((row) => !row.allowed).length} source versions.`);
    const authors = {};
    for (const row of targets.filter((target) => target.state === 'DRAFT')) {
      authors[row.createdBy] ??= await session(runtime.origin, AUTHOR_ACTORS[row.createdBy]);
      await authors[row.createdBy](`/api/${row.schemaVersion === 'question/2' ? 'v2' : 'v1'}/question-versions/${row.id}/submit-review`, { expectedRevision: row.revision });
      row.revision += 1;
    }
  } finally { await runtime.close(); }

  // Phase 2: owner maintenance — singleton records, passage bundles, then approval with every publication check.
  const database = await startPersistentPostgres(dataDirectory);
  try {
    for (const row of targets) await ownerConfirmSingleton(database.ownerPool, row.id);
    const bundles = await createPassageBundles(database.ownerPool, targets.filter((row) => row.stimulusVersionId).map((row) => row.stimulusVersionId));
    log(`Passage bundles created: ${bundles}`);
    let published = 0;
    for (const row of targets) { await ownerApprove(database.ownerPool, row.id); published += 1; }
    log(`Approved and published: ${published}. Start the demo with: npm run demo:uni`);
    return { published, phrase };
  } finally { await database.stop(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] === '--section' && OWNER_SECTIONS.includes(args[index + 1])) options.section = args[index + 1];
    else if (args[index] === '--confirm' && typeof args[index + 1] === 'string') options.confirm = args[index + 1];
    else { process.stderr.write('Usage: npm run bank:owner-publish -- [--section MATH|READING|SCIENCE] [--confirm "PUBLISH N SECTION"]\n'); process.exit(1); }
  }
  try {
    await ownerPublish({ ...options, dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') });
  } catch (error) {
    process.stderr.write(`Owner publication stopped: ${error.message}\nThe backup taken before changes is in .local/track-b-backups/.\n`);
    process.exitCode = 1;
  }
}
