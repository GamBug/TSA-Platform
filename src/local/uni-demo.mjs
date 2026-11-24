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
import { createTrackBRuntime, PUBLIC_DEMO_DEFAULT_GUEST_POOL, PUBLIC_DEMO_DEFAULT_GUESTS_PER_HOUR } from './track-b.mjs';
import { applyPublicDemoSpeedups } from './public-demo-speedups.mjs';
import { DEMO_SECTIONS, seedUniDemoOfferings } from './uni-demo-seed.mjs';
import { createAdminAuth } from './admin/admin-auth.mjs';
import { readBankSnapshot } from './admin/admin-bank.mjs';
import { createAdminJobs } from './admin/admin-jobs.mjs';
import { ADMIN_POST_BODY_LIMITS, ADMIN_ROUTE_PREFIX, createAdminRoutes } from './admin/admin-routes.mjs';

export const UNI_DEMO_DEFAULT_PORT = 4180;
export const UNI_DEMO_MODES = Object.freeze(['PUBLISHED', 'REHEARSAL']);
export const PUBLIC_DEMO_GUEST_PATH = '/local-auth/guest';
export const ADMIN_PAGE_PATH = '/student/?page=admin';
const ADMIN_UNAVAILABLE = () => Response.json({ error: 'ADMIN_UNAVAILABLE' }, { status: 503, headers: { 'cache-control': 'no-store' } });
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
  // Public mode: serve only the student app to guest identities behind this https origin.
  publicOrigin,
  guestPool = PUBLIC_DEMO_DEFAULT_GUEST_POOL,
  guestsPerHour = PUBLIC_DEMO_DEFAULT_GUESTS_PER_HOUR,
  // How many days the generated offerings stay open after start (1 through 30).
  offeringDays = 1,
  imageStoreDirectory = mode === 'PUBLISHED'
    ? process.env.TSA_IMAGE_STORE_DIRECTORY ?? fileURLToPath(new URL('../../.local/track-b-images', import.meta.url)) : null,
  // Local admin page (loopback only): the question inbox it imports from, and the environment that may hold
  // DEMO_ADMIN_PASSWORD, OPENAI_API_KEY and OPENAI_MODEL.
  inboxDirectory = fileURLToPath(new URL('../../question-inbox', import.meta.url)),
  adminEnv = process.env,
  // Injectable for tests: runs one admin job command.
  adminRunCommand,
} = {}) {
  if (!UNI_DEMO_MODES.includes(mode)) throw new TypeError('mode must be PUBLISHED or REHEARSAL');
  if (mode === 'PUBLISHED' && (sourceArchive !== undefined || typeof sourceDataDirectory !== 'string')) {
    throw new TypeError('PUBLISHED mode reads the private Bank data directory only');
  }
  if (mode === 'REHEARSAL' && (sourceDataDirectory !== undefined
      || typeof sourceArchive?.archive !== 'string' || typeof sourceArchive?.roles !== 'string')) {
    throw new TypeError('REHEARSAL mode requires an archive of a synthetic source Bank');
  }
  if (publicOrigin !== undefined && (typeof publicOrigin !== 'string' || !/^https:\/\//.test(publicOrigin))) {
    throw new TypeError('The public demo origin must be an https origin');
  }
  const exported = mode === 'PUBLISHED' ? await exportBankArchive({ dataDirectory: sourceDataDirectory, pgBin }) : sourceArchive;
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-uni-demo-'));
  let runtime, notice, closing;
  const local = publicOrigin === undefined;
  let snapshot = null, adminHandler = null;
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
      redirectLegacyStudentUi: true,
      studentSecurityHeaders: true,
      env: { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_STUDENT_ENABLED: 'true', LOCAL_FULL_SIMULATION_ENABLED: 'true',
        LOCAL_NUMERIC_PRACTICE_ENABLED: 'true', LOCAL_CLOZE_MATCHING_ENABLED: 'true' },
      dataDirectory: clusterDirectory, port, pgBin,
      publicDemo: publicOrigin === undefined ? null : { origin: publicOrigin, guestPool, guestsPerHour },
      localGuests: local ? {} : null,
      homeRedirect: local ? '/student/' : null,
      // The admin page: full on the loopback demo, view-only on the public site.
      localRoutePrefix: ADMIN_ROUTE_PREFIX,
      localPostBodyLimits: local ? ADMIN_POST_BODY_LIMITS : {},
      prepareDatabase: async (ownerPool) => {
        // The admin page reads the whole Bank once here, while the migration-owner connection is still open.
        snapshot = await readBankSnapshot(ownerPool);
        // Public mode freezes the content for the life of this copy, so test creation can use cached checks.
        const speedups = publicOrigin === undefined ? null : await applyPublicDemoSpeedups(ownerPool);
        const report = await seedUniDemoOfferings(ownerPool, { offeringDays });
        if (speedups) report.speedups = speedups;
        notice = buildDemoNotice({ mode, report, sourceCredit });
        return report;
      },
      localRoutes: { '/local/demo-notice': (request) => request.method === 'GET'
        // The student app reads where guests start: publicDemo.guestPath (public) or localGuests.guestPath (loopback).
        ? Response.json(local ? { ...notice, localGuests: { guestPath: PUBLIC_DEMO_GUEST_PATH, adminPath: ADMIN_PAGE_PATH } }
          : { ...notice, publicDemo: { enabled: true, guestPath: PUBLIC_DEMO_GUEST_PATH } }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
        : Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 }),
      [ADMIN_ROUTE_PREFIX]: (request, context) => (adminHandler ? adminHandler(request, context) : ADMIN_UNAVAILABLE()) },
    });
    if (local) {
      // Admin jobs write the owner's retained Bank (PUBLISHED mode only); this demo keeps serving its start-time copy.
      const retained = mode === 'PUBLISHED' ? path.resolve(sourceDataDirectory) : null;
      const refreshSnapshot = retained ? async () => {
        const database = await startPersistentPostgres(retained, { pgBin });
        try { snapshot = await readBankSnapshot(database.ownerPool); } finally { await database.stop(); }
      } : null;
      const jobs = createAdminJobs({ dataDirectory: retained, inboxDirectory, imageStoreDirectory: imageStoreDirectory ?? undefined,
        ...(adminRunCommand ? { runCommand: adminRunCommand } : {}), onBankChanged: refreshSnapshot ?? undefined });
      adminHandler = createAdminRoutes({ auth: createAdminAuth({ trustedOrigin: runtime.origin, env: adminEnv }), jobs,
        getSnapshot: () => snapshot, refreshSnapshot, imageStore, contentMode: mode, inboxDirectory, env: adminEnv });
    } else {
      // Public site: the owner signs in over https to look at the Bank this copy serves; nothing can be changed here.
      adminHandler = createAdminRoutes({ auth: createAdminAuth({ trustedOrigin: runtime.origin, env: adminEnv, secureCookie: true }),
        getSnapshot: () => snapshot, imageStore, contentMode: mode, env: adminEnv, readOnly: true });
    }
  } catch (error) {
    // A failed database stop may leave a live postmaster; keep its directory for inspection then.
    if (!error.cleanupError) await rm(root, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({
    mode,
    origin: runtime.origin,
    publicOrigin: publicOrigin ?? null,
    port: runtime.port,
    report: runtime.prepared,
    notice,
    sourceBackup: mode === 'PUBLISHED' ? exported.archive : null,
    demoDirectory: root,
    urls: publicOrigin === undefined ? Object.freeze({
      // The old staff workspace is not offered; the bare origin redirects to the student app.
      staff: null,
      admin: `${runtime.origin}${ADMIN_PAGE_PATH}`,
      student: `${runtime.origin}/student/`,
      simulation: `${runtime.origin}/student/?mode=simulation`,
      numeric: `${runtime.origin}/student/?mode=numeric`,
      clozeMatching: `${runtime.origin}/student/?mode=interactions`,
    }) : Object.freeze({
      // No staff workspace exists in public mode; the proxy reaches the loopback listener at `listen`.
      staff: null,
      admin: `${publicOrigin}${ADMIN_PAGE_PATH}`,
      student: `${publicOrigin}/student/`,
      simulation: `${publicOrigin}/student/?mode=simulation`,
      numeric: `${publicOrigin}/student/?mode=numeric`,
      clozeMatching: `${publicOrigin}/student/?mode=interactions`,
      listen: runtime.origin,
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
