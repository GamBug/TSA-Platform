import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateStaffContractsOpenApi } from "../scripts/staff-openapi.ts";
import { generateStudentContractsOpenApi } from "../scripts/openapi.ts";
import {
  StaffFixedFormDetailSchema,
  StaffFixedFormListSchema,
  StaffFixedSealReceiptSchema,
  StaffFixedSealRequestSchema,
} from "../src/staff.ts";
import { StaffOperationPaths } from "../src/generated/staff-operations.ts";
import {
  StaffFixedFormPathParamsSchema,
  StaffFixedSealConstraintConflictResponseSchema,
  StaffFixedSealInsufficientInventoryResponseSchema,
  StaffFixedSealSearchExhaustedResponseSchema,
  StaffFixedSealValidationResponseSchema,
  StaffResponseHeadersSchema,
  StaffSubmitReviewRequestHeadersSchema,
  staffRouteRegistry,
} from "../src/staff-routes.ts";

const FORM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FORM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RUN_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BLUEPRINT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const OBSERVED_AT = "2026-10-25T14:30:00.123456Z";

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    mode: "PUBLISHED_FIXED",
    blueprintVersionId: BLUEPRINT,
    blueprintHash: HASH_A,
    windowMinutes: 60,
    ...overrides,
  };
}

function makeReceipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "staff-fixed-seal-receipt/1",
    assemblyRunId: RUN_A,
    formId: FORM_A,
    blueprintVersionId: BLUEPRINT,
    blueprintHash: HASH_A,
    mode: "PUBLISHED_FIXED",
    reuseMode: "FIXED_AS_PUBLISHED",
    seed: 42,
    manifestHash: HASH_A,
    formHash: HASH_B,
    state: "SEALED",
    capturedAt: "2026-10-25T12:00:00.123456Z",
    sealedAt: "2026-10-25T12:00:02.123456Z",
    availableFrom: "2026-10-25T12:00:00.123456Z",
    availableUntil: "2026-10-25T13:00:00.123456Z",
    requiredThrough: "2026-10-25T14:10:00.123456Z",
    currentEligibility: "NOT_REVALIDATED",
    studentDeliverySupported: false,
    ...overrides,
  };
}

function makeListItem(overrides: Record<string, unknown> = {}) {
  return {
    ...makeReceipt(),
    domain: "MATH",
    questionCount: 4,
    durationSeconds: 3_600,
    ...overrides,
  };
}

function makeList(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "staff-fixed-forms/1",
    environment: "LOCAL_SYNTHETIC_ONLY",
    accessBasis: "EXAM_MANAGER",
    observedAt: OBSERVED_AT,
    limit: 20,
    truncated: false,
    items: [makeListItem()],
    ...overrides,
  };
}

