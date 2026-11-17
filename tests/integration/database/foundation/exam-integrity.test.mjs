import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from '../../../../src/modules/database/migrate.mjs';
import { query, withTransaction } from '../../../../src/modules/database/pool.mjs';
import { startDisposablePostgres } from './postgres.mjs';
import {
  HASH_A, HASH_B, createAttempt, createCorrectedQuestionVersion, createExamJob, createForm,
  seedExamFoundation,
} from './exam-fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.resolve(here, '../../../../db/migrations');
const migration001 = path.join(migrations, '001_bank_core.sql');

function expectSqlState(promise, state) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.code, state, `expected SQLSTATE ${state}, received ${error.code}: ${error.message}`);
    return true;
  });
}

async function insertAttempt(client, form, userId, id = randomUUID()) {
  await client.query(
    `INSERT INTO tsa.attempts
      (id, user_id, form_id, form_mode, reuse_mode, reuse_policy_version,
       created_at, admission_until_at_creation, start_before_at)
     VALUES ($1, $2, $3, $4::tsa.form_mode, $5::tsa.reuse_mode, 'reuse/1',
       clock_timestamp(), clock_timestamp() + interval '600 seconds', clock_timestamp() + interval '600 seconds')`,
    [id, userId, form.formId, form.mode,
      form.mode === 'PUBLISHED_FIXED' ? 'FIXED_AS_PUBLISHED' : 'NEW_ONLY']);
  return id;
}

async function waitForLock(pool, pid, applicationName, timeoutMs = 4_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const activity = await pool.query(
      `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1 AND application_name = $2`, [pid, applicationName]);
    if (activity.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`backend ${pid} did not enter a PostgreSQL lock wait within ${timeoutMs} ms`);
}

