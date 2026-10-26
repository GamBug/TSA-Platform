import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import {
  ErrorHttpStatusByCode,
  studentRouteRegistry,
} from '../../packages/contracts/dist/internal.js';
import { createHttpBoundaryHandler } from '../../packages/contracts/dist/internal.js';
import { BankCommandError } from '../modules/bank/common.mjs';
import { createAttemptService } from '../modules/attempts/service.mjs';
import { createStudentDirectoryService } from '../modules/attempts/directory.mjs';

const MAX_JSON_BYTES = 64 * 1024;

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
      || parsed.pathname !== '/' || parsed.search || parsed.hash
      || parsed.origin !== trustedOrigin.replace(/\/$/, '')) {
    throw new TypeError('Attempt HTTP is restricted to a canonical HTTP loopback origin');
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

function routeResponse(operation, status, body, requestId, extraHeaders = {}) {
  const definition = studentRouteRegistry[operation]?.responses?.[status];
  const parsed = definition?.schema?.safeParse(body);
  if (!parsed?.success) {
    const unavailable = {
      error: {
        code: 'TEMPORARILY_UNAVAILABLE',
        message: 'The request could not be completed',
        requestId,
        details: {},
      },
    };
    return new Response(JSON.stringify(unavailable), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Origin',
        'X-Request-Id': requestId,
      },
    });
  }
  return new Response(JSON.stringify(parsed.data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
      'X-Request-Id': requestId,
      ...extraHeaders,
    },
  });
}

function safeError(error, operation) {
  if (error instanceof BankCommandError) {
    const code = typeof error.code === 'string' ? error.code : 'TEMPORARILY_UNAVAILABLE';
    const status = ErrorHttpStatusByCode[code] ?? ({
      NOT_FOUND: 404,
      FORM_NOT_OPEN: 409,
      FORM_UNAVAILABLE: 410,
      MALFORMED_JSON: 400,
      PAYLOAD_TOO_LARGE: 413,
    })[code];
    if (status && studentRouteRegistry[operation]?.responses?.[status]) {
      const details = error.details ?? {};
      const message = code === 'FORM_NOT_OPEN' ? 'The form is not open'
        : code === 'FORM_UNAVAILABLE' ? 'The form is unavailable'
          : code === 'IDEMPOTENCY_CONFLICT' ? 'The idempotency key conflicts with an earlier request'
            : code === 'RATE_LIMITED'
              ? (operation === 'saveAnswer' ? 'Too many answer save requests' : 'Too many creation requests')
              : code === 'UNAUTHENTICATED' ? 'Authentication is required'
                : code === 'FORBIDDEN' ? 'Access is not permitted'
                  : code === 'CSRF_FAILED' ? 'Request validation failed'
                    : code === 'NOT_FOUND' ? 'Resource not found'
                      : code === 'MALFORMED_JSON' ? 'Request body is not valid JSON'
                        : code === 'PAYLOAD_TOO_LARGE' ? 'Request body is too large'
                          : code === 'VALIDATION_ERROR' ? 'Request is invalid'
                            : 'The request could not be completed';
      return { status, body: { error: { code, message, requestId: '', details } }, retryAfter: details.retryAfterSeconds };
    }
  }
  return {
    status: 503,
    body: { error: { code: 'TEMPORARILY_UNAVAILABLE', message: 'The request could not be completed', requestId: '', details: {} } },
  };
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
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new BankCommandError(400, 'MALFORMED_JSON'); }
}

