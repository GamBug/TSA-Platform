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
    description?: string;
    requestBody?: {
      required?: boolean;
      description?: string;
      content?: Record<string, { schema?: unknown }>;
    };
    parameters?: Array<{ in?: string; name?: string; required?: boolean }>;
    responses?: Record<string, {
      description?: string;
      content?: Record<string, { schema?: unknown }>;
      headers?: Record<string, unknown>;
    }>;
  }>>;
  components?: { schemas?: Record<string, unknown> };
};

describe("dedicated private staff artifacts", () => {
  it("describes exact private staff routes while leaving the student registry separate", async () => {
    const artifact = staffStableJson(generateStaffContractsOpenApi());
    assert.equal(artifact, staffStableJson(generateStaffContractsOpenApi()));
    const document = JSON.parse(artifact) as StaffDocument;
    assert.equal(document.openapi, "3.1.0");
    assert.deepEqual(Object.keys(document.paths ?? {}), [
      "/api/v1/assembly-runs",
      "/api/v1/assembly-runs/{assemblyRunId}/diagnostics",
      "/api/v1/datasets/preflight",
      "/api/v1/question-versions/{versionId}/quarantine",
      "/api/v1/question-versions/{versionId}/review-context",
      "/api/v1/question-versions/{versionId}/review-evidence",
      "/api/v1/question-versions/{versionId}/review-history",
      "/api/v1/question-versions/{versionId}/reviews",
      "/api/v1/question-versions/{versionId}/submit-review",
    ]);
    const fixedRunsPath = document.paths?.["/api/v1/assembly-runs"];
    assert.deepEqual(Object.keys(fixedRunsPath ?? {}), ["get"]);
    const fixedRuns = fixedRunsPath?.get;
    assert.equal(fixedRuns?.operationId, "staffFixedAssemblyRuns");
    assert.match(fixedRuns?.description ?? "", /BANK_MANAGER/);
    assert.match(fixedRuns?.description ?? "", /bank\.diagnostics\.read/);
    assert.equal(fixedRuns?.requestBody, undefined);
    assert.deepEqual(fixedRuns?.parameters ?? [], []);
    assert.deepEqual(Object.keys(fixedRuns?.responses ?? {}), ["200", "401", "403", "404", "422", "503"]);
    assert.ok(fixedRuns?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(fixedRuns?.responses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "Vary",
      "X-Content-Type-Options",
      "X-Request-Id",
    ]);
    assert.ok(document.components?.schemas?.StaffFixedAssemblyRunList);

    const fixedDiagnosticPath = document.paths?.["/api/v1/assembly-runs/{assemblyRunId}/diagnostics"];
    assert.deepEqual(Object.keys(fixedDiagnosticPath ?? {}), ["get"]);
    const fixedDiagnostic = fixedDiagnosticPath?.get;
    assert.equal(fixedDiagnostic?.operationId, "staffFixedAssemblyDiagnostic");
    assert.match(fixedDiagnostic?.description ?? "", /does not establish current feasibility/);
    assert.equal(fixedDiagnostic?.requestBody, undefined);
    assert.deepEqual(fixedDiagnostic?.parameters?.map(({ name, in: location }) => ({ name, in: location })), [
      { name: "assemblyRunId", in: "path" },
    ]);
    assert.deepEqual(Object.keys(fixedDiagnostic?.responses ?? {}), ["200", "401", "403", "404", "422", "503"]);
    assert.ok(fixedDiagnostic?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(fixedDiagnostic?.responses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "Vary",
      "X-Content-Type-Options",
      "X-Request-Id",
    ]);
    assert.ok(document.components?.schemas?.StaffFixedAssemblyDiagnostic);
    assert.ok(document.components?.schemas?.StaffFixedAssemblyDiagnosticPathParams);

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

    const evidencePath = document.paths?.["/api/v1/question-versions/{versionId}/review-evidence"];
    assert.deepEqual(Object.keys(evidencePath ?? {}), ["get"]);
    const evidence = evidencePath?.get;
    assert.equal(evidence?.operationId, "staffReviewEvidence");
    assert.equal(evidence?.requestBody, undefined);
    assert.deepEqual(evidence?.parameters?.map(({ name, in: location }) => ({ name, in: location })), [
      { name: "versionId", in: "path" },
    ]);
    assert.deepEqual(Object.keys(evidence?.responses ?? {}), ["200", "401", "403", "404", "422", "503"]);
    assert.match(evidence?.responses?.["404"]?.description ?? "", /missing, malformed, or outside/);
    assert.match(evidence?.responses?.["422"]?.description ?? "", /Unexpected query or request body/);
    assert.ok(evidence?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(evidence?.responses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "Vary",
      "X-Content-Type-Options",
      "X-Request-Id",
    ]);
    assert.ok(document.components?.schemas?.StaffReviewEvidence);

    const submitPath = document.paths?.["/api/v1/question-versions/{versionId}/submit-review"];
    assert.deepEqual(Object.keys(submitPath ?? {}), ["post"]);
    const submit = submitPath?.post;
    assert.equal(submit?.operationId, "staffSubmitReview");
    assert.match(submit?.description ?? "", /same-origin staff session/);
    assert.match(submit?.description ?? "", /after parsing/);
    assert.deepEqual(submit?.parameters?.map(({ name, in: location, required }) => ({ name, in: location, required })), [
      { name: "versionId", in: "path", required: true },
      { name: "x-csrf-token", in: "header", required: true },
      { name: "idempotency-key", in: "header", required: true },
    ]);
    assert.equal(submit?.requestBody?.required, true);
    assert.ok(submit?.requestBody?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(submit?.responses ?? {}), ["200", "400", "401", "403", "404", "409", "413", "422", "503"]);
    assert.ok(submit?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(submit?.responses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "Vary",
      "X-Content-Type-Options",
      "X-Request-Id",
    ]);
    assert.ok(document.components?.schemas?.StaffSubmitReviewRequest);
    assert.ok(document.components?.schemas?.StaffSubmitReviewResponse);
    assert.ok(document.components?.schemas?.StaffSubmitReviewRequestHeaders);
    const requestRevision = (document.components?.schemas?.StaffSubmitReviewRequest as {
      properties?: Record<string, { minimum?: number; maximum?: number }>;
    })?.properties?.expectedRevision;
    const responseRevision = (document.components?.schemas?.StaffSubmitReviewResponse as {
      properties?: Record<string, { minimum?: number; maximum?: number }>;
    })?.properties?.revision;
    assert.equal(requestRevision?.minimum, 1);
    assert.equal(requestRevision?.maximum, Number.MAX_SAFE_INTEGER);
    assert.equal(responseRevision?.minimum, 1);
    assert.equal(responseRevision?.maximum, Number.MAX_SAFE_INTEGER);

    const historyPath = document.paths?.["/api/v1/question-versions/{versionId}/review-history"];
    assert.deepEqual(Object.keys(historyPath ?? {}), ["get"]);
    const history = historyPath?.get;
    assert.equal(history?.operationId, "staffReviewHistory");
    assert.match(history?.description ?? "", /BANK_MANAGER/);
    assert.match(history?.description ?? "", /bank\.diagnostics\.read/);
    assert.deepEqual(history?.parameters?.map(({ name, in: location, required }) => ({ name, in: location, required })), [
      { name: "versionId", in: "path", required: true },
    ]);
    assert.equal(history?.requestBody, undefined);
    assert.deepEqual(Object.keys(history?.responses ?? {}), ["200", "401", "403", "404", "422", "503"]);
    assert.ok(history?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(history?.responses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "Vary",
      "X-Content-Type-Options",
      "X-Request-Id",
    ]);
    assert.ok(document.components?.schemas?.StaffReviewHistory);
    assert.ok(document.components?.schemas?.StaffReviewHistoryPathParams);
    const historySchema = document.components?.schemas?.StaffReviewHistory as {
      properties?: Record<string, {
        pattern?: string;
        items?: { properties?: Record<string, { pattern?: string }> };
      }>;
    };
    const canonicalUtcPattern = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z$";
    assert.equal(historySchema?.properties?.observedAt?.pattern, canonicalUtcPattern);
    assert.equal(historySchema?.properties?.reviews?.items?.properties?.recordedAt?.pattern, canonicalUtcPattern);

    const preflightPath = document.paths?.["/api/v1/datasets/preflight"];
    assert.deepEqual(Object.keys(preflightPath ?? {}), ["post"]);
    const preflight = preflightPath?.post;
    assert.equal(preflight?.operationId, "staffDatasetPreflight");
    assert.match(preflight?.description ?? "", /BANK_MANAGER/);
    assert.match(preflight?.description ?? "", /does not establish accepted inventory/);
    assert.match(preflight?.description ?? "", /no idempotency key/);
    assert.equal(preflight?.requestBody?.required, true);
    assert.deepEqual(preflight?.parameters?.map(({ name, in: location, required }) => ({ name, in: location, required })), [
      { name: "x-csrf-token", in: "header", required: true },
    ]);
    assert.deepEqual(Object.keys(preflight?.responses ?? {}), ["200", "400", "401", "403", "404", "409", "413", "422", "503"]);
    assert.ok(preflight?.requestBody?.content?.["application/json"]?.schema);
    assert.ok(preflight?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.deepEqual(Object.keys(preflight?.responses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "Vary",
      "X-Content-Type-Options",
      "X-Request-Id",
    ]);
    assert.ok(document.components?.schemas?.StaffDatasetPreflightRequest);
    assert.ok(document.components?.schemas?.StaffDatasetPreflightRequestHeaders);
    assert.ok(document.components?.schemas?.StaffDatasetPreflight);
    assert.equal(preflight?.parameters?.some(({ in: location }) => location === "query" || location === "path"), false);

    const rejectPath = document.paths?.["/api/v1/question-versions/{versionId}/reviews"];
    assert.deepEqual(Object.keys(rejectPath ?? {}), ["post"]);
    const reject = rejectPath?.post;
    assert.equal(reject?.operationId, "staffRejectReview");
    assert.match(reject?.description ?? "", /same-origin staff session/);
    assert.match(reject?.description ?? "", /independence/);
    assert.deepEqual(reject?.parameters?.map(({ name, in: location, required }) => ({ name, in: location, required })), [
      { name: "versionId", in: "path", required: true },
      { name: "x-csrf-token", in: "header", required: true },
      { name: "idempotency-key", in: "header", required: true },
    ]);
    assert.equal(reject?.requestBody?.required, true);
    assert.deepEqual(Object.keys(reject?.responses ?? {}), ["201", "400", "401", "403", "404", "409", "413", "422", "503"]);
    assert.ok(reject?.requestBody?.content?.["application/json"]?.schema);
    assert.ok(reject?.responses?.["201"]?.content?.["application/json"]?.schema);
    assert.ok(document.components?.schemas?.StaffRejectReviewRequest);
    assert.ok(document.components?.schemas?.StaffRejectReviewResponse);

    const quarantinePath = document.paths?.["/api/v1/question-versions/{versionId}/quarantine"];
    assert.deepEqual(Object.keys(quarantinePath ?? {}), ["post"]);
    const quarantine = quarantinePath?.post;
    assert.equal(quarantine?.operationId, "staffQuarantine");
    assert.match(quarantine?.description ?? "", /delivery-hold drain completion/);
    assert.deepEqual(quarantine?.parameters?.map(({ name, in: location, required }) => ({ name, in: location, required })), [
      { name: "versionId", in: "path", required: true },
      { name: "x-csrf-token", in: "header", required: true },
      { name: "idempotency-key", in: "header", required: true },
    ]);
    assert.equal(quarantine?.requestBody?.required, true);
    assert.deepEqual(Object.keys(quarantine?.responses ?? {}), ["200", "400", "401", "403", "404", "409", "413", "422", "503"]);
    assert.ok(quarantine?.requestBody?.content?.["application/json"]?.schema);
    assert.ok(quarantine?.responses?.["200"]?.content?.["application/json"]?.schema);
    assert.ok(document.components?.schemas?.StaffQuarantineRequest);
    assert.ok(document.components?.schemas?.StaffQuarantineResponse);

    const student = JSON.parse(JSON.stringify(generateStudentContractsOpenApi())) as StaffDocument;
    const studentOperationCount = Object.values(student.paths ?? {}).reduce(
      (count, path) => count + Object.keys(path).length,
      0,
    );
    assert.equal(studentOperationCount, 8);
    assert.equal(student.paths?.["/api/v1/question-versions/{versionId}/review-context"], undefined);
    assert.equal(student.components?.schemas?.StaffReviewContext, undefined);
    assert.equal(student.paths?.["/api/v1/question-versions/{versionId}/review-evidence"], undefined);
    assert.equal(student.components?.schemas?.StaffReviewEvidence, undefined);
    assert.equal(student.paths?.["/api/v1/question-versions/{versionId}/review-history"], undefined);
    assert.equal(student.components?.schemas?.StaffReviewHistory, undefined);
    assert.equal(student.paths?.["/api/v1/datasets/preflight"], undefined);
    assert.equal(student.components?.schemas?.StaffDatasetPreflight, undefined);
    assert.equal(student.components?.schemas?.StaffDatasetPreflightRequest, undefined);
    assert.equal(student.paths?.["/api/v1/question-versions/{versionId}/submit-review"], undefined);
    assert.equal(student.components?.schemas?.StaffSubmitReviewRequest, undefined);
    assert.equal(student.paths?.["/api/v1/question-versions/{versionId}/reviews"], undefined);
    assert.equal(student.components?.schemas?.StaffRejectReviewRequest, undefined);
    assert.equal(student.paths?.["/api/v1/question-versions/{versionId}/quarantine"], undefined);
    assert.equal(student.components?.schemas?.StaffQuarantineRequest, undefined);
    assert.equal(student.paths?.["/api/v1/assembly-runs"], undefined);
    assert.equal(student.paths?.["/api/v1/assembly-runs/{assemblyRunId}/diagnostics"], undefined);
    assert.equal(student.components?.schemas?.StaffFixedAssemblyRunList, undefined);
    assert.equal(student.components?.schemas?.StaffFixedAssemblyDiagnostic, undefined);
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
