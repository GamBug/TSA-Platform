import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { withTransaction } from '../database/pool.mjs';

export const LOCAL_SYNTHETIC_ISSUER = 'urn:tsa:local-synthetic';
export const LOCAL_SESSION_COOKIE = 'tsa_local_session';
export const LOCAL_CSRF_COOKIE = 'tsa_local_csrf';
export const LOCAL_SESSION_HOURS = 8;

export const LOCAL_SYNTHETIC_ACTORS = Object.freeze({
  studentA: Object.freeze({
    id: '00000000-0000-4000-8000-000000000101', subject: 'student-a',
    displayName: 'Synthetic Student A', roles: Object.freeze(['CANDIDATE']),
  }),
  studentB: Object.freeze({
    id: '00000000-0000-4000-8000-000000000102', subject: 'student-b',
    displayName: 'Synthetic Student B', roles: Object.freeze(['CANDIDATE']),
  }),
  author: Object.freeze({
    id: '00000000-0000-4000-8000-000000000201', subject: 'author',
    displayName: 'Synthetic Author', roles: Object.freeze(['AUTHOR']),
  }),
  reviewer: Object.freeze({
    id: '00000000-0000-4000-8000-000000000202', subject: 'reviewer',
    displayName: 'Synthetic Reviewer', roles: Object.freeze(['REVIEWER']),
  }),
  bankManager: Object.freeze({
    id: '00000000-0000-4000-8000-000000000203', subject: 'bank-manager',
    displayName: 'Synthetic Bank Manager', roles: Object.freeze(['BANK_MANAGER']),
  }),
  examManager: Object.freeze({
    id: '00000000-0000-4000-8000-000000000204', subject: 'exam-manager',
    displayName: 'Synthetic Exam Manager', roles: Object.freeze(['EXAM_MANAGER']),
  }),
  authorReviewer: Object.freeze({
    id: '00000000-0000-4000-8000-000000000205', subject: 'author-reviewer',
    displayName: 'Synthetic Author and Reviewer', roles: Object.freeze(['AUTHOR', 'REVIEWER']),
  }),
});

const POLICY_ROLES = Object.freeze({
  'candidate.attempt.read': ['CANDIDATE'],
  'candidate.attempt.save': ['CANDIDATE'],
  'bank.question.read': ['AUTHOR', 'REVIEWER', 'BANK_MANAGER'],
  'bank.diagnostics.read': ['BANK_MANAGER'],
  'bank.question.author': ['AUTHOR'],
  'bank.question.review': ['REVIEWER'],
  'exam.blueprint.write': ['EXAM_MANAGER'],
  'exam.assembly.write': ['EXAM_MANAGER'],
  'exam.fixed-form.read': ['EXAM_MANAGER'],
});

const SESSION_LIFETIME_SQL = "interval '8 hours'";
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TRUSTED_PRINCIPALS = new WeakSet();

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  if (isIP(host) === 4) return Number(host.split('.')[0]) === 127;
  return false;
}

export function validateLocalSyntheticConfig(env = process.env) {
  if (process.env.NODE_ENV !== undefined
      && !['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Local synthetic identity is disabled by the process NODE_ENV');
  }
  if (!['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('Local synthetic identity is restricted to NODE_ENV=development or test');
  }
  if (env.LOCAL_SYNTHETIC_ONLY !== 'true') {
    throw new Error('LOCAL_SYNTHETIC_ONLY=true is required for the local identity path');
  }
  const origin = env.LOCAL_AUTH_TRUSTED_ORIGIN;
  if (typeof origin !== 'string' || origin.length > 256) {
    throw new Error('LOCAL_AUTH_TRUSTED_ORIGIN must be an explicit HTTP loopback origin');
  }
  let parsed;
  try { parsed = new URL(origin); }
  catch { throw new Error('LOCAL_AUTH_TRUSTED_ORIGIN must be an explicit HTTP loopback origin'); }
  if (parsed.protocol !== 'http:' || !isLoopbackHost(parsed.hostname)
      || parsed.username || parsed.password || parsed.pathname !== '/' && parsed.pathname !== ''
      || parsed.search || parsed.hash || parsed.origin !== origin.replace(/\/$/, '')) {
    throw new Error('LOCAL_AUTH_TRUSTED_ORIGIN must be a canonical HTTP loopback origin');
  }
  return parsed.origin;
}

function cookieValues(request) {
  const values = new Map();
  const header = request.headers.get('cookie') ?? '';
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (values.has(name)) values.set(name, null);
    else values.set(name, value);
  }
  return values;
}

