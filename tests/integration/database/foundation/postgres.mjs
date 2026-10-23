import { spawn } from 'node:child_process';
import { access, chmod, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabasePool } from '../../../../src/modules/database/pool.mjs';

const DEFAULT_TIMEOUT_MS = 35_000;
const COMMAND_TIMEOUT_MS = 8_000;

function cleanEnvironment(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PG/i.test(key)) delete env[key];
  return { ...env, ...extra };
}

function run(file, args, { env = cleanEnvironment(), timeoutMs = COMMAND_TIMEOUT_MS, cwd } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`Timed out after ${timeoutMs} ms: ${path.basename(file)} ${args.join(' ')}`));
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

async function resolveBinaries(requestedBinDir) {
  let binDir = requestedBinDir ?? process.env.PG_BIN;
  if (!binDir) {
    const result = await run('pg_config', ['--bindir']);
    if (result.code !== 0) throw new Error(`pg_config --bindir failed; install PostgreSQL 18.6 tools or set PG_BIN: ${result.stderr}`);
    binDir = result.stdout.trim();
  }
  binDir = path.resolve(binDir);
  const binaries = Object.fromEntries(['initdb', 'postgres'].map((name) => [name, path.join(binDir, name)]));
  for (const [name, binary] of Object.entries(binaries)) {
    try { await access(binary, fsConstants.X_OK); }
    catch { throw new Error(`Required PostgreSQL executable ${name} is missing in ${binDir}; set PG_BIN to the PostgreSQL 18.6 bin directory`); }
    const version = await run(binary, ['--version']);
    if (version.code !== 0 || !/PostgreSQL\) 18\.6(?:\s|$)/.test(version.stdout)) {
      throw new Error(`${name} must be PostgreSQL 18.6; got ${version.stdout.trim() || version.stderr.trim()}`);
    }
  }
  return binaries;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForChildClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (closed) => { clearTimeout(timer); child.removeListener('close', onClose); resolve(closed); };
    child.once('close', onClose);
  });
}

