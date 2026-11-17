import { z } from "zod";

import {
  AnswerAckSchema,
  AnswerSubmissionRequestSchema,
  AttemptHistoryPageSchema,
  AttemptViewSchema,
  AuthenticationErrorResponseSchema,
  AuthorizationErrorResponseSchema,
  ClosureSchema,
  ConcurrentAttemptExistsResponseSchema,
  CreationReceiptSchema,
  SearchExhaustedErrorResponseSchema,
  StudentShortageSchema,
  StudentSlotSchema,
  ValidationErrorResponseSchema,
  ErrorDetailsSchema,
} from "./index.ts";
import { AuthorizedReleasedReviewSchema } from "./index.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = z.string().regex(UUID_PATTERN, "Expected a lowercase UUID");
const OffsetDateTime = z.iso.datetime({ offset: true });
const NonEmpty = z.string().trim().min(1);
const EmptyDetails = z.object({}).strict();

export const CatalogEntrySchema = z.discriminatedUnion("mode", [
  z.object({
    name: NonEmpty,
    domain: z.enum(["MATH", "READING", "SCIENCE"]),
    questionCount: z.number().int().positive(),
    durationSeconds: z.number().int().positive(),
    profileKind: z.enum(["INDEPENDENT_PRACTICE", "PUBLIC_REFERENCE"]),
    availableFrom: OffsetDateTime,
    availableUntil: OffsetDateTime,
    mode: z.literal("PERSONALIZED_PRACTICE"),
    blueprintVersionId: UUID,
    reviewAllowed: z.boolean(),
  }).strict(),
  z.object({
    name: NonEmpty,
    domain: z.enum(["MATH", "READING", "SCIENCE"]),
    questionCount: z.number().int().positive(),
    durationSeconds: z.number().int().positive(),
    profileKind: z.enum(["INDEPENDENT_PRACTICE", "PUBLIC_REFERENCE"]),
    availableFrom: OffsetDateTime,
    availableUntil: OffsetDateTime,
    mode: z.literal("PUBLISHED_FIXED"),
    formId: UUID,
    repeatsAllowed: z.literal(true),
  }).strict(),
]).superRefine((entry, context) => {
  if (Date.parse(entry.availableUntil) <= Date.parse(entry.availableFrom)) {
    context.addIssue({ code: "custom", path: ["availableUntil"], message: "Availability must be a non-empty finite interval" });
  }
});

export const CatalogPageSchema = z.object({
  items: z.array(CatalogEntrySchema),
  nextCursor: z.string().min(1).max(1_024).nullable(),
}).strict();

const PersonalizedNewAttemptSchema = z.object({
  mode: z.literal("PERSONALIZED_PRACTICE").optional(),
  blueprintVersionId: UUID,
  reuseMode: z.literal("NEW_ONLY").optional(),
}).strict();

const PersonalizedReviewAttemptSchema = z.object({
  mode: z.literal("PERSONALIZED_PRACTICE"),
  blueprintVersionId: UUID,
  reuseMode: z.literal("REVIEW_ALLOWED"),
  acknowledgeRepeats: z.literal(true),
}).strict();

const FixedAttemptSchema = z.object({
  mode: z.literal("PUBLISHED_FIXED"),
  formId: UUID,
  reuseMode: z.literal("FIXED_AS_PUBLISHED"),
  acknowledgeRepeats: z.literal(true),
}).strict();

/** Omission remains omission on the wire and means PERSONALIZED_PRACTICE + NEW_ONLY. */
export const CreateAttemptSchema = z.union([
  PersonalizedNewAttemptSchema,
  PersonalizedReviewAttemptSchema,
  FixedAttemptSchema,
]);

export const EmptyCommandBodySchema = z.object({}).strict();
export const StartReceiptSchema = z.object({
  attemptId: UUID,
  startedAt: OffsetDateTime,
  deadlineAt: OffsetDateTime,
}).strict().superRefine((receipt, context) => {
  if (Date.parse(receipt.deadlineAt) <= Date.parse(receipt.startedAt)) {
    context.addIssue({ code: "custom", path: ["deadlineAt"], message: "Deadline must follow start time" });
  }
});

export const AttemptPathParamsSchema = z.object({ id: UUID }).strict();
export const AnswerPathParamsSchema = z.object({ id: UUID, slotId: UUID }).strict();
export const AssetPathParamsSchema = z.object({ id: UUID, assetVersionId: UUID }).strict();
export const AssetPurposeSchema = z.object({ purpose: z.enum(["question", "explanation"]) }).strict();

