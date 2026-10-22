import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createAttemptService } from "../../../src/modules/attempts/service.mjs";
import { createDatabasePool, withTransaction } from "../../../src/modules/database/pool.mjs";
import { createExamWorker } from "../../../src/modules/jobs/exam-worker.mjs";
import { scoreAttempt } from "../../../src/modules/scoring/binary.mjs";
import { createAllocationFixture } from "../assembly/fixtures.mjs";

const CREATE_RATE = Object.freeze({ capacity: 50, refillPerSecond: 10 });
const SAVE_RATE = Object.freeze({
  user: Object.freeze({ capacity: 50, refillPerSecond: 0.000001 }),
  attempt: Object.freeze({ capacity: 50, refillPerSecond: 0.000001 }),
});

test("worker executor identifiers are printable ASCII and at most 128 characters", () => {
  const workerPool = { connect() {} };
  const workerConfig = { workerPool, leaseSeconds: 30, retrySeconds: 30 };
  for (const executorId of ["", "with spaces", "with\nline", "\x7f", "é", "x".repeat(129)]) {
    assert.throws(() => createExamWorker({ ...workerConfig, executorId }), TypeError);
  }
  assert.doesNotThrow(() => createExamWorker({ ...workerConfig, executorId: "!".repeat(128) }));
});

test("finish digest errors are preserved into the code-only failure call", async () => {
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const formId = "00000000-0000-4000-8000-000000000002";
  const slotId = "00000000-0000-4000-8000-000000000003";
  const jobId = "00000000-0000-4000-8000-000000000004";
  const inputHash = `sha256:${"a".repeat(64)}`;
  const dispatch = {
    schemaVersion: "job-dispatch/1",
    jobId,
    kind: "exam_grade_attempt",
    dedupKey: `${attemptId}:practice-binary-v1:${inputHash}`,
    payloadRef: `attempt:${attemptId}`,
    state: "RUNNING",
  };
  const calls = [];
  const results = {
    "tsa.exam_worker_claim": {
      status: "CLAIMED", dispatch, attemptId, leaseToken: "1", leaseUntil: "2030-01-01T00:00:30.000Z",
    },
    "tsa.exam_worker_load": {
      status: "READY", attemptId, formId, policyVersion: "practice-binary-v1", inputHash,
      slots: [{
        slotId,
        sectionId: "section-1",
        section: "MATH",
        ordinal: 0,
        interaction: {
          type: "SINGLE_CHOICE",
          options: [
            { id: "a", content: [{ type: "text", text: "A" }] },
            { id: "b", content: [{ type: "text", text: "B" }] },
          ],
        },
        answerKey: { type: "SINGLE_CHOICE", optionId: "a" },
        response: { type: "SINGLE_CHOICE", optionId: "a" },
      }],
    },
    "tsa.exam_worker_finish": { status: "ERROR", code: "DIGEST_MISMATCH" },
    "tsa.exam_worker_fail": { status: "FAILED_FINAL" },
  };
  const workerPool = {
    async connect() {
      return {
        async query(sql, values = []) {
          const fn = Object.keys(results).find((name) => sql.includes(name));
          if (fn) calls.push({ fn, values });
          return { rows: fn ? [{ result: results[fn] }] : [] };
        },
        release() {},
      };
    },
  };
  const worker = createExamWorker({ workerPool, executorId: "grader-test", leaseSeconds: 30, retrySeconds: 30 });

  assert.deepEqual(await worker.runOnce(), { status: "FAILED_FINAL" });
  const failureCall = calls.find((call) => call.fn === "tsa.exam_worker_fail");
  assert.deepEqual(failureCall.values, [jobId, "grader-test", "1", "DIGEST_MISMATCH", 30]);
});

function key(label) {
  return `${label}-${randomUUID()}`;
}

