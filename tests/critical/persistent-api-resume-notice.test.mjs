import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistentApi } from '../../apps/practice-prototype/public/app/persistent-api.js';

const HELD = '00000000-0000-4000-8000-000000000011';
const FRESH = '00000000-0000-4000-8000-000000000012';
const FORM_ID = '00000000-0000-4000-8000-000000000002';
const FIXED_FORM_ID = '00000000-0000-4000-8000-000000000005';
const INSTANT = '2026-11-05T10:00:00.000000Z';
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const view = (attemptId, state) => ({ attemptId, state, formId: FORM_ID, domain: 'MATH', formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY',
  startBefore: null, serverNow: INSTANT, startedAt: state === 'IN_PROGRESS' ? INSTANT : null, deadlineAt: null,
  sections: [{ sectionId: 'math', count: 1 }], slots: [], answers: [], closure: { state, terminalReason: null, cancellationReason: null, closedAt: null, gradingStatus: null } });

/** A fake server in which every attempt becomes IN_PROGRESS once started. */
function setup() {
  const started = new Set();
  const created = [];
  const state = { cookie: 'csrf-a' };
  const api = createPersistentApi({ readCookie: () => state.cookie, fetchImpl: async (path, options = {}) => {
    if (path === '/local-auth/session') return reply({ authenticated: true, principal: { userId: `user-${state.cookie}`, actorKey: 'studentA', roles: ['CANDIDATE'] } });
    if (path.startsWith('/api/v1/attempts?')) return reply({ items: [], nextCursor: null });
    if (path.startsWith('/api/v1/topics?')) return reply({ groups: [] });
    if (path === '/api/v1/topic-practice') { created.push(FRESH); return reply({ attemptId: FRESH, formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY' }, 201); }
    if (path === '/api/v1/attempts' && options.method === 'POST') {
      created.push(FRESH);
      return reply({ attemptId: FRESH, formId: FORM_ID, state: 'CREATED', domain: 'MATH', formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY' }, 201);
    }
    const start = path.match(/^\/api\/v1\/attempts\/([0-9a-f-]+)\/start$/);
    if (start) { started.add(start[1]); return reply({ state: 'IN_PROGRESS' }); }
    const read = path.match(/^\/api\/v1\/attempts\/([0-9a-f-]+)$/);
    if (read) return reply(view(read[1], started.has(read[1]) ? 'IN_PROGRESS' : 'CREATED'));
    throw new Error(`Unexpected synthetic request: ${path}`);
  } });
  return { api, state, created };
}

test('starting a topic attempt created in this view is not reported as a resume', async () => {
  const { api } = setup();
  await api.openDemoSession(); await api.loadTopics();
  const receipt = await api.createTopicAttempt({ body: { taxonomyVersionId: 'tax', topicIds: ['t'], questionCount: 1 }, key: crypto.randomUUID() });
  const started = await api.startReservedAttempt(receipt.attempt.attemptId, receipt.attempt);
  assert.equal(started.attempt.state, 'IN_PROGRESS');
  assert.equal(started.resumed, false, 'a new attempt is not a resumed one');
});

test('starting a fixed or repeat-review attempt created in this view is not reported as a resume', async () => {
  for (const kind of ['fixed', 'review']) {
    const { api } = setup();
    await api.openDemoSession();
    const intent = kind === 'fixed' ? api.prepareFixedAttempt(FIXED_FORM_ID) : api.prepareReviewAttempt(FORM_ID);
    const receipt = kind === 'fixed' ? await api.createFixedAttempt(intent) : await api.createReviewAttempt(intent);
    const started = await api.startReservedAttempt(receipt.attemptId);
    assert.equal(started.resumed, false, kind);
  }
});

test('starting a held attempt that this view did not create is reported as a resume', async () => {
  const { api } = setup();
  await api.openDemoSession();
  const started = await api.startReservedAttempt(HELD);
  assert.equal(started.attempt.state, 'IN_PROGRESS');
  assert.equal(started.resumed, true);
});

test('an attempt created here and then reopened from saved state counts as resumed', async () => {
  const { api } = setup();
  await api.openDemoSession(); await api.loadTopics();
  const receipt = await api.createTopicAttempt({ body: { taxonomyVersionId: 'tax', topicIds: ['t'], questionCount: 1 }, key: crypto.randomUUID() });
  api.noteAttemptRestored(receipt.attempt.attemptId);
  assert.equal((await api.startReservedAttempt(receipt.attempt.attemptId)).resumed, true);
});

test('the first-start mark is consumed by the start and does not survive a change of identity', async () => {
  const { api, state } = setup();
  await api.openDemoSession(); await api.loadTopics();
  const receipt = await api.createTopicAttempt({ body: { taxonomyVersionId: 'tax', topicIds: ['t'], questionCount: 1 }, key: crypto.randomUUID() });
  assert.equal((await api.startReservedAttempt(receipt.attempt.attemptId)).resumed, false);
  assert.equal((await api.startReservedAttempt(receipt.attempt.attemptId)).resumed, true, 'a second start of the same attempt is a resume');

  const second = setup();
  await second.api.openDemoSession(); await second.api.loadTopics();
  await second.api.createTopicAttempt({ body: { taxonomyVersionId: 'tax', topicIds: ['t'], questionCount: 1 }, key: crypto.randomUUID() });
  await second.api.logout?.().catch(() => {});
  second.state.cookie = 'csrf-b';
  await second.api.openDemoSession();
  assert.equal((await second.api.startReservedAttempt(FRESH)).resumed, true, 'another identity never inherits the mark');
  void state;
});
