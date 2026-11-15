import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { ensureRuntimeRoles } from '../../../src/local/postgres.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { assertBankConnection } from '../../../src/modules/bank/common.mjs';
import { bootstrapLocalSyntheticIdentity, createLocalSyntheticIdentityService } from '../../../src/modules/identity/local-synthetic.mjs';

const roles = [
  ['tsa_track_b_bank', 'tsa_bank'], ['tsa_track_b_identity', 'tsa_identity'],
  ['tsa_track_b_exam', 'tsa_exam'], ['tsa_track_b_exam_worker', 'tsa_exam_worker'],
];

test('local provisioning rejects unsafe membership options without rewriting existing grants', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-role-membership-'));
  let database;
  t.after(async () => { await database?.stop(); await rm(root, { recursive: true, force: true }); });
  database = await startDisposablePostgres();
  await migrate(database.pool);
  await ensureRuntimeRoles(database.pool, { student: true });
  await ensureRuntimeRoles(database.pool, { student: true });
  for (const [login, capability] of roles) {
    for (const option of ['ADMIN TRUE', 'INHERIT FALSE', 'SET FALSE']) {
      await t.test(`${login} refuses ${option}`, async () => {
        await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: join(root, 'before-drift') });
        const client = await database.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`GRANT ${capability} TO ${login} WITH ${option}`);
          const before = (await client.query(`SELECT admin_option,inherit_option,set_option FROM pg_auth_members
            WHERE roleid=$1::regrole AND member=$2::regrole`, [capability, login])).rows;
          await assert.rejects(ensureRuntimeRoles(client, { student: true }), /unsafe role membership/);
          const after = (await client.query(`SELECT admin_option,inherit_option,set_option FROM pg_auth_members
            WHERE roleid=$1::regrole AND member=$2::regrole`, [capability, login])).rows;
          assert.deepEqual(after, before, 'startup must not silently repair role drift');
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      });
    }
    await t.test(`${login} refuses an inherited capability outside its boundary`, async () => {
      await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: join(root, 'before-drift') });
      const client = await database.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`GRANT tsa_factory TO ${capability} WITH INHERIT TRUE`);
        await assert.rejects(ensureRuntimeRoles(client, { student: true }), /unsafe capability/);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
    await t.test(`${login} refuses role-management privileges on its capability`, async () => {
      await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: join(root, 'before-drift') });
      const client = await database.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`ALTER ROLE ${capability} CREATEROLE`);
        await assert.rejects(ensureRuntimeRoles(client, { student: true }), /unsafe capability/);
      } finally { await client.query('ROLLBACK'); client.release(); }
    });
  }
});

test('direct Bank and identity startup refuse unsafe capability grants', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-service-membership-'));
  const env = { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:1' };
  let database;
  const pools = [];
  t.after(async () => { await Promise.all(pools.map(pool => pool.end())); await database?.stop(); await rm(root, { recursive: true, force: true }); });
  database = await startDisposablePostgres();
  await migrate(database.pool);
  await bootstrapLocalSyntheticIdentity(database.pool, { env });
  await ensureRuntimeRoles(database.pool);
  for (const [login, capability] of roles.slice(0, 2)) {
    const pool = createDatabasePool({ ...database.connectionConfig, user: login });
    pools.push(pool);
    const validate = capability === 'tsa_bank' ? () => assertBankConnection(pool)
      : () => createLocalSyntheticIdentityService(pool, { env });
    await validate();
    for (const option of ['ADMIN TRUE', 'INHERIT FALSE', 'SET FALSE']) {
      await t.test(`${capability} service refuses ${option}`, async () => {
        await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: join(root, 'before-drift') });
        await database.pool.query(`GRANT ${capability} TO ${login} WITH ${option}`);
        try { await assert.rejects(validate(), /restricted|non-owner|permission denied/); }
        finally { await database.pool.query(`GRANT ${capability} TO ${login} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`); }
        await validate();
      });
    }
    await t.test(`${capability} service refuses inherited factory privileges`, async () => {
      await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: join(root, 'before-drift') });
      await database.pool.query(`GRANT tsa_factory TO ${capability} WITH INHERIT TRUE`);
      try { await assert.rejects(validate(), /restricted|non-owner/); }
      finally { await database.pool.query(`REVOKE tsa_factory FROM ${capability}`); }
      await validate();
    });
    await t.test(`${capability} service refuses role-management privileges on its capability`, async () => {
      await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: join(root, 'before-drift') });
      await database.pool.query(`ALTER ROLE ${capability} CREATEROLE`);
      try { await assert.rejects(validate(), /restricted|non-owner/); }
      finally { await database.pool.query(`ALTER ROLE ${capability} NOCREATEROLE`); }
      await validate();
    });
  }
});
