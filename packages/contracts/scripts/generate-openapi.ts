import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { generateStudentContractsOpenApi, stableJson } from "./openapi.ts";

export const defaultArtifactPath = resolve(import.meta.dirname, "../openapi/student-contracts.openapi.json");

export async function writeOpenApiArtifact(artifactPath = defaultArtifactPath): Promise<void> {
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, stableJson(generateStudentContractsOpenApi()), "utf8");
}

if (import.meta.main) {
  await writeOpenApiArtifact();
  console.log(`Generated ${defaultArtifactPath}`);
}