/** Starts a private PostgreSQL 18.6 cluster on a private Unix socket, with no TCP listener. */
export async function startDisposablePostgres({ timeoutMs = DEFAULT_TIMEOUT_MS, pgBin } = {}) {
  let deadline = performance.now() + timeoutMs;
  const remaining = (cap = COMMAND_TIMEOUT_MS) => {
    const time = Math.floor(deadline - performance.now());
    if (time <= 0) throw new Error(`Disposable PostgreSQL exceeded ${timeoutMs} ms`);
    return Math.min(cap, time);
  };
  const binaries = await resolveBinaries(pgBin);
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-bank-core-'));
  const dataDir = path.join(root, 'data');
  const socketDir = path.join(root, 'socket');
  const port = 30_000 + Math.floor(Math.random() * 20_000);
  const logPath = path.join(root, 'postgres.log');
  let server;
  let spawnError;
  let pool;
  let stopped = false;

  const stop = async () => {
    if (stopped) return;
    let poolEnd;
    let poolEndError;
    if (pool) {
      poolEnd = pool.end().catch((error) => { poolEndError = error; });
      await Promise.race([poolEnd, delay(1_500)]);
    }
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      let closed = await waitForChildClose(server, 1_500);
      if (!closed) {
        server.kill('SIGKILL');
        closed = await waitForChildClose(server, 1_000);
      }
      if (!closed) throw new Error('Could not confirm termination of the owned PostgreSQL process; preserving its temporary directory');
    }
    let poolClosed = true;
    if (poolEnd) poolClosed = await Promise.race([poolEnd.then(() => true), delay(1_000).then(() => false)]);
    await rm(root, { recursive: true, force: true });
    try { await access(root); throw new Error('Private PostgreSQL cluster cleanup failed'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    stopped = true;
    if (poolEndError) throw new Error(`PostgreSQL pool shutdown failed: ${poolEndError.message}`);
    if (!poolClosed) throw new Error('PostgreSQL pool did not finish closing within its cleanup bound');
  };

  const config = { host: socketDir, port, user: 'probe', database: 'postgres', application_name: 'tsa-bank-core-test' };
  const startServer = async () => {
    spawnError = undefined;
    server = spawn(binaries.postgres, [
      '-D', dataDir,
      '-c', 'listen_addresses=',
      '-c', `unix_socket_directories=${socketDir}`,
      '-c', 'unix_socket_permissions=0700',
      '-c', `port=${port}`,
      '-c', 'logging_collector=off',
      '-c', 'log_destination=stderr',
    ], { cwd: root, env: cleanEnvironment(), stdio: ['ignore', 'ignore', 'pipe'], shell: false });
    let serverLog = '';
    server.stderr.setEncoding('utf8');
    server.stderr.on('data', (chunk) => { serverLog += chunk; });
    server.once('error', (error) => { spawnError = error; });
    pool = createDatabasePool(config, { max: 4, connectionTimeoutMillis: 1_000, applicationName: 'tsa-bank-core-test' });
    let ready = false;
    while (!ready && performance.now() < deadline) {
      if (spawnError) throw new Error(`Could not start disposable PostgreSQL: ${spawnError.message}`);
      if (server.exitCode !== null || server.signalCode !== null) {
        throw new Error(`Disposable PostgreSQL exited during startup: ${serverLog || await readFile(logPath, 'utf8').catch(() => '')}`);
      }
      try {
        const result = await pool.query('SHOW server_version');
        const version = result.rows[0]?.server_version;
        if (!/^18\.6(?:\b|$)/.test(version ?? '')) throw new Error(`Expected PostgreSQL 18.6, got ${version}`);
        ready = true;
      } catch (error) {
        if (performance.now() >= deadline) throw error;
        await delay(40);
      }
    }
    if (!ready) throw new Error(`Disposable PostgreSQL did not start: ${serverLog}`);
    return { recoveryObserved: /database system was interrupted/.test(serverLog) && /redo starts at/.test(serverLog) };
  };

  try {
    await chmod(root, 0o700);
    await mkdir(dataDir, { mode: 0o700 });
    await mkdir(socketDir, { mode: 0o700 });
    await chmod(dataDir, 0o700);
    await chmod(socketDir, 0o700);
    const init = await run(binaries.initdb, [
      '--locale=C', '--encoding=UTF8', '--auth-local=trust', '--auth-host=reject',
      '--username=probe', '--no-instructions', `--pgdata=${dataDir}`,
    ], { timeoutMs: remaining() });
    if (init.code !== 0) throw new Error(`Disposable PostgreSQL initdb failed: ${init.stderr}\n${init.stdout}`);

    await startServer();
    let restarting = false;
    return {
      get pool() { return pool; }, connectionConfig: config, version: '18.6', temporaryDirectory: root, stop,
      // Test-only fast (default) or immediate restart of this owned postmaster.
      // Caller must quiesce application services and
      // handle expected idle-client disconnects in its own application pools.
      async restart({ shutdownMode = 'fast' } = {}) {
        if (!['fast', 'immediate'].includes(shutdownMode)) throw new TypeError('Unsupported disposable PostgreSQL shutdown mode');
        if (stopped || restarting) throw new Error('Disposable PostgreSQL is stopped or restarting');
        restarting = true;
        try {
          const oldPool = pool; pool = null;
          await oldPool.end();
          // Immediate shutdown deliberately skips normal shutdown processing.
          if (!server.kill(shutdownMode === 'immediate' ? 'SIGQUIT' : 'SIGINT')) throw new Error('Owned PostgreSQL did not accept shutdown signal');
          if (!(await waitForChildClose(server, shutdownMode === 'immediate' ? 8_000 : 3_000))) throw new Error('Owned PostgreSQL did not stop for restart');
          deadline = performance.now() + timeoutMs;
          const startup = await startServer();
          return { shutdownMode, ...startup };
        } finally { restarting = false; }
      },
    };
  } catch (error) {
    try { await stop(); }
    catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}
