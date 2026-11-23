import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { changeQuestion, questionChangePhrase } from '../../../scripts/question-change.mjs';
import { runInbox, setupPracticePool } from '../../../scripts/questions-inbox.mjs';
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
