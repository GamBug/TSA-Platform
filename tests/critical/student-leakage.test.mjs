import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { studentRouteRegistry, releasedReviewRouteRegistry } from '../../packages/contracts/dist/internal.js';
import { createStudentRuntime } from '../../src/local/student.mjs';
import { createDatabasePool } from '../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../src/modules/jobs/exam-worker.mjs';
import { createSourceService } from '../../src/modules/sources/service.mjs';
import { createDomainStudentFixture } from '../integration/student-runtime/domain-fixture.mjs';
import { assertNoPrivateData } from './leakage-oracle.mjs';

test('privacy oracle catches raw, escaped, nested, header and property leaks with safe diagnostics', () => {
  const secret = `PRIVATE_${randomUUID()}`;
  const escaped = [...secret].map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const encoded = [...secret].map((char) => `%${char.charCodeAt(0).toString(16)}`).join('');
  for (const probe of [
    { text: `prefix ${secret}` },
    { text: `{"items":[{"name":"${escaped}"}]}` },
    { text: JSON.stringify({ name: secret }) },
    { text: '{}', headers: [['x-diagnostic', encoded]] },
    { text: '{}', headers: [['x-diagnostic', `${encoded}; progress=100%`]] },
    { text: `/* ${encoded} */ .progress { width: 100%; }` },
    { text: `%ff${encoded}%ff` },
    { text: '{"items":[{"answerKey":"a"}]}' },
    { text: '{"\\u0065xplanation":[]}' },
  ]) {
    let caught;
    try { assertNoPrivateData(probe, [secret]); } catch (error) { caught = error; }
    assert.ok(caught instanceof Error, 'fault control must be detected');
    assert.equal(caught.message, 'Student privacy oracle detected private data');
    assert.equal(caught.stack.includes(secret), false);
    assert.equal(caught.actual, undefined); assert.equal(caught.cause, undefined);
  }
  assertNoPrivateData({ text: '{"answers":[{"value":{"optionId":"b"}}]}' }, [secret]);
  assertNoPrivateData({ text: '{"items":[{"correctAnswer":{},"explanation":[]}]}' }, [secret], { released: true });
  assert.throws(() => assertNoPrivateData({ text: '{"items":[{"provenanceIds":[]}]}' }, [secret], { released: true }),
    { message: 'Student privacy oracle detected private data' });
});

