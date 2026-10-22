import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { canonicalize } from '../../../packages/contracts/dist/internal.js';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createAllocationService } from '../../../src/modules/assembly/allocation.mjs';
import { captureStandaloneManifest } from '../../../src/modules/assembly/candidate-stock.mjs';
import { buildAllocationPlan } from '../../../src/modules/assembly/snapshot-builder.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { createEquivalenceService } from '../../../src/modules/bank/equivalence.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { createBundleFixture } from './bundle-fixtures.mjs';

const LIMITS = { maxNodes: 50_000, maxUnits: 2_000 };
async function setup(t, options) { const f = await createBundleFixture(options); t.after(() => f.close()); return f; }
const request = (f) => ({ blueprintVersionId: f.blueprint.versionId });
const service = (f, examPool = f.examPool) => createAllocationService({ examPool, identityService: f.identityService });
const capture = (f, principal = f.principals.studentA) => captureStandaloneManifest({
  examPool: f.examPool, identityService: f.identityService, principal, blueprintVersionId: f.blueprint.versionId, seed: 7, limits: LIMITS,
});
const commit = (f, plan) => withTransaction(f.examPool, async (client) => {
  await client.query("SELECT set_config('tsa.local_user_id',$1,true)", [f.principals.studentA.userId]);
  return (await client.query('SELECT tsa.assembly_commit_personal($1,$2,$3) AS result', [randomUUID(), jsonDigest(request(f)), JSON.stringify(plan)])).rows[0].result;
}, { role: 'tsa_exam' });
const counts = async (f) => (await f.pool.query(`SELECT
  (SELECT count(*)::int FROM tsa.forms) AS forms,(SELECT count(*)::int FROM tsa.attempts) AS attempts,
  (SELECT count(*)::int FROM tsa.student_question_history) AS history,(SELECT count(*)::int FROM tsa.assembly_runs) AS runs`)).rows[0];
