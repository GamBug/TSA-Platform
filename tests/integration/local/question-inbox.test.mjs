import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
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

async function mathSet(batch, count, batchPrefix = 'GPT-') {
  const base = JSON.parse(await readFile(EXAMPLE, 'utf8')).questions[0];
  const questions = Array.from({ length: count }, (_, index) => {
    const question = structuredClone(base);
    question.question_id = `MATH-${batch}-${String(index + 1).padStart(6, '0')}`;
    question.content_blocks[0].content += ` (lần gieo thứ ${index + 1})`;
    return question;
  });
  return { format: 'tsa-question-set/1', batch_id: `${batchPrefix}${batch}`, passages: [], questions };
}

// The pool offers a real-length section test (40 Math questions, OPEN_DECISIONS 2026-11-21) once it holds enough.
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

    const good = JSON.stringify(await mathSet('G1', 39), null, 2);
    await writeFile(path.join(inbox, 'math', 'batch-1.md'), `Đây là bộ câu hỏi:\n\`\`\`json\n${good}\n\`\`\`\nChúc bạn học tốt!`);
    const wrongAnswer = await mathSet('G2', 1);
    wrongAnswer.questions[0].answer.option_id = 'E';
    await writeFile(path.join(inbox, 'math', 'batch-2.json'), JSON.stringify(wrongAnswer));
    await writeFile(path.join(inbox, 'science', 'batch-3.json'), JSON.stringify(await mathSet('G3', 1)));
    await writeFile(path.join(inbox, 'reading', 'notes.txt'), 'forgot to paste');
    // A transcription of the owner's own material joins the same pool under corpus rights, not as an original work.
    const transcribed = await mathSet('S4', 1, 'SRC-');
    transcribed.questions[0].content_blocks[0].content += ' (chép từ đề của chủ dự án)';
    await writeFile(path.join(inbox, 'math', 'batch-4.json'), JSON.stringify(transcribed));
    const figure = await mathSet('S5', 1, 'SRC-');
    figure.questions[0].content_blocks.push({ type: 'image_request', request_id: 'NEW-IMG-001', description: 'Source: page 1, figure above question 1.', alt: 'Hình 1' });
    await writeFile(path.join(inbox, 'math', 'batch-5.json'), JSON.stringify(figure));

    const dryLines = [];
    const dry = await runInbox({ dataDirectory, inbox, log: (line) => dryLines.push(line) });
    assert.equal(dry.phrase, 'IMPORT 40');
    assert.deepEqual(dry.checked.map((entry) => [entry.name, entry.problems.map((problem) => problem.code)]), [
      ['batch-1.md', []], ['batch-2.json', ['ANSWER_NOT_AN_OPTION']], ['batch-4.json', []], ['batch-5.json', ['ASSET_REQUIRED']],
      ['notes.txt', ['NOT_JSON']], ['batch-3.json', ['WRONG_FOLDER']]]);
    assert.ok(dryLines.some((line) => /batch-4\.json: 1 question\(s\), 1 new, transcription/.test(line)));
    // A missing figure becomes a FIGURES request for ChatGPT naming the exact file the inbox expects.
    assert.ok(dryLines.some((line) => /FIGURES · The platform needs these figures/.test(line)));
    assert.ok(dryLines.some((line) => /- MATH-S5-000001_NEW-IMG-001\.png  \(Source: page 1, figure above question 1\.\)/.test(line)));
    await assert.rejects(runInbox({ dataDirectory, inbox, confirm: 'IMPORT 4', log: silent }), /Expected exactly: "IMPORT 40"/);

    const applied = await runInbox({ dataDirectory, inbox, confirm: 'IMPORT 40', log: silent });
    assert.equal(applied.imported, 40);
    assert.equal(applied.twins, 0);
    assert.deepEqual((await readdir(path.join(inbox, 'math'))).sort(), ['imported', 'rejected']);
    assert.deepEqual((await readdir(path.join(inbox, 'math', 'imported'))).map((name) => name.replace(/^[0-9-]+-/, '')).sort(), ['batch-1.md', 'batch-4.json']);
    const rejected = (await readdir(path.join(inbox, 'math', 'rejected'))).sort();
    assert.equal(rejected.length, 4);
    assert.match(await readFile(path.join(inbox, 'math', 'rejected', rejected.find((name) => name.endsWith('batch-2.json.errors.txt'))), 'utf8'), /ANSWER_NOT_AN_OPTION/);
    assert.equal((await readdir(path.join(inbox, 'science', 'rejected'))).length, 2);

    // A second run finds an empty inbox; re-pasting the imported file is a no-op.
    await writeFile(path.join(inbox, 'math', 'batch-1.md'), good);
    const again = await runInbox({ dataDirectory, inbox, log: silent });
    assert.equal(again.phrase, 'IMPORT 0');

    const database = await startPersistentPostgres(dataDirectory);
    try {
      const rows = (await database.ownerPool.query(`SELECT v.taxonomy_version_id, w.state::text AS state, rd.status::text AS rights, s.origin, s.title
          FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id
          CROSS JOIN LATERAL tsa.bank_question_sources(v.id) qs JOIN tsa.source_versions sv ON sv.id=qs.id JOIN tsa.sources s ON s.id=sv.source_id
          JOIN tsa.source_rights sr ON sr.source_version_id=sv.id JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id`)).rows;
      assert.equal(rows.length, 40);
      assert.ok(rows.every((row) => row.taxonomy_version_id === taxonomyVersionId && row.state === 'DRAFT'));
      const provenance = rows.map((row) => [row.title.replace(/\/.*$/, ''), row.origin, row.rights]);
      assert.deepEqual(provenance.filter(([title]) => title === 'Practice original math'), Array(39).fill(['Practice original math', 'OWNED', 'OWNED']));
      assert.deepEqual(provenance.filter(([title]) => title === 'Corpus transcription math'), [['Corpus transcription math', 'EXTERNAL', 'LICENSED']]);
    } finally { await database.stop(); }

    const preview = await ownerPublish({ dataDirectory, taxonomyVersionId, log: silent });
    assert.equal(preview.phrase, 'PUBLISH 40 ALL');
    assert.equal((await ownerPublish({ dataDirectory, taxonomyVersionId, confirm: preview.phrase, log: silent })).published, 40);

    const seeded = await startPersistentPostgres(dataDirectory);
    try {
      const report = await seedUniDemoOfferings(seeded.ownerPool);
      assert.equal(report.fullSimulation.offered, false);
      assert.deepEqual(report.published, { MATH: 0, READING: 0, SCIENCE: 0 });
      assert.deepEqual(report.practicePool.published, { MATH: 40, READING: 0, SCIENCE: 0 });
      assert.deepEqual(report.offerings.map((offering) => [offering.kind, offering.section, offering.practicePool === true]), [['SECTION_PRACTICE', 'MATH', true]]);
      const name = (await seeded.ownerPool.query(`SELECT b.config->>'name' AS name FROM tsa.blueprint_versions b WHERE b.id=$1`, [report.offerings[0].blueprintVersionId])).rows[0].name;
      assert.equal(name, `Phần thi Toán học${PRACTICE_POOL_OFFERING_SUFFIX}`);
    } finally { await seeded.stop(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Figures supplied as files next to the pasted answer are registered under the file's source and imported with the
// question; a figure that is still missing rejects only its file, with a FIGURES request to paste back into ChatGPT.
test('figure files named after their image requests are registered and imported with the questions', { timeout: 600_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'question-inbox-figures-'));
  try {
    const dataDirectory = path.join(directory, 'bank');
    const inbox = path.join(directory, 'inbox');
    const imageStoreDirectory = path.join(directory, 'images');
    await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();
    await setupPracticePool({ dataDirectory, confirm: 'REGISTER TAXONOMY', log: silent });
    await mkdir(path.join(inbox, 'math'), { recursive: true });

    const withFigures = await mathSet('S6', 2, 'SRC-');
    withFigures.questions[0].content_blocks.push({ type: 'image_request', request_id: 'NEW-IMG-001', description: 'Source: page 2, graph of f.', alt: 'Đồ thị hàm số f' });
    withFigures.questions[0].explanation.push({ type: 'image_request', request_id: 'NEW-IMG-002', description: 'Source: page 9, solution figure.', alt: 'Hình lời giải' });
    await writeFile(path.join(inbox, 'math', 'part-1.json'), JSON.stringify(withFigures));
    const stillMissing = await mathSet('S7', 1, 'SRC-');
    stillMissing.questions[0].content_blocks.push({ type: 'image_request', request_id: 'NEW-IMG-001', description: 'Source: page 3, cube.', alt: 'Hình lập phương' });
    await writeFile(path.join(inbox, 'math', 'part-2.json'), JSON.stringify(stillMissing));
    const png = (color) => sharp({ create: { width: 80, height: 60, channels: 3, background: color } }).png().toBuffer();
    await writeFile(path.join(inbox, 'math', 'MATH-S6-000001_NEW-IMG-001.png'), await png('#204080'));
    await writeFile(path.join(inbox, 'math', 'MATH-S6-000001_NEW-IMG-002.png'), await png('#802040'));
    await writeFile(path.join(inbox, 'math', 'MATH-S7-000001_NEW-IMG-001.png'), Buffer.from('not an image'));

    const dryLines = [];
    const dry = await runInbox({ dataDirectory, inbox, imageStoreDirectory, log: (line) => dryLines.push(line) });
    assert.deepEqual(dry.checked.map((entry) => [entry.name, entry.problems.map((problem) => problem.code)]),
      [['part-1.json', []], ['part-2.json', ['FIGURE_INVALID', 'ASSET_REQUIRED']]]);
    assert.ok(dryLines.some((line) => /part-1\.json: 2 question\(s\), 2 new, transcription, 2 figure\(s\) attached/.test(line)));
    assert.equal(dry.phrase, 'IMPORT 2');

    const applied = await runInbox({ dataDirectory, inbox, imageStoreDirectory, confirm: 'IMPORT 2', log: silent });
    assert.equal(applied.imported, 2);
    assert.equal(applied.figuresRegistered, 2);
    // The used figures move with their file; the rejected file's figure stays in the inbox for the next run.
    assert.deepEqual((await readdir(path.join(inbox, 'math'))).sort(), ['MATH-S7-000001_NEW-IMG-001.png', 'imported', 'rejected']);
    assert.deepEqual((await readdir(path.join(inbox, 'math', 'imported'))).map((name) => name.replace(/^[0-9-]+-/, '')).sort(),
      ['MATH-S6-000001_NEW-IMG-001.png', 'MATH-S6-000001_NEW-IMG-002.png', 'part-1.json']);
    const errors = (await readdir(path.join(inbox, 'math', 'rejected'))).find((name) => name.endsWith('.errors.txt'));
    assert.match(await readFile(path.join(inbox, 'math', 'rejected', errors), 'utf8'), /^FIGURES · [\s\S]*- MATH-S7-000001_NEW-IMG-001\.png  \(the file I saved could not be read; make it again\. Source: page 3, cube\.\)/);

    const database = await startPersistentPostgres(dataDirectory);
    try {
      const row = (await database.ownerPool.query(`SELECT v.content, s.explanation,
          (SELECT count(*)::integer FROM tsa.question_assets qa WHERE qa.question_version_id=v.id) AS assets
        FROM tsa_private.exchange_import_receipts r JOIN tsa.question_versions v ON v.id=r.question_version_id
        JOIN tsa_private.question_secrets s ON s.question_version_id=v.id WHERE r.exchange_question_id='MATH-S6-000001'`)).rows[0];
      const image = row.content.find((block) => block.type === 'image');
      assert.equal(image.alt, 'Đồ thị hàm số f');
      assert.ok(row.explanation.some((block) => block.type === 'image'), 'the explanation figure is imported too');
      assert.ok(!JSON.stringify(row.content).includes('image_request'));
      assert.ok(row.assets >= 1);
      const codes = (await database.ownerPool.query(`SELECT asset_code, title FROM tsa.image_assets ORDER BY asset_code`)).rows;
      assert.deepEqual(codes.map((asset) => [asset.asset_code, asset.title]),
        [['IMG-MATH-000001', 'MATH-S6-000001_NEW-IMG-001'], ['IMG-MATH-000002', 'MATH-S6-000001_NEW-IMG-002']]);
    } finally { await database.stop(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
