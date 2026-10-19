import { randomUUID } from "node:crypto";

import { privateQuestionFixture, REPEATED_FIXTURE_NOTICE } from "./private-question-fixture.mjs";

export const DEMO_DURATION_SECONDS = 6 * 60;
export const MATH_SLOT_COUNT = 4;

const allowedOptionIds = new Set(privateQuestionFixture.interaction.options.map((option) => option.id));

function percent(correctCount, totalCount) {
  const hundredths = Math.floor((correctCount * 10_000 + totalCount / 2) / totalCount);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

function score(attempt) {
  const correctCount = attempt.slots.reduce((count, slot) =>
    count + (attempt.answers.get(slot.slotId) === privateQuestionFixture.private.answerKey.optionId ? 1 : 0), 0);
  return {
    label: "KẾT QUẢ LUYỆN TẬP MINH HỌA — KHÔNG CHÍNH THỨC",
    correctCount,
    totalCount: attempt.slots.length,
    percentage: percent(correctCount, attempt.slots.length),
  };
}

export function createMockAttempt({ now, createAttemptId = randomUUID }) {
  const startedAt = new Date(now).toISOString();
  const attemptId = createAttemptId();
  return {
    attemptId,
    domain: "MATH",
    state: "IN_PROGRESS",
    createdAt: startedAt,
    startedAt,
    deadlineAt: new Date(now + DEMO_DURATION_SECONDS * 1000).toISOString(),
    slots: Array.from({ length: MATH_SLOT_COUNT }, (_, index) => ({ slotId: randomUUID(), ordinal: index + 1 })),
    answers: new Map(),
    result: null,
    closedAt: null,
    closureReason: null,
  };
}

export function expireIfNeeded(attempt, now) {
  if (attempt.state === "IN_PROGRESS" && now >= Date.parse(attempt.deadlineAt)) {
    attempt.state = "GRADED";
    attempt.closedAt = new Date(now).toISOString();
    attempt.closureReason = "DEADLINE";
    attempt.result = score(attempt);
    return true;
  }
  return false;
}

export function saveMockAnswer(attempt, slotId, optionId, now) {
  expireIfNeeded(attempt, now);
  if (attempt.state !== "IN_PROGRESS") return { saved: false, closed: true };
  if (!attempt.slots.some((slot) => slot.slotId === slotId)) return { saved: false, unknownSlot: true };
  if (optionId !== null && !allowedOptionIds.has(optionId)) return { saved: false, unknownOption: true };
  if (optionId === null) attempt.answers.delete(slotId);
  else attempt.answers.set(slotId, optionId);
  return { saved: true, closed: false };
}

export function submitMockAttempt(attempt, now) {
  expireIfNeeded(attempt, now);
  if (attempt.state === "GRADED") return { submitted: true, result: attempt.result, idempotent: true };
  if (attempt.state !== "IN_PROGRESS") return { submitted: false, closed: true };
  attempt.state = "GRADED";
  attempt.closedAt = new Date(now).toISOString();
  attempt.closureReason = "EXPLICIT_SUBMIT";
  attempt.result = score(attempt);
  return { submitted: true, result: attempt.result, idempotent: false };
}

export function cancelMockAttempt(attempt, now) {
  expireIfNeeded(attempt, now);
  if (attempt.state !== "IN_PROGRESS") return { cancelled: false, closed: true };
  attempt.state = "CANCELLED";
  attempt.closedAt = new Date(now).toISOString();
  attempt.closureReason = "STUDENT_CANCELLED_DEMO";
  return { cancelled: true, closed: false };
}

export function toPublicAttempt(attempt, now) {
  expireIfNeeded(attempt, now);
  const snapshot = {
    attemptId: attempt.attemptId,
    domain: attempt.domain,
    state: attempt.state,
    durationSeconds: DEMO_DURATION_SECONDS,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    serverNow: new Date(now).toISOString(),
    closedAt: attempt.closedAt,
    closureReason: attempt.closureReason,
    repeatNotice: REPEATED_FIXTURE_NOTICE,
    slots: attempt.slots.map(({ slotId, ordinal }) => ({
      slotId,
      ordinal,
      content: structuredClone(privateQuestionFixture.content),
      interaction: structuredClone(privateQuestionFixture.interaction),
    })),
    answers: [...attempt.answers].map(([slotId, optionId]) => ({ slotId, optionId })),
    answeredCount: attempt.answers.size,
  };
  if (attempt.state === "GRADED") snapshot.result = structuredClone(attempt.result);
  return snapshot;
}
