import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createHttpBoundaryHandler } from '../../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createAllocationFixture } from './fixtures.mjs';

const migrations = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
const latest = '018_bundle_allocation.sql';
const rate = { capacity: 100, refillPerSecond: 10 };
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';

async function rows(pool) {
  const tables = (await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_type='BASE TABLE' AND table_schema IN('tsa','tsa_private','tsa_meta')
      AND NOT (table_schema='tsa_meta' AND table_name='schema_migrations') ORDER BY table_schema,table_name`)).rows;
  const result = {};
  for (const { table_schema: schema, table_name: table } of tables) {
    result[`${schema}.${table}`] = (await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS value
      FROM (SELECT to_jsonb(t) AS value FROM ${quote(schema)}.${quote(table)} t) data`)).rows[0].value;
  }
  return result;
}
async function security(pool) {
  const queries = {
    roles: `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_roles ORDER BY rolname`,
    memberships: `SELECT roleid,member,grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY roleid,member,grantor`,
    schemas: `SELECT nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname IN('tsa','tsa_private','tsa_meta') ORDER BY nspname`,
    relations: `SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('tsa','tsa_private','tsa_meta') ORDER BY n.nspname,c.relname`,
    policies: `SELECT n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles,
      pg_get_expr(p.polqual,p.polrelid) AS using_expr,pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN('tsa','tsa_private','tsa_meta') ORDER BY n.nspname,c.relname,p.polname`,
    functions: `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.proowner,p.proacl::text,p.prosecdef,p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('tsa','tsa_private','tsa_meta')
      AND p.proname<>'guard_bundle_allocation_revision' ORDER BY n.nspname,p.proname,args`,
  };
  const result = {};
  for (const [name, query] of Object.entries(queries)) result[name] = (await pool.query(query)).rows;
  return result;
}
async function released(service, principal, attemptId) {
  return service.withReadBoundary(principal, (ports) => createHttpBoundaryHandler({ authenticate: async () => principal, ...ports })(
    new Request(`http://127.0.0.1/api/v1/attempts/${attemptId}/result`)));
}
// Only pre018 fixture preparation: reproduce the two adapter projections in
// commit8db27a1 (candidate-stock and snapshot-builder). Every SQL call, including
// authorization, eligibility and final sealing, still executes against real017.
function pre018Pool(pool) {
  return { async connect() {
    const client = await pool.connect();
    return new Proxy(client, { get(target, name) {
      if (name === 'query') return async (sql, values) => {
        const result = await target.query(sql, values);
        if (sql === 'SELECT tsa.assembly_standalone_stock($1) AS stock' && result.rows[0].stock) {
          const stock = result.rows[0].stock;
          assert.equal(stock.units, undefined);
          stock.units = stock.candidates.map((member) => ({ id: member.versionId, sectionId: stock.blueprint.sections[0].id, members: [member] }));
        }
        if (sql === 'SELECT tsa.assembly_snapshot_inputs($1::uuid[]) AS inputs') {
          for (const input of result.rows[0].inputs) { assert.equal(input.stimulus, undefined); input.stimulus = null; }
        }
        return result;
      };
      const value = Reflect.get(target, name, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}

test('populated017 to018 preserves active, queued and graded exams and security; failed DDL rolls back before successful upgrade', { timeout: 30_000 }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-populated-upgrade-'));
  let f, workerPool;
  t.after(async () => {
    const errors = [];
    for (const close of [() => workerPool?.end(), () => f?.close(), () => rm(root, { recursive: true, force: true })]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Populated upgrade fixture cleanup failed');
  });
  const old = path.join(root, 'old'), bad = path.join(root, 'bad');
  await mkdir(old); await mkdir(bad);
  const files = (await readdir(migrations)).sort();
  assert.equal(files.at(-1), latest, 'extend this pinned rehearsal explicitly when another migration is introduced');
  for (const file of files) {
    await copyFile(path.join(migrations, file), path.join(bad, file));
    if (file !== latest) await copyFile(path.join(migrations, file), path.join(old, file));
  }
  await writeFile(path.join(bad, latest), (await readFile(path.join(migrations, latest), 'utf8')) + '\nSELECT * FROM tsa.no_such_upgrade_relation;\n');
  f = await createAllocationFixture({ migrationDirectory: old, questionCount: 12, blueprintCount: 4 });
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_meta.schema_migrations')).rows[0].n, 17);
  assert.equal((await f.pool.query("SELECT to_regprocedure('tsa.guard_bundle_allocation_revision()') AS fn")).rows[0].fn, null);
  const serviceOptions = { identityService: f.identityService, createRate: rate, saveRate: { user: rate, attempt: rate } };
  let service = createAttemptService({ ...serviceOptions, examPool: pre018Pool(f.examPool) });
  await f.pool.query('CREATE ROLE upgrade_worker LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO upgrade_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'upgrade_worker' });
  const worker = createExamWorker({ workerPool, executorId: 'populated-upgrade', leaseSeconds: 30, retrySeconds: 1 });
  async function attempt(principal, submit) {
    const createKey = randomUUID(), startKey = randomUUID(), submitKey = randomUUID();
    const creation = await service.create(principal, createKey, { blueprintVersionId: f.blueprint.versionId });
    const id = creation.body.attemptId;
    const start = await service.start(principal, id, startKey);
    const view = await service.read(principal, id);
    for (const slot of view.slots) await service.save(principal, id, slot.slotId, randomUUID(), { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'b' } });
    const closure = submit ? await service.submit(principal, id, submitKey) : null;
    return { principal, id, createKey, startKey, submitKey, creation, start, closure };
  }
  const graded = await attempt(f.principals.studentA, true);
  assert.equal((await worker.runOnce()).status, 'GRADED');
  assert.equal((await service.read(graded.principal, graded.id)).state, 'GRADED');
  const priorReview = await released(service, graded.principal, graded.id); assert.equal(priorReview.status, 200);
  const review = await priorReview.json();
  const queued = await attempt(f.principals.studentA, true);
  const active = await attempt(f.principals.studentB, false);
  const before = await rows(f.pool), privileges = await security(f.pool);
  const ledger = (await f.pool.query('SELECT * FROM tsa_meta.schema_migrations ORDER BY version')).rows;
  const functions = async () => (await f.pool.query(`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='tsa' AND p.proname IN('assembly_standalone_stock','assembly_snapshot_inputs','assembly_commit_personal') ORDER BY p.proname`)).rows;
  const originalFunctions = await functions();
  await assert.rejects(migrate(f.pool, { directory: bad }), (error) => error.code === '42P01');
  assert.deepEqual(await rows(f.pool), before);
  assert.deepEqual(await security(f.pool), privileges);
  assert.deepEqual(await functions(), originalFunctions, 'failed migration restores replaced function definitions too');
  assert.deepEqual((await f.pool.query('SELECT * FROM tsa_meta.schema_migrations ORDER BY version')).rows, ledger);
  assert.equal((await f.pool.query("SELECT to_regprocedure('tsa.guard_bundle_allocation_revision()') AS fn")).rows[0].fn, null);
  assert.deepEqual((await migrate(f.pool)).applied, [latest]);
  assert.deepEqual(await rows(f.pool), before, 'all application rows except the migration ledger survive byte-equivalent JSON projection');
  assert.deepEqual(await security(f.pool), privileges, 'existing owners, ACLs, RLS, roles and function security metadata survive');
  assert.notDeepEqual(await functions(), originalFunctions, 'the actual018 replacement functions were installed');
  assert.deepEqual((await f.pool.query('SELECT * FROM tsa_meta.schema_migrations WHERE version<>$1 ORDER BY version', [latest])).rows, ledger);
  const guard = (await f.pool.query("SELECT has_function_privilege('tsa_exam','tsa.guard_bundle_allocation_revision()','EXECUTE') AS exam,has_function_privilege('tsa_factory','tsa.guard_bundle_allocation_revision()','EXECUTE') AS factory")).rows[0];
  assert.deepEqual(guard, { exam: false, factory: false });
  assert.deepEqual((await migrate(f.pool)).applied, [], 'exact migration replay makes no changes');
  service = createAttemptService({ ...serviceOptions, examPool: f.examPool });
  for (const item of [graded, queued, active]) {
    const replays = [
      [await service.create(item.principal, item.createKey, { blueprintVersionId: f.blueprint.versionId }), item.creation],
      [await service.start(item.principal, item.id, item.startKey), item.start],
    ];
    if (item.closure) replays.push([await service.submit(item.principal, item.id, item.submitKey), item.closure]);
    for (const [replayed, original] of replays) {
      assert.equal(replayed.status, original.status); assert.deepEqual(replayed.body, original.body);
      assert.equal(replayed.replayed, true);
    }
  }
  assert.equal((await service.read(graded.principal, graded.id)).state, 'GRADED');
  const currentReview = await released(service, graded.principal, graded.id); assert.equal(currentReview.status, 200);
  assert.deepEqual(await currentReview.json(), review);
  assert.equal((await service.read(active.principal, active.id)).state, 'IN_PROGRESS');
  assert.equal((await worker.runOnce()).status, 'GRADED', 'pre-upgrade queued work still grades');
  const queuedReview = await released(service, queued.principal, queued.id); assert.equal(queuedReview.status, 200);
  assert.equal((await queuedReview.json()).percentage, '100.00');
  const assigned = (await f.pool.query('SELECT question_id FROM tsa.student_question_history WHERE user_id=$1', [graded.principal.userId])).rows.map((row) => row.question_id);
  assert.equal(assigned.length, 8);
  const next = await service.create(graded.principal, randomUUID(), { blueprintVersionId: f.blueprint.versionId });
  assert.equal(next.status, 201);
  const fresh = (await f.pool.query('SELECT question_id FROM tsa.student_question_history WHERE first_attempt_id=$1', [next.body.attemptId])).rows.map((row) => row.question_id);
  assert.equal(fresh.length, 4); assert.ok(fresh.every((id) => !assigned.includes(id)), 'post-upgrade NEW_ONLY excludes all old assignments');
  assert.deepEqual(await worker.claim(), { status: 'IDLE' });
});
