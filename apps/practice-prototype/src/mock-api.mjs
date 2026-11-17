import { randomBytes, randomUUID } from "node:crypto";

import {
  cancelMockAttempt,
  createMockAttempt,
  expireIfNeeded,
  saveMockAnswer,
  submitMockAttempt,
  toPublicAttempt,
} from "./exam-engine.mjs";
import { questionFixtureForOrdinal, REPEATED_FIXTURE_NOTICE } from "./private-question-fixture.mjs";

const MAX_JSON_BYTES = 16 * 1024;
const SESSION_COOKIE = "practice_demo_session";
const SESSION_MAX_AGE_SECONDS = 1_800;

const catalog = Object.freeze([
  { domain: "MATH", questionCount: 4, durationSeconds: 360, available: true },
  { domain: "READING", questionCount: 2, durationSeconds: 180, available: false },
  { domain: "SCIENCE", questionCount: 4, durationSeconds: 360, available: false },
]);

function json(status, body, headers = {}) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function error(status, code, message) {
  return json(status, { error: { code, message } });
}

function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== "string") return null;
  for (const part of cookieHeader.split(";")) {
    const equals = part.indexOf("=");
    if (equals < 0 || part.slice(0, equals).trim() !== name) continue;
    return part.slice(equals + 1).trim() || null;
  }
  return null;
}

function parseJson(body) {
  if (body === undefined || body === "") return {};
  if (typeof body !== "string") throw new TypeError("Request body must be JSON text");
  if (Buffer.byteLength(body, "utf8") > MAX_JSON_BYTES) {
    const tooLarge = new Error("Request body too large");
    tooLarge.code = "PAYLOAD_TOO_LARGE";
    throw tooLarge;
  }
  try {
    return JSON.parse(body);
  } catch {
    const malformed = new Error("Malformed JSON");
    malformed.code = "MALFORMED_JSON";
    throw malformed;
  }
}

function strictObject(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.keys(value).every((key) => keys.includes(key));
}

function groupStatementValues(value, question) {
  if (!strictObject(value, ["type", "statementValues"]) || !Object.hasOwn(value, "type") || !Object.hasOwn(value, "statementValues") ||
      value.type !== "TRUE_FALSE_GROUP" || !Array.isArray(value.statementValues)) return null;
  const allowedIds = new Set(question.interaction.statements.map(({ id }) => id));
  const values = {};
  for (const entry of value.statementValues) {
    if (!strictObject(entry, ["statementId", "value"]) || !Object.hasOwn(entry, "statementId") || !Object.hasOwn(entry, "value") ||
        typeof entry.statementId !== "string" || !allowedIds.has(entry.statementId) || typeof entry.value !== "boolean" ||
        Object.hasOwn(values, entry.statementId)) return null;
    values[entry.statementId] = entry.value;
  }
  return { type: "TRUE_FALSE_GROUP", statementValues: values };
}

function publicGroupValues(statementValues = {}) {
  return Object.entries(statementValues).map(([statementId, value]) => ({ statementId, value }));
}

function safeSessionSnapshot(session, now) {
  const attempt = session.activeAttemptId === null ? null : session.attempts.get(session.activeAttemptId) ?? null;
  return { attempt: attempt === null ? null : toPublicAttempt(attempt, now) };
}

function toPublicReview(attempt) {
  return {
    attemptId: attempt.attemptId,
    label: "ÔN TẬP ĐÁP ÁN CỦA PHIÊN DEMO ĐÃ KHÉP LẠI",
    repeatNotice: REPEATED_FIXTURE_NOTICE,
    slots: attempt.slots.map(({ slotId, ordinal }) => {
      const question = questionFixtureForOrdinal(ordinal);
      if (question.interaction.type === "TRUE_FALSE_GROUP") {
        const answer = attempt.answers.get(slotId);
        return {
          slotId,
          ordinal,
          type: "TRUE_FALSE_GROUP",
          statementValues: publicGroupValues(answer?.statementValues),
          correctStatementValues: publicGroupValues(question.private.answerKey.statementValues),
          explanation: structuredClone(question.private.explanation),
        };
      }
      return {
        slotId,
        ordinal,
        correctOptionId: question.private.answerKey.optionId,
        explanation: structuredClone(question.private.explanation),
      };
    }),
  };
}

