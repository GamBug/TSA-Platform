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

const FixedAssemblyOutcomeSchema = z.enum(["SUCCESS", "FAILURE"]);
const FixedAssemblySectionSchema = z.enum(["MATH", "READING", "SCIENCE"]);

const StaffFixedAssemblyRunSchema = z
  .object({
    assemblyRunId: UUID,
    blueprintVersionId: UUID,
    outcome: FixedAssemblyOutcomeSchema,
    createdAt: UTCDateTime,
  })
  .strict();

/** Strict private projection of captured fixed-reference run metadata only. */
export const StaffFixedAssemblyRunListSchema = z
  .object({
    schemaVersion: z.literal("staff-fixed-assembly-runs/1"),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.literal("BANK_MANAGER"),
    observedAt: UTCDateTime,
    scope: z.literal("CAPTURED_FIXED_REFERENCE_RUNS_ONLY"),
    limit: z.literal(20),
    truncated: z.boolean(),
    runs: z.array(StaffFixedAssemblyRunSchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const seenRunIds = new Set<string>();
    value.runs.forEach((run, index) => {
      if (seenRunIds.has(run.assemblyRunId)) {
        context.addIssue({
          code: "custom",
          path: ["runs", index, "assemblyRunId"],
          message: "Assembly run IDs must be unique",
        });
      }
      seenRunIds.add(run.assemblyRunId);

      if (index === 0) return;
      const previous = value.runs[index - 1]!;
      if (previous.createdAt < run.createdAt ||
          previous.createdAt === run.createdAt && previous.assemblyRunId <= run.assemblyRunId) {
        context.addIssue({
          code: "custom",
          path: ["runs", index],
          message: "Runs must be ordered newest first by timestamp and run ID",
        });
      }
    });

    if (value.truncated && value.runs.length !== 20) {
      context.addIssue({ code: "custom", path: ["runs"], message: "Truncated results must contain the full twenty-row limit" });
    }

    const serialized = JSON.stringify(value);
    if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
      context.addIssue({ code: "custom", message: "Fixed assembly run list must not exceed 1 MiB serialized" });
    }
  });

export type StaffFixedAssemblyRunList = z.infer<typeof StaffFixedAssemblyRunListSchema>;

const StaffFixedAssemblyDiagnosticSectionSchema = z
  .object({
    section: FixedAssemblySectionSchema,
    requiredCount: z.number().int().min(1).max(200),
    selectedCount: z.number().int().min(0).max(200),
  })
  .strict();

