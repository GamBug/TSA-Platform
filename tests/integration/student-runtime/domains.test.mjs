import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createDomainStudentFixture } from './domain-fixture.mjs';

test('three independent domain profiles use frozen student transport, distinct clocks and global active-attempt protection', { timeout: 30_000 }, async (t) => {
  const f = await createDomainStudentFixture();
  let workerPool, runtime;
  t.after(async () => { await runtime?.close(); await workerPool?.end(); await f.close(); });
  await f.pool.query('CREATE ROLE domain_worker LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO domain_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'domain_worker' });
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: f.harness.authPool, examPool: f.examPool, workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0,
    pollMilliseconds: 20, sweepBatchSize: 10, executorId: 'domain-transport-test', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const jar = new Map(), submitKeys = []; let loseSubmitAck = false;
  const fetchImpl = async (pathname, options = {}) => {
    const headers = new Headers(options.headers); headers.set('origin', runtime.origin);
    if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(`${runtime.origin}${pathname}`, { ...options, headers });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], at = pair.indexOf('=');
      if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
    }
    if (options.method === 'POST' && pathname.endsWith('/submit')) {
      submitKeys.push(headers.get('idempotency-key'));
      if (loseSubmitAck && response.ok) { loseSubmitAck = false; await response.arrayBuffer(); throw new Error('Synthetic lost submit acknowledgement'); }
    }
    return response;
  };
  const makeApi = () => createPersistentApi({ fetchImpl, readCookie: (key) => jar.get(key) });
  let api = makeApi(); await api.loginCandidate('studentA');
  const catalog = await api.loadCatalog();
  assert.deepEqual(catalog.domains.map((entry) => entry.domain).sort(), ['MATH', 'READING', 'SCIENCE']);
  const ids = new Set();
  for (const [domain, count, duration] of [['MATH', 4, 360], ['READING', 2, 180], ['SCIENCE', 4, 360]]) {
    const entry = catalog.domains.find((item) => item.domain === domain);
    assert.equal(entry.questionCount, count); assert.equal(entry.durationSeconds, duration);
    const { attempt } = await api.startDemo(domain, entry.blueprintVersionId);
    assert.equal(attempt.domain, domain); assert.equal(attempt.slots.length, count);
    const raw = await (await fetchImpl(`/api/v1/attempts/${attempt.attemptId}`)).json();
    assert.equal(raw.sections.length, 1); assert.equal(raw.sections[0].section, domain);
    assert.equal(attempt.durationSeconds, duration); assert.equal(ids.has(attempt.attemptId), false); ids.add(attempt.attemptId);
    const before = (await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attempt.attemptId])).rows[0];
    const historyBefore = (await f.pool.query('SELECT count(*)::int AS n FROM tsa.student_question_history')).rows[0].n;
    const other = catalog.domains.find((item) => item.domain !== domain);
    const blocked = await fetchImpl('/api/v1/attempts', { method: 'POST', headers: {
      'content-type': 'application/json', 'x-csrf-token': jar.get('tsa_local_csrf'), 'idempotency-key': randomUUID(),
    }, body: JSON.stringify({ blueprintVersionId: other.blueprintVersionId }) });
    assert.equal(blocked.status, 409); assert.equal((await blocked.json()).error.code, 'CONCURRENT_ATTEMPT_EXISTS');
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.student_question_history')).rows[0].n, historyBefore);
    for (const slot of attempt.slots) {
      const answer = slot.interaction.type === 'MULTIPLE_CHOICE' ? { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'c'] }
        : slot.interaction.type === 'TRUE_FALSE_GROUP' ? { type: 'TRUE_FALSE_GROUP', statementValues: [{ statementId: 's1', value: true }, { statementId: 's2', value: false }] }
          : { optionId: 'b' };
      await api.saveAnswer(attempt.attemptId, slot.slotId, answer);
    }
    api = makeApi();
    const resumed = await api.readAttempt(attempt.attemptId);
    assert.equal(resumed.attempt.answeredCount, count);
    assert.deepEqual((await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attempt.attemptId])).rows[0], before);
    loseSubmitAck = true;
    await assert.rejects(api.submitAttempt(attempt.attemptId), { code: 'TEMPORARILY_UNAVAILABLE' });
    await api.submitAttempt(attempt.attemptId);
    assert.equal(submitKeys.at(-1), submitKeys.at(-2));
    let graded;
    const deadline = Date.now() + 5_000;
    do {
      graded = await api.readAttempt(attempt.attemptId);
      if (graded.attempt.state === 'GRADED') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.equal(graded.attempt.state, 'GRADED'); assert.equal(graded.attempt.result.totalCount, count);
    assert.equal(graded.attempt.result.correctCount, count); assert.equal(graded.attempt.result.percentage, '100.00');
    assert.equal((await api.readReview(attempt.attemptId)).review.slots.length, count);
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.jobs WHERE attempt_id=$1', [attempt.attemptId])).rows[0].n, 1);
    await assert.rejects(api.startDemo(domain, entry.blueprintVersionId), { code: 'INSUFFICIENT_UNSEEN_INVENTORY' });
  }
  const history = await api.loadHistory();
  assert.equal(history.length, 3); assert.deepEqual(history.map((entry) => entry.domain).sort(), ['MATH', 'READING', 'SCIENCE']);
  assert.ok(history.every((entry) => entry.state === 'GRADED'));
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.student_question_history')).rows[0].n, 10);
});

