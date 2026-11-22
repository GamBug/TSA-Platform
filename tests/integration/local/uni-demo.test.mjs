import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildRehearsalSource } from '../../../scripts/uni-demo-rehearsal-source.mjs';
import { formatDemoSummary } from '../../../scripts/start-uni-demo.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { bootstrapLocalSyntheticIdentity } from '../../../src/modules/identity/local-synthetic.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { createImageFixture } from '../student-runtime/image-fixture.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { buildDemoNotice, startUniDemo } from '../../../src/local/uni-demo.mjs';
import { bankRequest, loginActor } from '../bank/harness.mjs';

const absent = (target) => assert.rejects(access(target), (error) => error.code === 'ENOENT');
const json = async (response, status = 200) => {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
};

test('the demo serves only published versions of its source Bank and removes its copy on close', { timeout: 120_000 }, async (t) => {
  const source = await buildRehearsalSource({ counts: { MATH: 40, READING: 20, SCIENCE: 39 }, queue: { inReview: 2, draft: 1 } });
  t.after(() => source.close());
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: source });
  let closed = false;
  t.after(async () => { if (!closed) await demo.close(); });
  const { report } = demo;

  assert.deepEqual(report.published, { MATH: 40, READING: 20, SCIENCE: 39 });
  assert.deepEqual(report.approved, { MATH: 40, READING: 20, SCIENCE: 39 });
  assert.deepEqual(report.workflow.filter((row) => row.state !== 'APPROVED'),
    [{ section: 'MATH', state: 'DRAFT', count: 1 }, { section: 'MATH', state: 'IN_REVIEW', count: 2 }]);
  assert.equal(report.fullSimulation.offered, false);
  assert.equal(report.fullSimulation.withoutRepeats, 0);
  assert.deepEqual(report.fullSimulation.shortages.map((shortage) => [shortage.section, shortage.required - shortage.available]), [['SCIENCE', 1]]);
  // Each section test needs the real section length, so 39 Science items offer no Science test.
  assert.deepEqual(report.offerings.map((offering) => [offering.kind, offering.section]),
    [['SECTION_PRACTICE', 'MATH'], ['SECTION_PRACTICE', 'READING']]);
  // The source carried its own offering; the demo replaces it with stock-derived ones.
  assert.equal(report.inheritedOfferingsDisabled >= 1, true);
  const summary = formatDemoSummary(demo);
  assert.match(summary, /Content mode: REHEARSAL/);
  assert.match(summary, /Full simulation: NOT offered — short by Science 1\./);

  const notice = await json(await fetch(`${demo.origin}/local/demo-notice`));
  assert.equal(notice.contentMode, 'REHEARSAL');
  assert.equal((await fetch(`${demo.origin}/local/demo-notice`, { method: 'POST' })).status, 405);

  const student = await loginActor(demo, 'studentA');
  const catalog = await json(await bankRequest(demo, student, '/api/v1/catalog', { query: 'limit=100' }));
  assert.deepEqual(catalog.items.map((item) => [item.domain, item.questionCount, item.blueprintVersionId]).sort(),
    report.offerings.map((offering) => [offering.section, offering.section === 'READING' ? 20 : 40, offering.blueprintVersionId]).sort());
  assert.deepEqual((await json(await bankRequest(demo, student, '/api/v3/catalog', { query: 'limit=100' }))).items, []);
  const topics = await json(await bankRequest(demo, student, '/api/v1/topics'));
  // The empty local authoring taxonomy is also listed; only published topics carry stock.
  assert.deepEqual(topics.groups.filter((group) => group.eligibleCount > 0).map((group) => [group.code, group.eligibleCount]),
    [['MATH', 40], ['READING', 20], ['SCIENCE', 39]]);

  const math = report.offerings.find((offering) => offering.section === 'MATH');
  const receipt = await json(await bankRequest(demo, student, '/api/v1/attempts', {
    method: 'POST', key: randomUUID(), body: { blueprintVersionId: math.blueprintVersionId } }), 201);
  await json(await bankRequest(demo, student, `/api/v1/attempts/${receipt.attemptId}/start`, { method: 'POST', key: randomUUID(), body: {} }));
  const view = await json(await bankRequest(demo, student, `/api/v1/attempts/${receipt.attemptId}`));
  // A section test has the real section length and time.
  assert.equal(view.slots.length, 40);
  assert.equal(Date.parse(view.deadlineAt) - Date.parse(view.startedAt), 3_600_000);
  for (const slot of view.slots) {
    const text = slot.content.map((block) => block.text ?? '').join(' ');
    assert.match(text, /^Câu diễn tập Toán học số \d+ /, 'only published rehearsal items are delivered');
  }
  // A twenty-question Reading section test is not mistaken for the Reading experiment profile.
  const reading = report.offerings.find((offering) => offering.section === 'READING');
  const otherStudent = await loginActor(demo, 'studentB');
  const readingReceipt = await json(await bankRequest(demo, otherStudent, '/api/v1/attempts', {
    method: 'POST', key: randomUUID(), body: { blueprintVersionId: reading.blueprintVersionId } }), 201);
  await json(await bankRequest(demo, otherStudent, `/api/v1/attempts/${readingReceipt.attemptId}/start`, { method: 'POST', key: randomUUID(), body: {} }));
  const readingView = await json(await bankRequest(demo, otherStudent, `/api/v1/attempts/${readingReceipt.attemptId}`));
  assert.equal(readingView.slots.length, 20);
  assert.equal(Date.parse(readingView.deadlineAt) - Date.parse(readingView.startedAt), 1_800_000);

  await demo.close();
  closed = true;
  await absent(demo.demoDirectory);
  await assert.rejects(fetch(`${demo.origin}/local/demo-notice`), 'the HTTP server is stopped');
});

