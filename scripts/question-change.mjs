// Owner command: change the status or section of one question in the retained Bank (the admin page runs it).
//   npm run bank:question -- --version <uuid> --publish                    DRAFT or IN_REVIEW -> published
//   npm run bank:question -- --version <uuid> --withhold --reason "..."    any active state -> QUARANTINED (not served)
//   npm run bank:question -- --version <uuid> --restore                    QUARANTINED -> published again
//   npm run bank:question -- --version <uuid> --section SCIENCE            a new version of the question in that section
// Without --confirm it is a dry run that prints the plan and the confirmation phrase; nothing is written. Versions are
// immutable: a section move adds a version (it replaces a published one at once; a draft stays a draft for the normal
// Publish step), and the older version stays as history. Every approval repeats the owner publication checks.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRevisionDraft, loadCorrectionTarget, ownerApprove, ownerConfirmSingleton, ROUTE_PREFIX } from '../src/local/bank-correction.mjs';
import { backupLocalDatabase } from '../src/local/database-backup.mjs';
import { OWNER_SECTIONS } from '../src/local/owner-publication.mjs';
import { findPracticePool } from '../src/local/practice-pool.mjs';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';
import { withTransaction } from '../src/modules/database/pool.mjs';
import { openImageStore } from './image-library.mjs';
import { ownerPublish, session } from './owner-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const QUESTION_ACTIONS = Object.freeze(['PUBLISH', 'WITHHOLD', 'RESTORE', 'MOVE']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTIVE = ['DRAFT', 'IN_REVIEW', 'APPROVED'];

/** The phrase the owner types to confirm one change, e.g. "WITHHOLD 1a2b3c4d" or "MOVE 1a2b3c4d TO SCIENCE". Pure. */
export function questionChangePhrase(action, versionId, section = null) {
  return `${action} ${versionId.slice(0, 8)}${action === 'MOVE' ? ` TO ${section}` : ''}`;
}

/** Why the change cannot be made to this version, or null. Pure. */
export function questionChangeProblem(action, version, section = null) {
  if (version.version_no !== version.latest_version_no) return 'This is an older version; change the latest version of the question';
  if (action === 'PUBLISH') {
    if (!['DRAFT', 'IN_REVIEW'].includes(version.state)) return `Only a DRAFT or IN_REVIEW version can be published; this one is ${version.state}`;
    if (version.stimulus_version_id) return 'A question with a shared passage is published with its passage: use Publish on the Import & publish tab';
  }
  if (action === 'WITHHOLD' && !ACTIVE.includes(version.state)) return `Only a DRAFT, IN_REVIEW or APPROVED version can be withheld; this one is ${version.state}`;
  if (action === 'RESTORE' && version.state !== 'QUARANTINED') return `Only a withheld (QUARANTINED) version can be restored; this one is ${version.state}`;
  if (action === 'MOVE') {
    if (!OWNER_SECTIONS.includes(section)) return 'Choose MATH, READING or SCIENCE';
    if (section === version.section) return `The question is already in ${section}`;
    if (!ACTIVE.includes(version.state)) return `A ${version.state} version cannot be moved; restore it first`;
  }
  return null;
}

const MOVE_NOTE = (from, to) => `Moved by the owner from the ${from} section to the ${to} section; content, key and explanation unchanged.`;

/**
 * Where a moved question goes: its own taxonomy version when that has the section; otherwise the taxonomy version that
 * already serves the most questions in the section. The ChatGPT practice pool and the real content never mix, so a
 * question moves inside the pool or between real-content taxonomies only. Returns { taxonomyVersionId, name, nodes }.
 */
async function moveTaxonomy(client, version, nodes, section) {
  if (nodes.some((node) => node.kind === 'DOMAIN' && node.code === section)) {
    return { taxonomyVersionId: version.taxonomy_version_id, name: null, nodes };
  }
  const pool = await findPracticePool(client);
  const candidate = (await client.query(`SELECT t.id, t.name,
      (SELECT count(*) FROM tsa.question_versions v JOIN tsa.questions q ON q.eligible_version_id=v.id
        WHERE v.taxonomy_version_id=t.id AND v.section::text=$1)::integer AS served
    FROM tsa.taxonomy_versions t JOIN tsa.taxonomy_nodes d ON d.taxonomy_version_id=t.id AND d.kind='DOMAIN' AND d.code=$1
    WHERE t.id IS DISTINCT FROM $2::uuid ORDER BY served DESC, t.name, t.id LIMIT 1`, [section, pool])).rows[0];
  if (!candidate) return { taxonomyVersionId: version.taxonomy_version_id, name: null, nodes };
  const targetNodes = (await client.query('SELECT id, code, kind, parent_id FROM tsa.taxonomy_nodes WHERE taxonomy_version_id=$1', [candidate.id])).rows;
  return { taxonomyVersionId: candidate.id, name: candidate.name, nodes: targetNodes };
}

