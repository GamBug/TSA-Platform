import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StaffReviewContextSchema,
  StaffReviewEvidenceSchema,
  StaffSubmitReviewRequestSchema,
  StaffSubmitReviewResponseSchema,
} from "@tsa/contracts/staff";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";
import { makeStaffReviewEvidence } from "./fixtures/staff-review-evidence.ts";

describe("@tsa/contracts/staff package subpath", () => {
  it("resolves the additive private schema export", () => {
    assert.equal(StaffReviewContextSchema.safeParse(makeStaffReviewContext()).success, true);
    assert.equal(StaffReviewEvidenceSchema.safeParse(makeStaffReviewEvidence()).success, true);
    assert.equal(StaffSubmitReviewRequestSchema.safeParse({ expectedRevision: 1 }).success, true);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({
      versionId: "44444444-4444-4444-8444-444444444444",
      state: "IN_REVIEW",
      revision: 2,
    }).success, true);
  });
});
