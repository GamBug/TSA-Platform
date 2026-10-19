import assert from 'node:assert/strict';
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { migrate } from '../../../../src/modules/database/migrate.mjs';
import { createDatabasePool, query, withTransaction } from '../../../../src/modules/database/pool.mjs';
import { startDisposablePostgres } from './postgres.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationFile = path.resolve(here, '../../../../db/migrations/001_bank_core.sql');
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function expectSqlState(promise, state) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.code, state, `expected SQLSTATE ${state}, received ${error.code}: ${error.message}`);
    return true;
  });
}

async function temporaryMigrationDirectory(files) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-migration-test-'));
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(directory, name), contents, { mode: 0o600 });
  }
  return directory;
}

async function copyCoreMigration(directory) {
  await copyFile(migrationFile, path.join(directory, '001_bank_core.sql'));
}

async function insertSource(pool, actorId, title = 'source') {
  const sourceId = randomUUID();
  const sourceVersionId = randomUUID();
  const rightsId = randomUUID();
  await query(pool, 'INSERT INTO tsa.sources (id, title) VALUES ($1, $2)', [sourceId, title]);
  await query(pool,
    `INSERT INTO tsa.source_versions (id, source_id, version_no, content_hash, metadata)
     VALUES ($1, $2, 1, $3, $4::jsonb)`,
    [sourceVersionId, sourceId, HASH_A, JSON.stringify({ content: [{ type: 'text', text: 'versioned source content' }] })],
  );
  await query(pool,
    `INSERT INTO tsa.rights_decisions
      (id, source_version_id, status, allowed_uses, territory, evidence, decided_by)
     VALUES ($1, $2, 'OWNED', ARRAY['DISPLAY','GENERATE']::tsa.rights_use[], ARRAY['GLOBAL'], $3::jsonb, $4)`,
    [rightsId, sourceVersionId, JSON.stringify({ record: 'synthetic test evidence' }), actorId],
  );
  await query(pool,
    'INSERT INTO tsa.source_rights (source_version_id, decision_id, revision) VALUES ($1, $2, 1)',
    [sourceVersionId, rightsId],
  );
  return { sourceId, sourceVersionId, rightsId };
}

