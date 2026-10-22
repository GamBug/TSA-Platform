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
