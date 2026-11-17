import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  ClozeAnswerKeySchema,
  ClozeInteractionSchema,
  MatchingInteractionSchema,
  clozeMatchingEarned,
  normalizeClozeText,
  parseClozeResponse,
  parseMatchingResponse,
} from "../src/cloze-matching.ts";
import {
  QuestionVersionV3Schema,
  parseResponseV3,
} from "../src/question-v3.ts";
import { AttemptViewV4Schema } from "../src/student-v4.ts";
import { factoryPackageFixture } from "./fixtures/factory-package.ts";
import { attemptView } from "./fixtures/stage4b/http-fixtures.ts";

const clozeInteraction = {
  type: "CLOZE",
  fields: [{ id: "capital", label: "Capital" }, { id: "accented", label: "Accented word" }],
  maxLength: 32,
  normalization: { unicode: "NFC", trim: "OUTER", caseSensitive: true, diacritics: "PRESERVE" },
} as const;
const clozeKey = { type: "CLOZE", acceptedValues: { capital: ["Hà Nội"], accented: ["café"] } } as const;
const matchingInteraction = {
  type: "MATCHING",
  rows: [{ id: "r1", label: "First row" }, { id: "r2", label: "Second row" }, { id: "r3", label: "Third row" }],
  targets: [{ id: "t1", label: "First target", maxUses: 2 }, { id: "t2", label: "Second target", maxUses: 1 }],
} as const;
const matchingKey = { type: "MATCHING", answers: { r1: "t1", r2: "t1", r3: "t2" } } as const;

function viewFor(interaction: unknown, response: unknown) {
  const raw = attemptView({ interaction, response });
  const view = {
    ...raw,
    slots: raw.slots.map((slot) => ({
      slotId: slot.slotId,
      sectionId: slot.sectionId,
      ordinal: slot.ordinal,
      stimulus: null,
      content: [{ type: "text", text: "Synthetic contract test" }],
      interaction,
    })),
    answers: raw.answers.map((answer) => ({
      slotId: answer.slotId,
      value: response,
      revision: answer.revision,
      savedAt: answer.savedAt,
    })),
    closure: { attemptId: raw.attemptId, state: raw.state, terminalReason: null, cancellationReason: null,
      closedAt: null, gradingStatus: null },
  };
  delete (view as Record<string, unknown>).privateCanary;
  return view;
}

test("cloze normalization pins NFC, outer trim, case, internal spaces, and diacritics", () => {
  assert.equal(normalizeClozeText("  ca\u0066e\u0301  "), "café");
  assert.equal(normalizeClozeText("  Hà  Nội  "), "Hà  Nội");
  assert.notEqual(normalizeClozeText("Hà Nội"), normalizeClozeText("hà nội"));
  assert.notEqual(normalizeClozeText("đá"), normalizeClozeText("da"));
  assert.equal(ClozeInteractionSchema.safeParse(clozeInteraction).success, true);
  assert.equal(ClozeInteractionSchema.safeParse({ ...clozeInteraction, normalization: { ...clozeInteraction.normalization, caseSensitive: false } }).success, false);
});

test("cloze saves preserve raw text, allow partial completion, reject unknown fields, and score all fields", () => {
  const partial = { type: "CLOZE", values: { capital: "Hà Nội" } };
  assert.deepEqual(parseClozeResponse(clozeInteraction, partial), partial);
  assert.equal(clozeMatchingEarned(clozeInteraction, clozeKey, partial), 0);
  assert.equal(clozeMatchingEarned(clozeInteraction, clozeKey, { type: "CLOZE", values: { capital: "Hà Nội", accented: "cafe\u0301" } }), 1);
  assert.equal(clozeMatchingEarned(clozeInteraction, clozeKey, { type: "CLOZE", values: { capital: "Hà Nội", accented: "cafe" } }), 0);
  assert.equal(clozeMatchingEarned(clozeInteraction, clozeKey, { type: "CLOZE", values: { capital: "Hà  Nội", accented: "café" } }), 0);
  assert.equal(clozeMatchingEarned(clozeInteraction, clozeKey, { type: "CLOZE", values: { capital: "hà Nội", accented: "café" } }), 0);
  const prototypeNamedField = { ...clozeInteraction, fields: [{ id: "constructor", label: "Valid authored ID" }] };
  assert.equal(clozeMatchingEarned(prototypeNamedField, { type: "CLOZE", acceptedValues: { constructor: ["x"] } },
    { type: "CLOZE", values: {} }), 0);
  assert.throws(() => parseResponseV3(clozeInteraction, { type: "CLOZE", values: { unknown: "value" } }), TypeError);
  assert.equal(parseClozeResponse({ ...clozeInteraction, maxLength: 1, fields: [{ id: "capital", label: "Capital" }], normalization: clozeInteraction.normalization },
    { type: "CLOZE", values: { capital: "😀" } }).values.capital, "😀", "maxLength counts Unicode scalar values");
  assert.throws(() => parseClozeResponse(clozeInteraction, { type: "CLOZE", values: { capital: "x".repeat(33) } }), TypeError);
  assert.equal(ClozeAnswerKeySchema.safeParse({ ...clozeKey, extra: true }).success, false);
});