/** Loopback-only student create/start/save/submit/GET adapter using frozen routes. */
export function createAttemptHandler({ examPool, identityService, trustedOrigin, createRate, saveRate, enableReviewPractice = false, enableFixedPractice = false, enableShortPractice = false } = {}) {
  if (!identityService || typeof identityService.authenticate !== 'function'
      || typeof identityService.validateMutation !== 'function'
      || typeof identityService.mayPerform !== 'function') {
    throw new TypeError('A trusted identity service is required');
  }
  const trusted = validateTrustedOrigin(trustedOrigin);
  const service = createAttemptService({ examPool, identityService, createRate, saveRate, enableReviewPractice, enableFixedPractice, enableShortPractice });
  const directory = createStudentDirectoryService({ examPool, identityService, enableReviewPractice, enableFixedPractice, enableShortPractice });

  return async function handleAttemptRequest(request) {
    const requestId = randomUUID();
    let operation = 'createAttempt';
    try {
      if (!requestIsTrusted(request, trusted)) {
        return routeResponse(operation, 403, {
          error: { code: 'FORBIDDEN', message: 'Access is not permitted', requestId, details: {} },
        }, requestId);
      }
      const url = new URL(request.url);
      const method = request.method.toUpperCase();

      if (method === 'GET' && (url.pathname === '/api/v1/catalog' || url.pathname === '/api/v1/attempts')) {
        const isCatalog = url.pathname === '/api/v1/catalog';
        operation = isCatalog ? 'catalog' : 'attemptHistory';
        const principal = await identityService.authenticate(request);
        if (!principal) {
          return routeResponse(operation, 401, {
            error: { code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId, details: {} },
          }, requestId);
        }
        const page = isCatalog
          ? await directory.catalog(principal, url.searchParams)
          : await directory.history(principal, url.searchParams);
        return routeResponse(operation, 200, page, requestId);
      }

      if (method === 'GET' && /^\/api\/v1\/attempts\/[^/]+(?:\/result)?$/.test(url.pathname)) {
        const principal = await identityService.authenticate(request);
        if (!principal) {
          return routeResponse('getAttempt', 401, {
            error: { code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId, details: {} },
          }, requestId);
        }
        return await service.withReadBoundary(principal, async (ports) => {
          const boundary = createHttpBoundaryHandler({
            authenticate: async () => principal,
            ...ports,
          });
          return boundary(request);
        });
      }

      if (method === 'PUT') {
        operation = 'saveAnswer';
        const saveMatch = url.pathname.match(/^\/api\/v1\/attempts\/([^/]+)\/answers\/([^/]+)$/);
        if (!saveMatch) return routeResponse(operation, 404, {
          error: { code: 'NOT_FOUND', message: 'Resource not found', requestId, details: {} },
        }, requestId);
        if (url.search !== '') throw new BankCommandError(422, 'VALIDATION_ERROR');

        const principal = await identityService.validateMutation(request);
        if (!principal) {
          const authenticated = await identityService.authenticate(request);
          const code = authenticated ? 'CSRF_FAILED' : 'UNAUTHENTICATED';
          const status = authenticated ? 403 : 401;
          const message = authenticated ? 'Request validation failed' : 'Authentication is required';
          return routeResponse(operation, status, { error: { code, message, requestId, details: {} } }, requestId);
        }
        if (!identityService.mayPerform(principal, 'candidate.attempt.read')) {
          return routeResponse(operation, 403, {
            error: { code: 'FORBIDDEN', message: 'Access is not permitted', requestId, details: {} },
          }, requestId);
        }

        const key = request.headers.get('idempotency-key');
        const body = await readJson(request);
        const result = await service.save(principal, saveMatch[1], saveMatch[2], key, body);
        return routeResponse(operation, result.status, result.body, requestId, result.status === 429
          ? { 'Retry-After': String(result.body?.error?.details?.retryAfterSeconds ?? 1) }
          : {});
      }

      if (method !== 'POST') return routeResponse('createAttempt', 404, {
        error: { code: 'NOT_FOUND', message: 'Resource not found', requestId, details: {} },
      }, requestId);
      if (url.search !== '') throw new BankCommandError(422, 'VALIDATION_ERROR');

      const startMatch = url.pathname.match(/^\/api\/v1\/attempts\/([^/]+)\/start$/);
      const submitMatch = url.pathname.match(/^\/api\/v1\/attempts\/([^/]+)\/submit$/);
      const isCreate = url.pathname === '/api/v1/attempts';
      if (!isCreate && !startMatch && !submitMatch) return routeResponse('createAttempt', 404, {
        error: { code: 'NOT_FOUND', message: 'Resource not found', requestId, details: {} },
      }, requestId);
      operation = isCreate ? 'createAttempt' : startMatch ? 'startAttempt' : 'submitAttempt';

      const principal = await identityService.validateMutation(request);
      if (!principal) {
        const authenticated = await identityService.authenticate(request);
        const code = authenticated ? 'CSRF_FAILED' : 'UNAUTHENTICATED';
        const status = authenticated ? 403 : 401;
        const message = authenticated ? 'Request validation failed' : 'Authentication is required';
        return routeResponse(operation, status, { error: { code, message, requestId, details: {} } }, requestId);
      }
      if (!identityService.mayPerform(principal, 'candidate.attempt.read')) {
        return routeResponse(operation, 403, {
          error: { code: 'FORBIDDEN', message: 'Access is not permitted', requestId, details: {} },
        }, requestId);
      }

      const key = request.headers.get('idempotency-key');
      const body = await readJson(request);
      const result = isCreate
        ? await service.create(principal, key, body)
        : startMatch
          ? await service.start(principal, startMatch[1], key, body)
          : await service.submit(principal, submitMatch[1], key, body);
      return routeResponse(operation, result.status, result.body, requestId, result.status === 429
        ? { 'Retry-After': String(result.body?.error?.details?.retryAfterSeconds ?? 1) }
        : {});
    } catch (error) {
      const mapped = safeError(error, operation);
      mapped.body.error.requestId = requestId;
      const headers = mapped.status === 429
        ? { 'Retry-After': String(Number.isSafeInteger(mapped.retryAfter) && mapped.retryAfter > 0 ? mapped.retryAfter : 1) }
        : {};
      return routeResponse(operation, mapped.status, mapped.body, requestId, headers);
    }
  };
}
