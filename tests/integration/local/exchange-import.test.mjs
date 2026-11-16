import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { importQuestions } from '../../../scripts/questions-import.mjs';
import { ownerPublish, session } from '../../../scripts/owner-publish.mjs';
import { createPassageBundles, listOwnerCandidates, OWNER_RIGHTS, ownerApprove, ownerConfirmSingleton } from '../../../src/local/owner-publication.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';
import { createLocalImageStore } from '../../../src/modules/media/local-image-store.mjs';
import { registerImage } from '../../../src/modules/bank/image-library.mjs';

const env = { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true' };
const EXAMPLES = new URL('../../../docs/question-bank/examples/valid/', import.meta.url);
const example = async (name) => JSON.parse(await readFile(new URL(name, EXAMPLES), 'utf8'));
const silent = () => {};

async function buildWorkspace(directory, sourcePrefix = 'Exchange import fixture') {
  const dataDirectory = path.join(directory, 'bank');
  await (await createTrackBRuntime({ env, dataDirectory, port: 0 })).close();
  const sourceId = randomUUID();
  const ids = { rights: randomUUID(), bare: randomUUID() };
  const database = await startPersistentPostgres(dataDirectory);
  const codes = [];
  try {
    for (const [key, versionId] of Object.entries(ids)) {
      const id = key === 'rights' ? sourceId : randomUUID();
      await database.ownerPool.query(`INSERT INTO tsa.sources (id, title, canonical_uri, owner_reference, origin, created_by) VALUES ($1, $2, NULL, NULL, 'EXTERNAL', NULL)`, [id, `${sourcePrefix} ${key}`]);
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
    assert.deepEqual(await counts(dataDirectory), before, 'no rejected set wrote anything');
  });

  await t.test('questions of one passage share a single stimulus, including the passage image, and a changed passage is not skipped', async () => {
    const passageSet = async () => {
      const document = await example('reading-passage.json');
      document.batch_id = 'IMPORT-TEST-PASSAGE';
      document.passages[0].content_blocks.push({ type: 'image', asset_id: codes[0], alt: 'Hình trong bài đọc' });
      document.passages[0].asset_refs = [codes[0]];
      document.questions.forEach((question, index) => { question.subject = 'MATH'; question.topic = 'ALGEBRA'; question.question_id = `MATH-PASS-00000${index + 1}`; });
      return document;
    };
    const document = await passageSet();
    const unknown = structuredClone(document);
    unknown.passages[0].content_blocks[1].asset_id = 'IMG-GEO-000999';
    unknown.passages[0].asset_refs = ['IMG-GEO-000999'];
    assert.ok((await importQuestions({ ...options, document: unknown })).plan.problems.some((problem) => problem.code === 'ASSET_NOT_FOUND'), 'a passage image must exist in the library');

    const before = await counts(dataDirectory);
    const applied = await importQuestions({ ...options, document, confirm: 'IMPORT 2' });
    assert.equal(applied.imported, 2);
    assert.deepEqual(applied.created.map((entry) => entry.state), ['DRAFT', 'DRAFT']);
    const database = await startPersistentPostgres(dataDirectory);
    try {
      const stored = (await database.ownerPool.query(`SELECT v.stimulus_version_id, count(*) OVER () AS members FROM tsa.question_versions v
        JOIN tsa_private.exchange_import_receipts r ON r.question_version_id = v.id WHERE r.exchange_question_id LIKE 'MATH-PASS-%'`)).rows;
      assert.equal(stored.length, 2);
      assert.equal(new Set(stored.map((row) => row.stimulus_version_id)).size, 1, 'both questions point at one stimulus');
      assert.notEqual(stored[0].stimulus_version_id, null);
      const stimulus = (await database.ownerPool.query(`SELECT content, (SELECT count(*)::int FROM tsa.stimulus_assets WHERE stimulus_version_id = $1) AS assets,
          (SELECT count(*)::int FROM tsa.stimulus_sources WHERE stimulus_version_id = $1) AS sources FROM tsa.stimulus_versions WHERE id = $1`, [stored[0].stimulus_version_id])).rows[0];
      assert.equal(stimulus.content[0].text.startsWith('Nhiều người cho rằng'), true);
      assert.equal(stimulus.content[1].type, 'image');
      assert.deepEqual([stimulus.assets, stimulus.sources], [1, 1]);
    } finally { await database.stop(); }
    assert.equal((await counts(dataDirectory)).versions, before.versions + 2);

    assert.deepEqual((await importQuestions({ ...options, document })).plan.items.map((item) => item.action), ['SKIP', 'SKIP'], 'a repeat creates neither questions nor a second stimulus');
    const changed = await passageSet();
    changed.passages[0].content_blocks[0].content += ' Bổ sung một câu mới.';
    assert.deepEqual([...new Set((await importQuestions({ ...options, document: changed })).plan.problems.map((problem) => problem.code))], ['CONTENT_VERSION_CONFLICT'],
      'the same content_version with a different passage is a conflict, not a silent skip');
    const verified = await startPersistentPostgres(dataDirectory);
    try {
      assert.equal((await verified.ownerPool.query('SELECT count(*)::int AS n FROM tsa.stimulus_versions')).rows[0].n, 1, 'one stimulus for the whole run');
    } finally { await verified.stop(); }
  });
});


