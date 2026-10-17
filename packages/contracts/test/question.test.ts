import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseResponseForInteraction,
  QuestionVersionSchema,
  toStudentQuestion,
  type QuestionVersion,
} from "../src/index.ts";

const ids = {
  version: "11111111-1111-4111-8111-111111111111",
  question: "22222222-2222-4222-8222-222222222222",
  taxonomy: "33333333-3333-4333-8333-333333333333",
  parent: "44444444-4444-4444-8444-444444444444",
};

function validQuestion(): QuestionVersion {
  return {
    schemaVersion: "question/1",
    id: ids.version,
    questionId: ids.question,
    versionNo: 2,
    parentVersionId: ids.parent,
    language: "vi-VN",
    section: "MATH",
    taxonomyVersionId: ids.taxonomy,
    domainId: "algebra",
    skillIds: ["linear-equations"],
    subskillIds: ["one-variable"],
    cognitiveLevel: "M2",
    difficulty: { target: "MEDIUM", predicted: null, empiricalStudyId: null },
    content: [{ type: "text", text: "What is x if x + 2 = 5?" }],
    stimulusVersionId: null,
    interaction: {
      type: "SINGLE_CHOICE",
      options: [
        { id: "a", content: [{ type: "text", text: "2" }] },
        { id: "b", content: [{ type: "text", text: "3" }] },
      ],
    },
    private: {
      answerKey: { type: "SINGLE_CHOICE", optionId: "b" },
      explanation: [{ type: "text", text: "Subtract 2 from each side." }],
      evidenceRefs: ["authoring-note-1"],
      scoringPolicy: "practice-binary-v1",
    },
    origin: "MANUAL",
    provenanceIds: ["provenance-1"],
    generationRunId: null,
    createdBy: "author-1",
    createdAt: "2026-10-17T08:00:00Z",
    contentHash: "sha256:fixture",
  };
}

describe("question/1", () => {
  it("accepts a valid canonical question and preserves immutable version identity", () => {
    const source = validQuestion();
    const parsed = QuestionVersionSchema.parse(source);

    assert.equal(parsed.id, ids.version);
    assert.equal(parsed.questionId, ids.question);
    assert.equal(parsed.versionNo, 2);
    assert.equal(parsed.parentVersionId, ids.parent);
  });

  it("rejects missing required fields and unsupported schema versions", () => {
    const missing = validQuestion() as Record<string, unknown>;
    delete missing.contentHash;
    assert.equal(QuestionVersionSchema.safeParse(missing).success, false);

    assert.equal(QuestionVersionSchema.safeParse({ ...validQuestion(), schemaVersion: "question/2" }).success, false);
  });

  it("rejects invalid enum values and unknown fields", () => {
    assert.equal(QuestionVersionSchema.safeParse({ ...validQuestion(), section: "WRITING" }).success, false);
    assert.equal(QuestionVersionSchema.safeParse({ ...validQuestion(), internalReviewNote: "not canonical" }).success, false);
  });

  it("rejects malformed answer keys", () => {
    const question = validQuestion();
    question.private.answerKey = { type: "SINGLE_CHOICE", optionId: "missing" };
    assert.equal(QuestionVersionSchema.safeParse(question).success, false);
  });

  it("accepts the true/false format only when its key covers every statement", () => {
    const question = validQuestion();
    question.interaction = {
      type: "TRUE_FALSE_GROUP",
      statements: [
        { id: "s1", content: [{ type: "text", text: "First statement" }] },
        { id: "s2", content: [{ type: "text", text: "Second statement" }] },
      ],
    };
    question.private.answerKey = { type: "TRUE_FALSE_GROUP", values: { s1: true, s2: false } };
    assert.equal(QuestionVersionSchema.safeParse(question).success, true);

    question.private.answerKey = { type: "TRUE_FALSE_GROUP", values: { s1: true } };
    assert.equal(QuestionVersionSchema.safeParse(question).success, false);
  });

  it("validates multiple-choice response cardinality and references", () => {
    const question = validQuestion();
    question.interaction = {
      type: "MULTIPLE_CHOICE",
      options: [
        { id: "a", content: [{ type: "text", text: "A" }] },
        { id: "b", content: [{ type: "text", text: "B" }] },
        { id: "c", content: [{ type: "text", text: "C" }] },
      ],
      minSelections: 2,
      maxSelections: 2,
    };
    question.private.answerKey = { type: "MULTIPLE_CHOICE", optionIds: ["a", "b"] };
    const parsed = QuestionVersionSchema.parse(question);

    assert.throws(() => parseResponseForInteraction(parsed.interaction, { type: "MULTIPLE_CHOICE", optionIds: ["a"] }));
    assert.throws(() => parseResponseForInteraction(parsed.interaction, { type: "MULTIPLE_CHOICE", optionIds: ["a", "missing"] }));
    assert.deepEqual(parseResponseForInteraction(parsed.interaction, { type: "MULTIPLE_CHOICE", optionIds: [] }), { type: "MULTIPLE_CHOICE", optionIds: [] });
  });

  it("serializes a student-safe projection with no private answer or authoring data", () => {
    const publicQuestion = toStudentQuestion(QuestionVersionSchema.parse(validQuestion()));
    const serialized = JSON.stringify(publicQuestion);

    assert.deepEqual(publicQuestion, { content: validQuestion().content, interaction: validQuestion().interaction });
    assert.equal(serialized.includes("answerKey"), false);
    assert.equal(serialized.includes("explanation"), false);
    assert.equal(serialized.includes("provenance"), false);
    assert.equal(serialized.includes("createdBy"), false);
    assert.equal(serialized.includes("contentHash"), false);
  });
});
