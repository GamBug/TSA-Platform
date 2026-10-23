// Generated from the private staff runtime route registry; OpenAPI SHA-256: ca1088cbe118be86a546fc032cdaa6158d625240595ae84b856a218fca85b76c; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffReviewContext": StaffOperationMap["staffReviewContext"];
  readonly "staffReviewEvidence": StaffOperationMap["staffReviewEvidence"];
};
export const StaffOperationPaths = {
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
} as const;
