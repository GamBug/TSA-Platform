import { spawn } from 'node:child_process';
import { access, chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabasePool } from '../modules/database/pool.mjs';

const EXPECTED_VERSION = '18.6';
const OWNER_ROLE = 'tsa_local_owner';
const OWNER_MARKER = '.tsa-track-b-cluster';
const OWNER_MARKER_CONTENT = 'track-b-local-cluster/1\n';
const COMMAND_TIMEOUT_MS = 8_000;

function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PG/i.test(key)) delete env[key];
  return env;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function run(file, args, timeoutMs = COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(file, args, { env: cleanEnvironment(), stdio: ['ignore', 'pipe', 'pipe'], shell: false }); }
    catch (error) { reject(error); return; }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`${path.basename(file)} exceeded ${timeoutMs} ms`));
    }, timeoutMs);
    timer.unref?.();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => finish(error));
    child.once('close', (code, signal) => finish(null, { code, signal, stdout, stderr }));
  });
}

async function resolveBinaries(requestedDirectory) {
  let directory = requestedDirectory ?? process.env.PG_BIN;
  if (!directory) {
    const configured = await run('pg_config', ['--bindir']);
    if (configured.code !== 0) throw new Error('pg_config --bindir failed; set PG_BIN to the PostgreSQL 18.6 bin directory');
    directory = configured.stdout.trim();
  }
  directory = path.resolve(directory);
  const binaries = Object.fromEntries(['initdb', 'postgres'].map((name) => [name, path.join(directory, name)]));
  for (const [name, binary] of Object.entries(binaries)) {
    try { await access(binary, fsConstants.X_OK); }
    catch { throw new Error(`Required PostgreSQL executable ${name} is missing in ${directory}; set PG_BIN to PostgreSQL 18.6`); }
    const version = await run(binary, ['--version']);
    if (version.code !== 0 || !new RegExp(`PostgreSQL\\) ${EXPECTED_VERSION}(?:\\s|$)`).test(version.stdout)) {
      throw new Error(`${name} must be PostgreSQL ${EXPECTED_VERSION}; got ${version.stdout.trim() || version.stderr.trim()}`);
    }
  }
  return binaries;
}

async function assertNoSymlinkComponents(absolutePath) {
  const parsed = path.parse(absolutePath);
  let current = parsed.root;
  for (const part of absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error('Track B database path must not contain symbolic links');
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
}

export async function validateTrackBDataPath(dataDirectory) {
  if (typeof dataDirectory !== 'string' || dataDirectory.length === 0) throw new TypeError('A Track B data directory is required');
  const absoluteDataDirectory = path.resolve(dataDirectory);
  await assertNoSymlinkComponents(absoluteDataDirectory);
  return absoluteDataDirectory;
}

async function ensurePrivateParent(dataDirectory) {
  const parent = path.dirname(dataDirectory);
  await assertNoSymlinkComponents(parent);
  let info = await lstat(parent).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info) {
    await mkdir(parent, { recursive: true, mode: 0o700 });
    info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Track B lock parent is not a private directory');
    if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
      throw new Error('Track B lock parent is owned by another user');
    }
    if ((info.mode & 0o077) !== 0) throw new Error('New Track B lock parent is not private');
    return;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Track B lock parent is not a private directory');
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
    throw new Error('Track B lock parent is owned by another user');
  }
  if ((info.mode & 0o077) !== 0) throw new Error('Track B lock parent must already be private');
}

