import { z } from "zod";

const MAX_QUESTION_BYTES = 256 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const NonEmptyString = z.string().trim().min(1);
const CanonicalUuid = z.string().regex(UUID_PATTERN, "Expected a lowercase UUID");
const Instant = z.string().refine(
  (value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
  "Expected an RFC3339 timestamp with an offset",
);

export const SectionSchema = z.enum(["MATH", "READING", "SCIENCE"]);
export const CognitiveLevelSchema = z.enum(["M1", "M2", "M3"]);
export const InteractionTypeSchema = z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE_GROUP"]);

export const BlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(20_000) }).strict(),
  z
    .object({
      type: z.literal("math"),
      tex: z.string().min(1).max(4_000),
      display: z.boolean(),
      accessibleText: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("table"),
      caption: z.string().min(1),
      headers: z.array(z.string().min(1)).min(1).max(20),
      rows: z.array(z.array(z.string())).min(1).max(100),
    })
    .strict()
    .superRefine((table, context) => {
      for (const [index, row] of table.rows.entries()) {
        if (row.length !== table.headers.length) {
          context.addIssue({
            code: "custom",
            path: ["rows", index],
            message: "Each table row must have the same width as headers",
          });
        }
      }
    }),
  z
    .object({
      type: z.literal("image"),
      assetVersionId: CanonicalUuid,
      alt: z.string().min(1),
      caption: z.string().min(1).optional(),
    })
    .strict(),
]);

const BlocksSchema = z.array(BlockSchema).min(1).max(100);
const OptionSchema = z.object({ id: NonEmptyString, content: BlocksSchema }).strict();
const StatementSchema = z.object({ id: NonEmptyString, content: BlocksSchema }).strict();

export const InteractionSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("SINGLE_CHOICE"), options: z.array(OptionSchema).min(2).max(10) })
    .strict(),
  z
    .object({
      type: z.literal("MULTIPLE_CHOICE"),
      options: z.array(OptionSchema).min(2).max(10),
      minSelections: z.number().int().min(1),
      maxSelections: z.number().int().min(1),
    })
    .strict()
    .superRefine((interaction, context) => {
      if (interaction.minSelections > interaction.maxSelections) {
        context.addIssue({ code: "custom", path: ["minSelections"], message: "Must not exceed maxSelections" });
      }
      if (interaction.maxSelections > interaction.options.length) {
        context.addIssue({ code: "custom", path: ["maxSelections"], message: "Must not exceed option count" });
      }
    }),
  z
    .object({
      type: z.literal("TRUE_FALSE_GROUP"),
      statements: z.array(StatementSchema).min(1).max(10),
    })
    .strict(),
]).superRefine((interaction, context) => {
  const entries = interaction.type === "TRUE_FALSE_GROUP" ? interaction.statements : interaction.options;
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Option or statement IDs must be unique" });
  }
});

export const AnswerKeySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SINGLE_CHOICE"), optionId: NonEmptyString }).strict(),
  z.object({ type: z.literal("MULTIPLE_CHOICE"), optionIds: z.array(NonEmptyString).min(1) }).strict(),
  z.object({ type: z.literal("TRUE_FALSE_GROUP"), values: z.record(NonEmptyString, z.boolean()) }).strict(),
]);

export const ResponseValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SINGLE_CHOICE"), optionId: NonEmptyString.nullable() }).strict(),
  z.object({ type: z.literal("MULTIPLE_CHOICE"), optionIds: z.array(NonEmptyString) }).strict(),
  z.object({ type: z.literal("TRUE_FALSE_GROUP"), values: z.record(NonEmptyString, z.boolean().nullable()) }).strict(),
]);

const DifficultySchema = z
  .object({
    target: z.enum(["EASY", "MEDIUM", "HARD"]).nullable(),
    predicted: z
      .object({ label: NonEmptyString, methodVersion: NonEmptyString, confidence: z.number().min(0).max(1) })
      .strict()
      .nullable(),
    empiricalStudyId: NonEmptyString.nullable(),
  })
  .strict();

const PrivateQuestionDataSchema = z
  .object({
    answerKey: AnswerKeySchema,
    explanation: BlocksSchema,
    evidenceRefs: z.array(NonEmptyString),
    scoringPolicy: z.literal("practice-binary-v1"),
  })
  .strict();

