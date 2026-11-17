import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createAllocationFixture} from './fixtures.mjs';
import {createFixedFormSealingService} from '../../../src/modules/bank/fixed-form-sealing.mjs';
import {createAllocationService} from '../../../src/modules/assembly/allocation.mjs';
import {createStudentDirectoryService} from '../../../src/modules/attempts/directory.mjs';

const cursor=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
test('B10 fixed catalog preserves personal cursor boundary and owned assignments share one seal without changing NEW_ONLY history rules', {timeout:30000},async()=>{
 const f=await createAllocationFixture({questionCount:4});
 try{
  const sealer=await createFixedFormSealingService({bankPool:f.bankPool,identityService:f.identityService,enableCreation:true});
  const request={mode:'PUBLISHED_FIXED',blueprintVersionId:f.blueprint.versionId,blueprintHash:f.blueprint.contentHash,windowMinutes:60};
  const seals=[];for(let i=0;i<2;i++)seals.push((await sealer.create(f.principals.examManager,{...request,seed:i},randomUUID())).body);
  const directory=createStudentDirectoryService({examPool:f.examPool,identityService:f.identityService,enableFixedPractice:true,enableReviewPractice:true});
  const page1=await directory.catalog(f.principals.studentA,{limit:'1'});assert.equal(page1.items.length,1);assert.equal(page1.items[0].mode,'PERSONALIZED_PRACTICE');assert.equal(page1.items[0].reviewAllowed,true);
  assert.deepEqual(JSON.parse(Buffer.from(page1.nextCursor,'base64url').toString()),{v:2,kind:'catalog',phase:'fixed',afterFormId:null});
  const page2=await directory.catalog(f.principals.studentA,{limit:'1',cursor:page1.nextCursor});assert.equal(page2.items[0].mode,'PUBLISHED_FIXED');assert.equal(Object.hasOwn(page2.items[0],'reviewAllowed'),false);
  const page3=await directory.catalog(f.principals.studentA,{limit:'1',cursor:page2.nextCursor});assert.equal(page3.items.length,1);assert.equal(page3.nextCursor,null);
  assert.deepEqual(new Set([page2.items[0].formId,page3.items[0].formId]),new Set(seals.map(row=>row.formId)));
  const legacy=await directory.catalog(f.principals.studentA,{limit:'1',cursor:cursor({v:1,kind:'catalog',afterBlueprintId:f.blueprint.versionId})});assert.equal(legacy.items[0].mode,'PUBLISHED_FIXED');
  const off=createStudentDirectoryService({examPool:f.examPool,identityService:f.identityService});assert.equal((await off.catalog(f.principals.studentA)).items.length,1);await assert.rejects(off.catalog(f.principals.studentA,{cursor:page1.nextCursor}),{status:422,code:'VALIDATION_ERROR'});
  await assert.rejects(directory.catalog(f.principals.studentA,{cursor:cursor(null)}),{status:422,code:'VALIDATION_ERROR'});
  const api=createAllocationService({examPool:f.examPool,identityService:f.identityService,enableFixedPractice:true});
  const body={mode:'PUBLISHED_FIXED',formId:seals[0].formId,reuseMode:'FIXED_AS_PUBLISHED',acknowledgeRepeats:true};
  const key=randomUUID(),created=await api.create(f.principals.studentA,key,body);assert.equal(created.status,201);assert.equal(created.body.formMode,'PUBLISHED_FIXED');assert.equal(created.body.formId,body.formId);
  assert.deepEqual(await api.create(f.principals.studentA,key,body),{...created,replayed:true});
  await assert.rejects(api.create(f.principals.studentA,randomUUID(),{blueprintVersionId:f.blueprint.versionId}),{status:409,code:'CONCURRENT_ATTEMPT_EXISTS'});
  const other=await api.create(f.principals.studentB,randomUUID(),body);assert.equal(other.body.formId,body.formId);assert.notEqual(other.body.attemptId,created.body.attemptId);
  assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa.forms')).rows[0].n,2);
  const history=async()=>(await f.pool.query('SELECT to_jsonb(h) AS row FROM tsa.student_question_history h WHERE user_id=$1 ORDER BY question_id',[f.principals.studentA.userId])).rows;
  const first=await history();assert.equal(first.length,4);
  await f.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1",[created.body.attemptId]);
  const repeat=await api.create(f.principals.studentA,randomUUID(),body);assert.notEqual(repeat.body.attemptId,created.body.attemptId);assert.deepEqual(await history(),first);
  await f.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1",[repeat.body.attemptId]);
  await assert.rejects(api.create(f.principals.studentA,randomUUID(),{blueprintVersionId:f.blueprint.versionId}),{status:422,code:'INSUFFICIENT_UNSEEN_INVENTORY'});
  const disabled=createAllocationService({examPool:f.examPool,identityService:f.identityService});assert.deepEqual(await disabled.create(f.principals.studentA,key,body),{...created,replayed:true});
 }finally{await f.close();}
});
