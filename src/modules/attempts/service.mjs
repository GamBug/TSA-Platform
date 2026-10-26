import {
  AttemptPathParamsSchema,
  AttemptViewSchema,
  AnswerAckSchema,
  AnswerPathParamsSchema,
  AnswerSubmissionRequestSchema,
  AuthorizedReleasedReviewSchema,
  ClosureSchema,
  CreateAttemptSchema,
  CreationReceiptSchema,
  EmptyCommandBodySchema,
  ErrorHttpStatusByCode,
  IdempotencyKeySchema,
  ResponseValueSchema,
  StartReceiptSchema,
} from '../../../packages/contracts/dist/internal.js';
import { createAllocationService } from '../assembly/allocation.mjs';
import { withTransaction } from '../database/pool.mjs';
import { BankCommandError, jsonDigest, reject, requireActor } from '../bank/common.mjs';

const ROUTE_ONLY_STATUS = Object.freeze({
  NOT_FOUND: 404,
  FORM_NOT_OPEN: 409,
  FORM_UNAVAILABLE: 410,
});
const START_RETRIES = 3;

function record(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : null;
}

function statusResult(value) {
  const result = record(value);
  if (!result || typeof result.status !== 'string') reject(503, 'TEMPORARILY_UNAVAILABLE');
  return result;
}

function failCommand(code, result) {
  const status = ErrorHttpStatusByCode[code] ?? ROUTE_ONLY_STATUS[code];
  if (!status) reject(503, 'TEMPORARILY_UNAVAILABLE');
  const error = new BankCommandError(status, code);
  if (code === 'RATE_LIMITED') {
    const retryAfterSeconds = result?.retryAfter;
    if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds < 1) {
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
    error.details = { retryAfterSeconds };
  }
  throw error;
}

function validateCreateRate(createRate) {
  if (createRate === null || typeof createRate !== 'object' || Array.isArray(createRate)) {
    throw new TypeError('Explicit USER_CREATE rate configuration is required');
  }
  const { capacity, refillPerSecond } = createRate;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000
      || typeof refillPerSecond !== 'number' || !Number.isFinite(refillPerSecond)
      || refillPerSecond < 0.000001 || refillPerSecond > 1_000) {
    throw new TypeError('USER_CREATE rate configuration is invalid');
  }
  return Object.freeze({ capacity, refillPerSecond });
}

function validateSaveRate(saveRate) {
  if (saveRate === null || typeof saveRate !== 'object' || Array.isArray(saveRate)) {
    throw new TypeError('Explicit USER_SAVE and ATTEMPT_SAVE rate configuration is required');
  }
  const validateBucket = (bucket, label) => {
    if (bucket === null || typeof bucket !== 'object' || Array.isArray(bucket)) {
      throw new TypeError(`${label} rate configuration is invalid`);
    }
    const { capacity, refillPerSecond } = bucket;
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000
        || typeof refillPerSecond !== 'number' || !Number.isFinite(refillPerSecond)
        || refillPerSecond < 0.000001 || refillPerSecond > 1_000) {
      throw new TypeError(`${label} rate configuration is invalid`);
    }
    return Object.freeze({ capacity, refillPerSecond });
  };
  return Object.freeze({
    user: validateBucket(saveRate.user, 'USER_SAVE'),
    attempt: validateBucket(saveRate.attempt, 'ATTEMPT_SAVE'),
  });
}

function parseAttemptId(attemptId) {
  const parsed = AttemptPathParamsSchema.safeParse({ id: attemptId });
  if (!parsed.success) reject(422, 'VALIDATION_ERROR');
  return parsed.data.id;
}

function parseAnswerPath(attemptId, slotId) {
  const parsed = AnswerPathParamsSchema.safeParse({ id: attemptId, slotId });
  if (!parsed.success) reject(422, 'VALIDATION_ERROR');
  return { attemptId: parsed.data.id, slotId: parsed.data.slotId };
}

