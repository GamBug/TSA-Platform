import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabasePool, withTransaction } from '../../../../src/modules/database/pool.mjs';
import { startDisposablePostgres } from './postgres.mjs';

test('checked-out connection loss between queries fails COMMIT without retrying or retaining uncommitted writes', { timeout: 15_000 }, async (t) => {
  const database = await startDisposablePostgres();
  const pool = createDatabasePool(database.connectionConfig);
  let resume;
  const gate = new Promise((resolve) => { resume = resolve; });
  t.after(async () => { resume(); try { await pool.end(); } finally { await database.stop(); } });
  await database.pool.query('CREATE TABLE public.connection_loss_marker(id integer PRIMARY KEY)');
  let report;
  const connected = new Promise((resolve) => { report = resolve; });
  let calls = 0;
  const outcome = withTransaction(pool, async (client) => {
    calls += 1;
    await client.query('INSERT INTO public.connection_loss_marker VALUES(1)');
    report((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await gate; // Actual checked-out transaction; no active query or custom error listener.
    return 'must not commit';
  }).then((value) => ({ value }), (error) => ({ error }));
  const pid = await connected;
  assert.equal((await database.pool.query('SELECT pg_terminate_backend($1) AS killed', [pid])).rows[0].killed, true);
  const until = Date.now() + 2_000;
  let present;
  do {
    present = (await database.pool.query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1) AS value', [pid])).rows[0].value;
    if (!present) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < until);
  assert.equal(present, false, 'the real transaction backend has terminated');
  resume();
  const result = await outcome;
  assert.ok(result.error instanceof Error, 'connection loss cannot produce a successful transaction result');
  assert.equal(result.value, undefined);
  assert.equal(calls, 1, 'uncertain transactions are never automatically retried');
  assert.equal((await database.pool.query('SELECT count(*)::int AS n FROM public.connection_loss_marker')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT 1 AS usable')).rows[0].usable, 1, 'the pool can establish a fresh connection');
});
