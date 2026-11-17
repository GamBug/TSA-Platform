import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { before, after, test } from 'node:test';
import { createManualFactoryImportService, reconcileManualFactoryImportAdmission } from '../../../src/modules/bank/manual-import-coordinator.mjs';
import { createFactoryImportService } from '../../../src/modules/bank/factory-import.mjs';
import { createQuestionService } from '../../../src/modules/bank/questions.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { buildSyntheticFactoryPackageV2 } from '../../../packages/contracts/test/fixtures/factory-package-v2.ts';
import { resolveOriginalImportAttribution } from '../../../src/modules/bank/import-attribution.mjs';
import { createReviewContextService } from '../../../src/modules/bank/review-context.mjs';
import { createReviewEvidenceService } from '../../../src/modules/bank/review-evidence.mjs';
import { createDatasetPreflightService } from '../../../src/modules/bank/dataset-preflight-service.mjs';
import { jsonDigest, resolveReferenceGraph } from '../../../src/modules/bank/common.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { prepareManualDraftTransport } from '../../../tools/question-factory/manual-transport.mjs';
import { createPrototypeServer } from '../../../apps/practice-prototype/server.mjs';
import { createBankHandler } from '../../../src/http/bank.mjs';
import { createManualImportFixture, manualPackage, manualConfiguration, applicationSnapshot } from './manual-import-fixture.mjs';

let f;
const capability = Object.freeze({});
before(async () => { f = await createManualImportFixture(); });
after(async () => { await f?.close(); });

async function start(prepared, overrides = {}) {
  const config = await manualConfiguration(f, prepared);
  const options = { bankPool: f.bankPool, identityService: f.identity, internalCapability: capability,
    enabled: true, env: f.env, configurationDirectory: config.directory,
    approvedActivationHash: config.approvedActivationHash, approvedConfigurationScopeHash: config.approvedConfigurationScopeHash, ...overrides };
  const service = await createManualFactoryImportService(options); f.services.push(service);
  return { service, config, options };
}
const intake = (service, prepared, request = f.author.request, cap = capability) =>
  service.importManualFactoryPackageV3(request, prepared.package, cap);