/** Strict private aggregate-only diagnostic; no candidate or manifest data is exposed. */
export const StaffFixedAssemblyDiagnosticSchema = z
  .object({
    schemaVersion: z.literal("staff-fixed-assembly-diagnostic/1"),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.literal("BANK_MANAGER"),
    observedAt: UTCDateTime,
    scope: z.literal("CAPTURED_FIXED_REFERENCE_RUN_ONLY"),
    run: StaffFixedAssemblyRunSchema,
    algorithmVersion: z.literal("assembly/1"),
    replayVerified: z.literal(true),
    createsForm: z.literal(false),
    qualification: z.literal("NOT_ATTESTED_BY_PLATFORM"),
    publicationEligibility: z.literal("NOT_EVALUATED"),
    outcome: FixedAssemblyOutcomeSchema,
    failureCode: z.enum(["CONSTRAINT_CONFLICT", "INSUFFICIENT_ELIGIBLE_INVENTORY", "SEARCH_EXHAUSTED"]).nullable(),
    visitedNodes: z.number().int().min(0).max(50_000),
    nodeLimit: z.number().int().min(0).max(50_000),
    capturedUnitCount: z.number().int().min(0).max(10_000),
    unitLimit: z.number().int().min(0).max(2_000),
    capturedCandidateCount: z.number().int().min(0).max(2_000_000),
    selectedCount: z.number().int().min(0).max(200),
    sections: z.array(StaffFixedAssemblyDiagnosticSectionSchema).min(1).max(3),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.run.outcome !== value.outcome) {
      context.addIssue({ code: "custom", path: ["run", "outcome"], message: "Run outcome must match the aggregate outcome" });
    }
    if (value.visitedNodes > value.nodeLimit) {
      context.addIssue({ code: "custom", path: ["visitedNodes"], message: "Visited nodes cannot exceed the captured node limit" });
    }

    let requiredTotal = 0;
    let selectedTotal = 0;
    let previousSection = -1;
    const sectionOrder = new Map([["MATH", 0], ["READING", 1], ["SCIENCE", 2]]);
    value.sections.forEach((section, index) => {
      const order = sectionOrder.get(section.section)!;
      if (order <= previousSection) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "section"],
          message: "Sections must be unique and follow the MATH, READING, SCIENCE order",
        });
      }
      previousSection = order;
      requiredTotal += section.requiredCount;
      selectedTotal += section.selectedCount;
    });

    if (requiredTotal > 200) {
      context.addIssue({ code: "custom", path: ["sections"], message: "Required count total cannot exceed 200" });
    }
    if (selectedTotal !== value.selectedCount) {
      context.addIssue({ code: "custom", path: ["selectedCount"], message: "Selected count must equal the section total" });
    }

    if (value.outcome === "SUCCESS") {
      if (value.failureCode !== null) {
        context.addIssue({ code: "custom", path: ["failureCode"], message: "Successful runs must not have a failure code" });
      }
      value.sections.forEach((section, index) => {
        if (section.selectedCount !== section.requiredCount) {
          context.addIssue({
            code: "custom",
            path: ["sections", index, "selectedCount"],
            message: "Successful runs must select every required item in each section",
          });
        }
      });
    } else {
      if (value.failureCode === null) {
        context.addIssue({ code: "custom", path: ["failureCode"], message: "Failed runs require a captured failure code" });
      }
      value.sections.forEach((section, index) => {
        if (section.selectedCount !== 0) {
          context.addIssue({
            code: "custom",
            path: ["sections", index, "selectedCount"],
            message: "Failed runs must not expose partial selections",
          });
        }
      });
    }

    const serialized = JSON.stringify(value);
    if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
      context.addIssue({ code: "custom", message: "Fixed assembly diagnostic must not exceed 1 MiB serialized" });
    }
  });

export type StaffFixedAssemblyDiagnostic = z.infer<typeof StaffFixedAssemblyDiagnosticSchema>;

const RehearsalFailureCodeSchema = z.enum([
  "CONSTRAINT_CONFLICT",
  "INSUFFICIENT_ELIGIBLE_INVENTORY",
  "SEARCH_EXHAUSTED",
]);
const RehearsalWindowMinutesSchema = z.number().int().min(1).max(1_440);

function utcMicroseconds(value: string): bigint | null {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(\d{6})Z$/.exec(value);
  const epochMilliseconds = Date.parse(value);
  if (match === null || !Number.isFinite(epochMilliseconds)) return null;
  return BigInt(epochMilliseconds) * 1_000n + BigInt(match[1]!.slice(3));
}

function enforceStaffResponseByteLimit(value: unknown, context: z.RefinementCtx, label: string): void {
  const serialized = JSON.stringify(value);
  if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > MAX_RESPONSE_BYTES) {
    context.addIssue({ code: "custom", message: `${label} must not exceed 1 MiB serialized` });
  }
}

const StaffFixedRehearsalBlueprintItemSchema = z
  .object({
    blueprintVersionId: UUID,
    contentHash: Hash,
    name: z.string().max(4_096).refine((value) => value.trim().length > 0, "Expected a nonblank blueprint name"),
    section: FixedAssemblySectionSchema,
    questionCount: z.union([z.literal(2), z.literal(4)]),
    durationSeconds: z.number().int().min(1).max(21_600),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedCount = value.section === "READING" ? 2 : 4;
    if (value.questionCount !== expectedCount) {
      context.addIssue({ code: "custom", path: ["questionCount"], message: "Question count must match the selected MVP domain" });
    }
  });

/** EXAM_MANAGER-only list of exact supported one-domain blueprint pins. */
export const StaffFixedRehearsalBlueprintListSchema = z
  .object({
    schemaVersion: z.literal("staff-fixed-rehearsal-blueprints/1"),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.literal("EXAM_MANAGER"),
    observedAt: UTCDateTime,
    limit: z.literal(20),
    truncated: z.boolean(),
    items: z.array(StaffFixedRehearsalBlueprintItemSchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const seenBlueprintIds = new Set<string>();
    value.items.forEach((item, index) => {
      if (seenBlueprintIds.has(item.blueprintVersionId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "blueprintVersionId"],
          message: "Blueprint version IDs must be unique",
        });
      }
      seenBlueprintIds.add(item.blueprintVersionId);
    });

    if (value.truncated && value.items.length !== 20) {
      context.addIssue({ code: "custom", path: ["items"], message: "Truncated blueprint results must contain the full twenty-row limit" });
    }
    enforceStaffResponseByteLimit(value, context, "Fixed rehearsal blueprint list");
  });