test('owner publication includes exchange drafts and inspects question, option and passage images', { timeout: 600_000 }, async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-exchange-publication-'));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { dataDirectory, sourceVersionId, codes } = await buildWorkspace(directory, 'Corpus exchange publication fixture');
  const imageStoreDirectory = path.join(directory, 'objects');
  let database;
  const document = await example('reading-passage.json');
  document.batch_id = 'OWNER-EXCHANGE-001';
  document.passages[0].content_blocks.push({ type: 'image', asset_id: codes[0], alt: 'Passage figure' });
  document.passages[0].asset_refs = [codes[0]];
  document.questions.forEach((q, index) => { q.subject = 'MATH'; q.topic = 'ALGEBRA'; q.question_id = `MATH-PUBLISH-00000${2 - index}`; });
  const images = await buildSet(codes);
  for (const question of images.questions) {
    if (!question.asset_refs.includes(codes[0])) {
      question.content_blocks.push({ type: 'image', asset_id: codes[0], alt: 'Question figure' });
      question.asset_refs.push(codes[0]);
    }
  }
  const optionOnly = images.questions.find(q => q.question_id === 'MATH-GEO-000008');
  optionOnly.options[0].content_blocks.push(...optionOnly.content_blocks.filter(b => b.type === 'image'));
  optionOnly.content_blocks = optionOnly.content_blocks.filter(b => b.type !== 'image');
  document.questions.push(...images.questions);
  const applied = await importQuestions({ dataDirectory, sourceVersionId, topicMap: { PROBABILITY: 'ALGEBRA' }, document, confirm: `IMPORT ${document.questions.length}`, log: silent });
  assert.equal(applied.imported, document.questions.length, JSON.stringify(applied.plan?.problems));
  database = await startPersistentPostgres(dataDirectory);
  let ids, before, passageIds;
  try {
    const candidates = (await listOwnerCandidates(database.ownerPool)).versions;
    ids = candidates.map(v => v.id);
    passageIds = candidates.map(v => v.stimulusVersionId).filter(Boolean);
    assert.equal(ids.length, document.questions.length, 'receipt-backed MANUAL drafts are owner candidates');
    before = (await database.ownerPool.query('SELECT question_version_id, answer_key FROM tsa_private.question_secrets ORDER BY question_version_id')).rows;
  } finally { await database.stop(); }
  const imageStore = await createLocalImageStore({ rootDirectory: imageStoreDirectory, enabled: true, env });
  const emptyStore = await createLocalImageStore({ rootDirectory: path.join(directory, 'empty-objects'), enabled: true, env });
  for (const store of [null, emptyStore]) {
    const runtime = await createTrackBRuntime({ env, dataDirectory, imageStore: store, port: 0 });
    try {
      const author = await session(runtime.origin, 'author');
      await assert.rejects(author(`/api/v1/question-versions/${applied.created[0].versionId}/submit-review`, { expectedRevision: 1 }),
        /422 (VALIDATION_ERROR|ASSET_SANITIZATION_REQUIRED)/, 'disabled or missing image bytes cannot be submitted');
    } finally { await runtime.close(); }
  }
  const runtime = await createTrackBRuntime({ env, dataDirectory, imageStore, port: 0 });
  try {
    const author = await session(runtime.origin, 'author');
    await author(`/api/v1/question-versions/${applied.created[0].versionId}/submit-review`, { expectedRevision: 1 });
  } finally { await runtime.close(); }
  database = await startPersistentPostgres(dataDirectory);
  try {
    await ownerConfirmSingleton(database.ownerPool, applied.created[0].versionId);
    await assert.rejects(ownerApprove(database.ownerPool, applied.created[0].versionId, { imageStore: emptyStore }),
      error => error.code === 'ASSET_SANITIZATION_REQUIRED');
  } finally { await database.stop(); }
  const dry = await ownerPublish({ dataDirectory, imageStoreDirectory, log: silent });
  assert.deepEqual(dry, { published: 0, phrase: `PUBLISH ${ids.length} ALL` });
  await assert.rejects(ownerPublish({ dataDirectory, imageStoreDirectory, confirm: 'PUBLISH 999 ALL', log: silent }), /Confirmation does not match/);
  const result = await ownerPublish({ dataDirectory, imageStoreDirectory, confirm: dry.phrase, log: silent });
  assert.equal(result.published, ids.length);
  database = await startPersistentPostgres(dataDirectory);
  try {
    await database.ownerPool.query("SELECT set_config('tsa.enable_numeric_practice','true',false), set_config('tsa.enable_cloze_matching','true',false)");
    const rows = (await database.ownerPool.query(`SELECT w.state, tsa.bank_question_selection_allowed(v.id) AS selectable
      FROM tsa.question_versions v JOIN tsa.question_workflow w ON w.question_version_id=v.id WHERE v.id=ANY($1)`, [ids])).rows;
    assert.ok(rows.every(r => r.state === 'APPROVED' && r.selectable));
    const bundled = (await database.ownerPool.query(`SELECT r.exchange_question_id FROM tsa.bundle_members bm
      JOIN tsa_private.exchange_import_receipts r ON r.question_version_id=bm.question_version_id ORDER BY bm.ordinal`)).rows;
    assert.deepEqual(bundled.map(r => r.exchange_question_id), ['MATH-PUBLISH-000001', 'MATH-PUBLISH-000002']);
    assert.equal(await createPassageBundles(database.ownerPool, passageIds), 0, 'existing bundles are not duplicated');
    const profiles = (await database.ownerPool.query('SELECT profile FROM tsa_private.question_delivery_checks WHERE question_version_id=ANY($1)', [ids])).rows;
    assert.equal(profiles.length, ids.length);
    assert.ok(profiles.every(row => row.profile.includes('inspected-image')), 'every image draft uses the inspected delivery profile');
    assert.deepEqual((await database.ownerPool.query('SELECT question_version_id, answer_key FROM tsa_private.question_secrets ORDER BY question_version_id')).rows, before);
  } finally { await database.stop(); }
});