export function createMockApiService({ now = () => Date.now(), makeSessionId = () => randomBytes(32).toString("base64url"), makeAttemptId = randomUUID } = {}) {
  const sessions = new Map();

  function findSession(headers) {
    const id = readCookie(headers.cookie, SESSION_COOKIE);
    return id === null ? null : sessions.get(id) ?? null;
  }

  function findOwnedAttempt(session, attemptId) {
    return session.attempts.get(attemptId) ?? null;
  }

  return {
    async handle({ method = "GET", url = "/", headers = {}, body }) {
      const pathname = new URL(url, "http://127.0.0.1").pathname;
      if (pathname === "/mock/session" && method === "POST") {
        let value;
        try {
          value = parseJson(body);
        } catch (cause) {
          return cause.code === "PAYLOAD_TOO_LARGE"
            ? error(413, "PAYLOAD_TOO_LARGE", "Request body is too large.")
            : error(400, "MALFORMED_JSON", "Request body is not valid JSON.");
        }
        if (!strictObject(value, [])) return error(422, "VALIDATION_ERROR", "Session request must be empty.");
        const existingId = readCookie(headers.cookie, SESSION_COOKIE);
        let sessionId = existingId;
        let session = sessionId === null ? null : sessions.get(sessionId) ?? null;
        let setCookie;
        if (session === null) {
          sessionId = makeSessionId();
          session = { attempts: new Map(), activeAttemptId: null };
          sessions.set(sessionId, session);
          setCookie = `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
        }
        return json(200, safeSessionSnapshot(session, now()), setCookie === undefined ? {} : { "Set-Cookie": setCookie });
      }

      if (pathname === "/mock/catalog" && method === "GET") {
        return json(200, { domains: catalog });
      }

      const session = findSession(headers);
      if (session === null) return error(401, "SESSION_REQUIRED", "Start a local demo session first.");

      if (pathname === "/mock/attempts" && method === "POST") {
        let value;
        try {
          value = parseJson(body);
        } catch (cause) {
          return cause.code === "PAYLOAD_TOO_LARGE"
            ? error(413, "PAYLOAD_TOO_LARGE", "Request body is too large.")
            : error(400, "MALFORMED_JSON", "Request body is not valid JSON.");
        }
        if (!strictObject(value, ["domain"]) || !["MATH", "READING", "SCIENCE"].includes(value.domain)) {
          return error(422, "VALIDATION_ERROR", "Choose a supported domain.");
        }
        const selectedDomain = catalog.find((entry) => entry.domain === value.domain);
        if (!selectedDomain.available) return error(409, "CONTENT_UNAVAILABLE", "Demo content for this domain is not available yet.");

        let existing = session.activeAttemptId === null ? null : session.attempts.get(session.activeAttemptId) ?? null;
        if (existing !== null && existing.state === "IN_PROGRESS") {
          return json(200, { attempt: toPublicAttempt(existing, now()), resumed: true });
        }
        const attempt = createMockAttempt({ now: now(), createAttemptId: makeAttemptId });
        session.attempts.set(attempt.attemptId, attempt);
        session.activeAttemptId = attempt.attemptId;
        return json(201, { attempt: toPublicAttempt(attempt, now()), resumed: false });
      }

      const attemptRoute = /^\/mock\/attempts\/([0-9a-f-]+)(?:\/(answers\/([0-9a-f-]+)|submit|cancel|review))?$/.exec(pathname);
      if (attemptRoute === null) return error(404, "NOT_FOUND", "Demo route not found.");
      const attempt = findOwnedAttempt(session, attemptRoute[1]);
      if (attempt === null) return error(404, "NOT_FOUND", "Demo attempt not found.");

      const suffix = attemptRoute[2] ?? "";
      if (suffix === "" && method === "GET") return json(200, { attempt: toPublicAttempt(attempt, now()) });

      if (suffix === "review" && method === "GET") {
        expireIfNeeded(attempt, now());
        if (attempt.state !== "GRADED") return error(409, "REVIEW_NOT_AVAILABLE", "Review is available only after this demo attempt is graded.");
        return json(200, { review: toPublicReview(attempt) });
      }

      if (suffix.startsWith("answers/") && method === "PUT") {
        let value;
        try {
          value = parseJson(body);
        } catch (cause) {
          return cause.code === "PAYLOAD_TOO_LARGE"
            ? error(413, "PAYLOAD_TOO_LARGE", "Request body is too large.")
            : error(400, "MALFORMED_JSON", "Request body is not valid JSON.");
        }
        const slotId = attemptRoute[3];
        const slot = attempt.slots.find((entry) => entry.slotId === slotId);
        if (!slot) return error(422, "VALIDATION_ERROR", "Answer does not match a demo question.");
        const question = questionFixtureForOrdinal(slot.ordinal);
        let answer;
        if (question.interaction.type === "SINGLE_CHOICE") {
          if (!strictObject(value, ["optionId"]) || !Object.hasOwn(value, "optionId") || !(value.optionId === null || typeof value.optionId === "string")) {
            return error(422, "VALIDATION_ERROR", "Answer must contain one option ID or null.");
          }
          answer = value.optionId;
        } else {
          answer = groupStatementValues(value, question);
          if (answer === null) return error(422, "VALIDATION_ERROR", "Answer must contain distinct true/false values for known statements.");
        }
        const result = saveMockAnswer(attempt, slotId, answer, now());
        if (result.unknownSlot || result.unknownOption || result.unknownAnswer) return error(422, "VALIDATION_ERROR", "Answer does not match a demo question.");
        if (result.closed) return error(409, "ATTEMPT_CLOSED", "This demo attempt is closed.");
        return json(200, {
          attempt: toPublicAttempt(attempt, now()),
          message: answer === null || (answer.type === "TRUE_FALSE_GROUP" && Object.keys(answer.statementValues).length === 0)
            ? "Đã xóa lựa chọn trong phiên demo"
            : "Đã ghi nhớ trong phiên demo",
        });
      }

      if (suffix === "submit" && method === "POST") {
        let value;
        try {
          value = parseJson(body);
        } catch (cause) {
          return cause.code === "PAYLOAD_TOO_LARGE"
            ? error(413, "PAYLOAD_TOO_LARGE", "Request body is too large.")
            : error(400, "MALFORMED_JSON", "Request body is not valid JSON.");
        }
        if (!strictObject(value, [])) return error(422, "VALIDATION_ERROR", "Submit request must be empty.");
        const result = submitMockAttempt(attempt, now());
        if (!result.submitted) return error(409, "ATTEMPT_CLOSED", "This demo attempt is closed.");
        return json(200, { attempt: toPublicAttempt(attempt, now()), result: result.result });
      }

      if (suffix === "cancel" && method === "POST") {
        let value;
        try {
          value = parseJson(body);
        } catch (cause) {
          return cause.code === "PAYLOAD_TOO_LARGE"
            ? error(413, "PAYLOAD_TOO_LARGE", "Request body is too large.")
            : error(400, "MALFORMED_JSON", "Request body is not valid JSON.");
        }
        if (!strictObject(value, [])) return error(422, "VALIDATION_ERROR", "Cancel request must be empty.");
        const result = cancelMockAttempt(attempt, now());
        if (!result.cancelled) return error(409, "ATTEMPT_CLOSED", "This demo attempt is closed.");
        session.activeAttemptId = null;
        return json(200, { attempt: toPublicAttempt(attempt, now()) });
      }

      return error(404, "NOT_FOUND", "Demo route not found.");
    },
  };
}
