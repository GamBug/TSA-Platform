import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistentApi } from '../../apps/practice-prototype/public/app/persistent-api.js';

const ATTEMPT_ID = '00000000-0000-4000-8000-000000000001';
const FORM_ID = '00000000-0000-4000-8000-000000000002';
const SLOT_ID = '00000000-0000-4000-8000-000000000003';
const BLUEPRINT_ID = '00000000-0000-4000-8000-000000000004';
const FIXED_FORM_ID = '00000000-0000-4000-8000-000000000005';
const SECTION_ID = 'synthetic-math';
const INSTANT = '2026-11-05T10:00:00.000000Z';
const DEADLINE = '2026-11-05T10:10:00.000000Z';
const CONTENT = [{ type: 'text', text: 'Synthetic practice content.' }];
const TEST_TIMEOUT_MS = 10_000;

function candidate(actorKey) {
  return { authenticated: true, principal: {
    userId: `synthetic-${actorKey}`, actorKey, roles: ['CANDIDATE'],
  } };
}

function reply(value, status = 200, afterGuard = null) {
  let hookQueued = false;
  return {
    status,
    get ok() {
      if (afterGuard && !hookQueued) {
        hookQueued = true;
        queueMicrotask(afterGuard);
      }
      return status >= 200 && status < 300;
    },
    async json() { return structuredClone(value); },
  };
}

function record(path, options = {}) {
  return {
    path,
    method: options.method ?? 'GET',
    headers: Object.fromEntries(options.headers?.entries?.() ?? []),
    body: options.body ? JSON.parse(options.body) : null,
  };
}

function attemptView(attemptId = ATTEMPT_ID, state = 'IN_PROGRESS') {
  const active = state === 'IN_PROGRESS';
  return {
    attemptId, state, formId: FORM_ID, domain: 'MATH',
    formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY',
    startBefore: null, serverNow: INSTANT, startedAt: INSTANT, deadlineAt: DEADLINE,
    sections: [{ sectionId: SECTION_ID, count: 1 }],
    slots: active ? [{ slotId: SLOT_ID, sectionId: SECTION_ID, ordinal: 1, stimulus: null,
      content: CONTENT, interaction: { type: 'SINGLE_CHOICE', options: [
        { id: 'a', content: CONTENT }, { id: 'b', content: CONTENT },
      ] } }] : [],
    answers: [],
    closure: { state, terminalReason: null, cancellationReason: null, closedAt: null, gradingStatus: null },
  };
}

