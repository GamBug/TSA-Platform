import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, after, test } from 'node:test';
import { mkdtemp, chmod, lstat, readFile, rm, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { privateQuestionFixture } from '../../../apps/practice-prototype/src/private-question-fixture.mjs';

const env = { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' };
const privateQuestionText = 'What is x if x + 2 = 5?';
const privateExplanation = 'Subtract 2 from each side.';
let scratch;
let dataDirectory;
let runtime;
let author;
let candidate;

function cookiesFrom(headers) {
  const cookieHeaders = headers.getSetCookie();
  const session = cookieHeaders.find((value) => value.startsWith('tsa_local_session='));
  const csrf = cookieHeaders.find((value) => value.startsWith('tsa_local_csrf='));
  assert.ok(session, 'session cookie is set separately');
  assert.ok(csrf, 'CSRF cookie is set separately');
  const pair = (value) => value.split(';', 1)[0];
  const cookie = `${pair(session)}; ${pair(csrf)}`;
  return { cookie, csrf: pair(csrf).slice('tsa_local_csrf='.length) };
}

async function login(origin, actorKey) {
  const challenge = await fetch(`${origin}/local-auth/bootstrap`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(challenge.status, 201);
  const guest = cookiesFrom(challenge.headers);
  const response = await fetch(`${origin}/local-auth/login`, {
    method: 'POST',
    headers: { origin, cookie: guest.cookie, 'x-csrf-token': guest.csrf, 'content-type': 'application/json' },
    body: JSON.stringify({ actorKey }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return cookiesFrom(response.headers);
}

async function api(origin, session, pathname, { method = 'GET', body, csrf = false, key } = {}) {
  const headers = new Headers({ cookie: session.cookie, origin });
  if (csrf) headers.set('x-csrf-token', session.csrf);
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (key) headers.set('idempotency-key', key);
  return fetch(`${origin}${pathname}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function draftFromTemplate(template) {
  return {
    schemaVersion: 'question/1',
    language: 'vi-VN',
    section: 'MATH',
    taxonomyVersionId: template.taxonomyVersionId,
    domainId: template.domainId,
    skillIds: template.skillIds,
    subskillIds: [],
    cognitiveLevel: null,
    targetDifficulty: 'EASY',
    content: structuredClone(template.content),
    stimulusVersionId: null,
    interaction: structuredClone(template.interaction),
    answerKey: structuredClone(template.answerKey),
    explanation: structuredClone(template.explanation),
    evidenceRefs: template.evidenceRefs,
    origin: 'MANUAL',
    provenance: structuredClone(template.provenance),
  };
}

async function assertApiError(response, expectedStatus, expectedCode) {
  assert.equal(response.status, expectedStatus);
  const payload = await response.json();
  assert.deepEqual(Object.keys(payload), ['error']);
  assert.deepEqual(Object.keys(payload.error).sort(), ['code', 'details', 'message', 'requestId']);
  assert.equal(payload.error.code, expectedCode);
  assert.deepEqual(payload.error.details, {});
  assert.equal(response.headers.get('x-request-id'), payload.error.requestId);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return payload;
}

before(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'tsa-track-b-local-test-'));
  await chmod(scratch, 0o700);
  dataDirectory = path.join(scratch, 'persistent-data');
});

after(async () => {
  if (runtime) await runtime.close();
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test('production and unknown runtime modes refuse before creating the local data path', async () => {
  const protectedPath = path.join(scratch, 'must-not-exist');
  await assert.rejects(createTrackBRuntime({
    env: { NODE_ENV: 'production', LOCAL_SYNTHETIC_ONLY: 'true' },
    dataDirectory: protectedPath,
    port: 0,
  }), /disabled|production|NODE_ENV/i);
  await assert.rejects(createTrackBRuntime({
    env: { LOCAL_SYNTHETIC_ONLY: 'true' },
    dataDirectory: protectedPath,
    port: 0,
  }), /NODE_ENV/);
  await assert.rejects(lstat(protectedPath), { code: 'ENOENT' });
});

test('a fresh nested data path gets a private parent and PostgreSQL has no TCP listener', async () => {
  const freshPath = path.join(scratch, 'new-private-parent', 'nested', 'cluster');
  const parent = path.dirname(freshPath);
  await assert.rejects(lstat(parent), { code: 'ENOENT' });
  const database = await startPersistentPostgres(freshPath);
  try {
    const result = await database.ownerPool.query('SHOW listen_addresses');
    assert.equal(result.rows[0].listen_addresses, '');
  } finally {
    await database.stop();
  }
  const parentInfo = await lstat(parent);
  assert.equal(parentInfo.isDirectory(), true);
  assert.equal(parentInfo.mode & 0o077, 0);
  await assert.rejects(lstat(`${freshPath}.track-b-start.lock`), { code: 'ENOENT' });
});

test('symlinked data parents are rejected before creating descendants', async () => {
  const realParent = path.join(scratch, 'symlink-target');
  const alias = path.join(scratch, 'symlink-alias');
  await mkdir(realParent, { mode: 0o700 });
  await symlink(realParent, alias, 'dir');
  await assert.rejects(createTrackBRuntime({
    env, dataDirectory: path.join(alias, 'must-not-exist', 'cluster'), port: 0,
  }), /symbolic links/i);
  await assert.rejects(lstat(path.join(realParent, 'must-not-exist')), { code: 'ENOENT' });
});

test('failed migration bootstrap releases the owned process and startup lock', async () => {
  const failedPath = path.join(scratch, 'failed-bootstrap', 'cluster');
  const initial = await startPersistentPostgres(failedPath);
  try {
    await migrate(initial.ownerPool);
    await initial.ownerPool.query(
      `UPDATE tsa_meta.schema_migrations SET checksum='sha256:' || repeat('0',64)
        WHERE version=(SELECT min(version) FROM tsa_meta.schema_migrations)`);
  } finally {
    await initial.stop();
  }
  await assert.rejects(createTrackBRuntime({ env, dataDirectory: failedPath, port: 0 }), /checksum drift/);
  await assert.rejects(lstat(`${failedPath}.track-b-start.lock`), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(failedPath, 'postmaster.pid')), { code: 'ENOENT' });
  const restarted = await startPersistentPostgres(failedPath);
  try {
    assert.equal((await restarted.ownerPool.query('SHOW listen_addresses')).rows[0].listen_addresses, '');
  } finally {
    await restarted.stop();
  }
});

test('private persistent PostgreSQL composes local auth and real Bank routes in the existing app', async (t) => {
  runtime = await createTrackBRuntime({ env, dataDirectory, port: 0 });
  assert.equal(runtime.syntheticOnly, true);
  assert.equal(runtime.origin.startsWith('http://127.0.0.1:'), true);
  const directory = await lstat(dataDirectory);
  assert.equal(directory.isDirectory(), true);
  assert.equal(directory.mode & 0o077, 0, 'PostgreSQL directory is private');

  const roles = await Promise.all([
    runtime.identityPool.query('SELECT current_user, rolsuper FROM pg_roles WHERE rolname=current_user'),
    runtime.bankPool.query('SELECT current_user, rolsuper FROM pg_roles WHERE rolname=current_user'),
  ]);
  assert.equal(roles[0].rows[0].current_user, 'tsa_track_b_identity');
  assert.equal(roles[1].rows[0].current_user, 'tsa_track_b_bank');
  assert.equal(roles[0].rows[0].rolsuper, false);
  assert.equal(roles[1].rows[0].rolsuper, false);
  const listener = await runtime.bankPool.query('SHOW listen_addresses');
  assert.equal(listener.rows[0].listen_addresses, '', 'PostgreSQL listens only on its private Unix socket');

  await t.test('public assets and anonymous APIs do not reveal the private fixture', async () => {
    const html = await fetch(runtime.origin);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.doesNotMatch(await html.text(), /answerKey|Subtract 2 from each side|What is x if x \+ 2/);
    for (const file of ['/app/main.js', '/app/staff.js', '/styles.css']) {
      const response = await fetch(`${runtime.origin}${file}`);
      assert.equal(response.status, 200, file);
      const text = await response.text();
      assert.doesNotMatch(text, /Subtract 2 from each side|What is x if x \+ 2 = 5/);
    }
    for (const pathName of ['/src/private-question-fixture.mjs', '/src/local/track-b.mjs', '/apps/practice-prototype/src/private-question-fixture.mjs']) {
      assert.equal((await fetch(`${runtime.origin}${pathName}`)).status, 404, pathName);
    }
    await assertApiError(await fetch(`${runtime.origin}/api/v1/questions`), 401, 'UNAUTHENTICATED');
    const template = await fetch(`${runtime.origin}/local/workspace/template`);
    assert.equal(template.status, 401);
  });

  await t.test('a candidate cannot read the author template or create/list bank drafts', async () => {
    candidate = await login(runtime.origin, 'studentA');
    const template = await api(runtime.origin, candidate, '/local/workspace/template');
    assert.equal(template.status, 403);
    assert.doesNotMatch(await template.text(), /answerKey|explanation|Subtract 2 from each side/);
    await assertApiError(await api(runtime.origin, candidate, '/api/v1/questions?limit=100'), 403, 'FORBIDDEN');
    const create = await api(runtime.origin, candidate, '/api/v1/questions', {
      method: 'POST', csrf: true, key: 'candidate-must-not-create-v1', body: {},
    });
    await assertApiError(create, 403, 'FORBIDDEN');
  });

  await t.test('reviewer and bank manager may read only the metadata list', async () => {
    for (const actorKey of ['reviewer', 'bankManager']) {
      const staff = await login(runtime.origin, actorKey);
      const list = await api(runtime.origin, staff, '/api/v1/questions?state=DRAFT&limit=100');
      assert.equal(list.status, 200, actorKey);
      const listing = await list.json();
      assert.ok(Array.isArray(listing.items));
      const template = await api(runtime.origin, staff, '/local/workspace/template');
      assert.equal(template.status, 403, `${actorKey} cannot access private authoring content`);
      assert.doesNotMatch(await template.text(), /answerKey|explanation|Subtract 2 from each side/);
    }
  });

  await t.test('AUTHOR gets the private template only after login and creates a DRAFT through Bank HTTP', async () => {
    author = await login(runtime.origin, 'author');
    const deniedWithoutCsrf = await api(runtime.origin, author, '/api/v1/questions', {
      method: 'POST', key: 'author-missing-csrf', body: {},
    });
    await assertApiError(deniedWithoutCsrf, 403, 'CSRF_FAILED');

    const templateResponse = await api(runtime.origin, author, '/local/workspace/template');
    assert.equal(templateResponse.status, 200);
    const { template } = await templateResponse.json();
    assert.equal(template.content[0].text, privateQuestionText);
    assert.equal(template.answerKey.optionId, 'b');
    assert.equal(template.explanation[0].text, privateExplanation);
    assert.equal(template.sourceVersionHash,
      `sha256:${createHash('sha256').update(JSON.stringify(privateQuestionFixture)).digest('hex')}`);
    assert.ok(template.sourceVersionId);
    assert.ok(template.evidenceRefs.length);

    const draft = draftFromTemplate(template);
    const created = await api(runtime.origin, author, '/api/v1/questions', {
      method: 'POST', csrf: true, key: 'author-draft-create-v1', body: draft,
    });
    assert.equal(created.status, 201, await created.clone().text());
    const result = await created.json();
    assert.equal(result.state, 'DRAFT');
    assert.ok(result.questionId);
    assert.ok(result.versionId);
    assert.match(result.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(Object.hasOwn(result, 'requestId'), false);
    assert.equal(await created.headers.get('cache-control'), 'no-store');

    const list = await api(runtime.origin, author, '/api/v1/questions?state=DRAFT&limit=100');
    assert.equal(list.status, 200);
    const listing = await list.json();
    assert.ok(listing.items.some((item) => item.questionId === result.questionId && item.versionId === result.versionId));
    const serialized = JSON.stringify(listing);
    assert.doesNotMatch(serialized, /answerKey|explanation|privateQuestion|Subtract 2 from each side|What is x if x \+ 2 = 5/);
    assert.deepEqual(Object.keys(listing.items[0]).sort(), ['contentHash', 'interactionType', 'questionId', 'section', 'state', 'versionId']);
  });

  await t.test('integrated request cap returns the documented API error shape', async () => {
    const oversized = 'x'.repeat(1024 * 1024 + 1);
    const response = await fetch(`${runtime.origin}/api/v1/questions`, {
      method: 'POST',
      headers: { cookie: author.cookie, 'x-csrf-token': author.csrf, 'content-type': 'application/json', 'idempotency-key': 'oversized-body-v1' },
      body: oversized,
    });
    await assertApiError(response, 413, 'PAYLOAD_TOO_LARGE');
  });

  await t.test('restart preserves authenticated sessions and draft records without reseeding questions', async () => {
    await runtime.close();
    runtime = null;
    runtime = await createTrackBRuntime({ env, dataDirectory, port: 0 });
    const session = await api(runtime.origin, author, '/local-auth/session');
    const sessionPayload = await session.json();
    assert.equal(sessionPayload.authenticated, true);
    assert.equal(sessionPayload.principal.actorKey, 'author');
    const list = await api(runtime.origin, author, '/api/v1/questions?state=DRAFT&limit=100');
    assert.equal(list.status, 200);
    const listing = await list.json();
    assert.equal(listing.items.length, 1, 'only the user-created question exists after restart');
    const rights = await runtime.bankPool.query(
      `SELECT rd.status, s.origin, sv.content_hash FROM tsa.source_rights sr
         JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id
        JOIN tsa.source_versions sv ON sv.id=sr.source_version_id
        JOIN tsa.sources s ON s.id=sv.source_id
       WHERE s.title='Synthetic local workspace source'`);
    assert.equal(rights.rows.length, 1);
    assert.equal(rights.rows[0].status, 'UNKNOWN');
    assert.equal(rights.rows[0].origin, 'EXTERNAL', 'the fixture makes no owned-source claim');
    assert.equal(rights.rows[0].content_hash,
      `sha256:${createHash('sha256').update(JSON.stringify(privateQuestionFixture)).digest('hex')}`);
  });

  await t.test('a concurrent runtime cannot take over an in-use persistent cluster', async () => {
    await assert.rejects(createTrackBRuntime({ env, dataDirectory, port: 0 }), /startup lock|postmaster/);
    const ownerMarker = await readFile(path.join(dataDirectory, '.tsa-track-b-cluster'), 'utf8');
    assert.equal(ownerMarker, 'track-b-local-cluster/1\n');
  });
});

test('foreign non-empty directories are refused without removing their contents', async () => {
  const foreign = path.join(scratch, 'foreign-data');
  await mkdir(foreign, { mode: 0o755 });
  await chmod(foreign, 0o755);
  const foreignFile = path.join(foreign, 'keep.txt');
  await writeFile(foreignFile, 'not an owned database');
  const modeBefore = (await lstat(foreign)).mode & 0o777;
  await assert.rejects(createTrackBRuntime({ env, dataDirectory: foreign, port: 0 }), /without the Track B ownership marker/);
  assert.equal(await readFile(foreignFile, 'utf8'), 'not an owned database');
  assert.equal((await lstat(foreign)).mode & 0o777, modeBefore, 'foreign directory permissions are not modified');
});
