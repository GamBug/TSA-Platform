import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  StaffReviewContextSchema,
  StaffReviewEvidenceSchema,
  type StaffReviewContext,
  type StaffReviewEvidence,
} from "../src/staff.ts";
import { scanConsumerTree, runConsumerBoundaryCheck } from "../scripts/check-consumer-boundaries.ts";
import { makeStaffReviewContext } from "./fixtures/staff-review-context.ts";
import { makeStaffReviewEvidence } from "./fixtures/staff-review-evidence.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));

describe("private staff package boundary", () => {
  it("exports the strict schema and matching DTO type", () => {
    const result: StaffReviewContext = StaffReviewContextSchema.parse(makeStaffReviewContext());
    assert.equal(result.schemaVersion, "staff-review-context/1");

    const evidence: StaffReviewEvidence = StaffReviewEvidenceSchema.parse(makeStaffReviewEvidence());
    assert.equal(evidence.schemaVersion, "staff-review-evidence/1");
  });

  it("keeps staff imports outside the designated student consumer graph", () => {
    assert.deepEqual(runConsumerBoundaryCheck(), []);
    const negativeFixture = resolve(testDirectory, "fixtures/staff-consumer-boundary-negative");
    const violations = scanConsumerTree(negativeFixture);
    assert.equal(violations.length, 1);
    assert.match(violations[0]!, /outside student/);
    assert.match(violations[0]!, /@tsa\/contracts\/staff/);
  });
});
