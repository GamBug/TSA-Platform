// Generated from the runtime route registry; OpenAPI SHA-256: b5f9ecc6b2e1404587d9f7e8c6c4662f405fe15a3c15fcc85395c20dc0a71348; do not edit.
import type { StudentOperationMap } from "../routes.ts";

export type StudentOperations = {
  readonly "catalog": StudentOperationMap["catalog"];
  readonly "createAttempt": StudentOperationMap["createAttempt"];
  readonly "startAttempt": StudentOperationMap["startAttempt"];
  readonly "getAttempt": StudentOperationMap["getAttempt"];
  readonly "saveAnswer": StudentOperationMap["saveAnswer"];
  readonly "submitAttempt": StudentOperationMap["submitAttempt"];
  readonly "attemptHistory": StudentOperationMap["attemptHistory"];
  readonly "attemptAsset": StudentOperationMap["attemptAsset"];
};
export const StudentOperationPaths = {
  "catalog": { method: "GET", path: "/api/v1/catalog" },
  "createAttempt": { method: "POST", path: "/api/v1/attempts" },
  "startAttempt": { method: "POST", path: "/api/v1/attempts/{id}/start" },
  "getAttempt": { method: "GET", path: "/api/v1/attempts/{id}" },
  "saveAnswer": { method: "PUT", path: "/api/v1/attempts/{id}/answers/{slotId}" },
  "submitAttempt": { method: "POST", path: "/api/v1/attempts/{id}/submit" },
  "attemptHistory": { method: "GET", path: "/api/v1/attempts" },
  "attemptAsset": { method: "GET", path: "/api/v1/attempts/{id}/assets/{assetVersionId}" },
} as const;
