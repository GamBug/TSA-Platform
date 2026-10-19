#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants as fsConstants, closeSync, openSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, 'fixture.sql');
const totalTimeoutMs = 35_000;
const commandTimeoutMs = 5_000;
const startedAt = performance.now();
const deadlineAt = startedAt + totalTimeoutMs;
const ownedChildren = new Set();
const checks = [];
let interrupted = false;
let tempRoot;
let server;
let serverSpawnError;
let serverLogFd;
let pg;

function remainingMs(cap = commandTimeoutMs) {
  const remaining = Math.floor(deadlineAt - performance.now());
  if (remaining <= 0) throw new Error(`Probe exceeded its ${totalTimeoutMs} ms time limit`);
  return Math.min(cap, remaining);
}

function cleanEnvironment(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^PG/i.test(key)) delete env[key];
  }
  return { ...env, ...extra };
}

function noteCheck(name) {
  checks.push(name);
  process.stdout.write(`PASS ${name}\n`);
}

function spawnBuffered(file, args, {
  env = cleanEnvironment(),
  input,
  timeoutMs = remainingMs(),
  stdio = ['pipe', 'pipe', 'pipe'],
  cwd = here,
} = {}) {
  return new Promise((resolve, reject) => {
    if (interrupted) return reject(new Error('Probe interrupted'));
    let child;
    try {
      child = spawn(file, args, { cwd, env, stdio, shell: false });
    } catch (error) {
      reject(error);
      return;
    }
    ownedChildren.add(child);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`Timed out after ${timeoutMs} ms: ${path.basename(file)} ${args.join(' ')}`));
    }, timeoutMs);
    timer.unref?.();
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => finish(error));
    child.once('close', (code, signal) => {
      ownedChildren.delete(child);
      finish(null, { code, signal, stdout, stderr });
    });
    if (input !== undefined) child.stdin.end(input);
    else if (child.stdin) child.stdin.end();
  });
}

