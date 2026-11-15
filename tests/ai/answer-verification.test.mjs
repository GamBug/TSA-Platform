import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { toInternalParts, validateQuestionSet } from '../../packages/contracts/dist/question-exchange.js';
import { answersAgree, blindItem, buildExport, classify, compareSolutions, itemId, SOLUTIONS_FORMAT } from '../../tools/answer-verification/verification-core.mjs';

const EXAMPLES = new URL('../../docs/question-bank/examples/valid/', import.meta.url);
const UUID = '22222222-2222-4222-8222-222222222222';

/** Internal versions of every valid example, with their real answer keys. */
async function exampleVersions() {
  const versions = [];
  for (const name of (await readdir(EXAMPLES)).filter((file) => file.endsWith('.json') && file !== 'image-needed.json' && file !== 'reading-passage.json').sort()) {
    const document = JSON.parse(await readFile(new URL(name, EXAMPLES), 'utf8'));
    for (const question of validateQuestionSet(document, { assets: ['IMG-GEO-000123', 'IMG-GEO-000124'] }).value.questions) {
      const parts = toInternalParts(question, () => UUID);
      versions.push({ id: `00000000-0000-4000-8000-${String(versions.length + 1).padStart(12, '0')}`, interaction: parts.interaction, content: parts.content, answer_key: parts.answerKey, explanation: parts.explanation });
    }
  }
  return versions;
}

test('a blind export never carries answer keys, explanations, version ids or source information', async () => {
  const versions = await exampleVersions();
  assert.deepEqual([...new Set(versions.map((version) => version.interaction.type))].sort(),
    ['CLOZE', 'MATCHING', 'MULTIPLE_CHOICE', 'NUMERIC_RESPONSE', 'SINGLE_CHOICE', 'TRUE_FALSE_GROUP']);
  const built = buildExport(versions, { salt: 'salt-1', label: 'test' });
  const blind = JSON.stringify(built.blind);
  for (const version of versions) assert.ok(!blind.includes(version.id), 'no version id in the blind file');
  for (const forbidden of ['answerKey', 'answer_key', 'acceptedValues', 'explanation', 'optionIds', 'evidence', 'provenance']) assert.ok(!blind.includes(forbidden), forbidden);
  assert.ok(!blind.includes('Các số nguyên tố trong'), 'the worked solution text is not exported');
  assert.equal(built.blind.count, versions.length);
  assert.match(built.blind.items[0].itemId, /^Q-[0-9a-f]{10}$/u);
  assert.notEqual(itemId('a', 'salt-1'), itemId('a', 'salt-2'), 'ids are salted per export');
  // The private file keeps the join, and its hash binds it to the blind file.
  assert.equal(built.private.exportHash, built.blind.exportHash);
  assert.deepEqual(built.private.join.map((entry) => entry.versionId), versions.map((version) => version.id));
  // A solver still sees what it needs: choices, labels, targets, statements and the images' alt text.
  const single = built.blind.items.find((item) => item.type === 'SINGLE_CHOICE');
  assert.ok(single.options.length >= 2 && single.prompt.length > 10);
  assert.ok(built.blind.items.some((item) => item.prompt.includes('[Hình:')));
});

const KEYS = {
  SINGLE_CHOICE: { key: { type: 'SINGLE_CHOICE', optionId: 'C' }, right: { optionId: 'C' }, wrong: { optionId: 'A' } },
  MULTIPLE_CHOICE: { key: { type: 'MULTIPLE_CHOICE', optionIds: ['B', 'C'] }, right: { optionIds: ['C', 'B'] }, wrong: { optionIds: ['B'] } },
  TRUE_FALSE_GROUP: { key: { type: 'TRUE_FALSE_GROUP', values: { a: true, b: false } }, right: { values: { b: false, a: true } }, wrong: { values: { a: true, b: true } } },
  NUMERIC_RESPONSE: { key: { type: 'NUMERIC_RESPONSE', value: '0.46' }, right: { value: '0,460' }, wrong: { value: '0.45' } },
  CLOZE: { key: { type: 'CLOZE', acceptedValues: { u5: ['14'], s5: ['40', 'bốn mươi'] } }, right: { values: { u5: ' 14 ', s5: 'bốn mươi' } }, wrong: { values: { u5: '14', s5: '41' } } },
  MATCHING: { key: { type: 'MATCHING', answers: { r1: 't1', r2: 't2' } }, right: { answers: { r2: 't2', r1: 't1' } }, wrong: { answers: { r1: 't2', r2: 't1' } } },
};

