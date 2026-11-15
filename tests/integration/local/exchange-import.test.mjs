import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { importQuestions } from '../../../scripts/questions-import.mjs';
import { session } from '../../../scripts/owner-publish.mjs';
import { OWNER_RIGHTS } from '../../../src/local/owner-publication.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';
import { createLocalImageStore } from '../../../src/modules/media/local-image-store.mjs';
import { registerImage } from '../../../src/modules/bank/image-library.mjs';

const env = { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' };
const EXAMPLES = new URL('../../../docs/question-bank/examples/valid/', import.meta.url);
const example = async (name) => JSON.parse(await readFile(new URL(name, EXAMPLES), 'utf8'));
const silent = () => {};

async function buildWorkspace(directory) {
  const dataDirectory = path.join(directory, 'bank');
  await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();
  const sourceId = randomUUID();
  const ids = { rights: randomUUID(), bare: randomUUID() };
  const database = await startPersistentPostgres(dataDirectory);
  const codes = [];
  try {
    for (const [key, versionId] of Object.entries(ids)) {
      const id = key === 'rights' ? sourceId : randomUUID();
      await database.ownerPool.query(`INSERT INTO tsa.sources (id, title, canonical_uri, owner_reference, origin, created_by) VALUES ($1, $2, NULL, NULL, 'EXTERNAL', NULL)`, [id, `Exchange import fixture ${key}`]);
      await database.ownerPool.query(`INSERT INTO tsa.source_versions (id, source_id, version_no, content_hash, metadata, evidence_uri) VALUES ($1, $2, 1, $3, '{}'::jsonb, NULL)`,
        [versionId, id, `sha256:${(key === 'rights' ? 'a' : 'b').repeat(64)}`]);
    }
    const store = await createLocalImageStore({ rootDirectory: path.join(directory, 'objects'), enabled: true, env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' } });
    for (const color of ['#84292b', '#254e62']) {
      const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).png().toBuffer();
      codes.push((await registerImage(database.ownerPool, store, { bytes, area: 'GEO', alt: 'Hình thử', sourceVersionId: ids.rights })).assetCode);
    }
  } finally { await database.stop(); }
  const runtime = await createTrackBRuntime({ env, dataDirectory, port: 0 });
  try {
    const manager = await session(runtime.origin, 'bankManager');
    await manager(`/api/v1/source-versions/${ids.rights}/rights`, { ...OWNER_RIGHTS, expectedRevision: 0 });
  } finally { await runtime.close(); }
  return { dataDirectory, sourceVersionId: ids.rights, bareSourceVersionId: ids.bare, codes };
}

async function buildSet(codes) {
  const names = ['single-choice', 'multiple-choice', 'true-false-group', 'numeric', 'cloze', 'matching', 'images-shared-and-multiple'];
  const questions = [];
  for (const name of names) questions.push(...(await example(`${name}.json`)).questions);
  const swap = (text) => text.replaceAll('IMG-GEO-000123', codes[0]).replaceAll('IMG-GEO-000124', codes[1]);
  const set = JSON.parse(swap(JSON.stringify({ format: 'tsa-question-set/1', batch_id: 'IMPORT-TEST-001', passages: [], questions })));
  for (const question of set.questions) question.topic = 'ALGEBRA';
  set.questions.find((question) => question.question_type === 'NUMERIC').topic = 'PROBABILITY';
  const withExplanationImage = set.questions.find((question) => question.question_id === 'MATH-GEO-000007');
  withExplanationImage.explanation.push({ type: 'image', asset_id: codes[1], alt: 'Hình trong lời giải' });
  withExplanationImage.asset_refs.push(codes[1]);
  return set;
}

const counts = async (dataDirectory) => {
  const database = await startPersistentPostgres(dataDirectory);
  try {
    return (await database.ownerPool.query(`SELECT (SELECT count(*)::int FROM tsa.question_versions) AS versions, (SELECT count(*)::int FROM tsa_private.exchange_import_receipts) AS receipts,
      (SELECT count(*)::int FROM tsa.asset_versions) AS assets`)).rows[0];
  } finally { await database.stop(); }
};

test('a validated set imports as DRAFTs, replays idempotently, versions on content_version and rejects bad sets whole', { timeout: 600_000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-exchange-import-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = await buildWorkspace(directory);
  const { dataDirectory, sourceVersionId, codes } = workspace;
  const options = { dataDirectory, sourceVersionId, topicMap: { PROBABILITY: 'ALGEBRA' }, log: silent };
  const set = await buildSet(codes);
  const baseline = await counts(dataDirectory);
  assert.deepEqual([baseline.versions, baseline.receipts, baseline.assets], [0, 0, 2]);

  await t.test('a dry run plans every question and writes nothing', async () => {
    const dry = await importQuestions({ ...options, document: set });
    assert.equal(dry.imported, 0);
    assert.equal(dry.plan.ok, true);
    assert.deepEqual(dry.plan.items.map((item) => item.action), Array(8).fill('CREATE'));
    assert.deepEqual(dry.plan.items.map((item) => item.schemaVersion).sort(),
      ['question/1', 'question/1', 'question/1', 'question/1', 'question/1', 'question/2', 'question/3', 'question/3']);
    assert.equal(dry.phrase, 'IMPORT 8');
    assert.deepEqual(await counts(dataDirectory), baseline);
    await assert.rejects(importQuestions({ ...options, document: set, confirm: 'IMPORT 3' }), /Confirmation does not match/);
    assert.deepEqual(await counts(dataDirectory), baseline);
  });

  await t.test('a confirmed import creates DRAFT versions that are never selectable', async () => {
    const applied = await importQuestions({ ...options, document: set, confirm: 'IMPORT 8' });
    assert.equal(applied.imported, 8);
    assert.ok(applied.created.every((entry) => entry.state === 'DRAFT'));
    const database = await startPersistentPostgres(dataDirectory);
    try {
      const rows = (await database.ownerPool.query(`SELECT r.exchange_question_id AS id, v.schema_version, v.interaction->>'type' AS type, w.state::text AS state, v.origin::text AS origin,
          tsa.bank_question_selection_allowed(v.id) AS selectable, s.answer_key, v.content, s.explanation
        FROM tsa_private.exchange_import_receipts r JOIN tsa.question_versions v ON v.id = r.question_version_id
        JOIN tsa.question_workflow w ON w.question_version_id = v.id JOIN tsa_private.question_secrets s ON s.question_version_id = v.id ORDER BY r.exchange_question_id`)).rows;
      assert.equal(rows.length, 8);
      assert.ok(rows.every((row) => row.state === 'DRAFT' && row.selectable === false && row.origin === 'MANUAL'), 'only DRAFTs; nothing is reviewed or published');
      const byId = new Map(rows.map((row) => [row.id, row]));
      assert.deepEqual(byId.get('MATH-PROB-000001').answer_key, { type: 'SINGLE_CHOICE', optionId: 'C' });
      assert.deepEqual(byId.get('MATH-ALG-000002').answer_key, { type: 'MULTIPLE_CHOICE', optionIds: ['B', 'C'] });
      assert.deepEqual(byId.get('MATH-GEO-000003').answer_key, { type: 'TRUE_FALSE_GROUP', values: { a: true, b: false, c: true, d: false } });
      assert.deepEqual(byId.get('MATH-PROB-000004').answer_key, { type: 'NUMERIC_RESPONSE', value: '0.46' });
      assert.equal(byId.get('MATH-PROB-000004').schema_version, 'question/2');
      assert.deepEqual(byId.get('MATH-ALG-000005').answer_key, { type: 'CLOZE', acceptedValues: { u5: ['14'], s5: ['40'] } });
      assert.deepEqual(byId.get('MATH-ANA-000006').answer_key, { type: 'MATCHING', answers: { r1: 't1', r2: 't2', r3: 't3', r4: 't4' } });
      // Images: the same library asset resolves to the same stored asset version in both questions; the explanation image is a separate version.
      const first = byId.get('MATH-GEO-000007').content.find((block) => block.type === 'image');
      const second = byId.get('MATH-GEO-000008').content.filter((block) => block.type === 'image');
      assert.equal(second[0].assetVersionId, first.assetVersionId, 'one stored image serves two questions');
      assert.notEqual(second[1].assetVersionId, first.assetVersionId);
      const explanationImage = byId.get('MATH-GEO-000007').explanation.find((block) => block.type === 'image');
      const classes = (await database.ownerPool.query('SELECT id, security_class::text AS class, content_hash FROM tsa.asset_versions WHERE id = ANY($1)', [[explanationImage.assetVersionId, second[1].assetVersionId]])).rows;
      assert.equal(classes.find((row) => row.id === explanationImage.assetVersionId).class, 'EXPLANATION');
      assert.equal(classes.find((row) => row.id === second[1].assetVersionId).class, 'QUESTION');
      assert.equal(new Set(classes.map((row) => row.content_hash)).size, 1, 'the explanation copy shares the file bytes');
      const provenance = (await database.ownerPool.query(`SELECT transformation FROM tsa.question_provenance p JOIN tsa_private.exchange_import_receipts r ON r.question_version_id = p.question_version_id WHERE r.exchange_question_id = 'MATH-PROB-000004'`)).rows[0];
      assert.match(provenance.transformation, /batch IMPORT-TEST-001.*MATH-PROB-000004.*content_version 1.*topic PROBABILITY/u);
    } finally { await database.stop(); }
  });

  await t.test('importing the same set again skips every question', async () => {
    const before = await counts(dataDirectory);
    const replay = await importQuestions({ ...options, document: set, confirm: 'IMPORT 0' });
    assert.equal(replay.imported, 0);
    assert.deepEqual((await importQuestions({ ...options, document: set })).plan.items.map((item) => item.action), Array(8).fill('SKIP'));
    assert.deepEqual(await counts(dataDirectory), before);
  });

  await t.test('a higher content_version becomes the next version of the same Bank question; conflicts and regressions are refused', async () => {
    const changed = structuredClone(set);
    const cloze = changed.questions.find((question) => question.question_id === 'MATH-ALG-000005');
    cloze.metadata.content_version = 2;
    cloze.content_blocks[0].content += ' Hãy tính cẩn thận.';
    const plan = await importQuestions({ ...options, document: changed });
    assert.deepEqual(plan.plan.items.filter((item) => item.action !== 'SKIP').map((item) => [item.questionId, item.action]), [['MATH-ALG-000005', 'NEW_VERSION']]);
    const applied = await importQuestions({ ...options, document: changed, confirm: 'IMPORT 1' });
    assert.equal(applied.imported, 1);
    const database = await startPersistentPostgres(dataDirectory);
    try {
      const versions = (await database.ownerPool.query(`SELECT v.version_no::int AS no, v.parent_version_id, v.question_id FROM tsa.question_versions v
        WHERE v.question_id = (SELECT question_id FROM tsa_private.exchange_import_receipts WHERE exchange_question_id = 'MATH-ALG-000005' AND content_version = 1) ORDER BY v.version_no`)).rows;
      assert.deepEqual(versions.map((version) => version.no), [1, 2]);
      assert.equal(versions[1].parent_version_id !== null, true);
    } finally { await database.stop(); }

    const conflict = structuredClone(changed);
    conflict.questions.find((question) => question.question_id === 'MATH-ALG-000005').content_blocks[0].content += ' Khác.';
    assert.deepEqual((await importQuestions({ ...options, document: conflict })).plan.problems.map((problem) => problem.code), ['CONTENT_VERSION_CONFLICT']);
    const regression = structuredClone(changed);
    const old = regression.questions.find((question) => question.question_id === 'MATH-ALG-000005');
    old.metadata.content_version = 1;
    old.content_blocks[0].content += ' Cũ.';
    assert.deepEqual((await importQuestions({ ...options, document: regression })).plan.problems.map((problem) => problem.code), ['CONTENT_VERSION_REGRESSION']);
  });

  await t.test('any problem stops the whole import before a single write', async () => {
    const before = await counts(dataDirectory);
    const fresh = async () => {
      const document = await example('single-choice.json');
      document.batch_id = 'IMPORT-TEST-002';
      document.questions[0].question_id = 'MATH-PROB-000501';
      document.questions[0].topic = 'ALGEBRA';
      document.questions[0].content_blocks[0].content = 'Một câu hỏi hoàn toàn mới để thử nhập liệu.';
      return document;
    };
    const attempt = async (mutate, extra = {}) => {
      const document = await fresh();
      const good = structuredClone(document.questions[0]);
      good.question_id = 'MATH-PROB-000502';
      good.content_blocks[0].content = 'Một câu hỏi tốt khác nữa.';
      document.questions.push(good);
      mutate(document.questions[0], document);
      const result = await importQuestions({ ...options, ...extra, document, confirm: 'IMPORT 2' });
      assert.equal(result.imported, 0);
      return result.plan.problems.map((problem) => problem.code);
    };
    assert.deepEqual(await attempt((question) => { question.topic = 'NO_SUCH_TOPIC'; }), ['TOPIC_UNMAPPED']);
    assert.deepEqual(await attempt((question) => { question.content_blocks.push({ type: 'image', asset_id: 'IMG-GEO-000999', alt: 'x' }); question.asset_refs = ['IMG-GEO-000999']; }), ['ASSET_NOT_FOUND']);
    assert.deepEqual(await attempt((question) => { question.content_blocks.push({ type: 'image_request', request_id: 'NEW-IMG-001', description: 'Hình cần vẽ thêm cho câu này.', alt: 'x' }); }), ['ASSET_REQUIRED']);
    assert.deepEqual(await attempt((question) => { question.answer.option_id = 'Z'; }), ['ANSWER_NOT_AN_OPTION']);
    assert.deepEqual(await attempt(() => {}, { sourceVersionId: randomUUID() }), ['SOURCE_VERSION_NOT_FOUND']);
    assert.deepEqual(await attempt(() => {}, { sourceVersionId: workspace.bareSourceVersionId }), ['SOURCE_RIGHTS_MISSING']);
    assert.deepEqual(await attempt(() => {}, { sourceVersionId: 'nope' }), ['SOURCE_VERSION_REQUIRED']);
    const passage = await example('reading-passage.json');
    for (const question of passage.questions) question.topic = 'ALGEBRA';
    passage.questions.forEach((question) => { question.subject = 'MATH'; });
    const unsupported = await importQuestions({ ...options, document: passage });
    assert.deepEqual([...new Set(unsupported.plan.problems.map((problem) => problem.code))], ['PASSAGE_IMPORT_UNSUPPORTED']);
    assert.deepEqual(await counts(dataDirectory), before, 'no rejected set wrote anything');
  });
});
