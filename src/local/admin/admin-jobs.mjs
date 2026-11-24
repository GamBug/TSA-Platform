// Admin jobs on the owner's retained Bank, run through the same tested owner commands as the terminal:
// questions:inbox (check, then import pasted ChatGPT files as DRAFTs) and bank:owner-publish (approve and publish).
// The running demo serves a disposable copy, so students see published changes after the demo restarts.
// One job runs at a time; each takes a backup of the retained Bank before it writes (the commands do this).
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJson } from '../../../scripts/questions-inbox.mjs';
import { sniffMediaType } from '../../modules/bank/image-library.mjs';
import { FIGURE_EXTENSIONS, imageRequests, parseFigureName } from '../inbox-figures.mjs';
import { readZip, ZipError } from '../zip-reader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const INBOX_FOLDERS = Object.freeze({ MATH: 'math', READING: 'reading', SCIENCE: 'science' });
const PASTE_EXTENSIONS = new Set(['.json', '.txt', '.md']);
export const MAX_INBOX_FILE_BYTES = 900 * 1024;
export const MAX_FIGURE_BYTES = 2 * 1024 * 1024;
// One ZIP from ChatGPT holds the answer file(s) and every figure of a batch.
export const MAX_ARCHIVE_BYTES = 24 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100;
export const QUESTION_CHANGE_ACTIONS = Object.freeze(['PUBLISH', 'WITHHOLD', 'RESTORE', 'MOVE']);
const ERRORS_SUFFIX = '.errors.txt';
const MAX_OUTPUT = 64 * 1024;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The confirmation phrase a dry run printed (the last `--confirm "..."`), or null. Pure. */
export function confirmationFromOutput(output) {
  const matches = [...String(output).matchAll(/--confirm "([^"\n]{1,80})"/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

/** A safe inbox file name: letters, digits, dot, dash, underscore; a paste extension; prefixed to be unique. Pure. */
export function inboxFileName(requested, stamp) {
  const base = path.basename(String(requested ?? '')).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').slice(0, 80);
  const extension = path.extname(base).toLowerCase();
  const name = PASTE_EXTENSIONS.has(extension) ? base : `${base || 'pasted'}.json`;
  return `${stamp}-${name}`;
}

/** The error code for figure bytes the inbox cannot take, or null. Pure. */
function figureProblem(bytes) {
  if (bytes.byteLength === 0) return 'EMPTY_FILE';
  if (bytes.byteLength > MAX_FIGURE_BYTES) return 'FILE_TOO_LARGE';
  return sniffMediaType(bytes) ? null : 'FIGURE_NOT_IMAGE';
}

const timestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** The figure file names a pasted answer needs (one per image_request block), read from its JSON; [] when it does not parse. */
async function neededFigures(file) {
  const { document } = extractJson(await readFile(file, 'utf8').catch(() => ''));
  return document ? imageRequests(document).map((request) => request.fileName) : [];
}

async function listFolder(directory, { withErrors = false, withFigures = false, limit = 20, extensions = PASTE_EXTENSIONS } = {}) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => (error.code === 'ENOENT' ? [] : Promise.reject(error)));
  // A rejected file's message (<name>.errors.txt) belongs to that file; it is not listed as a file of its own.
  const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.') && !entry.name.endsWith(ERRORS_SUFFIX)
    && extensions.has(path.extname(entry.name).toLowerCase())).map((entry) => entry.name).sort().reverse();
  const items = [];
  for (const name of files.slice(0, limit)) {
    const info = await stat(path.join(directory, name));
    const item = { name, bytes: info.size, modifiedAt: info.mtime.toISOString() };
    if (withErrors) item.errors = await readFile(path.join(directory, `${name}.errors.txt`), 'utf8').catch(() => null);
    if (withFigures) item.figures = await neededFigures(path.join(directory, name));
    items.push(item);
  }
  return { count: files.length, items };
}

/**
 * Jobs for one retained Bank. `runCommand(args, env)` is injectable for tests; by default it runs `node <script>` from
 * the repository root and returns { exitCode, output }.
 */