test("matching saves are partial but reject unknown IDs and target reuse overflow", () => {
  assert.equal(MatchingInteractionSchema.safeParse(matchingInteraction).success, true);
  const partial = { type: "MATCHING", assignments: { r1: "t1" } };
  assert.deepEqual(parseMatchingResponse(matchingInteraction, partial), partial);
  assert.equal(clozeMatchingEarned(matchingInteraction, matchingKey, partial), 0);
  assert.equal(clozeMatchingEarned(matchingInteraction, matchingKey, { type: "MATCHING", assignments: { r1: "t1", r2: "t1", r3: "t2" } }), 1);
  assert.equal(clozeMatchingEarned(matchingInteraction, matchingKey, { type: "MATCHING", assignments: { r1: "t2", r2: "t1", r3: "t1" } }), 0);
  assert.throws(() => parseMatchingResponse(matchingInteraction, { type: "MATCHING", assignments: { unknown: "t1" } }), TypeError);
  assert.throws(() => parseMatchingResponse(matchingInteraction, { type: "MATCHING", assignments: { r1: "unknown" } }), TypeError);
  assert.throws(() => parseMatchingResponse(matchingInteraction, { type: "MATCHING", assignments: { r1: "t1", r2: "t1", r3: "t1" } }), TypeError);
  assert.equal(MatchingInteractionSchema.safeParse({ ...matchingInteraction, rows: [...matchingInteraction.rows, { id: "r1", label: "Duplicate" }] }).success, false);
});

test("question/3 accepts explicit cloze and matching keys while v1 stays closed", () => {
  const base = structuredClone(factoryPackageFixture.candidates[0]!.question);
  const question = {
    ...base,
    schemaVersion: "question/3",
    interaction: clozeInteraction,
    private: { ...base.private, answerKey: clozeKey, scoringPolicy: "practice-binary-v3" },
  };
  assert.equal(QuestionVersionV3Schema.safeParse(question).success, true);
  assert.equal(QuestionVersionV3Schema.safeParse({ ...question, private: { ...question.private, answerKey: { ...clozeKey, acceptedValues: { capital: ["Hà Nội"] } } } }).success, false);
  assert.equal(QuestionVersionV3Schema.safeParse({ ...question, schemaVersion: "question/1" }).success, false);
});

test("student-v4 view validates saved responses against each sealed interaction and exposes no keys", () => {
  const studentModule = createRequire(import.meta.url)("@tsa/contracts/student-v4") as Record<string, unknown>;
  assert.ok(studentModule.AttemptViewV4Schema);
  for (const name of Object.keys(studentModule)) assert.doesNotMatch(name, /AnswerKey|Private|QuestionVersion|ReleasedReview/);

  assert.equal(AttemptViewV4Schema.safeParse(viewFor(clozeInteraction, { type: "CLOZE", values: { capital: "Hà Nội", accented: "café" } })).success, true);
  assert.equal(AttemptViewV4Schema.safeParse(viewFor(clozeInteraction, { type: "CLOZE", values: { unknown: "Hà Nội" } })).success, false);
  assert.equal(AttemptViewV4Schema.safeParse(viewFor(matchingInteraction, { type: "MATCHING", assignments: { r1: "t1" } })).success, true);
  assert.equal(AttemptViewV4Schema.safeParse(viewFor(matchingInteraction, { type: "MATCHING", assignments: { r1: "missing" } })).success, false);
  assert.equal(AttemptViewV4Schema.safeParse(viewFor(matchingInteraction, { type: "MATCHING", assignments: { r1: "t1", r2: "t1", r3: "t1" } })).success, false);
});

test("scoring rejects accessor-backed values without invoking them", () => {
  let getterCalls = 0;
  const response = Object.defineProperty({ type: "CLOZE" }, "values", {
    enumerable: true,
    get() { getterCalls += 1; throw new Error("must not run"); },
  });
  assert.throws(() => clozeMatchingEarned(clozeInteraction, clozeKey, response), TypeError);
  assert.equal(getterCalls, 0);
});
