import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FactoryJobStateSchema } from "../src/index.ts";
import { JobDispatchSchema, JobExecutorSchema, parseJobDispatchForExecutor } from "../src/jobs.ts";
import { examJob, factoryJob, jobStates } from "./fixtures/job-dispatch.ts";

describe("job-dispatch/1 internal envelope", () => {
  it("accepts only the two executor-owned kinds across all existing job states", () => {
    for (const state of jobStates) {
      const factory = { ...factoryJob, state };
      const exam = { ...examJob, state };
      assert.equal(JobDispatchSchema.parse(factory).state, state);
      assert.equal(parseJobDispatchForExecutor("FACTORY", factory).kind, "factory_produce_unit");
      assert.equal(parseJobDispatchForExecutor("EXAM", exam).kind, "exam_grade_attempt");
      assert.equal(FactoryJobStateSchema.parse(state), state);
    }
  });

  it("preserves opaque nonblank strings and rejects blank, malformed, missing, and unknown fields", () => {
    assert.deepEqual(JobDispatchSchema.parse(factoryJob), factoryJob);
    assert.equal(JobDispatchSchema.parse(factoryJob).dedupKey, " factory:item:unit-7 ");
    assert.equal(JobDispatchSchema.parse(factoryJob).payloadRef, "payload://factory/units/7");
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, dedupKey: " \t " }).success, false);
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, payloadRef: "" }).success, false);
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, jobId: "11111111-1111-4111-8111-AAAAAAAAAAAA" }).success, false);
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, jobId: "not-a-uuid" }).success, false);
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, jobId: "00000000-0000-0000-0000-000000000000" }).success, false);
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, jobId: "11111111-1111-0111-8111-111111111111" }).success, false);
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, jobId: "11111111-1111-4111-7111-111111111111" }).success, false);
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, state: "APPROVED" }).success, false);

    const missing = { ...factoryJob } as Record<string, unknown>;
    delete missing.payloadRef;
    assert.equal(JobDispatchSchema.safeParse(missing).success, false);
    for (const field of ["credentials", "payload", "workflowState", "approval", "leaseToken", "attemptCount", "extra"]) {
      assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, [field]: "forbidden" }).success, false, field);
    }
    assert.equal(JobDispatchSchema.safeParse({ ...factoryJob, kind: "future_job_kind" }).success, false);
    assert.equal(JobExecutorSchema.safeParse("ADMIN").success, false);
  });

  it("rejects valid envelopes routed to the wrong server-designated executor", () => {
    assert.throws(() => parseJobDispatchForExecutor("EXAM", factoryJob), /cannot consume job kind/);
    assert.throws(() => parseJobDispatchForExecutor("FACTORY", examJob), /cannot consume job kind/);
    assert.throws(() => parseJobDispatchForExecutor("UNTRUSTED", factoryJob), /Invalid option/);
  });

  it("keeps this dispatch surface internal without changing root compatibility", async () => {
    assert.equal(Object.hasOwn(await import("../src/index.ts"), "JobDispatchSchema"), false);
    assert.equal(Object.hasOwn(await import("../src/student.ts"), "JobDispatchSchema"), false);
    assert.equal((await import("../src/internal.ts")).JobDispatchSchema, JobDispatchSchema);
    assert.equal(FactoryJobStateSchema.parse("FAILED_RETRYABLE"), "FAILED_RETRYABLE");
  });
});
