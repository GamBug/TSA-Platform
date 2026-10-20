import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { BankCommandError } from '../modules/bank/common.mjs';
import { createQuestionService } from '../modules/bank/questions.mjs';
import { createPublicationService } from '../modules/bank/publication.mjs';
import { createSourceService } from '../modules/sources/service.mjs';

const MAX_JSON_BYTES = 1024 * 1024;

function isLoopback(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized === '::1') return true;
  return isIP(normalized) === 4 && Number(normalized.split('.')[0]) === 127;
}

function validateTrustedOrigin(trustedOrigin) {
  if (typeof trustedOrigin !== 'string' || trustedOrigin.length > 256) {
    throw new TypeError('An explicit trusted loopback origin is required');
  }
  let parsed;
  try { parsed = new URL(trustedOrigin); }
  catch { throw new TypeError('An explicit trusted loopback origin is required'); }
  if (parsed.protocol !== 'http:' || !isLoopback(parsed.hostname) || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin !== trustedOrigin.replace(/\/$/, '')) {
    throw new TypeError('Bank HTTP boundary is restricted to a canonical HTTP loopback origin');
  }
  return parsed.origin;
}

function requestIsTrusted(request, trustedOrigin) {
  try {
    if (new URL(request.url).origin !== trustedOrigin) return false;
    const host = request.headers.get('host');
    if (host && host.toLowerCase() !== new URL(trustedOrigin).host.toLowerCase()) return false;
    const origin = request.headers.get('origin');
    return origin === null || origin === trustedOrigin;
  } catch {
    return false;
  }
}

async function readJson(request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new BankCommandError(422, 'VALIDATION_ERROR');
  }
  const lengthHeader = request.headers.get('content-length');
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0) throw new BankCommandError(422, 'VALIDATION_ERROR');
    if (length > MAX_JSON_BYTES) throw new BankCommandError(413, 'PAYLOAD_TOO_LARGE');
  }
  if (!request.body) throw new BankCommandError(422, 'VALIDATION_ERROR');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => {});
        throw new BankCommandError(413, 'PAYLOAD_TOO_LARGE');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)); }
  catch { throw new BankCommandError(400, 'MALFORMED_JSON'); }
  try { return JSON.parse(text); }
  catch { throw new BankCommandError(400, 'MALFORMED_JSON'); }
}

function publicError(error) {
  if (error instanceof BankCommandError) {
    const aliases = new Map([
      ['PUBLICATION_DISABLED', 'FORBIDDEN'],
      ['ASSET_SANITIZATION_REQUIRED', 'VALIDATION_ERROR'],
      ['QUARANTINE_REQUIRES_HOLD', 'CONCURRENT_MODIFICATION'],
      ['CONTENT_HASH_MISMATCH', 'CONCURRENT_MODIFICATION'],
      ['WORKFLOW_CONFLICT', 'CONCURRENT_MODIFICATION'],
      ['INVALID_WORKFLOW_TRANSITION', 'CONCURRENT_MODIFICATION'],
      ['SOURCE_ORIGIN_UNKNOWN', 'VALIDATION_ERROR'],
      ['INVALID_REFERENCE_GRAPH', 'VALIDATION_ERROR'],
      ['REFERENCE_NOT_FOUND', 'VALIDATION_ERROR'],
      ['REFERENCE_HASH_MISMATCH', 'VALIDATION_ERROR'],
      ['REFERENCE_ID_CONFLICT', 'CONCURRENT_MODIFICATION'],
      ['SOURCE_REFERENCE_NOT_REGISTERED', 'VALIDATION_ERROR'],
      ['SOURCE_VERSION_NOT_FOUND', 'VALIDATION_ERROR'],
      ['RIGHTS_EVIDENCE_REQUIRED', 'RIGHTS_BLOCKED'],
      ['TAXONOMY_NOT_FOUND', 'VALIDATION_ERROR'],
      ['TAXONOMY_MEMBERSHIP_INVALID', 'VALIDATION_ERROR'],
      ['PARENT_REFERENCE_NOT_REGISTERED', 'VALIDATION_ERROR'],
      ['PARENT_REFERENCE_MISMATCH', 'VALIDATION_ERROR'],
      ['PARENT_IDENTITY_MISMATCH', 'VALIDATION_ERROR'],
      ['ASSET_NOT_FOUND', 'VALIDATION_ERROR'],
      ['ASSET_METADATA_INVALID', 'VALIDATION_ERROR'],
      ['ASSET_PURPOSE_MISMATCH', 'VALIDATION_ERROR'],
      ['RIGHTS_CHANGE_REQUIRES_HOLD', 'CONCURRENT_MODIFICATION'],
    ]);
    const code = aliases.get(error.code) ?? error.code;
    const allowedCodes = new Set([
      'VALIDATION_ERROR', 'UNAUTHENTICATED', 'FORBIDDEN', 'CSRF_FAILED', 'NOT_FOUND',
      'IDEMPOTENCY_CONFLICT', 'REVISION_CONFLICT',
      'CONCURRENT_MODIFICATION', 'CONSTRAINT_CONFLICT', 'RIGHTS_BLOCKED', 'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_TYPE', 'TEMPORARILY_UNAVAILABLE', 'MALFORMED_JSON',
    ]);
    if (code === 'NOT_FOUND') return { status: 404, code };
    if (code === 'PAYLOAD_TOO_LARGE') return { status: 413, code };
    if (code === 'MALFORMED_JSON') return { status: 400, code };
    if (!allowedCodes.has(code)) {
      return error.status >= 500
        ? { status: 503, code: 'TEMPORARILY_UNAVAILABLE' }
        : { status: 422, code: 'VALIDATION_ERROR' };
    }
    return { status: error.status, code };
  }
  if (error?.code === '23505') return { status: 409, code: 'CONCURRENT_MODIFICATION' };
  if (error?.code === '23503' || error?.code === '23514') return { status: 422, code: 'VALIDATION_ERROR' };
  return { status: 503, code: 'TEMPORARILY_UNAVAILABLE' };
}

