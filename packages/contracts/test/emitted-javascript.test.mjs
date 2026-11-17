import assert from "node:assert/strict";

import {
  ASSEMBLY_RANDOM_VERSION,
  StudentQuestionSchema,
  shuffleAssemblyUnitsV1,
} from "../dist/index.js";

const textBlock = (text) => [{ type: "text", text }];
const studentQuestion = {
  content: textBlock("What is 2 + 3?"),
  interaction: {
    type: "SINGLE_CHOICE",
    options: [
      { id: "a", content: textBlock("4") },
      { id: "b", content: textBlock("5") },
    ],
  },
};

assert.deepEqual(StudentQuestionSchema.parse(studentQuestion), studentQuestion);
assert.equal(
  StudentQuestionSchema.safeParse({ ...studentQuestion, answerKey: "private" }).success,
  false,
  "the emitted runtime schema must reject unknown fields",
);
assert.equal(
  StudentQuestionSchema.safeParse({ ...studentQuestion, content: [] }).success,
  false,
  "the emitted runtime schema must reject malformed values",
);

assert.equal(ASSEMBLY_RANDOM_VERSION, "xorshift32-v1");
assert.deepEqual(
  shuffleAssemblyUnitsV1(["a", "b", "c", "d", "e"], 0),
  ["d", "e", "b", "c", "a"],
  "the emitted entry must re-export the helper from its emitted sibling module",
);

console.log("Emitted JavaScript smoke test passed.");
