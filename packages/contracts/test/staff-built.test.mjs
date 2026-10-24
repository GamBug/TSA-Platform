import assert from "node:assert/strict";
import {
  StaffReviewContextSchema,
  StaffReviewEvidenceSchema,
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
