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
function harness({ beforeResponse = async () => {} } = {}) {
  const calls = [], state = { view: view(), loseNextAck: false, held: false, saved: new Map(), principal: {
    userId: 'student-a', actorKey: 'studentA', roles: ['CANDIDATE'],
  } };
  const respond = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const rawFetch = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, ...options, body });
    if (path === '/local-auth/session') return respond({ authenticated: true, principal: state.principal });
    if (path.startsWith('/api/v1/catalog?')) return respond({ items: [], nextCursor: null });
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
  const fetchImpl = async (path, options) => {
    const response = await rawFetch(path, options);
    return await beforeResponse(path, options, response) ?? response;
  };
  return { api: createPersistentApi({ fetchImpl, readCookie: () => 'csrf-fixture' }), calls, state };
}

function responseBarrier() {
  let enter, release, predicate = () => false;
  const entered = new Promise((resolve) => { enter = resolve; });
  const wait = new Promise((resolve) => { release = resolve; });
  return { entered, release, hold(match) { predicate = match; }, async intercept(path, options, response) {
    if (!predicate(path, options)) return;
    predicate = () => false; enter(); await wait;
    return response;
  } };
}

test('a delayed attempt GET cannot erase an acknowledged save or regress the next expected revision', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  const { api, calls } = harness({ beforeResponse: gate.intercept });
  await api.readAttempt('attempt-one');
  gate.hold((path) => path === '/api/v1/attempts/attempt-one');
  const delayed = api.readAttempt('attempt-one'); await gate.entered;
  await api.saveAnswer('attempt-one', 'sc', 'b');
  gate.release();
  const late = await delayed;
  assert.equal(late.attempt.answers[0].revision, 1);
  late.attempt.answers[0].revision = 99; late.attempt.slots.length = 0;
  const next = await api.saveAnswer('attempt-one', 'sc', 'a');
  assert.equal(next.attempt.answers[0].revision, 2);
  assert.deepEqual(calls.filter((call) => call.method === 'PUT').map((call) => call.body.expectedRevision), [0, 1]);
});

test('a delayed active GET cannot reopen a submitted attempt or dispatch another save', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  const { api, calls } = harness({ beforeResponse: gate.intercept });
  await api.readAttempt('attempt-one');
  gate.hold((path) => path === '/api/v1/attempts/attempt-one');
  const delayed = api.readAttempt('attempt-one'); await gate.entered;
  await api.submitAttempt('attempt-one'); gate.release();
  const late = await delayed;
  assert.equal(late.attempt.state, 'SUBMITTED'); assert.deepEqual(late.attempt.slots, []);
  await assert.rejects(api.saveAnswer('attempt-one', 'sc', 'b'), { code: 'ATTEMPT_CLOSED' });
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 0);
});

test('overlapping GETs preserve the newer closure in either response order', async (t) => {
  for (const olderFirst of [true, false]) {
    const first = responseBarrier(), second = responseBarrier();
    t.after(first.release); t.after(second.release);
    let nextGate = first;
    const { api, state } = harness({ beforeResponse: (path, options, response) => nextGate.intercept(path, options, response) });
    await api.readAttempt('attempt-one');
    first.hold((path) => path === '/api/v1/attempts/attempt-one');
    const older = api.readAttempt('attempt-one'); await first.entered;
    state.view = view('SUBMITTED'); nextGate = second;
    second.hold((path) => path === '/api/v1/attempts/attempt-one');
    const newer = api.readAttempt('attempt-one'); await second.entered;
    if (olderFirst) { first.release(); await older; second.release(); }
    else { second.release(); await newer; first.release(); }
    assert.equal((await newer).attempt.state, 'SUBMITTED');
    if (!olderFirst) assert.equal((await older).attempt.state, 'SUBMITTED');
    await assert.rejects(api.saveAnswer('attempt-one', 'sc', 'b'), { code: 'ATTEMPT_CLOSED' });
  }
});

