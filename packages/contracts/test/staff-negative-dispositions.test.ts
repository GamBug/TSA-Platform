import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StaffQuarantineRequestSchema,
  StaffQuarantineResponseSchema,
  StaffRejectReviewRequestSchema,
  StaffRejectReviewResponseSchema,
  type StaffQuarantineRequest,
  type StaffRejectReviewRequest,
} from "../src/staff.ts";
import {
  StaffQuarantinePathParamsSchema,
  StaffRejectReviewPathParamsSchema,
  StaffSubmitReviewRequestHeadersSchema,
  staffRouteRegistry,
  type StaffOperationMap,
} from "../src/staff-routes.ts";

const versionId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const reviewId = "01234567-89ab-4cde-8fab-0123456789ab";
const contentHash = `sha256:${"a".repeat(64)}`;
const headers = { "x-csrf-token": "a".repeat(43), "idempotency-key": "b4-1" };
const rubric = {
  correctness: true,
  unambiguous: false,
  relevant: true,
  language: false,
  explanation: true,
  rights: false,
};

describe("private staff negative-disposition contracts", () => {
  it("accepts strict REJECT requests and receipts while rejecting APPROVE and unsafe shapes", () => {
    const request = {
      expectedRevision: Number.MAX_SAFE_INTEGER,
      contentHash,
      decision: "REJECT",
      rubric,
      // Prefixing is a UI policy; the service DTO requires an explicit reason only.
      reason: "Explicit synthetic review reason",
    } as const;
    assert.deepEqual(StaffRejectReviewRequestSchema.parse(request), request);
    assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, reason: "x".repeat(4_096) }).success, true);

    for (const expectedRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, expectedRevision }).success, false);
    }
    for (const reason of ["", " \t\n ", "x".repeat(4_097)]) {
      assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, reason }).success, false);
    }
    assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, decision: "APPROVE" }).success, false);
    assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, contentHash: "SHA256:bad" }).success, false);
    assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, rubric: { ...rubric, rights: "yes" } }).success, false);
    assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, rubric: { ...rubric, extra: true } }).success, false);
    assert.equal(StaffRejectReviewRequestSchema.safeParse({ ...request, extra: true }).success, false);

    const receipt = { reviewId, state: "REJECTED", revision: 8 } as const;
    assert.deepEqual(StaffRejectReviewResponseSchema.parse(receipt), receipt);
    assert.equal(StaffRejectReviewResponseSchema.safeParse({ ...receipt, state: "APPROVED" }).success, false);
    assert.equal(StaffRejectReviewResponseSchema.safeParse({ ...receipt, revision: Number.MAX_SAFE_INTEGER + 1 }).success, false);
    assert.equal(StaffRejectReviewResponseSchema.safeParse({ ...receipt, versionId }).success, false);
    assert.equal(StaffRejectReviewResponseSchema.safeParse({ reviewId, state: "REJECTED", revision: 8, extra: true }).success, false);
  });

  it("accepts strict quarantine requests and receipts without adding receipt identity", () => {
    const request = { expectedRevision: 2, reason: "Explicit hold reason" } as const;
    assert.deepEqual(StaffQuarantineRequestSchema.parse(request), request);
    assert.equal(StaffQuarantineRequestSchema.safeParse({ expectedRevision: 2, reason: "x".repeat(4_096) }).success, true);
    for (const expectedRevision of [0, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(StaffQuarantineRequestSchema.safeParse({ ...request, expectedRevision }).success, false);
    }
    for (const reason of ["", "  ", "x".repeat(4_097)]) {
      assert.equal(StaffQuarantineRequestSchema.safeParse({ ...request, reason }).success, false);
    }
    assert.equal(StaffQuarantineRequestSchema.safeParse({ ...request, extra: true }).success, false);

    const receipt = { state: "QUARANTINED", revision: 3 } as const;
    assert.deepEqual(StaffQuarantineResponseSchema.parse(receipt), receipt);
    assert.equal(StaffQuarantineResponseSchema.safeParse({ ...receipt, state: "REJECTED" }).success, false);
    assert.equal(StaffQuarantineResponseSchema.safeParse({ ...receipt, revision: 0 }).success, false);
    assert.equal(StaffQuarantineResponseSchema.safeParse({ ...receipt, versionId }).success, false);
  });

  it("adds only the two intended private POST operations and reuses B3 request headers", () => {
    const rejectRequest: StaffRejectReviewRequest = StaffRejectReviewRequestSchema.parse({
      expectedRevision: 2,
      contentHash,
      decision: "REJECT",
      rubric,
      reason: "Explicit reason",
    });
    const quarantineRequest: StaffQuarantineRequest = StaffQuarantineRequestSchema.parse({
      expectedRevision: 4,
      reason: "Explicit reason",
    });
    const typedHeaders: StaffOperationMap["staffRejectReview"]["headers"] = headers;
    assert.equal(rejectRequest.decision, "REJECT");
    assert.equal(quarantineRequest.expectedRevision, 4);
    assert.deepEqual(StaffSubmitReviewRequestHeadersSchema.parse(typedHeaders), headers);
    assert.deepEqual(StaffRejectReviewPathParamsSchema.parse({ versionId }), { versionId });
    assert.deepEqual(StaffQuarantinePathParamsSchema.parse({ versionId }), { versionId });
    assert.equal(StaffRejectReviewPathParamsSchema.safeParse({ versionId, extra: true }).success, false);
    assert.equal(StaffQuarantinePathParamsSchema.safeParse({ versionId: versionId.toUpperCase() }).success, false);

    assert.equal(staffRouteRegistry.staffRejectReview.method, "POST");
    assert.equal(staffRouteRegistry.staffRejectReview.path, "/api/v1/question-versions/{versionId}/reviews");
    assert.deepEqual(Object.keys(staffRouteRegistry.staffRejectReview.responses), ["201", "400", "401", "403", "404", "409", "413", "422", "503"]);
    assert.equal(staffRouteRegistry.staffQuarantine.method, "POST");
    assert.equal(staffRouteRegistry.staffQuarantine.path, "/api/v1/question-versions/{versionId}/quarantine");
    assert.deepEqual(Object.keys(staffRouteRegistry.staffQuarantine.responses), ["200", "400", "401", "403", "404", "409", "413", "422", "503"]);

    if (false) {
      // @ts-expect-error Private staff DTOs cannot represent the pre-existing APPROVE command.
      const approveRequest: StaffRejectReviewRequest = { ...rejectRequest, decision: "APPROVE" };
      // @ts-expect-error Quarantine DTOs cannot contain additional command fields.
      const invalidQuarantine: StaffQuarantineRequest = { ...quarantineRequest, versionId };
      void approveRequest;
      void invalidQuarantine;
    }
  });
});