function hasTrustedRequestOrigin(request, trustedOrigin) {
  if (request.headers.get('origin') !== trustedOrigin) return false;
  const suppliedHost = request.headers.get('host');
  if (suppliedHost && suppliedHost.toLowerCase() !== new URL(trustedOrigin).host.toLowerCase()) return false;
  try {
    const requestOrigin = new URL(request.url).origin;
    return requestOrigin === trustedOrigin;
  } catch {
    return false;
  }
}

function safePrincipal(actor, roles, sessionId, expiresAt) {
  const principal = Object.freeze({
    sessionId,
    userId: actor?.id ?? null,
    actorKey: actor?.key ?? null,
    roles: Object.freeze([...roles].sort()),
    authenticated: actor !== null,
    expiresAt,
  });
  TRUSTED_PRINCIPALS.add(principal);
  return principal;
}

function normalizeActorRows(rows) {
  return rows.map((row) => ({ id: row.id, issuer: row.issuer, subject: row.subject }));
}

async function assertSafeIdentityConnection(pool) {
  const result = await pool.query(`
    SELECT session_user AS session_name, current_user AS current_name,
           session_role.rolsuper AS session_super, active_role.rolsuper AS current_super,
           session_role.rolcanlogin AS session_login,
           session_role.rolcreatedb AS session_createdb,
           session_role.rolcreaterole AS session_createrole,
           session_role.rolreplication AS session_replication,
           session_role.rolbypassrls AS session_bypassrls,
           active_role.rolcreatedb AS current_createdb,
           active_role.rolcreaterole AS current_createrole,
           active_role.rolreplication AS current_replication,
           active_role.rolbypassrls AS current_bypassrls,
           database_row.datdba = session_role.oid AS session_is_database_owner,
           database_row.datdba = active_role.oid AS current_is_database_owner,
           EXISTS (SELECT 1 FROM pg_namespace n
                    WHERE n.nspowner IN (session_role.oid, active_role.oid)
                      AND n.nspname IN ('tsa', 'tsa_private', 'tsa_meta')) AS owns_project_schema,
           EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relowner IN (session_role.oid, active_role.oid)
                      AND n.nspname IN ('tsa', 'tsa_private', 'tsa_meta')
                      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS owns_project_relation,
           EXISTS (SELECT 1 FROM pg_auth_members m
                    WHERE m.member = session_role.oid
                      AND m.roleid <> (SELECT oid FROM pg_roles WHERE rolname = 'tsa_identity'))
             AS has_other_role_membership,
           pg_has_role(session_user, 'tsa_identity', 'MEMBER') AS identity_member
      FROM pg_roles session_role
      JOIN pg_roles active_role ON active_role.rolname = current_user
      JOIN pg_database database_row ON database_row.datname = current_database()
     WHERE session_role.rolname = session_user
  `);
  const row = result.rows[0];
  if (!row || !row.session_login || row.session_super || row.current_super
      || row.session_createdb || row.session_createrole || row.session_replication || row.session_bypassrls
      || row.current_createdb || row.current_createrole || row.current_replication || row.current_bypassrls
      || row.session_is_database_owner || row.current_is_database_owner
      || row.owns_project_schema || row.owns_project_relation
      || row.has_other_role_membership
      || row.session_name !== row.current_name || !row.identity_member) {
    throw new Error('Local identity runtime requires a non-owner LOGIN member of tsa_identity');
  }
  return true;
}

async function assertSyntheticOnlyDatabase(pool) {
  return withTransaction(pool, async (client) => {
    const marker = await client.query(
      'SELECT profile, seed_version FROM tsa_private.local_synthetic_environment WHERE singleton');
    if (marker.rows.length !== 1 || marker.rows[0].profile !== 'SYNTHETIC_ONLY'
        || marker.rows[0].seed_version !== 'local-identity/1') {
      throw new Error('Database is not explicitly initialized as SYNTHETIC_ONLY');
    }
    const result = await client.query(
      'SELECT id, issuer, subject FROM tsa.users ORDER BY id');
    const actual = normalizeActorRows(result.rows);
    const expected = Object.values(LOCAL_SYNTHETIC_ACTORS)
      .map(({ id, subject }) => ({ id, issuer: LOCAL_SYNTHETIC_ISSUER, subject }))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('Database contains an unknown or modified identity; local synthetic mode is refused');
    }
    return true;
  }, { role: 'tsa_identity' });
}

