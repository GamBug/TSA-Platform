import { randomUUID } from 'node:crypto';
import {
  HASH_PATTERN,
  UUID_PATTERN,
  assertBankConnection,
  reject,
  requireActor,
  strictRecord,
  withIdempotency,
} from './common.mjs';
import {
  appendWorkflowAudit,
  assertIndependentReviewer,
  assertPublicationGates,
  assertSingletonAllowed,
  loadWorkflowTarget,
  quarantineSelectedForms,
  validateWorkflowTarget,
} from './publication-gates.mjs';
import { withTransaction } from '../database/pool.mjs';

const RUBRIC_KEYS = ['correctness', 'unambiguous', 'relevant', 'language', 'explanation', 'rights'];
const REVIEW_KEYS = ['expectedRevision', 'contentHash', 'decision', 'rubric', 'reason'];
const EXPECTED_REVISION_KEYS = ['expectedRevision'];
const QUARANTINE_KEYS = ['expectedRevision', 'reason'];
const SINGLETON_KEYS = ['expectedRevision', 'contentHash', 'reason'];
const MAX_REASON_LENGTH = 4_096;

function validateRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) reject(422, 'VALIDATION_ERROR');
  return value;
}

function validateReason(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_REASON_LENGTH) {
    reject(422, 'VALIDATION_ERROR');
  }
  return value;
}

function validateVersionId(versionId) {
  if (typeof versionId !== 'string' || !UUID_PATTERN.test(versionId)) reject(404, 'NOT_FOUND');
  return versionId;
}

function requireAuthenticated(principal) {
  if (!principal?.authenticated) reject(401, 'UNAUTHENTICATED');
  if (typeof principal.userId !== 'string' || !UUID_PATTERN.test(principal.userId)) reject(403, 'FORBIDDEN');
}

function assertCurrentRevision(target, expectedRevision) {
  if (!Number.isSafeInteger(target.revision) || target.revision < 1) {
    throw new Error('Bank workflow revision is outside the supported integer range');
  }
  if (target.revision !== expectedRevision) reject(409, 'REVISION_CONFLICT');
}

function assertState(target, state) {
  if (target.state !== state) reject(409, 'INVALID_WORKFLOW_TRANSITION');
}

function requireBankManager(identityService, principal) {
  requireAuthenticated(principal);
  if (!identityService.mayPerform(principal, 'bank.question.read')
      || !principal.roles.includes('BANK_MANAGER')) reject(403, 'FORBIDDEN');
}

async function authorizeIndependentReviewer(bankPool, identityService, principal, versionId) {
  // Reject unsupported or forged staff roles before looking up private targets.
  requireActor(identityService, principal, 'bank.question.read');
  if (!Array.isArray(principal.roles) || !principal.roles.includes('REVIEWER')) reject(403, 'FORBIDDEN');
  return withTransaction(bankPool, async (client) => {
    const target = await loadWorkflowTarget(client, versionId);
    if (!target) reject(404, 'NOT_FOUND');
    assertIndependentReviewer(identityService, principal, target);
    return target;
  }, { role: 'tsa_bank' });
}

function reviewInput(input) {
  strictRecord(input, REVIEW_KEYS, 'review input');
  validateRevision(input.expectedRevision);
  if (typeof input.contentHash !== 'string' || !HASH_PATTERN.test(input.contentHash)
      || !['APPROVE', 'REJECT'].includes(input.decision)) reject(422, 'VALIDATION_ERROR');
  strictRecord(input.rubric, RUBRIC_KEYS, 'review rubric');
  if (RUBRIC_KEYS.some((key) => typeof input.rubric[key] !== 'boolean')) reject(422, 'VALIDATION_ERROR');
  validateReason(input.reason);
  return input;
}

function idempotentResult(status, body, resourceId) {
  return { status, body, ...(resourceId ? { resourceId } : {}) };
}

async function appendImmutableValidation(client, principal, target) {
  await client.query(
    `INSERT INTO tsa.validation_runs
       (id, question_version_id, input_hash, validator_version, kind, outcome, evidence, actor)
     VALUES ($1, $2, $3, 'bank-immutable/1', 'BANK_IMMUTABLE', 'PASS', $4::jsonb, $5)`,
    [randomUUID(), target.id, target.content_hash,
      JSON.stringify({ syntheticWorkflow: true }), principal.userId]);
}

