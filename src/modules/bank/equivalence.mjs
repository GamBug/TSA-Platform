import { randomUUID } from 'node:crypto';
import { resolveOriginalImportAttribution } from './import-attribution.mjs';
import {
  HASH_PATTERN,
  UUID_PATTERN,
  assertBankConnection,
  reject,
  requireActor,
  strictRecord,
  validateIdempotencyKey,
  withIdempotency,
} from './common.mjs';
import {
  appendWorkflowAudit,
  assertIndependentReviewer,
  loadWorkflowTarget,
  validateWorkflowTarget,
} from './publication-gates.mjs';
import { recordEquivalenceIncidents } from './equivalence-incidents.mjs';
import { withTransaction } from '../database/pool.mjs';

const INPUT_KEYS = ['left', 'right', 'kind', 'decision', 'expectedBankRevision', 'reason'];
const VERSION_PIN_KEYS = ['versionId', 'contentHash', 'expectedRevision'];
const MAX_REASON_LENGTH = 4_096;
const MAX_PG_BIGINT = 9_223_372_036_854_775_807n;
const EQUIVALENCE_KINDS = new Set(['EXACT', 'NEAR_DUPLICATE']);
const DECISIONS = new Set(['CONFIRMED', 'DISMISSED']);

function requireAuthenticated(principal) {
  if (!principal?.authenticated) reject(401, 'UNAUTHENTICATED');
  if (typeof principal.userId !== 'string' || !UUID_PATTERN.test(principal.userId)) reject(403, 'FORBIDDEN');
}

function requireReviewer(identityService, principal) {
  requireActor(identityService, principal, 'bank.question.read');
  if (!Array.isArray(principal.roles) || !principal.roles.includes('REVIEWER')) reject(403, 'FORBIDDEN');
}

function validateRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) reject(422, 'VALIDATION_ERROR');
  return value;
}

function validateVersionPin(value) {
  strictRecord(value, VERSION_PIN_KEYS, 'equivalence version pin');
  if (typeof value.versionId !== 'string' || !UUID_PATTERN.test(value.versionId)
      || typeof value.contentHash !== 'string' || !HASH_PATTERN.test(value.contentHash)) {
    reject(422, 'VALIDATION_ERROR');
  }
  validateRevision(value.expectedRevision);
  return value;
}

function validateInput(input) {
  strictRecord(input, INPUT_KEYS, 'equivalence input');
  validateVersionPin(input.left);
  validateVersionPin(input.right);
  if (input.left.versionId === input.right.versionId
      || !EQUIVALENCE_KINDS.has(input.kind) || !DECISIONS.has(input.decision)) {
    reject(422, 'VALIDATION_ERROR');
  }
  if (typeof input.expectedBankRevision !== 'string' || input.expectedBankRevision.length > 19
      || !/^(0|[1-9][0-9]*)$/.test(input.expectedBankRevision)
      || BigInt(input.expectedBankRevision) > MAX_PG_BIGINT) reject(422, 'VALIDATION_ERROR');
  if (typeof input.reason !== 'string' || input.reason.trim().length === 0
      || input.reason.length > MAX_REASON_LENGTH) reject(422, 'VALIDATION_ERROR');
  return input;
}

function sortPins(pins) {
  return [...pins].sort((left, right) => left.versionId < right.versionId ? -1
    : left.versionId > right.versionId ? 1 : 0);
}

async function loadTargets(client, input) {
  const targets = new Map();
  for (const pin of sortPins([input.left, input.right])) {
    targets.set(pin.versionId, await resolveOriginalImportAttribution(client, await loadWorkflowTarget(client, pin.versionId)));
  }
  const left = targets.get(input.left.versionId);
  const right = targets.get(input.right.versionId);
  if (left.question_id === right.question_id) reject(422, 'VALIDATION_ERROR');
  return { left, right };
}

function authorizePair(identityService, principal, targets) {
  assertIndependentReviewer(identityService, principal, targets.left);
  assertIndependentReviewer(identityService, principal, targets.right);
}

async function authorizeBeforeReplay(bankPool, identityService, principal, input) {
  requireReviewer(identityService, principal);
  return withTransaction(bankPool, async (client) => {
    const targets = await loadTargets(client, input);
    authorizePair(identityService, principal, targets);
  }, { role: 'tsa_bank' });
}

