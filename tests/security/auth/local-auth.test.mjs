import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createLocalAuthHandler } from '../../../src/http/local-auth.mjs';
import {
  LOCAL_CSRF_COOKIE,
  LOCAL_SESSION_COOKIE,
  LOCAL_SYNTHETIC_ACTORS,
  bootstrapLocalSyntheticIdentity,
  createLocalSyntheticIdentityService,
} from '../../../src/modules/identity/local-synthetic.mjs';
import { createAttempt, createForm, seedExamFoundation } from '../../integration/database/foundation/exam-fixtures.mjs';
import { browserFrom, cookieValue, createAuthHarness, request, requestWithHost } from './harness.mjs';

let harness;
let markerRefused;
let markerWasBootstrapped;
let attemptIds;

before(async () => {
  harness = await createAuthHarness();
  markerRefused = harness.markerRefused;
  markerWasBootstrapped = harness.initialization.initialized === true;
  const seed = await seedExamFoundation(harness.ownerPool);
  const form = await createForm(harness.ownerPool, seed);
  attemptIds = {
    studentA: await createAttempt(harness.ownerPool, form, LOCAL_SYNTHETIC_ACTORS.studentA.id),
    studentB: await createAttempt(harness.ownerPool, form, LOCAL_SYNTHETIC_ACTORS.studentB.id),
  };
  await harness.ownerPool.query('DELETE FROM tsa.users WHERE id = $1', [seed.actorId]);
});

after(async () => {
  if (harness) await harness.close();
});

async function loginActor(actorKey) {
  const challenge = await request(harness, '/local-auth/bootstrap', { method: 'POST', body: {} });
  assert.equal(challenge.status, 201);
  const browser = browserFrom(challenge);
  const login = await request(harness, '/local-auth/login', {
    method: 'POST', cookies: browser.cookies, csrf: browser.csrf, body: { actorKey },
  });
  assert.equal(login.status, 200);
  const authenticated = browserFrom(login);
  assert.notEqual(authenticated.cookies[0], browser.cookies[0], 'login rotates the session token');
  return { ...authenticated, response: login };
}

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

test('marker bootstrap and startup reject unapproved environment or connection modes', async () => {
  assert.equal(markerRefused, true);
  assert.equal(markerWasBootstrapped, true);
  const seededActors = await harness.ownerPool.query(
    `SELECT u.subject, COALESCE(array_agg(r.role::text ORDER BY r.role::text)
              FILTER (WHERE r.role IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM tsa.users u LEFT JOIN tsa.user_roles r ON r.user_id = u.id
      GROUP BY u.id ORDER BY u.subject`);
  assert.deepEqual(seededActors.rows.map(({ subject, roles }) => [subject, roles]), [
    ['author', ['AUTHOR']],
    ['author-reviewer', ['AUTHOR', 'REVIEWER']],
    ['bank-manager', ['BANK_MANAGER']],
    ['exam-manager', ['EXAM_MANAGER']],
    ['reviewer', ['REVIEWER']],
    ['student-a', ['CANDIDATE']],
    ['student-b', ['CANDIDATE']],
  ]);
  await assert.rejects(createLocalAuthHandler({
    pool: harness.authPool,
    env: { ...harness.env, NODE_ENV: 'production', LOCAL_SYNTHETIC_ONLY: 'true' },
  }), /NODE_ENV/);
  await assert.rejects(createLocalSyntheticIdentityService(harness.authPool, {
    env: { ...harness.env, NODE_ENV: 'unknown' },
  }), /NODE_ENV/);
  const moduleUrl = new URL('../../../src/modules/identity/local-synthetic.mjs', import.meta.url).href;
  const processModeCheck = spawnSync(process.execPath, [
    '--input-type=module', '-e',
    `import { validateLocalSyntheticConfig } from ${JSON.stringify(moduleUrl)}; validateLocalSyntheticConfig({ NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:4173' });`,
  ], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 5_000 });
  assert.notEqual(processModeCheck.status, 0);
  assert.match(processModeCheck.stderr, /disabled by the process NODE_ENV/);
  await assert.rejects(createLocalSyntheticIdentityService(harness.authPool, {
    env: { ...harness.env, LOCAL_AUTH_TRUSTED_ORIGIN: 'http://example.test' },
  }), /loopback origin/);
  await assert.rejects(createLocalSyntheticIdentityService(harness.authPool, {
    env: { ...harness.env, LOCAL_SYNTHETIC_ONLY: 'false' },
  }), /LOCAL_SYNTHETIC_ONLY/);

  await assert.rejects(createLocalAuthHandler({ pool: harness.ownerPool, env: harness.env }), /non-owner LOGIN/);
  await harness.ownerPool.query('CREATE ROLE auth_createdb LOGIN CREATEDB');
  await harness.ownerPool.query('GRANT tsa_identity TO auth_createdb');
  const elevatedPool = createDatabasePool({ ...harness.database.connectionConfig, user: 'auth_createdb' });
  try {
    await assert.rejects(createLocalSyntheticIdentityService(elevatedPool, { env: harness.env }), /non-owner LOGIN/);
  } finally {
    await elevatedPool.end();
  }
  await harness.ownerPool.query('CREATE ROLE auth_extra_role LOGIN');
  await harness.ownerPool.query('GRANT tsa_identity, tsa_bank TO auth_extra_role');
  const mixedRolePool = createDatabasePool({ ...harness.database.connectionConfig, user: 'auth_extra_role' });
  try {
    await assert.rejects(createLocalSyntheticIdentityService(mixedRolePool, { env: harness.env }), /non-owner LOGIN/);
  } finally {
    await mixedRolePool.end();
  }

  const foreignId = randomUUID();
  await harness.ownerPool.query(
    `INSERT INTO tsa.users (id, issuer, subject, display_name)
     VALUES ($1, 'untrusted-issuer', 'untrusted-subject', 'untrusted')`, [foreignId]);
  await assert.rejects(createLocalSyntheticIdentityService(harness.authPool, { env: harness.env }), /unknown or modified identity/);
  await harness.ownerPool.query('DELETE FROM tsa.users WHERE id = $1', [foreignId]);
});

