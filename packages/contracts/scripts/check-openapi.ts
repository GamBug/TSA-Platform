import { readFile } from "node:fs/promises";

import {
  defaultArtifactPath,
  defaultReleasedReviewArtifactPath,
  defaultReleasedReviewOperationsPath,
  defaultStudentOperationsPath,
} from "./generate-openapi.ts";
import {
  generateReleasedReviewContractsOpenApi,
  generateReleasedReviewOperationTypes,
  generateStudentContractsOpenApi,
  generateStudentOperationTypes,
  stableJson,
} from "./openapi.ts";

async function matches(path: string, expected: string): Promise<boolean> {
  try {
    return await readFile(path, "utf8") === expected;
  } catch {
    return false;
  }
}

export async function checkOpenApiArtifact(artifactPath = defaultArtifactPath): Promise<boolean> {
  return matches(artifactPath, stableJson(generateStudentContractsOpenApi()));
}

export type OpenApiArtifactPaths = {
  student?: string;
  releasedReview?: string;
  studentOperations?: string;
  releasedReviewOperations?: string;
};

export async function checkOpenApiArtifacts(paths: OpenApiArtifactPaths = {}): Promise<boolean> {
  const results = await Promise.all([
    matches(paths.student ?? defaultArtifactPath, stableJson(generateStudentContractsOpenApi())),
    matches(paths.releasedReview ?? defaultReleasedReviewArtifactPath, stableJson(generateReleasedReviewContractsOpenApi())),
    matches(paths.studentOperations ?? defaultStudentOperationsPath, generateStudentOperationTypes()),
    matches(paths.releasedReviewOperations ?? defaultReleasedReviewOperationsPath, generateReleasedReviewOperationTypes()),
  ]);
  return results.every(Boolean);
}

if (import.meta.main) {
  if (await checkOpenApiArtifacts()) {
    console.log("All generated OpenAPI and operation-map artifacts match the runtime route registry.");
  } else {
    console.error("Generated contract artifact drift detected. Run: npm run contracts:generate");
    process.exitCode = 1;
  }
}
