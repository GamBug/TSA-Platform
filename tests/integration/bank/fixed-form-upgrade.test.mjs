import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAllocationFixture } from '../assembly/fixtures.mjs';
import { seedFixedReferenceRuns } from './fixed-reference-fixture.mjs';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { createFixedDiagnosticsService } from '../../../src/modules/bank/fixed-diagnostics.mjs';
import { createFixedFormSealingService } from '../../../src/modules/bank/fixed-form-sealing.mjs';
import { createFixedStockRehearsalService } from '../../../src/modules/bank/fixed-stock-rehearsals.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';

const migrations = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
const B7_SIGNATURE = 'tsa.bank_fixed_reference_snapshot(uuid,uuid)';
const ADDED_FUNCTIONS = new Set([
  'tsa.fixed_seal_inputs(uuid,uuid[])',
  'tsa.fixed_seal_commit(uuid,text,jsonb)',
  'tsa.fixed_form_snapshot(uuid,uuid)',
]);
const ADDED_POLICIES = new Set(['fixed_seal_receipt_scope', 'fixed_seal_receipt_current_role']);

async function snapshot(pool) {
  const tables = (await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema IN ('tsa','tsa_private') AND table_type='BASE TABLE'
    ORDER BY table_schema,table_name`)).rows;
  const result = {};
  for (const table of tables) {
    assert.match(table.table_name, /^[a-z_]+$/);
    const rows = (await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(t) AS value FROM "${table.table_schema}"."${table.table_name}" t) s`)).rows[0].rows;
    result[`${table.table_schema}.${table.table_name}`] = {
      count: rows.length,
      hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    };
  }
  return result;
}

async function functions(pool) {
  return Object.fromEntries((await pool.query(`SELECT p.oid::regprocedure::text AS signature,
      pg_get_functiondef(p.oid) AS definition,p.proowner::text AS owner,p.proacl::text AS acl,
      p.proconfig,p.prosecdef,p.provolatile
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN('tsa','tsa_private') ORDER BY p.oid`)).rows.map(({ signature, ...value }) => [signature, value]));
}

async function policies(pool) {
  return (await pool.query(`SELECT * FROM pg_policies WHERE schemaname IN('tsa','tsa_private')
    ORDER BY schemaname,tablename,policyname`)).rows;
}

async function tableGrants(pool) {
  return (await pool.query(`SELECT * FROM information_schema.role_table_grants
    WHERE table_schema IN('tsa','tsa_private')
    ORDER BY grantor,grantee,table_schema,table_name,privilege_type`)).rows;
}

function withoutObservedAt(value) {
  const { observedAt: _observedAt, ...stable } = value;
  return stable;
}

async function legacyOutputs(fixture, referenceRuns, rehearsalId) {
  const diagnostics = await createFixedDiagnosticsService({
    bankPool: fixture.bankPool,
    identityService: fixture.identityService,
  });
  const rehearsal = await createFixedStockRehearsalService({
    bankPool: fixture.bankPool,
    identityService: fixture.identityService,
  });
  const referenceDetails = {};
  for (const [name, run] of Object.entries(referenceRuns)) {
    referenceDetails[name] = await diagnostics.read(fixture.principals.bankManager, run.assemblyRunId);
  }
  return {
    diagnostics,
    rehearsal,
    references: {
      list: await diagnostics.list(fixture.principals.bankManager),
      details: referenceDetails,
    },
    rehearsalOutput: {
      list: await rehearsal.list(fixture.principals.bankManager),
      detail: await rehearsal.read(fixture.principals.bankManager, rehearsalId),
    },
  };
}

