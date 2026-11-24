// The one admin account (owner decisions 2026-11-22 and 2026-11-24): full access on the loopback demo, view-only on the
// public site. The password is kept as a scrypt hash; DEMO_ADMIN_PASSWORD replaces it for one run. Sessions live in
// memory and end when the demo stops. Behind the public proxy, requests arrive mapped to the loopback origin.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const ADMIN_USERNAME = 'AdminBao';
const DEFAULT_PASSWORD_HASH = 'scrypt:9990d051c1f7ff8feee3f26044d52043:f2f9fa5e07ef5a238089e2e07c6aa797869524df708f60b1c6f01192df52e085';
export const ADMIN_SESSION_COOKIE = 'tsa_admin_session';
const SESSION_MILLISECONDS = 8 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
// Wrong passwords lock one client address; this many from all addresses together lock every sign-in.
const MAX_FAILURES_ALL = 50;
const LOCKOUT_MILLISECONDS = 15 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function hashPassword(password, salt = randomBytes(16)) {
  return `scrypt:${salt.toString('hex')}:${scryptSync(String(password), salt, 32).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex || typeof password !== 'string' || password.length > 200) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

function sameText(left, right) {
  const a = Buffer.from(String(left)), b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request, name) {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/**
 * Admin sessions for one loopback origin. `passwordHash` defaults to the owner's chosen password, or to a hash of
 * env.DEMO_ADMIN_PASSWORD when that is set.
 */
export function createAdminAuth({ trustedOrigin, env = process.env, passwordHash, now = Date.now, secureCookie = false } = {}) {
  if (typeof trustedOrigin !== 'string' || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(trustedOrigin)) {
    throw new TypeError('The admin account exists only on a loopback http origin');
  }
  const storedHash = passwordHash ?? (env.DEMO_ADMIN_PASSWORD ? hashPassword(env.DEMO_ADMIN_PASSWORD) : DEFAULT_PASSWORD_HASH);
  const sessions = new Map();
  // Failure times and lock ends per client address ('*' counts every address).
  const failures = new Map();
  const lockedUntil = new Map();
  const recordFailure = (key, limit, time) => {
    const recent = [...(failures.get(key) ?? []).filter((at) => at > time - LOCKOUT_MILLISECONDS), time];
    if (recent.length >= limit) { lockedUntil.set(key, time + LOCKOUT_MILLISECONDS); failures.delete(key); } else failures.set(key, recent);
  };

  const fromLoopback = (request) => {
    try { return new URL(request.url).origin === trustedOrigin; } catch { return false; }
  };

  function current(request) {
    if (!fromLoopback(request)) return null;
    const token = cookieValue(request, ADMIN_SESSION_COOKIE);
    if (!token || !TOKEN.test(token)) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= now()) { sessions.delete(token); return null; }
    return { ...session, token };
  }

  return Object.freeze({
    /** The session of this request, or null. */
    session: current,
    /** The session of a state-changing request: same origin and the CSRF header of that session. */
    mutation(request) {
      const session = current(request);
      if (!session || request.headers.get('origin') !== trustedOrigin) return null;
      const csrf = request.headers.get('x-admin-csrf');
      return csrf && sameText(csrf, session.csrf) ? session : null;
    },
    /** Returns { ok, token, csrf, expiresAt } or { ok: false, code, retryAfterSeconds? }. */
    login(request, { username, password }, clientIp = null) {
      if (!fromLoopback(request) || request.headers.get('origin') !== trustedOrigin) return { ok: false, code: 'ORIGIN_REJECTED' };
      const time = now();
      const client = typeof clientIp === 'string' && clientIp ? clientIp : 'local';
      for (const [key, until] of lockedUntil) if (until <= time) lockedUntil.delete(key);
      const lockEnd = Math.max(lockedUntil.get(client) ?? 0, lockedUntil.get('*') ?? 0);
      if (lockEnd > time) return { ok: false, code: 'LOCKED', retryAfterSeconds: Math.ceil((lockEnd - time) / 1000) };
      const valid = typeof username === 'string' && typeof password === 'string'
        && sameText(username, ADMIN_USERNAME) && verifyPassword(password, storedHash);
      if (!valid) {
        recordFailure(client, MAX_FAILURES, time);
        recordFailure('*', MAX_FAILURES_ALL, time);
        return { ok: false, code: 'INVALID_CREDENTIALS' };
      }
      failures.delete(client);
      const token = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      const expiresAt = time + SESSION_MILLISECONDS;
      sessions.set(token, { username: ADMIN_USERNAME, csrf, expiresAt });
      return { ok: true, token, csrf, expiresAt };
    },
    logout(session) { if (session?.token) sessions.delete(session.token); },
    cookie(token, expiresAt) {
      const maxAge = Math.max(0, Math.floor((expiresAt - now()) / 1000));
      return `${ADMIN_SESSION_COOKIE}=${token}; Path=/local/admin/; Max-Age=${maxAge}; SameSite=Strict; HttpOnly${secureCookie ? '; Secure' : ''}`;
    },
    clearedCookie: () => `${ADMIN_SESSION_COOKIE}=; Path=/local/admin/; Max-Age=0; SameSite=Strict; HttpOnly${secureCookie ? '; Secure' : ''}`,
  });
}
