// Blind answer verification workflow (read-only against the Bank).
//   export:  node scripts/answer-verify.mjs export --section MATH --out-dir <private dir> [--label batch-01]
//              [--types SINGLE_CHOICE,NUMERIC_RESPONSE] [--exclude-batches math-batch-001,math-batch-002]
//              [--limit 20] [--offset 0]   (--exclude-batches matches factory import batches only)
//            writes <label>.blind.json (give this to the solver: no keys, no explanations) and <label>.private.json (keys).
//   compare: node scripts/answer-verify.mjs compare --private <label>.private.json --solutions <label>.solutions.json --out-dir <dir>
//            classifies every item VERIFIED, DISPUTED or NEEDS_HUMAN_REVIEW and writes a private report and a count-only summary.
// Point TRACK_B_DATA_DIRECTORY at a copy of the Bank to keep the retained cluster closed. Nothing here writes to the Bank
// and no key is changed: a human decides what to do with DISPUTED and NEEDS_HUMAN_REVIEW items.
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import { withTransaction } from '../src/modules/database/pool.mjs';
import { buildExport, compareSolutions } from '../tools/answer-verification/verification-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = () => process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b');
const TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP', 'NUMERIC_RESPONSE', 'CLOZE', 'MATCHING'];

function parse(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index].startsWith('--') || args[index + 1] === undefined) throw new TypeError(`Unexpected argument ${args[index]}`);
    options[args[index].slice(2)] = args[index + 1];
  }
  return options;
}

const privateFile = async (file, value) => { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); await chmod(file, 0o600); };

/** Published (selectable) versions in a stable order, optionally limited by type and import batch. */
export async function loadPublished(pool, { section, types = TYPES, excludeBatches = [], limit = 20, offset = 0 }) {
  // The selection gate admits numeric and cloze/matching versions only while their protocol settings are on, as they are for students.
  return withTransaction(pool, async (client) => {
  await client.query("SELECT set_config('tsa.enable_numeric_practice', 'true', true), set_config('tsa.enable_cloze_matching', 'true', true)");
  const result = await client.query(`SELECT v.id, v.interaction, v.content, s.answer_key, r.batch_key,
        (SELECT st.content FROM tsa.stimulus_versions st WHERE st.id = v.stimulus_version_id) AS passage
      FROM tsa.question_versions v JOIN tsa.questions q ON q.eligible_version_id = v.id
      JOIN tsa_private.question_secrets s ON s.question_version_id = v.id
      LEFT JOIN tsa_private.factory_import_receipts r ON r.question_version_id = v.id
     WHERE v.section = $1::tsa.question_section AND v.interaction->>'type' = ANY($2::text[]) AND tsa.bank_question_selection_allowed(v.id)
       AND (r.batch_key IS NULL OR r.batch_key <> ALL($3::text[]))
     ORDER BY COALESCE(r.batch_key, ''), v.id LIMIT $4 OFFSET $5`, [section, types, excludeBatches, limit, offset]);
  return result.rows;
  });
}

export async function runExport(options, log = (line) => process.stdout.write(`${line}\n`)) {
  if (!options.section || !options['out-dir']) throw new TypeError('export needs --section and --out-dir');
  const label = options.label ?? `batch-${Date.now()}`;
  const types = options.types ? options.types.split(',') : TYPES;
  if (types.some((type) => !TYPES.includes(type))) throw new TypeError(`--types must be among ${TYPES.join(', ')}`);
  const limit = Number(options.limit ?? 20), offset = Number(options.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0) throw new TypeError('--limit must be 1-1000 and --offset a non-negative integer');
  const database = await startPersistentPostgres(dataDirectory());
  let rows;
  try {
    rows = await loadPublished(database.ownerPool, { section: options.section, types, excludeBatches: options['exclude-batches'] ? options['exclude-batches'].split(',') : [],
      limit, offset });
  } finally { await database.stop(); }
  const built = buildExport(rows.map((row) => ({ id: row.id, interaction: row.interaction, content: row.content, answer_key: row.answer_key, passage: row.passage })), { salt: randomBytes(12).toString('hex'), label });
  await mkdir(options['out-dir'], { recursive: true, mode: 0o700 });
  await privateFile(path.join(options['out-dir'], `${label}.blind.json`), built.blind);
  await privateFile(path.join(options['out-dir'], `${label}.private.json`), built.private);
  log(`Exported ${rows.length} item(s) to ${options['out-dir']}: ${label}.blind.json for the solver, ${label}.private.json holds the keys.`);
  return built;
}

export async function runCompare(options, log = (line) => process.stdout.write(`${line}\n`)) {
  if (!options.private || !options.solutions || !options['out-dir']) throw new TypeError('compare needs --private, --solutions and --out-dir');
  const report = compareSolutions(JSON.parse(await readFile(options.private, 'utf8')), JSON.parse(await readFile(options.solutions, 'utf8')));
  await mkdir(options['out-dir'], { recursive: true, mode: 0o700 });
  const stem = path.basename(options.solutions).replace(/\.solutions\.json$|\.json$/u, '');
  const rows = report.results.map((result) => `| ${result.itemId} | ${result.versionId} | ${result.type} | ${result.verdict} | ${result.reason} | ${result.confidence ?? ''} |`);
  await writeFile(path.join(options['out-dir'], `${stem}.report.private.md`), `# Verification report (private: names versions)\n\nSolver: ${report.solver}\n\nExport: ${report.exportHash}\n\n`
    + `| Verified | Disputed | Needs human review |\n|---|---|---|\n| ${report.counts.VERIFIED} | ${report.counts.DISPUTED} | ${report.counts.NEEDS_HUMAN_REVIEW} |\n\n`
    + `| Item | Version | Type | Verdict | Reason | Confidence |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  await writeFile(path.join(options['out-dir'], `${stem}.summary.json`), `${JSON.stringify({ solver: report.solver, exportHash: report.exportHash, total: report.total, counts: report.counts, unknownItems: report.unknownItems }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  log(`${report.total} item(s): ${report.counts.VERIFIED} VERIFIED, ${report.counts.DISPUTED} DISPUTED, ${report.counts.NEEDS_HUMAN_REVIEW} NEEDS_HUMAN_REVIEW.${report.unknownItems.length ? ` ${report.unknownItems.length} solution(s) named unknown items.` : ''}`);
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command, ...rest] = process.argv.slice(2);
    const options = parse(rest);
    if (command === 'export') await runExport(options);
    else if (command === 'compare') await runCompare(options);
    else throw new TypeError('Usage: node scripts/answer-verify.mjs <export|compare> [options]');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
