import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { checkOpenApiArtifact } from "../scripts/check-openapi.ts";
import { defaultArtifactPath, writeOpenApiArtifact } from "../scripts/generate-openapi.ts";
import { generateStudentContractsOpenApi, stableJson } from "../scripts/openapi.ts";

describe("student-safe OpenAPI artifact", () => {
  it("is deterministic and declares a valid OpenAPI 3.1 components-only document", () => {
    const first = stableJson(generateStudentContractsOpenApi());
    const second = stableJson(generateStudentContractsOpenApi());
    const document = JSON.parse(first) as { components?: { schemas?: Record<string, unknown> }; openapi?: string; paths?: unknown };

    assert.equal(first, second);
    assert.equal(document.openapi, "3.1.0");
    assert.deepEqual(document.paths, {});
    assert.ok(document.components?.schemas?.StudentQuestion);
    assert.ok(document.components?.schemas?.StudentSlot);
    assert.ok(document.components?.schemas?.CreationReceipt);
    assert.ok(document.components?.schemas?.AttemptView);
    assert.ok(document.components?.schemas?.AnswerSubmissionRequest);
    assert.ok(document.components?.schemas?.AnswerAck);
    assert.ok(document.components?.schemas?.ResultView);
    assert.ok(document.components?.schemas?.AttemptHistoryPage);
    assert.ok(document.components?.schemas?.DocumentedErrorResponse);
  });

  it("matches the committed artifact and detects isolated deliberate drift without rewriting it", async () => {
    assert.equal(await checkOpenApiArtifact(), true);

    const fixtureDirectory = await mkdtemp(join(tmpdir(), "tsa-openapi-"));
    const fixturePath = join(fixtureDirectory, "student-contracts.openapi.json");
    try {
      await writeOpenApiArtifact(fixturePath);
      const generated = await readFile(fixturePath, "utf8");
      await writeFile(fixturePath, `${generated}\n`, "utf8");
      assert.equal(await checkOpenApiArtifact(fixturePath), false);
      assert.equal(await readFile(fixturePath, "utf8"), `${generated}\n`);
    } finally {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("preserves all documented error codes while excluding private answer and authoring data", async () => {
    const artifact = stableJson(generateStudentContractsOpenApi());
    const { ErrorHttpStatusByCode } = await import("../src/index.ts");
    for (const code of Object.keys(ErrorHttpStatusByCode)) {
      assert.match(artifact, new RegExp(`\\"${code}\\"`));
    }
    for (const privateField of ["answerKey", "correctAnswer", "explanation", "provenance", "generationRunId", "createdBy", "scoringPolicy"]) {
      assert.equal(artifact.includes(privateField), false, `${privateField} must not be exposed`);
    }
  });
});
