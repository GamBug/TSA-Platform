import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { createAttemptService } from '../../../src/modules/attempts/service.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';

const IMAGE_MIGRATION = '028_inspected_image_delivery.sql';

async function copyMigrations(source, target, maximum) {
  await mkdir(target);
  for (const name of await readdir(source)) {
    if (/^\d+_[a-z0-9_]+\.sql$/.test(name) && Number(name.slice(0, name.indexOf('_'))) <= maximum) {
      await copyFile(path.join(source, name), path.join(target, name));
    }
  }
}

async function tableRows(pool) {
  const tables = (await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema IN('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name`)).rows;
  const hashes = {};
  for (const { table_schema: schema, table_name: table } of tables) {
    const quote = (value) => `"${value.replaceAll('"', '""')}"`;
    const result = await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(t) AS value FROM ${quote(schema)}.${quote(table)} t) snapshot`);
    hashes[`${schema}.${table}`] = jsonDigest(result.rows[0].rows);
  }
  return hashes;
}

async function relationSecurity(pool) {
  return (await pool.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind,
      pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl,c.relrowsecurity AS row_security,
      c.relforcerowsecurity AS force_row_security
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN('tsa','tsa_private','tsa_meta') ORDER BY n.nspname,c.relname`)).rows;
}

async function policies(pool) {
  return (await pool.query(`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    FROM pg_policies WHERE schemaname IN('tsa','tsa_private','tsa_meta')
    ORDER BY schemaname,tablename,policyname`)).rows;
}

async function roleMemberships(pool) {
  return (await pool.query(`SELECT granted.rolname AS granted_role,member.rolname AS member_role,
      grantor.rolname AS grantor_role,m.admin_option,m.inherit_option,m.set_option
    FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid
    JOIN pg_roles member ON member.oid=m.member JOIN pg_roles grantor ON grantor.oid=m.grantor
    ORDER BY granted.rolname,member.rolname,grantor.rolname`)).rows;
}

async function functionSecurity(pool) {
  return (await pool.query(`SELECT p.oid::regprocedure::text AS signature,
      pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,p.proconfig AS config,
      p.prosecdef AS security_definer
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN('tsa','tsa_private','tsa_meta') ORDER BY p.oid`)).rows;
}

async function deliveryChecks(pool) {
  return (await pool.query(`SELECT question_version_id::text,input_hash,profile,checked_at::text
    FROM tsa_private.question_delivery_checks ORDER BY question_version_id`)).rows;
}

