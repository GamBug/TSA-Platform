// Owner command: import question sets pasted from ChatGPT into the separate practice pool, as DRAFTs.
//   npm run questions:inbox                                         dry run: checks every pasted file, writes nothing
//   npm run questions:inbox -- --confirm "IMPORT 20"                imports the importable files and sorts every file
//   npm run questions:inbox -- --setup [--confirm "REGISTER TAXONOMY"]   one time: register the practice pool
//   npm run questions:inbox -- --only math/<file> [--report <file.json>]   check or import that one file only; the
//                                                                   report is a JSON summary for the admin page
// Paste each ChatGPT answer as a file in question-inbox/math, question-inbox/reading or question-inbox/science
// (.json, .txt or .md; a ```json code block or bare JSON). A confirmed run registers each importable file as its own
// OWNED source, imports its questions as DRAFTs into the pool (a backup is taken first), and moves the file to
// <subject>/imported/. A file with any problem is imported not at all and moves to <subject>/rejected/ with a
// .errors.txt message ready to paste back into ChatGPT. A file whose batch_id starts with SRC- is a transcription of the
// owner's pictures or PDFs: it joins the same pool but its source is recorded as corpus material under the owner's
// attested permission instead of as an original work. Nothing is submitted, approved or published here:
// the owner reviews and runs bank:owner-publish with the printed --taxonomy-version.
// Figures: an image file next to the pasted answer named <question or passage id>_<request id>.png (for example
// MATH-S261122A-000031_NEW-IMG-001.png) answers that image_request block. A confirmed run registers it in the image
// library under the pasted file's own source and imports the question with its figure (src/local/inbox-figures.mjs).
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importConfirmation, planExchangeImport } from '../src/local/exchange-import.mjs';
import { attachFigures, isFigureFile, matchFigures, questionsWithAllFigures } from '../src/local/inbox-figures.mjs';
import { startPersistentPostgres } from '../src/local/postgres.mjs';
import {
  findPracticePool, isTranscription, ORIGINAL_RIGHTS, ORIGINAL_SOURCE_PREFIX, PRACTICE_POOL_DOMAINS, PRACTICE_POOL_NAME, poolSkill,
  TRANSCRIBED_RIGHTS, TRANSCRIBED_SOURCE_PREFIX,
} from '../src/local/practice-pool.mjs';
import { validateExchange } from '../tools/question-bank/validate.mjs';
import { openImageStore } from './image-library.mjs';
import { importQuestions } from './questions-import.mjs';
import { fileHash, findSourceVersion, writeSourceVersion } from './register-corpus-source.mjs';
import { registerTaxonomy } from './register-taxonomy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INBOX_SUBJECTS = Object.freeze({ math: 'MATH', reading: 'READING', science: 'SCIENCE' });
const PASTE_EXTENSIONS = new Set(['.json', '.txt', '.md']);
/** Problems answered with figure files, not by ChatGPT changing the JSON. */
const FIGURE_CODES = new Set(['ASSET_REQUIRED', 'FIGURE_INVALID']);
const DEFAULT_IMAGE_STORE =() => process.env.TSA_IMAGE_STORE_DIRECTORY ?? path.join(ROOT, '.local', 'track-b-images');

/**
 * Pull the JSON document out of a pasted ChatGPT answer: the largest ```json (or bare ```) code block, otherwise the
 * text from the first "{" to the last "}". Returns { document } or { error }. Pure.
 */
export function extractJson(text) {
  const clean = text.replace(/^﻿/, '');
  const blocks = [...clean.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)].map((match) => match[1]);
  let candidate;
  if (blocks.length) candidate = blocks.sort((a, b) => b.length - a.length)[0];
  else {
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start === -1 || end < start) return { error: 'No JSON object was found in the file.' };
    candidate = clean.slice(start, end + 1);
  }
  try { return { document: JSON.parse(candidate) }; } catch (error) { return { error: `The JSON does not parse: ${error.message}` }; }
}

/**
 * The message to paste back into the ChatGPT conversation for a rejected file. Problems ChatGPT fixes in the JSON come
 * first; figures that are still missing become a FIGURES request: ChatGPT crops (or draws) each one with its Python
 * tool and offers it as a PNG named the way the inbox expects. Pure.
 */