test('loopback HTTP login enforces exact origin, host, CSRF, and actorKey-only JSON', async () => {
  const badBootstrap = await request(harness, '/local-auth/bootstrap', {
    method: 'POST', body: { role: 'BANK_MANAGER' },
  });
  assert.equal(badBootstrap.status, 400);
  const badOrigin = await request(harness, '/local-auth/bootstrap', {
    method: 'POST', origin: 'http://evil.example', body: {},
  });
  assert.equal(badOrigin.status, 403);

  const challenge = await request(harness, '/local-auth/bootstrap', { method: 'POST', body: {} });
  assert.equal(challenge.status, 201);
  assert.equal(challenge.headers.get('access-control-allow-origin'), null);
  const guest = browserFrom(challenge);
  const sessionCookie = guest.cookies.find((cookie) => cookie.startsWith(`${LOCAL_SESSION_COOKIE}=`));
  const csrfCookie = guest.cookies.find((cookie) => cookie.startsWith(`${LOCAL_CSRF_COOKIE}=`));
  assert.match(challenge.headers.getSetCookie().find((cookie) => cookie.startsWith(`${LOCAL_SESSION_COOKIE}=`)), /HttpOnly/);
  assert.match(challenge.headers.getSetCookie().find((cookie) => cookie.startsWith(`${LOCAL_SESSION_COOKIE}=`)), /SameSite=Strict/);
  assert.doesNotMatch(challenge.headers.getSetCookie().find((cookie) => cookie.startsWith(`${LOCAL_CSRF_COOKIE}=`)), /HttpOnly/);
  assert.ok(sessionCookie && csrfCookie);

  const noCsrf = await request(harness, '/local-auth/login', {
    method: 'POST', cookies: guest.cookies, body: { actorKey: 'studentA' },
    // A present Origin alone is not a CSRF token.
  });
  assert.equal(noCsrf.status, 403);
  const wrongCsrf = await request(harness, '/local-auth/login', {
    method: 'POST', cookies: guest.cookies, csrf: 'A'.repeat(43), body: { actorKey: 'studentA' },
  });
  assert.equal(wrongCsrf.status, 403);
  const oversized = await request(harness, '/local-auth/login', {
    method: 'POST', cookies: guest.cookies, csrf: guest.csrf,
    body: { actorKey: 'studentA', extra: 'x'.repeat(1100) },
  });
  assert.equal(oversized.status, 413);
  const hostSpoof = await requestWithHost(harness, '/local-auth/login', 'evil.example', {
    method: 'POST', cookies: guest.cookies, csrf: guest.csrf, body: { actorKey: 'studentA' },
  });
  assert.equal(hostSpoof.status, 403);
  const unknownFields = await request(harness, '/local-auth/login', {
    method: 'POST', cookies: guest.cookies, csrf: guest.csrf,
    body: {
      actorKey: 'studentA', userId: LOCAL_SYNTHETIC_ACTORS.studentB.id,
      role: 'BANK_MANAGER', issuer: 'x', audience: 'x', redirect: '/',
    },
  });
  assert.equal(unknownFields.status, 400);
  const unknownActor = await request(harness, '/local-auth/login', {
    method: 'POST', cookies: guest.cookies, csrf: guest.csrf, body: { actorKey: 'student-c' },
  });
  assert.equal(unknownActor.status, 400);

  const login = await request(harness, '/local-auth/login', {
    method: 'POST', cookies: guest.cookies, csrf: guest.csrf, body: { actorKey: 'studentA' },
  });
  assert.equal(login.status, 200);
  const body = await login.json();
  assert.equal(body.principal.userId, LOCAL_SYNTHETIC_ACTORS.studentA.id);
  assert.deepEqual(body.principal.roles, ['CANDIDATE']);
  assert.equal(Object.hasOwn(body.principal, 'sessionId'), false);
  assert.equal(Object.hasOwn(body.principal, 'csrfHash'), false);
  const authenticated = browserFrom(login);
  assert.notEqual(authenticated.cookies[0], guest.cookies[0]);

  const stored = await harness.ownerPool.query(
    'SELECT token_hash, csrf_hash FROM tsa_private.local_auth_sessions WHERE user_id = $1 AND revoked_at IS NULL',
    [LOCAL_SYNTHETIC_ACTORS.studentA.id]);
  assert.equal(stored.rows.length, 1);
  assert.equal(stored.rows[0].token_hash, hash(cookieValue(authenticated.cookies[0])));
  assert.equal(stored.rows[0].csrf_hash, hash(authenticated.csrf));
  assert.notEqual(stored.rows[0].token_hash, cookieValue(authenticated.cookies[0]));

  const session = await request(harness, '/local-auth/session', { cookies: authenticated.cookies, origin: null });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).principal.userId, LOCAL_SYNTHETIC_ACTORS.studentA.id);

  const badLogoutBody = await request(harness, '/local-auth/logout', {
    method: 'POST', cookies: authenticated.cookies, csrf: authenticated.csrf, body: { role: 'EXAM_MANAGER' },
  });
  assert.equal(badLogoutBody.status, 400);
  const logout = await request(harness, '/local-auth/logout', {
    method: 'POST', cookies: authenticated.cookies, csrf: authenticated.csrf, body: {},
  });
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().every((cookie) => /Max-Age=0/.test(cookie)));
  const afterLogout = await request(harness, '/local-auth/session', { cookies: authenticated.cookies });
  assert.equal((await afterLogout.json()).authenticated, false);
});

