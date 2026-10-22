import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistentApi } from '../public/app/persistent-api.js';

const blocks = [{ type: 'text', text: 'Synthetic Vietnamese practice text: tiếng Việt.' }];
const options = [{ id: 'a', content: blocks }, { id: 'b', content: blocks }];
function view(state = 'IN_PROGRESS') {
  return { attemptId: 'attempt-one', formId: 'form-one', domain: 'MATH', state,
    formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY', startBefore: null,
    serverNow: '2026-10-22T00:00:00.000000Z', startedAt: '2026-10-22T00:00:00.000000Z',
    deadlineAt: '2026-10-22T00:10:00.000000Z', sections: [{ sectionId: 'math', count: 3 }],
    slots: state === 'IN_PROGRESS' ? [
      { slotId: 'sc', sectionId: 'math', ordinal: 1, stimulus: null, content: blocks,
        interaction: { type: 'SINGLE_CHOICE', options } },
      { slotId: 'mc', sectionId: 'math', ordinal: 2, stimulus: null, content: blocks,
        interaction: { type: 'MULTIPLE_CHOICE', options, minSelections: 1, maxSelections: 2 } },
      { slotId: 'tf', sectionId: 'math', ordinal: 3, stimulus: null, content: blocks,
        interaction: { type: 'TRUE_FALSE_GROUP', statements: [{ id: '__proto__', content: blocks }, { id: 's2', content: blocks }] } },
    ] : [], answers: [], closure: { state, terminalReason: state === 'SUBMITTED' ? 'EXPLICIT_SUBMIT' : null,
      closedAt: state === 'SUBMITTED' ? '2026-10-22T00:01:00.000000Z' : null,
      gradingStatus: state === 'SUBMITTED' ? 'PENDING' : null } };
}
function harness() {
  const calls = [], state = { view: view(), loseNextAck: false, held: false, saved: new Map(), principal: {
    userId: 'student-a', actorKey: 'studentA', roles: ['CANDIDATE'],
  } };
  const respond = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const fetchImpl = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, ...options, body });
    if (path === '/local-auth/session') return respond({ authenticated: true, principal: state.principal });
    if (path.startsWith('/api/v1/attempts?')) return respond({ items: [{ attemptId: 'attempt-one', state: state.view.state }], nextCursor: null });
    if (path.endsWith('/result')) {
      if (state.held) return respond({ error: { code: 'CONTENT_WITHDRAWN', message: 'Private transport detail.', details: {} } }, 410);
      return respond({ attemptId: 'attempt-one', scoreLabel: 'UNOFFICIAL_PRACTICE', correctCount: 0,
        totalCount: 3, percentage: '0.00', items: view().slots.map((question) => ({ slotId: question.slotId,
          question, earned: 0, response: null, correctAnswer: question.interaction.type === 'SINGLE_CHOICE'
            ? { type: 'SINGLE_CHOICE', optionId: 'b' } : question.interaction.type === 'MULTIPLE_CHOICE'
              ? { type: 'MULTIPLE_CHOICE', optionIds: ['b'] }
              : { type: 'TRUE_FALSE_GROUP', values: { ['__proto__']: true, s2: false } }, explanation: blocks })) });
    }
    if (path.includes('/answers/')) {
      const key = options.headers.get('idempotency-key');
      if (!state.saved.has(key)) state.saved.set(key, { slotId: path.split('/').at(-1), value: body.value,
        revision: body.expectedRevision + 1, savedAt: '2026-10-22T00:00:01.000000Z' });
      if (state.loseNextAck) { state.loseNextAck = false; throw new Error('Acknowledgement lost after synthetic commit'); }
      return respond(state.saved.get(key));
    }
    if (path.endsWith('/submit')) { state.view = view('SUBMITTED'); return respond(state.view.closure); }
    if (path === '/api/v1/attempts/attempt-one') return respond(state.view);
    throw new Error(`Unexpected synthetic request ${path}`);
  };
  return { api: createPersistentApi({ fetchImpl, readCookie: () => 'csrf-fixture' }), calls, state };
}