async function formGraph(pool, formId, attemptId, userId) {
  const form = (await pool.query('SELECT to_jsonb(f) AS value FROM tsa.forms f WHERE f.id=$1', [formId])).rows[0].value;
  const run = (await pool.query('SELECT to_jsonb(r) AS value FROM tsa.assembly_runs r WHERE r.id=$1', [form.assembly_run_id])).rows[0].value;
  const sections = (await pool.query('SELECT to_jsonb(s) AS value FROM tsa.form_sections s WHERE s.form_id=$1 ORDER BY s.ordinal', [formId])).rows.map((row) => row.value);
  const slots = (await pool.query(`SELECT to_jsonb(s) AS value,to_jsonb(secret) AS secret
    FROM tsa.form_slots s JOIN tsa_private.form_slot_secrets secret USING(form_id,slot_id)
    WHERE s.form_id=$1 ORDER BY s.ordinal`, [formId])).rows;
  const attempt = (await pool.query('SELECT to_jsonb(a) AS value FROM tsa.attempts a WHERE a.id=$1', [attemptId])).rows[0].value;
  const history = (await pool.query(`SELECT to_jsonb(h) AS value FROM tsa.student_question_history h
    WHERE h.user_id=$1 ORDER BY h.question_id`, [userId])).rows.map((row) => row.value);
  return { form, run, sections, slots, attempt, history };
}

