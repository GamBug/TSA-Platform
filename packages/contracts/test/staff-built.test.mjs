import assert from "node:assert/strict";
import {
  StaffReviewContextSchema,
  StaffReviewEvidenceSchema,
  StaffReviewHistorySchema,
  StaffQuarantineRequestSchema,
  StaffQuarantineResponseSchema,
  StaffRejectReviewRequestSchema,
  StaffRejectReviewResponseSchema,
  StaffSubmitReviewRequestSchema,
  StaffSubmitReviewResponseSchema,
} from "../dist/staff.js";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";
import { makeStaffReviewEvidence } from "./fixtures/staff-review-evidence.ts";

const submitVersionId = "44444444-4444-4444-8444-444444444444";

const context = makeStaffReviewContext();
assert.equal(StaffReviewContextSchema.safeParse(context).success, true);
assert.equal(
  StaffReviewContextSchema.safeParse({ ...context, publicationEligibility: "ELIGIBLE" }).success,
  false,
  "the emitted private DTO schema rejects undocumented public-eligibility states",
);

console.log("Compiled private staff DTO smoke test passed.");

assert.equal(StaffReviewEvidenceSchema.safeParse(makeStaffReviewEvidence()).success, true);
assert.equal(
  StaffReviewEvidenceSchema.safeParse({ ...makeStaffReviewEvidence(), extraPrivateField: true }).success,
  false,
  "the emitted evidence schema rejects undocumented private fields",
);

console.log("Compiled private staff evidence DTO smoke test passed.");

const history = {
  schemaVersion: "staff-review-history/1",
  environment: "LOCAL_SYNTHETIC_ONLY",
  accessBasis: "BANK_MANAGER",
  observedAt: "2026-10-24T12:34:56.123456Z",
  version: {
    versionId: submitVersionId,
    contentHash: `sha256:${"a".repeat(64)}`,
    workflowRevision: 3,
  },
  workflowState: "REJECTED",
  qualification: "NOT_ATTESTED_BY_PLATFORM",
  publicationEligibility: "NOT_EVALUATED",
  limit: 20,
  truncated: false,
  reviews: [],
};
assert.equal(StaffReviewHistorySchema.safeParse(history).success, true);
assert.equal(StaffReviewHistorySchema.safeParse({ ...history, accessBasis: "REVIEW_QUEUE" }).success, false);
assert.equal(StaffReviewHistorySchema.safeParse({ ...history, truncated: true }).success, false);

console.log("Compiled private staff review-history DTO smoke test passed.");

assert.equal(StaffSubmitReviewRequestSchema.safeParse({ expectedRevision: 1 }).success, true);
assert.equal(StaffSubmitReviewRequestSchema.safeParse({ expectedRevision: 1, actorId: submitVersionId }).success, false);
assert.equal(StaffSubmitReviewResponseSchema.safeParse({
  versionId: submitVersionId,
  state: "IN_REVIEW",
  revision: 2,
}).success, true);
assert.equal(StaffSubmitReviewResponseSchema.safeParse({
  versionId: submitVersionId,
  state: "APPROVED",
  revision: 2,
}).success, false, "the emitted command receipt cannot claim a later review decision");

console.log("Compiled private staff submit-review DTO smoke test passed.");

const rejectRequest = {
  expectedRevision: 1,
  contentHash: `sha256:${"a".repeat(64)}`,
  decision: "REJECT",
  rubric: {
    correctness: true,
    unambiguous: false,
    relevant: true,
    language: false,
    explanation: true,
    rights: false,
  },
  reason: "Explicit reason without a UI-specific prefix",
};
assert.equal(StaffRejectReviewRequestSchema.safeParse(rejectRequest).success, true);
assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...rejectRequest, decision: "APPROVE" }).success, false);
assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...rejectRequest, reason: "  " }).success, false);
assert.equal(StaffRejectReviewResponseSchema.safeParse({
  reviewId: "01234567-89ab-4cde-8fab-0123456789ab",
  state: "REJECTED",
  revision: 2,
}).success, true);
assert.equal(StaffRejectReviewResponseSchema.safeParse({
  reviewId: "01234567-89ab-4cde-8fab-0123456789ab",
  state: "APPROVED",
  revision: 2,
}).success, false);

const quarantineRequest = { expectedRevision: 2, reason: "Explicit reason" };
assert.equal(StaffQuarantineRequestSchema.safeParse(quarantineRequest).success, true);
assert.equal(StaffQuarantineRequestSchema.safeParse({ ...quarantineRequest, reason: "x".repeat(4_097) }).success, false);
assert.equal(StaffQuarantineResponseSchema.safeParse({ state: "QUARANTINED", revision: 3 }).success, true);
assert.equal(StaffQuarantineResponseSchema.safeParse({ state: "REJECTED", revision: 3 }).success, false);

console.log("Compiled private staff rejection/quarantine DTO smoke test passed.");
