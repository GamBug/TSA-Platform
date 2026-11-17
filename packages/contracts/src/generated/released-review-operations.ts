// Generated from the runtime route registry; OpenAPI SHA-256: 08888918425e86f2cc08fcef113ef250397ef0667315c2ff8ae80e5483c8d377; do not edit.
import type { ReleasedReviewOperationMap } from "../routes.ts";

export type ReleasedReviewOperations = {
  readonly "releasedResult": ReleasedReviewOperationMap["releasedResult"];
};
export const ReleasedReviewOperationPaths = {
  "releasedResult": { method: "GET", path: "/api/v1/attempts/{id}/result" },
} as const;
