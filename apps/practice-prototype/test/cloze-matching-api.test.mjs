import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistentApi } from '../public/app/persistent-api.js';

const blocks = [{ type: 'text', text: 'Synthetic q3 interaction fixture.' }];

function makeView(state = 'IN_PROGRESS', answers = []) {
  const slots = [
    { slotId: 'cloze-slot', sectionId: 'math', ordinal: 1, stimulus: null, content: blocks,
      interaction: { type: 'CLOZE', fields: [{ id: 'constructor', label: 'Answer' }, { id: 'ratio', label: 'Ratio' }],
        maxLength: 40, normalization: { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' } } },
    { slotId: 'matching-slot', sectionId: 'math', ordinal: 2, stimulus: null, content: blocks,
      interaction: { type: 'MATCHING', rows: [{ id: 'row-a', label: 'Row A' }, { id: 'row-b', label: 'Row B' }],
        targets: [{ id: 'target-one', label: 'First', maxUses: 1 }, { id: 'target-two', label: 'Second', maxUses: 1 }] } },
    { slotId: 'numeric-slot', sectionId: 'math', ordinal: 3, stimulus: null, content: blocks,
      interaction: { type: 'NUMERIC_RESPONSE', label: 'Number', format: 'DECIMAL' } },
    { slotId: 'single-slot', sectionId: 'math', ordinal: 4, stimulus: null, content: blocks,
      interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b'].map((id) => ({ id, content: blocks })) } },
    { slotId: 'multiple-slot', sectionId: 'math', ordinal: 5, stimulus: null, content: blocks,
      interaction: { type: 'MULTIPLE_CHOICE', options: ['a', 'b', 'c'].map((id) => ({ id, content: blocks })), minSelections: 1, maxSelections: 2 } },
    { slotId: 'true-false-slot', sectionId: 'math', ordinal: 6, stimulus: null, content: blocks,
      interaction: { type: 'TRUE_FALSE_GROUP', statements: [{ id: 'statement-a', content: blocks }, { id: 'statement-b', content: blocks }] } },
  ];
  return { attemptId: 'attempt-one', formId: 'form-one', domain: 'MATH', state,
    formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'NEW_ONLY', startBefore: null,
    serverNow: '2026-11-10T00:00:00.000000Z', startedAt: '2026-11-10T00:00:00.000000Z',
    deadlineAt: '2026-11-10T00:10:00.000000Z', sections: [{ sectionId: 'math', count: slots.length }], slots, answers,
    closure: { state, terminalReason: state === 'GRADED' ? 'EXPLICIT_SUBMIT' : null,
      closedAt: state === 'GRADED' ? '2026-11-10T00:01:00.000000Z' : null,
      gradingStatus: state === 'GRADED' ? 'SUCCEEDED' : null } };
}

function harness({ initialView = makeView(), loseNextAck = false } = {}) {
  const calls = [];
  const state = { view: structuredClone(initialView), loseNextAck, savedByKey: new Map() };
  const respond = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const review = () => ({ attemptId: state.view.attemptId, scoreLabel: 'UNOFFICIAL_PRACTICE',
    correctCount: 0, totalCount: state.view.slots.length, percentage: '0.00',
    items: state.view.slots.map((question) => {
      const saved = state.view.answers.find((answer) => answer.slotId === question.slotId)?.value ?? null;
      const correctAnswer = question.interaction.type === 'CLOZE'
        ? { type: 'CLOZE', acceptedValues: { constructor: ['Exact'], ratio: ['3:2'] } }
        : question.interaction.type === 'MATCHING'
          ? { type: 'MATCHING', answers: { 'row-a': 'target-one', 'row-b': 'target-two' } }
          : question.interaction.type === 'NUMERIC_RESPONSE' ? { type: 'NUMERIC_RESPONSE', value: '1.5' }
            : question.interaction.type === 'SINGLE_CHOICE' ? { type: 'SINGLE_CHOICE', optionId: 'b' }
              : question.interaction.type === 'MULTIPLE_CHOICE' ? { type: 'MULTIPLE_CHOICE', optionIds: ['b'] }
                : { type: 'TRUE_FALSE_GROUP', values: { 'statement-a': true, 'statement-b': false } };
      return { slotId: question.slotId, question, earned: 0, response: saved, correctAnswer, explanation: blocks };
    }) });
  const fetchImpl = async (path, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method ?? 'GET', body, headers: options.headers });
    if (path === '/local-auth/session') return respond({ authenticated: true, principal: { userId: 'student-a', roles: ['CANDIDATE'] } });
    if (path.startsWith('/api/v4/attempts?')) return respond({ items: [{ attemptId: state.view.attemptId, state: state.view.state }], nextCursor: null });
    if (path.endsWith('/result')) return respond(review());
    if (path.includes('/answers/')) {
      const key = options.headers.get('idempotency-key');
      let ack = state.savedByKey.get(key);
      if (!ack) {
        const slotId = decodeURIComponent(path.split('/').at(-1));
        ack = { slotId, value: body.value, revision: body.expectedRevision + 1, savedAt: '2026-11-10T00:00:01.000000Z' };
        state.savedByKey.set(key, ack);
        const index = state.view.answers.findIndex((item) => item.slotId === slotId);
        const item = { slotId, value: body.value, revision: ack.revision, savedAt: ack.savedAt };
        if (index < 0) state.view.answers.push(item); else state.view.answers[index] = item;
      }
      if (state.loseNextAck) { state.loseNextAck = false; throw new Error('Synthetic committed save lost its acknowledgement'); }
      return respond(ack);
    }
    if (path === '/api/v4/attempts/attempt-one') return respond(state.view);
    if (/^\/api\/v[12]\/attempts\/attempt-one$/u.test(path)) return respond(state.view);
    throw new Error(`Unexpected request: ${path}`);
  };
  return { api: createPersistentApi({ fetchImpl, readCookie: () => 'csrf-fixture', apiVersion: 'v4' }), calls, state, fetchImpl };
}

test('v4 preserves exact cloze text through committed lost-ack retry, reload, and typed clear', async () => {
  const h = harness();
  const { api, calls, state } = h;
  const opened = await api.openDemoSession();
  assert.equal(opened.attempt.answeredCount, 0);
  assert.equal(JSON.stringify(opened).includes('acceptedValues'), false, 'unreleased keys stay out of the student view');

  const raw = Object.fromEntries([['constructor', '  e\u0301😀  ']]);
  state.loseNextAck = true;
  await assert.rejects(api.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: raw }), { code: 'TEMPORARILY_UNAVAILABLE' });
  const saved = await api.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: raw });
  const writes = calls.filter((call) => call.path.endsWith('/answers/cloze-slot'));
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].body, writes[1].body);
  assert.equal(writes[0].headers.get('idempotency-key'), writes[1].headers.get('idempotency-key'));
  assert.equal(writes[0].body.value.values.constructor, raw.constructor);
  assert.equal(saved.attempt.answers.find((answer) => answer.slotId === 'cloze-slot').values.constructor, raw.constructor);
  assert.equal(saved.attempt.answeredCount, 0, 'a partial cloze map remains incomplete');

  const completedValues = Object.fromEntries([['constructor', raw.constructor], ['ratio', '3:2']]);
  const completed = await api.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: completedValues });
  assert.equal(completed.attempt.answeredCount, 1);
  assert.equal(completed.attempt.answers.find((answer) => answer.slotId === 'cloze-slot').values.constructor, raw.constructor,
    'saved text remains decomposed and untrimmed until grading');

  const reloaded = createPersistentApi({ fetchImpl: h.fetchImpl, readCookie: () => 'csrf-fixture', apiVersion: 'v4' });
  const resumed = await reloaded.openDemoSession();
  assert.equal(resumed.attempt.answers.find((answer) => answer.slotId === 'cloze-slot').values.constructor, raw.constructor);
  const cleared = await reloaded.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: {
    constructor: null, ratio: null,
  } });
  assert.equal(cleared.attempt.answeredCount, 0);
  assert.deepEqual(calls.filter((call) => call.path.endsWith('/answers/cloze-slot')).at(-1).body.value,
    { type: 'CLOZE', values: { constructor: null, ratio: null } }, 'clear is a typed empty map');
  const review = await reloaded.readReview('attempt-one');
  assert.deepEqual(review.review.slots.find((item) => item.type === 'CLOZE').clozeAcceptedValues,
    { constructor: ['Exact'], ratio: ['3:2'] });
  assert.deepEqual(review.review.slots.find((item) => item.type === 'MATCHING').correctMatchingAnswers,
    { 'row-a': 'target-one', 'row-b': 'target-two' });
});

