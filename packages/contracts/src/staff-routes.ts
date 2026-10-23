import { z } from "zod";

import type { RouteDefinitionValue } from "./routes.ts";
import { StaffReviewContextSchema, StaffReviewEvidenceSchema } from "./staff.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const StaffReviewContextPathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
  .strict();

export const StaffReviewEvidencePathParamsSchema = z
  .object({ versionId: z.string().regex(UUID_PATTERN, "Expected a lowercase UUID") })
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

const json = (schema: z.ZodType, description: string) => ({
  contentType: "application/json" as const,
  schema,
  description,
  headers: StaffResponseHeadersSchema,
});

/** Private local staff registry; it is intentionally separate from the student and released registries. */
export const staffRouteRegistry = {
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
} as const satisfies Readonly<Record<string, RouteDefinitionValue>>;

type SchemaInput<S> = S extends z.ZodType ? z.input<S> : undefined;
type ResponseOutput<R> = R extends { readonly schema: infer S extends z.ZodType } ? z.output<S> : never;
type ResponseHeadersInput<R> = R extends { readonly headers?: infer H }
  ? H extends z.ZodType ? z.input<H> : undefined
  : undefined;

export type StaffOperationMap = {
  readonly [Name in keyof typeof staffRouteRegistry]: {
    readonly method: (typeof staffRouteRegistry)[Name]["method"];
    readonly path: (typeof staffRouteRegistry)[Name]["path"];
    readonly params: SchemaInput<(typeof staffRouteRegistry)[Name] extends { readonly params: infer S } ? S : undefined>;
    readonly query: undefined;
    readonly headers: undefined;
    readonly body: undefined;
    readonly responses: {
      readonly [Status in keyof (typeof staffRouteRegistry)[Name]["responses"]]: ResponseOutput<(typeof staffRouteRegistry)[Name]["responses"][Status]>;
    };
    readonly responseHeaders: {
      readonly [Status in keyof (typeof staffRouteRegistry)[Name]["responses"]]: ResponseHeadersInput<(typeof staffRouteRegistry)[Name]["responses"][Status]>;
    };
  };
};
