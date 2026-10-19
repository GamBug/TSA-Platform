import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  BankImportReceiptSchema,
  FactoryPackageSchema,
  QuestionVersionSchema,
  StudentQuestionSchema,
  toStudentQuestion,
} from "../dist/index.js";

const ids = {
  version: "11111111-1111-4111-8111-111111111111",
  question: "22222222-2222-4222-8222-222222222222",
  taxonomy: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444",
};
const textBlock = (text) => [{ type: "text", text }];

function makeQuestion() {
  return {
    schemaVersion: "question/1",
    id: ids.version,
    questionId: ids.question,
    versionNo: 1,
    parentVersionId: null,
    language: "vi-VN",
    section: "MATH",
    taxonomyVersionId: ids.taxonomy,
    domainId: "synthetic-algebra",
    skillIds: ["synthetic-equations"],
    subskillIds: ["synthetic-one-variable"],
    cognitiveLevel: "M2",
    difficulty: { target: "MEDIUM", predicted: null, empiricalStudyId: null },
    content: textBlock("Synthetic consumer fixture: solve x + 2 = 5."),
    stimulusVersionId: null,
    interaction: {
      type: "SINGLE_CHOICE",
      options: [
        { id: "a", content: textBlock("2") },
        { id: "b", content: textBlock("3") },
      ],
    },
    private: {
      answerKey: { type: "SINGLE_CHOICE", optionId: "b" },
      explanation: textBlock("Synthetic private explanation."),
      evidenceRefs: ["synthetic-evidence"],
      scoringPolicy: "practice-binary-v1",
    },
    origin: "GENERATED",
    provenanceIds: ["synthetic-provenance"],
    generationRunId: ids.run,
    createdBy: "synthetic-factory",
    createdAt: "2026-10-18T08:00:00Z",
    contentHash: "sha256:synthetic-consumer-question",
  };
}

function makeFactoryPackage() {
  const question = makeQuestion();
  return {
    schemaVersion: "factory-package/1",
    producerNamespace: "synthetic.factory",
    batchKey: "synthetic-stage4a-batch",
    candidates: [
      {
        itemKey: "synthetic-item-001",
        candidateOrdinal: 0,
        contentHash: question.contentHash,
        question,
        provenance: [
          {
            sourceVersionId: "synthetic-source-1",
            origin: "GENERATED",
            sourceSpan: null,
            transformation: "synthetic generation",
            creator: "synthetic-factory",
            rightsEvidence: "synthetic-rights-evidence",
          },
        ],
        run: {
          generationRunId: ids.run,
          providerRunRef: "synthetic-provider-run",
          adapterRevision: "synthetic-adapter/1",
          modelRevision: "synthetic-model/1",
          promptTemplateVersion: "synthetic-template/1",
          inputHash: "sha256:synthetic-input",
          responseHash: "sha256:synthetic-response",
          sourceVersionIds: ["synthetic-source-1"],
          seed: 7,
          usage: { inputTokens: 10, outputTokens: 20, costMicros: 0 },
        },
        validations: [
          {
            validatorKind: "schema",
            validatorVersion: "synthetic-validator/1",
            inputHash: question.contentHash,
            outcome: "PASS",
            evidencePointer: "synthetic-evidence://validation/1",
            at: "2026-10-18T08:01:00Z",
            actor: "synthetic-validator",
          },
        ],
      },
    ],
  };
}

const entryUrl = JSON.stringify(pathToFileURL(resolve("packages/contracts/dist/index.js")).href);
const producerProgram = `
const { FactoryPackageSchema } = await import(${entryUrl});
const value = FactoryPackageSchema.parse(JSON.parse(process.argv[1]));
process.stdout.write(JSON.stringify(value));
`;
const consumerProgram = `
const { FactoryPackageSchema, BankImportReceiptSchema } = await import(${entryUrl});
const value = FactoryPackageSchema.parse(JSON.parse(process.argv[1]));
const candidate = value.candidates[0];
if (!candidate) throw new Error("Factory package must contain a candidate");
const receipt = BankImportReceiptSchema.parse({
  producerNamespace: value.producerNamespace,
  batchKey: value.batchKey,
  itemKey: candidate.itemKey,
  candidateOrdinal: candidate.candidateOrdinal,
  inputHash: candidate.contentHash,
  questionId: candidate.question.questionId,
  questionVersionId: candidate.question.id,
  generationRunId: candidate.run.generationRunId,
  workflowState: "DRAFT",
});
process.stdout.write(JSON.stringify(receipt));
`;

