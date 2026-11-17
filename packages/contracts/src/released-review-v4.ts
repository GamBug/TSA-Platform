import { z } from "zod";
import { ReleasedReviewItemSchema } from "./index.ts";
import { AnswerKeyV3Schema, ResponseValueV3Schema, parseResponseV3, validateAnswerKeyV3 } from "./question-v3.ts";
import { StudentSlotV4Schema, ResultViewV4Schema } from "./student-v4.ts";

const ReleasedReviewItemV4Schema = z.object({
  ...ReleasedReviewItemSchema.shape,
  question: StudentSlotV4Schema,
  response: ResponseValueV3Schema.nullable(),
  correctAnswer: AnswerKeyV3Schema,
}).strict().superRefine((item, context) => {
  if (item.slotId !== item.question.slotId) {
    context.addIssue({ code: "custom", message: "Review question must identify its slot" });
  }
  validateAnswerKeyV3(item.question.interaction, item.correctAnswer,
    (path, message) => context.addIssue({ code: "custom", path: ["correctAnswer", ...path], message }));
  if (item.response !== null) {
    try {
      parseResponseV3(item.question.interaction, item.response);
    } catch {
      context.addIssue({ code: "custom", path: ["response"], message: "Response must match its sealed interaction" });
    }
  }
});

export const AuthorizedReleasedReviewV4Schema = ResultViewV4Schema.safeExtend({
  items: z.array(ReleasedReviewItemV4Schema),
}).superRefine((review, context) => {
  if (review.items.length !== review.totalCount || new Set(review.items.map((item) => item.slotId)).size !== review.items.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Review items must uniquely match the total count" });
  }
});