export const QuestionVersionSchema = z
  .object({
    schemaVersion: z.literal("question/1"),
    id: CanonicalUuid,
    questionId: CanonicalUuid,
    versionNo: z.number().int().positive(),
    parentVersionId: CanonicalUuid.nullable(),
    language: z.literal("vi-VN"),
    section: SectionSchema,
    taxonomyVersionId: CanonicalUuid,
    domainId: NonEmptyString,
    skillIds: z.array(NonEmptyString),
    subskillIds: z.array(NonEmptyString),
    cognitiveLevel: CognitiveLevelSchema.nullable(),
    difficulty: DifficultySchema,
    content: BlocksSchema,
    stimulusVersionId: CanonicalUuid.nullable(),
    interaction: InteractionSchema,
    private: PrivateQuestionDataSchema,
    origin: z.enum(["MANUAL", "IMPORTED", "GENERATED", "AUGMENTED"]),
    provenanceIds: z.array(NonEmptyString).min(1),
    generationRunId: CanonicalUuid.nullable(),
    createdBy: NonEmptyString,
    createdAt: Instant,
    contentHash: NonEmptyString,
  })
  .strict()
  .superRefine((question, context) => {
    validateAnswerKey(question.interaction, question.private.answerKey, (path, message) =>
      context.addIssue({ code: "custom", path, message }),
    ["private", "answerKey"]);
    if (new TextEncoder().encode(JSON.stringify(question)).length > MAX_QUESTION_BYTES) {
      context.addIssue({ code: "custom", message: "Question must not exceed 256 KiB serialized" });
    }
  });

export const StudentQuestionSchema = z
  .object({
    content: BlocksSchema,
    interaction: InteractionSchema,
  })
  .strict();

export type QuestionVersion = z.infer<typeof QuestionVersionSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type AnswerKey = z.infer<typeof AnswerKeySchema>;
export type ResponseValue = z.infer<typeof ResponseValueSchema>;
export type StudentQuestion = z.infer<typeof StudentQuestionSchema>;

/**
 * Blueprint section IDs are local opaque entries, deliberately distinct from
 * the TSA domain enum carried by `section`.
 */
export const BlueprintSectionSchema = z
  .object({
    id: NonEmptyString,
    section: SectionSchema,
    count: z.number().int().positive().max(200),
    durationSeconds: z.number().int().positive().max(21_600),
  })
  .strict();

export const QuotaSchema = z.discriminatedUnion("dimension", [
  z.object({ sectionId: NonEmptyString, min: z.number().int().nonnegative(), max: z.number().int().nonnegative(), dimension: z.literal("SKILL"), value: CanonicalUuid }).strict(),
  z.object({ sectionId: NonEmptyString, min: z.number().int().nonnegative(), max: z.number().int().nonnegative(), dimension: z.literal("COGNITIVE_LEVEL"), value: CognitiveLevelSchema }).strict(),
  z.object({ sectionId: NonEmptyString, min: z.number().int().nonnegative(), max: z.number().int().nonnegative(), dimension: z.literal("DIFFICULTY"), value: z.enum(["EASY", "MEDIUM", "HARD"]) }).strict(),
]);

/** Generic immutable blueprint configuration; future approved profiles may have multiple sections. */
export const BlueprintConfigSchema = z
  .object({
    schemaVersion: z.literal("blueprint/1"),
    name: NonEmptyString,
    taxonomyVersionId: CanonicalUuid,
    profileKind: z.enum(["INDEPENDENT_PRACTICE", "PUBLIC_REFERENCE"]),
    evidenceIds: z.array(NonEmptyString),
    sections: z.array(BlueprintSectionSchema).min(1),
    allowedTypes: z.array(InteractionTypeSchema).min(1),
    quotas: z.array(QuotaSchema),
    maxPerSource: z.number().int().positive().nullable(),
    excludedQuestionIds: z.array(CanonicalUuid),
    bundlePolicy: z.literal("ALL_OR_NONE"),
    scoringPolicy: z.literal("practice-binary-v1"),
    releasePolicy: z.literal("after-grade-v1"),
  })
  .strict()
  .superRefine((blueprint, context) => {
    const sectionIds = blueprint.sections.map((section) => section.id);
    if (new Set(sectionIds).size !== sectionIds.length) {
      context.addIssue({ code: "custom", path: ["sections"], message: "Blueprint section entry IDs must be unique" });
    }
    if (blueprint.sections.reduce((total, section) => total + section.count, 0) > 200) {
      context.addIssue({ code: "custom", path: ["sections"], message: "Blueprint must not exceed 200 questions" });
    }
    if (blueprint.sections.reduce((total, section) => total + section.durationSeconds, 0) > 21_600) {
      context.addIssue({ code: "custom", path: ["sections"], message: "Blueprint must not exceed six hours" });
    }
    if (new Set(blueprint.allowedTypes).size !== blueprint.allowedTypes.length) {
      context.addIssue({ code: "custom", path: ["allowedTypes"], message: "Allowed interaction types must be unique" });
    }
    if (new Set(blueprint.excludedQuestionIds).size !== blueprint.excludedQuestionIds.length) {
      context.addIssue({ code: "custom", path: ["excludedQuestionIds"], message: "Excluded question IDs must be unique" });
    }

    const countsBySectionId = new Map(blueprint.sections.map((section) => [section.id, section.count]));
    const quotaKeys = new Set<string>();
    for (const [index, quota] of blueprint.quotas.entries()) {
      const count = countsBySectionId.get(quota.sectionId);
      if (count === undefined) {
        context.addIssue({ code: "custom", path: ["quotas", index, "sectionId"], message: "Quota sectionId must reference a blueprint section entry ID" });
      } else if (quota.min > quota.max || quota.max > count) {
        context.addIssue({ code: "custom", path: ["quotas", index], message: "Quota bounds must satisfy 0 <= min <= max <= section count" });
      }
      const quotaKey = `${quota.sectionId}\u0000${quota.dimension}\u0000${quota.value}`;
      if (quotaKeys.has(quotaKey)) {
        context.addIssue({ code: "custom", path: ["quotas", index], message: "Duplicate section/dimension/value quota" });
      }
      quotaKeys.add(quotaKey);
    }
  });

