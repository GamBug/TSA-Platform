import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  releasedReviewRouteRegistry,
  studentRouteRegistry,
} from '../../../packages/contracts/dist/internal.js';
import { createAttemptHandler } from '../../../src/http/attempts.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { loginActor } from '../bank/harness.mjs';

const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
  attempt: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
});
const BASE_RIGHTS = Object.freeze({
  status: 'OWNED',
  allowedUses: ['DISPLAY', 'ADAPT'],
  territory: ['VN'],
  validFrom: '2000-01-01T00:00:00Z',
  validTo: null,
});

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

function headers(origin, browser, { json = true } = {}) {
  const result = new Headers({ origin });
  if (browser) {
    result.set('cookie', browser.cookies.join('; '));
    result.set('x-csrf-token', browser.csrf);
  }
  if (json) result.set('content-type', 'application/json');
  return result;
}

async function fetchJson(origin, path, { method = 'GET', headers: requestHeaders = new Headers(), body } = {}) {
  if (['POST', 'PUT'].includes(method.toUpperCase()) && !requestHeaders.has('idempotency-key')) {
    requestHeaders.set('idempotency-key', key('http-command'));
  }
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}

function parseResponse(route, status, body) {
  const definition = route === 'releasedResult'
    ? releasedReviewRouteRegistry.releasedResult
    : studentRouteRegistry[route];
  const schema = definition.responses[status]?.schema;
  assert.ok(schema, `${route} has a frozen response for ${status}`);
  return schema.parse(body);
}

function assertNoPrivateKeys(value) {
  const forbidden = new Set([
    'answerKey', 'keySnapshot', 'explanation', 'correctAnswer', 'provenance', 'provenanceIds',
    'sourceVersionId', 'questionVersionId', 'normalizedFingerprint', 'reviewNotes', 'createdBy',
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

async function createWorker(fixture) {
  const workerLogin = `http_grader_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${workerLogin} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${workerLogin}`);
  const workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: workerLogin }, {
    applicationName: 'tsa-results-http-grader-test',
    max: 2,
  });
  const worker = createExamWorker({ workerPool, executorId: 'results-http-grader', leaseSeconds: 30, retrySeconds: 30 });
  return { worker, workerPool };
}

