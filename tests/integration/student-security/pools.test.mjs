import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { assertStudentRuntimePools } from '../../../src/local/student-pools.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

async function createPools(t) {
  const fixture = await createAllocationFixture({ questionCount: 0 });
  const login = `local_worker_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${login} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${login}`);
  const workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: login }, { max: 1 });
  const pools = { identityPool: fixture.harness.authPool, examPool: fixture.examPool, workerPool };
  t.after(async () => { await workerPool.end(); await fixture.close(); });
  return { fixture, login, pools };
}

test('student composition accepts separate least-privilege pools and denies owner, merged and substituted credentials', async (t) => {
  const { fixture, pools } = await createPools(t);
  assert.equal(await assertStudentRuntimePools(pools), true);
  await assert.rejects(assertStudentRuntimePools({ ...pools, examPool: fixture.pool }), /dedicated non-owner/);
  await assert.rejects(assertStudentRuntimePools({ ...pools, workerPool: pools.examPool }), /separate database pools/);
  await assert.rejects(assertStudentRuntimePools({ ...pools, workerPool: fixture.bankPool }), /dedicated non-owner/);
  await assert.rejects(assertStudentRuntimePools({ ...pools, identityPool: pools.workerPool }), /separate database pools/);
  for (const pool of [pools.examPool, pools.workerPool]) {
    await assert.rejects(pool.query('SELECT * FROM tsa_private.question_secrets'), (error) => error.code === '42501');
  }
  await assert.rejects(pools.examPool.query("SELECT tsa.exam_worker_claim('student-runtime-spoof',30)"),
    (error) => error.code === '42501');
  await assert.rejects(pools.workerPool.query('SELECT tsa.exam_attempt_access($1::uuid)', [randomUUID()]),
    (error) => error.code === '42501');
  assert.equal((await pools.workerPool.query('SELECT 1 AS available')).rows[0].available, 1,
    'attestation and rejected access do not close caller-owned pools');
});

test('student composition refuses unsafe role topology, elevated or owning credentials', async (t) => {
  const { fixture, login, pools } = await createPools(t);
  const cases = [
    [`ALTER ROLE ${login} CREATEDB`, `ALTER ROLE ${login} NOCREATEDB`],
    [`ALTER ROLE ${login} CREATEROLE`, `ALTER ROLE ${login} NOCREATEROLE`],
    [`ALTER ROLE ${login} BYPASSRLS`, `ALTER ROLE ${login} NOBYPASSRLS`],
    [`ALTER ROLE ${login} NOINHERIT`, `ALTER ROLE ${login} INHERIT`],
    [`GRANT tsa_bank TO ${login}`, `REVOKE tsa_bank FROM ${login}`],
    [`GRANT tsa_exam_worker TO ${login} WITH ADMIN OPTION`, `REVOKE ADMIN OPTION FOR tsa_exam_worker FROM ${login}`],
    [`GRANT tsa_exam_worker TO ${login} WITH INHERIT FALSE`, `GRANT tsa_exam_worker TO ${login} WITH INHERIT TRUE`],
    [`GRANT tsa_exam_worker TO ${login} WITH SET FALSE`, `GRANT tsa_exam_worker TO ${login} WITH SET TRUE`],
    ['GRANT tsa_bank TO tsa_exam_worker', 'REVOKE tsa_bank FROM tsa_exam_worker'],
    ['ALTER ROLE tsa_exam_worker LOGIN', 'ALTER ROLE tsa_exam_worker NOLOGIN'],
    ['ALTER ROLE tsa_exam_worker INHERIT', 'ALTER ROLE tsa_exam_worker NOINHERIT'],
    [`ALTER SCHEMA tsa_private OWNER TO ${login}`, 'ALTER SCHEMA tsa_private OWNER TO CURRENT_USER'],
  ];
  for (const [unsafe, restore] of cases) {
    await fixture.pool.query(unsafe);
    try { await assert.rejects(assertStudentRuntimePools(pools), /dedicated non-owner/); }
    finally { await fixture.pool.query(restore); }
    assert.equal(await assertStudentRuntimePools(pools), true, `safe after restoring ${unsafe}`);
  }
  await fixture.pool.query('CREATE TABLE tsa_private.runtime_attestation_probe (id integer)');
  await fixture.pool.query(`ALTER TABLE tsa_private.runtime_attestation_probe OWNER TO ${login}`);
  await assert.rejects(assertStudentRuntimePools(pools), /dedicated non-owner/);
  await fixture.pool.query('DROP TABLE tsa_private.runtime_attestation_probe');
  await pools.workerPool.query('SET ROLE tsa_exam_worker');
  try { await assert.rejects(assertStudentRuntimePools(pools), /dedicated non-owner/); }
  finally { await pools.workerPool.query('RESET ROLE'); }
  assert.equal(await assertStudentRuntimePools(pools), true);
});

test('student composition refuses pools spanning PostgreSQL databases', async (t) => {
  const { fixture, login, pools } = await createPools(t);
  const database = `runtime_other_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE DATABASE ${database}`);
  const otherWorker = createDatabasePool({ ...fixture.harness.database.connectionConfig, database, user: login });
  try {
    await assert.rejects(assertStudentRuntimePools({ ...pools, workerPool: otherWorker }), /same PostgreSQL database/);
  } finally {
    await otherWorker.end();
    await fixture.pool.query(`DROP DATABASE ${database}`);
  }
});
