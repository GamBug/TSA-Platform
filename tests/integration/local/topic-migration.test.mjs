import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';

async function rows(pool) {
  const tables = (await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name`)).rows;
  const hashes = {};
  for (const { table_schema: schema, table_name: table } of tables) hashes[`${schema}.${table}`] = jsonDigest(
    (await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(t) AS value FROM "${schema}"."${table}" t) snapshot`)).rows[0].rows);
  return hashes;
}
async function security(pool) {
  return (await pool.query(`SELECT p.oid::regprocedure::text AS signature,p.proowner::text,p.proacl::text,p.proconfig,p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('tsa','tsa_private') ORDER BY p.oid`)).rows;
}

test('topic migration preserves populated legacy rows, function privileges, saved clocks and replay', { timeout: 30000 }, async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'tsa-topic-upgrade-'));
  let f;
  t.after(async () => { await f?.close(); await rm(scratch, { recursive: true, force: true }); });
  const old = path.join(scratch, 'old'); await mkdir(old);
  const target = path.join(scratch, 'target'); await mkdir(target);
  const migrations = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
  for (const name of await readdir(migrations)) if (/^\d+_.*\.sql$/.test(name) && Number(name.slice(0, 3)) < 27) await copyFile(path.join(migrations, name), path.join(old, name));
  for (const name of await readdir(migrations)) if (/^\d+_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 27) await copyFile(path.join(migrations, name), path.join(target, name));
  f = await createAllocationFixture({ questionCount: 4, migrationDirectory: old });
  const principal = f.principals.studentA;
  const allocator = createAllocationService({ examPool: f.examPool, identityService: f.identityService });
  const rate = { capacity: 100, refillPerSecond: 10 };
  const attempts = createAttemptService({ examPool: f.examPool, identityService: f.identityService, createRate: rate, saveRate: { user: rate, attempt: rate } });
  const key = randomUUID(), input = { blueprintVersionId: f.blueprint.versionId };
  const created = await allocator.create(principal, key, input);
  await attempts.start(principal, created.body.attemptId, randomUUID(), {});
  const view = await attempts.read(principal, created.body.attemptId);
  await attempts.save(principal, view.attemptId, view.slots[0].slotId, randomUUID(), { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'b' } });
  const clock = (await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0];
  await backupLocalDatabase({ connectionConfig: f.harness.database.connectionConfig, directory: path.join(scratch, 'populated-backup') });
  const before = await rows(f.pool), privileges = await security(f.pool);
  assert.deepEqual((await migrate(f.pool, { directory: target })).applied, ['027_topic_practice.sql']);
  const after = await rows(f.pool); delete after['tsa_private.topic_practice_profiles'];
  assert.deepEqual(after, before);
  const afterSecurity = new Map((await security(f.pool)).map((row) => [row.signature, row]));
  for (const row of privileges) assert.deepEqual(afterSecurity.get(row.signature), row, `existing function security ${row.signature}`);
  assert.equal((await attempts.read(principal, view.attemptId)).answers.length, 1);
  assert.deepEqual((await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [view.attemptId])).rows[0], clock);
  assert.equal((await allocator.create(principal, key, input)).body.attemptId, view.attemptId);
  assert.deepEqual((await migrate(f.pool, { directory: target })).applied, []);
  for (const role of ['tsa_exam','tsa_factory','tsa_bank','tsa_web','tsa_exam_worker']) {
    const allowed = (await f.pool.query("SELECT has_table_privilege($1,'tsa_private.topic_practice_profiles','SELECT,INSERT,UPDATE,DELETE') AS allowed", [role])).rows[0].allowed;
    assert.equal(allowed, false, `${role} has no raw private recipe privileges`);
  }
});