test('explicit review practice completes three independent domains and preserves first assignment history', { timeout: 30000 }, async (t) => {
  const f = await createDomainStudentFixture();
  let workerPool, runtime;
  t.after(async () => {
    const errors = [];
    for (const close of [() => runtime?.close(), () => workerPool?.end(), () => f.close()]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Review domain fixture cleanup failed');
  });
  await f.pool.query('CREATE ROLE review_domain_worker LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO review_domain_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'review_domain_worker' });
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: f.harness.authPool, examPool: f.examPool, workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0, enableReviewPractice: true,
    pollMilliseconds: 20, sweepBatchSize: 10, executorId: 'review-domain-transport', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const jar = new Map();
  const fetchImpl = async (pathname, options = {}) => {
    const headers = new Headers(options.headers); headers.set('origin', runtime.origin);
    if (jar.size) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    const response = await fetch(`${runtime.origin}${pathname}`, { ...options, headers });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], at = pair.indexOf('=');
      if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
    }
    return response;
  };
  const api = createPersistentApi({ fetchImpl, readCookie: (name) => jar.get(name) });
  await api.loginCandidate('studentA');
  const rawCatalog = await (await fetchImpl('/api/v1/catalog')).json();
  assert.ok(rawCatalog.items.every((entry) => entry.reviewAllowed === true));
  const catalog = await api.loadCatalog();
  const history = async () => (await f.pool.query('SELECT to_jsonb(h) AS value FROM tsa.student_question_history h ORDER BY user_id,question_id')).rows;
  const finish = async (attempt) => {
    for (const slot of attempt.slots) {
      const response = slot.interaction.type === 'MULTIPLE_CHOICE' ? { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'c'] }
        : slot.interaction.type === 'TRUE_FALSE_GROUP' ? { type: 'TRUE_FALSE_GROUP', statementValues: [{ statementId: 's1', value: true }, { statementId: 's2', value: false }] }
          : { optionId: 'b' };
      await api.saveAnswer(attempt.attemptId, slot.slotId, response);
    }
    await api.submitAttempt(attempt.attemptId);
    const until = Date.now() + 5000;
    let result;
    do {
      result = await api.readAttempt(attempt.attemptId);
      if (result.attempt.state === 'GRADED') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    } while (Date.now() < until);
    assert.equal(result.attempt.state, 'GRADED');
    assert.equal(result.attempt.result.percentage, '100.00');
    return (await (await fetchImpl(`/api/v1/attempts/${attempt.attemptId}/result`)).json());
  };
  for (const domain of ['MATH', 'READING', 'SCIENCE']) {
    const entry = catalog.domains.find((item) => item.domain === domain);
    const original = (await api.startDemo(domain, entry.blueprintVersionId)).attempt;
    await finish(original);
    const before = await history();
    await assert.rejects(api.startDemo(domain, entry.blueprintVersionId), (error) => {
      assert.equal(error.code, 'INSUFFICIENT_UNSEEN_INVENTORY');
      assert.deepEqual(error.details.alternatives, [{ kind: 'REVIEW_MODE', blueprintVersionId: entry.blueprintVersionId, requiresRepeatConsent: true }]);
      return true;
    });
    const intent = api.prepareReviewAttempt(entry.blueprintVersionId);
    const receipt = await api.createReviewAttempt(intent);
    assert.equal(receipt.reuseMode, 'REVIEW_ALLOWED'); assert.equal(receipt.domain, domain);
    assert.notEqual(receipt.attemptId, original.attemptId); assert.notEqual(receipt.formId, original.formId);
    const reserved = (await api.readReviewAttempt(receipt.attemptId, domain)).attempt;
    assert.equal(reserved.state, 'CREATED'); assert.deepEqual(reserved.slots, []);
    const repeated = (await api.startReservedAttempt(receipt.attemptId, { formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'REVIEW_ALLOWED', domain })).attempt;
    assert.equal(repeated.reuseMode, 'REVIEW_ALLOWED'); assert.equal(repeated.domain, domain);
    assert.equal(repeated.durationSeconds, entry.durationSeconds); assert.equal(repeated.slots.length, entry.questionCount);
    assert.deepEqual(await history(), before, 'repeat assignments preserve full existing first-history rows');
    const result = await finish(repeated);
    assert.equal(result.reuseMode, 'REVIEW_ALLOWED'); assert.equal(result.domain, domain);
    assert.equal(result.correctCount, entry.questionCount); assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0].section, domain); assert.equal(result.scoreLabel, 'UNOFFICIAL_PRACTICE');
    await assert.rejects(api.startDemo(domain, entry.blueprintVersionId), { code: 'INSUFFICIENT_UNSEEN_INVENTORY' });
  }
  const entries = await api.loadHistory();
  assert.equal(entries.length, 6); assert.ok(entries.every((entry) => entry.state === 'GRADED'));
  assert.equal(entries.filter((entry) => entry.reuseMode === 'REVIEW_ALLOWED').length, 3);
  assert.equal((await history()).length, 10);
});

