import { randomBytes } from 'node:crypto';
import {
  CreateAttemptSchema,
  CreationReceiptSchema,
  ErrorHttpStatusByCode,
  IdempotencyKeySchema,
} from '../../../packages/contracts/dist/internal.js';
import { buildAllocationPlan } from './snapshot-builder.mjs';
import { captureStandaloneManifest } from './candidate-stock.mjs';
import { withTransaction } from '../database/pool.mjs';
import { BankCommandError, jsonDigest, reject, requireActor } from '../bank/common.mjs';

const ROUTE_ONLY_STATUS = Object.freeze({ NOT_FOUND: 404, FORM_NOT_OPEN: 409, FORM_UNAVAILABLE: 410 });
const MAX_REPLAN_ATTEMPTS = 3;
const DEFAULT_LIMITS = Object.freeze({ maxNodes: 50_000, maxUnits: 2_000 });

function parseJsonRecord(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function safeAlternatives(value) {
  if (!Array.isArray(value)) return [];
  const alternatives = [];
  for (const option of value) {
    if (!option || typeof option !== 'object' || Array.isArray(option)) continue;
    if (option.kind === 'WAIT_FOR_PUBLICATION') {
      alternatives.push({ kind: 'WAIT_FOR_PUBLICATION' });
    } else if (option.kind === 'REVIEW_MODE'
        && typeof option.blueprintVersionId === 'string' && option.requiresRepeatConsent === true) {
      alternatives.push({ kind: 'REVIEW_MODE', blueprintVersionId: option.blueprintVersionId, requiresRepeatConsent: true });
    } else if (option.kind === 'SHORTER_PROFILE'
        && typeof option.blueprintVersionId === 'string' && typeof option.name === 'string') {
      alternatives.push({ kind: 'SHORTER_PROFILE', blueprintVersionId: option.blueprintVersionId, name: option.name });
    }
  }
  return alternatives;
}

function safeSectionDeficits(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((deficit) => {
    if (!deficit || typeof deficit.sectionId !== 'string'
        || !Number.isSafeInteger(deficit.missingCount) || deficit.missingCount < 1) return [];
    return [{ sectionId: deficit.sectionId, missingCount: deficit.missingCount }];
  });
}

function sectionDeficitsForFailure(code, manifest) {
  if (!manifest || !['INSUFFICIENT_ELIGIBLE_INVENTORY', 'INSUFFICIENT_UNSEEN_INVENTORY'].includes(code)) return [];
  const excludedQuestions = new Set(manifest.blueprint.excludedQuestionIds);
  const historyQuestions = new Set(manifest.historyQuestionIds);
  const historyGroups = new Set(manifest.historyGroupIds);
  const groupsBySection = new Map(manifest.blueprint.sections.map((section) => [section.id, new Set()]));

  for (const unit of manifest.units) {
    const sectionGroups = groupsBySection.get(unit.sectionId);
    if (!sectionGroups) continue;
    // The reference solver excludes a whole unit when any member is excluded or
    // already seen. Count canonical groups only after applying those same filters.
    if (unit.members.some((member) => excludedQuestions.has(member.questionId)
      || (code === 'INSUFFICIENT_UNSEEN_INVENTORY'
        && (historyQuestions.has(member.questionId) || historyGroups.has(member.groupId))))) continue;
    for (const member of unit.members) sectionGroups.add(member.groupId);
  }

  return manifest.blueprint.sections.flatMap((section) => {
    const missingCount = section.count - (groupsBySection.get(section.id)?.size ?? 0);
    return missingCount > 0 ? [{ sectionId: section.id, missingCount }] : [];
  });
}

function errorDetails(code, result, blueprintVersionId) {
  const source = parseJsonRecord(result?.details) ?? result ?? {};
  if (code === 'CONCURRENT_ATTEMPT_EXISTS') {
    return typeof source.attemptId === 'string' ? { existingAttemptId: source.attemptId }
      : typeof source.existingAttemptId === 'string' ? { existingAttemptId: source.existingAttemptId } : {};
  }
  if (code === 'INSUFFICIENT_ELIGIBLE_INVENTORY' || code === 'INSUFFICIENT_UNSEEN_INVENTORY') {
    return {
      blueprintVersionId,
      reuseMode: 'NEW_ONLY',
      sectionDeficits: safeSectionDeficits(source.sectionDeficits),
      alternatives: safeAlternatives(source.alternatives),
    };
  }
  if (code === 'SEARCH_EXHAUSTED') {
    return { blueprintVersionId, reuseMode: 'NEW_ONLY' };
  }
  return {};
}

function failCommand(code, result, blueprintVersionId) {
  const status = ErrorHttpStatusByCode[code] ?? ROUTE_ONLY_STATUS[code];
  if (!status) reject(503, 'TEMPORARILY_UNAVAILABLE');
  const error = new BankCommandError(status, code);
  const details = errorDetails(code, result, blueprintVersionId);
  if (Object.keys(details).length) error.details = details;
  throw error;
}

function success(receipt, replayed) {
  const parsed = CreationReceiptSchema.safeParse(receipt);
  if (!parsed.success) reject(503, 'TEMPORARILY_UNAVAILABLE');
  return { status: 201, body: parsed.data, replayed };
}

function randomSeed() {
  return randomBytes(4).readUInt32BE(0);
}

function isRetryableTransactionConflict(error) {
  return error?.code === '40001' || error?.code === '40P01';
}

function isActiveAttemptConstraint(error) {
  return error?.code === '23505' && error?.constraint === 'uq_one_active_attempt_per_user';
}

function isPostgresError(error) {
  return typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code);
}

