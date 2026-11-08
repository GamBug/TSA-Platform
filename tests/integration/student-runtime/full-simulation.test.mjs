import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createSimulationFixture} from './simulation-fixture.mjs';
import {createAttemptService} from '../../../src/modules/attempts/service.mjs';
import {createDatabasePool} from '../../../src/modules/database/pool.mjs';
import {createExamWorker} from '../../../src/modules/jobs/exam-worker.mjs';
import {createExamSweeper} from '../../../src/modules/jobs/exam-sweeper.mjs';
const rate={capacity:1000,refillPerSecond:100};
function service(f,enableFullSimulation=true){return createAttemptService({examPool:f.examPool,identityService:f.identityService,
 enableFullSimulation,createRate:rate,saveRate:{user:rate,attempt:rate}});}
async function grader(f){const login='simulation_worker_'+randomUUID().replaceAll('-','');await f.pool.query(`CREATE ROLE ${login} LOGIN`);await f.pool.query(`GRANT tsa_exam_worker TO ${login}`);return createDatabasePool({...f.harness.database.connectionConfig,user:login});}

test('full simulation accounts only open clocks, isolates unopened content, retries saves after switches and grades three sections',{timeout:60000},async t=>{
 const f=await createSimulationFixture();let pool;t.after(async()=>{await pool?.end();await f.close();});
 const s=service(f),owner=f.principals.studentA,legacy=service(f,false),key=randomUUID(),request={blueprintVersionId:f.blueprint.versionId};
 const created=await s.create(owner,key,request),id=created.body.attemptId;
 assert.equal((await s.create(owner,key,request)).body.attemptId,id);assert.equal((await s.read(owner,id)).slots.length,0);
 assert.equal(await s.read(f.principals.studentB,id),null);assert.equal(await legacy.read(owner,id),null);
 await assert.rejects(legacy.start(owner,id,randomUUID()),e=>e.code==='NOT_FOUND');
 await s.start(owner,id,randomUUID());let view=await s.read(owner,id);assert.equal(view.slots.length,40);assert.equal(view.activeSectionId,'math');
 assert.doesNotMatch(JSON.stringify(view),/SYNTHETIC_READING|SYNTHETIC_SCIENCE|SIMULATION_PRIVATE|answerKey/);
 const slot=view.slots[0],saveKey=randomUUID(),body={expectedRevision:0,value:{type:'SINGLE_CHOICE',optionId:'b'}};
 const ack=await s.save(owner,id,slot.slotId,saveKey,body);
 const {createAttemptAssetService}=await import('../../../src/modules/attempts/asset-service.mjs');
 const assets=createAttemptAssetService({examPool:f.examPool,identityService:f.identityService,imageStore:f.imageStore,enableFullSimulation:true});
 await assert.rejects(assets.read(owner,id,f.assets.reading.QUESTION.id,'question'),e=>e.code==='NOT_FOUND');
 assert.deepEqual((await assets.read(owner,id,f.assets.math.QUESTION.id,'question')).bytes,f.assets.math.QUESTION.bytes);
 await assert.rejects(assets.read(owner,id,f.assets.math.EXPLANATION.id,'explanation'),e=>e.code==='NOT_FOUND');
 const switchKey=randomUUID();const switched=await s.switchSection(owner,id,switchKey,{sectionId:'reading'});
 const clocks=(await f.pool.query('SELECT * FROM tsa_private.simulation_section_clocks WHERE attempt_id=$1 ORDER BY section_id',[id])).rows;
 const math=clocks.find(c=>c.section_id==='math'),science=clocks.find(c=>c.section_id==='science');
 assert.ok(Number(math.elapsed_seconds)>0);assert.equal(math.opened_at,null);assert.equal(Number(science.elapsed_seconds),0);assert.equal(science.first_opened_at,null);
 assert.deepEqual((await s.save(owner,id,slot.slotId,saveKey,body)).body,ack.body);
 await assert.rejects(s.save(owner,id,slot.slotId,randomUUID(),{...body,expectedRevision:1}),e=>e.code==='SECTION_CLOSED');
 await assert.rejects(s.save(owner,id,slot.slotId,saveKey,{...body,value:{type:'SINGLE_CHOICE',optionId:'a'}}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 assert.deepEqual((await s.switchSection(owner,id,switchKey,{sectionId:'reading'})).body,switched.body);
 await assert.rejects(s.switchSection(owner,id,switchKey,{sectionId:'science'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 assert.deepEqual((await assets.read(owner,id,f.assets.reading.QUESTION.id,'question')).bytes,f.assets.reading.QUESTION.bytes);
 view=await s.read(owner,id);assert.equal(view.slots.length,60);assert.equal(view.sections[2].remainingSeconds,3600);
 assert.equal(Number((await f.pool.query("SELECT elapsed_seconds FROM tsa_private.simulation_section_clocks WHERE attempt_id=$1 AND section_id='math'",[id])).rows[0].elapsed_seconds),Number(math.elapsed_seconds));
 await s.switchSection(owner,id,randomUUID(),{sectionId:'math'});
 const race=await Promise.allSettled([s.save(owner,id,slot.slotId,randomUUID(),{expectedRevision:1,value:{type:'SINGLE_CHOICE',optionId:'b'}}),s.switchSection(owner,id,randomUUID(),{sectionId:'reading'})]);
 assert.equal(race[1].status,'fulfilled');if(race[0].status==='rejected')assert.equal(race[0].reason.code,'SECTION_CLOSED');
 assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa_private.simulation_section_clocks WHERE attempt_id=$1 AND opened_at IS NOT NULL',[id])).rows[0].n,1);
 await s.switchSection(owner,id,randomUUID(),{sectionId:'science'});view=await s.read(owner,id);assert.equal(view.slots.length,100);
 for(const q of view.slots.filter(q=>q.sectionId==='science').slice(0,2))await s.save(owner,id,q.slotId,randomUUID(),{expectedRevision:0,value:{type:'SINGLE_CHOICE',optionId:'b'}});
 const closureRace=await Promise.allSettled([s.switchSection(owner,id,randomUUID(),{sectionId:'math'}),s.submit(owner,id,randomUUID())]);
 assert.equal(closureRace[1].status,'fulfilled');if(closureRace[0].status==='rejected')assert.equal(closureRace[0].reason.code,'ATTEMPT_CLOSED');
 assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa_private.simulation_section_clocks WHERE attempt_id=$1 AND opened_at IS NOT NULL',[id])).rows[0].n,0);
 pool=await grader(f);const worker=createExamWorker({workerPool:pool,executorId:'simulation',leaseSeconds:30,retrySeconds:1});
 assert.equal((await worker.runOnce()).status,'GRADED');
 const result=await s.withReadBoundary(owner,async ports=>{const access=await ports.readAccess({attemptId:id,userId:owner.userId});return ports.loadReleasedReview({attemptId:id,userId:owner.userId,access});});
 assert.equal(result.totalCount,100);assert.equal(result.correctCount,3);assert.deepEqual(result.sections.map(s=>s.correctCount),[1,0,2]);assert.equal(result.items.length,100);
 assert.deepEqual((await assets.read(owner,id,f.assets.math.EXPLANATION.id,'explanation')).bytes,f.assets.math.EXPLANATION.bytes);
});

test('offline sweeper exhausts only the running section, rejects exhausted saves and expires after all budgets',{timeout:60000},async t=>{
 const f=await createSimulationFixture();let pool;t.after(async()=>{await pool?.end();await f.close();});
 const s=service(f),owner=f.principals.studentA;const created=await s.create(owner,randomUUID(),{blueprintVersionId:f.blueprint.versionId}),id=created.body.attemptId;
 await s.start(owner,id,randomUUID());const first=(await s.read(owner,id)).slots[0];pool=await grader(f);const sweeper=createExamSweeper({workerPool:pool,executorId:'simulation-offline',batchSize:10});
 for(const section of ['math','reading','science']){
  if(section!=='math')await s.switchSection(owner,id,randomUUID(),{sectionId:section});
  await f.expireSection(id,section);await sweeper.sweepOnce();
  const view=await s.read(owner,id);assert.equal(view.activeSectionId,null);assert.equal(view.sections.find(s=>s.sectionId===section).isLocked,true);
  assert.equal(view.state,section==='science'?'EXPIRED':'IN_PROGRESS');
  if(section==='math'){
   assert.equal(view.slots.length,40);assert.equal(view.sections[1].remainingSeconds,1800);
   await assert.rejects(s.save(owner,id,first.slotId,randomUUID(),{expectedRevision:0,value:{type:'SINGLE_CHOICE',optionId:'b'}}),e=>e.code==='SECTION_CLOSED');
   await assert.rejects(s.switchSection(owner,id,randomUUID(),{sectionId:'math'}),e=>e.code==='SECTION_CLOSED');
  }
 }
 assert.equal((await createExamWorker({workerPool:pool,executorId:'simulation-offline',leaseSeconds:30,retrySeconds:1}).runOnce()).status,'GRADED');
});

test('v3 HTTP authenticates, enforces CSRF and owner isolation, hides future sections and releases only graded results',{timeout:60000},async t=>{
 const {createStudentRuntime}=await import('../../../src/local/student.mjs');
 const f=await createSimulationFixture();let pool,runtime;t.after(async()=>{await runtime?.close();await pool?.end();await f.close();});
 pool=await grader(f);runtime=await createStudentRuntime({identityPool:f.harness.authPool,examPool:f.examPool,workerPool:pool,
  env:{NODE_ENV:'test',LOCAL_SYNTHETIC_ONLY:'true'},port:0,enableFullSimulation:true,imageStore:f.imageStore,pollMilliseconds:20,sweepBatchSize:10,
  executorId:'simulation-http',leaseSeconds:30,retrySeconds:1,createRate:rate,saveRate:{user:rate,attempt:rate}});
 const jar=new Map();
 async function send(path,method='GET',body,key=randomUUID(),csrf=true){
  const headers=new Headers({origin:runtime.origin});if(jar.size)headers.set('cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  if(body!==undefined){headers.set('content-type','application/json');headers.set('idempotency-key',key);}
  if(csrf&&jar.has('tsa_local_csrf'))headers.set('x-csrf-token',jar.get('tsa_local_csrf'));
  const response=await fetch(runtime.origin+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
  for(const line of response.headers.getSetCookie()){const [pair]=line.split(';'),at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
  return {status:response.status,data:await response.json()};
 }
 assert.equal((await send('/api/v3/catalog')).status,401);
 await send('/local-auth/bootstrap','POST',{});await send('/local-auth/login','POST',{actorKey:'studentA'});
 const catalog=await send('/api/v3/catalog');assert.equal(catalog.status,200,JSON.stringify(catalog.data));assert.equal(catalog.data.items[0].questionCount,100);
 assert.equal((await send('/api/v1/catalog')).data.items.length,0);
 const created=await send('/api/v3/attempts','POST',{blueprintVersionId:f.blueprint.versionId});assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.attemptId;
 assert.equal((await send('/api/v3/attempts')).data.items.length,1);assert.equal((await send('/api/v1/attempts')).data.items.length,0);
 assert.equal((await send(`/api/v3/attempts/${id}/start`,'POST',{},randomUUID(),false)).status,403);
 assert.equal((await send(`/api/v3/attempts/${id}/start`,'POST',{})).status,200);
 assert.equal((await send(`/api/v1/attempts/${id}`)).status,404);
 assert.equal((await send(`/api/v2/attempts/${id}`)).status,404);
 const view=await send(`/api/v3/attempts/${id}`);assert.equal(view.status,200,JSON.stringify(view.data));assert.equal(view.data.slots.length,40);
 assert.equal((await send(`/api/v3/attempts/${id}/result`)).status,409);
 assert.equal((await send(`/api/v3/attempts/${id}/assets/${f.assets.reading.QUESTION.id}?purpose=question`)).status,404);
 assert.equal((await send(`/api/v3/attempts/${id}/assets/${f.assets.math.EXPLANATION.id}?purpose=explanation`)).status,404);
 assert.equal((await send(`/api/v3/attempts/${id}/section`,'POST',{sectionId:'reading'})).status,200);
 const reading=await send(`/api/v3/attempts/${id}`);assert.equal(reading.data.slots.length,60);assert.doesNotMatch(JSON.stringify(reading.data),/SYNTHETIC_SCIENCE|SIMULATION_PRIVATE/);
 await send('/local-auth/logout','POST',{});await send('/local-auth/bootstrap','POST',{});assert.equal((await send('/local-auth/login','POST',{actorKey:'studentB'})).status,200);
 assert.equal((await send(`/api/v3/attempts/${id}`)).status,404);assert.equal((await send(`/api/v3/attempts/${id}/section`,'POST',{sectionId:'science'})).status,404);
 await send('/local-auth/logout','POST',{});await send('/local-auth/bootstrap','POST',{});assert.equal((await send('/local-auth/login','POST',{actorKey:'studentA'})).status,200);
 assert.equal((await send(`/api/v3/attempts/${id}/submit`,'POST',{})).status,200);
 let result;for(let i=0;i<100;i++){result=await send(`/api/v3/attempts/${id}/result`);if(result.status===200)break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.sections.length,3);assert.equal(result.data.totalCount,100);
 const {createSourceService}=await import('../../../src/modules/sources/service.mjs');
 const {backupLocalDatabase}=await import('../../../src/local/database-backup.mjs');
 const {mkdtemp,rm}=await import('node:fs/promises');const backup=await mkdtemp('/tmp/tsa-simulation-revoke-');
 try {
  await backupLocalDatabase({connectionConfig:f.harness.database.connectionConfig,directory:backup});
  const sources=await createSourceService({bankPool:f.bankPool,identityService:f.identityService});
  await sources.registerRightsDecision(f.principals.bankManager,f.source.sourceVersionId,randomUUID(),{status:'REVOKED',allowedUses:['DISPLAY'],territory:['VN'],validFrom:'2000-01-01T00:00:00Z',validTo:null,evidence:'Original disposable simulation withdrawal check.',expectedRevision:1});
  const revoked=await send(`/api/v3/attempts/${id}/result`);assert.equal(revoked.status,410);assert.doesNotMatch(JSON.stringify(revoked.data),/correctAnswer|SIMULATION_PRIVATE/);
  assert.equal((await send(`/api/v3/attempts/${id}/assets/${f.assets.math.EXPLANATION.id}?purpose=explanation`)).status,404);
 } finally {await rm(backup,{recursive:true,force:true});}

});

test('paused simulation cannot resume after source rights expire without a live clock',{timeout:60000},async t=>{
 const f=await createSimulationFixture();t.after(()=>f.close());const s=service(f),owner=f.principals.studentA;
 const id=(await s.create(owner,randomUUID(),{blueprintVersionId:f.blueprint.versionId})).body.attemptId;
 await s.start(owner,id,randomUUID());for(const sectionId of ['reading','science','math'])await s.switchSection(owner,id,randomUUID(),{sectionId});
 await f.expireSection(id,'math');assert.equal((await s.read(owner,id)).activeSectionId,null);
 const {backupLocalDatabase}=await import('../../../src/local/database-backup.mjs');const {mkdtemp,rm}=await import('node:fs/promises');
 const directory=await mkdtemp('/tmp/tsa-simulation-rights-expiry-');
 try {
  await backupLocalDatabase({connectionConfig:f.harness.database.connectionConfig,directory});
  // Advance the already-opened, paused fixture clocks; keep the published budgets unchanged.
  await f.pool.query("UPDATE tsa_private.simulation_section_clocks SET elapsed_seconds=budget_seconds-1 WHERE attempt_id=$1 AND section_id IN('reading','science')",[id]);
  const {createSourceService}=await import('../../../src/modules/sources/service.mjs');const sources=await createSourceService({bankPool:f.bankPool,identityService:f.identityService});
  await sources.registerRightsDecision(f.principals.bankManager,f.source.sourceVersionId,randomUUID(),{status:'OWNED',allowedUses:['DISPLAY','ADAPT'],territory:['VN'],validFrom:'2000-01-01T00:00:00Z',validTo:new Date(Date.now()+6000).toISOString(),evidence:'Disposable engineering rights-expiry test; not permission evidence.',expectedRevision:1});
  assert.equal((await s.read(owner,id)).state,'IN_PROGRESS');
  await new Promise(resolve=>setTimeout(resolve,6500));
  await assert.rejects(s.switchSection(owner,id,randomUUID(),{sectionId:'reading'}),e=>e.code==='CONTENT_WITHDRAWN');
  const revoked=await s.read(owner,id);assert.equal(revoked.state,'INVALIDATED');assert.equal(revoked.slots.length,0);assert.equal(revoked.activeSectionId,null);
 } finally {await rm(directory,{recursive:true,force:true});}
});
