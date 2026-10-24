import { z } from "zod";

import {
  AnswerKeySchema,
  BlockSchema,
  InteractionSchema,
  ReleasedReviewItemSchema,
  SectionSchema,
  StudentQuestionSchema,
} from "./index.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = z.string().regex(UUID_PATTERN, "Expected a lowercase UUID");
const Hash = z.string().regex(/^sha256:[0-9a-f]{64}$/, "Expected sha256: followed by 64 lowercase hexadecimal digits");
const Instant = z.string().refine(
  (value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
  "Expected an RFC3339 timestamp with an offset",
);
const UTCDateTime = z.iso
  .datetime({ precision: 6 })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
const PositiveSafeInteger = z.number().int().positive().refine(Number.isSafeInteger, "Expected a positive safe integer");
const BlocksSchema = StudentQuestionSchema.shape.content;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ANSWER_KEY_PROBE_SLOT_ID = "11111111-1111-4111-8111-111111111111";

const WorkflowStateSchema = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "QUARANTINED",
  "RETIRED",
]);
const RightsStatusSchema = z.enum([
  "OWNED",
  "LICENSED",
  "OPEN_LICENSE",
  "PUBLIC_DOMAIN",
  "REFERENCE_ONLY",
  "UNKNOWN",
  "REVOKED",
]);
const RightsUseSchema = z.enum(["DISPLAY", "ADAPT", "GENERATE", "TRAIN"]);

const CurrentRightsSchema = z
  .object({
    decisionId: UUID,
    revision: PositiveSafeInteger,
    status: RightsStatusSchema,
    allowedUses: z.array(RightsUseSchema),
    territory: z.array(z.string()),
    validFrom: Instant.nullable(),
    validTo: Instant.nullable(),
  })
  .strict();

const SourceSchema = z
  .object({
    sourceVersionId: UUID,
    contentHash: Hash,
    origin: z.enum(["OWNED", "EXTERNAL"]).nullable(),
    currentRights: CurrentRightsSchema.nullable(),
  })
  .strict();

const StaffReviewQuestionSchema = z
  .object({
    language: z.literal("vi-VN"),
    content: BlocksSchema,
    interaction: InteractionSchema,
    answerKey: AnswerKeySchema,
    explanation: BlocksSchema,
    scoringPolicyVersion: z.string(),
    stimulus: z
      .object({
        versionId: UUID,
        contentHash: Hash,
        content: BlocksSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

const PreviewSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("AVAILABLE"),
      question: StaffReviewQuestionSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("BLOCKED"),
      reason: z.enum(["RIGHTS_BLOCKED", "CONTENT_UNSUPPORTED", "WORKFLOW_HELD"]),
    })
    .strict(),
]);

const StaffReviewContextObjectSchema = z
  .object({
    schemaVersion: z.literal("staff-review-context/1"),
    observedAt: Instant,
    accessBasis: z.enum(["BANK_MANAGER", "AUTHOR_OWN", "REVIEW_QUEUE"]),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    version: z
      .object({
        questionId: UUID,
        versionId: UUID,
        versionNo: PositiveSafeInteger,
        parentVersionId: UUID.nullable(),
        section: SectionSchema,
        contentHash: Hash,
      })
      .strict(),
    workflow: z
      .object({
        state: WorkflowStateSchema,
        revision: PositiveSafeInteger,
      })
      .strict(),
    sources: z.array(SourceSchema).max(100),
    preview: PreviewSchema,
    rightsEvidenceIncluded: z.literal(false),
    publicationEligibility: z.literal("NOT_EVALUATED"),
  })
  .strict();

function hasImageBlock(blocks: readonly z.infer<typeof BlockSchema>[]): boolean {
  return blocks.some((block) => block.type === "image");
}

