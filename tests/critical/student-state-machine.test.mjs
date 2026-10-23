import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createHttpBoundaryHandler, studentRouteRegistry, releasedReviewRouteRegistry } from '../../packages/contracts/dist/internal.js';
import { createAttemptService } from '../../src/modules/attempts/service.mjs';
import { createDatabasePool } from '../../src/modules/database/pool.mjs';
import { createExamWorker } from '../../src/modules/jobs/exam-worker.mjs';
import { createSourceService } from '../../src/modules/sources/service.mjs';
import { createMixedStudentFixture } from '../integration/student-runtime/mixed-fixture.mjs';
import { createStudentHttpHarness } from './student-http-harness.mjs';

const cases = [[0x13579, 'submit'], [0x24680, 'expire'], [0x31415, 'revoke-active'], [0x27182, 'revoke-created']];
const rate = { capacity: 1000, refillPerSecond: 10 };
const actions = new Set(['read', 'foreign', 'result', 'create', 'save', 'stale', 'foreign-save', 'replay', 'changed-key', 'submit-before-start', 'start-replay', 'idle-worker', 'start', 'grade', 'csrf-denied', 'origin-denied', 'unauthenticated', 'staff-denied', ...cases.map(([, mode]) => mode)]);
const states = new Set(['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'GRADED', 'CANCELLED', 'INVALIDATED']);
function sanitizedFailure(seed, mode, trace, error) {
  const location = /(student-state-machine\.test\.mjs|student-http-harness\.mjs):(\d+):(\d+)/.exec(error?.stack ?? '');
  const diagnostic = { seed, mode, trace: trace.map((entry) => ({ action: actions.has(entry.action) ? entry.action : 'unknown',
    state: states.has(entry.state) ? entry.state : 'unknown', ...(Number.isInteger(entry.slot) && entry.slot >= 0 && entry.slot < 4 ? { slot: entry.slot } : {}) })),
    failure: { kind: error instanceof assert.AssertionError ? 'assertion' : error instanceof TypeError ? 'type' : 'operation',
      ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlState: error.code } : {}),
      ...(location ? { file: location[1], line: Number(location[2]), column: Number(location[3]) } : {}) } };
  return { diagnostic: JSON.stringify(diagnostic), error: new Error(`Generated lifecycle invariant failed: seed=${seed}, mode=${mode}; see sanitized action trace`) };
}
test('generated failure diagnostics omit original assertion values, causes and unexpected trace fields', () => {
  const marker = 'PRIVATE_FIXTURE_SENTINEL';
  const original = new assert.AssertionError({ actual: { answerKey: marker, id: marker }, expected: null });
  original.cause = new Error(marker);
  original.stack = `Error: ${marker}\n at request (file:///private/${marker}/student-http-harness.mjs:77:3)`;
  const failure = sanitizedFailure(1, 'submit', [{ action: 'save', state: 'IN_PROGRESS', slot: 0, value: marker }, { action: marker, state: marker, slot: marker }], original);
  assert.equal(failure.diagnostic.includes(marker), false);
  assert.equal(failure.error.stack.includes(marker), false);
  assert.equal(failure.error.cause, undefined); assert.equal(failure.error.actual, undefined); assert.equal(failure.error.expected, undefined);
  assert.equal(JSON.parse(failure.diagnostic).failure.kind, 'assertion');
  assert.deepEqual(JSON.parse(failure.diagnostic).failure, { kind: 'assertion', file: 'student-http-harness.mjs', line: 77, column: 3 });
});
function random(seed) {
  let state = seed >>> 0;
  return (size) => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % size; };
}
function response(interaction, category) {
  if (interaction.type === 'SINGLE_CHOICE') return { type: interaction.type, optionId: category === 'correct' ? 'b' : category === 'wrong' ? 'a' : null };
  if (interaction.type === 'MULTIPLE_CHOICE') return { type: interaction.type, optionIds: category === 'correct' ? ['a', 'c'] : category === 'wrong' ? ['a', 'b'] : [] };
  return { type: interaction.type, values: category === 'correct' ? { s1: true, s2: false } : category === 'wrong' ? { s1: false, s2: false } : { s1: null, s2: null } };
}
function safe(value) {
  if (Array.isArray(value)) { value.forEach(safe); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!['answerKey', 'correctAnswer', 'explanation', 'provenance', 'reviewNotes', 'keySnapshot', 'privateHash', 'questionVersionId'].includes(key), `private field ${key}`);
    safe(child);
  }
}
async function rejected(promise, code, status) {
  await assert.rejects(promise, (error) => { assert.equal(error.code, code); assert.equal(error.status, status); return true; });
}

