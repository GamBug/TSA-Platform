import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { createStudentDirectoryService } from '../../../src/modules/attempts/directory.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { MvpBlueprintConfigSchema } from '../../../packages/contracts/dist/internal.js';
import { createBundleFixture } from './bundle-fixtures.mjs';

async function registerBlueprint(fixture, { registered = false, wrongQuota = false } = {}) {
  const config = structuredClone(fixture.blueprint.config);
  config.name = `Synthetic READING20 experiment ${randomUUID()}`;
  const sectionId = 'reading-experiment';
  config.sections = [{ id: sectionId, section: 'READING', count: 20, durationSeconds: 1_800 }];
  config.quotas = [
    ...config.quotas.filter((quota) => quota.dimension !== 'COGNITIVE_LEVEL').map((quota) => ({ ...quota, sectionId })),
    { sectionId, dimension: 'COGNITIVE_LEVEL', value: 'M1', min: wrongQuota ? 7 : 8, max: wrongQuota ? 7 : 8 },
    { sectionId, dimension: 'COGNITIVE_LEVEL', value: 'M2', min: 6, max: 6 },
    { sectionId, dimension: 'COGNITIVE_LEVEL', value: 'M3', min: 6, max: 6 },
  ];
  const blueprintId = randomUUID();
  const versionId = randomUUID();
  const contentHash = jsonDigest(config);
  await fixture.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [blueprintId, config.name]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_versions
    (id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4::jsonb,$5)`,
  [versionId, blueprintId, config.taxonomyVersionId, JSON.stringify(config), contentHash]);
  await fixture.pool.query(`INSERT INTO tsa.blueprint_offerings
    (blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [versionId]);
  if (registered) await fixture.pool.query(`INSERT INTO tsa_private.reading_experiment_profiles
    (blueprint_version_id,blueprint_hash) VALUES($1,$2)`, [versionId, contentHash]);
  return { versionId, contentHash, config };
}