async function seedBankQuestion(pool) {
  const actorId = randomUUID();
  const reviewerId = randomUUID();
  await query(pool,
    'INSERT INTO tsa.users (id, issuer, subject, display_name) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
    [actorId, 'synthetic', 'author', 'Test Author', reviewerId, 'synthetic', 'reviewer', 'Test Reviewer'],
  );
  await query(pool,
    `INSERT INTO tsa.user_roles (user_id, role) VALUES ($1, 'AUTHOR'), ($2, 'REVIEWER')`,
    [actorId, reviewerId],
  );
  const sourceA = await insertSource(pool, actorId, 'source A');
  const sourceB = await insertSource(pool, actorId, 'source B');
  const taxonomyA = randomUUID();
  const taxonomyB = randomUUID();
  const domainA = randomUUID();
  const skillA = randomUUID();
  const subskillA = randomUUID();
  const domainB = randomUUID();
  await query(pool,
    `INSERT INTO tsa.taxonomy_versions (id, name, version_no, definition_hash)
     VALUES ($1, 'synthetic', 1, $2), ($3, 'other-synthetic', 1, $4)`,
    [taxonomyA, HASH_A, taxonomyB, HASH_B],
  );
  await query(pool,
    `INSERT INTO tsa.taxonomy_nodes (id, taxonomy_version_id, code, kind, parent_id)
     VALUES ($1, $2, 'domain-a', 'DOMAIN', NULL),
            ($3, $2, 'skill-a', 'SKILL', $1),
            ($4, $2, 'subskill-a', 'SUBSKILL', $3),
            ($5, $6, 'domain-b', 'DOMAIN', NULL)`,
    [domainA, taxonomyA, skillA, subskillA, domainB, taxonomyB],
  );

  const questionId = randomUUID();
  const versionId = randomUUID();
  const parentCandidateId = randomUUID();
  const createdAt = '2026-10-19T05:00:00.000Z';
  await query(pool, 'INSERT INTO tsa.questions (id) VALUES ($1), ($2)', [questionId, parentCandidateId]);
  const content = [{ type: 'text', text: 'Synthetic test prompt' }];
  const interaction = {
    type: 'SINGLE_CHOICE',
    options: [
      { id: 'a', content: [{ type: 'text', text: 'First' }] },
      { id: 'b', content: [{ type: 'text', text: 'Second' }] },
    ],
  };
  const difficulty = { target: 'EASY', predicted: null, empiricalStudyId: null };
  const skillIds = ['skill-a', 'skill-b'];
  const subskillIds = ['subskill-a'];
  const provenanceIds = ['prov-a'];
  await query(pool,
    `INSERT INTO tsa.question_versions
      (id, question_id, version_no, parent_version_id, schema_version, language, section,
       taxonomy_version_id, domain_id, skill_ids, subskill_ids, cognitive_level, difficulty,
       content, stimulus_version_id, interaction, origin, provenance_ids, generation_run_id,
       created_by, created_at, content_hash, normalized_fingerprint)
     VALUES ($1, $2, 1, NULL, 'question/1', 'vi-VN', 'MATH', $3, 'domain-a', $4::jsonb,
       $5::jsonb, 'M1', $6::jsonb, $7::jsonb, NULL, $8::jsonb, 'MANUAL', $9::jsonb,
       NULL, 'synthetic-author', $10::timestamptz, $11, $12)`,
    [versionId, questionId, taxonomyA, JSON.stringify(skillIds), JSON.stringify(subskillIds),
      JSON.stringify(difficulty), JSON.stringify(content), JSON.stringify(interaction),
      JSON.stringify(provenanceIds), createdAt, HASH_A, HASH_B],
  );
  await query(pool,
    `INSERT INTO tsa_private.question_secrets
      (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
     VALUES ($1, $2::jsonb, $3::jsonb, 'practice-binary-v1', $4::jsonb)`,
    [versionId, JSON.stringify({ type: 'SINGLE_CHOICE', optionId: 'b' }),
      JSON.stringify([{ type: 'text', text: 'Synthetic private explanation' }]), JSON.stringify(['evidence-a'])],
  );
  await query(pool,
    `INSERT INTO tsa.question_taxonomy
      (question_version_id, taxonomy_version_id, node_code, dimension, ordinal)
     VALUES ($1, $2, 'domain-a', 'DOMAIN', 0),
            ($1, $2, 'skill-a', 'SKILL', 0),
            ($1, $2, 'subskill-a', 'SUBSKILL', 0)`,
    [versionId, taxonomyA],
  );
  await query(pool,
    `INSERT INTO tsa.question_provenance
      (question_version_id, provenance_id, ordinal, source_version_id, source_span,
       origin, transformation, creator, rights_decision_at_authoring)
     VALUES ($1, 'prov-a', 0, $2, NULL, 'MANUAL', 'original synthesis', 'synthetic-author', $3)`,
    [versionId, sourceA.sourceVersionId, sourceA.rightsId],
  );
  await query(pool,
    `INSERT INTO tsa.question_workflow (question_version_id, state) VALUES ($1, 'DRAFT')`,
    [versionId],
  );
  const reviewId = randomUUID();
  await query(pool,
    `INSERT INTO tsa.reviews
      (id, question_version_id, content_hash, reviewer_id, decision, rubric, reason)
     VALUES ($1, $2, $3, $4, 'REQUEST_CHANGES', '{}'::jsonb, 'synthetic review')`,
    [reviewId, versionId, HASH_A, reviewerId],
  );
  const assetId = randomUUID();
  await query(pool,
    `INSERT INTO tsa.asset_versions
      (id, source_version_id, object_key, content_hash, mime, byte_size, alt_metadata, security_class)
     VALUES ($1, $2, 'synthetic/object', $3, 'image/png', 12, '{}'::jsonb, 'QUESTION')`,
    [assetId, sourceA.sourceVersionId, HASH_A],
  );
  const stimulusId = randomUUID();
  const stimulusVersionId = randomUUID();
  await query(pool, 'INSERT INTO tsa.stimuli (id) VALUES ($1)', [stimulusId]);
  await query(pool,
    `INSERT INTO tsa.stimulus_versions (id, stimulus_id, version_no, content, content_hash)
     VALUES ($1, $2, 1, $3::jsonb, $4)`,
    [stimulusVersionId, stimulusId, JSON.stringify([{ type: 'text', text: 'Synthetic stimulus' }]), HASH_A],
  );
  await query(pool,
    'INSERT INTO tsa.stimulus_sources (stimulus_version_id, source_version_id, span) VALUES ($1, $2, NULL)',
    [stimulusVersionId, sourceA.sourceVersionId],
  );
  await query(pool, 'INSERT INTO tsa.stimulus_assets (stimulus_version_id, asset_version_id) VALUES ($1, $2)', [stimulusVersionId, assetId]);
  const bundleId = randomUUID();
  await query(pool, 'INSERT INTO tsa.bundles (id, stimulus_version_id, content_hash) VALUES ($1, $2, $3)', [bundleId, stimulusVersionId, HASH_A]);
  await query(pool, 'INSERT INTO tsa.bundle_members (bundle_id, question_version_id, ordinal) VALUES ($1, $2, 0)', [bundleId, versionId]);
  return { actorId, reviewerId, sourceA, sourceB, taxonomyA, taxonomyB, domainA, domainB,
    questionId, versionId, parentCandidateId, createdAt, content, interaction, difficulty,
    skillIds, subskillIds, provenanceIds, reviewId, assetId, stimulusVersionId, bundleId };
}