async function waitFor(predicate, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await predicate(); if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function blockAdmissions() {
  const blocker = await f.database.pool.connect();
  await blocker.query('BEGIN'); await blocker.query('SELECT pg_advisory_xact_lock(1414742321,1)');
  return async () => { await blocker.query('ROLLBACK'); blocker.release(); };
}
const waitingBackend = () => waitFor(async () => (await f.database.pool.query(`SELECT pid FROM pg_stat_activity
  WHERE application_name='tsa-manual-bank-test' AND wait_event_type='Lock'
  AND query LIKE '%pg_advisory_xact_lock%'`)).rows[0]?.pid, 'manual coordinator transaction guard');

test('manual preparation checks existing registrations and writes private exact evidence without application mutations', async () => {
  const p = await manualPackage(f);
  const baseline = await applicationSnapshot(f.database.pool);
  const args = { bankPool: f.bankPool, identityService: f.identity, request: f.author.request,
    capability, internalCapability: capability, enabled: true, env: f.env,
    mapping: p.mapping, artifactPaths: p.artifactPaths, outputDirectory: join(p.directory, 'prepared'),
    manualRunId: p.manualRunId, permissionId: p.permissionId, authoringId: p.authoringId,
    transformation: p.transformation };
  const prepared = await prepareManualDraftTransport(args);
  assert.deepEqual(prepared.package, p.package);
  assert.equal(prepared.receipt.bankImported, false);
  assert.equal(prepared.receipt.usage, null);
  assert.equal((await stat(join(prepared.directory, 'package.json'))).mode & 0o077, 0);
  assert.equal((await stat(prepared.directory)).mode & 0o077, 0);
  await assert.rejects(prepareManualDraftTransport({ ...args, request: f.student.request, outputDirectory: join(p.directory, 'denied') }));
  await assert.rejects(prepareManualDraftTransport({ ...args, mapping: { ...p.mapping, registeredAuthorId: randomUUID() }, outputDirectory: join(p.directory, 'unknown') }));
  assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
});

test('one complete manual bundle imports atomically as ten private DRAFTs with exact evidence and receipts', async () => {
  const p = await manualPackage(f);
  const { service } = await start(p);
  try {
    const first = await intake(service, p);
    assert.equal(first.replayed, false); assert.equal(first.receipts.length, 10);
    const beforeReplay = await applicationSnapshot(f.database.pool);
    assert.deepEqual(await intake(service, p), { receipts: first.receipts, replayed: true });
    assert.deepEqual(await applicationSnapshot(f.database.pool), beforeReplay);
    const ids = p.package.candidates.map((c) => c.question.id);
    const rows = await f.database.pool.query(`SELECT qv.*,qw.state::text AS workflow_state,
      q.eligible_version_id,run.run_metadata,run.external_generation_run_id
      FROM tsa.question_versions qv JOIN tsa.questions q ON q.id=qv.question_id
      JOIN tsa.question_workflow qw ON qw.question_version_id=qv.id
      JOIN tsa_private.factory_import_runs run ON run.question_version_id=qv.id WHERE qv.id=ANY($1::uuid[])`, [ids]);
    assert.equal(rows.rowCount, 10);
    for (const row of rows.rows) {
      assert.equal(row.workflow_state, 'DRAFT'); assert.equal(row.eligible_version_id, null);
      assert.equal(row.generation_run_id, null); assert.equal(row.external_generation_run_id, null);
      assert.deepEqual(row.run_metadata, p.package.manualRun);
      const graph = await resolveReferenceGraph(f.database.pool, row.reference_namespace, [{ kind: 'question', id: row.id }]);
      for (const field of ['sourcePermissions', 'sourceAuthoring']) assert.ok(graph.some((n) => jsonDigest(n.payload) === jsonDigest(p.package[field][0])));
      assert.deepEqual(await resolveOriginalImportAttribution(f.database.pool, { id: row.id, reference_namespace: row.reference_namespace }),
        { id: row.id, reference_namespace: row.reference_namespace, producer_namespace: p.package.producerNamespace, operator_id: f.author.principal.userId });
    }
    const gates = await f.database.pool.query(`SELECT
      (SELECT count(*)::int FROM tsa.reviews WHERE question_version_id=ANY($1::uuid[])) AS reviews,
      (SELECT count(*)::int FROM tsa.question_provenance WHERE question_version_id=ANY($1::uuid[]) AND rights_decision_at_authoring IS NOT NULL) AS rights_claims,
      (SELECT count(*)::int FROM tsa.source_rights sr JOIN tsa.question_provenance qp ON qp.source_version_id=sr.source_version_id WHERE qp.question_version_id=ANY($1::uuid[])) AS rights`, [ids]);
    assert.deepEqual(gates.rows[0], { reviews: 0, rights_claims: 0, rights: 0 });
    const selection = await f.database.pool.query('SELECT count(*)::int AS selectable FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND tsa.bank_question_selection_allowed(id)', [ids]);
    assert.equal(selection.rows[0].selectable, 0);
    const context = await createReviewContextService({ bankPool: f.bankPool, identityService: f.identity });
    const inspection = await context.read(f.manager.principal, ids[0]);
    assert.equal(inspection.preview.status, 'BLOCKED'); assert.equal(inspection.preview.reason, 'RIGHTS_BLOCKED');
    const evidence = await createReviewEvidenceService({ bankPool: f.bankPool, identityService: f.identity });
    assert.equal((await evidence.read(f.manager.principal, ids[0])).sources[0].currentDecision, null);
    const preflight = await createDatasetPreflightService({ bankPool: f.bankPool, identityService: f.identity });
    const report = await preflight.preflight(f.manager.principal, { versions: first.receipts.map((r) => ({ versionId: r.questionVersionId, contentHash: r.inputHash })) });
    assert.equal(report.databaseSnapshot.versions.length, 10);
    const changed = structuredClone(p.package); changed.manualRun.declaredModel = 'changed';
    await assert.rejects(service.importManualFactoryPackageV3(f.author.request, changed, capability));
    const v2 = buildSyntheticFactoryPackageV2();
    v2.producerNamespace = p.package.producerNamespace; v2.batchKey = randomUUID();
    const legacy = await createFactoryImportService({ bankPool: f.bankPool, identityService: f.identity, internalCapability: capability });
    await assert.rejects(legacy.importFactoryPackageV2(f.author.principal, v2, capability), /IMPORT_PRODUCER_CONFLICT/);
    assert.deepEqual(await applicationSnapshot(f.database.pool), beforeReplay);
  } finally { assert.equal((await service.stop()).status, 'STOPPED'); }
});

test('startup is disabled by default, a second importer is denied, and idle manual locking leaves Bank work available', async () => {
  const p = await manualPackage(f);
  const disabled = await createManualFactoryImportService({ bankPool: f.bankPool, identityService: f.identity, internalCapability: capability });
  await assert.rejects(intake(disabled, p), /MANUAL_IMPORT_DISABLED/);
  const { service, options } = await start(p);
  try {
    await assert.rejects(createManualFactoryImportService(options), /MANUAL_IMPORT_COORDINATOR_ACTIVE/);
    await withTransaction(f.bankPool, async (client) => {
      const result = await client.query('SELECT pg_try_advisory_xact_lock(1414742321,1) AS available');
      assert.equal(result.rows[0].available, true);
    }, { role: 'tsa_bank' });
  } finally { await service.stop(); }
  await assert.rejects(createManualFactoryImportService(options), /RETIRED|CONFIGURATION/);
});

test('later manual batches reuse a source without rewriting its original private attribution', async () => {
  const first = await manualPackage(f);
  const a = await start(first);
  await intake(a.service, first); await a.service.stop();
  const original = (await f.database.pool.query(`SELECT sv.id,sv.metadata FROM tsa.source_versions sv
    JOIN tsa_private.factory_external_mappings m ON m.local_id=sv.id
    WHERE m.producer_namespace=$1 AND m.external_kind='source'`, [first.package.producerNamespace])).rows[0];
  const second = await manualPackage(f, { producerNamespace: first.package.producerNamespace });
  const b = await start(second);
  try {
    await intake(b.service, second);
    const reused = await f.database.pool.query(`SELECT sv.id,sv.metadata FROM tsa.source_versions sv
      JOIN tsa_private.factory_external_mappings m ON m.local_id=sv.id
      WHERE m.producer_namespace=$1 AND m.external_kind='source'`, [first.package.producerNamespace]);
    assert.equal(reused.rowCount, 1); assert.deepEqual(reused.rows[0], original);
    const q = second.package.candidates[0].question;
    const row = (await f.database.pool.query('SELECT id,reference_namespace FROM tsa.question_versions WHERE id=$1', [q.id])).rows[0];
    const attribution = await resolveOriginalImportAttribution(f.database.pool, row);
    assert.equal(attribution.operator_id, f.author.principal.userId);
    const inspection = await createReviewContextService({ bankPool: f.bankPool, identityService: f.identity });
    assert.equal((await inspection.read(f.manager.principal, q.id)).preview.reason, 'RIGHTS_BLOCKED');
    assert.equal((await intake(b.service, second)).replayed, true);
  } finally { await b.service.stop(); }
});

test('a local correction preserves its imported manual ancestor and reconstructs private review without granting rights', async () => {
  const p = await manualPackage(f);
  const { service } = await start(p);
  try {
    await intake(service, p);
    const original = p.package.candidates[0].question;
    const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identity });
    const source = (await sources.registerSource(f.author.principal, randomUUID(), { title: 'Synthetic correction only', canonicalUri: null, origin: 'EXTERNAL' })).body;
    const version = (await sources.registerSourceVersion(f.author.principal, source.sourceId, randomUUID(), { contentHash: jsonDigest('synthetic correction'), evidenceUri: 'manual://synthetic-correction', metadata: {} })).body;
    const rights = (await sources.registerRightsDecision(f.manager.principal, version.sourceVersionId, randomUUID(), {
      status: 'UNKNOWN', allowedUses: ['DISPLAY', 'GENERATE'], territory: ['LOCAL_SYNTHETIC_ONLY'],
      validFrom: '2020-01-01T00:00:00Z', validTo: null, evidence: 'Synthetic UNKNOWN record; no grant asserted.', expectedRevision: 0,
    })).body;
    const questions = await createQuestionService({ bankPool: f.bankPool, identityService: f.identity });
    const domain = f.taxonomy.nodes.find((node) => node.kind === 'DOMAIN');
    const skill = f.taxonomy.nodes.find((node) => node.kind === 'SKILL');
    const corrected = (await questions.createQuestionDraftVersion(f.author.principal, original.questionId, randomUUID(), {
      parentVersionId: original.id, draft: { schemaVersion: 'question/1', language: 'vi-VN', section: 'READING',
        taxonomyVersionId: f.taxonomy.taxonomyVersionId, domainId: domain.id, skillIds: [skill.id], subskillIds: [],
        cognitiveLevel: 'M1', targetDifficulty: null, content: [{ type: 'text', text: 'Synthetic immutable correction' }], stimulusVersionId: null,
        interaction: original.interaction, answerKey: original.private.answerKey, explanation: original.private.explanation,
        evidenceRefs: [rights.decisionId], origin: 'IMPORTED',
        provenance: [{ sourceVersionId: version.sourceVersionId, span: null, transformation: 'Synthetic correction only' }] },
    })).body;
    const context = await createReviewContextService({ bankPool: f.bankPool, identityService: f.identity });
    const result = await context.read(f.manager.principal, corrected.versionId);
    assert.equal(result.version.parentVersionId, original.id); assert.equal(result.preview.reason, 'RIGHTS_BLOCKED');
    const stored = (await f.database.pool.query('SELECT content_hash,reference_namespace FROM tsa.question_versions WHERE id=$1', [original.id])).rows[0];
    assert.equal(stored.content_hash, original.contentHash);
    const attribution = await resolveOriginalImportAttribution(f.database.pool, { id: original.id, reference_namespace: stored.reference_namespace });
    assert.equal(attribution.operator_id, f.author.principal.userId);
  } finally { await service.stop(); }
});

