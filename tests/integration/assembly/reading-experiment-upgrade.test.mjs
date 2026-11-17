import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAllocationFixture } from './fixtures.mjs';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { createStudentDirectoryService } from '../../../src/modules/attempts/directory.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';

async function snapshotRows(pool) {
  const tables = (await pool.query(`SELECT table_schema,table_name
    FROM information_schema.tables WHERE table_schema IN ('tsa','tsa_private')
      AND table_type='BASE TABLE' ORDER BY table_schema,table_name`)).rows;
  const result = {};
  for (const { table_schema, table_name } of tables) {
    const rows = (await pool.query(`SELECT COALESCE(jsonb_agg(row_value ORDER BY row_value::text),'[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(t) AS row_value FROM "${table_schema}"."${table_name}" t) values_`)).rows[0].rows;
    result[`${table_schema}.${table_name}`] = jsonDigest(rows);
  }
  return result;
}

async function functionSecurity(pool) {
  return (await pool.query(`SELECT p.oid::regprocedure::text AS signature,
    pg_get_functiondef(p.oid) AS definition,p.proowner::text AS owner,p.proacl::text AS acl,p.proconfig,p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('tsa','tsa_private') ORDER BY p.oid`)).rows;
}

async function tableGrants(pool) {
  return (await pool.query(`SELECT grantor,grantee,table_schema,table_name,privilege_type,is_grantable
    FROM information_schema.role_table_grants WHERE table_schema IN ('tsa','tsa_private')
    ORDER BY grantor,grantee,table_schema,table_name,privilege_type`)).rows;
}

