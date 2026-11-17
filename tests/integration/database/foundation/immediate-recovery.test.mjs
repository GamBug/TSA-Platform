import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabasePool } from '../../../../src/modules/database/pool.mjs';
import { startDisposablePostgres } from './postgres.mjs';

test('restart restores the owned server before propagating a stopped-barrier assertion failure', { timeout: 15_000 }, async (t) => {
  const database = await startDisposablePostgres();
  t.after(() => database.stop());
  await assert.rejects(database.restart({ whileStopped: true }), /whileStopped must be a function/);
  assert.equal((await database.pool.query('SELECT 1 AS n')).rows[0].n, 1);
  const failure = new Error('controlled stopped-barrier failure');
  let called = false;
  await assert.rejects(database.restart({ whileStopped: async () => { called = true; throw failure; } }), (error) => error === failure);
  assert.equal(called, true);
  assert.equal((await database.pool.query('SELECT 1 AS n')).rows[0].n, 1);
  assert.equal((await database.restart()).shutdownMode, 'fast', 'a failed barrier does not leave the helper restarting');
});

test('owned immediate shutdown replays committed WAL and discards an open uncommitted transaction', { timeout: 20_000 }, async (t) => {
  const database = await startDisposablePostgres();
  let external, client;
  t.after(async () => {
    if (client) { client.release(true); client = null; }
    try { await external?.end(); } finally { await database.stop(); }
  });
  assert.deepEqual((await database.pool.query("SELECT current_setting('fsync') AS fsync,current_setting('full_page_writes') AS full_page_writes,current_setting('synchronous_commit') AS synchronous_commit")).rows[0],
    { fsync: 'on', full_page_writes: 'on', synchronous_commit: 'on' });
  await database.pool.query('CREATE TABLE public.recovery_marker(id integer PRIMARY KEY,note text NOT NULL)');
  await database.pool.query("INSERT INTO public.recovery_marker VALUES(1,'confirmed commit')");
  external = createDatabasePool(database.connectionConfig);
  client = await external.connect();
  const disconnects = [];
  client.on('error', (error) => disconnects.push(error));
  await client.query('BEGIN');
  await client.query("INSERT INTO public.recovery_marker VALUES(2,'uncommitted transaction')");
  assert.equal((await client.query('SELECT count(*)::int AS n FROM public.recovery_marker')).rows[0].n, 2);
  assert.equal((await database.pool.query('SELECT count(*)::int AS n FROM public.recovery_marker')).rows[0].n, 1);
  const original = (await database.pool.query('SELECT pg_postmaster_start_time()::text AS started')).rows[0].started;
  const restarted = await database.restart({ shutdownMode: 'immediate' });
  assert.deepEqual(restarted, { shutdownMode: 'immediate', recoveryObserved: true });
  assert.notEqual((await database.pool.query('SELECT pg_postmaster_start_time()::text AS started')).rows[0].started, original);
  assert.deepEqual((await database.pool.query('SELECT * FROM public.recovery_marker ORDER BY id')).rows, [{ id: 1, note: 'confirmed commit' }]);
  assert.ok(disconnects.length > 0, 'the real open transaction connection was terminated');
  assert.ok(disconnects.every((error) => ['57P01', '57P02'].includes(error.code) || error.message === 'Connection terminated unexpectedly'));
  client.release(true); client = null;
});
