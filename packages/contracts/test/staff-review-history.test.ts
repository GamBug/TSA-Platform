import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  StaffReviewHistorySchema,
  type StaffReviewHistory,
} from "../src/staff.ts";
import {
  StaffReviewHistoryPathParamsSchema,
  staffRouteRegistry,
  type StaffOperationMap,
} from "../src/staff-routes.ts";

const versionId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const contentHash = `sha256:${"a".repeat(64)}`;
const rubric = {
  correctness: true,
  unambiguous: false,
  relevant: true,
  language: false,
  explanation: true,
  rights: false,
};
const reviewId = (index: number): string => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

function history(overrides: Partial<StaffReviewHistory> = {}): StaffReviewHistory {
  return {
    schemaVersion: "staff-review-history/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "BANK_MANAGER",
    observedAt: "2026-10-24T12:34:56.123456Z",
    version: { versionId, contentHash, workflowRevision: 7 },
    workflowState: "REJECTED",
    qualification: "NOT_ATTESTED_BY_PLATFORM",
    publicationEligibility: "NOT_EVALUATED",
    limit: 20,
    truncated: false,
    reviews: [],
    ...overrides,
  };
}

function recordedReview(
  index: number,
  overrides: Partial<StaffReviewHistory["reviews"][number]> = {},
): StaffReviewHistory["reviews"][number] {
  return {
    reviewId: reviewId(index),
    recordedAt: `2026-10-24T12:34:56.${index.toString().padStart(6, "0")}Z`,
    decision: index % 2 === 0 ? "APPROVE" : "REJECT",
    rubric,
    reason: `Recorded synthetic decision ${index}`,
    ...overrides,
  };
}

