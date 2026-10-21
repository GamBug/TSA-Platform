import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { studentRouteRegistry } from '../../../packages/contracts/dist/internal.js';
import { createAttemptHandler } from '../../../src/http/attempts.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { loginActor } from '../bank/harness.mjs';

const CREATE_RATE = Object.freeze({ capacity: 20, refillPerSecond: 10 });
function key(label) { return `${label}-${randomUUID()}`; }

async function dispatchNodeRequest(incoming, outgoing, handlerRef) {
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
  const response = await handlerRef.current(request);
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

async function startServer(handlerRef) {
  const server = createServer((incoming, outgoing) => {
    void dispatchNodeRequest(incoming, outgoing, handlerRef).catch(() => {
      outgoing.statusCode = 503;
      outgoing.end();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function headers(origin, browser, { key: idempotencyKey, json = true, csrf = browser.csrf } = {}) {
  const value = new Headers({
    origin,
    cookie: browser.cookies.join('; '),
    'x-csrf-token': csrf,
  });
  if (json) value.set('content-type', 'application/json');
  if (idempotencyKey !== undefined) value.set('idempotency-key', idempotencyKey);
  return value;
}

async function requestJson(origin, path, { method = 'GET', headers: requestHeaders = new Headers(), body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}

function parseResponse(operation, status, body) {
  const schema = studentRouteRegistry[operation].responses[status]?.schema;
  assert.ok(schema, `${operation} has a frozen response for ${status}`);
  return schema.parse(body);
}

async function setup(t, saveRate) {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  t.after(() => fixture.close());
  const browsers = {
    studentA: await loginActor(fixture.harness, 'studentA'),
    studentB: await loginActor(fixture.harness, 'studentB'),
    author: await loginActor(fixture.harness, 'author'),
  };
  const handlerRef = { current: null };
  const { server, origin } = await startServer(handlerRef);
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  fixture.harness.env.LOCAL_AUTH_TRUSTED_ORIGIN = origin;
  const buildHandler = () => createAttemptHandler({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    trustedOrigin: origin,
    createRate: CREATE_RATE,
    saveRate,
  });
  const handlerOne = buildHandler();
  const handlerTwo = buildHandler();
  handlerRef.current = handlerOne;
  return { fixture, browsers, handlerRef, handlerOne, handlerTwo, origin };
}

async function createAndStart(context, browser = context.browsers.studentA, label = 'http-save') {
  const { fixture, origin } = context;
  const createdResult = await requestJson(origin, '/api/v1/attempts', {
    method: 'POST',
    headers: headers(origin, browser, { key: key(`${label}-create`) }),
    body: { blueprintVersionId: fixture.blueprint.versionId },
  });
  assert.equal(createdResult.response.status, 201);
  const created = parseResponse('createAttempt', 201, createdResult.body);
  const startResult = await requestJson(origin, `/api/v1/attempts/${created.attemptId}/start`, {
    method: 'POST',
    headers: headers(origin, browser, { key: key(`${label}-start`) }),
    body: {},
  });
  assert.equal(startResult.response.status, 200);
  parseResponse('startAttempt', 200, startResult.body);
  const viewResult = await requestJson(origin, `/api/v1/attempts/${created.attemptId}`, {
    headers: headers(origin, browser, { json: false }),
  });
  assert.equal(viewResult.response.status, 200);
  return { created, view: parseResponse('getAttempt', 200, viewResult.body) };
}

async function bucketRows(pool) {
  const result = await pool.query(`SELECT scope,subject_id,tokens::text AS tokens FROM tsa.rate_limit_buckets
    WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope,subject_id`);
  return result.rows;
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

test('loopback PUT persists safe answers and enforces frozen validation, CSRF, origin and query boundaries', async (t) => {
  const context = await setup(t, {
    user: { capacity: 20, refillPerSecond: 0.000001 },
    attempt: { capacity: 20, refillPerSecond: 0.000001 },
  });
  const { fixture, browsers, origin } = context;
  const { created, view } = await createAndStart(context);
  assert.equal(view.slots.length, fixture.blueprint.config.sections[0].count);
  assert.deepEqual(await bucketRows(fixture.pool), [], 'create and start do not charge either save budget');

  const slot = view.slots[0];
  const savePath = `/api/v1/attempts/${created.attemptId}/answers/${slot.slotId}`;
  const payload = { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'b' } };
  const saved = await requestJson(origin, savePath, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA, { key: key('http-answer') }),
    body: payload,
  });
  assert.equal(saved.response.status, 200);
  const ack = parseResponse('saveAnswer', 200, saved.body);
  assert.equal(ack.revision, 1);
  assert.equal(saved.response.headers.get('cache-control'), 'no-store');
  assert.equal(saved.response.headers.get('x-content-type-options'), 'nosniff');
  assertNoPrivateKeys(saved.body);

  const afterSaved = await bucketRows(fixture.pool);
  assert.equal(afterSaved.length, 2);
  assert.deepEqual(new Set(afterSaved.map((row) => row.scope)), new Set(['USER_SAVE', 'ATTEMPT_SAVE']));

  const badCsrf = await requestJson(origin, savePath, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA, { key: key('http-bad-csrf'), csrf: 'invalid' }),
    body: { expectedRevision: 1, value: payload.value },
  });
  assert.equal(badCsrf.response.status, 403);
  parseResponse('saveAnswer', 403, badCsrf.body);

  const badOriginHeaders = headers(origin, browsers.studentA, { key: key('http-bad-origin') });
  badOriginHeaders.set('origin', 'http://example.invalid');
  const badOrigin = await requestJson(origin, savePath, {
    method: 'PUT', headers: badOriginHeaders, body: { expectedRevision: 1, value: payload.value },
  });
  assert.equal(badOrigin.response.status, 403);
  parseResponse('saveAnswer', 403, badOrigin.body);

  const queryRejected = await requestJson(origin, `${savePath}?unexpected=1`, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA, { key: key('http-save-query') }),
    body: { expectedRevision: 1, value: payload.value },
  });
  assert.equal(queryRejected.response.status, 422);
  parseResponse('saveAnswer', 422, queryRejected.body);

  const missingKey = await requestJson(origin, savePath, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA),
    body: { expectedRevision: 1, value: payload.value },
  });
  assert.equal(missingKey.response.status, 422);
  parseResponse('saveAnswer', 422, missingKey.body);

  const malformed = await requestJson(origin, savePath, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA, { key: key('http-malformed') }),
    body: '{invalid-json',
  });
  assert.equal(malformed.response.status, 400);
  parseResponse('saveAnswer', 400, malformed.body);
  assert.deepEqual(await bucketRows(fixture.pool), afterSaved,
    'CSRF/origin/query/key and malformed JSON failures have no save-budget or answer side effects');

  const invalidShape = await requestJson(origin, savePath, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA, { key: key('http-invalid-shape') }),
    body: { expectedRevision: -1, value: payload.value },
  });
  assert.equal(invalidShape.response.status, 422);
  parseResponse('saveAnswer', 422, invalidShape.body);
  const afterInvalidShape = await bucketRows(fixture.pool);
  for (const scope of ['USER_SAVE', 'ATTEMPT_SAVE']) {
    const before = afterSaved.find((row) => row.scope === scope);
    const after = afterInvalidShape.find((row) => row.scope === scope);
    assert.ok(Number(after.tokens) <= Number(before.tokens) - 0.999,
      `${scope} charges an authorized save before frozen body validation`);
  }

  const active = await requestJson(origin, `/api/v1/attempts/${created.attemptId}`, {
    headers: headers(origin, browsers.studentA, { json: false }),
  });
  assert.equal(active.response.status, 200);
  const activeView = parseResponse('getAttempt', 200, active.body);
  assert.equal(activeView.answers.length, 1);
  assert.deepEqual(activeView.answers[0], ack);
  assertNoPrivateKeys(activeView);

  const foreignBefore = await bucketRows(fixture.pool);
  const foreign = await requestJson(origin, `/api/v1/attempts/${created.attemptId}/answers/${slot.slotId}`, {
    method: 'PUT',
    headers: headers(origin, browsers.studentB, { key: key('http-save-foreign') }),
    body: { expectedRevision: 1, value: payload.value },
  });
  assert.equal(foreign.response.status, 404);
  parseResponse('saveAnswer', 404, foreign.body);
  assert.deepEqual(await bucketRows(fixture.pool), foreignBefore, 'BOLA denial creates no save buckets');

  const unauthorized = await requestJson(origin, `/api/v1/attempts/${created.attemptId}/answers/${slot.slotId}`, {
    method: 'PUT',
    headers: headers(origin, browsers.author, { key: key('http-save-unauthorized') }),
    body: { expectedRevision: 1, value: payload.value },
  });
  assert.equal(unauthorized.response.status, 403);
  parseResponse('saveAnswer', 403, unauthorized.body);
  assert.deepEqual(await bucketRows(fixture.pool), foreignBefore, 'non-candidate role creates no save buckets');
});

