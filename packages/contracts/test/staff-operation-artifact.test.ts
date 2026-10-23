import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  defaultStaffArtifactPath,
  defaultStaffOperationsPath,
} from "../scripts/generate-staff-openapi.ts";
import { checkStaffOpenApiArtifacts } from "../scripts/check-staff-openapi.ts";
import {
  generateStaffContractsOpenApi,
  generateStaffOperationTypes,
  staffStableJson,
} from "../scripts/staff-openapi.ts";
import { generateStudentContractsOpenApi } from "../scripts/openapi.ts";

type StaffDocument = {
  openapi?: string;
  paths?: Record<string, Record<string, {
    operationId?: string;
    requestBody?: unknown;
    parameters?: Array<{ in?: string; name?: string }>;
    responses?: Record<string, {
      content?: Record<string, { schema?: unknown }>;
      headers?: Record<string, unknown>;
    }>;
  }>>;
  components?: { schemas?: Record<string, unknown> };
};

describe("dedicated private staff GET artifacts", () => {
  it("describes one exact GET and leaves the student registry separate", async () => {
    const artifact = staffStableJson(generateStaffContractsOpenApi());
    assert.equal(artifact, staffStableJson(generateStaffContractsOpenApi()));
    const document = JSON.parse(artifact) as StaffDocument;
    assert.equal(document.openapi, "3.1.0");
    assert.deepEqual(Object.keys(document.paths ?? {}), ["/api/v1/question-versions/{versionId}/review-context"]);
    const path = document.paths?.["/api/v1/question-versions/{versionId}/review-context"];
    assert.deepEqual(Object.keys(path ?? {}), ["get"]);
    const operation = path?.get;
    assert.equal(operation?.operationId, "staffReviewContext");
    assert.equal(operation?.requestBody, undefined);
    assert.deepEqual(operation?.parameters?.map(({ name, in: location }) => ({ name, in: location })), [{ name: "versionId", in: "path" }]);
    assert.deepEqual(Object.keys(operation?.responses ?? {}), ["200", "401", "403", "404", "422", "503"]);
    assert.ok(operation?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(operation?.responses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "Vary",
      "X-Content-Type-Options",
      "X-Request-Id",
    ]);
    assert.ok(document.components?.schemas?.StaffReviewContext);

    const student = JSON.parse(JSON.stringify(generateStudentContractsOpenApi())) as StaffDocument;
    const studentOperationCount = Object.values(student.paths ?? {}).reduce(
      (count, path) => count + Object.keys(path).length,
      0,
    );
    assert.equal(studentOperationCount, 8);
    assert.equal(student.paths?.["/api/v1/question-versions/{versionId}/review-context"], undefined);
    assert.equal(student.components?.schemas?.StaffReviewContext, undefined);
  });

  it("matches the committed private OpenAPI and operation-map artifacts and detects drift without rewriting", async () => {
    assert.equal(await readFile(defaultStaffOperationsPath, "utf8"), generateStaffOperationTypes());
    assert.equal(await checkStaffOpenApiArtifacts(), true);

    const directory = await mkdtemp(join(tmpdir(), "tsa-staff-openapi-"));
    const paths = {
      artifact: join(directory, "staff.openapi.json"),
      operations: join(directory, "staff-operations.ts"),
    };
    const originals = {
      artifact: await readFile(defaultStaffArtifactPath, "utf8"),
      operations: await readFile(defaultStaffOperationsPath, "utf8"),
    };
    try {
      await writeFile(paths.artifact, originals.artifact, "utf8");
      await writeFile(paths.operations, originals.operations, "utf8");
      assert.equal(await checkStaffOpenApiArtifacts(paths), true);

      await writeFile(paths.artifact, `${originals.artifact}\n`, "utf8");
      assert.equal(await checkStaffOpenApiArtifacts(paths), false, "artifact drift must fail");
      assert.equal(await readFile(paths.artifact, "utf8"), `${originals.artifact}\n`, "checker must not rewrite drift");
      await writeFile(paths.artifact, originals.artifact, "utf8");

      await rm(paths.operations);
      assert.equal(await checkStaffOpenApiArtifacts(paths), false, "missing operation map must fail");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
