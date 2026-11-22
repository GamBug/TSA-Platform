// The one admin account of the local demo (owner decision 2026-11-22). It exists only on the loopback demo, never in
// public mode. The password is kept as a scrypt hash; DEMO_ADMIN_PASSWORD replaces it for one run. Sessions live in
// memory and end when the demo stops.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const ADMIN_USERNAME = 'AdminBao';
const DEFAULT_PASSWORD_HASH = 'scrypt:9990d051c1f7ff8feee3f26044d52043:f2f9fa5e07ef5a238089e2e07c6aa797869524df708f60b1c6f01192df52e085';
export const ADMIN_SESSION_COOKIE = 'tsa_admin_session';
const SESSION_MILLISECONDS = 8 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
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
export function createAdminAuth({ trustedOrigin, env = process.env, passwordHash, now = Date.now } = {}) {
  if (typeof trustedOrigin !== 'string' || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(trustedOrigin)) {
    throw new TypeError('The admin account exists only on a loopback http origin');
  }
  const storedHash = passwordHash ?? (env.DEMO_ADMIN_PASSWORD ? hashPassword(env.DEMO_ADMIN_PASSWORD) : DEFAULT_PASSWORD_HASH);
  const sessions = new Map();
  let failures = [];
  let lockedUntil = 0;

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
    login(request, { username, password }) {
      if (!fromLoopback(request) || request.headers.get('origin') !== trustedOrigin) return { ok: false, code: 'ORIGIN_REJECTED' };
      const time = now();
      if (lockedUntil > time) return { ok: false, code: 'LOCKED', retryAfterSeconds: Math.ceil((lockedUntil - time) / 1000) };
      const valid = typeof username === 'string' && typeof password === 'string'
        && sameText(username, ADMIN_USERNAME) && verifyPassword(password, storedHash);
      if (!valid) {
        failures = [...failures.filter((at) => at > time - LOCKOUT_MILLISECONDS), time];
        if (failures.length >= MAX_FAILURES) { lockedUntil = time + LOCKOUT_MILLISECONDS; failures = []; }
        return { ok: false, code: 'INVALID_CREDENTIALS' };
      }
      failures = [];
      const token = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      const expiresAt = time + SESSION_MILLISECONDS;
      sessions.set(token, { username: ADMIN_USERNAME, csrf, expiresAt });
      return { ok: true, token, csrf, expiresAt };
    },
    logout(session) { if (session?.token) sessions.delete(session.token); },
    cookie(token, expiresAt) {
      const maxAge = Math.max(0, Math.floor((expiresAt - now()) / 1000));
      return `${ADMIN_SESSION_COOKIE}=${token}; Path=/local/admin/; Max-Age=${maxAge}; SameSite=Strict; HttpOnly`;
    },
    clearedCookie: () => `${ADMIN_SESSION_COOKIE}=; Path=/local/admin/; Max-Age=0; SameSite=Strict; HttpOnly`,
  });
}
