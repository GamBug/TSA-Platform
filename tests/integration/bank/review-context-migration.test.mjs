import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createBankHarness, bankRequest, loginActor } from './harness.mjs';
import { ensureLocalTaxonomy, createPrivateTemplate } from '../../../src/local/seed.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';

const migrations=fileURLToPath(new URL('../../../db/migrations/',import.meta.url));
async function post(h,browser,url,body){
  const response=await bankRequest(h,browser,url,{method:'POST',key:randomUUID(),body});
  assert.equal(response.status,201);
  return response.json();
}
async function snapshot(pool){
  const tables=(await pool.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name")).rows;
  const result={};
  for(const row of tables){
    assert.match(row.table_name,/^[a-z_]+$/);
    const data=(await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows FROM (SELECT to_jsonb(t) AS value FROM "${row.table_schema}"."${row.table_name}" t) s`)).rows[0].rows;
    result[`${row.table_schema}.${row.table_name}`]={count:data.length,hash:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
  }
  return result;
}

test('B1 migration018 to019 preserves populated immutable drafts and all application rows while adding only the narrow predicate', {timeout:30000}, async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'tsa-review-upgrade-'));
  let h;
  try{
    const target=path.join(directory,'target'),old=path.join(directory,'old');await mkdir(target);await mkdir(old);
    // Keep this historical018→019 boundary independent of later migrations.
    for(const file of await readdir(migrations)){
      if(/^\d{3}_.*\.sql$/.test(file)&&file<='019_staff_review_context.sql'){
        await copyFile(path.join(migrations,file),path.join(target,file));
        if(file!=='019_staff_review_context.sql')await copyFile(path.join(migrations,file),path.join(old,file));
      }
    }
    h=await createBankHarness({migrationDirectory:old});
    const pool=h.database.pool;
    await ensureLocalTaxonomy(pool);
    const author=await loginActor(h,'author');
    const source=await post(h,author,'/api/v1/sources',{title:'Original isolated pre019 source',canonicalUri:null,origin:'EXTERNAL'});
    const sourceVersion=await post(h,author,`/api/v1/sources/${source.sourceId}/versions`,{contentHash:'sha256:'+'a'.repeat(64),metadata:{synthetic:'true'},evidenceUri:'manual://isolated-upgrade'});
    const manager=await loginActor(h,'bankManager');
    const decision=await post(h,manager,`/api/v1/source-versions/${sourceVersion.sourceVersionId}/rights`,{status:'UNKNOWN',allowedUses:['DISPLAY'],territory:['VN'],validFrom:'2000-01-01T00:00:00Z',validTo:null,evidence:'Synthetic unknown rights; no publication permission.',expectedRevision:0});
    const {sourceVersionId:_source,...context}=createPrivateTemplate({...sourceVersion,decisionId:decision.decisionId});
    const draft=await post(h,author,'/api/v1/questions',{...context,schemaVersion:'question/1',language:'vi-VN',section:'MATH',subskillIds:[],cognitiveLevel:null,targetDifficulty:'EASY',origin:'MANUAL',stimulusVersionId:null,
      content:[{type:'text',text:'Câu hỏi tổng hợp trước nâng cấp'}],interaction:{type:'SINGLE_CHOICE',options:[{id:'a',content:[{type:'text',text:'Một'}]},{id:'b',content:[{type:'text',text:'Hai'}]}]},answerKey:{type:'SINGLE_CHOICE',optionId:'b'},explanation:[{type:'text',text:'Lời giải tổng hợp riêng'}]});
    const principal=await h.identity.authenticate(new Request(h.origin,{headers:{cookie:author.cookies.join('; ')}}));
    const before=await snapshot(pool);
    assert.equal((await pool.query("SELECT to_regprocedure('tsa.bank_local_version_authored_by(uuid,uuid)') AS f")).rows[0].f,null);
    const result=await migrate(pool,{directory:target});
    assert.deepEqual(result.applied,['019_staff_review_context.sql']);
    assert.deepEqual(await snapshot(pool),before);
    const repeated=await migrate(pool,{directory:target});assert.deepEqual(repeated.applied,[]);
    await withTransaction(h.bankPool,async(client)=>{
      assert.equal((await client.query('SELECT tsa.bank_local_version_authored_by($1,$2) AS allowed',[draft.versionId,principal.userId])).rows[0].allowed,true);
      assert.equal((await client.query('SELECT tsa.bank_local_version_authored_by($1,$2) AS allowed',[draft.versionId,randomUUID()])).rows[0].allowed,false);
    },{role:'tsa_bank'});
    await assert.rejects(withTransaction(h.bankPool,(client)=>client.query('SELECT * FROM tsa.audit_events LIMIT 0'),{role:'tsa_bank'}),{code:'42501'});
    const owner=(await pool.query('SELECT current_user AS name')).rows[0].name;
    const metadata=(await pool.query("SELECT pg_get_userbyid(proowner) AS owner,prosecdef,provolatile,proconfig,EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute FROM pg_proc p WHERE p.oid='tsa.bank_local_version_authored_by(uuid,uuid)'::regprocedure")).rows[0];
    assert.deepEqual(metadata,{owner,prosecdef:true,provolatile:'s',proconfig:['search_path=pg_catalog, tsa'],public_execute:false});
    assert.deepEqual(await snapshot(pool),before);
  }finally{
    const errors=[];
    for(const stop of [()=>h?.close(),()=>rm(directory,{recursive:true,force:true})]){try{await stop();}catch(error){errors.push(error);}}
    if(errors.length)throw new AggregateError(errors,'Migration inspection cleanup failed');
  }
});

test('B7 migration019 to020 preserves existing rows and grants only the audited fixed snapshot function', {timeout:30000}, async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'tsa-fixed-upgrade-')),old=path.join(root,'old'),target=path.join(root,'target');
  let h;
  try{
    await mkdir(old);await mkdir(target);
    for(const file of await readdir(migrations))if(/^\d{3}_.*\.sql$/.test(file)&&file<='020_fixed_reference_diagnostics.sql'){
      await copyFile(path.join(migrations,file),path.join(target,file));
      if(file!=='020_fixed_reference_diagnostics.sql')await copyFile(path.join(migrations,file),path.join(old,file));
    }
    h=await createBankHarness({migrationDirectory:old});const pool=h.database.pool;
    const manager=await loginActor(h,'bankManager');
    const actor=await h.identity.authenticate(new Request(h.origin,{headers:{cookie:manager.cookies.join('; ')}}));
    const before=await snapshot(pool);
    assert.equal((await pool.query("SELECT to_regprocedure('tsa.bank_fixed_reference_snapshot(uuid,uuid)') AS f")).rows[0].f,null);
    assert.deepEqual((await migrate(pool,{directory:target})).applied,['020_fixed_reference_diagnostics.sql']);
    assert.deepEqual(await snapshot(pool),before);
    assert.deepEqual((await migrate(pool,{directory:target})).applied,[]);
    const metadata=(await pool.query(`SELECT prosecdef,provolatile,proconfig,
      EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute,
      has_function_privilege('tsa_bank',p.oid,'EXECUTE') AS bank_execute,
      has_function_privilege('tsa_exam',p.oid,'EXECUTE') AS exam_execute,
      has_function_privilege('tsa_factory',p.oid,'EXECUTE') AS factory_execute,
      has_function_privilege('tsa_web',p.oid,'EXECUTE') AS web_execute,
      has_table_privilege('tsa_bank','tsa.assembly_runs','SELECT') AS table_select
      FROM pg_proc p WHERE p.oid='tsa.bank_fixed_reference_snapshot(uuid,uuid)'::regprocedure`)).rows[0];
    assert.deepEqual(metadata,{prosecdef:true,provolatile:'v',proconfig:['search_path=pg_catalog, tsa'],public_execute:false,bank_execute:true,exam_execute:false,factory_execute:false,web_execute:false,table_select:false});
    await withTransaction(h.bankPool,async client=>{
      const value=(await client.query('SELECT tsa.bank_fixed_reference_snapshot($1,NULL) AS s',[actor.userId])).rows[0].s;
      assert.deepEqual(value.runs,[]);assert.equal(value.truncated,false);
    },{role:'tsa_bank'});
    const after=await snapshot(pool);assert.equal(after['tsa.audit_events'].count,before['tsa.audit_events'].count+1);
    delete before['tsa.audit_events'];delete after['tsa.audit_events'];assert.deepEqual(after,before);
  }finally{
    const errors=[];for(const stop of [()=>h?.close(),()=>rm(root,{recursive:true,force:true})]){try{await stop();}catch(error){errors.push(error);}}
    if(errors.length)throw new AggregateError(errors,'Fixed snapshot migration cleanup failed');
  }
});