test('populated 022 to 023 preserves personal, B7 and B8 state while filtering new seals from B7', { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tsa-fixed-form-upgrade-'));
  const old = path.join(directory, 'old');
  const target = path.join(directory, 'target');
  let fixture;
  try {
    await mkdir(old);
    await mkdir(target);
    for (const name of await readdir(migrations)) {
      if (!/^\d{3}_.*\.sql$/.test(name)) continue;
      if (name <= '022_explicit_review_practice.sql') {
        await copyFile(path.join(migrations, name), path.join(old, name));
        await copyFile(path.join(migrations, name), path.join(target, name));
      } else if (name === '023_fixed_form_sealing.sql') {
        await copyFile(path.join(migrations, name), path.join(target, name));
      }
    }

    fixture = await createAllocationFixture({ questionCount: 4, blueprintCount: 4, migrationDirectory: old });
    const personal = await createAllocationService({
      examPool: fixture.examPool,
      identityService: fixture.identityService,
    }).create(fixture.principals.studentA, randomUUID(), { blueprintVersionId: fixture.blueprint.versionId });
    assert.equal(personal.status, 201);
    assert.equal(personal.body.reuseMode, 'NEW_ONLY');

    const referenceRuns = await seedFixedReferenceRuns(fixture);
    const rehearsalService = await createFixedStockRehearsalService({
      bankPool: fixture.bankPool,
      identityService: fixture.identityService,
    });
    const rehearsal = await rehearsalService.create(fixture.principals.examManager, {
      blueprintVersionId: fixture.blueprint.versionId,
      blueprintHash: fixture.blueprint.contentHash,
      windowMinutes: 60,
    }, randomUUID());
    assert.equal(rehearsal.body.outcome, 'SUCCESS');

    const beforeOutputs = await legacyOutputs(fixture, referenceRuns, rehearsal.body.rehearsalId);
    const beforeRows = await snapshot(fixture.pool);
    const beforeFunctions = await functions(fixture.pool);
    const beforePolicies = await policies(fixture.pool);
    const beforeGrants = await tableGrants(fixture.pool);
    assert.equal(beforeFunctions[B7_SIGNATURE].prosecdef, true);
    assert.deepEqual(beforeFunctions[B7_SIGNATURE].proconfig, ['search_path=pg_catalog, tsa']);
    assert.equal((await fixture.pool.query("SELECT to_regclass('tsa_private.fixed_form_seals') AS relation")).rows[0].relation, null);

    assert.deepEqual((await migrate(fixture.pool, { directory: target })).applied, ['023_fixed_form_sealing.sql']);
    assert.deepEqual((await migrate(fixture.pool, { directory: target })).applied, []);

    const upgradedRows = await snapshot(fixture.pool);
    assert.equal(upgradedRows['tsa_private.fixed_form_seals'].count, 0);
    delete upgradedRows['tsa_private.fixed_form_seals'];
    assert.deepEqual(upgradedRows, beforeRows);

    const upgradedFunctions = await functions(fixture.pool);
    assert.deepEqual(Object.keys(upgradedFunctions).filter((signature) => !Object.hasOwn(beforeFunctions, signature)).sort(),
      [...ADDED_FUNCTIONS].sort());
    for (const [signature, prior] of Object.entries(beforeFunctions)) {
      const current = upgradedFunctions[signature];
      assert.ok(current, `Existing function disappeared: ${signature}`);
      if (signature === B7_SIGNATURE) {
        assert.notEqual(current.definition, prior.definition, 'B7 must add the no-form reference filter');
        const { definition: _definition, ...beforeMetadata } = prior;
        const { definition: _newDefinition, ...afterMetadata } = current;
        assert.deepEqual(afterMetadata, beforeMetadata, 'B7 owner, ACL, search path and security metadata must remain unchanged');
      } else {
        assert.deepEqual(current, prior, `Unrelated function changed: ${signature}`);
      }
    }

    const upgradedPolicies = await policies(fixture.pool);
    for (const prior of beforePolicies) {
      assert.deepEqual(upgradedPolicies.find((row) => row.schemaname === prior.schemaname &&
        row.tablename === prior.tablename && row.policyname === prior.policyname), prior,
      `Existing RLS policy changed: ${prior.schemaname}.${prior.tablename}.${prior.policyname}`);
    }
    const addedPolicies = upgradedPolicies.filter((row) => !beforePolicies.some((prior) =>
      prior.schemaname === row.schemaname && prior.tablename === row.tablename && prior.policyname === row.policyname));
    assert.deepEqual(addedPolicies.map((row) => row.policyname).sort(), [...ADDED_POLICIES].sort());
    const upgradedGrants = (await tableGrants(fixture.pool)).filter((grant) => grant.table_name !== 'fixed_form_seals');
    assert.deepEqual(upgradedGrants, beforeGrants, 'Migration must not widen any pre-existing table grants');

    const newFunctionAccess = (await fixture.pool.query(`SELECT p.oid::regprocedure::text AS signature,
        pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
        EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x
          WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute,
        has_function_privilege('tsa_bank',p.oid,'EXECUTE') AS bank_execute,
        has_function_privilege('tsa_exam',p.oid,'EXECUTE') AS exam_execute,
        has_function_privilege('tsa_web',p.oid,'EXECUTE') AS web_execute,
        has_function_privilege('tsa_factory',p.oid,'EXECUTE') AS factory_execute,
        has_function_privilege('tsa_identity',p.oid,'EXECUTE') AS identity_execute
      FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[]) ORDER BY p.oid`, [[...ADDED_FUNCTIONS]])).rows;
    assert.equal(newFunctionAccess.length, ADDED_FUNCTIONS.size);
    for (const row of newFunctionAccess) {
      assert.equal(row.owner, (await fixture.pool.query('SELECT current_user AS name')).rows[0].name);
      assert.equal(row.prosecdef, true);
      assert.deepEqual(row.proconfig, ['search_path=pg_catalog, tsa, tsa_private']);
      assert.equal(row.public_execute, false);
      assert.equal(row.bank_execute, true);
      for (const field of ['exam_execute', 'web_execute', 'factory_execute', 'identity_execute']) assert.equal(row[field], false);
    }
    for (const role of ['tsa_bank', 'tsa_exam', 'tsa_web', 'tsa_factory', 'tsa_identity']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal((await fixture.pool.query('SELECT has_table_privilege($1,$2,$3) AS allowed',
          [role, 'tsa_private.fixed_form_seals', privilege])).rows[0].allowed, false);
      }
    }

    const afterUpgradeOutputs = await legacyOutputs(fixture, referenceRuns, rehearsal.body.rehearsalId);
    assert.deepEqual(withoutObservedAt(afterUpgradeOutputs.references.list), withoutObservedAt(beforeOutputs.references.list));
    for (const name of Object.keys(referenceRuns)) {
      assert.deepEqual(withoutObservedAt(afterUpgradeOutputs.references.details[name]),
        withoutObservedAt(beforeOutputs.references.details[name]), `B7 detail changed for prior ${name} row`);
    }
    assert.deepEqual(withoutObservedAt(afterUpgradeOutputs.rehearsalOutput.list),
      withoutObservedAt(beforeOutputs.rehearsalOutput.list));
    assert.deepEqual(withoutObservedAt(afterUpgradeOutputs.rehearsalOutput.detail),
      withoutObservedAt(beforeOutputs.rehearsalOutput.detail));

    const personalBeforeSeal = await formGraph(fixture.pool, personal.body.formId, personal.body.attemptId,
      fixture.principals.studentA.userId);
    const sealing = await createFixedFormSealingService({
      bankPool: fixture.bankPool,
      identityService: fixture.identityService,
      enableCreation: true,
    });
    const sealed = await sealing.create(fixture.principals.examManager, {
      mode: 'PUBLISHED_FIXED',
      blueprintVersionId: fixture.blueprint.versionId,
      blueprintHash: fixture.blueprint.contentHash,
      windowMinutes: 60,
    }, randomUUID());
    assert.equal(sealed.status, 201);
    assert.equal(sealed.body.studentDeliverySupported, false);
    assert.deepEqual(await formGraph(fixture.pool, personal.body.formId, personal.body.attemptId,
      fixture.principals.studentA.userId), personalBeforeSeal, 'B9 must not alter prior personal form, attempt or history');

    const afterSealOutputs = await legacyOutputs(fixture, referenceRuns, rehearsal.body.rehearsalId);
    assert.deepEqual(withoutObservedAt(afterSealOutputs.references.list), withoutObservedAt(beforeOutputs.references.list),
      'New sealed run must not enter the B7 reference list');
    assert.equal(afterSealOutputs.references.list.runs.some((row) => row.assemblyRunId === sealed.body.assemblyRunId), false);
    for (const name of Object.keys(referenceRuns)) {
      assert.deepEqual(withoutObservedAt(afterSealOutputs.references.details[name]),
        withoutObservedAt(beforeOutputs.references.details[name]), `New seal changed prior B7 ${name} detail`);
    }
    await assert.rejects(afterSealOutputs.diagnostics.read(fixture.principals.bankManager, sealed.body.assemblyRunId),
      { status: 404, code: 'NOT_FOUND' });
    assert.deepEqual(withoutObservedAt(afterSealOutputs.rehearsalOutput.list),
      withoutObservedAt(beforeOutputs.rehearsalOutput.list), 'New B9 seal must not enter the B8 rehearsal list');
    assert.deepEqual(withoutObservedAt(afterSealOutputs.rehearsalOutput.detail),
      withoutObservedAt(beforeOutputs.rehearsalOutput.detail), 'New B9 seal must not alter the B8 receipt or replay');

    const finalCounts = (await fixture.pool.query(`SELECT
      (SELECT count(*)::int FROM tsa.forms) AS forms,
      (SELECT count(*)::int FROM tsa.assembly_runs) AS runs,
      (SELECT count(*)::int FROM tsa.attempts) AS attempts,
      (SELECT count(*)::int FROM tsa.student_question_history) AS history,
      (SELECT count(*)::int FROM tsa_private.fixed_form_seals) AS seals`)).rows[0];
    assert.deepEqual(finalCounts, { forms: 2, runs: 5, attempts: 1, history: 4, seals: 1 });
  } finally {
    const errors = [];
    for (const close of [() => fixture?.close(), () => rm(directory, { recursive: true, force: true })]) {
      try { await close(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Fixed-form upgrade test cleanup failed');
  }
});
