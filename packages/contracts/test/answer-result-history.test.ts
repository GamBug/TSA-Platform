import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AnswerAckSchema,
  AnswerSubmissionRequestSchema,
  AttemptHistoryItemSchema,
  AttemptHistoryPageSchema,
  AuthorizedReleasedReviewSchema,
  ResultViewSchema,
} from "../src/index.ts";

const ids = {
  attempt: "44444444-4444-4444-8444-444444444444",
  form: "55555555-5555-4555-8555-555555555555",
  slot: "66666666-6666-4666-8666-666666666666",
  scoreRun: "88888888-8888-4888-8888-888888888888",
};

const response = { type: "SINGLE_CHOICE" as const, optionId: "b" };

function resultView() {
  return {
    attemptId: ids.attempt,
    scoreRunId: ids.scoreRun,
    domain: "MATH" as const,
    formMode: "PERSONALIZED_PRACTICE" as const,
    reuseMode: "NEW_ONLY" as const,
    policyVersion: "practice-binary-v1" as const,
    scoreLabel: "UNOFFICIAL_PRACTICE" as const,
    correctCount: 1,
    totalCount: 1,
    percentage: "100.00",
    sections: [{ sectionId: "math-entry", section: "MATH" as const, correctCount: 1, totalCount: 1 }],
    releasedAt: "2026-10-17T10:10:00Z",
  };
}

function historyItem() {
  return {
    attemptId: ids.attempt,
    formId: ids.form,
    domain: "MATH" as const,
    formMode: "PERSONALIZED_PRACTICE" as const,
    reuseMode: "NEW_ONLY" as const,
    state: "GRADED" as const,
    startedAt: "2026-10-17T10:00:00Z",
    closedAt: "2026-10-17T10:06:00Z",
    score: { correctCount: 1, totalCount: 1, percentage: "100.00" },
  };
}

function review() {
  return {
    ...resultView(),
    items: [{
      slotId: ids.slot,
      earned: 1 as const,
      response,
      question: {
        slotId: ids.slot,
        sectionId: "math-entry",
        ordinal: 1,
        content: [{ type: "text" as const, text: "Which number is three?" }],
        stimulus: null,
        interaction: {
          type: "SINGLE_CHOICE" as const,
          options: [
            { id: "a", content: [{ type: "text" as const, text: "2" }] },
            { id: "b", content: [{ type: "text" as const, text: "3" }] },
          ],
        },
      },
      correctAnswer: { type: "SINGLE_CHOICE" as const, optionId: "b" },
      explanation: [{ type: "text" as const, text: "Three is the correct value." }],
    }],
  };
}

describe("answer, result, and history contracts", () => {
  it("accepts a valid slot-addressed answer body and reuses AnswerAck for the persisted acknowledgement", () => {
    assert.equal(AnswerSubmissionRequestSchema.safeParse({ expectedRevision: 0, value: response }).success, true);
    assert.equal(AnswerAckSchema.safeParse({ slotId: ids.slot, value: response, revision: 1, savedAt: "2026-10-17T10:01:00Z" }).success, true);
  });

  it("rejects malformed answer bodies, unknown fields, and invalid acknowledgement slot IDs", () => {
    assert.equal(AnswerSubmissionRequestSchema.safeParse({ expectedRevision: -1, value: response }).success, false);
    assert.equal(AnswerSubmissionRequestSchema.safeParse({ expectedRevision: 0, value: { type: "SINGLE_CHOICE" } }).success, false);
    assert.equal(AnswerSubmissionRequestSchema.safeParse({ expectedRevision: 0, value: response, questionId: ids.form }).success, false);
    assert.equal(AnswerAckSchema.safeParse({ slotId: "not-a-slot", value: response, revision: 1, savedAt: "2026-10-17T10:01:00Z" }).success, false);
  });

  it("accepts an independent-domain practice result and rejects malformed or cross-domain totals", () => {
    assert.equal(ResultViewSchema.safeParse(resultView()).success, true);
    assert.equal(ResultViewSchema.safeParse({ ...resultView(), sections: [{ ...resultView().sections[0]!, section: "READING" }] }).success, false);
    assert.equal(ResultViewSchema.safeParse({ ...resultView(), totalCount: 0 }).success, false);
    assert.equal(ResultViewSchema.safeParse({ ...resultView(), percentage: "100" }).success, false);
    assert.equal(ResultViewSchema.safeParse({ ...resultView(), items: [] }).success, false);
  });

  it("keeps ordinary result serialization student-safe and reserves keys/explanations for the released-review DTO", () => {
    const ordinary = ResultViewSchema.parse(resultView());
    assert.equal(JSON.stringify(ordinary).includes("correctAnswer"), false);
    assert.equal(JSON.stringify(ordinary).includes("explanation"), false);
    assert.equal(AuthorizedReleasedReviewSchema.safeParse(review()).success, true);
    assert.equal(AuthorizedReleasedReviewSchema.safeParse({ ...review(), items: [{ ...review().items[0]!, slotId: ids.form }] }).success, false);
  });

  it("accepts caller-owned attempt history summaries but rejects invalid timestamps, incompatible states, and private fields", () => {
    assert.equal(AttemptHistoryItemSchema.safeParse(historyItem()).success, true);
    assert.equal(AttemptHistoryPageSchema.safeParse({ items: [historyItem()], nextCursor: null }).success, true);
    assert.equal(AttemptHistoryItemSchema.safeParse({ ...historyItem(), startedAt: "tomorrow" }).success, false);
    assert.equal(AttemptHistoryItemSchema.safeParse({ ...historyItem(), state: "NOT_A_STATE" }).success, false);
    assert.equal(AttemptHistoryItemSchema.safeParse({ ...historyItem(), answers: [response] }).success, false);
    assert.equal(AttemptHistoryPageSchema.safeParse({ items: [historyItem()], nextCursor: "", userId: ids.form }).success, false);
  });
});