function releasedReview(attemptId = ATTEMPT_ID) {
  return {
    attemptId, scoreLabel: 'UNOFFICIAL_PRACTICE', correctCount: 0, totalCount: 1, percentage: '0.00',
    items: [{ slotId: SLOT_ID, question: { slotId: SLOT_ID, ordinal: 1,
      interaction: { type: 'SINGLE_CHOICE', options: [{ id: 'a' }, { id: 'b' }] } },
      earned: 0, response: null, correctAnswer: { type: 'SINGLE_CHOICE', optionId: 'b' },
      explanation: CONTENT }],
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('startDemo rejects a cookie swap after its candidate session reply without allocating or starting', async () => {
  let cookie = 'csrf-a';
  const calls = [];
  const api = createPersistentApi({ readCookie: () => cookie, fetchImpl: async (path, options = {}) => {
    calls.push(record(path, options));
    if (path === '/local-auth/session') return reply(candidate('studentA'), 200, () => { cookie = 'csrf-b'; });
    if (path === '/api/v1/attempts?limit=100') return reply({ items: [], nextCursor: null });
    throw new Error(`Unexpected synthetic request: ${path}`);
  } });

  await assert.rejects(api.startDemo('MATH', BLUEPRINT_ID), { code: 'UNAUTHENTICATED', status: 401 });
  assert.equal(calls.filter((call) => call.path === '/api/v1/attempts' && call.method === 'POST').length, 0);
  assert.equal(calls.filter((call) => call.path.endsWith('/start') && call.method === 'POST').length, 0);
});

test('startDemo rejects a cookie swap after history request checks identity and before allocation', async () => {
  let cookie = 'csrf-a';
  const calls = [];
  const api = createPersistentApi({ readCookie: () => cookie, fetchImpl: async (path, options = {}) => {
    calls.push(record(path, options));
    if (path === '/local-auth/session') return reply(candidate('studentA'));
    if (path === '/api/v1/attempts?limit=100') return reply({ items: [], nextCursor: null }, 200, () => { cookie = 'csrf-b'; });
    throw new Error(`Unexpected synthetic request: ${path}`);
  } });

  await assert.rejects(api.startDemo('MATH', BLUEPRINT_ID), { code: 'UNAUTHENTICATED', status: 401 });
  assert.equal(calls.some((call) => call.path === '/api/v1/attempts' && call.method === 'POST'), false);
  assert.equal(calls.some((call) => call.path.endsWith('/start') && call.method === 'POST'), false);
});

test('logout queued after the inner request guard fences outer attempt and released-review reads',
  { timeout: TEST_TIMEOUT_MS }, async (t) => {
  for (const operation of ['attempt', 'review']) {
    const logoutStarted = deferred();
    let logoutPromise;
    let api;
    const afterGuard = () => {
      logoutPromise = api.logout();
      logoutStarted.resolve();
    };
    const calls = [];
    api = createPersistentApi({ readCookie: () => 'csrf-a', fetchImpl: async (path, options = {}) => {
      calls.push(record(path, options));
      if (path === `/api/v1/attempts/${ATTEMPT_ID}`) return reply(attemptView(), 200, operation === 'attempt' ? afterGuard : null);
      if (path === `/api/v1/attempts/${ATTEMPT_ID}/result`) return reply(releasedReview(), 200, operation === 'review' ? afterGuard : null);
      if (path === '/local-auth/logout') return reply({ authenticated: false });
      throw new Error(`Unexpected synthetic request: ${path}`);
    } });
    t.after(async () => { if (logoutPromise) await logoutPromise; });

    const oldRead = operation === 'attempt' ? api.readAttempt(ATTEMPT_ID) : api.readReview(ATTEMPT_ID);
    await assert.rejects(oldRead, { code: 'UNAUTHENTICATED', status: 401 });
    await logoutStarted.promise;
    await logoutPromise;
    if (operation === 'attempt') {
      await assert.rejects(api.saveAnswer(ATTEMPT_ID, SLOT_ID, 'b'), { code: 'ATTEMPT_CLOSED' });
      assert.equal(calls.some((call) => call.method === 'PUT'), false, 'the rejected private read did not populate the answer cache');
    }
  }
  t.diagnostic('The logout begins from a queued microtask in the response ok getter, after request identity checks.');
});

test('a fresh SDK can establish its authenticated session and complete a demo allocation', async () => {
  const calls = [];
  const api = createPersistentApi({ readCookie: () => 'csrf-a', fetchImpl: async (path, options = {}) => {
    calls.push(record(path, options));
    if (path === '/local-auth/session') return reply(candidate('studentA'));
    if (path === '/api/v1/attempts?limit=100') return reply({ items: [], nextCursor: null });
    if (path === '/api/v1/attempts' && options.method === 'POST') return reply({
      attemptId: ATTEMPT_ID, formId: FORM_ID, domain: 'MATH', state: 'CREATED',
      formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY',
    }, 201);
    if (path === `/api/v1/attempts/${ATTEMPT_ID}`) {
      const started = calls.some((call) => call.path === `/api/v1/attempts/${ATTEMPT_ID}/start`);
      return reply(attemptView(ATTEMPT_ID, started ? 'IN_PROGRESS' : 'CREATED'));
    }
    if (path === `/api/v1/attempts/${ATTEMPT_ID}/start`) return reply({ state: 'IN_PROGRESS' });
    throw new Error(`Unexpected synthetic request: ${path}`);
  } });

  const result = await api.startDemo('MATH', BLUEPRINT_ID);
  assert.equal(result.attempt.attemptId, ATTEMPT_ID);
  assert.equal(result.attempt.state, 'IN_PROGRESS');
  assert.equal(result.resumed, false);
  const writes = calls.filter((call) => call.method === 'POST' && call.path.startsWith('/api/v1/attempts'));
  assert.deepEqual(writes.map((call) => call.path), ['/api/v1/attempts', `/api/v1/attempts/${ATTEMPT_ID}/start`]);
  assert.ok(writes.every((call) => call.headers['x-csrf-token'] === 'csrf-a'));
});

test('first guest bootstrap and login cookie rotation establish the requested candidate session', async () => {
  let cookie = 'csrf-guest';
  let loggedInActor = null;
  const calls = [];
  const api = createPersistentApi({ readCookie: () => cookie, fetchImpl: async (path, options = {}) => {
    const call = record(path, options);
    calls.push(call);
    if (path === '/local-auth/session') return reply(loggedInActor ? candidate(loggedInActor) : { authenticated: false });
    if (path === '/local-auth/bootstrap') return reply({ authenticated: false, csrfToken: cookie });
    if (path === '/local-auth/login') {
      loggedInActor = options.body ? JSON.parse(options.body).actorKey : null;
      cookie = `csrf-${loggedInActor}`;
      return reply({ authenticated: true });
    }
    throw new Error(`Unexpected synthetic request: ${path}`);
  } });

  const session = await api.loginCandidate('studentA');
  assert.equal(session.principal.actorKey, 'studentA');
  const login = calls.find((call) => call.path === '/local-auth/login');
  assert.equal(login.headers['x-csrf-token'], 'csrf-guest');
  assert.equal(calls.filter((call) => call.path === '/local-auth/session').length, 2);
});

test('a stale start cannot clear a newer identity pending key or cached attempt',
  { timeout: TEST_TIMEOUT_MS }, async (t) => {
  const firstStartEntered = deferred();
  const firstStartResponse = deferred();
  t.after(() => firstStartResponse.resolve(reply({ error: { code: 'VALIDATION_ERROR' } }, 400)));
  let cookie = 'csrf-guest';
  let loggedInActor = null;
  let startCount = 0;
  const calls = [];
  const api = createPersistentApi({ readCookie: () => cookie, fetchImpl: async (path, options = {}) => {
    const call = record(path, options);
    calls.push(call);
    if (path === '/local-auth/session') return reply(loggedInActor ? candidate(loggedInActor) : { authenticated: false });
    if (path === '/local-auth/bootstrap') return reply({ authenticated: false, csrfToken: cookie });
    if (path === '/local-auth/login') {
      loggedInActor = JSON.parse(options.body).actorKey;
      cookie = `csrf-${loggedInActor}`;
      return reply({ authenticated: true });
    }
    if (path === '/local-auth/logout') {
      loggedInActor = null;
      return reply({ authenticated: false });
    }
    if (path === `/api/v1/attempts/${ATTEMPT_ID}/start`) {
      startCount += 1;
      if (startCount === 1) {
        firstStartEntered.resolve();
        return firstStartResponse.promise;
      }
      if (startCount === 2) return reply({ error: { code: 'TEMPORARILY_UNAVAILABLE' } }, 503);
      return reply({ state: 'IN_PROGRESS' });
    }
    if (path === `/api/v1/attempts/${ATTEMPT_ID}`) return reply(attemptView());
    if (path === `/api/v1/attempts/${ATTEMPT_ID}/answers/${SLOT_ID}`) {
      const body = JSON.parse(options.body);
      return reply({ slotId: SLOT_ID, revision: body.expectedRevision + 1, value: body.value, savedAt: INSTANT });
    }
    throw new Error(`Unexpected synthetic request: ${path}`);
  } });

  await api.loginCandidate('studentA');
  const staleStart = api.startReservedAttempt(ATTEMPT_ID);
  const staleRejected = assert.rejects(staleStart, { code: 'UNAUTHENTICATED', status: 401 });
  await firstStartEntered.promise;
  await api.logout();
  await api.loginCandidate('studentB');

  await assert.rejects(api.startReservedAttempt(ATTEMPT_ID), { code: 'TEMPORARILY_UNAVAILABLE', status: 503 });
  firstStartResponse.resolve(reply({ error: { code: 'VALIDATION_ERROR' } }, 400));
  await staleRejected;
  const resumed = await api.startReservedAttempt(ATTEMPT_ID);
  assert.equal(resumed.attempt.state, 'IN_PROGRESS');
  assert.equal((await api.saveAnswer(ATTEMPT_ID, SLOT_ID, 'b')).attempt.answeredCount, 1);

  const starts = calls.filter((call) => call.path === `/api/v1/attempts/${ATTEMPT_ID}/start`);
  assert.equal(starts.length, 3);
  assert.equal(starts[0].headers['x-csrf-token'], 'csrf-studentA');
  assert.ok(starts.slice(1).every((call) => call.headers['x-csrf-token'] === 'csrf-studentB'));
  assert.notEqual(starts[0].headers['idempotency-key'], starts[1].headers['idempotency-key']);
  assert.equal(starts[1].headers['idempotency-key'], starts[2].headers['idempotency-key'],
    'the uncertain newer operation retained its key after the stale response completed');
  const saved = calls.find((call) => call.method === 'PUT');
  assert.equal(saved.headers['x-csrf-token'], 'csrf-studentB');
});

test('prepared fixed, repeat-review, and short intents fail after their session nonce rotates', async () => {
  for (const kind of ['fixed', 'review', 'short']) {
    let cookie = 'csrf-a';
    const calls = [];
    const api = createPersistentApi({ readCookie: () => cookie, fetchImpl: async (path, options = {}) => {
      calls.push(record(path, options));
      if (path === '/local-auth/session') return reply(candidate('studentA'));
      if (path === '/api/v1/attempts?limit=100') return reply({ items: [], nextCursor: null });
      if (path.startsWith('/api/v1/catalog?')) return reply({ items: [{
        mode: 'PERSONALIZED_PRACTICE', domain: 'MATH', name: 'Synthetic short profile',
        questionCount: 2, durationSeconds: 180, reviewAllowed: true, blueprintVersionId: BLUEPRINT_ID,
        availableFrom: '2026-01-01T00:00:00.000Z', availableUntil: '2027-01-01T00:00:00.000Z',
      }, { mode: 'PUBLISHED_FIXED', formId: FIXED_FORM_ID, domain: 'MATH', name: 'Synthetic fixed form',
        questionCount: 1, durationSeconds: 600, profileKind: 'PUBLIC_REFERENCE', repeatsAllowed: true,
        availableFrom: '2026-01-01T00:00:00.000Z', availableUntil: '2027-01-01T00:00:00.000Z',
      }], nextCursor: null });
      if (path === '/api/v1/attempts' && options.method === 'POST') return reply({
        attemptId: ATTEMPT_ID, formId: FORM_ID, state: 'CREATED', domain: 'MATH',
        formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY',
      }, 201);
      throw new Error(`Unexpected synthetic request: ${path}`);
    } });

    await api.openDemoSession();
    let intent;
    if (kind === 'fixed') intent = api.prepareFixedAttempt(FIXED_FORM_ID);
    if (kind === 'review') intent = api.prepareReviewAttempt(BLUEPRINT_ID);
    if (kind === 'short') {
      await api.loadCatalog();
      intent = api.prepareShortAttempt(BLUEPRINT_ID);
    }
    cookie = 'csrf-b';

    const create = kind === 'fixed' ? api.createFixedAttempt(intent)
      : kind === 'review' ? api.createReviewAttempt(intent) : api.createShortAttempt(intent);
    await assert.rejects(create, { code: 'UNAUTHENTICATED', status: 401 });
    assert.equal(calls.some((call) => call.path === '/api/v1/attempts' && call.method === 'POST'), false,
      `${kind} consent did not allocate under the rotated cookie`);
  }
});
