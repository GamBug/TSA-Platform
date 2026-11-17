import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { copyImageBytes, MAX_IMAGE_BYTES, validateImageContainer } from '../../src/modules/media/image-containers.mjs';

const make = (format, options = {}, width = 8, height = 9) =>
  sharp({ create: { width, height, channels: 4, background: { r: 30, g: 70, b: 110, alpha: 0.5 } } })[format](options).toBuffer();
const mimes = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

test('strict framing accepts original static PNG, baseline/progressive JPEG and lossless/lossy WebP', async () => {
  for (const [format, options] of [['png', {}], ['png', { progressive: true }], ['jpeg', {}],
    ['jpeg', { progressive: true }], ['webp', {}], ['webp', { lossless: true }]]) {
    const bytes = await make(format, options);
    assert.deepEqual(validateImageContainer(bytes, mimes[format]), { mediaType: mimes[format], byteSize: bytes.length, width: 8, height: 9 });
  }
});

test('container checks reject wrong MIME, trailing data, truncated files and corrupt PNG CRC', async () => {
  for (const format of Object.keys(mimes)) {
    const bytes = await make(format);
    assert.throws(() => validateImageContainer(bytes, format === 'png' ? 'image/jpeg' : 'image/png'));
    assert.throws(() => validateImageContainer(Buffer.concat([bytes, Buffer.from('trailing')]), mimes[format]));
    assert.throws(() => validateImageContainer(bytes.subarray(0, bytes.length - 1), mimes[format]));
  }
  const png = await make('png'); png[png.length - 1] ^= 1;
  assert.throws(() => validateImageContainer(png, 'image/png'));
});

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length); chunk.write(type, 4, 'latin1'); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

test('animation/profile/compressed-metadata container features are refused before native decode', async () => {
  const png = await make('png');
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2);
  const text = Buffer.concat([Buffer.from('note\0\0'), deflateSync('Synthetic metadata')]);
  for (const chunk of [pngChunk('acTL', animation), pngChunk('zTXt', text), pngChunk('iCCP', text)]) {
    const bytes = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
    assert.throws(() => validateImageContainer(bytes, 'image/png'));
  }
  const first = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const second = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).png().toBuffer();
  const animated = await sharp([first, second], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated, { animated: true }).metadata()).pages, 2);
  assert.throws(() => validateImageContainer(animated, 'image/webp'));
});

test('framing bounds reject excessive dimensions/pixels/bytes and never execute foreign byte getters', async () => {
  assert.throws(() => validateImageContainer('https://invalid.example/image.png', 'image/png'));
  const wide = await make('png', {}, 4097, 1);
  const pixels = await make('png', {}, 2049, 2049);
  assert.throws(() => validateImageContainer(wide, 'image/png'));
  assert.throws(() => validateImageContainer(pixels, 'image/png'));
  assert.throws(() => copyImageBytes(Buffer.alloc(MAX_IMAGE_BYTES + 1)));
  let reads = 0;
  const proxy = new Proxy(new Uint8Array([1]), { get() { reads++; throw Error('do not inspect'); } });
  assert.throws(() => copyImageBytes(proxy)); assert.equal(reads, 0);
  const view = new Uint8Array([1, 2, 3]);
  Object.defineProperty(view, 'byteLength', { get() { reads++; throw Error('do not inspect'); } });
  assert.deepEqual(copyImageBytes(view), Buffer.from([1, 2, 3])); assert.equal(reads, 0);
  assert.throws(() => copyImageBytes(new Uint8Array(new SharedArrayBuffer(4))));
});

