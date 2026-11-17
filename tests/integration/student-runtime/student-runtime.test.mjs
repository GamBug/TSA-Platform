import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  releasedReviewRouteRegistry,
  studentRouteRegistry,
} from '../../../packages/contracts/dist/internal.js';
import { createStudentRuntime } from '../../../src/local/student.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const ENV = Object.freeze({ NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' });
const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
  attempt: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
});

function key(label) { return `${label}-${randomUUID()}`; }

function runtimeOptions(fixture, workerPool) {
  return {
    identityPool: fixture.harness.authPool,
    examPool: fixture.examPool,
    workerPool,
    env: ENV,
    port: 0,
    pollMilliseconds: 20,
    sweepBatchSize: 10,
    executorId: `student-runtime-${randomUUID()}`,
    leaseSeconds: 30,
    retrySeconds: 30,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  };
}

function parseCookie(response, name) {
  const value = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(value, `${name} cookie is set`);
  return value.split(';', 1)[0];
}

async function login(origin, actorKey) {
  const bootstrap = await fetch(`${origin}/local-auth/bootstrap`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(bootstrap.status, 201);
  const guestCookie = [parseCookie(bootstrap, 'tsa_local_session'), parseCookie(bootstrap, 'tsa_local_csrf')].join('; ');
  const guestCsrf = guestCookie.split('; ').find((item) => item.startsWith('tsa_local_csrf=')).slice('tsa_local_csrf='.length);
  const authenticated = await fetch(`${origin}/local-auth/login`, {
    method: 'POST',
    headers: {
      origin,
      cookie: guestCookie,
      'x-csrf-token': guestCsrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ actorKey }),
  });
  assert.equal(authenticated.status, 200, await authenticated.clone().text());
  const cookie = [parseCookie(authenticated, 'tsa_local_session'), parseCookie(authenticated, 'tsa_local_csrf')].join('; ');
  return {
    cookie,
    csrf: cookie.split('; ').find((item) => item.startsWith('tsa_local_csrf=')).slice('tsa_local_csrf='.length),
  };
}

function requestHeaders(origin, session, {
  mutation = false, csrf = true, json = false, originOverride = origin, keyValue,
} = {}) {
  const headers = new Headers({ origin: originOverride });
  if (session) headers.set('cookie', session.cookie);
  if (mutation && csrf && session) headers.set('x-csrf-token', session.csrf);
  if (json) headers.set('content-type', 'application/json');
  if (keyValue) headers.set('idempotency-key', keyValue);
  return headers;
}

