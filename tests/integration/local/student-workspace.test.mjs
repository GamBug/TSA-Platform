import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTrackBRuntime } from '../../../src/local/track-b.mjs';
import { startPersistentPostgres } from '../../../src/local/postgres.mjs';

const env = { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_STUDENT_ENABLED: 'true' };
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


test('retained student workspace preserves authorization, unapproved stock and sessions across PostgreSQL restart', { timeout: 40_000 }, async (t) => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'tsa-retained-student-'));
  const dataDirectory = path.join(scratch, 'cluster');
  let runtime;
  t.after(async () => { await runtime?.close(); await rm(scratch, { recursive: true, force: true }); });
  await assert.rejects(createTrackBRuntime({ env: { ...env, LOCAL_STUDENT_ENABLED: 'yes' }, dataDirectory, port: 0 }), /LOCAL_STUDENT_ENABLED/);
  await assert.rejects(lstat(dataDirectory), { code: 'ENOENT' });
  runtime = await createTrackBRuntime({ env, dataDirectory, port: 0 });
  assert.equal(runtime.studentEnabled, true);
  const candidate = await login(runtime.origin, 'studentA');
  const other = await login(runtime.origin, 'studentB');
  const author = await login(runtime.origin, 'author');
  await assertApiError(await fetch(`${runtime.origin}/api/v1/catalog`), 401, 'UNAUTHENTICATED');
  for (const session of [candidate, other]) {
    for (const endpoint of ['/api/v1/catalog', '/api/v1/attempts']) {
      const response = await api(runtime.origin, session, endpoint);
      assert.equal(response.status, 200, await response.clone().text());
      assert.deepEqual(await response.json(), { items: [], nextCursor: null });
    }
  }
  await assertApiError(await api(runtime.origin, author, '/api/v1/attempts', {
    method: 'POST', csrf: true, key: 'author-create-denied', body: {},
  }), 403, 'FORBIDDEN');
  await assertApiError(await api(runtime.origin, candidate, '/api/v1/questions'), 403, 'FORBIDDEN');
  const templateResponse = await api(runtime.origin, author, '/local/workspace/template');
  assert.equal(templateResponse.status, 200);
  const { template } = await templateResponse.json();
  const created = await api(runtime.origin, author, '/api/v1/questions', {
    method: 'POST', csrf: true, key: 'retained-draft-only', body: draftFromTemplate(template),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const draft = await created.json(); assert.equal(draft.state, 'DRAFT');
  const roleRows = await runtime.bankPool.query(`SELECT rolname, rolsuper FROM pg_roles WHERE rolname LIKE 'tsa_track_b_%' ORDER BY rolname`);
  assert.deepEqual(roleRows.rows.map((row) => row.rolname), ['tsa_track_b_bank', 'tsa_track_b_exam', 'tsa_track_b_exam_worker', 'tsa_track_b_identity']);
  assert.ok(roleRows.rows.every((row) => !row.rolsuper));
  await assert.rejects(runtime.bankPool.query('SELECT tsa.exam_catalog_page(20,NULL)'), /permission denied/);
  await Promise.all([runtime.close(), runtime.close()]); runtime = null;
  runtime = await createTrackBRuntime({ env, dataDirectory, port: 0 });
  const session = await api(runtime.origin, candidate, '/local-auth/session');
  assert.equal((await session.json()).principal.actorKey, 'studentA');
  const drafts = await api(runtime.origin, author, '/api/v1/questions?state=DRAFT&limit=100');
  assert.equal((await drafts.json()).items[0].versionId, draft.versionId);
  const catalog = await api(runtime.origin, candidate, '/api/v1/catalog');
  assert.deepEqual(await catalog.json(), { items: [], nextCursor: null });
  const rights = await runtime.bankPool.query(`SELECT rd.status FROM tsa.source_rights sr JOIN tsa.rights_decisions rd ON rd.id=sr.decision_id`);
  assert.ok(rights.rows.length > 0); assert.ok(rights.rows.every((row) => row.status === 'UNKNOWN'));
  await runtime.close(); runtime = null;
  const database = await startPersistentPostgres(dataDirectory);
  try { await database.ownerPool.query('ALTER ROLE tsa_track_b_exam BYPASSRLS'); }
  finally { await database.stop(); }
  await assert.rejects(createTrackBRuntime({ env, dataDirectory, port: 0 }), /unsafe attributes/);
  await assert.rejects(lstat(`${dataDirectory}.track-b-start.lock`), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(dataDirectory, 'postmaster.pid')), { code: 'ENOENT' });
  const drifted = await startPersistentPostgres(dataDirectory);
  try {
    await drifted.ownerPool.query('ALTER ROLE tsa_track_b_exam NOBYPASSRLS');
    await drifted.ownerPool.query('GRANT tsa_exam TO tsa_track_b_exam WITH ADMIN OPTION');
  } finally { await drifted.stop(); }
  await assert.rejects(createTrackBRuntime({ env, dataDirectory, port: 0 }), /dedicated non-owner LOGIN/);
  await assert.rejects(lstat(path.join(dataDirectory, 'postmaster.pid')), { code: 'ENOENT' });

});
