// Owner command: publish the corpus and practice-original DRAFTs of the retained Bank.
//   npm run bank:owner-publish                         dry run: counts and the confirmation phrase
//   npm run bank:owner-publish -- --section READING    limit to one section
//   npm run bank:owner-publish -- --taxonomy-version <uuid>   limit to versions authored in one taxonomy version
//   npm run bank:owner-publish -- --keep-one-of-twins         also confirm each exact twin as one equivalence group (owner decision 2026-11-19)
//   npm run bank:owner-publish -- --versions <uuid>,<uuid>    limit to exactly these question versions (AI studio batches)
//   npm run bank:owner-publish -- --confirm "PUBLISH 100 READING"
// Only the project owner runs the confirmed form; agents never approve items.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLocalImageStore } from '../src/modules/media/local-image-store.mjs';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';
import {
  confirmationPhrase, createPassageBundles, listOpenTwins, listOwnerCandidates, OWNER_RIGHTS, OWNER_SECTIONS, ownerApprove, ownerConfirmSingleton, ownerConfirmTwin,
} from '../src/local/owner-publication.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTHOR_ACTORS = Object.freeze({ '00000000-0000-4000-8000-000000000201': 'author' });

/** Keep candidate selection and its required rights changes in one publication plan. */
export function planOwnerPublication(before) {
  const unsupported = before.versions.filter((row) => !['question/1', 'question/2', 'question/3'].includes(row.schemaVersion) || !AUTHOR_ACTORS[row.createdBy]);
  const targets = before.versions.filter((row) => !unsupported.includes(row));
  const sourceIds = new Set();
  for (const target of targets) for (const id of target.sourceVersionIds) sourceIds.add(id);
  return { unsupported, targets, sources: before.sources.filter((source) => sourceIds.has(source.id)) };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Keep only candidates whose version belongs to the named taxonomy version. Pure; the input is not mutated. */
export function restrictToTaxonomy(before, allowedVersionIds) {
  const allowed = new Set(allowedVersionIds);
  return { ...before, versions: before.versions.filter((row) => allowed.has(row.id)) };
}

async function inspect(dataDirectory, section, taxonomyVersionId, versionIds = null) {
  if (taxonomyVersionId !== null && !UUID_PATTERN.test(taxonomyVersionId)) throw new TypeError('--taxonomy-version must be a UUID');
  if (versionIds !== null && !versionIds.every((id) => UUID_PATTERN.test(id))) throw new TypeError('version ids must be UUIDs');
  const database = await startPersistentPostgres(dataDirectory);
  try {
    let before = await listOwnerCandidates(database.ownerPool, { section });
    if (versionIds !== null) before = restrictToTaxonomy(before, versionIds);
    if (taxonomyVersionId === null) return before;
    const ids = (await database.ownerPool.query('SELECT id FROM tsa.question_versions WHERE taxonomy_version_id = $1', [taxonomyVersionId])).rows.map((row) => row.id);
    return restrictToTaxonomy(before, ids);
  } finally { await database.stop(); }
}

/** Log in one local account against the running workspace and return a request helper. */
export async function session(origin, actorKey) {
  const pair = (headers, name) => headers.getSetCookie().find((value) => value.startsWith(`${name}=`)).split(';', 1)[0];
  const guest = await fetch(`${origin}/local-auth/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
  if (guest.status !== 201) throw new Error(`Local login bootstrap failed (${guest.status})`);
  const guestCookies = [pair(guest.headers, 'tsa_local_session'), pair(guest.headers, 'tsa_local_csrf')];
  const login = await fetch(`${origin}/local-auth/login`, { method: 'POST', body: JSON.stringify({ actorKey }), headers: {
    origin, cookie: guestCookies.join('; '), 'x-csrf-token': guestCookies[1].split('=')[1], 'content-type': 'application/json' } });
  if (login.status !== 200) throw new Error(`Local login as ${actorKey} failed (${login.status})`);
  const cookies = [pair(login.headers, 'tsa_local_session'), pair(login.headers, 'tsa_local_csrf')];
  const post = async (route, body, key) => {
    const response = await fetch(`${origin}${route}`, { method: 'POST', body: JSON.stringify(body), headers: {
      origin, cookie: cookies.join('; '), 'x-csrf-token': cookies[1].split('=')[1], 'content-type': 'application/json',
      'idempotency-key': key ?? `owner-publish-${crypto.randomUUID()}` } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} failed: ${response.status} ${value.error?.code ?? ''}`.trim());
    return value;
  };
  post.get = async (route) => {
    const response = await fetch(`${origin}${route}`, { headers: { origin, cookie: cookies.join('; ') } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${route} failed: ${response.status} ${value.error?.code ?? ''}`.trim());
    return value;
  };
  return post;
}


async function countOpenTwins(dataDirectory, versionIds) {
  if (versionIds.length === 0) return 0;
  const database = await startPersistentPostgres(dataDirectory);
  try { return (await listOpenTwins(database.ownerPool, versionIds)).length; } finally { await database.stop(); }
}

/** `versionIds` limits publication to those versions (the admin page publishes one question this way). */
export async function ownerPublish({ dataDirectory, section = null, taxonomyVersionId = null, versionIds = null, keepOneOfTwins = false, confirm, imageStoreDirectory = process.env.TSA_IMAGE_STORE_DIRECTORY ?? path.join(ROOT, '.local', 'track-b-images'), log = (line) => process.stdout.write(`${line}\n`) }) {
  const before = await inspect(dataDirectory, section, taxonomyVersionId, versionIds);
  const counts = Object.fromEntries(OWNER_SECTIONS.map((name) => [name, before.versions.filter((row) => row.section === name).length]));
  const { unsupported, targets, sources } = planOwnerPublication(before);
  const phrase = confirmationPhrase(targets.length, section);
  log(`Corpus versions awaiting publication: ${OWNER_SECTIONS.map((name) => `${name} ${counts[name]}`).join(', ')}`);
  log(`Corpus sources without display rights: ${sources.filter((source) => !source.allowed).length} of ${sources.length}`);
  if (unsupported.length) log(`Skipped (other protocol or unknown author): ${unsupported.length}`);
  const twinCount = await countOpenTwins(dataDirectory, targets.map((row) => row.id));
  if (twinCount) log(keepOneOfTwins ? `Open exact twins to confirm as one equivalence group each: ${twinCount}` : `Open exact twins among them: ${twinCount}. Add --keep-one-of-twins to confirm each as one equivalence group; without it publication stops at the first twin.`);
  if (confirm === undefined) {
    log(`Dry run only. To approve and publish them as the owner, run:\n  npm run bank:owner-publish -- ${section ? `--section ${section} ` : ''}${taxonomyVersionId ? `--taxonomy-version ${taxonomyVersionId} ` : ''}${versionIds ? `--versions ${versionIds.join(',')} ` : ''}${keepOneOfTwins ? '--keep-one-of-twins ' : ''}--confirm "${phrase}"`);
    return { published: 0, phrase };
  }
  if (confirm !== phrase) throw new Error(`Confirmation does not match. Expected exactly: "${phrase}"`);
  if (targets.length === 0) {
    log('No supported corpus versions await publication; no rights or workflow changes were made.');
    return { published: 0, phrase };
  }
  // The attested corpus rights describe corpus documents only; a practice original gets its own rights when it is registered.
  const foreign = sources.filter((row) => !row.allowed && !row.corpus);
  if (foreign.length) throw new Error(`${foreign.length} non-corpus source version(s) lack display rights (${foreign.map((row) => row.id).join(', ')}); nothing was changed`);

  const imageStore = targets.some(row => row.hasImages) ? await createLocalImageStore({ rootDirectory: imageStoreDirectory, enabled: true,
    env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' } }) : null;
  // The normal workspace backs up before migrations and workflow changes.
  // Numeric-answer versions (question/2) are served by the numeric routes, which need the numeric runtime opt-in.
  const numeric = targets.some((row) => row.schemaVersion === 'question/2');
  const clozeMatching = targets.some((row) => row.schemaVersion === 'question/3');
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true',
    ...((numeric || clozeMatching) ? { LOCAL_STUDENT_ENABLED: 'true' } : {}),
    ...(numeric ? { LOCAL_NUMERIC_PRACTICE_ENABLED: 'true' } : {}),
    ...(clozeMatching ? { LOCAL_CLOZE_MATCHING_ENABLED: 'true' } : {}) }, dataDirectory, imageStore, port: 0 });
  try {
    const manager = await session(runtime.origin, 'bankManager');
    for (const source of sources.filter((row) => !row.allowed)) {
      await manager(`/api/v1/source-versions/${source.id}/rights`, { ...OWNER_RIGHTS, expectedRevision: source.revision });
    }
    log(`Rights recorded (OWNER_ATTESTED) on ${sources.filter((row) => !row.allowed).length} source versions.`);
    const authors = {};
    for (const row of targets.filter((target) => target.state === 'DRAFT')) {
      authors[row.createdBy] ??= await session(runtime.origin, AUTHOR_ACTORS[row.createdBy]);
      await authors[row.createdBy](`/api/${row.schemaVersion === 'question/3' ? 'v4' : row.schemaVersion === 'question/2' ? 'v2' : 'v1'}/question-versions/${row.id}/submit-review`, { expectedRevision: row.revision });
      row.revision += 1;
    }
  } finally { await runtime.close(); }

  // Owner maintenance records singletons and bundles, then repeats every publication check.
  const database = await startPersistentPostgres(dataDirectory);
  try {
    if (keepOneOfTwins) {
      let confirmed = 0, merged = 0;
      for (const twin of await listOpenTwins(database.ownerPool, targets.map((row) => row.id))) {
        const result = await ownerConfirmTwin(database.ownerPool, twin.id);
        confirmed += 1; if (result.merged) merged += 1;
      }
      log(`Exact twins confirmed as one equivalence group each: ${confirmed} (${merged} groups merged)`);
    }
    for (const row of targets) await ownerConfirmSingleton(database.ownerPool, row.id);
    const bundles = await createPassageBundles(database.ownerPool, targets.filter((row) => row.stimulusVersionId).map((row) => row.stimulusVersionId));
    log(`Passage bundles created: ${bundles}`);
    let published = 0;
    for (const row of targets) { await ownerApprove(database.ownerPool, row.id, { imageStore }); published += 1; }
    log(`Approved and published: ${published}. Start the demo with: npm run demo:uni`);
    return { published, phrase };
  } finally { await database.stop(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] === '--section' && OWNER_SECTIONS.includes(args[index + 1])) options.section = args[index + 1];
    else if (args[index] === '--taxonomy-version' && typeof args[index + 1] === 'string') options.taxonomyVersionId = args[index + 1];
    else if (args[index] === '--keep-one-of-twins') { options.keepOneOfTwins = true; index -= 1; }
    else if (args[index] === '--versions' && typeof args[index + 1] === 'string') options.versionIds = args[index + 1].split(',').filter(Boolean);
    else if (args[index] === '--confirm' && typeof args[index + 1] === 'string') options.confirm = args[index + 1];
    else { process.stderr.write('Usage: npm run bank:owner-publish -- [--section MATH|READING|SCIENCE] [--taxonomy-version <uuid>] [--versions <uuid>,...] [--keep-one-of-twins] [--confirm "PUBLISH N SECTION"]\n'); process.exit(1); }
  }
  try {
    await ownerPublish({ ...options, dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') });
  } catch (error) {
    process.stderr.write(`Owner publication stopped: ${error.message}\nThe backup taken before changes is in .local/track-b-backups/.\n`);
    process.exitCode = 1;
  }
}