test('foreign actors, missing capability, expired activation and revoked current author session produce no application writes', async () => {
  const p = await manualPackage(f);
  const { service, config: activeConfig } = await start(p);
  try {
    const baseline = await applicationSnapshot(f.database.pool);
    const journal = await readFile(join(activeConfig.directory, 'admissions.ndjson')).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    for (const [request, cap] of [[f.student.request, capability], [f.manager.request, capability], [f.author.request, {}]]) {
      await assert.rejects(intake(service, p, request, cap));
    }
    assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
    assert.deepEqual(await readFile(join(activeConfig.directory, 'admissions.ndjson')).catch((error) => { if (error.code === 'ENOENT') return null; throw error; }), journal);
    const temporary = await f.actor('author');
    await f.identity.revoke(temporary.principal);
    const afterRevoke = await applicationSnapshot(f.database.pool);
    await assert.rejects(intake(service, p, temporary.request));
    assert.deepEqual(await applicationSnapshot(f.database.pool), afterRevoke);
  } finally { await service.stop(); }
  const config = await manualConfiguration(f, p, { validUntil: '2021-01-01T00:00:00Z' });
  const expired = await createManualFactoryImportService({ bankPool: f.bankPool, identityService: f.identity, internalCapability: capability,
    enabled: true, env: f.env, configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
    approvedConfigurationScopeHash: config.approvedConfigurationScopeHash });
  f.services.push(expired);
  const baseline = await applicationSnapshot(f.database.pool);
  try { await assert.rejects(intake(expired, p), /NOT_ACTIVE/); assert.deepEqual(await applicationSnapshot(f.database.pool), baseline); }
  finally { await expired.stop(); }
});

