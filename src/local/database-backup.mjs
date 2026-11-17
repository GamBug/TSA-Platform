import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, open, realpath, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function run(binary, args, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let output = '';
    let settled = false;
    let forcedStop;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(forcedStop);
      if (error) reject(error); else resolveResult(output.trim());
    };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true; child.kill('SIGTERM');
      forcedStop = setTimeout(() => child.kill('SIGKILL'), 1000);
    }, 30000);
    child.stdout.on('data', (bytes) => { if (output.length < 4096) output += bytes.toString(); });
    // Database diagnostics may include private object names.
    child.stderr.resume();
    child.once('error', () => finish(new Error('Local database backup executable is unavailable')));
    child.once('close', (code) => finish(timedOut ? new Error('Local database backup timed out')
      : code === 0 ? null : new Error('Local database backup failed')));
  });
}

/** Back up an owned local cluster before migration or bootstrap data changes. */
export async function backupLocalDatabase({ connectionConfig, directory, pgBin = process.env.PG_BIN }) {
  if (!connectionConfig || !String(connectionConfig.host).startsWith('/') || connectionConfig.database !== 'postgres') {
    throw new TypeError('An owned Unix-socket development database is required');
  }
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8' };
  const binaries = pgBin ? resolve(pgBin) : await run('pg_config', ['--bindir'], env);
  const root = resolve(directory);
  try { await mkdir(root, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
      || info.uid !== process.getuid() || await realpath(root) !== root) throw new Error('Local backup directory must be private and owned');
  const folder = await mkdtemp(join(root, 'before-start-'));
  await chmod(folder, 0o700);
  const archive = join(folder, 'database.dump');
  const roles = join(folder, 'roles.sql');
  const args = ['--host', connectionConfig.host, '--port', String(connectionConfig.port),
    '--username', connectionConfig.user, '--dbname', connectionConfig.database];
  try {
    for (const file of [archive, roles]) { const handle = await open(file, 'wx', 0o600); await handle.close(); }
    await run(join(binaries, 'pg_dump'), [...args, '--format=custom', '--file', archive], env);
    await run(join(binaries, 'pg_dumpall'), ['--host', connectionConfig.host, '--port', String(connectionConfig.port),
      '--username', connectionConfig.user, '--roles-only', '--no-role-passwords', '--file', roles], env);
    return Object.freeze({ directory: folder, archive, roles });
  } catch (error) {
    await Promise.allSettled([unlink(archive), unlink(roles)]);
    throw error;
  }
}