function spawnInteractivePsql(applicationName) {
  const child = spawn(pg.psql, psqlBaseArgs(), {
    cwd: here,
    env: connectionEnvironment(applicationName),
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  ownedChildren.add(child);
  const state = { child, stdout: '', stderr: '', waiters: new Set(), closed: false };
  state.exitPromise = new Promise((resolve) => {
    child.once('error', (error) => {
      state.spawnError = error;
    });
    child.once('close', (code, signal) => {
      ownedChildren.delete(child);
      state.closed = true;
      state.code = code;
      state.signal = signal;
      for (const wake of state.waiters) wake();
      resolve({ code, signal });
    });
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    state.stdout += chunk;
    for (const wake of state.waiters) wake();
  });
  child.stderr.on('data', (chunk) => { state.stderr += chunk; });
  return state;
}

async function waitForOutput(state, marker, timeoutMs) {
  if (state.stdout.includes(marker)) return;
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      state.waiters.delete(wake);
      if (error) reject(error);
      else resolve();
    };
    const wake = () => {
      if (state.stdout.includes(marker)) finish();
      else if (state.closed) finish(new Error(`psql exited before marker ${marker}: ${state.stderr}`));
    };
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for psql marker ${marker}`)), timeoutMs);
    state.waiters.add(wake);
    wake();
  });
}

function psqlBaseArgs() {
  return [
    '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
    '-h', pg.socketDir, '-p', String(pg.port), '-U', 'probe', '-d', 'postgres',
  ];
}

function connectionEnvironment(applicationName = 'probe-check') {
  return cleanEnvironment({
    PGHOST: pg.socketDir,
    PGPORT: String(pg.port),
    PGUSER: 'probe',
    PGDATABASE: 'postgres',
    PGAPPNAME: applicationName,
  });
}

async function psql(sql, { applicationName = 'probe-check', timeoutMs = remainingMs(), allowFailure = false } = {}) {
  const result = await spawnBuffered(pg.psql, [...psqlBaseArgs(), '-c', sql], {
    env: connectionEnvironment(applicationName),
    timeoutMs,
  });
  if (!allowFailure) assert.equal(result.code, 0, `psql command failed (${result.code}): ${result.stderr}`);
  return result;
}

async function queryScalar(sql, options) {
  const result = await psql(sql, options);
  assert.equal(result.code, 0, `psql query failed (${result.code}): ${result.stderr}`);
  return result.stdout.trim();
}

async function expectSqlState(sql, state, label) {
  const result = await psql(sql, { applicationName: `probe-negative-${randomUUID().slice(0, 8)}`, allowFailure: true });
  assert.notEqual(result.code, 0, `${label}: expected SQLSTATE ${state}, but statement succeeded`);
  assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`\\b${state}\\b`), `${label}: SQLSTATE mismatch`);
}

function newId() {
  return randomUUID();
}

function insertSql({ id = newId(), userId = newId(), formId = newId(), mode = 'PERSONALIZED_PRACTICE', state = 'CREATED', admissionSeconds = 3600 } = {}) {
  return {
    id,
    userId,
    formId,
    sql: `WITH timing AS (SELECT clock_timestamp() AS created_at)\n` +
      `INSERT INTO approved_invariants_probe.attempts ` +
      `(id, user_id, form_id, mode, state, created_at, admission_until_at_creation, start_before_at)\n` +
      `SELECT '${id}', '${userId}', '${formId}', '${mode}'::approved_invariants_probe.practice_mode, ` +
      `'${state}'::approved_invariants_probe.attempt_state, created_at, ` +
      `created_at + interval '${admissionSeconds} seconds', ` +
      `LEAST(created_at + interval '600 seconds', created_at + interval '${admissionSeconds} seconds')\n` +
      `FROM timing;`,
  };
}

async function resolvePostgresBinaries() {
  let binDir = process.env.PG_BIN;
  if (!binDir) {
    const pgConfig = await spawnBuffered('pg_config', ['--bindir'], { timeoutMs: 3_000 });
    assert.equal(pgConfig.code, 0, `pg_config --bindir failed; install PostgreSQL 18.6 tools or set PG_BIN: ${pgConfig.stderr}`);
    binDir = pgConfig.stdout.trim();
  }
  binDir = path.resolve(binDir);
  const binaries = Object.fromEntries(['initdb', 'postgres', 'psql'].map((name) => [name, path.join(binDir, name)]));
  for (const [name, binary] of Object.entries(binaries)) {
    try {
      await access(binary, fsConstants.X_OK);
    } catch {
      throw new Error(`Required PostgreSQL executable ${name} is missing in ${binDir}; set PG_BIN to the PostgreSQL 18.6 bin directory`);
    }
    const version = await spawnBuffered(binary, ['--version'], { timeoutMs: 3_000 });
    assert.equal(version.code, 0, `${name} --version failed: ${version.stderr}`);
    assert.match(version.stdout, /PostgreSQL\) 18\.6(?:\s|$)/, `${name} must be PostgreSQL 18.6; got ${version.stdout.trim()}`);
  }
  return binaries;
}

async function waitForServer() {
  const until = performance.now() + Math.min(7_000, remainingMs());
  let lastError = '';
  while (performance.now() < until) {
    if (serverSpawnError) {
      throw new Error(`Could not start disposable PostgreSQL: ${serverSpawnError.message}`);
    }
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Disposable PostgreSQL exited during startup (code=${server.exitCode}, signal=${server.signalCode}); log: ${await readFile(pg.logPath, 'utf8')}`);
    }
    try {
      const version = await queryScalar('SHOW server_version;', { applicationName: 'probe-startup', timeoutMs: 1_000 });
      assert.match(version, /^18\.6(?:\b|$)/, `Unexpected PostgreSQL server version: ${version}`);
      return version;
    } catch (error) {
      lastError = error.message;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw new Error(`Disposable PostgreSQL did not become ready: ${lastError}; log: ${await readFile(pg.logPath, 'utf8')}`);
}

async function observeLockWait(applicationName) {
  const stopAt = performance.now() + Math.min(8_000, remainingMs());
  const escapedName = applicationName.replaceAll("'", "''");
  while (performance.now() < stopAt) {
    const waiting = await queryScalar(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity ` +
      `WHERE application_name = '${escapedName}' AND state = 'active' AND wait_event_type = 'Lock');`,
      { applicationName: 'probe-lock-barrier', timeoutMs: 1_000 },
    );
    if (waiting === 't') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Did not observe PostgreSQL lock wait for ${applicationName}; winner remains uncommitted`);
}