function wrappedPool(pool, queryHook) {
  return { async connect() {
    const client = await pool.connect();
    return new Proxy(client, { get(target, name) {
      if (name === 'query') return (sql, values) => { queryHook(sql); return target.query(sql, values); };
      const value = Reflect.get(target, name, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}

test('composed student runtime keeps PostgreSQL private values behind owner release across domains and errors', { timeout: 40_000 }, async (t) => {
  let fixture, workerPool, runtime, stage = 'setup';
  const observed = [], sessions = new Map(), explanationMarker = `PRIVATE_EXPLANATION_${randomUUID()}:`;
  const backendMarker = `PRIVATE_BACKEND_${randomUUID()}`;
  let hardSecrets = [backendMarker], failNextRead = false;
  t.after(async () => {
    const errors = [];
    for (const close of [() => runtime?.close(), () => workerPool?.end(), () => fixture?.close()]) {
      try { await close(); } catch { errors.push(new Error('Privacy fixture cleanup failed')); }
    }
    if (errors.length) throw new AggregateError(errors, 'Privacy cleanup failed');
  });
  try {
    fixture = await createDomainStudentFixture({ privateExplanationPrefix: explanationMarker });
    const rows = (await fixture.pool.query(`SELECT id::text,question_id::text,content_hash,
      normalized_fingerprint,provenance_ids FROM tsa.question_versions ORDER BY id`)).rows;
    assert.equal(rows.length, 10);
    hardSecrets.push(fixture.source.sourceId, fixture.source.sourceVersionId,
      ...rows.flatMap((row) => [row.id, row.question_id, row.content_hash, row.normalized_fingerprint, ...row.provenance_ids]));
    hardSecrets = [...new Set(hardSecrets)];
    assert.ok(hardSecrets.every((value) => typeof value === 'string' && value.length >= 16));
    const privateRows = (await fixture.pool.query('SELECT explanation FROM tsa_private.question_secrets')).rows;
    assert.equal(privateRows.length, 10);
    assert.ok(privateRows.every((row) => JSON.stringify(row.explanation).includes(explanationMarker)), 'private canary persisted before sealing');

    await fixture.pool.query('CREATE ROLE privacy_worker LOGIN');
    await fixture.pool.query('GRANT tsa_exam_worker TO privacy_worker');
    workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: 'privacy_worker' });
    const manualWorker = createExamWorker({ workerPool, executorId: 'privacy-manual-worker', leaseSeconds: 30, retrySeconds: 1 });
    const isolatedWorker = wrappedPool(workerPool, (sql) => {
      if (typeof sql === 'string' && /tsa\.exam_worker_(claim|sweep)\(/.test(sql)) throw new Error('Automatic privacy worker isolated');
    });
    const examPool = wrappedPool(fixture.examPool, (sql) => {
      if (failNextRead && typeof sql === 'string' && /^\s*(SELECT|WITH)\b/i.test(sql)) {
        failNextRead = false;
        throw new Error(backendMarker);
      }
    });
    const rate = { capacity: 1000, refillPerSecond: 10 };
    runtime = await createStudentRuntime({ identityPool: fixture.harness.authPool, examPool, workerPool: isolatedWorker,
      env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true' }, port: 0, pollMilliseconds: 60_000,
      sweepBatchSize: 10, executorId: 'privacy-isolated-worker', leaseSeconds: 30, retrySeconds: 1,
      createRate: { capacity: 3, refillPerSecond: 0.000001 }, saveRate: { user: rate, attempt: rate } });

    async function request(path, { operation, status = 200, actor = 'studentA', method = 'GET', body, raw,
      csrf = true, authenticated = true, origin = runtime.origin, released = false, code, key = randomUUID(), json = true } = {}) {
      const jar = sessions.get(actor) ?? new Map();
      const headers = { origin,
        ...(authenticated && jar.size ? { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') } : {}),
        ...(csrf && jar.has('tsa_local_csrf') ? { 'x-csrf-token': jar.get('tsa_local_csrf') } : {}),
        ...(['POST', 'PUT'].includes(method) ? { 'content-type': 'application/json', 'idempotency-key': key } : {}) };
      const reply = await fetch(runtime.origin + path, { method, headers, signal: AbortSignal.timeout(5000),
        ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const text = await reply.text();
      // Scan before parsing/schema validation so an invalid projection cannot hide a leak.
      assertNoPrivateData({ text, headers: reply.headers }, released ? hardSecrets : [...hardSecrets, explanationMarker],
        { released, propertyNames: json });
      assert.equal(reply.status, status, 'expected HTTP status');
      assert.equal(reply.headers.get('cache-control'), 'no-store');
      assert.equal(reply.headers.get('x-content-type-options'), 'nosniff');
      let value;
      if (json) {
        assert.match(reply.headers.get('content-type'), /^application\/json/);
        value = JSON.parse(text);
        if (operation) {
          const route = operation === 'releasedResult' ? releasedReviewRouteRegistry.releasedResult : studentRouteRegistry[operation];
          const schema = route?.responses[status]?.schema;
          assert.ok(schema, 'expected frozen response schema exists');
          assert.equal(schema.safeParse(value).success, true, 'response matches frozen schema');
        }
        if (code) assert.equal(value.error.code, code);
        if (status === 429) assert.match(reply.headers.get('retry-after'), /^[1-9][0-9]*$/);
        if (released) {
          assert.ok(value.items.every((item) => JSON.stringify(item.explanation).includes(explanationMarker)), 'owner released explanation control');
          const outsideReview = structuredClone(value);
          for (const item of outsideReview.items) { delete item.correctAnswer; delete item.explanation; }
          assertNoPrivateData({ text: JSON.stringify(outsideReview), headers: reply.headers }, [...hardSecrets, explanationMarker]);
        }
      }
      for (const line of reply.headers.getSetCookie()) {
        const pair = line.split(';', 1)[0], at = pair.indexOf('=');
        if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1)); else jar.delete(pair.slice(0, at));
      }
      sessions.set(actor, jar);
      observed.push({ surface: operation ?? (path.startsWith('/local-auth/') ? 'auth' : json ? 'unknown' : 'static'), status });
      return value ?? text;
    }

    stage = 'authentication';
    for (const actor of ['studentA', 'studentB', 'author']) {
      await request('/local-auth/bootstrap', { actor, method: 'POST', body: {}, status: 201 });
      const login = await request('/local-auth/login', { actor, method: 'POST', body: { actorKey: actor } });
      assert.equal(login.principal.userId, fixture.principals[actor].userId);
      const session = await request('/local-auth/session', { actor });
      assert.equal(session.authenticated, true);
    }
    stage = 'directory';
    const catalog = await request('/api/v1/catalog', { operation: 'catalog' });
    assert.deepEqual(catalog.items.map((item) => item.domain).sort(), ['MATH', 'READING', 'SCIENCE']);
    assert.deepEqual((await request('/api/v1/attempts', { operation: 'attemptHistory' })).items, []);

    stage = 'validation and denial';
    for (const [path, operation] of [['/api/v1/catalog', 'catalog'], ['/api/v1/attempts', 'attemptHistory']]) {
      await request(path, { operation, authenticated: false, status: 401, code: 'UNAUTHENTICATED' });
      await request(path, { operation, actor: 'author', status: 403, code: 'FORBIDDEN' });
      await request(`${path}?unexpected=${encodeURIComponent(explanationMarker)}`, { operation, status: 422, code: 'VALIDATION_ERROR' });
      await request(`${path}?limit=1&limit=2`, { operation, status: 422, code: 'VALIDATION_ERROR' });
    }
    const createBody = { blueprintVersionId: fixture.domainBlueprints.MATH.versionId };
    for (const [options, status, code] of [
      [{ raw: `{"${explanationMarker}":` }, 400, 'MALFORMED_JSON'],
      [{ body: { ...createBody, unexpected: explanationMarker } }, 422, 'VALIDATION_ERROR'],
      [{ body: createBody, csrf: false }, 403, 'CSRF_FAILED'],
      [{ body: createBody, origin: 'http://untrusted.invalid' }, 403, 'FORBIDDEN'],
      [{ body: createBody, authenticated: false }, 401, 'UNAUTHENTICATED'],
      [{ body: createBody, actor: 'author' }, 403, 'FORBIDDEN'],
      [{ raw: JSON.stringify({ data: explanationMarker + 'x'.repeat(65 * 1024) }) }, 413, 'PAYLOAD_TOO_LARGE'],
      [{ raw: JSON.stringify({ data: explanationMarker + 'x'.repeat(1024 * 1024) }) }, 413, 'PAYLOAD_TOO_LARGE'],
    ]) await request('/api/v1/attempts', { operation: 'createAttempt', method: 'POST', status, code, ...options });
    await request('/api/v1/unknown', { operation: 'createAttempt', status: 404, code: 'NOT_FOUND' });
    failNextRead = true;
    await request('/api/v1/catalog', { operation: 'catalog', status: 503, code: 'TEMPORARILY_UNAVAILABLE' });
    assert.equal(failNextRead, false, 'backend fault reached an actual query');

    stage = 'lifecycle';
    const coveredTypes = new Set(), attempts = [];
    for (const domain of ['MATH', 'READING', 'SCIENCE']) {
      stage = `${domain} lifecycle`;
      const created = await request('/api/v1/attempts', { operation: 'createAttempt', method: 'POST', status: 201,
        body: { blueprintVersionId: fixture.domainBlueprints[domain].versionId } });
      const path = `/api/v1/attempts/${created.attemptId}`, resultPath = `${path}/result`;
      attempts.push(created.attemptId);
      const sealed = (await fixture.pool.query('SELECT explanation_snapshot FROM tsa_private.form_slot_secrets WHERE form_id=$1', [created.formId])).rows;
      assert.equal(sealed.length, domain === 'READING' ? 2 : 4);
      assert.ok(sealed.every((row) => JSON.stringify(row.explanation_snapshot).includes(explanationMarker)), 'sealed canary persisted');
      const before = await request(path, { operation: 'getAttempt' });
      assert.equal(before.state, 'CREATED'); assert.deepEqual(before.slots, []);
      await request(resultPath, { operation: 'releasedResult', status: 409, code: 'RESULT_NOT_READY' });
      await request(resultPath, { operation: 'releasedResult', actor: 'studentB', status: 404, code: 'NOT_FOUND' });
      await request(`${path}/start`, { operation: 'startAttempt', method: 'POST', body: {} });
      const active = await request(path, { operation: 'getAttempt' });
      assert.equal(active.state, 'IN_PROGRESS'); assert.equal(active.slots.length, sealed.length);
      await request(path, { operation: 'getAttempt', actor: 'studentB', status: 404, code: 'NOT_FOUND' });
      await request(path, { operation: 'getAttempt', authenticated: false, status: 401, code: 'UNAUTHENTICATED' });
      await request(`${path}?unexpected=${encodeURIComponent(explanationMarker)}`, { operation: 'getAttempt', status: 422, code: 'VALIDATION_ERROR' });
      await request(resultPath, { operation: 'releasedResult', status: 409, code: 'RESULT_NOT_READY' });
      await request('/api/v1/catalog', { operation: 'catalog' });
      const activeHistory = await request('/api/v1/attempts', { operation: 'attemptHistory' });
      assert.ok(activeHistory.items.some((item) => item.attemptId === created.attemptId));
      for (const slot of active.slots) {
        coveredTypes.add(slot.interaction.type);
        const value = slot.interaction.type === 'SINGLE_CHOICE' ? { type: 'SINGLE_CHOICE', optionId: 'b' }
          : slot.interaction.type === 'MULTIPLE_CHOICE' ? { type: 'MULTIPLE_CHOICE', optionIds: ['a', 'c'] }
            : { type: 'TRUE_FALSE_GROUP', values: { s1: true, s2: false } };
        const savePath = `${path}/answers/${slot.slotId}`, body = { expectedRevision: 0, value };
        const saveKey = randomUUID();
        const ack = await request(savePath, { operation: 'saveAnswer', method: 'PUT', body, key: saveKey });
        assert.equal(ack.revision, 1);
        await request(savePath, { operation: 'saveAnswer', method: 'PUT', body, key: saveKey });
        await request(savePath, { operation: 'saveAnswer', method: 'PUT', body, actor: 'studentB', status: 404, code: 'NOT_FOUND' });
        await request(savePath, { operation: 'saveAnswer', method: 'PUT', body, status: 409, code: 'REVISION_CONFLICT' });
      }
      await request(`${path}/submit`, { operation: 'submitAttempt', method: 'POST', body: {} });
      const submitted = await request(path, { operation: 'getAttempt' });
      assert.equal(submitted.state, 'SUBMITTED'); assert.deepEqual(submitted.slots, []);
      await request(resultPath, { operation: 'releasedResult', status: 409, code: 'RESULT_NOT_READY' });
      await manualWorker.runOnce();
      const graded = await request(path, { operation: 'getAttempt' });
      assert.equal(graded.state, 'GRADED'); assert.deepEqual(graded.slots, []);
      const review = await request(resultPath, { operation: 'releasedResult', released: true });
      assert.equal(review.totalCount, sealed.length); assert.equal(review.correctCount, sealed.length);
      await request(resultPath, { operation: 'releasedResult', actor: 'studentB', status: 404, code: 'NOT_FOUND' });
      await request(resultPath, { operation: 'releasedResult', actor: 'author', status: 403, code: 'FORBIDDEN' });
      await request(resultPath, { operation: 'releasedResult', authenticated: false, status: 401, code: 'UNAUTHENTICATED' });
      await request(`${resultPath}?unexpected=${encodeURIComponent(explanationMarker)}`, { operation: 'releasedResult', status: 422, code: 'VALIDATION_ERROR' });
      await request(`${path}/assets/${randomUUID()}?purpose=QUESTION`, { operation: 'attemptAsset', status: 404, code: 'NOT_FOUND' });
    }
    assert.deepEqual([...coveredTypes].sort(), ['MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'TRUE_FALSE_GROUP']);
    stage = 'pagination and mounted public assets';
    const history = [];
    let cursor;
    do {
      const page = await request(`/api/v1/attempts?limit=1${cursor ? `&cursor=${cursor}` : ''}`, { operation: 'attemptHistory' });
      history.push(...page.items); cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(history.map((item) => item.attemptId).sort(), [...attempts].sort());
    assert.deepEqual((await request('/api/v1/attempts', { operation: 'attemptHistory', actor: 'studentB' })).items, []);
    stage = 'rate limit and release revocation';
    await request('/api/v1/attempts', { operation: 'createAttempt', method: 'POST', body: createBody,
      status: 429, code: 'RATE_LIMITED' });
    const sources = await createSourceService({ bankPool: fixture.bankPool, identityService: fixture.identityService });
    await sources.registerRightsDecision(fixture.principals.bankManager, fixture.source.sourceVersionId, randomUUID(), {
      status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z',
      validTo: null, expectedRevision: 1, evidence: `${explanationMarker}Synthetic fixture withdrawal; not human rights evidence.`,
    });
    for (const id of attempts) {
      await request(`/api/v1/attempts/${id}/result`, { operation: 'releasedResult', status: 410, code: 'CONTENT_WITHDRAWN' });
    }
    await request('/api/v1/attempts', { operation: 'attemptHistory' });
    await request('/api/v1/catalog', { operation: 'catalog' });
    stage = 'mounted public assets';
    // The separate static-server suite pins the full allowlist. Here the actual
    // composed runtime must not serialize database canaries into its public code.
    for (const path of ['/', '/styles.css', '/fonts.css', '/app/main.js', '/app/api.js', '/app/persistent-api.js', '/app/staff.js', '/app/math.js']) {
      const text = await request(path, { json: false, authenticated: false });
      assert.ok(text.length > 0, 'public asset is not an empty privacy success');
    }
    for (const path of ['/src/private-question-fixture.mjs', '/data/research/reading_questions.txt', '/tools/question-factory/generic-fixture.mjs']) {
      await request(path, { json: false, authenticated: false, status: 404 });
    }
    t.diagnostic(JSON.stringify({ responses: observed.length, domains: 3, interactionTypes: coveredTypes.size,
      ownerReleases: 3, scannedInternalValues: hardSecrets.length,
      statuses: [...new Set(observed.map((item) => item.status))].sort((a, b) => a - b) }));
  } catch {
    // Never let assertion actual/expected, SQL errors or fetch causes print keys.
    throw new Error(`Integrated student privacy regression failed during ${stage}`);
  }
});