test('v4 accepts partial matching, completes within reuse limits, and saves typed null maps to clear', async () => {
  const { api, calls } = harness();
  await api.openDemoSession();
  const partial = await api.saveAnswer('attempt-one', 'matching-slot', { type: 'MATCHING', assignments: { 'row-a': 'target-one', 'row-b': null } });
  assert.equal(partial.attempt.answeredCount, 0);
  const complete = await api.saveAnswer('attempt-one', 'matching-slot', { type: 'MATCHING', assignments: {
    'row-a': 'target-one', 'row-b': 'target-two' } });
  assert.equal(complete.attempt.answeredCount, 1);
  await assert.rejects(api.saveAnswer('attempt-one', 'matching-slot', { type: 'MATCHING', assignments: {
    'row-a': 'target-one', 'row-b': 'target-one' } }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.saveAnswer('attempt-one', 'matching-slot', { type: 'MATCHING', assignments: { unknown: null } }), { code: 'VALIDATION_ERROR' });

  const cleared = await api.saveAnswer('attempt-one', 'matching-slot', { type: 'MATCHING', assignments: { 'row-a': null, 'row-b': null } });
  assert.equal(cleared.attempt.answeredCount, 0);
  assert.deepEqual(calls.filter((call) => call.path.endsWith('/answers/matching-slot')).at(-1).body.value,
    { type: 'MATCHING', assignments: { 'row-a': null, 'row-b': null } });
});

test('v4 validates cloze IDs and Unicode scalar lengths while accepting supplementary characters', async () => {
  const { api } = harness();
  await api.openDemoSession();
  await assert.rejects(api.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: { unknown: 'x' } }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: { ratio: 'x'.repeat(41) } }), { code: 'VALIDATION_ERROR' });
  const emojis = '😀'.repeat(40);
  const accepted = await api.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: { constructor: emojis } });
  assert.equal(accepted.attempt.answers.find((answer) => answer.slotId === 'cloze-slot').values.constructor, emojis);
  await assert.rejects(api.saveAnswer('attempt-one', 'cloze-slot', { type: 'CLOZE', values: { constructor: `${emojis}😀` } }), { code: 'VALIDATION_ERROR' });
});