test('persistent transport preserves exact retry keys and applies only acknowledged typed answer revisions', async () => {
  const { api, calls, state } = harness();
  const opened = await api.openDemoSession();
  assert.equal(opened.attempt.answeredCount, 0);
  state.loseNextAck = true;
  await assert.rejects(api.saveAnswer('attempt-one', 'sc', { optionId: 'a' }), { code: 'TEMPORARILY_UNAVAILABLE' });
  const retry = await api.saveAnswer('attempt-one', 'sc', { optionId: 'a' });
  const saved = calls.filter((call) => call.path.endsWith('/answers/sc'));
  assert.equal(saved.length, 2);
  assert.equal(saved[0].headers.get('idempotency-key'), saved[1].headers.get('idempotency-key'));
  assert.deepEqual(saved[0].body, saved[1].body);
  assert.equal(retry.attempt.answers[0].revision, 1);
  assert.equal(retry.attempt.answeredCount, 1);
  assert.equal(saved[0].headers.get('x-csrf-token'), 'csrf-fixture');
  assert.equal(saved[0].credentials, 'same-origin'); assert.equal(saved[0].cache, 'no-store');
  const cleared = await api.saveAnswer('attempt-one', 'sc', { optionId: null });
  assert.equal(cleared.attempt.answers[0].revision, 2); assert.equal(cleared.attempt.answeredCount, 0);
  const multi = await api.saveAnswer('attempt-one', 'mc', { type: 'MULTIPLE_CHOICE', optionIds: ['b', 'a'] });
  assert.deepEqual(multi.attempt.answers.find((item) => item.slotId === 'mc').optionIds, ['a', 'b']);
  const partial = await api.saveAnswer('attempt-one', 'tf', { type: 'TRUE_FALSE_GROUP', statementValues: [{ statementId: '__proto__', value: true }] });
  assert.equal(partial.attempt.answeredCount, 1, 'partial true/false remains incomplete');
  assert.deepEqual(calls.filter((call) => call.path.endsWith('/answers/tf')).at(-1).body.value,
    { type: 'TRUE_FALSE_GROUP', values: { ['__proto__']: true, s2: null } });
  assert.ok(calls.every((call) => !call.path.startsWith('/mock')));
  assert.ok(calls.filter((call) => call.path.includes('/answers/')).every((call) => call.method === 'PUT'));
});

test('persistent submission remains pending without a worker and released review always rechecks server access', async () => {
  const { api, state } = harness();
  await api.openDemoSession();
  const closed = await api.submitAttempt('attempt-one');
  assert.equal(closed.attempt.state, 'SUBMITTED'); assert.equal(closed.attempt.gradingStatus, 'PENDING');
  assert.deepEqual(closed.attempt.slots, []); assert.equal(closed.attempt.result, null);
  state.view = view('GRADED');
  const graded = await api.readAttempt('attempt-one');
  assert.equal(graded.attempt.result.percentage, '0.00'); assert.equal(graded.attempt.slots.length, 3);
  assert.equal(JSON.stringify(graded).includes('correctAnswer'), false, 'ordinary UI model excludes released keys');
  const released = await api.readReview('attempt-one');
  assert.equal(released.review.slots[0].correctOptionId, 'b');
  state.held = true;
  await assert.rejects(api.readReview('attempt-one'), (error) => error.code === 'CONTENT_WITHDRAWN'
    && error.status === 410 && !error.message.includes('Private transport detail'));
});

test('persistent local login is explicit and never assumes a staff session is a candidate', async () => {
  const { api, state, calls } = harness();
  await assert.rejects(api.loginCandidate('author'), { code: 'FORBIDDEN' });
  assert.equal(calls.length, 0);
  state.principal = { userId: 'author', actorKey: 'author', roles: ['AUTHOR'] };
  await assert.rejects(api.openDemoSession(), { code: 'FORBIDDEN' });
  assert.ok(calls.every((call) => call.path === '/local-auth/session'));
});
