import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StaffReviewContextSchema, StaffReviewEvidenceSchema } from "@tsa/contracts/staff";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";
import { makeStaffReviewEvidence } from "./fixtures/staff-review-evidence.ts";

describe("@tsa/contracts/staff package subpath", () => {
  it("resolves the additive private schema export", () => {
    assert.equal(StaffReviewContextSchema.safeParse(makeStaffReviewContext()).success, true);
    assert.equal(StaffReviewEvidenceSchema.safeParse(makeStaffReviewEvidence()).success, true);
  });
});