test('v4 continues to support numeric, single, multiple, and true/false q3 interactions', async () => {
  const { api } = harness();
  await api.openDemoSession();
  await api.saveAnswer('attempt-one', 'numeric-slot', { type: 'NUMERIC_RESPONSE', value: ' 1.5 ' });
  await api.saveAnswer('attempt-one', 'single-slot', { optionId: 'b' });
  await api.saveAnswer('attempt-one', 'multiple-slot', { type: 'MULTIPLE_CHOICE', optionIds: ['b'] });
  const partial = await api.saveAnswer('attempt-one', 'true-false-slot', { type: 'TRUE_FALSE_GROUP', statementValues: [
    { statementId: 'statement-a', value: true },
  ] });
  assert.equal(partial.attempt.answeredCount, 3, 'single, numeric, and multiple are complete while the partial group is not');
  assert.deepEqual(partial.attempt.answers.find((answer) => answer.slotId === 'true-false-slot').statementValues,
    [{ statementId: 'statement-a', value: true }]);
});

test('older protocols reject q3 cloze/matching attempts and inherited properties do not count complete', async () => {
  const initial = makeView();
  const inherited = Object.create({ constructor: 'hidden inherited value' });
  initial.answers = [{ slotId: 'cloze-slot', revision: 1, value: { type: 'CLOZE', values: inherited }, savedAt: '2026-11-10T00:00:01.000000Z' }];
  const h = harness({ initialView: initial });
  const opened = await h.api.openDemoSession();
  assert.equal(opened.attempt.answeredCount, 0);
  for (const apiVersion of ['v1', 'v2']) {
    const older = createPersistentApi({ fetchImpl: h.fetchImpl, readCookie: () => 'csrf-fixture', apiVersion });
    await assert.rejects(older.readAttempt('attempt-one'), { code: 'TEMPORARILY_UNAVAILABLE' });
  }
  assert.ok(h.calls.some((call) => call.path.startsWith('/api/v4/')));
});