test('review consent cannot transfer to another candidate when cookies change after the session check', {timeout:30000}, async(t)=>{
  const f=await createDomainStudentFixture();let workerPool,runtime;
  t.after(async()=>{const errors=[];for(const close of [()=>runtime?.close(),()=>workerPool?.end(),()=>f.close()]){try{await close();}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'Review identity fixture cleanup failed');});
  await f.pool.query('CREATE ROLE review_identity_worker LOGIN');await f.pool.query('GRANT tsa_exam_worker TO review_identity_worker');
  workerPool=createDatabasePool({...f.harness.database.connectionConfig,user:'review_identity_worker'});
  runtime=await createStudentRuntime({identityPool:f.harness.authPool,examPool:f.examPool,workerPool,env:{NODE_ENV:'test',LOCAL_SYNTHETIC_ONLY:'true'},port:0,
    enableReviewPractice:true,pollMilliseconds:20,sweepBatchSize:10,executorId:'review-identity-test',leaseSeconds:30,retrySeconds:1,
    createRate:{capacity:100,refillPerSecond:10},saveRate:{user:{capacity:100,refillPerSecond:10},attempt:{capacity:100,refillPerSecond:10}}});
  const jarA=new Map(),jarB=new Map();let activeJar=jarA,changeAfterSession=false,changeAtDispatch=false,createPosts=0;
  const transport=(jarForRequest,afterResponse=()=>{},beforeRequest=()=>{})=>async(pathname,options={})=>{
    beforeRequest(pathname,options);
    const jar=jarForRequest(),headers=new Headers(options.headers);headers.set('origin',runtime.origin);
    if(jar.size)headers.set('cookie',[...jar].map(([name,value])=>`${name}=${value}`).join('; '));
    if(pathname==='/api/v1/attempts'&&options.method==='POST')createPosts++;
    const response=await fetch(runtime.origin+pathname,{...options,headers});
    for(const line of response.headers.getSetCookie()){const pair=line.split(';',1)[0],at=pair.indexOf('=');if(pair.slice(at+1))jar.set(pair.slice(0,at),pair.slice(at+1));else jar.delete(pair.slice(0,at));}
    afterResponse(pathname);return response;
  };
  const apiA=createPersistentApi({fetchImpl:transport(()=>activeJar,pathname=>{
    // The other tab replaces cookies after A's real authenticated session response.
    if(changeAfterSession&&pathname==='/local-auth/session'){changeAfterSession=false;activeJar=jarB;}
  },(pathname,options)=>{
    if(changeAtDispatch&&pathname==='/api/v1/attempts'&&options.method==='POST'){changeAtDispatch=false;activeJar=jarB;}
  }),readCookie:name=>activeJar.get(name)});
  const apiB=createPersistentApi({fetchImpl:transport(()=>jarB),readCookie:name=>jarB.get(name)});
  await apiA.loginCandidate('studentA');await apiB.loginCandidate('studentB');
  assert.ok(jarA.get('tsa_local_csrf')!==jarB.get('tsa_local_csrf'),'fixture sessions have distinct CSRF nonces');
  const intent=apiA.prepareReviewAttempt(f.blueprint.versionId);changeAfterSession=true;
  await assert.rejects(apiA.createReviewAttempt(intent),{code:'UNAUTHENTICATED'});
  assert.equal(createPosts,0,'a prior candidate repeat-consent intent must not create for the new session');
  activeJar=jarA;const secondIntent=apiA.prepareReviewAttempt(f.blueprint.versionId);changeAtDispatch=true;
  await assert.rejects(apiA.createReviewAttempt(secondIntent),error=>{assert.equal(error.status,403);return true;});
  assert.equal(createPosts,1,'a dispatch-time cookie change reaches the server with the original nonce and fails CSRF');
  assert.equal((await f.pool.query('SELECT count(*)::integer AS n FROM tsa.attempts')).rows[0].n,0);
});