/** Owner-approved MVP profile guard layered over the generic multi-section blueprint schema. */
export const MvpBlueprintConfigSchema = BlueprintConfigSchema.superRefine((blueprint, context) => {
  if (blueprint.profileKind !== "INDEPENDENT_PRACTICE") {
    context.addIssue({ code: "custom", path: ["profileKind"], message: "MVP profiles must be independent practice" });
  }
  if (blueprint.sections.length !== 1) {
    context.addIssue({ code: "custom", path: ["sections"], message: "An MVP profile must contain exactly one domain section" });
    return;
  }
  const section = blueprint.sections[0]!;
  const expectedCount = { MATH: 4, READING: 2, SCIENCE: 4 } as const;
  if (section.count !== expectedCount[section.section]) {
    context.addIssue({ code: "custom", path: ["sections", 0, "count"], message: "MVP domain profile has an incorrect question count" });
  }
});

export type BlueprintConfig = z.infer<typeof BlueprintConfigSchema>;
export type MvpBlueprintConfig = z.infer<typeof MvpBlueprintConfigSchema>;
export type BlueprintSection = z.infer<typeof BlueprintSectionSchema>;
export type Quota = z.infer<typeof QuotaSchema>;

/**
 * Public API error contracts. These schemas deliberately model only allowlisted
 * fields: error payloads must never be used to serialize caught exceptions or
 * database/provider errors.
 */
export const ErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CSRF_FAILED",
  "REVISION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "ATTEMPT_CLOSED",
  "SECTION_CLOSED",
  "RESULT_NOT_READY",
  "CONCURRENT_MODIFICATION",
  "CONCURRENT_ATTEMPT_EXISTS",
  "CONTENT_WITHDRAWN",
  "VALIDATION_ERROR",
  "INSUFFICIENT_UNSEEN_INVENTORY",
  "INSUFFICIENT_ELIGIBLE_INVENTORY",
  "CONSTRAINT_CONFLICT",
  "RIGHTS_BLOCKED",
  "UNSUPPORTED_TYPE",
  "RATE_LIMITED",
  "TEMPORARILY_UNAVAILABLE",
  "SEARCH_EXHAUSTED",
  "TIMEOUT",
]);

export const ReuseModeSchema = z.enum(["NEW_ONLY", "REVIEW_ALLOWED", "FIXED_AS_PUBLISHED"]);
export const FormModeSchema = z.enum(["PERSONALIZED_PRACTICE", "PUBLISHED_FIXED"]);
export const AttemptStateSchema = z.enum(["CREATED", "IN_PROGRESS", "SUBMITTED", "EXPIRED", "GRADED", "CANCELLED", "INVALIDATED"]);

const ReusePolicyVersionSchema = z.literal("reuse/1");
export const ClosureSchema = z
  .object({
    attemptId: CanonicalUuid,
    state: AttemptStateSchema,
    terminalReason: z.enum(["EXPLICIT_SUBMIT", "DEADLINE"]).nullable(),
    cancellationReason: z.enum(["FORM_WITHDRAWN", "RIGHTS_BLOCKED", "ADMISSION_CLOSED", "START_TTL_EXPIRED"]).nullable(),
    closedAt: Instant.nullable(),
    gradingStatus: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_FINAL"]).nullable(),
  })
  .strict();