function validateTargetPin(target, pin) {
  if (target.content_hash !== pin.contentHash) reject(409, 'CONTENT_HASH_MISMATCH');
  if (target.revision !== pin.expectedRevision) reject(409, 'REVISION_CONFLICT');
  if (!['IN_REVIEW', 'APPROVED'].includes(target.state)) reject(409, 'INVALID_WORKFLOW_TRANSITION');
}

async function assertExactBankRevision(client, expectedRevision) {
  const result = await client.query('SELECT eligibility_revision::text AS revision FROM tsa.bank_state WHERE id=1');
  if (result.rowCount !== 1) throw new Error('Bank revision guard is unavailable');
  if (result.rows[0].revision !== expectedRevision) reject(409, 'REVISION_CONFLICT');
}

async function resolveRelation(client, targets, input, principal) {
  const [leftVersionId, rightVersionId] = [targets.left.id, targets.right.id].sort();
  const existing = await client.query(
    `SELECT id, resolution::text AS resolution
       FROM tsa.duplicate_relations
      WHERE left_version_id=$1 AND right_version_id=$2 AND kind=$3::tsa.duplicate_kind
      FOR UPDATE`, [leftVersionId, rightVersionId, input.kind]);

  let relationId;
  if (existing.rowCount === 0) {
    relationId = randomUUID();
    await client.query(
      `INSERT INTO tsa.duplicate_relations
         (id, left_version_id, right_version_id, kind, evidence, resolution, detector_version)
       VALUES ($1,$2,$3,$4::tsa.duplicate_kind,$5::jsonb,'OPEN','human-equivalence/1')`,
      [relationId, leftVersionId, rightVersionId, input.kind, JSON.stringify({ syntheticWorkflow: true })]);
  } else {
    relationId = existing.rows[0].id;
    if (existing.rows[0].resolution !== 'OPEN') reject(409, 'INVALID_WORKFLOW_TRANSITION');
  }

  const resolutionEvidence = {
    reason: input.reason,
    leftVersionId: targets.left.id,
    leftContentHash: targets.left.content_hash,
    rightVersionId: targets.right.id,
    rightContentHash: targets.right.content_hash,
    reviewerId: principal.userId,
  };
  const updated = await client.query(
    `UPDATE tsa.duplicate_relations
        SET resolution=$2::tsa.duplicate_resolution, resolved_by=$3, resolution_evidence=$4::jsonb
      WHERE id=$1 AND resolution='OPEN'
      RETURNING id`,
    [relationId, input.decision, principal.userId, JSON.stringify(resolutionEvidence)]);
  if (updated.rowCount !== 1) reject(409, 'INVALID_WORKFLOW_TRANSITION');
  return relationId;
}

async function lockCanonicalGroups(client, targets, principal, reason) {
  const questionIds = [targets.left.question_id, targets.right.question_id].sort();
  const current = await client.query(
    `SELECT gm.question_id, gm.group_id, dg.merged_into_id
       FROM tsa.duplicate_group_members gm
       JOIN tsa.duplicate_groups dg ON dg.id=gm.group_id
      WHERE gm.question_id=ANY($1::uuid[])
      ORDER BY gm.question_id, gm.group_id
      FOR UPDATE OF gm, dg`, [questionIds]);
  const groups = new Map(current.rows.map((row) => [row.question_id, row]));
  const assigned = new Map();
  for (const questionId of questionIds) {
    const row = groups.get(questionId);
    if (row) {
      if (row.merged_into_id !== null) reject(422, 'CONSTRAINT_CONFLICT');
      assigned.set(questionId, row.group_id);
      continue;
    }
    const groupId = randomUUID();
    await client.query(
      'INSERT INTO tsa.duplicate_groups (id, reason, confirmed_by) VALUES ($1,$2,$3)',
      [groupId, reason, principal.userId]);
    await client.query(
      'INSERT INTO tsa.duplicate_group_members (group_id, question_id) VALUES ($1,$2)',
      [groupId, questionId]);
    assigned.set(questionId, groupId);
  }
  return assigned;
}

