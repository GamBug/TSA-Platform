import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMockAttempt, saveMockAnswer } from "../src/exam-engine.mjs";
import { createMockApiService } from "../src/mock-api.mjs";

const startTime = Date.parse("2026-10-19T03:00:00.000Z");
const attemptIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

function createHarness() {
  let now = startTime;
  let attemptIndex = 0;
  let sessionIndex = 0;
  const service = createMockApiService({
    now: () => now,
    makeSessionId: () => `test-session-${++sessionIndex}-opaque`,
    makeAttemptId: () => attemptIds[attemptIndex++],
  });
  return {
    service,
    setNow(value) { now = value; },
    async call(path, { method = "GET", cookie, body } = {}) {
      return service.handle({ method, url: path, headers: cookie ? { cookie } : {}, body: body === undefined ? undefined : JSON.stringify(body) });
    },
    async openSession() {
      const response = await this.call("/mock/session", { method: "POST" });
      const cookie = response.headers["Set-Cookie"].split(";", 1)[0];
      return { response, cookie, body: JSON.parse(response.body) };
    },
  };
}

function groupAnswer(statementValues) {
  return {
    type: "TRUE_FALSE_GROUP",
    statementValues: Object.entries(statementValues).map(([statementId, value]) => ({ statementId, value })),
  };
}