export const StudentSlotSchema = z
  .object({
    slotId: CanonicalUuid,
    sectionId: NonEmptyString,
    ordinal: z.number().int().positive(),
    stimulus: z.object({ id: CanonicalUuid, content: BlocksSchema }).strict().nullable(),
    ...StudentQuestionSchema.shape,
  })
  .strict();

export const AttemptSectionSchema = z
  .object({
    sectionId: NonEmptyString,
    section: SectionSchema,
    startsAt: Instant.nullable(),
    endsAt: Instant.nullable(),
    count: z.number().int().positive(),
  })
  .strict();

export const AnswerAckSchema = z
  .object({
    slotId: CanonicalUuid,
    value: ResponseValueSchema,
    revision: z.number().int().positive(),
    savedAt: Instant,
  })
  .strict();

/** The persisted successful creation response; timestamp calculation is server/database work, not DTO work. */
export const CreationReceiptSchema = z
  .object({
    attemptId: CanonicalUuid,
    formId: CanonicalUuid,
    state: z.literal("CREATED"),
    domain: SectionSchema,
    formMode: FormModeSchema,
    reuseMode: ReuseModeSchema,
    reusePolicyVersion: ReusePolicyVersionSchema,
    startBefore: Instant,
  })
  .strict()
  .superRefine(validateFormModeReuseMode);

/**
 * Student attempt view. This is intentionally an MVP one-domain test view,
 * never a continuous MATH → READING → SCIENCE examination flow.
 */
export const AttemptViewSchema = z
  .object({
    attemptId: CanonicalUuid,
    state: AttemptStateSchema,
    formId: CanonicalUuid,
    domain: SectionSchema,
    formMode: FormModeSchema,
    reuseMode: ReuseModeSchema,
    reusePolicyVersion: ReusePolicyVersionSchema,
    serverNow: Instant,
    startBefore: Instant.nullable(),
    startedAt: Instant.nullable(),
    deadlineAt: Instant.nullable(),
    activeSectionId: NonEmptyString.nullable(),
    sections: z.array(AttemptSectionSchema).length(1),
    slots: z.array(StudentSlotSchema),
    answers: z.array(AnswerAckSchema),
    closure: ClosureSchema,
  })
  .strict()
  .superRefine((view, context) => {
    validateFormModeReuseMode(view, context);
    const section = view.sections[0]!;
    if (section.section !== view.domain) {
      context.addIssue({ code: "custom", path: ["sections", 0, "section"], message: "MVP section domain must equal attempt domain" });
    }
    if (view.closure.attemptId !== view.attemptId || view.closure.state !== view.state) {
      context.addIssue({ code: "custom", path: ["closure"], message: "Closure must identify this attempt and its current state" });
    }
    if (view.state === "CREATED") {
      if (view.startBefore === null) {
        context.addIssue({ code: "custom", path: ["startBefore"], message: "CREATED attempts require a persisted start deadline" });
      }
      if (view.startedAt !== null || view.deadlineAt !== null || view.activeSectionId !== null || view.slots.length !== 0 || view.answers.length !== 0) {
        context.addIssue({ code: "custom", message: "CREATED attempts have no started clock, active section, slots, or answers" });
      }
      return;
    }

    if (view.startBefore !== null) {
      context.addIssue({ code: "custom", path: ["startBefore"], message: "Only CREATED attempt views expose startBefore" });
    }
    if (view.state === "IN_PROGRESS") {
      if (view.startedAt === null || view.deadlineAt === null || view.activeSectionId !== section.sectionId) {
        context.addIssue({ code: "custom", message: "IN_PROGRESS attempts require started/deadline timestamps and the single active section" });
      }
      if (view.slots.length !== section.count) {
        context.addIssue({ code: "custom", path: ["slots"], message: "IN_PROGRESS slots must match the active section count" });
      }
    } else if (view.slots.length !== 0 || view.answers.length !== 0 || view.activeSectionId !== null) {
      context.addIssue({ code: "custom", message: "Non-active attempt views do not expose slots, answers, or an active section" });
    }

    const slotIds = new Set(view.slots.map((slot) => slot.slotId));
    if (slotIds.size !== view.slots.length) {
      context.addIssue({ code: "custom", path: ["slots"], message: "Slot IDs must be unique" });
    }
    const ordinals = new Set(view.slots.map((slot) => slot.ordinal));
    if (ordinals.size !== view.slots.length) {
      context.addIssue({ code: "custom", path: ["slots"], message: "Slot ordinals must be unique" });
    }
    const answerSlotIds = new Set<string>();
    for (const [index, answer] of view.answers.entries()) {
      if (answerSlotIds.has(answer.slotId) || !slotIds.has(answer.slotId)) {
        context.addIssue({ code: "custom", path: ["answers", index, "slotId"], message: "Each answer must acknowledge one delivered slot" });
      }
      answerSlotIds.add(answer.slotId);
      const slot = view.slots.find((candidate) => candidate.slotId === answer.slotId);
      if (slot !== undefined && answer.value.type !== slot.interaction.type) {
        context.addIssue({ code: "custom", path: ["answers", index, "value", "type"], message: "Answer type must match its slot interaction" });
      }
    }
  });

