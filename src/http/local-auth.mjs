import {
  LOCAL_CSRF_COOKIE,
  LOCAL_SESSION_HOURS,
  LOCAL_SESSION_COOKIE,
  bootstrapLocalSyntheticIdentity,
  createLocalSyntheticIdentityService,
  validateLocalSyntheticConfig,
} from '../modules/identity/local-synthetic.mjs';

const JSON_LIMIT = 1024;

function jsonResponse(status, payload, cookies = []) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}

function sessionCookies(token, csrf, maxAge = LOCAL_SESSION_HOURS * 60 * 60) {
  const attributes = `Path=/; Max-Age=${maxAge}; SameSite=Strict`;
  // Secure is omitted only because this handler accepts explicitly configured loopback HTTP origins.
  return [
    `${LOCAL_SESSION_COOKIE}=${token}; ${attributes}; HttpOnly`,
    `${LOCAL_CSRF_COOKIE}=${csrf}; ${attributes}`,
  ];
}

function clearedCookies() {
  return [
    `${LOCAL_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict; HttpOnly`,
    `${LOCAL_CSRF_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`,
  ];
}

async function readStrictActorKey(request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return { ok: false };
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > JSON_LIMIT)) {
    return { tooLarge: true };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false };
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > JSON_LIMIT) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || Object.keys(data).length !== 1 || Object.keys(data)[0] !== 'actorKey'
        || typeof data.actorKey !== 'string') return { ok: false };
    return { ok: true, actorKey: data.actorKey };
  } catch {
    return { ok: false };
  }
}

async function readStrictEmptyBody(request) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > JSON_LIMIT)) {
    return { tooLarge: true };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: declaredLength === null || declaredLength === '0' };
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > JSON_LIMIT) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
    if (total === 0) return { ok: true };
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return { ok: false };
    }
    return { ok: data !== null && typeof data === 'object' && !Array.isArray(data)
      && Object.keys(data).length === 0 };
  } catch {
    return { ok: false };
  }
}

function publicPrincipal(principal) {
  if (!principal) return null;
  return {
    authenticated: principal.authenticated,
    userId: principal.userId,
    actorKey: principal.actorKey,
    roles: principal.roles,
    expiresAt: principal.expiresAt,
  };
}

function genericUnavailable() {
  return jsonResponse(503, { error: 'LOCAL_AUTH_UNAVAILABLE' });
}

/** Validate the local-only boundary before returning an HTTP handler. */
export async function createLocalAuthHandler({ pool, env = process.env } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A configured PostgreSQL pool is required');
  }
  const trustedOrigin = validateLocalSyntheticConfig(env);
  const identity = await createLocalSyntheticIdentityService(pool, { env });

  return async function handleLocalAuth(request) {
    let requestOrigin;
    try { requestOrigin = new URL(request.url).origin; }
    catch { return jsonResponse(400, { error: 'BAD_REQUEST' }); }
    const suppliedHost = request.headers.get('host');
    const trustedHost = new URL(trustedOrigin).host;
    if (requestOrigin !== trustedOrigin || (suppliedHost && suppliedHost.toLowerCase() !== trustedHost.toLowerCase())) {
      return jsonResponse(403, { error: 'ORIGIN_REJECTED' });
    }
    const parsedRequestUrl = new URL(request.url);
    if (parsedRequestUrl.search) return jsonResponse(400, { error: 'INVALID_REQUEST' });
    const path = parsedRequestUrl.pathname;
    if (path !== '/local-auth/bootstrap' && path !== '/local-auth/session'
        && path !== '/local-auth/login' && path !== '/local-auth/logout') {
      return jsonResponse(404, { error: 'NOT_FOUND' });
    }

    try {
      if (request.method === 'GET' && path === '/local-auth/session') {
        const principal = await identity.authenticate(request);
        return jsonResponse(200, { authenticated: Boolean(principal?.authenticated), principal: publicPrincipal(principal) });
      }

      if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
      }
      if (request.headers.get('origin') !== trustedOrigin) {
        return jsonResponse(403, { error: 'ORIGIN_REJECTED' });
      }

      if (path === '/local-auth/bootstrap') {
        const principal = await identity.authenticate(request);
        if (principal) {
          const empty = await readStrictEmptyBody(request);
          if (empty.tooLarge) return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' });
          if (!empty.ok) return jsonResponse(400, { error: 'INVALID_REQUEST' });
          const checked = await identity.validateMutation(request);
          if (!checked) return jsonResponse(403, { error: 'CSRF_REJECTED' });
          return jsonResponse(200, { authenticated: checked.authenticated, principal: publicPrincipal(checked) });
        }
        const empty = await readStrictEmptyBody(request);
        if (empty.tooLarge) return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' });
        if (!empty.ok) return jsonResponse(400, { error: 'INVALID_REQUEST' });
        const session = await identity.createGuestSession();
        return jsonResponse(201, { authenticated: false, csrfToken: session.csrf },
          sessionCookies(session.token, session.csrf));
      }

      const principal = await identity.validateMutation(request);
      if (!principal) return jsonResponse(403, { error: 'CSRF_REJECTED' });

      if (path === '/local-auth/login') {
        if (principal.authenticated) return jsonResponse(409, { error: 'ALREADY_AUTHENTICATED' });
        const body = await readStrictActorKey(request);
        if (body.tooLarge) return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' });
        if (!body.ok) return jsonResponse(400, { error: 'INVALID_REQUEST' });
        const result = await identity.login(principal, body.actorKey);
        if (!result) return jsonResponse(400, { error: 'INVALID_ACTOR' });
        return jsonResponse(200, { authenticated: true, principal: publicPrincipal(result.principal) },
          sessionCookies(result.token, result.csrf));
      }

      const empty = await readStrictEmptyBody(request);
      if (empty.tooLarge) return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' });
      if (!empty.ok) return jsonResponse(400, { error: 'INVALID_REQUEST' });
      const revoked = await identity.revoke(principal);
      if (!revoked) return jsonResponse(401, { error: 'SESSION_UNAVAILABLE' }, clearedCookies());
      return jsonResponse(200, { authenticated: false }, clearedCookies());
    } catch {
      return genericUnavailable();
    }
  };
}

/** Explicit dev bootstrap; migrations intentionally leave the marker empty. */
export { bootstrapLocalSyntheticIdentity };