async function databaseSecurity(pool) {
  const queries = {
    roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig
      FROM pg_roles ORDER BY rolname`,
    memberships: `SELECT roleid,member,grantor,admin_option,inherit_option,set_option
      FROM pg_auth_members ORDER BY roleid,member,grantor`,
    schemas: `SELECT nspname,nspowner,nspacl::text FROM pg_namespace
      WHERE nspname IN ('tsa','tsa_private','tsa_meta') ORDER BY nspname`,
    relations: `SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('tsa','tsa_private','tsa_meta') AND c.relname<>'reading_experiment_profiles'
      ORDER BY n.nspname,c.relname`,
    policies: `SELECT n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles,
      pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('tsa','tsa_private','tsa_meta') ORDER BY n.nspname,c.relname,p.polname`,
  };
  const result = {};
  for (const [name, query] of Object.entries(queries)) result[name] = (await pool.query(query)).rows;
  return result;
}

test('populated025 to026 preserves existing attempts, rows and privileges; profile registry starts empty and migration replay is inert', { timeout: 60_000 }, async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tsa-reading-profile-upgrade-'));
  let fixture, workerPool;
  t.after(async () => {
    const errors = [];
    for (const close of [() => workerPool?.end(), () => fixture?.close(), () => rm(root, { recursive: true, force: true })]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Reading-profile upgrade cleanup failed');
  });
  const old = path.join(root, 'old');
  const target = path.join(root, 'target');
  await mkdir(old);
  await mkdir(target);

  const migrations = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
  for (const name of (await readdir(migrations)).filter((file) => /^\d{3}_.*\.sql$/.test(file) && file <= '026_reading_experiment_profile.sql').sort()) {
    await copyFile(path.join(migrations, name), path.join(target, name));
    if (name !== '026_reading_experiment_profile.sql') await copyFile(path.join(migrations, name), path.join(old, name));
  }

  fixture = await createAllocationFixture({ questionCount: 12, migrationDirectory: old });
  const rate = { capacity: 100, refillPerSecond: 10 };
  const attempts = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: rate,
    saveRate: { user: rate, attempt: rate },
  });
  const allocation = createAllocationService({ examPool: fixture.examPool, identityService: fixture.identityService });
  const body = { blueprintVersionId: fixture.blueprint.versionId };

  async function createAndStart(principal) {
    const creation = await allocation.create(principal, randomUUID(), body);
    const startKey = randomUUID();
    const started = await attempts.start(principal, creation.body.attemptId, startKey, {});
    return { principal, attemptId: creation.body.attemptId, creation, startKey, started };
  }

  async function submit(principal) {
    const attempt = await createAndStart(principal);
    for (const slot of (await attempts.read(principal, attempt.attemptId)).slots) {
      await attempts.save(principal, attempt.attemptId, slot.slotId, randomUUID(), {
        expectedRevision: 0,
        value: { type: 'SINGLE_CHOICE', optionId: 'b' },
      });
    }
    attempt.closure = await attempts.submit(principal, attempt.attemptId, randomUUID(), {});
    return attempt;
  }

  await fixture.pool.query('CREATE ROLE upgrade_reading_grader LOGIN');
  await fixture.pool.query('GRANT tsa_exam_worker TO upgrade_reading_grader');
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: 'upgrade_reading_grader' });
  const worker = createExamWorker({ workerPool, executorId: 'reading-upgrade', leaseSeconds: 30, retrySeconds: 1 });

  const graded = await submit(fixture.principals.studentB);
  assert.equal((await worker.runOnce()).status, 'GRADED');
  assert.equal((await attempts.read(graded.principal, graded.attemptId)).state, 'GRADED');
  const queued = await submit(fixture.principals.studentB);
  const active = await createAndStart(fixture.principals.studentA);
  assert.equal((await attempts.read(active.principal, active.attemptId)).state, 'IN_PROGRESS');
  assert.equal((await attempts.read(queued.principal, queued.attemptId)).state, 'SUBMITTED');

  const beforeRows = await snapshotRows(fixture.pool);
  const beforeFunctionSecurity = await functionSecurity(fixture.pool);
  const beforeGrants = await tableGrants(fixture.pool);
  const beforeDatabaseSecurity = await databaseSecurity(fixture.pool);
  assert.equal(beforeRows['tsa_private.reading_experiment_profiles'], undefined);

  assert.deepEqual((await migrate(fixture.pool, { directory: target })).applied, ['026_reading_experiment_profile.sql']);
  const afterRows = await snapshotRows(fixture.pool);
  assert.ok(afterRows['tsa_private.reading_experiment_profiles']);
  delete afterRows['tsa_private.reading_experiment_profiles'];
  assert.deepEqual(afterRows, beforeRows, 'existing application rows remain byte-equivalent JSON snapshots');
  assert.equal((await fixture.pool.query('SELECT count(*)::integer AS count FROM tsa_private.reading_experiment_profiles')).rows[0].count, 0);

  const afterFunctionSecurity = await functionSecurity(fixture.pool);
  const afterBySignature = new Map(afterFunctionSecurity.map((row) => [row.signature, row]));
  const beforeBySignature = new Map(beforeFunctionSecurity.map((row) => [row.signature, row]));
  for (const [signature, metadata] of beforeBySignature) {
    const after = afterBySignature.get(signature);
    if (signature === 'tsa.assembly_commit_personal(text,text,jsonb)') {
      assert.notEqual(after.definition, metadata.definition, 'the guarded allocation wrapper is the documented function change');
      assert.deepEqual({ ...after, definition: metadata.definition }, metadata, `${signature} owner/ACL/security settings preserved`);
    } else {
      assert.deepEqual(after, metadata, `${signature} definition and security metadata preserved`);
    }
  }
  assert.equal(afterFunctionSecurity.length, beforeFunctionSecurity.length + 5);
  assert.deepEqual((await tableGrants(fixture.pool)).filter((row) => row.table_name !== 'reading_experiment_profiles'), beforeGrants);
  const afterDatabaseSecurity = await databaseSecurity(fixture.pool);
  const existingRelations = new Set(beforeDatabaseSecurity.relations.map((row) => `${row.nspname}.${row.relname}`));
  afterDatabaseSecurity.relations = afterDatabaseSecurity.relations.filter((row) => existingRelations.has(`${row.nspname}.${row.relname}`));
  assert.deepEqual(afterDatabaseSecurity, beforeDatabaseSecurity, 'existing roles, memberships, schemas, relation ACL/RLS and policies are preserved');
  const profileGrants = await fixture.pool.query(`SELECT
    has_table_privilege('tsa_exam','tsa_private.reading_experiment_profiles','SELECT') AS exam,
    has_table_privilege('tsa_factory','tsa_private.reading_experiment_profiles','SELECT') AS factory,
    has_table_privilege('tsa_web','tsa_private.reading_experiment_profiles','SELECT') AS web`);
  assert.deepEqual(profileGrants.rows[0], { exam: false, factory: false, web: false });
  const profileAcl = await fixture.pool.query(`SELECT c.relowner,entry.grantee,entry.privilege_type
    FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) entry
    WHERE c.oid='tsa_private.reading_experiment_profiles'::regclass`);
  assert.ok(profileAcl.rows.length > 0);
  assert.ok(profileAcl.rows.every((entry) => Number(entry.grantee) === Number(entry.relowner)),
    'the private profile table ACL grants privileges only to its owner, not PUBLIC or application roles');

  const directory = createStudentDirectoryService({ examPool: fixture.examPool, identityService: fixture.identityService });
  assert.deepEqual((await directory.catalog(fixture.principals.studentA)).items.map((item) => item.blueprintVersionId), [fixture.blueprint.versionId],
    'default flag-off catalog retains only the pre-existing profile while the new registry is empty');
  assert.equal((await attempts.read(active.principal, active.attemptId)).state, 'IN_PROGRESS');
  assert.equal((await attempts.read(graded.principal, graded.attemptId)).state, 'GRADED');
  assert.equal((await attempts.read(queued.principal, queued.attemptId)).state, 'SUBMITTED');

  const beforeReplay = await snapshotRows(fixture.pool);
  assert.deepEqual((await migrate(fixture.pool, { directory: target })).applied, [], 'replaying the migration is inert');
  assert.deepEqual(await snapshotRows(fixture.pool), beforeReplay, 'empty profile table and existing rows remain unchanged on replay');
  assert.deepEqual((await worker.runOnce()).status, 'GRADED', 'queued pre-upgrade work remains processable');
  assert.equal((await attempts.read(queued.principal, queued.attemptId)).state, 'GRADED');
});
