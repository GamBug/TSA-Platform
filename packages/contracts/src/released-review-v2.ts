import { z } from "zod";
import { ReleasedReviewItemSchema } from "./index.ts";
import { StudentSlotV2Schema, ResultViewV2Schema } from "./student-v2.ts";
import { AnswerKeyV2Schema, ResponseValueV2Schema, parseResponseV2, validateAnswerKeyV2 } from "./question-v2.ts";

const ReleasedReviewItemV2Schema = z.object({ ...ReleasedReviewItemSchema.shape,
  question: StudentSlotV2Schema, response: ResponseValueV2Schema.nullable(), correctAnswer: AnswerKeyV2Schema,
}).strict().superRefine((item, context) => {
  if (item.slotId !== item.question.slotId) context.addIssue({ code: "custom", message: "Review question must identify its slot" });
  validateAnswerKeyV2(item.question.interaction, item.correctAnswer,
    (path, message) => context.addIssue({ code: "custom", path: ["correctAnswer", ...path], message }));
  if (item.response !== null) {
    try { parseResponseV2(item.question.interaction, item.response); }
    catch { context.addIssue({ code: "custom", path: ["response"], message: "Response must match its sealed interaction" }); }
  }
});

export const AuthorizedReleasedReviewV2Schema = ResultViewV2Schema.safeExtend({
  items: z.array(ReleasedReviewItemV2Schema),
}).superRefine((review, context) => {
  if (review.items.length !== review.totalCount || new Set(review.items.map(item => item.slotId)).size !== review.items.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Review items must uniquely match the total count" });
  }
});
