import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createMixedStudentFixture } from './mixed-fixture.mjs';

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