export type StaffFixedRehearsalBlueprintList = z.infer<typeof StaffFixedRehearsalBlueprintListSchema>;

/** EXAM_MANAGER command pins; seed omission leaves the trusted server default in force. */
export const StaffFixedRehearsalRequestSchema = z
  .object({
    blueprintVersionId: UUID,
    blueprintHash: Hash,
    windowMinutes: RehearsalWindowMinutesSchema,
    seed: z.number().int().min(0).max(0xffff_ffff).optional(),
  })
  .strict();

export type StaffFixedRehearsalRequest = z.infer<typeof StaffFixedRehearsalRequestSchema>;

const StaffFixedRehearsalSectionDeficitSchema = z
  .object({
    section: FixedAssemblySectionSchema,
    missingCount: z.number().int().min(1).max(4),
  })
  .strict();

/** Operation receipt; deliberately contains no eligible-pool counts or candidate identities. */
export const StaffFixedRehearsalReceiptSchema = z
  .object({
    rehearsalId: UUID,
    blueprintVersionId: UUID,
    blueprintHash: Hash,
    windowMinutes: RehearsalWindowMinutesSchema,
    capturedAt: UTCDateTime,
    availableUntil: UTCDateTime,
    requiredThrough: UTCDateTime,
    outcome: FixedAssemblyOutcomeSchema,
    failureCode: RehearsalFailureCodeSchema.nullable(),
    sectionDeficits: z.array(StaffFixedRehearsalSectionDeficitSchema).max(1),
    createsForm: z.literal(false),
    currentEligibility: z.literal("NOT_REVALIDATED"),
  })
  .strict()
  .superRefine((value, context) => {
    const capturedAt = utcMicroseconds(value.capturedAt);
    const availableUntil = utcMicroseconds(value.availableUntil);
    const requiredThrough = utcMicroseconds(value.requiredThrough);

    if (capturedAt !== null && availableUntil !== null && Number.isInteger(value.windowMinutes)
        && value.windowMinutes >= 1 && value.windowMinutes <= 1_440) {
      const expectedAvailableUntil = capturedAt + BigInt(value.windowMinutes) * 60_000_000n;
      if (availableUntil !== expectedAvailableUntil) {
        context.addIssue({
          code: "custom",
          path: ["availableUntil"],
          message: "Availability must end exactly windowMinutes after capture",
        });
      }
    }

    if (availableUntil !== null && requiredThrough !== null
        && requiredThrough < availableUntil + 601_000_000n) {
      context.addIssue({
        code: "custom",
        path: ["requiredThrough"],
        message: "Required horizon must include the 600-second start TTL and at least one domain-duration second",
      });
    }

    if (value.outcome === "SUCCESS") {
      if (value.failureCode !== null) {
        context.addIssue({ code: "custom", path: ["failureCode"], message: "Successful rehearsals must not have a failure code" });
      }
      if (value.sectionDeficits.length !== 0) {
        context.addIssue({ code: "custom", path: ["sectionDeficits"], message: "Successful rehearsals must not report stock deficits" });
      }
    } else {
      if (value.failureCode === null) {
        context.addIssue({ code: "custom", path: ["failureCode"], message: "Failed rehearsals require a captured failure code" });
      }
      if (value.failureCode !== "INSUFFICIENT_ELIGIBLE_INVENTORY" && value.sectionDeficits.length !== 0) {
        context.addIssue({
          code: "custom",
          path: ["sectionDeficits"],
          message: "Section deficits are only reported for proven cardinality under insufficient eligible inventory",
        });
      }
    }

    enforceStaffResponseByteLimit(value, context, "Fixed rehearsal receipt");
  });

export type StaffFixedRehearsalReceipt = z.infer<typeof StaffFixedRehearsalReceiptSchema>;

const StaffFixedRehearsalListItemSchema = z
  .object({
    rehearsalId: UUID,
    blueprintVersionId: UUID,
    outcome: FixedAssemblyOutcomeSchema,
    capturedAt: UTCDateTime,
    windowMinutes: RehearsalWindowMinutesSchema,
  })
  .strict();

