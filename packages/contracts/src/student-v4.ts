import { z } from "zod";
import {
  AnswerAckSchema,
  AnswerSubmissionRequestSchema,
  AttemptViewSchema,
  ResultViewSchema,
  StudentSlotSchema,
  validateAttemptViewStructure,
  validateFormModeReuseMode,
} from "./index.ts";
import { InteractionV3Schema, ResponseValueV3Schema, parseResponseV3 } from "./question-v3.ts";

export { InteractionV3Schema, ResponseValueV3Schema } from "./question-v3.ts";
export const StudentSlotV4Schema = z.object({ ...StudentSlotSchema.shape, interaction: InteractionV3Schema }).strict();
export const AnswerAckV4Schema = z.object({ ...AnswerAckSchema.shape, value: ResponseValueV3Schema }).strict();
export const AnswerSubmissionRequestV4Schema = z.object({ ...AnswerSubmissionRequestSchema.shape, value: ResponseValueV3Schema }).strict();

export const ResultViewV4Schema = z.object({
  ...ResultViewSchema.shape,
  policyVersion: z.literal("practice-binary-v3"),
}).strict().superRefine((result, context) => {
  validateFormModeReuseMode(result, context);
  const section = result.sections[0]!;
  if (section.section !== result.domain || section.correctCount !== result.correctCount
      || section.totalCount !== result.totalCount || result.correctCount > result.totalCount) {
    context.addIssue({ code: "custom", message: "Independent practice totals must match their section" });
  }
});

export const AttemptViewV4Schema = z.object({
  ...AttemptViewSchema.shape,
  slots: z.array(StudentSlotV4Schema),
  answers: z.array(AnswerAckV4Schema),
}).strict().superRefine((view, context) => {
  validateAttemptViewStructure(view, context);
  const slots = new Map(view.slots.map((slot) => [slot.slotId, slot]));
  view.answers.forEach((answer, index) => {
    const slot = slots.get(answer.slotId);
    if (!slot) return;
    try {
      parseResponseV3(slot.interaction, answer.value);
    } catch {
      context.addIssue({ code: "custom", path: ["answers", index, "value"], message: "Response must match its sealed interaction" });
    }
  });
});