for (const transport of ['service', 'http']) for (const [seed, mode] of cases) test(`generated student lifecycle transport=${transport} seed=${seed} mode=${mode}`, { timeout: 40_000 }, async (t) => {
  let f, workerPool, http;
  const trace = [], pick = random(seed);
  t.after(async () => {
    const errors = [];
    for (const [stage, close] of [['http', () => http?.close()], ['worker', () => workerPool?.end()], ['fixture', () => f?.close()]]) {
      try { await close(); } catch { errors.push(new Error(`Critical ${stage} cleanup failed`)); }
    }
    if (errors.length) throw new AggregateError(errors, 'Critical fixture cleanup failed');
  });
  try {
    f = await createMixedStudentFixture({ durationSeconds: mode === 'expire' ? 10 : 600 });
    await f.pool.query('CREATE ROLE critical_worker LOGIN'); await f.pool.query('GRANT tsa_exam_worker TO critical_worker');
    workerPool = createDatabasePool({ ...f.harness.database.connectionConfig, user: 'critical_worker' });
    const worker = createExamWorker({ workerPool, executorId: 'critical-model', leaseSeconds: 30, retrySeconds: 1 });
    if (transport === 'http') http = await createStudentHttpHarness(f, workerPool, safe);
    const service = http?.service ?? createAttemptService({ examPool: f.examPool, identityService: f.identityService, createRate: rate, saveRate: { user: rate, attempt: rate } });
    const owner = f.principals.studentA, foreign = f.principals.studentB;
    const creationKey = randomUUID(), startKey = randomUUID(), submitKey = randomUUID();
    const creation = await service.create(owner, creationKey, { blueprintVersionId: f.blueprint.versionId });
    const id = creation.body.attemptId, formId = creation.body.formId;
    const slots = (await f.pool.query("SELECT slot_id,public_snapshot->'interaction' AS interaction FROM tsa.form_slots WHERE form_id=$1 ORDER BY ordinal", [formId])).rows;
    assert.deepEqual(slots.map((s) => s.interaction.type).sort(), ['MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'SINGLE_CHOICE', 'TRUE_FALSE_GROUP']);
    const model = { state: 'CREATED', restricted: false, started: null, closure: null, answers: new Map(), receipts: [] };
    const coveredTypes = new Set();
    const rawClock = async () => (await f.pool.query(`SELECT created_at::text,start_before_at::text,started_at::text,deadline_at::text,closed_at::text,
      closed_at=deadline_at AS exact_expiry,closed_at>=started_at AND closed_at<deadline_at AS valid_submit,
      deadline_at=started_at+make_interval(secs=>$2::integer) AS exact_duration,start_before_at=created_at+interval '600 seconds' AS exact_ttl
      FROM tsa.attempts WHERE id=$1`, [id, mode === 'expire' ? 10 : 600])).rows[0];
    const createdClock = await rawClock();
    assert.equal(createdClock.exact_ttl, true);
    let startedClock, closedClock, submissionFloor;
    const seal = async () => (await f.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS manifest,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
      (SELECT jsonb_agg(to_jsonb(k) ORDER BY slot_id) FROM tsa_private.form_slot_secrets k WHERE k.form_id=f.id) AS keys,
      (SELECT jsonb_agg(to_jsonb(h) ORDER BY question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=$1) AS history
      FROM tsa.forms f JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE f.id=$2`, [id, formId])).rows[0];
    const original = await seal(); assert.equal(original.history.length, 4);
    async function read(principal = owner, result = false) {
      const reply = http ? await http.read(principal, id, result) : await service.withReadBoundary(principal, (ports) => createHttpBoundaryHandler({ authenticate: async () => principal, ...ports })(
        new Request(`http://127.0.0.1/api/v1/attempts/${id}${result ? '/result' : ''}`)));
      const body = http ? reply.body : await reply.json();
      (result ? releasedReviewRouteRegistry.releasedResult : studentRouteRegistry.getAttempt).responses[reply.status].schema.parse(body);
      if (reply.status !== 200 || !result) safe(body);
      if (reply.status === 200 && !result) {
        if (body.state !== 'IN_PROGRESS') { assert.deepEqual(body.slots, []); assert.deepEqual(body.answers, []); }
        else {
          assert.deepEqual(body.slots.map((slot) => slot.slotId), slots.map((slot) => slot.slot_id));
          const delivered = body.answers.map(({ slotId, value, revision }) => ({ slotId, value, revision })).sort((a, b) => a.slotId.localeCompare(b.slotId));
          const expected = [...model.answers].map(([slotId, answer]) => ({ slotId, value: answer.value, revision: answer.revision })).sort((a, b) => a.slotId.localeCompare(b.slotId));
          assert.deepEqual(delivered, expected);
        }
      }
      return { status: reply.status, body };
    }
    async function check() {
      const actual = (await f.pool.query('SELECT state,tsa.exam_instant(started_at) AS started_at,tsa.exam_instant(deadline_at) AS deadline_at,tsa.exam_instant(closed_at) AS closed_at,terminal_reason FROM tsa.attempts WHERE id=$1', [id])).rows[0];
      const raw = await rawClock();
      assert.equal(raw.created_at, createdClock.created_at); assert.equal(raw.start_before_at, createdClock.start_before_at);
      if (startedClock) { assert.equal(raw.started_at, startedClock.started_at); assert.equal(raw.deadline_at, startedClock.deadline_at); assert.equal(raw.exact_duration, true); }
      assert.equal(actual.state, model.state);
      if (model.started) {
        assert.equal(actual.started_at, model.started.startedAt);
        assert.equal(actual.deadline_at, model.started.deadlineAt);
      } else { assert.equal(actual.started_at, null); assert.equal(actual.deadline_at, null); }
      const stored = (await f.pool.query('SELECT slot_id,value,revision::int AS revision FROM tsa.answers WHERE attempt_id=$1 ORDER BY slot_id', [id])).rows;
      const expected = [...model.answers].map(([slot_id, answer]) => ({ slot_id, value: answer.value, revision: answer.revision })).sort((a, b) => a.slot_id.localeCompare(b.slot_id));
      assert.deepEqual(stored, expected);
      assert.deepEqual(await seal(), original, 'every action preserves immutable forms/manifests/private inputs/history');
      const closed = ['SUBMITTED', 'EXPIRED', 'GRADED'].includes(model.state);
      const counts = (await f.pool.query(`SELECT (SELECT count(*)::int FROM tsa.jobs WHERE attempt_id=$1) AS jobs,
        (SELECT count(*)::int FROM tsa.score_runs WHERE attempt_id=$1) AS scores,
        (SELECT count(*)::int FROM tsa.result_releases WHERE attempt_id=$1) AS releases,
        (SELECT count(*)::int FROM tsa.attempts WHERE user_id=$2 AND state IN('CREATED','IN_PROGRESS')) AS active`, [id, owner.userId])).rows[0];
      assert.deepEqual(counts, { jobs: closed ? 1 : 0, scores: model.state === 'GRADED' ? 1 : 0, releases: model.state === 'GRADED' ? 1 : 0,
        active: ['CREATED', 'IN_PROGRESS'].includes(model.state) ? 1 : 0 });
      if (model.closure) { assert.equal(actual.closed_at, model.closure.closedAt); assert.equal(actual.terminal_reason, mode === 'expire' ? 'DEADLINE' : 'EXPLICIT_SUBMIT'); }
      if (closedClock) {
        assert.equal(raw.closed_at, closedClock.closed_at, 'full precision closure remains unchanged');
        if (mode === 'expire') assert.equal(raw.exact_expiry, true, 'expiry closes exactly at the persisted deadline');
        else {
          assert.equal(raw.valid_submit, true);
          assert.equal((await f.pool.query('SELECT closed_at>=$2::timestamptz AND closed_at<=clock_timestamp() AS within_command FROM tsa.attempts WHERE id=$1', [id, submissionFloor])).rows[0].within_command, true);
        }
      }
    }
    async function action(name, forcedIndex) {
      const savedIndices = slots.map((slot, index) => model.answers.has(slot.slot_id) ? index : -1).filter((index) => index >= 0);
      const index = forcedIndex ?? (name === 'stale' ? savedIndices[pick(savedIndices.length)] : pick(slots.length)), slot = slots[index];
      trace.push({ action: name, state: model.state, slot: index });
      const entry = model.receipts.length ? model.receipts[pick(model.receipts.length)] : null;
      if (name === 'read' || name === 'foreign') {
        const observed = await read(name === 'foreign' ? foreign : owner);
        assert.equal(observed.status, name === 'foreign' ? 404 : model.state === 'INVALIDATED' ? 410 : 200);
        if (observed.status === 200) { assert.equal(observed.body.state, model.state); assert.equal(observed.body.slots.length, model.state === 'IN_PROGRESS' ? 4 : 0); }
      } else if (name === 'result') {
        const observed = await read(owner, true);
        assert.equal(observed.status, model.state === 'INVALIDATED' ? 410 : model.state === 'GRADED' ? 200 : 409);
        if (observed.status === 200) {
          const correct = [...model.answers.values()].filter((answer) => answer.category === 'correct').length;
          assert.equal(observed.body.correctCount, correct); assert.equal(observed.body.totalCount, 4);
          assert.equal(observed.body.percentage, `${correct * 25}.00`);
        }
      } else if (name === 'create') {
        await rejected(service.create(owner, randomUUID(), { blueprintVersionId: f.blueprint.versionId }), model.restricted ? 'INSUFFICIENT_ELIGIBLE_INVENTORY'
          : ['CREATED', 'IN_PROGRESS'].includes(model.state) ? 'CONCURRENT_ATTEMPT_EXISTS' : 'INSUFFICIENT_UNSEEN_INVENTORY', ['CREATED', 'IN_PROGRESS'].includes(model.state) ? 409 : 422);
      } else if (name === 'save' || name === 'stale' || name === 'foreign-save') {
        const current = model.answers.get(slot.slot_id), category = ['correct', 'wrong', 'clear'][pick(3)];
        const body = { expectedRevision: name === 'stale' ? Math.max(0, (current?.revision ?? 0) - 1) : current?.revision ?? 0, value: response(slot.interaction, category) };
        const key = randomUUID(), call = service.save(name === 'foreign-save' ? foreign : owner, id, slot.slot_id, key, body);
        if (name === 'foreign-save') await rejected(call, 'NOT_FOUND', 404);
        else if (model.restricted) await rejected(call, 'CONTENT_WITHDRAWN', 410);
        else if (model.state !== 'IN_PROGRESS') await rejected(call, 'ATTEMPT_CLOSED', 409);
        else if (name === 'stale' && current) await rejected(call, 'REVISION_CONFLICT', 409);
        else {
          const ack = await call; assert.equal(ack.status, 200); assert.equal(ack.body.revision, (current?.revision ?? 0) + 1);
          model.answers.set(slot.slot_id, { revision: ack.body.revision, value: body.value, category });
          model.receipts.push({ slot, key, body, ack });
          coveredTypes.add(slot.interaction.type);
        }
      } else if (name === 'replay' && entry) {
        const call = service.save(owner, id, entry.slot.slot_id, entry.key, entry.body);
        if (model.restricted) await rejected(call, 'CONTENT_WITHDRAWN', 410);
        else { const ack = await call; assert.deepEqual(ack.body, entry.ack.body); if (!http) assert.equal(ack.replayed, true); }
      } else if (name === 'changed-key' && entry) {
        const different = response(entry.slot.interaction, entry.body.value.type === 'SINGLE_CHOICE' && entry.body.value.optionId === 'a' ? 'correct' : 'wrong');
        if (JSON.stringify(different) === JSON.stringify(entry.body.value)) different.type === 'MULTIPLE_CHOICE' ? different.optionIds = [] : different.values = { s1: null, s2: null };
        await rejected(service.save(owner, id, entry.slot.slot_id, entry.key, { ...entry.body, value: different }), model.restricted ? 'CONTENT_WITHDRAWN' : 'IDEMPOTENCY_CONFLICT', model.restricted ? 410 : 409);
      } else if (name === 'submit-before-start') await rejected(service.submit(owner, id, randomUUID()), 'ATTEMPT_CLOSED', 409);
      else if (name === 'start-replay') {
        const replay = await service.start(owner, id, startKey); assert.deepEqual(replay.body, model.started); if (!http) assert.equal(replay.replayed, true);
      } else if (name === 'idle-worker') assert.deepEqual(await worker.claim(), { status: 'IDLE' });
      else throw new Error('Unknown or unavailable generated action');
      await check();
    }
    async function generated(names, length) {
      for (let index = 0; index < length; index++) {
        const available = names.filter((name) => !(['replay', 'changed-key'].includes(name) && !model.receipts.length) && !(name === 'stale' && !model.answers.size));
        await action(available[pick(available.length)]);
      }
    }
    await generated(['read', 'result', 'create', 'save', 'foreign', 'foreign-save', 'submit-before-start', 'idle-worker'], 12);
    async function securityProbes() {
      if (!http) return;
      const slot = slots[0], current = model.answers.get(slot.slot_id);
      const body = { expectedRevision: current?.revision ?? 0, value: response(slot.interaction, 'correct') };
      for (const [actionName, options, status, code] of [['csrf-denied', { csrf: false }, 403, 'CSRF_FAILED'], ['origin-denied', { origin: 'https://untrusted.invalid' }, 403, 'FORBIDDEN'], ['unauthenticated', { authenticated: false }, 401, 'UNAUTHENTICATED']]) {
        trace.push({ action: actionName, state: model.state, slot: 0 });
        const denied = await http.probe(owner, id, slot.slot_id, body, options);
        assert.equal(denied.status, status); assert.equal(denied.body.error.code, code); await check();
      }
      trace.push({ action: 'staff-denied', state: model.state, slot: 0 });
      const denied = await http.probe(f.principals.author, id, slot.slot_id, body, {});
      assert.equal(denied.status, 403); assert.equal(denied.body.error.code, 'FORBIDDEN'); await check();
    }
    await securityProbes();
    if (mode !== 'revoke-created') {
      trace.push({ action: 'start', state: model.state });
      model.started = (await service.start(owner, id, startKey)).body; model.state = 'IN_PROGRESS';
      startedClock = await rawClock();
      assert.equal(Date.parse(model.started.deadlineAt) - Date.parse(model.started.startedAt), (mode === 'expire' ? 10 : 600) * 1000);
      await check();
      const remaining = [0, 1, 2, 3];
      while (remaining.length) await action('save', remaining.splice(pick(remaining.length), 1)[0]);
      await securityProbes();
      await generated(['read', 'save', 'save', 'stale', 'foreign', 'foreign-save', 'replay', 'changed-key', 'result', 'create', 'start-replay'], 28);
    }
    trace.push({ action: mode, state: model.state });
    if (mode.startsWith('revoke')) {
      const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
      await sources.registerRightsDecision(f.principals.bankManager, f.source.sourceVersionId, randomUUID(), { status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'],
        validFrom: '2000-01-01T00:00:00Z', validTo: null, expectedRevision: 1, evidence: 'Synthetic generated lifecycle restriction; not human rights evidence.' });
      model.restricted = true; model.state = mode === 'revoke-created' ? 'CANCELLED' : 'INVALIDATED';
      const restricted = await read();
      assert.equal(restricted.status, mode === 'revoke-created' ? 200 : 410); // Safe cancelled metadata is allowed; content remains hidden.
      if (mode === 'revoke-created') assert.equal(restricted.body.state, 'CANCELLED');
    } else if (mode === 'submit') {
      submissionFloor = (await f.pool.query('SELECT clock_timestamp()::text AS instant')).rows[0].instant;
      model.closure = (await service.submit(owner, id, submitKey)).body; model.state = 'SUBMITTED';
      closedClock = await rawClock();
    } else {
      const until = Date.now() + 12_000;
      while (!(await f.pool.query('SELECT clock_timestamp()>=deadline_at AS due FROM tsa.attempts WHERE id=$1', [id])).rows[0].due) {
        assert.ok(Date.now() < until, 'actual persisted deadline elapses'); await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const expired = await read(); assert.equal(expired.status, 200); assert.equal(expired.body.state, 'EXPIRED');
      model.state = 'EXPIRED'; model.closure = expired.body.closure;
      closedClock = await rawClock();
    }
    await check();
    await generated(['read', 'foreign', 'result', 'save', 'foreign-save', 'replay', 'changed-key', 'create'], 18);
    if (!model.restricted) {
      trace.push({ action: 'grade', state: model.state });
      assert.equal((await worker.runOnce()).status, 'GRADED'); model.state = 'GRADED'; await check();
      await action('result');
      await generated(['read', 'foreign', 'result', 'save', 'replay', 'changed-key', 'create', 'start-replay'], 14);
    } else await action('idle-worker');
    assert.equal(coveredTypes.size, mode === 'revoke-created' ? 0 : 3);
    t.diagnostic(JSON.stringify({ transport, seed, mode, actions: trace.length, finalState: model.state, responseTypes: coveredTypes.size,
      ...(http ? { httpResponses: http.observed.length, securityProbes: mode === 'revoke-created' ? 4 : 8 } : {}) }));
  } catch (error) {
    const failure = sanitizedFailure(seed, mode, trace, error);
    t.diagnostic(JSON.stringify({ transport }));
    t.diagnostic(failure.diagnostic);
    throw failure.error;
  }
});
