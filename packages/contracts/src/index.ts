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

type IssueReporter = (path: PropertyKey[], message: string) => void;

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
