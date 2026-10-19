import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
    assert.equal(first.repeatNotice, "4 vị trí lặp lại cùng dữ liệu kiểm thử; không phải đề TSA/học liệu đã duyệt");
    assert.equal(first.slots[0].content[0].text, "What is x if x + 2 = 5?");
    assert.deepEqual(first.slots.map((slot) => slot.content), Array.from({ length: 4 }, () => first.slots[0].content));
    assert.doesNotMatch(started.body, /answerKey|explanation|Subtract 2 from each side|"optionId":"b"/);

    harness.setNow(startTime + 85_000);
    const resumed = await harness.call("/mock/attempts", { method: "POST", cookie, body: { domain: "MATH" } });
    assert.equal(resumed.status, 200);
    const second = JSON.parse(resumed.body).attempt;
    assert.equal(JSON.parse(resumed.body).resumed, true);
    assert.equal(second.attemptId, first.attemptId);
    assert.equal(second.startedAt, first.startedAt);
    assert.equal(second.deadlineAt, first.deadlineAt);
    assert.equal(Date.parse(second.serverNow), startTime + 85_000);
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
