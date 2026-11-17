import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  defaultArtifactPath,
  defaultReleasedReviewArtifactPath,
  defaultReleasedReviewOperationsPath,
  defaultStudentOperationsPath,
  writeOpenApiArtifact,
} from "../scripts/generate-openapi.ts";
import { checkOpenApiArtifact, checkOpenApiArtifacts } from "../scripts/check-openapi.ts";
import { ErrorHttpStatusByCode } from "../src/index.ts";
import {
  generateReleasedReviewContractsOpenApi,
  generateReleasedReviewOperationTypes,
  generateStudentContractsOpenApi,
  generateStudentOperationTypes,
  stableJson,
} from "../scripts/openapi.ts";

type ApiDocument = {
  openapi?: string;
  paths?: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: unknown }>; headers?: Record<string, unknown> }> }>>;
  components?: { schemas?: Record<string, unknown> };
};

function publicPropertyNames(value: unknown, output = new Set<string>()): Set<string> {
  if (value === null || typeof value !== "object") return output;
  const record = value as Record<string, unknown>;
  if (record.properties !== null && typeof record.properties === "object") {
    for (const [name, schema] of Object.entries(record.properties as Record<string, unknown>)) {
      output.add(name);
      publicPropertyNames(schema, output);
    }
  }
  for (const [key, nested] of Object.entries(record)) if (key !== "properties") publicPropertyNames(nested, output);
  return output;
}

const artifacts = {
  student: defaultArtifactPath,
  releasedReview: defaultReleasedReviewArtifactPath,
  studentOperations: defaultStudentOperationsPath,
  releasedReviewOperations: defaultReleasedReviewOperationsPath,
} as const;

