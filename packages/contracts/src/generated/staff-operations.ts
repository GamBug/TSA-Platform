// Generated from the private staff runtime route registry; OpenAPI SHA-256: c22a70af790264663a0c3c5fb4aba90f7d5977139b35c282978e624fc26d60c1; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffFixedAssemblyRuns": StaffOperationMap["staffFixedAssemblyRuns"];
  readonly "staffFixedAssemblyDiagnostic": StaffOperationMap["staffFixedAssemblyDiagnostic"];
  readonly "staffFixedRehearsalBlueprints": StaffOperationMap["staffFixedRehearsalBlueprints"];
  readonly "staffCreateFixedRehearsal": StaffOperationMap["staffCreateFixedRehearsal"];
  readonly "staffFixedRehearsals": StaffOperationMap["staffFixedRehearsals"];
  readonly "staffFixedRehearsalDiagnostic": StaffOperationMap["staffFixedRehearsalDiagnostic"];
  readonly "staffCreateFixedSeal": StaffOperationMap["staffCreateFixedSeal"];
  readonly "staffFixedForms": StaffOperationMap["staffFixedForms"];
  readonly "staffFixedForm": StaffOperationMap["staffFixedForm"];
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
  "staffCreateFixedSeal": { method: "POST", path: "/api/v1/assemblies" },
  "staffFixedForms": { method: "GET", path: "/api/v1/fixed-forms" },
  "staffFixedForm": { method: "GET", path: "/api/v1/fixed-forms/{formId}" },
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
  "staffReviewEvidence": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-evidence" },
  "staffReviewHistory": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-history" },
  "staffDatasetPreflight": { method: "POST", path: "/api/v1/datasets/preflight" },
  "staffSubmitReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/submit-review" },
  "staffRejectReview": { method: "POST", path: "/api/v1/question-versions/{versionId}/reviews" },
  "staffQuarantine": { method: "POST", path: "/api/v1/question-versions/{versionId}/quarantine" },
} as const;
