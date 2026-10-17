import { readFile } from "node:fs/promises";

import { defaultArtifactPath } from "./generate-openapi.ts";
import { generateStudentContractsOpenApi, stableJson } from "./openapi.ts";

export async function checkOpenApiArtifact(artifactPath = defaultArtifactPath): Promise<boolean> {
  const expected = stableJson(generateStudentContractsOpenApi());
  let actual: string;
  try {
    actual = await readFile(artifactPath, "utf8");
  } catch {
    return false;
  }
  return actual === expected;
}

if (import.meta.main) {
  if (await checkOpenApiArtifact()) {
    console.log("OpenAPI artifact matches the runtime schemas.");
  } else {
    console.error("OpenAPI artifact drift detected. Run: npm run contracts:generate");
    process.exitCode = 1;
  }
}
