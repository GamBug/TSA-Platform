import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,test} from 'node:test';
import {createReviewBrowserFixture} from './review-browser-fixture.mjs';
import {bankRequest,loginActor} from './harness.mjs';
import {createFixedStockRehearsalService} from '../../../src/modules/bank/fixed-stock-rehearsals.mjs';
import {createBankHandler} from '../../../src/http/bank.mjs';
import {withTransaction} from '../../../src/modules/database/pool.mjs';
import {jsonDigest} from '../../../src/modules/bank/common.mjs';
let f,exam,manager,student,author,service,pool,request,first;
const base='/api/v1/fixed-rehearsals';
async function result(response,status=200){assert.equal(response.status,status);const value=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);if(value.error)assert.equal(value.error.requestId,response.headers.get('x-request-id'));return value;}
async function snapshot(){
 const tables=(await pool.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name")).rows;
 const value={};for(const t of tables){const rows=(await pool.query(`SELECT COALESCE(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) AS rows FROM (SELECT to_jsonb(t) AS x FROM "${t.table_schema}"."${t.table_name}" t) s`)).rows[0].rows;value[`${t.table_schema}.${t.table_name}`]={count:rows.length,hash:jsonDigest(rows)};}return value;
}
function unchangedExcept(before,after,names){for(const name of names){delete before[name];delete after[name];}assert.deepEqual(after,before);}
before(async()=>{f=await createReviewBrowserFixture({includeEligibleFixedStock:true});pool=f.fixture.pool;exam=await loginActor(f,'examManager');manager=await loginActor(f,'bankManager');student=await loginActor(f,'studentA');author=await loginActor(f,'author');service=await createFixedStockRehearsalService({bankPool:f.fixture.bankPool,identityService:f.identity});request={blueprintVersionId:f.fixture.blueprint.versionId,blueprintHash:f.fixture.blueprint.contentHash,windowMinutes:60};});
after(async()=>{await f?.close();});
test('B8 actual eligible stock capture commits only immutable rehearsal/audit/receipt, replays exact intent and preserves personal/reference rows',async()=>{
 assert.deepEqual((await result(await bankRequest(f,manager,base))).items,[]);
 const blueprints=await result(await bankRequest(f,exam,'/api/v1/fixed-rehearsal-blueprints'));assert.equal(blueprints.items[0].blueprintVersionId,request.blueprintVersionId);assert.equal(blueprints.items[0].questionCount,4);
 const before=await snapshot(),key=randomUUID();first=await result(await bankRequest(f,exam,base,{method:'POST',body:request,key}),201);
 assert.equal(first.outcome,'SUCCESS');assert.equal(first.createsForm,false);assert.equal(first.currentEligibility,'NOT_REVALIDATED');assert.deepEqual(first.sectionDeficits,[]);
 assert.equal(Date.parse(first.availableUntil)-Date.parse(first.capturedAt),3600000);assert.equal(Date.parse(first.requiredThrough)-Date.parse(first.availableUntil),1200000);
 let after=await snapshot();assert.equal(after['tsa_private.fixed_stock_rehearsals'].count,before['tsa_private.fixed_stock_rehearsals'].count+1);assert.equal(after['tsa.audit_events'].count,before['tsa.audit_events'].count+1);assert.equal(after['tsa.idempotency_records'].count,before['tsa.idempotency_records'].count+1);unchangedExcept(before,after,['tsa_private.fixed_stock_rehearsals','tsa.audit_events','tsa.idempotency_records']);
 const saved=await snapshot();assert.deepEqual(await result(await bankRequest(f,exam,base,{method:'POST',body:request,key}),201),first);assert.deepEqual(await snapshot(),saved);
 await result(await bankRequest(f,exam,base,{method:'POST',body:{...request,windowMinutes:61},key}),409);assert.deepEqual(await snapshot(),saved);
 await assert.rejects(pool.query('UPDATE tsa_private.fixed_stock_rehearsals SET window_minutes=61 WHERE id=$1',[first.rehearsalId]));
 const row=(await pool.query('SELECT manifest FROM tsa_private.fixed_stock_rehearsals WHERE id=$1',[first.rehearsalId])).rows[0].manifest;assert.equal(row.units.length,4);assert.equal(row.rightsVersions.length,1);assert.equal(Object.hasOwn(row,'historyQuestionIds'),false);
 assert.deepEqual(new Set(row.units.flatMap(u=>u.members.map(m=>m.versionId))),new Set(f.eligibleStock.map(q=>q.versionId)));
});
test('B8 HTTP and SQL role separation, CSRF/origin/strict input/default-off and private data denial',async()=>{
 const before=await snapshot();await result(await fetch(f.origin+base),401);
 for(const actor of [manager,author,student]){await result(await bankRequest(f,actor,base,{method:'POST',body:request,key:randomUUID()}),403);await result(await bankRequest(f,actor,'/api/v1/fixed-rehearsal-blueprints'),403);}
 await result(await bankRequest(f,exam,base),403);await result(await bankRequest(f,exam,base+'/'+first.rehearsalId),403);
 await result(await bankRequest(f,exam,base,{method:'POST',body:{...request,windowMinutes:0},key:randomUUID()}),422);
 await result(await bankRequest(f,exam,base,{method:'POST',body:{...request,historyQuestionIds:[]},key:randomUUID()}),422);
 await result(await bankRequest(f,exam,base,{method:'POST',body:request}),422);
 await result(await bankRequest(f,exam,base,{method:'POST',body:{...request,blueprintVersionId:randomUUID()},key:randomUUID()}),404);
 await result(await bankRequest(f,exam,base,{method:'POST',body:{...request,blueprintHash:'sha256:'+'0'.repeat(64)},key:randomUUID()}),409);
 await result(await bankRequest(f,manager,base+'?limit=1'),422);
 const unsupported=await f.fixture.createBlueprint({count:1});await result(await bankRequest(f,exam,base,{method:'POST',body:{...request,blueprintVersionId:unsupported.versionId,blueprintHash:unsupported.contentHash},key:randomUUID()}),422);
 const headers={origin:f.origin,cookie:exam.cookies.join('; '),'content-type':'application/json','idempotency-key':randomUUID()};await result(await fetch(f.origin+base,{method:'POST',headers,body:JSON.stringify(request)}),403);
 await result(await fetch(f.origin+base,{method:'POST',headers:{...headers,origin:'https://invalid.example','x-csrf-token':exam.csrf},body:JSON.stringify(request)}),403);
 const off=await createBankHandler({bankPool:f.fixture.bankPool,identityService:f.identity,trustedOrigin:f.origin});await result(await off(new Request(f.origin+base,{headers:{cookie:manager.cookies.join('; ')}})),404);
 for(const query of ['SELECT * FROM tsa_private.fixed_stock_rehearsals LIMIT 0','SELECT tsa_private.fixed_stock_pool($1,clock_timestamp(),clock_timestamp())'])await assert.rejects(withTransaction(f.fixture.bankPool,c=>c.query(query,query.includes('$1')?[request.blueprintVersionId]:[]),{role:'tsa_bank'}),{code:'42501'});
 const who=f.fixture.principals;await assert.rejects(withTransaction(f.fixture.bankPool,c=>c.query('SELECT tsa.fixed_stock_capture($1,$2,$3,60)',[who.bankManager.userId,request.blueprintVersionId,request.blueprintHash]),{role:'tsa_bank'}),{code:'42501'});
 await assert.rejects(withTransaction(f.fixture.bankPool,c=>c.query('SELECT tsa.fixed_stock_snapshot($1,NULL)',[who.examManager.userId]),{role:'tsa_bank'}),{code:'42501'});
 // Only the explicitly created unsupported blueprint/offering and its guards may differ.
 unchangedExcept(before,await snapshot(),['tsa.blueprints','tsa.blueprint_versions','tsa.blueprint_offerings','tsa.bank_state']);
});
test('B8 Bank audited aggregate replay, quarantine shortage and historical success remain truthful without pool/secret leakage',async()=>{
 let before=await snapshot();let list=await result(await bankRequest(f,manager,base));assert.equal(list.items.length,1);
 let detail=await result(await bankRequest(f,manager,base+'/'+first.rehearsalId));assert.equal(detail.replayVerified,true);assert.equal(detail.capturedCandidateCount,4);assert.equal(detail.selectedCount,4);assert.equal(detail.captureOrigin,'BANK_ELIGIBLE_AT_CAPTURE');assert.equal(detail.currentEligibility,'NOT_REVALIDATED');
 let after=await snapshot();assert.equal(after['tsa.audit_events'].count,before['tsa.audit_events'].count+2);unchangedExcept(before,after,['tsa.audit_events']);
 for(const body of [first,detail]){const text=JSON.stringify(body);assert.doesNotMatch(text,/sourceId|questionId|versionId|groupId|answerKey|explanation|manifestHash|seed":|actor_id|history/);for(const q of f.eligibleStock)assert.equal(text.includes(q.versionId),false);}
 const q=f.eligibleStock[0];await f.fixture.workflow.quarantine(f.fixture.principals.bankManager,q.versionId,randomUUID(),{expectedRevision:3,reason:'Synthetic B8 removal; not human content review.'});
 const failure=await result(await bankRequest(f,exam,base,{method:'POST',body:request,key:randomUUID()}),201);assert.equal(failure.outcome,'FAILURE');assert.equal(failure.failureCode,'INSUFFICIENT_ELIGIBLE_INVENTORY');assert.deepEqual(failure.sectionDeficits,[{section:'MATH',missingCount:1}]);
 detail=await result(await bankRequest(f,manager,base+'/'+first.rehearsalId));assert.equal(detail.rehearsal.outcome,'SUCCESS');assert.equal(detail.currentEligibility,'NOT_REVALIDATED');
 const shortage=await result(await bankRequest(f,manager,base+'/'+failure.rehearsalId));assert.equal(shortage.capturedCandidateCount,3);assert.equal(shortage.selectedCount,0);
 before=await snapshot();await result(await bankRequest(f,manager,base+'/'+randomUUID()),404);assert.deepEqual(await snapshot(),before);
});

test('B8 rights horizon uses database capture clock and current rights; complete bundles remain indivisible',async()=>{
 const {createBundleFixture}=await import('../assembly/bundle-fixtures.mjs');const b=await createBundleFixture({bundleCount:2});
 try{
   const api=await createFixedStockRehearsalService({bankPool:b.bankPool,identityService:b.identityService});
   const input={blueprintVersionId:b.blueprint.versionId,blueprintHash:b.blueprint.contentHash,windowMinutes:1};
   const captured=await api.create(b.principals.examManager,input,randomUUID());assert.equal(captured.body.outcome,'SUCCESS');
   const manifest=(await b.pool.query('SELECT manifest FROM tsa_private.fixed_stock_rehearsals WHERE id=$1',[captured.body.rehearsalId])).rows[0].manifest;
   assert.equal(manifest.units.length,2);for(const bundle of b.bundles)assert.deepEqual(manifest.units.find(u=>u.id===bundle.id).members.map(m=>m.versionId),bundle.questions.map(q=>q.versionId));
   const q=b.bundles[0].questions[0];await b.workflow.quarantine(b.principals.bankManager,q.versionId,randomUUID(),{expectedRevision:3,reason:'Synthetic complete-bundle exclusion.'});
   const next=await api.create(b.principals.examManager,input,randomUUID());assert.deepEqual(next.body.sectionDeficits,[{section:'MATH',missingCount:2}]);
   const report=await api.read(b.principals.bankManager,next.body.rehearsalId);assert.equal(report.capturedUnitCount,1);assert.equal(report.capturedCandidateCount,2);
 }finally{await b.close();}
 const source=await f.fixture.registerSource({validTo:new Date(Date.now()+300000).toISOString()});for(let i=0;i<4;i++)await f.fixture.createQuestion(source,'short-horizon-'+i);
 const current=await service.create(f.fixture.principals.examManager,{...request,windowMinutes:1},randomUUID());
 // Three original eligible members survive; newly published rights end before DB horizon.
 assert.equal(current.body.outcome,'FAILURE');assert.deepEqual(current.body.sectionDeficits,[{section:'MATH',missingCount:1}]);
 const report=await service.read(f.fixture.principals.bankManager,current.body.rehearsalId);assert.equal(report.capturedCandidateCount,3);
});

test('B8 receipt RLS isolates actors/routes and removed EXAM role cannot replay a historical receipt',async()=>{
 const actor=f.fixture.principals.examManager.userId,foreign=f.fixture.principals.author.userId;
 await withTransaction(f.fixture.bankPool,async client=>{
   await client.query("SELECT set_config('tsa.bank_actor_id',$1,true)",[foreign]);
   assert.equal((await client.query("SELECT * FROM tsa.idempotency_records WHERE route_scope='POST /api/v1/fixed-rehearsals'")).rowCount,0);
   await client.query("SELECT set_config('tsa.bank_actor_id',$1,true)",[actor]);
   assert.ok((await client.query("SELECT * FROM tsa.idempotency_records WHERE route_scope='POST /api/v1/fixed-rehearsals'")).rowCount>0);
   assert.equal((await client.query("SELECT * FROM tsa.idempotency_records WHERE route_scope='POST /api/v1/attempts'")).rowCount,0);
 },{role:'tsa_bank'});
 const assignedAt=(await pool.query("SELECT assigned_at::text AS value FROM tsa.user_roles WHERE user_id=$1 AND role='EXAM_MANAGER'",[actor])).rows[0].value;
 const key=randomUUID(),saved=await service.create(f.fixture.principals.examManager,request,key),before=await snapshot();
 await pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='EXAM_MANAGER'",[actor]);
 try{
  await assert.rejects(service.create(f.fixture.principals.examManager,request,key),{status:403,code:'FORBIDDEN'});
  await result(await bankRequest(f,exam,base,{method:'POST',body:request,key}),403);
 }finally{await pool.query("INSERT INTO tsa.user_roles(user_id,role,assigned_at) VALUES($1,'EXAM_MANAGER',$2)",[actor,assignedAt]);}
 assert.deepEqual(await snapshot(),before);assert.equal(saved.body.currentEligibility,'NOT_REVALIDATED');
});

test('B8 direct SQL rejects nullable result fields without committing a capture',async()=>{
 const {parseFixedAssemblyManifest,runFixedAssemblyReference}=await import('../../../packages/contracts/dist/internal.js');
 const before=await snapshot();
 for(const field of ['status','visitedNodes','slotsHash','extra','oversized']) {
  await assert.rejects(withTransaction(f.fixture.bankPool,async client=>{
   const captured=(await client.query('SELECT tsa.fixed_stock_capture($1,$2,$3,$4) AS value',[f.fixture.principals.examManager.userId,request.blueprintVersionId,request.blueprintHash,60])).rows[0].value;
   const stock=captured.stock;
   const parsed=parseFixedAssemblyManifest({schemaVersion:'fixed-assembly-manifest/1',algorithmVersion:'assembly/1',formMode:'PUBLISHED_FIXED',reuseMode:'FIXED_AS_PUBLISHED',
    blueprintVersionId:request.blueprintVersionId,blueprintHash:stock.blueprintHash,blueprint:stock.blueprint,seed:42,bankRevision:stock.bankRevision,
    rightsVersions:stock.rightsVersions.map(({sourceId,versionId,decision})=>({sourceId,versionId,contentHash:jsonDigest(decision)})),units:stock.units,conflicts:stock.conflicts,limits:{maxNodes:50000,maxUnits:2000}});
   const result={...runFixedAssemblyReference(parsed.manifest),[field]:field==='oversized'?'x'.repeat(1024*1024):null};
   await client.query('SELECT tsa.fixed_stock_store($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[f.fixture.principals.examManager.userId,randomUUID(),60,captured.capturedAt,captured.availableUntil,captured.requiredThrough,Buffer.from(parsed.bytes).toString(),parsed.manifestHash,JSON.stringify(result)]);
  },{role:'tsa_bank'}),{code:'22023'});
 }
 assert.deepEqual(await snapshot(),before);
});

test('B8 corrupt replay rolls back read audit and real latest20 discovery reports truncation',async()=>{
 const original=(await pool.query('SELECT result FROM tsa_private.fixed_stock_rehearsals WHERE id=$1',[first.rehearsalId])).rows[0].result;
 async function replace(value){await withTransaction(pool,async client=>{await client.query('ALTER TABLE tsa_private.fixed_stock_rehearsals DISABLE TRIGGER fixed_stock_rehearsals_immutable');await client.query('UPDATE tsa_private.fixed_stock_rehearsals SET result=$2 WHERE id=$1',[first.rehearsalId,value]);await client.query('ALTER TABLE tsa_private.fixed_stock_rehearsals ENABLE TRIGGER fixed_stock_rehearsals_immutable');});}
 try{
  await replace({...original,slotsHash:'sha256:'+'0'.repeat(64)});const before=await snapshot();
  const body=await result(await bankRequest(f,manager,base+'/'+first.rehearsalId),503);assert.equal(body.error.code,'TEMPORARILY_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(body),/slotsHash|manifest|questionId|answerKey|explanation/);assert.deepEqual(await snapshot(),before);
 }finally{await replace(original);}
 const before=await snapshot();
 for(let i=0;i<21;i++)await service.create(f.fixture.principals.examManager,request,randomUUID());
 const list=await result(await bankRequest(f,manager,base));assert.equal(list.items.length,20);assert.equal(list.truncated,true);assert.equal(new Set(list.items.map(r=>r.rehearsalId)).size,20);
 const after=await snapshot();for(const key of ['tsa.forms','tsa.form_slots','tsa.attempts','tsa.student_question_history','tsa.student_allocation_state','tsa.assembly_runs','tsa.bank_state'])assert.deepEqual(after[key],before[key],key);
});
