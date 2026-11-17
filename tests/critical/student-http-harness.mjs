import assert from 'node:assert/strict';
import { studentRouteRegistry, releasedReviewRouteRegistry } from '../../packages/contracts/dist/internal.js';
import { createStudentRuntime } from '../../src/local/student.mjs';

/** Real local auth and HTTP; the model alone drives trusted worker progress. */
export async function createStudentHttpHarness(fixture, workerPool, checkSafe) {
  const isolatedWorker = { async connect() {
    const client = await workerPool.connect();
    return new Proxy(client, { get(target, name) {
      if (name === 'query') return (sql, values) => {
        if (typeof sql === 'string' && (sql.includes('tsa.exam_worker_sweep(') || sql.includes('tsa.exam_worker_claim('))) {
          throw new Error('Critical model isolates automatic worker progress');
        }
        return target.query(sql, values);
      };
      const value = Reflect.get(target, name, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  const rate = { capacity: 1000, refillPerSecond: 10 };
  const runtime = await createStudentRuntime({ identityPool: fixture.harness.authPool, examPool: fixture.examPool, workerPool: isolatedWorker,
    env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0, pollMilliseconds: 60_000,
    sweepBatchSize: 10, executorId: 'critical-http-isolated', leaseSeconds: 30, retrySeconds: 1,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const sessions = new Map(), observed = [];
  function cookies(session, reply) {
    for (const line of reply.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0], index = pair.indexOf('=');
      if (pair.slice(index + 1)) session.set(pair.slice(0, index), pair.slice(index + 1)); else session.delete(pair.slice(0, index));
    }
  }
  async function login(actorKey, principal) {
    const session = new Map();
    const call = async (path, body) => {
      const reply = await fetch(runtime.origin + path, { method: 'POST', signal: AbortSignal.timeout(5_000), headers: {
        origin: runtime.origin, 'content-type': 'application/json', cookie: [...session].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(session.has('tsa_local_csrf') ? { 'x-csrf-token': session.get('tsa_local_csrf') } : {}),
      }, body: JSON.stringify(body) });
      cookies(session, reply); return reply;
    };
    assert.equal((await call('/local-auth/bootstrap', {})).status, 201);
    const reply = await call('/local-auth/login', { actorKey });
    assert.equal(reply.status, 200);
    const body = await reply.json();
    assert.equal(body.principal.userId, principal.userId);
    assert.ok(session.has('tsa_local_session')); assert.ok(session.has('tsa_local_csrf'));
    sessions.set(principal.userId, session);
  }
  try {
    for (const actor of ['studentA', 'studentB', 'author']) await login(actor, fixture.principals[actor]);
  } catch (error) {
    await runtime.close(); throw error;
  }
  async function request(operation, principal, path, { key, body, csrf = true, authenticated = true, origin = runtime.origin } = {}) {
    const route = operation === 'releasedResult' ? releasedReviewRouteRegistry.releasedResult : studentRouteRegistry[operation];
    const session = sessions.get(principal.userId); assert.ok(session);
    const headers = { origin, ...(authenticated ? { cookie: [...session].map(([name, value]) => `${name}=${value}`).join('; ') } : {}),
      ...(csrf ? { 'x-csrf-token': session.get('tsa_local_csrf') } : {}), ...(key ? { 'idempotency-key': key } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
    const reply = await fetch(runtime.origin + path, { method: route.method, headers, signal: AbortSignal.timeout(5_000),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    assert.equal(reply.headers.get('cache-control'), 'no-store');
    assert.equal(reply.headers.get('x-content-type-options'), 'nosniff');
    assert.match(reply.headers.get('content-type'), /^application\/json/);
    const result = await reply.json();
    const requestId = reply.headers.get('x-request-id');
    if (reply.status >= 400 && requestId !== null) assert.equal(requestId, result.error.requestId);
    assert.ok(route.responses[reply.status], 'response status belongs to the frozen operation');
    route.responses[reply.status].schema.parse(result);
    if (operation !== 'releasedResult' || reply.status !== 200) checkSafe(result);
    observed.push({ operation, method: route.method, status: reply.status });
    return { status: reply.status, body: result };
  }
  async function command(operation, principal, path, options) {
    const result = await request(operation, principal, path, options);
    if (result.status >= 400) {
      const error = new Error('Student HTTP command rejected'); error.status = result.status; error.code = result.body.error.code;
      throw error;
    }
    return result;
  }
  return {
    close: () => runtime.close(), observed,
    read: (principal, id, result) => request(result ? 'releasedResult' : 'getAttempt', principal, `/api/v1/attempts/${id}${result ? '/result' : ''}`),
    probe: (principal, id, slotId, body, options) => request('saveAnswer', principal, `/api/v1/attempts/${id}/answers/${slotId}`, { key: crypto.randomUUID(), body, ...options }),
    service: {
      create: (principal, key, body) => command('createAttempt', principal, '/api/v1/attempts', { key, body }),
      start: (principal, id, key) => command('startAttempt', principal, `/api/v1/attempts/${id}/start`, { key, body: {} }),
      save: (principal, id, slotId, key, body) => command('saveAnswer', principal, `/api/v1/attempts/${id}/answers/${slotId}`, { key, body }),
      submit: (principal, id, key) => command('submitAttempt', principal, `/api/v1/attempts/${id}/submit`, { key, body: {} }),
    },
  };
}
