import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createAllocationFixture } from './fixtures.mjs';
import { seedFixedStudentForms } from '../student-runtime/fixed-fixture.mjs';

const STATEMENT_TIMEOUT_MS = 10_000;
const BARRIER_TIMEOUT_MS = 7_500;

function fixedBody(formId) {
  return { mode: 'PUBLISHED_FIXED', formId, reuseMode: 'FIXED_AS_PUBLISHED', acknowledgeRepeats: true };
}

async function expectCommand(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

async function waitPast(pool, instant, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await pool.query('SELECT clock_timestamp()>=$1::timestamptz AS ready', [instant])).rows[0].ready) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Persisted fixed-boundary timestamp did not elapse within the test bound');
}

function interceptPool(pool, hook) {
  return {
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') return (...args) => hook(target.query.bind(target), ...args);
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}

function mixedCommitWinnerPool(pool, winnerKey) {
  let arrivals = 0;
  let abortReason = null;
  let announceReady;
  let announceWinnerQuery;
  let releaseWinner;
  const bothReady = new Promise((resolve) => { announceReady = resolve; });
  const winnerQuery = new Promise((resolve) => { announceWinnerQuery = resolve; });
  const winnerGate = new Promise((resolve) => { releaseWinner = resolve; });
  const wrapped = interceptPool(pool, async (query, text, values) => {
    if (text === 'BEGIN') {
      const result = await query(text, values);
      await query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      return result;
    }
    const commit = typeof text === 'string'
      && (text.includes('tsa.exam_fixed_attempt_create') || text.includes('tsa.assembly_commit_personal'));
    if (!commit) return query(text, values);
    arrivals += 1;
    if (arrivals === 2) announceReady();
    await bothReady;
    if (abortReason) throw abortReason;
    if (values?.[0] === winnerKey) {
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
    pool: wrapped,
    winnerQuery,
    releaseWinner,
    abort(error) {
      abortReason ??= error;
      announceReady();
      announceWinnerQuery();
      releaseWinner();
    },
  };
}

async function waitForH1Lock(pool) {
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE application_name='tsa-allocation-exam-test' AND wait_event_type='Lock'
        AND (query LIKE '%exam_fixed_attempt_create%' OR query LIKE '%assembly_commit_personal%')`);
    if (result.rows[0].waiting >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Competing fixed/personal request did not wait on the real PostgreSQL H1 lock');
}

async function waitFor(promise, label, timeoutMs = BARRIER_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not settle within ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runMixedRace(fixture, {
  principal, fixedWinner, formId, personalBlueprint, personalRequest = null, enableReviewPractice = false,
}) {
  const fixedKey = randomUUID();
  const personalKey = randomUUID();
  const winnerKey = fixedWinner ? fixedKey : personalKey;
  const barrier = mixedCommitWinnerPool(fixture.examPool, winnerKey);
  const service = createAllocationService({
    examPool: barrier.pool,
    identityService: fixture.identityService,
    enableFixedPractice: true,
    enableReviewPractice,
  });
  const pending = Promise.allSettled([
    service.create(principal, fixedKey, fixedBody(formId)),
    service.create(principal, personalKey, personalRequest ?? { blueprintVersionId: personalBlueprint.versionId }),
  ]);
  let complete = false;
  let barrierTimer;
  try {
    await Promise.race([
      barrier.winnerQuery,
      new Promise((_, reject) => {
        barrierTimer = setTimeout(() => {
          const error = new Error('Fixed/personal allocation did not reach the PostgreSQL H1 winner barrier');
          reject(error);
          barrier.abort(error);
        }, BARRIER_TIMEOUT_MS);
      }),
    ]);
    await waitForH1Lock(fixture.pool);
    barrier.releaseWinner();
    const outcomes = await waitFor(pending, 'fixed/personal race outcomes', STATEMENT_TIMEOUT_MS + BARRIER_TIMEOUT_MS);
    complete = true;
    const [fixed, personal] = outcomes;
    const winner = fixedWinner ? fixed : personal;
    const loser = fixedWinner ? personal : fixed;
    assert.equal(winner.status, 'fulfilled');
    assert.equal(winner.value.status, 201);
    assert.equal(loser.status, 'rejected');
    assert.equal(loser.reason.status, 409);
    assert.equal(loser.reason.code, 'CONCURRENT_ATTEMPT_EXISTS');
    assert.deepEqual(loser.reason.details, { existingAttemptId: winner.value.body.attemptId });
    if (fixedWinner) {
      assert.equal(winner.value.body.formMode, 'PUBLISHED_FIXED');
      assert.equal(winner.value.body.reuseMode, 'FIXED_AS_PUBLISHED');
    } else {
      assert.equal(winner.value.body.formMode, 'PERSONALIZED_PRACTICE');
      assert.equal(winner.value.body.reuseMode, personalRequest?.reuseMode ?? 'NEW_ONLY');
    }
    return { fixed, personal, winner: winner.value, fixedKey, personalKey };
  } finally {
    clearTimeout(barrierTimer);
    if (complete) barrier.releaseWinner();
    else barrier.abort(new Error('Aborting fixed/personal H1 race after assertion or barrier failure'));
    await waitFor(pending, 'settling fixed/personal race cleanup', STATEMENT_TIMEOUT_MS + BARRIER_TIMEOUT_MS);
  }
}

async function sqlFixedCreate(fixture, principal, key, request) {
  return withTransaction(fixture.examPool, async (client) => {
    await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
    const result = await client.query('SELECT tsa.exam_fixed_attempt_create($1,$2,$3::jsonb) AS result',
      [key, jsonDigest(request), JSON.stringify(request)]);
    return result.rows[0].result;
  }, { role: 'tsa_exam' });
}

async function studentCounts(fixture, userId) {
  return (await fixture.pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.attempts WHERE user_id=$1) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history WHERE user_id=$1) AS history,
    (SELECT count(*)::int FROM tsa.idempotency_records
      WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts') AS receipts`, [userId])).rows[0];
}

async function graphCounts(fixture) {
  return (await fixture.pool.query(`SELECT
    (SELECT count(*)::int FROM tsa.forms) AS forms,
    (SELECT count(*)::int FROM tsa.assembly_runs) AS runs,
    (SELECT count(*)::int FROM tsa.attempts) AS attempts,
    (SELECT count(*)::int FROM tsa.student_question_history) AS history,
    (SELECT count(*)::int FROM tsa.idempotency_records WHERE route_scope='POST /api/v1/attempts') AS receipts`)).rows[0];
}

test('fixed student allocation preserves H1 cleanup, admissions, rights, receipt and SQL privilege boundaries', { timeout: 120_000 }, async (t) => {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
  t.after(() => fixture.close());

  const forms = [];
  for (let index = 0; index < 3; index += 1) {
    const seeded = await seedFixedStudentForms(fixture);
    assert.equal(seeded.length, 1, 'each fixed form is created through the trusted B9 sealer');
    forms.push(seeded[0]);
  }
  const fixedService = createAllocationService({
    examPool: fixture.examPool,
    identityService: fixture.identityService,
    enableFixedPractice: true,
  });
  const studentA = fixture.principals.studentA;
  const studentB = fixture.principals.studentB;
  let shortBlueprint;
  let stalePersonal;

  await t.test('SQL consent is exact and fixed data stays behind narrow app functions', async () => {
    const privileges = (await fixture.pool.query(`SELECT
      has_function_privilege('tsa_exam','tsa.exam_fixed_catalog_page(integer,uuid)','EXECUTE') AS catalog_execute,
      has_function_privilege('tsa_exam','tsa.exam_fixed_attempt_create(text,text,jsonb)','EXECUTE') AS create_execute,
      has_function_privilege('tsa_exam','tsa_private.fixed_student_form(uuid)','EXECUTE') AS helper_execute,
      has_table_privilege('tsa_exam','tsa_private.fixed_form_seals','SELECT') AS seal_select,
      has_table_privilege('tsa_exam','tsa.form_availability','SELECT') AS availability_select`)).rows[0];
    assert.equal(privileges.catalog_execute, true);
    assert.equal(privileges.create_execute, true);
    assert.equal(privileges.helper_execute, false);
    assert.equal(privileges.seal_select, false);
    assert.equal(privileges.availability_select, false);
    await assert.rejects(withTransaction(fixture.examPool,
      (client) => client.query('SELECT * FROM tsa_private.fixed_form_seals LIMIT 1'), { role: 'tsa_exam' }), { code: '42501' });

    const valid = fixedBody(forms[0].formId);
    const withoutConsent = { ...valid };
    delete withoutConsent.acknowledgeRepeats;
    const invalidConsent = await sqlFixedCreate(fixture, studentB, randomUUID(), withoutConsent);
    assert.deepEqual(invalidConsent, { status: 'ERROR', code: 'VALIDATION_ERROR' });
    const falseConsent = await sqlFixedCreate(fixture, studentB, randomUUID(), { ...valid, acknowledgeRepeats: false });
    assert.deepEqual(falseConsent, { status: 'ERROR', code: 'VALIDATION_ERROR' });
    const unknown = await sqlFixedCreate(fixture, studentB, randomUUID(), fixedBody(randomUUID()));
    assert.deepEqual(unknown, { status: 'ERROR', code: 'NOT_FOUND' });
    assert.deepEqual(await studentCounts(fixture, studentB.userId), { attempts: 0, history: 0, receipts: 0 });
  });

  await t.test('fixed and personal commits contend on the same real H1 lock in both winner orders', async () => {
    const shortEnd = new Date(Date.now() + 15_000);
    shortBlueprint = await fixture.createBlueprint({ count: 4, availableUntil: shortEnd });

    const fixedFirst = await runMixedRace(fixture, {
      principal: studentA,
      fixedWinner: true,
      formId: forms[0].formId,
      personalBlueprint: fixture.blueprint,
    });
    const fixedAttempt = fixedFirst.winner.body.attemptId;
    assert.deepEqual(await studentCounts(fixture, studentA.userId), { attempts: 1, history: 4, receipts: 1 });
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.forms WHERE owner_user_id=$1', [studentA.userId])).rows[0].n, 0);
    await fixture.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1", [fixedAttempt]);

    const personalFirst = await runMixedRace(fixture, {
      principal: studentB,
      fixedWinner: false,
      formId: forms[0].formId,
      personalBlueprint: shortBlueprint,
    });
    stalePersonal = personalFirst.winner.body;
    assert.equal(stalePersonal.formMode, 'PERSONALIZED_PRACTICE');
    assert.equal((await fixture.pool.query('SELECT state FROM tsa.attempts WHERE id=$1', [stalePersonal.attemptId])).rows[0].state, 'CREATED');
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.attempts WHERE user_id=$1 AND state IN (\'CREATED\',\'IN_PROGRESS\')', [studentB.userId])).rows[0].n, 1);
  });

  await t.test('committed stale CREATED cleanup survives a controlled later fixed INSERT failure', async () => {
    await waitPast(fixture.pool, stalePersonal.startBefore);
    const historyBefore = (await fixture.pool.query('SELECT question_id,first_attempt_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id', [studentB.userId])).rows;
    const graphBefore = await graphCounts(fixture);
    const failedKey = randomUUID();
    await fixture.pool.query(`CREATE FUNCTION tsa_private.test_reject_fixed_attempt_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.form_mode='PUBLISHED_FIXED' THEN
          RAISE EXCEPTION 'controlled fixed attempt insert failure' USING ERRCODE='P0001';
        END IF;
        RETURN NEW;
      END $$`);
    let triggerCreated = false;
    try {
      await fixture.pool.query(`CREATE TRIGGER aaa_test_reject_fixed_attempt_insert BEFORE INSERT ON tsa.attempts
        FOR EACH ROW EXECUTE FUNCTION tsa_private.test_reject_fixed_attempt_insert()`);
      triggerCreated = true;
      await expectCommand(fixedService.create(studentB, failedKey, fixedBody(forms[0].formId)), 503, 'TEMPORARILY_UNAVAILABLE');
    } finally {
      if (triggerCreated) await fixture.pool.query('DROP TRIGGER aaa_test_reject_fixed_attempt_insert ON tsa.attempts');
      await fixture.pool.query('DROP FUNCTION tsa_private.test_reject_fixed_attempt_insert()');
    }

    const prior = (await fixture.pool.query('SELECT state,cancellation_reason FROM tsa.attempts WHERE id=$1', [stalePersonal.attemptId])).rows[0];
    assert.equal(prior.state, 'CANCELLED');
    assert.equal(prior.cancellation_reason, 'START_TTL_EXPIRED');
    assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.audit_events
      WHERE action='ALLOCATION_ACTIVE_RECONCILED' AND entity_id=$1`, [stalePersonal.attemptId])).rows[0].n, 1);
    assert.deepEqual(await fixture.pool.query('SELECT question_id,first_attempt_id FROM tsa.student_question_history WHERE user_id=$1 ORDER BY question_id', [studentB.userId]).then((result) => result.rows), historyBefore);
    assert.deepEqual(await graphCounts(fixture), graphBefore, 'the failed fixed transaction adds no partial attempt/form/history/receipt graph');
    assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.idempotency_records
      WHERE actor_id=$1 AND route_scope='POST /api/v1/attempts' AND idempotency_key=$2`, [studentB.userId, failedKey])).rows[0].n, 0);
  });

  await t.test('unknown and personal forms are rejected by the exact SQL entry point', async () => {
    assert.equal((await fixture.pool.query('SELECT form_mode::text FROM tsa.attempts WHERE id=$1', [stalePersonal.attemptId])).rows[0].form_mode, 'PERSONALIZED_PRACTICE');
    const personal = await sqlFixedCreate(fixture, studentB, randomUUID(), fixedBody(stalePersonal.formId));
    assert.deepEqual(personal, { status: 'ERROR', code: 'NOT_FOUND' });
    assert.deepEqual(await studentCounts(fixture, studentB.userId), { attempts: 1, history: 4, receipts: 1 });
  });

  await t.test('explicit REVIEW_ALLOWED and fixed commits contend on H1 in both winner orders', async () => {
    const repeatBody = {
      mode: 'PERSONALIZED_PRACTICE',
      blueprintVersionId: fixture.blueprint.versionId,
      reuseMode: 'REVIEW_ALLOWED',
      acknowledgeRepeats: true,
    };
    const historyA = (await fixture.pool.query(`SELECT question_id,first_attempt_id FROM tsa.student_question_history
      WHERE user_id=$1 ORDER BY question_id`, [studentA.userId])).rows;
    const reviewFirst = await runMixedRace(fixture, {
      principal: studentA,
      fixedWinner: false,
      formId: forms[0].formId,
      personalBlueprint: fixture.blueprint,
      personalRequest: repeatBody,
      enableReviewPractice: true,
    });
    assert.equal(reviewFirst.winner.body.reuseMode, 'REVIEW_ALLOWED');
    assert.deepEqual((await fixture.pool.query(`SELECT question_id,first_attempt_id FROM tsa.student_question_history
      WHERE user_id=$1 ORDER BY question_id`, [studentA.userId])).rows, historyA,
    'explicit review retains first-assignment history for repeated fixed identities');
    await fixture.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1", [reviewFirst.winner.body.attemptId]);

    const historyB = (await fixture.pool.query(`SELECT question_id,first_attempt_id FROM tsa.student_question_history
      WHERE user_id=$1 ORDER BY question_id`, [studentB.userId])).rows;
    const reviewLoser = await runMixedRace(fixture, {
      principal: studentB,
      fixedWinner: true,
      formId: forms[0].formId,
      personalBlueprint: fixture.blueprint,
      personalRequest: repeatBody,
      enableReviewPractice: true,
    });
    assert.equal(reviewLoser.winner.body.formMode, 'PUBLISHED_FIXED');
    assert.equal((await fixture.pool.query(`SELECT count(*)::int AS n FROM tsa.attempts
      WHERE user_id=$1 AND state IN ('CREATED','IN_PROGRESS')`, [studentB.userId])).rows[0].n, 1);
    await fixture.pool.query("UPDATE tsa.attempts SET state='CANCELLED',cancellation_reason='FORM_WITHDRAWN' WHERE id=$1", [reviewLoser.winner.body.attemptId]);
    assert.deepEqual((await fixture.pool.query(`SELECT question_id,first_attempt_id FROM tsa.student_question_history
      WHERE user_id=$1 ORDER BY question_id`, [studentB.userId])).rows, historyB,
    'fixed repeats do not replace the original first-assignment rows');
  });

  await t.test('fixed admission rejects before-open and at-close windows from database time', async () => {
    const beforeForm = forms[1].formId;
    await fixture.pool.query(`UPDATE tsa.form_availability SET available_from=clock_timestamp()+interval '1 minute',
      available_until=clock_timestamp()+interval '2 minutes',revision=revision+1 WHERE form_id=$1`, [beforeForm]);
    await expectCommand(fixedService.create(studentA, randomUUID(), fixedBody(beforeForm)), 409, 'FORM_NOT_OPEN');
    assert.equal((await studentCounts(fixture, studentA.userId)).attempts, 2, 'before-open denial writes no new attempt');

    const closeForm = forms[2].formId;
    await fixture.pool.query(`UPDATE tsa.form_availability SET available_from=clock_timestamp()-interval '1 minute',
      available_until=clock_timestamp(),revision=revision+1 WHERE form_id=$1`, [closeForm]);
    assert.equal((await fixture.pool.query('SELECT available_until<=clock_timestamp() AS closed FROM tsa.form_availability WHERE form_id=$1', [closeForm])).rows[0].closed, true);
    await expectCommand(fixedService.create(studentA, randomUUID(), fixedBody(closeForm)), 410, 'FORM_UNAVAILABLE');
    assert.equal((await studentCounts(fixture, studentA.userId)).attempts, 2, 'at-close denial writes no new attempt');
  });

  await t.test('rights withdrawal blocks new assignment while an owned retained receipt still replays', async () => {
    const retainedKey = randomUUID();
    const retainedBody = fixedBody(forms[0].formId);
    const created = await fixedService.create(studentA, retainedKey, retainedBody);
    assert.equal(created.status, 201);
    const sourceService = await createSourceService({ bankPool: fixture.bankPool, identityService: fixture.identityService });
    const revoked = await sourceService.registerRightsDecision(fixture.principals.bankManager,
      fixture.source.sourceVersionId, randomUUID(), {
        status: 'REVOKED',
        allowedUses: ['DISPLAY'],
        territory: ['VN'],
        validFrom: '2000-01-01T00:00:00Z',
        validTo: null,
        evidence: 'Synthetic fixture revocation only; not a rights attestation.',
        expectedRevision: 1,
      });
    assert.equal(revoked.status, 201);
    const held = (await fixture.pool.query('SELECT withdrawn_at FROM tsa.form_availability WHERE form_id=$1', [forms[0].formId])).rows[0];
    assert.ok(held.withdrawn_at);

    const replay = await fixedService.create(studentA, retainedKey, retainedBody);
    assert.equal(replay.status, 201);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.body, created.body);
    await expectCommand(fixedService.create(studentA, randomUUID(), retainedBody), 410, 'FORM_UNAVAILABLE');
    assert.deepEqual(await studentCounts(fixture, studentA.userId), { attempts: 3, history: 4, receipts: 3 });
    assert.equal((await fixture.pool.query('SELECT count(*)::int AS n FROM tsa.forms')).rows[0].n, 5,
      'neither replay nor denied new assignment creates a form');
  });

  await t.test('freshly authenticated candidate role revocation blocks fixed assignment', async () => {
    const before = await studentCounts(fixture, studentB.userId);
    await fixture.pool.query("DELETE FROM tsa.user_roles WHERE user_id=$1 AND role='CANDIDATE'", [studentB.userId]);
    const principal = await fixture.identityService.authenticate(new Request(fixture.harness.origin, {
      headers: { cookie: fixture.browsers.studentB.cookies.join('; ') },
    }));
    assert.ok(principal?.authenticated);
    assert.equal(principal.roles.includes('CANDIDATE'), false);
    await expectCommand(fixedService.create(principal, randomUUID(), fixedBody(forms[1].formId)), 403, 'FORBIDDEN');
    assert.deepEqual(await studentCounts(fixture, studentB.userId), before);
  });
});
