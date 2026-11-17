import { studentRouteRegistry, releasedReviewRouteRegistry } from "./routes.ts";
import { AnswerAckV2Schema, AnswerSubmissionRequestV2Schema, AttemptViewV2Schema } from "./student-v2.ts";
import { AuthorizedReleasedReviewV2Schema } from "./released-review-v2.ts";
import { z } from "zod";
import { ErrorDetailsSchema } from "./index.ts";
import { ResponseValueV2Schema } from "./question-v2.ts";

const AnswerConflictV2Schema = z.object({ error: z.object({
  code: z.enum(['REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'ATTEMPT_CLOSED', 'SECTION_CLOSED', 'CONCURRENT_MODIFICATION']),
  message: z.string().trim().min(1).max(1024), requestId: z.string().min(1).max(256),
  details: ErrorDetailsSchema.extend({ currentAnswer: ResponseValueV2Schema.optional() }),
}).strict() }).strict();

const base = Object.fromEntries(Object.entries(studentRouteRegistry).map(([operation, definition]) => [operation,
  { ...definition, path: definition.path.replace('/api/v1/', '/api/v2/') },
])) as { [Key in keyof typeof studentRouteRegistry]: Omit<typeof studentRouteRegistry[Key], 'path'> & { path: string } };

/** Additive v2 registry. The frozen v1 registry and generated artifacts stay unchanged. */
export const studentRouteRegistryV2 = {
  ...base,
  saveAnswer: { ...base.saveAnswer,
    body: AnswerSubmissionRequestV2Schema,
    responses: { ...base.saveAnswer.responses,
      200: { ...base.saveAnswer.responses[200], schema: AnswerAckV2Schema },
      409: { ...base.saveAnswer.responses[409], schema: AnswerConflictV2Schema } },
  },
  getAttempt: { ...base.getAttempt,
    responses: { ...base.getAttempt.responses, 200: { ...base.getAttempt.responses[200], schema: AttemptViewV2Schema } },
  },
};
export const releasedReviewRouteRegistryV2 = {
  releasedResult: { ...releasedReviewRouteRegistry.releasedResult,
    path: '/api/v2/attempts/{id}/result',
    responses: { ...releasedReviewRouteRegistry.releasedResult.responses,
      200: { ...releasedReviewRouteRegistry.releasedResult.responses[200], schema: AuthorizedReleasedReviewV2Schema } },
  },
};