async function submitReview(bankPool, identityService, principal, versionId, key, input) {
  requireActor(identityService, principal, 'bank.question.author');
  validateVersionId(versionId);
  strictRecord(input, EXPECTED_REVISION_KEYS, 'submit review input');
  validateRevision(input.expectedRevision);

  return withIdempotency(bankPool, principal, key,
    `POST /api/v1/question-versions/${versionId}/submit-review`, input,
    async (client) => {
      const target = await loadWorkflowTarget(client, versionId);
      if (!target) reject(404, 'NOT_FOUND');
      if (target.created_by !== principal.userId) reject(403, 'FORBIDDEN');
      assertCurrentRevision(target, input.expectedRevision);
      if (!['DRAFT', 'QUARANTINED'].includes(target.state)) reject(409, 'INVALID_WORKFLOW_TRANSITION');

      await validateWorkflowTarget(client, target);
      await appendImmutableValidation(client, principal, target);
      const changed = await client.query(
        `UPDATE tsa.question_workflow
            SET state = 'IN_REVIEW', revision = revision + 1,
                approved_review_id = NULL, quarantine_reason = NULL,
                updated_at = clock_timestamp()
          WHERE question_version_id = $1 AND revision = $2
            AND state IN ('DRAFT', 'QUARANTINED')
          RETURNING revision`, [versionId, input.expectedRevision]);
      if (changed.rowCount !== 1) reject(409, 'REVISION_CONFLICT');
      const revision = Number(changed.rows[0].revision);
      await appendWorkflowAudit(client, principal, target, 'BANK_SUBMIT_REVIEW', revision, null);
      const body = { versionId, state: 'IN_REVIEW', revision };
      return idempotentResult(200, body, versionId);
    });
}

async function review(bankPool, identityService, fixtureScopeId, principal, versionId, key, input) {
  requireAuthenticated(principal);
  validateVersionId(versionId);
  reviewInput(input);
  await authorizeIndependentReviewer(bankPool, identityService, principal, versionId);

  return withIdempotency(bankPool, principal, key,
    `POST /api/v1/question-versions/${versionId}/reviews`, input,
    async (client) => {
      const target = await loadWorkflowTarget(client, versionId);
      if (!target) reject(404, 'NOT_FOUND');
      assertIndependentReviewer(identityService, principal, target);
      assertCurrentRevision(target, input.expectedRevision);
      assertState(target, 'IN_REVIEW');
      if (target.content_hash !== input.contentHash) reject(409, 'CONTENT_HASH_MISMATCH');

      if (input.decision === 'APPROVE') {
        if (RUBRIC_KEYS.some((key) => input.rubric[key] !== true)) reject(422, 'REVIEW_RUBRIC_INCOMPLETE');
        await assertPublicationGates(client, target, principal, fixtureScopeId);
      }

      const reviewId = randomUUID();
      await client.query(
        `INSERT INTO tsa.reviews
           (id, question_version_id, content_hash, reviewer_id, decision, rubric, reason)
         VALUES ($1, $2, $3, $4, $5::tsa.review_decision, $6::jsonb, $7)`,
        [reviewId, versionId, input.contentHash, principal.userId, input.decision,
          JSON.stringify(input.rubric), input.reason]);

      const state = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const changed = await client.query(
        `UPDATE tsa.question_workflow
            SET state = $3::tsa.workflow_state, revision = revision + 1,
                approved_review_id = $4, quarantine_reason = NULL,
                updated_at = clock_timestamp()
          WHERE question_version_id = $1 AND revision = $2 AND state = 'IN_REVIEW'
          RETURNING revision`,
        [versionId, input.expectedRevision, state, state === 'APPROVED' ? reviewId : null]);
      if (changed.rowCount !== 1) reject(409, 'REVISION_CONFLICT');
      const revision = Number(changed.rows[0].revision);

      if (state === 'APPROVED') {
        await client.query('UPDATE tsa.questions SET eligible_version_id = $2 WHERE id = $1',
          [target.question_id, versionId]);
        await client.query(
          'UPDATE tsa.bank_state SET eligibility_revision = eligibility_revision + 1, updated_at = clock_timestamp() WHERE id = 1');
      } else {
        const cleared = await client.query(
          `UPDATE tsa.questions SET eligible_version_id = NULL
            WHERE id = $1 AND eligible_version_id = $2`, [target.question_id, versionId]);
        if (cleared.rowCount === 1) {
          await client.query(
            'UPDATE tsa.bank_state SET eligibility_revision = eligibility_revision + 1, updated_at = clock_timestamp() WHERE id = 1');
        }
      }

      await appendWorkflowAudit(client, principal, target,
        state === 'APPROVED' ? 'BANK_REVIEW_APPROVE' : 'BANK_REVIEW_REJECT', revision, input.reason);
      const body = { reviewId, state, revision };
      return idempotentResult(201, body, reviewId);
    });
}

