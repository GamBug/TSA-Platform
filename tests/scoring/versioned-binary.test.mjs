import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreAttempt } from '../../src/modules/scoring/binary.mjs';
import { scoreVersionedAttempt } from '../../src/modules/scoring/versioned-binary.mjs';

function numeric(key, response) {
  return { policyVersion: 'practice-binary-v2', slots: [{ slotId: 'numeric', sectionId: 'math', section: 'MATH', ordinal: 0,
    interaction: { type: 'NUMERIC_RESPONSE', label: 'Nhập đáp án', format: 'DECIMAL' },
    answerKey: { type: 'NUMERIC_RESPONSE', value: key },
    response: response === null ? null : { type: 'NUMERIC_RESPONSE', value: response } }] };
}

test('versioned grading compares exact decimal values without losing precision or rewriting the response', () => {
  for (const [key, response, earned] of [
    ['1.5', '  +01,500  ', 1], ['0', '-000.000', 1], ['-0.25', '-00,2500', 1],
    ['9007199254740993', '9007199254740992', 0], ['0.00000000000000000001', '0.00000000000000000002', 0],
    ['9999999999999999999999999999999999999999', '9999999999999999999999999999999999999999', 1],
    ['1', null, 0],
  ]) {
    const input = numeric(key, response), before = structuredClone(input), result = scoreVersionedAttempt(input);
    assert.equal(result.correctCount, earned); assert.equal(result.percentage, earned ? '100.00' : '0.00');
    assert.deepEqual(input, before);
    assert.throws(() => scoreAttempt(input), /Invalid grading input/, 'v1 scorer remains closed');
  }
  const cleared = numeric('1', null); cleared.slots[0].response = { type: 'NUMERIC_RESPONSE', value: null };
  assert.equal(scoreVersionedAttempt(cleared).correctCount, 0);
});

test('malformed persisted numbers and noncanonical keys fail before any grade is returned', () => {
  for (const value of ['1/2', '1e3', 'NaN', 'Infinity', '1,000,000', '2 cm', '1+1', '']) {
    assert.throws(() => scoreVersionedAttempt(numeric('1', value)), TypeError);
  }
  for (const key of ['+1', '1.0', '1,5', '-0']) assert.throws(() => scoreVersionedAttempt(numeric(key, '1')), TypeError);
});

test('v2 legacy interactions reuse binary scoring and preserve the v1 dispatch result', () => {
  const input = { policyVersion: 'practice-binary-v1', slots: [{ slotId: 'legacy', sectionId: 'math', section: 'MATH', ordinal: 0,
    interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b'].map(id => ({ id, content: [{ type: 'text', text: id }] })) },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' }, response: { type: 'SINGLE_CHOICE', optionId: 'b' } }] };
  assert.deepEqual(scoreVersionedAttempt(input), scoreAttempt(input));
  assert.deepEqual(scoreVersionedAttempt({ ...input, policyVersion: 'practice-binary-v2' }), scoreAttempt(input));
});