test('a delayed submission acknowledgement cannot replace an observed graded result', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  const { api, state } = harness({ beforeResponse: gate.intercept });
  await api.readAttempt('attempt-one');
  gate.hold((path) => path.endsWith('/submit'));
  const submitted = api.submitAttempt('attempt-one'); await gate.entered;
  state.view = view('GRADED');
  assert.equal((await api.readAttempt('attempt-one')).attempt.state, 'GRADED');
  gate.release();
  const late = (await submitted).attempt;
  assert.equal(late.state, 'GRADED'); assert.equal(late.result.percentage, '0.00');
});

test('a save acknowledgement merges after an intervening read instead of inventing a revision conflict', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  const { api, state } = harness({ beforeResponse: gate.intercept });
  await api.readAttempt('attempt-one');
  gate.hold((path, options) => options?.method === 'PUT');
  const saving = api.saveAnswer('attempt-one', 'sc', 'b'); await gate.entered;
  state.view.serverNow = '2026-10-22T00:00:02.000000Z';
  await api.readAttempt('attempt-one'); gate.release();
  const acknowledged = (await saving).attempt;
  assert.equal(acknowledged.answers[0].revision, 1);
  assert.equal(acknowledged.serverNow, '2026-10-22T00:00:02.000000Z', 'older acknowledgement does not regress a later server observation');
  assert.equal((await api.saveAnswer('attempt-one', 'sc', 'a')).attempt.answers[0].revision, 2);
});

test('overlapping saves to distinct slots retain both acknowledged answers', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  const { api } = harness({ beforeResponse: gate.intercept });
  await api.readAttempt('attempt-one');
  gate.hold((path) => path.endsWith('/answers/sc'));
  const first = api.saveAnswer('attempt-one', 'sc', 'b'); await gate.entered;
  await api.saveAnswer('attempt-one', 'mc', { optionIds: ['a'] }); gate.release();
  const combined = (await first).attempt;
  assert.equal(combined.answeredCount, 2);
  assert.deepEqual(combined.answers.map((item) => [item.slotId, item.revision]).sort(), [['mc', 1], ['sc', 1]]);
});

test('an acknowledged save preserves a newer slot revision and an already observed closure', async (t) => {
  for (const closed of [false, true]) {
    const gate = responseBarrier(); t.after(gate.release);
    const { api, state } = harness({ beforeResponse: gate.intercept });
    await api.readAttempt('attempt-one');
    gate.hold((path, options) => options?.method === 'PUT');
    const saving = api.saveAnswer('attempt-one', 'sc', 'b'); await gate.entered;
    state.view = closed ? view('SUBMITTED') : { ...view(), answers: [{ slotId: 'sc', revision: 2,
      value: { type: 'SINGLE_CHOICE', optionId: 'a' }, savedAt: '2026-10-22T00:00:02.000000Z' }] };
    await api.readAttempt('attempt-one');
    const observed = closed ? saving : assert.rejects(saving, { code: 'REVISION_CONFLICT' });
    gate.release();
    if (closed) assert.equal((await observed).attempt.state, 'SUBMITTED'); else await observed;
  }
});

test('a delayed denied read still rejects after a successful cache update', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  let rejectRead = false;
  const { api } = harness({ beforeResponse: async (path, options, response) => {
    if (rejectRead && path === '/api/v1/attempts/attempt-one') {
      rejectRead = false;
      await gate.intercept(path, options, response);
      // A transport denial must take priority over the newer cache fallback.
      return Response.json({ error: { code: 'CONTENT_WITHDRAWN', details: {} } }, { status: 410 });
    }
  } });
  await api.readAttempt('attempt-one');
  rejectRead = true; gate.hold((path) => path === '/api/v1/attempts/attempt-one');
  const delayed = api.readAttempt('attempt-one');
  const denied = assert.rejects(delayed, { code: 'CONTENT_WITHDRAWN', status: 410 });
  await gate.entered; await api.saveAnswer('attempt-one', 'sc', 'b'); gate.release(); await denied;
});