async function quarantine(bankPool, identityService, principal, versionId, key, input) {
  requireBankManager(identityService, principal);
  validateVersionId(versionId);
  strictRecord(input, QUARANTINE_KEYS, 'quarantine input');
  validateRevision(input.expectedRevision);
  validateReason(input.reason);

  return withIdempotency(bankPool, principal, key,
    `POST /api/v1/question-versions/${versionId}/quarantine`, input,
    async (client) => {
      const target = await loadWorkflowTarget(client, versionId);
      if (!target) reject(404, 'NOT_FOUND');
      requireBankManager(identityService, principal);
      assertCurrentRevision(target, input.expectedRevision);
      if (!['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(target.state)) reject(409, 'INVALID_WORKFLOW_TRANSITION');

      await quarantineSelectedForms(client, target, input.reason);
      const changed = await client.query(
        `UPDATE tsa.question_workflow
            SET state = 'QUARANTINED', revision = revision + 1,
                approved_review_id = NULL, quarantine_reason = $3,
                updated_at = clock_timestamp()
          WHERE question_version_id = $1 AND revision = $2
            AND state IN ('DRAFT', 'IN_REVIEW', 'APPROVED')
          RETURNING revision`, [versionId, input.expectedRevision, input.reason]);
      if (changed.rowCount !== 1) reject(409, 'REVISION_CONFLICT');
      const revision = Number(changed.rows[0].revision);
      await client.query(
        'UPDATE tsa.questions SET eligible_version_id = NULL WHERE id = $1 AND eligible_version_id = $2',
        [target.question_id, versionId]);
      await client.query(
        'UPDATE tsa.bank_state SET eligibility_revision = eligibility_revision + 1, updated_at = clock_timestamp() WHERE id = 1');
      await appendWorkflowAudit(client, principal, target, 'BANK_QUARANTINE', revision, input.reason);
      const body = { state: 'QUARANTINED', revision };
      return idempotentResult(200, body, versionId);
    });
}

async function confirmSingleton(bankPool, identityService, principal, versionId, key, input) {
  requireAuthenticated(principal);
  validateVersionId(versionId);
  strictRecord(input, SINGLETON_KEYS, 'singleton input');
  validateRevision(input.expectedRevision);
  if (typeof input.contentHash !== 'string' || !HASH_PATTERN.test(input.contentHash)) reject(422, 'VALIDATION_ERROR');
  validateReason(input.reason);
  await authorizeIndependentReviewer(bankPool, identityService, principal, versionId);

  return withIdempotency(bankPool, principal, key,
    `POST /api/v1/question-versions/${versionId}/confirm-singleton`, input,
    async (client) => {
      const target = await loadWorkflowTarget(client, versionId);
      if (!target) reject(404, 'NOT_FOUND');
      assertIndependentReviewer(identityService, principal, target);
      assertCurrentRevision(target, input.expectedRevision);
      assertState(target, 'IN_REVIEW');
      if (target.content_hash !== input.contentHash) reject(409, 'CONTENT_HASH_MISMATCH');

      const existing = await client.query(
        `SELECT gm.group_id
           FROM tsa.duplicate_group_members gm
          WHERE gm.question_id = $1`, [target.question_id]);
      await assertSingletonAllowed(client, target);
      let groupId;
      let created = false;
      if (existing.rowCount === 0) {
        groupId = randomUUID();
        await client.query(
          `INSERT INTO tsa.duplicate_groups (id, reason, confirmed_by)
           VALUES ($1, $2, $3)`, [groupId, input.reason, principal.userId]);
        await client.query(
          `INSERT INTO tsa.duplicate_group_members (group_id, question_id)
           VALUES ($1, $2)`, [groupId, target.question_id]);
        await client.query(
          'UPDATE tsa.bank_state SET eligibility_revision = eligibility_revision + 1, updated_at = clock_timestamp() WHERE id = 1');
        created = true;
      } else {
        groupId = existing.rows[0].group_id;
      }

      await appendWorkflowAudit(client, principal, target, 'BANK_CONFIRM_SINGLETON', target.revision, input.reason);
      const body = { versionId, questionId: target.question_id, groupId, revision: target.revision, created };
      return idempotentResult(200, body, versionId);
    });
}

export async function createPublicationService({ bankPool, identityService, fixtureScopeId = null }) {
  if (!bankPool || !identityService || typeof identityService.mayPerform !== 'function') {
    throw new TypeError('Bank pool and identity service are required');
  }
  if (fixtureScopeId !== null && (typeof fixtureScopeId !== 'string' || !UUID_PATTERN.test(fixtureScopeId))) {
    throw new TypeError('Fixture scope ID must be a canonical UUID or null');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Bank publication service is disabled in production');
  }
  await assertBankConnection(bankPool);

  return Object.freeze({
    submitReview: (principal, versionId, key, input) =>
      submitReview(bankPool, identityService, principal, versionId, key, input),
    review: (principal, versionId, key, input) =>
      review(bankPool, identityService, fixtureScopeId, principal, versionId, key, input),
    quarantine: (principal, versionId, key, input) =>
      quarantine(bankPool, identityService, principal, versionId, key, input),
    confirmSingleton: (principal, versionId, key, input) =>
      confirmSingleton(bankPool, identityService, principal, versionId, key, input),
  });
}
