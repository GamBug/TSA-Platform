import { z } from "zod";
import { AnswerKeySchema, InteractionSchema, QuestionVersionSchema, ResponseValueSchema,
  parseResponseForInteraction, validateAnswerKey } from "./index.ts";
import { NumericAnswerKeySchema, NumericInteractionSchema, NumericResponseValueSchema } from "./numeric-response.ts";

export const InteractionV2Schema = z.union([InteractionSchema, NumericInteractionSchema]);
export const AnswerKeyV2Schema = z.union([AnswerKeySchema, NumericAnswerKeySchema]);
export const ResponseValueV2Schema = z.union([ResponseValueSchema, NumericResponseValueSchema]);
export type InteractionV2 = z.infer<typeof InteractionV2Schema>;
export type AnswerKeyV2 = z.infer<typeof AnswerKeyV2Schema>;
export type ResponseValueV2 = z.infer<typeof ResponseValueV2Schema>;

export function validateAnswerKeyV2(interaction: InteractionV2, key: AnswerKeyV2,
  report: (path: PropertyKey[], message: string) => void, path: PropertyKey[] = []): void {
  if (interaction.type !== key.type) { report(path, "Answer key type must match interaction"); return; }
  if (interaction.type === "NUMERIC_RESPONSE" || key.type === "NUMERIC_RESPONSE") return;
  validateAnswerKey(interaction, key, report, path);
}

export function parseResponseV2(interactionInput: unknown, value: unknown): ResponseValueV2 {
  const interaction = InteractionV2Schema.parse(interactionInput);
  const response = ResponseValueV2Schema.parse(value);
  if (interaction.type !== response.type) throw new TypeError("Response type must match interaction");
  if (interaction.type === "NUMERIC_RESPONSE") return response;
  return parseResponseForInteraction(interaction, response);
}

export const QuestionVersionV2Schema = z.object({
  ...QuestionVersionSchema.shape,
  schemaVersion: z.literal("question/2"),
  interaction: InteractionV2Schema,
  private: z.object({
    ...QuestionVersionSchema.shape.private.shape,
    answerKey: AnswerKeyV2Schema,
    scoringPolicy: z.literal("practice-binary-v2"),
  }).strict(),
}).strict().superRefine((question, context) => {
  validateAnswerKeyV2(question.interaction, question.private.answerKey,
    (path, message) => context.addIssue({ code: "custom", path, message }), ["private", "answerKey"]);
  if (new TextEncoder().encode(JSON.stringify(question)).length > 256 * 1024) {
    context.addIssue({ code: "custom", message: "Question must not exceed 256 KiB serialized" });
  }
});

export const SupportedQuestionVersionSchema = z.union([QuestionVersionSchema, QuestionVersionV2Schema]);
export type QuestionVersionV2 = z.infer<typeof QuestionVersionV2Schema>;
export type SupportedQuestionVersion = z.infer<typeof SupportedQuestionVersionSchema>;