test('DATA-001 exam integrity on disposable PostgreSQL 18.6', async (t) => {
  const cluster = await startDisposablePostgres();
  t.after(() => cluster.stop());
  const { pool } = cluster;
  await migrate(pool, { directory: migrations });
  const seeded = await seedExamFoundation(pool);
  const form = await createForm(pool, seeded);

  await t.test('fresh migrations preserve exact lexical question time and sealed public/private projections', async () => {
    assert.equal(cluster.version, '18.6');
    const version = await pool.query(
      `SELECT authored_created_at FROM tsa.question_versions WHERE id = $1`, [seeded.questionVersionId]);
    assert.equal(version.rows[0].authored_created_at, seeded.authoredCreatedAt);
    const sealed = await pool.query(
      `SELECT f.public_snapshot, fs.key_snapshot, fs.explanation_snapshot, fs.policy_version
         FROM tsa.form_slots f JOIN tsa_private.form_slot_secrets fs USING (form_id, slot_id)
        WHERE f.form_id = $1`, [form.formId]);
    assert.equal(sealed.rows.length, 1);
    assert.deepEqual(sealed.rows[0].public_snapshot.stimulus, {
      id: seeded.stimulusId, content: seeded.stimulusContent,
    });
    assert.deepEqual(sealed.rows[0].key_snapshot, seeded.answerKey);
    assert.deepEqual(sealed.rows[0].explanation_snapshot, seeded.explanation);
    assert.equal(sealed.rows[0].policy_version, 'practice-binary-v1');
  });

  await t.test('form sealing rejects altered content, private key, and unrecognized public fields atomically', async () => {
    const before = await pool.query('SELECT count(*)::integer AS count FROM tsa.forms');
    await expectSqlState(createForm(pool, seeded, {
      publicSnapshotMutator: (snapshot) => ({
        ...snapshot,
        content: [{ type: 'text', text: 'content differs from immutable question version' }],
      }),
    }), '23514');
    await expectSqlState(createForm(pool, seeded, {
      secretMutator: (secret) => ({ ...secret, key_snapshot: { type: 'SINGLE_CHOICE', optionId: 'a' } }),
    }), '23514');
    await expectSqlState(createForm(pool, seeded, {
      publicSnapshotMutator: (snapshot) => ({ ...snapshot, answerKey: seeded.answerKey }),
    }), '23514');
    await expectSqlState(createForm(pool, seeded, { omitChildren: true }), '23514');
    await expectSqlState(createForm(pool, seeded, { sectionCount: 2 }), '23514');

    await expectSqlState(query(pool,
      `INSERT INTO tsa.blueprint_versions
        (id, blueprint_id, taxonomy_version_id, version_no, schema_version, config, content_hash)
       VALUES ($1, $2, $3, 2, 'blueprint/1', $4::jsonb, $5)`,
      [randomUUID(), seeded.blueprintId, seeded.taxonomyVersionId,
        JSON.stringify({ ...seeded.blueprintConfig, taxonomyVersionId: randomUUID() }), HASH_B]), '23514');
    const { schemaVersion: _schemaVersion, ...withoutSchemaVersion } = seeded.blueprintConfig;
    const { taxonomyVersionId: _taxonomyVersionId, ...withoutTaxonomyVersion } = seeded.blueprintConfig;
    for (const [versionNo, config] of [
      [4, withoutSchemaVersion],
      [5, withoutTaxonomyVersion],
      [7, { ...seeded.blueprintConfig, taxonomyVersionId: null }],
    ]) {
      await expectSqlState(query(pool,
        `INSERT INTO tsa.blueprint_versions
          (id, blueprint_id, taxonomy_version_id, version_no, schema_version, config, content_hash)
         VALUES ($1, $2, $3, $4, 'blueprint/1', $5::jsonb, $6)`,
        [randomUUID(), seeded.blueprintId, seeded.taxonomyVersionId, versionNo, JSON.stringify(config), HASH_B]), '23514');
    }
    await expectSqlState(query(pool,
      `INSERT INTO tsa.blueprint_versions
        (id, blueprint_id, taxonomy_version_id, version_no, schema_version, config, content_hash)
       VALUES ($1, $2, $3, 6, 'blueprint/1', $4::jsonb, $5)`,
      [randomUUID(), seeded.blueprintId, seeded.taxonomyVersionId,
        JSON.stringify({ ...seeded.blueprintConfig, schemaVersion: 'blueprint/2' }), HASH_B]), '23514');

    const alternateBlueprintVersionId = randomUUID();
    await query(pool,
      `INSERT INTO tsa.blueprint_versions
        (id, blueprint_id, taxonomy_version_id, version_no, schema_version, config, content_hash)
       VALUES ($1, $2, $3, 2, 'blueprint/1', $4::jsonb, $5)`,
      [alternateBlueprintVersionId, seeded.blueprintId, seeded.taxonomyVersionId,
        JSON.stringify(seeded.blueprintConfig), HASH_B]);
    await expectSqlState(createForm(pool, seeded, {
      assemblyBlueprintVersionId: alternateBlueprintVersionId,
    }), '23514');
    const after = await pool.query('SELECT count(*)::integer AS count FROM tsa.forms');
    assert.equal(after.rows[0].count, before.rows[0].count, 'failed seal transactions leave no partial form rows');
  });

  await t.test('immutable child evidence cannot be appended after its version transaction', async () => {
    await expectSqlState(query(pool,
      `INSERT INTO tsa_private.question_secrets
        (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
       VALUES ($1, $2::jsonb, $3::jsonb, 'practice-binary-v1', '[]'::jsonb)`,
      [seeded.questionVersionId, JSON.stringify(seeded.answerKey), JSON.stringify(seeded.explanation)]), '23514');
    await expectSqlState(query(pool,
      `INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind)
       VALUES ($1, $2, 'late-domain', 'DOMAIN')`, [randomUUID(), seeded.taxonomyVersionId]), '23514');
    await expectSqlState(query(pool,
      `INSERT INTO tsa.form_sections (form_id, section_id, section, ordinal, duration_seconds, question_count)
       VALUES ($1, 'late-section', 'MATH', 1, 60, 1)`, [form.formId]), '23514');
    await expectSqlState(query(pool,
      `INSERT INTO tsa.form_assets (form_id, asset_version_id, purpose)
       VALUES ($1, $2, 'QUESTION')`, [form.formId, randomUUID()]), '23514');
  });

  await t.test('attempt start and answers obey database-clock and revision boundaries', async () => {
    const attemptId = await createAttempt(pool, form, seeded.actorId);
    const predicate = await pool.query(
      `SELECT tsa.start_deadline_is_open($1::timestamptz, $2::timestamptz) AS before,
              tsa.start_deadline_is_open($2::timestamptz, $2::timestamptz) AS equal,
              tsa.start_deadline_is_open($3::timestamptz, $2::timestamptz) AS after`,
      ['2026-10-19T10:00:00Z', '2026-10-19T10:00:01Z', '2026-10-19T10:00:02Z']);
    assert.deepEqual(predicate.rows[0], { before: true, equal: false, after: false });
    const bounds = await pool.query(
      `SELECT created_at, admission_until_at_creation, start_before_at FROM tsa.attempts WHERE id = $1`, [attemptId]);
    const original = bounds.rows[0];
    await expectSqlState(query(pool,
      `UPDATE tsa.attempts SET start_before_at = start_before_at + interval '1 second' WHERE id = $1`, [attemptId]), '55000');
    await query(pool, `UPDATE tsa.attempts SET state = 'IN_PROGRESS' WHERE id = $1`, [attemptId]);
    const answer = { type: 'SINGLE_CHOICE', optionId: null };
    await query(pool,
      `INSERT INTO tsa.answers (attempt_id, form_id, slot_id, value, revision)
       VALUES ($1, $2, $3, $4::jsonb, 1)`, [attemptId, form.formId, form.slotId, JSON.stringify(answer)]);
    await query(pool,
      `UPDATE tsa.answers SET value = $2::jsonb, revision = 2 WHERE attempt_id = $1`,
      [attemptId, JSON.stringify({ type: 'SINGLE_CHOICE', optionId: 'a' })]);
    await expectSqlState(query(pool,
      `UPDATE tsa.answers SET revision = 4 WHERE attempt_id = $1`, [attemptId]), '23514');
    const updated = await pool.query(
      `SELECT created_at, admission_until_at_creation, start_before_at FROM tsa.attempts WHERE id = $1`, [attemptId]);
    assert.deepEqual(updated.rows[0], original, 'start bound remains immutable after the attempt starts');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [attemptId]);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.answers (attempt_id, form_id, slot_id, value, revision)
       VALUES ($1, $2, $3, $4::jsonb, 3)`,
      [attemptId, form.formId, form.slotId, JSON.stringify(answer)]), '23514');
  });

  await t.test('admission snapshots use the 600-second cap and survive later schedule edits', async () => {
    const fixedAttemptId = await createAttempt(pool, form, seeded.actorId);
    const fixed = await pool.query(
      `SELECT created_at, admission_until_at_creation, start_before_at,
              start_before_at = created_at + interval '600 seconds' AS exact_ttl
         FROM tsa.attempts WHERE id = $1`, [fixedAttemptId]);
    assert.equal(fixed.rows[0].exact_ttl, true, 'open fixed schedule receives the exact 600-second bound');
    await query(pool,
      `UPDATE tsa.form_availability
          SET available_until = clock_timestamp() + interval '1 hour', revision = revision + 1
        WHERE form_id = $1`, [form.formId]);
    const fixedAfterEdit = await pool.query(
      `SELECT created_at, admission_until_at_creation, start_before_at FROM tsa.attempts WHERE id = $1`, [fixedAttemptId]);
    assert.deepEqual(fixedAfterEdit.rows[0], fixed.rows[0] && {
      created_at: fixed.rows[0].created_at,
      admission_until_at_creation: fixed.rows[0].admission_until_at_creation,
      start_before_at: fixed.rows[0].start_before_at,
    }, 'editing the current form schedule does not extend an existing attempt');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [fixedAttemptId]);

    const personalForm = await createForm(pool, seeded, {
      mode: 'PERSONALIZED_PRACTICE', ownerUserId: seeded.actorId,
    });
    await query(pool,
      `UPDATE tsa.form_availability
          SET available_until = clock_timestamp() + interval '1 hour', revision = revision + 1
        WHERE form_id = $1`, [personalForm.formId]);
    await query(pool,
      `UPDATE tsa.blueprint_offerings
          SET available_from = clock_timestamp() - interval '1 minute',
              available_until = clock_timestamp() + interval '300 seconds', revision = revision + 1
        WHERE blueprint_version_id = $1`, [seeded.blueprintVersionId]);
    const personalAttemptId = await createAttempt(pool, personalForm, seeded.actorId);
    const capped = await pool.query(
      `SELECT created_at, admission_until_at_creation, start_before_at,
              start_before_at = admission_until_at_creation AS capped_to_offering,
              extract(epoch FROM start_before_at - created_at) AS ttl_seconds
         FROM tsa.attempts WHERE id = $1`, [personalAttemptId]);
    assert.equal(capped.rows[0].capped_to_offering, true);
    assert.ok(Number(capped.rows[0].ttl_seconds) > 0 && Number(capped.rows[0].ttl_seconds) < 600,
      'a near offering close caps the initial start window');
    await query(pool,
      `UPDATE tsa.blueprint_offerings
          SET available_until = clock_timestamp() + interval '1 hour', revision = revision + 1
        WHERE blueprint_version_id = $1`, [seeded.blueprintVersionId]);
    await query(pool,
      `UPDATE tsa.form_availability
          SET available_until = clock_timestamp() + interval '2 hours', revision = revision + 1
        WHERE form_id = $1`, [personalForm.formId]);
    const preserved = await pool.query(
      `SELECT admission_until_at_creation, start_before_at FROM tsa.attempts WHERE id = $1`, [personalAttemptId]);
    assert.deepEqual(preserved.rows[0], {
      admission_until_at_creation: capped.rows[0].admission_until_at_creation,
      start_before_at: capped.rows[0].start_before_at,
    }, 'later offering and form-window revisions do not alter captured bounds');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [personalAttemptId]);
  });

  await t.test('cancel/start row-lock races preserve the first committed transition', async () => {
    async function runRace(initialTransition, blockedTransition, expectedState, reason) {
      const attemptId = await createAttempt(pool, form, seeded.actorId);
      const first = await pool.connect();
      const second = await pool.connect();
      const firstName = `exam-cancel-start-first-${randomUUID()}`;
      const secondName = `exam-cancel-start-second-${randomUUID()}`;
      let blockedUpdate;
      try {
        await first.query("SELECT set_config('application_name', $1, false)", [firstName]);
        await second.query("SELECT set_config('application_name', $1, false)", [secondName]);
        await first.query('BEGIN');
        await second.query('BEGIN');
        const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        if (initialTransition === 'CANCEL') {
          await first.query(
            `UPDATE tsa.attempts SET state = 'CANCELLED', cancellation_reason = $2 WHERE id = $1`,
            [attemptId, reason]);
          blockedUpdate = second.query(
            `UPDATE tsa.attempts SET state = 'IN_PROGRESS' WHERE id = $1 AND state = 'CREATED'`, [attemptId]);
        } else {
          await first.query(`UPDATE tsa.attempts SET state = 'IN_PROGRESS' WHERE id = $1`, [attemptId]);
          blockedUpdate = second.query(
            `UPDATE tsa.attempts SET state = 'CANCELLED', cancellation_reason = $2
              WHERE id = $1 AND state = 'CREATED'`, [attemptId, reason]);
        }
        blockedUpdate.catch(() => {});
        await waitForLock(pool, secondPid, secondName);
        await first.query('COMMIT');
        const result = await blockedUpdate;
        assert.equal(result.rowCount, 0, 'the stale second transition must not overwrite the committed state');
        await second.query('COMMIT');
        const actual = await pool.query(
          `SELECT state, started_at, deadline_at FROM tsa.attempts WHERE id = $1`, [attemptId]);
        assert.equal(actual.rows[0].state, expectedState);
        if (expectedState === 'IN_PROGRESS') {
          assert.ok(actual.rows[0].started_at);
          assert.ok(actual.rows[0].deadline_at > actual.rows[0].started_at);
          await query(pool,
            `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [attemptId]);
        }
      } finally {
        await first.query('ROLLBACK').catch(() => {});
        await second.query('ROLLBACK').catch(() => {});
        first.release();
        second.release();
      }
    }

    await runRace('CANCEL', 'START', 'CANCELLED', 'FORM_WITHDRAWN');
    await runRace('START', 'CANCEL', 'IN_PROGRESS', 'RIGHTS_BLOCKED');
  });

  await t.test('valid grading seals exact per-section aggregates and bad aggregates roll back', async () => {
    const attemptId = await createAttempt(pool, form, seeded.actorId);
    await query(pool, `UPDATE tsa.attempts SET state = 'IN_PROGRESS' WHERE id = $1`, [attemptId]);
    const scoreId = randomUUID();
    const jobId = randomUUID();
    await withTransaction(pool, async (client) => {
      await client.query(`UPDATE tsa.attempts SET state = 'SUBMITTED' WHERE id = $1`, [attemptId]);
      await client.query(
        `INSERT INTO tsa.jobs
          (id, kind, dedup_key, payload_ref, attempt_id, state, attempts, max_attempts,
           lease_owner, lease_token, lease_until)
         VALUES ($1, 'exam_grade_attempt', $2, $3, $4, 'RUNNING', 1, 5, 'grader-a', 1,
           clock_timestamp() + interval '2 minutes')`, [jobId, `score-${jobId}`, `attempt:${attemptId}`, attemptId]);
      await client.query(
        `INSERT INTO tsa.score_runs
          (id, attempt_id, form_id, policy_version, input_hash, correct_count, total_count, percentage, section_totals)
         VALUES ($1, $2, $3, 'practice-binary-v1', $4, 1, 1, 100.00,
           '[{"sectionId":"math-main","section":"MATH","correctCount":1,"totalCount":1}]'::jsonb)`,
        [scoreId, attemptId, form.formId, HASH_A]);
      await client.query(
        `INSERT INTO tsa.score_items (score_run_id, form_id, slot_id, earned) VALUES ($1, $2, $3, 1)`,
        [scoreId, form.formId, form.slotId]);
      await client.query(
        `INSERT INTO tsa.result_releases (id, attempt_id, score_run_id, policy_version)
         VALUES ($1, $2, $3, 'practice-binary-v1')`, [randomUUID(), attemptId, scoreId]);
      await client.query(
        `UPDATE tsa.attempts SET state = 'GRADED', latest_score_id = $2 WHERE id = $1`, [attemptId, scoreId]);
      await client.query(
        `UPDATE tsa.jobs SET state = 'SUCCEEDED', lease_owner = NULL, lease_until = NULL WHERE id = $1`, [jobId]);
    });
    const graded = await pool.query(`SELECT state, latest_score_id FROM tsa.attempts WHERE id = $1`, [attemptId]);
    assert.deepEqual(graded.rows[0], { state: 'GRADED', latest_score_id: scoreId });
    await expectSqlState(query(pool,
      `INSERT INTO tsa.score_runs
        (id, attempt_id, form_id, policy_version, input_hash, correct_count, total_count, percentage, section_totals)
       VALUES ($1, $2, $3, 'practice-binary-v1', $4, 1, 1, 100.00,
         '[{"sectionId":"math-main","section":"MATH","correctCount":1,"totalCount":1}]'::jsonb)`,
      [randomUUID(), attemptId, form.formId, HASH_A]), '23505');

    const foreignUserId = randomUUID();
    await query(pool,
      `INSERT INTO tsa.users (id, issuer, subject) VALUES ($1, 'synthetic', $2)`, [foreignUserId, foreignUserId]);
    const foreignAttemptId = await createAttempt(pool, form, foreignUserId);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.result_releases (id, attempt_id, score_run_id, policy_version)
       VALUES ($1, $2, $3, 'practice-binary-v1')`, [randomUUID(), foreignAttemptId, scoreId]), '23503');

    const invalidScoreId = randomUUID();
    await expectSqlState(withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO tsa.score_runs
          (id, attempt_id, form_id, policy_version, input_hash, correct_count, total_count, percentage, section_totals, supersedes_id)
         VALUES ($1, $2, $3, 'practice-binary-v1', $4, 0, 1, 0.00,
           '[{"sectionId":"math-main","section":"MATH","correctCount":0,"totalCount":1}]'::jsonb, $5)`,
        [invalidScoreId, attemptId, form.formId, HASH_B, scoreId]);
      await client.query(
        `INSERT INTO tsa.score_items (score_run_id, form_id, slot_id, earned) VALUES ($1, $2, $3, 1)`,
        [invalidScoreId, form.formId, form.slotId]);
    }), '23514');
    const absent = await pool.query(`SELECT count(*)::integer AS count FROM tsa.score_runs WHERE id = $1`, [invalidScoreId]);
    assert.equal(absent.rows[0].count, 0, 'invalid score and item are rolled back together');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [foreignAttemptId]);
  });

  await t.test('composite form links reject cross-form answer and score items', async () => {
    const otherForm = await createForm(pool, seeded);
    const answerAttempt = await createAttempt(pool, form, seeded.actorId);
    await query(pool, `UPDATE tsa.attempts SET state = 'IN_PROGRESS' WHERE id = $1`, [answerAttempt]);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.answers (attempt_id, form_id, slot_id, value, revision)
       VALUES ($1, $2, $3, '{"type":"SINGLE_CHOICE","optionId":"a"}'::jsonb, 1)`,
      [answerAttempt, otherForm.formId, otherForm.slotId]), '23503');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [answerAttempt]);

    const scoreAttempt = await createAttempt(pool, form, seeded.actorId);
    await expectSqlState(withTransaction(pool, async (client) => {
      const scoreId = randomUUID();
      await client.query(
        `INSERT INTO tsa.score_runs
          (id, attempt_id, form_id, policy_version, input_hash, correct_count, total_count, percentage, section_totals)
         VALUES ($1, $2, $3, 'practice-binary-v1', $4, 0, 1, 0.00,
           '[{"sectionId":"math-main","section":"MATH","correctCount":0,"totalCount":1}]'::jsonb)`,
        [scoreId, scoreAttempt, form.formId, HASH_A]);
      await client.query(
        `INSERT INTO tsa.score_items (score_run_id, form_id, slot_id, earned) VALUES ($1, $2, $3, 0)`,
        [scoreId, otherForm.formId, otherForm.slotId]);
    }), '23503');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [scoreAttempt]);
  });

  await t.test('exam executor rows require a matching live job, executor, and fencing token', async () => {
    const otherUserId = randomUUID();
    await query(pool,
      `INSERT INTO tsa.users (id, issuer, subject, display_name) VALUES ($1, 'synthetic', $2, 'Other student')`, [otherUserId, otherUserId]);
    const ownAttempt = await createAttempt(pool, form, seeded.actorId);
    const otherAttempt = await createAttempt(pool, form, otherUserId);
    const ownJob = await createExamJob(pool, ownAttempt, { owner: 'grader-a' });
    await expectSqlState(query(pool,
      `INSERT INTO tsa.jobs (id, kind, dedup_key, payload_ref, attempt_id)
       VALUES ($1, 'exam_grade_attempt', $2, $3, $4)`,
      [randomUUID(), `dedup-${ownJob}`, `duplicate:${ownAttempt}`, ownAttempt]), '23505');
    await createExamJob(pool, otherAttempt, { owner: 'grader-b' });

    await withTransaction(pool, async (client) => {
      const withoutClaims = await client.query('SELECT count(*)::integer AS count FROM tsa.jobs');
      assert.equal(withoutClaims.rows[0].count, 0);
      await client.query("SELECT set_config('tsa.exam_job_id', $1, true)", [ownJob]);
      await client.query("SELECT set_config('tsa.executor_id', 'grader-a', true)");
      await client.query("SELECT set_config('tsa.lease_token', '1', true)");
      const visibleJobs = await client.query('SELECT id, attempt_id FROM tsa.jobs');
      assert.deepEqual(visibleJobs.rows, [{ id: ownJob, attempt_id: ownAttempt }]);
      const visibleAttempts = await client.query('SELECT id FROM tsa.attempts');
      assert.deepEqual(visibleAttempts.rows, [{ id: ownAttempt }]);
      const visibleSecrets = await client.query('SELECT form_id, slot_id FROM tsa_private.form_slot_secrets');
      assert.deepEqual(visibleSecrets.rows, [{ form_id: form.formId, slot_id: form.slotId }]);
      await client.query("SELECT set_config('tsa.executor_id', 'grader-b', true)");
      assert.equal((await client.query('SELECT count(*)::integer AS count FROM tsa.jobs')).rows[0].count, 0);
    }, { role: 'tsa_exam' });

    await query(pool,
      `INSERT INTO tsa.jobs (id, kind, dedup_key, payload_ref)
       VALUES ($1, 'factory_produce_unit', 'factory-only-key', 'factory:unit')`, [randomUUID()]);
    await withTransaction(pool, async (client) => {
      const rows = await client.query('SELECT kind, payload_ref FROM tsa.jobs');
      assert.deepEqual(rows.rows, [{ kind: 'factory_produce_unit', payload_ref: 'factory:unit' }]);
      await assert.rejects(client.query('SELECT * FROM tsa_private.form_slot_secrets'), (error) => error.code === '42501');
    }, { role: 'tsa_factory' });
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = ANY($1::uuid[])`,
      [[ownAttempt, otherAttempt]]);
  });

  await t.test('global active-attempt uniqueness blocks cross-mode races and permits distinct users', async () => {
    const fixedWinnerForm = form;
    const personalFormA = await createForm(pool, seeded, {
      mode: 'PERSONALIZED_PRACTICE', ownerUserId: seeded.actorId,
    });
    const personalFormB = await createForm(pool, seeded, {
      mode: 'PERSONALIZED_PRACTICE', ownerUserId: seeded.actorId,
    });
    const differentUserId = randomUUID();
    await query(pool,
      `INSERT INTO tsa.users (id, issuer, subject, display_name)
       VALUES ($1, 'synthetic', $2, 'Concurrent distinct user')`, [differentUserId, differentUserId]);

    async function startInsertClient(name, formToUse, userId) {
      const client = await pool.connect();
      await client.query("SELECT set_config('application_name', $1, false)", [name]);
      await client.query('BEGIN');
      const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const attemptId = randomUUID();
      const insert = insertAttempt(client, formToUse, userId, attemptId);
      insert.catch(() => {});
      return { client, pid, applicationName: name, attemptId, insert };
    }

    async function contend({ winnerForm, loserForm, includeDistinctUser = false, rollbackWinner = false }) {
      const winner = await startInsertClient(`exam-h1-winner-${randomUUID()}`, winnerForm, seeded.actorId);
      let loser;
      let distinct;
      try {
        await winner.insert;
        if (includeDistinctUser) {
          distinct = await startInsertClient(`exam-h1-distinct-${randomUUID()}`, fixedWinnerForm, differentUserId);
          await distinct.insert;
          await distinct.client.query('COMMIT');
          distinct.client.release();
          distinct = undefined;
        }
        loser = await startInsertClient(`exam-h1-loser-${randomUUID()}`, loserForm, seeded.actorId);
        await waitForLock(pool, loser.pid, loser.applicationName);
        if (rollbackWinner) await winner.client.query('ROLLBACK');
        else await winner.client.query('COMMIT');
        if (rollbackWinner) {
          await loser.insert;
          await loser.client.query('COMMIT');
        } else {
          await assert.rejects(loser.insert, (error) => error.code === '23505');
          await loser.client.query('ROLLBACK');
        }
      } finally {
        if (distinct) { await distinct.client.query('ROLLBACK').catch(() => {}); distinct.client.release(); }
        if (loser) { await loser.client.query('ROLLBACK').catch(() => {}); loser.client.release(); }
        await winner.client.query('ROLLBACK').catch(() => {});
        winner.client.release();
      }
      return { winnerAttemptId: winner.attemptId, loserAttemptId: loser.attemptId };
    }

    const fixedWins = await contend({
      winnerForm: fixedWinnerForm, loserForm: personalFormA, includeDistinctUser: true,
    });
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`,
      [fixedWins.winnerAttemptId]);
    const personalWins = await contend({ winnerForm: personalFormB, loserForm: fixedWinnerForm });
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`,
      [personalWins.winnerAttemptId]);
    const rolledBack = await contend({ winnerForm: fixedWinnerForm, loserForm: personalFormA, rollbackWinner: true });
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`,
      [rolledBack.loserAttemptId]);
    const distinctCount = await pool.query(
      `SELECT count(*)::integer AS count FROM tsa.attempts WHERE user_id = $1 AND form_id = $2`,
      [differentUserId, fixedWinnerForm.formId]);
    assert.equal(distinctCount.rows[0].count, 1, 'a distinct user committed while the first user held an uncommitted active attempt');
  });

  await t.test('assignment history is stable-identity keyed, owner-bound, and slot-backed', async () => {
    const attemptId = await createAttempt(pool, form, seeded.actorId);
    await query(pool,
      `INSERT INTO tsa.student_allocation_state (user_id, revision) VALUES ($1, 1)`, [seeded.actorId]);
    await expectSqlState(query(pool,
      `UPDATE tsa.student_allocation_state SET revision = revision WHERE user_id = $1`, [seeded.actorId]), '23514');
    await expectSqlState(query(pool,
      `DELETE FROM tsa.student_allocation_state WHERE user_id = $1`, [seeded.actorId]), '55000');
    await query(pool,
      `INSERT INTO tsa.student_question_history (user_id, question_id, first_attempt_id)
       VALUES ($1, $2, $3)`, [seeded.actorId, seeded.questionId, attemptId]);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.student_question_history (user_id, question_id, first_attempt_id)
       VALUES ($1, $2, $3)`, [seeded.actorId, seeded.questionId, attemptId]), '23505');

    const unrelatedQuestion = randomUUID();
    await query(pool, `INSERT INTO tsa.questions (id) VALUES ($1)`, [unrelatedQuestion]);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.student_question_history (user_id, question_id, first_attempt_id)
       VALUES ($1, $2, $3)`, [seeded.actorId, unrelatedQuestion, attemptId]), '23514');
    const otherUserId = randomUUID();
    await query(pool,
      `INSERT INTO tsa.users (id, issuer, subject) VALUES ($1, 'synthetic', $2)`, [otherUserId, otherUserId]);
    const otherAttemptId = await createAttempt(pool, form, otherUserId);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.student_question_history (user_id, question_id, first_attempt_id)
       VALUES ($1, $2, $3)`, [seeded.actorId, unrelatedQuestion, otherAttemptId]), '23514');
    await expectSqlState(query(pool,
      `UPDATE tsa.student_question_history SET question_id = $3
        WHERE user_id = $1 AND question_id = $2`, [seeded.actorId, seeded.questionId, unrelatedQuestion]), '55000');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [attemptId]);

    const correctedVersionId = await createCorrectedQuestionVersion(pool, seeded);
    const correctedForm = await createForm(pool, seeded, { questionVersionId: correctedVersionId });
    const correctedSeen = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM tsa.student_question_history h
         JOIN tsa.form_slots s ON s.question_id = h.question_id
         WHERE h.user_id = $1 AND s.form_id = $2
       ) AS seen`, [seeded.actorId, correctedForm.formId]);
    assert.equal(correctedSeen.rows[0].seen, true,
      'a corrected immutable version remains the same already-assigned stable question identity');
    const correctedAttemptId = await createAttempt(pool, correctedForm, seeded.actorId);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.student_question_history (user_id, question_id, first_attempt_id)
       VALUES ($1, $2, $3)`, [seeded.actorId, seeded.questionId, correctedAttemptId]), '23505');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [correctedAttemptId]);

    const first = await pool.connect();
    const second = await pool.connect();
    const firstName = `exam-history-owner-${randomUUID()}`;
    const secondName = `exam-history-waiter-${randomUUID()}`;
    let waited;
    try {
      await first.query("SELECT set_config('application_name', $1, false)", [firstName]);
      await second.query("SELECT set_config('application_name', $1, false)", [secondName]);
      await first.query('BEGIN');
      await second.query('BEGIN');
      const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await first.query('SELECT revision FROM tsa.student_allocation_state WHERE user_id = $1 FOR UPDATE', [seeded.actorId]);
      waited = second.query('SELECT revision FROM tsa.student_allocation_state WHERE user_id = $1 FOR UPDATE', [seeded.actorId]);
      waited.catch(() => {});
      await waitForLock(pool, secondPid, secondName);
      await first.query(
        `UPDATE tsa.student_allocation_state SET revision = revision + 1 WHERE user_id = $1`, [seeded.actorId]);
      await first.query('COMMIT');
      const serialized = await waited;
      assert.equal(serialized.rows[0].revision, '2', 'second allocator observes the committed newer history revision');
      const stillSeen = await second.query(
        `SELECT EXISTS (SELECT 1 FROM tsa.student_question_history
                         WHERE user_id = $1 AND question_id = $2) AS seen`,
        [seeded.actorId, seeded.questionId]);
      assert.equal(stillSeen.rows[0].seen, true, 'serialized history remains keyed by stable question identity');
      await second.query('COMMIT');
    } finally {
      await first.query('ROLLBACK').catch(() => {});
      await second.query('ROLLBACK').catch(() => {});
      first.release();
      second.release();
    }
  });

  await t.test('idempotency receipts pin unresolved attempts and retain terminal receipts for seven days', async () => {
    const attemptId = await createAttempt(pool, form, seeded.actorId);
    const receiptId = randomUUID();
    await query(pool,
      `INSERT INTO tsa.idempotency_records
        (id, actor_id, route_scope, idempotency_key, request_hash, response_status, safe_response,
         resource_id, related_attempt_id)
       VALUES ($1, $2, 'attempt.create', 'synthetic-key', $3, 201, '{"state":"CREATED"}'::jsonb, $4, $5)`,
      [receiptId, seeded.actorId, HASH_A, attemptId, attemptId]);
    const pinned = await pool.query('SELECT expires_at FROM tsa.idempotency_records WHERE id = $1', [receiptId]);
    assert.equal(pinned.rows[0].expires_at, null);
    await expectSqlState(query(pool, 'DELETE FROM tsa.idempotency_records WHERE id = $1', [receiptId]), '55000');

    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`, [attemptId]);
    const retained = await pool.query(
      `SELECT i.expires_at >= a.finalized_at + interval '7 days' AS retained
         FROM tsa.idempotency_records i JOIN tsa.attempts a ON a.id = i.related_attempt_id WHERE i.id = $1`,
      [receiptId]);
    assert.equal(retained.rows[0].retained, true);
    await expectSqlState(query(pool, 'DELETE FROM tsa.idempotency_records WHERE id = $1', [receiptId]), '55000');

    const stranger = randomUUID();
    await query(pool,
      `INSERT INTO tsa.users (id, issuer, subject) VALUES ($1, 'synthetic', $2)`, [stranger, stranger]);
    const foreignAttemptId = await createAttempt(pool, form, stranger);
    const wrongActor = randomUUID();
    await query(pool,
      `INSERT INTO tsa.users (id, issuer, subject) VALUES ($1, 'synthetic', $2)`, [wrongActor, wrongActor]);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.idempotency_records
        (id, actor_id, route_scope, idempotency_key, request_hash, response_status, safe_response, related_attempt_id)
       VALUES ($1, $2, 'attempt.create', 'foreign-key', $3, 201, '{}'::jsonb, $4)`,
      [randomUUID(), wrongActor, HASH_B, foreignAttemptId]), '23503');
  });

  await t.test('submitted attempts keep receipt pinned through pending grading and permit a replacement attempt', async () => {
    const attemptId = await createAttempt(pool, form, seeded.actorId);
    await query(pool, `UPDATE tsa.attempts SET state = 'IN_PROGRESS' WHERE id = $1`, [attemptId]);
    const jobId = randomUUID();
    const receiptId = randomUUID();
    await withTransaction(pool, async (client) => {
      await client.query(`UPDATE tsa.attempts SET state = 'SUBMITTED' WHERE id = $1`, [attemptId]);
      await client.query(
        `INSERT INTO tsa.jobs (id, kind, dedup_key, payload_ref, attempt_id, state)
         VALUES ($1, 'exam_grade_attempt', $2, $3, $4, 'QUEUED')`,
        [jobId, `pending-grade-${jobId}`, `attempt:${attemptId}`, attemptId]);
      await client.query(
        `INSERT INTO tsa.idempotency_records
          (id, actor_id, route_scope, idempotency_key, request_hash, response_status,
           safe_response, resource_id, related_attempt_id)
         VALUES ($1, $2, 'attempt.submit', $3, $4, 202, '{"accepted":true}'::jsonb, $5, $6)`,
        [receiptId, seeded.actorId, `submit-${attemptId}`, HASH_A, attemptId, attemptId]);
    });

    const pending = await pool.query(
      `SELECT a.state, a.grading_status, a.finalized_at, a.latest_score_id,
              i.expires_at, j.state AS job_state,
              (SELECT count(*)::integer FROM tsa.result_releases r WHERE r.attempt_id = a.id) AS releases
         FROM tsa.attempts a
         JOIN tsa.idempotency_records i ON i.related_attempt_id = a.id
         JOIN tsa.jobs j ON j.attempt_id = a.id
        WHERE a.id = $1`, [attemptId]);
    assert.deepEqual(pending.rows[0], {
      state: 'SUBMITTED', grading_status: 'PENDING', finalized_at: null, latest_score_id: null,
      expires_at: null, job_state: 'QUEUED', releases: 0,
    }, 'pending grading has a durable job, no final score/release, and a pinned receipt');
    await expectSqlState(query(pool, 'DELETE FROM tsa.idempotency_records WHERE id = $1', [receiptId]), '55000');

    const nextForm = await createForm(pool, seeded);
    const replacementAttemptId = await createAttempt(pool, nextForm, seeded.actorId);
    assert.ok(replacementAttemptId, 'H1 permits a new attempt once submission closes the previous attempt');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`,
      [replacementAttemptId]);
  });

  await t.test('expired CREATED reservation cleanup preserves deadline, first history, and receipt', async () => {
    const actorId = randomUUID();
    await query(pool,
      `INSERT INTO tsa.users (id, issuer, subject, display_name)
       VALUES ($1, 'synthetic', $2, 'Expired reservation test actor')`, [actorId, actorId]);
    const replacementForm = await createForm(pool, seeded);
    await query(pool,
      `UPDATE tsa.form_availability
          SET available_until = clock_timestamp() + interval '5 seconds', revision = revision + 1
        WHERE form_id = $1`, [form.formId]);

    const attemptId = randomUUID();
    const receiptId = randomUUID();
    await withTransaction(pool, async (client) => {
      await insertAttempt(client, form, actorId, attemptId);
      await client.query(
        `INSERT INTO tsa.student_question_history (user_id, question_id, first_attempt_id)
         VALUES ($1, $2, $3)`, [actorId, seeded.questionId, attemptId]);
      const bound = await client.query(
        `SELECT to_char(start_before_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS start_before
           FROM tsa.attempts WHERE id = $1`, [attemptId]);
      await client.query(
        `INSERT INTO tsa.idempotency_records
          (id, actor_id, route_scope, idempotency_key, request_hash, response_status,
           safe_response, resource_id, related_attempt_id)
         VALUES ($1, $2, 'attempt.create', $3, $4, 201,
           jsonb_build_object('startBefore', $5::text), $6, $7)`,
        [receiptId, actorId, `create-${attemptId}`, HASH_A,
          bound.rows[0].start_before, attemptId, attemptId]);
    });

    const beforeEdit = await pool.query(
      `SELECT a.created_at, a.admission_until_at_creation, a.start_before_at,
              a.start_before_at = a.admission_until_at_creation AS capped,
              extract(epoch FROM a.start_before_at - a.created_at) AS ttl_seconds,
              i.safe_response, i.expires_at
         FROM tsa.attempts a JOIN tsa.idempotency_records i ON i.related_attempt_id = a.id
        WHERE a.id = $1`, [attemptId]);
    assert.equal(beforeEdit.rows[0].capped, true);
    assert.ok(Number(beforeEdit.rows[0].ttl_seconds) > 0 && Number(beforeEdit.rows[0].ttl_seconds) < 600);
    assert.equal(beforeEdit.rows[0].expires_at, null);
    await expectSqlState(query(pool,
      `UPDATE tsa.attempts SET state = 'CANCELLED', cancellation_reason = 'START_TTL_EXPIRED' WHERE id = $1`,
      [attemptId]), '23514');

    await query(pool,
      `UPDATE tsa.form_availability
          SET available_until = clock_timestamp() + interval '1 hour', revision = revision + 1
        WHERE form_id = $1`, [form.formId]);
    const afterEdit = await pool.query(
      `SELECT a.start_before_at, i.safe_response
         FROM tsa.attempts a JOIN tsa.idempotency_records i ON i.related_attempt_id = a.id
        WHERE a.id = $1`, [attemptId]);
    assert.equal(afterEdit.rows[0].start_before_at.getTime(), beforeEdit.rows[0].start_before_at.getTime(),
      'extending the ordinary admission schedule does not move the captured deadline');
    assert.deepEqual(afterEdit.rows[0].safe_response, beforeEdit.rows[0].safe_response,
      'the immutable creation receipt retains its original start bound');

    const waitDeadline = performance.now() + 8_000;
    while (performance.now() < waitDeadline) {
      const expired = await pool.query(
        `SELECT clock_timestamp() >= start_before_at AS elapsed FROM tsa.attempts WHERE id = $1`, [attemptId]);
      if (expired.rows[0].elapsed) break;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    const elapsed = await pool.query(
      `SELECT clock_timestamp() >= start_before_at AS elapsed FROM tsa.attempts WHERE id = $1`, [attemptId]);
    assert.equal(elapsed.rows[0].elapsed, true, 'bounded polling observes the real database clock crossing the stored bound');

    await expectSqlState(createAttempt(pool, replacementForm, actorId), '23505');
    await withTransaction(pool, async (client) => {
      await client.query(
        `UPDATE tsa.attempts SET state = 'CANCELLED', cancellation_reason = 'START_TTL_EXPIRED' WHERE id = $1`,
        [attemptId]);
    });
    const cleaned = await pool.query(
      `SELECT a.state, a.start_before_at, a.finalized_at,
              i.expires_at >= a.finalized_at + interval '7 days' AS retained,
              i.safe_response,
              h.first_attempt_id
         FROM tsa.attempts a
         JOIN tsa.idempotency_records i ON i.related_attempt_id = a.id
        JOIN tsa.student_question_history h ON h.user_id = a.user_id AND h.question_id = $2
        WHERE a.id = $1`, [attemptId, seeded.questionId]);
    assert.equal(cleaned.rows[0].state, 'CANCELLED');
    assert.equal(cleaned.rows[0].start_before_at.getTime(), beforeEdit.rows[0].start_before_at.getTime());
    assert.equal(cleaned.rows[0].retained, true);
    assert.equal(cleaned.rows[0].first_attempt_id, attemptId);
    assert.deepEqual(cleaned.rows[0].safe_response, beforeEdit.rows[0].safe_response);
    await expectSqlState(query(pool,
      `UPDATE tsa.idempotency_records SET safe_response = '{"startBefore":"rewritten"}'::jsonb WHERE id = $1`,
      [receiptId]), '55000');

    const replacementAttemptId = await createAttempt(pool, replacementForm, actorId);
    await expectSqlState(query(pool,
      `INSERT INTO tsa.student_question_history (user_id, question_id, first_attempt_id)
       VALUES ($1, $2, $3)`, [actorId, seeded.questionId, replacementAttemptId]), '23505');
    await query(pool,
      `UPDATE tsa.attempts SET state = 'INVALIDATED', invalidation_reason = 'test cleanup' WHERE id = $1`,
      [replacementAttemptId]);
  });
});

test('002 is additive over populated 001 bank history', async (t) => {
  const cluster = await startDisposablePostgres();
  t.after(() => cluster.stop());
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-exam-upgrade-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const oneOnly = path.join(directory, 'migrations');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(oneOnly, { mode: 0o700 });
  await copyFile(migration001, path.join(oneOnly, '001_bank_core.sql'));
  await migrate(cluster.pool, { directory: oneOnly });

  const userId = randomUUID();
  const taxonomyId = randomUUID();
  const domainId = randomUUID();
  const questionId = randomUUID();
  const versionId = randomUUID();
  const legacyKey = { type: 'SINGLE_CHOICE', optionId: 'legacy-b' };
  const legacyContent = [{ type: 'text', text: 'Legacy populated question' }];
  await query(cluster.pool,
    `INSERT INTO tsa.users (id, issuer, subject, display_name)
     VALUES ($1, 'synthetic', $2, 'Legacy author')`, [userId, userId]);
  await query(cluster.pool,
    `INSERT INTO tsa.taxonomy_versions (id, name, version_no, definition_hash)
     VALUES ($1, 'legacy taxonomy', 1, $2)`, [taxonomyId, HASH_A]);
  await query(cluster.pool,
    `INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind)
     VALUES ($1, $2, 'legacy-domain', 'DOMAIN')`, [domainId, taxonomyId]);
  await query(cluster.pool, `INSERT INTO tsa.questions (id) VALUES ($1)`, [questionId]);
  await query(cluster.pool,
    `INSERT INTO tsa.question_versions
      (id, question_id, version_no, schema_version, language, section, taxonomy_version_id,
       domain_id, skill_ids, subskill_ids, cognitive_level, difficulty, content, interaction,
       origin, provenance_ids, created_by, created_at, content_hash, normalized_fingerprint)
     VALUES ($1, $2, 1, 'question/1', 'vi-VN', 'MATH', $3, 'legacy-domain', '[]', '[]',
       'M1', '{"target":"EASY","predicted":null,"empiricalStudyId":null}', $4::jsonb,
       '{"type":"SINGLE_CHOICE","options":[]}'::jsonb, 'MANUAL', '["legacy-prov"]',
       'legacy-author', '2026-10-19T12:34:56.789+07:00', $5, $6)`,
    [versionId, questionId, taxonomyId, JSON.stringify(legacyContent), HASH_A, HASH_B]);
  await query(cluster.pool,
    `INSERT INTO tsa_private.question_secrets
      (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
     VALUES ($1, $2::jsonb, '[{"type":"text","text":"legacy explanation"}]'::jsonb,
       'practice-binary-v1', '["legacy evidence"]'::jsonb)`,
    [versionId, JSON.stringify(legacyKey)]);

  await migrate(cluster.pool, { directory: migrations });
  const preserved = await cluster.pool.query(
    `SELECT qv.content, qv.created_at, qv.authored_created_at, qv.creation_xid,
            qs.answer_key, qs.explanation, qs.scoring_policy_version
       FROM tsa.question_versions qv
       JOIN tsa_private.question_secrets qs ON qs.question_version_id = qv.id
      WHERE qv.id = $1`, [versionId]);
  assert.equal(preserved.rows.length, 1);
  assert.deepEqual(preserved.rows[0].content, legacyContent);
  assert.equal(preserved.rows[0].created_at.toISOString(), '2026-10-19T05:34:56.789Z');
  assert.equal(preserved.rows[0].authored_created_at, null, 'migration does not fabricate the lost lexical timestamp');
  assert.equal(preserved.rows[0].creation_xid, null, 'legacy immutable parent retains an unknown creation transaction marker');
  assert.deepEqual(preserved.rows[0].answer_key, legacyKey);
  assert.equal(preserved.rows[0].scoring_policy_version, 'practice-binary-v1');
  await t.test('legacy rows remain readable but cannot gain late immutable child evidence', async () => {
    await expectSqlState(query(cluster.pool,
      `INSERT INTO tsa_private.question_secrets
        (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
       VALUES ($1, $2::jsonb, '[]'::jsonb, 'practice-binary-v1', '[]'::jsonb)`,
      [versionId, JSON.stringify(legacyKey)]), '23514');
  });
});