async function mergeGroups(client, targets, principal, reason) {
  const groups = await lockCanonicalGroups(client, targets, principal, reason);
  const leftGroupId = groups.get(targets.left.question_id);
  const rightGroupId = groups.get(targets.right.question_id);
  if (leftGroupId === rightGroupId) return { canonicalGroupId: leftGroupId, retiredGroupId: null, incidentId: null };

  const [canonicalGroupId, retiredGroupId] = [leftGroupId, rightGroupId].sort();
  const incident = await recordEquivalenceIncidents(client, { canonicalGroupId, retiredGroupId, actorId: principal.userId });
  const alias = await client.query(
    `UPDATE tsa.duplicate_groups SET merged_into_id=$2
      WHERE id=$1 AND merged_into_id IS NULL RETURNING id`, [retiredGroupId, canonicalGroupId]);
  if (alias.rowCount !== 1) reject(422, 'CONSTRAINT_CONFLICT');
  await client.query(
    'UPDATE tsa.duplicate_group_members SET group_id=$2 WHERE group_id=$1', [retiredGroupId, canonicalGroupId]);
  return { canonicalGroupId, retiredGroupId, incidentId: incident?.incidentId ?? null };
}

async function bumpTargetRevision(client, target) {
  const result = await client.query(
    `UPDATE tsa.question_workflow SET revision=revision+1, updated_at=clock_timestamp()
      WHERE question_version_id=$1 AND revision=$2 AND state IN ('IN_REVIEW','APPROVED')
      RETURNING revision`, [target.id, target.revision]);
  if (result.rowCount !== 1) reject(409, 'REVISION_CONFLICT');
  const revision = Number(result.rows[0].revision);
  if (!Number.isSafeInteger(revision)) throw new Error('Bank workflow revision is outside the supported integer range');
  return revision;
}

async function adjudicate(bankPool, identityService, principal, key, input) {
  requireAuthenticated(principal);
  if (!validateIdempotencyKey(key)) reject(422, 'VALIDATION_ERROR');
  validateInput(input);
  await authorizeBeforeReplay(bankPool, identityService, principal, input);

  return withIdempotency(bankPool, principal, key, 'POST /internal/bank/equivalence', input,
    async (client) => {
      requireReviewer(identityService, principal);
      await assertExactBankRevision(client, input.expectedBankRevision);
      const targets = await loadTargets(client, input);
      authorizePair(identityService, principal, targets);
      validateTargetPin(targets.left, input.left);
      validateTargetPin(targets.right, input.right);
      await validateWorkflowTarget(client, targets.left);
      await validateWorkflowTarget(client, targets.right);

      await resolveRelation(client, targets, input, principal);
      let canonicalGroupId = null;
      let retiredGroupId = null;
      let incidentId = null;
      if (input.decision === 'CONFIRMED') {
        ({ canonicalGroupId, retiredGroupId, incidentId } = await mergeGroups(
          client, targets, principal, input.reason));
      }

      const leftRevision = await bumpTargetRevision(client, targets.left);
      const rightRevision = await bumpTargetRevision(client, targets.right);
      const action = input.decision === 'CONFIRMED'
        ? 'BANK_EQUIVALENCE_CONFIRMED' : 'BANK_EQUIVALENCE_DISMISSED';
      await appendWorkflowAudit(client, principal, targets.left, action, leftRevision, input.reason);
      await appendWorkflowAudit(client, principal, targets.right, action, rightRevision, input.reason);
      const bank = await client.query(
        `UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1, updated_at=clock_timestamp()
          WHERE id=1 RETURNING eligibility_revision::text AS revision`);
      if (bank.rowCount !== 1) throw new Error('Bank revision guard is unavailable');

      const body = {
        leftVersionId: targets.left.id,
        rightVersionId: targets.right.id,
        decision: input.decision,
        canonicalGroupId,
        retiredGroupId,
        bankRevision: bank.rows[0].revision,
        incidentRecorded: incidentId !== null,
      };
      return { status: 200, body, resourceId: targets.left.id };
    });
}

export async function createEquivalenceService({ bankPool, identityService }) {
  if (!bankPool || !identityService || typeof identityService.mayPerform !== 'function') {
    throw new TypeError('Bank pool and identity service are required');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Bank equivalence adjudication is disabled in production');
  }
  await assertBankConnection(bankPool);
  return Object.freeze({ adjudicate: (principal, key, input) =>
    adjudicate(bankPool, identityService, principal, key, input) });
}
