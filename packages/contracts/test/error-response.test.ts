import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AuthenticationErrorResponseSchema,
  AuthorizationErrorResponseSchema,
  ConcurrentAttemptExistsResponseSchema,
  DocumentedErrorResponseSchema,
  ErrorHttpStatusByCode,
  ErrorResponseSchema,
  SearchExhaustedErrorResponseSchema,
  serializeErrorResponse,
  StudentShortageSchema,
  ValidationErrorResponseSchema,
} from "../src/index.ts";

const ids = {
  attempt: "11111111-1111-4111-8111-111111111111",
  blueprint: "22222222-2222-4222-8222-222222222222",
  shorterBlueprint: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444",
};

function shortage(code: "INSUFFICIENT_UNSEEN_INVENTORY" | "INSUFFICIENT_ELIGIBLE_INVENTORY") {
  return {
    error: {
      code,
      message: "Not enough eligible questions for this practice test",
      requestId: "request-shortage-1",
      details: {
        blueprintVersionId: ids.blueprint,
        reuseMode: code === "INSUFFICIENT_UNSEEN_INVENTORY" ? "NEW_ONLY" : "REVIEW_ALLOWED",
        sectionDeficits: [{ sectionId: "math-section", missingCount: 1 }],
        alternatives: [
          { kind: "SHORTER_PROFILE", blueprintVersionId: ids.shorterBlueprint, name: "Short practice" },
          { kind: "WAIT_FOR_PUBLICATION" },
        ],
      },
    },
  };
}

