import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  generateReleasedReviewContractsOpenApi,
  generateReleasedReviewOperationTypes,
  generateStudentContractsOpenApi,
  generateStudentOperationTypes,
  stableJson,
} from "./openapi.ts";

export const defaultArtifactPath = resolve(import.meta.dirname, "../openapi/student-contracts.openapi.json");
export const defaultReleasedReviewArtifactPath = resolve(import.meta.dirname, "../openapi/released-review-contracts.openapi.json");
export const defaultStudentOperationsPath = resolve(import.meta.dirname, "../src/generated/student-operations.ts");
export const defaultReleasedReviewOperationsPath = resolve(import.meta.dirname, "../src/generated/released-review-operations.ts");

async function writeArtifact(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** Retained for focused student-document fixture tests. The command writes all coordinated artifacts. */
export async function writeOpenApiArtifact(artifactPath = defaultArtifactPath): Promise<void> {
  await writeArtifact(artifactPath, stableJson(generateStudentContractsOpenApi()));
}

export async function writeOpenApiArtifacts(): Promise<void> {
  await Promise.all([
    writeArtifact(defaultArtifactPath, stableJson(generateStudentContractsOpenApi())),
    writeArtifact(defaultReleasedReviewArtifactPath, stableJson(generateReleasedReviewContractsOpenApi())),
    writeArtifact(defaultStudentOperationsPath, generateStudentOperationTypes()),
    writeArtifact(defaultReleasedReviewOperationsPath, generateReleasedReviewOperationTypes()),
  ]);
}

if (import.meta.main) {
  await writeOpenApiArtifacts();
  console.log("Generated student/released-review OpenAPI and operation-map artifacts.");
}
