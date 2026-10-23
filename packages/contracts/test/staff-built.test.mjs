import assert from "node:assert/strict";
import { StaffReviewContextSchema } from "../dist/staff.js";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";

const context = makeStaffReviewContext();
assert.equal(StaffReviewContextSchema.safeParse(context).success, true);
assert.equal(
  StaffReviewContextSchema.safeParse({ ...context, publicationEligibility: "ELIGIBLE" }).success,
  false,
  "the emitted private DTO schema rejects undocumented public-eligibility states",
);

console.log("Compiled private staff DTO smoke test passed.");