function parseGuard(value, attemptId, userId) {
  const source = record(value);
  const allowed = new Set(['attemptId', 'ownerId', 'state', 'withdrawn', 'releaseAuthorized', 'revision']);
  if (!source || Object.keys(source).some((key) => !allowed.has(key))
      || source.attemptId !== attemptId || source.ownerId !== userId
      || !['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'GRADED', 'CANCELLED', 'INVALIDATED'].includes(source.state)
      || typeof source.withdrawn !== 'boolean' || typeof source.releaseAuthorized !== 'boolean'
      || (source.releaseAuthorized && source.state !== 'GRADED')
      || typeof source.revision !== 'string' || source.revision.length === 0) {
    reject(503, 'TEMPORARILY_UNAVAILABLE');
  }
  return {
    attemptId: source.attemptId,
    ownerId: source.ownerId,
    state: source.state,
    withdrawn: source.withdrawn,
    releaseAuthorized: source.releaseAuthorized,
    revision: source.revision,
  };
}

function parseReadResult(value, attemptId, userId) {
  const source = record(value);
  if (!source || Object.keys(source).some((key) => key !== 'guard' && key !== 'view')) {
    reject(503, 'TEMPORARILY_UNAVAILABLE');
  }
  const guard = parseGuard(source.guard, attemptId, userId);
  const parsedView = AttemptViewSchema.safeParse(source.view);
  if (!parsedView.success || parsedView.data.attemptId !== attemptId || parsedView.data.state !== guard.state) {
    reject(503, 'TEMPORARILY_UNAVAILABLE');
  }
  return Object.freeze({ guard: Object.freeze(guard), view: parsedView.data });
}

function mapPostgresError(error) {
  if (error?.code === '42501') reject(403, 'FORBIDDEN');
  if (error?.code === '22023' || error?.code === '23514') reject(422, 'VALIDATION_ERROR');
  reject(503, 'TEMPORARILY_UNAVAILABLE');
}

function isRetryableTransactionConflict(error) {
  return error?.code === '40001' || error?.code === '40P01';
}

function toCreationResult(result) {
  if (result.status === 'REPLAY') {
    const parsed = CreationReceiptSchema.safeParse(result.receipt);
    if (!parsed.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
    return { status: 201, body: parsed.data, replayed: true };
  }
  if (result.status === 'ERROR') failCommand(result.code, result);
  reject(503, 'TEMPORARILY_UNAVAILABLE');
}

function toAnswerResult(result) {
  if (result.status === 'SAVED' || result.status === 'REPLAY') {
    const parsed = AnswerAckSchema.safeParse(result.receipt);
    if (!parsed.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
    return { status: 200, body: parsed.data, replayed: result.status === 'REPLAY' };
  }
  if (result.status === 'ERROR') {
    const status = ErrorHttpStatusByCode[result.code] ?? ROUTE_ONLY_STATUS[result.code];
    if (!status) reject(503, 'TEMPORARILY_UNAVAILABLE');
    const error = new BankCommandError(status, result.code);
    if (result.code === 'RATE_LIMITED') {
      const retryAfterSeconds = result.retryAfter;
      if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds < 1) {
        reject(503, 'TEMPORARILY_UNAVAILABLE');
      }
      error.details = { retryAfterSeconds };
    } else if (result.code === 'REVISION_CONFLICT') {
      const details = record(result.details);
      if (details && Number.isSafeInteger(details.currentRevision) && details.currentRevision >= 0) {
        error.details = { currentRevision: details.currentRevision };
        const currentAnswer = ResponseValueSchema.safeParse(details.currentAnswer);
        if (currentAnswer.success) error.details.currentAnswer = currentAnswer.data;
      }
    }
    throw error;
  }
  reject(503, 'TEMPORARILY_UNAVAILABLE');
}

function toSubmitResult(result) {
  if (result.status === 'SUBMITTED' || result.status === 'REPLAY' || result.status === 'CLOSED') {
    const parsed = ClosureSchema.safeParse(result.receipt);
    if (!parsed.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
    return { status: 200, body: parsed.data, replayed: result.status === 'REPLAY' };
  }
  if (result.status === 'ERROR') failCommand(result.code, result);
  reject(503, 'TEMPORARILY_UNAVAILABLE');
}

function normalizeRead(value, attemptId, userId) {
  if (value === null || value === undefined) return null;
  return parseReadResult(value, attemptId, userId);
}

function parseReleasedReview(value, attemptId) {
  const source = record(value);
  const parsed = source === null ? null : AuthorizedReleasedReviewSchema.safeParse(source);
  if (!parsed?.success || parsed.data.attemptId !== attemptId) reject(503, 'TEMPORARILY_UNAVAILABLE');
  return parsed.data;
}

/**
 * Student attempt commands over the restricted exam role. Creation and save
 * budgets commit in separate PostgreSQL transactions; SQL owns each command's
 * persisted receipt, current lifecycle guards, and answer revision.
 */
export function createAttemptService({ examPool, identityService, createRate, saveRate, enableReviewPractice = false } = {}) {
  if (!examPool || typeof examPool.connect !== 'function') throw new TypeError('examPool is required');
  if (!identityService || typeof identityService.mayPerform !== 'function') {
    throw new TypeError('identityService is required');
  }
  const rate = validateCreateRate(createRate);
  const saveRates = saveRate === undefined ? null : validateSaveRate(saveRate);
  const allocation = createAllocationService({ examPool, identityService, enableReviewPractice });

  async function runReceipt(principal, key, requestHash) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query('SELECT tsa.assembly_receipt($1,$2) AS result', [key, requestHash]);
      const value = result.rows[0]?.result;
      return value === null || value === undefined ? null : statusResult(value);
    }, { role: 'tsa_exam' });
  }

  async function consumeCreateBudget(principal) {
    const budget = await withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query(
        'SELECT tsa.exam_consume_creation_budget($1::numeric,$2::numeric) AS result',
        [String(rate.capacity), String(rate.refillPerSecond)]);
      const budget = record(result.rows[0]?.result);
      if (!budget || typeof budget.allowed !== 'boolean') reject(503, 'TEMPORARILY_UNAVAILABLE');
      return budget;
    }, { role: 'tsa_exam' });
    if (!budget.allowed) failCommand('RATE_LIMITED', budget);
  }

  async function runStart(principal, attemptId, key, bodyHash) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query(
        'SELECT tsa.exam_attempt_start($1,$2,$3) AS result', [attemptId, key, bodyHash]);
      return statusResult(result.rows[0]?.result);
    }, { role: 'tsa_exam' });
  }

  async function authorizeSave(principal, attemptId, slotId) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query('SELECT tsa.exam_authorize_save($1,$2) AS authorized', [attemptId, slotId]);
      if (typeof result.rows[0]?.authorized !== 'boolean') reject(503, 'TEMPORARILY_UNAVAILABLE');
      return result.rows[0].authorized;
    }, { role: 'tsa_exam' });
  }

  async function consumeSaveBudget(principal, attemptId, slotId, configured) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query(
        'SELECT tsa.exam_consume_save_budget($1,$2,$3::numeric,$4::numeric,$5::numeric,$6::numeric) AS result',
        [attemptId, slotId,
          String(configured.user.capacity), String(configured.user.refillPerSecond),
          String(configured.attempt.capacity), String(configured.attempt.refillPerSecond)]);
      const budget = record(result.rows[0]?.result);
      if (!budget) reject(503, 'TEMPORARILY_UNAVAILABLE');
      if (budget.status === 'ERROR') {
        if (budget.code === 'NOT_FOUND') reject(404, 'NOT_FOUND');
        reject(503, 'TEMPORARILY_UNAVAILABLE');
      }
      if (budget.allowed === true) return;
      if (budget.allowed === false) failCommand('RATE_LIMITED', budget);
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }, { role: 'tsa_exam' });
  }

  async function runSave(principal, attemptId, slotId, key, bodyHash, request) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query(
        'SELECT tsa.exam_answer_save($1,$2,$3,$4,$5::jsonb) AS result',
        [attemptId, slotId, key, bodyHash, JSON.stringify(request)]);
      return statusResult(result.rows[0]?.result);
    }, { role: 'tsa_exam' });
  }

  async function runSubmit(principal, attemptId, key, bodyHash) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query(
        'SELECT tsa.exam_attempt_submit($1,$2,$3) AS result', [attemptId, key, bodyHash]);
      return statusResult(result.rows[0]?.result);
    }, { role: 'tsa_exam' });
  }

  async function readOnClient(client, principal, attemptId) {
    const result = await client.query('SELECT tsa.exam_attempt_access($1) AS result', [attemptId]);
    return normalizeRead(result.rows[0]?.result, attemptId, principal.userId);
  }

  async function create(principal, key, input) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    if (!IdempotencyKeySchema.safeParse(key).success) reject(422, 'VALIDATION_ERROR');
    const parsedRequest = CreateAttemptSchema.safeParse(input);
    if (!parsedRequest.success) reject(422, 'VALIDATION_ERROR');
    const request = parsedRequest.data;
    const requestHash = jsonDigest(request);
    try {
      const prior = await runReceipt(principal, key, requestHash);
      if (prior !== null) return toCreationResult(prior);
      await consumeCreateBudget(principal);
      return await allocation.create(principal, key, request);
    } catch (error) {
      if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) mapPostgresError(error);
      throw error;
    }
  }

  async function start(principal, attemptIdInput, key, input = {}) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    const attemptId = parseAttemptId(attemptIdInput);
    if (!IdempotencyKeySchema.safeParse(key).success) reject(422, 'VALIDATION_ERROR');
    const parsedBody = EmptyCommandBodySchema.safeParse(input);
    if (!parsedBody.success) reject(422, 'VALIDATION_ERROR');
    const bodyHash = jsonDigest(parsedBody.data);

    for (let attempt = 0; attempt < START_RETRIES; attempt += 1) {
      let result;
      try {
        result = await runStart(principal, attemptId, key, bodyHash);
      } catch (error) {
        if (isRetryableTransactionConflict(error)) continue;
        if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) mapPostgresError(error);
        throw error;
      }
      if (result.status === 'STARTED' || result.status === 'REPLAY') {
        const parsed = StartReceiptSchema.safeParse(result.receipt);
        if (!parsed.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
        return { status: 200, body: parsed.data, replayed: result.status === 'REPLAY' };
      }
      if (result.status === 'ERROR') failCommand(result.code, result);
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
    reject(409, 'CONCURRENT_MODIFICATION');
  }

  async function save(principal, attemptIdInput, slotIdInput, key, input) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    const { attemptId, slotId } = parseAnswerPath(attemptIdInput, slotIdInput);
    if (!IdempotencyKeySchema.safeParse(key).success) reject(422, 'VALIDATION_ERROR');

    let authorized;
    try {
      authorized = await authorizeSave(principal, attemptId, slotId);
    } catch (error) {
      if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) mapPostgresError(error);
      throw error;
    }
    if (!authorized) reject(404, 'NOT_FOUND');
    if (!saveRates) reject(503, 'TEMPORARILY_UNAVAILABLE');

    try {
      await consumeSaveBudget(principal, attemptId, slotId, saveRates);
    } catch (error) {
      if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) mapPostgresError(error);
      throw error;
    }

    // The independent save buckets are charged after ownership/slot authorization
    // but before strict answer validation, including invalid typed values.
    const parsedRequest = AnswerSubmissionRequestSchema.safeParse(input);
    if (!parsedRequest.success) reject(422, 'VALIDATION_ERROR');
    const request = parsedRequest.data;
    const bodyHash = jsonDigest(request);

    for (let attempt = 0; attempt < START_RETRIES; attempt += 1) {
      let result;
      try {
        result = await runSave(principal, attemptId, slotId, key, bodyHash, request);
      } catch (error) {
        if (isRetryableTransactionConflict(error)) continue;
        if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) mapPostgresError(error);
        throw error;
      }
      return toAnswerResult(result);
    }
    reject(409, 'CONCURRENT_MODIFICATION');
  }

  async function submit(principal, attemptIdInput, key, input = {}) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    const attemptId = parseAttemptId(attemptIdInput);
    if (!IdempotencyKeySchema.safeParse(key).success) reject(422, 'VALIDATION_ERROR');
    const parsedBody = EmptyCommandBodySchema.safeParse(input);
    if (!parsedBody.success) reject(422, 'VALIDATION_ERROR');
    const bodyHash = jsonDigest(parsedBody.data);

    for (let attempt = 0; attempt < START_RETRIES; attempt += 1) {
      let result;
      try {
        result = await runSubmit(principal, attemptId, key, bodyHash);
      } catch (error) {
        if (isRetryableTransactionConflict(error)) continue;
        if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) mapPostgresError(error);
        throw error;
      }
      return toSubmitResult(result);
    }
    reject(409, 'CONCURRENT_MODIFICATION');
  }

  async function withReadBoundary(principal, callback) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    if (typeof callback !== 'function') throw new TypeError('Read boundary callback is required');
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      let active = true;
      let latest = null;
      const read = async (attemptIdInput) => {
        if (!active) throw new TypeError('Read boundary is closed');
        const attemptId = parseAttemptId(attemptIdInput);
        latest = await readOnClient(client, principal, attemptId);
        return latest;
      };
      const ports = Object.freeze({
        readAccess: async ({ attemptId, userId }) => {
          if (userId !== principal.userId) return null;
          const current = await read(attemptId);
          return current?.guard ?? null;
        },
        loadAttemptView: async ({ attemptId, userId }) => {
          if (userId !== principal.userId || latest?.guard.attemptId !== attemptId) {
            throw new TypeError('Attempt view is unavailable');
          }
          return latest.view;
        },
        loadReleasedReview: async ({ attemptId, userId, access }) => {
          const guard = latest?.guard;
          if (!active || userId !== principal.userId || !guard
              || guard.attemptId !== attemptId || guard.ownerId !== userId
              || guard.state !== 'GRADED' || guard.withdrawn || guard.releaseAuthorized !== true
              || !access || access.attemptId !== attemptId || access.ownerId !== userId
              || access.state !== guard.state || access.withdrawn !== guard.withdrawn
              || access.releaseAuthorized !== guard.releaseAuthorized || access.revision !== guard.revision) {
            throw new BankCommandError(503, 'TEMPORARILY_UNAVAILABLE');
          }
          const result = await client.query('SELECT tsa.exam_released_review($1) AS result', [attemptId]);
          return parseReleasedReview(result.rows[0]?.result, attemptId);
        },
      });
      try {
        return await callback(ports, read);
      } finally {
        active = false;
        latest = null;
      }
    }, { role: 'tsa_exam' });
  }

  async function read(principal, attemptIdInput) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    const attemptId = parseAttemptId(attemptIdInput);
    try {
      return await withTransaction(examPool, async (client) => {
        await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
        return (await readOnClient(client, principal, attemptId))?.view ?? null;
      }, { role: 'tsa_exam' });
    } catch (error) {
      if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) mapPostgresError(error);
      throw error;
    }
  }

  return Object.freeze({ create, start, save, submit, read, withReadBoundary });
}
