import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { createEquivalenceService } from '../../../src/modules/bank/equivalence.mjs';
import { bankRequest } from '../bank/harness.mjs';
import { createBundleFixture } from './bundle-fixtures.mjs';
import { createAllocationFixture } from './fixtures.mjs';

function requestFor(blueprintVersionId) {
  return { blueprintVersionId };
}

async function expectCommand(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

function interceptPool(pool, queryHook) {
  return {
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') return (...args) => queryHook(target.query.bind(target), ...args);
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

function lockedCommitPool(pool, winningKey = null, { statementTimeoutMs = null } = {}) {
  if (statementTimeoutMs !== null && (!Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs <= 0)) {
    throw new TypeError('A positive integer SQL timeout is required');
  }
  let arrivals = 0;
  let abortReason = null;
  let announceReady;
  let announceWinnerQuery;
  let releaseWinner;
  const bothReady = new Promise((resolve) => { announceReady = resolve; });
  const winnerQuery = new Promise((resolve) => { announceWinnerQuery = resolve; });
  const winnerGate = new Promise((resolve) => { releaseWinner = resolve; });
  const wrapped = interceptPool(pool, async (query, text, values) => {
    if (text === 'BEGIN' && statementTimeoutMs !== null) {
      const result = await query(text, values);
      // SET is a utility statement: SELECT set_config would prevent later isolation setup.
      await query(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
      return result;
    }
    if (typeof text !== 'string' || !text.includes('tsa.assembly_commit_personal')) return query(text, values);
    arrivals += 1;
    const arrival = arrivals;
    if (arrivals === 2) announceReady();
    await bothReady;
    if (abortReason) throw abortReason;
    if (winningKey === null ? arrival === 1 : values[0] === winningKey) {
      const result = await query(text, values);
      announceWinnerQuery();
      await winnerGate;
      if (abortReason) throw abortReason;
      return result;
    }
    await winnerQuery;
    if (abortReason) throw abortReason;
    return query(text, values);
  });
  return {
    pool: wrapped, winnerQuery, releaseWinner,
    abort(error) {
      abortReason ??= error;
      announceReady();
      announceWinnerQuery();
      releaseWinner();
    },
    get failure() { return abortReason; },
  };
}

function simultaneousCommitPool(pool, expected) {
  let completed = 0;
  let announceCompleted;
  let timedOut = false;
  const allCompleted = new Promise((resolve) => { announceCompleted = resolve; });
  const timeout = setTimeout(() => { timedOut = true; announceCompleted(); }, 7_500);
  timeout.unref?.();
  return interceptPool(pool, async (query, text, values) => {
    if (typeof text !== 'string' || !text.includes('tsa.assembly_commit_personal')) return query(text, values);
    const result = await query(text, values);
    completed += 1;
    if (completed === expected) announceCompleted();
    await allCompleted;
    if (timedOut) throw new Error('Different-student commits did not reach their persisted write barrier');
    return result;
  });
}

function pauseBeforeCommitPool(pool) {
  let announceReached;
  let release;
  const reached = new Promise((resolve) => { announceReached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    pool: interceptPool(pool, async (query, text, values) => {
      if (typeof text === 'string' && text.includes('tsa.assembly_commit_personal')) {
        announceReached(JSON.parse(values[2]));
        await gate;
      }
      return query(text, values);
    }),
    reached,
    release,
  };
}

function pauseAfterCommitQueryPool(pool) {
  let announceReached;
  let release;
  const reached = new Promise((resolve) => { announceReached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    pool: interceptPool(pool, async (query, text, values) => {
      if (typeof text === 'string' && text.includes('tsa.assembly_commit_personal')) {
        const result = await query(text, values);
        announceReached({ plan: JSON.parse(values[2]), result: result.rows[0]?.result });
        await gate;
        return result;
      }
      return query(text, values);
    }),
    reached,
    release,
  };
}

async function waitForAllocationLock(pool, expected = 1) {
  const deadline = Date.now() + 7_500;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name='tsa-allocation-exam-test' AND wait_event_type='Lock'
        AND query LIKE '%assembly_commit_personal%'`);
    if (result.rows[0].waiting >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${expected} allocation session(s) on a real PostgreSQL lock`);
}

async function waitForBankLock(pool) {
  const deadline = Date.now() + 7_500;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name='tsa-bank-api-test' AND wait_event_type='Lock'
        AND query LIKE '%pg_advisory_xact_lock%'`);
    if (result.rows[0].waiting >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the bank workflow to block behind an allocation-held Bank lock');
}

async function serviceError(service, principal, key, body) {
  try {
    await service.create(principal, key, body);
    assert.fail('Expected allocation to fail');
  } catch (error) {
    return error;
  }
}

async function withAllocationWriteFailure(pool, table, operation, name, work) {
  await pool.query(`CREATE FUNCTION tsa_private.${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic allocation failure'; END $$`);
  const triggerKind = operation === 'UPDATE' ? 'BEFORE UPDATE' : 'BEFORE INSERT';
  try {
    await pool.query(`CREATE ${operation === 'DEFERRED_INSERT' ? 'CONSTRAINT ' : ''}TRIGGER ${name}
      ${operation === 'DEFERRED_INSERT' ? 'AFTER INSERT' : `${triggerKind}`} ON ${table}
      ${operation === 'DEFERRED_INSERT' ? 'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW' : 'FOR EACH ROW'}
      EXECUTE FUNCTION tsa_private.${name}()`);
    await work();
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
    await pool.query(`DROP FUNCTION IF EXISTS tsa_private.${name}()`);
  }
}

async function allocationCounts(pool, userId) {
  const { rows: [row] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.assembly_runs WHERE user_id=$1 AND outcome='SUCCESS') AS runs,
    (SELECT count(*)::int FROM tsa.forms WHERE owner_user_id=$1) AS forms,
    (SELECT count(*)::int FROM tsa.attempts WHERE user_id=$1) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history WHERE user_id=$1) AS history,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts') AS receipts`, [userId]);
  return row;
}

async function sealedSnapshot(pool, formId) {
  const result = await pool.query(`SELECT f.content_hash AS form_hash,f.policy_versions,f.sealed_at,
      s.slot_id,s.question_id,s.question_version_id,s.section_id,s.ordinal,s.public_snapshot,s.snapshot_hash,
      k.key_snapshot,k.explanation_snapshot,k.policy_version,k.secret_hash
    FROM tsa.forms f JOIN tsa.form_slots s ON s.form_id=f.id
    JOIN tsa_private.form_slot_secrets k USING(form_id,slot_id)
    WHERE f.id=$1 ORDER BY s.ordinal`, [formId]);
  return result.rows;
}

test('personal NEW_ONLY allocation authenticates, seals atomically, replays safely and preserves per-student history under concurrent creation', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 12, blueprintCount: 4 });
  t.after(() => fixture.close());
  const { pool, examPool, principals, blueprint } = fixture;
  const request = requestFor(blueprint.versionId);
  const actorA = principals.studentA;
  const actorB = principals.studentB;
  const actorAId = actorA.userId;
  const service = createAllocationService({ examPool, identityService: fixture.identityService });

  await t.test('strict input and candidate policy reject before database allocation', async () => {
    await expectCommand(service.create({ authenticated: false }, 'bad-unauth', request), 401, 'UNAUTHENTICATED');
    await expectCommand(service.create(principals.author, 'bad-author', request), 403, 'FORBIDDEN');
    await expectCommand(service.create(actorA, 'bad key', request), 422, 'VALIDATION_ERROR');
    await expectCommand(service.create(actorA, randomUUID(), { ...request, seed: 42 }), 422, 'VALIDATION_ERROR');
    await expectCommand(service.create(actorA, randomUUID(), { ...request, userId: actorAId }), 422, 'VALIDATION_ERROR');
    assert.deepEqual(await allocationCounts(pool, actorAId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
  });

  await t.test('unsupported modes and offering errors keep their explicit status without fallback', async () => {
    await expectCommand(service.create(actorA, randomUUID(), {
      mode: 'PERSONALIZED_PRACTICE', blueprintVersionId: blueprint.versionId,
      reuseMode: 'REVIEW_ALLOWED', acknowledgeRepeats: true,
    }), 503, 'TEMPORARILY_UNAVAILABLE');
    await expectCommand(service.create(actorA, randomUUID(), {
      mode: 'PUBLISHED_FIXED', formId: randomUUID(), reuseMode: 'FIXED_AS_PUBLISHED', acknowledgeRepeats: true,
    }), 503, 'TEMPORARILY_UNAVAILABLE');
    await expectCommand(service.create(actorA, randomUUID(), requestFor(randomUUID())), 404, 'NOT_FOUND');

    const future = await fixture.createBlueprint({ count: 4, availableFrom: new Date(Date.now() + 60_000) });
    await expectCommand(service.create(actorA, randomUUID(), requestFor(future.versionId)), 409, 'FORM_NOT_OPEN');
    const expired = await fixture.createBlueprint({ count: 4, availableUntil: new Date(Date.now() - 60_000) });
    await expectCommand(service.create(actorA, randomUUID(), requestFor(expired.versionId)), 410, 'FORM_UNAVAILABLE');
    const disabled = await fixture.createBlueprint({ count: 4 });
    await pool.query('UPDATE tsa.blueprint_offerings SET enabled=false,revision=revision+1 WHERE blueprint_version_id=$1', [disabled.versionId]);
    await expectCommand(service.create(actorA, randomUUID(), requestFor(disabled.versionId)), 410, 'FORM_UNAVAILABLE');
    assert.deepEqual(await allocationCounts(pool, actorAId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
  });

  await t.test('search exhaustion stays distinct from proven inventory shortage', async () => {
    const bounded = createAllocationService({ examPool, identityService: fixture.identityService, limits: { maxNodes: 1, maxUnits: 2_000 } });
    const error = await serviceError(bounded, actorA, `bounded-search-${randomUUID()}`, request);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'SEARCH_EXHAUSTED');
    assert.deepEqual(error.details, { blueprintVersionId: blueprint.versionId, reuseMode: 'NEW_ONLY' });
    assert.deepEqual(await allocationCounts(pool, actorAId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
  });

  await t.test('three stale snapshots stop with a conflict and write no partial allocation', async () => {
    let staleCommits = 0;
    const stalePool = interceptPool(examPool, async (query, text, values) => {
      if (typeof text === 'string' && text.includes('tsa.assembly_commit_personal')) {
        staleCommits += 1;
        await pool.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1,updated_at=clock_timestamp() WHERE id=1');
      }
      return query(text, values);
    });
    const staleService = createAllocationService({ examPool: stalePool, identityService: fixture.identityService });
    await expectCommand(staleService.create(actorA, `stale-replan-${randomUUID()}`, request), 409, 'CONCURRENT_MODIFICATION');
    assert.equal(staleCommits, 3, 'the service performs only the frozen three capture/commit attempts');
    assert.deepEqual(await allocationCounts(pool, actorAId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
  });

  await t.test('service cannot persist a tampered sealed-form projection', async () => {
    const tamperedPool = interceptPool(examPool, async (query, text, values) => {
      if (typeof text === 'string' && text.includes('tsa.assembly_commit_personal')) {
        const mutated = JSON.parse(values[2]);
        const form = JSON.parse(mutated.formBytes);
        form.untrustedExtra = true;
        mutated.formBytes = JSON.stringify(form);
        mutated.formHash = `sha256:${createHash('sha256').update(mutated.formBytes).digest('hex')}`;
        values = [values[0], values[1], JSON.stringify(mutated)];
      }
      return query(text, values);
    });
    const tampered = createAllocationService({ examPool: tamperedPool, identityService: fixture.identityService });
    await expectCommand(tampered.create(actorA, randomUUID(), request), 422, 'VALIDATION_ERROR');
    assert.deepEqual(await allocationCounts(pool, actorAId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
  });

  await t.test('each persistence stage and deferred commit failure rolls back atomically', async () => {
    const writePoints = [
      ['tsa.assembly_runs', 'INSERT', 'fail_allocation_run'],
      ['tsa.forms', 'INSERT', 'fail_allocation_form'],
      ['tsa.form_sections', 'INSERT', 'fail_allocation_section'],
      ['tsa.form_slots', 'INSERT', 'fail_allocation_slot'],
      ['tsa_private.form_slot_secrets', 'INSERT', 'fail_allocation_secret'],
      ['tsa.form_availability', 'INSERT', 'fail_allocation_availability'],
      ['tsa.attempts', 'INSERT', 'fail_allocation_attempt'],
      ['tsa.student_question_history', 'INSERT', 'fail_allocation_history'],
      ['tsa.student_allocation_state', 'UPDATE', 'fail_allocation_revision'],
      ['tsa.idempotency_records', 'INSERT', 'fail_allocation_receipt'],
      ['tsa.audit_events', 'INSERT', 'fail_allocation_audit'],
      ['tsa.forms', 'DEFERRED_INSERT', 'fail_allocation_deferred_commit'],
    ];
    const baseline = await allocationCounts(pool, actorAId);
    for (const [table, operation, name] of writePoints) {
      await withAllocationWriteFailure(pool, table, operation, name, async () => {
        const error = await serviceError(service, actorA, `fault-${name}-${randomUUID()}`, request);
        assert.equal(error.status, 503);
        assert.equal(error.code, 'TEMPORARILY_UNAVAILABLE');
        assert.equal(error.message.includes('synthetic allocation failure'), false, 'database diagnostics are never returned to candidates');
      });
      assert.deepEqual(await allocationCounts(pool, actorAId), baseline, `${table} ${operation} leaves no run, form, attempt, history or receipt`);
      const revision = await pool.query('SELECT revision::text AS revision FROM tsa.student_allocation_state WHERE user_id=$1', [actorAId]);
      assert.equal(revision.rows[0]?.revision ?? '0', '0', `${table} ${operation} does not advance the allocation history revision`);
    }
  });

  await t.test('both commit winner orders produce one receipt per active student and a disjoint later form', async () => {
    const firstWinnerKey = `allocation-first-${randomUUID()}`;
    const firstLoserKey = `allocation-second-${randomUUID()}`;
    const firstBarrier = lockedCommitPool(examPool, firstWinnerKey);
    const firstRace = createAllocationService({ examPool: firstBarrier.pool, identityService: fixture.identityService });
    const firstPending = Promise.allSettled([
      firstRace.create(actorA, firstWinnerKey, request),
      firstRace.create(actorA, firstLoserKey, request),
    ]);
    await firstBarrier.winnerQuery;
    try { await waitForAllocationLock(pool); }
    finally { firstBarrier.releaseWinner(); }
    const firstPair = await firstPending;
    const firstSuccess = firstPair.find((item) => item.status === 'fulfilled');
    const firstFailure = firstPair.find((item) => item.status === 'rejected');
    assert.ok(firstSuccess);
    assert.ok(firstFailure);
    assert.equal(firstSuccess.value.status, 201);
    assert.equal(firstSuccess.value.replayed, false);
    assert.equal(firstFailure.reason.code, 'CONCURRENT_ATTEMPT_EXISTS');
    assert.equal(firstFailure.reason.status, 409);
    assert.equal(firstFailure.reason.details.existingAttemptId, firstSuccess.value.body.attemptId);

    const firstReceipt = firstSuccess.value.body;
    assert.deepEqual(Object.keys(firstReceipt).sort(), ['attemptId', 'domain', 'formId', 'formMode', 'reuseMode', 'reusePolicyVersion', 'startBefore', 'state'].sort());
    assert.equal(JSON.stringify(firstReceipt).includes('answerKey'), false);
    assert.equal(JSON.stringify(firstReceipt).includes('explanation'), false);
    assert.equal(JSON.stringify(firstReceipt).includes('questionVersionId'), false);
    assert.deepEqual(await service.create(actorA, firstWinnerKey, request), { status: 201, body: firstReceipt, replayed: true });
    await expectCommand(service.create(actorA, firstWinnerKey, {
      mode: 'PERSONALIZED_PRACTICE', blueprintVersionId: blueprint.versionId, reuseMode: 'REVIEW_ALLOWED', acknowledgeRepeats: true,
    }), 409, 'IDEMPOTENCY_CONFLICT');
    await expectCommand(service.create(actorA, firstWinnerKey, {
      mode: 'PUBLISHED_FIXED', formId: randomUUID(), reuseMode: 'FIXED_AS_PUBLISHED', acknowledgeRepeats: true,
    }), 409, 'IDEMPOTENCY_CONFLICT');
    await expectCommand(service.create(actorA, randomUUID(), request), 409, 'CONCURRENT_ATTEMPT_EXISTS');

    const firstRows = await pool.query(`SELECT s.question_id,s.question_version_id,s.public_snapshot,s.snapshot_hash,
        k.key_snapshot,k.explanation_snapshot,k.secret_hash
      FROM tsa.form_slots s JOIN tsa_private.form_slot_secrets k USING(form_id,slot_id)
      WHERE s.form_id=$1 ORDER BY s.ordinal`, [firstReceipt.formId]);
    assert.equal(firstRows.rowCount, 4);
    const firstQuestionIds = new Set(firstRows.rows.map((row) => row.question_id));
    for (const slot of firstRows.rows) {
      assert.equal(slot.snapshot_hash, `sha256:${createHash('sha256').update(canonicalize(slot.public_snapshot)).digest('hex')}`);
      assert.equal(slot.secret_hash, `sha256:${createHash('sha256').update(canonicalize({
        answerKey: slot.key_snapshot, explanation: slot.explanation_snapshot, policyVersion: 'practice-binary-v1',
      })).digest('hex')}`);
    }
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM tsa.audit_events
      WHERE action='ATTEMPT_ALLOCATED' AND entity_id=$1`, [firstReceipt.attemptId])).rows[0].n, 1);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM tsa.jobs WHERE attempt_id=$1`, [firstReceipt.attemptId])).rows[0].n, 0);

    const selectedQuestion = fixture.questions.find((question) => question.questionId === firstRows.rows[0].question_id);
    assert.ok(selectedQuestion);
    const correction = await fixture.createQuestionVersion(selectedQuestion, randomUUID());
    assert.equal(correction.questionId, selectedQuestion.questionId);
    const untouchedQuestion = fixture.questions.find((question) => !firstQuestionIds.has(question.questionId));
    assert.ok(untouchedQuestion);
    const equivalence = await createEquivalenceService({ bankPool: fixture.bankPool, identityService: fixture.identityService });
    const bankRevision = (await pool.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id=1')).rows[0].revision;
    const sealedBeforeMerge = await sealedSnapshot(pool, firstReceipt.formId);
    const merge = await equivalence.adjudicate(principals.reviewer, `allocation-merge-${randomUUID()}`, {
      left: { versionId: selectedQuestion.versionId, contentHash: selectedQuestion.contentHash, expectedRevision: 3 },
      right: { versionId: untouchedQuestion.versionId, contentHash: untouchedQuestion.contentHash, expectedRevision: 3 },
      kind: 'EXACT',
      decision: 'CONFIRMED',
      expectedBankRevision: bankRevision,
      reason: 'Synthetic late equivalence fixture for allocation history exclusion.',
    });
    assert.equal(merge.body.decision, 'CONFIRMED');
    assert.equal(merge.body.incidentRecorded, true);
    assert.deepEqual(await sealedSnapshot(pool, firstReceipt.formId), sealedBeforeMerge, 'late equivalence leaves sealed public/private snapshots byte-for-byte unchanged');

    const sameKey = `student-b-same-key-${randomUUID()}`;
    const sameKeyBarrier = lockedCommitPool(examPool);
    const sameKeyService = createAllocationService({ examPool: sameKeyBarrier.pool, identityService: fixture.identityService });
    const sameKeyPending = Promise.allSettled([
      sameKeyService.create(actorB, sameKey, request),
      sameKeyService.create(actorB, sameKey, request),
    ]);
    await sameKeyBarrier.winnerQuery;
    try { await waitForAllocationLock(pool); }
    finally { sameKeyBarrier.releaseWinner(); }
    const sameKeyPair = await sameKeyPending;
    assert.equal(sameKeyPair.filter((item) => item.status === 'fulfilled').length, 2);
    assert.deepEqual(sameKeyPair.map((item) => item.value.replayed).sort(), [false, true]);
    assert.deepEqual(sameKeyPair[0].value.body, sameKeyPair[1].value.body);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM tsa.attempts WHERE user_id=$1', [actorB.userId])).rows[0].n, 1);

    await pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1", [firstReceipt.attemptId]);
    const secondWinnerKey = `allocation-fourth-${randomUUID()}`;
    const secondLoserKey = `allocation-third-${randomUUID()}`;
    const secondBarrier = lockedCommitPool(examPool, secondWinnerKey);
    const secondRace = createAllocationService({ examPool: secondBarrier.pool, identityService: fixture.identityService });
    const secondPending = Promise.allSettled([
      secondRace.create(actorA, secondLoserKey, request),
      secondRace.create(actorA, secondWinnerKey, request),
    ]);
    await secondBarrier.winnerQuery;
    try { await waitForAllocationLock(pool); }
    finally { secondBarrier.releaseWinner(); }
    const secondPair = await secondPending;
    const secondSuccess = secondPair.find((item) => item.status === 'fulfilled');
    const secondFailure = secondPair.find((item) => item.status === 'rejected');
    assert.ok(secondSuccess);
    assert.ok(secondFailure);
    assert.equal(secondSuccess.value.status, 201);
    assert.equal(secondFailure.reason.code, 'CONCURRENT_ATTEMPT_EXISTS');
    const secondRows = await pool.query('SELECT question_id FROM tsa.form_slots WHERE form_id=$1', [secondSuccess.value.body.formId]);
    assert.equal(secondRows.rowCount, 4);
    for (const row of secondRows.rows) assert.equal(firstQuestionIds.has(row.question_id), false, 'cancelled assignments remain excluded from later NEW_ONLY forms');
    assert.equal(secondRows.rows.some((row) => row.question_id === untouchedQuestion.questionId), false, 'equivalence merge expands history exclusions to the newly confirmed group member');
    const history = await pool.query('SELECT question_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id', [actorAId]);
    assert.equal(history.rowCount, 8);
    assert.equal(new Set(history.rows.map((row) => row.question_id)).size, 8);
  });

  await t.test('restricted database roles cannot call private allocation entry points', async () => {
    for (const role of ['tsa_web', 'tsa_bank', 'tsa_factory', 'tsa_identity']) {
      await assert.rejects(withTransaction(pool, (client) => client.query('SELECT tsa.assembly_receipt($1,$2)', ['x', 'sha256:' + '0'.repeat(64)]), { role }), { code: '42501' });
    }
    await pool.query('REVOKE EXECUTE ON FUNCTION tsa.assembly_receipt(text,text) FROM tsa_exam');
    try {
      await expectCommand(service.create(actorA, `permission-denied-${randomUUID()}`, request), 403, 'FORBIDDEN');
    } finally {
      await pool.query('GRANT EXECUTE ON FUNCTION tsa.assembly_receipt(text,text) TO tsa_exam');
    }
  });
});

test('a real PostgreSQL stock shortage maps to the frozen safe DTO and writes no attempt state', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 3, blueprintCount: 4 });
  t.after(() => fixture.close());
  const service = createAllocationService({ examPool: fixture.examPool, identityService: fixture.identityService });
  const error = await serviceError(service, fixture.principals.studentA, `short-${randomUUID()}`, requestFor(fixture.blueprint.versionId));
  assert.equal(error.status, 422);
  assert.equal(error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
  assert.deepEqual(error.details, {
    blueprintVersionId: fixture.blueprint.versionId,
    reuseMode: 'NEW_ONLY',
    sectionDeficits: [{ sectionId: 'allocation-section', missingCount: 1 }],
    alternatives: [],
  });
  assert.equal(JSON.stringify(error.details).includes(fixture.questions[0].versionId), false);
  assert.equal(JSON.stringify(error.details).includes(fixture.source.sourceVersionId), false);
  assert.deepEqual(await allocationCounts(fixture.pool, fixture.principals.studentA.userId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
});

test('NEW_ONLY history retained by cancellation produces a distinct unseen-inventory shortage', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  t.after(() => fixture.close());
  const service = createAllocationService({ examPool: fixture.examPool, identityService: fixture.identityService });
  const principal = fixture.principals.studentA;
  const first = await service.create(principal, `seen-once-${randomUUID()}`, requestFor(fixture.blueprint.versionId));
  const assigned = await fixture.pool.query('SELECT question_id FROM tsa.form_slots WHERE form_id=$1', [first.body.formId]);
  await fixture.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1", [first.body.attemptId]);

  const error = await serviceError(service, principal, `seen-again-${randomUUID()}`, requestFor(fixture.blueprint.versionId));
  assert.equal(error.status, 422);
  assert.equal(error.code, 'INSUFFICIENT_UNSEEN_INVENTORY');
  assert.deepEqual(error.details, {
    blueprintVersionId: fixture.blueprint.versionId,
    reuseMode: 'NEW_ONLY',
    sectionDeficits: [{ sectionId: 'allocation-section', missingCount: 4 }],
    alternatives: [],
  });
  assert.deepEqual((await fixture.pool.query('SELECT question_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id', [principal.userId])).rows
    .map((row) => row.question_id).sort(), assigned.rows.map((row) => row.question_id).sort());
  assert.deepEqual(await allocationCounts(fixture.pool, principal.userId), { runs: 1, forms: 1, attempts: 1, history: 4, receipts: 1 });
});

test('rights revocation committed after snapshot capture but before allocation blocks the stale plan', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  t.after(() => fixture.close());
  const paused = pauseBeforeCommitPool(fixture.examPool);
  const service = createAllocationService({ examPool: paused.pool, identityService: fixture.identityService });
  const pending = service.create(fixture.principals.studentA, `rights-race-${randomUUID()}`, requestFor(fixture.blueprint.versionId));
  const capturedPlan = await paused.reached;
  assert.equal(capturedPlan.result.status, 'SUCCESS');
  assert.equal(capturedPlan.result.slots.length, 4);

  const response = await bankRequest(fixture.harness, fixture.browsers.bankManager,
    `/api/v1/source-versions/${fixture.source.sourceVersionId}/rights`, {
      method: 'POST', key: `rights-revoke-${randomUUID()}`,
      body: {
        status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'],
        validFrom: '2000-01-01T00:00:00Z', validTo: null,
        evidence: 'Synthetic race fixture; not a real rights attestation.', expectedRevision: 1,
      },
    });
  assert.equal(response.status, 201, await response.clone().text());
  paused.release();
  const error = await serviceErrorFrom(pending);
  assert.equal(error.status, 422);
  assert.equal(error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
  assert.deepEqual(await allocationCounts(fixture.pool, fixture.principals.studentA.userId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
});

test('a quarantine waiting behind a committed allocation withdraws and cancels it without changing sealed bytes or assignment history', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  t.after(() => fixture.close());
  const paused = pauseAfterCommitQueryPool(fixture.examPool);
  const service = createAllocationService({ examPool: paused.pool, identityService: fixture.identityService });
  const pending = service.create(fixture.principals.studentA, `quarantine-race-${randomUUID()}`, requestFor(fixture.blueprint.versionId));
  const { plan, result } = await paused.reached;
  assert.equal(result.status, 'CREATED');
  const targetVersionId = plan.result.slots[0].questionVersionId;
  const target = fixture.questions.find((question) => question.versionId === targetVersionId);
  assert.ok(target);
  const quarantinePending = fixture.workflow.quarantine(fixture.principals.bankManager, targetVersionId,
    `quarantine-allocation-${randomUUID()}`, {
      expectedRevision: 3,
      reason: 'Synthetic allocation-versus-quarantine lock-order fixture.',
    });
  try { await waitForBankLock(fixture.pool); }
  finally { paused.release(); }
  const allocation = await pending;
  const quarantined = await quarantinePending;
  assert.equal(allocation.status, 201);
  assert.deepEqual(quarantined.body, { state: 'QUARANTINED', revision: 4 });

  const attempt = await fixture.pool.query(`SELECT a.state::text AS state,a.cancellation_reason,
      fa.withdrawn_at, f.content_hash,
      (SELECT count(*)::int FROM tsa_private.form_delivery_holds h WHERE h.form_id=f.id) AS holds,
      (SELECT count(*)::int FROM tsa_private.delivery_hold_completions c JOIN tsa_private.form_delivery_holds h ON h.id=c.hold_id WHERE h.form_id=f.id) AS completed_holds
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
    JOIN tsa.form_availability fa ON fa.form_id=f.id WHERE a.id=$1`, [allocation.body.attemptId]);
  assert.equal(attempt.rows[0].state, 'CANCELLED');
  assert.equal(attempt.rows[0].cancellation_reason, 'FORM_WITHDRAWN');
  assert.equal(attempt.rows[0].content_hash, plan.formHash);
  assert.ok(attempt.rows[0].withdrawn_at);
  assert.equal(attempt.rows[0].holds, 1);
  assert.equal(attempt.rows[0].completed_holds, 1);
  const history = await fixture.pool.query('SELECT question_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id', [fixture.principals.studentA.userId]);
  assert.equal(history.rowCount, 4);
  const sealed = await sealedSnapshot(fixture.pool, allocation.body.formId);
  assert.equal(sealed.length, 4);
  for (const row of sealed) {
    const snapshot = plan.snapshots.find((item) => item.slotId === row.slot_id);
    assert.ok(snapshot);
    assert.deepEqual(row.public_snapshot, snapshot.publicSnapshot);
    assert.deepEqual(row.key_snapshot, snapshot.privateSnapshot.answerKey);
    assert.deepEqual(row.explanation_snapshot, snapshot.privateSnapshot.explanation);
    assert.equal(row.secret_hash, snapshot.privateHash);
  }
});

test('a quarantine committed between snapshot capture and allocation prevents any form, attempt or history write', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  t.after(() => fixture.close());
  const paused = pauseBeforeCommitPool(fixture.examPool);
  const service = createAllocationService({ examPool: paused.pool, identityService: fixture.identityService });
  const pending = service.create(fixture.principals.studentA, `quarantine-first-${randomUUID()}`, requestFor(fixture.blueprint.versionId));
  const plan = await paused.reached;
  assert.equal(plan.result.status, 'SUCCESS');
  const versionId = plan.result.slots[0].questionVersionId;
  const quarantined = await fixture.workflow.quarantine(fixture.principals.bankManager, versionId,
    `quarantine-before-commit-${randomUUID()}`, {
      expectedRevision: 3,
      reason: 'Synthetic quarantine-before-allocation lock-order fixture.',
    });
  assert.deepEqual(quarantined.body, { state: 'QUARANTINED', revision: 4 });
  paused.release();
  const error = await serviceErrorFrom(pending);
  assert.equal(error.status, 422);
  assert.equal(error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
  assert.deepEqual(await allocationCounts(fixture.pool, fixture.principals.studentA.userId), { runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0 });
});

test('different candidates can hold two successful allocation commits concurrently and reuse the same complete stock', async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  t.after(() => fixture.close());
  const service = createAllocationService({
    examPool: simultaneousCommitPool(fixture.examPool, 2),
    identityService: fixture.identityService,
  });
  const request = requestFor(fixture.blueprint.versionId);
  const [left, right] = await Promise.all([
    service.create(fixture.principals.studentA, `student-a-${randomUUID()}`, request),
    service.create(fixture.principals.studentB, `student-b-${randomUUID()}`, request),
  ]);
  assert.equal(left.status, 201);
  assert.equal(right.status, 201);
  const questionIds = async (formId) => (await fixture.pool.query(
    'SELECT question_id FROM tsa.form_slots WHERE form_id=$1 ORDER BY question_id', [formId])).rows.map((row) => row.question_id);
  assert.deepEqual(await questionIds(left.body.formId), await questionIds(right.body.formId));
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.student_question_history')).rows[0].n, 8);
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts')).rows[0].n, 2);
});

test('same-user MATH and READING creation races serialize across distinct blueprint pins in both winner orders', { timeout: 60_000 }, async (t) => {
  const fixture = await createBundleFixture({ section: 'READING', bundleCount: 1 });
  t.after(() => fixture.close());

  const mathQuestions = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    fixture.createQuestion(fixture.source, `cross-domain-race-math-${index + 1}-${randomUUID()}`)));
  const mathBlueprint = await fixture.createBlueprint({ count: 4, section: 'MATH' });
  const readingBlueprint = fixture.blueprint;
  assert.notEqual(mathBlueprint.versionId, readingBlueprint.versionId);

  const mathPins = new Set(mathQuestions.map((question) => `${question.questionId}:${question.versionId}`));
  const readingPins = new Set(fixture.bundles[0].questions.map((question) => `${question.questionId}:${question.versionId}`));
  assert.equal(mathPins.size, 4);
  assert.equal(readingPins.size, 2);

  const scenarios = [
    {
      name: 'MATH wins while READING waits',
      principal: fixture.principals.studentA,
      winnerDomain: 'MATH',
      winnerKey: `math-wins-${randomUUID()}`,
      loserKey: `reading-loses-${randomUUID()}`,
      winnerBlueprint: mathBlueprint,
      loserBlueprint: readingBlueprint,
      expectedQuestionPins: mathPins,
      expectedCount: 4,
    },
    {
      name: 'READING wins while MATH waits',
      principal: fixture.principals.studentB,
      winnerDomain: 'READING',
      winnerKey: `reading-wins-${randomUUID()}`,
      loserKey: `math-loses-${randomUUID()}`,
      winnerBlueprint: readingBlueprint,
      loserBlueprint: mathBlueprint,
      expectedQuestionPins: readingPins,
      expectedCount: 2,
    },
  ];

  for (const scenario of scenarios) await t.test(scenario.name, async () => {
    const userId = scenario.principal.userId;
    assert.deepEqual(await allocationCounts(fixture.pool, userId), {
      runs: 0, forms: 0, attempts: 0, history: 0, receipts: 0,
    });

    const barrier = lockedCommitPool(fixture.examPool, scenario.winnerKey, { statementTimeoutMs: 10_000 });
    const service = createAllocationService({ examPool: barrier.pool, identityService: fixture.identityService });
    const requests = {
      MATH: service.create(scenario.principal, scenario.winnerDomain === 'MATH' ? scenario.winnerKey : scenario.loserKey,
        requestFor(mathBlueprint.versionId)),
      READING: service.create(scenario.principal, scenario.winnerDomain === 'READING' ? scenario.winnerKey : scenario.loserKey,
        requestFor(readingBlueprint.versionId)),
    };
    const pending = Promise.allSettled([requests.MATH, requests.READING]);
    let barrierTimer;
    try {
      await Promise.race([barrier.winnerQuery, new Promise((_, reject) => {
        barrierTimer = setTimeout(() => {
          const error = new Error('Cross-domain allocation did not reach its winner barrier');
          reject(error);
          barrier.abort(error);
        }, 7_500);
      })]);
      if (barrier.failure) throw barrier.failure;
      await waitForAllocationLock(fixture.pool);
    } catch (error) {
      barrier.abort(error);
      const settled = await pending;
      const outcomes = settled.map((item) => item.status === 'fulfilled' ? 'fulfilled'
        : `rejected:${item.reason?.status ?? 'unknown'}:${item.reason?.code ?? 'unknown'}`);
      error.message += `; request outcomes: ${outcomes.join(', ')}`;
      throw error;
    } finally {
      clearTimeout(barrierTimer);
      barrier.releaseWinner();
      // Abort releases every JS gate; the SQL timeout also bounds database waits.
      await pending;
    }

    const [mathResult, readingResult] = await pending;
    const winnerResult = scenario.winnerDomain === 'MATH' ? mathResult : readingResult;
    const loserResult = scenario.winnerDomain === 'MATH' ? readingResult : mathResult;
    assert.equal(winnerResult.status, 'fulfilled');
    assert.equal(winnerResult.value.status, 201);
    assert.equal(winnerResult.value.replayed, false);
    assert.equal(loserResult.status, 'rejected');
    assert.equal(loserResult.reason.status, 409);
    assert.equal(loserResult.reason.code, 'CONCURRENT_ATTEMPT_EXISTS');
    assert.deepEqual(loserResult.reason.details, { existingAttemptId: winnerResult.value.body.attemptId });

    const receipt = winnerResult.value.body;
    assert.equal(receipt.state, 'CREATED');
    assert.equal(receipt.domain, scenario.winnerDomain);
    assert.equal(receipt.formMode, 'PERSONALIZED_PRACTICE');
    assert.equal(receipt.reuseMode, 'NEW_ONLY');
    assert.equal(receipt.reusePolicyVersion, 'reuse/1');
    assert.equal(JSON.stringify(receipt).includes('questionVersionId'), false);
    assert.deepEqual(await allocationCounts(fixture.pool, userId), {
      runs: 1, forms: 1, attempts: 1, history: scenario.expectedCount, receipts: 1,
    });

    assert.equal((await fixture.pool.query('SELECT count(*)::integer AS n FROM tsa.assembly_runs WHERE user_id=$1', [userId])).rows[0].n, 1,
      'the losing request creates no run, including a failed diagnostic run');
    const owned = await fixture.pool.query(`SELECT a.id AS attempt_id,a.user_id,a.form_id,a.state::text AS state,
        a.form_mode::text AS attempt_mode,a.reuse_mode::text AS attempt_reuse,a.start_before_at,
        to_char(a.start_before_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_start_before,
        a.started_at,a.deadline_at,f.blueprint_version_id AS form_blueprint,f.mode::text AS form_mode,
        f.owner_user_id,f.content_hash,r.id AS run_id,r.user_id AS run_user_id,
        r.blueprint_version_id AS run_blueprint,r.form_mode::text AS run_mode,
        r.reuse_mode::text AS run_reuse,r.outcome,r.manifest,r.manifest_hash
      FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
      JOIN tsa.assembly_runs r ON r.id=f.assembly_run_id WHERE a.user_id=$1`, [userId]);
    assert.equal(owned.rowCount, 1);
    const row = owned.rows[0];
    assert.equal(row.attempt_id, receipt.attemptId);
    assert.equal(row.form_id, receipt.formId);
    assert.equal(row.state, 'CREATED');
    assert.equal(row.user_id, userId);
    assert.equal(row.owner_user_id, userId);
    assert.equal(row.attempt_mode, 'PERSONALIZED_PRACTICE');
    assert.equal(row.form_mode, 'PERSONALIZED_PRACTICE');
    assert.equal(row.run_mode, 'PERSONALIZED_PRACTICE');
    assert.equal(row.attempt_reuse, 'NEW_ONLY');
    assert.equal(row.run_reuse, 'NEW_ONLY');
    assert.equal(row.started_at, null);
    assert.equal(row.deadline_at, null);
    assert.equal(receipt.startBefore, row.exact_start_before);
    assert.equal(row.form_blueprint, scenario.winnerBlueprint.versionId);
    assert.equal(row.run_blueprint, scenario.winnerBlueprint.versionId);
    assert.equal(row.run_user_id, userId);
    assert.equal(row.outcome, 'SUCCESS');
    assert.equal(row.manifest.blueprintVersionId, scenario.winnerBlueprint.versionId);
    assert.equal(row.manifest.blueprintHash, scenario.winnerBlueprint.contentHash);
    assert.equal(row.manifest.reuseMode, 'NEW_ONLY');
    assert.equal(row.manifest.blueprint.sections[0].section, scenario.winnerDomain);
    assert.equal(row.manifest_hash,
      `sha256:${createHash('sha256').update(canonicalize(row.manifest)).digest('hex')}`);

    const sectionResult = await fixture.pool.query(`SELECT section::text AS section,question_count,duration_seconds
      FROM tsa.form_sections WHERE form_id=$1`, [receipt.formId]);
    assert.deepEqual(sectionResult.rows, [{
      section: scenario.winnerDomain,
      question_count: scenario.expectedCount,
      duration_seconds: scenario.winnerBlueprint.config.sections[0].durationSeconds,
    }]);

    const slots = await fixture.pool.query(`SELECT fs.question_id,fs.question_version_id,fs.ordinal,
        section.section::text AS section,fs.snapshot_hash,secret.secret_hash
      FROM tsa.form_slots fs JOIN tsa.form_sections section ON section.form_id=fs.form_id
      JOIN tsa_private.form_slot_secrets secret ON secret.form_id=fs.form_id AND secret.slot_id=fs.slot_id
      WHERE fs.form_id=$1 ORDER BY fs.ordinal`, [receipt.formId]);
    assert.equal(slots.rowCount, scenario.expectedCount);
    assert.ok(slots.rows.every((slot) => slot.section === scenario.winnerDomain));
    assert.deepEqual(new Set(slots.rows.map((slot) => `${slot.question_id}:${slot.question_version_id}`)),
      scenario.expectedQuestionPins);
    assert.ok(slots.rows.every((slot) => /^sha256:[0-9a-f]{64}$/.test(slot.snapshot_hash)
      && /^sha256:[0-9a-f]{64}$/.test(slot.secret_hash)));

    const receipts = await fixture.pool.query(`SELECT idempotency_key,response_status,resource_id,
        related_attempt_id,safe_response
      FROM tsa.idempotency_records WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts'
      ORDER BY idempotency_key`, [userId]);
    assert.equal(receipts.rowCount, 1, 'the losing key created no receipt');
    assert.deepEqual(receipts.rows[0], {
      idempotency_key: scenario.winnerKey,
      response_status: 201,
      resource_id: receipt.attemptId,
      related_attempt_id: receipt.attemptId,
      safe_response: receipt,
    });

    const history = await fixture.pool.query(`SELECT question_id,first_attempt_id
      FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id`, [userId]);
    assert.equal(history.rowCount, scenario.expectedCount);
    assert.ok(history.rows.every((item) => item.first_attempt_id === receipt.attemptId));
    assert.deepEqual(new Set(history.rows.map((item) => item.question_id)),
      new Set(slots.rows.map((slot) => slot.question_id)));
  });
});

async function serviceErrorFrom(promise) {
  try {
    await promise;
    assert.fail('Expected allocation to fail after rights changed');
  } catch (error) {
    return error;
  }
}