async function setup(t, { corruptResponse = false } = {}) {
  const fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4 });
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
  const created = await attempts.create(fixture.principals.studentA, key("grading-create"), {
    blueprintVersionId: fixture.blueprint.versionId,
  });
  const attemptId = created.body.attemptId;
  await attempts.start(fixture.principals.studentA, attemptId, key("grading-start"));
  const view = await attempts.read(fixture.principals.studentA, attemptId);
  for (const slot of view.slots) {
    await attempts.save(fixture.principals.studentA, attemptId, slot.slotId, key("grading-save"), {
      expectedRevision: 0,
      value: { type: "SINGLE_CHOICE", optionId: "b" },
    });
  }
  if (corruptResponse) {
    await fixture.pool.query(`UPDATE tsa.answers
      SET value='{"type":"SINGLE_CHOICE","optionId":"corrupt"}'::jsonb, revision=revision+1
      WHERE attempt_id=$1 AND slot_id=(
        SELECT slot_id FROM tsa.form_slots WHERE form_id=$2 ORDER BY ordinal LIMIT 1
      )`, [attemptId, created.body.formId]);
  }
  await attempts.submit(fixture.principals.studentA, attemptId, key("grading-submit"));

  await fixture.pool.query("CREATE ROLE grader_runtime LOGIN");
  await fixture.pool.query("GRANT tsa_exam_worker TO grader_runtime");
  workerPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: "grader_runtime" }, {
    applicationName: "tsa-grading-worker-test",
    max: 3,
  });

  const createWorker = (executorId = "grader-runtime-test") => createExamWorker({
    workerPool,
    executorId,
    leaseSeconds: 30,
    retrySeconds: 30,
  });

  return { fixture, workerPool, createWorker, attemptId };
}

async function assertGraded(pool, attemptId) {
  const result = await pool.query(`SELECT a.state, a.grading_status, a.latest_score_id,
      s.correct_count, s.total_count, s.percentage::text AS percentage,
      (SELECT count(*)::int FROM tsa.score_items i WHERE i.score_run_id=s.id) AS item_count,
      (SELECT count(*)::int FROM tsa.result_releases r WHERE r.attempt_id=a.id AND r.revoked_at IS NULL) AS release_count,
      (SELECT count(*)::int FROM tsa.jobs j WHERE j.attempt_id=a.id AND j.state='SUCCEEDED') AS succeeded_jobs
    FROM tsa.attempts a
    JOIN tsa.score_runs s ON s.id=a.latest_score_id AND s.attempt_id=a.id
    WHERE a.id=$1`, [attemptId]);
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.rows[0], {
    state: "GRADED",
    grading_status: "SUCCEEDED",
    latest_score_id: result.rows[0].latest_score_id,
    correct_count: 4,
    total_count: 4,
    percentage: "100.00",
    item_count: 4,
    release_count: 1,
    succeeded_jobs: 1,
  });
  return result.rows[0].latest_score_id;
}

test("trusted worker scores and releases one immutable result; duplicate finish is idempotent", async (t) => {
  const { fixture, createWorker, attemptId } = await setup(t);
  const worker = createWorker();
  const lease = await worker.claim();
  assert.equal(lease.status, "CLAIMED");
  assert.equal(lease.attemptId, attemptId);
  assert.equal(lease.dispatch.kind, "exam_grade_attempt");

  const loaded = await worker.load(lease);
  assert.equal(loaded.status, "READY");
  assert.equal(loaded.slots.length, 4);
  assert.equal(Object.isFrozen(loaded.slots[0].answerKey), true);
  const computed = scoreAttempt(loaded);
  assert.deepEqual(computed, {
    correctCount: 4,
    totalCount: 4,
    percentage: "100.00",
    sections: [{ sectionId: "allocation-section", section: "MATH", correctCount: 4, totalCount: 4 }],
    items: loaded.slots.slice().sort((left, right) => left.ordinal - right.ordinal)
      .map((slot) => ({ slotId: slot.slotId, earned: 1 })),
  });

  const finished = await worker.finish(lease, computed);
  assert.equal(finished.status, "GRADED");
  assert.equal(finished.attemptId, attemptId);
  assert.equal(finished.scoreRunId, await assertGraded(fixture.pool, attemptId));

  const repeatedFinish = await worker.finish(lease, computed);
  assert.deepEqual(repeatedFinish, { status: "ALREADY_DONE", attemptId, scoreRunId: finished.scoreRunId });
  assert.equal((await worker.runOnce()).status, "IDLE");
  assert.equal((await fixture.pool.query("SELECT count(*)::int AS n FROM tsa.score_runs WHERE attempt_id=$1", [attemptId])).rows[0].n, 1);
});