describe("private staff recorded-review history contract", () => {
  it("accepts an empty bounded history and a recorded decision projection", () => {
    const empty = history();
    assert.deepEqual(StaffReviewHistorySchema.parse(empty), empty);

    const inertReason = "<img src=x onerror=alert(1)>";
    const recorded = history({
      reviews: [recordedReview(2, { reason: inertReason }), recordedReview(1)],
    });
    const result = StaffReviewHistorySchema.parse(recorded);
    assert.equal(result.schemaVersion, "staff-review-history/1");
    assert.equal(result.reviews.length, 2);
    assert.deepEqual(result.reviews.map(({ decision }) => decision), ["APPROVE", "REJECT"]);
    assert.equal(result.reviews[0]?.reason, inertReason, "stored reason is preserved verbatim as untrusted text");
  });

  it("requires canonical UTC microsecond timestamps, positive safe revisions, and bounded reasons", () => {
    const base = history({ reviews: [recordedReview(1)] });
    for (const observedAt of [
      "2026-10-24T12:34:56.123456+00:00",
      "2026-10-24T12:34:56.123Z",
      "2026-02-30T12:34:56.123456Z",
    ]) {
      assert.equal(StaffReviewHistorySchema.safeParse({ ...base, observedAt }).success, false);
    }
    assert.equal(StaffReviewHistorySchema.safeParse({
      ...base,
      reviews: [{ ...base.reviews[0]!, recordedAt: "2026-10-24T12:34:56.123456+00:00" }],
    }).success, false);
    assert.equal(StaffReviewHistorySchema.safeParse({
      ...base,
      version: { ...base.version, versionId: "not-a-uuid" },
    }).success, false);
    assert.equal(StaffReviewHistorySchema.safeParse({
      ...base,
      version: { ...base.version, contentHash: `SHA256:${"A".repeat(64)}` },
    }).success, false);
    assert.equal(StaffReviewHistorySchema.safeParse({
      ...base,
      reviews: [{ ...base.reviews[0]!, reviewId: "not-a-uuid" }],
    }).success, false);
    for (const workflowRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(StaffReviewHistorySchema.safeParse({
        ...base,
        version: { ...base.version, workflowRevision },
      }).success, false);
    }
    for (const reason of ["", " \t\n ", "x".repeat(4_097)]) {
      assert.equal(StaffReviewHistorySchema.safeParse({
        ...base,
        reviews: [{ ...base.reviews[0]!, reason }],
      }).success, false);
    }
    assert.equal(StaffReviewHistorySchema.safeParse({
      ...base,
      reviews: [{ ...base.reviews[0]!, reason: "x".repeat(4_096) }],
    }).success, true);
  });

  it("rejects duplicate IDs, non-latest-first ordering, and impossible truncation claims", () => {
    const first = recordedReview(2);
    const second = recordedReview(1);
    assert.equal(StaffReviewHistorySchema.safeParse(history({ reviews: [first, { ...second, reviewId: first.reviewId }] })).success, false);
    assert.equal(StaffReviewHistorySchema.safeParse(history({ reviews: [second, first] })).success, false);

    const tiedLatest = [
      { ...recordedReview(2), recordedAt: "2026-10-24T12:34:56.123456Z" },
      { ...recordedReview(1), recordedAt: "2026-10-24T12:34:56.123456Z" },
    ];
    assert.equal(StaffReviewHistorySchema.safeParse(history({ reviews: tiedLatest })).success, true);
    assert.equal(StaffReviewHistorySchema.safeParse(history({ truncated: true, reviews: [first] })).success, false);

    const twenty = Array.from({ length: 20 }, (_, index) => recordedReview(20 - index));
    assert.equal(StaffReviewHistorySchema.safeParse(history({ truncated: true, reviews: twenty })).success, true);
    assert.equal(StaffReviewHistorySchema.safeParse(history({ reviews: [...twenty, recordedReview(21)] })).success, false);
  });

  it("keeps the projection strict, manager-only, and free of identities or question content", () => {
    const base = history({ reviews: [recordedReview(1)] });
    for (const mutation of [
      { ...base, reviewerId: versionId },
      { ...base, environment: "PRODUCTION" },
      { ...base, accessBasis: "REVIEW_QUEUE" },
      { ...base, qualification: "QUALIFIED" },
      { ...base, publicationEligibility: "ELIGIBLE" },
      { ...base, workflowState: "UNKNOWN" },
      { ...base, limit: 10 },
      { ...base, version: { ...base.version, authorId: versionId } },
      { ...base, reviews: [{ ...base.reviews[0]!, reviewerId: versionId }] },
      { ...base, reviews: [{ ...base.reviews[0]!, answerKey: { type: "SINGLE_CHOICE", optionId: versionId } }] },
      { ...base, reviews: [{ ...base.reviews[0]!, rubric: { ...rubric, extra: true } }] },
      { ...base, reviews: [{ ...base.reviews[0]!, extra: true }] },
    ]) {
      assert.equal(StaffReviewHistorySchema.safeParse(mutation).success, false);
    }
  });

  it("registers a private GET with no query, body, or request headers", () => {
    const params: StaffOperationMap["staffReviewHistory"]["params"] = { versionId };
    const query: StaffOperationMap["staffReviewHistory"]["query"] = undefined;
    const body: StaffOperationMap["staffReviewHistory"]["body"] = undefined;
    const headers: StaffOperationMap["staffReviewHistory"]["headers"] = undefined;
    const response: StaffReviewHistory = StaffReviewHistorySchema.parse(history());
    assert.deepEqual(StaffReviewHistoryPathParamsSchema.parse(params), { versionId });
    assert.equal(StaffReviewHistoryPathParamsSchema.safeParse({ versionId, extra: true }).success, false);
    assert.equal(query, undefined);
    assert.equal(body, undefined);
    assert.equal(headers, undefined);
    assert.equal(response.limit, 20);
    assert.equal(staffRouteRegistry.staffReviewHistory.method, "GET");
    assert.equal(staffRouteRegistry.staffReviewHistory.path, "/api/v1/question-versions/{versionId}/review-history");
    assert.deepEqual(Object.keys(staffRouteRegistry.staffReviewHistory.responses), ["200", "401", "403", "404", "422", "503"]);
  });
});