const PageQuerySchema = z.object({
  cursor: z.string().min(1).max(1_024).optional(),
  limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).transform(Number).optional(),
}).strict();
export const CatalogQuerySchema = PageQuerySchema;
export const AttemptHistoryQuerySchema = PageQuerySchema;

export const IdempotencyKeySchema = z.string().regex(/^[\x21-\x7e]{1,128}$/, "Expected 1–128 printable non-space ASCII characters");
export const IdempotencyHeadersSchema = z.object({ "idempotency-key": IdempotencyKeySchema }).strict();

export const RouteOnlyErrorCodeSchema = z.enum([
  "MALFORMED_JSON",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "FORM_NOT_OPEN",
  "FORM_UNAVAILABLE",
]);

function errorResponse<const Code extends string, Details extends z.ZodType = typeof EmptyDetails>(
  code: Code,
  details: Details = EmptyDetails as unknown as Details,
) {
  return z.object({
    error: z.object({
      code: z.literal(code),
      message: z.string().trim().min(1).max(1_024),
      requestId: z.string().min(1).max(256),
      details,
    }).strict(),
  }).strict();
}

export const MalformedJsonResponseSchema = errorResponse("MALFORMED_JSON");
export const NotFoundResponseSchema = errorResponse("NOT_FOUND");
export const PayloadTooLargeResponseSchema = errorResponse("PAYLOAD_TOO_LARGE");
export const FormNotOpenResponseSchema = errorResponse("FORM_NOT_OPEN");
export const FormUnavailableResponseSchema = errorResponse("FORM_UNAVAILABLE");
export const ResultNotReadyResponseSchema = errorResponse("RESULT_NOT_READY", ErrorDetailsSchema);
export const ContentWithdrawnResponseSchema = errorResponse("CONTENT_WITHDRAWN", ErrorDetailsSchema);
export const TemporarilyUnavailableResponseSchema = errorResponse("TEMPORARILY_UNAVAILABLE", ErrorDetailsSchema);
export const AttemptClosedResponseSchema = errorResponse("ATTEMPT_CLOSED", ErrorDetailsSchema);
export const SectionClosedResponseSchema = errorResponse("SECTION_CLOSED", ErrorDetailsSchema);
export const IdempotencyConflictResponseSchema = errorResponse("IDEMPOTENCY_CONFLICT", ErrorDetailsSchema);
export const ConcurrentModificationResponseSchema = errorResponse("CONCURRENT_MODIFICATION", ErrorDetailsSchema);
export const RevisionConflictResponseSchema = errorResponse("REVISION_CONFLICT", ErrorDetailsSchema);
export const RateLimitedResponseSchema = errorResponse("RATE_LIMITED", ErrorDetailsSchema);
export const RetryAfterHeadersSchema = z.object({ "Retry-After": z.string().regex(/^[1-9][0-9]*$/, "Expected positive integer seconds") }).strict();
export const ConstraintConflictResponseSchema = errorResponse("CONSTRAINT_CONFLICT", ErrorDetailsSchema);
export const RightsBlockedResponseSchema = errorResponse("RIGHTS_BLOCKED", ErrorDetailsSchema);
export const UnsupportedTypeResponseSchema = errorResponse("UNSUPPORTED_TYPE", ErrorDetailsSchema);
export const TimeoutResponseSchema = errorResponse("TIMEOUT", ErrorDetailsSchema);
const CreateConflictResponseSchema = z.union([
  ConcurrentAttemptExistsResponseSchema,
  FormNotOpenResponseSchema,
  IdempotencyConflictResponseSchema,
  ConcurrentModificationResponseSchema,
]);
const CreateValidationResponseSchema = z.union([
  ValidationErrorResponseSchema,
  StudentShortageSchema,
  ConstraintConflictResponseSchema,
  RightsBlockedResponseSchema,
  UnsupportedTypeResponseSchema,
]);
const BoundedSearchUnavailableResponseSchema = z.union([
  SearchExhaustedErrorResponseSchema,
  TemporarilyUnavailableResponseSchema,
  TimeoutResponseSchema,
]);
const StartConflictResponseSchema = z.union([
  FormNotOpenResponseSchema,
  AttemptClosedResponseSchema,
  IdempotencyConflictResponseSchema,
  ConcurrentModificationResponseSchema,
]);
const AnswerConflictResponseSchema = z.union([
  RevisionConflictResponseSchema,
  IdempotencyConflictResponseSchema,
  AttemptClosedResponseSchema,
  SectionClosedResponseSchema,
  ConcurrentModificationResponseSchema,
]);
const SubmitConflictResponseSchema = z.union([
  AttemptClosedResponseSchema,
  SectionClosedResponseSchema,
  IdempotencyConflictResponseSchema,
  ConcurrentModificationResponseSchema,
]);
const ServiceUnavailableResponseSchema = z.union([TemporarilyUnavailableResponseSchema, TimeoutResponseSchema]);

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type CatalogPage = z.infer<typeof CatalogPageSchema>;
export type CreateAttempt = z.infer<typeof CreateAttemptSchema>;
export type StartReceipt = z.infer<typeof StartReceiptSchema>;
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;
export type AttemptHistoryQuery = z.infer<typeof AttemptHistoryQuerySchema>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
export type RouteOnlyErrorCode = z.infer<typeof RouteOnlyErrorCodeSchema>;

