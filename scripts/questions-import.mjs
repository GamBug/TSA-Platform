// Import a validated question set (tsa-question-set/1) into the Bank as DRAFTs.
//   npm run questions:import -- --file set.json --source-version <uuid> [--topic-map map.json] [--taxonomy-version <uuid>]
//   npm run questions:import -- ... --confirm "IMPORT 20"
// Dry run by default. The operator names an existing source version; its recorded rights are reused and no source or
// rights record is created or changed. Questions are created as DRAFT only: never submitted, reviewed or published.
// Planning is all-or-nothing; writing is per question and idempotent, so a failed run is completed by running it again.
// A database backup is taken before anything is written.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { materializeDrafts, importConfirmation, IMPORT_ROUTE, planExchangeImport } from '../src/local/exchange-import.mjs';
import { backupLocalDatabase } from '../src/local/database-backup.mjs';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { createTrackBRuntime } from '../src/local/track-b.mjs';
import { session } from './owner-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The local author account that creates every draft; receipts record it as the importer.
const AUTHOR_USER_ID = '00000000-0000-4000-8000-000000000201';

export async function importQuestions({ dataDirectory, document, sourceVersionId, topicMap = {}, taxonomyVersionId = null, confirm, log = (line) => process.stdout.write(`${line}\n`) }) {
  const database = await startPersistentPostgres(dataDirectory);
  let plan;
  let drafts = [];
  try {
    plan = await planExchangeImport(database.ownerPool, document, { sourceVersionId, topicMap, taxonomyVersionId });
    for (const item of plan.items) {
      log(`${item.action.padEnd(11)} ${item.questionId}  content_version ${item.contentVersion}  ${item.schemaVersion}${item.parent ? `  (after version ${item.parent.contentVersion})` : ''}`);
    }
    for (const problem of plan.problems) log(`PROBLEM     ${problem.questionId ?? '(document)'}  [${problem.code}]  ${problem.message}`);
    const writes = plan.items.filter((item) => item.action !== 'SKIP');
    const phrase = importConfirmation(writes.length);
    if (!plan.ok) { log(`Not importable: ${plan.problems.length} problem(s). Nothing was written.`); return { imported: 0, plan, phrase }; }
    if (confirm === undefined) {
      log(writes.length === 0 ? 'Nothing to import: every question is already imported.' : `Dry run only. To import ${writes.length} draft(s), run again with --confirm "${phrase}".`);
      return { imported: 0, plan, phrase };
    }
    if (confirm !== phrase) throw new Error(`Confirmation does not match. Expected exactly: "${phrase}"`);
    if (writes.length === 0) return { imported: 0, plan, phrase };
    await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: `${dataDirectory}-backups` });
    drafts = await materializeDrafts(database.ownerPool, plan, { sourceVersionId, batchId: document.batch_id });
  } finally { await database.stop(); }

  const numeric = drafts.some(({ draft }) => draft.schemaVersion === 'question/2');
  const clozeMatching = drafts.some(({ draft }) => draft.schemaVersion === 'question/3');
  const created = [];
  const runtime = await createTrackBRuntime({ env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true',
    ...((numeric || clozeMatching) ? { LOCAL_STUDENT_ENABLED: 'true' } : {}),
    ...(numeric ? { LOCAL_NUMERIC_PRACTICE_ENABLED: 'true' } : {}),
    ...(clozeMatching ? { LOCAL_CLOZE_MATCHING_ENABLED: 'true' } : {}) }, dataDirectory, port: 0 });
  try {
    const author = await session(runtime.origin, 'author');
    for (const { item, draft } of drafts) {
      const prefix = IMPORT_ROUTE[draft.schemaVersion];
      const key = `exchange-${item.documentHash.slice(7, 39)}`;
      const route = item.action === 'NEW_VERSION' ? `/api/${prefix}/questions/${item.parent.questionId}/versions` : `/api/${prefix}/questions`;
      const body = item.action === 'NEW_VERSION' ? { parentVersionId: item.parent.versionId, draft } : draft;
      const result = await author(route, body, key);
      await runtime.bankPool.query(`INSERT INTO tsa_private.exchange_import_receipts
          (exchange_question_id, content_version, batch_id, question_id, question_version_id, document_hash, imported_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (exchange_question_id, content_version) DO NOTHING`,
      [item.questionId, item.contentVersion, document.batch_id, result.questionId, result.versionId, item.documentHash, AUTHOR_USER_ID]);
      created.push({ questionId: item.questionId, versionId: result.versionId, state: result.state });
      log(`Imported ${item.questionId} as DRAFT version ${result.versionId}`);
    }
  } finally { await runtime.close(); }
  return { imported: created.length, created, phrase: importConfirmation(created.length) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  const names = { '--file': 'file', '--source-version': 'sourceVersion', '--topic-map': 'topicMap', '--taxonomy-version': 'taxonomyVersion', '--confirm': 'confirm' };
  for (let index = 0; index < args.length; index += 2) {
    if (!names[args[index]] || typeof args[index + 1] !== 'string') {
      process.stderr.write('Usage: npm run questions:import -- --file set.json --source-version <uuid> [--topic-map map.json] [--taxonomy-version <uuid>] [--confirm "IMPORT N"]\n');
      process.exit(1);
    }
    options[names[args[index]]] = args[index + 1];
  }
  if (!options.file || !options.sourceVersion) { process.stderr.write('--file and --source-version are required.\n'); process.exit(1); }
  try {
    await importQuestions({
      dataDirectory: process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b'),
      document: JSON.parse(await readFile(options.file, 'utf8')), sourceVersionId: options.sourceVersion,
      topicMap: options.topicMap ? JSON.parse(await readFile(options.topicMap, 'utf8')) : {}, taxonomyVersionId: options.taxonomyVersion ?? null, confirm: options.confirm,
    });
  } catch (error) {
    process.stderr.write(`Import stopped: ${error.message}\nThe backup taken before changes is in .local/track-b-backups/.\n`);
    process.exitCode = 1;
  }
}