async function send(origin, path, session, { method = 'GET', body, ...options } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: requestHeaders(origin, session, {
      ...options,
      mutation: ['POST', 'PUT'].includes(method),
      json: body !== undefined,
      ...(body !== undefined && !options.keyValue ? { keyValue: key('student-runtime-command') } : {}),
    }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

function parseAttemptResponse(route, status, body) {
  const schema = studentRouteRegistry[route].responses[status]?.schema;
  assert.ok(schema, `${route} has a frozen response for ${status}`);
  return schema.parse(body);
}

function parseReleasedResponse(status, body) {
  const schema = releasedReviewRouteRegistry.releasedResult.responses[status]?.schema;
  assert.ok(schema, `released result has a frozen response for ${status}`);
  return schema.parse(body);
}

function createWorkerPoolProxy(pool) {
  const state = {
    available: true,
    failSweep: false,
    failClaims: false,
    connections: 0,
    active: 0,
    maxActive: 0,
    idleClaims: 0,
    failedSweeps: 0,
  };
  return {
    state,
    pool: {
      async connect() {
        state.connections += 1;
        if (!state.available) throw new Error('Synthetic worker database outage');
        const client = await pool.connect();
        state.active += 1;
        state.maxActive = Math.max(state.maxActive, state.active);
        return {
          async query(...args) {
            if (String(args[0]).includes('tsa.exam_worker_claim') && state.failClaims) {
              throw new Error('Synthetic grading-claim outage');
            }
            if (String(args[0]).includes('tsa.exam_worker_sweep') && state.failSweep) {
              state.failedSweeps += 1;
              throw new Error('Synthetic sweep-only database fault');
            }
            const result = await client.query(...args);
            if (String(args[0]).includes('tsa.exam_worker_claim')
                && result.rows[0]?.result?.status === 'IDLE') state.idleClaims += 1;
            return result;
          },
          release(...args) {
            state.active -= 1;
            return client.release(...args);
          },
        };
      },
    },
  };
}

async function waitForReleasedResult(origin, session, attemptId) {
  const deadline = Date.now() + 6_000;
  let last;
  while (Date.now() < deadline) {
    last = await send(origin, `/api/v1/attempts/${attemptId}/result`, session);
    if (last.response.status === 200) return last;
    assert.equal(last.response.status, 409);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`The background worker did not release a result (last status ${last?.response.status ?? 'none'})`);
}

test('invalid local runtime configuration is rejected before pool access or listening', async () => {
  let poolConnections = 0;
  const pool = { connect: async () => { poolConnections += 1; throw new Error('unexpected pool access'); } };
  const shared = {
    identityPool: pool,
    examPool: { connect: pool.connect },
    workerPool: { connect: pool.connect },
    pollMilliseconds: 20,
    executorId: 'invalid-config-test',
    leaseSeconds: 30,
    retrySeconds: 30,
    sweepBatchSize: 10,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  };
  await assert.rejects(createStudentRuntime({ ...shared, env: { NODE_ENV: 'production', LOCAL_SYNTHETIC_ONLY: 'true' } }),
    /disabled|development|test/i);
  await assert.rejects(createStudentRuntime({ ...shared, env: ENV, pollMilliseconds: 0 }), /pollMilliseconds/);
  assert.equal(poolConnections, 0);
});

test('student HTTP and a separate worker persist login, attempt and released score across runtime restart', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 8, blueprintCount: 4 });
  let workerPool;
  let runtime;
  let restartedRuntime;
  t.after(async () => {
    if (restartedRuntime) await restartedRuntime.close();
    if (runtime) await runtime.close();
    if (workerPool) await workerPool.end();
    await fixture.close();
  });

  const workerLogin = `student_worker_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${workerLogin} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${workerLogin}`);
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: workerLogin }, {
    applicationName: 'tsa-student-runtime-worker-test',
    max: 3,
  });
  const workerProxy = createWorkerPoolProxy(workerPool);
  const options = runtimeOptions(fixture, workerProxy.pool);
  runtime = await createStudentRuntime(options);
  assert.equal(runtime.syntheticOnly, true);
  assert.match(runtime.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(runtime.port, Number(new URL(runtime.origin).port));

  const studentA = await login(runtime.origin, 'studentA');
  const studentB = await login(runtime.origin, 'studentB');
  const examManager = await login(runtime.origin, 'examManager');
  const idleDeadline = Date.now() + 2_000;
  while (workerProxy.state.idleClaims < 1 && Date.now() < idleDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(workerProxy.state.idleClaims > 0, 'worker loop polls independently while the HTTP server is idle');

  const noCsrf = await send(runtime.origin, '/api/v1/attempts', studentA, {
    method: 'POST', body: { blueprintVersionId: fixture.blueprint.versionId },
    keyValue: key('csrf-negative'), csrf: false,
  });
  assert.equal(noCsrf.response.status, 403);
  parseAttemptResponse('createAttempt', 403, noCsrf.body);

  const wrongOrigin = await send(runtime.origin, '/api/v1/attempts', studentA, {
    method: 'POST', body: { blueprintVersionId: fixture.blueprint.versionId },
    originOverride: 'http://example.invalid', keyValue: key('origin-negative'),
  });
  assert.equal(wrongOrigin.response.status, 403);
  parseAttemptResponse('createAttempt', 403, wrongOrigin.body);

  const badAuthOrigin = await fetch(`${runtime.origin}/local-auth/bootstrap`, {
    method: 'POST',
    headers: { origin: 'http://example.invalid', 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(badAuthOrigin.status, 403);
  assert.deepEqual(await badAuthOrigin.json(), { error: 'ORIGIN_REJECTED' });

  const created = await send(runtime.origin, '/api/v1/attempts', studentA, {
    method: 'POST', body: { blueprintVersionId: fixture.blueprint.versionId }, keyValue: key('runtime-create'),
  });
  assert.equal(created.response.status, 201);
  const receipt = parseAttemptResponse('createAttempt', 201, created.body);
  const attemptId = receipt.attemptId;

  let result = await send(runtime.origin, `/api/v1/attempts/${attemptId}/result`, studentA);
  assert.equal(result.response.status, 409);
  parseReleasedResponse(409, result.body);
  const unauthenticated = await send(runtime.origin, `/api/v1/attempts/${attemptId}/result`, null);
  assert.equal(unauthenticated.response.status, 401);
  parseReleasedResponse(401, unauthenticated.body);
  const foreign = await send(runtime.origin, `/api/v1/attempts/${attemptId}/result`, studentB);
  assert.equal(foreign.response.status, 404);
  parseReleasedResponse(404, foreign.body);
  const staff = await send(runtime.origin, `/api/v1/attempts/${attemptId}/result`, examManager);
  assert.equal(staff.response.status, 403);
  parseReleasedResponse(403, staff.body);

  const started = await send(runtime.origin, `/api/v1/attempts/${attemptId}/start`, studentA, {
    method: 'POST', body: {}, keyValue: key('runtime-start'),
  });
  assert.equal(started.response.status, 200);
  parseAttemptResponse('startAttempt', 200, started.body);
  const view = await send(runtime.origin, `/api/v1/attempts/${attemptId}`, studentA);
  assert.equal(view.response.status, 200);
  const attemptView = parseAttemptResponse('getAttempt', 200, view.body);
  for (const slot of attemptView.slots) {
    const saved = await send(runtime.origin, `/api/v1/attempts/${attemptId}/answers/${slot.slotId}`, studentA, {
      method: 'PUT',
      body: { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id } },
      keyValue: key('runtime-save'),
    });
    assert.equal(saved.response.status, 200);
    parseAttemptResponse('saveAnswer', 200, saved.body);
  }

  workerProxy.state.available = false;
  const beforeSubmitConnections = workerProxy.state.connections;
  const submitted = await send(runtime.origin, `/api/v1/attempts/${attemptId}/submit`, studentA, {
    method: 'POST', body: {}, keyValue: key('runtime-submit'),
  });
  assert.equal(submitted.response.status, 200, 'HTTP submit does not wait for the unavailable worker');
  assert.equal(parseAttemptResponse('submitAttempt', 200, submitted.body).state, 'SUBMITTED');
  const outageDeadline = Date.now() + 2_000;
  while (workerProxy.state.connections <= beforeSubmitConnections && Date.now() < outageDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(workerProxy.state.connections > beforeSubmitConnections, 'the worker loop observed its unavailable database separately');
  result = await send(runtime.origin, `/api/v1/attempts/${attemptId}/result`, studentA);
  assert.equal(result.response.status, 409, 'request processing does not grade inline');
  parseReleasedResponse(409, result.body);
  assert.ok(workerProxy.state.connections >= beforeSubmitConnections);

  workerProxy.state.available = true;
  workerProxy.state.failSweep = true;
  result = await waitForReleasedResult(runtime.origin, studentA, attemptId);
  assert.ok(workerProxy.state.failedSweeps > 0, 'a sweep error is isolated from grading in the same loop');
  workerProxy.state.failSweep = false;
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  const review = parseReleasedResponse(200, result.body);
  assert.equal(review.scoreLabel, 'UNOFFICIAL_PRACTICE');
  assert.equal(review.policyVersion, 'practice-binary-v1');
  assert.ok(review.items.length > 0);
  assert.ok(review.items.every((item) => item.correctAnswer && item.explanation.length > 0));
  assert.equal(JSON.stringify(review).includes('questionVersionId'), false);
  assert.equal(JSON.stringify(review).includes('reviewNotes'), false);
  const scoreRunId = review.scoreRunId;

  const unsupported = await fetch(`${runtime.origin}/api/v1/unsupported`, { headers: { origin: runtime.origin } });
  assert.equal(unsupported.status, 404);
  assert.equal(unsupported.headers.get('cache-control'), 'no-store');

  await runtime.close();
  runtime = null;
  const connectCountAtClose = workerProxy.state.connections;
  await new Promise((resolve) => setTimeout(resolve, 5 * options.pollMilliseconds));
  assert.equal(workerProxy.state.connections, connectCountAtClose, 'worker polling stops after graceful close');
  assert.equal((await fixture.harness.authPool.query('SELECT 1 AS caller_pool_usable')).rows[0].caller_pool_usable, 1);
  assert.equal((await fixture.examPool.query('SELECT 1 AS caller_pool_usable')).rows[0].caller_pool_usable, 1);
  assert.equal((await workerPool.query('SELECT 1 AS caller_pool_usable')).rows[0].caller_pool_usable, 1);

  restartedRuntime = await createStudentRuntime({ ...options, port: 0 });
  result = await waitForReleasedResult(restartedRuntime.origin, studentA, attemptId);
  const persistedReview = parseReleasedResponse(200, result.body);
  assert.equal(persistedReview.scoreRunId, scoreRunId);
  assert.equal(persistedReview.attemptId, attemptId);
  const persistedAttempt = await send(restartedRuntime.origin, `/api/v1/attempts/${attemptId}`, studentA);
  assert.equal(persistedAttempt.response.status, 200, 'the local identity session and attempt survive HTTP runtime restart');
  parseAttemptResponse('getAttempt', 200, persistedAttempt.body);
  const stored = await fixture.pool.query(`SELECT state, grading_status, latest_score_id
      FROM tsa.attempts WHERE id=$1`, [attemptId]);
  assert.deepEqual(stored.rows[0], { state: 'GRADED', grading_status: 'SUCCEEDED', latest_score_id: scoreRunId });
  assert.equal(workerProxy.state.maxActive, 1, 'the runtime never overlaps worker iterations');
  assert.equal((await fixture.harness.authPool.query('SELECT 1 AS caller_pool_usable')).rows[0].caller_pool_usable, 1);

  await restartedRuntime.close();
  restartedRuntime = null;
  assert.equal((await workerPool.query('SELECT 1 AS caller_pool_usable')).rows[0].caller_pool_usable, 1);
});

for (const shutdownMode of ['fast', 'immediate']) test(shutdownMode === 'fast' ? 'queued grading, sealed snapshots and ownership survive an actual disposable PostgreSQL postmaster restart' : 'queued grading and exact sealed inputs recover after immediate PostgreSQL shutdown and WAL recovery', { timeout: 35_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  const database = fixture.harness.database;
  let runtime;
  let workerPool;
  t.after(async () => {
    await runtime?.close();
    await workerPool?.end();
    await fixture.close();
  });
  await database.pool.query('CREATE ROLE restart_worker LOGIN');
  await database.pool.query('GRANT tsa_exam_worker TO restart_worker');
  workerPool = createDatabasePool({ ...database.connectionConfig, user: 'restart_worker' });
  const disconnects = [];
  let restarting = false;
  for (const pool of [fixture.harness.authPool, fixture.bankPool, fixture.examPool, workerPool]) {
    pool.on('error', (error) => {
      assert.equal(restarting, true, 'idle pool error must be confined to the deliberate database restart');
      assert.ok(shutdownMode === 'fast' ? error.code === '57P01' : ['57P01', '57P02'].includes(error.code) || error.message === 'Connection terminated unexpectedly');
      disconnects.push(error.code);
    });
  }
  const workerProxy = createWorkerPoolProxy(workerPool);
  workerProxy.state.failClaims = true;
  const options = runtimeOptions(fixture, workerProxy.pool);
  runtime = await createStudentRuntime(options);
  const student = await login(runtime.origin, 'studentA');
  const other = await login(runtime.origin, 'studentB');
  const created = await send(runtime.origin, '/api/v1/attempts', student, {
    method: 'POST', body: { blueprintVersionId: fixture.blueprint.versionId },
  });
  assert.equal(created.response.status, 201);
  const { attemptId } = parseAttemptResponse('createAttempt', 201, created.body);
  const started = await send(runtime.origin, `/api/v1/attempts/${attemptId}/start`, student, { method: 'POST', body: {} });
  assert.equal(started.response.status, 200);
  const view = parseAttemptResponse('getAttempt', 200, (await send(runtime.origin, `/api/v1/attempts/${attemptId}`, student)).body);
  for (const slot of view.slots) {
    const save = await send(runtime.origin, `/api/v1/attempts/${attemptId}/answers/${slot.slotId}`, student, {
      method: 'PUT', body: { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'b' } },
    });
    assert.equal(save.response.status, 200);
  }
  const idleDeadline = Date.now() + 2_000;
  while (workerProxy.state.active > 0 && Date.now() < idleDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(workerProxy.state.active, 0, 'drain any pre-fault checked-out grading operation before submitting');
  const submitKey = key('restart-submit');
  const submitted = await send(runtime.origin, `/api/v1/attempts/${attemptId}/submit`, student, {
    method: 'POST', body: {}, keyValue: submitKey,
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.state, 'SUBMITTED');
  await runtime.close(); runtime = null;
  const snapshot = async () => (await database.pool.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=a.form_id) AS slots,
    (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.slot_id) FROM tsa_private.form_slot_secrets k WHERE k.form_id=a.form_id) AS keys,
    (SELECT to_jsonb(f) FROM tsa.forms f WHERE f.id=a.form_id) AS form,
    (SELECT jsonb_agg(to_jsonb(ans) ORDER BY ans.slot_id) FROM tsa.answers ans WHERE ans.attempt_id=a.id) AS answers,
    (SELECT to_jsonb(r) FROM tsa.assembly_runs r JOIN tsa.forms f ON f.assembly_run_id=r.id WHERE f.id=a.form_id) AS assembly,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    jsonb_build_object('createdAt',a.created_at,'startBeforeAt',a.start_before_at,'startedAt',a.started_at,
      'deadlineAt',a.deadline_at,'closedAt',a.closed_at) AS clocks,
    tsa.exam_grading_input_hash(a.id) AS digest
    FROM tsa.attempts a WHERE a.id=$1`, [attemptId])).rows[0];
  const before = await snapshot();
  const beforeStart = (await database.pool.query('SELECT pg_postmaster_start_time()::text AS started')).rows[0].started;
  const queued = (await database.pool.query('SELECT id,state,dedup_key FROM tsa.jobs WHERE attempt_id=$1', [attemptId])).rows;
  assert.equal(queued.length, 1); assert.equal(queued[0].state, 'QUEUED');
  for (const pool of [database.pool, fixture.harness.authPool, fixture.examPool, workerPool]) {
    assert.deepEqual((await pool.query("SELECT current_setting('fsync') AS fsync,current_setting('full_page_writes') AS full_page_writes,current_setting('synchronous_commit') AS synchronous_commit")).rows[0],
      { fsync: 'on', full_page_writes: 'on', synchronous_commit: 'on' });
  }
  restarting = true;
  const restarted = await database.restart({ shutdownMode });
  assert.deepEqual(restarted, { shutdownMode, recoveryObserved: shutdownMode === 'immediate' });
  // Reconnect each caller-owned pool before leaving the known disconnect window.
  for (const pool of [fixture.harness.authPool, fixture.bankPool, fixture.examPool, workerPool]) await pool.query('SELECT 1');
  restarting = false;
  assert.notEqual((await database.pool.query('SELECT pg_postmaster_start_time()::text AS started')).rows[0].started, beforeStart);
  assert.deepEqual(await snapshot(), before, 'sealed form, manifest, history, clocks, answers and digest persist exactly');
  assert.deepEqual((await database.pool.query('SELECT id,state,dedup_key FROM tsa.jobs WHERE attempt_id=$1', [attemptId])).rows, queued);
  const bankClient = await fixture.bankPool.connect();
  try {
    await bankClient.query('BEGIN');
    await bankClient.query("SELECT set_config('tsa.bank_fixture_scope',$1,true)", [fixture.fixtureScopeId]);
    assert.equal((await bankClient.query('SELECT tsa.bank_fixture_scope_active() AS active')).rows[0].active, false,
      'restarting never reauthorizes old synthetic publication scope');
    await bankClient.query('ROLLBACK');
  } finally { bankClient.release(); }
  // Keep the worker unavailable until ownership and pending-result privacy are checked.
  runtime = await createStudentRuntime(options);
  const pending = await send(runtime.origin, `/api/v1/attempts/${attemptId}/result`, student);
  assert.equal(pending.response.status, 409);
  assert.doesNotMatch(JSON.stringify(pending.body), /answerKey|correctAnswer|explanation|provenance/);
  const denied = await send(runtime.origin, `/api/v1/attempts/${attemptId}/result`, other);
  assert.equal(denied.response.status, 404);
  const replay = await send(runtime.origin, `/api/v1/attempts/${attemptId}/submit`, student, {
    method: 'POST', body: {}, keyValue: submitKey,
  });
  assert.equal(replay.response.status, 200); assert.deepEqual(replay.body, submitted.body);
  workerProxy.state.failClaims = false;
  const result = await waitForReleasedResult(runtime.origin, student, attemptId);
  const review = parseReleasedResponse(200, result.body);
  assert.equal(review.percentage, '100.00');
  await runtime.close(); runtime = null;
  assert.deepEqual(await snapshot(), before);
  const completed = (await database.pool.query(`SELECT j.id,j.state,
    (SELECT count(*)::int FROM tsa.score_runs s WHERE s.attempt_id=j.attempt_id) AS scores,
    (SELECT count(*)::int FROM tsa.result_releases r WHERE r.attempt_id=j.attempt_id AND r.revoked_at IS NULL) AS releases
    FROM tsa.jobs j WHERE j.attempt_id=$1`, [attemptId])).rows;
  assert.deepEqual(completed, [{ id: queued[0].id, state: 'SUCCEEDED', scores: 1, releases: 1 }]);
  assert.ok(disconnects.length > 0, 'the old postmaster actually disconnected existing idle clients');
});
