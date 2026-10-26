import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {copyFile,mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createAllocationFixture} from './fixtures.mjs';
import {createAllocationService} from '../../../src/modules/assembly/allocation.mjs';
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

test('populated021 to022 retains sealed NEW_ONLY rows, receipts and privileges while enabling only explicit review', {timeout:30000}, async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'tsa-review-practice-upgrade-'));
 const old=path.join(directory,'old'),target=path.join(directory,'target');let f;
 try{
  await mkdir(old);await mkdir(target);
  const migrations=fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
  for(const name of await readdir(migrations))if(/^\d{3}_.*\.sql$/.test(name)&&name<='022_explicit_review_practice.sql'){
   await copyFile(path.join(migrations,name),path.join(target,name));
   if(name!=='022_explicit_review_practice.sql')await copyFile(path.join(migrations,name),path.join(old,name));
  }
  f=await createAllocationFixture({questionCount:4,migrationDirectory:old});
  const api=createAllocationService({examPool:f.examPool,identityService:f.identityService});
  const key=randomUUID(),body={blueprintVersionId:f.blueprint.versionId};
  const created=await api.create(f.principals.studentA,key,body);assert.equal(created.status,201);
  const before=await snapshot(f.pool),beforeFunctions=await functions(f.pool);
  const grants=async()=>(await f.pool.query("SELECT * FROM information_schema.role_table_grants WHERE table_schema IN('tsa','tsa_private') ORDER BY grantor,grantee,table_schema,table_name,privilege_type")).rows;
  const beforeGrants=await grants();
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,['022_explicit_review_practice.sql']);
  assert.deepEqual((await migrate(f.pool,{directory:target})).applied,[]);
  assert.deepEqual(await snapshot(f.pool),before);assert.deepEqual(await grants(),beforeGrants);
  const afterFunctions=await functions(f.pool),signature='tsa.assembly_commit_personal(text,text,jsonb)';
  assert.deepEqual(Object.keys(afterFunctions),Object.keys(beforeFunctions));
  assert.notEqual(afterFunctions[signature].definition,beforeFunctions[signature].definition);
  for(const [id,metadata] of Object.entries(beforeFunctions)){
   const after=afterFunctions[id];
   assert.deepEqual(id===signature?{...after,definition:metadata.definition}:after,metadata,id);
  }
  const enabled=createAllocationService({examPool:f.examPool,identityService:f.identityService,enableReviewPractice:true});
  assert.deepEqual(await enabled.create(f.principals.studentA,key,body),{...created,replayed:true});
  assert.deepEqual(await snapshot(f.pool),before);
  const history=(await f.pool.query('SELECT to_jsonb(h) AS value FROM tsa.student_question_history h WHERE user_id=$1 ORDER BY question_id',[f.principals.studentA.userId])).rows;
  // Controlled fixture closure retains the original sealed form and history.
  await f.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1",[created.body.attemptId]);
  const sealed=(await f.pool.query('SELECT to_jsonb(s) AS value FROM tsa.form_slots s WHERE form_id=$1 ORDER BY ordinal',[created.body.formId])).rows;
  const review=await enabled.create(f.principals.studentA,randomUUID(),{mode:'PERSONALIZED_PRACTICE',blueprintVersionId:f.blueprint.versionId,reuseMode:'REVIEW_ALLOWED',acknowledgeRepeats:true});
  assert.equal(review.body.reuseMode,'REVIEW_ALLOWED');assert.notEqual(review.body.formId,created.body.formId);
  assert.deepEqual((await f.pool.query('SELECT to_jsonb(h) AS value FROM tsa.student_question_history h WHERE user_id=$1 ORDER BY question_id',[f.principals.studentA.userId])).rows,history);
  assert.deepEqual((await f.pool.query('SELECT to_jsonb(s) AS value FROM tsa.form_slots s WHERE form_id=$1 ORDER BY ordinal',[created.body.formId])).rows,sealed);
 }finally{
  const errors=[];for(const close of [()=>f?.close(),()=>rm(directory,{recursive:true,force:true})]){try{await close();}catch(error){errors.push(error);}}
  if(errors.length)throw new AggregateError(errors,'Review-practice upgrade cleanup failed');
 }
});
