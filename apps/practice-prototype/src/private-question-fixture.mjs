// Synthetic-only source copied verbatim from packages/contracts/test/question.test.ts.
// Keep this file server-side: neither public projections nor pre-submit API data include private fields.
export const privateQuestionFixture = Object.freeze({
  content: [{ type: "text", text: "What is x if x + 2 = 5?" }],
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
  },
});

export const privateTrueFalseGroupFixture = Object.freeze({
  content: [{ type: "text", text: "For the equation 2y + 4 = 10, decide whether each statement is true or false." }],
  interaction: {
    type: "TRUE_FALSE_GROUP",
    statements: [
      { id: "s1", content: [{ type: "text", text: "y = 3" }] },
      { id: "s2", content: [{ type: "text", text: "y + 4 = 10" }] },
    ],
  },
  private: {
    answerKey: { type: "TRUE_FALSE_GROUP", statementValues: { s1: true, s2: false } },
    explanation: [{
      type: "text",
      text: "Solving 2y + 4 = 10 gives y = 3. The first statement is true, while adding 4 to y gives 7, not 10.",
    }],
  },
});

export function questionFixtureForOrdinal(ordinal) {
  return ordinal === 4 ? privateTrueFalseGroupFixture : privateQuestionFixture;
}

export const REPEATED_FIXTURE_NOTICE = "Câu 1–3 lặp lại cùng dữ liệu kiểm thử; câu 4 là nhóm đúng/sai tổng hợp; không phải đề TSA/học liệu đã duyệt";
