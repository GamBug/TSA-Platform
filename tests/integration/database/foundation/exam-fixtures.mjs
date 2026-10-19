import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../../../../src/modules/database/pool.mjs';

export const HASH_A = `sha256:${'a'.repeat(64)}`;
export const HASH_B = `sha256:${'b'.repeat(64)}`;

const prompt = [{ type: 'text', text: 'Synthetic question prompt' }];
const stimulusContent = [{ type: 'text', text: 'Synthetic shared stimulus' }];
const interaction = {
  type: 'SINGLE_CHOICE',
  options: [
    { id: 'a', content: [{ type: 'text', text: 'First option' }] },
    { id: 'b', content: [{ type: 'text', text: 'Second option' }] },
  ],
};
const answerKey = { type: 'SINGLE_CHOICE', optionId: 'b' };
const explanation = [{ type: 'text', text: 'Synthetic private explanation' }];

export async function seedExamFoundation(pool) {
  const actorId = randomUUID();
  const taxonomyVersionId = randomUUID();
  const domainId = randomUUID();
  const questionId = randomUUID();
  const questionVersionId = randomUUID();
  const stimulusId = randomUUID();
  const stimulusVersionId = randomUUID();
  const blueprintId = randomUUID();
  const blueprintVersionId = randomUUID();
  const authoredCreatedAt = '2026-10-19T12:34:56.789+07:00';
  const blueprintConfig = {
    schemaVersion: 'blueprint/1',
    name: 'Synthetic one-slot exam fixture',
    taxonomyVersionId,
    profileKind: 'INDEPENDENT_PRACTICE',
    evidenceIds: ['synthetic-evidence'],
    sections: [{ id: 'math-main', section: 'MATH', count: 1, durationSeconds: 600 }],
    allowedTypes: ['SINGLE_CHOICE'],
    quotas: [],
    maxPerSource: null,
    excludedQuestionIds: [],
    bundlePolicy: 'ALL_OR_NONE',
    scoringPolicy: 'practice-binary-v1',
    releasePolicy: 'after-grade-v1',
  };

  await query(pool,
    `INSERT INTO tsa.users (id, issuer, subject, display_name)
     VALUES ($1, 'synthetic', $2, 'Synthetic exam actor')`, [actorId, actorId]);
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO tsa.taxonomy_versions (id, name, version_no, definition_hash)
       VALUES ($1, 'synthetic exam taxonomy', 1, $2)`, [taxonomyVersionId, HASH_A]);
    await client.query(
      `INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind)
       VALUES ($1, $2, 'math-domain', 'DOMAIN')`, [domainId, taxonomyVersionId]);
  });

  await query(pool,
    `INSERT INTO tsa.stimuli (id) VALUES ($1)`, [stimulusId]);
  await query(pool,
    `INSERT INTO tsa.stimulus_versions (id, stimulus_id, version_no, content, content_hash)
     VALUES ($1, $2, 1, $3::jsonb, $4)`,
    [stimulusVersionId, stimulusId, JSON.stringify(stimulusContent), HASH_A]);
  await query(pool, `INSERT INTO tsa.questions (id) VALUES ($1)`, [questionId]);
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO tsa.question_versions
        (id, question_id, version_no, schema_version, language, section, taxonomy_version_id,
         domain_id, skill_ids, subskill_ids, cognitive_level, difficulty, content,
         stimulus_version_id, interaction, origin, provenance_ids, created_by, created_at,
         content_hash, normalized_fingerprint, authored_created_at)
       VALUES ($1, $2, 1, 'question/1', 'vi-VN', 'MATH', $3, 'math-domain', '[]', '[]',
         'M1', '{"target":"EASY","predicted":null,"empiricalStudyId":null}', $4::jsonb,
         $5, $6::jsonb, 'MANUAL', '["synthetic-provenance"]', 'synthetic-author',
         $7::timestamptz, $8, $9, $10)`,
      [questionVersionId, questionId, taxonomyVersionId, JSON.stringify(prompt), stimulusVersionId,
        JSON.stringify(interaction), authoredCreatedAt, HASH_A, HASH_B, authoredCreatedAt]);
    await client.query(
      `INSERT INTO tsa_private.question_secrets
        (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
       VALUES ($1, $2::jsonb, $3::jsonb, 'practice-binary-v1', '["synthetic-evidence"]'::jsonb)`,
      [questionVersionId, JSON.stringify(answerKey), JSON.stringify(explanation)]);
  });

  await query(pool, `INSERT INTO tsa.blueprints (id, name) VALUES ($1, 'Synthetic exam blueprint')`, [blueprintId]);
  await query(pool,
    `INSERT INTO tsa.blueprint_versions
      (id, blueprint_id, taxonomy_version_id, version_no, schema_version, config, content_hash)
     VALUES ($1, $2, $3, 1, 'blueprint/1', $4::jsonb, $5)`,
    [blueprintVersionId, blueprintId, taxonomyVersionId, JSON.stringify(blueprintConfig), HASH_A]);

  return {
    actorId, taxonomyVersionId, questionId, questionVersionId,
    stimulusId, stimulusVersionId, stimulusContent, prompt, interaction,
    answerKey, explanation, authoredCreatedAt, blueprintId, blueprintVersionId,
    blueprintConfig,
  };
}

