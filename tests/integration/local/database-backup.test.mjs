import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';

const exec = promisify(execFile);
test('local private database backups preserve schema/data and can restore their saved rows', { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-local-backup-test-'));
  let database;
  t.after(async () => { await database?.stop(); await rm(root, { recursive: true, force: true }); });
  database = await startDisposablePostgres();
  const directory = join(root, 'backups');
  const initial = await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory });
  assert.equal((await stat(initial.archive)).mode & 0o777, 0o600);
  assert.equal((await stat(initial.roles)).mode & 0o777, 0o600);
  assert.equal((await stat(initial.directory)).mode & 0o777, 0o700);
  await database.pool.query('CREATE TABLE public.backup_example (id integer PRIMARY KEY, note text NOT NULL)');
  await database.pool.query("INSERT INTO public.backup_example VALUES (1, 'Synthetic backup verification')");
  const populated = await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory });
  assert.notEqual(initial.archive, populated.archive);
  await database.pool.query('DELETE FROM public.backup_example');
  const { stdout: bindir } = await exec('pg_config', ['--bindir']);
  const c = database.connectionConfig;
  await exec(join(bindir.trim(), 'pg_restore'), ['--data-only', '--table', 'backup_example', '--no-owner',
    '--host', c.host, '--port', String(c.port), '--username', c.user, '--dbname', c.database, populated.archive],
  { env: { PATH: process.env.PATH, LANG: 'C.UTF-8' } });
  assert.deepEqual((await database.pool.query('SELECT * FROM public.backup_example')).rows,
    [{ id: 1, note: 'Synthetic backup verification' }]);
  await assert.rejects(backupLocalDatabase({ connectionConfig: { ...c, host: '127.0.0.1' }, directory }), /Unix-socket/);
});
