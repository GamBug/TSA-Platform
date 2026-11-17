import {createAllocationService} from '../../../src/modules/assembly/allocation.mjs';
import {withTransaction} from '../../../src/modules/database/pool.mjs';
import {jsonDigest} from '../../../src/modules/bank/common.mjs';
import {canonicalize} from '../../../packages/contracts/dist/internal.js';
import {createBundleFixture} from '../assembly/bundle-fixtures.mjs';
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createReviewBrowserFixture} from './review-browser-fixture.mjs';
import {loginActor, bankRequest} from './harness.mjs';
import {createFixedFormSealingService,buildFixedSealPlan} from '../../../src/modules/bank/fixed-form-sealing.mjs';
import {createFixedDiagnosticsService} from '../../../src/modules/bank/fixed-diagnostics.mjs';
let f, exam, manager, student, author, input, receipt, receiptKey;
const read = async(response,status=200)=>{const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;};
const counts = async()=>Object.fromEntries(await Promise.all(['tsa.forms','tsa.assembly_runs','tsa.attempts','tsa.student_question_history','tsa_private.fixed_form_seals','tsa_private.fixed_stock_rehearsals','tsa.idempotency_records'].map(async table=>[table,(await f.fixture.pool.query(`SELECT count(*)::integer AS n FROM ${table}`)).rows[0].n])));
before(async()=>{f=await createReviewBrowserFixture({includeEligibleFixedStock:true});exam=await loginActor(f,'examManager');manager=await loginActor(f,'bankManager');student=await loginActor(f,'studentA');author=await loginActor(f,'author');input={mode:'PUBLISHED_FIXED',blueprintVersionId:f.fixture.blueprint.versionId,blueprintHash:f.fixture.blueprint.contentHash,windowMinutes:60};});
after(async()=>{await f?.close();});
test('B9 actual HTTP seals current stock once, preserves historical receipts, discovers metadata and excludes real forms from B7',async()=>{
 const before=await counts(),key=receiptKey=randomUUID();
 const first=await bankRequest(f,exam,'/api/v1/assemblies',{method:'POST',key,body:input});const requestId=first.headers.get('x-request-id');receipt=await read(first,201);
 assert.equal(receipt.mode,'PUBLISHED_FIXED');assert.equal(receipt.reuseMode,'FIXED_AS_PUBLISHED');assert.equal(receipt.studentDeliverySupported,false);assert.equal(receipt.state,'SEALED');assert.equal(Object.hasOwn(receipt,'requestId'),false);
 const after=await counts();assert.equal(after['tsa.forms'],before['tsa.forms']+1);assert.equal(after['tsa.assembly_runs'],before['tsa.assembly_runs']+1);assert.equal(after['tsa_private.fixed_form_seals'],before['tsa_private.fixed_form_seals']+1);
 for(const table of ['tsa.attempts','tsa.student_question_history','tsa_private.fixed_stock_rehearsals'])assert.equal(after[table],before[table]);
 const replay=await bankRequest(f,exam,'/api/v1/assemblies',{method:'POST',key,body:input});assert.notEqual(replay.headers.get('x-request-id'),requestId);assert.deepEqual(await read(replay,201),receipt);assert.deepEqual(await counts(),after);
 const collision=await bankRequest(f,exam,'/api/v1/assemblies',{method:'POST',key,body:{...input,windowMinutes:61}});const error=await read(collision,409);assert.equal(error.error.requestId,collision.headers.get('x-request-id'));assert.deepEqual(await counts(),after);
 const list=await read(await bankRequest(f,exam,'/api/v1/fixed-forms'));assert.equal(list.items.length,1);assert.equal(list.items[0].formId,receipt.formId);assert.equal(list.items[0].questionCount,4);
 const detail=await read(await bankRequest(f,exam,'/api/v1/fixed-forms/'+receipt.formId));assert.equal(detail.form.formId,receipt.formId);assert.equal(detail.availability.revision,1);assert.equal(detail.currentEligibility,undefined);
 for(const body of [receipt,list,detail]){const text=JSON.stringify(body);assert.doesNotMatch(text,/answerKey|explanation|questionId|questionVersionId|sourceId|actor_id|historyQuestionIds/);for(const question of f.eligibleStock)assert.equal(text.includes(question.versionId),false);}
 await read(await bankRequest(f,manager,`/api/v1/assembly-runs/${receipt.assemblyRunId}/diagnostics`),404);const refs=await read(await bankRequest(f,manager,'/api/v1/assembly-runs'));assert.equal(refs.runs.some(row=>row.assemblyRunId===receipt.assemblyRunId),false);
 const original=await read(await bankRequest(f,manager,`/api/v1/assembly-runs/${f.fixedRuns.success.assemblyRunId}/diagnostics`));assert.equal(original.replayVerified,true);
 const rows=await f.fixture.pool.query('SELECT fs.public_snapshot,s.key_snapshot,s.explanation_snapshot FROM tsa.form_slots fs JOIN tsa_private.form_slot_secrets s USING(form_id,slot_id) WHERE fs.form_id=$1',[receipt.formId]);assert.equal(rows.rowCount,4);assert.ok(rows.rows.every(row=>row.key_snapshot&&row.explanation_snapshot));
 await assert.rejects(f.fixture.pool.query('UPDATE tsa_private.fixed_form_seals SET receipt=receipt WHERE form_id=$1',[receipt.formId]),{code:'55000'});
});
test('B9 actor keys are isolated and personal form IDs remain unavailable to staff fixed metadata',async()=>{
 const allocation=createAllocationService({examPool:f.fixture.examPool,identityService:f.fixture.identityService});
 const personal=await allocation.create(f.fixture.principals.studentA,randomUUID(),{blueprintVersionId:input.blueprintVersionId});
 assert.equal(personal.status,201);assert.equal(personal.body.formMode,'PERSONALIZED_PRACTICE');assert.match(personal.body.formId,/^[a-f0-9-]{36}$/);assert.notEqual(personal.body.formId,receipt.formId);
 await read(await bankRequest(f,exam,'/api/v1/fixed-forms/'+personal.body.formId),404);
 await f.fixture.pool.query("INSERT INTO tsa.user_roles(user_id,role) VALUES($1,'EXAM_MANAGER')",[f.fixture.principals.bankManager.userId]);
 try {
  const other=await read(await bankRequest(f,manager,'/api/v1/assemblies',{method:'POST',key:receiptKey,body:{...input,seed:7}}),201);
  assert.notEqual(other.formId,receipt.formId);assert.equal(other.seed,7);
  const again=await read(await bankRequest(f,manager,'/api/v1/assemblies',{method:'POST',key:receiptKey,body:{...input,seed:7}}),201);assert.deepEqual(again,other);
  const list=await read(await bankRequest(f,exam,'/api/v1/fixed-forms'));assert.equal(list.items.some(item=>item.formId===personal.body.formId),false);assert.equal(list.items.find(item=>item.formId===other.formId).seed,7);
 } finally {await f.fixture.pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='EXAM_MANAGER'",[f.fixture.principals.bankManager.userId]);}
});
test('B9 complete bundles seal atomically and SQL rejects private-projection, rights-hash and selected-hash tampering',async()=>{
 const b=await createBundleFixture({bundleCount:2});
 try {
  const input={mode:'PUBLISHED_FIXED',blueprintVersionId:b.blueprint.versionId,blueprintHash:b.blueprint.contentHash,windowMinutes:1};
  const api=await createFixedFormSealingService({bankPool:b.bankPool,identityService:b.identityService,enableCreation:true});
  const first=(await api.create(b.principals.examManager,input,randomUUID())).body;
  const slots=(await b.pool.query('SELECT question_version_id,bundle_id,ordinal FROM tsa.form_slots WHERE form_id=$1 ORDER BY ordinal',[first.formId])).rows;
  for(const bundle of b.bundles){const selected=slots.filter(row=>row.bundle_id===bundle.id);assert.deepEqual(selected.map(row=>row.question_version_id),bundle.questions.map(q=>q.versionId));assert.equal(selected.at(-1).ordinal-selected[0].ordinal+1,selected.length);}
  const before=(await b.pool.query('SELECT count(*)::integer AS n FROM tsa.forms')).rows[0].n;
  for(const tamper of ['private-extra','rights-hash','slots-hash','missing-visits','null-visits']) {
   await assert.rejects(withTransaction(b.bankPool,async client=>{
    const plan=structuredClone(await buildFixedSealPlan(client,b.principals.examManager,input));
    if(tamper==='private-extra'){
     plan.snapshots[0].privateSnapshot.extra='synthetic unpersisted data';
     plan.snapshots[0].privateBytes=Buffer.from(canonicalize(plan.snapshots[0].privateSnapshot)).toString('utf8');plan.snapshots[0].privateHash=jsonDigest(plan.snapshots[0].privateSnapshot);
     const form=JSON.parse(plan.formBytes);form.slots[0].privateHash=plan.snapshots[0].privateHash;plan.formBytes=Buffer.from(canonicalize(form)).toString('utf8');plan.formHash=jsonDigest(form);
    } else if(tamper==='rights-hash'){
     plan.manifest.rightsVersions[0].contentHash='sha256:'+ '0'.repeat(64);plan.manifestBytes=Buffer.from(canonicalize(plan.manifest)).toString('utf8');plan.manifestHash=jsonDigest(plan.manifest);plan.result.manifestHash=plan.manifestHash;
    } else if(tamper==='missing-visits')delete plan.result.visitedNodes;
    else if(tamper==='null-visits')plan.result.visitedNodes=null;
    else plan.result.slotsHash='sha256:'+ '0'.repeat(64);
    await client.query('SELECT tsa.fixed_seal_commit($1,$2,$3::jsonb)',[b.principals.examManager.userId,jsonDigest(input),JSON.stringify(plan)]);
   },{role:'tsa_bank'}),{code:'22023'});
   assert.equal((await b.pool.query('SELECT count(*)::integer AS n FROM tsa.forms')).rows[0].n,before);
  }
  assert.equal((await b.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,0);assert.equal((await b.pool.query('SELECT count(*)::integer AS n FROM tsa.student_question_history')).rows[0].n,0);
 } finally {await b.close();}
});
test('B9 auth, roles, Origin and CSRF fail before mutation; failed inventory allocates no graph',async()=>{
 for(const browser of [manager,student,author]){await read(await bankRequest(f,browser,'/api/v1/assemblies',{method:'POST',key:randomUUID(),body:input}),403);await read(await bankRequest(f,browser,'/api/v1/fixed-forms'),403);}
 await read(await bankRequest(f,exam,'/api/v1/fixed-forms/'+randomUUID()),404);
 const authBefore=await counts();
 for(const [headers,status] of [[{},401],[{origin:'https://invalid.example',cookie:exam.cookies.join('; '),'x-csrf-token':exam.csrf},403],[{origin:f.origin,cookie:exam.cookies.join('; ')},403]]){
  const response=await fetch(f.origin+'/api/v1/assemblies',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{invalid'});const error=await read(response,status);assert.equal(error.error.requestId,response.headers.get('x-request-id'));
 }
 assert.deepEqual(await counts(),authBefore);
 const before=await counts();await read(await bankRequest(f,exam,'/api/v1/assemblies',{method:'POST',key:randomUUID(),body:{...input,availableFrom:'2000-01-01T00:00:00Z'}}),422);assert.deepEqual(await counts(),before);
 const q=f.eligibleStock[0];await f.fixture.workflow.quarantine(f.fixture.principals.bankManager,q.versionId,randomUUID(),{expectedRevision:3,reason:'Synthetic fixed sealing stock restriction.'});
 const afterRestriction=await counts();const shortage=await read(await bankRequest(f,exam,'/api/v1/assemblies',{method:'POST',key:randomUUID(),body:input}),422);assert.equal(shortage.error.code,'INSUFFICIENT_ELIGIBLE_INVENTORY');assert.deepEqual(await counts(),afterRestriction);
 const detail=await read(await bankRequest(f,exam,'/api/v1/fixed-forms/'+receipt.formId));assert.equal(detail.form.currentEligibility,'NOT_REVALIDATED');assert.deepEqual(detail.form,{...receipt,domain:'MATH',questionCount:4,durationSeconds:600});
});
test('B9 creation disabled retains supported readers and replay; raw tables and candidate snapshot impersonation remain denied',async()=>{
 const service=await createFixedFormSealingService({bankPool:f.fixture.bankPool,identityService:f.fixture.identityService});const principal=f.fixture.principals.examManager;
 assert.equal((await service.read(principal,receipt.formId)).form.formId,receipt.formId);
 assert.deepEqual((await service.create(principal,input,receiptKey)).body,receipt,'creation disabled still replays original historical receipt');
 await assert.rejects(service.create(principal,input,randomUUID()),{status:404,code:'NOT_FOUND'});
 await assert.rejects(f.fixture.bankPool.query('SELECT * FROM tsa_private.fixed_form_seals'),{code:'42501'});
 await assert.rejects(f.fixture.bankPool.query('SELECT * FROM tsa_private.form_slot_secrets'),{code:'42501'});
 await assert.rejects(f.fixture.bankPool.query('SELECT tsa.assembly_snapshot_inputs($1::uuid[])',[f.eligibleStock.map(q=>q.versionId)]),{code:'42501'});
 const diag=await createFixedDiagnosticsService({bankPool:f.fixture.bankPool,identityService:f.fixture.identityService});await assert.rejects(diag.read(f.fixture.principals.bankManager,receipt.assemblyRunId),{status:404});
});
test('B9 disabled actor cannot replay its old receipt or read stored metadata through a cached principal',async()=>{
 const api=await createFixedFormSealingService({bankPool:f.fixture.bankPool,identityService:f.fixture.identityService,enableCreation:true});
 const principal=f.fixture.principals.examManager;
 await f.fixture.pool.query('UPDATE tsa.users SET disabled_at=clock_timestamp() WHERE id=$1',[principal.userId]);
 try {await assert.rejects(api.create(principal,input,receiptKey),{status:403,code:'FORBIDDEN'});await assert.rejects(api.read(principal,receipt.formId),{status:403,code:'FORBIDDEN'});}
 finally {await f.fixture.pool.query('UPDATE tsa.users SET disabled_at=NULL WHERE id=$1',[principal.userId]);}
});
test('B9 current EXAM role is required even for a previously committed receipt and stored metadata',async()=>{
 const api=await createFixedFormSealingService({bankPool:f.fixture.bankPool,identityService:f.fixture.identityService,enableCreation:true});
 const principal=f.fixture.principals.examManager;
 await f.fixture.pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='EXAM_MANAGER'",[principal.userId]);
 await assert.rejects(api.create(principal,input,receiptKey),{status:403,code:'FORBIDDEN'});
 await assert.rejects(api.read(principal,receipt.formId),{status:403,code:'FORBIDDEN'});
});
