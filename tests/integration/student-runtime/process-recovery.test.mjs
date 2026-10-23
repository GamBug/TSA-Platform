import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPersistentApi } from '../../../apps/practice-prototype/public/app/persistent-api.js';
import { studentRouteRegistry } from '../../../packages/contracts/dist/internal.js';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { scoreAttempt } from '../../../src/modules/scoring/binary.mjs';
import { createSharedReadingFixture } from './shared-reading-fixture.mjs';

async function launch(f, children, { mode, port = 0, executorId }) {
  const child = fork(new URL('./process-child.mjs', import.meta.url), [], {
    env: { ...process.env, NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', STUDENT_PROCESS_TEST: 'true' },
    execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages = []; let stderr = '', stdout = '';
  child.on('message', (message) => messages.push(message));
  child.stderr.setEncoding('utf8'); child.stdout.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000); });
  child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-8000); });
  const closed = once(child, 'close');
  const instance = { child, closed, messages, get stderr() { return stderr; }, get stdout() { return stdout; },
    async wait(type) {
      const until = Date.now() + 10_000;
      do {
        const found = messages.find((message) => message.type === type);
        if (found) return found;
        assert.equal(messages.some((message) => message.type === 'failed'), false, 'child startup/runtime failed');
        assert.equal(child.exitCode, null, `child exited before ${type}`);
        assert.equal(child.signalCode, null, `child was killed before ${type}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      } while (Date.now() < until);
      assert.fail(`Child did not report ${type} within bound`);
    },
  };
  children.push(instance);
  const config = f.harness.database.connectionConfig;
  child.send({ type: 'boot', mode, port, executorId,
    identity: { ...config, user: 'auth_runtime' }, exam: { ...config, user: 'exam_runtime' }, worker: { ...config, user: 'crash_worker' } });
  const ready = await instance.wait('ready');
  assert.equal(ready.pid, child.pid); assert.notEqual(ready.pid, globalThis.process.pid);
  return Object.assign(instance, ready);
}
async function kill(p) {
  assert.equal(p.child.kill('SIGKILL'), true);
  const [code, signal] = await p.closed;
  assert.equal(code, null); assert.equal(signal, 'SIGKILL');
}
async function dispose(p) {
  if (p.child.exitCode === null && p.child.signalCode === null) { p.child.kill('SIGKILL'); await p.closed; }
}
function transport(origin) {
  const jar = new Map();
  const fetchImpl = async (path, options = {}) => {
    const headers = new Headers(options.headers); headers.set('origin', origin);
    if (jar.size) headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
    const response = await fetch(`${origin}${path}`, { ...options, headers, signal: AbortSignal.timeout(5000) });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], at = pair.indexOf('=');
      if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
    }
    return response;
  };
  return { api: () => createPersistentApi({ fetchImpl, readCookie: (key) => jar.get(key) }), fetchImpl,
    save: (attemptId, slotId, key, body) => fetchImpl(`/api/v1/attempts/${attemptId}/answers/${slotId}`, { method: 'PUT', headers: {
      'content-type': 'application/json', 'x-csrf-token': jar.get('tsa_local_csrf'), 'idempotency-key': key,
    }, body: JSON.stringify(body) }),
    submit: (attemptId, key) => fetchImpl(`/api/v1/attempts/${attemptId}/submit`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-csrf-token': jar.get('tsa_local_csrf'), 'idempotency-key': key,
    }, body: '{}' }) };
}
const frozen = async (f, attemptId) => (await f.pool.query(`SELECT jsonb_build_object(
  'manifest',(SELECT to_jsonb(r) FROM tsa.assembly_runs r WHERE r.id=form.assembly_run_id),
  'form',to_jsonb(form),
  'slots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY ordinal) FROM tsa.form_slots s WHERE s.form_id=form.id),
  'keys',(SELECT jsonb_agg(to_jsonb(k) ORDER BY slot_id) FROM tsa_private.form_slot_secrets k WHERE k.form_id=form.id),
  'answers',(SELECT jsonb_agg(to_jsonb(ans) ORDER BY slot_id) FROM tsa.answers ans WHERE ans.attempt_id=a.id),
  'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY question_id) FROM tsa.student_question_history h WHERE h.user_id=a.user_id),
  'clocks',jsonb_build_object('createdAt',a.created_at,'startBefore',a.start_before_at,'startedAt',a.started_at,'deadlineAt',a.deadline_at)) AS value
  FROM tsa.attempts a JOIN tsa.forms form ON form.id=a.form_id WHERE a.id=$1`, [attemptId])).rows[0].value;
const completed = async (f, attemptId) => (await f.pool.query(`SELECT jsonb_build_object(
  'score',to_jsonb(s),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY slot_id) FROM tsa.score_items i WHERE i.score_run_id=s.id),
  'release',(SELECT to_jsonb(r) FROM tsa.result_releases r WHERE r.score_run_id=s.id)) AS value
  FROM tsa.score_runs s WHERE s.attempt_id=$1`, [attemptId])).rows[0]?.value;
const job = async (f, attemptId) => (await f.pool.query('SELECT to_jsonb(j) AS value FROM tsa.jobs j WHERE attempt_id=$1', [attemptId])).rows[0]?.value;
async function assertDatabaseUnchanged(f, postmaster) {
  assert.equal((await f.pool.query('SELECT pg_postmaster_start_time()::text AS value')).rows[0].value, postmaster);
  const client = await f.bankPool.connect();
  try {
    await client.query('BEGIN'); await client.query("SELECT set_config('tsa.bank_fixture_scope',$1,true)", [f.fixtureScopeId]);
    assert.equal((await client.query('SELECT tsa.bank_fixture_scope_active() AS value')).rows[0].value, true);
    await client.query('ROLLBACK');
  } finally { client.release(); }
}

for (const mode of ['QUEUED', 'RUNNING', 'COMMITTED']) test(`real app/worker SIGKILL preserves acknowledged reading answers and recovers ${mode} submission in a new OS process`, { timeout: 45_000 }, async (t) => {
  const f = await createSharedReadingFixture(), children = []; let workerPool;
  t.after(async () => { for (const child of children) await dispose(child); await workerPool?.end(); await f.close(); });
  await f.pool.query('CREATE ROLE crash_worker LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO crash_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'crash_worker' });
  const postmaster = (await f.pool.query('SELECT pg_postmaster_start_time()::text AS value')).rows[0].value;
  const first = await launch(f, children, { mode: 'QUEUED', executorId: 'crash-first' });
  await first.wait('paused');
  const client = transport(first.origin); let api = client.api(); await api.loginCandidate('studentA');
  const { attempt } = await api.startDemo('READING', f.blueprint.versionId);
  for (const [index, slot] of attempt.slots.entries()) await api.saveAnswer(attempt.attemptId, slot.slotId, { optionId: f.expectedOptions[index] });
  const immutable = await frozen(f, attempt.attemptId);
  assert.equal(immutable.answers.length, 2);
  await kill(first);
  await assert.rejects(fetch(`${first.origin}/local-auth/session`, { signal: AbortSignal.timeout(2000) }));
  await assertDatabaseUnchanged(f, postmaster);
  assert.deepEqual(await frozen(f, attempt.attemptId), immutable);
  const second = await launch(f, children, { mode, port: first.port, executorId: 'crash-second' });
  assert.equal(second.origin, first.origin);
  assert.notEqual(second.pid, first.pid);
  api = client.api(); // New client object, same durable session cookie, no new login/bootstrap.
  const resumed = (await api.readAttempt(attempt.attemptId)).attempt;
  assert.equal(resumed.state, 'IN_PROGRESS'); assert.equal(resumed.answeredCount, 2);
  assert.equal(resumed.startedAt, attempt.startedAt); assert.equal(resumed.deadlineAt, attempt.deadlineAt);
  assert.deepEqual(resumed.slots.map((s) => s.stimulus), attempt.slots.map((s) => s.stimulus));
  assert.deepEqual(await frozen(f, attempt.attemptId), immutable);
  const submitKey = randomUUID();
  const response = await client.submit(attempt.attemptId, submitKey); assert.equal(response.status, 200);
  const receipt = await response.json();
  const pause = await second.wait('paused'); assert.equal(pause.stage, mode);
  const before = await job(f, attempt.attemptId); assert.equal(before.state, mode === 'COMMITTED' ? 'SUCCEEDED' : mode);
  const committed = mode === 'COMMITTED' ? await completed(f, attempt.attemptId) : null;
  const oldWorker = createExamWorker({ workerPool, executorId: 'crash-second', leaseSeconds: 10, retrySeconds: 1 });
  let lease, computed;
  if (mode === 'RUNNING') {
    const dispatch = { schemaVersion: 'job-dispatch/1', jobId: before.id, kind: before.kind, dedupKey: before.dedup_key, payloadRef: before.payload_ref, state: before.state };
    lease = { status: 'CLAIMED', dispatch, attemptId: attempt.attemptId, leaseToken: pause.token, leaseUntil: before.lease_until };
    assert.equal(pause.jobId, before.id); assert.equal(pause.token, String(before.lease_token));
    computed = scoreAttempt(await oldWorker.load(lease));
  }
  await kill(second);
  await assertDatabaseUnchanged(f, postmaster);
  assert.deepEqual(await frozen(f, attempt.attemptId), immutable);
  assert.deepEqual(await job(f, attempt.attemptId), before);
  const third = await launch(f, children, { mode: 'NORMAL', port: first.port, executorId: 'crash-third' });
  assert.notEqual(third.pid, second.pid); assert.equal(third.origin, first.origin);
  if (mode === 'RUNNING') {
    const live = (await f.pool.query('SELECT clock_timestamp()<lease_until AS value FROM tsa.jobs WHERE id=$1', [before.id])).rows[0].value;
    assert.equal(live, true, 'restart is observed while the old lease is actually live');
    const rival = createExamWorker({ workerPool, executorId: 'crash-rival', leaseSeconds: 10, retrySeconds: 1 });
    assert.deepEqual(await rival.claim(), { status: 'IDLE' });
    assert.deepEqual(await job(f, attempt.attemptId), before, 'new OS process cannot steal/reset a live lease');
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.score_runs')).rows[0].n, 0);
  }
  const replay = await client.submit(attempt.attemptId, submitKey); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), receipt);
  api = client.api(); let graded; const until = Date.now() + 15_000;
  do {
    graded = (await api.readAttempt(attempt.attemptId)).attempt;
    if (graded.state === 'GRADED') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < until);
  assert.equal(graded.state, 'GRADED'); assert.equal(graded.result.percentage, '100.00');
  assert.equal(graded.result.totalCount, 2); assert.equal(graded.result.correctCount, 2);
  assert.deepEqual(await frozen(f, attempt.attemptId), immutable);
  const after = await job(f, attempt.attemptId); assert.equal(after.id, before.id); assert.equal(after.state, 'SUCCEEDED');
  for (const field of ['kind', 'dedup_key', 'payload_ref', 'attempt_id', 'created_at']) assert.equal(after[field], before[field]);
  assert.equal(after.lease_token, mode === 'RUNNING' ? before.lease_token + 1 : 1);
  if (mode === 'RUNNING') assert.equal((await f.pool.query(
    'SELECT created_at >= $2::timestamptz AS value FROM tsa.score_runs WHERE attempt_id=$1',
    [attempt.attemptId, before.lease_until])).rows[0].value, true, 'no score before actual PostgreSQL lease expiry');
  if (mode === 'COMMITTED') {
    assert.ok(committed); assert.deepEqual(await completed(f, attempt.attemptId), committed, 'exact committed score/items/release survive acknowledgement loss');
    assert.deepEqual(after, before, 'restart does not reopen/reclaim an already committed grade');
  }
  if (mode === 'RUNNING') {
    assert.deepEqual(await oldWorker.load(lease), { status: 'LOST_LEASE' });
    assert.deepEqual(await oldWorker.finish(lease, computed), { status: 'LOST_LEASE' });
  }
  const totals = (await f.pool.query(`SELECT (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history,(SELECT count(*)::int FROM tsa.jobs) AS jobs,
    (SELECT count(*)::int FROM tsa.score_runs) AS scores,(SELECT count(*)::int FROM tsa.result_releases) AS releases,
    (SELECT count(*)::int FROM tsa.audit_events WHERE action='ATTEMPT_GRADED') AS grade_audits`)).rows[0];
  assert.deepEqual(totals, { attempts: 1, history: 2, jobs: 1, scores: 1, releases: 1, grade_audits: 1 });
  await assertDatabaseUnchanged(f, postmaster);
  third.child.send({ type: 'stop' }); const [code, signal] = await third.closed; assert.equal(code, 0); assert.equal(signal, null);
  for (const child of children) { assert.equal(child.stdout, ''); assert.equal(child.stderr, ''); }
});

test('live student process survives real idle backend disconnects and reconnects without losing acknowledged answers', { timeout: 25_000 }, async (t) => {
  const f = await createSharedReadingFixture(), children = [];
  t.after(async () => { for (const child of children) await dispose(child); await f.close(); });
  await f.pool.query('CREATE ROLE crash_worker LOGIN');
  await f.pool.query('GRANT tsa_exam_worker TO crash_worker');
  const postmaster = (await f.pool.query('SELECT pg_postmaster_start_time()::text AS value')).rows[0].value;
  const live = await launch(f, children, { mode: 'NORMAL', executorId: 'idle-disconnect-worker' });
  const client = transport(live.origin), api = client.api();
  await api.loginCandidate('studentA');
  const { attempt } = await api.startDemo('READING', f.blueprint.versionId);
  for (const [index, slot] of attempt.slots.entries()) await api.saveAnswer(attempt.attemptId, slot.slotId, { optionId: f.expectedOptions[index] });
  const acknowledged = await frozen(f, attempt.attemptId);
  assert.equal(acknowledged.answers.length, 2);
  // The test-only application names select this child, never the parent fixture pools.
  const targets = (await f.pool.query(`SELECT pid,application_name,state FROM pg_stat_activity
    WHERE application_name IN ('student-process-identity','student-process-exam','student-process-worker') ORDER BY application_name,pid`)).rows;
  for (const name of ['student-process-identity', 'student-process-exam']) {
    assert.ok(targets.some((row) => row.application_name === name && row.state === 'idle'), `${name} has an actual idle connection`);
  }
  assert.ok(targets.some((row) => row.application_name === 'student-process-worker'));
  const terminated = (await f.pool.query('SELECT pg_terminate_backend(pid) AS terminated FROM unnest($1::int[]) AS target(pid)', [targets.map((row) => row.pid)])).rows;
  assert.ok(terminated.length >= 3); assert.ok(terminated.every((row) => row.terminated));
  // Round-trip IPC proves this same process remains live after handling disconnects.
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (live.child.exitCode !== null) t.diagnostic(`disconnect failure classification: ${live.stderr.includes("Emitted 'error' event on Client instance") ? 'unhandled checked-out client error' : live.stderr.includes("Unhandled 'error' event") ? 'unhandled error event' : 'unclassified child exit'}`);
  assert.equal(live.child.exitCode, null, 'idle backend errors must not terminate the live student process');
  assert.equal(live.child.signalCode, null);
  live.child.send({ type: 'ping' });
  assert.equal((await live.wait('pong')).pid, live.pid);
  const resumed = (await api.readAttempt(attempt.attemptId)).attempt;
  assert.equal(resumed.answeredCount, 2); assert.equal(resumed.state, 'IN_PROGRESS');
  assert.equal(resumed.startedAt, attempt.startedAt); assert.equal(resumed.deadlineAt, attempt.deadlineAt);
  assert.deepEqual(await frozen(f, attempt.attemptId), acknowledged);
  await api.saveAnswer(attempt.attemptId, attempt.slots[0].slotId, { optionId: f.expectedOptions[0] });
  const beforeSubmit = await frozen(f, attempt.attemptId), submitKey = randomUUID();
  const submitted = await client.submit(attempt.attemptId, submitKey); assert.equal(submitted.status, 200);
  const receipt = await submitted.json();
  let result; const until = Date.now() + 5_000;
  do {
    result = (await api.readAttempt(attempt.attemptId)).attempt;
    if (result.state === 'GRADED') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < until);
  assert.equal(result.state, 'GRADED'); assert.equal(result.result.percentage, '100.00');
  const replay = await client.submit(attempt.attemptId, submitKey);
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), receipt);
  assert.deepEqual(await frozen(f, attempt.attemptId), beforeSubmit);
  const totals = (await f.pool.query(`SELECT (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history,(SELECT count(*)::int FROM tsa.jobs) AS jobs,
    (SELECT count(*)::int FROM tsa.score_runs) AS scores,(SELECT count(*)::int FROM tsa.result_releases) AS releases,
    (SELECT count(*)::int FROM tsa.audit_events WHERE action='ATTEMPT_GRADED') AS grade_audits`)).rows[0];
  assert.deepEqual(totals, { attempts: 1, history: 2, jobs: 1, scores: 1, releases: 1, grade_audits: 1 });
  await assertDatabaseUnchanged(f, postmaster);
  live.child.send({ type: 'stop' }); const [code, signal] = await live.closed;
  assert.equal(code, 0); assert.equal(signal, null);
  assert.equal(live.stdout, ''); assert.equal(live.stderr, '');
});

test('live HTTP and poller survive actual postmaster downtime with safe errors and unchanged acknowledged inputs', { timeout: 30_000 }, async (t) => {
  const f = await createSharedReadingFixture(), children = [], database = f.harness.database;
  t.after(async () => { for (const child of children) await dispose(child); await f.close(); });
  await f.pool.query('CREATE ROLE crash_worker LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO crash_worker');
  const live = await launch(f, children, { mode: 'NORMAL', executorId: 'postmaster-outage-worker' });
  const client = transport(live.origin), api = client.api();
  await api.loginCandidate('studentA');
  const { attempt } = await api.startDemo('READING', f.blueprint.versionId);
  for (const [index, slot] of attempt.slots.entries()) await api.saveAnswer(attempt.attemptId, slot.slotId, { optionId: f.expectedOptions[index] });
  const acknowledged = await frozen(f, attempt.attemptId);
  const originalPostmaster = (await f.pool.query('SELECT pg_postmaster_start_time()::text AS value')).rows[0].value;
  const saveKey = randomUUID(), submitKey = randomUUID();
  const savedValue = { expectedRevision: 1, value: { type: 'SINGLE_CHOICE', optionId: f.expectedOptions[0] } };
  const restarted = await database.restart({ shutdownMode: 'immediate', whileStopped: async () => {
    // This barrier begins only after the actual owned postmaster has exited.
    const responses = [
      ['getAttempt', await client.fetchImpl(`/api/v1/attempts/${attempt.attemptId}`)],
      ['saveAnswer', await client.save(attempt.attemptId, attempt.slots[0].slotId, saveKey, savedValue)],
      ['submitAttempt', await client.submit(attempt.attemptId, submitKey)],
    ];
    for (const [operation, response] of responses) {
      assert.equal(response.status, 503, `${operation} fails safely while PostgreSQL is stopped`);
      const body = await response.json();
      studentRouteRegistry[operation].responses[503].schema.parse(body);
      assert.equal(body.error.code, 'TEMPORARILY_UNAVAILABLE'); assert.deepEqual(body.error.details, {});
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-request-id'), body.error.requestId);
      assertRestrictedResponse(body, f, acknowledged);
    }
    assert.equal(live.child.exitCode, null); assert.equal(live.child.signalCode, null);
    await live.wait('worker-unavailable'); // Actual poller pool failure while the server remains stopped.
    live.child.send({ type: 'ping' }); assert.equal((await live.wait('pong')).pid, live.pid);
  } });
  assert.deepEqual(restarted, { shutdownMode: 'immediate', recoveryObserved: true });
  const recovered = { ...f, pool: database.pool };
  assert.notEqual((await database.pool.query('SELECT pg_postmaster_start_time()::text AS value')).rows[0].value, originalPostmaster);
  assert.deepEqual(await frozen(recovered, attempt.attemptId), acknowledged);
  assert.equal((await database.pool.query('SELECT count(*)::int AS n FROM tsa.jobs')).rows[0].n, 0, 'failed outage submit creates no job');
  const scopeClient = await f.bankPool.connect();
  try {
    await scopeClient.query('BEGIN'); await scopeClient.query("SELECT set_config('tsa.bank_fixture_scope',$1,true)", [f.fixtureScopeId]);
    assert.equal((await scopeClient.query('SELECT tsa.bank_fixture_scope_active() AS value')).rows[0].value, false);
    await scopeClient.query('ROLLBACK');
  } finally { scopeClient.release(); }
  const resumed = (await api.readAttempt(attempt.attemptId)).attempt;
  assert.equal(resumed.state, 'IN_PROGRESS'); assert.equal(resumed.answeredCount, 2);
  assert.equal(resumed.startedAt, attempt.startedAt); assert.equal(resumed.deadlineAt, attempt.deadlineAt);
  const saved = await client.save(attempt.attemptId, attempt.slots[0].slotId, saveKey, savedValue);
  assert.equal(saved.status, 200);
  assert.equal(studentRouteRegistry.saveAnswer.responses[200].schema.parse(await saved.json()).revision, 2);
  const beforeSubmit = await frozen(recovered, attempt.attemptId);
  const submitted = await client.submit(attempt.attemptId, submitKey); assert.equal(submitted.status, 200);
  const receipt = await submitted.json();
  let graded; const until = Date.now() + 5_000;
  do {
    graded = (await api.readAttempt(attempt.attemptId)).attempt;
    if (graded.state === 'GRADED') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < until);
  assert.equal(graded.state, 'GRADED'); assert.equal(graded.result.percentage, '100.00');
  const replay = await client.submit(attempt.attemptId, submitKey);
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), receipt);
  assert.deepEqual(await frozen(recovered, attempt.attemptId), beforeSubmit);
  for (const table of ['jobs', 'score_runs', 'result_releases']) assert.equal((await database.pool.query(`SELECT count(*)::int AS n FROM tsa.${table}`)).rows[0].n, 1);
  live.child.send({ type: 'stop' }); const [code, signal] = await live.closed;
  assert.equal(code, 0); assert.equal(signal, null); assert.equal(live.stdout, ''); assert.equal(live.stderr, '');
});

function assertRestrictedResponse(body, f, immutable) {
  const forbidden = new Set(['answerKey', 'correctAnswer', 'explanation', 'provenance', 'reviewNotes', 'keySnapshot',
    'privateHash', 'questionVersionId', 'contentHash', 'manifest', 'diagnostics', 'sourceVersionId', 'provenanceIds']);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.has(key), false, `restricted field ${key}`); visit(child); }
  };
  visit(body);
  const bytes = JSON.stringify(body);
  for (const marker of [f.bundles[0].content[0].text, f.bundles[0].source.sourceVersionId,
    ...immutable.slots.map((slot) => slot.public_snapshot.content[0].text)]) assert.equal(bytes.includes(marker), false);
}

for (const mode of ['QUEUED', 'RUNNING']) test(`passage rights revoked during a real ${mode} worker outage prevent restricted delivery and grading after OS restart`, { timeout: 35_000 }, async (t) => {
  const f = await createSharedReadingFixture(), children = []; let workerPool;
  t.after(async () => { for (const child of children) await dispose(child); await workerPool?.end(); await f.close(); });
  await f.pool.query('CREATE ROLE crash_worker LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO crash_worker');
  workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'crash_worker' });
  const postmaster = (await f.pool.query('SELECT pg_postmaster_start_time()::text AS value')).rows[0].value;
  const first = await launch(f, children, { mode, executorId: 'rights-outage-first' });
  const client = transport(first.origin), api = client.api(); await api.loginCandidate('studentA');
  const { attempt } = await api.startDemo('READING', f.blueprint.versionId);
  for (const [index, slot] of attempt.slots.entries()) await api.saveAnswer(attempt.attemptId, slot.slotId, { optionId: f.expectedOptions[index] });
  const immutable = await frozen(f, attempt.attemptId);
  const submitKey = randomUUID(), submitted = await client.submit(attempt.attemptId, submitKey);
  assert.equal(submitted.status, 200); await submitted.arrayBuffer();
  const pause = await first.wait('paused'); assert.equal(pause.stage, mode);
  const before = await job(f, attempt.attemptId); assert.equal(before.state, mode);
  const oldWorker = createExamWorker({ workerPool, executorId: 'rights-outage-first', leaseSeconds: 10, retrySeconds: 1 });
  let lease, computed;
  if (mode === 'RUNNING') {
    lease = { status: 'CLAIMED', attemptId: attempt.attemptId, leaseToken: pause.token, leaseUntil: before.lease_until,
      dispatch: { schemaVersion: 'job-dispatch/1', jobId: before.id, kind: before.kind, dedupKey: before.dedup_key, payloadRef: before.payload_ref, state: before.state } };
    computed = scoreAttempt(await oldWorker.load(lease));
  }
  await kill(first);
  await assert.rejects(fetch(`${first.origin}/local-auth/session`, { signal: AbortSignal.timeout(2000) }));
  await assertDatabaseUnchanged(f, postmaster);
  const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
  await sources.registerRightsDecision(f.principals.bankManager, f.bundles[0].source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Original isolated passage-only restriction while test app is dead; not a real rights attestation.', expectedRevision: 1,
  });
  // The Bank authority is separate and remains available while the child is dead.
  assert.equal(first.child.signalCode, 'SIGKILL');
  const rights = (await f.pool.query(`SELECT sr.source_version_id,d.status FROM tsa.source_rights sr
    JOIN tsa.rights_decisions d ON d.id=sr.decision_id WHERE sr.source_version_id=ANY($1::uuid[])`,
    [[f.bundles[0].source.sourceVersionId, f.source.sourceVersionId]])).rows;
  assert.equal(rights.find((r) => r.source_version_id === f.bundles[0].source.sourceVersionId).status, 'REVOKED');
  assert.equal(rights.find((r) => r.source_version_id === f.source.sourceVersionId).status, 'OWNED');
  assert.equal((await f.pool.query('SELECT state FROM tsa.attempts WHERE id=$1', [attempt.attemptId])).rows[0].state, 'INVALIDATED');
  assert.deepEqual(await frozen(f, attempt.attemptId), immutable);
  assert.deepEqual(await job(f, attempt.attemptId), before, 'rights fanout invalidates the attempt without rewriting its queued/leased job');
  const second = await launch(f, children, { mode: 'NORMAL', port: first.port, executorId: 'rights-outage-second' });
  assert.notEqual(second.pid, first.pid); assert.equal(second.origin, first.origin);
  if (mode === 'RUNNING') {
    assert.equal((await f.pool.query('SELECT clock_timestamp()<lease_until AS live FROM tsa.jobs WHERE id=$1', [before.id])).rows[0].live, true);
    assert.deepEqual(await job(f, attempt.attemptId), before, 'normal restart preserves a live old lease even after revocation');
  }
  for (const path of [`/api/v1/attempts/${attempt.attemptId}`, `/api/v1/attempts/${attempt.attemptId}/result`]) {
    const response = await client.fetchImpl(path); assert.equal(response.status, 410); assertRestrictedResponse(await response.json(), f, immutable);
  }
  // Current withdrawal intentionally precedes the old matching submission receipt.
  const replay = await client.submit(attempt.attemptId, submitKey); assert.equal(replay.status, 410);
  const denied = await replay.json(); assert.equal(denied.error.code, 'CONTENT_WITHDRAWN'); assertRestrictedResponse(denied, f, immutable);
  await assert.rejects(client.api().startDemo('READING', f.blueprint.versionId), { status: 422, code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  const foreign = transport(second.origin), foreignApi = foreign.api(); await foreignApi.loginCandidate('studentB');
  for (const path of [`/api/v1/attempts/${attempt.attemptId}`, `/api/v1/attempts/${attempt.attemptId}/result`]) {
    const response = await foreign.fetchImpl(path); assert.equal(response.status, 404); assertRestrictedResponse(await response.json(), f, immutable);
  }
  const until = Date.now() + 15_000;
  while ((await job(f, attempt.attemptId)).state !== 'CANCELLED') {
    assert.ok(Date.now() < until, 'restricted durable job must cancel within actual lease/poll bound');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const after = await job(f, attempt.attemptId); assert.equal(after.last_error_code, 'CONTENT_WITHDRAWN');
  assert.equal(after.lease_owner, null); assert.equal(after.lease_until, null);
  assert.equal(after.lease_token, mode === 'RUNNING' ? before.lease_token + 1 : 1);
  for (const field of ['id', 'kind', 'dedup_key', 'payload_ref', 'attempt_id', 'created_at']) assert.equal(after[field], before[field]);
  if (mode === 'RUNNING') {
    assert.deepEqual(await oldWorker.load(lease), { status: 'LOST_LEASE' });
    assert.deepEqual(await oldWorker.finish(lease, computed), { status: 'LOST_LEASE' });
  }
  const probe = createExamWorker({ workerPool, executorId: 'rights-outage-probe', leaseSeconds: 10, retrySeconds: 1 });
  assert.deepEqual(await probe.claim(), { status: 'IDLE' });
  assert.deepEqual(await frozen(f, attempt.attemptId), immutable);
  const totals = (await f.pool.query(`SELECT (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history,(SELECT count(*)::int FROM tsa.jobs) AS jobs,
    (SELECT count(*)::int FROM tsa.score_runs) AS scores,(SELECT count(*)::int FROM tsa.score_items) AS items,
    (SELECT count(*)::int FROM tsa.result_releases) AS releases,
    (SELECT count(*)::int FROM tsa.audit_events WHERE action='ATTEMPT_GRADED') AS grade_audits`)).rows[0];
  assert.deepEqual(totals, { attempts: 1, history: 2, jobs: 1, scores: 0, items: 0, releases: 0, grade_audits: 0 });
  await assertDatabaseUnchanged(f, postmaster);
  second.child.send({ type: 'stop' }); const [code, signal] = await second.closed; assert.equal(code, 0); assert.equal(signal, null);
  for (const child of children) { assert.equal(child.stdout, ''); assert.equal(child.stderr, ''); }
});