function mapPostgresError(error) {
  if (error.code === '42501') reject(403, 'FORBIDDEN');
  if (error.code === '22023') reject(422, 'VALIDATION_ERROR');
  if (error.code === '0A000') reject(422, 'UNSUPPORTED_TYPE');
  reject(503, 'TEMPORARILY_UNAVAILABLE');
}

function statusResult(value) {
  const result = parseJsonRecord(value);
  if (!result || typeof result.status !== 'string') reject(503, 'TEMPORARILY_UNAVAILABLE');
  return result;
}

export function createAllocationService({ examPool, identityService, limits = DEFAULT_LIMITS } = {}) {
  if (!examPool || typeof examPool.connect !== 'function') throw new TypeError('examPool is required');
  if (!identityService || typeof identityService.mayPerform !== 'function') throw new TypeError('identityService is required');
  const fixedLimits = Object.freeze({ ...limits });

  async function runCheck(principal, key, requestHash, blueprintVersionId) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query(
        'SELECT tsa.assembly_creation_check($1,$2,$3) AS result', [key, requestHash, blueprintVersionId]);
      return statusResult(result.rows[0]?.result);
    }, { role: 'tsa_exam' });
  }

  async function runReceipt(principal, key, requestHash) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query('SELECT tsa.assembly_receipt($1,$2) AS result', [key, requestHash]);
      const value = result.rows[0]?.result;
      return value === null || value === undefined ? null : statusResult(value);
    }, { role: 'tsa_exam' });
  }

  async function runCommit(principal, key, requestHash, plan) {
    return withTransaction(examPool, async (client) => {
      await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [principal.userId]);
      const result = await client.query(
        'SELECT tsa.assembly_commit_personal($1,$2,$3::jsonb) AS result',
        [key, requestHash, JSON.stringify(plan)]);
      return statusResult(result.rows[0]?.result);
    }, { role: 'tsa_exam' });
  }

  async function handlePreflight(result, blueprintVersionId) {
    if (result.status === 'REPLAY') return success(result.receipt, true);
    if (result.status === 'ACTIVE') failCommand('CONCURRENT_ATTEMPT_EXISTS', result, blueprintVersionId);
    if (result.status === 'ERROR') failCommand(result.code, result, blueprintVersionId);
    if (result.status !== 'READY') reject(503, 'TEMPORARILY_UNAVAILABLE');
    return null;
  }

  async function createInternal(principal, key, input) {
    requireActor(identityService, principal, 'candidate.attempt.read');
    if (!IdempotencyKeySchema.safeParse(key).success) reject(422, 'VALIDATION_ERROR');
    const parsedRequest = CreateAttemptSchema.safeParse(input);
    if (!parsedRequest.success) reject(422, 'VALIDATION_ERROR');
    const request = parsedRequest.data;
    const requestHash = jsonDigest(request);
    const prior = await runReceipt(principal, key, requestHash);
    if (prior) {
      if (prior.status === 'REPLAY') return success(prior.receipt, true);
      if (prior.status === 'ERROR') failCommand(prior.code, prior);
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
    if (request.mode === 'PUBLISHED_FIXED' || request.reuseMode === 'REVIEW_ALLOWED') {
      // H1 and retained receipts apply globally, including modes whose actual
      // allocation path is not implemented by this standalone NEW_ONLY slice.
      for (let attempt = 0; attempt < MAX_REPLAN_ATTEMPTS; attempt += 1) {
        let checked;
        try { checked = await runCheck(principal, key, requestHash, null); }
        catch (error) {
          if (isRetryableTransactionConflict(error)) continue;
          throw error;
        }
        const replay = await handlePreflight(checked);
        if (replay) return replay;
        reject(503, 'TEMPORARILY_UNAVAILABLE');
      }
      reject(409, 'CONCURRENT_MODIFICATION');
    }
    const blueprintVersionId = request.blueprintVersionId;

    for (let attempt = 0; attempt < MAX_REPLAN_ATTEMPTS; attempt += 1) {
      let preflight;
      try {
        preflight = await runCheck(principal, key, requestHash, blueprintVersionId);
      } catch (error) {
        if (isRetryableTransactionConflict(error)) continue;
        throw error;
      }
      const preflightResult = await handlePreflight(preflight, blueprintVersionId);
      if (preflightResult) return preflightResult;

      let committed;
      let plan;
      try {
        const captured = await captureStandaloneManifest({
          examPool,
          identityService,
          principal,
          blueprintVersionId,
          seed: randomSeed(),
          limits: fixedLimits,
        });
        plan = await buildAllocationPlan(examPool, principal, captured);
        committed = await runCommit(principal, key, requestHash, plan);
      } catch (error) {
        if (isRetryableTransactionConflict(error)) continue;
        if (!isActiveAttemptConstraint(error) && error?.code !== '23514') throw error;
        let afterConflict;
        try {
          afterConflict = await runCheck(principal, key, requestHash, blueprintVersionId);
        } catch (checkError) {
          if (isRetryableTransactionConflict(checkError)) continue;
          throw checkError;
        }
        const checked = await handlePreflight(afterConflict, blueprintVersionId);
        if (checked) return checked;
        if (error?.code === '23514') reject(503, 'TEMPORARILY_UNAVAILABLE');
        continue;
      }
      if (committed.status === 'CREATED') return success(committed.receipt, false);
      if (committed.status === 'REPLAY') return success(committed.receipt, true);
      if (committed.status === 'ACTIVE') failCommand('CONCURRENT_ATTEMPT_EXISTS', committed, blueprintVersionId);
      if (committed.status === 'FAILURE') {
        failCommand(committed.code, {
          ...committed,
          sectionDeficits: sectionDeficitsForFailure(committed.code, plan.manifest),
        }, blueprintVersionId);
      }
      if (committed.status === 'ERROR') failCommand(committed.code, committed, blueprintVersionId);
      if (committed.status === 'STALE') continue;
      if (committed.status === 'RECONCILE') {
        let reconciled;
        try {
          reconciled = await runCheck(principal, key, requestHash, blueprintVersionId);
        } catch (error) {
          if (isRetryableTransactionConflict(error)) continue;
          throw error;
        }
        const reconciledResult = await handlePreflight(reconciled, blueprintVersionId);
        if (reconciledResult) return reconciledResult;
        continue;
      }
      reject(503, 'TEMPORARILY_UNAVAILABLE');
    }
    reject(409, 'CONCURRENT_MODIFICATION');
  }

  async function create(principal, key, input) {
    try {
      return await createInternal(principal, key, input);
    } catch (error) {
      if (isPostgresError(error)) mapPostgresError(error);
      throw error;
    }
  }

  return Object.freeze({ create });
}
