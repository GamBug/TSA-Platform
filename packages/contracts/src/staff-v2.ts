import { z } from "zod";

import {
  BlockSchema,
  SectionSchema,
  StudentQuestionSchema,
} from "./index.ts";
import { InteractionV2Schema, AnswerKeyV2Schema, validateAnswerKeyV2 } from "./question-v2.ts";

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
    interaction: InteractionV2Schema,
    answerKey: AnswerKeyV2Schema,
    explanation: BlocksSchema,
    scoringPolicyVersion: z.enum(["practice-binary-v1", "practice-binary-v2"]),
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
    schemaVersion: z.literal("staff-review-context/2"),
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

function validateAnswerKeyAgainstInteraction(
  question: z.infer<typeof StaffReviewQuestionSchema>,
  context: z.RefinementCtx,
): void {
  validateAnswerKeyV2(question.interaction, question.answerKey,
    (path, message) => context.addIssue({ code: "custom", path, message }),
    ["preview", "question", "answerKey"]);
  if (question.interaction.type === "NUMERIC_RESPONSE" && question.scoringPolicyVersion !== "practice-binary-v2") {
    context.addIssue({ code: "custom", path: ["preview", "question", "scoringPolicyVersion"],
      message: "Numeric questions require practice-binary-v2" });
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
  } else if (question.interaction.type !== "NUMERIC_RESPONSE") {
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

/** Strict private DTO for GET /api/v2/question-versions/{versionId}/review-context. */
export const StaffReviewContextV2Schema = StaffReviewContextObjectSchema.superRefine((value, context) => {
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

export type StaffReviewContextV2 = z.infer<typeof StaffReviewContextV2Schema>;
