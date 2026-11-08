import { z } from "zod";
import { AnswerAckSchema, AnswerSubmissionRequestSchema, AttemptViewSchema,
  ResultViewSchema, StudentSlotSchema, validateAttemptViewStructure,
  validateFormModeReuseMode } from "./index.ts";
import { InteractionV2Schema, ResponseValueV2Schema } from "./question-v2.ts";

export { InteractionV2Schema, ResponseValueV2Schema } from "./question-v2.ts";
export const StudentSlotV2Schema = z.object({ ...StudentSlotSchema.shape, interaction: InteractionV2Schema }).strict();
export const AnswerAckV2Schema = z.object({ ...AnswerAckSchema.shape, value: ResponseValueV2Schema }).strict();
export const AnswerSubmissionRequestV2Schema = z.object({ ...AnswerSubmissionRequestSchema.shape, value: ResponseValueV2Schema }).strict();
export const ResultViewV2Schema = z.object({ ...ResultViewSchema.shape,
  policyVersion: z.enum(["practice-binary-v1", "practice-binary-v2"]),
}).strict().superRefine((result, context) => {
  validateFormModeReuseMode(result, context);
  const section = result.sections[0]!;
  if (section.section !== result.domain || section.correctCount !== result.correctCount
      || section.totalCount !== result.totalCount || result.correctCount > result.totalCount) {
    context.addIssue({ code: "custom", message: "Independent practice totals must match their section" });
  }
});

export const AttemptViewV2Schema = z.object({ ...AttemptViewSchema.shape,
  slots: z.array(StudentSlotV2Schema), answers: z.array(AnswerAckV2Schema),
}).strict().superRefine(validateAttemptViewStructure);

