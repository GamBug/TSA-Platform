import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { bankRequest } from './harness.mjs';
import { createPrivateTemplate } from '../../../src/local/seed.mjs';
import { createLocalImageStore } from '../../../src/modules/media/local-image-store.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import {
  activeAssetCodes, describeImage, ensureAssetVersion, getImageAsset, ImageLibraryError, imageAssetReferences, listImageAssets,
  missingImageAssets, readImageAsset, registerImage, retireImageAsset, sniffMediaType,
} from '../../../src/modules/bank/image-library.mjs';

const RUBRIC = Object.fromEntries(['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'].map((key) => [key, true]));
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error instanceof ImageLibraryError && error.code === code, code);
const png = (color, width = 64, height = 48) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

async function createLibraryFixture(t) {
  const f = await createAllocationFixture({ questionCount: 0, blueprintCount: 4 });
  const directory = await mkdtemp(join(tmpdir(), 'tsa-image-library-'));
  const closeDatabase = f.close;
  f.close = async () => { try { await closeDatabase(); } finally { await rm(directory, { recursive: true, force: true }); } };
  t.after(() => f.close());
  const rootDirectory = join(directory, 'objects');
  f.imageStore = await createLocalImageStore({ rootDirectory, enabled: true, env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' } });
  f.rootDirectory = rootDirectory;
  f.directory = directory;
  f.workflow = await createPublicationService({ bankPool: f.bankPool, identityService: f.identityService,
    fixtureScopeId: f.fixtureScopeId, imageStore: f.imageStore });
  const template = createPrivateTemplate(f.source);
  f.draftWith = async (stem, { question = [], explanation = [] } = {}) => {
    const draft = {
      schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH', taxonomyVersionId: template.taxonomyVersionId,
      domainId: template.domainId, skillIds: template.skillIds, subskillIds: [], cognitiveLevel: null, targetDifficulty: 'EASY',
      content: [{ type: 'text', text: stem }, ...question.map((id) => ({ type: 'image', assetVersionId: id, alt: 'Hình minh hoạ tổng hợp.' }))],
      interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b'].map((id) => ({ id, content: [{ type: 'text', text: id.toUpperCase() }] })) },
      answerKey: { type: 'SINGLE_CHOICE', optionId: 'a' },
      explanation: [{ type: 'text', text: 'Lời giải tổng hợp.' }, ...explanation.map((id) => ({ type: 'image', assetVersionId: id, alt: 'Hình trong lời giải.' }))],
      stimulusVersionId: null, evidenceRefs: template.evidenceRefs, origin: 'MANUAL', provenance: template.provenance,
    };
    const response = await bankRequest(f.harness, f.browsers.author, '/api/v1/questions', { method: 'POST', key: randomUUID(), body: draft });
    const created = await response.json();
    assert.equal(response.status, 201, JSON.stringify(created));
    return created;
  };
  f.approve = async (created) => {
    await f.workflow.submitReview(f.principals.author, created.versionId, randomUUID(), { expectedRevision: 1 });
    await f.workflow.confirmSingleton(f.principals.reviewer, created.versionId, randomUUID(), {
      expectedRevision: 2, contentHash: created.contentHash, reason: 'Synthetic image library singleton.' });
    await f.workflow.review(f.principals.reviewer, created.versionId, randomUUID(), {
      expectedRevision: 2, contentHash: created.contentHash, decision: 'APPROVE', rubric: RUBRIC,
      reason: 'Synthetic technical verification only, no human publication approval.' });
  };
  return f;
}

const register = (f, bytes, overrides = {}) => registerImage(f.pool, f.imageStore, {
  bytes, area: 'GEO', alt: 'Hình minh hoạ tổng hợp', sourceVersionId: f.source.sourceVersionId, ...overrides });

test('registration assigns stable codes per area, records dimensions and deduplicates identical pictures only', { timeout: 120_000 }, async (t) => {
  const f = await createLibraryFixture(t);
  const red = await png('#84292b');
  const first = await register(f, red, { title: 'Hình đỏ' });
  assert.equal(first.created, true);
  assert.equal(first.assetCode, 'IMG-GEO-000001');
  assert.deepEqual([first.mediaType, first.width, first.height, first.status, first.title], ['image/png', 64, 48, 'ACTIVE', 'Hình đỏ']);
  assert.match(first.contentHash, /^sha256:[0-9a-f]{64}$/);

  const again = await register(f, red, { area: 'ALG', alt: 'Different alt', title: 'Other' });
  assert.deepEqual([again.created, again.duplicateOf, again.assetCode], [false, 'IMG-GEO-000001', 'IMG-GEO-000001']);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.asset_versions')).rows[0].n, 1, 'no second asset version for the same bytes');
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.image_asset_counters')).rows[0].n, 1, 'a duplicate consumes no number');

  const other = await register(f, await png('#254e62'));
  assert.equal(other.assetCode, 'IMG-GEO-000002');
  const algebra = await register(f, await png('#2f6b3a'), { area: 'ALG' });
  assert.equal(algebra.assetCode, 'IMG-ALG-000001');

  // The same picture saved as another file (other compression, WebP, an alpha channel) is the same image.
  const reencoded = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#84292b' } }).png({ compressionLevel: 0 }).toBuffer();
  assert.notEqual(reencoded.toString('hex'), red.toString('hex'));
  const lossless = await sharp(red).ensureAlpha().webp({ lossless: true }).toBuffer();
  for (const copy of [reencoded, lossless]) {
    const twin = await register(f, copy);
    assert.deepEqual([twin.created, twin.duplicateOf], [false, 'IMG-GEO-000001']);
  }
  // A picture that differs in a single pixel is a different image, however similar it looks.
  const raw = await sharp(red).raw().toBuffer({ resolveWithObject: true });
  raw.data[0] ^= 1;
  const onePixel = await sharp(raw.data, { raw: raw.info }).png().toBuffer();
  assert.equal((await register(f, onePixel)).created, true);

  assert.deepEqual((await listImageAssets(f.pool)).map((asset) => asset.assetCode), ['IMG-ALG-000001', 'IMG-GEO-000001', 'IMG-GEO-000002', 'IMG-GEO-000003']);
  assert.deepEqual(await activeAssetCodes(f.pool), ['IMG-ALG-000001', 'IMG-GEO-000001', 'IMG-GEO-000002', 'IMG-GEO-000003']);
  const stored = await getImageAsset(f.pool, 'IMG-GEO-000001');
  assert.deepEqual(Object.keys(stored.versions), ['QUESTION']);
  const inspected = (await f.pool.query('SELECT tsa.bank_asset_inspected($1) AS ok', [stored.versions.QUESTION])).rows[0].ok;
  assert.equal(inspected, true, 'the registered asset is already inspected for delivery');
});

test('registration refuses unsupported, corrupt, oversized and incomplete input before writing anything', { timeout: 120_000 }, async (t) => {
  const f = await createLibraryFixture(t);
  const before = async () => JSON.stringify((await f.pool.query(`SELECT (SELECT count(*) FROM tsa.asset_versions) AS a, (SELECT count(*) FROM tsa.image_assets) AS b`)).rows);
  const snapshot = await before();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  await rejectsWith(register(f, svg), 'IMAGE_NOT_SUPPORTED');
  await rejectsWith(register(f, Buffer.from('not an image at all')), 'IMAGE_NOT_SUPPORTED');
  await rejectsWith(register(f, Buffer.alloc(0)), 'IMAGE_NOT_SUPPORTED');
  const truncated = (await png('#000000')).subarray(0, 40);
  await rejectsWith(register(f, truncated), 'IMAGE_NOT_SUPPORTED');
  await rejectsWith(register(f, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3 * 1024 * 1024)])), 'IMAGE_NOT_SUPPORTED');
  await rejectsWith(register(f, await png('#111111'), { area: 'geo' }), 'ASSET_AREA_INVALID');
  await rejectsWith(register(f, await png('#111111'), { alt: '  ' }), 'ASSET_ALT_REQUIRED');
  await rejectsWith(register(f, await png('#111111'), { sourceVersionId: 'not-a-uuid' }), 'SOURCE_VERSION_REQUIRED');
  await rejectsWith(register(f, await png('#111111'), { sourceVersionId: randomUUID() }), 'SOURCE_VERSION_NOT_FOUND');
  await rejectsWith(registerImage(f.pool, await createLocalImageStore({ enabled: false }), { bytes: await png('#111111'), area: 'GEO', alt: 'x', sourceVersionId: f.source.sourceVersionId }), 'IMAGE_STORE_DISABLED');
  assert.equal(await before(), snapshot, 'rejected input leaves no asset rows');
  assert.equal(sniffMediaType(await png('#fff')), 'image/png');
  assert.equal(sniffMediaType(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer()), 'image/jpeg');
  assert.equal(sniffMediaType(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).webp().toBuffer()), 'image/webp');
  assert.equal((await describeImage(await png('#abcdef', 30, 20))).receipt.width, 30);
});

