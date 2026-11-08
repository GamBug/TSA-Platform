import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { inspectImage } from './image-inspection.mjs';
import { copyImageBytes, MAX_IMAGE_BYTES, validateImageContainer } from './image-containers.mjs';

const PUBLIC_ROOT = fileURLToPath(new URL('../../../apps/practice-prototype/public/', import.meta.url));
const HASH = /^sha256:[0-9a-f]{64}$/;
const MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const LOCAL_IMAGE_READ_MILLISECONDS = 500;

export class ImageObjectError extends Error {
  constructor(code = 'IMAGE_OBJECT_UNAVAILABLE') { super(code); this.name = 'ImageObjectError'; this.code = code; }
}
const unavailable = () => new ImageObjectError();
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function exact(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) throw unavailable();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) throw unavailable();
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw unavailable();
  }
  return value;
}

function metadata(input) {
  exact(input, ['contentHash', 'mediaType', 'byteSize']);
  if (typeof input.contentHash !== 'string' || typeof input.mediaType !== 'string'
      || !HASH.test(input.contentHash) || !MIMES.has(input.mediaType)
      || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > MAX_IMAGE_BYTES) throw unavailable();
  return { contentHash: input.contentHash, mediaType: input.mediaType, byteSize: input.byteSize };
}

function privateMode(info) {
  if (info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw unavailable();
}

async function privateDirectory(path) {
  const info = await lstat(path); privateMode(info);
  if (!info.isDirectory() || info.isSymbolicLink()) throw unavailable();
  let current = path;
  while (true) {
    const entry = await lstat(current); if (entry.isSymbolicLink()) throw unavailable();
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
  if (await realpath(path) !== path) throw unavailable();
}

async function ensureDirectory(path) {
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await privateDirectory(path);
}

async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

/** Private local adapter. Clients supply UUIDs to the API, never object paths. */
export async function createLocalImageStore({ rootDirectory, enabled = false, env = process.env } = {}) {
  const local = enabled === true && ['development', 'test'].includes(env?.NODE_ENV)
    && env.LOCAL_SYNTHETIC_ONLY === 'true'
    && (process.env.NODE_ENV === undefined || ['development', 'test'].includes(process.env.NODE_ENV));
  if (!local) return Object.freeze({
    inspectAndStore: async () => { throw new ImageObjectError('IMAGE_STORE_DISABLED'); },
    read: async () => { throw new ImageObjectError('IMAGE_STORE_DISABLED'); },
    status: () => Object.freeze({ enabled: false }),
  });
  if (typeof rootDirectory !== 'string' || !isAbsolute(rootDirectory)) throw unavailable();
  const root = resolve(rootDirectory);
  try {
    const publicRoot = await realpath(PUBLIC_ROOT), rel = relative(publicRoot, root);
    if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) throw unavailable();
    await privateDirectory(dirname(root)); await ensureDirectory(root);
  } catch { throw unavailable(); }

  const objectPath = (hash) => {
    if (typeof hash !== 'string' || !HASH.test(hash)) throw unavailable();
    const hex = hash.slice(7); return join(root, 'sha256', hex.slice(0, 2), hex);
  };

  async function readObject(input, { signal } = {}) {
    const expected = metadata(input), path = objectPath(expected.contentHash);
    const controller = new AbortController();
    const cancelled = () => controller.abort();
    if (signal) {
      if (!(signal instanceof AbortSignal)) throw unavailable();
      if (signal.aborted) throw unavailable();
      signal.addEventListener('abort', cancelled, { once: true });
    }
    let timeout;
    const expired = new Promise((_, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(unavailable()); }, LOCAL_IMAGE_READ_MILLISECONDS);
    });
    const work = async () => {
      let handle;
      try {
        await privateDirectory(root); await privateDirectory(dirname(dirname(path))); await privateDirectory(dirname(path));
        if (controller.signal.aborted) throw unavailable();
        const before = await lstat(path); privateMode(before);
        if (!before.isFile() || before.isSymbolicLink() || before.size !== expected.byteSize) throw unavailable();
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const after = await handle.stat(); privateMode(after);
        if (!after.isFile() || after.ino !== before.ino || after.dev !== before.dev || after.size !== expected.byteSize) throw unavailable();
        const bytes = Buffer.alloc(expected.byteSize + 1); let length = 0;
        while (length < bytes.length) {
          if (controller.signal.aborted) throw unavailable();
          const chunk = await handle.read(bytes, length, Math.min(64 * 1024, bytes.length - length), null);
          if (!chunk.bytesRead) break; length += chunk.bytesRead;
        }
        if (controller.signal.aborted || length !== expected.byteSize) throw unavailable();
        const result = bytes.subarray(0, length);
        if (digest(result) !== expected.contentHash) throw unavailable();
        validateImageContainer(result, expected.mediaType);
        if (controller.signal.aborted) throw unavailable();
        return { bytes: result, ...expected };
      } finally { if (handle) await handle.close(); }
    };
    try { return await Promise.race([work(), expired]); }
    catch { throw unavailable(); }
    finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancelled); }
  }

  async function inspectAndStore(input) {
    try {
      exact(input, ['bytes', 'contentHash', 'mediaType']);
      if (typeof input.contentHash !== 'string' || typeof input.mediaType !== 'string'
          || !HASH.test(input.contentHash) || !MIMES.has(input.mediaType)) throw unavailable();
      const bytes = copyImageBytes(input.bytes);
      if (digest(bytes) !== input.contentHash) throw unavailable();
      const receipt = await inspectImage(bytes, { mediaType: input.mediaType, contentHash: input.contentHash });
      const path = objectPath(receipt.contentHash), parent = dirname(path);
      await privateDirectory(root); await ensureDirectory(dirname(parent)); await ensureDirectory(parent);
      const temporary = join(parent, `.pending-${randomUUID()}`);
      let handle;
      try {
        handle = await open(temporary, 'wx', 0o600);
        await handle.writeFile(bytes); await handle.sync(); await handle.chmod(0o400); await handle.sync();
        await handle.close(); handle = null;
        try { await link(temporary, path); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        await syncDirectory(parent);
        await readObject({ contentHash: receipt.contentHash, mediaType: receipt.mediaType, byteSize: receipt.byteSize });
      } finally {
        if (handle) await handle.close();
        await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      }
      return Object.freeze({ ...receipt });
    } catch { throw unavailable(); }
  }
  return Object.freeze({ inspectAndStore, read: readObject, status: () => Object.freeze({ enabled: true }) });
}
