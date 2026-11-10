import { z } from "zod";
import {
  AnswerKeySchema,
  InteractionSchema,
  QuestionVersionSchema,
  ResponseValueSchema,
  type Interaction,
  type ResponseValue,
  parseResponseForInteraction,
  validateAnswerKey,
} from "./index.ts";
import { NumericAnswerKeySchema, NumericInteractionSchema, NumericResponseValueSchema } from "./numeric-response.ts";
import {
  ClozeAnswerKeySchema,
  ClozeInteractionSchema,
  ClozeResponseValueSchema,
  MatchingAnswerKeySchema,
  MatchingInteractionSchema,
  MatchingResponseValueSchema,
  parseClozeResponse,
  parseMatchingResponse,
  validateClozeMatchingAnswerKey,
} from "./cloze-matching.ts";
import {
  QuestionVersionV2Schema,
  validateAnswerKeyV2,
  parseResponseV2,
  type AnswerKeyV2,
  type InteractionV2,
  type ResponseValueV2,
} from "./question-v2.ts";

export const InteractionV3Schema = z.union([
  InteractionSchema,
  NumericInteractionSchema,
  ClozeInteractionSchema,
  MatchingInteractionSchema,
]);
export const AnswerKeyV3Schema = z.union([
  AnswerKeySchema,
  NumericAnswerKeySchema,
  ClozeAnswerKeySchema,
  MatchingAnswerKeySchema,
]);
export const ResponseValueV3Schema = z.union([
  ResponseValueSchema,
  NumericResponseValueSchema,
  ClozeResponseValueSchema,
  MatchingResponseValueSchema,
]);

export type InteractionV3 = z.infer<typeof InteractionV3Schema>;
export type AnswerKeyV3 = z.infer<typeof AnswerKeyV3Schema>;
export type ResponseValueV3 = z.infer<typeof ResponseValueV3Schema>;

export function validateAnswerKeyV3(
  interaction: InteractionV3,
  key: AnswerKeyV3,
  report: (path: PropertyKey[], message: string) => void,
  path: PropertyKey[] = [],
): void {
  if (interaction.type !== key.type) {
    report(path, "Answer key type must match interaction");
    return;
  }
  if (interaction.type === "CLOZE" || interaction.type === "MATCHING") {
    try {
      validateClozeMatchingAnswerKey(interaction, key);
    } catch (error) {
      report(path, error instanceof Error ? error.message : "Invalid cloze or matching answer key");
    }
    return;
  }
  validateAnswerKeyV2(interaction as InteractionV2, key as AnswerKeyV2, report, path);
}

export function parseResponseV3(interactionInput: unknown, value: unknown): ResponseValueV3 {
  const interaction = InteractionV3Schema.parse(interactionInput);
  const response = ResponseValueV3Schema.parse(value);
  if (interaction.type !== response.type) throw new TypeError("Response type must match interaction");
  if (interaction.type === "CLOZE") return parseClozeResponse(interaction, response);
  if (interaction.type === "MATCHING") return parseMatchingResponse(interaction, response);
  if (interaction.type === "NUMERIC_RESPONSE") return parseResponseV2(interaction as InteractionV2, response as ResponseValueV2);
  return parseResponseForInteraction(interaction as Interaction, response as ResponseValue);
}

export const QuestionVersionV3Schema = z.object({
  ...QuestionVersionSchema.shape,
  schemaVersion: z.literal("question/3"),
  interaction: InteractionV3Schema,
  private: z.object({
    ...QuestionVersionSchema.shape.private.shape,
    answerKey: AnswerKeyV3Schema,
    scoringPolicy: z.literal("practice-binary-v3"),
  }).strict(),
}).strict().superRefine((question, context) => {
  validateAnswerKeyV3(question.interaction, question.private.answerKey,
    (path, message) => context.addIssue({ code: "custom", path, message }), ["private", "answerKey"]);
  if (new TextEncoder().encode(JSON.stringify(question)).length > 256 * 1024) {
    context.addIssue({ code: "custom", message: "Question must not exceed 256 KiB serialized" });
  }
});

export const SupportedQuestionVersionSchema = z.union([
  QuestionVersionSchema,
  QuestionVersionV2Schema,
  QuestionVersionV3Schema,
]);
export type QuestionVersionV3 = z.infer<typeof QuestionVersionV3Schema>;
export type SupportedQuestionVersion = z.infer<typeof SupportedQuestionVersionSchema>;
