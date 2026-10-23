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
