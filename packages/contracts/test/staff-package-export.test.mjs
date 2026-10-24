import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
} from "@tsa/contracts/staff";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";
import { makeStaffReviewEvidence } from "./fixtures/staff-review-evidence.ts";

describe("@tsa/contracts/staff package subpath", () => {
  it("resolves the additive private schema export", () => {
    assert.equal(StaffReviewContextSchema.safeParse(makeStaffReviewContext()).success, true);
    assert.equal(StaffReviewEvidenceSchema.safeParse(makeStaffReviewEvidence()).success, true);
    assert.equal(StaffReviewHistorySchema.safeParse({
      schemaVersion: "staff-review-history/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "BANK_MANAGER",
      observedAt: "2026-10-24T12:34:56.123456Z",
      version: {
        versionId: "44444444-4444-4444-8444-444444444444",
        contentHash: `sha256:${"a".repeat(64)}`,
        workflowRevision: 1,
      },
      workflowState: "IN_REVIEW",
      qualification: "NOT_ATTESTED_BY_PLATFORM",
      publicationEligibility: "NOT_EVALUATED",
      limit: 20,
      truncated: false,
      reviews: [],
    }).success, true);
    assert.equal(StaffSubmitReviewRequestSchema.safeParse({ expectedRevision: 1 }).success, true);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({
      versionId: "44444444-4444-4444-8444-444444444444",
      state: "IN_REVIEW",
      revision: 2,
    }).success, true);
    assert.equal(StaffRejectReviewRequestSchema.safeParse({
      expectedRevision: 1,
      contentHash: `sha256:${"a".repeat(64)}`,
      decision: "REJECT",
      rubric: {
        correctness: true,
        unambiguous: true,
        relevant: true,
        language: true,
        explanation: true,
        rights: true,
      },
      reason: "Explicit reason",
    }).success, true);
    assert.equal(StaffRejectReviewResponseSchema.safeParse({
      reviewId: "01234567-89ab-4cde-8fab-0123456789ab",
      state: "REJECTED",
      revision: 2,
    }).success, true);
    assert.equal(StaffQuarantineRequestSchema.safeParse({ expectedRevision: 2, reason: "Explicit reason" }).success, true);
    assert.equal(StaffQuarantineResponseSchema.safeParse({ state: "QUARANTINED", revision: 3 }).success, true);
  });
});
