import { parseJobDispatchForExecutor } from "../../../packages/contracts/dist/internal.js";
import { percentage, scoreAttempt } from "../scoring/binary.mjs";
import { withTransaction } from "../database/pool.mjs";

const ATTEMPT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCORE_RUN_UUID = ATTEMPT_UUID;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const MAX_PG_BIGINT = 9_223_372_036_854_775_807n;
const LOAD_TERMINAL = new Set(["LOST_LEASE", "CANCELLED", "FAILED_FINAL", "ALREADY_DONE"]);
const FINISH_TERMINAL = new Set(["ALREADY_DONE", "LOST_LEASE", "CANCELLED", "FAILED_FINAL"]);
const FAIL_TERMINAL = new Set(["FAILED_RETRYABLE", "FAILED_FINAL", "LOST_LEASE", "CANCELLED"]);
const FAIL_CODES = new Set([
  "INVALID_GRADING_INPUT",
  "DIGEST_MISMATCH",
  "GRADING_ERROR",
  "TEMPORARILY_UNAVAILABLE",
]);

function invalidResult() {
  throw new TypeError("Invalid exam worker result");
}

function operationUnavailable() {
  const error = new Error("Exam worker database operation failed");
  error.code = "TEMPORARILY_UNAVAILABLE";
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonResult(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      invalidResult();
    }
  }
  if (!isRecord(value) || typeof value.status !== "string") invalidResult();
  return value;
}

function hasUuid(value) {
  return typeof value === "string" && ATTEMPT_UUID.test(value);
}

function hasInstant(value) {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

function parseClaimToken(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) invalidResult();
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    invalidResult();
  }
  if (parsed > MAX_PG_BIGINT) invalidResult();
  return value;
}

function freezeJson(value) {
  if (Array.isArray(value)) {
    for (const child of value) freezeJson(child);
  } else if (isRecord(value)) {
    for (const child of Object.values(value)) freezeJson(child);
  }
  if (value !== null && typeof value === "object") Object.freeze(value);
  return value;
}

function validateClaim(raw) {
  if (
    !isRecord(raw) ||
    raw.status !== "CLAIMED" ||
    !hasUuid(raw.attemptId) ||
    !hasInstant(raw.leaseUntil)
  ) {
    invalidResult();
  }
  let dispatch;
  try {
    dispatch = parseJobDispatchForExecutor("EXAM", raw.dispatch);
  } catch {
    invalidResult();
  }
  if (dispatch.payloadRef !== `attempt:${raw.attemptId}`) invalidResult();
  return Object.freeze({
    status: "CLAIMED",
    dispatch: Object.freeze(dispatch),
    attemptId: raw.attemptId,
    leaseToken: parseClaimToken(raw.leaseToken),
    leaseUntil: raw.leaseUntil,
  });
}

function validateLease(lease) {
  if (
    !isRecord(lease) ||
    lease.status !== "CLAIMED" ||
    !hasUuid(lease.attemptId) ||
    !isRecord(lease.dispatch) ||
    !hasUuid(lease.dispatch.jobId) ||
    lease.dispatch.kind !== "exam_grade_attempt" ||
    lease.dispatch.payloadRef !== `attempt:${lease.attemptId}`
  ) {
    invalidResult();
  }
  let dispatch;
  try {
    dispatch = parseJobDispatchForExecutor("EXAM", lease.dispatch);
  } catch {
    invalidResult();
  }
  if (!hasInstant(lease.leaseUntil)) invalidResult();
  return {
    dispatch,
    attemptId: lease.attemptId,
    leaseToken: parseClaimToken(lease.leaseToken),
  };
}