describe("isolated mock API and in-memory exam session", () => {
  it("advertises the separate profile counts and enables only the synthetic MATH demo", async () => {
    const harness = createHarness();
    const response = await harness.call("/mock/catalog");
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body).domains.map(({ domain, questionCount, available }) => ({ domain, questionCount, available })), [
      { domain: "MATH", questionCount: 4, available: true },
      { domain: "READING", questionCount: 2, available: false },
      { domain: "SCIENCE", questionCount: 4, available: false },
    ]);
  });

  it("starts one public-only attempt, discloses repeated synthetic content, and resumes without resetting its timer", async () => {
    const harness = createHarness();
    const { cookie, response: sessionResponse, body: session } = await harness.openSession();
    assert.equal(sessionResponse.status, 200);
    assert.match(sessionResponse.headers["Set-Cookie"], /HttpOnly/);
    assert.match(sessionResponse.headers["Set-Cookie"], /SameSite=Strict/);
    assert.doesNotMatch(JSON.stringify(session), /test-session|answerKey|explanation/);

    const started = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    assert.equal(started.status, 201);
    const first = JSON.parse(started.body).attempt;
    assert.equal(first.state, "IN_PROGRESS");
    assert.equal(Date.parse(first.deadlineAt) - Date.parse(first.startedAt), 360_000);
    assert.equal(first.slots.length, 4);
    assert.equal(first.repeatNotice, "Câu 1–3 lặp lại cùng dữ liệu kiểm thử; câu 4 là nhóm đúng/sai tổng hợp; không phải đề TSA/học liệu đã duyệt");
    assert.equal(first.slots[0].content[0].text, "What is x if x + 2 = 5?");
    assert.deepEqual(first.slots.slice(0, 3).map((slot) => slot.content), Array.from({ length: 3 }, () => first.slots[0].content));
    assert.notDeepEqual(first.slots[3].content, first.slots[0].content);
    assert.equal(first.slots.slice(0, 3).every((slot) => slot.interaction.type === "SINGLE_CHOICE"), true);
    assert.equal(first.slots[3].interaction.type, "TRUE_FALSE_GROUP");
    assert.deepEqual(first.slots[3].interaction.statements.map(({ id }) => id), ["s1", "s2"]);
    assert.doesNotMatch(started.body, /answerKey|explanation|Subtract 2 from each side|"optionId":"b"/);

    const saved = await harness.call(`/mock/attempts/${first.attemptId}/answers/${first.slots[0].slotId}`, {
      method: "PUT", cookie, body: { optionId: "b" },
    });
    assert.equal(JSON.parse(saved.body).attempt.answeredCount, 1);

    harness.setNow(startTime + 85_000);
    const resumed = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    assert.equal(resumed.status, 200);
    const second = JSON.parse(resumed.body).attempt;
    assert.equal(JSON.parse(resumed.body).resumed, true);
    assert.equal(second.attemptId, first.attemptId);
    assert.equal(second.startedAt, first.startedAt);
    assert.equal(second.deadlineAt, first.deadlineAt);
    assert.equal(Date.parse(second.serverNow), startTime + 85_000);

    const reloaded = await harness.call("/mock/session", { method: "POST", cookie });
    const restored = JSON.parse(reloaded.body).attempt;
    assert.equal(restored.attemptId, first.attemptId);
    assert.equal(restored.deadlineAt, first.deadlineAt);
    assert.deepEqual(restored.answers, [{ slotId: first.slots[0].slotId, optionId: "b" }]);
    assert.doesNotMatch(reloaded.body, /answerKey|explanation|Subtract 2 from each side/);
  });

  it("rejects malformed JSON, unknown request fields, unsupported domains, bad slots/options, and cross-session IDs", async () => {
    const harness = createHarness();
    const firstSession = await harness.openSession();
    const secondSession = await harness.openSession();
    const malformed = await harness.service.handle({ method: "POST", url: "/mock/attempts", headers: { cookie: firstSession.cookie }, body: "{" });
    assert.equal(malformed.status, 400);
    const unknownField = await harness.call("/mock/attempts", { method: "POST", cookie: firstSession.cookie, body: { domain: "MATH", reuseMode: "NEW_ONLY" } });
    assert.equal(unknownField.status, 422);
    const unknownDomain = await harness.call("/mock/attempts", { method: "POST", cookie: firstSession.cookie, body: { domain: "WRITING" } });
    assert.equal(unknownDomain.status, 422);
    const disabled = await harness.call("/mock/attempts", { method: "POST", cookie: firstSession.cookie, body: { domain: "READING" } });
    assert.equal(disabled.status, 409);

    const started = await harness.call("/mock/attempts", { method: "POST", cookie: firstSession.cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const invalidOption = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[0].slotId}`, {
      method: "PUT", cookie: firstSession.cookie, body: { optionId: "unknown" },
    });
    assert.equal(invalidOption.status, 422);
    const invalidAnswerField = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[0].slotId}`, {
      method: "PUT", cookie: firstSession.cookie, body: { optionId: "a", answerKey: "b" },
    });
    assert.equal(invalidAnswerField.status, 422);
    const unknownSlot = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/44444444-4444-4444-8444-444444444444`, {
      method: "PUT", cookie: firstSession.cookie, body: { optionId: "a" },
    });
    assert.equal(unknownSlot.status, 422);
    const crossSession = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie: secondSession.cookie });
    assert.equal(crossSession.status, 404);
    const unknownAttempt = await harness.call(`/mock/attempts/${attemptIds[2]}`, { cookie: firstSession.cookie });
    assert.equal(unknownAttempt.status, 404);
    const tooLarge = await harness.service.handle({ method: "POST", url: "/mock/attempts", headers: { cookie: firstSession.cookie }, body: JSON.stringify({ padding: "x".repeat(17_000) }) });
    assert.equal(tooLarge.status, 413);
  });

  it("acknowledges answers only in this demo session, grades on submit, and makes submission idempotent", async () => {
    const harness = createHarness();
    const { cookie } = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const beforeSubmit = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie });
    assert.equal(Object.hasOwn(JSON.parse(beforeSubmit.body).attempt, "result"), false);

    const answer = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[0].slotId}`, {
      method: "PUT", cookie, body: { optionId: "b" },
    });
    assert.equal(answer.status, 200);
    assert.equal(JSON.parse(answer.body).message, "Đã ghi nhớ trong phiên demo");
    assert.equal(JSON.parse(answer.body).attempt.answeredCount, 1);
    assert.doesNotMatch(answer.body, /answerKey|explanation/);

    const submitted = await harness.call(`/mock/attempts/${attempt.attemptId}/submit`, { method: "POST", cookie, body: {} });
    assert.equal(submitted.status, 200);
    const firstResult = JSON.parse(submitted.body).result;
    assert.equal(firstResult.correctCount, 1);
    assert.equal(firstResult.totalCount, 4);
    assert.equal(firstResult.percentage, "25.00");
    assert.match(firstResult.label, /KHÔNG CHÍNH THỨC/);
    assert.doesNotMatch(submitted.body, /Subtract 2 from each side|answerKey|explanation/);

    const repeated = await harness.call(`/mock/attempts/${attempt.attemptId}/submit`, { method: "POST", cookie, body: {} });
    assert.deepEqual(JSON.parse(repeated.body).result, firstResult);
    const closedSave = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[1].slotId}`, {
      method: "PUT", cookie, body: { optionId: "a" },
    });
    assert.equal(closedSave.status, 409);

    const nextDemo = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    assert.equal(nextDemo.status, 201);
    const nextAttempt = JSON.parse(nextDemo.body).attempt;
    assert.notEqual(nextAttempt.attemptId, attempt.attemptId);
    assert.equal(nextAttempt.state, "IN_PROGRESS");
    const originalResult = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie });
    assert.deepEqual(JSON.parse(originalResult.body).attempt.result, firstResult);
  });

  it("expires from the injected server clock, freezes answers, and does not extend the deadline", async () => {
    const harness = createHarness();
    const { cookie } = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const deadline = Date.parse(attempt.deadlineAt);
    const answer = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[0].slotId}`, { method: "PUT", cookie, body: { optionId: "b" } });
    assert.equal(answer.status, 200);

    harness.setNow(deadline - 1);
    const before = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie });
    assert.equal(JSON.parse(before.body).attempt.state, "IN_PROGRESS");
    const resumed = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    assert.equal(JSON.parse(resumed.body).attempt.deadlineAt, attempt.deadlineAt);

    harness.setNow(deadline);
    const expired = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie });
    const closed = JSON.parse(expired.body).attempt;
    assert.equal(closed.state, "GRADED");
    assert.equal(closed.closureReason, "DEADLINE");
    assert.equal(closed.result.correctCount, 1);
    const lateWrite = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[1].slotId}`, { method: "PUT", cookie, body: { optionId: "a" } });
    assert.equal(lateWrite.status, 409);
  });

  it("clears an acknowledged answer and updates the public answered count", async () => {
    const harness = createHarness();
    const { cookie } = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const slotId = attempt.slots[0].slotId;
    const saved = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${slotId}`, {
      method: "PUT", cookie, body: { optionId: "a" },
    });
    assert.equal(JSON.parse(saved.body).attempt.answeredCount, 1);

    const cleared = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${slotId}`, {
      method: "PUT", cookie, body: { optionId: null },
    });
    const publicAttempt = JSON.parse(cleared.body).attempt;
    assert.equal(publicAttempt.answeredCount, 0);
    assert.deepEqual(publicAttempt.answers, []);
    assert.equal(JSON.parse(cleared.body).message, "Đã xóa lựa chọn trong phiên demo");
    assert.doesNotMatch(cleared.body, /answerKey|explanation|Subtract 2 from each side/);
  });

  it("releases a separate explicit review only to the owning session after grading", async () => {
    const harness = createHarness();
    const owner = await harness.openSession();
    const other = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie: owner.cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const reviewPath = `/mock/attempts/${attempt.attemptId}/review`;

    assert.equal((await harness.call(reviewPath)).status, 401);
    assert.equal((await harness.call(reviewPath, { cookie: owner.cookie })).status, 409);
    assert.equal((await harness.call(reviewPath, { cookie: other.cookie })).status, 404);
    assert.equal((await harness.call(`/mock/attempts/${attemptIds[2]}/review`, { cookie: owner.cookie })).status, 404);

    const cancelled = await harness.call(`/mock/attempts/${attempt.attemptId}/cancel`, {
      method: "POST", cookie: owner.cookie, body: {},
    });
    assert.equal(JSON.parse(cancelled.body).attempt.state, "CANCELLED");
    assert.equal((await harness.call(reviewPath, { cookie: owner.cookie })).status, 409);

    const next = await harness.call("/mock/attempts", { method: "POST", cookie: owner.cookie, body: { domain: "MATH" } });
    const gradedAttempt = JSON.parse(next.body).attempt;
    const gradedPath = `/mock/attempts/${gradedAttempt.attemptId}`;
    await harness.call(`${gradedPath}/submit`, { method: "POST", cookie: owner.cookie, body: {} });

    const scoreOnly = await harness.call(gradedPath, { cookie: owner.cookie });
    assert.equal(scoreOnly.status, 200);
    assert.equal(Object.hasOwn(JSON.parse(scoreOnly.body).attempt, "result"), true);
    assert.doesNotMatch(scoreOnly.body, /correctOptionId|explanation|Subtract 2 from each side|answerKey/);
    assert.equal((await harness.call(`${gradedPath}/review`, { cookie: other.cookie })).status, 404);

    const released = await harness.call(`${gradedPath}/review`, { cookie: owner.cookie });
    assert.equal(released.status, 200);
    const { review } = JSON.parse(released.body);
    assert.deepEqual(Object.keys(review).sort(), ["attemptId", "label", "repeatNotice", "slots"]);
    assert.match(review.label, /PHIÊN DEMO ĐÃ KHÉP LẠI/);
    assert.equal(review.repeatNotice, "Câu 1–3 lặp lại cùng dữ liệu kiểm thử; câu 4 là nhóm đúng/sai tổng hợp; không phải đề TSA/học liệu đã duyệt");
    assert.equal(review.slots.length, 4);
    assert.deepEqual(Object.keys(review.slots[0]).sort(), ["correctOptionId", "explanation", "ordinal", "slotId"]);
    assert.equal(review.slots[0].correctOptionId, "b");
    assert.deepEqual(review.slots[0].explanation, [{ type: "text", text: "Subtract 2 from each side." }]);
    assert.equal(Object.hasOwn(review, "result"), false);
    assert.equal(Object.hasOwn(review.slots[0], "answerKey"), false);
    assert.deepEqual(review.slots[3], {
      slotId: gradedAttempt.slots[3].slotId,
      ordinal: 4,
      type: "TRUE_FALSE_GROUP",
      statementValues: [],
      correctStatementValues: [{ statementId: "s1", value: true }, { statementId: "s2", value: false }],
      explanation: [{ type: "text", text: "Solving 2y + 4 = 10 gives y = 3. The first statement is true, while adding 4 to y gives 7, not 10." }],
    });
  });

  it("persists partial true/false values without completing a question and rejects invalid group values without mutation", async () => {
    const harness = createHarness();
    const { cookie } = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const slotId = attempt.slots[3].slotId;
    const answerPath = `/mock/attempts/${attempt.attemptId}/answers/${slotId}`;

    const partial = await harness.call(answerPath, { method: "PUT", cookie, body: groupAnswer({ s1: true }) });
    assert.equal(partial.status, 200);
    assert.equal(JSON.parse(partial.body).attempt.answeredCount, 0);
    assert.deepEqual(JSON.parse(partial.body).attempt.answers, [{
      slotId,
      type: "TRUE_FALSE_GROUP",
      statementValues: [{ statementId: "s1", value: true }],
    }]);

    const invalidBodies = [
      { optionId: "a" },
      { type: "TRUE_FALSE_GROUP", statementValues: [{ statementId: "unknown", value: true }] },
      { type: "TRUE_FALSE_GROUP", statementValues: [{ statementId: "s1", value: true }, { statementId: "s1", value: false }] },
      { type: "TRUE_FALSE_GROUP", statementValues: [{ statementId: "s2", value: 1 }] },
      { type: "TRUE_FALSE_GROUP", statementValues: [{ statementId: "s2", value: false, extra: true }] },
    ];
    for (const body of invalidBodies) {
      const invalid = await harness.call(answerPath, { method: "PUT", cookie, body });
      assert.equal(invalid.status, 422, JSON.stringify(body));
    }
    const wrongType = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[0].slotId}`, {
      method: "PUT", cookie, body: groupAnswer({ s1: true }),
    });
    assert.equal(wrongType.status, 422);
    const unchanged = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie });
    assert.deepEqual(JSON.parse(unchanged.body).attempt.answers, JSON.parse(partial.body).attempt.answers);

    const completed = await harness.call(answerPath, { method: "PUT", cookie, body: groupAnswer({ s1: true, s2: false }) });
    assert.equal(JSON.parse(completed.body).attempt.answeredCount, 1);
    const cleared = await harness.call(answerPath, { method: "PUT", cookie, body: groupAnswer({}) });
    assert.equal(JSON.parse(cleared.body).attempt.answeredCount, 0);
    assert.deepEqual(JSON.parse(cleared.body).attempt.answers, []);

    const engineAttempt = createMockAttempt({ now: startTime, createAttemptId: () => attemptIds[0] });
    const directInvalid = saveMockAnswer(engineAttempt, engineAttempt.slots[3].slotId, {
      type: "TRUE_FALSE_GROUP",
      statementValues: { s1: true, unknown: false },
    }, startTime);
    assert.deepEqual(directInvalid, { saved: false, unknownAnswer: true });
    assert.equal(engineAttempt.answers.size, 0);
  });

  it("scores a complete true/false group as one exact-match question", async () => {
    const harness = createHarness();
    const { cookie } = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;

    for (const slot of attempt.slots.slice(0, 3)) {
      const saved = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${slot.slotId}`, {
        method: "PUT", cookie, body: { optionId: "b" },
      });
      assert.equal(saved.status, 200);
    }
    const fullGroup = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[3].slotId}`, {
      method: "PUT", cookie, body: groupAnswer({ s1: true, s2: false }),
    });
    assert.equal(JSON.parse(fullGroup.body).attempt.answeredCount, 4);
    const allCorrect = await harness.call(`/mock/attempts/${attempt.attemptId}/submit`, { method: "POST", cookie, body: {} });
    assert.equal(JSON.parse(allCorrect.body).result.correctCount, 4);
    assert.equal(JSON.parse(allCorrect.body).result.percentage, "100.00");

    const nextStarted = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    const nextAttempt = JSON.parse(nextStarted.body).attempt;
    for (const slot of nextAttempt.slots.slice(0, 3)) {
      await harness.call(`/mock/attempts/${nextAttempt.attemptId}/answers/${slot.slotId}`, {
        method: "PUT", cookie, body: { optionId: "b" },
      });
    }
    const wrongGroup = await harness.call(`/mock/attempts/${nextAttempt.attemptId}/answers/${nextAttempt.slots[3].slotId}`, {
      method: "PUT", cookie, body: groupAnswer({ s1: false, s2: false }),
    });
    assert.equal(JSON.parse(wrongGroup.body).attempt.answeredCount, 4);
    const oneWrong = await harness.call(`/mock/attempts/${nextAttempt.attemptId}/submit`, { method: "POST", cookie, body: {} });
    assert.equal(JSON.parse(oneWrong.body).result.correctCount, 3);
    assert.equal(JSON.parse(oneWrong.body).result.percentage, "75.00");
  });

  it("rejects foreign and expired group writes and keeps private group answers behind graded review", async () => {
    const harness = createHarness();
    const owner = await harness.openSession();
    const other = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie: owner.cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const groupPath = `/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[3].slotId}`;

    assert.equal((await harness.call(groupPath, { method: "PUT", cookie: other.cookie, body: groupAnswer({ s1: true }) })).status, 404);
    assert.equal((await harness.call(`/mock/attempts/${attempt.attemptId}/review`, { cookie: owner.cookie })).status, 409);
    const active = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie: owner.cookie });
    assert.doesNotMatch(active.body, /correctStatementValues|Solving 2y \+ 4 = 10/);

    const partial = await harness.call(groupPath, { method: "PUT", cookie: owner.cookie, body: groupAnswer({ s1: true }) });
    assert.equal(partial.status, 200);
    const deadline = Date.parse(attempt.deadlineAt);
    harness.setNow(deadline);
    const expiredWrite = await harness.call(groupPath, { method: "PUT", cookie: owner.cookie, body: groupAnswer({ s1: true, s2: false }) });
    assert.equal(expiredWrite.status, 409);
    const expired = await harness.call(`/mock/attempts/${attempt.attemptId}`, { cookie: owner.cookie });
    assert.equal(JSON.parse(expired.body).attempt.result.correctCount, 0);
    const review = await harness.call(`/mock/attempts/${attempt.attemptId}/review`, { cookie: owner.cookie });
    assert.equal(review.status, 200);
    assert.deepEqual(JSON.parse(review.body).review.slots[3].statementValues, [{ statementId: "s1", value: true }]);
    const foreignReview = await harness.call(`/mock/attempts/${attempt.attemptId}/review`, { cookie: other.cookie });
    assert.equal(foreignReview.status, 404);
    assert.doesNotMatch(foreignReview.body, /correctStatementValues|s1|s2|Solving 2y \+ 4 = 10/);
  });

  it("confirms cancellation, rejects later writes, and permits an explicit new attempt after cancellation", async () => {
    const harness = createHarness();
    const { cookie } = await harness.openSession();
    const started = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    const attempt = JSON.parse(started.body).attempt;
    const cancelled = await harness.call(`/mock/attempts/${attempt.attemptId}/cancel`, { method: "POST", cookie, body: {} });
    assert.equal(JSON.parse(cancelled.body).attempt.state, "CANCELLED");
    const lateSave = await harness.call(`/mock/attempts/${attempt.attemptId}/answers/${attempt.slots[0].slotId}`, { method: "PUT", cookie, body: { optionId: "a" } });
    assert.equal(lateSave.status, 409);
    const restarted = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    assert.equal(restarted.status, 201);
    assert.notEqual(JSON.parse(restarted.body).attempt.attemptId, attempt.attemptId);
  });
});
