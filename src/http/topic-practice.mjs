import { randomUUID } from 'node:crypto';
import { createTopicPracticeService } from '../modules/topic-practice/service.mjs';
import { BankCommandError, UUID_PATTERN } from '../modules/bank/common.mjs';

const MAX_BODY_BYTES = 16384;
function reply(status, value, requestId) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', vary: 'Origin', 'x-request-id': requestId } });
}
async function readBody(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw new BankCommandError(422, 'VALIDATION_ERROR');
  const reader = request.body?.getReader();
  const chunks = []; let length = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new BankCommandError(413, 'PAYLOAD_TOO_LARGE'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BankCommandError(400, 'MALFORMED_JSON'); }
}

/** Additive local interfaces; all attempts continue through the frozen lifecycle. */
export function createTopicPracticeHandler({ examPool, identityService, trustedOrigin, createRate }) {
  const service = createTopicPracticeService({ examPool, identityService, createRate });
  return async (request) => {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url);
      const host = request.headers.get('host');
      const origin = request.headers.get('origin');
      if (url.origin !== trustedOrigin || (host && host.toLowerCase() !== new URL(trustedOrigin).host.toLowerCase())
          || (origin && origin !== trustedOrigin)) throw new BankCommandError(403, 'FORBIDDEN');
      const principal = await identityService.authenticate(request);
      if (!principal) throw new BankCommandError(401, 'UNAUTHENTICATED');
      if (!identityService.mayPerform(principal, 'candidate.attempt.read')) throw new BankCommandError(403, 'FORBIDDEN');
      const durations = url.searchParams.getAll('durationSeconds');
      if ([...url.searchParams.keys()].some((key) => key !== 'durationSeconds') || durations.length > 1
          || (url.search && url.pathname !== '/api/v1/topics')
          || (durations.length && !/^[1-9][0-9]{1,4}$/.test(durations[0]))) throw new BankCommandError(422, 'VALIDATION_ERROR');
      if (url.pathname === '/api/v1/topics' && request.method === 'GET') {
        return reply(200, await service.catalog(principal, { durationSeconds: durations.length ? Number(durations[0]) : 120 }), requestId);
      }
      if (url.pathname !== '/api/v1/topic-practice' || request.method !== 'POST') throw new BankCommandError(405, 'METHOD_NOT_ALLOWED');
      const current = await identityService.validateMutation(request);
      if (!current || current.userId !== principal.userId) throw new BankCommandError(403, 'CSRF_FAILED');
      const result = await service.create(current, request.headers.get('idempotency-key'), await readBody(request));
      return reply(result.status, result.body, requestId);
    } catch (error) {
      const known = error instanceof BankCommandError && [400,401,403,404,405,409,410,413,422,429,503].includes(error.status);
      const code = known ? error.code : 'TEMPORARILY_UNAVAILABLE';
      const details = {};
      if (UUID_PATTERN.test(error.details?.existingAttemptId)) details.existingAttemptId = error.details.existingAttemptId;
      for (const name of ['requestedCount', 'availableQuestionCount', 'retryAfterSeconds']) {
        if (Number.isSafeInteger(error.details?.[name]) && error.details[name] >= 0) details[name] = error.details[name];
      }
      return reply(known ? error.status : 503, { error: { code, message: 'The request could not be completed', requestId, details } }, requestId);
    }
  };
}