const ERROR_MESSAGES = Object.freeze({
  MALFORMED_JSON: 'Request body is not valid JSON',
  NOT_FOUND: 'Resource not found',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  UNAUTHENTICATED: 'Authentication is required',
  FORBIDDEN: 'Access is not permitted',
  CSRF_FAILED: 'Request validation failed',
  VALIDATION_ERROR: 'Request is invalid',
  IDEMPOTENCY_CONFLICT: 'The idempotency key was already used for a different request',
  REVISION_CONFLICT: 'The resource has changed',
  CONCURRENT_MODIFICATION: 'The resource changed while processing the request',
  CONSTRAINT_CONFLICT: 'The request conflicts with a bank constraint',
  RIGHTS_BLOCKED: 'The rights record does not permit this operation',
  UNSUPPORTED_TYPE: 'The requested content type is not supported',
  TEMPORARILY_UNAVAILABLE: 'The request could not be completed',
});

function jsonResponse(status, body, requestId) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
      'X-Request-Id': requestId,
    },
  });
}

function errorResponse(status, code, requestId) {
  return jsonResponse(status, {
    error: {
      code,
      message: ERROR_MESSAGES[code] ?? 'The request could not be completed',
      requestId,
      details: {},
    },
  }, requestId);
}

/** Create the staff Bank boundary using its restricted pool and trusted identity service. */
export async function createBankHandler({ bankPool, identityService, trustedOrigin }) {
  if (!bankPool || !identityService || typeof identityService.authenticate !== 'function'
      || typeof identityService.validateMutation !== 'function') {
    throw new TypeError('A restricted Bank pool and local identity service are required');
  }
  const trusted = validateTrustedOrigin(trustedOrigin);
  const [sources, questions, publication] = await Promise.all([
    createSourceService({ bankPool, identityService }),
    createQuestionService({ bankPool, identityService }),
    createPublicationService({ bankPool, identityService }),
  ]);

  return async function handleBankRequest(request) {
    const requestId = randomUUID();
    try {
      if (!requestIsTrusted(request, trusted)) return errorResponse(403, 'FORBIDDEN', requestId);
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      if (method === 'GET' && url.pathname === '/api/v1/questions') {
        const principal = await identityService.authenticate(request);
        if (!principal) return errorResponse(401, 'UNAUTHENTICATED', requestId);
        const result = await questions.listQuestionSummaries(principal, url.searchParams);
        return jsonResponse(200, result, requestId);
      }

      if (method !== 'POST') return errorResponse(404, 'NOT_FOUND', requestId);
      const principal = await identityService.validateMutation(request);
      if (!principal) {
        const authenticated = await identityService.authenticate(request);
        return errorResponse(authenticated ? 403 : 401,
          authenticated ? 'CSRF_FAILED' : 'UNAUTHENTICATED', requestId);
      }
      if (url.search) throw new BankCommandError(422, 'VALIDATION_ERROR');
      const body = await readJson(request);
      const idempotencyKey = request.headers.get('idempotency-key');
      let result;
      if (url.pathname === '/api/v1/sources') {
        result = await sources.registerSource(principal, idempotencyKey, body);
      } else if ((result = url.pathname.match(/^\/api\/v1\/sources\/([0-9a-f-]+)\/versions$/))) {
        result = await sources.registerSourceVersion(principal, result[1], idempotencyKey, body);
      } else if ((result = url.pathname.match(/^\/api\/v1\/source-versions\/([0-9a-f-]+)\/rights$/))) {
        result = await sources.registerRightsDecision(principal, result[1], idempotencyKey, body);
      } else if (url.pathname === '/api/v1/questions') {
        result = await questions.createQuestionDraft(principal, idempotencyKey, body);
      } else if ((result = url.pathname.match(/^\/api\/v1\/questions\/([0-9a-f-]+)\/versions$/))) {
        result = await questions.createQuestionDraftVersion(principal, result[1], idempotencyKey, body);
      } else if ((result = url.pathname.match(/^\/api\/v1\/question-versions\/([0-9a-f-]+)\/submit-review$/))) {
        result = await publication.submitReview(principal, result[1], idempotencyKey, body);
      } else if ((result = url.pathname.match(/^\/api\/v1\/question-versions\/([0-9a-f-]+)\/reviews$/))) {
        result = await publication.review(principal, result[1], idempotencyKey, body);
      } else if ((result = url.pathname.match(/^\/api\/v1\/question-versions\/([0-9a-f-]+)\/quarantine$/))) {
        result = await publication.quarantine(principal, result[1], idempotencyKey, body);
      } else {
        return errorResponse(404, 'NOT_FOUND', requestId);
      }
      return jsonResponse(result.status, result.body, requestId);
    } catch (error) {
      const projected = publicError(error);
      return errorResponse(projected.status, projected.code, requestId);
    }
  };
}