function validateAnswerKeyAgainstInteraction(
  question: z.infer<typeof StaffReviewQuestionSchema>,
  context: z.RefinementCtx,
): void {
  // Reuse the established released-review semantic validator without changing its contract.
  const checked = ReleasedReviewItemSchema.safeParse({
    slotId: ANSWER_KEY_PROBE_SLOT_ID,
    earned: 0,
    response: null,
    question: {
      slotId: ANSWER_KEY_PROBE_SLOT_ID,
      sectionId: "staff-review-context",
      ordinal: 1,
      stimulus: null,
      content: question.content,
      interaction: question.interaction,
    },
    correctAnswer: question.answerKey,
    explanation: question.explanation,
  });

  if (checked.success) return;
  for (const issue of checked.error.issues) {
    if (issue.path[0] === "correctAnswer") {
      context.addIssue({
        code: "custom",
        path: ["preview", "question", "answerKey", ...issue.path.slice(1)],
        message: issue.message,
      });
    }
  }
}

function rejectAvailableImages(
  question: z.infer<typeof StaffReviewQuestionSchema>,
  context: z.RefinementCtx,
): void {
  const reportImage = (blocks: readonly z.infer<typeof BlockSchema>[], path: PropertyKey[]): void => {
    blocks.forEach((block, index) => {
      if (block.type === "image") {
        context.addIssue({
          code: "custom",
          path: [...path, index],
          message: "Available staff previews cannot include image blocks",
        });
      }
    });
  };

  reportImage(question.content, ["preview", "question", "content"]);
  if (question.interaction.type === "TRUE_FALSE_GROUP") {
    question.interaction.statements.forEach((statement, index) => {
      reportImage(statement.content, ["preview", "question", "interaction", "statements", index, "content"]);
    });
  } else {
    question.interaction.options.forEach((option, index) => {
      reportImage(option.content, ["preview", "question", "interaction", "options", index, "content"]);
    });
  }
  reportImage(question.explanation, ["preview", "question", "explanation"]);
  if (question.stimulus !== null) reportImage(question.stimulus.content, ["preview", "question", "stimulus", "content"]);
}

const AVAILABLE_RIGHTS_STATUSES = new Set(["OWNED", "LICENSED", "OPEN_LICENSE", "PUBLIC_DOMAIN"]);

function validateAvailableRights(
  value: z.infer<typeof StaffReviewContextObjectSchema>,
  context: z.RefinementCtx,
): void {
  const observedAt = Date.parse(value.observedAt);
  if (value.sources.length === 0) {
    context.addIssue({ code: "custom", path: ["sources"], message: "Available previews require a nonempty source closure" });
  }

  value.sources.forEach((source, index) => {
    const path = ["sources", index, "currentRights"] as PropertyKey[];
    const rights = source.currentRights;
    if (rights === null) {
      context.addIssue({ code: "custom", path, message: "Available previews require current rights for every source" });
      return;
    }

    if (!AVAILABLE_RIGHTS_STATUSES.has(rights.status)) {
      context.addIssue({ code: "custom", path: [...path, "status"], message: "Current rights status does not permit display" });
    }
    if (!rights.allowedUses.includes("DISPLAY")) {
      context.addIssue({ code: "custom", path: [...path, "allowedUses"], message: "Current rights must include DISPLAY" });
    }
    if (!rights.territory.includes("VN") && !rights.territory.includes("WORLDWIDE")) {
      context.addIssue({ code: "custom", path: [...path, "territory"], message: "Current rights must cover VN or WORLDWIDE" });
    }

    const validFrom = rights.validFrom === null ? Number.NaN : Date.parse(rights.validFrom);
    if (!Number.isFinite(validFrom)) {
      context.addIssue({ code: "custom", path: [...path, "validFrom"], message: "Current rights require a parseable validFrom" });
    } else if (validFrom > observedAt) {
      context.addIssue({ code: "custom", path: [...path, "validFrom"], message: "Current rights must be valid by observedAt" });
    }

    if (rights.validTo !== null) {
      const validTo = Date.parse(rights.validTo);
      if (!Number.isFinite(validTo) || validTo <= observedAt) {
        context.addIssue({ code: "custom", path: [...path, "validTo"], message: "Current rights validTo must be exclusive and after observedAt" });
      }
    }
  });
}