function validateLoad(raw, lease) {
  const result = parseJsonResult(raw);
  if (LOAD_TERMINAL.has(result.status)) return Object.freeze({ status: result.status });
  if (result.status === "ERROR") {
    if (result.code !== "INVALID_GRADING_INPUT" && result.code !== "DIGEST_MISMATCH") invalidResult();
    return Object.freeze({ status: "ERROR", code: result.code });
  }
  if (
    result.status !== "READY" ||
    result.attemptId !== lease.attemptId ||
    !hasUuid(result.formId) ||
    result.policyVersion !== "practice-binary-v1" ||
    typeof result.inputHash !== "string" ||
    !SHA256.test(result.inputHash) ||
    !Array.isArray(result.slots) ||
    result.slots.length === 0
  ) {
    invalidResult();
  }
  if (lease.dispatch.dedupKey !== `${result.attemptId}:${result.policyVersion}:${result.inputHash}`) invalidResult();
  const slots = result.slots.map((slot) => {
    if (
      !isRecord(slot) ||
      !hasUuid(slot.slotId) ||
      typeof slot.sectionId !== "string" || slot.sectionId.trim().length === 0 ||
      !Number.isSafeInteger(slot.ordinal) || slot.ordinal < 0
    ) {
      invalidResult();
    }
    return freezeJson({
      slotId: slot.slotId,
      sectionId: slot.sectionId,
      section: slot.section,
      ordinal: slot.ordinal,
      interaction: slot.interaction,
      answerKey: slot.answerKey,
      response: slot.response,
    });
  });
  return Object.freeze({
    status: "READY",
    attemptId: result.attemptId,
    formId: result.formId,
    policyVersion: result.policyVersion,
    inputHash: result.inputHash,
    slots: Object.freeze(slots),
  });
}

function validateComputed(computed) {
  if (
    !isRecord(computed) ||
    !Number.isSafeInteger(computed.correctCount) ||
    !Number.isSafeInteger(computed.totalCount) ||
    computed.totalCount <= 0 ||
    computed.correctCount < 0 ||
    computed.correctCount > computed.totalCount ||
    !Array.isArray(computed.sections) ||
    computed.sections.length !== 1 ||
    !Array.isArray(computed.items) ||
    computed.items.length !== computed.totalCount
  ) {
    invalidResult();
  }
  const section = computed.sections[0];
  if (
    !isRecord(section) ||
    typeof section.sectionId !== "string" || section.sectionId.trim().length === 0 ||
    !["MATH", "READING", "SCIENCE"].includes(section.section) ||
    section.correctCount !== computed.correctCount ||
    section.totalCount !== computed.totalCount
  ) {
    invalidResult();
  }
  const earnedIds = new Set();
  const items = computed.items.map((item) => {
    if (!isRecord(item) || !hasUuid(item.slotId) || (item.earned !== 0 && item.earned !== 1) || earnedIds.has(item.slotId)) {
      invalidResult();
    }
    earnedIds.add(item.slotId);
    return { slotId: item.slotId, earned: item.earned };
  });
  const totalEarned = items.reduce((sum, item) => sum + item.earned, 0);
  if (
    totalEarned !== computed.correctCount ||
    typeof computed.percentage !== "string" ||
    computed.percentage !== percentage(computed.correctCount, computed.totalCount)
  ) {
    invalidResult();
  }
  return {
    correctCount: computed.correctCount,
    totalCount: computed.totalCount,
    percentage: computed.percentage,
    sections: [{
      sectionId: section.sectionId,
      section: section.section,
      correctCount: section.correctCount,
      totalCount: section.totalCount,
    }],
    items,
  };
}

function validateFinish(raw, attemptId) {
  const result = parseJsonResult(raw);
  if (result.status === "GRADED" || result.status === "ALREADY_DONE") {
    if (result.attemptId !== attemptId || !hasUuid(result.scoreRunId)) invalidResult();
    return Object.freeze({ status: result.status, attemptId: result.attemptId, scoreRunId: result.scoreRunId });
  }
  if (FINISH_TERMINAL.has(result.status)) return Object.freeze({ status: result.status });
  if (result.status === "ERROR" && ["INVALID_GRADING_INPUT", "DIGEST_MISMATCH"].includes(result.code)) {
    return Object.freeze({ status: "ERROR", code: result.code });
  }
  invalidResult();
}

function validateFail(raw) {
  const result = parseJsonResult(raw);
  if (!FAIL_TERMINAL.has(result.status)) invalidResult();
  return Object.freeze({ status: result.status });
}

