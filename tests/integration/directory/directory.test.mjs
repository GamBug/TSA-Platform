import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  AttemptHistoryPageSchema,
  CatalogPageSchema,
} from '../../../packages/contracts/dist/internal.js';
import { createAttemptHandler } from '../../../src/http/attempts.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { createStudentDirectoryService } from '../../../src/modules/attempts/directory.mjs';
import { createDatabasePool } from '../../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../../src/modules/jobs/exam-worker.mjs';
import { createAllocationFixture } from '../assembly/fixtures.mjs';

const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
  attempt: Object.freeze({ capacity: 50, refillPerSecond: 10 }),
});
const USER_ID = '00000000-0000-4000-8000-000000000001';
const BLUEPRINT_ID = '00000000-0000-4000-8000-000000000002';
const FORM_ID = '00000000-0000-4000-8000-000000000003';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000004';
const HISTORY_CURSOR_TIME = '2026-10-22T12:34:56.123456Z';

function key(label) { return `${label}-${randomUUID()}`; }

function candidate() {
  return { authenticated: true, userId: USER_ID, roles: ['CANDIDATE'] };
}

function identityService(mayRead = true) {
  return { mayPerform: () => mayRead };
}

function cursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function readCursor(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function catalogFixture({ id = BLUEPRINT_ID, profileKind = 'INDEPENDENT_PRACTICE', reviewAllowed = false } = {}) {
  const config = {
    schemaVersion: 'blueprint/1',
    name: 'Synthetic MATH practice',
    taxonomyVersionId: '00000000-0000-4000-8000-000000000010',
    profileKind,
    evidenceIds: ['synthetic-directory-fixture'],
    sections: [{ id: 'math-entry', section: 'MATH', count: 4, durationSeconds: 600 }],
    allowedTypes: ['SINGLE_CHOICE'],
    quotas: [],
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE',
    scoringPolicy: 'practice-binary-v1',
    releasePolicy: 'after-grade-v1',
  };
  const entry = {
    name: config.name,
    domain: 'MATH',
    questionCount: 4,
    durationSeconds: 600,
    profileKind,
    availableFrom: '2026-10-22T00:00:00.000000Z',
    availableUntil: '2026-10-23T00:00:00.000000Z',
    mode: 'PERSONALIZED_PRACTICE',
    blueprintVersionId: id,
    reviewAllowed,
  };
  return { entry, config };
}

function fakePool({ catalog, history, failFunction } = {}) {
  const state = { calls: [], connections: 0 };
  return {
    state,
    async connect() {
      state.connections += 1;
      return {
        async query(sql, values = []) {
          state.calls.push({ sql, values });
          if (failFunction && (sql.includes('tsa.exam_catalog_page') || sql.includes('tsa.exam_history_page'))) {
            throw new Error('Private database transport detail');
          }
          if (sql.includes('tsa.exam_catalog_page')) return { rows: [{ result: catalog }] };
          if (sql.includes('tsa.exam_history_page')) return { rows: [{ result: history }] };
          return { rows: [] };
        },
        release() {},
      };
    },
  };
}

function functionCall(pool, name) {
  return pool.state.calls.find(({ sql }) => sql.includes(name));
}

async function expectDirectoryError(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test('directory service uses strict opaque keyset cursors and preserves timestamp microseconds', async () => {
  const catalogValue = catalogFixture();
  const workerPool = fakePool({
    catalog: { items: [catalogValue], next: '00000000-0000-4000-8000-000000000020' },
    history: { items: [], next: { createdAt: HISTORY_CURSOR_TIME, id: ATTEMPT_ID } },
  });
  const directory = createStudentDirectoryService({ examPool: workerPool, identityService: identityService() });

  const first = await directory.catalog(candidate(), { limit: '1' });
  assert.deepEqual(CatalogPageSchema.parse(first), first);
  assert.deepEqual(first.items, [catalogValue.entry]);
  assert.deepEqual(functionCall(workerPool, 'tsa.exam_catalog_page').values,
    [1, null]);
  assert.ok(workerPool.state.calls.some(({ sql }) => sql === 'SET LOCAL ROLE tsa_exam'));
  assert.deepEqual(readCursor(first.nextCursor), {
    v: 1,
    kind: 'catalog',
    afterBlueprintId: '00000000-0000-4000-8000-000000000020',
  });

  workerPool.state.calls = [];
  await directory.catalog(candidate(), { cursor: first.nextCursor, limit: '1' });
  assert.deepEqual(functionCall(workerPool, 'tsa.exam_catalog_page').values,
    [1, '00000000-0000-4000-8000-000000000020']);

  workerPool.state.calls = [];
  const historyFirst = await directory.history(candidate(), { limit: '1' });
  assert.deepEqual(AttemptHistoryPageSchema.parse(historyFirst), historyFirst);
  assert.deepEqual(readCursor(historyFirst.nextCursor), {
    v: 1,
    kind: 'history',
    beforeCreatedAt: HISTORY_CURSOR_TIME,
    beforeId: ATTEMPT_ID,
  });
  workerPool.state.calls = [];
  await directory.history(candidate(), { cursor: historyFirst.nextCursor, limit: '1' });
  assert.deepEqual(functionCall(workerPool, 'tsa.exam_history_page').values,
    [1, HISTORY_CURSOR_TIME, ATTEMPT_ID]);

  workerPool.state.calls = [];
  await directory.catalog(candidate());
  assert.deepEqual(functionCall(workerPool, 'tsa.exam_catalog_page').values, [20, null]);
});

test('directory rejects malformed and cross-kind cursors before database access and hides query failures', async () => {
  const workerPool = fakePool({
    catalog: { items: [], next: null },
    history: { items: [], next: null },
  });
  const directory = createStudentDirectoryService({ examPool: workerPool, identityService: identityService() });
  const invalidCursors = [
    'not-base64!',
    `${cursor({ v: 1, kind: 'catalog', afterBlueprintId: BLUEPRINT_ID })}=`,
    cursor({ kind: 'catalog', v: 1, afterBlueprintId: BLUEPRINT_ID }),
    cursor({ v: 1, kind: 'history', beforeCreatedAt: HISTORY_CURSOR_TIME, beforeId: ATTEMPT_ID }),
    cursor({ v: 1, kind: 'catalog', afterBlueprintId: BLUEPRINT_ID, extra: true }),
  ];
  for (const value of invalidCursors) {
    await expectDirectoryError(directory.catalog(candidate(), { cursor: value }), 422, 'VALIDATION_ERROR');
  }
  for (const beforeCreatedAt of ['2026-02-30T12:34:56.123456Z', '2026-10-22T12:34:56.123Z',
    '0000-01-01T00:00:00.000000Z']) {
    await expectDirectoryError(directory.history(candidate(), {
      cursor: cursor({ v: 1, kind: 'history', beforeCreatedAt, beforeId: ATTEMPT_ID }),
    }), 422, 'VALIDATION_ERROR');
  }
  await expectDirectoryError(directory.history(candidate(), {
    cursor: cursor({ v: 1, kind: 'catalog', afterBlueprintId: BLUEPRINT_ID }),
  }), 422, 'VALIDATION_ERROR');
  await expectDirectoryError(directory.catalog(candidate(), { limit: '101' }), 422, 'VALIDATION_ERROR');
  await expectDirectoryError(directory.history(candidate(), new URLSearchParams('limit=1&limit=2')),
    422, 'VALIDATION_ERROR');
  await expectDirectoryError(directory.catalog(candidate(), { extra: 'ignored?' }), 422, 'VALIDATION_ERROR');
  await expectDirectoryError(directory.catalog(candidate(), new URLSearchParams('__proto__=ignored')),
    422, 'VALIDATION_ERROR');
  assert.equal(workerPool.state.connections, 0);

  const broken = createStudentDirectoryService({
    examPool: fakePool({ failFunction: true }),
    identityService: identityService(),
  });
  await expectDirectoryError(broken.catalog(candidate()), 503, 'TEMPORARILY_UNAVAILABLE');
});

test('directory fails closed on malformed SQL metadata and checks candidate role before query parsing', async () => {
  const malformed = catalogFixture({ profileKind: 'PUBLIC_REFERENCE' });
  const malformedPool = fakePool({ catalog: { items: [malformed], next: null } });
  const directory = createStudentDirectoryService({ examPool: malformedPool, identityService: identityService() });
  await expectDirectoryError(directory.catalog(candidate()), 503, 'TEMPORARILY_UNAVAILABLE');

  const exposedReview = catalogFixture({ reviewAllowed: true });
  const reviewPool = fakePool({ catalog: { items: [exposedReview], next: null } });
  const reviewDirectory = createStudentDirectoryService({ examPool: reviewPool, identityService: identityService() });
  await expectDirectoryError(reviewDirectory.catalog(candidate()), 503, 'TEMPORARILY_UNAVAILABLE');

  const staffDirectory = createStudentDirectoryService({
    examPool: fakePool({ catalog: { items: [], next: null } }),
    identityService: identityService(false),
  });
  await expectDirectoryError(staffDirectory.catalog({ ...candidate(), roles: ['EXAM_MANAGER'] }, { extra: true }),
    403, 'FORBIDDEN');
});

test('catalog and owned attempt history use frozen routes and release only the current graded summary', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  let workerPool;
  t.after(async () => {
    if (workerPool) await workerPool.end();
    await fixture.close();
  });

  const attempts = createAttemptService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  const futureBlueprint = await fixture.createBlueprint({
    count: 2,
    section: 'READING',
    availableFrom: new Date(Date.now() + 60_000),
    availableUntil: new Date(Date.now() + 3_600_000),
  });
  await fixture.pool.query(`UPDATE tsa.blueprint_offerings SET review_enabled=true,revision=revision+1
    WHERE blueprint_version_id=$1`, [futureBlueprint.versionId]);
  const disabledBlueprint = await fixture.createBlueprint({ count: 4, section: 'SCIENCE' });
  await fixture.pool.query(`UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1
    WHERE blueprint_version_id=$1`, [disabledBlueprint.versionId]);
  const closedBlueprint = await fixture.createBlueprint({
    count: 4,
    section: 'SCIENCE',
    availableFrom: new Date(Date.now() - 3_600_000),
    availableUntil: new Date(Date.now() - 60_000),
  });
  const unsupportedBlueprint = await fixture.createBlueprint({ count: 4, section: 'READING' });

  const first = await attempts.create(fixture.principals.studentA, key('directory-first-create'), {
    blueprintVersionId: fixture.blueprint.versionId,
  });
  await attempts.start(fixture.principals.studentA, first.body.attemptId, key('directory-first-start'), {});
  await attempts.submit(fixture.principals.studentA, first.body.attemptId, key('directory-first-submit'), {});
  const workerLogin = `directory_worker_${randomUUID().replaceAll('-', '')}`;
  await fixture.pool.query(`CREATE ROLE ${workerLogin} LOGIN`);
  await fixture.pool.query(`GRANT tsa_exam_worker TO ${workerLogin}`);
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: workerLogin }, {
    applicationName: 'tsa-student-directory-worker-test',
    max: 2,
  });

  const directory = createStudentDirectoryService({ examPool: fixture.examPool, identityService: fixture.identityService });
  const pending = await directory.history(fixture.principals.studentA, { limit: '10' });
  assert.deepEqual(AttemptHistoryPageSchema.parse(pending), pending);
  assert.equal(pending.items.length, 1);
  assert.equal(pending.items[0].attemptId, first.body.attemptId);
  assert.equal(pending.items[0].state, 'SUBMITTED');
  assert.equal(pending.items[0].score, null);
  assert.equal(pending.items[0].startedAt, (await fixture.pool.query(
    "SELECT tsa.exam_instant(started_at) AS started_at FROM tsa.attempts WHERE id=$1", [first.body.attemptId])).rows[0].started_at);

  const worker = createExamWorker({ workerPool, executorId: 'directory-grader-test', leaseSeconds: 30, retrySeconds: 30 });
  const graded = await worker.runOnce();
  assert.equal(graded.status, 'GRADED');
  assert.equal(graded.attemptId, first.body.attemptId);
  const second = await attempts.create(fixture.principals.studentA, key('directory-second-create'), {
    blueprintVersionId: fixture.blueprint.versionId,
  });

  const pageOne = await directory.history(fixture.principals.studentA, { limit: '1' });
  assert.equal(pageOne.items.length, 1);
  assert.equal(pageOne.items[0].attemptId, second.body.attemptId);
  assert.equal(pageOne.items[0].state, 'CREATED');
  assert.equal(pageOne.items[0].score, null);
  const cursorData = readCursor(pageOne.nextCursor);
  const exactCreatedAt = await fixture.pool.query(`SELECT to_char(created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
    FROM tsa.attempts WHERE id=$1`, [second.body.attemptId]);
  assert.equal(cursorData.beforeCreatedAt, exactCreatedAt.rows[0].created_at);
  assert.match(cursorData.beforeCreatedAt, /\.\d{6}Z$/);

  const pageTwo = await directory.history(fixture.principals.studentA, { limit: '1', cursor: pageOne.nextCursor });
  assert.equal(pageTwo.items.length, 1);
  assert.equal(pageTwo.items[0].attemptId, first.body.attemptId);
  assert.equal(pageTwo.items[0].state, 'GRADED');
  assert.deepEqual(pageTwo.items[0].score, { correctCount: 0, totalCount: 4, percentage: '0.00' });
  assert.equal(JSON.stringify(pageTwo).includes('answerKey'), false);
  assert.equal(JSON.stringify(pageTwo).includes('explanation'), false);
  assert.equal(JSON.stringify(pageTwo).includes('provenance'), false);
  assert.deepEqual(await directory.history(fixture.principals.studentB), { items: [], nextCursor: null });

  const handler = createAttemptHandler({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    trustedOrigin: fixture.harness.origin,
    createRate: CREATE_RATE,
    saveRate: SAVE_RATE,
  });
  const get = async (path, browser, origin = fixture.harness.origin) => {
    const headers = new Headers({ origin });
    if (browser) headers.set('cookie', browser.cookies.join('; '));
    const response = await handler(new Request(`${fixture.harness.origin}${path}`, { headers }));
    return { response, body: await response.json() };
  };

  const catalogItems = [];
  let catalogCursor = null;
  do {
    const path = `/api/v1/catalog?limit=1${catalogCursor ? `&cursor=${encodeURIComponent(catalogCursor)}` : ''}`;
    const page = await get(path, fixture.browsers.studentA);
    assert.equal(page.response.status, 200);
    assert.equal(page.response.headers.get('cache-control'), 'no-store');
    const parsed = CatalogPageSchema.parse(page.body);
    catalogItems.push(...parsed.items);
    catalogCursor = parsed.nextCursor;
  } while (catalogCursor);
  assert.deepEqual(catalogItems.map((entry) => entry.blueprintVersionId).sort(),
    [fixture.blueprint.versionId, futureBlueprint.versionId].sort());
  assert.equal(catalogItems.find((entry) => entry.blueprintVersionId === futureBlueprint.versionId).reviewAllowed, false);
  assert.ok(Date.parse(catalogItems.find((entry) => entry.blueprintVersionId === futureBlueprint.versionId).availableFrom) > Date.now());
  assert.ok(catalogItems.every((entry) => entry.mode === 'PERSONALIZED_PRACTICE' && entry.reviewAllowed === false));
  assert.equal(catalogItems.some((entry) => 'inventory' in entry || 'availableQuestionCount' in entry), false);
  assert.equal(catalogItems.some((entry) => entry.blueprintVersionId === disabledBlueprint.versionId), false);
  assert.equal(catalogItems.some((entry) => entry.blueprintVersionId === closedBlueprint.versionId), false);
  assert.equal(catalogItems.some((entry) => entry.blueprintVersionId === unsupportedBlueprint.versionId), false);

  const historyHttp = await get('/api/v1/attempts?limit=1', fixture.browsers.studentA);
  assert.equal(historyHttp.response.status, 200);
  assert.deepEqual(AttemptHistoryPageSchema.parse(historyHttp.body), historyHttp.body);
  const unauthenticated = await get('/api/v1/catalog?limit=bad&limit=1', null);
  assert.equal(unauthenticated.response.status, 401);
  const staff = await get('/api/v1/attempts?unsupported=true', fixture.browsers.examManager);
  assert.equal(staff.response.status, 403);
  const badOrigin = await get('/api/v1/catalog', fixture.browsers.studentA, 'http://example.invalid');
  assert.equal(badOrigin.response.status, 403);
  const duplicate = await get('/api/v1/catalog?limit=1&limit=2', fixture.browsers.studentA);
  assert.equal(duplicate.response.status, 422);
  const unknownPrototype = await get('/api/v1/catalog?__proto__=ignored', fixture.browsers.studentA);
  assert.equal(unknownPrototype.response.status, 422);
});
