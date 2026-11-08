import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import sharp from 'sharp';
import { before, test } from 'node:test';
import { copyImageBytes, MAX_IMAGE_BYTES, validateImageContainer } from '../../src/modules/media/image-containers.mjs';
import { IMAGE_INSPECTION_VERSION, inspectImage } from '../../src/modules/media/image-inspection.mjs';

const workerPath = fileURLToPath(new URL('../../src/modules/media/image-inspection-worker.mjs', import.meta.url));
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
let png;
let jpeg;
let webp;
let animatedWebp;
let largeDimensionPng;
let largePixelsPng;
let cmykJpeg;

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, 8 + data.length)), 8 + data.length);
  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function unsupportedDepthPng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 16;
  header[9] = 2;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function corruptPngPixels(source) {
  const result = Buffer.from(source);
  let offset = 8;
  while (offset < result.length) {
    const size = result.readUInt32BE(offset);
    const type = result.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      result[offset + 8] ^= 0xff;
      result.writeUInt32BE(crc32(result.subarray(offset + 4, offset + 8 + size)), offset + 8 + size);
      return result;
    }
    offset += size + 12;
  }
  throw new Error('Sharp PNG fixture did not contain IDAT');
}

function findOwnedWorkerPid() {
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const command = readFileSync(`/proc/${entry}/cmdline`).toString('utf8').split('\0');
      if (command[1] !== workerPath) continue;
      const status = readFileSync(`/proc/${entry}/status`, 'utf8');
      const parentId = Number(status.match(/^PPid:\s+(\d+)$/m)?.[1]);
      if (parentId === process.pid) return Number(entry);
    } catch {
      // Processes may exit while the process table is being sampled.
    }
  }
  return null;
}

before(async () => {
  const base = await sharp({
    create: { width: 8, height: 9, channels: 3, background: { r: 45, g: 104, b: 181 } },
  }).png().toBuffer();
  png = base;
  jpeg = await sharp(base).jpeg().toBuffer();
  webp = await sharp(base).webp().toBuffer();

  const firstFrame = await sharp({
    create: { width: 8, height: 9, channels: 3, background: { r: 30, g: 90, b: 150 } },
  }).png().toBuffer();
  const secondFrame = await sharp({
    create: { width: 8, height: 9, channels: 3, background: { r: 190, g: 80, b: 35 } },
  }).png().toBuffer();
  animatedWebp = await sharp([firstFrame, secondFrame], { join: { animated: true } })
    .webp({ delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animatedWebp, { animated: true }).metadata()).pages, 2);

  largeDimensionPng = await sharp({
    create: { width: 4097, height: 1, channels: 3, background: '#123456' },
  }).png().toBuffer();
  largePixelsPng = await sharp({
    create: { width: 4096, height: 1025, channels: 3, background: '#123456' },
  }).png().toBuffer();
  cmykJpeg = await sharp({
    create: { width: 8, height: 9, channels: 3, background: '#123456' },
  }).toColourspace('cmyk').jpeg().toBuffer();
});

test('inspects real Sharp PNG, JPEG and WebP files with a complete bounded receipt', async () => {
  for (const [bytes, mediaType, width, height, channels] of [
    [png, 'image/png', 8, 9, 3],
    [jpeg, 'image/jpeg', 8, 9, 3],
    [webp, 'image/webp', 8, 9, 3],
  ]) {
    assert.deepEqual(await inspectImage(bytes, { mediaType, contentHash: digest(bytes) }), {
      schemaVersion: 'image-inspection/1',
      profile: 'text-math-table-inspected-image/2',
      contentHash: digest(bytes),
      mediaType,
      byteSize: bytes.length,
      width,
      height,
      channels,
      decoderVersion: IMAGE_INSPECTION_VERSION,
    });
  }
});

test('rejects truncated, malformed-pixel, and checksum-corrupt images', async () => {
  const truncated = png.subarray(0, png.length - 8);
  const badChecksum = Buffer.from(png);
  badChecksum[badChecksum.length - 1] ^= 1;
  const badPixels = corruptPngPixels(png);
  assert.doesNotThrow(() => validateImageContainer(badPixels, 'image/png'));

  for (const bytes of [truncated, badChecksum, badPixels]) {
    await assert.rejects(inspectImage(bytes, { mediaType: 'image/png', contentHash: digest(bytes) }));
  }
});

test('rejects a hash mismatch before container parsing or child dispatch', async () => {
  await assert.rejects(
    inspectImage(Buffer.from('not an image'), { mediaType: 'image/png', contentHash: `sha256:${'0'.repeat(64)}` }),
    { message: 'IMAGE_HASH_MISMATCH' },
  );
});

test('rejects wrong MIME, SVG, GIF, and animated WebP input', async () => {
  await assert.rejects(inspectImage(jpeg, { mediaType: 'image/png', contentHash: digest(jpeg) }));
  await assert.rejects(inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
    mediaType: 'image/png', contentHash: digest(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
  }));
  await assert.rejects(inspectImage(Buffer.from('GIF89a'), {
    mediaType: 'image/gif', contentHash: digest(Buffer.from('GIF89a')),
  }));
  await assert.rejects(inspectImage(animatedWebp, {
    mediaType: 'image/webp', contentHash: digest(animatedWebp),
  }));
});