async function runRace(caseNumber, winnerMode, winnerState, loserMode, loserState) {
  const userId = newId();
  const winnerRow = insertSql({ userId, mode: winnerMode, state: winnerState });
  const loserRow = insertSql({ userId, mode: loserMode, state: loserState });
  const winnerApp = `probe-h1-winner-${caseNumber}`;
  const loserApp = `probe-h1-loser-${caseNumber}`;
  const winner = spawnInteractivePsql(winnerApp);
  winner.child.stdin.write(`BEGIN;\n${winnerRow.sql}\nSELECT 'WINNER_READY_${caseNumber}';\n`);
  await waitForOutput(winner, `WINNER_READY_${caseNumber}`, remainingMs(4_000));

  const loserPromise = spawnBuffered(pg.psql, [...psqlBaseArgs()], {
    env: connectionEnvironment(loserApp),
    input: `BEGIN;\n${loserRow.sql}\nCOMMIT;\n`,
    timeoutMs: remainingMs(8_000),
  });
  await observeLockWait(loserApp);

  const unrelatedRow = insertSql({ mode: 'PUBLISHED_FIXED', state: 'CREATED' });
  await psql(unrelatedRow.sql, { applicationName: `probe-h1-other-user-${caseNumber}` });
  assert.equal(
    await queryScalar(`SELECT count(*) FROM approved_invariants_probe.attempts WHERE id = '${unrelatedRow.id}' AND state = 'CREATED';`),
    '1',
    'a different user must commit an active attempt while the conflicting transaction remains open',
  );
  noteCheck(`a different user commits an active attempt while the H1 winner remains uncommitted (order ${caseNumber})`);

  winner.child.stdin.write('COMMIT;\n\\q\n');
  winner.child.stdin.end();
  const [winnerExit, loser] = await Promise.all([winner.exitPromise, loserPromise]);
  assert.equal(winnerExit.code, 0, `winner psql failed: ${winner.stderr}`);
  assert.notEqual(loser.code, 0, `loser ${loserApp} unexpectedly inserted a second active row`);
  assert.match(loser.stderr, /\b23505\b/, `loser must fail with SQLSTATE 23505: ${loser.stderr}`);
  assert.equal(
    await queryScalar(`SELECT count(*) FROM approved_invariants_probe.attempts WHERE user_id = '${userId}';`),
    '1',
    'only the committed winner should persist',
  );
  assert.equal(
    await queryScalar(`SELECT mode::text || '|' || state::text FROM approved_invariants_probe.attempts WHERE id = '${winnerRow.id}';`),
    `${winnerMode}|${winnerState}`,
  );
  noteCheck(`H1 cross-mode uniqueness race order ${caseNumber}: ${winnerMode}/${winnerState} wins; ${loserMode}/${loserState} waited on Lock and failed 23505`);
  return { winnerRow, userId };
}

async function checkH1Behavior() {
  const first = await runRace(1, 'PERSONALIZED_PRACTICE', 'CREATED', 'PUBLISHED_FIXED', 'IN_PROGRESS');
  const second = await runRace(2, 'PUBLISHED_FIXED', 'IN_PROGRESS', 'PERSONALIZED_PRACTICE', 'CREATED');

  await psql(`UPDATE approved_invariants_probe.attempts SET state = 'SUBMITTED' WHERE id = '${first.winnerRow.id}';`);
  const terminalReplacement = insertSql({ userId: first.userId, mode: 'PUBLISHED_FIXED', state: 'CREATED' });
  await psql(terminalReplacement.sql);
  assert.equal(await queryScalar(`SELECT count(*) FROM approved_invariants_probe.attempts WHERE user_id = '${first.userId}';`), '2');
  noteCheck('terminal closure permits a new active attempt for the same user');

  const differentA = insertSql({ mode: 'PERSONALIZED_PRACTICE', state: 'CREATED' });
  const differentB = insertSql({ mode: 'PUBLISHED_FIXED', state: 'IN_PROGRESS' });
  await psql(`${differentA.sql}\n${differentB.sql}`);
  assert.equal(await queryScalar(`SELECT count(*) FROM approved_invariants_probe.attempts WHERE user_id IN ('${differentA.userId}', '${differentB.userId}') AND state IN ('CREATED','IN_PROGRESS');`), '2');
  noteCheck('different users may hold active attempts concurrently across modes');

  const rolledBack = insertSql({ mode: 'PERSONALIZED_PRACTICE', state: 'CREATED' });
  await psql(`BEGIN;\n${rolledBack.sql}\nROLLBACK;`);
  assert.equal(await queryScalar(`SELECT count(*) FROM approved_invariants_probe.attempts WHERE id = '${rolledBack.id}';`), '0');
  const afterRollback = insertSql({ userId: rolledBack.userId, mode: 'PUBLISHED_FIXED', state: 'CREATED' });
  await psql(afterRollback.sql);
  assert.equal(await queryScalar(`SELECT count(*) FROM approved_invariants_probe.attempts WHERE user_id = '${rolledBack.userId}' AND state IN ('CREATED','IN_PROGRESS');`), '1');
  noteCheck('rollback leaves no active probe row and releases uniqueness for a subsequent insert');
  assert.ok(second.winnerRow.id, 'second inverse-order race winner recorded');
}

