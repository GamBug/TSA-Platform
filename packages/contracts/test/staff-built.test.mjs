import assert from "node:assert/strict";
import { StaffReviewContextSchema, StaffReviewEvidenceSchema } from "../dist/staff.js";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";
import { makeStaffReviewEvidence } from "./fixtures/staff-review-evidence.ts";

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
