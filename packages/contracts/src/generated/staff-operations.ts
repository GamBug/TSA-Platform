// Generated from the private staff runtime route registry; OpenAPI SHA-256: 5f9001a91eb69eda1308496759647ce68ee231a6bb5bac9259c523a4d1529cec; do not edit.
import type { StaffOperationMap } from "../staff-routes.ts";

export type StaffOperations = {
  readonly "staffReviewContext": StaffOperationMap["staffReviewContext"];
};
export const StaffOperationPaths = {
  "staffReviewContext": { method: "GET", path: "/api/v1/question-versions/{versionId}/review-context" },
} as const;
