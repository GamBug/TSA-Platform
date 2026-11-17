// Owner command: correct or withhold defective published questions in the retained Bank.
//   npm run bank:correct -- --spec <private-spec.json>                    dry run: plan and confirmation phrase
//   npm run bank:correct -- --spec <private-spec.json> --confirm "CORRECT 5"
// The spec is private (it holds answer keys) and stays outside Git. A workspace backup is taken before changes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';
import {
  buildRevisionDraft, confirmationPhrase, ownerApprove, ownerConfirmSingleton, parseCorrectionSpec,
  planCorrections, ROUTE_PREFIX, specDigest,
} from '../src/local/bank-correction.mjs';
import { session } from './owner-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTHOR = 'author';
const MANAGER = 'bankManager';

function approvalReason(spec, item) {
  return `Corrected version approved on the owner connection under the owner's 2026-11-16 correction instruction. ${spec.reason} `
    + `Classification ${item.classification}. Independent solve recorded in the private audit artifact.`.slice(0, 4_000);
}

export async function applyCorrections({ dataDirectory, spec: rawSpec, confirm, log = (line) => process.stdout.write(`${line}\n`) }) {
  const spec = parseCorrectionSpec(rawSpec);
  const digest = specDigest(spec);
  const phrase = confirmationPhrase(spec.items.length);
  const database = await startPersistentPostgres(dataDirectory);
  let planned;
  try { planned = await planCorrections(database.ownerPool, spec); }
  finally { await database.stop(); }
  const plan = planned.rows;
  for (const row of plan) {
    log(`${row.action.padEnd(8)} ${row.versionId} ${row.schemaVersion} ${row.state}${row.served ? ' (served)' : ''} ${row.classification}`
      + `${row.fields.length ? ` [${row.fields.join(', ')}]` : ''}${row.problems.length ? ` PROBLEMS: ${row.problems.join('; ')}` : ''}`);
  }
  const blocked = plan.filter((row) => row.problems.length);
  if (confirm === undefined) {
    log(`Dry run only. ${blocked.length ? `${blocked.length} item(s) cannot proceed.` : `To apply, run again with --confirm "${phrase}".`}`);
    return { applied: 0, phrase, plan };
  }
  if (confirm !== phrase) throw new Error(`Confirmation does not match. Expected exactly: "${phrase}"`);
  if (blocked.length) throw new Error(`${blocked.length} correction(s) cannot proceed; nothing was changed`);

  const schemas = new Set(plan.map((row) => row.schemaVersion));
  const numeric = schemas.has('question/2');
  const clozeMatching = schemas.has('question/3');
  const revisions = [];
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true',
    ...((numeric || clozeMatching) ? { LOCAL_STUDENT_ENABLED: 'true' } : {}),
    ...(numeric ? { LOCAL_NUMERIC_PRACTICE_ENABLED: 'true' } : {}),
    ...(clozeMatching ? { LOCAL_CLOZE_MATCHING_ENABLED: 'true' } : {}) }, dataDirectory, port: 0 });
  try {
    const author = await session(runtime.origin, AUTHOR);
    const manager = await session(runtime.origin, MANAGER);
    for (const item of spec.items) {
      const target = planned.targets.get(item.versionId);
      const prefix = ROUTE_PREFIX[target.version.schema_version];
      const key = (step) => `bank-correct-${digest}-${item.versionId.slice(0, 8)}-${step}`;
      if (item.action === 'WITHHOLD') {
        await manager(`/api/${prefix}/question-versions/${item.versionId}/quarantine`, {
          expectedRevision: target.version.revision, reason: `NEEDS_MANUAL_REVIEW (${item.classification}): ${item.note}`.slice(0, 4_000) }, key('quarantine'));
        log(`Withheld ${item.versionId}`);
        continue;
      }
      const draft = buildRevisionDraft(target, item);
      const created = await author(`/api/${prefix}/questions/${target.version.question_id}/versions`,
        { parentVersionId: item.versionId, draft }, key('version'));
      await author(`/api/${prefix}/question-versions/${created.versionId}/submit-review`, { expectedRevision: 1 }, key('submit'));
      revisions.push({ item, versionId: created.versionId });
      log(`Revised ${item.versionId} as version ${created.versionId}, awaiting approval`);
    }
  } finally { await runtime.close(); }

  const database2 = await startPersistentPostgres(dataDirectory);
  try {
    for (const { item, versionId } of revisions) {
      try {
        await ownerConfirmSingleton(database2.ownerPool, versionId, { recordExisting: true });
        await ownerApprove(database2.ownerPool, versionId, { reason: approvalReason(spec, item) });
      } catch (error) {
        const pending = revisions.filter((entry) => entry.versionId !== versionId).map((entry) => entry.versionId);
        throw new Error(`${error.message}. Revised version ${versionId} (replacing ${item.versionId}) is IN_REVIEW and not approved; `
          + `other revisions created in this run: ${pending.join(', ') || 'none'}. The original versions still serve until each is approved.`);
      }
      log(`Approved corrected version ${versionId} (replaces ${item.versionId})`);
    }
  } finally { await database2.stop(); }
  return { applied: spec.items.length, phrase, revisions: revisions.map(({ item, versionId }) => ({ from: item.versionId, to: versionId })) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] === '--spec' && typeof args[index + 1] === 'string') options.spec = args[index + 1];
    else if (args[index] === '--confirm' && typeof args[index + 1] === 'string') options.confirm = args[index + 1];
    else { process.stderr.write('Usage: npm run bank:correct -- --spec <private-spec.json> [--confirm "CORRECT N"]\n'); process.exit(1); }
  }
  if (!options.spec) { process.stderr.write('A --spec file is required.\n'); process.exit(1); }
  try {
    const spec = JSON.parse(await readFile(options.spec, 'utf8'));
    await applyCorrections({ spec, confirm: options.confirm, dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b') });
  } catch (error) {
    process.stderr.write(`Correction stopped: ${error.message}\nThe backup taken before changes is in .local/track-b-backups/.\n`);
    process.exitCode = 1;
  }
}