const empty = { forms: 0, attempts: 0, history: 0, runs: 0 };
async function relation(f, left, right, kind) {
  if (kind === 'ENEMY') return withTransaction(f.pool, async (client) => {
    // Owner-only disposable detector/adjudication fixture, not a new Bank API.
    await client.query('SELECT pg_advisory_xact_lock(1414742321,1)');
    await client.query('UPDATE tsa.bank_state SET eligibility_revision=eligibility_revision+1 WHERE id=1');
    const id = randomUUID(), versions = [left.versionId, right.versionId].sort();
    await client.query(`INSERT INTO tsa.duplicate_relations(id,left_version_id,right_version_id,kind,evidence,detector_version)
      VALUES($1,$2,$3,'ENEMY','{"syntheticOnly":true}','bundle-fixture/1')`, [id, ...versions]);
    await client.query(`UPDATE tsa.duplicate_relations SET resolution='CONFIRMED',resolved_by=$2,
      resolution_evidence='{"syntheticOnly":true}' WHERE id=$1`, [id, f.principals.reviewer.userId]);
  });
  const equivalence = await createEquivalenceService({ bankPool: f.bankPool, identityService: f.identityService });
  const revision = (await f.pool.query('SELECT eligibility_revision::text AS value FROM tsa.bank_state')).rows[0].value;
  return equivalence.adjudicate(f.principals.reviewer, randomUUID(), {
    left: { versionId: left.versionId, contentHash: left.contentHash, expectedRevision: 3 },
    right: { versionId: right.versionId, contentHash: right.contentHash, expectedRevision: 3 },
    kind, decision: 'CONFIRMED', expectedBankRevision: revision, reason: 'Original isolated shared-context conflict/history regression.',
  });
}
async function revoke(f, source) {
  const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
  return sources.registerRightsDecision(f.principals.bankManager, source.sourceVersionId, randomUUID(), {
    status: 'REVOKED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic fixture restriction only.', expectedRevision: 1,
  });
}
function pauseCommit(pool, after = false) {
  let resolveReached, release;
  const reached = new Promise((resolve) => { resolveReached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let intercepted = false;
  return { reached, release, pool: { async connect() {
    const client = await pool.connect();
    return new Proxy(client, { get(target, key) {
      if (key === 'query') return async (sql, args) => {
        if (typeof sql === 'string' && sql.includes('tsa.assembly_commit_personal') && !intercepted) {
          intercepted = true;
          if (after) { const result = await target.query(sql, args); resolveReached(JSON.parse(args[2])); await gate; return result; }
          resolveReached(JSON.parse(args[2])); await gate;
        }
        return target.query(sql, args);
      };
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } } };
}

test('complete ordered bundles feed frozen solver and seal exact immutable shared snapshots atomically', async (t) => {
  const f = await setup(t);
  const captured = await capture(f);
  assert.equal(captured.manifest.units.length, 2); assert.equal(captured.result.status, 'SUCCESS');
  for (const bundle of f.bundles) assert.deepEqual(captured.manifest.units.find((u) => u.id === bundle.id).members.map((m) => m.versionId), bundle.questions.map((q) => q.versionId));
  const result = await service(f).create(f.principals.studentA, randomUUID(), request(f));
  assert.equal(result.status, 201);
  const slots = (await f.pool.query('SELECT bundle_id,question_version_id,ordinal,public_snapshot FROM tsa.form_slots WHERE form_id=$1 ORDER BY ordinal', [result.body.formId])).rows;
  assert.equal(slots.length, 4);
  for (const bundle of f.bundles) {
    const members = slots.filter((slot) => slot.bundle_id === bundle.id);
    assert.deepEqual(members.map((slot) => slot.question_version_id), bundle.questions.map((q) => q.versionId));
    assert.equal(members[1].ordinal, members[0].ordinal + 1);
    for (const slot of members) assert.deepEqual(slot.public_snapshot.stimulus, { id: bundle.stimulusId, content: bundle.content });
  }
  assert.deepEqual(await counts(f), { forms: 1, attempts: 1, history: 4, runs: 1 });
  await assert.rejects(f.pool.query('UPDATE tsa.bundle_members SET ordinal=ordinal+10 WHERE bundle_id=$1', [f.bundles[0].id]), /immutable/i);
  await assert.rejects(f.pool.query("UPDATE tsa.stimulus_versions SET content='[]' WHERE id=$1", [f.bundles[0].stimulusVersionId]), /immutable/i);
});

for (const fault of ['unmaterialized', 'gapped-order', 'quarantine', 'stimulus-rights']) test(`a ${fault} bundle never contributes a partial unit`, async (t) => {
  const f = await setup(t, fault === 'unmaterialized' ? { materialize: false } : fault === 'gapped-order' ? { ordinals: [0, 2] } : undefined);
  if (fault === 'quarantine') await f.workflow.quarantine(f.principals.bankManager, f.bundles[0].questions[0].versionId, randomUUID(), { expectedRevision: 3, reason: 'Synthetic one-member quarantine.' });
  if (fault === 'stimulus-rights') await revoke(f, f.bundles[0].source);
  const captured = await capture(f);
  assert.ok(captured.manifest.units.every((unit) => unit.members.length === 2));
  assert.equal(captured.manifest.units.length, ['unmaterialized', 'gapped-order'].includes(fault) ? 0 : 1);
  await assert.rejects(service(f).create(f.principals.studentA, randomUUID(), request(f)), { code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  assert.deepEqual(await counts(f), empty);
});

test('one historically assigned member excludes its whole unit without excluding unrelated bundles', async (t) => {
  const f = await setup(t, { bundleCount: 3 });
  await f.pool.query('INSERT INTO tsa.student_question_history(user_id,question_id) VALUES($1,$2)', [f.principals.studentA.userId, f.bundles[0].questions[0].questionId]);
  const allocated = await service(f).create(f.principals.studentA, randomUUID(), request(f));
  const selected = (await f.pool.query('SELECT DISTINCT bundle_id FROM tsa.form_slots WHERE form_id=$1', [allocated.body.formId])).rows.map((r) => r.bundle_id);
  assert.equal(selected.length, 2); assert.equal(selected.includes(f.bundles[0].id), false);
});

test('historical current canonical equivalence excludes the whole bundle and preserves unseen-shortage precedence', async (t) => {
  const f = await setup(t);
  const prior = await f.createQuestion();
  await relation(f, prior, f.bundles[0].questions[0], 'EXACT');
  await f.pool.query('INSERT INTO tsa.student_question_history(user_id,question_id) VALUES($1,$2)', [f.principals.studentA.userId, prior.questionId]);
  await assert.rejects(service(f).create(f.principals.studentA, randomUUID(), request(f)), { code: 'INSUFFICIENT_UNSEEN_INVENTORY' });
  assert.deepEqual(await counts(f), { ...empty, history: 1 });
});

for (const internal of [true, false]) test(`${internal ? 'internal' : 'cross-unit'} confirmed enemy relations operate on complete units`, async (t) => {
  const f = await setup(t);
  await relation(f, f.bundles[0].questions[0], f.bundles[internal ? 0 : 1].questions[1], 'ENEMY');
  const captured = await capture(f);
  assert.equal(captured.manifest.units.length, internal ? 1 : 2);
  assert.equal(captured.manifest.conflicts.length, internal ? 0 : 1);
  if (!internal) assert.deepEqual(new Set(Object.values(captured.manifest.conflicts[0])), new Set(f.bundles.map((bundle) => bundle.id)));
  assert.equal(captured.result.status, 'FAILURE'); assert.deepEqual(await counts(f), empty);
});

for (const mutation of ['unit-identity', 'member-order']) test(`changed ${mutation} cannot pass freshness with identical flattened candidates`, async (t) => {
  const f = await setup(t); const captured = await capture(f); const plan = await buildAllocationPlan(f.examPool, f.principals.studentA, captured);
  if (mutation === 'unit-identity') plan.manifest.units[0].id = randomUUID(); else plan.manifest.units[0].members.reverse();
  plan.manifestBytes = Buffer.from(canonicalize(plan.manifest)).toString('utf8'); plan.manifestHash = jsonDigest(plan.manifest);
  assert.equal((await commit(f, plan)).status, 'STALE'); assert.deepEqual(await counts(f), empty);
});

for (const mutation of ['reorder', 'interleave', 'partial']) test(`SQL rejects ${mutation} selected bundle membership before persisting`, async (t) => {
  const f = await setup(t, { bundleCount: 3 }); const captured = await capture(f); const plan = await buildAllocationPlan(f.examPool, f.principals.studentA, captured);
  const slots = plan.result.slots;
  if (mutation === 'reorder') [slots[0], slots[1]] = [slots[1], slots[0]];
  if (mutation === 'interleave') [slots[1], slots[2]] = [slots[2], slots[1]];
  if (mutation === 'partial') {
    const other = captured.manifest.units.find((unit) => slots.every((slot) => slot.unitId !== unit.id));
    const member = other.members[0]; slots[3] = { ...slots[3], unitId: other.id, questionVersionId: member.versionId, questionId: member.questionId, contentHash: member.contentHash };
  }
  slots.forEach((slot, index) => { slot.ordinal = index; });
  await assert.rejects(commit(f, plan), (error) => error.code === '23514' && /Incomplete, reordered or interleaved/.test(error.message));
  assert.deepEqual(await counts(f), empty);
});

test('failure during the second bundle snapshot insert rolls back all allocation state', async (t) => {
  const f = await setup(t);
  await f.pool.query(`CREATE FUNCTION tsa.fail_bundle_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.ordinal=3 THEN RAISE EXCEPTION 'Synthetic bundle persistence failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_bundle_snapshot BEFORE INSERT ON tsa.form_slots FOR EACH ROW EXECUTE FUNCTION tsa.fail_bundle_snapshot()`);
  await assert.rejects(service(f).create(f.principals.studentA, randomUUID(), request(f)), { code: 'TEMPORARILY_UNAVAILABLE' });
  assert.deepEqual(await counts(f), empty);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM tsa.form_slots')).rows[0].n, 0);
});

test('stimulus rights restriction between snapshot capture and commit replans fail-closed without partial state', async (t) => {
  const f = await setup(t); const paused = pauseCommit(f.examPool); t.after(paused.release);
  const pending = service(f, paused.pool).create(f.principals.studentA, randomUUID(), request(f));
  const rejected = assert.rejects(pending, { code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  await paused.reached; await revoke(f, f.bundles[0].source); paused.release(); await rejected;
  assert.deepEqual(await counts(f), empty);
});

test('bundle metadata insertion changes revision and forces a fresh whole-unit capture before commit', async (t) => {
  const f = await setup(t, { bundleCount: 3, materialize: false });
  await f.bundles[0].materialize(); await f.bundles[1].materialize();
  const paused = pauseCommit(f.examPool); t.after(paused.release);
  const pending = service(f, paused.pool).create(f.principals.studentA, randomUUID(), request(f));
  const old = await paused.reached; assert.equal(old.manifest.units.length, 2);
  await f.bundles[2].materialize(); paused.release(); const result = await pending;
  const stored = (await f.pool.query('SELECT manifest FROM tsa.assembly_runs WHERE id=(SELECT assembly_run_id FROM tsa.forms WHERE id=$1)', [result.body.formId])).rows[0].manifest;
  assert.equal(stored.units.length, 3); assert.notEqual(stored.bankRevision, old.manifest.bankRevision);
  assert.deepEqual(await counts(f), { forms: 1, attempts: 1, history: 4, runs: 1 });
});

test('a bundle referencing a different immutable stimulus cannot select any mismatched member', async (t) => {
  const f = await setup(t, { mismatchedStimulus: true });
  assert.equal((await capture(f)).manifest.units.length, 1);
  await assert.rejects(service(f).create(f.principals.studentA, randomUUID(), request(f)), { code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  assert.deepEqual(await counts(f), empty);
});

test('a corrected eligible version cannot silently replace an immutable bundle member', async (t) => {
  const f = await setup(t);
  const corrected = await f.createQuestionVersion({ ...f.bundles[0].questions[0], source: f.source });
  const captured = await capture(f);
  assert.equal(captured.manifest.units.some((unit) => unit.id === f.bundles[0].id), false);
  assert.ok(captured.manifest.units.some((unit) => unit.id === corrected.versionId));
  await assert.rejects(service(f).create(f.principals.studentA, randomUUID(), request(f)), { code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  assert.deepEqual(await counts(f), empty);
});

async function waitForLock(f, application, queryPart) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const row = (await f.pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE $2`, [application, `%${queryPart}%`])).rows[0];
    if (row.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected concurrent writer did not wait on the actual PostgreSQL publication guard');
}

test('bundle metadata writer waits behind allocation commit and cannot rewrite an already sealed unit manifest', { timeout: 25_000 }, async (t) => {
  const f = await setup(t, { bundleCount: 3, materialize: false });
  await f.bundles[0].materialize(); await f.bundles[1].materialize();
  const paused = pauseCommit(f.examPool, true); t.after(paused.release);
  const pending = service(f, paused.pool).create(f.principals.studentA, randomUUID(), request(f));
  const plan = await paused.reached;
  const writer = f.bundles[2].materialize();
  try { await waitForLock(f, 'tsa-bank-core-test', 'INSERT INTO tsa.bundles'); }
  finally { paused.release(); }
  const result = await pending; await writer;
  const stored = (await f.pool.query('SELECT manifest FROM tsa.assembly_runs WHERE id=(SELECT assembly_run_id FROM tsa.forms WHERE id=$1)', [result.body.formId])).rows[0].manifest;
  assert.deepEqual(stored, plan.manifest); assert.equal(stored.units.length, 2);
  assert.equal((await capture(f, f.principals.studentB)).manifest.units.length, 3);
});

test('stimulus rights writer waits behind allocation then cancels its CREATED attempt without rewriting snapshots/history', { timeout: 25_000 }, async (t) => {
  const f = await setup(t); const paused = pauseCommit(f.examPool, true); t.after(paused.release);
  const pending = service(f, paused.pool).create(f.principals.studentA, randomUUID(), request(f));
  const plan = await paused.reached;
  const writer = revoke(f, f.bundles[0].source);
  try { await waitForLock(f, 'tsa-bank-api-test', 'pg_advisory_xact_lock'); }
  finally { paused.release(); }
  const result = await pending; await writer;
  const attempt = (await f.pool.query('SELECT state,cancellation_reason FROM tsa.attempts WHERE id=$1', [result.body.attemptId])).rows[0];
  assert.deepEqual(attempt, { state: 'CANCELLED', cancellation_reason: 'RIGHTS_BLOCKED' });
  const slots = (await f.pool.query('SELECT slot_id,snapshot_hash FROM tsa.form_slots WHERE form_id=$1 ORDER BY slot_id', [result.body.formId])).rows;
  assert.deepEqual(slots, plan.snapshots.map((snap) => ({ slot_id: snap.slotId, snapshot_hash: snap.publicHash })).sort((a,b) => a.slot_id < b.slot_id ? -1 : 1));
  assert.deepEqual(await counts(f), { forms: 1, attempts: 1, history: 4, runs: 1 });
});

test('duplicate canonical groups inside a bundle remove the whole unit', async (t) => {
  const f = await setup(t);
  await relation(f, f.bundles[0].questions[0], f.bundles[0].questions[1], 'EXACT');
  const captured = await capture(f); assert.equal(captured.manifest.units.length, 1);
  await assert.rejects(service(f).create(f.principals.studentA, randomUUID(), request(f)), { code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  assert.deepEqual(await counts(f), empty);
});

test('UNKNOWN stimulus rights do not gain delivery permission from current question approvals', async (t) => {
  const f = await setup(t);
  const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identityService });
  await sources.registerRightsDecision(f.principals.bankManager, f.bundles[0].source.sourceVersionId, randomUUID(), {
    status: 'UNKNOWN', allowedUses: ['GENERATE'], territory: ['VN'], validFrom: '2000-01-01T00:00:00Z', validTo: null,
    evidence: 'Synthetic rights evidence absent; no display permission.', expectedRevision: 1,
  });
  assert.equal((await capture(f)).manifest.units.length, 1);
  await assert.rejects(service(f).create(f.principals.studentA, randomUUID(), request(f)), { code: 'INSUFFICIENT_ELIGIBLE_INVENTORY' });
  assert.deepEqual(await counts(f), empty);
});

for (const dimension of ['source', 'skill']) test(`SQL ${dimension} caps count each bundle member rather than one per unit`, async (t) => {
  const f = await setup(t); const normal = await capture(f); const plan = await buildAllocationPlan(f.examPool, f.principals.studentA, normal);
  const config = structuredClone(f.blueprint.config);
  if (dimension === 'source') config.maxPerSource = 3; else config.quotas[0].max = 3;
  const id = randomUUID(), version = randomUUID();
  await f.pool.query('INSERT INTO tsa.blueprints(id,name) VALUES($1,$2)', [id, 'Synthetic member-count limit']);
  await f.pool.query(`INSERT INTO tsa.blueprint_versions(id,blueprint_id,taxonomy_version_id,version_no,schema_version,config,content_hash)
    VALUES($1,$2,$3,1,'blueprint/1',$4,$5)`, [version, id, config.taxonomyVersionId, config, jsonDigest(config)]);
  await f.pool.query(`INSERT INTO tsa.blueprint_offerings(blueprint_version_id,enabled,available_from,available_until,start_ttl_seconds)
    VALUES($1,true,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',600)`, [version]);
  const restricted = await captureStandaloneManifest({ examPool: f.examPool, identityService: f.identityService,
    principal: f.principals.studentA, blueprintVersionId: version, seed: 7, limits: LIMITS });
  assert.equal(restricted.result.status, 'FAILURE');
  // A forged SUCCESS with four otherwise eligible members must also fail at SQL.
  plan.manifest = restricted.manifest; plan.manifestBytes = Buffer.from(canonicalize(plan.manifest)).toString('utf8'); plan.manifestHash = jsonDigest(plan.manifest);
  await assert.rejects(commit(f, plan), (error) => error.code === '23514' && /Source cap exceeded|Selected quota invalid/.test(error.message));
  assert.deepEqual(await counts(f), empty);
});

test('rehashed forged stimulus snapshot is rejected against its exact immutable version with no partial state', async (t) => {
  const f = await setup(t); const plan = await buildAllocationPlan(f.examPool, f.principals.studentA, await capture(f));
  const snap = plan.snapshots[0];
  snap.publicSnapshot.stimulus.content = [{ type: 'text', text: 'Forged different immutable passage.' }];
  snap.publicBytes = Buffer.from(canonicalize(snap.publicSnapshot)).toString('utf8'); snap.publicHash = jsonDigest(snap.publicSnapshot);
  const form = JSON.parse(plan.formBytes); form.slots.find((slot) => slot.slotId === snap.slotId).publicHash = snap.publicHash;
  plan.formBytes = Buffer.from(canonicalize(form)).toString('utf8'); plan.formHash = jsonDigest(form);
  await assert.rejects(commit(f, plan), (error) => error.code === '23514' && /snapshot-version/.test(error.message));
  assert.deepEqual(await counts(f), empty);
});
