import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  defaultStaffArtifactPath,
  defaultStaffOperationsPath,
} from "./generate-staff-openapi.ts";
import {
  generateStaffContractsOpenApi,
  generateStaffOperationTypes,
  staffStableJson,
} from "./staff-openapi.ts";

async function matchesStaffArtifact(path: string, expected: string): Promise<boolean> {
  try {
    return await readFile(path, "utf8") === expected;
  } catch {
    return false;
  }
}

export async function checkStaffOpenApiArtifacts(paths: { artifact?: string; operations?: string } = {}): Promise<boolean> {
  const results = await Promise.all([
    matchesStaffArtifact(paths.artifact ?? defaultStaffArtifactPath, staffStableJson(generateStaffContractsOpenApi())),
    matchesStaffArtifact(paths.operations ?? defaultStaffOperationsPath, generateStaffOperationTypes()),
  ]);
  return results.every(Boolean);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (await checkStaffOpenApiArtifacts()) {
    console.log("Private staff OpenAPI and operation-map artifacts match the staff route registry.");
  } else {
    console.error("Private staff contract artifact drift detected. Run: node --experimental-strip-types packages/contracts/scripts/generate-staff-openapi.ts");
    process.exitCode = 1;
  }
}
