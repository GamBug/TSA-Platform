import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { generateStaffContractsOpenApi, generateStaffOperationTypes, staffStableJson } from "./staff-openapi.ts";

export const defaultStaffArtifactPath = resolve(import.meta.dirname, "../openapi/staff-contracts.openapi.json");
export const defaultStaffOperationsPath = resolve(import.meta.dirname, "../src/generated/staff-operations.ts");

async function writeStaffArtifact(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function writeStaffOpenApiArtifacts(paths: { artifact?: string; operations?: string } = {}): Promise<void> {
  await Promise.all([
    writeStaffArtifact(paths.artifact ?? defaultStaffArtifactPath, staffStableJson(generateStaffContractsOpenApi())),
    writeStaffArtifact(paths.operations ?? defaultStaffOperationsPath, generateStaffOperationTypes()),
  ]);
}

if (import.meta.main) {
  await writeStaffOpenApiArtifacts();
  console.log("Generated private staff OpenAPI and operation-map artifacts.");
}