async function profileConstraint(pool) {
  return (await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='tsa_private.question_delivery_checks'::regclass
      AND conname='question_delivery_checks_profile_check'`)).rows[0]?.definition ?? null;
}

async function frozenAttemptHashes(pool, attemptId) {
  return (await pool.query(`SELECT a.id::text AS attempt_id,a.form_id::text AS form_id,a.state::text AS state,
      a.started_at::text AS started_at,a.deadline_at::text AS deadline_at,f.content_hash AS form_hash,
      slot.slot_id::text AS slot_id,slot.snapshot_hash,secret.secret_hash
    FROM tsa.attempts a JOIN tsa.forms f ON f.id=a.form_id
    JOIN tsa.form_slots slot ON slot.form_id=a.form_id
    JOIN tsa_private.form_slot_secrets secret ON secret.form_id=slot.form_id AND secret.slot_id=slot.slot_id
    WHERE a.id=$1 ORDER BY slot.ordinal`, [attemptId])).rows;
}

async function capture(pool, attemptId, attempts, principal) {
  const attempt = await attempts.read(principal, attemptId);
  const clock = (await pool.query(`SELECT state::text,started_at::text,deadline_at::text
    FROM tsa.attempts WHERE id=$1`, [attemptId])).rows[0];
  return {
    rows: await tableRows(pool),
    relations: await relationSecurity(pool),
    policies: await policies(pool),
    memberships: await roleMemberships(pool),
    functions: await functionSecurity(pool),
    deliveryChecks: await deliveryChecks(pool),
    profileConstraint: await profileConstraint(pool),
    frozenHashes: await frozenAttemptHashes(pool, attemptId),
    clock,
    answers: attempt.answers,
  };
}

function assertExistingSecurityUnchanged(before, after) {
  const relationMap = new Map(after.relations.map((row) => [`${row.schema}.${row.name}`, row]));
  for (const row of before.relations) {
    assert.deepEqual(relationMap.get(`${row.schema}.${row.name}`), row, `relation security ${row.schema}.${row.name}`);
  }
  const functionMap = new Map(after.functions.map((row) => [row.signature, row]));
  for (const row of before.functions) {
    assert.deepEqual(functionMap.get(row.signature), row, `function security ${row.signature}`);
  }
  assert.deepEqual(after.policies, before.policies, 'existing row-security policies remain unchanged');
  assert.deepEqual(after.memberships, before.memberships, 'role memberships remain unchanged');
}

function assertExistingDataUnchanged(before, after) {
  const afterRows = { ...after.rows };
  delete afterRows['tsa_private.asset_inspections'];
  assert.deepEqual(afterRows, before.rows, 'all preexisting tsa and tsa_private table rows remain unchanged');
  assert.deepEqual(after.deliveryChecks, before.deliveryChecks, 'legacy delivery checks remain unchanged');
  assert.deepEqual(after.frozenHashes, before.frozenHashes, 'form and question snapshot hashes remain unchanged');
  assert.deepEqual(after.clock, before.clock, 'saved attempt state and clocks remain unchanged');
  assert.deepEqual(after.answers, before.answers, 'saved answers remain readable and unchanged');
  assertExistingSecurityUnchanged(before, after);
}

test('inspected-image migration rolls back on failure, preserves populated 027 state, and replays inertly', { timeout: 120000 }, async (t) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'tsa-image-migration-'));
  let fixture;
  t.after(async () => {
    try { await fixture?.close(); }
    finally { await rm(scratch, { recursive: true, force: true }); }
  });

  const sourceMigrations = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
  const baselineDirectory = path.join(scratch, 'baseline-027');
  const failedDirectory = path.join(scratch, 'failed-028');
  const targetDirectory = path.join(scratch, 'target-028');
  await copyMigrations(sourceMigrations, baselineDirectory, 27);
  await copyMigrations(sourceMigrations, failedDirectory, 27);
  await copyMigrations(sourceMigrations, targetDirectory, 28);

  fixture = await createAllocationFixture({ questionCount: 4, migrationDirectory: baselineDirectory });
  const principal = fixture.principals.studentA;
  const allocator = createAllocationService({ examPool: fixture.examPool, identityService: fixture.identityService });
  const rate = { capacity: 100, refillPerSecond: 10 };
  const attempts = createAttemptService({ examPool: fixture.examPool, identityService: fixture.identityService,
    createRate: rate, saveRate: { user: rate, attempt: rate } });
  const idempotencyKey = randomUUID();
  const input = { blueprintVersionId: fixture.blueprint.versionId };
  const created = await allocator.create(principal, idempotencyKey, input);
  await attempts.start(principal, created.body.attemptId, randomUUID(), {});
  const view = await attempts.read(principal, created.body.attemptId);
  await attempts.save(principal, view.attemptId, view.slots[0].slotId, randomUUID(), {
    expectedRevision: 0,
    value: { type: 'SINGLE_CHOICE', optionId: 'b' },
  });

  const beforeFailure = await capture(fixture.pool, view.attemptId, attempts, principal);
  assert.equal(beforeFailure.clock.state, 'IN_PROGRESS');
  assert.ok(beforeFailure.clock.started_at && beforeFailure.clock.deadline_at);
  assert.ok(beforeFailure.answers.length > 0);
  assert.ok(beforeFailure.deliveryChecks.length > 0);
  assert.ok(beforeFailure.deliveryChecks.every((row) => row.profile === 'text-math-table/1'));
  assert.ok(beforeFailure.frozenHashes.length > 0);
  assert.match(beforeFailure.profileConstraint, /text-math-table\/1/);
  assert.doesNotMatch(beforeFailure.profileConstraint, /inspected-image/);

  const connectionConfig = fixture.harness.database.connectionConfig;
  await backupLocalDatabase({ connectionConfig, directory: path.join(scratch, 'before-failed-migration') });
  const originalImageMigration = await readFile(path.join(sourceMigrations, IMAGE_MIGRATION), 'utf8');
  await writeFile(path.join(failedDirectory, IMAGE_MIGRATION), `${originalImageMigration}\nSELECT 1 / 0;\n`, { flag: 'wx' });
  await assert.rejects(migrate(fixture.pool, { directory: failedDirectory }), /division by zero/i);

  const afterFailure = await capture(fixture.pool, view.attemptId, attempts, principal);
  assert.deepEqual(afterFailure, beforeFailure, 'the failed migration transaction leaves populated 027 state intact');
  assert.equal((await fixture.pool.query("SELECT to_regclass('tsa_private.asset_inspections') IS NOT NULL AS exists")).rows[0].exists, false);
  assert.equal((await fixture.pool.query(`SELECT count(*)::int AS count FROM tsa_meta.schema_migrations
    WHERE version=$1`, [IMAGE_MIGRATION])).rows[0].count, 0);

  await backupLocalDatabase({ connectionConfig, directory: path.join(scratch, 'before-image-upgrade') });
  const upgraded = await migrate(fixture.pool, { directory: targetDirectory });
  assert.deepEqual(upgraded.applied, [IMAGE_MIGRATION]);
  const afterUpgrade = await capture(fixture.pool, view.attemptId, attempts, principal);
  assertExistingDataUnchanged(beforeFailure, afterUpgrade);
  assert.ok(afterUpgrade.profileConstraint.includes('text-math-table-inspected-image/2'));
  assert.equal((await fixture.pool.query('SELECT count(*)::int AS count FROM tsa_private.asset_inspections')).rows[0].count, 0,
    'the additive inspection table is not backfilled');
  for (const role of ['tsa_exam','tsa_factory','tsa_bank','tsa_web','tsa_identity','tsa_exam_worker']) {
    const access = (await fixture.pool.query(`SELECT
      has_function_privilege($1,'tsa.exam_attempt_asset(uuid,uuid,text)','EXECUTE') AS asset,
      has_table_privilege($1,'tsa_private.asset_inspections','SELECT') AS evidence_read,
      has_table_privilege($1,'tsa_private.asset_inspections','UPDATE,DELETE') AS evidence_change`, [role])).rows[0];
    assert.deepEqual(access, { asset: role === 'tsa_exam', evidence_read: role === 'tsa_bank', evidence_change: false }, `${role} has only its narrow new capability`);
  }

  assert.equal((await allocator.create(principal, idempotencyKey, input)).body.attemptId, view.attemptId,
    'the pre-migration allocation receipt still replays to the same attempt');
  assert.deepEqual((await migrate(fixture.pool, { directory: targetDirectory })).applied, [], 'replay applies no migration');
  const afterReplay = await capture(fixture.pool, view.attemptId, attempts, principal);
  assert.deepEqual(afterReplay, afterUpgrade, 'migration replay leaves data and security state unchanged');
});
