import type { JobDispatch } from "../../src/jobs.ts";

export const factoryJob: JobDispatch = {
  schemaVersion: "job-dispatch/1",
  jobId: "11111111-1111-4111-8111-111111111111",
  kind: "factory_produce_unit",
  dedupKey: " factory:item:unit-7 ",
  payloadRef: "payload://factory/units/7",
  state: "QUEUED",
};

export const examJob: JobDispatch = {
  schemaVersion: "job-dispatch/1",
  jobId: "22222222-2222-4222-8222-222222222222",
  kind: "exam_grade_attempt",
  dedupKey: "exam:attempt:revision-3",
  payloadRef: "payload://exam/attempts/3",
  state: "RUNNING",
};

export const jobStates = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_FINAL", "CANCELLED"] as const;