describe("private fixed-seal DTOs and route artifacts", () => {
  it("keeps the command strict, bounded, and without client timestamps", () => {
    const omittedSeed = StaffFixedSealRequestSchema.parse(makeRequest());
    assert.equal(Object.hasOwn(omittedSeed, "seed"), false);
    assert.deepEqual(Object.keys(omittedSeed), ["mode", "blueprintVersionId", "blueprintHash", "windowMinutes"]);
    assert.equal(StaffFixedSealRequestSchema.parse(makeRequest({ seed: 0 })).seed, 0);
    assert.equal(StaffFixedSealRequestSchema.parse(makeRequest({ seed: 0xffff_ffff })).seed, 0xffff_ffff);
    assert.equal(StaffFixedSealRequestSchema.parse(makeRequest({ windowMinutes: 1 })).windowMinutes, 1);
    assert.equal(StaffFixedSealRequestSchema.parse(makeRequest({ windowMinutes: 1_440 })).windowMinutes, 1_440);

    for (const invalid of [
      makeRequest({ mode: "PERSONALIZED_PRACTICE" }),
      makeRequest({ blueprintVersionId: "not-a-uuid" }),
      makeRequest({ blueprintHash: "sha256:ABC" }),
      makeRequest({ windowMinutes: 0 }),
      makeRequest({ windowMinutes: 1_441 }),
      makeRequest({ windowMinutes: 1.5 }),
      makeRequest({ seed: -1 }),
      makeRequest({ seed: 0x1_0000_0000 }),
      makeRequest({ seed: 1.5 }),
      makeRequest({ capturedAt: "2026-10-25T12:00:00Z" }),
      makeRequest({ requestId: "client-controlled" }),
      { blueprintVersionId: BLUEPRINT, blueprintHash: HASH_A, windowMinutes: 60 },
    ]) assert.equal(StaffFixedSealRequestSchema.safeParse(invalid).success, false);
  });

  it("accepts only the exhaustive historical receipt with exact microsecond timing", () => {
    assert.deepEqual(StaffFixedSealReceiptSchema.parse(makeReceipt()), makeReceipt());
    assert.equal(Object.hasOwn(StaffFixedSealReceiptSchema.parse(makeReceipt()), "requestId"), false);
    assert.equal(StaffFixedSealReceiptSchema.safeParse(makeReceipt({
      requiredThrough: "2026-10-25T14:10:00.123457Z",
    })).success, false);
    assert.equal(StaffFixedSealReceiptSchema.safeParse(makeReceipt({
      availableFrom: "2026-10-25T12:00:00.123457Z",
    })).success, false);
    assert.equal(StaffFixedSealReceiptSchema.safeParse(makeReceipt({
      availableUntil: "2026-10-25T13:00:00.123457Z",
    })).success, false);
    assert.equal(StaffFixedSealReceiptSchema.safeParse(makeReceipt({
      sealedAt: "2026-10-25T12:00:00.123455Z",
    })).success, false);
    assert.equal(StaffFixedSealReceiptSchema.safeParse(makeReceipt({
      sealedAt: "2026-10-25T13:00:00.123456Z",
    })).success, false);

    for (const invalid of [
      makeReceipt({ requestId: "not-in-the-receipt" }),
      makeReceipt({ environment: "LOCAL_SYNTHETIC_ONLY" }),
      makeReceipt({ windowMinutes: 60 }),
      makeReceipt({ formHash: "bad-hash" }),
      makeReceipt({ mode: "PERSONALIZED_PRACTICE" }),
      makeReceipt({ reuseMode: "NEW_ONLY" }),
      makeReceipt({ state: "DRAFT" }),
      makeReceipt({ studentDeliverySupported: true }),
      makeReceipt({ currentEligibility: "ELIGIBLE" }),
      makeReceipt({ capturedAt: "2026-10-25T12:00:00Z" }),
      makeReceipt({ requiredThrough: "2026-10-25T13:10:00.123455Z" }),
      makeReceipt({ requiredThrough: "2026-10-25T19:10:00.123457Z" }),
      makeReceipt({ requiredThrough: "2026-10-25T19:10:01.123456Z" }),
    ]) assert.equal(StaffFixedSealReceiptSchema.safeParse(invalid).success, false);
    assert.equal(StaffFixedSealReceiptSchema.safeParse(makeReceipt({
      requiredThrough: "2026-10-25T13:10:01.123456Z",
    })).success, true);
    assert.equal(StaffFixedSealReceiptSchema.safeParse(makeReceipt({
      requiredThrough: "2026-10-25T19:10:00.123456Z",
    })).success, true);
  });

  it("validates domain/count/duration and newest-first bounded unique list rows", () => {
    assert.equal(StaffFixedFormListSchema.safeParse(makeList()).success, true);
    assert.equal(StaffFixedFormListSchema.safeParse(makeList({
      items: [makeListItem({
        domain: "READING",
        questionCount: 2,
        durationSeconds: 1_800,
        requiredThrough: "2026-10-25T13:40:00.123456Z",
      })],
    })).success, true);
    assert.equal(StaffFixedFormListSchema.safeParse(makeList({
      items: [makeListItem({ domain: "SCIENCE", questionCount: 4 })],
    })).success, true);

    for (const invalid of [
      makeList({ items: [makeListItem({ domain: "READING", questionCount: 4 })] }),
      makeList({ items: [makeListItem({ domain: "MATH", questionCount: 2 })] }),
      makeList({ items: [makeListItem({ durationSeconds: 0 })] }),
      makeList({ items: [makeListItem({ durationSeconds: 3_599 })] }),
      makeList({ items: [makeListItem({ durationSeconds: 21_601 })] }),
      makeList({ items: [makeListItem({ requestId: "private" })] }),
      makeList({ items: [makeListItem(), makeListItem()] }),
      makeList({ truncated: true }),
      makeList({ items: Array.from({ length: 21 }, (_, index) => makeListItem({
        formId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })) }),
    ]) assert.equal(StaffFixedFormListSchema.safeParse(invalid).success, false);

    const ordered = makeList({
      items: [
        makeListItem({ formId: FORM_B, assemblyRunId: RUN_B }),
        makeListItem({ formId: FORM_A, assemblyRunId: RUN_A }),
      ],
    });
    assert.equal(StaffFixedFormListSchema.safeParse(ordered).success, true);
    assert.equal(StaffFixedFormListSchema.safeParse({
      ...ordered,
      items: [...ordered.items].reverse(),
    }).success, false);

    const fullList = makeList({
      truncated: true,
      items: Array.from({ length: 20 }, (_, index) => makeListItem({
        formId: `00000000-0000-4000-8000-${String(20 - index).padStart(12, "0")}`,
        assemblyRunId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      })),
    });
    assert.equal(StaffFixedFormListSchema.safeParse(fullList).success, true);
  });

  it("keeps fresh detail availability independent from the immutable receipt horizon", () => {
    const detail = {
      schemaVersion: "staff-fixed-form/1",
      environment: "LOCAL_SYNTHETIC_ONLY",
      accessBasis: "EXAM_MANAGER",
      observedAt: OBSERVED_AT,
      form: makeListItem(),
      availability: {
        revision: 2,
        availableFrom: "2026-10-25T14:00:00.000000Z",
        availableUntil: "2026-10-25T15:00:00.000000Z",
        withdrawnAt: null,
      },
    };
    assert.deepEqual(StaffFixedFormDetailSchema.parse(detail), detail);
    assert.equal(StaffFixedFormDetailSchema.safeParse({
      ...detail,
      availability: { ...detail.availability, revision: Number.MAX_SAFE_INTEGER + 1 },
    }).success, false);
    assert.equal(StaffFixedFormDetailSchema.safeParse({
      ...detail,
      availability: { ...detail.availability, revision: 0 },
    }).success, false);
    assert.equal(StaffFixedFormDetailSchema.safeParse({
      ...detail,
      availability: { ...detail.availability, withdrawnAt: "2026-10-25T14:29:00.123456Z" },
    }).success, true);
    assert.equal(StaffFixedFormDetailSchema.safeParse({
      ...detail,
      form: { ...detail.form, privateAnswerKey: { secret: true } },
    }).success, false);
  });

  it("frames exact private routes, typed solver errors, and leaves student artifacts separate", () => {
    const post = staffRouteRegistry.staffCreateFixedSeal;
    assert.equal(post.method, "POST");
    assert.equal(post.path, "/api/v1/assemblies");
    assert.equal(post.body, StaffFixedSealRequestSchema);
    assert.equal(post.headers, StaffSubmitReviewRequestHeadersSchema);
    assert.equal(post.responses[201]?.schema, StaffFixedSealReceiptSchema);
    assert.equal(post.responses[201]?.headers, StaffResponseHeadersSchema);
    assert.equal(post.responses[422]?.schema, StaffFixedSealValidationResponseSchema);
    assert.equal(StaffSubmitReviewRequestHeadersSchema.safeParse({
      "x-csrf-token": "x".repeat(43),
      "idempotency-key": "fixed-seal-intent-1",
    }).success, true);
    assert.equal(StaffSubmitReviewRequestHeadersSchema.safeParse({
      "x-csrf-token": "x".repeat(42),
      "idempotency-key": "fixed-seal-intent-1",
    }).success, false);
    assert.equal(StaffSubmitReviewRequestHeadersSchema.safeParse({
      "x-csrf-token": "x".repeat(43),
      "idempotency-key": "fixed-seal-intent-1",
      "x-request-id": "client-controlled",
    }).success, false);

    for (const [schema, code] of [
      [StaffFixedSealInsufficientInventoryResponseSchema, "INSUFFICIENT_ELIGIBLE_INVENTORY"],
      [StaffFixedSealConstraintConflictResponseSchema, "CONSTRAINT_CONFLICT"],
      [StaffFixedSealSearchExhaustedResponseSchema, "SEARCH_EXHAUSTED"],
    ] as const) {
      const response = schema.parse({ error: { code, message: "Solver outcome", requestId: "req-1", details: {} } });
      assert.equal(response.error.requestId, "req-1");
      assert.equal(schema.safeParse({ error: { code, message: "Solver outcome", requestId: "req-1", details: { rawCount: 1 } } }).success, false);
    }
    assert.equal(StaffFixedSealValidationResponseSchema.safeParse({
      error: { code: "SEARCH_EXHAUSTED", message: "No feasibility conclusion", requestId: "req-1", details: {} },
    }).success, true);
    assert.equal(StaffFixedSealSearchExhaustedResponseSchema.safeParse({
      error: { code: "INSUFFICIENT_ELIGIBLE_INVENTORY", message: "Invalid solver code", requestId: "req-1", details: {} },
    }).success, false);
    assert.equal(StaffResponseHeadersSchema.safeParse({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
      "X-Request-Id": "req-1",
    }).success, true);

    assert.equal(staffRouteRegistry.staffFixedForms.method, "GET");
    assert.equal(staffRouteRegistry.staffFixedForms.path, "/api/v1/fixed-forms");
    assert.equal("body" in staffRouteRegistry.staffFixedForms, false);
    assert.equal("headers" in staffRouteRegistry.staffFixedForms, false);
    assert.equal(staffRouteRegistry.staffFixedForm.method, "GET");
    assert.equal(staffRouteRegistry.staffFixedForm.path, "/api/v1/fixed-forms/{formId}");
    assert.equal(staffRouteRegistry.staffFixedForm.params, StaffFixedFormPathParamsSchema);
    assert.equal(StaffFixedFormPathParamsSchema.safeParse({ formId: FORM_A }).success, true);
    assert.equal(StaffFixedFormPathParamsSchema.safeParse({ formId: "not-a-uuid" }).success, false);
    assert.equal("body" in staffRouteRegistry.staffFixedForm, false);
    assert.equal("headers" in staffRouteRegistry.staffFixedForm, false);

    assert.deepEqual(StaffOperationPaths.staffCreateFixedSeal, { method: "POST", path: "/api/v1/assemblies" });
    assert.deepEqual(StaffOperationPaths.staffFixedForms, { method: "GET", path: "/api/v1/fixed-forms" });
    assert.deepEqual(StaffOperationPaths.staffFixedForm, { method: "GET", path: "/api/v1/fixed-forms/{formId}" });
    const staffPaths = Object.keys(generateStaffContractsOpenApi().paths as Record<string, unknown>);
    assert.ok(staffPaths.includes("/api/v1/assemblies"));
    assert.ok(staffPaths.includes("/api/v1/fixed-forms"));
    assert.ok(staffPaths.includes("/api/v1/fixed-forms/{formId}"));
    const studentDocument = JSON.stringify(generateStudentContractsOpenApi());
    assert.equal(studentDocument.includes("staff-fixed-seal-receipt/1"), false);
    assert.equal(studentDocument.includes("/api/v1/fixed-forms"), false);
  });
});