async function inspectCluster(dataDirectory) {
  const info = await lstat(dataDirectory).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info) {
    try {
      await mkdir(dataDirectory, { mode: 0o700 });
      return { fresh: true };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      return inspectCluster(dataDirectory);
    }
  }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Track B data path is not a private directory');
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
    throw new Error('Track B data directory is owned by another user');
  }
  const entries = await readdir(dataDirectory);
  const markerPath = path.join(dataDirectory, OWNER_MARKER);
  const marker = await readFile(markerPath, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (marker === null) {
    if (entries.length !== 0) throw new Error('Refusing a non-empty data directory without the Track B ownership marker');
    if ((info.mode & 0o077) !== 0) await chmod(dataDirectory, 0o700);
    return { fresh: true };
  }
  if (marker !== OWNER_MARKER_CONTENT) throw new Error('Track B data directory has an unrecognized ownership marker');
  const version = await readFile(path.join(dataDirectory, 'PG_VERSION'), 'utf8').catch(() => '');
  if (version.trim() !== EXPECTED_VERSION.slice(0, 2)) throw new Error('Owned Track B cluster is not PostgreSQL 18');
  try { await access(path.join(dataDirectory, 'postmaster.pid')); throw new Error('Track B cluster already has a postmaster.pid; refusing to start a second server'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if ((info.mode & 0o077) !== 0) await chmod(dataDirectory, 0o700);
  return { fresh: false };
}

function waitForChildClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return Promise.race([
    new Promise((resolve) => child.once('close', () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

/** Start or reopen the app-owned persistent PostgreSQL cluster, with no TCP listener. */
export async function startPersistentPostgres(dataDirectory, { pgBin } = {}) {
  const absoluteDataDirectory = await validateTrackBDataPath(dataDirectory);
  await ensurePrivateParent(absoluteDataDirectory);
  const binaries = await resolveBinaries(pgBin);
  const lockPath = `${absoluteDataDirectory}.track-b-start.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Track B startup lock already exists; refusing concurrent or stale startup');
    throw error;
  }

  let createdFreshDirectory = false;
  let clusterInitialized = false;
  let server;
  let spawnError;
  let ownerPool;
  let socketDirectory;
  let stopped = false;
  let serverLog = Buffer.alloc(0);
  const cleanup = async ({ preserveOwnedData = true } = {}) => {
    if (ownerPool) {
      const pool = ownerPool;
      ownerPool = null;
      await Promise.race([pool.end().catch(() => {}), delay(1_500)]);
    }
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      let closed = await waitForChildClose(server, 2_500);
      if (!closed) {
        server.kill('SIGKILL');
        closed = await waitForChildClose(server, 1_500);
      }
      if (!closed) throw new Error('Could not confirm exit of the owned PostgreSQL process; preserving its cluster and socket directory');
    }
    if (socketDirectory) {
      const ownedSocket = socketDirectory;
      socketDirectory = null;
      await rm(ownedSocket, { recursive: true, force: true });
    }
    if (!preserveOwnedData && createdFreshDirectory && !clusterInitialized) {
      await rm(absoluteDataDirectory, { recursive: true, force: true });
    }
    if (lock) {
      await lock.close().catch(() => {});
      lock = null;
      await rm(lockPath, { force: true });
    }
  };

  try {
    const cluster = await inspectCluster(absoluteDataDirectory);
    createdFreshDirectory = cluster.fresh;
    if (cluster.fresh) {
      const init = await run(binaries.initdb, [
        '--locale=C', '--encoding=UTF8', '--auth-local=trust', '--auth-host=reject',
        `--username=${OWNER_ROLE}`, '--no-instructions', `--pgdata=${absoluteDataDirectory}`,
      ]);
      if (init.code !== 0) throw new Error(`Track B initdb failed: ${init.stderr.trim() || init.stdout.trim()}`);
      clusterInitialized = true;
      const marker = await open(path.join(absoluteDataDirectory, OWNER_MARKER), 'wx', 0o600);
      try { await marker.writeFile(OWNER_MARKER_CONTENT, 'utf8'); }
      finally { await marker.close(); }
    } else {
      clusterInitialized = true;
    }

    socketDirectory = await mkdtemp(path.join(os.tmpdir(), 'tsa-track-b-socket-'));
    await chmod(socketDirectory, 0o700);
    const port = 20_000 + Math.floor(Math.random() * 30_000);
    server = spawn(binaries.postgres, [
      '-D', absoluteDataDirectory,
      '-c', 'listen_addresses=',
      '-c', `unix_socket_directories=${socketDirectory}`,
      '-c', 'unix_socket_permissions=0700',
      '-c', `port=${port}`,
      '-c', 'logging_collector=off',
      '-c', 'log_destination=stderr',
    ], { cwd: absoluteDataDirectory, env: cleanEnvironment(), stdio: ['ignore', 'ignore', 'pipe'], shell: false });
    server.stderr.on('data', (chunk) => {
      serverLog = Buffer.concat([serverLog, chunk]);
      if (serverLog.length > 65_536) serverLog = serverLog.subarray(serverLog.length - 65_536);
    });
    server.once('error', (error) => { spawnError = error; });

    const connectionConfig = { host: socketDirectory, port, user: OWNER_ROLE, database: 'postgres', application_name: 'tsa-track-b-owner' };
    ownerPool = createDatabasePool(connectionConfig, { max: 6, connectionTimeoutMillis: 1_000, applicationName: 'tsa-track-b-owner' });
    const deadline = performance.now() + 15_000;
    let ready = false;
    while (!ready && performance.now() < deadline) {
      if (spawnError) throw new Error(`Could not start the owned PostgreSQL process: ${spawnError.message}`);
      if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Owned PostgreSQL exited during startup: ${serverLog.toString('utf8').trim()}`);
      try {
        const result = await ownerPool.query('SHOW server_version');
        if (!/^18\.6(?:\b|$)/.test(result.rows[0]?.server_version ?? '')) {
          throw new Error(`Track B requires PostgreSQL 18.6; got ${result.rows[0]?.server_version}`);
        }
        ready = true;
      } catch (error) {
        if (performance.now() >= deadline) throw error;
        await delay(50);
      }
    }
    if (!ready) throw new Error(`Owned PostgreSQL did not start in time: ${serverLog.toString('utf8').trim()}`);

    const closeOwnerPool = async () => {
      if (!ownerPool) return;
      const pool = ownerPool;
      ownerPool = null;
      await pool.end();
    };
    const stop = async () => {
      if (stopped) return;
      await cleanup();
      stopped = true;
    };
    return { connectionConfig, ownerPool, closeOwnerPool, dataDirectory: absoluteDataDirectory, version: EXPECTED_VERSION, stop };
  } catch (error) {
    try { await cleanup({ preserveOwnedData: !createdFreshDirectory || clusterInitialized }); }
    catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}

/** Bootstrap restricted local LOGIN roles; fail closed on existing drift. */
export async function ensureRuntimeRoles(ownerPool, { student = false } = {}) {
  const roles = [
    { name: 'tsa_track_b_identity', member: 'tsa_identity' },
    { name: 'tsa_track_b_bank', member: 'tsa_bank' },
  ];
  if (student) roles.push(
    { name: 'tsa_track_b_exam', member: 'tsa_exam' },
    { name: 'tsa_track_b_exam_worker', member: 'tsa_exam_worker' },
  );
  for (const role of roles) {
    await ownerPool.query(`DO $role_setup$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role.name}') THEN
          CREATE ROLE ${role.name} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        END IF;
      END
    $role_setup$`);
    const result = await ownerPool.query(
      `SELECT r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
              r.rolreplication, r.rolbypassrls,
              ARRAY(SELECT parent.rolname::text FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
                     WHERE m.member=r.oid ORDER BY parent.rolname) AS parents
         FROM pg_roles r WHERE r.rolname=$1`, [role.name]);
    const row = result.rows[0];
    if (!row || !row.rolcanlogin || !row.rolinherit || row.rolsuper || row.rolcreatedb
        || row.rolcreaterole || row.rolreplication || row.rolbypassrls) {
      throw new Error(`Existing ${role.name} role has unsafe attributes; refusing to change it`);
    }
    const currentParents = row.parents;
    if (currentParents.length === 0) {
      await ownerPool.query(`GRANT ${role.member} TO ${role.name}`);
    } else if (currentParents.length !== 1 || currentParents[0] !== role.member) {
      throw new Error(`Existing ${role.name} has unexpected role membership; refusing to widen access`);
    }
  }
}

export function runtimePoolConfig(connectionConfig, user, applicationName) {
  return { ...connectionConfig, user, application_name: applicationName };
}