export async function bootstrapLocalSyntheticIdentity(pool, { env = process.env } = {}) {
  validateLocalSyntheticConfig(env);
  const connection = await pool.query(`
    SELECT current_user AS current_name, role_row.rolsuper AS is_superuser,
           database_row.datdba = role_row.oid AS is_database_owner
      FROM pg_roles role_row
      JOIN pg_database database_row ON database_row.datname = current_database()
     WHERE role_row.rolname = current_user
  `);
  const bootstrapRole = connection.rows[0];
  if (!bootstrapRole || (!bootstrapRole.is_superuser && !bootstrapRole.is_database_owner)) {
    throw new Error('Explicit synthetic bootstrap requires the database migration owner connection');
  }

  return withTransaction(pool, async (client) => {
    const marker = await client.query(
      'SELECT profile, seed_version FROM tsa_private.local_synthetic_environment WHERE singleton FOR UPDATE');
    if (marker.rows.length === 0) {
      const existing = await client.query('SELECT count(*)::integer AS count FROM tsa.users');
      if (existing.rows[0].count !== 0) {
        throw new Error('Synthetic-only bootstrap refuses a database that already contains users');
      }
      for (const actor of Object.values(LOCAL_SYNTHETIC_ACTORS)) {
        await client.query(
          `INSERT INTO tsa.users (id, issuer, subject, display_name)
           VALUES ($1, $2, $3, $4)`,
          [actor.id, LOCAL_SYNTHETIC_ISSUER, actor.subject, actor.displayName]);
        for (const role of actor.roles) {
          await client.query('INSERT INTO tsa.user_roles (user_id, role) VALUES ($1, $2::tsa.user_role)',
            [actor.id, role]);
        }
      }
      await client.query(
        `INSERT INTO tsa_private.local_synthetic_environment (singleton, profile, seed_version)
         VALUES (true, 'SYNTHETIC_ONLY', 'local-identity/1')`);
      return { initialized: true };
    }
    if (marker.rows[0].profile !== 'SYNTHETIC_ONLY' || marker.rows[0].seed_version !== 'local-identity/1') {
      throw new Error('Existing synthetic environment marker is unsupported');
    }
    const actualResult = await client.query('SELECT id, issuer, subject FROM tsa.users ORDER BY id');
    const actual = normalizeActorRows(actualResult.rows);
    const expected = Object.values(LOCAL_SYNTHETIC_ACTORS)
      .map(({ id, subject }) => ({ id, issuer: LOCAL_SYNTHETIC_ISSUER, subject }))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('Synthetic reseed refuses unknown or modified identities');
    }
    return { initialized: false };
  });
}

async function insertSession(pool, { token, csrf, userId = null }) {
  const id = randomUUID();
  const result = await withTransaction(pool, async (client) => client.query(
    `WITH timestamp_value AS MATERIALIZED (SELECT clock_timestamp() AS created_at)
     INSERT INTO tsa_private.local_auth_sessions
      (id, token_hash, csrf_hash, user_id, created_at, expires_at)
     SELECT $1, $2, $3, $4, timestamp_value.created_at,
            timestamp_value.created_at + ${SESSION_LIFETIME_SQL}
       FROM timestamp_value
     RETURNING expires_at`,
    [id, digest(token), digest(csrf), userId]), { role: 'tsa_identity' });
  return { id, expiresAt: result.rows[0].expires_at };
}

async function createGuestSession(pool) {
  const token = createOpaqueToken();
  const csrf = createOpaqueToken();
  const session = await insertSession(pool, { token, csrf });
  return { ...session, token, csrf };
}

