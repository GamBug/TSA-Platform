import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';

const migration = '030_full_simulation.sql';
async function snapshot(pool) {
  const rows = {};
  const tables = (await pool.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY 1,2")).rows;
  for (const { table_schema: schema, table_name: table } of tables) {
    assert.match(schema, /^tsa(?:_private)?$/); assert.match(table, /^[a-z_]+$/);
    rows[`${schema}.${table}`] = jsonDigest((await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows FROM (SELECT to_jsonb(t) AS value FROM "${schema}"."${table}" t) s`)).rows[0].rows);
  }
  return { rows,
    relations: (await pool.query("SELECT n.nspname,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('tsa','tsa_private') ORDER BY 1,2")).rows,
    policies: (await pool.query("SELECT * FROM pg_policies WHERE schemaname IN('tsa','tsa_private') ORDER BY schemaname,tablename,policyname")).rows,
    functions: (await pool.query("SELECT p.oid::regprocedure::text AS signature,p.proowner,p.proacl::text,p.proconfig,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('tsa','tsa_private') ORDER BY p.oid")).rows,
  };
}
function assertPreserved(before, after) {
  for (const [name, hash] of Object.entries(before.rows)) assert.equal(after.rows[name], hash, name);
  for (const kind of ['relations','policies','functions']) {
    const key = kind === 'relations' ? row => `${row.nspname}.${row.relname}` : kind === 'policies' ? row => `${row.schemaname}.${row.tablename}.${row.policyname}` : row => row.signature;
    const map = new Map(after[kind].map(row => [key(row), row]));
    for (const row of before[kind]) assert.deepEqual(map.get(key(row)), row, key(row));
  }
}

test('simulation upgrade preserves populated 029 rows, security and saved clocks; rollback and replay are inert', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tsa-simulation-upgrade-')); let f;
  t.after(async () => { try { await f?.close(); } finally { await rm(root, { recursive: true, force: true }); } });
  const old = path.join(root,'old'), failed = path.join(root,'failed'), target = path.join(root,'target');
  const source = fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
  for (const directory of [old,failed,target]) await mkdir(directory);
  for (const name of await readdir(source)) if (/^\d{3}_.+\.sql$/.test(name) && name <= migration) {
    await copyFile(path.join(source,name),path.join(target,name));
    if (name !== migration) for (const directory of [old,failed]) await copyFile(path.join(source,name),path.join(directory,name));
  }
  f = await createAllocationFixture({ questionCount: 4, migrationDirectory: old });
  const rate = { capacity:100, refillPerSecond:10 }, principal = f.principals.studentA;
  const attempts = createAttemptService({ examPool:f.examPool,identityService:f.identityService,createRate:rate,saveRate:{user:rate,attempt:rate} });
  const key = randomUUID(), input = { blueprintVersionId:f.blueprint.versionId };
  const created = await attempts.create(principal,key,input), id=created.body.attemptId;
  await attempts.start(principal,id,randomUUID());
  const view = await attempts.read(principal,id);
  await attempts.save(principal,id,view.slots[0].slotId,randomUUID(),{expectedRevision:0,value:{type:'SINGLE_CHOICE',optionId:'a'}});
  const before = await snapshot(f.pool), saved = await attempts.read(principal,id);
  const sql = await readFile(path.join(source,migration),'utf8');
  await writeFile(path.join(failed,migration),sql+'\nSELECT 1/0;\n');
  const connectionConfig = f.harness.database.connectionConfig;
  await backupLocalDatabase({connectionConfig,directory:path.join(root,'before-rollback')});
  await assert.rejects(migrate(f.pool,{directory:failed}),/division by zero/);
  assert.deepEqual(await snapshot(f.pool),before);
  await backupLocalDatabase({connectionConfig,directory:path.join(root,'before-upgrade')});
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,[migration]);
  const after=await snapshot(f.pool); assertPreserved(before,after);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa_private.simulation_section_clocks')).rows[0].n,0);
  const resumed=await attempts.read(principal,id);
  for (const field of ['startedAt','deadlineAt','answers','slots']) assert.deepEqual(resumed[field],saved[field]);
  assert.equal((await attempts.create(principal,key,input)).body.attemptId,id);
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,[]);
  assert.deepEqual(await snapshot(f.pool),after);
  for (const role of ['tsa_exam','tsa_bank','tsa_exam_worker','tsa_web','tsa_identity','tsa_factory']) {
    const access=(await f.pool.query("SELECT has_table_privilege($1,'tsa_private.simulation_section_clocks','SELECT,INSERT,UPDATE,DELETE') AS raw, has_function_privilege($1,'tsa.exam_simulation_catalog(integer,uuid)','EXECUTE') AS catalog",[role])).rows[0];
    assert.deepEqual(access,{raw:false,catalog:role==='tsa_exam'},role);
  }
});