/** BANK_MANAGER-only latest captured rehearsal metadata. */
export const StaffFixedRehearsalListSchema = z
  .object({
    schemaVersion: z.literal("staff-fixed-rehearsals/1"),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.literal("BANK_MANAGER"),
    observedAt: UTCDateTime,
    limit: z.literal(20),
    truncated: z.boolean(),
    items: z.array(StaffFixedRehearsalListItemSchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const seenRehearsalIds = new Set<string>();
    value.items.forEach((item, index) => {
      if (seenRehearsalIds.has(item.rehearsalId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "rehearsalId"],
          message: "Rehearsal IDs must be unique",
        });
      }
      seenRehearsalIds.add(item.rehearsalId);

      if (index === 0) return;
      const previous = value.items[index - 1]!;
      if (previous.capturedAt < item.capturedAt ||
          previous.capturedAt === item.capturedAt && previous.rehearsalId <= item.rehearsalId) {
        context.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Rehearsals must be ordered newest first by timestamp and rehearsal ID",
        });
      }
    });

    if (value.truncated && value.items.length !== 20) {
      context.addIssue({ code: "custom", path: ["items"], message: "Truncated rehearsal results must contain the full twenty-row limit" });
    }
    enforceStaffResponseByteLimit(value, context, "Fixed rehearsal list");
  });

export type StaffFixedRehearsalList = z.infer<typeof StaffFixedRehearsalListSchema>;

const StaffFixedRehearsalDiagnosticSectionSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("MATH"), requiredCount: z.literal(4), selectedCount: z.number().int().min(0).max(4) }).strict(),
  z.object({ section: z.literal("READING"), requiredCount: z.literal(2), selectedCount: z.number().int().min(0).max(2) }).strict(),
  z.object({ section: z.literal("SCIENCE"), requiredCount: z.literal(4), selectedCount: z.number().int().min(0).max(4) }).strict(),
]);

/** BANK_MANAGER-only replay-verified eligible-at-capture aggregates; no raw stock data. */
export const StaffFixedRehearsalDiagnosticSchema = z
  .object({
    schemaVersion: z.literal("staff-fixed-rehearsal-diagnostic/1"),
    environment: z.literal("LOCAL_SYNTHETIC_ONLY"),
    accessBasis: z.literal("BANK_MANAGER"),
    observedAt: UTCDateTime,
    captureOrigin: z.literal("BANK_ELIGIBLE_AT_CAPTURE"),
    currentEligibility: z.literal("NOT_REVALIDATED"),
    qualification: z.literal("NOT_ATTESTED_BY_PLATFORM"),
    publicationEligibility: z.literal("NOT_EVALUATED"),
    rehearsal: StaffFixedRehearsalReceiptSchema,
    replayVerified: z.literal(true),
    createsForm: z.literal(false),
    capturedUnitCount: z.number().int().min(0).max(10_000),
    capturedCandidateCount: z.number().int().min(0).max(2_000_000),
    selectedCount: z.number().int().min(0).max(4),
    visitedNodes: z.number().int().min(0).max(50_000),
    nodeLimit: z.number().int().min(0).max(50_000),
    unitLimit: z.number().int().min(0).max(2_000),
    section: StaffFixedRehearsalDiagnosticSectionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.selectedCount !== value.section.selectedCount) {
      context.addIssue({ code: "custom", path: ["selectedCount"], message: "Selected count must equal the section total" });
    }
    if (value.visitedNodes > value.nodeLimit) {
      context.addIssue({ code: "custom", path: ["visitedNodes"], message: "Visited nodes cannot exceed the captured node limit" });
    }
    if (value.rehearsal.outcome === "SUCCESS" && value.selectedCount !== value.section.requiredCount) {
      context.addIssue({ code: "custom", path: ["selectedCount"], message: "Successful rehearsals must select every required item" });
    }
    if (value.rehearsal.outcome === "FAILURE" && value.selectedCount !== 0) {
      context.addIssue({ code: "custom", path: ["selectedCount"], message: "Failed rehearsals must not expose partial selections" });
    }
    enforceStaffResponseByteLimit(value, context, "Fixed rehearsal diagnostic");
  });

export type StaffFixedRehearsalDiagnostic = z.infer<typeof StaffFixedRehearsalDiagnosticSchema>;

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