test('opt-in READING20 profile pin is private, exact and keeps shortage explicit', { timeout: 60_000 }, async (t) => {
  const fixture = await createBundleFixture({ section: 'READING', bundleCount: 2, memberCount: 2, durationSeconds: 1_800 });
  t.after(() => fixture.close());
  const validUnregistered = await registerBlueprint(fixture);
  const malformed = await registerBlueprint(fixture, { wrongQuota: true });
  const registered = await registerBlueprint(fixture, { registered: true });
  assert.equal(MvpBlueprintConfigSchema.safeParse(registered.config).success, false);

  await assert.rejects(fixture.pool.query(`INSERT INTO tsa_private.reading_experiment_profiles
    (blueprint_version_id,blueprint_hash) VALUES($1,$2)`, [malformed.versionId, malformed.contentHash]), { code: '22023' });
  assert.equal((await fixture.pool.query('SELECT tsa_private.reading_experiment_supported($1) AS supported', [registered.versionId])).rows[0].supported, true);
  assert.equal((await fixture.pool.query('SELECT tsa_private.reading_experiment_supported($1) AS supported', [malformed.versionId])).rows[0].supported, false);

  const unit = (levels) => ({ members: levels.map((cognitiveLevel) => ({ cognitiveLevel })) });
  const validLevels = [...Array(4).fill('M1'), ...Array(3).fill('M2'), ...Array(3).fill('M3')];
  const splitAggregateLeft = unit([...Array(8).fill('M1'), ...Array(2).fill('M2')]);
  const splitAggregateRight = unit([...Array(4).fill('M2'), ...Array(6).fill('M3')]);
  const unitChecks = await fixture.pool.query(`SELECT
    tsa_private.reading_experiment_unit_supported($1::jsonb) AS valid,
    tsa_private.reading_experiment_unit_supported($2::jsonb) AS wrong_size,
    tsa_private.reading_experiment_unit_supported($3::jsonb) AS split_left,
    tsa_private.reading_experiment_unit_supported($4::jsonb) AS split_right`,
  [JSON.stringify(unit(validLevels)), JSON.stringify(unit(['M1'])), JSON.stringify(splitAggregateLeft), JSON.stringify(splitAggregateRight)]);
  assert.deepEqual(unitChecks.rows[0], { valid: true, wrong_size: false, split_left: false, split_right: false });

  const directoryOff = createStudentDirectoryService({ examPool: fixture.examPool, identityService: fixture.identityService });
  const shortOnlyDirectory = createStudentDirectoryService({ examPool: fixture.examPool, identityService: fixture.identityService, enableShortPractice: true });
  const directoryOn = createStudentDirectoryService({ examPool: fixture.examPool, identityService: fixture.identityService,
    enableReadingExperiment: true, enableReviewPractice: true });
  const offPage = await directoryOff.catalog(fixture.principals.studentA);
  assert.deepEqual(offPage.items.map((item) => item.blueprintVersionId), [fixture.blueprint.versionId]);
  assert.deepEqual((await shortOnlyDirectory.catalog(fixture.principals.studentA)).items.map((item) => item.blueprintVersionId), [fixture.blueprint.versionId]);
  const onPage = await directoryOn.catalog(fixture.principals.studentA);
  assert.deepEqual(onPage.items.map((item) => item.blueprintVersionId).sort(),
    [fixture.blueprint.versionId, registered.versionId].sort());
  assert.equal(onPage.items.find((item) => item.blueprintVersionId === registered.versionId).reviewAllowed, false);
  assert.equal(onPage.items.some((item) => item.blueprintVersionId === validUnregistered.versionId), false);
  const firstPage = await directoryOn.catalog(fixture.principals.studentA, { limit: '1' });
  assert.ok(firstPage.nextCursor);
  const secondPage = await directoryOn.catalog(fixture.principals.studentA, { limit: '1', cursor: firstPage.nextCursor });
  assert.equal(secondPage.items.length, 1);
  assert.deepEqual([...firstPage.items, ...secondPage.items].map((item) => item.blueprintVersionId).sort(),
    [fixture.blueprint.versionId, registered.versionId].sort());
  assert.equal((await fixture.pool.query("SELECT has_table_privilege('tsa_exam','tsa_private.reading_experiment_profiles','SELECT') AS allowed")).rows[0].allowed, false);
  await assert.rejects(withTransaction(fixture.examPool, client => client.query('SELECT * FROM tsa_private.reading_experiment_profiles'), { role: 'tsa_exam' }), { code: '42501' });

  const options = { examPool: fixture.examPool, identityService: fixture.identityService };
  const disabled = createAllocationService(options);
  const enabled = createAllocationService({ ...options, enableReadingExperiment: true, enableReviewPractice: true });
  await assert.rejects(disabled.create(fixture.principals.studentA, randomUUID(), { blueprintVersionId: registered.versionId }),
    { status: 422, code: 'UNSUPPORTED_TYPE' });
  await assert.rejects(enabled.create(fixture.principals.studentA, randomUUID(), { blueprintVersionId: validUnregistered.versionId }),
    { status: 422, code: 'UNSUPPORTED_TYPE' });
  await assert.rejects(enabled.create(fixture.principals.studentA, randomUUID(), { blueprintVersionId: malformed.versionId }),
    { status: 422, code: 'UNSUPPORTED_TYPE' });
  await assert.rejects(enabled.create(fixture.principals.studentA, randomUUID(), {
    blueprintVersionId: registered.versionId, mode: 'PERSONALIZED_PRACTICE', reuseMode: 'REVIEW_ALLOWED', acknowledgeRepeats: true,
  }), { status: 422, code: 'UNSUPPORTED_TYPE' });

  await assert.rejects(enabled.create(fixture.principals.studentA, randomUUID(), { blueprintVersionId: registered.versionId }), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, 'INSUFFICIENT_ELIGIBLE_INVENTORY');
    assert.equal(error.details.blueprintVersionId, registered.versionId);
    return true;
  });
  const counts = (await fixture.pool.query(`SELECT
    (SELECT count(*)::integer FROM tsa.forms) AS forms,
    (SELECT count(*)::integer FROM tsa.attempts) AS attempts,
    (SELECT count(*)::integer FROM tsa.student_question_history) AS history`)).rows[0];
  assert.deepEqual(counts, { forms: 0, attempts: 0, history: 0 });
  await assert.rejects(fixture.pool.query('DELETE FROM tsa_private.reading_experiment_profiles WHERE blueprint_version_id=$1', [registered.versionId]));
});
