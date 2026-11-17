import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDomainStudentFixture} from './domain-fixture.mjs';
import {seedShortStudentProfiles} from './short-fixture.mjs';
import {createPersistentApi} from '../../../apps/practice-prototype/public/app/persistent-api.js';
import {createStudentRuntime} from '../../../src/local/student.mjs';
import {createDatabasePool} from '../../../src/modules/database/pool.mjs';

test('B11 actual HTTP/SDK full shortage leads to explicit short reservation, persistent grade/release and flag-off owned lifecycle in both domains',{timeout:45000},async t=>{
 const f=await createDomainStudentFixture({extraPerLargeDomain:2});let runtime,workerPool;
 t.after(async()=>{const errors=[];for(const close of [()=>runtime?.close(),()=>workerPool?.end(),()=>f.close()])try{await close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Short-practice fixture cleanup failed');});
 const shorts=await seedShortStudentProfiles(f);assert.equal(shorts.length,2);
 await f.pool.query('CREATE ROLE short_student_worker LOGIN');await f.pool.query('GRANT tsa_exam_worker TO short_student_worker');
 workerPool=createDatabasePool({...f.harness.database.connectionConfig,user:'short_student_worker'});
 const rate={capacity:100,refillPerSecond:10};
 const startRuntime=enableShortPractice=>createStudentRuntime({identityPool:f.harness.authPool,examPool:f.examPool,workerPool,
  env:{NODE_ENV:'test',LOCAL_SYNTHETIC_ONLY:'true'},port:0,enableShortPractice,enableReviewPractice:true,
  pollMilliseconds:20,sweepBatchSize:10,executorId:'short-two-domain',leaseSeconds:30,retrySeconds:1,
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
 async function complete(attempt){
  for(const slot of attempt.slots){
   const input=slot.interaction.type==='MULTIPLE_CHOICE'?{optionIds:['a','c']}:slot.interaction.type==='TRUE_FALSE_GROUP'?{statementValues:[{statementId:'s1',value:true},{statementId:'s2',value:false}]}:{optionId:'b'};
   await api.saveAnswer(attempt.attemptId,slot.slotId,input);
  }
  const clocks={startedAt:attempt.startedAt,deadlineAt:attempt.deadlineAt},profile=attempt.practiceProfile;
  api=makeApi();await api.loginCandidate('studentA');const resumed=(await api.openDemoSession()).attempt;
  assert.equal(resumed.attemptId,attempt.attemptId);assert.equal(resumed.answeredCount,attempt.questionCount);assert.equal(resumed.practiceProfile,null);
  assert.deepEqual({startedAt:resumed.startedAt,deadlineAt:resumed.deadlineAt},clocks);
  await api.submitAttempt(attempt.attemptId);
  for(let poll=0;poll<100;poll++){attempt=(await api.readAttempt(attempt.attemptId)).attempt;if(attempt.state==='GRADED')break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(attempt.state,'GRADED');assert.equal(attempt.result.percentage,'100.00');
  assert.equal((await api.readReview(attempt.attemptId)).review.slots.length,attempt.questionCount);
  return profile;
 }
 for(const [index,domain] of ['MATH','SCIENCE'].entries()){
  const catalog=await api.loadCatalog();assert.equal(catalog.domains.length,5);
  const full=catalog.domains.find(row=>row.domain===domain&&!row.isShort),short=catalog.domains.find(row=>row.domain===domain&&row.isShort);
  assert.equal(short.reviewAllowed,false);
  const original=(await api.startDemo(domain,full.blueprintVersionId)).attempt;
  assert.equal(original.practiceProfile.blueprintVersionId,full.blueprintVersionId);await complete(original);
  // Complete() constructed a new SDK. Reload catalog to obtain a new selectable intent.
  await api.loadCatalog();
  await assert.rejects(api.startDemo(domain,full.blueprintVersionId),error=>{assert.equal(error.code,'INSUFFICIENT_UNSEEN_INVENTORY');assert.ok(error.details.alternatives.some(row=>row.kind==='SHORTER_PROFILE'&&row.blueprintVersionId===short.blueprintVersionId));return true;});
  const before=(await f.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n;
  const intent=api.prepareShortAttempt(short.blueprintVersionId);
  assert.deepEqual(intent.body,{blueprintVersionId:short.blueprintVersionId});
  assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,before,'preparing intent is not assignment');
  const receipt=await api.createShortAttempt(intent),reserved=(await api.readShortAttempt(receipt.attemptId,domain)).attempt;
  assert.equal(reserved.state,'CREATED');assert.equal(reserved.practiceProfile.blueprintVersionId,short.blueprintVersionId);assert.equal(reserved.questionCount,2);
  await assert.rejects(api.startDemo(domain,full.blueprintVersionId),{code:'CONCURRENT_ATTEMPT_EXISTS',status:409});
  assert.equal((await f.pool.query('SELECT started_at FROM tsa.attempts WHERE id=$1',[receipt.attemptId])).rows[0].started_at,null,'selecting another profile never starts the existing reservation');
  if(index===0){await runtime.close();runtime=await startRuntime(false);}
  api=makeApi();await api.loginCandidate('studentA');const reloaded=(await api.openDemoSession()).attempt;
  assert.equal(reloaded.attemptId,receipt.attemptId);assert.equal(reloaded.state,'CREATED');assert.equal(reloaded.practiceProfile,null);assert.equal(reloaded.durationSeconds,0,'unknown pre-Start duration stays unknown');
  if(index===0)assert.ok((await api.loadCatalog()).domains.every(row=>!row.isShort),'flag-off hides new short creation');
  const started=(await api.startReservedAttempt(receipt.attemptId,reloaded)).attempt;assert.equal(started.durationSeconds,180);await complete(started);
  if(index===0){await runtime.close();runtime=await startRuntime(true);}
 }
 assert.equal((await api.loadHistory()).length,4);assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa.student_question_history')).rows[0].n,12);
 const owned=(await api.loadHistory())[0].attemptId;await api.logout();await api.loginCandidate('studentB');
 for(const suffix of ['', '/result'])assert.equal((await fetchImpl('/api/v1/attempts/'+owned+suffix)).status,404);
 assert.equal((await api.loadHistory()).length,0);
 const cookie=[...jar].map(([name,value])=>`${name}=${value}`).join('; ');
 for(const headers of [{origin:runtime.origin},{origin:'https://invalid.example','x-csrf-token':jar.get('tsa_local_csrf')}]){
  const denied=await fetch(runtime.origin+'/api/v1/attempts',{method:'POST',headers:{...headers,cookie,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({blueprintVersionId:shorts[0].versionId})});
  assert.equal(denied.status,403);const body=await denied.json();assert.equal(body.error.requestId,denied.headers.get('x-request-id'));assert.doesNotMatch(JSON.stringify(body),/answerKey|explanation|questionVersionId/);
 }
 assert.equal((await api.loadHistory()).length,0,'denied short requests create no owned attempt');

});