test('one asset serves many questions and several assets serve one; in-use assets cannot be retired or deleted', { timeout: 180_000 }, async (t) => {
  const f = await createLibraryFixture(t);
  const shared = await register(f, await png('#84292b'));
  const second = await register(f, await png('#254e62'));
  const spare = await register(f, await png('#2f6b3a'));
  const sharedId = (await getImageAsset(f.pool, shared.assetCode)).versions.QUESTION;
  const secondId = (await getImageAsset(f.pool, second.assetCode)).versions.QUESTION;

  const one = await f.draftWith('Câu hỏi thứ nhất dùng hình chung.', { question: [sharedId] });
  const two = await f.draftWith('Câu hỏi thứ hai dùng cùng hình chung.', { question: [sharedId] });
  const three = await f.draftWith('Câu hỏi thứ ba dùng hai hình.', { question: [sharedId, secondId] });
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.asset_versions WHERE id = $1', [sharedId])).rows[0].n, 1);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.question_assets WHERE asset_version_id = $1', [sharedId])).rows[0].n, 3, 'many questions reference one stored image');
  assert.deepEqual((await imageAssetReferences(f.pool, shared.assetCode)).map((reference) => [reference.questionVersionId, reference.state]).sort(),
    [one, two, three].map((created) => [created.versionId, 'DRAFT']).sort());
  assert.equal((await imageAssetReferences(f.pool, second.assetCode)).length, 1);

  // Drafts already count as active, so retirement is refused before any approval.
  await rejectsWith(retireImageAsset(f.pool, shared.assetCode), 'ASSET_IN_USE');
  await assert.rejects(f.pool.query(`UPDATE tsa.image_assets SET status = 'RETIRED', retired_at = clock_timestamp() WHERE asset_code = $1`, [shared.assetCode]),
    /still used by an active question/);
  await assert.rejects(f.pool.query('DELETE FROM tsa.image_assets WHERE asset_code = $1', [shared.assetCode]), /never deleted/);
  await assert.rejects(f.pool.query('DELETE FROM tsa.asset_versions WHERE id = $1', [sharedId]), /Immutable|violates foreign key/);
  await assert.rejects(f.pool.query(`UPDATE tsa.image_assets SET title = 'renamed' WHERE asset_code = $1`, [spare.assetCode]), /immutable except retirement/);

  await f.approve(one);
  await rejectsWith(retireImageAsset(f.pool, shared.assetCode), 'ASSET_IN_USE');

  // An unused asset retires; retired assets stay resolvable but cannot enter new questions.
  const retired = await retireImageAsset(f.pool, spare.assetCode);
  assert.deepEqual([retired.changed, retired.status], [true, 'RETIRED']);
  assert.equal((await retireImageAsset(f.pool, spare.assetCode)).changed, false, 'retiring twice is harmless');
  await rejectsWith(ensureAssetVersion(f.pool, spare.assetCode, 'QUESTION'), 'ASSET_RETIRED');
  assert.deepEqual(await missingImageAssets(f.pool, [shared.assetCode, spare.assetCode, 'IMG-GEO-999999']), { unknown: ['IMG-GEO-999999'], retired: [spare.assetCode] });
  assert.ok(!(await activeAssetCodes(f.pool)).includes(spare.assetCode));
  await rejectsWith(getImageAsset(f.pool, 'IMG-GEO-999999'), 'ASSET_NOT_FOUND');
  await rejectsWith(getImageAsset(f.pool, 'not-a-code'), 'ASSET_CODE_INVALID');
});