export function createAdminJobs({ dataDirectory, inboxDirectory = path.join(ROOT, 'question-inbox'), imageStoreDirectory,
  runCommand = runNodeScript, onBankChanged = async () => {} } = {}) {
  let running = null;
  const available = typeof dataDirectory === 'string' && dataDirectory.length > 0;
  const childEnv = () => ({
    TRACK_B_DATA_DIRECTORY: dataDirectory, TSA_QUESTION_INBOX: inboxDirectory,
    ...(imageStoreDirectory ? { TSA_IMAGE_STORE_DIRECTORY: imageStoreDirectory } : {}),
  });

  async function exclusive(name, work, { wait = false } = {}) {
    if (!available) return { ok: false, code: 'NO_RETAINED_BANK', output: 'This demo runs on rehearsal content. Imports and publication need the real Bank (npm start).' };
    // The AI studio queues behind a running job instead of failing; a click on the page does not.
    for (const started = Date.now(); wait && running && Date.now() - started < JOB_TIMEOUT_MS;) await new Promise((resolve) => setTimeout(resolve, 500));
    if (running) return { ok: false, code: 'JOB_RUNNING', output: `Another job is running: ${running}. Wait for it to finish.` };
    running = name;
    try { return await work(); } finally { running = null; }
  }

  async function run(script, args, { changesBank }) {
    const result = await runCommand([path.join(ROOT, 'scripts', script), ...args], childEnv());
    if (changesBank && result.exitCode === 0) await onBankChanged();
    return { ok: result.exitCode === 0, exitCode: result.exitCode, output: result.output, confirmation: confirmationFromOutput(result.output) };
  }

  /** Run the inbox command on one file with a JSON report; resolves the run plus `report` (null when none was written). */
  async function runInboxReport(args, changesBank) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-inbox-report-'));
    try {
      const reportFile = path.join(directory, 'report.json');
      const result = await run('questions-inbox.mjs', [...args, '--report', reportFile], { changesBank });
      const report = await readFile(reportFile, 'utf8').then(JSON.parse, () => null);
      return { ...result, report };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }

  return Object.freeze({
    available,
    status: () => ({ available, running }),

    async saveInboxFile({ section, fileName, text }) {
      const folder = INBOX_FOLDERS[section];
      if (!folder) return { ok: false, code: 'INVALID_SECTION' };
      if (typeof text !== 'string' || text.trim() === '') return { ok: false, code: 'EMPTY_FILE' };
      if (Buffer.byteLength(text) > MAX_INBOX_FILE_BYTES) return { ok: false, code: 'FILE_TOO_LARGE' };
      const directory = path.join(inboxDirectory, folder);
      await mkdir(directory, { recursive: true });
      const name = inboxFileName(fileName, timestamp());
      await writeFile(path.join(directory, name), text, { encoding: 'utf8', flag: 'wx' });
      return { ok: true, section, name };
    },

    async listInbox() {
      const result = {};
      for (const [section, folder] of Object.entries(INBOX_FOLDERS)) {
        const directory = path.join(inboxDirectory, folder);
        result[section] = {
          pending: await listFolder(directory, { limit: 100, withFigures: true }),
          figures: await listFolder(directory, { limit: 200, extensions: new Set(FIGURE_EXTENSIONS) }),
          imported: await listFolder(path.join(directory, 'imported'), { limit: 10 }),
          rejected: await listFolder(path.join(directory, 'rejected'), { withErrors: true, withFigures: true, limit: 10 }),
        };
      }
      return result;
    },

    /**
     * Save one figure for an image_request block into the subject's inbox folder. The name must follow the inbox
     * convention <question or passage id>_<request id>.png|jpg|jpeg|webp; a file of the same name is replaced.
     */
    async saveFigure({ section, fileName, base64 }) {
      const folder = INBOX_FOLDERS[section];
      if (!folder) return { ok: false, code: 'INVALID_SECTION' };
      const name = path.basename(String(fileName ?? ''));
      if (!parseFigureName(name)) return { ok: false, code: 'FIGURE_NAME_INVALID' };
      if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, code: 'EMPTY_FILE' };
      const bytes = Buffer.from(base64, 'base64');
      const problem = figureProblem(bytes);
      if (problem) return { ok: false, code: problem };
      const directory = path.join(inboxDirectory, folder);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, name), bytes);
      return { ok: true, section, name };
    },

    /**
     * Save a ZIP from ChatGPT: every answer file (.json, .txt, .md) and every figure named by the inbox convention goes
     * to the subject's inbox folder; other entries are ignored and reported. The subject is read from the answer's own
     * "subject" field (`section` is the fallback for an archive of figures only). Nothing is written unless the whole
     * archive is acceptable.
     */
    async saveArchive({ section, base64 }) {
      if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, code: 'EMPTY_FILE' };
      const archive = Buffer.from(base64, 'base64');
      if (archive.byteLength > MAX_ARCHIVE_BYTES) return { ok: false, code: 'FILE_TOO_LARGE' };
      let entries;
      try { entries = readZip(archive, { maxEntries: MAX_ARCHIVE_ENTRIES, maxEntryBytes: MAX_FIGURE_BYTES, maxTotalBytes: MAX_ARCHIVE_BYTES }); }
      catch (error) { if (error instanceof ZipError) return { ok: false, code: error.code, message: error.message }; throw error; }

      const answers = [], figures = [], ignored = [];
      for (const entry of entries) {
        const name = path.basename(entry.name);
        const extension = path.extname(name).toLowerCase();
        if (name.startsWith('.') || entry.name.startsWith('__MACOSX/')) continue;
        if (PASTE_EXTENSIONS.has(extension)) {
          if (entry.data.byteLength > MAX_INBOX_FILE_BYTES) return { ok: false, code: 'FILE_TOO_LARGE', message: `${name} is too large.` };
          const text = entry.data.toString('utf8');
          if (text.trim() === '') { ignored.push(name); continue; }
          answers.push({ name, text });
        } else if (FIGURE_EXTENSIONS.includes(extension) && parseFigureName(name)) {
          const problem = figureProblem(entry.data);
          if (problem) return { ok: false, code: problem, message: `${name} is not a usable figure.` };
          figures.push({ name, bytes: entry.data });
        } else ignored.push(name);
      }
      const names = [...answers, ...figures].map(({ name }) => name);
      const repeated = names.find((name, index) => names.indexOf(name) !== index);
      if (repeated) return { ok: false, code: 'ARCHIVE_DUPLICATE_NAME', message: `The archive holds ${repeated} more than once.` };
      if (answers.length === 0 && figures.length === 0) return { ok: false, code: 'ARCHIVE_EMPTY', message: 'The archive holds no answer file and no figure named like MATH-S261122A-000031_NEW-IMG-001.png.' };

      const subjects = new Set(answers.map(({ text }) => {
        const subject = extractJson(text).document?.questions?.[0]?.subject;
        return Object.hasOwn(INBOX_FOLDERS, subject) ? subject : null;
      }).filter(Boolean));
      if (subjects.size > 1) return { ok: false, code: 'MIXED_SUBJECTS', message: 'The archive mixes answers of different subjects.' };
      const target = subjects.size === 1 ? [...subjects][0] : section;
      const folder = INBOX_FOLDERS[target];
      if (!folder) return { ok: false, code: 'INVALID_SECTION' };

      const directory = path.join(inboxDirectory, folder);
      await mkdir(directory, { recursive: true });
      const stamp = timestamp();
      for (const figure of figures) await writeFile(path.join(directory, figure.name), figure.bytes);
      for (const answer of answers) await writeFile(path.join(directory, inboxFileName(answer.name, stamp)), answer.text, { encoding: 'utf8', flag: 'wx' });
      return { ok: true, section: target, answers: answers.map(({ name }) => name), figures: figures.map(({ name }) => name), ignored };
    },

    /** Move a rejected file back into its inbox folder (after its figures were added or its JSON replaced). */
    async retryRejected({ section, name }) {
      const folder = INBOX_FOLDERS[section];
      if (!folder) return { ok: false, code: 'INVALID_SECTION' };
      const file = path.basename(String(name ?? ''));
      if (file !== name || file.startsWith('.') || file.endsWith(ERRORS_SUFFIX) || !PASTE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
        return { ok: false, code: 'NOT_FOUND' };
      }
      const directory = path.join(inboxDirectory, folder);
      const target = path.join(directory, file.replace(/^[0-9]{8}-[0-9]{6}-/, ''));
      if (await stat(target).then(() => true, () => false)) return { ok: false, code: 'ALREADY_WAITING' };
      try { await rename(path.join(directory, 'rejected', file), target); }
      catch (error) { if (error.code === 'ENOENT') return { ok: false, code: 'NOT_FOUND' }; throw error; }
      await unlink(path.join(directory, 'rejected', `${file}${ERRORS_SUFFIX}`)).catch(() => {});
      return { ok: true, section, name: path.basename(target) };
    },

    /**
     * Change one question version: PUBLISH, WITHHOLD (with a reason), RESTORE or MOVE (to `section`). A dry run without
     * `confirm`; with the phrase it printed, applies it through the owner command (backup first).
     */
    change: ({ versionId, action, section = null, reason = null, confirm } = {}) => exclusive('change', () => {
      if (!UUID.test(versionId ?? '')) return { ok: false, code: 'INVALID_VERSION', output: 'Unknown question version.' };
      if (!QUESTION_CHANGE_ACTIONS.includes(action)) return { ok: false, code: 'INVALID_ACTION', output: 'Unknown change.' };
      if (action === 'MOVE' && !Object.hasOwn(INBOX_FOLDERS, section)) return { ok: false, code: 'INVALID_SECTION', output: 'Choose a section.' };
      if (action === 'WITHHOLD' && (typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 500)) {
        return { ok: false, code: 'REASON_REQUIRED', output: 'Write why the question is withheld (5-500 characters).' };
      }
      const flag = { PUBLISH: ['--publish'], WITHHOLD: ['--withhold', '--reason', reason], RESTORE: ['--restore'], MOVE: ['--section', section] }[action];
      return run('question-change.mjs', ['--version', versionId, ...flag, ...(confirm === undefined ? [] : ['--confirm', String(confirm)])],
        { changesBank: confirm !== undefined });
    }),

    /**
     * Check one inbox file (`<folder>/<name>`) and, when it is clean and `importIt` is set, import it as DRAFTs. Waits for a
     * running job. Resolves { ok, report, output, imported }; the confirmation phrase is taken from the dry run.
     */
    checkAndImportOne: ({ only, importIt = false }) => exclusive('ai-import', async () => {
      if (!/^(math|reading|science)\/[A-Za-z0-9._-]+$/.test(only ?? '')) return { ok: false, code: 'INVALID_FILE', output: 'Unknown inbox file.' };
      const dry = await runInboxReport(['--only', only], false);
      const file = dry.report?.files?.[0];
      if (!dry.ok || !file || !importIt || file.problems.length || !dry.report.taxonomyVersionId) return { ...dry, imported: false };
      const done = await runInboxReport(['--only', only, '--confirm', dry.report.phrase], true);
      return { ...done, imported: done.ok && (done.report?.imported ?? 0) > 0 };
    }, { wait: true }),

    /** Register the practice pool once when it is missing (the studio needs it to import). */
    ensurePool: () => exclusive('setup', async () => {
      const dry = await run('questions-inbox.mjs', ['--setup'], { changesBank: false });
      if (!dry.ok || !dry.confirmation) return dry;
      return run('questions-inbox.mjs', ['--setup', '--confirm', dry.confirmation], { changesBank: true });
    }, { wait: true }),

    /** Approve and publish exactly these DRAFT versions (dry run first, then its phrase). Waits for a running job. */
    publishVersions: ({ versionIds, keepOneOfTwins = false }) => exclusive('ai-publish', async () => {
      if (!Array.isArray(versionIds) || versionIds.length === 0 || !versionIds.every((id) => UUID.test(id))) {
        return { ok: false, code: 'INVALID_VERSION', output: 'No question versions to publish.' };
      }
      const args = ['--versions', versionIds.join(','), ...(keepOneOfTwins ? ['--keep-one-of-twins'] : [])];
      const dry = await run('owner-publish.mjs', args, { changesBank: false });
      if (!dry.ok || !dry.confirmation) return dry;
      return run('owner-publish.mjs', [...args, '--confirm', dry.confirmation], { changesBank: true });
    }, { wait: true }),

    /** Dry run without `confirm`; with the phrase the dry run printed, imports the importable files as DRAFTs. */
    inbox: ({ confirm } = {}) => exclusive('inbox', () => run('questions-inbox.mjs',
      confirm === undefined ? [] : ['--confirm', String(confirm)], { changesBank: confirm !== undefined })),

    /** One-time registration of the practice pool taxonomy (dry run without `confirm`). */
    setupPool: ({ confirm } = {}) => exclusive('setup', () => run('questions-inbox.mjs',
      ['--setup', ...(confirm === undefined ? [] : ['--confirm', String(confirm)])], { changesBank: confirm !== undefined })),

    /** Owner publication limited to one taxonomy version (the practice pool), optionally one section. */
    publish: ({ taxonomyVersionId, section = null, keepOneOfTwins = false, confirm } = {}) => exclusive('publish', () => {
      if (!UUID.test(taxonomyVersionId ?? '')) return { ok: false, code: 'POOL_NOT_REGISTERED', output: 'The practice pool is not registered yet. Use "Register the practice pool" first.' };
      if (section !== null && !Object.hasOwn(INBOX_FOLDERS, section)) return { ok: false, code: 'INVALID_SECTION', output: 'Unknown section.' };
      return run('owner-publish.mjs', ['--taxonomy-version', taxonomyVersionId, ...(section ? ['--section', section] : []),
        ...(keepOneOfTwins ? ['--keep-one-of-twins'] : []), ...(confirm === undefined ? [] : ['--confirm', String(confirm)])],
      { changesBank: confirm !== undefined });
    }),
  });
}

/** Run one repository script with Node; output (stdout and stderr) is capped. API keys are not passed on. */
export function runNodeScript(args, extraEnv) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...extraEnv };
    delete env.OPENAI_API_KEY;
    delete env.DEMO_ADMIN_PASSWORD;
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let output = '';
    const append = (chunk) => { if (output.length < MAX_OUTPUT) output += chunk; };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timer = setTimeout(() => child.kill('SIGTERM'), JOB_TIMEOUT_MS);
    child.once('error', (error) => { clearTimeout(timer); resolve({ exitCode: 1, output: `Could not start the job: ${error.message}` }); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output: signal ? `${output}\nThe job stopped (${signal}).` : output });
    });
  });
}