export type CreationReceipt = z.infer<typeof CreationReceiptSchema>;
export type StudentSlot = z.infer<typeof StudentSlotSchema>;
export type AttemptView = z.infer<typeof AttemptViewSchema>;
export type Closure = z.infer<typeof ClosureSchema>;
export type AttemptSection = z.infer<typeof AttemptSectionSchema>;
export type AnswerAck = z.infer<typeof AnswerAckSchema>;

/** The documented body for PUT /attempts/{id}/answers/{slotId}. The slot is route identity, never a canonical question ID. */
export const AnswerSubmissionRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    value: ResponseValueSchema,
  })
  .strict();

export type AnswerSubmissionRequest = z.infer<typeof AnswerSubmissionRequestSchema>;

const PracticeScoreSchema = z
  .object({
    correctCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive(),
    percentage: z.string().regex(/^(?:0|[1-9]\d?|100)\.\d{2}$/, "Expected a 0.00 to 100.00 percentage"),
  })
  .strict()
  .superRefine((score, context) => {
    if (score.correctCount > score.totalCount) {
      context.addIssue({ code: "custom", path: ["correctCount"], message: "Correct count must not exceed total count" });
    }
  });

export const ResultSectionTotalSchema = z
  .object({
    sectionId: NonEmptyString,
    section: SectionSchema,
    correctCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive(),
  })
  .strict()
  .superRefine((section, context) => {
    if (section.correctCount > section.totalCount) {
      context.addIssue({ code: "custom", path: ["correctCount"], message: "Correct count must not exceed total count" });
    }
  });

/**
 * Student-safe released practice-score projection. It deliberately omits
 * per-item keys, explanations, question versions, and authoring data.
 */
export const ResultViewSchema = z
  .object({
    attemptId: CanonicalUuid,
    scoreRunId: CanonicalUuid,
    domain: SectionSchema,
    formMode: FormModeSchema,
    reuseMode: ReuseModeSchema,
    policyVersion: z.literal("practice-binary-v1"),
    scoreLabel: z.literal("UNOFFICIAL_PRACTICE"),
    ...PracticeScoreSchema.shape,
    sections: z.array(ResultSectionTotalSchema).length(1),
    releasedAt: Instant,
  })
  .strict()
  .superRefine((result, context) => {
    validateFormModeReuseMode(result, context);
    const section = result.sections[0]!;
    if (section.section !== result.domain) {
      context.addIssue({ code: "custom", path: ["sections", 0, "section"], message: "MVP result section must equal result domain" });
    }
    if (section.correctCount !== result.correctCount || section.totalCount !== result.totalCount) {
      context.addIssue({ code: "custom", path: ["sections", 0], message: "MVP section totals must equal result totals" });
    }
  });

export const ReleasedReviewItemSchema = z
  .object({
    slotId: CanonicalUuid,
    earned: z.union([z.literal(0), z.literal(1)]),
    response: ResponseValueSchema.nullable(),
    question: StudentSlotSchema,
    correctAnswer: AnswerKeySchema,
    explanation: BlocksSchema,
  })
  .strict()
  .superRefine((item, context) => {
    if (item.slotId !== item.question.slotId) {
      context.addIssue({ code: "custom", path: ["question", "slotId"], message: "Review question must identify its item slot" });
    }
    validateAnswerKey(item.question.interaction, item.correctAnswer, (path, message) =>
      context.addIssue({ code: "custom", path: ["correctAnswer", ...path], message }), []);
    if (item.response !== null) {
      validateResponse(item.question.interaction, item.response, (path, message) =>
        context.addIssue({ code: "custom", path: ["response", ...path], message }), []);
    }
  });