test('ownership helper returns indistinguishable 404s and performs no foreign save side effects', async () => {
  const browser = await loginActor('studentA');
  const own = await request(harness, `/__test/attempts/${attemptIds.studentA}`, { cookies: browser.cookies });
  assert.equal(own.status, 200);
  const unknownId = randomUUID();
  const foreign = await request(harness, `/__test/attempts/${attemptIds.studentB}`, { cookies: browser.cookies });
  const unknown = await request(harness, `/__test/attempts/${unknownId}`, { cookies: browser.cookies });
  assert.equal(foreign.status, 404);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await foreign.json(), await unknown.json());

  const malformed = await harness.identity.withOwnedAttempt(
    (await harness.identity.authenticate(new Request(`${harness.origin}/`, {
      headers: { cookie: browser.cookies.join('; ') },
    }))), 'not-a-uuid', async () => assert.fail('malformed ID must not invoke authorized operation'));
  assert.deepEqual(malformed, { found: false });
  const forged = { authenticated: true, userId: LOCAL_SYNTHETIC_ACTORS.studentB.id, roles: ['CANDIDATE'] };
  assert.equal(harness.identity.mayPerform(forged, 'candidate.attempt.read'), false);
  let forgedCallback = false;
  const forgedResult = await harness.identity.withOwnedAttempt(forged, attemptIds.studentB, async () => {
    forgedCallback = true;
  });
  assert.deepEqual(forgedResult, { found: false });
  assert.equal(forgedCallback, false);

  const before = await harness.ownerPool.query('SELECT count(*)::int AS count FROM tsa.rate_limit_buckets');
  const foreignSave = await request(harness, `/__test/attempts/${attemptIds.studentB}/save`, {
    method: 'POST', cookies: browser.cookies, csrf: browser.csrf, body: {},
  });
  const unknownSave = await request(harness, `/__test/attempts/${unknownId}/save`, {
    method: 'POST', cookies: browser.cookies, csrf: browser.csrf, body: {},
  });
  assert.equal(foreignSave.status, 404);
  assert.equal(unknownSave.status, 404);
  assert.deepEqual(await foreignSave.json(), await unknownSave.json());
  const afterDenied = await harness.ownerPool.query('SELECT count(*)::int AS count FROM tsa.rate_limit_buckets');
  assert.equal(afterDenied.rows[0].count, before.rows[0].count);
  const ownSave = await request(harness, `/__test/attempts/${attemptIds.studentA}/save`, {
    method: 'POST', cookies: browser.cookies, csrf: browser.csrf, body: {},
  });
  assert.equal(ownSave.status, 200);
  const afterOwn = await harness.ownerPool.query('SELECT count(*)::int AS count FROM tsa.rate_limit_buckets');
  assert.equal(afterOwn.rows[0].count, before.rows[0].count + 1);
});

