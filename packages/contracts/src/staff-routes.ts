import { z } from "zod";

import type { RouteDefinitionValue } from "./routes.ts";
import {
  StaffReviewContextSchema,
  StaffReviewEvidenceSchema,
  StaffReviewHistorySchema,
  StaffFixedAssemblyRunListSchema,
  StaffFixedAssemblyDiagnosticSchema,
  StaffFixedRehearsalBlueprintListSchema,
  StaffFixedRehearsalRequestSchema,
  StaffFixedRehearsalReceiptSchema,
  StaffFixedRehearsalListSchema,
  StaffFixedRehearsalDiagnosticSchema,
  StaffDatasetPreflightRequestSchema,
  StaffDatasetPreflightSchema,
  StaffQuarantineRequestSchema,
  StaffQuarantineResponseSchema,
  StaffRejectReviewRequestSchema,
  StaffRejectReviewResponseSchema,
  StaffSubmitReviewRequestSchema,
  StaffSubmitReviewResponseSchema,
} from "./staff.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const StaffReviewContextPathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffReviewEvidencePathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffSubmitReviewPathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffRejectReviewPathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffQuarantinePathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffReviewHistoryPathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffFixedAssemblyDiagnosticPathParamsSchema = z
  .object({ assemblyRunId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffFixedRehearsalDiagnosticPathParamsSchema = z
  .object({ rehearsalId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

const IdempotencyKeySchema = z.string().regex(/^[\x21-\x7e]{1,128}$/, "Expected 1–128 visible ASCII characters");
const CsrfTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Expected the current CSRF token");

export const StaffDatasetPreflightRequestHeadersSchema = z
  .object({ "x-csrf-token": CsrfTokenSchema })
  .strict();

export const StaffSubmitReviewRequestHeadersSchema = z
  .object({
    "x-csrf-token": CsrfTokenSchema,
    "idempotency-key": IdempotencyKeySchema,
  })
  .strict();

export const StaffResponseHeadersSchema = z
  .object({
    "Cache-Control": z.literal("no-store"),
    "X-Content-Type-Options": z.literal("nosniff"),
    Vary: z.literal("Origin"),
    "X-Request-Id": z.string().min(1).max(256),
  })
  .strict();

const emptyDetails = z.object({}).strict();
const staffErrorResponse = <Code extends string>(code: Code) =>
  z
    .object({
      error: z
        .object({
          code: z.literal(code),
          message: z.string().trim().min(1).max(1_024),
          requestId: z.string().min(1).max(256),
          details: emptyDetails,
        })
        .strict(),
    })
    .strict();

export const StaffUnauthenticatedResponseSchema = staffErrorResponse("UNAUTHENTICATED");
export const StaffForbiddenResponseSchema = staffErrorResponse("FORBIDDEN");
export const StaffNotFoundResponseSchema = staffErrorResponse("NOT_FOUND");
export const StaffValidationErrorResponseSchema = staffErrorResponse("VALIDATION_ERROR");
export const StaffTemporarilyUnavailableResponseSchema = staffErrorResponse("TEMPORARILY_UNAVAILABLE");

const staffSubmitReviewErrorResponse = <Code extends string, Message extends string>(code: Code, message: Message) =>
  z
    .object({
      error: z
        .object({
          code: z.literal(code),
          message: z.literal(message),
          requestId: z.string().min(1).max(256),
          details: emptyDetails,
        })
        .strict(),
    })
    .strict();

export const StaffSubmitReviewMalformedJsonResponseSchema = staffSubmitReviewErrorResponse(
  "MALFORMED_JSON",
  "Request body is not valid JSON",
);
export const StaffSubmitReviewUnauthenticatedResponseSchema = staffSubmitReviewErrorResponse(
  "UNAUTHENTICATED",
  "Authentication is required",
);
export const StaffSubmitReviewForbiddenResponseSchema = staffSubmitReviewErrorResponse(
  "FORBIDDEN",
  "Access is not permitted",
);
export const StaffSubmitReviewCsrfFailedResponseSchema = staffSubmitReviewErrorResponse(
  "CSRF_FAILED",
  "Request validation failed",
);
export const StaffSubmitReviewNotFoundResponseSchema = staffSubmitReviewErrorResponse(
  "NOT_FOUND",
  "Resource not found",
);
export const StaffSubmitReviewIdempotencyConflictResponseSchema = staffSubmitReviewErrorResponse(
  "IDEMPOTENCY_CONFLICT",
  "The idempotency key was already used for a different request",
);
export const StaffSubmitReviewRevisionConflictResponseSchema = staffSubmitReviewErrorResponse(
  "REVISION_CONFLICT",
  "The resource has changed",
);
export const StaffSubmitReviewConcurrentModificationResponseSchema = staffSubmitReviewErrorResponse(
  "CONCURRENT_MODIFICATION",
  "The resource changed while processing the request",
);
export const StaffSubmitReviewPayloadTooLargeResponseSchema = staffSubmitReviewErrorResponse(
  "PAYLOAD_TOO_LARGE",
  "Request body is too large",
);
export const StaffSubmitReviewValidationErrorResponseSchema = staffSubmitReviewErrorResponse(
  "VALIDATION_ERROR",
  "Request is invalid",
);
export const StaffSubmitReviewRightsBlockedResponseSchema = staffSubmitReviewErrorResponse(
  "RIGHTS_BLOCKED",
  "The rights record does not permit this operation",
);
export const StaffSubmitReviewConstraintConflictResponseSchema = staffSubmitReviewErrorResponse(
  "CONSTRAINT_CONFLICT",
  "The request conflicts with a bank constraint",
);
export const StaffSubmitReviewTemporarilyUnavailableResponseSchema = staffSubmitReviewErrorResponse(
  "TEMPORARILY_UNAVAILABLE",
  "The request could not be completed",
);

export const StaffSubmitReviewCsrfOrForbiddenResponseSchema = z.union([
  StaffSubmitReviewCsrfFailedResponseSchema,
  StaffSubmitReviewForbiddenResponseSchema,
]);
export const StaffSubmitReviewConflictResponseSchema = z.union([
  StaffSubmitReviewIdempotencyConflictResponseSchema,
  StaffSubmitReviewRevisionConflictResponseSchema,
  StaffSubmitReviewConcurrentModificationResponseSchema,
]);
export const StaffSubmitReviewValidationResponseSchema = z.union([
  StaffSubmitReviewValidationErrorResponseSchema,
  StaffSubmitReviewRightsBlockedResponseSchema,
  StaffSubmitReviewConstraintConflictResponseSchema,
]);

const json = (schema: z.ZodType, description: string) => ({
  contentType: "application/json" as const,
  schema,
  description,
  headers: StaffResponseHeadersSchema,
});

/** Private local staff registry; it is intentionally separate from the student and released registries. */
export const staffRouteRegistry = {
  staffFixedAssemblyRuns: {
    method: "GET",
    path: "/api/v1/assembly-runs",
    summary: "List captured fixed-reference assembly runs",
    description: "Requires a current BANK_MANAGER principal with the existing bank.diagnostics.read permission. Accepts no query, request body, or request headers and returns at most twenty captured fixed-reference runs; personal and unsupported runs are outside this scope.",
    responses: {
      200: json(StaffFixedAssemblyRunListSchema, "Newest-first bounded metadata for captured fixed-reference runs"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks the BANK_MANAGER fixed-reference diagnostic basis"),
      404: json(StaffNotFoundResponseSchema, "No supported stored fixed-reference projection is visible"),
      422: json(StaffValidationErrorResponseSchema, "Unexpected query or request body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Stored fixed-reference run metadata is unavailable"),
    },
  },
  staffFixedAssemblyDiagnostic: {
    method: "GET",
    path: "/api/v1/assembly-runs/{assemblyRunId}/diagnostics",
    summary: "Read replay-verified fixed-reference aggregate diagnostics",
    description: "Requires a current BANK_MANAGER principal with the existing bank.diagnostics.read permission. Accepts no query, request body, or request headers. The strict response contains replay-verified captured aggregates only; it does not establish current feasibility, eligibility, qualified review, rights, or publication.",
    params: StaffFixedAssemblyDiagnosticPathParamsSchema,
    responses: {
      200: json(StaffFixedAssemblyDiagnosticSchema, "Replay-verified aggregate diagnostics for one captured fixed-reference run"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks the BANK_MANAGER fixed-reference diagnostic basis"),
      404: json(StaffNotFoundResponseSchema, "Run is missing, malformed, personal, or outside the fixed-reference scope"),
      422: json(StaffValidationErrorResponseSchema, "Malformed path or unexpected query/body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Stored fixed-reference diagnostics or replay verification is unavailable"),
    },
  },
  staffFixedRehearsalBlueprints: {
    method: "GET",
    path: "/api/v1/fixed-rehearsal-blueprints",
    summary: "List supported blueprints for an eligible-Bank stock rehearsal",
    description: "Requires a current EXAM_MANAGER principal with the existing exam.assembly.write permission. Returns only bounded pins and summaries for supported independent-practice one-domain blueprints; it reveals no Bank candidate or source data and does not establish that any blueprint is currently feasible.",
    responses: {
      200: json(StaffFixedRehearsalBlueprintListSchema, "Latest bounded supported one-domain blueprint summaries"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks EXAM_MANAGER or exam.assembly.write permission"),
      404: json(StaffNotFoundResponseSchema, "No supported blueprint projection is visible"),
      422: json(StaffValidationErrorResponseSchema, "Unexpected query or request body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Supported blueprint metadata is unavailable"),
    },
  },
  staffCreateFixedRehearsal: {
    method: "POST",
    path: "/api/v1/fixed-rehearsals",
    summary: "Capture a fixed eligible-Bank stock rehearsal",
    description: "Requires a current EXAM_MANAGER principal with the existing exam.assembly.write permission, the trusted same-origin session, a CSRF token, and an idempotency key. The strict JSON request pins one exact supported blueprint and capture window; omitted seed uses the trusted server default. The body is limited to 1 MiB. A successful receipt is historical and creates no form, attempt, assignment, score, or publication.",
    headers: StaffSubmitReviewRequestHeadersSchema,
    body: StaffFixedRehearsalRequestSchema,
    responses: {
      201: json(StaffFixedRehearsalReceiptSchema, "Historical receipt for the exact stored stock rehearsal"),
      400: json(StaffSubmitReviewMalformedJsonResponseSchema, "Request body is not valid JSON"),
      401: json(StaffSubmitReviewUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffSubmitReviewCsrfOrForbiddenResponseSchema, "CSRF validation failed or current principal lacks EXAM_MANAGER or exam.assembly.write permission"),
      404: json(StaffSubmitReviewNotFoundResponseSchema, "Pinned blueprint version is missing or not visible"),
      409: json(StaffSubmitReviewConflictResponseSchema, "Blueprint pin, idempotency key, or concurrent stock snapshot conflicts"),
      413: json(StaffSubmitReviewPayloadTooLargeResponseSchema, "Request body exceeds the 1 MiB limit"),
      422: json(StaffSubmitReviewValidationResponseSchema, "Request uses an invalid or unsupported blueprint, pin, window, or seed"),
      503: json(StaffSubmitReviewTemporarilyUnavailableResponseSchema, "Stock capture or receipt state is unavailable or uncertain"),
    },
  },
  staffFixedRehearsals: {
    method: "GET",
    path: "/api/v1/fixed-rehearsals",
    summary: "List captured eligible-Bank stock rehearsals",
    description: "Requires a current BANK_MANAGER principal with the existing bank.diagnostics.read permission. Accepts no query, request body, or request headers; this is bounded historical metadata and does not revalidate current eligibility.",
    responses: {
      200: json(StaffFixedRehearsalListSchema, "Newest-first metadata for the latest captured eligible-Bank rehearsals"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks BANK_MANAGER rehearsal-read permission"),
      404: json(StaffNotFoundResponseSchema, "No supported rehearsal projection is visible"),
      422: json(StaffValidationErrorResponseSchema, "Unexpected query or request body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Stored rehearsal metadata is unavailable"),
    },
  },
  staffFixedRehearsalDiagnostic: {
    method: "GET",
    path: "/api/v1/fixed-rehearsals/{rehearsalId}",
    summary: "Read replay-verified eligible-Bank rehearsal aggregates",
    description: "Requires a current BANK_MANAGER principal with the existing bank.diagnostics.read permission. Accepts no query, request body, or request headers. The immutable diagnostic records eligibility at capture only; current eligibility, human qualification, rights acceptance, and publication are not asserted.",
    params: StaffFixedRehearsalDiagnosticPathParamsSchema,
    responses: {
      200: json(StaffFixedRehearsalDiagnosticSchema, "Replay-verified bounded aggregates for one exact captured rehearsal"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks BANK_MANAGER rehearsal-read permission"),
      404: json(StaffNotFoundResponseSchema, "Rehearsal is missing or outside the current manager scope"),
      422: json(StaffValidationErrorResponseSchema, "Malformed path or unexpected query/body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Stored rehearsal diagnostic or replay verification is unavailable"),
    },
  },
  staffReviewContext: {
    method: "GET",
    path: "/api/v1/question-versions/{versionId}/review-context",
    summary: "Read a bounded private staff review context",
    params: StaffReviewContextPathParamsSchema,
    responses: {
      200: json(StaffReviewContextSchema, "Private review context for an exact question version"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks a permitted staff basis"),
      404: json(StaffNotFoundResponseSchema, "Version is not visible to this staff principal"),
      422: json(StaffValidationErrorResponseSchema, "Malformed path or unexpected query/body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Stored projection or dependency closure is unavailable"),
    },
  },
  staffReviewEvidence: {
    method: "GET",
    path: "/api/v1/question-versions/{versionId}/review-evidence",
    summary: "Read current recorded rights evidence for an exact question version",
    params: StaffReviewEvidencePathParamsSchema,
    responses: {
      200: json(StaffReviewEvidenceSchema, "Current recorded evidence text for the exact version's source closure"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks a permitted evidence-read basis"),
      404: json(StaffNotFoundResponseSchema, "Version is missing, malformed, or outside the current staff scope"),
      422: json(StaffValidationErrorResponseSchema, "Unexpected query or request body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Stored evidence projection or dependency closure is unavailable"),
    },
  },
  staffReviewHistory: {
    method: "GET",
    path: "/api/v1/question-versions/{versionId}/review-history",
    summary: "Read bounded recorded review history",
    description: "Requires a current BANK_MANAGER principal with the existing bank.diagnostics.read permission. This operation accepts no query, request body, or request headers. The response is a bounded historical projection; it does not attest current eligibility, rights, or reviewer qualification.",
    params: StaffReviewHistoryPathParamsSchema,
    responses: {
      200: json(StaffReviewHistorySchema, "Bounded recorded review history for one exact question version"),
      401: json(StaffUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffForbiddenResponseSchema, "Current principal lacks the BANK_MANAGER history-read basis"),
      404: json(StaffNotFoundResponseSchema, "Version is missing or malformed"),
      422: json(StaffValidationErrorResponseSchema, "Unexpected query or request body"),
      503: json(StaffTemporarilyUnavailableResponseSchema, "Stored history projection is unavailable"),
    },
  },
  staffDatasetPreflight: {
    method: "POST",
    path: "/api/v1/datasets/preflight",
    summary: "Run an explicit canonical dataset preflight",
    description: "Requires a current BANK_MANAGER principal with the existing bank.diagnostics.read permission and a valid CSRF token. This read-only report validates only the explicitly pinned canonical graphs; it does not establish accepted inventory, rights, qualified human review, assembly feasibility, or publication eligibility. The strict JSON body is limited to 1 MiB and requires no idempotency key.",
    headers: StaffDatasetPreflightRequestHeadersSchema,
    body: StaffDatasetPreflightRequestSchema,
    responses: {
      200: json(StaffDatasetPreflightSchema, "Canonical graph observations for the exact requested version pins"),
      400: json(StaffSubmitReviewMalformedJsonResponseSchema, "Request body is not valid JSON"),
      401: json(StaffSubmitReviewUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffSubmitReviewCsrfOrForbiddenResponseSchema, "CSRF validation failed or current principal lacks manager permission"),
      404: json(StaffSubmitReviewNotFoundResponseSchema, "A pinned version is missing or not visible"),
      409: json(StaffSubmitReviewConflictResponseSchema, "A pinned content hash or canonical reference changed"),
      413: json(StaffSubmitReviewPayloadTooLargeResponseSchema, "Request body exceeds the 1 MiB limit"),
      422: json(StaffSubmitReviewValidationErrorResponseSchema, "Request or canonical graph is invalid"),
      503: json(StaffSubmitReviewTemporarilyUnavailableResponseSchema, "The canonical preflight cannot currently complete"),
    },
  },
  staffSubmitReview: {
    method: "POST",
    path: "/api/v1/question-versions/{versionId}/submit-review",
    summary: "Submit an author-owned draft to the review queue",
    description: "Requires the trusted same-origin staff session, current CSRF cookie/token, and an idempotency key. Origin/session/CSRF validation runs before JSON parsing; command role, authorship, revision, and validation checks run after parsing. The strict JSON body is limited to 1 MiB. A successful response is an operation receipt and does not attest review, rights, or publication.",
    params: StaffSubmitReviewPathParamsSchema,
    headers: StaffSubmitReviewRequestHeadersSchema,
    body: StaffSubmitReviewRequestSchema,
    responses: {
      200: json(StaffSubmitReviewResponseSchema, "Receipt confirming the exact version was submitted to IN_REVIEW"),
      400: json(StaffSubmitReviewMalformedJsonResponseSchema, "Request body is not valid JSON"),
      401: json(StaffSubmitReviewUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffSubmitReviewCsrfOrForbiddenResponseSchema, "CSRF validation failed or current principal lacks author permission"),
      404: json(StaffSubmitReviewNotFoundResponseSchema, "Version is missing or malformed"),
      409: json(StaffSubmitReviewConflictResponseSchema, "Idempotency key, workflow revision, or concurrent state conflicts"),
      413: json(StaffSubmitReviewPayloadTooLargeResponseSchema, "Request body exceeds the 1 MiB limit"),
      422: json(StaffSubmitReviewValidationResponseSchema, "Request, current rights, or Bank constraints reject the handoff"),
      503: json(StaffSubmitReviewTemporarilyUnavailableResponseSchema, "The Bank command cannot currently complete"),
    },
  },
  staffRejectReview: {
    method: "POST",
    path: "/api/v1/question-versions/{versionId}/reviews",
    summary: "Record a staff review rejection",
    description: "Requires the trusted same-origin staff session, current CSRF cookie/token, and an idempotency key. Origin/session/CSRF validation runs before JSON parsing; command role, independence, revision, hash, and validation checks run after parsing. The strict JSON body is limited to 1 MiB. A successful response is an operation receipt and does not attest qualified human review, rights, or publication.",
    params: StaffRejectReviewPathParamsSchema,
    headers: StaffSubmitReviewRequestHeadersSchema,
    body: StaffRejectReviewRequestSchema,
    responses: {
      201: json(StaffRejectReviewResponseSchema, "Receipt confirming the review command recorded REJECTED"),
      400: json(StaffSubmitReviewMalformedJsonResponseSchema, "Request body is not valid JSON"),
      401: json(StaffSubmitReviewUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffSubmitReviewCsrfOrForbiddenResponseSchema, "CSRF validation failed or current principal lacks permission"),
      404: json(StaffSubmitReviewNotFoundResponseSchema, "Version is missing or malformed"),
      409: json(StaffSubmitReviewConflictResponseSchema, "Idempotency key, workflow revision, or concurrent state conflicts"),
      413: json(StaffSubmitReviewPayloadTooLargeResponseSchema, "Request body exceeds the 1 MiB limit"),
      422: json(StaffSubmitReviewValidationResponseSchema, "Request or Bank constraints reject the command"),
      503: json(StaffSubmitReviewTemporarilyUnavailableResponseSchema, "The Bank command cannot currently complete"),
    },
  },
  staffQuarantine: {
    method: "POST",
    path: "/api/v1/question-versions/{versionId}/quarantine",
    summary: "Quarantine a question version",
    description: "Requires the trusted same-origin staff session, current CSRF cookie/token, and an idempotency key. Origin/session/CSRF validation runs before JSON parsing; command role, revision, and validation checks run after parsing. The strict JSON body is limited to 1 MiB. A successful response is an operation receipt and does not report delivery-hold drain completion.",
    params: StaffQuarantinePathParamsSchema,
    headers: StaffSubmitReviewRequestHeadersSchema,
    body: StaffQuarantineRequestSchema,
    responses: {
      200: json(StaffQuarantineResponseSchema, "Receipt confirming the quarantine command recorded QUARANTINED"),
      400: json(StaffSubmitReviewMalformedJsonResponseSchema, "Request body is not valid JSON"),
      401: json(StaffSubmitReviewUnauthenticatedResponseSchema, "No authenticated session"),
      403: json(StaffSubmitReviewCsrfOrForbiddenResponseSchema, "CSRF validation failed or current principal lacks permission"),
      404: json(StaffSubmitReviewNotFoundResponseSchema, "Version is missing or malformed"),
      409: json(StaffSubmitReviewConflictResponseSchema, "Idempotency key, workflow revision, or concurrent state conflicts"),
      413: json(StaffSubmitReviewPayloadTooLargeResponseSchema, "Request body exceeds the 1 MiB limit"),
      422: json(StaffSubmitReviewValidationResponseSchema, "Request or Bank constraints reject the command"),
      503: json(StaffSubmitReviewTemporarilyUnavailableResponseSchema, "The Bank command cannot currently complete"),
    },
  },
} as const satisfies Readonly<Record<string, RouteDefinitionValue & { readonly description?: string }>>;

type SchemaInput<S> = S extends z.ZodType ? z.input<S> : undefined;
type ResponseOutput<R> = R extends { readonly schema: infer S extends z.ZodType } ? z.output<S> : never;
type ResponseHeadersInput<R> = R extends { readonly headers?: infer H }
  ? H extends z.ZodType ? z.input<H> : undefined
  : undefined;
type RequestHeadersInput<R> = R extends { readonly headers: infer H } ? SchemaInput<H> : undefined;
type RequestBodyInput<R> = R extends { readonly body: infer B } ? SchemaInput<B> : undefined;

export type StaffOperationMap = {
  readonly [Name in keyof typeof staffRouteRegistry]: {
    readonly method: (typeof staffRouteRegistry)[Name]["method"];
    readonly path: (typeof staffRouteRegistry)[Name]["path"];
    readonly params: SchemaInput<(typeof staffRouteRegistry)[Name] extends { readonly params: infer S } ? S : undefined>;
    readonly query: undefined;
    readonly headers: RequestHeadersInput<(typeof staffRouteRegistry)[Name]>;
    readonly body: RequestBodyInput<(typeof staffRouteRegistry)[Name]>;
    readonly responses: {
      readonly [Status in keyof (typeof staffRouteRegistry)[Name]["responses"]]: ResponseOutput<(typeof staffRouteRegistry)[Name]["responses"][Status]>;
    };
    readonly responseHeaders: {
      readonly [Status in keyof (typeof staffRouteRegistry)[Name]["responses"]]: ResponseHeadersInput<(typeof staffRouteRegistry)[Name]["responses"][Status]>;
    };
  };
};
