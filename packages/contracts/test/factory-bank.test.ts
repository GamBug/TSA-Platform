import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BankImportReceiptSchema,
  FactoryJobStateSchema,
  FactoryBatchStatusSchema,
  FactoryPackageSchema,
  FactoryRunMetadataSchema,
  GenerationRequestSchema,
  ProviderErrorSchema,
  ProviderResultSchema,
  toStudentQuestion,
} from "../src/index.ts";
import { bankImportReceiptFixture, factoryPackageFixture } from "./fixtures/factory-package.ts";

function cloneFixture(): Record<string, unknown> {
  return structuredClone(factoryPackageFixture) as Record<string, unknown>;
}

describe("Factory-to-Bank internal contracts", () => {
  it("accepts deterministic synthetic producer and consumer fixtures", () => {
    const first = FactoryPackageSchema.parse(factoryPackageFixture);
    const second = FactoryPackageSchema.parse(factoryPackageFixture);
    const receipt = BankImportReceiptSchema.parse(bankImportReceiptFixture);

    assert.deepEqual(first, second);
    assert.equal(receipt.producerNamespace, first.producerNamespace);
    assert.equal(receipt.batchKey, first.batchKey);
    assert.equal(receipt.itemKey, first.candidates[0]!.itemKey);
    assert.equal(receipt.inputHash, first.candidates[0]!.contentHash);
  });

  it("accepts only the documented provider-neutral request, result, and error shapes", () => {
    assert.equal(
      GenerationRequestSchema.safeParse({
        specificationVersion: "generation/1",
        requestId: "synthetic-request-1",
        sourceVersionIds: ["synthetic-source-version-1"],
        taxonomyVersionId: "synthetic-taxonomy-version-1",
        section: "MATH",
        skillIds: ["synthetic-linear-equations"],
        interactionType: "SINGLE_CHOICE",
        cognitiveLevel: null,
        language: "vi-VN",
        count: 1,
        promptTemplateVersion: "synthetic-template/1",
        outputSchemaVersion: "question/1",
        seed: 7,
        budget: { maxInputTokens: 100, maxOutputTokens: 100, maxCostMicros: 0 },
      }).success,
      true,
    );
    assert.equal(
      ProviderResultSchema.safeParse({
        candidates: [{}],
        providerRunRef: "synthetic-run-1",
        modelRevision: "synthetic-model/1",
        usage: { inputTokens: 10, outputTokens: 20, costMicros: null },
        finishReason: "COMPLETE",
      }).success,
      true,
    );
    assert.equal(ProviderErrorSchema.safeParse({ code: "TIMEOUT", retryable: true }).success, true);
    assert.equal(ProviderErrorSchema.safeParse({ code: "TIMEOUT", retryable: true, vendorError: "private" }).success, false);
  });

  it("rejects unsupported versions, unknown fields, and incomplete provenance", () => {
    const unsupported = cloneFixture();
    unsupported.schemaVersion = "factory-package/2";
    assert.equal(FactoryPackageSchema.safeParse(unsupported).success, false);

    const unknown = cloneFixture();
    unknown.approved = true;
    assert.equal(FactoryPackageSchema.safeParse(unknown).success, false);

    const missingProvenance = cloneFixture();
    (missingProvenance.candidates as Array<Record<string, unknown>>)[0]!.provenance = [];
    assert.equal(FactoryPackageSchema.safeParse(missingProvenance).success, false);
  });

  it("rejects invalid candidate envelopes and inconsistent run metadata", () => {
    const wrongHash = cloneFixture();
    (wrongHash.candidates as Array<Record<string, unknown>>)[0]!.contentHash = "sha256:changed";
    assert.equal(FactoryPackageSchema.safeParse(wrongHash).success, false);

    const duplicateIdentity = cloneFixture();
    const candidates = duplicateIdentity.candidates as Array<Record<string, unknown>>;
    candidates.push(structuredClone(candidates[0]!));
    assert.equal(FactoryPackageSchema.safeParse(duplicateIdentity).success, false);

    assert.equal(
      FactoryRunMetadataSchema.safeParse({ ...factoryPackageFixture.candidates[0]!.run, usage: { inputTokens: -1, outputTokens: 0, costMicros: 0 } }).success,
      false,
    );
  });

  it("enforces documented lifecycle states and pause metadata", () => {
    assert.equal(FactoryBatchStatusSchema.safeParse({ state: "PAUSED", pauseReason: "BUDGET" }).success, true);
    assert.equal(FactoryBatchStatusSchema.safeParse({ state: "PAUSED", pauseReason: null }).success, false);
    assert.equal(FactoryBatchStatusSchema.safeParse({ state: "COMPLETED", pauseReason: "BUDGET" }).success, false);
    assert.equal(FactoryBatchStatusSchema.safeParse({ state: "PUBLISHED", pauseReason: null }).success, false);
    assert.equal(FactoryJobStateSchema.safeParse("QUEUED").success, true);
    assert.equal(FactoryJobStateSchema.safeParse("PUBLISHED").success, false);
  });

  it("keeps Factory exports draft-only and preserves the private-data boundary", () => {
    assert.equal(BankImportReceiptSchema.safeParse({ ...bankImportReceiptFixture, workflowState: "APPROVED" }).success, false);
    assert.equal(FactoryPackageSchema.safeParse({ ...cloneFixture(), workflowState: "DRAFT" }).success, false);

    const studentQuestion = toStudentQuestion(factoryPackageFixture.candidates[0]!.question);
    const serialized = JSON.stringify(studentQuestion);
    for (const internalField of ["answerKey", "explanation", "provenance", "generationRunId", "modelRevision", "promptTemplateVersion"]) {
      assert.equal(serialized.includes(internalField), false, `${internalField} must not enter a student projection`);
    }
  });
});
