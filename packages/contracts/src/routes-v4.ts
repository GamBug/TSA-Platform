import { z } from "zod";
import { ErrorDetailsSchema } from "./index.ts";
import { studentRouteRegistryV2, releasedReviewRouteRegistryV2 } from "./routes-v2.ts";
import { AnswerAckV4Schema, AnswerSubmissionRequestV4Schema, AttemptViewV4Schema } from "./student-v4.ts";
import { AuthorizedReleasedReviewV4Schema } from "./released-review-v4.ts";
import { ResponseValueV3Schema } from "./question-v3.ts";

const AnswerConflictV4Schema = z.object({ error: z.object({
  code: z.enum(["REVISION_CONFLICT", "IDEMPOTENCY_CONFLICT", "ATTEMPT_CLOSED", "SECTION_CLOSED", "CONCURRENT_MODIFICATION"]),
  message: z.string().trim().min(1).max(1024),
  requestId: z.string().min(1).max(256),
  details: ErrorDetailsSchema.extend({ currentAnswer: ResponseValueV3Schema.optional() }),
}).strict() }).strict();

const base = Object.fromEntries(Object.entries(studentRouteRegistryV2).map(([operation, definition]) => [operation,
  { ...definition, path: definition.path.replace("/api/v2/", "/api/v4/") },
])) as { [Key in keyof typeof studentRouteRegistryV2]: Omit<typeof studentRouteRegistryV2[Key], "path"> & { path: string } };

/** Additive cloze and matching routes. Existing v1/v2 student and v3 simulation registries remain frozen. */
export const studentRouteRegistryV4 = {
  ...base,
  saveAnswer: { ...base.saveAnswer,
    body: AnswerSubmissionRequestV4Schema,
    responses: { ...base.saveAnswer.responses,
      200: { ...base.saveAnswer.responses[200], schema: AnswerAckV4Schema },
      409: { ...base.saveAnswer.responses[409], schema: AnswerConflictV4Schema },
    },
  },
  getAttempt: { ...base.getAttempt,
    responses: { ...base.getAttempt.responses,
      200: { ...base.getAttempt.responses[200], schema: AttemptViewV4Schema },
    },
  },
} as const;

export const releasedReviewRouteRegistryV4 = {
  releasedResult: { ...releasedReviewRouteRegistryV2.releasedResult,
    path: "/api/v4/attempts/{id}/result",
    responses: { ...releasedReviewRouteRegistryV2.releasedResult.responses,
      200: { ...releasedReviewRouteRegistryV2.releasedResult.responses[200], schema: AuthorizedReleasedReviewV4Schema },
    },
  },
};
