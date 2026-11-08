import { createHash } from 'node:crypto';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  validateImageContainer,
} from './image-containers.mjs';

const expectedSharpVersion = '0.35.5';
const expectedVipsVersion = '8.18.7';
const imageInspectionVersion = 'image-inspection/1:sharp/0.35.5:libvips/8.18.7';
const supportedMediaTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ownTimeoutMs = 1750;
let finished = false;

function finish(result, code) {
  if (finished) return;
  finished = true;
  clearTimeout(ownTimeout);
  process.stdin.pause();
  const output = Buffer.from(JSON.stringify(result));
  process.stdout.write(output, () => process.exit(code));
}

const ownTimeout = setTimeout(() => {
  finish({ ok: false, code: 'IMAGE_TIMEOUT' }, 1);
}, ownTimeoutMs);

async function readInput() {
  const chunks = [];
  let byteSize = 0;
  for await (const chunk of process.stdin) {
    if (byteSize + chunk.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_NOT_SUPPORTED');
    byteSize += chunk.length;
    chunks.push(chunk);
  }
  if (byteSize === 0) throw new Error('IMAGE_NOT_SUPPORTED');
  return Buffer.concat(chunks, byteSize);
}

function validDimensions(metadata) {
  return Number.isSafeInteger(metadata.width) && metadata.width > 0
    && metadata.width <= MAX_IMAGE_DIMENSION
    && Number.isSafeInteger(metadata.height) && metadata.height > 0
    && metadata.height <= MAX_IMAGE_DIMENSION
    && metadata.width * metadata.height <= MAX_IMAGE_PIXELS;
}

async function inspect(bytes, mediaType, contentHash, sharp) {
  if (sharp.versions.sharp !== expectedSharpVersion || sharp.versions.vips !== expectedVipsVersion) {
    throw new Error('IMAGE_DECODER_UNAVAILABLE');
  }
  if (!supportedMediaTypes.has(mediaType) || !/^sha256:[a-f0-9]{64}$/.test(contentHash)) {
    throw new Error('IMAGE_NOT_SUPPORTED');
  }
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== contentHash) {
    throw new Error('IMAGE_HASH_MISMATCH');
  }

  const framed = validateImageContainer(bytes, mediaType);
  const decoderOptions = {
    failOn: 'warning',
    limitInputPixels: MAX_IMAGE_PIXELS,
    limitInputChannels: 4,
  };
  const metadata = await sharp(bytes, { ...decoderOptions, animated: true }).metadata();
  const expectedFormat = mediaType === 'image/jpeg' ? 'jpeg' : mediaType.slice('image/'.length);
  const pages = metadata.pages ?? 1;
  if (metadata.format !== expectedFormat || pages !== 1 || !validDimensions(metadata)
    || metadata.width !== framed.width || metadata.height !== framed.height
    || metadata.depth !== 'uchar' || !['srgb', 'b-w'].includes(metadata.space)
    || !Number.isSafeInteger(metadata.channels) || metadata.channels < 1 || metadata.channels > 4) {
    throw new Error('IMAGE_NOT_SUPPORTED');
  }

  const { data, info } = await sharp(bytes, { ...decoderOptions, animated: false })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const expectedBytes = info.width * info.height * info.channels;
  if (!Buffer.isBuffer(data) || info.width !== metadata.width || info.height !== metadata.height
    || info.channels !== metadata.channels || info.depth !== 'uchar'
    || !Number.isSafeInteger(expectedBytes) || data.byteLength !== expectedBytes) {
    throw new Error('IMAGE_DECODE_FAILED');
  }

  return {
    ok: true,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    decoderVersion: imageInspectionVersion,
  };
}

async function main() {
  const { default: sharp } = await import('sharp');
  sharp.concurrency(1);
  sharp.cache(false);
  if (process.argv.length !== 4) throw new Error('IMAGE_NOT_SUPPORTED');
  const mediaType = process.argv[2];
  const contentHash = process.argv[3];
  const bytes = await readInput();
  return inspect(bytes, mediaType, contentHash, sharp);
}

main().then(
  (receipt) => finish(receipt, 0),
  () => finish({ ok: false, code: 'IMAGE_DECODE_FAILED' }, 1),
);