test("worker leases reject duplicate claims and fence reclaimed stale tokens", async (t) => {
  const { fixture, createWorker, attemptId } = await setup(t);
  const firstWorker = createWorker("grader-runtime-first");
  const secondWorker = createWorker("grader-runtime-second");
  const firstLease = await firstWorker.claim();
  assert.equal(firstLease.status, "CLAIMED");
  assert.deepEqual(await secondWorker.claim(), { status: "IDLE" });

  await fixture.pool.query("UPDATE tsa.jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [firstLease.dispatch.jobId]);
  const secondLease = await secondWorker.claim();
  assert.equal(secondLease.status, "CLAIMED");
  assert.ok(BigInt(secondLease.leaseToken) > BigInt(firstLease.leaseToken));
  assert.deepEqual(await firstWorker.load(firstLease), { status: "LOST_LEASE" });

  const loaded = await secondWorker.load(secondLease);
  assert.equal(loaded.status, "READY");
  const computed = scoreAttempt(loaded);
  assert.deepEqual(await firstWorker.finish(firstLease, computed), { status: "LOST_LEASE" });
  const finished = await secondWorker.finish(secondLease, computed);
  assert.equal(finished.status, "GRADED");
  assert.equal(finished.attemptId, attemptId);
  await assertGraded(fixture.pool, attemptId);
  assert.equal((await fixture.pool.query("SELECT count(*)::int AS n FROM tsa.score_runs WHERE attempt_id=$1", [attemptId])).rows[0].n, 1);
});

test("malformed frozen response fails code-only without writing a score or release", async (t) => {
  const { fixture, workerPool, createWorker, attemptId } = await setup(t, { corruptResponse: true });
  const worker = createWorker();
  const job = (await fixture.pool.query("SELECT id FROM tsa.jobs WHERE attempt_id=$1 AND kind='exam_grade_attempt'", [attemptId])).rows[0];
  assert.ok(job);

  const failure = await worker.runOnce();
  assert.deepEqual(failure, { status: "FAILED_FINAL" });
  assert.equal(JSON.stringify(failure).includes("corrupt"), false);
  assert.equal(JSON.stringify(failure).includes("answerKey"), false);
  const failedJob = await fixture.pool.query("SELECT state,last_error_code FROM tsa.jobs WHERE id=$1", [job.id]);
  assert.deepEqual(failedJob.rows, [{ state: "FAILED_FINAL", last_error_code: "INVALID_GRADING_INPUT" }]);
  assert.equal((await fixture.pool.query("SELECT count(*)::int AS n FROM tsa.score_runs WHERE attempt_id=$1", [attemptId])).rows[0].n, 0);
  assert.equal((await fixture.pool.query("SELECT count(*)::int AS n FROM tsa.result_releases WHERE attempt_id=$1", [attemptId])).rows[0].n, 0);

  const membership = await workerPool.query(`SELECT pg_has_role(session_user,'tsa_exam_worker','MEMBER') AS worker,
      pg_has_role(session_user,'tsa_exam','MEMBER') AS student_exam`);
  assert.deepEqual(membership.rows[0], { worker: true, student_exam: false });
  const sharedRoleMembership = await fixture.pool.query(`SELECT pg_has_role('tsa_exam','tsa_exam_worker','MEMBER') AS exam_worker,
      pg_has_role('tsa_factory','tsa_exam_worker','MEMBER') AS factory_worker`);
  assert.deepEqual(sharedRoleMembership.rows[0], { exam_worker: false, factory_worker: false });
  await assert.rejects(workerPool.query("SELECT * FROM tsa_private.question_secrets LIMIT 1"),
    (error) => error.code === "42501");
});

test("student role cannot spoof a live worker lease or read private grading data", async (t) => {
  const { fixture, createWorker, attemptId } = await setup(t);
  const worker = createWorker("grader-runtime-test");
  const lease = await worker.claim();
  assert.equal(lease.status, "CLAIMED");
  const loaded = await worker.load(lease);
  assert.equal(loaded.status, "READY");

  const liveJob = await fixture.pool.query(`SELECT state, lease_owner, lease_token::text AS lease_token,
      lease_until > clock_timestamp() AS lease_live
    FROM tsa.jobs WHERE id=$1`, [lease.dispatch.jobId]);
  assert.deepEqual(liveJob.rows, [{
    state: "RUNNING",
    lease_owner: "grader-runtime-test",
    lease_token: lease.leaseToken,
    lease_live: true,
  }]);

  await assert.rejects(withTransaction(fixture.examPool, async (client) => {
    await client.query("SELECT set_config('tsa.exam_job_id',$1,true),set_config('tsa.executor_id',$2,true),set_config('tsa.lease_token',$3,true)",
      [lease.dispatch.jobId, "grader-runtime-test", lease.leaseToken]);
    const context = await client.query("SELECT tsa.exam_job_context_matches($1) AS allowed", [attemptId]);
    const privateRows = await client.query(`SELECT count(*)::int AS n FROM tsa_private.form_slot_secrets
      WHERE form_id=(SELECT form_id FROM tsa.attempts WHERE id=$1)`, [attemptId]);
    assert.deepEqual(context.rows, [{ allowed: false }]);
    assert.deepEqual(privateRows.rows, [{ n: 0 }]);
    await client.query("SELECT 1 FROM tsa_private.question_secrets LIMIT 1");
  }, { role: "tsa_exam" }), (error) => error.code === "42501");

  await assert.rejects(withTransaction(fixture.examPool, async (client) => {
    await client.query("SELECT tsa.exam_worker_claim($1::text,$2::integer)", ["grader-runtime-test", 30]);
  }, { role: "tsa_exam" }), (error) => error.code === "42501");
});

test("running grading lease survives a real PostgreSQL restart and fences the old executor after real expiry", { timeout: 35_000 }, async (t) => {
  const { fixture, workerPool, attemptId } = await setup(t);
  const database = fixture.harness.database;
  const firstWorker = createExamWorker({ workerPool, executorId: "restart-first", leaseSeconds: 10, retrySeconds: 1 });
  const secondWorker = createExamWorker({ workerPool, executorId: "restart-second", leaseSeconds: 30, retrySeconds: 1 });
  const firstLease = await firstWorker.claim();
  assert.equal(firstLease.status, "CLAIMED");
  const initial = await firstWorker.load(firstLease);
  assert.equal(initial.status, "READY");
  const computed = scoreAttempt(initial);
  const job = async () => (await database.pool.query("SELECT to_jsonb(j) AS value FROM tsa.jobs j WHERE id=$1", [firstLease.dispatch.jobId])).rows[0].value;
  const before = await job();
  assert.equal(before.state, "RUNNING");
  const originalPostmaster = (await database.pool.query("SELECT pg_postmaster_start_time()::text AS value")).rows[0].value;
  const disconnects = [];
  let restarting = true;
  for (const pool of [fixture.harness.authPool, fixture.bankPool, fixture.examPool, workerPool]) {
    pool.on("error", (error) => {
      assert.equal(restarting, true);
      assert.equal(error.code, "57P01");
      disconnects.push(error.code);
    });
  }
  await database.restart();
  for (const pool of [fixture.harness.authPool, fixture.bankPool, fixture.examPool, workerPool]) await pool.query("SELECT 1");
  restarting = false;
  assert.notEqual((await database.pool.query("SELECT pg_postmaster_start_time()::text AS value")).rows[0].value, originalPostmaster);
  assert.deepEqual(await job(), before, "restart does not reset or shorten the persisted lease");
  const live = (await database.pool.query("SELECT clock_timestamp()<lease_until AS value FROM tsa.jobs WHERE id=$1", [firstLease.dispatch.jobId])).rows[0].value;
  assert.equal(live, true, "the persisted lease remains live after restart");
  assert.deepEqual(await secondWorker.claim(), { status: "IDLE" }, "a new executor cannot steal a live lease after restart");
  const bankClient = await fixture.bankPool.connect();
  try {
    await bankClient.query("BEGIN");
    await bankClient.query("SELECT set_config('tsa.bank_fixture_scope',$1,true)", [fixture.fixtureScopeId]);
    assert.equal((await bankClient.query("SELECT tsa.bank_fixture_scope_active() AS value")).rows[0].value, false);
    await bankClient.query("ROLLBACK");
  } finally { bankClient.release(); }
  const deadline = Date.now() + 12_000;
  while ((await database.pool.query("SELECT clock_timestamp()<lease_until AS value FROM tsa.jobs WHERE id=$1", [firstLease.dispatch.jobId])).rows[0].value) {
    assert.ok(Date.now() < deadline, "real PostgreSQL lease must expire within the test bound");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const secondLease = await secondWorker.claim();
  assert.equal(secondLease.status, "CLAIMED");
  assert.equal(secondLease.dispatch.jobId, firstLease.dispatch.jobId);
  assert.ok(BigInt(secondLease.leaseToken) > BigInt(firstLease.leaseToken));
  assert.deepEqual(await firstWorker.load(firstLease), { status: "LOST_LEASE" });
  assert.deepEqual(await firstWorker.finish(firstLease, computed), { status: "LOST_LEASE" });
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM tsa.score_runs WHERE attempt_id=$1", [attemptId])).rows[0].n, 0);
  const loaded = await secondWorker.load(secondLease);
  assert.equal(loaded.status, "READY");
  assert.deepEqual(scoreAttempt(loaded), computed);
  const finished = await secondWorker.finish(secondLease, computed);
  assert.equal(finished.status, "GRADED");
  await assertGraded(database.pool, attemptId);
  assert.deepEqual(await secondWorker.claim(), { status: "IDLE" });
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM tsa.score_runs WHERE attempt_id=$1", [attemptId])).rows[0].n, 1);
  assert.ok(disconnects.length > 0);
});