test('published mode backs up the private Bank, leaves it unchanged and reports an empty stock honestly', { timeout: 120_000 }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-uni-demo-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDirectory = path.join(root, 'track-b');
  const inspect = async () => {
    const database = await startPersistentPostgres(dataDirectory);
    try {
      return (await database.ownerPool.query(`SELECT
        (SELECT count(*)::integer FROM tsa_meta.schema_migrations) AS migrations,
        (SELECT count(*)::integer FROM tsa.blueprint_versions) AS blueprints,
        (SELECT count(*)::integer FROM tsa.attempts) AS attempts,
        (SELECT count(*)::integer FROM pg_roles WHERE rolname LIKE 'tsa_track_b_%') AS runtime_roles`)).rows[0];
    } finally { await database.stop(); }
  };
  const prepared = await startPersistentPostgres(dataDirectory);
  try {
    await migrate(prepared.ownerPool);
    await bootstrapLocalSyntheticIdentity(prepared.ownerPool, { env: {
      NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:1' } });
  } finally { await prepared.stop(); }
  const before = await inspect();

  const demo = await startUniDemo({ mode: 'PUBLISHED', port: 0, sourceDataDirectory: dataDirectory, sourceCredit: undefined });
  let closed = false;
  t.after(async () => { if (!closed) await demo.close(); });
  assert.equal(path.dirname(path.dirname(demo.sourceBackup)), `${dataDirectory}-backups`);
  await access(demo.sourceBackup);
  assert.deepEqual(demo.report.published, { MATH: 0, READING: 0, SCIENCE: 0 });
  assert.deepEqual(demo.report.offerings, []);
  assert.equal(demo.report.fullSimulation.withoutRepeats, 0);
  assert.equal(demo.report.topicPractice.available, false);
  assert.deepEqual(demo.notice, { schemaVersion: 'demo-notice/1', contentMode: 'PUBLISHED', sourceCredit: {
    vi: 'Chưa có câu hỏi nào được phê duyệt và xuất bản.', en: 'No question has been approved and published yet.' } });
  const summary = formatDemoSummary(demo);
  assert.match(summary, /Content mode: PUBLISHED/);
  assert.match(summary, /Full simulations without repeats per student: 0\n/);
  assert.match(summary, /Synthetic items are never substituted\./);

  const student = await loginActor(demo, 'studentA');
  assert.deepEqual((await json(await bankRequest(demo, student, '/api/v1/catalog', { query: 'limit=100' }))).items, []);
  assert.deepEqual((await json(await bankRequest(demo, student, '/api/v3/catalog', { query: 'limit=100' }))).items, []);
  const staff = await loginActor(demo, 'bankManager');
  await json(await bankRequest(demo, staff, '/api/v1/questions', { query: 'limit=20' }));

  await demo.close();
  closed = true;
  await absent(demo.demoDirectory);
  assert.deepEqual(await inspect(), before, 'the private Bank keeps its schema, roles and data');
});

test('published mode refuses a missing private Bank instead of creating or substituting one', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-uni-demo-missing-'));
  try {
    const missing = path.join(root, 'track-b');
    await assert.rejects(startUniDemo({ mode: 'PUBLISHED', port: 0, sourceDataDirectory: missing }), /No private Bank data was found/);
    await absent(missing);
    // An empty folder (for example an unmounted drive) is never initialized as a new cluster.
    await mkdir(missing, { mode: 0o700 });
    await assert.rejects(startUniDemo({ mode: 'PUBLISHED', port: 0, sourceDataDirectory: missing }), /No private Bank data was found/);
    assert.deepEqual(await readdir(missing), []);
    await assert.rejects(startUniDemo({ mode: 'PUBLISHED', port: 0, sourceDataDirectory: missing, sourceArchive: {} }), TypeError);
    await assert.rejects(startUniDemo({ mode: 'REHEARSAL', port: 0 }), TypeError);
    await assert.rejects(startUniDemo({ mode: 'SYNTHETIC', port: 0 }), TypeError);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('published items require the owner source credit before the demo may start', () => {
  const report = { published: { MATH: 1, READING: 0, SCIENCE: 0 } };
  assert.throws(() => buildDemoNotice({ mode: 'PUBLISHED', report, sourceCredit: undefined }), /DEMO_UNI_SOURCE_CREDIT/);
  assert.throws(() => buildDemoNotice({ mode: 'PUBLISHED', report, sourceCredit: '   ' }), /DEMO_UNI_SOURCE_CREDIT/);
  assert.throws(() => buildDemoNotice({ mode: 'PUBLISHED', report, sourceCredit: 'line one\nline two' }), /DEMO_UNI_SOURCE_CREDIT/);
  assert.throws(() => buildDemoNotice({ mode: 'PUBLISHED', report, sourceCredit: 'x'.repeat(501) }), /DEMO_UNI_SOURCE_CREDIT/);
  assert.deepEqual(buildDemoNotice({ mode: 'PUBLISHED', report, sourceCredit: '  Nguồn: bộ đề mẫu  ' }).sourceCredit,
    { vi: 'Nguồn: bộ đề mẫu', en: 'Nguồn: bộ đề mẫu' });
  // Rehearsal content is never credited to the corpus, whatever the environment says.
  assert.match(buildDemoNotice({ mode: 'REHEARSAL', report, sourceCredit: 'ignored' }).sourceCredit.en, /synthetic/);
});

test('published numeric-answer items get their own practice, delivered and graded through the numeric routes', { timeout: 120_000 }, async (t) => {
  const source = await buildRehearsalSource({ counts: { MATH: 40, READING: 0, SCIENCE: 0 }, queue: { inReview: 0, draft: 0 }, numeric: 5 });
  t.after(() => source.close());
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: source });
  t.after(() => demo.close());
  const { report } = demo;
  assert.deepEqual(report.published, { MATH: 45, READING: 0, SCIENCE: 0 });
  assert.deepEqual(report.numericStock, { MATH: 5, READING: 0, SCIENCE: 0 });
  assert.deepEqual(report.otherProtocols, { MATH: 0, READING: 0, SCIENCE: 0 });
  assert.deepEqual(report.offerings.map((offering) => [offering.kind, offering.section]),
    [['SECTION_PRACTICE', 'MATH'], ['NUMERIC_PRACTICE', 'MATH']]);
  assert.match(formatDemoSummary(demo), /Numeric practice: Mathematics offered \(5\/4\)/);
  assert.match(demo.urls.numeric, /\/student\/\?mode=numeric$/);
  // The retired student UI links open the matching React student app mode.
  const legacy = await fetch(`${demo.origin}/?student=postgres-v2`, { redirect: 'manual' });
  assert.equal(legacy.status, 303);
  assert.equal(legacy.headers.get('location'), '/student/?mode=numeric');
  // The old staff workspace is not offered: the bare origin opens the student app (owner decision 2026-11-22).
  const home = await fetch(`${demo.origin}/`, { redirect: 'manual' });
  assert.equal(home.status, 303);
  assert.equal(home.headers.get('location'), '/student/');

  const student = await loginActor(demo, 'studentA');
  const numericOffering = report.offerings.find((offering) => offering.kind === 'NUMERIC_PRACTICE');
  const choiceOffering = report.offerings.find((offering) => offering.kind === 'SECTION_PRACTICE');
  const numericCatalog = await json(await bankRequest(demo, student, '/api/v2/catalog', { query: 'limit=100' }));
  assert.deepEqual(numericCatalog.items.map((item) => item.blueprintVersionId), [numericOffering.blueprintVersionId]);
  const choiceCatalog = await json(await bankRequest(demo, student, '/api/v1/catalog', { query: 'limit=100' }));
  assert.deepEqual(choiceCatalog.items.map((item) => item.blueprintVersionId), [choiceOffering.blueprintVersionId]);

  const receipt = await json(await bankRequest(demo, student, '/api/v2/attempts', {
    method: 'POST', key: randomUUID(), body: { blueprintVersionId: numericOffering.blueprintVersionId } }), 201);
  await json(await bankRequest(demo, student, `/api/v2/attempts/${receipt.attemptId}/start`, { method: 'POST', key: randomUUID(), body: {} }));
  const view = await json(await bankRequest(demo, student, `/api/v2/attempts/${receipt.attemptId}`));
  assert.equal(view.slots.length, 4);
  assert.doesNotMatch(JSON.stringify(view), /answerKey|correctAnswer/);
  for (const slot of view.slots) {
    assert.equal(slot.interaction.type, 'NUMERIC_RESPONSE');
    const text = slot.content.map((block) => block.text ?? '').join(' ');
    assert.match(text, /^Câu diễn tập trả lời số \d+ /, 'only published numeric rehearsal items are delivered');
    // The rehearsal text names its own answer; a real item never does.
    const value = /nêu số (\S+?)\.(?:\s|$)/u.exec(text)?.[1];
    assert.ok(value, text);
    await json(await bankRequest(demo, student, `/api/v2/attempts/${receipt.attemptId}/answers/${slot.slotId}`, {
      method: 'PUT', key: randomUUID(), body: { expectedRevision: 0, value: { type: 'NUMERIC_RESPONSE', value } } }));
  }
  await json(await bankRequest(demo, student, `/api/v2/attempts/${receipt.attemptId}/submit`, { method: 'POST', key: randomUUID(), body: {} }));
  let result;
  for (const until = Date.now() + 10_000; Date.now() < until;) {
    const response = await bankRequest(demo, student, `/api/v2/attempts/${receipt.attemptId}/result`);
    if (response.status === 200) { result = await response.json(); break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(result, 'the numeric attempt is graded');
  assert.equal(result.policyVersion, 'practice-binary-v2');
  assert.equal(result.correctCount, 4);
});


test('the demo delivers private library images to the owning student and guards explanation release', { timeout: 120_000 }, async (t) => {
  const fixture = await createImageFixture(t);
  await fixture.approveImage({ total: 40 });
  const sourceArchive = await backupLocalDatabase({ connectionConfig: fixture.harness.database.connectionConfig,
    directory: path.join(fixture.directory, 'archive') });
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive,
    imageStoreDirectory: path.join(fixture.directory, 'objects') });
  t.after(() => demo.close());
  const student = await loginActor(demo, 'studentA');
  const other = await loginActor(demo, 'studentB');
  const catalog = await json(await bankRequest(demo, student, '/api/v1/catalog', { query: 'limit=100' }));
  const receipt = await json(await bankRequest(demo, student, '/api/v1/attempts', {
    method: 'POST', key: randomUUID(), body: { blueprintVersionId: catalog.items[0].blueprintVersionId } }), 201);
  await json(await bankRequest(demo, student, `/api/v1/attempts/${receipt.attemptId}/start`, { method: 'POST', key: randomUUID(), body: {} }));
  const route = `/api/v1/attempts/${receipt.attemptId}/assets/`;
  const question = await bankRequest(demo, student, `${route}${fixture.assets.QUESTION.id}`, { query: 'purpose=question' });
  assert.equal(question.status, 200, await question.clone().text());
  assert.equal(question.headers.get('content-type'), 'image/png');
  assert.equal(question.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await question.arrayBuffer()), fixture.assets.QUESTION.bytes);
  assert.equal((await bankRequest(demo, other, `${route}${fixture.assets.QUESTION.id}`, { query: 'purpose=question' })).status, 404);
  assert.equal((await bankRequest(demo, student, `${route}${fixture.assets.EXPLANATION.id}`, { query: 'purpose=explanation' })).status, 404);
  await json(await bankRequest(demo, student, `/api/v1/attempts/${receipt.attemptId}/submit`, { method: 'POST', key: randomUUID(), body: {} }));
  let result;
  for (let tries = 0; tries < 100; tries += 1) {
    const response = await bankRequest(demo, student, `/api/v1/attempts/${receipt.attemptId}/result`);
    if (response.status === 200) { result = await response.json(); break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(result, 'grading releases the result');
  const explanation = await bankRequest(demo, student, `${route}${fixture.assets.EXPLANATION.id}`, { query: 'purpose=explanation' });
  assert.equal(explanation.status, 200);
  assert.deepEqual(Buffer.from(await explanation.arrayBuffer()), fixture.assets.EXPLANATION.bytes);
  const missing = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive,
    imageStoreDirectory: path.join(fixture.directory, 'no-image-store') });
  t.after(() => missing.close());
  const missingStudent = await loginActor(missing, 'studentA');
  const missingCatalog = await json(await bankRequest(missing, missingStudent, '/api/v1/catalog', { query: 'limit=100' }));
  const missingReceipt = await json(await bankRequest(missing, missingStudent, '/api/v1/attempts', {
    method: 'POST', key: randomUUID(), body: { blueprintVersionId: missingCatalog.items[0].blueprintVersionId } }), 201);
  await json(await bankRequest(missing, missingStudent, `/api/v1/attempts/${missingReceipt.attemptId}/start`, {
    method: 'POST', key: randomUUID(), body: {} }));
  assert.equal((await bankRequest(missing, missingStudent, `/api/v1/attempts/${missingReceipt.attemptId}/assets/${fixture.assets.QUESTION.id}`,
    { query: 'purpose=question' })).status, 404, 'a real owned attempt still cannot read images without a store');
  await absent(path.join(fixture.directory, 'no-image-store'));
});
