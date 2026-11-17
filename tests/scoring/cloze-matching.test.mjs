import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clozeMatchingEarned } from '../../packages/contracts/dist/cloze-matching.js';
import { scoreVersionedAttempt } from '../../src/modules/scoring/versioned-binary.mjs';

const cloze = {
  type: 'CLOZE',
  fields: [{ id: 'city', label: 'City' }, { id: 'ratio', label: 'Ratio' }],
  maxLength: 40,
  normalization: { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' },
};
const clozeKey = { type: 'CLOZE', acceptedValues: { city: ['Hà Nội'], ratio: ['3:2', '1.5'] } };
const matching = {
  type: 'MATCHING',
  rows: [{ id: 'row-a', label: 'A' }, { id: 'row-b', label: 'B' }, { id: 'row-c', label: 'C' }],
  targets: [{ id: 'red', label: 'Red', maxUses: 1 }, { id: 'blue', label: 'Blue', maxUses: 2 }],
};
const matchingKey = { type: 'MATCHING', answers: { 'row-a': 'red', 'row-b': 'blue', 'row-c': 'blue' } };

test('cloze uses the pinned normalization and awards one point only when every field is correct', () => {
  assert.equal(clozeMatchingEarned(cloze, clozeKey, {
    type: 'CLOZE', values: { city: '  Ha\u0300 Nội  ', ratio: '  1.5  ' },
  }), 1);
  assert.equal(clozeMatchingEarned(cloze, clozeKey, { type: 'CLOZE', values: { city: 'Hà Nội' } }), 0);
  assert.equal(clozeMatchingEarned(cloze, clozeKey, { type: 'CLOZE', values: { city: 'Hà Nội', ratio: '3:3' } }), 0);
  assert.equal(clozeMatchingEarned(cloze, clozeKey, { type: 'CLOZE', values: { city: null, ratio: '3:2' } }), 0);
  assert.equal(clozeMatchingEarned(cloze, clozeKey, null), 0);
  assert.throws(() => clozeMatchingEarned(cloze, clozeKey, { type: 'CLOZE', values: { city: 'Hà Nội', unknown: '3:2' } }), TypeError);
});

test('matching validates target reuse limits and scores a complete exact mapping as one point', () => {
  assert.equal(clozeMatchingEarned(matching, matchingKey, {
    type: 'MATCHING', assignments: { 'row-a': 'red', 'row-b': 'blue', 'row-c': 'blue' },
  }), 1);
  assert.equal(clozeMatchingEarned(matching, matchingKey, {
    type: 'MATCHING', assignments: { 'row-a': 'red', 'row-b': 'blue' },
  }), 0);
  assert.throws(() => clozeMatchingEarned(matching, matchingKey, {
    type: 'MATCHING', assignments: { 'row-a': 'red', 'row-b': 'red', 'row-c': 'blue' },
  }), TypeError);
  assert.throws(() => clozeMatchingEarned(matching, matchingKey, {
    type: 'MATCHING', assignments: { 'row-a': 'red', 'row-b': 'blue', 'unknown': 'blue' },
  }), TypeError);
});

test('practice-binary-v3 dispatches cloze, matching, numeric, and legacy interactions in one tally', () => {
  const choice = { type: 'SINGLE_CHOICE', options: ['a', 'b'].map((id) => ({ id, content: [{ type: 'text', text: id }] })) };
  const input = {
    policyVersion: 'practice-binary-v3',
    slots: [
      { slotId: 'cloze', sectionId: 'math', section: 'MATH', ordinal: 0, interaction: cloze, answerKey: clozeKey,
        response: { type: 'CLOZE', values: { city: 'Hà Nội', ratio: '3:2' } } },
      { slotId: 'matching', sectionId: 'math', section: 'MATH', ordinal: 1, interaction: matching, answerKey: matchingKey,
        response: { type: 'MATCHING', assignments: { 'row-a': 'red', 'row-b': 'blue', 'row-c': 'blue' } } },
      { slotId: 'numeric', sectionId: 'math', section: 'MATH', ordinal: 2,
        interaction: { type: 'NUMERIC_RESPONSE', label: 'Decimal', format: 'DECIMAL' },
        answerKey: { type: 'NUMERIC_RESPONSE', value: '1.5' }, response: { type: 'NUMERIC_RESPONSE', value: ' +01,500 ' } },
      { slotId: 'choice', sectionId: 'math', section: 'MATH', ordinal: 3, interaction: choice,
        answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' }, response: { type: 'SINGLE_CHOICE', optionId: 'b' } },
    ],
  };
  const before = structuredClone(input);
  const result = scoreVersionedAttempt(input);
  assert.equal(result.correctCount, 4);
  assert.equal(result.totalCount, 4);
  assert.deepEqual(result.items.map((item) => item.earned), [1, 1, 1, 1]);
  assert.deepEqual(input, before, 'grading preserves the raw saved response strings');
  assert.throws(() => scoreVersionedAttempt({ ...input, policyVersion: 'practice-binary-v1' }), TypeError);
});