export function chatGptFixMessage(problems, missingFigures = []) {
  const json = problems.filter((problem) => !FIGURE_CODES.has(problem.code));
  const parts = [];
  if (json.length || missingFigures.length === 0) {
    parts.push(['The platform rejected your JSON. Fix exactly these problems, keep every other question unchanged, and send the',
      'whole corrected document again as one ```json code block. If a question cannot be fixed with certainty, remove it.', '',
      ...(json.length ? json : problems).map((problem) => `- ${problem.questionId ? `${problem.questionId}: ` : ''}[${problem.code}] ${problem.message}`)].join('\n'));
  }
  if (missingFigures.length) {
    parts.push(['FIGURES · The platform needs these figures as image files. With Python, crop each one from the pages I sent',
      '(or draw it, for a question you created), show it to me, and put every PNG into ONE ZIP (PNG files only, no folders) to download,', 'with each file named exactly:', '',
      ...missingFigures.map((figure) => `- ${figure.fileName}  (${figure.unreadable ? 'the file I saved could not be read; make it again. ' : ''}`
        + `${figure.description.replace(/\s+/g, ' ').slice(0, 160)})`),
      '', 'Do not change the JSON for this.'].join('\n'));
  }
  return parts.join('\n\n');
}

/** Every pasted file, in a stable order, with its folder's subject and the figure files of that folder. `only` keeps one
 * "<folder>/<name>" file. */
async function pastedFiles(inbox, only = null) {
  const files = [];
  for (const [folder, subject] of Object.entries(INBOX_SUBJECTS)) {
    const directory = path.join(inbox, folder);
    await mkdir(path.join(directory, 'imported'), { recursive: true });
    await mkdir(path.join(directory, 'rejected'), { recursive: true });
    const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const figures = entries.filter((entry) => isFigureFile(entry.name)).map((entry) => path.join(directory, entry.name));
    for (const entry of entries) {
      if (only !== null && only !== `${folder}/${entry.name}`) continue;
      if (PASTE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push({ subject, folder, name: entry.name, file: path.join(directory, entry.name), figures });
      }
    }
  }
  return files;
}

