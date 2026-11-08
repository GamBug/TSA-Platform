import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { withTransaction } from '../database/pool.mjs';
import { reject, requireActor, UUID_PATTERN } from '../bank/common.mjs';
import { validateImageContainer, MAX_IMAGE_BYTES } from '../media/image-containers.mjs';

const GUARD_MILLISECONDS = 2_000;
const READ_MILLISECONDS = 500;
const deny = () => reject(404, 'NOT_FOUND');

function metadata(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'byteSize,contentHash,mediaType'
      || !/^sha256:[0-9a-f]{64}$/.test(value.contentHash)
      || !['image/png', 'image/jpeg', 'image/webp'].includes(value.mediaType)
      || !Number.isSafeInteger(value.byteSize) || value.byteSize < 1 || value.byteSize > MAX_IMAGE_BYTES) deny();
  return value;
}

/** Bytes are buffered and checked before the final guarded authorization point. */
export function createAttemptAssetService({ examPool, identityService, imageStore, enableNumericPractice = false, enableFullSimulation = false } = {}) {
  return Object.freeze({ async read(principal, attemptId, assetVersionId, purpose) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    if (!UUID_PATTERN.test(attemptId) || !UUID_PATTERN.test(assetVersionId)
        || !['question', 'explanation'].includes(purpose) || !imageStore?.status?.().enabled) deny();
    const started = performance.now();
    try {
      const result = await withTransaction(examPool, async (client) => {
        await client.query("SET LOCAL transaction_timeout='2s'");
        await client.query("SET LOCAL statement_timeout='2s'");
        await client.query("SET LOCAL lock_timeout='1500ms'");
        await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
        const authorize = async () => {
          const value = (await client.query('SELECT tsa.exam_attempt_asset($1,$2,$3) AS metadata',
            [attemptId, assetVersionId, purpose])).rows[0]?.metadata;
          return value === null ? null : metadata(value);
        };
        const expected = await authorize();
        if (expected === null) return null;
        const abort = new AbortController();
        let timer;
        let bytes;
        try {
          const object = await Promise.race([
            imageStore.read(expected, { signal: abort.signal }),
            new Promise((_, fail) => { timer = setTimeout(() => { abort.abort(); fail(new Error('Image read elapsed')); }, READ_MILLISECONDS); }),
          ]);
          if (!Buffer.isBuffer(object.bytes) || object.bytes.length !== expected.byteSize) deny();
          bytes = Buffer.from(object.bytes);
          const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
          if (hash !== expected.contentHash) deny();
          validateImageContainer(bytes, expected.mediaType);
        } finally { clearTimeout(timer); abort.abort(); }
        const current = await authorize();
        if (current === null) return null;
        if (JSON.stringify(current) !== JSON.stringify(expected) || performance.now() - started >= GUARD_MILLISECONDS) deny();
        return { bytes, mediaType: current.mediaType, byteSize: current.byteSize };
      }, { role: 'tsa_exam', enableNumericPractice, enableFullSimulation });
      if (result === null || performance.now() - started >= GUARD_MILLISECONDS) deny();
      return result;
    } catch { deny(); }
  } });
}
