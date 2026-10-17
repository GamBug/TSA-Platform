import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AnswerSubmissionRequestSchema,
  AttemptViewSchema,
  BankImportReceiptSchema,
  FactoryPackageSchema,
  MvpBlueprintConfigSchema,
  QuestionVersionSchema,
  ResultViewSchema,
  StudentSlotSchema,
  parseResponseForInteraction,
  toStudentQuestion,
} from "../src/index.ts";
import { bankImportReceiptFixture, factoryPackageFixture } from "./fixtures/factory-package.ts";

const slotId = "55555555-5555-4555-8555-555555555555";
const imageId = "66666666-6666-4666-8666-666666666666";

function candidate() {
  return structuredClone(factoryPackageFixture.candidates[0]!);
}

describe("synthetic producer and consumer vectors", () => {
  it("round-trips the documented Factory package and Bank draft receipt shapes", () => {
    const wire = JSON.stringify(factoryPackageFixture);
    const imported = FactoryPackageSchema.parse(JSON.parse(wire));
    const draft = QuestionVersionSchema.parse(imported.candidates[0]!.question);
    const receipt = BankImportReceiptSchema.parse(JSON.parse(JSON.stringify(bankImportReceiptFixture)));
    assert.equal(JSON.stringify(imported), wire);
    assert.equal(imported.schemaVersion, "factory-package/1");
    assert.equal(draft.schemaVersion, "question/1");
    assert.equal(receipt.inputHash, draft.contentHash);
    assert.equal(receipt.questionId, draft.questionId);
    assert.equal(receipt.questionVersionId, draft.id);
    assert.equal(receipt.workflowState, "DRAFT");
    assert.equal(FactoryPackageSchema.safeParse({ ...imported, workflowState: "APPROVED" }).success, false);
    assert.equal(FactoryPackageSchema.safeParse({ ...imported, providerCredentials: "synthetic-secret" }).success, false);
    assert.equal(BankImportReceiptSchema.safeParse({ ...receipt, workflowState: "APPROVED" }).success, false);
  });

  it("parses equivalent field orders and enforces typed identity fields", () => {
    const source = candidate().question;
    const reversed = Object.fromEntries(Object.entries(source).reverse());
    assert.deepEqual(QuestionVersionSchema.parse(reversed), QuestionVersionSchema.parse(source));
    assert.equal(QuestionVersionSchema.safeParse({ ...source, id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }).success, false);
    assert.equal(QuestionVersionSchema.safeParse({ ...source, versionNo: "1" }).success, false);
    assert.equal(QuestionVersionSchema.safeParse({ ...source, contentHash: 1 }).success, false);
  });

  it("preserves documented content blocks without whitespace, Unicode, or TeX rewriting", () => {
    const item = candidate();
    item.question.content = [
      { type: "text", text: "  Synthetic café  +  2  =  5  " },
      { type: "math", tex: "\\frac{1}{2} + x", display: true, accessibleText: "one half plus x" },
      { type: "table", caption: "Synthetic values", headers: ["x", "y"], rows: [["1", "2"], ["3", "4"]] },
      { type: "image", assetVersionId: imageId, alt: "Synthetic plotted line", caption: "Synthetic figure" },
    ];
    const parsed = QuestionVersionSchema.parse(item.question);
    assert.deepEqual(parsed.content, item.question.content);
    const publicQuestion = toStudentQuestion(parsed);
    assert.deepEqual(publicQuestion.content, parsed.content);
    assert.equal(JSON.stringify(publicQuestion).includes("Synthetic fixture explanation"), false);

    const malformed = structuredClone(item.question);
    malformed.content[2] = { type: "table", caption: "Synthetic values", headers: ["x", "y"], rows: [["1"]] };
    assert.equal(QuestionVersionSchema.safeParse(malformed).success, false);
    malformed.content[2] = { type: "image", assetVersionId: imageId, alt: "" };
    assert.equal(QuestionVersionSchema.safeParse(malformed).success, false);
  });

  it("validates all question interactions, answers, and public slots", () => {
    const item = candidate();
    item.question.interaction = {
      type: "MULTIPLE_CHOICE",
      options: [
        { id: "a", content: [{ type: "text", text: "A" }] },
        { id: "b", content: [{ type: "text", text: "B" }] },
        { id: "c", content: [{ type: "text", text: "C" }] },
      ],
      minSelections: 2,
      maxSelections: 2,
    };
    item.question.private.answerKey = { type: "MULTIPLE_CHOICE", optionIds: ["a", "c"] };
    const multiple = QuestionVersionSchema.parse(item.question);
    assert.deepEqual(parseResponseForInteraction(multiple.interaction, { type: "MULTIPLE_CHOICE", optionIds: ["a", "c"] }), { type: "MULTIPLE_CHOICE", optionIds: ["a", "c"] });
    assert.equal(AnswerSubmissionRequestSchema.safeParse({ expectedRevision: 0, value: { type: "MULTIPLE_CHOICE", optionIds: ["a", "c"] } }).success, true);
    assert.throws(() => parseResponseForInteraction(multiple.interaction, { type: "MULTIPLE_CHOICE", optionIds: ["a", "a"] }));
    assert.equal(QuestionVersionSchema.safeParse({ ...multiple, private: { ...multiple.private, answerKey: { type: "MULTIPLE_CHOICE", optionIds: ["a", "a"] } } }).success, false);

    item.question.interaction = {
      type: "TRUE_FALSE_GROUP",
      statements: [
        { id: "s1", content: [{ type: "text", text: "Synthetic first claim" }] },
        { id: "s2", content: [{ type: "text", text: "Synthetic second claim" }] },
      ],
    };
    item.question.private.answerKey = { type: "TRUE_FALSE_GROUP", values: { s1: true, s2: false } };
    const trueFalse = QuestionVersionSchema.parse(item.question);
    assert.deepEqual(parseResponseForInteraction(trueFalse.interaction, { type: "TRUE_FALSE_GROUP", values: { s1: null, s2: false } }), { type: "TRUE_FALSE_GROUP", values: { s1: null, s2: false } });
    assert.throws(() => parseResponseForInteraction(trueFalse.interaction, { type: "TRUE_FALSE_GROUP", values: { s1: true } }));

    const student = toStudentQuestion(trueFalse);
    const slot = StudentSlotSchema.parse({ slotId, sectionId: "math-entry", ordinal: 1, stimulus: null, ...student });
    assert.equal(slot.interaction.type, "TRUE_FALSE_GROUP");
    for (const extra of ["private", "answerKey", "explanation", "generationRunId", "provenanceIds", "contentHash"]) {
      assert.equal(StudentSlotSchema.safeParse({ ...slot, [extra]: "restricted" }).success, false);
    }
  });

  it("connects a one-domain blueprint to a student attempt and released summary", () => {
    const blueprint = MvpBlueprintConfigSchema.parse({
      schemaVersion: "blueprint/1",
      name: "Synthetic math practice",
      taxonomyVersionId: factoryPackageFixture.candidates[0]!.question.taxonomyVersionId,
      profileKind: "INDEPENDENT_PRACTICE",
      evidenceIds: [],
      sections: [{ id: "math-entry", section: "MATH", count: 4, durationSeconds: 360 }],
      allowedTypes: ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE_GROUP"],
      quotas: [],
      maxPerSource: null,
      excludedQuestionIds: [],
      bundlePolicy: "ALL_OR_NONE",
      scoringPolicy: "practice-binary-v1",
      releasePolicy: "after-grade-v1",
    });
    const attemptId = "77777777-7777-4777-8777-777777777777";
    const formId = "88888888-8888-4888-8888-888888888888";
    const common = { attemptId, formId, domain: blueprint.sections[0]!.section, formMode: "PERSONALIZED_PRACTICE", reuseMode: "NEW_ONLY", reusePolicyVersion: "reuse/1", serverNow: "2026-10-17T10:00:00Z" };
    const created = AttemptViewSchema.parse({
      ...common, state: "CREATED", startBefore: "2026-10-17T10:10:00Z", startedAt: null, deadlineAt: null,
      activeSectionId: null, sections: [{ sectionId: "math-entry", section: "MATH", startsAt: null, endsAt: null, count: 4 }],
      slots: [], answers: [],
      closure: { attemptId, state: "CREATED", terminalReason: null, cancellationReason: null, closedAt: null, gradingStatus: null },
    });
    assert.equal(created.sections[0]!.sectionId, blueprint.sections[0]!.id);
    assert.equal(AttemptViewSchema.safeParse({ ...created, privateExplanation: "restricted" }).success, false);
    assert.equal(AttemptViewSchema.safeParse({ ...created, slots: [{ slotId }] }).success, false);

    const result = ResultViewSchema.parse({
      attemptId, scoreRunId: "99999999-9999-4999-8999-999999999999", domain: "MATH",
      formMode: "PERSONALIZED_PRACTICE", reuseMode: "NEW_ONLY", policyVersion: "practice-binary-v1",
      scoreLabel: "UNOFFICIAL_PRACTICE", correctCount: 3, totalCount: 4, percentage: "75.00",
      sections: [{ sectionId: "math-entry", section: "MATH", correctCount: 3, totalCount: 4 }],
      releasedAt: "2026-10-17T10:07:00Z",
    });
    assert.equal(result.sections[0]!.sectionId, blueprint.sections[0]!.id);
    assert.equal(ResultViewSchema.safeParse({ ...result, correctAnswer: { type: "SINGLE_CHOICE", optionId: "b" } }).success, false);
  });
});