export async function createForm(pool, seeded, {
  mode = 'PUBLISHED_FIXED', ownerUserId = null,
  publicSnapshotMutator = (snapshot) => snapshot,
  secretMutator = (secret) => secret,
  sectionCount = 1,
  omitChildren = false,
  questionVersionId = seeded.questionVersionId,
  assemblyBlueprintVersionId = seeded.blueprintVersionId,
  assemblyRunUserId = ownerUserId,
} = {}) {
  const formId = randomUUID();
  const assemblyRunId = randomUUID();
  const slotId = randomUUID();
  const reuseMode = mode === 'PUBLISHED_FIXED' ? 'FIXED_AS_PUBLISHED' : 'NEW_ONLY';
  if (mode === 'PERSONALIZED_PRACTICE') {
    const now = new Date();
    await query(pool,
      `INSERT INTO tsa.blueprint_offerings
       (blueprint_version_id, enabled, available_from, available_until, start_ttl_seconds)
       VALUES ($1, true, $2, $3, 600)
       ON CONFLICT (blueprint_version_id) DO NOTHING`,
      [seeded.blueprintVersionId, new Date(now.getTime() - 60_000), new Date(now.getTime() + 3_600_000)]);
  }
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO tsa.assembly_runs
        (id, blueprint_version_id, user_id, form_mode, reuse_mode, history_revision, bank_revision,
         request_hash, seed, algorithm_version, limits, manifest, manifest_hash, outcome)
       VALUES ($1, $2, $3, $4::tsa.form_mode, $5::tsa.reuse_mode, 0, 'synthetic-bank/1', $6,
         1, 'assembly/1', '{}'::jsonb, '{"schemaVersion":"assembly/1"}'::jsonb, $7, 'SUCCESS')`,
      [assemblyRunId, assemblyBlueprintVersionId, assemblyRunUserId, mode, reuseMode, HASH_A, HASH_B]);
    await client.query(
      `INSERT INTO tsa.forms
        (id, assembly_run_id, blueprint_version_id, mode, owner_user_id, content_hash, policy_versions, sealed_at)
       VALUES ($1, $2, $3, $4::tsa.form_mode, $5, $6, '{"scoring":"practice-binary-v1"}'::jsonb, clock_timestamp())`,
      [formId, assemblyRunId, seeded.blueprintVersionId, mode, ownerUserId, HASH_A]);
    if (!omitChildren) {
      await client.query(
        `INSERT INTO tsa.form_sections (form_id, section_id, section, ordinal, duration_seconds, question_count)
         VALUES ($1, 'math-main', 'MATH', 0, 600, $2)`, [formId, sectionCount]);
      const publicSnapshot = publicSnapshotMutator({
        slotId, sectionId: 'math-main', ordinal: 1,
        stimulus: { id: seeded.stimulusId, content: seeded.stimulusContent },
        content: seeded.prompt, interaction: seeded.interaction,
      });
      await client.query(
        `INSERT INTO tsa.form_slots
          (form_id, slot_id, section_id, ordinal, question_id, question_version_id,
           public_snapshot, snapshot_hash)
         VALUES ($1, $2, 'math-main', 1, $3, $4, $5::jsonb, $6)`,
        [formId, slotId, seeded.questionId, questionVersionId, JSON.stringify(publicSnapshot), HASH_B]);
      const privateSnapshot = secretMutator({
        key_snapshot: seeded.answerKey,
        explanation_snapshot: seeded.explanation,
        policy_version: 'practice-binary-v1',
      });
      await client.query(
        `INSERT INTO tsa_private.form_slot_secrets
          (form_id, slot_id, key_snapshot, explanation_snapshot, policy_version, secret_hash)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
        [formId, slotId, JSON.stringify(privateSnapshot.key_snapshot),
          JSON.stringify(privateSnapshot.explanation_snapshot), privateSnapshot.policy_version, HASH_A]);
    }
  });
  const now = new Date();
  await query(pool,
    `INSERT INTO tsa.form_availability (form_id, available_from, available_until)
     VALUES ($1, $2, $3)`, [formId, new Date(now.getTime() - 60_000), new Date(now.getTime() + 3_600_000)]);
  return { formId, assemblyRunId, slotId, mode, ownerUserId };
}