describe("generated routes/1 artifacts", () => {
  it("keeps the eight student operations and the released result on a separate document", () => {
    const studentText = stableJson(generateStudentContractsOpenApi());
    const reviewText = stableJson(generateReleasedReviewContractsOpenApi());
    assert.equal(studentText, stableJson(generateStudentContractsOpenApi()));
    assert.equal(reviewText, stableJson(generateReleasedReviewContractsOpenApi()));
    const student = JSON.parse(studentText) as ApiDocument;
    const review = JSON.parse(reviewText) as ApiDocument;
    const operationCount = (document: ApiDocument) => Object.values(document.paths ?? {}).reduce((sum, path) => sum + Object.keys(path).length, 0);

    assert.equal(student.openapi, "3.1.0");
    assert.equal(operationCount(student), 8);
    assert.equal(operationCount(review), 1);
    assert.equal(student.paths?.["/api/v1/attempts/{id}/result"], undefined);
    assert.deepEqual(Object.keys(review.paths ?? {}), ["/api/v1/attempts/{id}/result"]);
    assert.ok(student.components?.schemas?.StudentQuestion);
    assert.ok(student.components?.schemas?.StudentSlot);
    assert.ok(student.components?.schemas?.CreationReceipt);
    assert.ok(student.components?.schemas?.AttemptView);
    assert.ok(student.components?.schemas?.AnswerSubmissionRequest);
    assert.ok(student.components?.schemas?.AnswerAck);
    assert.ok(student.components?.schemas?.DocumentedErrorResponse);
    assert.ok(student.components?.schemas?.ResultView);
    assert.ok(student.components?.schemas?.AttemptHistoryItem);
    assert.ok(student.components?.schemas?.AttemptHistoryPage);
    assert.equal(student.components?.schemas?.AnswerKey, undefined);
    assert.equal(student.components?.schemas?.AuthorizedReleasedReview, undefined);
    assert.ok(review.components?.schemas?.AuthorizedReleasedReview);
    assert.ok(review.components?.schemas?.AnswerKey);

    const asset200 = student.paths?.["/api/v1/attempts/{id}/assets/{assetVersionId}"]?.get?.responses?.["200"];
    assert.ok(asset200?.content?.["image/*"]?.schema);
    const retryAfter = student.paths?.["/api/v1/attempts"]?.post?.responses?.["429"]?.headers?.["Retry-After"] as { required?: boolean; schema?: { pattern?: string } } | undefined;
    assert.equal(retryAfter?.required, true);
    assert.equal(retryAfter?.schema?.pattern, "^[1-9][0-9]*$");

    const studentNames = publicPropertyNames(student.components?.schemas ?? {});
    for (const code of Object.keys(ErrorHttpStatusByCode)) assert.ok(studentText.includes(`\"${code}\"`), `legacy error code ${code} stays documented`);
    for (const field of ["answerKey", "correctAnswer", "explanation", "private", "provenance", "generationRunId", "createdBy", "scoringPolicy"]) {
      assert.equal(studentNames.has(field), false, `student schema property ${field} must stay private`);
    }
    const purpose = student.components?.schemas?.AssetPurpose as { properties?: { purpose?: { enum?: string[] } } } | undefined;
    assert.deepEqual(purpose?.properties?.purpose?.enum, ["question", "explanation"]);

    const reviewNames = publicPropertyNames(review.components?.schemas ?? {});
    assert.equal(reviewNames.has("correctAnswer"), true);
    assert.equal(reviewNames.has("explanation"), true);
    assert.match(studentText, /Cookie-backed authenticated sessions/);
    assert.match(studentText, /validated Origin/);
  });

  it("checks all four committed artifacts and detects missing or changed files without rewriting them", async () => {
    assert.equal(generateStudentOperationTypes(), await readFile(defaultStudentOperationsPath, "utf8"));
    assert.equal(generateReleasedReviewOperationTypes(), await readFile(defaultReleasedReviewOperationsPath, "utf8"));
    assert.equal(await checkOpenApiArtifacts(), true);
    assert.equal(await checkOpenApiArtifact(), true);

    const fixtureDirectory = await mkdtemp(join(tmpdir(), "tsa-routes-openapi-"));
    const paths = {
      student: join(fixtureDirectory, "student.openapi.json"),
      releasedReview: join(fixtureDirectory, "review.openapi.json"),
      studentOperations: join(fixtureDirectory, "student-operations.ts"),
      releasedReviewOperations: join(fixtureDirectory, "review-operations.ts"),
    };
    const entries = Object.entries(artifacts) as [keyof typeof artifacts, string][];
    try {
      const contents = new Map<keyof typeof artifacts, string>();
      for (const [key, sourcePath] of entries) {
        const content = await readFile(sourcePath, "utf8");
        contents.set(key, content);
        await writeFile(paths[key], content, "utf8");
      }
      assert.equal(await checkOpenApiArtifacts(paths), true);
      for (const [key] of entries) {
        const original = contents.get(key)!;
        await writeFile(paths[key], `${original}\n`, "utf8");
        assert.equal(await checkOpenApiArtifacts(paths), false, `${key} drift must fail`);
        assert.equal(await readFile(paths[key], "utf8"), `${original}\n`, `${key} drift check must not rewrite`);
        await rm(paths[key]);
        assert.equal(await checkOpenApiArtifacts(paths), false, `${key} missing artifact must fail`);
        await writeFile(paths[key], original, "utf8");
      }
      assert.equal(await checkOpenApiArtifacts(paths), true);
    } finally {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("retains stable UTF-16 code-unit key ordering for canonical artifact output", () => {
    const value = stableJson({ "\uE000": 1, "\u{10000}": 2 });
    assert.ok(value.indexOf("\u{10000}") < value.indexOf("\uE000"));
  });

  it("can render an isolated student document without altering committed output", async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "tsa-openapi-single-"));
    const fixturePath = join(fixtureDirectory, "student-contracts.openapi.json");
    try {
      await writeOpenApiArtifact(fixturePath);
      const generated = await readFile(fixturePath, "utf8");
      assert.equal(await checkOpenApiArtifact(fixturePath), true);
      await writeFile(fixturePath, `${generated}\n`, "utf8");
      assert.equal(await checkOpenApiArtifact(fixturePath), false);
      assert.equal(await readFile(fixturePath, "utf8"), `${generated}\n`);
    } finally {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });
});
