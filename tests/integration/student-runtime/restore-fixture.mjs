// Test-only logical restore of an explicitly marked, owned synthetic database.
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';

async function run(binary, args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^PG/i.test(key)) delete env[key];
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 10_000);
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (text) => { output = (output + text).slice(-4096); });
    child.stderr.resume(); // Never print private restore SQL, role data or connection diagnostics.
    child.once('error', () => { clearTimeout(timer); reject(new Error('Owned restore-tool startup failed')); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || timedOut) reject(new Error(`Owned ${path.basename(binary)} failed${timedOut ? ' (timeout)' : ''}`));
      else resolve(output.trim());
    });
  });
}
const connectionArgs = (config) => ['--host', config.host, '--port', String(config.port), '--username', config.user, '--no-password'];

export async function restoreSyntheticFixture(source, { syntheticOnly = false, beforeRestore } = {}) {
  if (!syntheticOnly || process.env.NODE_ENV === 'production'
      || source?.version !== '18.6' || !source.temporaryDirectory?.startsWith(path.join(os.tmpdir(), 'tsa-bank-core-'))
      || source.connectionConfig?.host !== path.join(source.temporaryDirectory, 'socket')
      || source.connectionConfig.database !== 'postgres' || source.connectionConfig.user !== 'probe') throw new Error('Owned isolated synthetic restore source required');
  const scope = await source.pool.query(`SELECT 1 FROM tsa_private.bank_workflow_fixture_scope
    WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND postmaster_started_at=pg_postmaster_start_time() LIMIT 1`);
  if (!scope.rowCount) throw new Error('An active disposable source scope is required');
  const binDir = path.resolve(process.env.PG_BIN ?? await run('pg_config', ['--bindir']));
  const binaries = Object.fromEntries(['pg_dump', 'pg_dumpall', 'pg_restore', 'psql'].map((name) => [name, path.join(binDir, name)]));
  for (const [name, binary] of Object.entries(binaries)) if (!/\(PostgreSQL\) 18\.6(?:\s|$)/.test(await run(binary, ['--version']))) {
    throw new Error(`${name} must be PostgreSQL18.6`);
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-private-restore-'));
  const archive = path.join(root, 'database.dump'), roles = path.join(root, 'roles.sql'), roleImport = path.join(root, 'role-import.sql'); let target, closed = false;
  const close = async () => {
    if (closed) return;
    // Preserve the directory on a target shutdown error rather than deleting live database resources.
    await target?.stop(); await rm(root, { recursive: true, force: true }); closed = true;
  };
  try {
    await chmod(root, 0o700);
    for (const file of [archive, roles]) { const handle = await open(file, 'wx', 0o600); await handle.close(); }
    await run(binaries.pg_dumpall, [...connectionArgs(source.connectionConfig), '--roles-only', '--no-role-passwords', '--file', roles]);
    await run(binaries.pg_dump, [...connectionArgs(source.connectionConfig), '--dbname', 'postgres', '--format=custom', '--file', archive]);
    for (const file of [archive, roles]) {
      const info = await stat(file);
      if ((info.mode & 0o777) !== 0o600 || info.size === 0 || info.size > 64 * 1024 * 1024) throw new Error('Invalid private restore artifact');
    }
    if (/SCRAM-SHA-256\$|md5[a-f0-9]{32}/i.test(await readFile(roles, 'utf8'))) throw new Error('Role password material is forbidden');
    const roleSql = await readFile(roles, 'utf8');
    // PostgreSQL18 memberships name the bootstrap grantor. Preserve that actual
    // bootstrap role identity; only omit its duplicate CREATE, never its ALTERs/grants.
    if ((roleSql.match(/^CREATE ROLE probe;$/gm) ?? []).length !== 1
        || (await source.pool.query("SELECT oid FROM pg_roles WHERE rolname='probe'")).rows[0]?.oid !== 10) {
      throw new Error('Unexpected disposable bootstrap role export');
    }
    await writeFile(roleImport, roleSql.replace(/^CREATE ROLE probe;$/m, '-- Bootstrap probe already exists from target initdb.'), { flag: 'wx', mode: 0o600 });
    target = await startDisposablePostgres({ pgBin: binDir });
    await run(binaries.psql, [...connectionArgs(target.connectionConfig), '--dbname', 'postgres', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', roleImport]);
    if (beforeRestore) await beforeRestore({ archive, roles, directory: root, targetDirectory: target.temporaryDirectory });
    await run(binaries.pg_restore, [...connectionArgs(target.connectionConfig), '--dbname', 'postgres', '--exit-on-error', '--single-transaction', archive]);
    return { target, archive, roles, roleImport, directory: root, close };
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Restore and cleanup failed'); }
    throw error;
  }
}

/** Always attempt owned target/archive cleanup, even if application shutdown rejects. */
export async function closeRestoredRuntime(runtime, pools, backup) {
  const errors = [];
  try { await runtime?.close(); } catch (error) { errors.push(error); }
  const poolResults = await Promise.allSettled(pools.map(async (pool) => pool.end()));
  errors.push(...poolResults.filter((result) => result.status === 'rejected').map((result) => result.reason));
  try { await backup.close(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'Owned restored runtime cleanup failed');
}
