import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistentApi } from '../public/app/persistent-api.js';

const attemptId = '00000000-0000-4000-8000-000000000001';
function setup() {
  const state = { cookie: 'synthetic-a', loseNext: false, swapSession: false, calls: [] };
  const respond = (body) => new Response(JSON.stringify(body));
  const api = createPersistentApi({ readCookie: () => state.cookie, fetchImpl: async (path, options = {}) => {
    state.calls.push({ path, body: options.body, key: options.headers?.get('idempotency-key') });
    if (path === '/local-auth/session') {
      if (state.swapSession) state.cookie = 'synthetic-b';
      return respond({ authenticated: true, principal: { userId: 'synthetic-user', actorKey: 'studentA', roles: ['CANDIDATE'] } });
    }
    if (path.startsWith('/api/v1/attempts?')) return respond({ items: [], nextCursor: null });
    if (path.startsWith('/api/v1/topics?')) return respond({ groups: [] });
    if (path === '/api/v1/topic-practice') {
      if (state.loseNext) { state.loseNext = false; throw new Error('Synthetic lost receipt'); }
      return respond({ attemptId, formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY' });
    }
    if (path === `/api/v1/attempts/${attemptId}`) return respond({ attemptId, formId: 'synthetic-form', domain: 'MATH',
      state: 'CREATED', formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY',
      sections: [{ sectionId: 'math', count: 2 }], slots: [], answers: [], closure: {} });
    throw new Error(`Unexpected test request: ${path}`);
  } });
  return { api, state };
}
const intent = () => ({ body: { taxonomyVersionId: 'synthetic-taxonomy', topicIds: ['synthetic-topic'], questionCount: 2 }, key: crypto.randomUUID() });

test('topic creation requires an identity-bound loaded catalog', async () => {
  const { api, state } = setup();
  await api.openDemoSession();
  await assert.rejects(api.createTopicAttempt(intent()), { code: 'UNAUTHENTICATED' });
  assert.equal(state.calls.some((call) => call.path === '/api/v1/topic-practice'), false);
});

test('topic creation rejects cookie changes before and during the session read without dispatching allocation', async () => {
  for (const timing of ['before', 'during']) {
    const { api, state } = setup();
    await api.openDemoSession(); await api.loadTopics();
    if (timing === 'before') state.cookie = 'synthetic-b'; else state.swapSession = true;
    await assert.rejects(api.createTopicAttempt(intent()), { code: 'UNAUTHENTICATED' });
    assert.equal(state.calls.some((call) => call.path === '/api/v1/topic-practice'), false);
  }
});

test('uncertain topic retries retain exact original body and idempotency key', async () => {
  const { api, state } = setup();
  await api.openDemoSession(); await api.loadTopics();
  const request = intent(); state.loseNext = true;
  await assert.rejects(api.createTopicAttempt(request), { code: 'TEMPORARILY_UNAVAILABLE' });
  request.body.questionCount = 99;
  request.key = crypto.randomUUID();
  const result = await api.createTopicAttempt(request);
  assert.equal(result.attempt.state, 'CREATED');
  const posts = state.calls.filter((call) => call.path === '/api/v1/topic-practice');
  assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1]);
  assert.equal(JSON.parse(posts[1].body).questionCount, 2);
});
