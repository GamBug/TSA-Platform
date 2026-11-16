// University demo runtime. The demo always runs on a disposable copy of a source
// Bank: the source is backed up first and is never migrated, seeded or written.
// Students receive published versions only; see uni-demo-seed.mjs.
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalImageStore } from '../modules/media/local-image-store.mjs';
import { backupLocalDatabase } from './database-backup.mjs';
import { startPersistentPostgres } from './postgres.mjs';
import { createTrackBRuntime } from './track-b.mjs';
import { DEMO_SECTIONS, seedUniDemoOfferings } from './uni-demo-seed.mjs';

export const UNI_DEMO_DEFAULT_PORT = 4180;
export const UNI_DEMO_MODES = Object.freeze(['PUBLISHED', 'REHEARSAL']);
const DEMO_OWNER_ROLE = 'tsa_local_owner';
const TOOL_TIMEOUT_MS = 60_000;
const MAX_CREDIT_LENGTH = 500;

const REHEARSAL_CREDIT = Object.freeze({
  vi: 'Câu hỏi tổng hợp do dự án tự biên soạn để diễn tập; không phải câu hỏi từ bộ đề mẫu.',
  en: 'Original synthetic questions written by the project for rehearsal; not corpus items.',
});
const EMPTY_CREDIT = Object.freeze({
  vi: 'Chưa có câu hỏi nào được phê duyệt và xuất bản.',
  en: 'No question has been approved and published yet.',
});

function toolEnvironment() {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8' };
}

function runTool(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env: toolEnvironment(), stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '', diagnostics = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, TOOL_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (text) => { if (stdout.length < 4096) stdout += text; });
    // Restore diagnostics can name private objects: kept on the error for the caller, never printed here.
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => { diagnostics = (diagnostics + text).slice(-2048); });
    child.once('error', () => { clearTimeout(timer); reject(new Error(`${path.basename(binary)} is unavailable`)); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) { resolve(stdout.trim()); return; }
      reject(Object.assign(new Error(`${path.basename(binary)} ${timedOut ? 'timed out' : 'failed'}`), { diagnostics }));
    });
  });
}

async function resolveBinDirectory(pgBin) {
  return path.resolve(pgBin ?? process.env.PG_BIN ?? await runTool('pg_config', ['--bindir']));
}

function connectionArguments(config) {
  return ['--host', config.host, '--port', String(config.port), '--username', config.user, '--no-password'];
}

/** Back up an existing private Bank cluster without changing its schema or data. */
export async function exportBankArchive({ dataDirectory, pgBin } = {}) {
  if (typeof dataDirectory !== 'string' || dataDirectory.length === 0) throw new TypeError('A source Bank data directory is required');
  const absolute = path.resolve(dataDirectory);
  // Opening a missing path would initialize a new empty cluster there.
  const info = await lstat(absolute).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  const marker = info?.isDirectory() ? await lstat(path.join(absolute, '.tsa-track-b-cluster')).catch(() => null) : null;
  if (!marker?.isFile()) throw new Error(`No private Bank data was found at ${absolute}`);
  const database = await startPersistentPostgres(absolute, { pgBin });
  try {
    return await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: `${absolute}-backups`, pgBin });
  } finally {
    await database.stop();
  }
}

async function restoreArchive({ archive, roles, clusterDirectory, workDirectory, pgBin }) {
  const binDirectory = await resolveBinDirectory(pgBin);
  const database = await startPersistentPostgres(clusterDirectory, { pgBin });
  try {
    await database.closeOwnerPool();
    // The demo cluster already has its bootstrap role; every other source role is recreated.
    // Memberships are re-granted by that bootstrap role, because PostgreSQL accepts a
    // named grantor only when it holds ADMIN on the role in this cluster.
    const roleSql = (await readFile(roles, 'utf8'))
      .replace(new RegExp(`^CREATE ROLE ${DEMO_OWNER_ROLE};$`, 'm'), '-- The demo cluster bootstrap role already exists.')
      .replace(/^(GRANT .*?) GRANTED BY "?[A-Za-z_][A-Za-z0-9_$]*"?;$/gm, '$1;');
    const roleImport = path.join(workDirectory, 'role-import.sql');
    await writeFile(roleImport, roleSql, { flag: 'wx', mode: 0o600 });
    const connection = connectionArguments(database.connectionConfig);
    await runTool(path.join(binDirectory, 'psql'), [...connection, '--dbname', 'postgres', '--no-psqlrc', '--quiet',
      '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', roleImport]);
    await runTool(path.join(binDirectory, 'pg_restore'), [...connection, '--dbname', 'postgres',
      '--exit-on-error', '--single-transaction', archive]);
  } finally {
    await database.stop();
  }
}

