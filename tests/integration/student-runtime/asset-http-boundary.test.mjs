import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createAttemptAssetHandler } from '../../../src/http/attempt-assets.mjs';
import { BankCommandError } from '../../../src/modules/bank/common.mjs';

const TRUSTED_ORIGIN = 'http://127.0.0.1:4174';
const PRINCIPAL = Object.freeze({ userId: randomUUID(), authenticated: true });
const ATTEMPT_ID = randomUUID();
const ASSET_VERSION_ID = randomUUID();
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

function makeIdentity({ principal = PRINCIPAL, allowed = true } = {}) {
  const calls = { authenticate: 0, policies: [] };
  return {
    calls,
    service: {
      authenticate: async () => { calls.authenticate += 1; return principal; },
      mayPerform: (value, policy) => { calls.policies.push([value, policy]); return allowed; },
    },
  };
}

function makeRequest(path = `/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}?purpose=question`, {
  origin = TRUSTED_ORIGIN,
  requestOrigin = TRUSTED_ORIGIN,
  host = '127.0.0.1:4174',
  method = 'GET',
  extraHeaders = {},
} = {}) {
  const headers = new Headers({ host });
  if (origin !== null) headers.set('origin', origin);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Request(`${requestOrigin}${path}`, { method, headers });
}

async function errorBody(response) {
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'details', 'message', 'requestId']);
  assert.deepEqual(body.error.details, {});
  assert.ok(body.error.requestId);
  return body.error;
}

test('asset handler authenticates, authorizes, and returns the complete bounded byte body with private headers', async () => {
  const identity = makeIdentity();
  const reads = [];
  const handler = createAttemptAssetHandler({
    identityService: identity.service,
    trustedOrigin: TRUSTED_ORIGIN,
    assetService: { read: async (...args) => { reads.push(args); return { bytes: PNG_BYTES, mediaType: 'image/png', byteSize: PNG_BYTES.byteLength }; } },
  });

  const response = await handler(makeRequest(undefined, { method: 'GET', origin: TRUSTED_ORIGIN }));
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG_BYTES);
  assert.deepEqual(reads, [[PRINCIPAL, ATTEMPT_ID, ASSET_VERSION_ID, 'question']]);
  assert.equal(identity.calls.authenticate, 1);
  assert.deepEqual(identity.calls.policies, [[PRINCIPAL, 'candidate.attempt.read']]);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('content-length'), String(PNG_BYTES.byteLength));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
  assert.equal(response.headers.get('access-control-allow-origin'), null);

  const ranged = await handler(makeRequest(undefined, { method: 'GET', origin: TRUSTED_ORIGIN, extraHeaders: { range: 'bytes=0-1' } }));
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), PNG_BYTES, 'a Range request is answered with the entire bounded asset');
  assert.equal(ranged.headers.get('content-range'), null);
});

test('asset handler delegates ownership and release decisions and projects service errors safely', async () => {
  const identity = makeIdentity();
  const calls = [];
  const handler = createAttemptAssetHandler({
    identityService: identity.service,
    trustedOrigin: TRUSTED_ORIGIN,
    assetService: { read: async (...args) => {
      calls.push(args);
      const error = new BankCommandError(404, 'NOT_FOUND');
      error.privateMetadata = 'private object path and explanation marker';
      throw error;
    } },
  });

  const response = await handler(makeRequest(`/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}?purpose=explanation`));
  assert.equal(response.status, 404);
  assert.deepEqual(calls, [[PRINCIPAL, ATTEMPT_ID, ASSET_VERSION_ID, 'explanation']]);
  const body = await errorBody(response);
  assert.equal(body.code, 'NOT_FOUND');
  assert.equal(body.message, 'Resource not found');
  assert.doesNotMatch(JSON.stringify(body), /private object path|explanation marker/);
});

test('asset handler denies unauthenticated and unauthorized callers before service access', async () => {
  let reads = 0;
  const unauthenticated = makeIdentity({ principal: null });
  const unauthenticatedHandler = createAttemptAssetHandler({ identityService: unauthenticated.service, trustedOrigin: TRUSTED_ORIGIN,
    assetService: { read: async () => { reads += 1; } } });
  const noPrincipal = await unauthenticatedHandler(makeRequest());
  assert.equal(noPrincipal.status, 401);
  assert.equal((await errorBody(noPrincipal)).code, 'UNAUTHENTICATED');

  const denied = makeIdentity({ allowed: false });
  const deniedHandler = createAttemptAssetHandler({ identityService: denied.service, trustedOrigin: TRUSTED_ORIGIN,
    assetService: { read: async () => { reads += 1; } } });
  const forbidden = await deniedHandler(makeRequest());
  assert.equal(forbidden.status, 403);
  assert.equal((await errorBody(forbidden)).code, 'FORBIDDEN');
  assert.equal(reads, 0);
});

