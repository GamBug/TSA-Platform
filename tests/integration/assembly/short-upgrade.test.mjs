import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {copyFile,mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createAllocationFixture} from './fixtures.mjs';
import {createAllocationService} from '../../../src/modules/assembly/allocation.mjs';
import {createFixedFormSealingService} from '../../../src/modules/bank/fixed-form-sealing.mjs';
import {createStudentDirectoryService} from '../../../src/modules/attempts/directory.mjs';
import {createAttemptService} from '../../../src/modules/attempts/service.mjs';
import {createExamWorker} from '../../../src/modules/jobs/exam-worker.mjs';
import {createDatabasePool} from '../../../src/modules/database/pool.mjs';
import {migrate} from '../../../src/modules/database/migrate.mjs';
import {jsonDigest} from '../../../src/modules/bank/common.mjs';

async function snapshot(pool){
 const tables=(await pool.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name")).rows;
 const value={};
 for(const t of tables){
  const rows=(await pool.query(`SELECT COALESCE(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) AS rows FROM (SELECT to_jsonb(t) AS x FROM "${t.table_schema}"."${t.table_name}" t) s`)).rows[0].rows;
  value[`${t.table_schema}.${t.table_name}`]=jsonDigest(rows);
 }
 return value;
}
async function functions(pool){return Object.fromEntries((await pool.query(`SELECT p.oid::regprocedure::text AS signature,
 pg_get_functiondef(p.oid) AS definition,p.proowner::text AS owner,p.proacl::text AS acl,p.proconfig
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('tsa','tsa_private') ORDER BY p.oid`)).rows.map(({signature,...data})=>[signature,data]));}

test('populated024 to025 preserves active and graded attempts, seals, receipts and old privileges while adding only personal short scope', {timeout:30000}, async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'tsa-short-practice-upgrade-'));
 const old=path.join(directory,'old'),target=path.join(directory,'target');let f,workerPool;
 try{
  await mkdir(old);await mkdir(target);
  const migrations=fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
  for(const name of await readdir(migrations))if(/^\d{3}_.*\.sql$/.test(name)&&name<='025_short_personal_practice.sql'){
   await copyFile(path.join(migrations,name),path.join(target,name));
   if(name!=='025_short_personal_practice.sql')await copyFile(path.join(migrations,name),path.join(old,name));
  }
  f=await createAllocationFixture({questionCount:8,migrationDirectory:old});
  const api=createAllocationService({examPool:f.examPool,identityService:f.identityService});
  const key=randomUUID(),body={blueprintVersionId:f.blueprint.versionId};
  const created=await api.create(f.principals.studentA,key,body);
  const sealer=await createFixedFormSealingService({bankPool:f.bankPool,identityService:f.identityService,enableCreation:true});
  const seal=(await sealer.create(f.principals.examManager,{mode:'PUBLISHED_FIXED',blueprintVersionId:f.blueprint.versionId,blueprintHash:f.blueprint.contentHash,windowMinutes:60},randomUUID())).body;
  const attempts=createAttemptService({examPool:f.examPool,identityService:f.identityService,createRate:{capacity:100,refillPerSecond:10},saveRate:{user:{capacity:100,refillPerSecond:10},attempt:{capacity:100,refillPerSecond:10}}});
  const graded=(await attempts.create(f.principals.studentB,randomUUID(),body)).body;
  await attempts.start(f.principals.studentB,graded.attemptId,randomUUID(),{});
  for(const slot of (await attempts.read(f.principals.studentB,graded.attemptId)).slots)
   await attempts.save(f.principals.studentB,graded.attemptId,slot.slotId,randomUUID(),{expectedRevision:0,value:{type:'SINGLE_CHOICE',optionId:'b'}});
  await attempts.submit(f.principals.studentB,graded.attemptId,randomUUID(),{});
  await f.pool.query('CREATE ROLE upgrade_short_grader LOGIN');await f.pool.query('GRANT tsa_exam_worker TO upgrade_short_grader');
  workerPool=createDatabasePool({...f.harness.database.connectionConfig,user:'upgrade_short_grader'});
  assert.equal((await createExamWorker({workerPool,executorId:'short-upgrade',leaseSeconds:30,retrySeconds:1}).runOnce()).status,'GRADED');
  assert.equal((await attempts.read(f.principals.studentB,graded.attemptId)).state,'GRADED');
  const before=await snapshot(f.pool),beforeFunctions=await functions(f.pool);
  const grants=async()=>(await f.pool.query("SELECT * FROM information_schema.role_table_grants WHERE table_schema IN('tsa','tsa_private') ORDER BY grantor,grantee,table_schema,table_name,privilege_type")).rows;
  const beforeGrants=await grants();
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,['025_short_personal_practice.sql']);
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,[]);
  const afterRows=await snapshot(f.pool);assert.ok(afterRows['tsa_private.short_practice_profiles']);delete afterRows['tsa_private.short_practice_profiles'];
  assert.deepEqual(afterRows,before);assert.deepEqual((await grants()).filter(row=>row.table_name!=='short_practice_profiles'),beforeGrants);
  const afterFunctions=await functions(f.pool);
  for(const [id,metadata] of Object.entries(beforeFunctions)){
   const after=afterFunctions[id];
   if(id==='tsa.assembly_commit_personal(text,text,jsonb)'){
    assert.notEqual(after.definition,metadata.definition);assert.deepEqual({...after,definition:metadata.definition},metadata,id);
   }else assert.deepEqual(after,metadata,id);
  }
  assert.equal(Object.keys(afterFunctions).length,Object.keys(beforeFunctions).length+4);
  assert.deepEqual(await api.create(f.principals.studentA,key,body),{...created,replayed:true});
  const directoryApi=createStudentDirectoryService({examPool:f.examPool,identityService:f.identityService,enableFixedPractice:true});
  assert.equal((await directoryApi.catalog(f.principals.studentB)).items.find(row=>row.mode==='PUBLISHED_FIXED').formId,seal.formId);
  const observed=await snapshot(f.pool);delete observed['tsa_private.short_practice_profiles'];assert.deepEqual(observed,before,'replay and reads do not mutate populated state');
 }finally{
  const errors=[];for(const close of [()=>workerPool?.end(),()=>f?.close(),()=>rm(directory,{recursive:true,force:true})])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Short-practice upgrade cleanup failed');
 }
});