test('released result HTTP enforces owner, readiness, unofficial review and current rights', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  let server;
  let workerPool;
  t.after(async () => {
    if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (workerPool) await workerPool.end();
    await fixture.close();
  });

  const browsers = {
    studentA: await loginActor(fixture.harness, 'studentA'),
    studentB: await loginActor(fixture.harness, 'studentB'),
    examManager: await loginActor(fixture.harness, 'examManager'),
  };
  const handlerRef = { current: null };
  const started = await startServer(handlerRef);
  server = started.server;
  const { origin } = started;
  fixture.harness.env.LOCAL_AUTH_TRUSTED_ORIGIN = origin;
  handlerRef.current = createAttemptHandler({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    trustedOrigin: origin,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });

  const attemptPath = '/api/v1/attempts';
  const created = await fetchJson(origin, attemptPath, {
    method: 'POST',
    headers: headers(origin, browsers.studentA),
    body: { blueprintVersionId: fixture.blueprint.versionId },
  });
  assert.equal(created.response.status, 201);
  const receipt = parseResponse('createAttempt', 201, created.body);
  const resultPath = `/api/v1/attempts/${receipt.attemptId}/result`;

  let result = await fetchJson(origin, resultPath, { headers: headers(origin, browsers.studentA, { json: false }) });
  assert.equal(result.response.status, 409);
  parseResponse('releasedResult', 409, result.body);
  assertNoPrivateKeys(result.body);

  const startedAttempt = await fetchJson(origin, `/api/v1/attempts/${receipt.attemptId}/start`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA),
    body: {},
  });
  assert.equal(startedAttempt.response.status, 200);
  const activeResponse = await fetchJson(origin, `/api/v1/attempts/${receipt.attemptId}`, {
    headers: headers(origin, browsers.studentA, { json: false }),
  });
  assert.equal(activeResponse.response.status, 200);
  const activeView = parseResponse('getAttempt', 200, activeResponse.body);
  for (const slot of activeView.slots) {
    const saved = await fetchJson(origin, `/api/v1/attempts/${receipt.attemptId}/answers/${slot.slotId}`, {
      method: 'PUT',
      headers: headers(origin, browsers.studentA),
      body: {
        expectedRevision: 0,
        value: { type: 'SINGLE_CHOICE', optionId: slot.interaction.options[0].id },
      },
    });
    assert.equal(saved.response.status, 200);
    parseResponse('saveAnswer', 200, saved.body);
  }
  result = await fetchJson(origin, resultPath, { headers: headers(origin, browsers.studentA, { json: false }) });
  assert.equal(result.response.status, 409, 'IN_PROGRESS attempts do not disclose grading keys');
  parseResponse('releasedResult', 409, result.body);
  assertNoPrivateKeys(result.body);

  const submitted = await fetchJson(origin, `/api/v1/attempts/${receipt.attemptId}/submit`, {
    method: 'POST',
    headers: headers(origin, browsers.studentA),
    body: {},
  });
  assert.equal(submitted.response.status, 200);
  const closure = parseResponse('submitAttempt', 200, submitted.body);
  assert.equal(closure.state, 'SUBMITTED');
  result = await fetchJson(origin, resultPath, { headers: headers(origin, browsers.studentA, { json: false }) });
  assert.equal(result.response.status, 409, 'SUBMITTED attempts remain unreleased until the worker finishes');
  parseResponse('releasedResult', 409, result.body);
  assertNoPrivateKeys(result.body);

  const unauthenticated = await fetchJson(origin, resultPath, { headers: headers(origin, null, { json: false }) });
  assert.equal(unauthenticated.response.status, 401);
  parseResponse('releasedResult', 401, unauthenticated.body);
  const foreign = await fetchJson(origin, resultPath, { headers: headers(origin, browsers.studentB, { json: false }) });
  assert.equal(foreign.response.status, 404);
  parseResponse('releasedResult', 404, foreign.body);
  const missing = await fetchJson(origin, `/api/v1/attempts/${randomUUID()}/result`, {
    headers: headers(origin, browsers.studentA, { json: false }),
  });
  assert.equal(missing.response.status, 404);
  parseResponse('releasedResult', 404, missing.body);
  const staff = await fetchJson(origin, resultPath, { headers: headers(origin, browsers.examManager, { json: false }) });
  assert.equal(staff.response.status, 403);
  parseResponse('releasedResult', 403, staff.body);

  const workerState = await createWorker(fixture);
  workerPool = workerState.workerPool;
  const graded = await workerState.worker.runOnce();
  assert.equal(graded.status, 'GRADED');
  assert.equal(graded.attemptId, receipt.attemptId);
  result = await fetchJson(origin, resultPath, { headers: headers(origin, browsers.studentA, { json: false }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  const review = parseResponse('releasedResult', 200, result.body);
  assert.equal(review.scoreLabel, 'UNOFFICIAL_PRACTICE');
  assert.equal(review.scoreRunId, graded.scoreRunId);
  assert.ok(review.items.length > 0);
  assert.ok(review.items.every((item) => item.correctAnswer && item.explanation.length > 0));
  assert.equal(JSON.stringify(review).includes('provenance'), false);
  assert.equal(JSON.stringify(review).includes('questionVersionId'), false);
  assert.equal(JSON.stringify(review).includes('reviewNotes'), false);

  const examRole = await fixture.examPool.query("SELECT pg_has_role(session_user,'tsa_exam_worker','MEMBER') AS worker");
  assert.deepEqual(examRole.rows, [{ worker: false }]);
  await assert.rejects(fixture.examPool.query("SELECT tsa.exam_worker_claim('student-http'::text,30::integer)"),
    (error) => error.code === '42501');

  const sourceService = await createSourceService({ bankPool: fixture.bankPool, identityService: fixture.identityService });
  await sourceService.registerRightsDecision(
    fixture.principals.bankManager,
    fixture.source.sourceVersionId,
    key('released-result-revoke'),
    {
      ...BASE_RIGHTS,
      status: 'REVOKED',
      allowedUses: ['DISPLAY'],
      evidence: 'Synthetic released-result rights fixture; not a real attestation.',
      expectedRevision: 1,
    },
  );
  const invalidated = await fetchJson(origin, resultPath, { headers: headers(origin, browsers.studentA, { json: false }) });
  assert.equal(invalidated.response.status, 410);
  parseResponse('releasedResult', 410, invalidated.body);
  assertNoPrivateKeys(invalidated.body);
});
