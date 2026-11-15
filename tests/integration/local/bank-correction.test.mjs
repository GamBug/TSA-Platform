import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyCorrections } from '../../../scripts/bank-correct.mjs';
import { buildRevisionDraft, parseCorrectionSpec, specDigest } from '../../../src/local/bank-correction.mjs';
import { buildPublishedBank, choice, silent, text } from './published-bank-fixture.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';

const snapshot = async (dataDirectory, ids) => {
  const database = await startPersistentPostgres(dataDirectory);
  try {
    return (await database.ownerPool.query(`SELECT v.id, v.version_no AS "versionNo", v.parent_version_id AS parent, w.state::text AS state,
        COALESCE(q.eligible_version_id = v.id, false) AS eligible, tsa.bank_question_selection_allowed(v.id) AS selectable, s.answer_key AS key, v.question_id AS "questionId"
      FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id JOIN tsa.questions q ON q.id=v.question_id
      JOIN tsa_private.question_secrets s ON s.question_version_id=v.id
      WHERE v.question_id IN (SELECT question_id FROM tsa.question_versions WHERE id = ANY($1)) ORDER BY v.question_id, v.version_no`, [ids])).rows;
  } finally { await database.stop(); }
};

test('specification parsing rejects malformed, repeated and unsupported corrections', () => {
  const base = { reason: 'Independent verification of flagged items.', items: [{ versionId: '11111111-1111-4111-8111-111111111111',
    action: 'WITHHOLD', classification: 'INVALID_PROBLEM', note: 'No option matches the stem.' }] };
  assert.equal(parseCorrectionSpec(base).items.length, 1);
  assert.throws(() => parseCorrectionSpec({ ...base, items: [] }), /at least one/);
  assert.throws(() => parseCorrectionSpec({ ...base, reason: 'short' }), /reason/);
  assert.throws(() => parseCorrectionSpec({ ...base, items: [base.items[0], base.items[0]] }), /repeats/);
  assert.throws(() => parseCorrectionSpec({ ...base, items: [{ ...base.items[0], action: 'DELETE' }] }), /REVISE or WITHHOLD/);
  assert.throws(() => parseCorrectionSpec({ ...base, items: [{ ...base.items[0], changes: {} }] }), /no changes/);
  assert.throws(() => parseCorrectionSpec({ ...base, items: [{ ...base.items[0], action: 'REVISE', changes: { origin: 'MANUAL' } }] }), /may only set/);
  assert.equal(specDigest(parseCorrectionSpec(base)), specDigest(parseCorrectionSpec(structuredClone(base))));
});

test('a revision keeps the stored fields, replaces only the requested ones and refuses unsafe targets', () => {
  const target = { version: { stimulus_version_id: null, state: 'APPROVED', version_no: 1, latest_version_no: 1, schema_version: 'question/1',
      language: 'vi-VN', section: 'MATH', taxonomy_version_id: 'tx', domain_id: 'MATH', skill_ids: ['SK'], subskill_ids: [], cognitive_level: null,
      difficulty: { target: 'EASY' }, content: text('Stem'), interaction: { type: 'SINGLE_CHOICE', options: [] },
      answer_key: { type: 'SINGLE_CHOICE', optionId: 'a' }, explanation: text('Why') },
    provenance: [{ sourceVersionId: 's1', span: null, decisionId: 'd1' }],
    nodes: [{ id: 'n1', code: 'MATH' }, { id: 'n2', code: 'SK' }] };
  const item = { classification: 'INCORRECT_ANSWER_KEY', note: 'The key was wrong.', changes: { answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' } } };
  const draft = buildRevisionDraft(target, item);
  assert.deepEqual(draft.answerKey, item.changes.answerKey);
  assert.deepEqual(draft.content, target.version.content);
  assert.deepEqual([draft.domainId, draft.skillIds, draft.evidenceRefs], ['n1', ['n2'], ['d1']]);
  assert.match(draft.provenance[0].transformation, /INCORRECT_ANSWER_KEY.*The key was wrong/);
  assert.throws(() => buildRevisionDraft({ ...target, version: { ...target.version, state: 'QUARANTINED' } }, item), /quarantined/);
  assert.throws(() => buildRevisionDraft({ ...target, version: { ...target.version, version_no: 1, latest_version_no: 2 } }, item), /latest version/);
  assert.throws(() => buildRevisionDraft({ ...target, version: { ...target.version, stimulus_version_id: 'p' } }, item), /shared passage/);
  assert.throws(() => buildRevisionDraft({ ...target, provenance: [{ sourceVersionId: 's1', span: null, decisionId: null }] }, item), /rights decision/);
});

test('a published question is corrected through a new approved version and a defective one is withheld', { timeout: 240_000 }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-correction-'));
  await chmod(root, 0o700);
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDirectory = path.join(root, 'bank');
  const [wrongKey, unusable, untouched] = await buildPublishedBank(dataDirectory, [
    choice('Stem with a wrong key', 'a'), choice('Stem whose options never match', 'c'), choice('A sound stem', 'b')]);
  const before = await snapshot(dataDirectory, [wrongKey, unusable, untouched]);
  assert.ok(before.every((row) => row.eligible && row.selectable), 'the fixture publishes every question');

  const spec = { reason: 'Independent verification of the flagged fixture items.', items: [
    { versionId: wrongKey, action: 'REVISE', classification: 'INCORRECT_ANSWER_KEY', note: 'Option b is the only correct option.',
      changes: { answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' }, explanation: text('Corrected private explanation.') } },
    { versionId: unusable, action: 'WITHHOLD', classification: 'INVALID_PROBLEM', note: 'No option matches the stem; intent cannot be rebuilt.' }] };

  const dry = await applyCorrections({ dataDirectory, spec, log: silent });
  assert.equal(dry.applied, 0);
  assert.deepEqual(await snapshot(dataDirectory, [wrongKey, unusable, untouched]), before, 'a dry run changes nothing');
  await assert.rejects(applyCorrections({ dataDirectory, spec, confirm: 'CORRECT 3', log: silent }), /Confirmation does not match/);

  const applied = await applyCorrections({ dataDirectory, spec, confirm: 'CORRECT 2', log: silent });
  assert.equal(applied.applied, 2);
  assert.equal(applied.revisions.length, 1);
  const after = await snapshot(dataDirectory, [wrongKey, unusable, untouched]);
  const rows = new Map(after.map((row) => [row.id, row]));
  const revised = rows.get(applied.revisions[0].to);
  assert.equal(revised.versionNo, 2);
  assert.equal(revised.parent, wrongKey);
  assert.deepEqual([revised.state, revised.eligible, revised.selectable], ['APPROVED', true, true]);
  assert.deepEqual(revised.key, { type: 'SINGLE_CHOICE', optionId: 'b' });
  const original = rows.get(wrongKey);
  assert.deepEqual([original.state, original.eligible, original.selectable, original.key.optionId], ['APPROVED', false, false, 'a'],
    'the original version stays as immutable history but is no longer eligible');
  const withheld = rows.get(unusable);
  assert.deepEqual([withheld.state, withheld.eligible, withheld.selectable], ['QUARANTINED', false, false]);
  assert.deepEqual(rows.get(untouched), before.find((row) => row.id === untouched), 'unrelated questions are untouched');

  // Re-running the same specification after success must not create a second corrected version.
  await assert.rejects(applyCorrections({ dataDirectory, spec, confirm: 'CORRECT 2', log: silent }), /cannot proceed|state QUARANTINED|latest version/);
  assert.equal((await snapshot(dataDirectory, [wrongKey])).length, 2);
});