for (const { label, rate, expectedScope } of [
  {
    label: 'USER_SAVE',
    rate: { user: { capacity: 1, refillPerSecond: 0.000001 }, attempt: { capacity: 5, refillPerSecond: 0.000001 } },
    expectedScope: 'USER_SAVE',
  },
  {
    label: 'ATTEMPT_SAVE',
    rate: { user: { capacity: 5, refillPerSecond: 0.000001 }, attempt: { capacity: 1, refillPerSecond: 0.000001 } },
    expectedScope: 'ATTEMPT_SAVE',
  },
]) {
  test(`loopback PUT shares ${label} limits across independent handlers without acknowledging a denied answer`, async (t) => {
    const context = await setup(t, rate);
    const { fixture, browsers, origin, handlerRef, handlerTwo } = context;
    const { created, view } = await createAndStart(context, browsers.studentA, `http-${label}`);
    const [firstSlot, secondSlot] = view.slots;
    assert.ok(secondSlot, 'fixture provides two independently answerable slots');
    const firstPath = `/api/v1/attempts/${created.attemptId}/answers/${firstSlot.slotId}`;
    const first = await requestJson(origin, firstPath, {
      method: 'PUT',
      headers: headers(origin, browsers.studentA, { key: key(`${label}-first`) }),
      body: { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'a' } },
    });
    assert.equal(first.response.status, 200);
    parseResponse('saveAnswer', 200, first.body);

    handlerRef.current = handlerTwo;
    const beforeDenied = await bucketRows(fixture.pool);
    const secondPath = `/api/v1/attempts/${created.attemptId}/answers/${secondSlot.slotId}`;
    const denied = await requestJson(origin, secondPath, {
      method: 'PUT',
      headers: headers(origin, browsers.studentA, { key: key(`${label}-denied`) }),
      body: { expectedRevision: 0, value: { type: 'SINGLE_CHOICE', optionId: 'b' } },
    });
    assert.equal(denied.response.status, 429);
    parseResponse('saveAnswer', 429, denied.body);
    assert.match(denied.response.headers.get('retry-after') ?? '', /^[1-9][0-9]*$/);
    const rows = await bucketRows(fixture.pool);
    assert.deepEqual(rows, beforeDenied, 'a denied command neither consumes nor refills either bucket');
    assert.equal(rows.find((row) => row.scope === expectedScope)?.tokens, '0.000000',
      `${expectedScope} bucket is shared by the independent HTTP handlers`);
    const answers = await fixture.pool.query('SELECT slot_id,revision FROM tsa.answers WHERE attempt_id=$1 ORDER BY slot_id',
      [created.attemptId]);
    assert.equal(answers.rowCount, 1, 'a rate-limited answer creates no answer acknowledgement or row');
    assert.equal(answers.rows[0].slot_id, firstSlot.slotId);
    assert.equal(Number(answers.rows[0].revision), 1);
  });
}
