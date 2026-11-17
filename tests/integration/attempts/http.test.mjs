import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { studentRouteRegistry } from '../../../packages/contracts/dist/internal.js';
import { createAttemptHandler } from '../../../src/http/attempts.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { loginActor } from '../bank/harness.mjs';

function key(label) { return `${label}-${randomUUID()}`; }

async function dispatchNodeRequest(incoming, outgoing, handler) {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '));
    else if (value !== undefined) headers.set(name, value);
  }
  const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
    method: incoming.method,
    headers,
    ...(bytes.length ? { body: bytes } : {}),
  });
  const response = await handler(request);
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

async function startServer(handlerRef) {
  const server = createServer((incoming, outgoing) => {
    void dispatchNodeRequest(incoming, outgoing, handlerRef.current).catch(() => {
      outgoing.statusCode = 503;
      outgoing.end();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function authHeaders(origin, browser, { key: idempotencyKey, json = true } = {}) {
  const headers = new Headers({
    origin,
    cookie: browser.cookies.join('; '),
    'x-csrf-token': browser.csrf,
  });
  if (json) headers.set('content-type', 'application/json');
  if (idempotencyKey !== undefined) headers.set('idempotency-key', idempotencyKey);
  return headers;
}

async function fetchJson(origin, path, { method = 'GET', headers = new Headers(), body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}

function parseRouteResponse(route, status, body) {
  const schema = studentRouteRegistry[route].responses[status]?.schema;
  assert.ok(schema, `${route} has a frozen response for ${status}`);
  return schema.parse(body);
}

function assertNoPrivateKeys(value) {
  const forbidden = new Set(['answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance', 'sourceVersionId', 'reviewNotes']);
  const visit = (item) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (item === null || typeof item !== 'object') return;
    for (const [name, child] of Object.entries(item)) {
      assert.equal(forbidden.has(name), false, `private property leaked: ${name}`);
      visit(child);
    }
  };
  visit(value);
}

test('loopback HTTP creates, starts and returns only owned safe projections with shared USER_CREATE limits', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  t.after(() => fixture.close());
  const browsers = {
    studentA: await loginActor(fixture.harness, 'studentA'),
    studentB: await loginActor(fixture.harness, 'studentB'),
    author: await loginActor(fixture.harness, 'author'),
    bankManager: await loginActor(fixture.harness, 'bankManager'),
  };
  const handlerRef = { current: null };
  const { server, origin } = await startServer(handlerRef);
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  fixture.harness.env.LOCAL_AUTH_TRUSTED_ORIGIN = origin;
  const createRate = { capacity: 1, refillPerSecond: 0.001 };
  const handlerOne = createAttemptHandler({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    trustedOrigin: origin,
    createRate,
  });
  const handlerTwo = createAttemptHandler({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    trustedOrigin: origin,
    createRate,
  });
  handlerRef.current = handlerOne;

  const createBody = { blueprintVersionId: fixture.blueprint.versionId };
  const createKeyA = key('http-create-a');
  const createdAResult = await fetchJson(origin, '/api/v1/attempts', {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentA, { key: createKeyA }),
    body: createBody,
  });
  assert.equal(createdAResult.response.status, 201);
  const createdA = parseRouteResponse('createAttempt', 201, createdAResult.body);
  const attemptA = createdA.attemptId;

  const replayRequest = new Request(`${origin}/api/v1/attempts`, {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentA, { key: createKeyA }),
    body: JSON.stringify(createBody),
  });
  const replayResponse = await handlerTwo(replayRequest);
  const replayBody = await replayResponse.json();
  assert.equal(replayResponse.status, 201, 'matching receipt replay is checked before consuming the shared budget');
  assert.deepEqual(parseRouteResponse('createAttempt', 201, replayBody), createdA);

  const deniedRequest = new Request(`${origin}/api/v1/attempts`, {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentA, { key: key('http-create-denied') }),
    body: JSON.stringify(createBody),
  });
  const deniedResponse = await handlerTwo(deniedRequest);
  const deniedBody = await deniedResponse.json();
  assert.equal(deniedResponse.status, 429);
  parseRouteResponse('createAttempt', 429, deniedBody);
  assert.match(deniedResponse.headers.get('retry-after') ?? '', /^[1-9][0-9]*$/);
  const receiptCount = await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.idempotency_records
    WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts'`, [fixture.principals.studentA.userId]);
  assert.equal(receiptCount.rows[0].n, 1, 'a rate-limited request leaves no allocation receipt');

  const getCreated = await fetchJson(origin, `/api/v1/attempts/${attemptA}`, {
    headers: authHeaders(origin, browsers.studentA, { json: false }),
  });
  assert.equal(getCreated.response.status, 200);
  const createdView = parseRouteResponse('getAttempt', 200, getCreated.body);
  assert.equal(createdView.state, 'CREATED');
  assert.deepEqual(createdView.slots, []);
  assert.deepEqual(createdView.answers, []);
  assertNoPrivateKeys(createdView);

  const badCsrf = authHeaders(origin, browsers.studentA, { key: key('bad-csrf') });
  badCsrf.set('x-csrf-token', 'invalid-token');
  const csrfResponse = await fetchJson(origin, `/api/v1/attempts/${attemptA}/start`, {
    method: 'POST', headers: badCsrf, body: {},
  });
  assert.equal(csrfResponse.response.status, 403);
  parseRouteResponse('startAttempt', 403, csrfResponse.body);

  const badOriginHeaders = authHeaders(origin, browsers.studentA, { key: key('bad-origin') });
  badOriginHeaders.set('origin', 'http://example.invalid');
  const badOriginResponse = await handlerTwo(new Request(`${origin}/api/v1/attempts/${attemptA}/start`, {
    method: 'POST', headers: badOriginHeaders, body: '{}',
  }));
  assert.equal(badOriginResponse.status, 403);

  const badStartBody = await fetchJson(origin, `/api/v1/attempts/${attemptA}/start`, {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentA, { key: key('bad-start-body') }),
    body: { userId: fixture.principals.studentB.userId },
  });
  assert.equal(badStartBody.response.status, 422);
  parseRouteResponse('startAttempt', 422, badStartBody.body);

  const badQuery = await fetchJson(origin, `/api/v1/attempts/${attemptA}/start?unexpected=1`, {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentA, { key: key('bad-query') }),
    body: {},
  });
  assert.equal(badQuery.response.status, 422);
  parseRouteResponse('startAttempt', 422, badQuery.body);

  const unauthorized = await fetchJson(origin, '/api/v1/attempts', {
    method: 'POST',
    headers: authHeaders(origin, browsers.author, { key: key('author-http-create') }),
    body: createBody,
  });
  assert.equal(unauthorized.response.status, 403);
  parseRouteResponse('createAttempt', 403, unauthorized.body);

  const createBResult = await fetchJson(origin, '/api/v1/attempts', {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentB, { key: key('http-create-b') }),
    body: createBody,
  });
  assert.equal(createBResult.response.status, 201);
  const createdB = parseRouteResponse('createAttempt', 201, createBResult.body);
  const startedBResult = await fetchJson(origin, `/api/v1/attempts/${createdB.attemptId}/start`, {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentB, { key: key('http-start-b') }),
    body: {},
  });
  assert.equal(startedBResult.response.status, 200, 'start is not charged to the USER_CREATE bucket');
  parseRouteResponse('startAttempt', 200, startedBResult.body);
  const startedBView = await fetchJson(origin, `/api/v1/attempts/${createdB.attemptId}`, {
    headers: authHeaders(origin, browsers.studentB, { json: false }),
  });
  assert.equal(startedBView.response.status, 200);
  assert.equal(startedBView.body.state, 'IN_PROGRESS');
  assert.equal(startedBView.body.slots.length, fixture.blueprint.config.sections[0].count);
  assertNoPrivateKeys(startedBView.body);

  const bola = await fetchJson(origin, `/api/v1/attempts/${createdB.attemptId}`, {
    headers: authHeaders(origin, browsers.studentA, { json: false }),
  });
  assert.equal(bola.response.status, 404);
  parseRouteResponse('getAttempt', 404, bola.body);

  const sourceService = await createSourceService({
    bankPool: fixture.bankPool,
    identityService: fixture.identityService,
  });
  await sourceService.registerRightsDecision(
    fixture.principals.bankManager,
    fixture.source.sourceVersionId,
    key('http-rights-revoke'),
    {
      status: 'REVOKED',
      allowedUses: ['DISPLAY'],
      territory: ['VN'],
      validFrom: '2000-01-01T00:00:00Z',
      validTo: null,
      evidence: 'Synthetic HTTP delivery hold fixture; not a real rights attestation.',
      expectedRevision: 1,
    },
  );
  const restrictedGet = await fetchJson(origin, `/api/v1/attempts/${createdB.attemptId}`, {
    headers: authHeaders(origin, browsers.studentB, { json: false }),
  });
  assert.equal(restrictedGet.response.status, 410);
  parseRouteResponse('getAttempt', 410, restrictedGet.body);
  assert.equal(JSON.stringify(restrictedGet.body).includes('Synthetic'), false);

  const restrictedSubmit = await fetchJson(origin, `/api/v1/attempts/${attemptA}/submit`, {
    method: 'POST',
    headers: authHeaders(origin, browsers.studentA, { key: key('restricted-submit') }),
    body: {},
  });
  assert.equal(restrictedSubmit.response.status, 410);
  assert.equal(restrictedSubmit.body.error.code, 'CONTENT_WITHDRAWN');
  parseRouteResponse('submitAttempt', 410, restrictedSubmit.body);
  assertNoPrivateKeys(restrictedSubmit.body);
});
