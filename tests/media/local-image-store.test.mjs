import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { createLocalImageStore } from '../../src/modules/media/local-image-store.mjs';

const env = { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' };
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const make = (format) => sharp({ create: { width: 8, height: 9, channels: 3, background: '#8256af' } })[format]().toBuffer();

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'tsa-private-image-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const rootDirectory = join(directory, 'objects');
  const store = await createLocalImageStore({ rootDirectory, enabled: true, env });
  const pathFor = (hash) => join(rootDirectory, 'sha256', hash.slice(7, 9), hash.slice(7));
  return { directory, rootDirectory, store, pathFor };
}

test('local store is default-off and cannot create objects under public or symlinked roots', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'tsa-image-default-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const rootDirectory = join(directory, 'disabled');
  const disabled = await createLocalImageStore({ rootDirectory, env });
  assert.equal(disabled.status().enabled, false);
  await assert.rejects(disabled.inspectAndStore({}), /IMAGE_STORE_DISABLED/);
  await assert.rejects(stat(rootDirectory), { code: 'ENOENT' });
  await assert.rejects(createLocalImageStore({ rootDirectory: resolve('apps/practice-prototype/public/image-test-root'), enabled: true, env }));
  const real = join(directory, 'real'); await mkdir(real, { mode: 0o700 });
  await symlink(real, join(directory, 'alias'));
  await assert.rejects(createLocalImageStore({ rootDirectory: join(directory, 'alias', 'objects'), enabled: true, env }));
});

test('actual inspected PNG/JPEG/WebP bytes are stored privately by hash, read-only and exact on every read', async (t) => {
  const f = await fixture(t);
  for (const [format, mediaType] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp']]) {
    const bytes = await make(format), expected = Buffer.from(bytes), contentHash = digest(bytes);
    const receipt = await f.store.inspectAndStore({ bytes, contentHash, mediaType });
    assert.equal(receipt.width, 8); assert.equal(receipt.height, 9);
    assert.equal(receipt.contentHash, contentHash); assert.equal(receipt.byteSize, expected.length);
    assert.equal(receipt.profile, 'text-math-table-inspected-image/2');
    const info = await stat(f.pathFor(contentHash)); assert.equal(info.mode & 0o777, 0o400);
    assert.equal((await stat(f.rootDirectory)).mode & 0o077, 0);
    bytes.fill(0);
    const result = await f.store.read({ contentHash, mediaType, byteSize: expected.length });
    assert.deepEqual(result.bytes, expected);
    result.bytes.fill(0);
    assert.deepEqual((await f.store.read({ contentHash, mediaType, byteSize: expected.length })).bytes, expected);
  }
});

test('concurrent create-if-absent publishers preserve one complete object and never overwrite a corrupt winner', async (t) => {
  const f = await fixture(t), bytes = await make('png'), contentHash = digest(bytes);
  const input = { bytes, contentHash, mediaType: 'image/png' };
  const receipts = await Promise.all(Array.from({ length: 4 }, () => f.store.inspectAndStore(input)));
  assert.ok(receipts.every((receipt) => receipt.contentHash === contentHash));
  const object = f.pathFor(contentHash), directory = join(f.rootDirectory, 'sha256', contentHash.slice(7, 9));
  assert.deepEqual(await readdir(directory), [contentHash.slice(7)]);
  const before = (await stat(object)).ino;
  await f.store.inspectAndStore(input); assert.equal((await stat(object)).ino, before);
  await chmod(object, 0o600); await writeFile(object, Buffer.from('corrupt'));
  await assert.rejects(f.store.inspectAndStore(input), /IMAGE_OBJECT_UNAVAILABLE/);
  assert.equal(await readFile(object, 'utf8'), 'corrupt');
  assert.deepEqual(await readdir(directory), [contentHash.slice(7)]);
});

test('missing, truncated, tampered, symlinked and wrong-metadata objects return no bytes or storage details', async (t) => {
  const f = await fixture(t), bytes = await make('png'), contentHash = digest(bytes);
  const metadata = { contentHash, mediaType: 'image/png', byteSize: bytes.length };
  await f.store.inspectAndStore({ bytes, contentHash, mediaType: metadata.mediaType });
  const object = f.pathFor(contentHash), external = join(f.directory, 'external.png');
  await writeFile(external, bytes, { mode: 0o600 });
  for (const action of [
    async () => { await chmod(object, 0o600); await writeFile(object, bytes.subarray(0, bytes.length - 1)); },
    async () => { const tampered = Buffer.from(bytes); tampered[40] ^= 1; await writeFile(object, tampered); },
    async () => { await rm(object); await symlink(external, object); },
    async () => { await rm(object); },
  ]) {
    await action();
    await assert.rejects(f.store.read(metadata), (error) => error.code === 'IMAGE_OBJECT_UNAVAILABLE'
      && !error.message.includes(f.directory));
  }
  await assert.rejects(f.store.read({ ...metadata, contentHash: 'sha256:../../private' }));
  await assert.rejects(f.store.read({ ...metadata, mediaType: 'text/html' }));
  await assert.rejects(f.store.read({ ...metadata, byteSize: 2 * 1024 * 1024 + 1 }));
  assert.deepEqual(await readFile(external), bytes);
});

test('failed inspection and invalid in-memory metadata write no object and execute no user accessors', async (t) => {
  const f = await fixture(t), bad = Buffer.from('<svg onload="unsafe"/>');
  await assert.rejects(f.store.inspectAndStore({ bytes: bad, contentHash: digest(bad), mediaType: 'image/png' }));
  assert.deepEqual(await readdir(f.rootDirectory), []);
  let accessed = 0;
  const value = { mediaType: 'image/png', byteSize: 1 };
  Object.defineProperty(value, 'contentHash', { enumerable: true, get() { accessed++; throw new Error('Never execute'); } });
  await assert.rejects(f.store.read(value)); assert.equal(accessed, 0);
  const proxy = new Proxy({}, { getPrototypeOf() { accessed++; return Object.prototype; } });
  await assert.rejects(f.store.read(proxy)); assert.equal(accessed, 0);
  await assert.rejects(f.store.read({ contentHash: { toString() { accessed++; return 'invalid'; } }, mediaType: 'image/png', byteSize: 1 }));
  assert.equal(accessed, 0);
  const bytes = await make('png'), contentHash = digest(bytes);
  await f.store.inspectAndStore({ bytes, contentHash, mediaType: 'image/png' });
  await assert.rejects(f.store.read({ contentHash, mediaType: 'image/png', byteSize: bytes.length }, { signal: AbortSignal.abort() }));
});