test('session checks honor current roles, disabled users, expiry, and non-restoring reseed', async () => {
  const authorReviewer = await loginActor('authorReviewer');
  const principal = await harness.identity.authenticate(new Request(`${harness.origin}/local-auth/session`, {
    headers: { cookie: authorReviewer.cookies.join('; ') },
  }));
  assert.equal(harness.identity.mayPerform(principal, 'bank.question.review', {}), false);
  assert.equal(harness.identity.mayPerform(principal, 'bank.question.review', {
    authorId: principal.userId,
  }), false);
  assert.equal(harness.identity.mayPerform(principal, 'bank.question.review', {
    authorId: LOCAL_SYNTHETIC_ACTORS.author.id, operatorId: principal.userId,
  }), false);
  assert.equal(harness.identity.mayPerform(principal, 'bank.question.review', {
    authorId: LOCAL_SYNTHETIC_ACTORS.author.id, factoryAuthorId: principal.userId,
  }), false);
  assert.equal(harness.identity.mayPerform(principal, 'bank.question.review', {
    authorId: LOCAL_SYNTHETIC_ACTORS.author.id,
  }), true);
  assert.equal(harness.identity.mayPerform(principal, 'bank.diagnostics.read'), false);
  assert.equal(harness.identity.mayPerform(principal, 'candidate.attempt.read'), false);
  const examManager = await loginActor('examManager');
  const examPrincipal = await harness.identity.authenticate(new Request(`${harness.origin}/local-auth/session`, {
    headers: { cookie: examManager.cookies.join('; ') },
  }));
  assert.equal(harness.identity.mayPerform(examPrincipal, 'bank.diagnostics.read'), false);
  const bankManager = await loginActor('bankManager');
  const bankPrincipal = await harness.identity.authenticate(new Request(`${harness.origin}/local-auth/session`, {
    headers: { cookie: bankManager.cookies.join('; ') },
  }));
  assert.equal(harness.identity.mayPerform(bankPrincipal, 'bank.diagnostics.read'), true);
  assert.equal(harness.identity.mayPerform(bankPrincipal, 'unknown.policy'), false);

  await harness.ownerPool.query(
    `DELETE FROM tsa.user_roles WHERE user_id = $1 AND role = 'REVIEWER'`, [principal.userId]);
  const changedRoles = await request(harness, '/local-auth/session', { cookies: authorReviewer.cookies });
  const changedPrincipal = (await changedRoles.json()).principal;
  assert.deepEqual(changedPrincipal.roles, ['AUTHOR']);
  const currentPrincipal = await harness.identity.authenticate(new Request(`${harness.origin}/local-auth/session`, {
    headers: { cookie: authorReviewer.cookies.join('; ') },
  }));
  assert.equal(harness.identity.mayPerform(currentPrincipal, 'bank.question.review', {
    authorId: LOCAL_SYNTHETIC_ACTORS.author.id,
  }), false);

  const disabledBrowser = await loginActor('studentB');
  await harness.ownerPool.query('UPDATE tsa.users SET disabled_at = clock_timestamp() WHERE id = $1',
    [LOCAL_SYNTHETIC_ACTORS.studentB.id]);
  const disabledSession = await request(harness, '/local-auth/session', { cookies: disabledBrowser.cookies });
  assert.deepEqual(await disabledSession.json(), { authenticated: false, principal: null });

  const expiredToken = randomBytes(32).toString('base64url');
  const expiredCsrf = randomBytes(32).toString('base64url');
  const expiredSessionId = randomUUID();
  await harness.ownerPool.query(
    `INSERT INTO tsa_private.local_auth_sessions
      (id, token_hash, csrf_hash, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4, clock_timestamp() - interval '9 hours', clock_timestamp() - interval '2 hours')`,
    [expiredSessionId, hash(expiredToken), hash(expiredCsrf), LOCAL_SYNTHETIC_ACTORS.studentA.id]);
  const expired = await request(harness, '/local-auth/session', {
    cookies: [`${LOCAL_SESSION_COOKIE}=${expiredToken}`, `${LOCAL_CSRF_COOKIE}=${expiredCsrf}`],
  });
  assert.deepEqual(await expired.json(), { authenticated: false, principal: null });

  const reseed = await bootstrapLocalSyntheticIdentity(harness.ownerPool, { env: harness.env });
  assert.deepEqual(reseed, { initialized: false });
  const unchanged = await harness.ownerPool.query(
    `SELECT u.disabled_at, count(r.role)::int AS roles
       FROM tsa.users u LEFT JOIN tsa.user_roles r ON r.user_id = u.id
      WHERE u.id = $1 GROUP BY u.id`, [LOCAL_SYNTHETIC_ACTORS.studentB.id]);
  assert.ok(unchanged.rows[0].disabled_at);
  const removed = await harness.ownerPool.query(
    `SELECT count(*)::int AS count FROM tsa.user_roles WHERE user_id = $1 AND role = 'REVIEWER'`,
    [LOCAL_SYNTHETIC_ACTORS.authorReviewer.id]);
  assert.equal(removed.rows[0].count, 0);
});