/**
 * The documented released-only Result projection. This separate schema is the
 * only student-facing DTO in this package that can carry keys/explanations.
 */
export const AuthorizedReleasedReviewSchema = ResultViewSchema.safeExtend({
  items: z.array(ReleasedReviewItemSchema),
})
  .strict()
  .superRefine((review, context) => {
    if (review.items.length !== review.totalCount) {
      context.addIssue({ code: "custom", path: ["items"], message: "Released review items must match total count" });
    }
    const slotIds = new Set(review.items.map((item) => item.slotId));
    if (slotIds.size !== review.items.length) {
      context.addIssue({ code: "custom", path: ["items"], message: "Released review item slot IDs must be unique" });
    }
  });

export const AttemptHistoryItemSchema = z
  .object({
    attemptId: CanonicalUuid,
    formId: CanonicalUuid,
    domain: SectionSchema,
    formMode: FormModeSchema,
    reuseMode: ReuseModeSchema,
    state: AttemptStateSchema,
    startedAt: Instant.nullable(),
    closedAt: Instant.nullable(),
    score: PracticeScoreSchema.nullable(),
  })
  .strict()
  .superRefine((item, context) => validateFormModeReuseMode(item, context));

/** The documented GET /attempts caller-owned page; no user, slots, answers, keys, or explanations are accepted. */
export const AttemptHistoryPageSchema = z
  .object({
    items: z.array(AttemptHistoryItemSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export type PracticeScore = z.infer<typeof PracticeScoreSchema>;
export type ResultSectionTotal = z.infer<typeof ResultSectionTotalSchema>;
export type ResultView = z.infer<typeof ResultViewSchema>;
export type ReleasedReviewItem = z.infer<typeof ReleasedReviewItemSchema>;
export type AuthorizedReleasedReview = z.infer<typeof AuthorizedReleasedReviewSchema>;
export type AttemptHistoryItem = z.infer<typeof AttemptHistoryItemSchema>;
export type AttemptHistoryPage = z.infer<typeof AttemptHistoryPageSchema>;

export const SectionDeficitSchema = z
  .object({
    sectionId: NonEmptyString,
    missingCount: z.number().int().positive(),
  })
  .strict();

export const AlternativeOptionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SHORTER_PROFILE"), blueprintVersionId: CanonicalUuid, name: NonEmptyString }).strict(),
  z
    .object({ kind: z.literal("REVIEW_MODE"), blueprintVersionId: CanonicalUuid, requiresRepeatConsent: z.literal(true) })
    .strict(),
  z.object({ kind: z.literal("WAIT_FOR_PUBLICATION") }).strict(),
]);

export const ErrorDetailsSchema = z
  .object({
    field: NonEmptyString.optional(),
    currentRevision: z.number().int().nonnegative().optional(),
    currentAnswer: ResponseValueSchema.optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
    existingAttemptId: CanonicalUuid.optional(),
    assemblyRunId: CanonicalUuid.optional(),
    blueprintVersionId: CanonicalUuid.optional(),
    reuseMode: ReuseModeSchema.optional(),
    sectionDeficits: z.array(SectionDeficitSchema).optional(),
    alternatives: z.array(AlternativeOptionSchema).optional(),
  })
  .strict();

const ErrorEnvelopeSchema = z
  .object({
    code: ErrorCodeSchema,
    message: NonEmptyString.max(1_024),
    requestId: NonEmptyString.max(256),
    details: ErrorDetailsSchema,
  })
  .strict();

/** Base structural shape shared by every documented JSON API error response. */
export const ErrorResponseSchema = z.object({ error: ErrorEnvelopeSchema }).strict();

export const StudentShortageDetailsSchema = ErrorDetailsSchema.extend({
  blueprintVersionId: CanonicalUuid,
  reuseMode: z.enum(["NEW_ONLY", "REVIEW_ALLOWED"]),
  // An empty list is valid only when a proved coupled constraint has no single-section deficit.
  sectionDeficits: z.array(SectionDeficitSchema),
  alternatives: z.array(AlternativeOptionSchema),
}).strict();

export const StudentShortageSchema = z
  .object({
    error: z
      .object({
        code: z.enum(["INSUFFICIENT_UNSEEN_INVENTORY", "INSUFFICIENT_ELIGIBLE_INVENTORY"]),
        message: NonEmptyString.max(1_024),
        requestId: NonEmptyString.max(256),
        details: StudentShortageDetailsSchema,
      })
      .strict(),
  })
  .strict();

const EmptyErrorDetailsSchema = z.object({}).strict();

export const ValidationErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("VALIDATION_ERROR"),
        message: NonEmptyString.max(1_024),
        requestId: NonEmptyString.max(256),
        details: ErrorDetailsSchema,
      })
      .strict(),
  })
  .strict();