/** Another question in the section whose content is identical (same normalized fingerprint), or null. */
async function identicalInSection(client, versionId, section) {
  return (await client.query(`SELECT o.id FROM tsa.question_versions v JOIN tsa.question_versions o
      ON o.normalized_fingerprint=v.normalized_fingerprint AND o.question_id<>v.question_id AND o.section::text=$2
    JOIN tsa.question_workflow w ON w.question_version_id=o.id
    WHERE v.id=$1 AND w.state::text IN ('DRAFT','IN_REVIEW','APPROVED') ORDER BY o.id LIMIT 1`, [versionId, section])).rows[0]?.id ?? null;
}

async function loadTarget(dataDirectory, versionId, section) {
  const database = await startPersistentPostgres(dataDirectory);
  try {
    return await withTransaction(database.ownerPool, async (client) => {
      const target = await loadCorrectionTarget(client, versionId);
      if (!section || section === target.version.section || !OWNER_SECTIONS.includes(section)) return target;
      return { ...target, move: await moveTaxonomy(client, target.version, target.nodes, section),
        duplicate: await identicalInSection(client, versionId, section) };
    });
  } finally { await database.stop(); }
}

async function hasImages(dataDirectory, versionId) {
  const database = await startPersistentPostgres(dataDirectory);
  try {
    return (await database.ownerPool.query(`SELECT EXISTS(SELECT 1 FROM tsa.question_assets WHERE question_version_id=$1)
      OR EXISTS(SELECT 1 FROM tsa.question_versions v JOIN tsa.stimulus_assets sa ON sa.stimulus_version_id=v.stimulus_version_id WHERE v.id=$1) AS images`,
    [versionId])).rows[0].images;
  } finally { await database.stop(); }
}

/** Run the runtime workflow routes as the local author or bank manager account. */
async function withRuntime(dataDirectory, schemaVersion, work) {
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true',
    ...(schemaVersion !== 'question/1' ? { LOCAL_STUDENT_ENABLED: 'true' } : {}),
    ...(schemaVersion === 'question/2' ? { LOCAL_NUMERIC_PRACTICE_ENABLED: 'true' } : {}),
    ...(schemaVersion === 'question/3' ? { LOCAL_CLOZE_MATCHING_ENABLED: 'true' } : {}) }, dataDirectory, port: 0 });
  try { return await work(runtime.origin); } finally { await runtime.close(); }
}

/** Confirm and approve an IN_REVIEW version on the owner connection; every publication check runs again. */
async function approve(dataDirectory, versionId, reason, imageStoreDirectory) {
  const imageStore = await hasImages(dataDirectory, versionId) ? await openImageStore(imageStoreDirectory) : null;
  const database = await startPersistentPostgres(dataDirectory);
  try {
    await ownerConfirmSingleton(database.ownerPool, versionId, { recordExisting: true });
    await ownerApprove(database.ownerPool, versionId, { reason, imageStore });
  } finally { await database.stop(); }
}

