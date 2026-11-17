import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPersistentApi } from '../../apps/practice-prototype/public/app/persistent-api.js';

const ATTEMPT_A = '00000000-0000-4000-8000-000000000001';
const ATTEMPT_B = '00000000-0000-4000-8000-000000000002';
const FORM_ID = '00000000-0000-4000-8000-000000000010';
const SLOT_ID = '00000000-0000-4000-8000-000000000020';
const SECTION_ID = 'fixed-math';
const INSTANT = '2026-10-26T10:00:00.000000Z';
const LATER = '2026-10-26T10:10:00.000000Z';
const CONTENT = [{ type: 'text', text: 'Synthetic public fixed-form question.' }];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function fixedView(attemptId, state = 'IN_PROGRESS') {
  const active = state === 'IN_PROGRESS';
  return deepFreeze({
    attemptId,
    state,
    formId: FORM_ID,
    domain: 'MATH',
    formMode: 'PUBLISHED_FIXED',
    reuseMode: 'FIXED_AS_PUBLISHED',
    reusePolicyVersion: 'reuse/1',
    serverNow: INSTANT,
    startBefore: null,
    startedAt: INSTANT,
    deadlineAt: LATER,
    activeSectionId: active ? SECTION_ID : null,
    sections: [{ sectionId: SECTION_ID, section: 'MATH', startsAt: INSTANT, endsAt: LATER, count: 1 }],
    slots: active ? [{ slotId: SLOT_ID, sectionId: SECTION_ID, ordinal: 1, stimulus: null, content: CONTENT,
      interaction: { type: 'SINGLE_CHOICE', options: [{ id: 'a', content: CONTENT }, { id: 'b', content: CONTENT }] } }] : [],
    answers: [],
    closure: {
      attemptId,
      state,
      terminalReason: state === 'GRADED' ? 'EXPLICIT_SUBMIT' : null,
      cancellationReason: null,
      closedAt: state === 'GRADED' ? LATER : null,
      gradingStatus: state === 'GRADED' ? 'SUCCEEDED' : null,
    },
  });
}

function releasedResult(attemptId) {
  return {
    attemptId,
    scoreLabel: 'UNOFFICIAL_PRACTICE',
    correctCount: 0,
    totalCount: 1,
    percentage: '0.00',
    items: [{ slotId: SLOT_ID, question: {
      slotId: SLOT_ID, sectionId: SECTION_ID, ordinal: 1, stimulus: null, content: CONTENT,
      interaction: { type: 'SINGLE_CHOICE', options: [{ id: 'a', content: CONTENT }, { id: 'b', content: CONTENT }] },
    }, earned: 0, response: null, correctAnswer: { type: 'SINGLE_CHOICE', optionId: 'a' }, explanation: CONTENT }],
  };
}

function harness(view) {
  const calls = [];
  const api = createPersistentApi({
    fetchImpl: async (path) => {
      calls.push(path);
      if (path.endsWith('/result')) return Response.json(releasedResult(ATTEMPT_A));
      return Response.json(view);
    },
  });
  return { api, calls };
}

test('fixed read rejects a different retake ID before released-result fetch or cache', async () => {
  const { api, calls } = harness(fixedView(ATTEMPT_B, 'GRADED'));

  await assert.rejects(api.readFixedAttempt(ATTEMPT_A, 'MATH', FORM_ID), (error) => {
    assert.equal(error.code, 'UNEXPECTED_ATTEMPT_MODE');
    assert.equal(error.status, 502);
    return true;
  });
  assert.deepEqual(calls, [`/api/v1/attempts/${ATTEMPT_A}`], 'mismatched view is rejected before result GET');
});

test('fixed read accepts the requested attempt ID and preserves its fixed mode', async () => {
  const { api, calls } = harness(fixedView(ATTEMPT_A));

  const result = await api.readFixedAttempt(ATTEMPT_A, 'MATH', FORM_ID);
  assert.equal(result.attempt.attemptId, ATTEMPT_A);
  assert.equal(result.attempt.formId, FORM_ID);
  assert.equal(result.attempt.formMode, 'PUBLISHED_FIXED');
  assert.equal(result.attempt.reuseMode, 'FIXED_AS_PUBLISHED');
  assert.deepEqual(calls, [`/api/v1/attempts/${ATTEMPT_A}`]);
});

test('fixed read held across external cookie rotation is rejected before caching', async()=>{
 let nonce='session-a',release,entered;
 const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
 const api=createPersistentApi({readCookie:()=>nonce,fetchImpl:async()=>{entered();await gate;return Response.json(fixedView(ATTEMPT_A));}});
 const pending=api.readFixedAttempt(ATTEMPT_A,'MATH',FORM_ID);await ready;nonce='session-b';release();
 await assert.rejects(pending,{code:'UNAUTHENTICATED',status:401});
 await assert.rejects(api.saveAnswer(ATTEMPT_A,SLOT_ID,'b'),{code:'ATTEMPT_CLOSED'});
});

test('a stale response cannot clear a newer SDK identity cache or pending answer', async()=>{
 let release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
 const api=createPersistentApi({readCookie:()=> 'session-b',fetchImpl:async(path,options={})=>{
  if(path==='/local-auth/session')return Response.json({authenticated:true,principal:{userId:ATTEMPT_B,actorKey:'studentB',roles:['CANDIDATE']}});
  if(path===`/api/v1/attempts/${ATTEMPT_A}`){entered();await gate;return Response.json(fixedView(ATTEMPT_A));}
  if(options.method==='PUT'){const body=JSON.parse(options.body);return Response.json({slotId:SLOT_ID,revision:1,value:body.value,savedAt:INSTANT});}
  return Response.json(fixedView(ATTEMPT_B));
 }});
 const old=api.readFixedAttempt(ATTEMPT_A,'MATH',FORM_ID);await ready;
 await api.loginCandidate('studentB');await api.readFixedAttempt(ATTEMPT_B,'MATH',FORM_ID);release();
 await assert.rejects(old,{code:'UNAUTHENTICATED',status:401});
 assert.equal((await api.saveAnswer(ATTEMPT_B,SLOT_ID,'b')).attempt.answeredCount,1);
});