type JsonResponse<S extends z.ZodType = z.ZodType, H extends z.ZodObject | undefined = z.ZodObject | undefined> = {
  readonly contentType: "application/json";
  readonly schema: S;
  readonly description: string;
  readonly headers?: H;
};
type BinaryImageResponse = { readonly contentType: "image/*"; readonly body: "Uint8Array"; readonly description: string };
type ResponseDefinition = JsonResponse | BinaryImageResponse;
type RouteDefinition = {
  readonly method: "GET" | "POST" | "PUT";
  readonly path: string;
  readonly summary: string;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly headers?: z.ZodType;
  readonly body?: z.ZodType;
  readonly responses: Readonly<Record<number, ResponseDefinition>>;
};

const json = <S extends z.ZodType, H extends z.ZodObject | undefined = undefined>(schema: S, description: string, headers?: H): JsonResponse<S, H> => ({
  contentType: "application/json",
  schema,
  description,
  ...(headers === undefined ? {} : { headers }),
});
const image = (description: string): BinaryImageResponse => ({ contentType: "image/*", body: "Uint8Array", description });

export const studentRouteRegistry = {
  catalog: {
    method: "GET", path: "/api/v1/catalog", summary: "List available practice forms", query: CatalogQuerySchema,
    responses: {
      200: json(CatalogPageSchema, "Catalog page"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      422: json(ValidationErrorResponseSchema, "Invalid query"),
      503: json(ServiceUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
  createAttempt: {
    method: "POST", path: "/api/v1/attempts", summary: "Create an owned practice attempt", headers: IdempotencyHeadersSchema, body: CreateAttemptSchema,
    responses: {
      201: json(CreationReceiptSchema, "Created attempt receipt"),
      400: json(MalformedJsonResponseSchema, "Malformed JSON"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      404: json(NotFoundResponseSchema, "Form not found"),
      409: json(CreateConflictResponseSchema, "Creation conflict"),
      410: json(FormUnavailableResponseSchema, "Form unavailable"),
      413: json(PayloadTooLargeResponseSchema, "Payload too large"),
      422: json(CreateValidationResponseSchema, "Invalid request or insufficient inventory"),
      429: json(RateLimitedResponseSchema, "Rate limited", RetryAfterHeadersSchema),
      503: json(BoundedSearchUnavailableResponseSchema, "Bounded search or service unavailable"),
    },
  },
  startAttempt: {
    method: "POST", path: "/api/v1/attempts/{id}/start", summary: "Start an attempt", params: AttemptPathParamsSchema, headers: IdempotencyHeadersSchema, body: EmptyCommandBodySchema,
    responses: {
      200: json(StartReceiptSchema, "Immutable start receipt"),
      400: json(MalformedJsonResponseSchema, "Malformed JSON"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      404: json(NotFoundResponseSchema, "Attempt not found"),
      409: json(StartConflictResponseSchema, "Attempt cannot be started"),
      410: json(FormUnavailableResponseSchema, "Form withdrawn or unavailable"),
      413: json(PayloadTooLargeResponseSchema, "Payload too large"),
      422: json(ValidationErrorResponseSchema, "Invalid request"),
      503: json(ServiceUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
  getAttempt: {
    method: "GET", path: "/api/v1/attempts/{id}", summary: "Get the caller's current attempt view", params: AttemptPathParamsSchema,
    responses: {
      200: json(AttemptViewSchema, "Current student-safe attempt view"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      404: json(NotFoundResponseSchema, "Attempt not found"),
      422: json(ValidationErrorResponseSchema, "Invalid path or query"),
      410: json(ContentWithdrawnResponseSchema, "Content withdrawn"),
      503: json(ServiceUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
  saveAnswer: {
    method: "PUT", path: "/api/v1/attempts/{id}/answers/{slotId}", summary: "Save an answer for a delivered slot", params: AnswerPathParamsSchema, headers: IdempotencyHeadersSchema, body: AnswerSubmissionRequestSchema,
    responses: {
      200: json(AnswerAckSchema, "Answer acknowledgement"),
      400: json(MalformedJsonResponseSchema, "Malformed JSON"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      404: json(NotFoundResponseSchema, "Attempt or slot not found"),
      409: json(AnswerConflictResponseSchema, "Answer or attempt conflict"),
      410: json(ContentWithdrawnResponseSchema, "Content withdrawn"),
      413: json(PayloadTooLargeResponseSchema, "Payload too large"),
      422: json(ValidationErrorResponseSchema, "Invalid answer"),
      429: json(RateLimitedResponseSchema, "Rate limited", RetryAfterHeadersSchema),
      503: json(ServiceUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
  submitAttempt: {
    method: "POST", path: "/api/v1/attempts/{id}/submit", summary: "Submit an attempt", params: AttemptPathParamsSchema, headers: IdempotencyHeadersSchema, body: EmptyCommandBodySchema,
    responses: {
      200: json(ClosureSchema, "Attempt closure"),
      400: json(MalformedJsonResponseSchema, "Malformed JSON"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      404: json(NotFoundResponseSchema, "Attempt not found"),
      409: json(SubmitConflictResponseSchema, "Attempt closure conflict"),
      410: json(ContentWithdrawnResponseSchema, "Content withdrawn"),
      413: json(PayloadTooLargeResponseSchema, "Payload too large"),
      422: json(ValidationErrorResponseSchema, "Invalid request"),
      503: json(ServiceUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
  attemptHistory: {
    method: "GET", path: "/api/v1/attempts", summary: "List the caller's attempts", query: AttemptHistoryQuerySchema,
    responses: {
      200: json(AttemptHistoryPageSchema, "Attempt history page"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      422: json(ValidationErrorResponseSchema, "Invalid query"),
      503: json(ServiceUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
  attemptAsset: {
    method: "GET", path: "/api/v1/attempts/{id}/assets/{assetVersionId}", summary: "Read an authorized question image", params: AssetPathParamsSchema, query: AssetPurposeSchema,
    responses: {
      200: image("Authorized image bytes"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      404: json(NotFoundResponseSchema, "Attempt or asset not found"),
      410: json(ContentWithdrawnResponseSchema, "Content withdrawn"),
      413: json(PayloadTooLargeResponseSchema, "Asset too large"),
      422: json(ValidationErrorResponseSchema, "Invalid asset purpose"),
      503: json(ServiceUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
} as const satisfies Readonly<Record<string, RouteDefinition>>;

export const releasedReviewRouteRegistry = {
  releasedResult: {
    method: "GET", path: "/api/v1/attempts/{id}/result", summary: "Read released authorized review", params: AttemptPathParamsSchema,
    responses: {
      200: json(AuthorizedReleasedReviewSchema, "Released result and authorized review"),
      401: json(AuthenticationErrorResponseSchema, "Unauthenticated"),
      403: json(AuthorizationErrorResponseSchema, "Forbidden"),
      404: json(NotFoundResponseSchema, "Attempt not found"),
      422: json(ValidationErrorResponseSchema, "Invalid path or query"),
      409: json(ResultNotReadyResponseSchema, "Result is not released"),
      410: json(ContentWithdrawnResponseSchema, "Content withdrawn"),
      503: json(TemporarilyUnavailableResponseSchema, "Service temporarily unavailable"),
    },
  },
} as const satisfies Readonly<Record<string, RouteDefinition>>;

type SchemaInput<T> = T extends z.ZodType ? z.input<T> : undefined;
type ResponseOutput<T> = T extends { readonly schema: infer S extends z.ZodType }
  ? z.output<S>
  : T extends { readonly body: "Uint8Array" }
    ? Uint8Array
    : never;
type ResponseHeadersInput<T> = T extends { readonly headers?: infer H }
  ? H extends z.ZodType ? z.input<H> : undefined
  : undefined;
type RouteOperationMap<R extends Readonly<Record<string, RouteDefinition>>> = {
  readonly [K in keyof R]: {
    readonly method: R[K]["method"];
    readonly path: R[K]["path"];
    readonly params: SchemaInput<R[K] extends { readonly params: infer S } ? S : undefined>;
    readonly query: SchemaInput<R[K] extends { readonly query: infer S } ? S : undefined>;
    readonly headers: SchemaInput<R[K] extends { readonly headers: infer S } ? S : undefined>;
    readonly body: SchemaInput<R[K] extends { readonly body: infer S } ? S : undefined>;
    readonly responses: {
      readonly [Status in keyof R[K]["responses"]]: ResponseOutput<R[K]["responses"][Status]>;
    };
    readonly responseHeaders: {
      readonly [Status in keyof R[K]["responses"]]: ResponseHeadersInput<R[K]["responses"][Status]>;
    };
  };
};

export type StudentOperationMap = RouteOperationMap<typeof studentRouteRegistry>;
export type ReleasedReviewOperationMap = RouteOperationMap<typeof releasedReviewRouteRegistry>;
export type RouteResponseSchema = JsonResponse;
export type RouteResponseDefinition = ResponseDefinition;
export type RouteDefinitionValue = RouteDefinition;

/** Named public runtime schemas used when rendering operation request/response references. */
export const routeComponentSchemas = {
  CatalogEntry: CatalogEntrySchema,
  CatalogPage: CatalogPageSchema,
  CatalogQuery: CatalogQuerySchema,
  CreateAttempt: CreateAttemptSchema,
  EmptyCommandBody: EmptyCommandBodySchema,
  StartReceipt: StartReceiptSchema,
  AttemptPathParams: AttemptPathParamsSchema,
  AnswerPathParams: AnswerPathParamsSchema,
  AssetPathParams: AssetPathParamsSchema,
  AssetPurpose: AssetPurposeSchema,
  IdempotencyHeaders: IdempotencyHeadersSchema,
  StudentSlot: StudentSlotSchema,
  CreationReceipt: CreationReceiptSchema,
  AttemptView: AttemptViewSchema,
  AnswerSubmissionRequest: AnswerSubmissionRequestSchema,
  AnswerAck: AnswerAckSchema,
  Closure: ClosureSchema,
  AttemptHistoryPage: AttemptHistoryPageSchema,
  AuthorizedReleasedReview: AuthorizedReleasedReviewSchema,
  AuthenticationError: AuthenticationErrorResponseSchema,
  AuthorizationError: AuthorizationErrorResponseSchema,
  ValidationError: ValidationErrorResponseSchema,
  StudentShortage: StudentShortageSchema,
  ConcurrentAttemptExists: ConcurrentAttemptExistsResponseSchema,
  SearchExhausted: SearchExhaustedErrorResponseSchema,
  MalformedJson: MalformedJsonResponseSchema,
  NotFound: NotFoundResponseSchema,
  PayloadTooLarge: PayloadTooLargeResponseSchema,
  FormNotOpen: FormNotOpenResponseSchema,
  FormUnavailable: FormUnavailableResponseSchema,
  ResultNotReady: ResultNotReadyResponseSchema,
  ContentWithdrawn: ContentWithdrawnResponseSchema,
  TemporarilyUnavailable: TemporarilyUnavailableResponseSchema,
  AttemptClosed: AttemptClosedResponseSchema,
  SectionClosed: SectionClosedResponseSchema,
  RevisionConflict: RevisionConflictResponseSchema,
  IdempotencyConflict: IdempotencyConflictResponseSchema,
  ConcurrentModification: ConcurrentModificationResponseSchema,
  RateLimited: RateLimitedResponseSchema,
  RetryAfterHeaders: RetryAfterHeadersSchema,
  ConstraintConflict: ConstraintConflictResponseSchema,
  RightsBlocked: RightsBlockedResponseSchema,
  UnsupportedType: UnsupportedTypeResponseSchema,
  Timeout: TimeoutResponseSchema,
} as const;