test('explanation images use a separate asset version of the same file, created once, and pass the Bank checks', { timeout: 180_000 }, async (t) => {
  const f = await createLibraryFixture(t);
  const asset = await register(f, await png('#254e62'));
  const questionId = (await getImageAsset(f.pool, asset.assetCode)).versions.QUESTION;
  assert.equal(await ensureAssetVersion(f.pool, asset.assetCode, 'QUESTION'), questionId);
  const explanationId = await ensureAssetVersion(f.pool, asset.assetCode, 'EXPLANATION');
  assert.notEqual(explanationId, questionId);
  assert.equal(await ensureAssetVersion(f.pool, asset.assetCode, 'EXPLANATION'), explanationId, 'the twin is created once');
  const rows = (await f.pool.query('SELECT id, content_hash, security_class::text AS class FROM tsa.asset_versions WHERE id = ANY($1) ORDER BY security_class', [[questionId, explanationId]])).rows;
  assert.deepEqual(rows.map((row) => row.class), ['QUESTION', 'EXPLANATION']);
  assert.equal(rows[0].content_hash, rows[1].content_hash, 'the same file bytes, not a second copy of the object');
  assert.equal((await f.pool.query('SELECT tsa.bank_asset_inspected($1) AS ok', [explanationId])).rows[0].ok, true);
  await rejectsWith(ensureAssetVersion(f.pool, asset.assetCode, 'SECRET'), 'ASSET_PURPOSE_INVALID');

  const created = await f.draftWith('Câu hỏi có hình trong cả đề và lời giải.', { question: [questionId], explanation: [explanationId] });
  await f.approve(created);
  const refs = await imageAssetReferences(f.pool, asset.assetCode);
  assert.deepEqual(refs.map((reference) => reference.state), ['APPROVED'], 'question and explanation references count once per question version');
  await rejectsWith(retireImageAsset(f.pool, asset.assetCode), 'ASSET_IN_USE');
});

test('stored bytes are retrieved by code and a missing or altered object fails in a controlled way', { timeout: 120_000 }, async (t) => {
  const f = await createLibraryFixture(t);
  const bytes = await png('#84292b');
  const asset = await register(f, bytes);
  const read = await readImageAsset(f.pool, f.imageStore, asset.assetCode);
  assert.equal(Buffer.compare(read.bytes, bytes), 0);
  assert.equal(read.asset.assetCode, asset.assetCode);
  const empty = await createLocalImageStore({ rootDirectory: join(f.directory, 'other-objects'), enabled: true, env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' } });
  await rejectsWith(readImageAsset(f.pool, empty, asset.assetCode), 'IMAGE_OBJECT_UNAVAILABLE');
  await rejectsWith(readImageAsset(f.pool, f.imageStore, 'IMG-GEO-424242'), 'ASSET_NOT_FOUND');
  await writeFile(join(f.directory, 'unused.txt'), 'x');
});