describe("documented API error responses", () => {
  it("accepts a valid generic documented error response with required message and requestId", () => {
    const response = {
      error: { code: "RATE_LIMITED", message: "Please retry later", requestId: "request-rate-1", details: { retryAfterSeconds: 2 } },
    };
    assert.equal(ErrorResponseSchema.safeParse(response).success, true);
    assert.equal(DocumentedErrorResponseSchema.safeParse(response).success, true);
    assert.equal(ErrorHttpStatusByCode.RATE_LIMITED, 429);
    assert.equal(ErrorResponseSchema.safeParse({ error: { ...response.error, message: "" } }).success, false);
    assert.equal(ErrorResponseSchema.safeParse({ error: { ...response.error, requestId: "" } }).success, false);
  });

  it("accepts both proved inventory shortage codes and keeps them structurally compatible with ErrorResponse", () => {
    for (const code of ["INSUFFICIENT_UNSEEN_INVENTORY", "INSUFFICIENT_ELIGIBLE_INVENTORY"] as const) {
      const response = shortage(code);
      assert.equal(StudentShortageSchema.safeParse(response).success, true);
      assert.equal(ErrorResponseSchema.safeParse(response).success, true);
      assert.equal(DocumentedErrorResponseSchema.safeParse(response).success, true);
      assert.equal(ErrorHttpStatusByCode[code], 422);
    }
  });

  it("rejects shortage details that omit required fields or include invalid alternatives", () => {
    const missingDeficits = shortage("INSUFFICIENT_UNSEEN_INVENTORY");
    delete (missingDeficits.error.details as Partial<typeof missingDeficits.error.details>).sectionDeficits;
    assert.equal(StudentShortageSchema.safeParse(missingDeficits).success, false);

    const invalidDeficit = shortage("INSUFFICIENT_ELIGIBLE_INVENTORY");
    invalidDeficit.error.details.sectionDeficits[0]!.missingCount = 0;
    assert.equal(StudentShortageSchema.safeParse(invalidDeficit).success, false);

    const invalidAlternative = shortage("INSUFFICIENT_ELIGIBLE_INVENTORY");
    assert.equal(
      StudentShortageSchema.safeParse({
        ...invalidAlternative,
        error: {
          ...invalidAlternative.error,
          details: {
            ...invalidAlternative.error.details,
            alternatives: [{ kind: "REVIEW_MODE", blueprintVersionId: ids.blueprint, requiresRepeatConsent: false }],
          },
        },
      }).success,
      false,
    );
  });

  it("permits a proved coupled shortage with an empty section-deficit list", () => {
    const response = shortage("INSUFFICIENT_ELIGIBLE_INVENTORY");
    response.error.details.sectionDeficits = [];
    assert.equal(StudentShortageSchema.safeParse(response).success, true);
  });

  it("keeps SEARCH_EXHAUSTED distinct from a proved inventory shortage", () => {
    const exhausted = {
      error: {
        code: "SEARCH_EXHAUSTED",
        message: "The bounded search could not determine feasibility",
        requestId: "request-search-1",
        details: { assemblyRunId: ids.run, blueprintVersionId: ids.blueprint, reuseMode: "NEW_ONLY" },
      },
    };
    assert.equal(SearchExhaustedErrorResponseSchema.safeParse(exhausted).success, true);
    assert.equal(StudentShortageSchema.safeParse(exhausted).success, false);
    assert.equal(ErrorHttpStatusByCode.SEARCH_EXHAUSTED, 503);
    assert.equal(
      SearchExhaustedErrorResponseSchema.safeParse({
        ...exhausted,
        error: { ...exhausted.error, details: { ...exhausted.error.details, sectionDeficits: [] } },
      }).success,
      false,
    );
  });

  it("validates authentication, authorization, validation, and active-attempt conflict payloads", () => {
    assert.equal(
      AuthenticationErrorResponseSchema.safeParse({
        error: { code: "UNAUTHENTICATED", message: "Sign in is required", requestId: "request-auth-1", details: {} },
      }).success,
      true,
    );
    assert.equal(
      AuthorizationErrorResponseSchema.safeParse({
        error: { code: "FORBIDDEN", message: "Insufficient role", requestId: "request-authz-1", details: {} },
      }).success,
      true,
    );
    assert.equal(
      ValidationErrorResponseSchema.safeParse({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", requestId: "request-validation-1", details: { field: "reuseMode" } },
      }).success,
      true,
    );
    const conflict = {
      error: {
        code: "CONCURRENT_ATTEMPT_EXISTS",
        message: "An active attempt already exists",
        requestId: "request-conflict-1",
        details: { existingAttemptId: ids.attempt },
      },
    };
    assert.equal(ConcurrentAttemptExistsResponseSchema.safeParse(conflict).success, true);
    assert.equal(DocumentedErrorResponseSchema.safeParse(conflict).success, true);
    assert.equal(ErrorHttpStatusByCode.CONCURRENT_ATTEMPT_EXISTS, 409);
  });

  it("rejects malformed payloads, unknown fields, and invalid active-attempt details", () => {
    const conflict = {
      error: {
        code: "CONCURRENT_ATTEMPT_EXISTS",
        message: "An active attempt already exists",
        requestId: "request-conflict-1",
        details: { existingAttemptId: ids.attempt },
      },
    };
    assert.equal(DocumentedErrorResponseSchema.safeParse({ ...conflict, extra: true }).success, false);
    assert.equal(DocumentedErrorResponseSchema.safeParse({ error: { ...conflict.error, internalError: "database failure" } }).success, false);
    assert.equal(
      ConcurrentAttemptExistsResponseSchema.safeParse({
        ...conflict,
        error: { ...conflict.error, details: { existingAttemptId: ids.attempt, otherStudentAttemptId: ids.run } },
      }).success,
      false,
    );
    assert.equal(DocumentedErrorResponseSchema.safeParse({ error: { ...conflict.error, code: "DATABASE_ERROR" } }).success, false);
  });

  it("serializes only validated, allowlisted error fields", () => {
    const safe = serializeErrorResponse(shortage("INSUFFICIENT_UNSEEN_INVENTORY"));
    assert.equal(safe.includes("answerKey"), false);
    assert.equal(safe.includes("privateExplanation"), false);
    assert.equal(safe.includes("database"), false);
    assert.throws(() =>
      serializeErrorResponse({
        ...shortage("INSUFFICIENT_UNSEEN_INVENTORY"),
        error: { ...shortage("INSUFFICIENT_UNSEEN_INVENTORY").error, details: { secret: "raw database error" } },
      }),
    );
  });
});