/** Strict private DTO for GET /api/v1/question-versions/{versionId}/review-context. */
export const StaffReviewContextSchema = StaffReviewContextObjectSchema.superRefine((value, context) => {
  const held = value.workflow.state === "QUARANTINED" || value.workflow.state === "RETIRED";
  if (held && (value.preview.status !== "BLOCKED" || value.preview.reason !== "WORKFLOW_HELD")) {
    context.addIssue({ code: "custom", path: ["preview"], message: "Held workflows require a WORKFLOW_HELD block" });
  } else if (!held && value.preview.status === "BLOCKED" && value.preview.reason === "WORKFLOW_HELD") {
    context.addIssue({ code: "custom", path: ["preview", "reason"], message: "WORKFLOW_HELD is reserved for held workflows" });
  }

  for (let index = 1; index < value.sources.length; index += 1) {
    const previous = value.sources[index - 1]!.sourceVersionId;
    const current = value.sources[index]!.sourceVersionId;
    if (previous >= current) {
      context.addIssue({
        code: "custom",
        path: ["sources", index, "sourceVersionId"],
        message: "Source UUIDs must be unique and sorted ascending",
      });
    }
  }

  if (value.preview.status === "AVAILABLE") {
    validateAvailableRights(value, context);
    rejectAvailableImages(value.preview.question, context);
    validateAnswerKeyAgainstInteraction(value.preview.question, context);
  }

  const serialized = JSON.stringify(value);
  if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
    context.addIssue({ code: "custom", message: "Staff review context must not exceed 1 MiB serialized" });
  }
});

export type StaffReviewContext = z.infer<typeof StaffReviewContextSchema>;

const MAX_RECORDED_EVIDENCE_BYTES = 64 * 1024;

const TextAvailableRecordedEvidenceSchema = z
  .object({
    state: z.literal("TEXT_AVAILABLE"),
    text: z.string().refine((value) => value.trim().length > 0, "Recorded evidence text must not be blank"),
  })
  .strict()
  .superRefine((value, context) => {
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > MAX_RECORDED_EVIDENCE_BYTES) {
      context.addIssue({ code: "custom", path: ["text"], message: "Recorded evidence must not exceed 64 KiB serialized including its container" });
    }
  });

const RecordedEvidenceSchema = z.discriminatedUnion("state", [
  TextAvailableRecordedEvidenceSchema,
  z.object({ state: z.literal("NOT_RECORDED") }).strict(),
]);

