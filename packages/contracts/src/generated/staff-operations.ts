// Generated from the private staff runtime route registry; OpenAPI SHA-256: 9f3cfea18d9741aebc71ba04bade2a2d65b796ece274ddbbfa4423ba32f768cc; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffReviewContext": StaffOperationMap["staffReviewContext"];
  readonly "staffReviewEvidence": StaffOperationMap["staffReviewEvidence"];
  readonly "staffReviewHistory": StaffOperationMap["staffReviewHistory"];
  readonly "staffDatasetPreflight": StaffOperationMap["staffDatasetPreflight"];
  readonly "staffSubmitReview": StaffOperationMap["staffSubmitReview"];
  readonly "staffRejectReview": StaffOperationMap["staffRejectReview"];
  readonly "staffQuarantine": StaffOperationMap["staffQuarantine"];
};
export const StaffOperationPaths = {
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
  "staffReviewHistory": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-history" },
  "staffDatasetPreflight": { method: "POST", path: "/api/v1/datasets/preflight" },
  "staffSubmitReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/submit-review" },
  "staffRejectReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/reviews" },
  "staffQuarantine": { method: "POST", path: "/api/v1/question-versions/{versionId}/quarantine" },
} as const;