async function sessionByToken(pool, token) {
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `SELECT s.id, s.user_id, s.csrf_hash, s.expires_at, s.revoked_at,
              u.issuer, u.subject, u.display_name, u.disabled_at
         FROM tsa_private.local_auth_sessions s
         LEFT JOIN tsa.users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > clock_timestamp()`, [digest(token)]);
    const row = result.rows[0];
    if (!row || row.revoked_at || (row.user_id && row.disabled_at)) return null;
    let actor = null;
    let roles = [];
    if (row.user_id) {
      actor = Object.entries(LOCAL_SYNTHETIC_ACTORS)
        .map(([key, value]) => ({ ...value, key }))
        .find((value) => value.id === row.user_id && value.subject === row.subject
          && row.issuer === LOCAL_SYNTHETIC_ISSUER);
      if (!actor) return null;
      const roleRows = await client.query('SELECT role FROM tsa.user_roles WHERE user_id = $1 ORDER BY role', [row.user_id]);
      roles = roleRows.rows.map((item) => item.role);
    }
    return {
      principal: safePrincipal(actor, roles, row.id, row.expires_at),
      csrfHash: row.csrf_hash,
    };
  }, { role: 'tsa_identity' });
}

async function authenticateLocalRequest(pool, request) {
  const cookies = cookieValues(request);
  const token = cookies.get(LOCAL_SESSION_COOKIE);
  if (!token || !SESSION_TOKEN_PATTERN.test(token)) return null;
  const session = await sessionByToken(pool, token);
  return session?.principal ?? null;
}

function mayPerform(principal, policyName, context = {}) {
  if (!TRUSTED_PRINCIPALS.has(principal) || !principal.authenticated || !Array.isArray(principal.roles)) return false;
  const required = POLICY_ROLES[policyName];
  if (!required || !required.some((role) => principal.roles.includes(role))) return false;
  if (policyName === 'bank.question.review') {
    if (typeof context.authorId !== 'string' || context.authorId === principal.userId) return false;
    for (const attributedUserId of [context.operatorId, context.factoryAuthorId]) {
      if (attributedUserId !== undefined && attributedUserId !== null
          && (typeof attributedUserId !== 'string' || attributedUserId === principal.userId)) return false;
    }
  }
  return true;
}

function isCanonicalUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

async function loadOwnedAttempt(pool, principal, attemptId) {
  if (!TRUSTED_PRINCIPALS.has(principal) || !mayPerform(principal, 'candidate.attempt.read') || !isCanonicalUuid(attemptId)
      || !isCanonicalUuid(principal.userId)) return null;
  return withTransaction(pool, async (client) => {
    await client.query("SELECT set_config('tsa.local_user_id', $1, true)", [principal.userId]);
    const result = await client.query(
      `SELECT a.id, a.user_id, a.form_id, a.form_mode, a.state, f.owner_user_id
         FROM tsa.attempts a JOIN tsa.forms f ON f.id = a.form_id
        WHERE a.id = $1 AND a.user_id = $2
          AND ((a.form_mode = 'PUBLISHED_FIXED' AND a.personal_owner_reference IS NULL
                AND f.owner_user_id IS NULL)
               OR (a.form_mode = 'PERSONALIZED_PRACTICE'
                   AND a.personal_owner_reference = a.user_id AND f.owner_user_id = a.user_id))`,
      [attemptId, principal.userId]);
    return result.rows[0] ?? null;
  }, { role: 'tsa_identity' });
}

async function withOwnedAttempt(pool, principal, attemptId, onAuthorized) {
  if (typeof onAuthorized !== 'function') throw new TypeError('Authorized operation callback is required');
  const attempt = await loadOwnedAttempt(pool, principal, attemptId);
  if (!attempt) return { found: false };
  return { found: true, value: await onAuthorized(attempt) };
}

function requestHasTrustedOrigin(request, env = process.env) {
  let trustedOrigin;
  try { trustedOrigin = validateLocalSyntheticConfig(env); }
  catch { return false; }
  return hasTrustedRequestOrigin(request, trustedOrigin);
}

async function validateLocalMutation(pool, request, env = process.env) {
  if (!requestHasTrustedOrigin(request, env)) return null;
  const cookies = cookieValues(request);
  const sessionToken = cookies.get(LOCAL_SESSION_COOKIE);
  const csrfCookie = cookies.get(LOCAL_CSRF_COOKIE);
  const csrfHeader = request.headers.get('x-csrf-token');
  if (!sessionToken || !csrfCookie || !csrfHeader || csrfCookie !== csrfHeader
      || !SESSION_TOKEN_PATTERN.test(csrfHeader)) return null;
  const session = await sessionByToken(pool, sessionToken);
  if (!session) return null;
  const suppliedHash = Buffer.from(digest(csrfHeader));
  const storedHash = Buffer.from(session.csrfHash);
  if (suppliedHash.length !== storedHash.length || !timingSafeEqual(suppliedHash, storedHash)) return null;
  return session.principal;
}