async function checkDeadlineBehavior() {
  const full = insertSql({ admissionSeconds: 3_600 });
  const capped = insertSql({ admissionSeconds: 300 });
  await psql(`${full.sql}\n${capped.sql}`);
  const fullSeconds = await queryScalar(`SELECT extract(epoch FROM (start_before_at - created_at))::int FROM approved_invariants_probe.attempts WHERE id = '${full.id}';`);
  const cappedSeconds = await queryScalar(`SELECT extract(epoch FROM (start_before_at - created_at))::int FROM approved_invariants_probe.attempts WHERE id = '${capped.id}';`);
  assert.equal(fullSeconds, '600');
  assert.equal(cappedSeconds, '300');
  noteCheck('start_before_at is the full 600-second TTL or the earlier admission cap');

  const nullDeadline = insertSql({ admissionSeconds: 3_600 });
  await expectSqlState(
    `INSERT INTO approved_invariants_probe.attempts ` +
      `(id,user_id,form_id,mode,state,created_at,admission_until_at_creation,start_before_at) ` +
      `VALUES ('${nullDeadline.id}','${nullDeadline.userId}','${nullDeadline.formId}',` +
      `'PERSONALIZED_PRACTICE','CREATED',TIMESTAMPTZ '2026-10-19 12:00:00+00',` +
      `TIMESTAMPTZ '2026-10-19 13:00:00+00',NULL);`,
    '23502',
    'deadline is required',
  );
  const wrongTtl = insertSql();
  await expectSqlState(
    `INSERT INTO approved_invariants_probe.attempts ` +
      `(id,user_id,form_id,mode,state,created_at,admission_until_at_creation,start_before_at) ` +
      `VALUES ('${wrongTtl.id}','${wrongTtl.userId}','${wrongTtl.formId}',` +
      `'PERSONALIZED_PRACTICE','CREATED',TIMESTAMPTZ '2026-10-19 12:00:00+00',` +
      `TIMESTAMPTZ '2026-10-19 13:00:00+00',TIMESTAMPTZ '2026-10-19 12:09:59+00');`,
    '23514',
    'incorrect TTL is rejected',
  );
  const nonpositive = insertSql();
  await expectSqlState(
    `INSERT INTO approved_invariants_probe.attempts ` +
      `(id,user_id,form_id,mode,state,created_at,admission_until_at_creation,start_before_at) ` +
      `VALUES ('${nonpositive.id}','${nonpositive.userId}','${nonpositive.formId}',` +
      `'PERSONALIZED_PRACTICE','CREATED',TIMESTAMPTZ '2026-10-19 12:00:00+00',` +
      `TIMESTAMPTZ '2026-10-19 11:59:59+00',TIMESTAMPTZ '2026-10-19 11:59:59+00');`,
    '23514',
    'nonpositive start window is rejected',
  );
  noteCheck('NULL deadline, altered TTL, and nonpositive interval are rejected with expected SQLSTATEs');

  await expectSqlState(
    `UPDATE approved_invariants_probe.attempts SET start_before_at = start_before_at + interval '1 second' WHERE id = '${full.id}';`,
    '23514',
    'deadline mutation is rejected',
  );
  await expectSqlState(
    `UPDATE approved_invariants_probe.attempts SET admission_until_at_creation = admission_until_at_creation + interval '1 hour' WHERE id = '${full.id}';`,
    '23514',
    'creation admission context mutation is rejected',
  );
  await expectSqlState(
    `UPDATE approved_invariants_probe.attempts SET created_at = created_at + interval '1 second' WHERE id = '${full.id}';`,
    '23514',
    'creation timestamp mutation is rejected',
  );
  assert.equal(await queryScalar(`SELECT extract(epoch FROM (start_before_at - created_at))::int FROM approved_invariants_probe.attempts WHERE id = '${full.id}';`), '600');
  noteCheck('deadline and creation-context updates fail while the persisted deadline remains unchanged');

  const boundary = await queryScalar(
    `WITH d AS (SELECT TIMESTAMPTZ '2026-10-19 12:10:00+00' AS deadline) ` +
    `SELECT ((deadline - interval '1 microsecond') < deadline)::text || '|' || ` +
    `(deadline < deadline)::text || '|' || ` +
    `((deadline + interval '1 microsecond') < deadline)::text FROM d;`,
  );
  assert.equal(boundary, 'true|false|false');
  noteCheck('strict start comparison is true immediately before the deadline and false at/after equality');
}

