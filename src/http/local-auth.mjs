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

function sessionCookies(token, csrf, maxAge = LOCAL_SESSION_HOURS * 60 * 60, { publicOrigin = false } = {}) {
  // Secure is omitted only because the local handler accepts explicitly configured loopback HTTP origins.
  // Behind the public HTTPS origin the cookies are Secure and Lax, so a shared link keeps its guest.
  const attributes = publicOrigin ? `Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure` : `Path=/; Max-Age=${maxAge}; SameSite=Strict`;
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

export const GUEST_POOL_EXHAUSTED_MESSAGE = 'Bản demo đã đủ lượt truy cập, vui lòng thử lại sau.';

/**
 * Validate the local-only boundary before returning an HTTP handler.
 * `publicGuests` ({ guestPool, limiter }) selects the public demo profile: only
 * GET /local-auth/session and POST /local-auth/guest exist; every other path is a 404.
 */
export async function createLocalAuthHandler({ pool, env = process.env, publicGuests = null, guestPool = 0 } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('A configured PostgreSQL pool is required');
  }
  if (publicGuests !== null && (typeof publicGuests?.limiter?.take !== 'function' || !Number.isSafeInteger(publicGuests.guestPool))) {
    throw new TypeError('publicGuests requires a guestPool size and a limiter');
  }
  const trustedOrigin = validateLocalSyntheticConfig(env);
  // `guestPool` without `publicGuests` is the staff profile on a database that carries guests;
  // it exists only for startup work and is never routed to visitors.
  const identity = await createLocalSyntheticIdentityService(pool, publicGuests
    ? { env, guestPool: publicGuests.guestPool } : { env, guestPool, guestsOnly: false });

  async function handleGuest(request, context) {
    const principal = await identity.authenticate(request);
    const empty = await readStrictEmptyBody(request);
    if (empty.tooLarge) return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' });
    if (!empty.ok) return jsonResponse(400, { error: 'INVALID_REQUEST' });
    if (principal?.authenticated) {
      // This browser already holds a guest: resume it. The CSRF cookie stays the client's copy.
      const checked = await identity.validateMutation(request);
      if (!checked) return jsonResponse(403, { error: 'CSRF_REJECTED' });
      return jsonResponse(200, { authenticated: true, principal: publicPrincipal(checked) });
    }
    const verdict = publicGuests.limiter.take(context.clientIp ?? 'unknown');
    if (!verdict.allowed) {
      return new Response(JSON.stringify({ error: 'GUEST_RATE_LIMITED' }), { status: 429, headers: {
        'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'retry-after': String(verdict.retryAfterSeconds) } });
    }
    const session = await identity.startGuestSession();
    if (!session) return jsonResponse(503, { error: 'GUEST_POOL_EXHAUSTED', message: GUEST_POOL_EXHAUSTED_MESSAGE });
    return jsonResponse(201, { authenticated: true, principal: publicPrincipal(session.principal), csrfToken: session.csrf },
      sessionCookies(session.token, session.csrf, undefined, { publicOrigin: true }));
  }

  return async function handleLocalAuth(request, context = {}) {
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
    const knownPaths = publicGuests ? ['/local-auth/session', '/local-auth/guest']
      : ['/local-auth/bootstrap', '/local-auth/session', '/local-auth/login', '/local-auth/logout'];
    if (!knownPaths.includes(path)) return jsonResponse(404, { error: 'NOT_FOUND' });

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

      if (path === '/local-auth/guest') return await handleGuest(request, context);

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