async function seedSecretlessQuestionVersion(pool, seeded) {
  const questionId = randomUUID();
  const versionId = randomUUID();
  await query(pool, 'INSERT INTO tsa.questions (id) VALUES ($1)', [questionId]);
  await query(pool,
    `INSERT INTO tsa.question_versions
      (id, question_id, version_no, schema_version, language, section, taxonomy_version_id,
       domain_id, skill_ids, subskill_ids, difficulty, content, interaction, origin,
       provenance_ids, created_by, created_at, content_hash, normalized_fingerprint)
     VALUES ($1, $2, 1, 'question/1', 'vi-VN', 'MATH', $3, 'domain-a', '[]', '[]',
       '{"target":null,"predicted":null,"empiricalStudyId":null}', '[{"type":"text","text":"Secretless"}]',
       '{"type":"SINGLE_CHOICE","options":[]}', 'MANUAL', '["prov-secretless"]', 'synthetic-author',
       '2026-10-19T05:00:00Z', $4, $5)`,
    [versionId, questionId, seeded.taxonomyA, HASH_A, HASH_B],
  );
  return versionId;
}

test('DATA-001 bank-core foundation on disposable PostgreSQL 18.6', async (t) => {
  const cluster = await startDisposablePostgres();
  const { pool } = cluster;
  const clusterRoot = cluster.temporaryDirectory;
  const tempDirectories = [];
  try {
    const coreDir = await mkdtemp(path.join(os.tmpdir(), 'tsa-bank-core-only-'));
    tempDirectories.push(coreDir);
    await copyCoreMigration(coreDir);
    const initial = await migrate(pool, { directory: coreDir });
    assert.deepEqual(initial.applied, ['001_bank_core.sql']);
    const seeded = await seedBankQuestion(pool);

    await t.test('migration applies once, then is idempotent', async () => {
      assert.equal(cluster.version, '18.6');
      assert.deepEqual(initial.alreadyApplied, []);
      const second = await migrate(pool, { directory: coreDir });
      assert.deepEqual(second.applied, []);
      assert.deepEqual(second.alreadyApplied, ['001_bank_core.sql']);
      const schemas = await pool.query(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name IN ('tsa', 'tsa_private', 'tsa_meta') ORDER BY schema_name
      `);
      assert.deepEqual(schemas.rows.map((row) => row.schema_name), ['tsa', 'tsa_meta', 'tsa_private']);
    });

    await t.test('migration checksum drift and duplicate numeric prefixes fail closed', async () => {
      const core = await readFile(migrationFile, 'utf8');
      const driftDir = await temporaryMigrationDirectory({ '001_bank_core.sql': `${core}\n-- changed after application\n` });
      tempDirectories.push(driftDir);
      await assert.rejects(migrate(pool, { directory: driftDir }), /checksum drift/);

      const duplicateDir = await temporaryMigrationDirectory({
        '001_bank_core.sql': core,
        '0001_alias.sql': 'SELECT 1;\n',
      });
      tempDirectories.push(duplicateDir);
      await assert.rejects(migrate(pool, { directory: duplicateDir }), /Duplicate migration number: 1/);
    });

    await t.test('failed migration rolls back DDL and ledger entry', async () => {
      const core = await readFile(migrationFile, 'utf8');
      const directory = await temporaryMigrationDirectory({
        '001_bank_core.sql': core,
        '002_bad_migration.sql': 'CREATE TABLE tsa.atomic_rollback_probe (id integer);\nSELECT * FROM tsa.no_such_relation;\n',
      });
      tempDirectories.push(directory);
      await assert.rejects(migrate(pool, { directory }), /no_such_relation/);
      const ledger = await pool.query('SELECT count(*)::integer AS count FROM tsa_meta.schema_migrations WHERE version = $1', ['002_bad_migration.sql']);
      assert.equal(ledger.rows[0].count, 0);
      const table = await pool.query("SELECT to_regclass('tsa.atomic_rollback_probe') AS name");
      assert.equal(table.rows[0].name, null);
    });

    await t.test('numeric migration order and late insertion are checked', async () => {
      const core = await readFile(migrationFile, 'utf8');
      const before = 'CREATE TABLE tsa_meta.numeric_order (position text NOT NULL); INSERT INTO tsa_meta.numeric_order VALUES (\'999\');';
      const after = "INSERT INTO tsa_meta.numeric_order VALUES ('1000');";
      const directory = await temporaryMigrationDirectory({
        '001_bank_core.sql': core,
        '999_before.sql': before,
        '1000_after.sql': after,
      });
      tempDirectories.push(directory);
      const result = await migrate(pool, { directory });
      assert.deepEqual(result.applied, ['999_before.sql', '1000_after.sql']);
      const order = await pool.query('SELECT position FROM tsa_meta.numeric_order ORDER BY ctid');
      assert.deepEqual(order.rows.map((row) => row.position), ['999', '1000']);

      const lateDirectory = await temporaryMigrationDirectory({
        '001_bank_core.sql': core,
        '900_inserted_late.sql': 'SELECT 1;',
        '999_before.sql': before,
        '1000_after.sql': after,
      });
      tempDirectories.push(lateDirectory);
      await assert.rejects(migrate(pool, { directory: lateDirectory }), /Cannot apply older migration/);
    });

    await t.test('populated upgrade preserves existing bank rows', async () => {
      const original = await pool.query('SELECT eligibility_revision FROM tsa.bank_state WHERE id = 1');
      assert.equal(original.rows[0].eligibility_revision, '0');
      const beforeQuestion = await pool.query(
        `SELECT q.content_hash, q.skill_ids, q.subskill_ids, q.provenance_ids,
                s.answer_key, s.explanation, p.source_version_id
         FROM tsa.question_versions AS q
         JOIN tsa_private.question_secrets AS s ON s.question_version_id = q.id
         JOIN tsa.question_provenance AS p ON p.question_version_id = q.id
         WHERE q.id = $1`, [seeded.versionId],
      );
      const core = await readFile(migrationFile, 'utf8');
      const directory = await temporaryMigrationDirectory({
        '001_bank_core.sql': core,
        '999_before.sql': 'CREATE TABLE tsa_meta.numeric_order (position text NOT NULL); INSERT INTO tsa_meta.numeric_order VALUES (\'999\');',
        '1000_after.sql': "INSERT INTO tsa_meta.numeric_order VALUES ('1000');",
        '1100_populated_upgrade.sql': 'CREATE TABLE tsa_meta.upgrade_probe (value text NOT NULL); INSERT INTO tsa_meta.upgrade_probe VALUES (\'preserved\');',
      });
      tempDirectories.push(directory);
      const upgraded = await migrate(pool, { directory });
      assert.deepEqual(upgraded.applied, ['1100_populated_upgrade.sql']);
      const after = await pool.query('SELECT eligibility_revision FROM tsa.bank_state WHERE id = 1');
      assert.equal(after.rows[0].eligibility_revision, '0');
      const afterQuestion = await pool.query(
        `SELECT q.content_hash, q.skill_ids, q.subskill_ids, q.provenance_ids,
                s.answer_key, s.explanation, p.source_version_id
         FROM tsa.question_versions AS q
         JOIN tsa_private.question_secrets AS s ON s.question_version_id = q.id
         JOIN tsa.question_provenance AS p ON p.question_version_id = q.id
         WHERE q.id = $1`, [seeded.versionId],
      );
      assert.deepEqual(afterQuestion.rows, beforeQuestion.rows);
      const marker = await pool.query('SELECT value FROM tsa_meta.upgrade_probe');
      assert.deepEqual(marker.rows, [{ value: 'preserved' }]);
    });

    await t.test('question/1 storage preserves ordered public fields and private separation', async () => {
      const publicRow = await pool.query(
        `SELECT schema_version, domain_id, skill_ids, subskill_ids, provenance_ids, created_by, created_at::text
         FROM tsa.question_versions WHERE id = $1`, [seeded.versionId],
      );
      assert.equal(publicRow.rows[0].schema_version, 'question/1');
      assert.deepEqual(publicRow.rows[0].skill_ids, seeded.skillIds);
      assert.deepEqual(publicRow.rows[0].subskill_ids, seeded.subskillIds);
      assert.deepEqual(publicRow.rows[0].provenance_ids, seeded.provenanceIds);
      assert.equal(publicRow.rows[0].domain_id, 'domain-a');
      assert.equal(publicRow.rows[0].created_by, 'synthetic-author');
      assert.ok(publicRow.rows[0].created_at);
      const provenanceRow = await pool.query(
        'SELECT origin, source_span, transformation, creator FROM tsa.question_provenance WHERE question_version_id = $1',
        [seeded.versionId],
      );
      assert.deepEqual(provenanceRow.rows[0], {
        origin: 'MANUAL', source_span: null, transformation: 'original synthesis', creator: 'synthetic-author',
      });
      const privateRow = await pool.query(
        'SELECT answer_key, explanation, evidence FROM tsa_private.question_secrets WHERE question_version_id = $1',
        [seeded.versionId],
      );
      assert.deepEqual(privateRow.rows[0].answer_key, { type: 'SINGLE_CHOICE', optionId: 'b' });
      assert.deepEqual(privateRow.rows[0].explanation, [{ type: 'text', text: 'Synthetic private explanation' }]);
      assert.equal((await pool.query('SELECT count(*)::integer AS count FROM tsa.question_versions WHERE id = $1', [seeded.versionId])).rows[0].count, 1);
    });

    await t.test('composite FKs reject cross-identity, taxonomy, rights and review references', async () => {
      const crossIdentityVersion = randomUUID();
      await expectSqlState(pool.query(
        `INSERT INTO tsa.question_versions
          (id, question_id, version_no, parent_version_id, schema_version, language, section,
           taxonomy_version_id, domain_id, skill_ids, subskill_ids, cognitive_level, difficulty,
           content, stimulus_version_id, interaction, origin, provenance_ids, created_by, created_at,
           content_hash, normalized_fingerprint)
         VALUES ($1, $2, 2, $3, 'question/1', 'vi-VN', 'MATH', $4, 'domain-a', '[]', '[]',
           NULL, '{"target":null,"predicted":null,"empiricalStudyId":null}', '[{"type":"text","text":"Q"}]',
           NULL, '{"type":"SINGLE_CHOICE","options":[]}', 'MANUAL', '["prov-a"]', 'author', $5, $6, $7)`,
        [crossIdentityVersion, seeded.parentCandidateId, seeded.versionId, seeded.taxonomyA,
          seeded.createdAt, HASH_A, HASH_B],
      ), '23503');

      const badTaxonomyVersion = randomUUID();
      const questionB = randomUUID();
      await query(pool, 'INSERT INTO tsa.questions (id) VALUES ($1)', [questionB]);
      await expectSqlState(pool.query(
        `INSERT INTO tsa.question_versions
          (id, question_id, version_no, schema_version, language, section, taxonomy_version_id,
           domain_id, skill_ids, subskill_ids, difficulty, content, interaction, origin,
           provenance_ids, created_by, created_at, content_hash, normalized_fingerprint)
         VALUES ($1, $2, 1, 'question/1', 'vi-VN', 'MATH', $3, 'missing-domain', '[]', '[]',
           '{"target":null,"predicted":null,"empiricalStudyId":null}', '[{"type":"text","text":"Q"}]',
           '{"type":"SINGLE_CHOICE"}', 'MANUAL', '["prov-a"]', 'author', $4, $5, $6)`,
        [badTaxonomyVersion, questionB, seeded.taxonomyA, seeded.createdAt, HASH_A, HASH_B],
      ), '23503');

      const badProvenanceVersion = randomUUID();
      await query(pool, 'INSERT INTO tsa.questions (id) VALUES ($1)', [badProvenanceVersion]);
      await query(pool,
        `INSERT INTO tsa.question_versions
          (id, question_id, version_no, schema_version, language, section, taxonomy_version_id,
           domain_id, skill_ids, subskill_ids, difficulty, content, interaction, origin,
           provenance_ids, created_by, created_at, content_hash, normalized_fingerprint)
         VALUES ($1, $2, 1, 'question/1', 'vi-VN', 'MATH', $3, 'domain-a', '[]', '[]',
           '{"target":null,"predicted":null,"empiricalStudyId":null}', '[{"type":"text","text":"Q"}]',
           '{"type":"SINGLE_CHOICE"}', 'MANUAL', '["prov-cross"]', 'author', $4, $5, $6)`,
        [badProvenanceVersion, badProvenanceVersion, seeded.taxonomyA, seeded.createdAt, HASH_A, HASH_B],
      );
      await expectSqlState(pool.query(
        `INSERT INTO tsa.question_provenance
          (question_version_id, provenance_id, ordinal, source_version_id, origin, transformation, creator, rights_decision_at_authoring)
         VALUES ($1, 'prov-cross', 0, $2, 'MANUAL', 'transform', 'author', $3)`,
        [badProvenanceVersion, seeded.sourceA.sourceVersionId, seeded.sourceB.rightsId],
      ), '23503');

      await expectSqlState(pool.query(
        `INSERT INTO tsa.validation_runs
          (id, question_version_id, input_hash, validator_version, kind, outcome, evidence, actor)
         VALUES ($1, $2, $3, 'validator/1', 'hard-check', 'PASS', '{}'::jsonb, 'synthetic-service')`,
        [randomUUID(), seeded.versionId, HASH_B],
      ), '23503');
      await expectSqlState(pool.query(
        `INSERT INTO tsa.reviews
          (id, question_version_id, content_hash, reviewer_id, decision, rubric, reason)
         VALUES ($1, $2, $3, $4, 'REJECT', '{}'::jsonb, 'wrong hash')`,
        [randomUUID(), seeded.versionId, HASH_B, seeded.reviewerId],
      ), '23503');

      const otherReview = randomUUID();
      await query(pool,
        `INSERT INTO tsa.reviews (id, question_version_id, content_hash, reviewer_id, decision, rubric, reason)
         VALUES ($1, $2, $3, $4, 'REJECT', '{}'::jsonb, 'other synthetic review')`,
        [otherReview, badProvenanceVersion, HASH_A, seeded.reviewerId],
      );
      await expectSqlState(pool.query(
        'UPDATE tsa.question_workflow SET approved_review_id = $1 WHERE question_version_id = $2',
        [otherReview, seeded.versionId],
      ), '23503');

      await expectSqlState(pool.query(
        'UPDATE tsa.questions SET eligible_version_id = $1 WHERE id = $2',
        [badProvenanceVersion, seeded.questionId],
      ), '23503');
    });

    await t.test('content and evidence rows reject updates and deletes', async () => {
      const validationId = randomUUID();
      await query(pool,
        `INSERT INTO tsa.validation_runs
          (id, question_version_id, input_hash, validator_version, kind, outcome, evidence, actor)
         VALUES ($1, $2, $3, 'validator/1', 'hard-check', 'PASS', '{}'::jsonb, 'synthetic-service')`,
        [validationId, seeded.versionId, HASH_A],
      );
      const cases = [
        ['UPDATE tsa.source_versions SET version_no = 2 WHERE id = $1', [seeded.sourceA.sourceVersionId]],
        ['DELETE FROM tsa.rights_decisions WHERE id = $1', [seeded.sourceA.rightsId]],
        ['UPDATE tsa.asset_versions SET byte_size = 13 WHERE id = $1', [seeded.assetId]],
        ['UPDATE tsa.taxonomy_versions SET version_no = 2 WHERE id = $1', [seeded.taxonomyA]],
        ['DELETE FROM tsa.taxonomy_nodes WHERE id = $1', [seeded.domainA]],
        ['UPDATE tsa.question_versions SET created_by = $2 WHERE id = $1', [seeded.versionId, 'changed']],
        ['DELETE FROM tsa_private.question_secrets WHERE question_version_id = $1', [seeded.versionId]],
        ['UPDATE tsa.validation_runs SET outcome = \'FAIL\' WHERE id = $1', [validationId]],
        ['UPDATE tsa.reviews SET reason = \'rewritten\' WHERE id = $1', [seeded.reviewId]],
        ['DELETE FROM tsa.bundle_members WHERE bundle_id = $1', [seeded.bundleId]],
      ];
      for (const [sql, values] of cases) await expectSqlState(pool.query(sql, values), '23514');
    });

    await t.test('least-privilege roles isolate private data and cannot publish from Factory', async () => {
      const privileges = await pool.query(`
        SELECT
          has_table_privilege('tsa_web', 'tsa_private.question_secrets', 'SELECT') AS web_secret,
          has_table_privilege('tsa_factory', 'tsa_private.question_secrets', 'SELECT') AS factory_secret,
          has_table_privilege('tsa_factory', 'tsa.users', 'SELECT') AS factory_users,
          has_table_privilege('tsa_factory', 'tsa.question_versions', 'SELECT') AS factory_questions,
          has_table_privilege('tsa_factory', 'tsa.question_workflow', 'UPDATE') AS factory_workflow,
          has_table_privilege('tsa_factory', 'tsa.questions', 'UPDATE') AS factory_pointer,
          has_table_privilege('tsa_exam', 'tsa_private.question_secrets', 'SELECT') AS exam_secret,
          has_table_privilege('tsa_factory', 'tsa.source_versions', 'SELECT') AS factory_sources
      `);
      assert.deepEqual(privileges.rows[0], {
        web_secret: false,
        factory_secret: false,
        factory_users: false,
        factory_questions: false,
        factory_workflow: false,
        factory_pointer: false,
        exam_secret: true,
        factory_sources: true,
      });
      const factorySourceRead = await withTransaction(pool, (client) => client.query(
        'SELECT metadata FROM tsa.source_versions WHERE id = $1', [seeded.sourceA.sourceVersionId],
      ), { role: 'tsa_factory' });
      assert.deepEqual(factorySourceRead.rows[0].metadata, {
        content: [{ type: 'text', text: 'versioned source content' }],
      });

      const secretlessVersionId = await seedSecretlessQuestionVersion(pool, seeded);
      await withTransaction(pool, (client) => client.query(
        `INSERT INTO tsa_private.question_secrets
          (question_version_id, answer_key, explanation, scoring_policy_version, evidence)
         VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::jsonb)`,
        [secretlessVersionId,
          JSON.stringify({ type: 'SINGLE_CHOICE', optionId: 'a' }),
          JSON.stringify([{ type: 'text', text: 'Synthetic private note' }]),
          'practice-binary-v1', JSON.stringify([])],
      ), { role: 'tsa_bank' });
      assert.equal((await pool.query(
        'SELECT count(*)::integer AS count FROM tsa_private.question_secrets WHERE question_version_id = $1',
        [secretlessVersionId],
      )).rows[0].count, 1);

      await expectSqlState(withTransaction(pool, (client) => client.query('SELECT * FROM tsa_private.question_secrets LIMIT 1'), { role: 'tsa_web' }), '42501');
      await expectSqlState(withTransaction(pool, (client) => client.query('UPDATE tsa.question_workflow SET state = \'APPROVED\''), { role: 'tsa_factory' }), '42501');
      await assert.rejects(withTransaction(pool, async () => {}, { role: 'postgres' }), /not allowlisted/);
    });

    await t.test('parameterized query treats SQL-looking text as data and transaction rolls back', async () => {
      const attackText = "synthetic'); DROP SCHEMA tsa CASCADE; --";
      const sourceId = randomUUID();
      await query(pool, 'INSERT INTO tsa.sources (id, title) VALUES ($1, $2)', [sourceId, attackText]);
      const row = await query(pool, 'SELECT title FROM tsa.sources WHERE id = $1', [sourceId]);
      assert.equal(row.rows[0].title, attackText);
      const transientUserId = randomUUID();
      await assert.rejects(withTransaction(pool, async (client) => {
        await client.query('INSERT INTO tsa.users (id, issuer, subject) VALUES ($1, $2, $3)', [transientUserId, 'synthetic', 'rollback']);
        throw new Error('force rollback');
      }), /force rollback/);
      const absent = await pool.query('SELECT count(*)::integer AS count FROM tsa.users WHERE id = $1', [transientUserId]);
      assert.equal(absent.rows[0].count, 0);
      assert.equal((await pool.query("SELECT to_regnamespace('tsa') IS NOT NULL AS exists")).rows[0].exists, true);
    });
  } finally {
    for (const directory of tempDirectories) await rm(directory, { recursive: true, force: true });
    await cluster.stop();
    await assert.rejects(access(clusterRoot), { code: 'ENOENT' });
  }
});

test('disposable PostgreSQL helper fails clearly when PG_BIN is invalid', async () => {
  await assert.rejects(
    startDisposablePostgres({ pgBin: '/path/that/does/not/contain/postgresql' }),
    /Required PostgreSQL executable initdb is missing/,
  );
});

test('withTransaction releases a checked-out client exactly once', async (t) => {
  await t.test('success commits and releases', async () => {
    const calls = [];
    const client = { query: async (sql) => { calls.push(sql); return { rows: [] }; }, release: (destroy) => calls.push(['release', destroy]) };
    const pool = { connect: async () => client };
    assert.equal(await withTransaction(pool, async () => 'done'), 'done');
    assert.deepEqual(calls, ['BEGIN', 'COMMIT', ['release', false]]);
  });
  await t.test('rollback failure discards the connection once', async () => {
    let released;
    let releaseCount = 0;
    const client = {
      query: async (sql) => {
        if (sql === 'ROLLBACK') throw new Error('rollback failed');
        return { rows: [] };
      },
      release: (destroy) => { released = destroy; releaseCount += 1; },
    };
    await assert.rejects(withTransaction({ connect: async () => client }, async () => { throw new Error('work failed'); }), /work failed/);
    assert.equal(released, true);
    assert.equal(releaseCount, 1);
  });
});

test('migrate discards a client when rollback or advisory unlock fails', async (t) => {
  await t.test('migration rollback failure marks connection for destruction', async () => {
    const migrationDirectory = await temporaryMigrationDirectory({ '001_failure.sql': 'SELECT 1;' });
    const calls = [];
    let released;
    const client = {
      query: async (sql) => {
        calls.push(sql);
        if (sql === 'CREATE SCHEMA IF NOT EXISTS tsa_meta') throw Object.assign(new Error('bootstrap'), { destroyClient: true });
        if (sql === 'ROLLBACK') throw new Error('rollback failed');
        if (sql.startsWith('SELECT pg_advisory_unlock')) return { rows: [{ unlocked: true }] };
        return { rows: [] };
      },
      release: (destroy) => { released = destroy; },
    };
    try {
      await assert.rejects(migrate({ connect: async () => client }, { directory: migrationDirectory }), /bootstrap/);
      assert.equal(released, true);
      assert.ok(calls.includes('ROLLBACK'));
    } finally {
      await rm(migrationDirectory, { recursive: true, force: true });
    }
  });
});
