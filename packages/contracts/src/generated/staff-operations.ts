// Generated from the private staff runtime route registry; OpenAPI SHA-256: 20e23fdb7e92bb0cd359aba9cdc0a6e00854939d5a3db937babe590104c0a543; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffFixedAssemblyRuns": StaffOperationMap["staffFixedAssemblyRuns"];
  readonly "staffFixedAssemblyDiagnostic": StaffOperationMap["staffFixedAssemblyDiagnostic"];
  readonly "staffFixedRehearsalBlueprints": StaffOperationMap["staffFixedRehearsalBlueprints"];
  readonly "staffCreateFixedRehearsal": StaffOperationMap["staffCreateFixedRehearsal"];
  readonly "staffFixedRehearsals": StaffOperationMap["staffFixedRehearsals"];
  readonly "staffFixedRehearsalDiagnostic": StaffOperationMap["staffFixedRehearsalDiagnostic"];
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
  "staffFixedRehearsalBlueprints": { method: "GET", path: "/api/v1/fixed-rehearsal-blueprints" },
  "staffCreateFixedRehearsal": { method: "POST", path: "/api/v1/fixed-rehearsals" },
  "staffFixedRehearsals": { method: "GET", path: "/api/v1/fixed-rehearsals" },
  "staffFixedRehearsalDiagnostic": { method: "GET", path: "/api/v1/fixed-rehearsals/{rehearsalId}" },
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
  "staffReviewHistory": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-history" },
  "staffDatasetPreflight": { method: "POST", path: "/api/v1/datasets/preflight" },
  "staffSubmitReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/submit-review" },
  "staffRejectReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/reviews" },
  "staffQuarantine": { method: "POST", path: "/api/v1/question-versions/{versionId}/quarantine" },
} as const;
