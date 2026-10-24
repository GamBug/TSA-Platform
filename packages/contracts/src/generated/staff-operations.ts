// Generated from the private staff runtime route registry; OpenAPI SHA-256: 3d4d10f537f8922e6c38163fd107b45c4139c094570d06f38d030db389289358; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffReviewContext": StaffOperationMap["staffReviewContext"];
  readonly "staffReviewEvidence": StaffOperationMap["staffReviewEvidence"];
  readonly "staffSubmitReview": StaffOperationMap["staffSubmitReview"];
};
export const StaffOperationPaths = {
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
  "staffSubmitReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/submit-review" },
} as const;
