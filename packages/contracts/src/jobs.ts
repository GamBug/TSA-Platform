import { z } from "zod";

import { FactoryJobStateSchema } from "./index.ts";

const LowercaseUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "Expected a canonical lowercase UUID");
const OpaqueNonblank = z.string().refine((value) => value.trim().length > 0, "Expected a nonblank opaque string");

export const JobDispatchKindSchema = z.enum(["factory_produce_unit", "exam_grade_attempt"]);
export const JobExecutorSchema = z.enum(["FACTORY", "EXAM"]);

/** Minimal internal job envelope; it carries a reference, never the job payload or credentials. */
export const JobDispatchSchema = z.object({
  schemaVersion: z.literal("job-dispatch/1"),
  jobId: LowercaseUuid,
  kind: JobDispatchKindSchema,
  dedupKey: OpaqueNonblank,
  payloadRef: OpaqueNonblank,
  state: FactoryJobStateSchema,
}).strict();

export type JobDispatch = z.infer<typeof JobDispatchSchema>;
export type JobDispatchKind = z.infer<typeof JobDispatchKindSchema>;
export type JobExecutor = z.infer<typeof JobExecutorSchema>;

/** Validate a job against the server-derived executor identity and its single allowed kind. */
export function parseJobDispatchForExecutor(executor: unknown, input: unknown): JobDispatch {
  const parsedExecutor = JobExecutorSchema.parse(executor);
  const job = JobDispatchSchema.parse(input);
  const expectedKind = parsedExecutor === "FACTORY" ? "factory_produce_unit" : "exam_grade_attempt";
  if (job.kind !== expectedKind) {
    throw new TypeError(`Executor ${parsedExecutor} cannot consume job kind ${job.kind}`);
  }
  return job;
}