export async function changeQuestion({ dataDirectory, versionId, action, section = null, reason = null, confirm,
  imageStoreDirectory = process.env.TSA_IMAGE_STORE_DIRECTORY ?? path.join(ROOT, '.local', 'track-b-images'),
  log = (line) => process.stdout.write(`${line}\n`) }) {
  if (!UUID.test(versionId ?? '')) throw new TypeError('--version must be a question version UUID');
  if (!QUESTION_ACTIONS.includes(action)) throw new TypeError(`The action must be one of ${QUESTION_ACTIONS.join(', ')}`);
  if (action === 'WITHHOLD' && (typeof reason !== 'string' || reason.trim().length < 5)) throw new TypeError('Withholding needs a --reason of at least 5 characters');
  const target = await loadTarget(dataDirectory, versionId, action === 'MOVE' ? section : null);
  const { version } = target;
  const phrase = questionChangePhrase(action, versionId, section);
  let problem = questionChangeProblem(action, version, section);
  // No duplicates: an identical question already in the target section would be a second copy (and an exact twin,
  // which hides both until resolved). The owner withholds this one instead.
  if (!problem && action === 'MOVE' && target.duplicate) {
    problem = `An identical question is already in ${section} (version ${target.duplicate}); withhold this one instead of moving it`;
  }
  if (!problem && action === 'MOVE') {
    try { buildRevisionDraft(target, { classification: 'MOVE', note: MOVE_NOTE(version.section, section), changes: { section, taxonomy: target.move } }); }
    catch (error) { problem = error.message; }
  }
  log(`Question version ${versionId}: ${version.section}, ${version.state}${version.eligible_version_id === versionId ? ', served' : ''}`);
  if (problem) { log(`Cannot ${action.toLowerCase()}: ${problem}.`); return { ok: false, problem, phrase: null }; }
  const plan = {
    PUBLISH: 'Approve and publish this question as the owner (rights, checks and approval as in Publish).',
    WITHHOLD: 'Withhold this question: it is no longer served, and tests already built with it are held.',
    RESTORE: 'Publish this withheld question again (submitted, confirmed and approved by the owner).',
    MOVE: `Add a new version in ${section}${target.move?.name ? ` (taxonomy "${target.move.name}")` : ''}. ${version.state === 'APPROVED' ? 'It is approved and served instead of this one.' : `It stays ${version.state === 'IN_REVIEW' ? 'IN_REVIEW' : 'a DRAFT'} for Publish.`}`,
  }[action];
  log(plan);
  if (confirm === undefined) {
    log(`Dry run only. To apply, run again with --confirm "${phrase}".`);
    return { ok: true, phrase, applied: false };
  }
  if (confirm !== phrase) throw new Error(`Confirmation does not match. Expected exactly: "${phrase}"`);
  const backup = await startPersistentPostgres(dataDirectory);
  try { await backupLocalDatabase({ connectionConfig: backup.connectionConfig, directory: `${dataDirectory}-backups` }); }
  finally { await backup.stop(); }

  const prefix = ROUTE_PREFIX[version.schema_version];
  const key = (step) => `question-change-${action.toLowerCase()}-${versionId}-${version.revision}-${step}`;
  if (action === 'PUBLISH') {
    const preview = await ownerPublish({ dataDirectory, versionIds: [versionId], imageStoreDirectory, log: () => {} });
    if (preview.phrase !== 'PUBLISH 1 ALL') throw new Error('This version is not a publishable practice-pool or corpus draft (its source is not one the owner publication accepts)');
    await ownerPublish({ dataDirectory, versionIds: [versionId], imageStoreDirectory, confirm: preview.phrase, log: () => {} });
    log(`Published ${versionId}.`);
    return { ok: true, phrase, applied: true };
  }
  if (action === 'WITHHOLD') {
    await withRuntime(dataDirectory, version.schema_version, async (origin) => {
      const manager = await session(origin, 'bankManager');
      await manager(`/api/${prefix}/question-versions/${versionId}/quarantine`,
        { expectedRevision: version.revision, reason: `Withheld by the owner on the admin page: ${reason.trim()}`.slice(0, 4_000) }, key('quarantine'));
    });
    log(`Withheld ${versionId}.`);
    return { ok: true, phrase, applied: true };
  }
  if (action === 'RESTORE') {
    await withRuntime(dataDirectory, version.schema_version, async (origin) => {
      const author = await session(origin, 'author');
      await author(`/api/${prefix}/question-versions/${versionId}/submit-review`, { expectedRevision: version.revision }, key('submit'));
    });
    await approve(dataDirectory, versionId, 'Restored by the project owner on the local admin page after it had been withheld. '
      + 'The owner is responsible for the stored key.', imageStoreDirectory);
    log(`Restored ${versionId}; it is published again.`);
    return { ok: true, phrase, applied: true };
  }

  // MOVE: a new version of the same question in the other section, then the same workflow position as before.
  const draft = buildRevisionDraft(target, { classification: 'MOVE', note: MOVE_NOTE(version.section, section), changes: { section, taxonomy: target.move },
    transformation: MOVE_NOTE(version.section, section) });
  const created = await withRuntime(dataDirectory, version.schema_version, async (origin) => {
    const author = await session(origin, 'author');
    const result = await author(`/api/${prefix}/questions/${version.question_id}/versions`, { parentVersionId: versionId, draft }, key('version'));
    if (version.state !== 'DRAFT') await author(`/api/${prefix}/question-versions/${result.versionId}/submit-review`, { expectedRevision: 1 }, key('submit'));
    return result;
  });
  if (version.state === 'APPROVED') {
    try {
      await approve(dataDirectory, created.versionId, `${MOVE_NOTE(version.section, section)} Approved by the project owner on the local admin page.`, imageStoreDirectory);
    } catch (error) {
      throw new Error(`${error.message}. The new version ${created.versionId} is IN_REVIEW and not approved; version ${versionId} is still served.`);
    }
  }
  log(`Moved to ${section} as version ${created.versionId}${version.state === 'APPROVED' ? ', approved and served' : ''}.`);
  return { ok: true, phrase, applied: true, newVersionId: created.versionId };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  const usage = 'Usage: npm run bank:question -- --version <uuid> (--publish | --withhold --reason "..." | --restore | --section MATH|READING|SCIENCE) [--confirm "<phrase>"]\n';
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index], next = args[index + 1];
    if (value === '--publish') options.action = 'PUBLISH';
    else if (value === '--withhold') options.action = 'WITHHOLD';
    else if (value === '--restore') options.action = 'RESTORE';
    else if (value === '--section' && typeof next === 'string') { options.action = 'MOVE'; options.section = next; index += 1; }
    else if (value === '--version' && typeof next === 'string') { options.versionId = next; index += 1; }
    else if (value === '--reason' && typeof next === 'string') { options.reason = next; index += 1; }
    else if (value === '--confirm' && typeof next === 'string') { options.confirm = next; index += 1; }
    else { process.stderr.write(usage); process.exit(1); }
  }
  if (!options.action || !options.versionId) { process.stderr.write(usage); process.exit(1); }
  try {
    const result = await changeQuestion({ ...options, dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') });
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`Question change stopped: ${error.message}\nBackups taken before changes are in .local/track-b-backups/.\n`);
    process.exitCode = 1;
  }
}