test('a late member failure rolls back every application row, then the same package can import intact', async () => {
  const p = await manualPackage(f);
  const { service } = await start(p);
  const last = p.package.candidates[9].question.id;
  const baseline = await applicationSnapshot(f.database.pool);
  try {
    await f.database.pool.query(`CREATE FUNCTION tsa_private.reject_manual_test_member() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='${last}'::uuid THEN RAISE EXCEPTION 'Synthetic late member fault'; END IF; RETURN NEW; END $$`);
    await f.database.pool.query('CREATE TRIGGER reject_manual_test_member BEFORE INSERT ON tsa.question_versions FOR EACH ROW EXECUTE FUNCTION tsa_private.reject_manual_test_member()');
    await assert.rejects(intake(service, p), /Synthetic late member fault/);
    assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
    await f.database.pool.query('DROP TRIGGER reject_manual_test_member ON tsa.question_versions');
    await f.database.pool.query('DROP FUNCTION tsa_private.reject_manual_test_member()');
    assert.equal((await intake(service, p)).receipts.length, 10);
  } finally {
    await f.database.pool.query('DROP TRIGGER IF EXISTS reject_manual_test_member ON tsa.question_versions');
    await f.database.pool.query('DROP FUNCTION IF EXISTS tsa_private.reject_manual_test_member()');
    await service.stop();
  }
});

