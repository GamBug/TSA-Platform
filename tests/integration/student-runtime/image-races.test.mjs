import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createAttemptAssetService } from '../../../src/modules/attempts/asset-service.mjs';
import { createImageFixture } from './image-fixture.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';

const rate = { capacity: 100, refillPerSecond: 10 };
const denied = (error) => error?.status === 404 && error?.code === 'NOT_FOUND';
async function fixture(t) {
  const f = await createImageFixture(t); await f.approveImage();
  f.attempts = createAttemptService({ examPool: f.examPool, identityService: f.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  f.attempt = (await f.attempts.create(f.principals.studentA, randomUUID(), { blueprintVersionId: f.blueprint.versionId })).body;
  await f.attempts.start(f.principals.studentA, f.attempt.attemptId, randomUUID());
  f.read = (imageStore = f.imageStore) => createAttemptAssetService({ examPool: f.examPool,
    identityService: f.identityService, imageStore }).read(f.principals.studentA, f.attempt.attemptId, f.assets.QUESTION.id, 'question');
  return f;
}
async function waiting(f, application) {
  const until = Date.now()+1000;
  while (Date.now()<until) {
    if ((await f.pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [application])).rows[0].n) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('Concurrent transaction did not reach its PostgreSQL lock barrier');
}
function gateStore(store) {
  let entered, release;
  const reached = new Promise((resolve) => { entered=resolve; });
  const gate = new Promise((resolve) => { release=resolve; });
  return { reached, release, store: { status: store.status, async read(...args) { entered(); await gate; return store.read(...args); } } };
}

async function revoke(f, pool = f.bankPool) {
  const sources = await createSourceService({ bankPool: pool, identityService: f.identityService });
  return sources.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic image rights ordering test.', expectedRevision: 1,
  });
}

for (const change of ['submit','quarantine','rights']) test(`guarded bytes linearize before concurrent ${change}, then subsequent reads deny`, { timeout: 15000 }, async (t) => {
  const f = await fixture(t), gate = gateStore(f.imageStore);
  let read, write;
  try {
    read=f.read(gate.store); await gate.reached;
    write=change==='rights' ? revoke(f) : change==='submit' ? f.attempts.submit(f.principals.studentA, f.attempt.attemptId, randomUUID())
      : f.imageWorkflow.quarantine(f.principals.bankManager, f.imageQuestion.versionId, randomUUID(), {
        expectedRevision:3,reason:'Synthetic ordered image quarantine' });
    // Observe an actual database waiter; no probabilistic delay chooses the winner.
    await waiting(f, change==='submit' ? 'tsa-allocation-exam-test' : 'tsa-bank-api-test');
    gate.release();
    assert.deepEqual((await read).bytes, f.assets.QUESTION.bytes);
    await write;
    await assert.rejects(f.read(), denied);
  } finally { gate.release(); await Promise.allSettled([read,write].filter(Boolean)); }
});

for (const change of ['submit','quarantine','rights']) test(`committed ${change} before asset authorization returns no bytes`, { timeout: 15000 }, async (t) => {
  const f=await fixture(t);
  if(change==='rights') await revoke(f);
  else if(change==='submit') await f.attempts.submit(f.principals.studentA,f.attempt.attemptId,randomUUID());
  else await f.imageWorkflow.quarantine(f.principals.bankManager,f.imageQuestion.versionId,randomUUID(),{
    expectedRevision:3,reason:'Synthetic quarantine precedes asset authorization' });
  await assert.rejects(f.read(),denied);
});

test('an in-flight rights hold commits before the blocked image read and denies its bytes', { timeout: 15000 }, async (t) => {
  const f=await fixture(t);
  let entered, release;
  const reached=new Promise((resolve)=>{entered=resolve;});
  const gate=new Promise((resolve)=>{release=resolve;});
  const pool={ query:(...args)=>f.bankPool.query(...args), async connect() {
    const client=await f.bankPool.connect();
    return new Proxy(client,{get(target,name) {
      if(name==='query') return async (...args)=>{
        const result=await target.query(...args);
        if(typeof args[0]==='string' && args[0].includes('tsa.bank_apply_delivery_hold')) { entered(); await gate; }
        return result;
      };
      const value=Reflect.get(target,name,target); return typeof value==='function'?value.bind(target):value;
    }});
  }};
  let read, write;
  try {
    write=revoke(f,pool); await reached;
    read=assert.rejects(f.read(),denied);
    await waiting(f,'tsa-allocation-exam-test'); release();
    await write; await read;
  } finally { release(); await Promise.allSettled([read,write].filter(Boolean)); }
});

test('explanation read waits for a real grading release commit and cannot see its uncommitted result', { timeout: 15000 }, async (t) => {
  const f=await fixture(t);
  await f.attempts.submit(f.principals.studentA,f.attempt.attemptId,randomUUID());
  const assets=createAttemptAssetService({examPool:f.examPool,identityService:f.identityService,imageStore:f.imageStore});
  const read=()=>assets.read(f.principals.studentA,f.attempt.attemptId,f.assets.EXPLANATION.id,'explanation');
  await assert.rejects(read(),denied);
  let entered,release;
  const reached=new Promise(resolve=>{entered=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const pool={async connect(){
    const client=await f.pool.connect();
    return new Proxy(client,{get(target,name){
      if(name==='query')return async(...args)=>{
        const result=await target.query(...args);
        if(typeof args[0]==='string'&&args[0].includes('tsa.exam_worker_finish')){entered();await gate;}
        return result;
      };
      const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;
    }});
  }};
  const worker=createExamWorker({workerPool:pool,executorId:'image-release-barrier',leaseSeconds:30,retrySeconds:1});
  let grade,image;
  try{
    grade=worker.runOnce();await reached;image=read();
    await waiting(f,'tsa-allocation-exam-test');release();
    assert.equal((await grade).status,'GRADED');
    assert.deepEqual((await image).bytes,f.assets.EXPLANATION.bytes);
  }finally{release();await Promise.allSettled([grade,image].filter(Boolean));}
});