test('rejects dimensions, pixel count, encoded size, depth, and color outside the profile', async () => {
  const oversizedBytes = Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES + 1 - png.length)]);
  const depth16 = unsupportedDepthPng();
  assert.equal((await sharp(depth16).metadata()).depth, 'ushort');
  assert.equal((await sharp(cmykJpeg).metadata()).space, 'cmyk');
  const cases = [
    [largeDimensionPng, 'image/png'],
    [largePixelsPng, 'image/png'],
    [oversizedBytes, 'image/png'],
    [depth16, 'image/png'],
    [cmykJpeg, 'image/jpeg'],
  ];
  for (const [bytes, mediaType] of cases) {
    await assert.rejects(inspectImage(bytes, { mediaType, contentHash: digest(bytes) }));
  }
});

test('accepts native byte views and rejects paths, foreign views, proxies and shadowed views without traps', async () => {
  const wrapped = Buffer.concat([Buffer.from([1, 2, 3]), png, Buffer.from([4, 5])]);
  const view = new Uint8Array(wrapped.buffer, wrapped.byteOffset + 3, png.length);
  assert.deepEqual(copyImageBytes(view), png);
  assert.equal((await inspectImage(view, { mediaType: 'image/png', contentHash: digest(png) })).width, 8);

  const foreign = vm.runInNewContext('new Uint8Array(value)', { value: png });
  const proxyTrap = { called: false };
  const proxied = new Proxy(png, { get() { proxyTrap.called = true; throw new Error('trap'); } });
  const shadowed = new Uint8Array(png);
  let getterCalled = false;
  Object.defineProperty(shadowed, 'buffer', {
    configurable: true,
    get() { getterCalled = true; throw new Error('trap'); },
  });

  for (const value of [
    '/tmp/image.png',
    new URL('file:///tmp/image.png'),
    new DataView(png.buffer, png.byteOffset, png.byteLength),
    new Uint16Array(png.buffer, png.byteOffset, Math.floor(png.byteLength / 2)),
    foreign,
    proxied,
    shadowed,
  ]) {
    await assert.rejects(inspectImage(value, { mediaType: 'image/png', contentHash: digest(png) }));
  }
  assert.equal(proxyTrap.called, false);
  assert.equal(getterCalled, false);
});

test('rejects extra option keys, accessors and proxies without evaluating traps', async () => {
  await assert.rejects(inspectImage(png, {
    mediaType: 'image/png', contentHash: digest(png), sourceUrl: 'https://example.invalid/image.png',
  }));

  let getterCalled = false;
  const accessorOptions = { mediaType: 'image/png' };
  Object.defineProperty(accessorOptions, 'contentHash', {
    enumerable: true,
    get() { getterCalled = true; throw new Error('trap'); },
  });
  const proxyTrap = { called: false };
  const proxiedOptions = new Proxy({ mediaType: 'image/png', contentHash: digest(png) }, {
    ownKeys() { proxyTrap.called = true; throw new Error('trap'); },
  });

  await assert.rejects(inspectImage(png, accessorOptions));
  await assert.rejects(inspectImage(png, proxiedOptions));
  assert.equal(getterCalled, false);
  assert.equal(proxyTrap.called, false);
});

test('the owned worker timeout returns sanitized output and reaps its child PID', async () => {
  const child = spawn(process.execPath, [workerPath, 'image/png', `sha256:${'0'.repeat(64)}`], {
    env: { PATH: process.env.PATH ?? '' },
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const pid = child.pid;
  const output = [];
  child.stdout.on('data', (part) => output.push(part));
  const closed = once(child, 'close');
  const startedAt = Date.now();
  try {
    const [code, signal] = await closed;
    assert.equal(code, 1);
    assert.equal(signal, null);
    assert.ok(Date.now() - startedAt < 3000);
    assert.deepEqual(JSON.parse(Buffer.concat(output).toString('utf8')), {
      ok: false,
      code: 'IMAGE_TIMEOUT',
    });
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'close');
    }
  }
});

test('the parent hard deadline terminates and awaits its worker child', {
  skip: process.platform !== 'linux',
  timeout: 5000,
}, async () => {
  const inspection = inspectImage(png, { mediaType: 'image/png', contentHash: digest(png) });
  const deadline = Date.now() + 1000;
  let workerPid = null;
  while (!workerPid && Date.now() < deadline) {
    workerPid = findOwnedWorkerPid();
    if (!workerPid) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(workerPid, 'expected the inspection child to be visible in /proc');

  try {
    process.kill(workerPid, 'SIGSTOP');
    await assert.rejects(inspection, { message: 'IMAGE_INSPECTION_TIMEOUT' });
  } finally {
    try { process.kill(workerPid, 'SIGCONT'); } catch { /* the parent may already have killed it */ }
  }
  assert.throws(() => process.kill(workerPid, 0), { code: 'ESRCH' });
});