test('unexpected configuration mutation stops admission and cannot acknowledge a clean retirement', async () => {
  const p = await manualPackage(f);
  const { service, config } = await start(p);
  const baseline = await applicationSnapshot(f.database.pool);
  await writeFile(join(config.directory, 'mapping.json'), '{}', { mode: 0o600 });
  await assert.rejects(intake(service, p), /CONFIGURATION_CHANGED/);
  assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
  assert.equal((await service.stop()).status, 'UNSAFE_RECONCILIATION_REQUIRED');
});

test('stop rejects queued work, drains the admitted transaction, retires before acknowledgment and denies stale restart', async () => {
  const p = await manualPackage(f);
  const { service, options, config } = await start(p);
  const unblock = await blockAdmissions();
  let released = false;
  try {
    const first = intake(service, p);
    await waitingBackend();
    const queued = intake(service, p);
    const queuedDenied = assert.rejects(queued, /STOPPED/);
    await waitFor(() => service.status().queued === 1, 'queued manual replay');
    let stopped = false;
    const stopping = service.stop().then((value) => { stopped = true; return value; });
    await queuedDenied;
    assert.equal(stopped, false);
    assert.equal((await f.database.pool.query('SELECT count(*)::int AS count FROM tsa_private.factory_import_manifests WHERE producer_namespace=$1', [p.package.producerNamespace])).rows[0].count, 0);
    await unblock(); released = true;
    assert.equal((await first).receipts.length, 10);
    assert.equal((await stopping).status, 'STOPPED');
    assert.equal(JSON.parse(await readFile(join(config.directory, 'active-state.json'), 'utf8')).status, 'RETIRED');
    assert.ok((await readFile(join(config.directory, 'retired-activations.ndjson'), 'utf8')).endsWith('\n'));
    const baseline = await applicationSnapshot(f.database.pool);
    await assert.rejects(intake(service, p), /UNAVAILABLE/);
    await assert.rejects(createManualFactoryImportService(options), /RETIRED|CONFIGURATION/);
    assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
  } finally { if (!released) await unblock(); await service.stop(); }
});

test('expiry is checked using the database clock after the Bank guard, before writes', async () => {
  const p = await manualPackage(f);
  const config = await manualConfiguration(f, p, { validUntil: new Date(Date.now() + 600).toISOString() });
  const service = await createManualFactoryImportService({ bankPool: f.bankPool, identityService: f.identity, internalCapability: capability,
    enabled: true, env: f.env, configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
    approvedConfigurationScopeHash: config.approvedConfigurationScopeHash });
  f.services.push(service);
  const baseline = await applicationSnapshot(f.database.pool);
  const unblock = await blockAdmissions(); let released = false;
  try {
    const pending = intake(service, p); const denied = assert.rejects(pending, /NOT_ACTIVE/);
    await waitingBackend();
    await waitFor(async () => (await f.database.pool.query('SELECT clock_timestamp()>$1::timestamptz AS expired', [config.activation.validUntil])).rows[0].expired, 'activation expiry');
    await unblock(); released = true; await denied;
    assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
  } finally { if (!released) await unblock(); await service.stop(); }
});

