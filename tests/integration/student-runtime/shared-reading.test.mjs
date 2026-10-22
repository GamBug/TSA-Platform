import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createSharedReadingFixture } from './shared-reading-fixture.mjs';

function assertSafe(value) {
  const forbidden = new Set(['answerKey', 'correctAnswer', 'explanation', 'provenance', 'reviewNotes', 'keySnapshot', 'privateHash', 'questionVersionId', 'contentHash', 'manifest', 'diagnostics', 'sourceVersionId', 'provenanceIds', 'reviewerId']);
  if (Array.isArray(value)) return value.forEach(assertSafe);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.has(key), false, `private field ${key}`); assertSafe(child); }
}
async function setup(t) {
  const f = await createSharedReadingFixture();
  let runtime, workerPool;
  t.after(async () => { await runtime?.close(); await workerPool?.end(); await f.close(); });
  await f.pool.query('CREATE ROLE reading_worker LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO reading_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'reading_worker' });
  const rate = { capacity: 100, refillPerSecond: 10 };
  runtime = await createStudentRuntime({ identityPool: f.harness.authPool, examPool: f.examPool, workerPool,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0,
    pollMilliseconds: 20, sweepBatchSize: 10, executorId: 'reading-transport-test', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  function session() {
    const jar = new Map();
    const fetchImpl = async (pathname, options = {}) => {
      const headers = new Headers(options.headers); headers.set('origin', runtime.origin);
      if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
      const response = await fetch(`${runtime.origin}${pathname}`, { ...options, headers });
      for (const line of response.headers.getSetCookie()) {
        const pair = line.split(';', 1)[0], at = pair.indexOf('=');
        if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
      }
      return response;
    };
    const api = () => createPersistentApi({ fetchImpl, readCookie: (key) => jar.get(key) });
    const mutate = (path, body) => fetchImpl(path, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-csrf-token': jar.get('tsa_local_csrf'), 'idempotency-key': randomUUID(),
    }, body: JSON.stringify(body) });
    return { api, fetchImpl, mutate };
  }
  const client = session(); let api = client.api(); await api.loginCandidate('studentA');
  return { f, client, api, session };
}
async function grade(api, attemptId) {
  const until = Date.now() + 5_000;
  do {
    const { attempt } = await api.readAttempt(attemptId);
    if (attempt.state === 'GRADED') return attempt;
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < until);
  assert.fail('Shared-reading grade was not released');
}
const sealed = async (f) => (await f.pool.query(`SELECT fs.form_id,fs.slot_id,fs.ordinal,fs.bundle_id,fs.question_version_id,
  fs.public_snapshot,fs.snapshot_hash,p.secret_hash FROM tsa.form_slots fs JOIN tsa_private.form_slot_secrets p USING(form_id,slot_id)
  ORDER BY fs.form_id,fs.ordinal`)).rows;
async function revoke(f) {
  const service = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
  await service.registerRightsDecision(f.principals.bankManager, f.bundles[0].source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Isolated shared passage restriction, not a real rights decision.', expectedRevision: 1,
  });
}