async function loginSyntheticActor(pool, guestPrincipal, actorKey) {
  const actor = Object.hasOwn(LOCAL_SYNTHETIC_ACTORS, actorKey) ? LOCAL_SYNTHETIC_ACTORS[actorKey] : null;
  if (!actor || !TRUSTED_PRINCIPALS.has(guestPrincipal) || guestPrincipal.authenticated) return null;
  const token = createOpaqueToken();
  const csrf = createOpaqueToken();
  return withTransaction(pool, async (client) => {
    const guest = await client.query(
      `SELECT id, user_id, revoked_at, expires_at, expires_at > clock_timestamp() AS active
         FROM tsa_private.local_auth_sessions WHERE id = $1 FOR UPDATE`, [guestPrincipal.sessionId]);
    const guestRow = guest.rows[0];
    if (!guestRow || guestRow.user_id !== null || guestRow.revoked_at || !guestRow.active) return null;
    const actorResult = await client.query(
      `SELECT u.disabled_at, u.issuer, u.subject, r.role
         FROM tsa.users u LEFT JOIN tsa.user_roles r ON r.user_id = u.id
        WHERE u.id = $1 ORDER BY r.role`, [actor.id]);
    const actorRows = actorResult.rows;
    if (actorRows.length === 0 || actorRows[0].disabled_at
        || actorRows[0].issuer !== LOCAL_SYNTHETIC_ISSUER || actorRows[0].subject !== actor.subject) return null;
    const roles = actorRows.map((row) => row.role).filter(Boolean);
    if (roles.length === 0) return null;
    await client.query('UPDATE tsa_private.local_auth_sessions SET revoked_at = clock_timestamp() WHERE id = $1',
      [guestPrincipal.sessionId]);
    const newSession = await client.query(
      `WITH timestamp_value AS MATERIALIZED (SELECT clock_timestamp() AS created_at)
       INSERT INTO tsa_private.local_auth_sessions
        (id, token_hash, csrf_hash, user_id, created_at, expires_at)
       SELECT $1, $2, $3, $4, timestamp_value.created_at,
              timestamp_value.created_at + ${SESSION_LIFETIME_SQL}
         FROM timestamp_value
       RETURNING id, expires_at`,
      [randomUUID(), digest(token), digest(csrf), actor.id]);
    return {
      token,
      csrf,
      principal: safePrincipal({ ...actor, key: actorKey }, roles, newSession.rows[0].id,
        newSession.rows[0].expires_at),
    };
  }, { role: 'tsa_identity' });
}

async function revokeLocalSession(pool, principal) {
  if (!TRUSTED_PRINCIPALS.has(principal) || !principal.sessionId) return false;
  return withTransaction(pool, async (client) => {
    const result = await client.query(
      `UPDATE tsa_private.local_auth_sessions SET revoked_at = clock_timestamp()
        WHERE id = $1 AND revoked_at IS NULL`, [principal.sessionId]);
    return result.rowCount === 1;
  }, { role: 'tsa_identity' });
}

/** Validate the process, connection and database before exposing local auth operations. */
export async function createLocalSyntheticIdentityService(pool, { env = process.env } = {}) {
  validateLocalSyntheticConfig(env);
  await assertSafeIdentityConnection(pool);
  await assertSyntheticOnlyDatabase(pool);
  return Object.freeze({
    createGuestSession: () => createGuestSession(pool),
    authenticate: (request) => authenticateLocalRequest(pool, request),
    validateMutation: (request) => validateLocalMutation(pool, request, env),
    login: (principal, actorKey) => loginSyntheticActor(pool, principal, actorKey),
    revoke: (principal) => revokeLocalSession(pool, principal),
    mayPerform,
    loadOwnedAttempt: (principal, attemptId) => loadOwnedAttempt(pool, principal, attemptId),
    withOwnedAttempt: (principal, attemptId, operation) => withOwnedAttempt(pool, principal, attemptId, operation),
  });
}

