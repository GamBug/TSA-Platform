import { randomUUID } from "node:crypto";

import { privateQuestionFixture, questionFixtureForOrdinal, REPEATED_FIXTURE_NOTICE } from "./private-question-fixture.mjs";

export const DEMO_DURATION_SECONDS = 6 * 60;
export const MATH_SLOT_COUNT = 4;

const allowedOptionIds = new Set(privateQuestionFixture.interaction.options.map((option) => option.id));

function isCompleteAnswer(question, answer) {
  if (question.interaction.type === "SINGLE_CHOICE") return typeof answer === "string";
  if (answer?.type !== "TRUE_FALSE_GROUP" || answer.statementValues === null || typeof answer.statementValues !== "object") return false;
  return question.interaction.statements.every(({ id }) =>
    Object.hasOwn(answer.statementValues, id) && typeof answer.statementValues[id] === "boolean");
}

function isCorrectAnswer(question, answer) {
  if (!isCompleteAnswer(question, answer)) return false;
  if (question.interaction.type === "SINGLE_CHOICE") return answer === question.private.answerKey.optionId;
  return question.interaction.statements.every(({ id }) => answer.statementValues[id] === question.private.answerKey.statementValues[id]);
}

function isValidGroupAnswer(question, answer) {
  if (answer === null || typeof answer !== "object" || Array.isArray(answer) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(answer)) ||
      answer.type !== "TRUE_FALSE_GROUP" || Object.keys(answer).length !== 2 ||
      answer.statementValues === null || typeof answer.statementValues !== "object" || Array.isArray(answer.statementValues) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(answer.statementValues))) return false;
  const allowedIds = new Set(question.interaction.statements.map(({ id }) => id));
  return Object.entries(answer.statementValues).every(([id, value]) => allowedIds.has(id) && typeof value === "boolean");
}

function publicGroupValues(statementValues = {}) {
  return Object.entries(statementValues).map(([statementId, value]) => ({ statementId, value }));
}

function percent(correctCount, totalCount) {
  const hundredths = Math.floor((correctCount * 10_000 + totalCount / 2) / totalCount);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

function score(attempt) {
  const correctCount = attempt.slots.reduce((count, slot) => {
    const question = questionFixtureForOrdinal(slot.ordinal);
    return count + (isCorrectAnswer(question, attempt.answers.get(slot.slotId)) ? 1 : 0);
  }, 0);
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

export function saveMockAnswer(attempt, slotId, answer, now) {
  expireIfNeeded(attempt, now);
  if (attempt.state !== "IN_PROGRESS") return { saved: false, closed: true };
  const slot = attempt.slots.find((entry) => entry.slotId === slotId);
  if (!slot) return { saved: false, unknownSlot: true };
  const question = questionFixtureForOrdinal(slot.ordinal);
  if (question.interaction.type === "SINGLE_CHOICE") {
    if (answer !== null && !allowedOptionIds.has(answer)) return { saved: false, unknownOption: true };
    if (answer === null) attempt.answers.delete(slotId);
    else attempt.answers.set(slotId, answer);
  } else {
    if (answer === null || !isValidGroupAnswer(question, answer)) return { saved: false, unknownAnswer: true };
    if (Object.keys(answer.statementValues).length === 0) attempt.answers.delete(slotId);
    else attempt.answers.set(slotId, structuredClone(answer));
  }
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
    slots: attempt.slots.map(({ slotId, ordinal }) => {
      const question = questionFixtureForOrdinal(ordinal);
      return {
        slotId,
        ordinal,
        content: structuredClone(question.content),
        interaction: structuredClone(question.interaction),
      };
    }),
    answers: attempt.slots.flatMap(({ slotId, ordinal }) => {
      const answer = attempt.answers.get(slotId);
      if (answer === undefined) return [];
      const question = questionFixtureForOrdinal(ordinal);
      if (question.interaction.type === "TRUE_FALSE_GROUP") {
        return [{ slotId, type: "TRUE_FALSE_GROUP", statementValues: publicGroupValues(answer.statementValues) }];
      }
      return [{ slotId, optionId: answer }];
    }),
    answeredCount: attempt.slots.filter(({ slotId, ordinal }) =>
      isCompleteAnswer(questionFixtureForOrdinal(ordinal), attempt.answers.get(slotId))).length,
  };
  if (attempt.state === "GRADED") snapshot.result = structuredClone(attempt.result);
  return snapshot;
}
