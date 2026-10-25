// Generated from the private staff runtime route registry; OpenAPI SHA-256: 295ae0ace0c2861125a524b9d3d8955c9d91e8efe1b1ff57d90a602be9e6f32d; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffFixedAssemblyRuns": StaffOperationMap["staffFixedAssemblyRuns"];
  readonly "staffFixedAssemblyDiagnostic": StaffOperationMap["staffFixedAssemblyDiagnostic"];
  readonly "staffReviewContext": StaffOperationMap["staffReviewContext"];
  readonly "staffReviewEvidence": StaffOperationMap["staffReviewEvidence"];
  readonly "staffReviewHistory": StaffOperationMap["staffReviewHistory"];
  readonly "staffDatasetPreflight": StaffOperationMap["staffDatasetPreflight"];
  readonly "staffSubmitReview": StaffOperationMap["staffSubmitReview"];
  readonly "staffRejectReview": StaffOperationMap["staffRejectReview"];
  readonly "staffQuarantine": StaffOperationMap["staffQuarantine"];
};
export const StaffOperationPaths = {
  "staffFixedAssemblyRuns": { method: "GET", path: "/api/v1/assembly-runs" },
  "staffFixedAssemblyDiagnostic": { method: "GET", path: "/api/v1/assembly-runs/{assemblyRunId}/diagnostics" },
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
  "staffReviewHistory": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-history" },
  "staffDatasetPreflight": { method: "POST", path: "/api/v1/datasets/preflight" },
  "staffSubmitReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/submit-review" },
  "staffRejectReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/reviews" },
  "staffQuarantine": { method: "POST", path: "/api/v1/question-versions/{versionId}/quarantine" },
} as const;
