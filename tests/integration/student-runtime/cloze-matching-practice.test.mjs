import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createClozeMatchingFixture } from './cloze-matching-fixture.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createExamSweeper } from '../../../src/modules/jobs/exam-sweeper.mjs';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';

const rate = { capacity: 200, refillPerSecond: 20 };

async function grader(fixture, label) {
  const login = `cloze_${label}_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${login} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${login}`);
  return createDatabasePool({ ...fixture.harness.database.connectionConfig, user: login });
}

async function startRuntime(fixture, workerPool, label) {
  return createStudentRuntime({
    identityPool: fixture.harness.authPool, examPool: fixture.examPool, workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0,
    enableClozeMatching: true, pollMilliseconds: 20, sweepBatchSize: 10,
    executorId: `cloze-${label}-${randomUUID()}`, leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate },
  });
}

function makeSender(origin) {
  const jar = new Map();
  return {
    jar,
    async send(path, method = 'GET', body, { key = randomUUID(), csrf = true } = {}) {
      const headers = new Headers({ origin });
      if (jar.size) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
      if (body !== undefined) {
        headers.set('content-type', 'application/json');
        headers.set('idempotency-key', key);
      }
      if (csrf && jar.has('tsa_local_csrf')) headers.set('x-csrf-token', jar.get('tsa_local_csrf'));
      const response = await fetch(origin + path, {
        method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';'), separator = pair.indexOf('=');
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      return { status: response.status, data: await response.json() };
    },
  };
}

async function login(sender, actorKey, bootstrap = false) {
  if (bootstrap) assert.equal((await sender.send('/local-auth/bootstrap', 'POST', {})).status, 201);
  assert.equal((await sender.send('/local-auth/login', 'POST', { actorKey })).status, 200);
}

function expectedResponse(key) {
  if (key.type === 'CLOZE') return { type: 'CLOZE', values: { city: '  Ha Noi  ', ratio: '  3:2 ' } };
  if (key.type === 'MATCHING') return { type: 'MATCHING', assignments: key.answers };
  if (key.type === 'NUMERIC_RESPONSE') return { type: 'NUMERIC_RESPONSE', value: ' +01,5000 ' };
  return { type: 'SINGLE_CHOICE', optionId: key.optionId };
}

test('v4 native interactions allocate, save, retry, clear, grade, isolate owners, and release private keys', { timeout: 60000 }, async (t) => {
  const fixture = await createClozeMatchingFixture();
  let workerPool, runtime;
  t.after(async () => { await runtime?.close(); await workerPool?.end(); await fixture.close(); });
  workerPool = await grader(fixture, 'http');
  runtime = await startRuntime(fixture, workerPool, 'http');
  const studentA = makeSender(runtime.origin), studentB = makeSender(runtime.origin);
  assert.equal((await studentA.send('/api/v4/catalog')).status, 401);
  await login(studentA, 'studentA', true);
  await login(studentB, 'studentB', true);

  const catalog = await studentA.send('/api/v4/catalog');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.data.items.length, 1);
  assert.equal(catalog.data.items[0].blueprintVersionId, fixture.blueprint.versionId);
  assert.equal((await studentA.send('/api/v1/catalog')).data.items.length, 0);
  for (const version of ['v2', 'v3']) assert.equal((await studentA.send(`/api/${version}/catalog`)).status, 404);

  const createKey = randomUUID();
  const createRequest = { blueprintVersionId: fixture.blueprint.versionId };
  const created = await studentA.send('/api/v4/attempts', 'POST', createRequest, { key: createKey });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const attemptId = created.data.attemptId;
  const createReplay = await studentA.send('/api/v4/attempts', 'POST', createRequest, { key: createKey });
  assert.equal(createReplay.status, 201);
  assert.equal(createReplay.data.attemptId, attemptId);
  assert.equal((await studentB.send(`/api/v4/attempts/${attemptId}`)).status, 404);
  assert.equal((await studentA.send(`/api/v1/attempts/${attemptId}`)).status, 404);
  assert.equal((await studentA.send(`/api/v2/attempts/${attemptId}`)).status, 404);
  assert.equal((await studentA.send(`/api/v3/attempts/${attemptId}`)).status, 404);
  const legacy = createAttemptService({ examPool: fixture.examPool, identityService: fixture.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  assert.equal(await legacy.read(fixture.principals.studentA, attemptId), null);

  assert.equal((await studentA.send(`/api/v4/attempts/${attemptId}/start`, 'POST', {}, { csrf: false })).status, 403);
  assert.equal((await studentA.send(`/api/v4/attempts/${attemptId}/start`, 'POST', {})).status, 200);
  let view = await studentA.send(`/api/v4/attempts/${attemptId}`);
  assert.equal(view.status, 200);
  assert.equal(view.data.slots.length, 4);
  assert.doesNotMatch(JSON.stringify(view.data), /answerKey|acceptedValues|CLOZE_MATCHING_PRIVATE/);
  const slotsByType = new Map(view.data.slots.map((slot) => [slot.interaction.type, slot]));
  const databaseSlots = new Map((await fixture.pool.query(
    'SELECT slot_id,question_version_id FROM tsa.form_slots WHERE form_id=$1', [created.data.formId],
  )).rows.map((row) => [row.slot_id, fixture.keyByVersion.get(row.question_version_id)]));
  const slotFor = (type) => slotsByType.get(type);
  const save = (slot, expectedRevision, value, idempotencyKey = randomUUID()) => studentA.send(
    `/api/v4/attempts/${attemptId}/answers/${slot.slotId}`, 'PUT', { expectedRevision, value }, { key: idempotencyKey },
  );

  const clozeSlot = slotFor('CLOZE');
  const partial = { type: 'CLOZE', values: { city: '  Ha Noi  ' } }, partialKey = randomUUID();
  const partialAck = await save(clozeSlot, 0, partial, partialKey);
  assert.equal(partialAck.status, 200);
  assert.equal(partialAck.data.value.values.city, '  Ha Noi  ');
  assert.deepEqual((await save(clozeSlot, 0, partial, partialKey)).data, partialAck.data,
    'retry after a lost acknowledgement returns the original receipt');
  assert.equal((await save(clozeSlot, 1, { type: 'CLOZE', values: { unknown: 'x' } })).status, 422);
  assert.equal((await save(clozeSlot, 1, { type: 'CLOZE', values: { city: 'x'.repeat(41) } })).status, 422);
  const cleared = await save(clozeSlot, 1, { type: 'CLOZE', values: { city: null } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.value.values.city, null);
  const completedCloze = await save(clozeSlot, 2, expectedResponse(databaseSlots.get(clozeSlot.slotId)));
  assert.equal(completedCloze.status, 200);
  assert.equal(completedCloze.data.value.values.ratio, '  3:2 ');
  const stale = await save(clozeSlot, 2, { type: 'CLOZE', values: { city: 'different' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, 'REVISION_CONFLICT');
  assert.equal(stale.data.error.details.currentAnswer.values.city, '  Ha Noi  ');

  const matchingSlot = slotFor('MATCHING');
  assert.equal((await save(matchingSlot, 0, { type: 'MATCHING', assignments: {
    'row-a': 'target-red', 'row-b': 'target-red', 'row-c': 'target-green',
  } })).status, 422);
  assert.equal((await save(matchingSlot, 0, { type: 'MATCHING', assignments: { 'row-a': 'unknown' } })).status, 422);
  assert.equal((await save(matchingSlot, 0, { type: 'MATCHING', assignments: { 'row-a': null } })).status, 200);
  const matchingAnswer = expectedResponse(databaseSlots.get(matchingSlot.slotId));
  assert.equal((await save(matchingSlot, 1, matchingAnswer)).status, 200);

  for (const type of ['NUMERIC_RESPONSE', 'SINGLE_CHOICE']) {
    const slot = slotFor(type), value = expectedResponse(databaseSlots.get(slot.slotId));
    assert.equal((await save(slot, 0, value)).status, 200);
  }
  view = await studentA.send(`/api/v4/attempts/${attemptId}`);
  assert.equal(view.status, 200);
  assert.equal(view.data.answers.length, 4);
  assert.equal(view.data.answers.find((answer) => answer.slotId === clozeSlot.slotId).value.values.city, '  Ha Noi  ');
  assert.equal(view.data.answers.find((answer) => answer.slotId === slotFor('NUMERIC_RESPONSE').slotId).value.value, ' +01,5000 ');
  assert.doesNotMatch(JSON.stringify(view.data), /answerKey|acceptedValues|CLOZE_MATCHING_PRIVATE/);

  const csrfFailure = await studentA.send(`/api/v4/attempts/${attemptId}/submit`, 'POST', {}, { csrf: false });
  assert.equal(csrfFailure.status, 403);
  assert.equal((await studentA.send(`/api/v4/attempts/${attemptId}/submit`, 'POST', {})).status, 200);
  assert.equal((await studentA.send(`/api/v4/attempts/${attemptId}/result`)).status, 409);
  let released, until = Date.now() + 8_000;
  do {
    released = await studentA.send(`/api/v4/attempts/${attemptId}/result`);
    if (released.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < until);
  assert.equal(released.status, 200);
  assert.equal(released.data.policyVersion, 'practice-binary-v3');
  assert.equal(released.data.correctCount, 4);
  assert.equal(released.data.totalCount, 4);
  assert.deepEqual(new Set(released.data.items.map((item) => item.correctAnswer.type)),
    new Set(['CLOZE', 'MATCHING', 'NUMERIC_RESPONSE', 'SINGLE_CHOICE']));
  assert.equal(released.data.items.find((item) => item.correctAnswer.type === 'CLOZE')
    .correctAnswer.acceptedValues.city[0], 'Ha Noi');
  assert.equal((await studentA.send('/api/v4/attempts')).data.items[0].score.totalCount, 4);
  assert.equal((await studentB.send(`/api/v4/attempts/${attemptId}/result`)).status, 404);
});

test('v4 expiry is swept and graded after the student transaction has ended', { timeout: 30000 }, async (t) => {
  const fixture = await createClozeMatchingFixture({ durationSeconds: 1 });
  let workerPool, runtime;
  t.after(async () => { await runtime?.close(); await workerPool?.end(); await fixture.close(); });
  workerPool = await grader(fixture, 'expiry');
  const isolatedWorkerPool = {
    async connect() {
      const client = await workerPool.connect();
      return new Proxy(client, { get(target, property) {
        if (property === 'query') return (sql, values) => typeof sql === 'string' && /tsa\.exam_worker_claim\(/.test(sql)
          ? Promise.resolve({ rows: [{ result: { status: 'IDLE' } }] })
          : target.query(sql, values);
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
  };
  runtime = await startRuntime(fixture, isolatedWorkerPool, 'expiry');
  const student = makeSender(runtime.origin);
  await login(student, 'studentA', true);
  const created = await student.send('/api/v4/attempts', 'POST', { blueprintVersionId: fixture.blueprint.versionId });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const attemptId = created.data.attemptId;
  assert.equal((await student.send(`/api/v4/attempts/${attemptId}/start`, 'POST', {})).status, 200);

  let attempt, until = Date.now() + 8_000;
  do {
    attempt = await student.send(`/api/v4/attempts/${attemptId}`);
    if (attempt.status === 200 && attempt.data.state === 'EXPIRED') break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  } while (Date.now() < until);
  assert.equal(attempt.status, 200);
  assert.equal(attempt.data.state, 'EXPIRED');
  assert.equal((await student.send(`/api/v4/attempts/${attemptId}/result`)).status, 409);
  assert.equal((await createExamWorker({ workerPool, executorId: 'cloze-expiry-grader', leaseSeconds: 30, retrySeconds: 1 }).runOnce()).status, 'GRADED');
  const result = await student.send(`/api/v4/attempts/${attemptId}/result`);
  assert.equal(result.status, 200);
  assert.equal(result.data.correctCount, 0);
  assert.equal(result.data.totalCount, 4);
  const history = await student.send('/api/v4/attempts');
  assert.equal(history.data.items[0].state, 'GRADED');
});
