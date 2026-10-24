// Generated from the private staff runtime route registry; OpenAPI SHA-256: f9396f2eddccb3747ff8fa4afe2ff8aa2c59f5f9216b0288e7556676d0f67a52; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffReviewContext": StaffOperationMap["staffReviewContext"];
  readonly "staffReviewEvidence": StaffOperationMap["staffReviewEvidence"];
  readonly "staffReviewHistory": StaffOperationMap["staffReviewHistory"];
  readonly "staffSubmitReview": StaffOperationMap["staffSubmitReview"];
  readonly "staffRejectReview": StaffOperationMap["staffRejectReview"];
  readonly "staffQuarantine": StaffOperationMap["staffQuarantine"];
};
export const StaffOperationPaths = {
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
  "staffReviewHistory": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-history" },
  "staffSubmitReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/submit-review" },
  "staffRejectReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/reviews" },
  "staffQuarantine": { method: "POST", path: "/api/v1/question-versions/{versionId}/quarantine" },
} as const;
