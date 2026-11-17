import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createMixedStudentFixture } from './mixed-fixture.mjs';

test('delayed real HTTP snapshots cannot erase committed saves or reopen a submitted attempt', { timeout: 30_000 }, async (t) => {
  const f = await createMixedStudentFixture();
  let workerPool, runtime, held;
  t.after(async () => {
    held?.release();
    const errors = [];
    for (const close of [() => runtime?.close(), () => workerPool?.end(), () => f.close()]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Delayed-read fixture cleanup failed');
  });
  await f.pool.query('CREATE ROLE delayed_read_worker LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO delayed_read_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'delayed_read_worker' });
  const isolatedWorker = { async connect() {
    const client = await workerPool.connect();
    return new Proxy(client, { get(target, name) {
      if (name === 'query') return (sql, values) => {
        if (typeof sql === 'string' && /tsa\.exam_worker_(claim|sweep)\(/.test(sql)) throw new Error('Worker progress isolated during response-order test');
        return target.query(sql, values);
      };
      const value = Reflect.get(target, name, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: f.harness.authPool, examPool: f.examPool, workerPool: isolatedWorker,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0, pollMilliseconds: 60_000,
    sweepBatchSize: 10, executorId: 'delayed-read-isolated', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  let jar = new Map(), swapMode = null, secondJar;
  const revisions = [];
  let createDispatches = 0, cookieSwaps = 0;
  function holdResponse(match) {
    let enter, release;
    const entered = new Promise((resolve) => { enter = resolve; });
    const wait = new Promise((resolve) => { release = resolve; });
    held = { match, enter, wait, release }; return { entered, release };
  }
  const fetchImpl = async (path, options = {}) => {
    const headers = new Headers(options.headers); headers.set('origin', runtime.origin);
    if (jar.size) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    const reply = await fetch(runtime.origin + path, { ...options, headers, signal: AbortSignal.timeout(5000) });
    for (const line of reply.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], at = pair.indexOf('=');
      if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
    }
    if (options.method === 'PUT') revisions.push(JSON.parse(options.body).expectedRevision);
    if (path === '/api/v1/attempts' && options.method === 'POST') createDispatches++;
    if (swapMode === 'SESSION_HEADERS' && path === '/local-auth/session') {
      swapMode = null; jar = secondJar; cookieSwaps++;
    }
    if (swapMode === 'HISTORY_OUTER' && path.startsWith('/api/v1/attempts?')) {
      swapMode = null;
      const decode = reply.json.bind(reply);
      reply.json = async () => {
        const value = await decode();
        queueMicrotask(() => queueMicrotask(() => { jar = secondJar; cookieSwaps++; }));
        return value;
      };
    }
    if (held?.match(path, options)) {
      const gate = held; held = null;
      const bytes = await reply.arrayBuffer();
      gate.enter(); await gate.wait;
      return new Response(bytes, { status: reply.status, headers: reply.headers });
    }
    return reply;
  };
  const api = createPersistentApi({ fetchImpl, readCookie: (name) => jar.get(name) });
  await api.loginCandidate('studentA');
  const firstJar = jar;
  jar = new Map();
  const secondApi = createPersistentApi({ fetchImpl, readCookie: (name) => jar.get(name) });
  assert.equal((await secondApi.loginCandidate('studentB')).principal.userId, f.principals.studentB.userId);
  secondJar = jar; jar = firstJar;
  assert.notEqual(firstJar.get('tsa_local_csrf'), secondJar.get('tsa_local_csrf'));
  const allocationState = async () => (await f.pool.query(`SELECT
    (SELECT count(*)::integer FROM tsa.attempts) AS attempts,
    (SELECT count(*)::integer FROM tsa.forms) AS forms,
    (SELECT count(*)::integer FROM tsa.assembly_runs) AS manifests,
    (SELECT count(*)::integer FROM tsa.student_question_history) AS history,
    (SELECT count(*)::integer FROM tsa.student_allocation_state) AS allocation_state,
    (SELECT count(*)::integer FROM tsa.jobs) AS jobs,
    (SELECT count(*)::integer FROM tsa.rate_limit_buckets) AS budgets,
    (SELECT count(*)::integer FROM tsa.idempotency_records) AS receipts`)).rows[0];
  const initialAllocation = await allocationState();
  assert.equal(initialAllocation.attempts, 0);
  for (const mode of ['SESSION_HEADERS', 'HISTORY_OUTER']) {
    jar = firstJar; swapMode = mode;
    await assert.rejects(api.startDemo('MATH', f.blueprint.versionId), { code: 'UNAUTHENTICATED', status: 401 });
    assert.equal(createDispatches, 0, 'an A-initiated allocation must not dispatch for the replacement B session');
    assert.deepEqual(await allocationState(), initialAllocation, 'session changes consume no student inventory, quota or receipt');
  }
  assert.equal(cookieSwaps, 2, 'both real valid-session swap boundaries were exercised');
  jar = firstJar;
  const { attempt } = await api.startDemo('MATH', f.blueprint.versionId);
  assert.equal(createDispatches, 1, 'the original candidate can still explicitly allocate after rechecking identity');
  const path = `/api/v1/attempts/${attempt.attemptId}`, slot = attempt.slots.find((item) => item.interaction.type === 'SINGLE_CHOICE');
  const clock = (await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attempt.attemptId])).rows[0];

  const readGate = holdResponse((url, options) => url === path && options.method === 'GET');
  const oldRead = api.readAttempt(attempt.attemptId);
  try {
    await readGate.entered;
    await api.saveAnswer(attempt.attemptId, slot.slotId, 'b');
  } finally { readGate.release(); }
  assert.equal((await oldRead).attempt.answers.find((item) => item.slotId === slot.slotId).revision, 1);
  await api.saveAnswer(attempt.attemptId, slot.slotId, 'a');
  assert.deepEqual(revisions, [0, 1]);

  const ackGate = holdResponse((url, options) => url.endsWith(`/answers/${slot.slotId}`) && options.method === 'PUT');
  const delayedAck = api.saveAnswer(attempt.attemptId, slot.slotId, 'b');
  try {
    await ackGate.entered;
    assert.equal((await api.readAttempt(attempt.attemptId)).attempt.answers.find((item) => item.slotId === slot.slotId).revision, 3);
  } finally { ackGate.release(); }
  assert.equal((await delayedAck).attempt.answers.find((item) => item.slotId === slot.slotId).revision, 3);

  // Revoke the actual server session from a separate transport and intentionally
  // retain this client's cookies. A confirmed denial must fence its older GET.
  const authGate = holdResponse((url, options) => url === path && options.method === 'GET');
  const preRevocation = api.readAttempt(attempt.attemptId);
  const deniedOldRead = assert.rejects(preRevocation, { code: 'UNAUTHENTICATED', status: 401 });
  try {
    await authGate.entered;
    const cookieBefore = [...jar];
    const revoked = await fetch(`${runtime.origin}/local-auth/logout`, { method: 'POST', headers: {
      origin: runtime.origin, 'content-type': 'application/json', 'x-csrf-token': jar.get('tsa_local_csrf'),
      cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
    }, body: '{}', signal: AbortSignal.timeout(5000) });
    assert.equal(revoked.status, 200); await revoked.arrayBuffer();
    await assert.rejects(api.loadCatalog(), { code: 'UNAUTHENTICATED', status: 401 });
    assert.deepEqual([...jar], cookieBefore, 'the observed denial did not rotate the client cookie');
  } finally { authGate.release(); }
  await deniedOldRead;
  await assert.rejects(api.saveAnswer(attempt.attemptId, slot.slotId, 'a'), { code: 'ATTEMPT_CLOSED' });
  assert.deepEqual(revisions, [0, 1, 2], 'revocation does not resurrect cache or dispatch a stale PUT');
  await api.loginCandidate('studentA');
  assert.equal((await api.readAttempt(attempt.attemptId)).attempt.answers.find((item) => item.slotId === slot.slotId).revision, 3);

  const closeGate = holdResponse((url, options) => url === path && options.method === 'GET');
  const activeSnapshot = api.readAttempt(attempt.attemptId);
  try {
    await closeGate.entered; await api.submitAttempt(attempt.attemptId);
  } finally { closeGate.release(); }
  assert.equal((await activeSnapshot).attempt.state, 'SUBMITTED');
  await assert.rejects(api.saveAnswer(attempt.attemptId, slot.slotId, 'a'), { code: 'ATTEMPT_CLOSED' });
  assert.deepEqual(revisions, [0, 1, 2], 'closed local view prevents a fourth PUT');
  const stored = (await f.pool.query('SELECT revision::integer,value FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2', [attempt.attemptId, slot.slotId])).rows[0];
  assert.deepEqual(stored, { revision: 3, value: { type: 'SINGLE_CHOICE', optionId: 'b' } });
  assert.deepEqual((await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attempt.attemptId])).rows[0], clock);
  assert.equal((await f.pool.query('SELECT count(*)::integer AS count FROM tsa.jobs WHERE attempt_id=$1', [attempt.attemptId])).rows[0].count, 1);
});

test('browser transport uses actual auth rotation, typed revisions, replay and PostgreSQL grading', async (t) => {
  const f = await createMixedStudentFixture();
  let workerPool, runtime;
  t.after(async () => { if (runtime) await runtime.close(); if (workerPool) await workerPool.end(); await f.close(); });
  const login = `client_worker_${randomUUID().replaceAll('-', '')}`;
  await f.pool.query(`CREATE ROLE ${login} LOGIN`); await f.pool.query(`GRANT tsa_exam_worker TO ${login}`);
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: login });
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: f.harness.authPool, examPool: f.examPool, workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0, pollMilliseconds: 20,
    sweepBatchSize: 10, executorId: 'client-transport-test', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const jar = new Map(), calls = []; let loseAck = false, loseStartAck = false;
  const fetchImpl = async (path, options = {}) => {
    const headers = new Headers(options.headers);
    headers.set('origin', runtime.origin);
    if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(`${runtime.origin}${path}`, { ...options, headers });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], separator = pair.indexOf('=');
      if (pair.slice(separator + 1)) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      else jar.delete(pair.slice(0, separator));
    }
    calls.push({ path, method: options.method, key: headers.get('idempotency-key'), csrf: headers.get('x-csrf-token'), body: options.body });
    if (loseStartAck && options.method === 'POST' && path.endsWith('/start') && response.ok) { loseStartAck = false; await response.arrayBuffer(); throw new Error('Synthetic lost committed start acknowledgement'); }
    if (loseAck && options.method === 'PUT' && response.ok) { loseAck = false; await response.arrayBuffer(); throw new Error('Synthetic lost committed acknowledgement'); }
    return response;
  };
  const api = createPersistentApi({ fetchImpl, readCookie: (name) => jar.get(name) });
  await assert.rejects(api.openDemoSession(), { code: 'UNAUTHENTICATED' });
  await api.loginCandidate('studentA');
  const originalSession = jar.get('tsa_local_session');
  assert.ok(originalSession); assert.ok(jar.get('tsa_local_csrf'));
  const catalog = await api.loadCatalog();
  assert.equal(catalog.domains.length, 1); assert.equal(catalog.domains[0].blueprintVersionId, f.blueprint.versionId);
  const started = await api.startDemo('MATH', f.blueprint.versionId), attempt = started.attempt;
  assert.equal(attempt.state, 'IN_PROGRESS'); assert.equal(attempt.slots.length, 4);
  assert.equal(JSON.stringify(attempt).includes('correctAnswer'), false);
  const sc = attempt.slots.find((slot) => slot.interaction.type === 'SINGLE_CHOICE');
  loseAck = true;
  await assert.rejects(api.saveAnswer(attempt.attemptId, sc.slotId, { optionId: 'b' }), { code: 'TEMPORARILY_UNAVAILABLE' });
  const retried = await api.saveAnswer(attempt.attemptId, sc.slotId, { optionId: 'b' });
  assert.equal(retried.attempt.answers.find((item) => item.slotId === sc.slotId).revision, 1);
  const retries = calls.filter((item) => item.path.endsWith(`/answers/${sc.slotId}`));
  assert.equal(retries[0].key, retries[1].key); assert.equal(retries[0].body, retries[1].body);
  assert.equal((await f.pool.query('SELECT revision FROM tsa.answers WHERE attempt_id=$1 AND slot_id=$2',
    [attempt.attemptId, sc.slotId])).rows[0].revision, '1');
  // A second browser tab reads the same revision before this tab changes it.
  const otherTab = createPersistentApi({ fetchImpl, readCookie: (name) => jar.get(name) });
  await otherTab.readAttempt(attempt.attemptId);
  await api.saveAnswer(attempt.attemptId, sc.slotId, { optionId: null });
  await assert.rejects(otherTab.saveAnswer(attempt.attemptId, sc.slotId, { optionId: 'a' }), { code: 'REVISION_CONFLICT' });
  await api.readAttempt(attempt.attemptId);
  for (const slot of attempt.slots) {
    const value = slot.interaction.type === 'SINGLE_CHOICE' ? { optionId: 'b' }
      : slot.interaction.type === 'MULTIPLE_CHOICE' ? { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'c'] }
        : { type: 'TRUE_FALSE_GROUP', statementValues: [{ statementId: 's1', value: true }, { statementId: 's2', value: false }] };
    await api.saveAnswer(attempt.attemptId, slot.slotId, value);
  }
  assert.equal((await api.readAttempt(attempt.attemptId)).attempt.answeredCount, 4);
  const submitted = await api.submitAttempt(attempt.attemptId);
  assert.ok(['SUBMITTED', 'GRADED'].includes(submitted.attempt.state));
  let graded;
  for (let i = 0; i < 100; i++) {
    graded = await api.readAttempt(attempt.attemptId);
    if (graded.attempt.state === 'GRADED') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(graded.attempt.state, 'GRADED'); assert.equal(graded.attempt.result.percentage, '100.00');
  assert.equal((await api.readReview(attempt.attemptId)).review.slots.length, 4);
  assert.equal((await api.loadHistory())[0].attemptId, attempt.attemptId);
  await api.logout(); assert.equal(jar.has('tsa_local_session'), false);
  await api.loginCandidate('studentB'); assert.notEqual(jar.get('tsa_local_session'), originalSession);
  await assert.rejects(api.readAttempt(attempt.attemptId), { code: 'NOT_FOUND' });
  await assert.rejects(api.startReservedAttempt(attempt.attemptId), { code: 'NOT_FOUND' });
  const reservedResponse = await fetchImpl('/api/v1/attempts', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': jar.get('tsa_local_csrf'), 'idempotency-key': randomUUID() },
    body: JSON.stringify({ blueprintVersionId: f.blueprint.versionId }) });
  assert.equal(reservedResponse.status, 201);
  const reserved = await reservedResponse.json();
  loseStartAck = true;
  await assert.rejects(api.startReservedAttempt(reserved.attemptId), { code: 'TEMPORARILY_UNAVAILABLE' });
  const clocks = async () => (await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [reserved.attemptId])).rows[0];
  const committedStart = await clocks(); assert.ok(committedStart.started_at); assert.ok(committedStart.deadline_at);
  const retriedStart = await api.startReservedAttempt(reserved.attemptId);
  assert.equal(retriedStart.attempt.attemptId, reserved.attemptId); assert.equal(retriedStart.attempt.state, 'IN_PROGRESS');
  assert.deepEqual(await clocks(), committedStart);
  const startRetries = calls.filter((item) => item.path === `/api/v1/attempts/${reserved.attemptId}/start`);
  assert.equal(startRetries.length, 2); assert.equal(startRetries[0].key, startRetries[1].key); assert.equal(startRetries[0].body, startRetries[1].body);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 2);
  assert.ok(calls.every((item) => !item.path.startsWith('/mock')));
});