test('terminating the coordinator backend aborts its own import and requires explicit read-only receipt reconciliation', async () => {
  const p = await manualPackage(f);
  const { service, options, config } = await start(p);
  const baseline = await applicationSnapshot(f.database.pool);
  const blocker = await f.database.pool.connect();
  await blocker.query('BEGIN'); await blocker.query('LOCK TABLE tsa.question_versions IN SHARE MODE');
  const unblock = async () => { await blocker.query('ROLLBACK'); blocker.release(); }; let released = false;
  try {
    const pending = intake(service, p); const denied = assert.rejects(pending);
    const pid = await waitFor(async () => (await f.database.pool.query(`SELECT pid FROM pg_stat_activity
      WHERE application_name='tsa-manual-bank-test' AND wait_event_type='Lock'
      AND query LIKE '%INSERT INTO tsa.question_versions%'`)).rows[0]?.pid, 'admitted manual question insert');
    await f.database.pool.query('SELECT pg_terminate_backend($1)', [pid]);
    await denied;
    assert.equal(service.status().status, 'UNSAFE');
    assert.equal((await service.stop()).status, 'UNSAFE_RECONCILIATION_REQUIRED');
    await unblock(); released = true;
    assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
    await assert.rejects(intake(service, p), /UNAVAILABLE/);
    await assert.rejects(createManualFactoryImportService(options), /RECONCILIATION_REQUIRED/);
    const admission = (await readFile(join(config.directory, 'admissions.ndjson'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line)).find((row) => row.status === 'PENDING');
    const reconciliation = { bankPool: f.bankPool, identityService: f.identity, internalCapability: capability, env: f.env,
      configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
      approvedConfigurationScopeHash: config.approvedConfigurationScopeHash, request: f.author.request,
      input: p.package, capability, admissionId: admission.admissionId,
      approvedReconciliationHash: jsonDigest({ activationHash: config.approvedActivationHash, admissionId: admission.admissionId, manifestHash: admission.manifestHash }) };
    await assert.rejects(reconcileManualFactoryImportAdmission({ ...reconciliation, approvedReconciliationHash: jsonDigest('not approved') }));
    assert.equal((await reconcileManualFactoryImportAdmission(reconciliation)).outcome, 'ABSENT');
    assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
    const restarted = await createManualFactoryImportService(options); f.services.push(restarted);
    assert.equal((await intake(restarted, p)).receipts.length, 10);
    await restarted.stop();
  } finally { if (!released) await unblock(); await service.stop(); }
});

test('a committed transaction with a lost acknowledgment reconciles its exact stored receipts without a second import', async () => {
  const p = await manualPackage(f);
  let injected = false;
  const faultPool = {
    query: (...args) => f.bankPool.query(...args),
    async connect() {
      const actual = await f.bankPool.connect();
      return {
        on: (...args) => actual.on(...args), off: (...args) => actual.off(...args), release: (...args) => actual.release(...args),
        async query(...args) {
          const result = await actual.query(...args);
          if (args[0] === 'COMMIT' && !injected) { injected = true; throw new Error('Synthetic lost commit acknowledgment'); }
          return result;
        },
      };
    },
  };
  const { service, options, config } = await start(p, { bankPool: faultPool });
  await assert.rejects(intake(service, p), /Synthetic lost commit acknowledgment/);
  assert.equal(injected, true); assert.equal(service.status().uncertainCommit, true);
  assert.equal((await service.stop()).status, 'UNSAFE_RECONCILIATION_REQUIRED');
  const committed = await applicationSnapshot(f.database.pool);
  await assert.rejects(createManualFactoryImportService({ ...options, bankPool: f.bankPool }), /RECONCILIATION_REQUIRED/);
  const admission = (await readFile(join(config.directory, 'admissions.ndjson'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line)).find((row) => row.status === 'PENDING');
  const reconciled = await reconcileManualFactoryImportAdmission({ bankPool: f.bankPool, identityService: f.identity,
    internalCapability: capability, env: f.env, request: f.author.request, input: p.package, capability,
    configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
    approvedConfigurationScopeHash: config.approvedConfigurationScopeHash, admissionId: admission.admissionId,
    approvedReconciliationHash: jsonDigest({ activationHash: config.approvedActivationHash,
      admissionId: admission.admissionId, manifestHash: admission.manifestHash }) });
  assert.equal(reconciled.outcome, 'COMMITTED');
  assert.deepEqual(await applicationSnapshot(f.database.pool), committed);
  const restarted = await createManualFactoryImportService({ ...options, bankPool: f.bankPool }); f.services.push(restarted);
  const replay = await intake(restarted, p); assert.equal(replay.replayed, true); assert.equal(replay.receipts.length, 10);
  assert.deepEqual(await applicationSnapshot(f.database.pool), committed);
  await restarted.stop();
});

test('journal uncertainty stops all later admissions without application writes', async () => {
  for (const fault of ['truncated', 'unwritable']) {
    const p = await manualPackage(f);
    const { service, config } = await start(p);
    const baseline = await applicationSnapshot(f.database.pool);
    try {
      if (fault === 'truncated') await writeFile(join(config.directory, 'admissions.ndjson'), '{"partial":', { mode: 0o600 });
      else await chmod(config.directory, 0o500);
      await assert.rejects(intake(service, p));
      assert.equal(service.status().status, 'UNSAFE');
      assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
      await assert.rejects(intake(service, p), /UNAVAILABLE/);
      assert.equal((await service.stop()).status, 'UNSAFE_RECONCILIATION_REQUIRED');
    } finally { await chmod(config.directory, 0o700); await service.stop(); }
  }
});

test('retirement I/O failure releases the coordinator lock and concurrent stop calls share one outcome', async () => {
  const p = await manualPackage(f);
  const { service, config } = await start(p);
  await mkdir(join(config.directory, `.active-state.json.${process.pid}.tmp`), { mode: 0o700 });
  const results = await Promise.allSettled([service.stop(), service.stop()]);
  assert.ok(results.every((result) => result.status === 'rejected'));
  assert.equal(service.status().status, 'UNSAFE');
  const other = await manualPackage(f); const replacement = await start(other);
  assert.equal(replacement.service.status().status, 'ACTIVE'); await replacement.service.stop();
});

test('public static and student HTTP surfaces cannot read manual artifacts or private review data', async () => {
  const p = await manualPackage(f);
  const { service } = await start(p);
  let server;
  try {
    await intake(service, p);
    let handler;
    server = createPrototypeServer({ port: 0, integratedRequestHandler: (request) => handler(request) });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    handler = await createBankHandler({ bankPool: f.bankPool, identityService: f.identity, trustedOrigin: origin,
      enableReviewContext: true, enableReviewEvidence: true });
    const id = p.package.candidates[0].question.id;
    const paths = [`/api/v1/question-versions/${id}/review-context`, `/api/v1/question-versions/${id}/review-evidence`,
      '/api/v1/manual-factory-import', '/.local/manual-import/activation.json',
      '/tools/question-factory/manual-transport.mjs', '/packages/contracts/src/factory-package-v3.ts',
      `${p.directory}/response.json`];
    for (const path of paths) {
      const response = await fetch(origin + path, { headers: { origin, cookie: f.student.request.headers.get('cookie') } });
      assert.ok([403, 404].includes(response.status), `Expected forbidden or absent: ${path}`);
      const body = await response.text();
      assert.ok(!body.includes(p.package.manualRun.responseHash));
      assert.ok(!body.includes(p.values.declaration.evidenceNote));
      assert.ok(!body.includes(JSON.stringify(p.package.candidates[0].question.private.answerKey)));
      assert.ok(!body.includes(p.package.manualRun.artifactRefs.response.bytesHash));
    }
  } finally {
    if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await service.stop();
  }
});

test('failure to append the confirmed rollback resolution also stops admission and preserves every application row', async () => {
  const p = await manualPackage(f);
  let directory, injected = false;
  const pool = {
    query: (...args) => f.bankPool.query(...args),
    async connect() {
      const actual = await f.bankPool.connect();
      return { on: (...args) => actual.on(...args), off: (...args) => actual.off(...args),
        release: (...args) => actual.release(...args), async query(...args) {
          const result = await actual.query(...args);
          if (!injected && String(args[0]).startsWith('INSERT INTO tsa.question_versions')) {
            injected = true; throw new Error('Synthetic transaction failure after actual first insert');
          }
          if (injected && args[0] === 'ROLLBACK') await chmod(join(directory, 'admissions.ndjson'), 0o400);
          return result;
        } };
    },
  };
  const { service, config } = await start(p, { bankPool: pool }); directory = config.directory;
  const baseline = await applicationSnapshot(f.database.pool);
  try {
    await assert.rejects(intake(service, p));
    assert.equal(injected, true); assert.equal(service.status().status, 'UNSAFE');
    assert.deepEqual(await applicationSnapshot(f.database.pool), baseline);
    await assert.rejects(intake(service, p), /UNAVAILABLE/);
    assert.equal((await service.stop()).status, 'UNSAFE_RECONCILIATION_REQUIRED');
  } finally { await chmod(join(directory, 'admissions.ndjson'), 0o600); await service.stop(); }
});
