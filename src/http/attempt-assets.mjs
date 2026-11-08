import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { types } from 'node:util';
import { studentRouteRegistry } from '../../packages/contracts/dist/internal.js';
import { BankCommandError } from '../modules/bank/common.mjs';

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ASSET_PATH = /^\/api\/v1\/attempts\/([^/]+)\/assets\/([^/]+)$/;
const SAFE_ERROR_MESSAGES = Object.freeze({
  UNAUTHENTICATED: 'Authentication is required',
  FORBIDDEN: 'Access is not permitted',
  NOT_FOUND: 'Resource not found',
  CONTENT_WITHDRAWN: 'Content is unavailable',
  PAYLOAD_TOO_LARGE: 'Asset is too large',
  VALIDATION_ERROR: 'Request is invalid',
  TIMEOUT: 'The request could not be completed',
  TEMPORARILY_UNAVAILABLE: 'The request could not be completed',
});
const SERVICE_ERRORS = new Map([
  [401, new Set(['UNAUTHENTICATED'])],
  [403, new Set(['FORBIDDEN'])],
  [404, new Set(['NOT_FOUND'])],
  [410, new Set(['CONTENT_WITHDRAWN'])],
  [413, new Set(['PAYLOAD_TOO_LARGE'])],
  [422, new Set(['VALIDATION_ERROR'])],
  [503, new Set(['TIMEOUT', 'TEMPORARILY_UNAVAILABLE'])],
]);

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
    throw new TypeError('Attempt asset HTTP is restricted to a canonical HTTP loopback origin');
  }
  return parsed.origin;
}

function requestIsTrusted(request, trustedOrigin) {
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== trustedOrigin || requestUrl.username || requestUrl.password || requestUrl.hash) return false;
    const trusted = new URL(trustedOrigin);
    const host = request.headers.get('host');
    if (host && host.toLowerCase() !== trusted.host.toLowerCase()) return false;
    const origin = request.headers.get('origin');
    return origin === null || origin === trustedOrigin;
  } catch {
    return false;
  }
}

function safeHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'",
  };
}

function errorResponse(status, code, requestId) {
  const definition = studentRouteRegistry.attemptAsset.responses[status];
  const body = {
    error: {
      code,
      message: SAFE_ERROR_MESSAGES[code] ?? SAFE_ERROR_MESSAGES.TEMPORARILY_UNAVAILABLE,
      requestId,
      details: {},
    },
  };
  const parsed = definition?.schema?.safeParse(body);
  if (!parsed?.success) {
    if (status !== 503) return errorResponse(503, 'TEMPORARILY_UNAVAILABLE', requestId);
    return new Response(JSON.stringify({
      error: {
        code: 'TEMPORARILY_UNAVAILABLE',
        message: SAFE_ERROR_MESSAGES.TEMPORARILY_UNAVAILABLE,
        requestId,
        details: {},
      },
    }), { status: 503, headers: safeHeaders() });
  }
  return new Response(JSON.stringify(parsed.data), { status, headers: safeHeaders() });
}

function serviceErrorResponse(error, requestId) {
  if (error instanceof BankCommandError && SERVICE_ERRORS.get(error.status)?.has(error.code)) {
    return errorResponse(error.status, error.code, requestId);
  }
  return errorResponse(503, 'TEMPORARILY_UNAVAILABLE', requestId);
}

function exactAssetResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(value);
  const fields = ['bytes', 'mediaType', 'byteSize'];
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.includes(key))) return null;
  const result = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    result[field] = descriptor.value;
  }
  return result;
}

function validateAssetResult(value) {
  const result = exactAssetResult(value);
  if (!result || !Buffer.isBuffer(result.bytes) || !ALLOWED_MEDIA_TYPES.has(result.mediaType)
      || types.isProxy(result.bytes) || Object.getPrototypeOf(result.bytes) !== Buffer.prototype
      || result.bytes.buffer instanceof SharedArrayBuffer || !Number.isSafeInteger(result.byteSize)) return { error: 'invalid' };
  if (result.byteSize > MAX_ASSET_BYTES || result.bytes.byteLength > MAX_ASSET_BYTES) return { error: 'too-large' };
  if (result.byteSize < 1 || result.byteSize !== result.bytes.byteLength) return { error: 'invalid' };
  return { value: result };
}

/** Serve one owned attempt asset through the frozen, private student route. */
export function createAttemptAssetHandler({ identityService, trustedOrigin, assetService, apiVersion = 'v1' } = {}) {
  if (!identityService || typeof identityService.authenticate !== 'function'
      || typeof identityService.mayPerform !== 'function') {
    throw new TypeError('A trusted identity service is required');
  }
  const trusted = validateTrustedOrigin(trustedOrigin);
  if (!['v1', 'v2'].includes(apiVersion)) throw new TypeError('Unsupported asset API version');

  return async function handleAttemptAssetRequest(request) {
    const requestId = randomUUID();
    try {
      if (!requestIsTrusted(request, trusted)) return errorResponse(403, 'FORBIDDEN', requestId);
      const url = new URL(request.url);
      const match = request.method === 'GET' && url.pathname.startsWith(`/api/${apiVersion}/`)
        ? url.pathname.replace(`/api/${apiVersion}/`, '/api/v1/').match(ASSET_PATH) : null;
      if (!match) return errorResponse(404, 'NOT_FOUND', requestId);

      const principal = await identityService.authenticate(request);
      if (!principal) return errorResponse(401, 'UNAUTHENTICATED', requestId);
      if (!identityService.mayPerform(principal, 'candidate.attempt.read')) {
        return errorResponse(403, 'FORBIDDEN', requestId);
      }

      const params = studentRouteRegistry.attemptAsset.params.safeParse({ id: match[1], assetVersionId: match[2] });
      const queryKeys = [...url.searchParams.keys()];
      const purposes = url.searchParams.getAll('purpose');
      const query = studentRouteRegistry.attemptAsset.query.safeParse({ purpose: purposes[0] });
      if (!params.success || queryKeys.length !== 1 || queryKeys[0] !== 'purpose' || purposes.length !== 1 || !query.success) {
        return errorResponse(422, 'VALIDATION_ERROR', requestId);
      }
      if (url.search !== `?purpose=${query.data.purpose}`) return errorResponse(422, 'VALIDATION_ERROR', requestId);

      if (typeof assetService?.read !== 'function') return errorResponse(404, 'NOT_FOUND', requestId);
      const { id: attemptId, assetVersionId } = params.data;
      const { purpose } = query.data;
      const output = await assetService.read(principal, attemptId, assetVersionId, purpose);
      const checked = validateAssetResult(output);
      if (checked.error === 'too-large') return errorResponse(413, 'PAYLOAD_TOO_LARGE', requestId);
      if (checked.error) return errorResponse(503, 'TEMPORARILY_UNAVAILABLE', requestId);

      const { bytes, mediaType, byteSize } = checked.value;
      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: {
          ...safeHeaders(mediaType),
          'Content-Length': String(byteSize),
        },
      });
    } catch (error) {
      return serviceErrorResponse(error, requestId);
    }
  };
}
