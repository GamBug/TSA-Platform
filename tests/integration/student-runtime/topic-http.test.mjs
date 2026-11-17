import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createDomainStudentFixture } from './domain-fixture.mjs';

function browser(origin) {
  const jar = new Map();
  const fetchImpl = async (pathname, options = {}) => {
    const headers = new Headers(options.headers); headers.set('origin', origin);
    if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(`${origin}${pathname}`, { ...options, headers });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], at = pair.indexOf('=');
      if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
    }
    return response;
  };
  return { fetchImpl, api: () => createPersistentApi({ fetchImpl, readCookie: (key) => jar.get(key) }),
    post: (pathname, body, key = randomUUID()) => fetchImpl(pathname, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-csrf-token': jar.get('tsa_local_csrf'), 'idempotency-key': key,
    }, body: JSON.stringify(body) }) };
}
function responseFor(slot) {
  const interaction = slot.interaction;
  if (interaction.type === 'MULTIPLE_CHOICE') return { type: 'MULTIPLE_CHOICE', optionIds: interaction.options.slice(0, interaction.minSelections).map((option) => option.id) };
  if (interaction.type === 'TRUE_FALSE_GROUP') return { type: 'TRUE_FALSE_GROUP', statementValues: interaction.statements.map((statement) => ({ statementId: statement.id, value: true })) };
  return { optionId: interaction.options[0].id };
}

test('topic HTTP catalog and selected practice persist, replay, grade and isolate candidate progress', { timeout: 30000 }, async (t) => {
  const f = await createDomainStudentFixture();
  let workerPool, runtime;
  t.after(async () => { await runtime?.close(); await workerPool?.end(); await f.close(); });
  await f.pool.query('CREATE ROLE topic_http_worker LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO topic_http_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'topic_http_worker' });
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: f.harness.authPool, examPool: f.examPool, workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0,
    pollMilliseconds: 20, sweepBatchSize: 10, executorId: 'topic-http-test', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  assert.equal((await fetch(`${runtime.origin}/api/v1/topics`)).status, 401);
  const a = browser(runtime.origin); let api = a.api(); await api.loginCandidate('studentA');
  const catalog = await api.loadTopics({ durationSeconds: 180 });
  const math = catalog.groups.find((group) => group.code === 'MATH');
  assert.ok(math); assert.equal(math.eligibleCount, 4); assert.equal(math.attemptedCount, 0); assert.equal(math.accuracy, null);
  assert.ok(math.children.length);
  assert.doesNotMatch(JSON.stringify(catalog), /answerKey|explanation|correctOption|sourceVersion|objectKey/);
  const request = { taxonomyVersionId: math.taxonomyVersionId, topicIds: [math.id, math.children[0].id], questionCount: 2, durationSeconds: 180 };
  for (const [body, status] of [[{ ...request, topicIds: [] }, 422], [{ ...request, questionCount: 100 }, 409],
    [{ ...request, topicIds: [randomUUID()] }, 422]]) {
    assert.equal((await a.post('/api/v1/topic-practice', body)).status, status);
  }
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 0);
  assert.equal((await a.fetchImpl('/api/v1/topics?durationSeconds=0')).status, 422);
  assert.equal((await a.fetchImpl('/api/v1/topics?durationSeconds=120&durationSeconds=180')).status, 422);
  const intent = { body: request, key: randomUUID() };
  const created = await api.createTopicAttempt(intent);
  assert.equal(created.attempt.state, 'CREATED'); assert.equal(created.attempt.questionCount, 2);
  assert.equal(created.attempt.practiceProfile.durationSeconds, 180);
  const attemptId = created.attempt.attemptId;
  const ordinary = await api.loadCatalog();
  assert.equal(ordinary.domains.length, 3, 'private recipes do not become catalog offerings');
  const started = await api.startReservedAttempt(attemptId);
  assert.equal(started.attempt.slots.length, 2); assert.equal(started.attempt.durationSeconds, 180);
  const slot = started.attempt.slots[0]; await api.saveAnswer(attemptId, slot.slotId, responseFor(slot));
  const inProgress = (await api.loadTopics({ durationSeconds: 180 })).groups.find((group) => group.id === math.id);
  assert.equal(inProgress.attemptedCount, 1); assert.equal(inProgress.accuracy, null, 'unreleased correctness stays unavailable');
  const clock = (await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0];
  const conflict = await a.post('/api/v1/topic-practice', request);
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error.code, 'CONCURRENT_ATTEMPT_EXISTS');
  const changed = await a.post('/api/v1/topic-practice', { ...request, questionCount: 1 }, intent.key);
  assert.equal(changed.status, 409); assert.equal((await changed.json()).error.code, 'IDEMPOTENCY_CONFLICT');
  const replay = await api.createTopicAttempt(intent); assert.equal(replay.attempt.attemptId, attemptId);
  api = a.api(); const resumed = await api.openDemoSession();
  assert.equal(resumed.attempt.attemptId, attemptId); assert.equal(resumed.attempt.answeredCount, 1);
  assert.deepEqual((await f.pool.query('SELECT started_at::text,deadline_at::text FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0], clock);
  await api.submitAttempt(attemptId);
  let graded; const until = Date.now() + 5000;
  do { graded = await api.readAttempt(attemptId); if (graded.attempt.state === 'GRADED') break; await new Promise((resolve) => setTimeout(resolve, 20)); } while (Date.now() < until);
  assert.equal(graded.attempt.state, 'GRADED'); assert.equal(graded.attempt.result.totalCount, 2);
  const after = (await api.loadTopics({ durationSeconds: 180 })).groups.find((group) => group.id === math.id);
  assert.equal(after.eligibleCount, 2); assert.equal(after.attemptedCount, 1); assert.equal(typeof after.accuracy, 'number');
  const b = browser(runtime.origin); const other = b.api(); await other.loginCandidate('studentB');
  const otherMath = (await other.loadTopics()).groups.find((group) => group.id === math.id);
  assert.equal(otherMath.eligibleCount, 4); assert.equal(otherMath.attemptedCount, 0); assert.equal(otherMath.accuracy, null);
  assert.equal((await b.fetchImpl(`/api/v1/attempts/${attemptId}`)).status, 404);
  const guessed = await b.post('/api/v1/attempts', { blueprintVersionId: created.attempt.practiceProfile.blueprintVersionId });
  assert.ok([403,404,410,422].includes(guessed.status), 'private recipe guesses cannot allocate another student topic form');
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 1);
});