test('READING2 shared passage survives frozen HTTP/client delivery, answers, reload, submission, grading and owned results', { timeout: 30_000 }, async (t) => {
  const { f, client, session } = await setup(t); let api = client.api();
  const catalog = await api.loadCatalog(); assert.equal(catalog.domains.length, 1);
  assert.deepEqual([catalog.domains[0].domain, catalog.domains[0].questionCount, catalog.domains[0].durationSeconds], ['READING', 2, 180]);
  let { attempt } = await api.startDemo('READING', f.blueprint.versionId);
  const raw = await (await client.fetchImpl(`/api/v1/attempts/${attempt.attemptId}`)).json(); assertSafe(raw);
  assert.deepEqual(raw.sections.map((s) => [s.section, s.count]), [['READING', 2]]);
  assert.equal(Date.parse(raw.deadlineAt) - Date.parse(raw.startedAt), 180_000);
  for (const slot of raw.slots) assert.deepEqual(slot.stimulus, { id: f.bundles[0].stimulusId, content: f.bundles[0].content });
  const snapshots = await sealed(f);
  assert.deepEqual(snapshots.map((slot) => slot.question_version_id), f.questions.map((q) => q.versionId));
  assert.ok(snapshots.every((slot) => slot.bundle_id === f.bundles[0].id));
  const foreign = session(), foreignApi = foreign.api(); await foreignApi.loginCandidate('studentB');
  assert.equal((await foreign.fetchImpl(`/api/v1/attempts/${attempt.attemptId}`)).status, 404);
  const premature = await client.fetchImpl(`/api/v1/attempts/${attempt.attemptId}/result`);
  assert.equal(premature.status, 409); assertSafe(await premature.json());
  for (const [index, slot] of attempt.slots.entries()) await api.saveAnswer(attempt.attemptId, slot.slotId, { optionId: index === 0 ? f.expectedOptions[index] : 'a' });
  api = client.api();
  const resumed = (await api.readAttempt(attempt.attemptId)).attempt;
  assert.equal(resumed.answeredCount, 2); assert.equal(resumed.deadlineAt, attempt.deadlineAt);
  assert.deepEqual(resumed.slots.map((s) => s.stimulus), attempt.slots.map((s) => s.stimulus));
  await api.submitAttempt(attempt.attemptId); attempt = await grade(api, attempt.attemptId);
  assert.deepEqual(attempt.result, { label: 'KẾT QUẢ LUYỆN TẬP KHÔNG CHÍNH THỨC', correctCount: 1, totalCount: 2, percentage: '50.00' });
  const released = await (await client.fetchImpl(`/api/v1/attempts/${attempt.attemptId}/result`)).json();
  assert.equal(released.items.length, 2);
  for (const [index, item] of released.items.entries()) {
    assert.deepEqual(item.question.stimulus, raw.slots[index].stimulus);
    assert.equal(item.earned, index === 0 ? 1 : 0); assert.ok(item.explanation.length);
  }
  assert.equal((await foreign.fetchImpl(`/api/v1/attempts/${attempt.attemptId}/result`)).status, 404);
  const history = await api.loadHistory(); assert.equal(history[0].domain, 'READING');
  assert.equal(history[0].score.percentage, '50.00');
  await assert.rejects(api.startDemo('READING', f.blueprint.versionId), { code: 'INSUFFICIENT_UNSEEN_INVENTORY' });
  assert.deepEqual(await sealed(f), snapshots);
  const totals = (await f.pool.query(`SELECT (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history,(SELECT count(*)::int FROM tsa.jobs) AS jobs,
    (SELECT count(*)::int FROM tsa.result_releases) AS releases`)).rows[0];
  assert.deepEqual(totals, { attempts: 1, history: 2, jobs: 1, releases: 1 });
});

for (const state of ['CREATED', 'IN_PROGRESS', 'GRADED']) test(`passage-only rights revocation blocks ${state} reading delivery without rewriting sealed questions/history`, { timeout: 30_000 }, async (t) => {
  const { f, client, api } = await setup(t); let attemptId;
  if (state === 'CREATED') {
    const response = await client.mutate('/api/v1/attempts', { blueprintVersionId: f.blueprint.versionId });
    assert.equal(response.status, 201); attemptId = (await response.json()).attemptId;
  } else {
    const { attempt } = await api.startDemo('READING', f.blueprint.versionId); attemptId = attempt.attemptId;
    if (state === 'GRADED') { await api.submitAttempt(attemptId); await grade(api, attemptId); }
  }
  const snapshots = await sealed(f);
  const history = (await f.pool.query('SELECT * FROM tsa.student_question_history ORDER BY question_id')).rows;
  await revoke(f);
  if (state === 'CREATED') assert.equal((await client.mutate(`/api/v1/attempts/${attemptId}/start`, {})).status, 410);
  const read = await client.fetchImpl(`/api/v1/attempts/${attemptId}`);
  assert.equal(read.status, state === 'CREATED' ? 200 : 410);
  const body = await read.json(); assertSafe(body);
  if (state === 'CREATED') { assert.equal(body.state, 'CANCELLED'); assert.deepEqual(body.slots, []); assert.deepEqual(body.answers, []); }
  const result = await client.fetchImpl(`/api/v1/attempts/${attemptId}/result`); assert.equal(result.status, state === 'CREATED' ? 409 : 410); assertSafe(await result.json());
  assert.deepEqual(await sealed(f), snapshots);
  assert.deepEqual((await f.pool.query('SELECT * FROM tsa.student_question_history ORDER BY question_id')).rows, history);
  const stored = (await f.pool.query('SELECT state,cancellation_reason FROM tsa.attempts WHERE id=$1', [attemptId])).rows[0];
  assert.equal(stored.state, state === 'CREATED' ? 'CANCELLED' : 'INVALIDATED');
  if (state === 'CREATED') assert.equal(stored.cancellation_reason, 'RIGHTS_BLOCKED');
  const another = await client.mutate('/api/v1/attempts', { blueprintVersionId: f.blueprint.versionId });
  assert.equal(another.status, 422); assert.equal((await another.json()).error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
});
