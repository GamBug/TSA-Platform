import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createPrivateTemplate} from '../../../src/local/seed.mjs';
import {bankRequest} from '../bank/harness.mjs';
import {createDomainStudentFixture} from './domain-fixture.mjs';
import {seedFixedStudentForms} from './fixed-fixture.mjs';
import {createPersistentApi} from '../../../apps/practice-prototype/public/app/persistent-api.js';
import {createStudentRuntime} from '../../../src/local/student.mjs';
import {createDatabasePool} from '../../../src/modules/database/pool.mjs';

test('B10 actual HTTP/SDK fixed journeys grade/release all three domains with persistent shared seals and no private ordinary response', {timeout:45000},async(t)=>{
 const f=await createDomainStudentFixture();let runtime,workerPool;
 t.after(async()=>{const errors=[];for(const close of [()=>runtime?.close(),()=>workerPool?.end(),()=>f.close()])try{await close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Fixed student fixture cleanup failed');});
 const forms=await seedFixedStudentForms(f);assert.equal(forms.length,3);
 const parent=f.questions[0],template=createPrivateTemplate(f.source);
 const sealed=async()=>(await f.pool.query('SELECT to_jsonb(s) AS slot,to_jsonb(k) AS secret FROM tsa.form_slots s JOIN tsa_private.form_slot_secrets k ON k.slot_id=s.slot_id ORDER BY s.slot_id')).rows;
 const original=await sealed();
 const correction=await bankRequest(f.harness,f.browsers.author,`/api/v1/questions/${parent.questionId}/versions`,{method:'POST',key:randomUUID(),body:{parentVersionId:parent.versionId,draft:{schemaVersion:'question/1',language:'vi-VN',section:'MATH',taxonomyVersionId:template.taxonomyVersionId,domainId:template.domainId,skillIds:template.skillIds,subskillIds:[],cognitiveLevel:null,targetDifficulty:'EASY',content:[{type:'text',text:'Original synthetic corrected Bank item; fixed form retains its earlier version.'}],interaction:{type:'SINGLE_CHOICE',options:['a','b','c'].map(id=>({id,content:[{type:'text',text:id}]}))},answerKey:{type:'SINGLE_CHOICE',optionId:'a'},explanation:[{type:'text',text:'Synthetic corrected key A.'}],stimulusVersionId:null,evidenceRefs:template.evidenceRefs,origin:'MANUAL',provenance:template.provenance}}});
 assert.equal(correction.status,201);const corrected=await correction.json();
 await f.workflow.submitReview(f.principals.author,corrected.versionId,randomUUID(),{expectedRevision:1});
 await f.workflow.confirmSingleton(f.principals.reviewer,corrected.versionId,randomUUID(),{expectedRevision:2,contentHash:corrected.contentHash,reason:'Synthetic exact-version correction fixture.'});
 await f.workflow.review(f.principals.reviewer,corrected.versionId,randomUUID(),{expectedRevision:2,contentHash:corrected.contentHash,decision:'APPROVE',rubric:{correctness:true,unambiguous:true,relevant:true,language:true,explanation:true,rights:true},reason:'Synthetic fixture machinery, not qualified human review.'});
 assert.equal((await f.pool.query('SELECT eligible_version_id FROM tsa.questions WHERE id=$1',[parent.questionId])).rows[0].eligible_version_id,corrected.versionId);
 assert.deepEqual(await sealed(),original,'current Bank correction never rewrites existing fixed snapshots or keys');

 await f.pool.query('CREATE ROLE fixed_student_worker LOGIN');await f.pool.query('GRANT tsa_exam_worker TO fixed_student_worker');
 workerPool=createDatabasePool({...f.harness.database.connectionConfig,user:'fixed_student_worker'});
 const rate={capacity:100,refillPerSecond:10};
 const startRuntime=enableFixedPractice=>createStudentRuntime({identityPool:f.harness.authPool,examPool:f.examPool,workerPool,
  env:{NODE_ENV:'test',LOCAL_SYNTHETIC_ONLY:'true'},port:0,enableFixedPractice,enableReviewPractice:true,
  pollMilliseconds:20,sweepBatchSize:10,executorId:'fixed-three-domain',leaseSeconds:30,retrySeconds:1,
  createRate:rate,saveRate:{user:rate,attempt:rate}});
 runtime=await startRuntime(true);
 const jar=new Map();
 const fetchImpl=async(path,options={})=>{const headers=new Headers(options.headers);headers.set('origin',runtime.origin);
  if(jar.size)headers.set('cookie',[...jar].map(([name,value])=>`${name}=${value}`).join('; '));
  const response=await fetch(runtime.origin+path,{...options,headers});
  for(const line of response.headers.getSetCookie()){const pair=line.split(';',1)[0],at=pair.indexOf('=');if(pair.slice(at+1))jar.set(pair.slice(0,at),pair.slice(at+1));else jar.delete(pair.slice(0,at));}
  return response;};
 const makeApi=()=>createPersistentApi({fetchImpl,readCookie:name=>jar.get(name)});
 let api=makeApi();await api.loginCandidate('studentA');
 const catalog=await api.loadCatalog();assert.equal(catalog.domains.length,3);assert.equal(catalog.fixedForms.length,3);
 for(const [index,form] of catalog.fixedForms.entries()){
  const before=(await f.pool.query('SELECT count(*)::integer AS n FROM tsa.forms')).rows[0].n;
  const intent=api.prepareFixedAttempt(form.formId),receipt=await api.createFixedAttempt(intent);
  assert.equal(receipt.state,'CREATED');assert.equal(receipt.formMode,'PUBLISHED_FIXED');assert.equal(receipt.formId,form.formId);
  const ordinary=await fetchImpl('/api/v1/attempts/'+receipt.attemptId);const ordinaryBody=await ordinary.json();assert.equal(ordinary.status,200);assert.doesNotMatch(JSON.stringify(ordinaryBody),/"answerKey"|"explanation"|"questionVersionId"|"sourceId"/);
  const reserved=(await api.readFixedAttempt(receipt.attemptId,form.domain,form.formId)).attempt;assert.equal(reserved.state,'CREATED');
  if(index===0){await runtime.close();runtime=await startRuntime(false);assert.equal((await api.loadCatalog()).fixedForms.length,0);assert.equal((await api.readFixedAttempt(receipt.attemptId,form.domain,form.formId)).attempt.state,'CREATED');}
  let attempt=(await api.startReservedAttempt(receipt.attemptId,reserved)).attempt;
  assert.equal(attempt.formMode,'PUBLISHED_FIXED');assert.equal(attempt.reuseMode,'FIXED_AS_PUBLISHED');assert.equal(attempt.durationSeconds,form.durationSeconds);
  for(const slot of attempt.slots){
   const input=slot.interaction.type==='MULTIPLE_CHOICE'?{optionIds:['a','c']}:slot.interaction.type==='TRUE_FALSE_GROUP'?{statementValues:[{statementId:'s1',value:true},{statementId:'s2',value:false}]}:{optionId:'b'};
   await api.saveAnswer(attempt.attemptId,slot.slotId,input);
  }
  const clocks={startedAt:attempt.startedAt,deadlineAt:attempt.deadlineAt};
  api=makeApi();await api.loginCandidate('studentA');attempt=(await api.openDemoSession()).attempt;
  assert.equal(attempt.attemptId,receipt.attemptId);assert.equal(attempt.formMode,'PUBLISHED_FIXED');assert.equal(attempt.answeredCount,form.questionCount);assert.deepEqual({startedAt:attempt.startedAt,deadlineAt:attempt.deadlineAt},clocks);
  await api.submitAttempt(attempt.attemptId);
  for(let i=0;i<100;i++){attempt=(await api.readFixedAttempt(receipt.attemptId,form.domain,form.formId)).attempt;if(attempt.state==='GRADED')break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(attempt.state,'GRADED');assert.equal(attempt.result.percentage,'100.00');
  const released=await fetchImpl('/api/v1/attempts/'+receipt.attemptId+'/result');const result=await released.json();assert.equal(released.status,200);assert.equal(result.formMode,'PUBLISHED_FIXED');assert.equal(result.domain,form.domain);assert.equal(result.scoreLabel,'UNOFFICIAL_PRACTICE');assert.equal(result.items.length,form.questionCount);
  const review=await api.readReview(receipt.attemptId);assert.equal(review.review.slots.length,form.questionCount);
  assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa.forms')).rows[0].n,before,'student requests never seal a replacement form');
  assert.deepEqual(await sealed(),original,'fixed delivery, grading and release preserve the pre-correction sealed version/key');
  if(index===0){await runtime.close();runtime=await startRuntime(true);}
 }
 const history=await api.loadHistory();assert.equal(history.length,3);assert.ok(history.every(row=>row.formMode==='PUBLISHED_FIXED'&&row.state==='GRADED'));
 const ownedId=history[0].attemptId;
 await api.logout();await api.loginCandidate('studentB');
 for(const suffix of ['', '/result']){
  const foreign=await fetchImpl('/api/v1/attempts/'+ownedId+suffix);const body=await foreign.json();assert.equal(foreign.status,404);assert.equal(body.error.code,'NOT_FOUND');assert.match(body.error.requestId,/^[0-9a-f-]{36}$/);if(foreign.headers.has('x-request-id'))assert.equal(body.error.requestId,foreign.headers.get('x-request-id'));assert.doesNotMatch(JSON.stringify(body),/answerKey|explanation|questionVersionId/);
 }
 const fixedBody={mode:'PUBLISHED_FIXED',formId:catalog.fixedForms[0].formId,reuseMode:'FIXED_AS_PUBLISHED',acknowledgeRepeats:true};
 const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
 for(const headers of [{origin:runtime.origin},{origin:'https://invalid.example','x-csrf-token':jar.get('tsa_local_csrf')}]){
  const denied=await fetch(runtime.origin+'/api/v1/attempts',{method:'POST',headers:{...headers,cookie,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(fixedBody)});assert.equal(denied.status,403);const body=await denied.json();assert.equal(body.error.requestId,denied.headers.get('x-request-id'));
 }
 assert.equal((await api.loadHistory()).length,0,'fixed history remains owned');

 assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa.student_question_history')).rows[0].n,10);
});
