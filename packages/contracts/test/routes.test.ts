import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AssetPurposeSchema,
  CatalogEntrySchema,
  CatalogPageSchema,
  CatalogQuerySchema,
  CreateAttemptSchema,
  EmptyCommandBodySchema,
  IdempotencyKeySchema,
  RetryAfterHeadersSchema,
  StartReceiptSchema,
  releasedReviewRouteRegistry,
  studentRouteRegistry,
} from "../src/routes.ts";
import type { StudentOperations } from "../src/generated/student-operations.ts";

const attemptId = "5c364c8f-bf83-48a8-a7db-7a7714c93f36";
const blueprintId = "69525f05-f7e8-4e02-b3a8-2d6e8696b9cc";

describe("routes/1 runtime registry", () => {
  it("parses strict catalog modes, finite offset intervals, and bounded wire pagination", () => {
    const common = {
      name: "MATH practice",
      domain: "MATH",
      questionCount: 4,
      durationSeconds: 3_600,
      profileKind: "INDEPENDENT_PRACTICE",
      availableFrom: "2026-10-19T10:00:00+07:00",
      availableUntil: "2026-10-20T10:00:00Z",
    } as const;
    assert.equal(CatalogEntrySchema.parse({ ...common, mode: "PERSONALIZED_PRACTICE", blueprintVersionId: blueprintId, reviewAllowed: true }).mode, "PERSONALIZED_PRACTICE");
    assert.equal(CatalogEntrySchema.parse({ ...common, mode: "PUBLISHED_FIXED", formId: attemptId, repeatsAllowed: true }).mode, "PUBLISHED_FIXED");
    assert.equal(CatalogEntrySchema.safeParse({ ...common, mode: "PUBLISHED_FIXED", formId: attemptId, repeatsAllowed: true, surprise: true }).success, false);
    assert.equal(CatalogEntrySchema.safeParse({ ...common, mode: "PUBLISHED_FIXED", formId: attemptId, repeatsAllowed: true, availableUntil: "2026-10-19T02:00:00Z" }).success, false);
    assert.equal(CatalogEntrySchema.safeParse({ ...common, mode: "PUBLISHED_FIXED", formId: attemptId, repeatsAllowed: true, availableUntil: "2026-10-19T03:00:00Z" }).success, false);
    assert.equal(CatalogEntrySchema.safeParse({ ...common, mode: "PUBLISHED_FIXED", formId: attemptId, repeatsAllowed: true, availableFrom: "October 19, 2026 00:00:00+00:00" }).success, false);
    assert.deepEqual(CatalogPageSchema.parse({ items: [], nextCursor: null }), { items: [], nextCursor: null });
    assert.deepEqual(CatalogQuerySchema.parse({ limit: "100", cursor: "opaque:next" }), { limit: 100, cursor: "opaque:next" });
    for (const limit of ["0", "101", "1.5", "01", " "]) assert.equal(CatalogQuerySchema.safeParse({ limit }).success, false);
    assert.equal(CatalogQuerySchema.safeParse({ page: "2" }).success, false);
  });

  it("preserves creation defaults and requires repeat consent for review and fixed forms", () => {
    assert.deepEqual(CreateAttemptSchema.parse({ blueprintVersionId: blueprintId }), { blueprintVersionId: blueprintId });
    assert.equal(CreateAttemptSchema.safeParse({ mode: "PERSONALIZED_PRACTICE", blueprintVersionId: blueprintId, reuseMode: "REVIEW_ALLOWED" }).success, false);
    assert.equal(CreateAttemptSchema.safeParse({ mode: "PERSONALIZED_PRACTICE", blueprintVersionId: blueprintId, reuseMode: "REVIEW_ALLOWED", acknowledgeRepeats: true }).success, true);
    assert.equal(CreateAttemptSchema.safeParse({ mode: "PUBLISHED_FIXED", formId: attemptId, reuseMode: "FIXED_AS_PUBLISHED", acknowledgeRepeats: true }).success, true);
    assert.equal(CreateAttemptSchema.safeParse({ mode: "PUBLISHED_FIXED", formId: attemptId, reuseMode: "NEW_ONLY", acknowledgeRepeats: true }).success, false);
    assert.equal(CreateAttemptSchema.safeParse({ blueprintVersionId: blueprintId, userId: attemptId }).success, false);
  });

  it("requires strict empty command bodies, canonical path IDs, purpose, and opaque safe idempotency keys", () => {
    assert.deepEqual(EmptyCommandBodySchema.parse({}), {});
    assert.equal(EmptyCommandBodySchema.safeParse({ extra: true }).success, false);
    assert.equal(StartReceiptSchema.safeParse({ attemptId, startedAt: "2026-10-19T10:00:00Z", deadlineAt: "2026-10-19T11:00:00+00:00" }).success, true);
    assert.equal(StartReceiptSchema.safeParse({ attemptId, startedAt: "2026-10-19 10:00:00", deadlineAt: "2026-10-19T11:00:00Z" }).success, false);
    assert.equal(StartReceiptSchema.safeParse({ attemptId, startedAt: "2026-10-19T10:00:00Z", deadlineAt: "2026-10-19T10:00:00Z" }).success, false);
    assert.equal(AssetPurposeSchema.safeParse({ purpose: "question" }).success, true);
    assert.equal(AssetPurposeSchema.safeParse({ purpose: "source-url" }).success, false);
    assert.equal(IdempotencyKeySchema.safeParse("!idempotency-key~1").success, true);
    assert.equal(IdempotencyKeySchema.safeParse(" ").success, false);
    assert.equal(IdempotencyKeySchema.safeParse("key\nvalue").success, false);
    assert.equal(IdempotencyKeySchema.safeParse("k".repeat(129)).success, false);
    assert.equal(RetryAfterHeadersSchema.safeParse({ "Retry-After": "1" }).success, true);
    for (const value of ["0", "-1", "1.5", " 2", "2s"]) assert.equal(RetryAfterHeadersSchema.safeParse({ "Retry-After": value }).success, false);
  });

  it("defines exactly eight student operations and one separate released-review operation", () => {
    const student = Object.values(studentRouteRegistry);
    const review = Object.values(releasedReviewRouteRegistry);
    assert.equal(student.length, 8);
    assert.equal(review.length, 1);
    assert.equal(student.some((route) => route.path.endsWith("/result")), false);
    assert.deepEqual(review.map((route) => [route.method, route.path]), [["GET", "/api/v1/attempts/{id}/result"]]);
    assert.deepEqual(studentRouteRegistry.attemptAsset.responses[200], {
      contentType: "image/*",
      body: "Uint8Array",
      description: "Authorized image bytes",
    });
  });
});

// These assignments prove operation requests use wire/input types and output
// responses use parsed types derived from the runtime schemas.
const catalogWireQuery: StudentOperations["catalog"]["query"] = { limit: "100", cursor: "opaque" };
const createWireBody: StudentOperations["createAttempt"]["body"] = { blueprintVersionId: blueprintId };
const startWireHeaders: StudentOperations["startAttempt"]["headers"] = { "idempotency-key": "opaque-key" };
const parsedCatalogResponse: StudentOperations["catalog"]["responses"][200] = { items: [], nextCursor: null };
const responseRetryHeaders: StudentOperations["saveAnswer"]["responseHeaders"][429] = { "Retry-After": "3" };
const binaryAssetBody: StudentOperations["attemptAsset"]["responses"][200] = new Uint8Array();
void [catalogWireQuery, createWireBody, startWireHeaders, parsedCatalogResponse, responseRetryHeaders, binaryAssetBody];

// @ts-expect-error pagination is received on the wire as a string, then transformed to a number.
const invalidWireQuery: StudentOperations["catalog"]["query"] = { limit: 100 };
void invalidWireQuery;