test('classification promotes only a confident agreement to VERIFIED and only a confident disagreement to DISPUTED', () => {
  for (const [type, { key, right, wrong }] of Object.entries(KEYS)) {
    const join = { type, key };
    const verdict = (answer, confidence, extra = {}) => classify(join, { answer, confidence, ...extra }).verdict;
    assert.equal(verdict(right, 'HIGH'), 'VERIFIED', `${type} confident agreement`);
    assert.equal(verdict(right, 'MEDIUM'), 'NEEDS_HUMAN_REVIEW', `${type} unconfident agreement is not verified`);
    assert.equal(verdict(right, 'LOW'), 'NEEDS_HUMAN_REVIEW');
    assert.equal(verdict(right, 'HIGH', { ambiguous: true }), 'NEEDS_HUMAN_REVIEW', `${type} an ambiguous question is never verified`);
    assert.equal(verdict(wrong, 'HIGH'), 'DISPUTED', `${type} confident disagreement`);
    assert.equal(verdict(wrong, 'MEDIUM'), 'NEEDS_HUMAN_REVIEW', `${type} unconfident disagreement is not disputed`);
    assert.equal(verdict(wrong, 'HIGH', { ambiguous: true }), 'NEEDS_HUMAN_REVIEW');
    assert.equal(verdict({ nonsense: true }, 'HIGH'), 'NEEDS_HUMAN_REVIEW', `${type} malformed answers need a human`);
    assert.equal(verdict(right, 'CERTAIN'), 'NEEDS_HUMAN_REVIEW');
    assert.equal(classify(join, undefined).reason, 'NO_SOLUTION');
  }
});

test('answers are compared by value, not by spelling', () => {
  assert.equal(answersAgree('NUMERIC_RESPONSE', { value: '3' }, { value: '3.0' }), true);
  assert.equal(answersAgree('NUMERIC_RESPONSE', { value: '-0.5' }, { value: '-0,50' }), true);
  assert.equal(answersAgree('NUMERIC_RESPONSE', { value: '3' }, { value: 'three' }), null);
  assert.equal(answersAgree('CLOZE', { acceptedValues: { a: ['é'] } }, { values: { a: 'é' } }), true, 'NFC normalisation');
  assert.equal(answersAgree('CLOZE', { acceptedValues: { a: ['Abc'] } }, { values: { a: 'abc' } }), false, 'case matters');
  assert.equal(answersAgree('SINGLE_CHOICE', { optionId: 'A' }, undefined), null);
  assert.equal(answersAgree('ESSAY', {}, {}), null);
  assert.equal(answersAgree('MULTIPLE_CHOICE', { optionIds: ['A', 'B'] }, { optionIds: ['A', 'B', 'C'] }), false);
});

test('a comparison refuses solutions that were not written against this export', async () => {
  const built = buildExport(await exampleVersions(), { salt: 's', label: 'test' });
  const first = built.private.join[0];
  const solved = (overrides = {}) => ({ format: SOLUTIONS_FORMAT, exportHash: built.private.exportHash, solver: 'unit test', solutions: [], ...overrides });
  assert.throws(() => compareSolutions(built.private, solved({ exportHash: 'sha256:other' })), /not written against this export/);
  assert.throws(() => compareSolutions(built.private, solved({ format: 'x' })), /solutions.format/);
  assert.throws(() => compareSolutions(built.private, solved({ solver: ' ' })), /solver/);
  assert.throws(() => compareSolutions(built.private, solved({ solutions: [{ itemId: first.itemId }, { itemId: first.itemId }] })), /repeat items/);
  const empty = compareSolutions(built.private, solved());
  assert.deepEqual(empty.counts, { VERIFIED: 0, DISPUTED: 0, NEEDS_HUMAN_REVIEW: built.private.join.length }, 'an unanswered item is never verified');
  const answered = compareSolutions(built.private, solved({ solutions: [{ itemId: 'Q-0000000000', answer: {}, confidence: 'HIGH' }] }));
  assert.deepEqual(answered.unknownItems, ['Q-0000000000']);
  assert.equal(blindItem({ id: first.versionId, interaction: first.interaction, content: [] }, 's').itemId, first.itemId);
});

test('a stored key of an unexpected shape sends the item to a human instead of aborting the comparison', async () => {
  for (const type of ['TRUE_FALSE_GROUP', 'CLOZE', 'MATCHING', 'MULTIPLE_CHOICE']) {
    const result = classify({ type, key: { type: 'LEGACY' } }, { answer: { optionIds: ['A'], values: {}, answers: {} }, confidence: 'HIGH' });
    assert.equal(result.verdict, 'NEEDS_HUMAN_REVIEW', type);
  }
  const built = buildExport(await exampleVersions(), { salt: 's', label: 'test' });
  assert.throws(() => compareSolutions(built.private, { format: SOLUTIONS_FORMAT, exportHash: built.private.exportHash, solver: 'x', solutions: [null] }), /itemId/);
});
