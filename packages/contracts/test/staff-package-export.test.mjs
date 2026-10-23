import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StaffReviewContextSchema } from "@tsa/contracts/staff";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";

describe("@tsa/contracts/staff package subpath", () => {
  it("resolves the additive private schema export", () => {
    assert.equal(StaffReviewContextSchema.safeParse(makeStaffReviewContext()).success, true);
  });
});
