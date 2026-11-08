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

test("dedicated Factory LOGIN cannot use a known live grading lease or publish Bank content", { timeout: 30_000 }, async (t) => {
  const { fixture, createWorker, attemptId } = await setup(t);
  const executorId = "factory-isolation-legitimate-grader";
  const worker = createWorker(executorId);
  const lease = await worker.claim();
  assert.equal(lease.status, "CLAIMED");
  assert.equal(lease.attemptId, attemptId);
  const loaded = await worker.load(lease);
  assert.equal(loaded.status, "READY");
  const computed = scoreAttempt(loaded);

  await fixture.pool.query("CREATE ROLE factory_lease_probe LOGIN");
  await fixture.pool.query("GRANT tsa_factory TO factory_lease_probe");
  const factoryPool = createDatabasePool({ ...fixture.harness.database.connectionConfig, user: "factory_lease_probe" }, {
    applicationName: "tsa-factory-live-lease-isolation-test", max: 1,
  });
  let client;
  try {
    client = await factoryPool.connect();
    const identity = (await client.query(`SELECT session_user::text AS login,current_user::text AS current_role,
      pg_has_role(session_user,'tsa_factory','MEMBER') AS factory,
      pg_has_role(session_user,'tsa_bank','MEMBER') AS bank,
      pg_has_role(session_user,'tsa_exam','MEMBER') AS exam,
      pg_has_role(session_user,'tsa_exam_worker','MEMBER') AS worker,
      (SELECT count(*)::integer FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user)) AS memberships,
      (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=session_user) AS elevated`)).rows[0];
    assert.deepEqual(identity, { login: "factory_lease_probe", current_role: "factory_lease_probe", factory: true,
      bank: false, exam: false, worker: false, memberships: 1, elevated: false });

    // Positive control: existing Factory job permissions are intentionally intact.
    const factoryJobId = randomUUID();
    await fixture.pool.query(`INSERT INTO tsa.jobs(id,kind,dedup_key,payload_ref)
      VALUES($1,'factory_produce_unit',$2,'fixture:factory-lease-isolation')`, [factoryJobId, key("factory-lease-job")]);
    const ownJobs = await client.query("SELECT id FROM tsa.jobs ORDER BY id");
    assert.deepEqual(ownJobs.rows, [{ id: factoryJobId }]);
    assert.equal((await client.query("UPDATE tsa.jobs SET last_error_code='TEMPORARILY_UNAVAILABLE' WHERE id=$1 RETURNING id", [factoryJobId])).rowCount, 1);
    assert.equal((await client.query("SELECT id FROM tsa.source_versions WHERE id=$1", [fixture.source.sourceVersionId])).rowCount, 1);

    // Snapshot every application table after positive controls. No background
    // executor runs in this fixture; exact JSONB row images include raw clocks.
    const tables = (await fixture.pool.query(`SELECT table_schema,table_name FROM information_schema.tables
      WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name`)).rows;
    const snapshot = async () => {
      const rows = [];
      for (const { table_schema: schema, table_name: table } of tables) {
        assert.match(schema, /^[a-z_]+$/); assert.match(table, /^[a-z_]+$/);
        rows.push((await fixture.pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS value
          FROM (SELECT to_jsonb(t) AS value FROM "${schema}"."${table}" t) entries`)).rows[0].value);
      }
      return JSON.stringify(rows);
    };
    const before = await snapshot();
    let denied = 0;
    async function rejectPermission(sql, values = []) {
      // Each failed operation gets a fresh transaction; the supplied live GUCs
      // cannot turn Factory session identity into trusted EXAM worker authority.
      await client.query("BEGIN");
      try {
        await client.query(`SELECT set_config('tsa.exam_job_id',$1,true),set_config('tsa.executor_id',$2,true),
          set_config('tsa.lease_token',$3,true),set_config('tsa.local_user_id',$4,true)`,
        [lease.dispatch.jobId, executorId, lease.leaseToken, fixture.principals.reviewer.userId]);
        await assert.rejects(client.query(sql, values), (error) => error.code === "42501", "Factory operation must fail with insufficient privilege");
        denied++;
      } finally { await client.query("ROLLBACK"); }
    }
    for (const role of [null, "tsa_factory"]) {
      if (role) await client.query("SET ROLE tsa_factory");
      await rejectPermission("SELECT tsa.exam_worker_claim($1::text,$2::integer)", [executorId, 30]);
      await rejectPermission("SELECT tsa.exam_worker_load($1::uuid,$2::text,$3::bigint)", [lease.dispatch.jobId, executorId, lease.leaseToken]);
      await rejectPermission("SELECT tsa.exam_worker_finish($1::uuid,$2::text,$3::bigint,$4::jsonb)",
        [lease.dispatch.jobId, executorId, lease.leaseToken, JSON.stringify(computed)]);
      await rejectPermission("SELECT tsa.exam_worker_fail($1::uuid,$2::text,$3::bigint,$4::text,$5::integer)",
        [lease.dispatch.jobId, executorId, lease.leaseToken, "TEMPORARILY_UNAVAILABLE", 1]);
      for (const table of ["tsa.users", "tsa.attempts", "tsa.answers", "tsa_private.question_secrets", "tsa_private.form_slot_secrets"]) {
        await rejectPermission(`SELECT * FROM ${table} LIMIT 1`);
      }
      const question = fixture.questions[0];
      await rejectPermission("UPDATE tsa.question_workflow SET state='APPROVED' WHERE question_version_id=$1", [question.versionId]);
      await rejectPermission("UPDATE tsa.questions SET eligible_version_id=$1 WHERE id=$2", [question.versionId, question.questionId]);
      await rejectPermission(`INSERT INTO tsa.reviews(id,question_version_id,content_hash,reviewer_id,decision,rubric,reason)
        VALUES($1,$2,$3,$4,'APPROVE',$5::jsonb,'Synthetic denied Factory impersonation')`,
      [randomUUID(), question.versionId, question.contentHash, fixture.principals.reviewer.userId,
        JSON.stringify({ correctness: true, unambiguous: true, relevant: true, language: true, explanation: true, rights: true })]);
      await rejectPermission("SET ROLE tsa_exam_worker");
      await rejectPermission("SET ROLE tsa_exam");
      await rejectPermission("SET ROLE tsa_bank");
      // Jobs are SELECT/column-UPDATE granted: RLS must hide the grading row,
      // rather than a missing table grant making the denial test vacuous.
      assert.equal((await client.query("SELECT id FROM tsa.jobs WHERE id=$1", [lease.dispatch.jobId])).rowCount, 0);
      assert.equal((await client.query("UPDATE tsa.jobs SET state='FAILED_FINAL' WHERE id=$1 RETURNING id", [lease.dispatch.jobId])).rowCount, 0);
      assert.deepEqual((await client.query("SELECT id FROM tsa.jobs")).rows, [{ id: factoryJobId }]);
    }
    assert.equal(denied, 30);
    assert.equal(await snapshot() === before, true, "Factory attacks preserve exact application rows without printing private snapshots");
    const live = (await fixture.pool.query(`SELECT state,lease_owner,lease_token::text AS token,
      lease_until>clock_timestamp() AS live FROM tsa.jobs WHERE id=$1`, [lease.dispatch.jobId])).rows[0];
    assert.deepEqual(live, { state: "RUNNING", lease_owner: executorId, token: lease.leaseToken, live: true });
    assert.equal((await worker.finish(lease, computed)).status, "GRADED");
    await assertGraded(fixture.pool, attemptId);
    t.diagnostic(JSON.stringify({ deniedOperations: denied, roleContexts: 2, applicationTablesUnchanged: tables.length,
      factoryJobPositiveControl: true, legitimateGrade: "GRADED" }));
  } finally { client?.release(); await factoryPool.end(); }
});

for (const shutdownMode of ["fast", "immediate"]) test(shutdownMode === "fast" ? "running grading lease survives a real PostgreSQL restart and fences the old executor after real expiry" : "running grading lease survives immediate PostgreSQL shutdown with WAL recovery and fences the old executor", { timeout: 35_000 }, async (t) => {
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
  const snapshot = async () => (await database.pool.query(`SELECT to_jsonb(f) AS form,to_jsonb(ar) AS manifest,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordinal) FROM tsa.form_slots s WHERE s.form_id=f.id) AS slots,
    (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.slot_id) FROM tsa_private.form_slot_secrets k WHERE k.form_id=f.id) AS keys,
    (SELECT jsonb_agg(to_jsonb(ans) ORDER BY ans.slot_id) FROM tsa.answers ans WHERE ans.attempt_id=a.id) AS answers,
    (SELECT jsonb_agg(to_jsonb(h) ORDER BY h.question_id) FROM tsa.student_question_history h WHERE h.first_attempt_id=a.id) AS history,
    jsonb_build_object('createdAt',a.created_at,'startBefore',a.start_before_at,'startedAt',a.started_at,
      'deadlineAt',a.deadline_at,'closedAt',a.closed_at) AS clocks,tsa.exam_grading_input_hash(a.id) AS digest
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id JOIN tsa.assembly_runs ar ON ar.id=f.assembly_run_id WHERE a.id=$1`, [attemptId])).rows[0];
  const originalInputs = await snapshot();
  const before = await job();
  assert.equal(before.state, "RUNNING");
  const originalPostmaster = (await database.pool.query("SELECT pg_postmaster_start_time()::text AS value")).rows[0].value;
  const disconnects = [];
  let restarting = true;
  for (const pool of [fixture.harness.authPool, fixture.bankPool, fixture.examPool, workerPool]) {
    pool.on("error", (error) => {
      assert.equal(restarting, true);
      assert.ok(shutdownMode === "fast" ? error.code === "57P01" : ["57P01", "57P02"].includes(error.code) || error.message === "Connection terminated unexpectedly");
      disconnects.push(error.code);
    });
  }
  for (const pool of [database.pool, fixture.examPool, workerPool]) {
    assert.deepEqual((await pool.query("SELECT current_setting('fsync') AS fsync,current_setting('full_page_writes') AS full_page_writes,current_setting('synchronous_commit') AS synchronous_commit")).rows[0],
      { fsync: "on", full_page_writes: "on", synchronous_commit: "on" });
  }
  const restarted = await database.restart({ shutdownMode });
  assert.deepEqual(restarted, { shutdownMode, recoveryObserved: shutdownMode === "immediate" });
  for (const pool of [fixture.harness.authPool, fixture.bankPool, fixture.examPool, workerPool]) await pool.query("SELECT 1");
  restarting = false;
  assert.notEqual((await database.pool.query("SELECT pg_postmaster_start_time()::text AS value")).rows[0].value, originalPostmaster);
  assert.deepEqual(await job(), before, "restart does not reset or shorten the persisted lease");
  assert.deepEqual(await snapshot(), originalInputs, "restart preserves exact immutable inputs, answers, history and clocks");
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
  assert.deepEqual(await snapshot(), originalInputs, "recovery grading preserves original immutable inputs/history/clocks");
  assert.deepEqual(await secondWorker.claim(), { status: "IDLE" });
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM tsa.score_runs WHERE attempt_id=$1", [attemptId])).rows[0].n, 1);
  assert.ok(disconnects.length > 0);
});
