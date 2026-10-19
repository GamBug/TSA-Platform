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

export const REPEATED_FIXTURE_NOTICE = "4 vị trí lặp lại cùng dữ liệu kiểm thử; không phải đề TSA/học liệu đã duyệt";