test('confirmed denial fences older responses even when the session cookie is unchanged', async (t) => {
  for (const denial of ['401', '403', 'session-unauthenticated', 'session-noncandidate']) {
    const gate = responseBarrier(); t.after(gate.release);
    let deny = false;
    const { api, calls } = harness({ beforeResponse: async (path, options, response) => {
      if (deny && path.startsWith('/api/v1/catalog?')) {
        return Response.json({ error: { code: denial === '403' ? 'FORBIDDEN' : 'UNAUTHENTICATED', details: {} } }, { status: Number(denial) });
      }
      if (deny && path === '/local-auth/session') {
        return Response.json(denial === 'session-unauthenticated' ? { authenticated: false }
          : { authenticated: true, principal: { userId: 'author', roles: ['AUTHOR'] } });
      }
      return gate.intercept(path, options, response);
    } });
    await api.readAttempt('attempt-one');
    gate.hold((path) => path === '/api/v1/attempts/attempt-one');
    const stale = api.readAttempt('attempt-one');
    const rejected = assert.rejects(stale, { code: 'UNAUTHENTICATED', status: 401 });
    await gate.entered; deny = true;
    await assert.rejects(denial.startsWith('session-') ? api.openDemoSession() : api.loadCatalog(),
      { code: denial === '403' || denial === 'session-noncandidate' ? 'FORBIDDEN' : 'UNAUTHENTICATED' });
    gate.release(); await rejected;
    await assert.rejects(api.saveAnswer('attempt-one', 'sc', 'b'), { code: 'ATTEMPT_CLOSED' });
    assert.equal(calls.filter((call) => call.method === 'PUT').length, 0);
  }
});

test('an old authentication denial cannot clear a newer identity cache', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  let denyCatalog = false;
  const { api } = harness({ beforeResponse: async (path, options, response) => {
    if (denyCatalog && path.startsWith('/api/v1/catalog?')) {
      denyCatalog = false; await gate.intercept(path, options, response);
      return Response.json({ error: { code: 'UNAUTHENTICATED', details: {} } }, { status: 401 });
    }
  } });
  await api.openDemoSession();
  denyCatalog = true; gate.hold((path) => path.startsWith('/api/v1/catalog?'));
  const old = api.loadCatalog(), rejected = assert.rejects(old, { code: 'UNAUTHENTICATED' });
  await gate.entered; await api.loginCandidate('studentA'); await api.readAttempt('attempt-one');
  gate.release(); await rejected;
  assert.equal((await api.saveAnswer('attempt-one', 'sc', 'b')).attempt.answers[0].revision, 1);
});

test('a held save acknowledgement cannot restore state after confirmed denial', async (t) => {
  const gate = responseBarrier(); t.after(gate.release);
  let denyCatalog = false;
  const { api, calls } = harness({ beforeResponse: async (path, options, response) => {
    if (denyCatalog && path.startsWith('/api/v1/catalog?')) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', details: {} } }, { status: 401 });
    }
    return gate.intercept(path, options, response);
  } });
  await api.readAttempt('attempt-one'); gate.hold((path, options) => options?.method === 'PUT');
  const saving = api.saveAnswer('attempt-one', 'sc', 'b');
  const rejected = assert.rejects(saving, { code: 'UNAUTHENTICATED', status: 401 });
  await gate.entered; denyCatalog = true;
  await assert.rejects(api.loadCatalog(), { code: 'UNAUTHENTICATED' }); gate.release(); await rejected;
  await assert.rejects(api.saveAnswer('attempt-one', 'sc', 'a'), { code: 'ATTEMPT_CLOSED' });
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 1, 'only the pre-denial authenticated PUT was dispatched');
});

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
