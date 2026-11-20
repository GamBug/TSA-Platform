import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ownerPublish } from '../../../scripts/owner-publish.mjs';
import { runInbox, setupPracticePool } from '../../../scripts/questions-inbox.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { PRACTICE_POOL_OFFERING_SUFFIX } from '../../../src/local/practice-pool.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';
import { seedUniDemoOfferings } from '../../../src/local/uni-demo-seed.mjs';

const env = { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' };
const silent = () => {};
const EXAMPLE = new URL('../../../docs/question-bank/examples/valid/single-choice.json', import.meta.url);

async function mathSet(batch, count) {
  const base = JSON.parse(await readFile(EXAMPLE, 'utf8')).questions[0];
  const questions = Array.from({ length: count }, (_, index) => {
    const question = structuredClone(base);
    question.question_id = `MATH-${batch}-${String(index + 1).padStart(6, '0')}`;
    question.content_blocks[0].content += ` (lần gieo thứ ${index + 1})`;
    return question;
  });
  return { format: 'tsa-question-set/1', batch_id: `GPT-${batch}`, passages: [], questions };
}

test('pasted ChatGPT files are checked, imported into the separate pool, sorted, published and offered as extra practice only', { timeout: 600_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'question-inbox-'));
  try {
    const dataDirectory = path.join(directory, 'bank');
    const inbox = path.join(directory, 'inbox');
    await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();

    // Before setup the files are validated and the setup command is named; nothing is importable.
    const lines = [];
    const early = await runInbox({ dataDirectory, inbox, log: (line) => lines.push(line) });
    assert.equal(early.taxonomyVersionId, null);
    assert.ok(lines.some((line) => /questions:inbox -- --setup --confirm "REGISTER TAXONOMY"/.test(line)));
    const { taxonomyVersionId } = await setupPracticePool({ dataDirectory, confirm: 'REGISTER TAXONOMY', log: silent });
    assert.match(taxonomyVersionId, /^[0-9a-f-]{36}$/);

    const good = JSON.stringify(await mathSet('G1', 4), null, 2);
    await writeFile(path.join(inbox, 'math', 'batch-1.md'), `Đây là bộ câu hỏi:\n\`\`\`json\n${good}\n\`\`\`\nChúc bạn học tốt!`);
    const wrongAnswer = await mathSet('G2', 1);
    wrongAnswer.questions[0].answer.option_id = 'E';
    await writeFile(path.join(inbox, 'math', 'batch-2.json'), JSON.stringify(wrongAnswer));
    await writeFile(path.join(inbox, 'science', 'batch-3.json'), JSON.stringify(await mathSet('G3', 1)));
    await writeFile(path.join(inbox, 'reading', 'notes.txt'), 'forgot to paste');

    const dry = await runInbox({ dataDirectory, inbox, log: silent });
    assert.equal(dry.phrase, 'IMPORT 4');
    assert.deepEqual(dry.checked.map((entry) => [entry.name, entry.problems.map((problem) => problem.code)]), [
      ['batch-1.md', []], ['batch-2.json', ['ANSWER_NOT_AN_OPTION']], ['notes.txt', ['NOT_JSON']], ['batch-3.json', ['WRONG_FOLDER']]]);
    await assert.rejects(runInbox({ dataDirectory, inbox, confirm: 'IMPORT 5', log: silent }), /Expected exactly: "IMPORT 4"/);

    const applied = await runInbox({ dataDirectory, inbox, confirm: 'IMPORT 4', log: silent });
    assert.equal(applied.imported, 4);
    assert.equal(applied.twins, 0);
    assert.deepEqual((await readdir(path.join(inbox, 'math'))).sort(), ['imported', 'rejected']);
    assert.match((await readdir(path.join(inbox, 'math', 'imported')))[0], /-batch-1\.md$/);
    const rejected = (await readdir(path.join(inbox, 'math', 'rejected'))).sort();
    assert.equal(rejected.length, 2);
    assert.match(await readFile(path.join(inbox, 'math', 'rejected', rejected.find((name) => name.endsWith('.errors.txt'))), 'utf8'), /ANSWER_NOT_AN_OPTION/);
    assert.equal((await readdir(path.join(inbox, 'science', 'rejected'))).length, 2);

    // A second run finds an empty inbox; re-pasting the imported file is a no-op.
    await writeFile(path.join(inbox, 'math', 'batch-1.md'), good);
    const again = await runInbox({ dataDirectory, inbox, log: silent });
    assert.equal(again.phrase, 'IMPORT 0');

    const database = await startPersistentPostgres(dataDirectory);
    try {
      const rows = (await database.ownerPool.query(`SELECT v.taxonomy_version_id, w.state::text AS state, rd.status::text AS rights, s.origin
          FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id
          CROSS JOIN LATERAL tsa.bank_question_sources(v.id) qs JOIN tsa.source_versions sv ON sv.id=qs.id JOIN tsa.sources s ON s.id=sv.source_id
          JOIN tsa.source_rights sr ON sr.source_version_id=sv.id JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id`)).rows;
      assert.equal(rows.length, 4);
      assert.ok(rows.every((row) => row.taxonomy_version_id === taxonomyVersionId && row.state === 'DRAFT' && row.rights === 'OWNED' && row.origin === 'OWNED'));
    } finally { await database.stop(); }

    const preview = await ownerPublish({ dataDirectory, taxonomyVersionId, log: silent });
    assert.equal(preview.phrase, 'PUBLISH 4 ALL');
    assert.equal((await ownerPublish({ dataDirectory, taxonomyVersionId, confirm: preview.phrase, log: silent })).published, 4);

    const seeded = await startPersistentPostgres(dataDirectory);
    try {
      const report = await seedUniDemoOfferings(seeded.ownerPool);
      assert.equal(report.fullSimulation.offered, false);
      assert.deepEqual(report.published, { MATH: 0, READING: 0, SCIENCE: 0 });
      assert.deepEqual(report.practicePool.published, { MATH: 4, READING: 0, SCIENCE: 0 });
      assert.deepEqual(report.offerings.map((offering) => [offering.kind, offering.section, offering.practicePool === true]), [['SECTION_PRACTICE', 'MATH', true]]);
      const name = (await seeded.ownerPool.query(`SELECT b.config->>'name' AS name FROM tsa.blueprint_versions b WHERE b.id=$1`, [report.offerings[0].blueprintVersionId])).rows[0].name;
      assert.equal(name, `Luyện tập Toán học${PRACTICE_POOL_OFFERING_SUFFIX}`);
    } finally { await seeded.stop(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