test('service database role has bounded access and other service roles cannot read sessions', async () => {
  for (const role of ['tsa_web', 'tsa_bank', 'tsa_factory', 'tsa_exam']) {
    const loginRole = `auth_check_${role.slice(4)}`;
    await harness.ownerPool.query(`CREATE ROLE ${loginRole} LOGIN`);
    await harness.ownerPool.query(`GRANT ${role} TO ${loginRole}`);
    const pool = createDatabasePool({ ...harness.database.connectionConfig, user: loginRole }, {
      max: 1, applicationName: `tsa-${loginRole}-test`,
    });
    try {
      await pool.query(`SET ROLE ${role}`);
      await assert.rejects(pool.query('SELECT * FROM tsa_private.local_auth_sessions'),
        (error) => error.code === '42501');
      if (role === 'tsa_bank') {
        const unauthorizedStatements = [
          ['INSERT INTO tsa.users (id, issuer, subject) VALUES ($1, \'x\', \'x\')', [randomUUID()]],
          ['UPDATE tsa.users SET display_name = \'x\' WHERE false', []],
          ['DELETE FROM tsa.users WHERE false', []],
          ['INSERT INTO tsa.user_roles (user_id, role) VALUES ($1, \'CANDIDATE\')', [LOCAL_SYNTHETIC_ACTORS.studentA.id]],
          ['UPDATE tsa.user_roles SET assigned_at = clock_timestamp() WHERE false', []],
          ['DELETE FROM tsa.user_roles WHERE false', []],
          ['TRUNCATE tsa.user_roles', []],
        ];
        for (const [statement, values] of unauthorizedStatements) {
          await assert.rejects(pool.query(statement, values), (error) => error.code === '42501');
        }
      }
      if (role === 'tsa_factory') {
        await assert.rejects(pool.query('SELECT id FROM tsa.attempts'),
          (error) => error.code === '42501');
        await assert.rejects(pool.query('SELECT question_version_id FROM tsa_private.question_secrets'),
          (error) => error.code === '42501');
        await assert.rejects(pool.query('SELECT id FROM tsa.forms'),
          (error) => error.code === '42501');
      }
    } finally {
      await pool.end();
    }
  }
  const identityRead = await harness.authPool.query(
    "SELECT has_column_privilege(current_user, 'tsa.attempts', 'id', 'SELECT') AS has_select");
  assert.equal(identityRead.rows[0].has_select, true);
  await assert.rejects(harness.authPool.query('SELECT started_at FROM tsa.attempts'),
    (error) => error.code === '42501');
});
