import assert from "node:assert/strict";
import test from "node:test";

import { percentage, scoreAttempt } from "../../src/modules/scoring/binary.mjs";

const block = [{ type: "text", text: "fixture" }];

const singleChoice = {
  type: "SINGLE_CHOICE",
  options: [
    { id: "a", content: block },
    { id: "b", content: block },
  ],
};

const multipleChoice = {
  type: "MULTIPLE_CHOICE",
  options: [
    { id: "a", content: block },
    { id: "b", content: block },
    { id: "c", content: block },
  ],
  minSelections: 1,
  maxSelections: 3,
};

const trueFalse = {
  type: "TRUE_FALSE_GROUP",
  statements: [
    { id: "s1", content: block },
    { id: "s2", content: block },
  ],
};

function slot(slotId, ordinal, interaction, answerKey, response) {
  return {
    slotId,
    sectionId: "math-section",
    section: "MATH",
    ordinal,
    interaction,
    answerKey,
    response,
  };
}

function input(slots) {
  return { policyVersion: "practice-binary-v1", slots };
}

test("scores each supported interaction as exactly correct or incorrect", () => {
  const scored = scoreAttempt(input([
    slot("single", 1, singleChoice, { type: "SINGLE_CHOICE", optionId: "b" }, { type: "SINGLE_CHOICE", optionId: "b" }),
    slot("multiple", 2, multipleChoice, { type: "MULTIPLE_CHOICE", optionIds: ["a", "c"] }, { type: "MULTIPLE_CHOICE", optionIds: ["c", "a"] }),
    slot("tf", 3, trueFalse, { type: "TRUE_FALSE_GROUP", values: { s1: true, s2: false } }, { type: "TRUE_FALSE_GROUP", values: { s1: true, s2: false } }),
    slot("wrong-multiple", 4, multipleChoice, { type: "MULTIPLE_CHOICE", optionIds: ["a", "c"] }, { type: "MULTIPLE_CHOICE", optionIds: ["a"] }),
  ]));

  assert.deepEqual(scored, {
    correctCount: 3,
    totalCount: 4,
    percentage: "75.00",
    sections: [{ sectionId: "math-section", section: "MATH", correctCount: 3, totalCount: 4 }],
    items: [
      { slotId: "single", earned: 1 },
      { slotId: "multiple", earned: 1 },
      { slotId: "tf", earned: 1 },
      { slotId: "wrong-multiple", earned: 0 },
    ],
  });
});

test("missing, cleared, and partial answers earn zero", () => {
  const scored = scoreAttempt(input([
    slot("missing", 1, singleChoice, { type: "SINGLE_CHOICE", optionId: "a" }, null),
    slot("cleared", 2, singleChoice, { type: "SINGLE_CHOICE", optionId: "a" }, { type: "SINGLE_CHOICE", optionId: null }),
    slot("partial-tf", 3, trueFalse, { type: "TRUE_FALSE_GROUP", values: { s1: true, s2: false } }, { type: "TRUE_FALSE_GROUP", values: { s1: true, s2: null } }),
    slot("empty-multiple", 4, multipleChoice, { type: "MULTIPLE_CHOICE", optionIds: ["a"] }, { type: "MULTIPLE_CHOICE", optionIds: [] }),
  ]));

  assert.equal(scored.correctCount, 0);
  assert.equal(scored.totalCount, 4);
  assert.equal(scored.percentage, "0.00");
  assert.deepEqual(scored.items.map((item) => item.earned), [0, 0, 0, 0]);
});

test("grading output is independent of slot input order", () => {
  const first = slot("later", 2, singleChoice, { type: "SINGLE_CHOICE", optionId: "a" }, { type: "SINGLE_CHOICE", optionId: "a" });
  const second = slot("earlier", 1, singleChoice, { type: "SINGLE_CHOICE", optionId: "b" }, { type: "SINGLE_CHOICE", optionId: "a" });

  assert.deepEqual(scoreAttempt(input([first, second])), scoreAttempt(input([second, first])));
  assert.deepEqual(scoreAttempt(input([first, second])).items.map((item) => item.slotId), ["earlier", "later"]);
});

test("corrupt frozen grading input fails closed", () => {
  const validSlot = slot("bad-key", 1, singleChoice, { type: "SINGLE_CHOICE", optionId: "a" }, { type: "SINGLE_CHOICE", optionId: "a" });
  assert.throws(() => scoreAttempt(input([{ ...validSlot, answerKey: { type: "SINGLE_CHOICE", optionId: "unknown" } }])), TypeError);
  assert.throws(() => scoreAttempt(input([{ ...validSlot, answerKey: { type: "MULTIPLE_CHOICE", optionIds: ["a"] } }])), TypeError);
  assert.throws(() => scoreAttempt(input([{ ...validSlot, response: { type: "SINGLE_CHOICE", optionId: "unknown" } }])), TypeError);
  assert.throws(() => scoreAttempt({ ...input([validSlot]), policyVersion: "other" }), TypeError);
  assert.throws(() => scoreAttempt(input([validSlot, validSlot])), TypeError);
  assert.throws(() => scoreAttempt(input([])), TypeError);
});

test("percentage uses exact integer half-up rounding", () => {
  assert.equal(percentage(1, 3), "33.33");
  assert.equal(percentage(1, 32), "3.13");
  assert.equal(percentage(0, 4), "0.00");
  assert.equal(percentage(4, 4), "100.00");
  assert.throws(() => percentage(0, 0), RangeError);
  assert.throws(() => percentage(2, 1), RangeError);
});