async function initializeCluster() {
  const binaries = await resolvePostgresBinaries();
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-approved-invariants-'));
  tempRoot = root;
  await chmod(root, 0o700);
  const dataDir = path.join(root, 'data');
  const socketDir = path.join(root, 'socket');
  await mkdir(dataDir, { mode: 0o700 });
  await mkdir(socketDir, { mode: 0o700 });
  await chmod(dataDir, 0o700);
  await chmod(socketDir, 0o700);
  const port = 30_000 + Math.floor(Math.random() * 20_000);
  pg = { ...binaries, dataDir, socketDir, port, logPath: path.join(root, 'postgres.log') };

  const init = await spawnBuffered(pg.initdb, [
    '--locale=C', '--encoding=UTF8', '--auth-local=trust', '--auth-host=reject',
    '--username=probe', '--no-instructions', `--pgdata=${dataDir}`,
  ], { timeoutMs: remainingMs(8_000) });
  assert.equal(init.code, 0, `initdb failed (${init.code}): ${init.stderr}\n${init.stdout}`);

  serverLogFd = openSync(pg.logPath, 'a', 0o600);
  server = spawn(pg.postgres, [
    '-D', dataDir,
    '-c', 'listen_addresses=',
    '-c', `unix_socket_directories=${socketDir}`,
    '-c', 'unix_socket_permissions=0700',
    '-c', `port=${port}`,
    '-c', 'logging_collector=off',
    '-c', 'log_destination=stderr',
  ], { cwd: root, env: cleanEnvironment(), stdio: ['ignore', serverLogFd, serverLogFd], shell: false });
  ownedChildren.add(server);
  server.once('error', (error) => { serverSpawnError = error; });
  server.once('close', () => ownedChildren.delete(server));
  closeSync(serverLogFd);
  serverLogFd = undefined;
  const version = await waitForServer();
  process.stdout.write(`PostgreSQL ${version}; private temporary cluster, Unix socket only\n`);
  const fixture = await spawnBuffered(pg.psql, [...psqlBaseArgs(), '-f', fixturePath], {
    env: connectionEnvironment('probe-fixture'),
    timeoutMs: remainingMs(5_000),
  });
  assert.equal(fixture.code, 0, `probe fixture failed: ${fixture.stderr}`);
  return version;
}

async function cleanup() {
  for (const child of ownedChildren) {
    try { child.kill('SIGTERM'); } catch { /* best effort before bounded forced cleanup */ }
  }
  const children = [...ownedChildren];
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      resolve();
    }, 1_500);
    child.once('close', () => { clearTimeout(timer); resolve(); });
  })));
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.kill('SIGKILL');
        resolve();
      }, 2_000);
      server.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
  if (serverLogFd !== undefined) closeSync(serverLogFd);
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    let exists = true;
    try { await access(tempRoot); } catch { exists = false; }
    assert.equal(exists, false, 'private temporary cluster directory must be removed');
    process.stdout.write('PASS private PostgreSQL cluster and socket directory removed\n');
  }
}

function handleSignal() {
  interrupted = true;
  for (const child of ownedChildren) {
    try { child.kill('SIGTERM'); } catch { /* cleanup remains in finally */ }
  }
}

async function main() {
  let version;
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  try {
    version = await initializeCluster();
    await checkH1Behavior();
    await checkDeadlineBehavior();
    if (interrupted) throw new Error('Probe interrupted');
    process.stdout.write(`Completed ${checks.length} named invariant checks on PostgreSQL ${version} in ${Math.round(performance.now() - startedAt)} ms\n`);
  } finally {
    await cleanup();
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
  }
}

main().catch((error) => {
  process.stderr.write(`FAIL ${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
