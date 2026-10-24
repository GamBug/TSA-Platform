// Generated from the private staff runtime route registry; OpenAPI SHA-256: 2ccd710761b734faf8ba9575126e30d11ff196b3e059395ad8414233de2acc80; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffReviewContext": StaffOperationMap["staffReviewContext"];
  readonly "staffReviewEvidence": StaffOperationMap["staffReviewEvidence"];
  readonly "staffSubmitReview": StaffOperationMap["staffSubmitReview"];
  readonly "staffRejectReview": StaffOperationMap["staffRejectReview"];
  readonly "staffQuarantine": StaffOperationMap["staffQuarantine"];
};
export const StaffOperationPaths = {
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
  "staffSubmitReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/submit-review" },
  "staffRejectReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/reviews" },
  "staffQuarantine": { method: "POST", path: "/api/v1/question-versions/{versionId}/quarantine" },
} as const;
