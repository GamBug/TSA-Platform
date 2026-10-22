import { withTransaction } from '../database/pool.mjs';

const RESULT_KEYS = Object.freeze(['cancelled', 'expired', 'invalidated', 'reconciled', 'status']);

function unavailable() {
  const error = new Error('TEMPORARILY_UNAVAILABLE');
  error.code = 'TEMPORARILY_UNAVAILABLE';
  return error;
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseResult(value, batchSize) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { throw unavailable(); }
  }
  if (!isRecord(value)
      || Object.keys(value).sort().join(',') !== RESULT_KEYS.join(',')
      || value.status !== 'SWEPT'
      || !Number.isSafeInteger(value.reconciled) || value.reconciled < 0
      || !Number.isSafeInteger(value.cancelled) || value.cancelled < 0
      || !Number.isSafeInteger(value.expired) || value.expired < 0
      || !Number.isSafeInteger(value.invalidated) || value.invalidated < 0
      || value.reconciled > batchSize
      || value.cancelled + value.expired + value.invalidated !== value.reconciled) {
    throw unavailable();
  }
  return Object.freeze({
    status: value.status,
    reconciled: value.reconciled,
    cancelled: value.cancelled,
    expired: value.expired,
    invalidated: value.invalidated,
  });
}

/** Create one bounded EXAM reconciliation call using a dedicated worker pool. */
export function createExamSweeper({ workerPool, executorId, batchSize } = {}) {
  if (!workerPool || typeof workerPool.connect !== 'function') {
    throw new TypeError('A worker database pool is required');
  }
  if (typeof executorId !== 'string' || !/^[!-~]{1,128}$/.test(executorId)) {
    throw new TypeError('A printable worker executor identifier is required');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError('batchSize must be from 1 through 100');
  }

  async function sweepOnce() {
    let result;
    try {
      result = await withTransaction(workerPool, async (client) => client.query(
        'SELECT tsa.exam_worker_sweep($1::text,$2::integer) AS result',
        [executorId, batchSize],
      ));
    } catch {
      throw unavailable();
    }
    try {
      return parseResult(result.rows[0]?.result, batchSize);
    } catch {
      throw unavailable();
    }
  }

  return Object.freeze({ sweepOnce });
}
