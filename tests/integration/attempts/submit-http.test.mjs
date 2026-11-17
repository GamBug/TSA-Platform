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
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 1, refillPerSecond: 0.000001 }),
  attempt: Object.freeze({ capacity: 1, refillPerSecond: 0.000001 }),
});

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

function assertNoPrivateKeys(value) {
  const forbidden = new Set([
    'answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance',
    'sourceVersionId', 'reviewNotes', 'normalizedFingerprint',
  ]);
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

async function createAndStart(context) {
  const { fixture, origin, browsers } = context;
  const created = await requestJson(origin, '/api/v1/attempts', {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-create') }),
    body: { blueprintVersionId: fixture.blueprint.versionId },
  });
  assert.equal(created.response.status, 201);
  const receipt = parseResponse('createAttempt', 201, created.body);
  const started = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/start`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-start') }),
    body: {},
  });
  assert.equal(started.response.status, 200);
  parseResponse('startAttempt', 200, started.body);
  const view = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}`, {
    headers: headers(origin, browsers.studentA, { json: false }),
  });
  assert.equal(view.response.status, 200);
  return { receipt, view: parseResponse('getAttempt', 200, view.body) };
}

test('loopback submit uses frozen auth/body/closure contracts and ignores exhausted answer-save budgets', async (t) => {
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
  const buildHandler = (includeSaveRate = true) => createAttemptHandler({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    trustedOrigin: origin,
    createRate: CREATE_RATE,
    ...(includeSaveRate ? { saveRate: SAVE_RATE } : {}),
  });
  const handlerOne = buildHandler(true);
  const handlerTwo = buildHandler(false);
  handlerRef.current = handlerOne;

  const { receipt, view } = await createAndStart({ fixture, browsers, origin });
  assert.deepEqual(view.answers, []);
  const slot = view.slots[0];
  const initialBuckets = await fixture.pool.query(`SELECT scope,subject_id,tokens::text AS tokens FROM tsa.rate_limit_buckets
    WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope,subject_id`);
  assert.equal(initialBuckets.rowCount, 0, 'create and start do not consume answer-save budgets');

  const saved = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/answers/${slot.slotId}`, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-save') }),
    body: {
      expectedRevision: 0,
      value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id },
    },
  });
  assert.equal(saved.response.status, 200);
  parseResponse('saveAnswer', 200, saved.body);
  const rateLimited = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/answers/${slot.slotId}`, {
    method: 'PUT',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-save-denied') }),
    body: {
      expectedRevision: 1,
      value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[1].id },
    },
  });
  assert.equal(rateLimited.response.status, 429);
  parseResponse('saveAnswer', 429, rateLimited.body);
  assert.match(rateLimited.response.headers.get('retry-after') ?? '', /^[1-9][0-9]*$/);
  const exhaustedBuckets = await fixture.pool.query(`SELECT scope,subject_id,tokens::text AS tokens FROM tsa.rate_limit_buckets
    WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope,subject_id`);
  assert.equal(exhaustedBuckets.rowCount, 2);
  for (const row of exhaustedBuckets.rows) assert.equal(Number(row.tokens), 0);

  const submitKey = key('submit-http-submit');
  handlerRef.current = handlerTwo;
  const submitted = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: submitKey }),
    body: {},
  });
  assert.equal(submitted.response.status, 200);
  const closure = parseResponse('submitAttempt', 200, submitted.body);
  assert.equal(closure.state, 'SUBMITTED');
  assert.equal(closure.terminalReason, 'EXPLICIT_SUBMIT');
  assert.equal(closure.gradingStatus, 'PENDING');
  assert.equal(submitted.response.headers.get('cache-control'), 'no-store');
  assert.equal(submitted.response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(submitted.response.headers.get('content-type') ?? '', /^application\/json/i);
  assertNoPrivateKeys(closure);

  const storedAnswers = await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.answers WHERE attempt_id=$1',
    [receipt.attemptId]);
  assert.equal(storedAnswers.rows[0].n, 1, 'submit preserves the acknowledged answer for grading');
  const jobsBeforeReplay = await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.jobs
    WHERE kind='exam_grade_attempt' AND attempt_id=$1`, [receipt.attemptId]);
  assert.equal(jobsBeforeReplay.rows[0].n, 1);

  // Model grading progress without invoking a worker; the first key must replay its
  // immutable acknowledgement while a new key observes only safe current closure metadata.
  await fixture.pool.query("UPDATE tsa.attempts SET grading_status='RUNNING' WHERE id=$1", [receipt.attemptId]);
  handlerRef.current = handlerOne;
  const replay = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: submitKey }),
    body: {},
  });
  assert.equal(replay.response.status, 200);
  assert.deepEqual(parseResponse('submitAttempt', 200, replay.body), closure,
    'same-key retry returns the exact original closure after grading metadata changes');

  const changedBody = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: submitKey }),
    body: { unexpected: true },
  });
  assert.equal(changedBody.response.status, 422);
  parseResponse('submitAttempt', 422, changedBody.body);
  assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.jobs
    WHERE kind='exam_grade_attempt' AND attempt_id=$1`, [receipt.attemptId])).rows[0].n, 1,
  'a changed command body is rejected before it can affect the closure or job');

  const currentClosure = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-current') }),
    body: {},
  });
  assert.equal(currentClosure.response.status, 200);
  assert.equal(parseResponse('submitAttempt', 200, currentClosure.body).gradingStatus, 'RUNNING',
    'a new key observes current terminal closure metadata');
  const jobsAfterReplay = await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.jobs
    WHERE kind='exam_grade_attempt' AND attempt_id=$1`, [receipt.attemptId]);
  assert.equal(jobsAfterReplay.rows[0].n, 1, 'natural terminal closure does not enqueue another job');
  const bucketsAfterSubmit = await fixture.pool.query(`SELECT scope,subject_id,tokens::text AS tokens FROM tsa.rate_limit_buckets
    WHERE scope IN ('USER_SAVE','ATTEMPT_SAVE') ORDER BY scope,subject_id`);
  assert.deepEqual(bucketsAfterSubmit.rows, exhaustedBuckets.rows, 'submit and replay do not touch save budgets');

  const csrfHeaders = headers(origin, browsers.studentA, { key: key('submit-http-csrf') });
  csrfHeaders.set('x-csrf-token', 'invalid');
  const badCsrf = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST', headers: csrfHeaders, body: {},
  });
  assert.equal(badCsrf.response.status, 403);
  parseResponse('submitAttempt', 403, badCsrf.body);

  const badOriginHeaders = headers(origin, browsers.studentA, { key: key('submit-http-origin') });
  badOriginHeaders.set('origin', 'http://example.invalid');
  const badOrigin = await handlerOne(new Request(`${origin}/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST', headers: badOriginHeaders, body: '{}',
  }));
  assert.equal(badOrigin.status, 403);
  parseResponse('submitAttempt', 403, await badOrigin.json());

  const badQuery = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit?extra=1`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-query') }),
    body: {},
  });
  assert.equal(badQuery.response.status, 422);
  parseResponse('submitAttempt', 422, badQuery.body);

  const badBody = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-body') }),
    body: { userId: fixture.principals.studentB.userId },
  });
  assert.equal(badBody.response.status, 422);
  parseResponse('submitAttempt', 422, badBody.body);

  const badJson = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA, { key: key('submit-http-json') }),
    body: '{',
  });
  assert.equal(badJson.response.status, 400);
  parseResponse('submitAttempt', 400, badJson.body);

  const missingKey = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST', headers: headers(origin, browsers.studentA), body: {},
  });
  assert.equal(missingKey.response.status, 422);
  parseResponse('submitAttempt', 422, missingKey.body);

  const unauthorized = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.author, { key: key('submit-http-author') }),
    body: {},
  });
  assert.equal(unauthorized.response.status, 403);
  parseResponse('submitAttempt', 403, unauthorized.body);

  const foreign = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentB, { key: key('submit-http-bola') }),
    body: {},
  });
  assert.equal(foreign.response.status, 404);
  parseResponse('submitAttempt', 404, foreign.body);

  const getClosed = await requestJson(origin, `/api/v1/attempts/${receipt.attemptId}`, {
    headers: headers(origin, browsers.studentA, { json: false }),
  });
  assert.equal(getClosed.response.status, 200);
  const closedView = parseResponse('getAttempt', 200, getClosed.body);
  assert.equal(closedView.state, 'SUBMITTED');
  assert.deepEqual(closedView.slots, []);
  assert.deepEqual(closedView.answers, []);
  assertNoPrivateKeys(closedView);
});