export async function createCorrectedQuestionVersion(pool, seeded) {
  const versionId = randomUUID();
  const authoredCreatedAt = '2026-10-19T13:34:56.789+07:00';
  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO tsa.question_versions
        (id, question_id, version_no, parent_version_id, schema_version, language, section,
         taxonomy_version_id, domain_id, skill_ids, subskill_ids, cognitive_level, difficulty,
         content, stimulus_version_id, interaction, origin, provenance_ids, created_by, created_at,
         content_hash, normalized_fingerprint, authored_created_at)
       VALUES ($1, $2, 2, $3, 'question/1', 'vi-VN', 'MATH', $4, 'math-domain', '[]', '[]',
         'M1', '{"target":"EASY","predicted":null,"empiricalStudyId":null}', $5::jsonb,
         $6, $7::jsonb, 'MANUAL', '["synthetic-provenance-v2"]', 'synthetic-author',
         $8::timestamptz, $9, $10, $11)`,
      [versionId, seeded.questionId, seeded.questionVersionId, seeded.taxonomyVersionId,
        JSON.stringify(seeded.prompt), seeded.stimulusVersionId, JSON.stringify(seeded.interaction),
        authoredCreatedAt, HASH_B, HASH_A, authoredCreatedAt]);
    await client.query(
      `INSERT INTO tsa_private.question_secrets
        (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
       VALUES ($1, $2::jsonb, $3::jsonb, 'practice-binary-v1', '["synthetic-evidence-v2"]'::jsonb)`,
      [versionId, JSON.stringify(seeded.answerKey), JSON.stringify(seeded.explanation)]);
  });
  return versionId;
}

export async function createAttempt(pool, form, userId, { id = randomUUID(), reuseMode } = {}) {
  await query(pool,
    `INSERT INTO tsa.attempts
      (id, user_id, form_id, form_mode, reuse_mode, reuse_policy_version,
       created_at, admission_until_at_creation, start_before_at)
     VALUES ($1, $2, $3, $4::tsa.form_mode, $5::tsa.reuse_mode, 'reuse/1',
       clock_timestamp(), clock_timestamp() + interval '600 seconds', clock_timestamp() + interval '600 seconds')`,
    [id, userId, form.formId, form.mode, reuseMode ?? (form.mode === 'PUBLISHED_FIXED' ? 'FIXED_AS_PUBLISHED' : 'NEW_ONLY')]);
  return id;
}

export async function startAttempt(pool, attemptId) {
  await query(pool,
    `UPDATE tsa.attempts SET state = 'IN_PROGRESS' WHERE id = $1`, [attemptId]);
}

export async function createExamJob(pool, attemptId, { id = randomUUID(), owner = 'executor-a' } = {}) {
  await query(pool,
    `INSERT INTO tsa.jobs
      (id, kind, dedup_key, payload_ref, attempt_id, state, attempts, max_attempts,
       lease_owner, lease_token, lease_until)
     VALUES ($1, 'exam_grade_attempt', $2, $3, $4, 'RUNNING', 1, 5, $5, 1,
       clock_timestamp() + interval '2 minutes')`,
    [id, `dedup-${id}`, `attempt:${attemptId}`, attemptId, owner]);
  return id;
}