function validateCredit(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length < 1 || text.length > MAX_CREDIT_LENGTH || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

/** Decide the visible content-source line; published corpus content must carry the owner's credit. */
export function buildDemoNotice({ mode, report, sourceCredit }) {
  if (mode === 'REHEARSAL') return { schemaVersion: 'demo-notice/1', contentMode: mode, sourceCredit: { ...REHEARSAL_CREDIT } };
  const publishedTotal = DEMO_SECTIONS.reduce((sum, section) => sum + report.published[section], 0);
  if (publishedTotal === 0) return { schemaVersion: 'demo-notice/1', contentMode: mode, sourceCredit: { ...EMPTY_CREDIT } };
  const credit = validateCredit(sourceCredit);
  if (!credit) {
    throw new Error('Published items need a visible source credit: set DEMO_UNI_SOURCE_CREDIT to the credit line (1-500 characters)');
  }
  return { schemaVersion: 'demo-notice/1', contentMode: mode, sourceCredit: { vi: credit, en: credit } };
}

/**
 * Build a disposable demo database from a source Bank and serve the staff and
 * student sites from it. PUBLISHED reads the private retained Bank; REHEARSAL
 * takes an archive of an explicitly synthetic Bank and labels every page.
 */
export async function startUniDemo({
  mode = 'PUBLISHED',
  sourceDataDirectory,
  sourceArchive,
  port = UNI_DEMO_DEFAULT_PORT,
  pgBin,
  sourceCredit = process.env.DEMO_UNI_SOURCE_CREDIT,
  imageStoreDirectory = mode === 'PUBLISHED'
    ? process.env.TSA_IMAGE_STORE_DIRECTORY ?? fileURLToPath(new URL('../../.local/track-b-images', import.meta.url)) : null,
} = {}) {
  if (!UNI_DEMO_MODES.includes(mode)) throw new TypeError('mode must be PUBLISHED or REHEARSAL');
  if (mode === 'PUBLISHED' && (sourceArchive !== undefined || typeof sourceDataDirectory !== 'string')) {
    throw new TypeError('PUBLISHED mode reads the private Bank data directory only');
  }
  if (mode === 'REHEARSAL' && (sourceDataDirectory !== undefined
      || typeof sourceArchive?.archive !== 'string' || typeof sourceArchive?.roles !== 'string')) {
    throw new TypeError('REHEARSAL mode requires an archive of a synthetic source Bank');
  }
  const exported = mode === 'PUBLISHED' ? await exportBankArchive({ dataDirectory: sourceDataDirectory, pgBin }) : sourceArchive;
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-uni-demo-'));
  let runtime, notice, closing;
  try {
    const clusterDirectory = path.join(root, 'cluster');
    await restoreArchive({ archive: exported.archive, roles: exported.roles, clusterDirectory, workDirectory: root, pgBin });
    // Open existing private library objects only; a demo never creates an image library.
    const imageDirectory = imageStoreDirectory === null ? null : await lstat(imageStoreDirectory).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    const imageStore = imageDirectory ? await createLocalImageStore({ rootDirectory: imageStoreDirectory, enabled: true,
      env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' } }) : null;
    runtime = await createTrackBRuntime({
      imageStore,
      env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_STUDENT_ENABLED: 'true', LOCAL_FULL_SIMULATION_ENABLED: 'true',
        LOCAL_NUMERIC_PRACTICE_ENABLED: 'true', LOCAL_CLOZE_MATCHING_ENABLED: 'true' },
      dataDirectory: clusterDirectory, port, pgBin,
      prepareDatabase: async (ownerPool) => {
        const report = await seedUniDemoOfferings(ownerPool);
        notice = buildDemoNotice({ mode, report, sourceCredit });
        return report;
      },
      localRoutes: { '/local/demo-notice': (request) => request.method === 'GET'
        ? Response.json(notice, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
        : Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 }) },
    });
  } catch (error) {
    // A failed database stop may leave a live postmaster; keep its directory for inspection then.
    if (!error.cleanupError) await rm(root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({
    mode,
    origin: runtime.origin,
    port: runtime.port,
    report: runtime.prepared,
    notice,
    sourceBackup: mode === 'PUBLISHED' ? exported.archive : null,
    demoDirectory: root,
    urls: Object.freeze({
      staff: `${runtime.origin}/`,
      student: `${runtime.origin}/?student=postgres`,
      simulation: `${runtime.origin}/?student=postgres-v3`,
      numeric: `${runtime.origin}/?student=postgres-v2`,
      clozeMatching: `${runtime.origin}/?student=postgres-v4`,
    }),
    close() {
      closing ??= (async () => {
        // The demo copy is removed only after its database process has exited.
        await runtime.close();
        await rm(root, { recursive: true, force: true });
      })();
      return closing;
    },
  });
}