export const AuthenticationErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("UNAUTHENTICATED"),
        message: NonEmptyString.max(1_024),
        requestId: NonEmptyString.max(256),
        details: EmptyErrorDetailsSchema,
      })
      .strict(),
  })
  .strict();

export const AuthorizationErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.enum(["FORBIDDEN", "CSRF_FAILED"]),
        message: NonEmptyString.max(1_024),
        requestId: NonEmptyString.max(256),
        details: EmptyErrorDetailsSchema,
      })
      .strict(),
  })
  .strict();

export const ConcurrentAttemptExistsResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("CONCURRENT_ATTEMPT_EXISTS"),
        message: NonEmptyString.max(1_024),
        requestId: NonEmptyString.max(256),
        details: z.object({ existingAttemptId: CanonicalUuid }).strict(),
      })
      .strict(),
  })
  .strict();

export const SearchExhaustedErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("SEARCH_EXHAUSTED"),
        message: NonEmptyString.max(1_024),
        requestId: NonEmptyString.max(256),
        // No deficits or alternatives: bounded search did not prove inventory infeasibility.
        details: z
          .object({
            assemblyRunId: CanonicalUuid.optional(),
            blueprintVersionId: CanonicalUuid.optional(),
            reuseMode: ReuseModeSchema.optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const OtherDocumentedErrorCodeSchema = ErrorCodeSchema.exclude([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CSRF_FAILED",
  "CONCURRENT_ATTEMPT_EXISTS",
  "VALIDATION_ERROR",
  "INSUFFICIENT_UNSEEN_INVENTORY",
  "INSUFFICIENT_ELIGIBLE_INVENTORY",
  "SEARCH_EXHAUSTED",
]);

const OtherDocumentedErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: OtherDocumentedErrorCodeSchema,
        message: NonEmptyString.max(1_024),
        requestId: NonEmptyString.max(256),
        details: ErrorDetailsSchema,
      })
      .strict(),
  })
  .strict();

/** Strict endpoint-response union; special error codes require their typed detail contracts. */
export const DocumentedErrorResponseSchema = z.union([
  StudentShortageSchema,
  ValidationErrorResponseSchema,
  AuthenticationErrorResponseSchema,
  AuthorizationErrorResponseSchema,
  ConcurrentAttemptExistsResponseSchema,
  SearchExhaustedErrorResponseSchema,
  OtherDocumentedErrorResponseSchema,
]);

export const ErrorHttpStatusByCode = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CSRF_FAILED: 403,
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  ATTEMPT_CLOSED: 409,
  SECTION_CLOSED: 409,
  RESULT_NOT_READY: 409,
  CONCURRENT_MODIFICATION: 409,
  CONCURRENT_ATTEMPT_EXISTS: 409,
  CONTENT_WITHDRAWN: 410,
  VALIDATION_ERROR: 422,
  INSUFFICIENT_UNSEEN_INVENTORY: 422,
  INSUFFICIENT_ELIGIBLE_INVENTORY: 422,
  CONSTRAINT_CONFLICT: 422,
  RIGHTS_BLOCKED: 422,
  UNSUPPORTED_TYPE: 422,
  RATE_LIMITED: 429,
  TEMPORARILY_UNAVAILABLE: 503,
  SEARCH_EXHAUSTED: 503,
  TIMEOUT: 503,
} as const satisfies Record<z.infer<typeof ErrorCodeSchema>, 401 | 403 | 409 | 410 | 422 | 429 | 503>;

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type StudentShortage = z.infer<typeof StudentShortageSchema>;
export type DocumentedErrorResponse = z.infer<typeof DocumentedErrorResponseSchema>;
export type ConcurrentAttemptExistsResponse = z.infer<typeof ConcurrentAttemptExistsResponseSchema>;

/** Parses and serializes only a strict, documented response shape. */
export function serializeErrorResponse(response: unknown): string {
  return JSON.stringify(DocumentedErrorResponseSchema.parse(response));
}

type IssueReporter = (path: PropertyKey[], message: string) => void;

