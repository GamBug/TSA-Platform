import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StaffSubmitReviewRequestSchema,
  StaffSubmitReviewResponseSchema,
} from "../src/staff.ts";
import {
  StaffSubmitReviewPathParamsSchema,
  StaffSubmitReviewRequestHeadersSchema,
  staffRouteRegistry,
  type StaffOperationMap,
} from "../src/staff-routes.ts";

const versionId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const csrfToken = "a".repeat(43);

describe("private staff submit-review contract", () => {
  it("accepts only a positive safe expected revision and a strict receipt", () => {
    assert.deepEqual(StaffSubmitReviewRequestSchema.parse({ expectedRevision: 1 }), { expectedRevision: 1 });
    assert.deepEqual(StaffSubmitReviewRequestSchema.parse({ expectedRevision: Number.MAX_SAFE_INTEGER }), {
      expectedRevision: Number.MAX_SAFE_INTEGER,
    });
    for (const expectedRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(StaffSubmitReviewRequestSchema.safeParse({ expectedRevision }).success, false);
    }
    assert.equal(StaffSubmitReviewRequestSchema.safeParse({ expectedRevision: 1, actorId: versionId }).success, false);

    const receipt = { versionId, state: "IN_REVIEW", revision: 2 } as const;
    assert.deepEqual(StaffSubmitReviewResponseSchema.parse(receipt), receipt);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({ ...receipt, revision: Number.MAX_SAFE_INTEGER }).success, true);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({ ...receipt, state: "APPROVED" }).success, false);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({ ...receipt, approvalTimestamp: "2026-10-24T00:00:00Z" }).success, false);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({ ...receipt, versionId: versionId.toUpperCase() }).success, false);
    assert.equal(StaffSubmitReviewResponseSchema.safeParse({ ...receipt, revision: Number.MAX_SAFE_INTEGER + 1 }).success, false);
  });

  it("requires exact path and CSRF/idempotency headers", () => {
    assert.deepEqual(StaffSubmitReviewPathParamsSchema.parse({ versionId }), { versionId });
    assert.equal(StaffSubmitReviewPathParamsSchema.safeParse({ versionId: versionId.toUpperCase() }).success, false);
    assert.equal(StaffSubmitReviewPathParamsSchema.safeParse({ versionId, extra: true }).success, false);

    const headers = { "x-csrf-token": csrfToken, "idempotency-key": "submit-1" };
    assert.deepEqual(StaffSubmitReviewRequestHeadersSchema.parse(headers), headers);
    for (const idempotencyKey of ["", "has space", "café", "x".repeat(129)]) {
      assert.equal(StaffSubmitReviewRequestHeadersSchema.safeParse({ ...headers, "idempotency-key": idempotencyKey }).success, false);
    }
    assert.equal(StaffSubmitReviewRequestHeadersSchema.safeParse({ ...headers, "x-csrf-token": "short" }).success, false);
    assert.equal(StaffSubmitReviewRequestHeadersSchema.safeParse({ ...headers, unexpected: "value" }).success, false);
  });

  it("adds a POST operation without changing existing GET body and header inputs", () => {
    const request: StaffOperationMap["staffSubmitReview"]["body"] = { expectedRevision: 1 };
    const headers: StaffOperationMap["staffSubmitReview"]["headers"] = {
      "x-csrf-token": csrfToken,
      "idempotency-key": "submit-1",
    };
    const receipt = {
      versionId,
      state: "IN_REVIEW",
      revision: 2,
    } as const;
    assert.equal(request.expectedRevision, 1);
    assert.equal(headers["idempotency-key"], "submit-1");
    assert.equal(receipt.state, "IN_REVIEW");
    assert.equal(staffRouteRegistry.staffSubmitReview.method, "POST");
    assert.deepEqual(Object.keys(staffRouteRegistry.staffSubmitReview.responses), ["200", "400", "401", "403", "404", "409", "413", "422", "503"]);

    const replayConflict = {
      error: {
        code: "IDEMPOTENCY_CONFLICT",
        message: "The idempotency key was already used for a different request",
        requestId: "request-1",
        details: {},
      },
    };
    assert.equal(staffRouteRegistry.staffSubmitReview.responses[409].schema.safeParse(replayConflict).success, true);
    assert.equal(staffRouteRegistry.staffSubmitReview.responses[409].schema.safeParse({
      ...replayConflict,
      error: { ...replayConflict.error, details: { graph: "private" } },
    }).success, false);
    assert.equal(staffRouteRegistry.staffSubmitReview.responses[409].schema.safeParse({
      ...replayConflict,
      error: { ...replayConflict.error, message: "unsafe detail" },
    }).success, false);

    const getBody: StaffOperationMap["staffReviewContext"]["body"] = undefined;
    const getHeaders: StaffOperationMap["staffReviewContext"]["headers"] = undefined;
    assert.equal(getBody, undefined);
    assert.equal(getHeaders, undefined);

    if (false) {
      // @ts-expect-error Existing GET operations must retain undefined request bodies.
      const invalidGetBody: StaffOperationMap["staffReviewContext"]["body"] = { expectedRevision: 1 };
      void invalidGetBody;
    }
  });
});