const StaffReviewEvidenceSourceSchema = z
  .object({
    sourceVersionId: UUID,
    currentDecision: z
      .object({
        decisionId: UUID,
        revision: PositiveSafeInteger,
        status: RightsStatusSchema,
        recordedEvidence: RecordedEvidenceSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

const StaffReviewEvidenceObjectSchema = z
  .object({
    schemaVersion: z.literal("staff-review-evidence/1"),
    observedAt: Instant,
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.enum(["BANK_MANAGER", "REVIEW_QUEUE"]),
    version: z
      .object({
        versionId: UUID,
        contentHash: Hash,
        workflowRevision: PositiveSafeInteger,
      })
      .strict(),
    sources: z.array(StaffReviewEvidenceSourceSchema).max(100),
    qualification: z.literal("NOT_ATTESTED_BY_PLATFORM"),
    publicationEligibility: z.literal("NOT_EVALUATED"),
  })
  .strict();

/** Strict private DTO for GET /api/v1/question-versions/{versionId}/review-evidence. */
export const StaffReviewEvidenceSchema = StaffReviewEvidenceObjectSchema.superRefine((value, context) => {
  for (let index = 1; index < value.sources.length; index += 1) {
    const previous = value.sources[index - 1]!.sourceVersionId;
    const current = value.sources[index]!.sourceVersionId;
    if (previous >= current) {
      context.addIssue({
        code: "custom",
        path: ["sources", index, "sourceVersionId"],
        message: "Source UUIDs must be unique and sorted ascending",
      });
    }
  }

  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
    context.addIssue({ code: "custom", message: "Staff review evidence must not exceed 1 MiB serialized" });
  }
});

export type StaffReviewEvidence = z.infer<typeof StaffReviewEvidenceSchema>;

/** Strict private request DTO for POST /api/v1/question-versions/{versionId}/submit-review. */
const PositiveSafeRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const StaffSubmitReviewRequestSchema = z
  .object({ expectedRevision: PositiveSafeRevision })
  .strict();

/** Strict operation receipt for the existing Bank submit-review command. */
export const StaffSubmitReviewResponseSchema = z
  .object({
    versionId: UUID,
    state: z.literal("IN_REVIEW"),
    revision: PositiveSafeRevision,
  })
  .strict();

export type StaffSubmitReviewRequest = z.infer<typeof StaffSubmitReviewRequestSchema>;
export type StaffSubmitReviewResponse = z.infer<typeof StaffSubmitReviewResponseSchema>;

const NonBlankReason = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => value.trim().length > 0, "Expected a nonblank reason");

const StaffRejectReviewRubricSchema = z
  .object({
    correctness: z.boolean(),
    unambiguous: z.boolean(),
    relevant: z.boolean(),
    language: z.boolean(),
    explanation: z.boolean(),
    rights: z.boolean(),
  })
  .strict();

/** Strict private request DTO for a staff review rejection using the existing reviews command. */
export const StaffRejectReviewRequestSchema = z
  .object({
    expectedRevision: PositiveSafeRevision,
    contentHash: Hash,
    decision: z.literal("REJECT"),
    rubric: StaffRejectReviewRubricSchema,
    reason: NonBlankReason,
  })
  .strict();

/** Strict operation receipt for the existing Bank review rejection command. */
export const StaffRejectReviewResponseSchema = z
  .object({
    reviewId: UUID,
    state: z.literal("REJECTED"),
    revision: PositiveSafeRevision,
  })
  .strict();

export type StaffRejectReviewRequest = z.infer<typeof StaffRejectReviewRequestSchema>;
export type StaffRejectReviewResponse = z.infer<typeof StaffRejectReviewResponseSchema>;

/** Strict private request DTO for a staff quarantine using the existing quarantine command. */
export const StaffQuarantineRequestSchema = z
  .object({
    expectedRevision: PositiveSafeRevision,
    reason: NonBlankReason,
  })
  .strict();

/** Strict operation receipt for the existing Bank quarantine command. */
export const StaffQuarantineResponseSchema = z
  .object({
    state: z.literal("QUARANTINED"),
    revision: PositiveSafeRevision,
  })
  .strict();

export type StaffQuarantineRequest = z.infer<typeof StaffQuarantineRequestSchema>;
export type StaffQuarantineResponse = z.infer<typeof StaffQuarantineResponseSchema>;

const StaffReviewHistoryEntrySchema = z
  .object({
    reviewId: UUID,
    recordedAt: UTCDateTime,
    decision: z.enum(["APPROVE", "REJECT"]),
    rubric: StaffRejectReviewRubricSchema,
    reason: NonBlankReason,
  })
  .strict();

/** Strict private projection of bounded immutable review decisions for one version. */
export const StaffReviewHistorySchema = z
  .object({
    schemaVersion: z.literal("staff-review-history/1"),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.literal("BANK_MANAGER"),
    observedAt: UTCDateTime,
    version: z
      .object({
        versionId: UUID,
        contentHash: Hash,
        workflowRevision: PositiveSafeRevision,
      })
      .strict(),
    workflowState: WorkflowStateSchema,
    qualification: z.literal("NOT_ATTESTED_BY_PLATFORM"),
    publicationEligibility: z.literal("NOT_EVALUATED"),
    limit: z.literal(20),
    truncated: z.boolean(),
    reviews: z.array(StaffReviewHistoryEntrySchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const seenReviewIds = new Set<string>();
    value.reviews.forEach((review, index) => {
      if (seenReviewIds.has(review.reviewId)) {
        context.addIssue({
          code: "custom",
          path: ["reviews", index, "reviewId"],
          message: "Review IDs must be unique",
        });
      }
      seenReviewIds.add(review.reviewId);

      if (index === 0) return;
      const previous = value.reviews[index - 1]!;
      if (previous.recordedAt < review.recordedAt ||
          previous.recordedAt === review.recordedAt && previous.reviewId <= review.reviewId) {
        context.addIssue({
          code: "custom",
          path: ["reviews", index],
          message: "Reviews must be ordered newest first by timestamp and review ID",
        });
      }
    });

    if (value.truncated && value.reviews.length !== 20) {
      context.addIssue({
        code: "custom",
        path: ["reviews"],
        message: "Truncated history must contain the full twenty-row limit",
      });
    }

    const serialized = JSON.stringify(value);
    if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
      context.addIssue({ code: "custom", message: "Staff review history must not exceed 1 MiB serialized" });
    }
  });

export type StaffReviewHistory = z.infer<typeof StaffReviewHistorySchema>;

const DatasetPreflightCount = z.number().int().min(0).max(100);
const DatasetPreflightBlockerSchema = z.enum([
  "CURRENT_RIGHTS_UNVERIFIED",
  "DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW",
  "HUMAN_EQUIVALENCE_REVIEW_REQUIRED",
  "LAWFUL_INVENTORY_UNVERIFIED",
  "NAMED_HUMAN_AUTHOR_REQUIRED",
  "NAMED_INDEPENDENT_REVIEWER_REQUIRED",
  "STARTER_TARGET_SHORTFALL",
]);

/** Strict private pins for one explicit canonical dataset preflight. */
export const StaffDatasetPreflightRequestSchema = z
  .object({
    versions: z
      .array(z.object({ versionId: UUID, contentHash: Hash }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.versions.forEach((version, index) => {
      if (seen.has(version.versionId)) {
        context.addIssue({
          code: "custom",
          path: ["versions", index, "versionId"],
          message: "Version IDs must be unique",
        });
      }
      seen.add(version.versionId);
    });
  });

export type StaffDatasetPreflightRequest = z.infer<typeof StaffDatasetPreflightRequestSchema>;

const DatasetPreflightTargetsSchema = z
  .object({ MATH: z.literal(12), READING: z.literal(6), SCIENCE: z.literal(12) })
  .strict();

const DatasetPreflightSectionCountsSchema = z
  .object({ MATH: DatasetPreflightCount, READING: DatasetPreflightCount, SCIENCE: DatasetPreflightCount })
  .strict();

const DatasetPreflightInteractionCountsSchema = z
  .object({
    SINGLE_CHOICE: DatasetPreflightCount,
    MULTIPLE_CHOICE: DatasetPreflightCount,
    TRUE_FALSE_GROUP: DatasetPreflightCount,
  })
  .strict();

const DatasetPreflightVersionsSchema = z
  .array(
    z
      .object({
        versionId: UUID,
        contentHash: Hash,
        workflowRevision: PositiveSafeRevision,
        state: WorkflowStateSchema,
      })
      .strict(),
  )
  .min(1)
  .max(100);

const REQUIRED_DATASET_PREFLIGHT_BLOCKERS = [
  "CURRENT_RIGHTS_UNVERIFIED",
  "HUMAN_EQUIVALENCE_REVIEW_REQUIRED",
  "LAWFUL_INVENTORY_UNVERIFIED",
  "NAMED_HUMAN_AUTHOR_REQUIRED",
  "NAMED_INDEPENDENT_REVIEWER_REQUIRED",
] as const;

/** Strict bounded manager-only projection of canonical preflight observations. */
export const StaffDatasetPreflightSchema = z
  .object({
    schemaVersion: z.literal("staff-dataset-preflight/1"),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.literal("BANK_MANAGER"),
    scope: z.literal("CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION"),
    generatedAt: UTCDateTime,
    qualification: z.literal("NOT_ATTESTED_BY_PLATFORM"),
    publicationEligibility: z.literal("NOT_EVALUATED"),
    publishing: z.literal(false),
    eligibilityRevision: z.string().regex(/^(0|[1-9][0-9]*)$/, "Expected a nonnegative decimal revision"),
    targets: DatasetPreflightTargetsSchema,
    counts: z
      .object({
        total: z.number().int().min(1).max(100),
        bySection: DatasetPreflightSectionCountsSchema,
        byInteractionType: DatasetPreflightInteractionCountsSchema,
      })
      .strict(),
    shortfalls: z
      .object({ MATH: DatasetPreflightCount, READING: DatasetPreflightCount, SCIENCE: DatasetPreflightCount })
      .strict(),
    duplicateFingerprintGroupCount: DatasetPreflightCount,
    blockerCodes: z.array(DatasetPreflightBlockerSchema).min(5).max(7),
    versions: DatasetPreflightVersionsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.counts.total !== value.versions.length) {
      context.addIssue({ code: "custom", path: ["counts", "total"], message: "Total count must equal the version count" });
    }

    const sectionTotal = Object.values(value.counts.bySection).reduce((sum, count) => sum + count, 0);
    if (sectionTotal !== value.counts.total) {
      context.addIssue({ code: "custom", path: ["counts", "bySection"], message: "Section counts must sum to total" });
    }

    const interactionTotal = Object.values(value.counts.byInteractionType).reduce((sum, count) => sum + count, 0);
    if (interactionTotal !== value.counts.total) {
      context.addIssue({ code: "custom", path: ["counts", "byInteractionType"], message: "Interaction counts must sum to total" });
    }

    for (const section of ["MATH", "READING", "SCIENCE"] as const) {
      const expectedShortfall = Math.max(0, value.targets[section] - value.counts.bySection[section]);
      if (value.shortfalls[section] !== expectedShortfall) {
        context.addIssue({ code: "custom", path: ["shortfalls", section], message: "Shortfall must match the target and section count" });
      }
    }

    const hasShortfall = Object.values(value.shortfalls).some((shortfall) => shortfall > 0);
    const expectedBlockers: z.infer<typeof DatasetPreflightBlockerSchema>[] = [...REQUIRED_DATASET_PREFLIGHT_BLOCKERS];
    if (value.duplicateFingerprintGroupCount > 0) expectedBlockers.push("DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW");
    if (hasShortfall) expectedBlockers.push("STARTER_TARGET_SHORTFALL");
    expectedBlockers.sort();
    if (value.blockerCodes.length !== expectedBlockers.length
        || value.blockerCodes.some((code, index) => code !== expectedBlockers[index])) {
      context.addIssue({ code: "custom", path: ["blockerCodes"], message: "Blocker codes must be complete, unique, and sorted" });
    }

    const seenVersionIds = new Set<string>();
    value.versions.forEach((version, index) => {
      if (seenVersionIds.has(version.versionId)) {
        context.addIssue({ code: "custom", path: ["versions", index, "versionId"], message: "Version IDs must be unique" });
      }
      seenVersionIds.add(version.versionId);
      if (index > 0 && value.versions[index - 1]!.versionId >= version.versionId) {
        context.addIssue({ code: "custom", path: ["versions", index, "versionId"], message: "Version UUIDs must be sorted ascending" });
      }
    });

    const serialized = JSON.stringify(value);
    if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
      context.addIssue({ code: "custom", message: "Staff dataset preflight must not exceed 1 MiB serialized" });
    }
  });

export type StaffDatasetPreflight = z.infer<typeof StaffDatasetPreflightSchema>;