/** Create a single-run internal exam worker. The SQL functions remain the authority for leases and writes. */
export function createExamWorker({ workerPool, executorId, leaseSeconds, retrySeconds }) {
  if (!workerPool || typeof workerPool.connect !== "function") throw new TypeError("A worker database pool is required");
  if (typeof executorId !== "string" || !/^[!-~]{1,128}$/.test(executorId)) {
    throw new TypeError("A printable worker executor identifier is required");
  }
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) {
    throw new RangeError("leaseSeconds must be from 1 through 300");
  }
  if (!Number.isSafeInteger(retrySeconds) || retrySeconds < 1 || retrySeconds > 3_600) {
    throw new RangeError("retrySeconds must be from 1 through 3600");
  }

  async function callFunction(sql, values) {
    let transactionResult;
    try {
      transactionResult = await withTransaction(workerPool, async (client) => client.query(sql, values));
    } catch {
      throw operationUnavailable();
    }
    return transactionResult.rows[0]?.result;
  }

  async function claim() {
    const raw = parseJsonResult(await callFunction(
      "SELECT tsa.exam_worker_claim($1::text, $2::integer) AS result",
      [executorId, leaseSeconds],
    ));
    if (raw.status === "IDLE") return Object.freeze({ status: "IDLE" });
    return validateClaim(raw);
  }

  async function load(lease) {
    const parsedLease = validateLease(lease);
    return validateLoad(await callFunction(
      "SELECT tsa.exam_worker_load($1::uuid, $2::text, $3::bigint) AS result",
      [parsedLease.dispatch.jobId, executorId, parsedLease.leaseToken],
    ), parsedLease);
  }

  async function finish(lease, computed) {
    const parsedLease = validateLease(lease);
    const safeComputed = validateComputed(computed);
    const result = validateFinish(await callFunction(
      "SELECT tsa.exam_worker_finish($1::uuid, $2::text, $3::bigint, $4::jsonb) AS result",
      [parsedLease.dispatch.jobId, executorId, parsedLease.leaseToken, JSON.stringify(safeComputed)],
    ), parsedLease.attemptId);
    return result;
  }

  async function fail(lease, code) {
    const parsedLease = validateLease(lease);
    if (!FAIL_CODES.has(code)) throw new TypeError("Invalid exam worker failure code");
    return validateFail(await callFunction(
      "SELECT tsa.exam_worker_fail($1::uuid, $2::text, $3::bigint, $4::text, $5::integer) AS result",
      [parsedLease.dispatch.jobId, executorId, parsedLease.leaseToken, code, retrySeconds],
    ));
  }

  async function failSafely(lease, code) {
    try {
      return await fail(lease, code);
    } catch {
      return Object.freeze({ status: "TEMPORARILY_UNAVAILABLE" });
    }
  }

  async function runOnce() {
    let lease;
    try {
      const claimed = await claim();
      if (claimed.status === "IDLE") return Object.freeze({ status: "IDLE" });
      lease = claimed;
      const loaded = await load(lease);
      if (loaded.status === "ERROR") return failSafely(lease, loaded.code);
      if (loaded.status !== "READY") return loaded;

      let computed;
      try {
        computed = scoreAttempt(loaded);
      } catch (error) {
        const code = error instanceof TypeError || error instanceof RangeError
          ? "INVALID_GRADING_INPUT"
          : "GRADING_ERROR";
        return failSafely(lease, code);
      }

      const finished = await finish(lease, computed);
      if (finished.status === "ERROR") return failSafely(lease, finished.code);
      return finished;
    } catch (error) {
      if (lease) {
        const code = error?.code === "TEMPORARILY_UNAVAILABLE"
          ? "TEMPORARILY_UNAVAILABLE"
          : error instanceof TypeError || error instanceof RangeError
            ? "INVALID_GRADING_INPUT"
            : "GRADING_ERROR";
        return failSafely(lease, code);
      }
      return Object.freeze({ status: "TEMPORARILY_UNAVAILABLE" });
    }
  }

  return Object.freeze({ claim, load, finish, fail, runOnce });
}