function validateFormModeReuseMode(
  value: { formMode: z.infer<typeof FormModeSchema>; reuseMode: z.infer<typeof ReuseModeSchema> },
  context: z.RefinementCtx,
): void {
  const valid =
    (value.formMode === "PERSONALIZED_PRACTICE" && (value.reuseMode === "NEW_ONLY" || value.reuseMode === "REVIEW_ALLOWED")) ||
    (value.formMode === "PUBLISHED_FIXED" && value.reuseMode === "FIXED_AS_PUBLISHED");
  if (!valid) {
    context.addIssue({ code: "custom", path: ["reuseMode"], message: "Reuse mode is not valid for form mode" });
  }
}

/** Produces the only question-content projection permitted in student-facing DTOs. */
export function toStudentQuestion(question: QuestionVersion): StudentQuestion {
  return StudentQuestionSchema.parse({ content: question.content, interaction: question.interaction });
}

/** Validates a save payload against the interaction frozen in the delivered question. */
export function parseResponseForInteraction(interaction: Interaction, value: unknown): ResponseValue {
  const response = ResponseValueSchema.parse(value);
  if (response.type !== interaction.type) {
    throw new z.ZodError([
      { code: "custom", path: ["type"], message: "Response type must match the interaction type" },
    ]);
  }
  const errors: z.core.$ZodIssue[] = [];
  validateResponse(interaction, response, (path, message) => errors.push({ code: "custom", path, message }), []);
  if (errors.length > 0) throw new z.ZodError(errors);
  return response;
}

function validateAnswerKey(
  interaction: Interaction,
  answerKey: AnswerKey,
  report: IssueReporter,
  path: PropertyKey[],
): void {
  if (answerKey.type !== interaction.type) {
    report(path, "Answer key type must match interaction type");
    return;
  }
  if (interaction.type === "TRUE_FALSE_GROUP" && answerKey.type === "TRUE_FALSE_GROUP") {
    validateExactIds(interaction.statements.map((statement) => statement.id), Object.keys(answerKey.values), report, path, "Answer key");
    return;
  }
  if (interaction.type === "SINGLE_CHOICE" && answerKey.type === "SINGLE_CHOICE") {
    validateKnownIds(interaction.options.map((option) => option.id), [answerKey.optionId], report, path, "Answer key");
    return;
  }
  if (interaction.type === "MULTIPLE_CHOICE" && answerKey.type === "MULTIPLE_CHOICE") {
    validateSelectionIds(interaction.options.map((option) => option.id), answerKey.optionIds, interaction.minSelections, interaction.maxSelections, report, path, "Answer key");
  }
}

function validateResponse(
  interaction: Interaction,
  response: ResponseValue,
  report: IssueReporter,
  path: PropertyKey[],
): void {
  if (interaction.type === "TRUE_FALSE_GROUP" && response.type === "TRUE_FALSE_GROUP") {
    validateExactIds(interaction.statements.map((statement) => statement.id), Object.keys(response.values), report, path, "Response");
    return;
  }
  if (interaction.type === "SINGLE_CHOICE" && response.type === "SINGLE_CHOICE") {
    if (response.optionId !== null) validateKnownIds(interaction.options.map((option) => option.id), [response.optionId], report, path, "Response");
    return;
  }
  if (interaction.type === "MULTIPLE_CHOICE" && response.type === "MULTIPLE_CHOICE") {
    if (response.optionIds.length > 0) {
      validateSelectionIds(interaction.options.map((option) => option.id), response.optionIds, interaction.minSelections, interaction.maxSelections, report, path, "Response");
    }
  }
}

function validateSelectionIds(
  knownIds: string[],
  selectedIds: string[],
  min: number,
  max: number,
  report: IssueReporter,
  path: PropertyKey[],
  label: string,
): void {
  if (new Set(selectedIds).size !== selectedIds.length) {
    report(path, `${label} selections must be unique`);
  }
  if (selectedIds.length < min || selectedIds.length > max) {
    report(path, `${label} selection count is outside the interaction range`);
  }
  validateKnownIds(knownIds, selectedIds, report, path, label);
}

function validateKnownIds(
  knownIds: string[],
  actualIds: string[],
  report: IssueReporter,
  path: PropertyKey[],
  label: string,
): void {
  for (const id of actualIds) {
    if (!knownIds.includes(id)) report(path, `${label} references an unknown option`);
  }
}

function validateExactIds(
  expectedIds: string[],
  actualIds: string[],
  report: IssueReporter,
  path: PropertyKey[],
  label: string,
): void {
  if (actualIds.length !== expectedIds.length || actualIds.some((id) => !expectedIds.includes(id))) {
    report(path, `${label} must cover every statement exactly once`);
  }
}
