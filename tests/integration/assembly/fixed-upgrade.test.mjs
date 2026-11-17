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

test('populated023 to024 is additive and preserves sealed forms, personal receipts, rows and existing privileges', {timeout:30000}, async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'tsa-fixed-student-upgrade-'));
 const old=path.join(directory,'old'),target=path.join(directory,'target');let f;
 try{
  await mkdir(old);await mkdir(target);
  const migrations=fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
  for(const name of await readdir(migrations))if(/^\d{3}_.*\.sql$/.test(name)&&name<='024_fixed_student_practice.sql'){
   await copyFile(path.join(migrations,name),path.join(target,name));
   if(name!=='024_fixed_student_practice.sql')await copyFile(path.join(migrations,name),path.join(old,name));
  }
  f=await createAllocationFixture({questionCount:4,migrationDirectory:old});
  const api=createAllocationService({examPool:f.examPool,identityService:f.identityService});
  const key=randomUUID(),body={blueprintVersionId:f.blueprint.versionId};
  const created=await api.create(f.principals.studentA,key,body);
  const sealer=await createFixedFormSealingService({bankPool:f.bankPool,identityService:f.identityService,enableCreation:true});
  const seal=(await sealer.create(f.principals.examManager,{mode:'PUBLISHED_FIXED',blueprintVersionId:f.blueprint.versionId,blueprintHash:f.blueprint.contentHash,windowMinutes:60},randomUUID())).body;
  const before=await snapshot(f.pool),beforeFunctions=await functions(f.pool);
  const grants=async()=>(await f.pool.query("SELECT * FROM information_schema.role_table_grants WHERE table_schema IN('tsa','tsa_private') ORDER BY grantor,grantee,table_schema,table_name,privilege_type")).rows;
  const beforeGrants=await grants();
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,['024_fixed_student_practice.sql']);
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,[]);
  assert.deepEqual(await snapshot(f.pool),before);assert.deepEqual(await grants(),beforeGrants);
  const afterFunctions=await functions(f.pool);
  for(const [id,metadata] of Object.entries(beforeFunctions))assert.deepEqual(afterFunctions[id],metadata,id);
  assert.equal(Object.keys(afterFunctions).length,Object.keys(beforeFunctions).length+3);
  assert.deepEqual(await api.create(f.principals.studentA,key,body),{...created,replayed:true});
  const directoryApi=createStudentDirectoryService({examPool:f.examPool,identityService:f.identityService,enableFixedPractice:true});
  assert.equal((await directoryApi.catalog(f.principals.studentB)).items.find(row=>row.mode==='PUBLISHED_FIXED').formId,seal.formId);
  assert.deepEqual(await snapshot(f.pool),before,'replay and safe catalog do not mutate populated state');
 }finally{
  const errors=[];for(const close of [()=>f?.close(),()=>rm(directory,{recursive:true,force:true})])try{await close();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Fixed-student upgrade cleanup failed');
 }
});
