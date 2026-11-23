import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { changeQuestion, questionChangePhrase } from '../../../scripts/question-change.mjs';
import { runInbox, setupPracticePool } from '../../../scripts/questions-inbox.mjs';
import { importQuestions } from '../../../scripts/questions-import.mjs';
import { fileHash, writeSourceVersion } from '../../../scripts/register-corpus-source.mjs';
import { registerTaxonomy } from '../../../scripts/register-taxonomy.mjs';
import { importConfirmation } from '../../../src/local/exchange-import.mjs';
import { OWNER_RIGHTS } from '../../../src/local/owner-publication.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';

const env = { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' };
const silent = () => {};
const EXAMPLE = new URL('../../../docs/question-bank/examples/valid/single-choice.json', import.meta.url);

async function state(dataDirectory, exchangeId) {
  const database = await startPersistentPostgres(dataDirectory);
  try {
    return (await database.ownerPool.query(`SELECT v.id, v.version_no, v.section::text AS section, w.state::text AS state, (q.eligible_version_id = v.id) AS served
        FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id JOIN tsa.questions q ON q.id=v.question_id
       WHERE v.question_id = (SELECT question_id FROM tsa_private.exchange_import_receipts WHERE exchange_question_id=$1 LIMIT 1)
       ORDER BY v.version_no`, [exchangeId])).rows;
  } finally { await database.stop(); }
}

// The admin changes one question at a time through the owner workflow: publish a draft, withhold and restore a
// published question, and move a question to another section as a new version (immutable history is kept).
test('the owner publishes, withholds, restores and moves single questions', { timeout: 900_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'question-change-'));
  try {
    const dataDirectory = path.join(directory, 'bank');
    const inbox = path.join(directory, 'inbox');
    const imageStoreDirectory = path.join(directory, 'images');
    await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();
    await setupPracticePool({ dataDirectory, confirm: 'REGISTER TAXONOMY', log: silent });
    const base = JSON.parse(await readFile(EXAMPLE, 'utf8')).questions[0];
    const questions = [1, 2].map((index) => ({ ...structuredClone(base), question_id: `MATH-C1-00000${index}`,
      content_blocks: [{ type: 'text', content: `${base.content_blocks[0].content} (câu ${index})` }] }));
    await mkdir(path.join(inbox, 'math'), { recursive: true });
    await writeFile(path.join(inbox, 'math', 'set.json'), JSON.stringify({ format: 'tsa-question-set/1', batch_id: 'GPT-C1', passages: [], questions }));
    await runInbox({ dataDirectory, inbox, imageStoreDirectory, confirm: 'IMPORT 2', log: silent });
    const [first] = await state(dataDirectory, 'MATH-C1-000001');
    const [second] = await state(dataDirectory, 'MATH-C1-000002');
    const run = (versionId, action, extra = {}) => changeQuestion({ dataDirectory, imageStoreDirectory, versionId, action, log: silent, ...extra });
    const confirmed = async (versionId, action, extra = {}) => {
      const dry = await run(versionId, action, extra);
      assert.equal(dry.ok, true, dry.problem);
      assert.equal(dry.phrase, questionChangePhrase(action, versionId, extra.section ?? null));
      return run(versionId, action, { ...extra, confirm: dry.phrase });
    };

    // Refusals are explained in the dry run and change nothing.
    assert.match((await run(first.id, 'RESTORE')).problem, /Only a withheld/);
    assert.match((await run(first.id, 'MOVE', { section: 'MATH' })).problem, /already in MATH/);
    await assert.rejects(run(first.id, 'PUBLISH', { confirm: 'PUBLISH wrong' }), /Expected exactly: "PUBLISH /);

    await confirmed(first.id, 'PUBLISH');
    assert.deepEqual((await state(dataDirectory, 'MATH-C1-000001')).map((row) => [row.state, row.served]), [['APPROVED', true]]);

    await confirmed(first.id, 'WITHHOLD', { reason: 'Đáp án cần kiểm tra lại' });
    assert.deepEqual((await state(dataDirectory, 'MATH-C1-000001')).map((row) => row.state), ['QUARANTINED']);
    assert.match((await run(first.id, 'MOVE', { section: 'SCIENCE' })).problem, /restore it first/);

    await confirmed(first.id, 'RESTORE');
    assert.deepEqual((await state(dataDirectory, 'MATH-C1-000001')).map((row) => [row.state, row.served]), [['APPROVED', true]]);

    // Moving a published question serves the new version in the new section at once.
    const moved = await confirmed(first.id, 'MOVE', { section: 'SCIENCE' });
    assert.deepEqual((await state(dataDirectory, 'MATH-C1-000001')).map((row) => [row.version_no, row.section, row.state, row.served]),
      [[1, 'MATH', 'APPROVED', false], [2, 'SCIENCE', 'APPROVED', true]]);
    assert.match((await run(first.id, 'WITHHOLD', { reason: 'older version' })).problem, /older version/);
    assert.equal(moved.newVersionId, (await state(dataDirectory, 'MATH-C1-000001'))[1].id);

    // Moving a draft keeps it a draft; the new version is then publishable like any other draft.
    const draftMove = await confirmed(second.id, 'MOVE', { section: 'READING' });
    assert.deepEqual((await state(dataDirectory, 'MATH-C1-000002')).map((row) => [row.section, row.state]), [['MATH', 'DRAFT'], ['READING', 'DRAFT']]);
    await confirmed(draftMove.newVersionId, 'PUBLISH');
    assert.deepEqual((await state(dataDirectory, 'MATH-C1-000002')).map((row) => [row.section, row.state, row.served]),
      [['MATH', 'DRAFT', false], ['READING', 'APPROVED', true]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Real-content questions sit in single-subject taxonomies; a move takes the taxonomy version that serves the target
// section. A move that would create a second copy of a question already in the target section is refused.
test('a corpus question moves to the taxonomy that serves the section, and duplicates are refused', { timeout: 900_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'question-move-'));
  try {
    const dataDirectory = path.join(directory, 'bank');
    const imageStoreDirectory = path.join(directory, 'images');
    await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();
    const math = await registerTaxonomy({ dataDirectory, name: 'Corpus Math only', domain: 'MATH', skills: ['MATH_REASONING'], confirm: 'REGISTER TAXONOMY', log: silent });
    const science = await registerTaxonomy({ dataDirectory, name: 'Corpus Science only', domain: 'SCIENCE', skills: ['SCIENCE_REASONING'], confirm: 'REGISTER TAXONOMY', log: silent });
    const base = JSON.parse(await readFile(EXAMPLE, 'utf8')).questions[0];
    const question = (id, subject, text) => ({ ...structuredClone(base), question_id: id, subject, content_blocks: [{ type: 'text', content: text }] });
    const file = path.join(directory, 'corpus.json');
    await writeFile(file, 'corpus document');
    const sourceVersionId = await writeSourceVersion({ dataDirectory, file, hash: await fileHash(file), title: 'Corpus test document',
      origin: 'EXTERNAL', rights: OWNER_RIGHTS, registeredBy: 'test' });
    const load = async (questions, taxonomyVersionId, subject) => {
      const document = { format: 'tsa-question-set/1', batch_id: `SRC-${subject}`, passages: [], questions };
      await importQuestions({ dataDirectory, document, sourceVersionId, taxonomyVersionId, topicMap: { [base.topic]: `${subject}_REASONING` },
        confirm: importConfirmation(questions.length), log: silent });
    };
    await load([question('MATH-K1-000001', 'MATH', 'Câu hỏi chuyển sang Khoa học (1)'), question('MATH-K1-000002', 'MATH', 'Câu hỏi trùng (2)')], math.taxonomyVersionId, 'MATH');
    await load([question('SCIE-K1-000001', 'SCIENCE', 'Câu hỏi trùng (2)')], science.taxonomyVersionId, 'SCIENCE');
    const [first] = await state(dataDirectory, 'MATH-K1-000001');
    const [twin] = await state(dataDirectory, 'MATH-K1-000002');
    const run = (versionId, extra = {}) => changeQuestion({ dataDirectory, imageStoreDirectory, versionId, action: 'MOVE', section: 'SCIENCE', log: silent, ...extra });

    const refused = await run(twin.id);
    assert.match(refused.problem, /An identical question is already in SCIENCE/);

    const lines = [];
    const dry = await changeQuestion({ dataDirectory, imageStoreDirectory, versionId: first.id, action: 'MOVE', section: 'SCIENCE', log: (line) => lines.push(line) });
    assert.equal(dry.ok, true, dry.problem);
    assert.ok(lines.some((line) => line.includes('taxonomy "Corpus Science only"')));
    const moved = await run(first.id, { confirm: dry.phrase });
    const database = await startPersistentPostgres(dataDirectory);
    try {
      const row = (await database.ownerPool.query('SELECT section::text AS section, taxonomy_version_id FROM tsa.question_versions WHERE id=$1', [moved.newVersionId])).rows[0];
      assert.deepEqual(row, { section: 'SCIENCE', taxonomy_version_id: science.taxonomyVersionId });
    } finally { await database.stop(); }
    assert.deepEqual((await state(dataDirectory, 'MATH-K1-000001')).map((entry) => [entry.section, entry.state]), [['MATH', 'DRAFT'], ['SCIENCE', 'DRAFT']]);
    // The moved draft publishes like any corpus draft; one question, one served version.
    await changeQuestion({ dataDirectory, imageStoreDirectory, versionId: moved.newVersionId, action: 'PUBLISH', log: silent,
      confirm: (await changeQuestion({ dataDirectory, imageStoreDirectory, versionId: moved.newVersionId, action: 'PUBLISH', log: silent })).phrase });
    assert.deepEqual((await state(dataDirectory, 'MATH-K1-000001')).map((entry) => [entry.section, entry.served]), [['MATH', false], ['SCIENCE', true]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