test('asset handler rejects malformed UUID paths, missing, duplicate, extra, and invalid query values', async () => {
  let reads = 0;
  const identity = makeIdentity();
  const handler = createAttemptAssetHandler({ identityService: identity.service, trustedOrigin: TRUSTED_ORIGIN,
    assetService: { read: async () => { reads += 1; return { bytes: PNG_BYTES, mediaType: 'image/png', byteSize: PNG_BYTES.length }; } } });
  const paths = [
    `/api/v1/attempts/not-a-uuid/assets/${ASSET_VERSION_ID}?purpose=question`,
    `/api/v1/attempts/${ATTEMPT_ID}/assets/not-a-uuid?purpose=question`,
    `/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}`,
    `/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}?purpose=question&purpose=question`,
    `/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}?purpose=question&extra=1`,
    `/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}?purpose=question&`,
    `/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}?purpose=%71uestion`,
    `/api/v1/attempts/${ATTEMPT_ID}/assets/${ASSET_VERSION_ID}?purpose=QUESTION`,
  ];
  for (const path of paths) {
    const response = await handler(makeRequest(path));
    assert.equal(response.status, 422, path);
    assert.equal((await errorBody(response)).code, 'VALIDATION_ERROR');
  }
  assert.equal(reads, 0);
});

test('asset handler rejects untrusted origins and host headers', async () => {
  let reads = 0;
  const identity = makeIdentity();
  const handler = createAttemptAssetHandler({ identityService: identity.service, trustedOrigin: TRUSTED_ORIGIN,
    assetService: { read: async () => { reads += 1; return { bytes: PNG_BYTES, mediaType: 'image/png', byteSize: PNG_BYTES.length }; } } });
  const requests = [
    makeRequest(undefined, { origin: 'https://attacker.example' }),
    makeRequest(undefined, { host: 'localhost:4174' }),
    makeRequest(undefined, { requestOrigin: 'http://localhost:4174' }),
  ];
  for (const request of requests) {
    const response = await handler(request);
    assert.equal(response.status, 403);
    assert.equal((await errorBody(response)).code, 'FORBIDDEN');
  }
  assert.equal(reads, 0);

  for (const origin of ['https://127.0.0.1:4174', 'http://192.168.1.20:4174', 'http://user@127.0.0.1:4174']) {
    assert.throws(() => createAttemptAssetHandler({ identityService: identity.service, trustedOrigin: origin }), TypeError);
  }
});

test('asset handler returns the frozen safe not-found envelope when the service is absent', async () => {
  const identity = makeIdentity();
  const handler = createAttemptAssetHandler({ identityService: identity.service, trustedOrigin: TRUSTED_ORIGIN });
  const response = await handler(makeRequest());
  assert.equal(response.status, 404);
  assert.equal((await errorBody(response)).code, 'NOT_FOUND');
});

test('asset handler rejects malformed service output and enforces the 2 MiB boundary', async () => {
  const identity = makeIdentity();
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
  const cases = [
    { output: { bytes: PNG_BYTES, mediaType: 'image/svg+xml', byteSize: PNG_BYTES.length }, status: 503 },
    { output: { bytes: PNG_BYTES, mediaType: 'image/png', byteSize: PNG_BYTES.length + 1 }, status: 503 },
    { output: { bytes: new Uint8Array(PNG_BYTES), mediaType: 'image/png', byteSize: PNG_BYTES.length }, status: 503 },
    { output: { bytes: PNG_BYTES, mediaType: 'image/png', byteSize: PNG_BYTES.length, sourceUri: 'private' }, status: 503 },
    { output: { bytes: oversized, mediaType: 'image/png', byteSize: oversized.length }, status: 413 },
  ];
  for (const { output, status } of cases) {
    const handler = createAttemptAssetHandler({ identityService: identity.service, trustedOrigin: TRUSTED_ORIGIN,
      assetService: { read: async () => output } });
    const response = await handler(makeRequest());
    assert.equal(response.status, status);
    const body = await errorBody(response);
    assert.equal(body.code, status === 413 ? 'PAYLOAD_TOO_LARGE' : 'TEMPORARILY_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(body), /sourceUri|private/);
  }
});

test('asset handler converts unexpected service failures to a safe unavailable envelope', async () => {
  const identity = makeIdentity();
  const handler = createAttemptAssetHandler({ identityService: identity.service, trustedOrigin: TRUSTED_ORIGIN,
    assetService: { read: async () => { throw new Error('secret hash and private storage path'); } } });
  const response = await handler(makeRequest());
  assert.equal(response.status, 503);
  const body = await errorBody(response);
  assert.equal(body.code, 'TEMPORARILY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(body), /secret hash|private storage path/);
});