function runNode(program, input) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", program, JSON.stringify(input)], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.ifError(result.error);
  return result;
}

describe("emitted contract consumers", () => {
  it("exchanges serialized Factory and Bank messages between independent Node processes", () => {
    const source = makeFactoryPackage();
    const produced = runNode(producerProgram, source);
    assert.equal(produced.status, 0, produced.stderr);

    const wirePackage = JSON.parse(produced.stdout);
    const consumed = runNode(consumerProgram, wirePackage);
    assert.equal(consumed.status, 0, consumed.stderr);

    const receipt = BankImportReceiptSchema.parse(JSON.parse(consumed.stdout));
    assert.equal(wirePackage.schemaVersion, "factory-package/1");
    assert.equal(wirePackage.candidates[0].question.origin, "GENERATED");
    assert.equal(receipt.workflowState, "DRAFT");
    assert.equal(receipt.questionVersionId, wirePackage.candidates[0].question.id);
  });

  it("rejects malformed, approval-like, unknown, and not-yet-approved optional package fields", () => {
    const source = makeFactoryPackage();
    const malformed = structuredClone(source);
    malformed.candidates[0].question.section = "WRITING";
    assert.notEqual(runNode(producerProgram, malformed).status, 0);

    const approvalLike = { ...source, workflowState: "APPROVED" };
    assert.notEqual(runNode(consumerProgram, approvalLike).status, 0);

    const unknownField = { ...source, providerCredentials: "synthetic-secret" };
    assert.notEqual(runNode(consumerProgram, unknownField).status, 0);

    const futureOptionalField = { ...source, reviewNote: null };
    assert.equal(FactoryPackageSchema.safeParse(futureOptionalField).success, false);
  });

  it("rejects changed Bank responses and hypothetical optional fields under the current strict contract", () => {
    const source = makeFactoryPackage();
    const validReceipt = BankImportReceiptSchema.parse({
      producerNamespace: source.producerNamespace,
      batchKey: source.batchKey,
      itemKey: source.candidates[0].itemKey,
      candidateOrdinal: source.candidates[0].candidateOrdinal,
      inputHash: source.candidates[0].contentHash,
      questionId: source.candidates[0].question.questionId,
      questionVersionId: source.candidates[0].question.id,
      generationRunId: source.candidates[0].run.generationRunId,
      workflowState: "DRAFT",
    });

    assert.equal(
      BankImportReceiptSchema.safeParse({ ...validReceipt, workflowState: "APPROVED" }).success,
      false,
    );
    assert.equal(
      BankImportReceiptSchema.safeParse({ ...validReceipt, futureOptionalField: null }).success,
      false,
    );
  });

  it("projects a valid canonical question without private or authoring fields", () => {
    const canonical = QuestionVersionSchema.parse(makeQuestion());
    const student = toStudentQuestion(canonical);
    assert.deepEqual(StudentQuestionSchema.parse(student), student);

    for (const privateField of ["private", "answerKey", "explanation", "provenanceIds", "generationRunId", "contentHash"]) {
      assert.equal(Object.hasOwn(student, privateField), false);
      assert.equal(JSON.stringify(student).includes(privateField), false);
    }
    assert.equal(JSON.stringify(student).includes("Synthetic private explanation"), false);
    assert.equal(StudentQuestionSchema.safeParse({ ...student, private: canonical.private }).success, false);
  });

  it("type-checks a strict consumer against emitted declarations", () => {
    const typecheck = spawnSync(
      process.execPath,
      [
        resolve("node_modules/typescript/bin/tsc"),
        "--noEmit",
        "--strict",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--skipLibCheck",
        "--types",
        "node",
        resolve("packages/contracts/test/fixtures/stage4a/consumer.mts"),
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.ifError(typecheck.error);
    assert.equal(typecheck.status, 0, `${typecheck.stdout}\n${typecheck.stderr}`);
  });
});
