import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { types } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  copyImageBytes,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  validateImageContainer,
} from './image-containers.mjs';

export const IMAGE_INSPECTION_VERSION = 'image-inspection/1:sharp/0.35.5:libvips/8.18.7';

const supportedMediaTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const workerPath = fileURLToPath(new URL('./image-inspection-worker.mjs', import.meta.url));
const maxWorkerOutputBytes = 2048;
const inspectionTimeoutMs = 2000;
const terminateGraceMs = 100;

function fail(code = 'IMAGE_NOT_SUPPORTED') {
  throw new TypeError(code);
}

function safeBytes(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value)) fail();

  const isBuffer = Buffer.isBuffer(value);
  if (!isBuffer && Object.getPrototypeOf(value) !== Uint8Array.prototype) fail();
  for (const key of ['buffer', 'byteOffset', 'byteLength', 'length']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) fail();
  }

  return copyImageBytes(value);
}

function safeOptions(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail();

  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes('mediaType') || !keys.includes('contentHash')) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const mediaType = descriptors.mediaType;
  const contentHash = descriptors.contentHash;
  if (!mediaType || !contentHash || !Object.hasOwn(mediaType, 'value')
    || !Object.hasOwn(contentHash, 'value')) fail();

  if (typeof mediaType.value !== 'string' || !supportedMediaTypes.has(mediaType.value)
    || typeof contentHash.value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(contentHash.value)) fail();
  return { mediaType: mediaType.value, contentHash: contentHash.value };
}

function exactWorkerReceipt(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 5
    && keys[0] === 'channels'
    && keys[1] === 'decoderVersion'
    && keys[2] === 'height'
    && keys[3] === 'ok'
    && keys[4] === 'width'
    && value.ok === true
    && value.decoderVersion === IMAGE_INSPECTION_VERSION
    && Number.isSafeInteger(value.width) && value.width > 0 && value.width <= MAX_IMAGE_DIMENSION
    && Number.isSafeInteger(value.height) && value.height > 0 && value.height <= MAX_IMAGE_DIMENSION
    && value.width * value.height <= MAX_IMAGE_PIXELS
    && Number.isSafeInteger(value.channels) && value.channels >= 1 && value.channels <= 4;
}

function decodeInWorker(bytes, mediaType, contentHash) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      const env = { PATH: process.env.PATH ?? '' };
      if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
      child = spawn(process.execPath, [workerPath, mediaType, contentHash], {
        env,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      reject(new Error('IMAGE_DECODE_FAILED'));
      return;
    }

    const output = [];
    let outputBytes = 0;
    let spawnFailed = false;
    let timeout = false;
    let protocolFailed = false;
    let finished = false;
    let terminationStarted = false;
    let terminateTimer;
    const kill = () => {
      if (terminationStarted || child.exitCode !== null || child.signalCode !== null) return;
      terminationStarted = true;
      try { child.kill('SIGTERM'); } catch { /* close is still awaited below */ }
      terminateTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGKILL'); } catch { /* close is still awaited below */ }
        }
      }, terminateGraceMs);
    };
    const deadline = setTimeout(() => {
      timeout = true;
      kill();
    }, inspectionTimeoutMs);

    child.once('error', () => {
      spawnFailed = true;
      kill();
    });
    child.stdout?.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxWorkerOutputBytes) {
        protocolFailed = true;
        kill();
      } else {
        output.push(chunk);
      }
    });
    child.stdin?.once('error', () => {
      if (!timeout) {
        protocolFailed = true;
        kill();
      }
    });
    child.once('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(terminateTimer);
      if (timeout) { reject(new Error('IMAGE_INSPECTION_TIMEOUT')); return; }
      if (spawnFailed || protocolFailed || code !== 0 || signal !== null) {
        reject(new Error('IMAGE_DECODE_FAILED'));
        return;
      }

      let receipt;
      try { receipt = JSON.parse(Buffer.concat(output, outputBytes).toString('utf8')); }
      catch { reject(new Error('IMAGE_DECODE_FAILED')); return; }
      if (!exactWorkerReceipt(receipt)) { reject(new Error('IMAGE_DECODE_FAILED')); return; }
      resolve(receipt);
    });

    try { child.stdin?.end(bytes); }
    catch { protocolFailed = true; kill(); }
  });
}

/** Inspect immutable in-memory PNG, JPEG, or WebP bytes in a bounded child process. */
export async function inspectImage(bytes, options) {
  const { mediaType, contentHash } = safeOptions(options);
  const input = safeBytes(bytes);
  if (input.length > MAX_IMAGE_BYTES) fail();

  const actualHash = `sha256:${createHash('sha256').update(input).digest('hex')}`;
  if (actualHash !== contentHash) fail('IMAGE_HASH_MISMATCH');

  const container = validateImageContainer(input, mediaType);
  if (container.byteSize !== input.length) fail();

  const decoded = await decodeInWorker(input, mediaType, contentHash);
  if (decoded.width !== container.width || decoded.height !== container.height) {
    fail('IMAGE_DECODE_FAILED');
  }

  return {
    schemaVersion: 'image-inspection/1',
    profile: 'text-math-table-inspected-image/2',
    contentHash,
    mediaType,
    byteSize: input.length,
    width: decoded.width,
    height: decoded.height,
    channels: decoded.channels,
    decoderVersion: IMAGE_INSPECTION_VERSION,
  };
}