/** Check one pasted file against the Bank without writing. Adds { document, problems, writes, topicMap, figures }. */
async function checkFile(client, entry, taxonomyVersionId, seenIds) {
  const extracted = extractJson(await readFile(entry.file, 'utf8'));
  if (extracted.error) return { ...entry, problems: [{ questionId: null, code: 'NOT_JSON', message: extracted.error }], writes: 0, missing: [] };
  const document = extracted.document;
  const problems = [];
  const questions = Array.isArray(document?.questions) ? document.questions : [];
  for (const question of questions) {
    if (question?.subject !== entry.subject) {
      problems.push({ questionId: question?.question_id ?? null, code: 'WRONG_FOLDER', message: `Subject ${question?.subject} does not belong in the ${entry.folder} folder; every question must be ${entry.subject}` });
    }
    if (typeof question?.question_id === 'string') {
      if (seenIds.has(question.question_id)) problems.push({ questionId: question.question_id, code: 'DUPLICATE_ACROSS_FILES', message: `The id is also used in ${seenIds.get(question.question_id)}; give every question in every file its own id` });
      else seenIds.set(question.question_id, entry.name);
    }
  }
  const figures = await matchFigures(document, entry.figures);
  problems.push(...figures.problems);
  // Every topic maps to the subject's one skill in the pool; the author's topic is kept in the provenance text.
  const topicMap = Object.fromEntries(questions.filter((question) => typeof question?.topic === 'string' && typeof question?.subject === 'string')
    .map((question) => [question.topic, poolSkill(question.subject)]));
  if (taxonomyVersionId === null) {
    const report = validateExchange(document);
    for (const issue of report.errors) problems.push({ questionId: null, code: issue.code, message: `${issue.path || '(document)'}: ${issue.message}` });
    return { ...entry, document, topicMap, problems, writes: 0, figures, missing: figures.missing };
  }
  const plan = await planExchangeImport(client, document, { deferSourceCheck: true, topicMap, taxonomyVersionId });
  // A figure supplied as a file answers the plan's ASSET_REQUIRED problem; the confirmed run registers it first.
  const ready = questionsWithAllFigures(document, figures);
  problems.push(...plan.problems.filter((problem) => !(problem.code === 'ASSET_REQUIRED' && ready.has(problem.questionId))));
  return { ...entry, document, topicMap, problems, writes: plan.items.filter((item) => item.action !== 'SKIP').length, figures, missing: figures.missing };
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

async function sortInto(entry, outcome, problems = []) {
  const prefix = stamp();
  const target = path.join(path.dirname(entry.file), outcome, `${prefix}-${entry.name}`);
  await rename(entry.file, target);
  if (problems.length) await writeFile(`${target}.errors.txt`, `${chatGptFixMessage(problems, entry.missing ?? [])}\n`, 'utf8');
  // Figures used by an imported file go with it; a rejected file keeps its figures in the inbox for the next run.
  if (outcome === 'imported') {
    for (const figure of entry.figures?.supplied?.values() ?? []) {
      await rename(figure, path.join(path.dirname(entry.file), outcome, `${prefix}-${path.basename(figure)}`)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
  return target;
}

/** A JSON-ready summary of one run for the admin page's AI studio. Pure. */
export function inboxReport(result) {
  return {
    taxonomyVersionId: result.taxonomyVersionId ?? null, phrase: result.phrase ?? null, imported: result.imported ?? 0,
    createdVersionIds: result.createdVersionIds ?? [], twinVersionIds: result.twinVersionIds ?? [],
    files: (result.checked ?? []).map((entry) => ({ folder: entry.folder, name: entry.name, writes: entry.writes ?? 0,
      problems: entry.problems ?? [], missingFigures: (entry.missing ?? []).map((figure) => figure.fileName) })),
  };
}

export async function runInbox({ dataDirectory, inbox, confirm, only = null, imageStoreDirectory = DEFAULT_IMAGE_STORE(), log = (line) => process.stdout.write(`${line}\n`) }) {
  const files = await pastedFiles(inbox, only);
  const database = await startPersistentPostgres(dataDirectory);
  let taxonomyVersionId, checked = [];
  try {
    taxonomyVersionId = await findPracticePool(database.ownerPool);
    const seenIds = new Map();
    for (const entry of files) checked.push(await checkFile(database.ownerPool, entry, taxonomyVersionId, seenIds));
  } finally { await database.stop(); }

  if (files.length === 0) log(`The inbox is empty. Paste ChatGPT answers into ${Object.keys(INBOX_SUBJECTS).map((folder) => path.join(inbox, folder)).join(', ')}.`);
  for (const entry of checked) {
    const count = Array.isArray(entry.document?.questions) ? entry.document.questions.length : 0;
    const kind = isTranscription(entry.document) ? 'transcription' : 'original';
    const attached = entry.figures?.supplied?.size ?? 0;
    log(entry.problems.length ? `REJECT  ${entry.folder}/${entry.name}: ${entry.problems.length} problem(s)`
      : `OK      ${entry.folder}/${entry.name}: ${count} question(s), ${entry.writes} new, ${kind}${attached ? `, ${attached} figure(s) attached` : ''}`);
    if (entry.problems.length && confirm === undefined) log(`\n${chatGptFixMessage(entry.problems, entry.missing).replace(/^/gm, '        ')}\n`);
    if (entry.missing?.length) {
      log(`        Missing figure files: save each one in ${path.join(inbox, entry.folder)} with exactly the name shown above\n`
        + '        (paste the FIGURES request into the same ChatGPT chat, or crop it yourself), then run the inbox again.\n');
    }
  }
  if (taxonomyVersionId === null) {
    log(`The practice pool is not registered yet. Run once: npm run questions:inbox -- --setup --confirm "REGISTER TAXONOMY"`);
    return { taxonomyVersionId, imported: 0, checked };
  }
  const good = checked.filter((entry) => entry.problems.length === 0);
  const rejected = checked.filter((entry) => entry.problems.length > 0);
  const phrase = importConfirmation(good.reduce((sum, entry) => sum + entry.writes, 0));
  if (confirm === undefined) {
    if (good.length) log(`Dry run only. To import ${good.length} file(s) and move the ${rejected.length} rejected one(s) aside, run:\n  npm run questions:inbox -- --confirm "${phrase}"`);
    else if (rejected.length) log(`Nothing is importable. Paste each message above into its ChatGPT conversation, then replace the file with the corrected answer.`);
    return { taxonomyVersionId, imported: 0, phrase, checked };
  }
  if (confirm !== phrase) throw new Error(`Confirmation does not match. Expected exactly: "${phrase}"`);

  let imported = 0, figuresRegistered = 0;
  const createdVersionIds = [];
  for (const entry of rejected) log(`Rejected ${entry.folder}/${entry.name} -> ${path.relative(inbox, await sortInto(entry, 'rejected', entry.problems))}`);
  for (const entry of good) {
    const source = isTranscription(entry.document)
      ? { prefix: TRANSCRIBED_SOURCE_PREFIX, origin: 'EXTERNAL', rights: TRANSCRIBED_RIGHTS }
      : { prefix: ORIGINAL_SOURCE_PREFIX, origin: 'OWNED', rights: ORIGINAL_RIGHTS };
    const title = `${source.prefix}${entry.folder}/${entry.name}`.slice(0, 200);
    const hash = await fileHash(entry.file);
    const sourceVersionId = await findSourceVersion(dataDirectory, { title, hash })
      ?? await writeSourceVersion({ dataDirectory, file: entry.file, hash, title, origin: source.origin, rights: source.rights, registeredBy: 'questions:inbox' });
    let document = entry.document;
    if (entry.figures.supplied.size) {
      const figureDatabase = await startPersistentPostgres(dataDirectory);
      try {
        const attached = await attachFigures(figureDatabase.ownerPool, await openImageStore(imageStoreDirectory),
          { document, supplied: entry.figures.supplied, subject: entry.subject, sourceVersionId });
        document = attached.document;
        figuresRegistered += attached.registered.length;
        for (const figure of attached.registered) log(`Figure ${figure.key} -> ${figure.assetCode}${figure.created ? '' : ' (already in the library)'}`);
      } finally { await figureDatabase.stop(); }
    }
    const result = await importQuestions({ dataDirectory, document, sourceVersionId, topicMap: entry.topicMap, taxonomyVersionId,
      confirm: importConfirmation(entry.writes), log: () => {} });
    if (result.plan && !result.plan.ok) {
      log(`Rejected ${entry.folder}/${entry.name} -> ${path.relative(inbox, await sortInto(entry, 'rejected', result.plan.problems))}`);
      continue;
    }
    imported += result.imported;
    createdVersionIds.push(...(result.created ?? []).map((row) => row.versionId));
    log(`Imported ${result.imported} DRAFT(s) from ${entry.folder}/${entry.name} -> ${path.relative(inbox, await sortInto(entry, 'imported'))}`);
  }
  const twinVersionIds = await openTwinVersions(dataDirectory, createdVersionIds);
  const twins = twinVersionIds.length;
  if (twins) log(`WARNING: ${twins} imported question(s) are exact copies of a question already in the Bank. While a twin is open, neither copy is served.\n`
    + '  Publish with --keep-one-of-twins to keep one of each pair.');
  log(`Imported ${imported} DRAFT(s) into the practice pool${figuresRegistered ? ` with ${figuresRegistered} figure(s)` : ''}. Review them, then publish:\n`
    + `  npm run bank:owner-publish -- --taxonomy-version ${taxonomyVersionId}${twins ? ' --keep-one-of-twins' : ''}\n`
    + 'Then restart the local demo, or upload the Bank to the live server (bash infra/server/upload-bank.sh).');
  return { taxonomyVersionId, imported, phrase, checked, createdVersionIds, twins, twinVersionIds, figuresRegistered };
}

/** The given versions that are one side of an open exact-duplicate relation. */
async function openTwinVersions(dataDirectory, versionIds) {
  if (versionIds.length === 0) return [];
  const database = await startPersistentPostgres(dataDirectory);
  try {
    const rows = (await database.ownerPool.query(`SELECT left_version_id, right_version_id FROM tsa.duplicate_relations
      WHERE kind='EXACT' AND resolution='OPEN' AND (left_version_id = ANY($1::uuid[]) OR right_version_id = ANY($1::uuid[]))`, [versionIds])).rows;
    const wanted = new Set(versionIds);
    return [...new Set(rows.flatMap((row) => [row.left_version_id, row.right_version_id]).filter((id) => wanted.has(id)))];
  } finally { await database.stop(); }
}

export function setupPracticePool({ dataDirectory, confirm, log }) {
  return registerTaxonomy({ dataDirectory, name: PRACTICE_POOL_NAME, domains: PRACTICE_POOL_DOMAINS.map(({ domain, skills }) => ({ domain, skills: [...skills] })), confirm, log });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--setup') options.setup = true;
    else if (args[index] === '--confirm' && typeof args[index + 1] === 'string') options.confirm = args[++index];
    else if (args[index] === '--only' && /^(math|reading|science)\/[A-Za-z0-9._-]+$/.test(args[index + 1] ?? '')) options.only = args[++index];
    else if (args[index] === '--report' && typeof args[index + 1] === 'string') options.report = args[++index];
    else { process.stderr.write('Usage: npm run questions:inbox -- [--setup] [--only <folder>/<file>] [--report <file.json>] [--confirm "<phrase>"]\n'); process.exit(1); }
  }
  const dataDirectory = process.env.TRACK_B_DATA_DIRECTORY ?? path.join(ROOT, '.local', 'track-b');
  const inbox = process.env.TSA_QUESTION_INBOX ?? path.join(ROOT, 'question-inbox');
  try {
    if (options.setup) await setupPracticePool({ dataDirectory, confirm: options.confirm, log: (line) => process.stdout.write(`${line}\n`) });
    else {
      const result = await runInbox({ dataDirectory, inbox, confirm: options.confirm, only: options.only ?? null });
      if (options.report) await writeFile(options.report, `${JSON.stringify(inboxReport(result), null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`Inbox stopped: ${error.message}\nBackups taken before changes are in .local/track-b-backups/.\n`);
    process.exitCode = 1;
  }
}
