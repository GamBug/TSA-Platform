import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createFactoryImportService } from '../../../src/modules/bank/factory-import.mjs';
import {
  QuestionVersionSchema,
  canonicalize,
  computeDuplicateFingerprint,
  computeQuestionIdentity,
  createReferenceHash,
} from '../../../packages/contracts/dist/internal.js';
import { buildSyntheticFactoryPackageV2 } from '../../../packages/contracts/test/fixtures/factory-package-v2.ts';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { resolveReferenceGraph } from '../../../src/modules/bank/common.mjs';
import { bootstrapLocalSyntheticIdentity } from '../../../src/modules/identity/local-synthetic.mjs';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';
import { bankRequest, createBankHarness, loginActor } from './harness.mjs';

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));

let harness;
let capability;
let service;
let principal;
let authorBrowser;
let managerBrowser;

function keyOf(ref) { return `${ref.kind}\u0000${ref.id}`; }
function sameCanonical(left, right) {
  return Buffer.from(canonicalize(left)).equals(Buffer.from(canonicalize(right)));
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function bounded(promise, label, milliseconds = 5000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function waitForImportLockWaiters(count) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await harness.database.pool.query(
      `SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE application_name='tsa-bank-api-test' AND wait_event_type='Lock'
          AND query ILIKE '%bank_state%'`);
    if (result.rows[0].count >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${count} Factory imports blocked on bank_state`);
}
function hashNodes(nodes) {
  const byKey = new Map(nodes.map((node) => [keyOf(node), node])); const hashes = new Map();
  const hash = (node) => {
    const known = hashes.get(keyOf(node)); if (known) return known;
    const refs = node.references.map((ref) => ({ ...ref, contentHash: hash(byKey.get(keyOf(ref)) ) }));
    const value = createReferenceHash({ kind: node.kind, id: node.id, payload: node.payload, references: refs });
    hashes.set(keyOf(node), value); return value;
  };
  return nodes.map((node) => ({ ...node, contentHash: hash(node) }));
}
function roots(question) {
  const result = [{ kind: 'taxonomy', id: question.taxonomyVersionId }];
  if (question.parentVersionId) result.push({ kind: 'question', id: question.parentVersionId });
  if (question.stimulusVersionId) result.push({ kind: 'stimulus', id: question.stimulusVersionId });
  for (const id of question.provenanceIds) result.push({ kind: 'provenance', id });
  for (const id of question.private.evidenceRefs) result.push({ kind: 'evidence', id });
  const assets = new Set();
  const scan = (value) => {
    if (Array.isArray(value)) value.forEach(scan);
    else if (value && typeof value === 'object') {
      if (value.type === 'image' && typeof value.assetVersionId === 'string') assets.add(value.assetVersionId);
      Object.values(value).forEach(scan);
    }
  };
  scan(question.content);
  scan(question.interaction);
  scan(question.private.explanation);
  for (const id of assets) result.push({ kind: 'asset', id });
  return result;
}

function dependencyClosure(question, nodes) {
  const byKey = new Map(nodes.map((node) => [keyOf(node), node]));
  const found = new Map();
  const pending = roots(question);
  while (pending.length) {
    const reference = pending.pop();
    const key = keyOf(reference);
    if (found.has(key)) continue;
    const node = byKey.get(key);
    if (!node) throw new Error(`Missing synthetic reference ${key}`);
    found.set(key, node);
    pending.push(...node.references);
  }
  return [...found.values()];
}

function rehashPackage(pkg) {
  pkg.references = hashNodes(pkg.references.map((node) => ({
    kind: node.kind,
    id: node.id,
    payload: node.payload,
    references: node.references.map(({ kind, id }) => ({ kind, id })),
  })));
  for (const candidate of pkg.candidates) {
    const identity = computeQuestionIdentity(candidate.question, dependencyClosure(candidate.question, pkg.references));
    candidate.question.contentHash = identity.contentHash;
    candidate.contentHash = identity.contentHash;
    for (const validation of candidate.validations) validation.inputHash = identity.contentHash;
  }
  return pkg;
}

function freshPackage(taxonomy, options = {}) {
  const pkg = retarget(buildSyntheticFactoryPackageV2(options), taxonomy, principal.userId);
  pkg.producerNamespace = `synthetic.factory.${randomUUID()}`;
  pkg.batchKey = `batch-${randomUUID()}`;
  assignFreshQuestionIds(pkg);
  return rehashPackage(pkg);
}

function assignFreshQuestionIds(pkg) {
  const versionIds = new Map();
  const stableIds = new Map();
  const runIds = new Map();
  for (const candidate of pkg.candidates) {
    versionIds.set(candidate.question.id, randomUUID());
    stableIds.set(candidate.question.questionId, randomUUID());
    runIds.set(candidate.question.generationRunId, randomUUID());
  }
  for (const node of pkg.references.filter((item) => item.kind === 'question')) {
    versionIds.set(node.id, randomUUID());
  }
  const questions = [
    ...pkg.references.filter((item) => item.kind === 'question').map((node) => node.payload),
    ...pkg.candidates.map((candidate) => candidate.question),
  ];
  for (const question of questions) {
    if (!stableIds.has(question.questionId)) stableIds.set(question.questionId, randomUUID());
    if (question.generationRunId !== null && !runIds.has(question.generationRunId)) runIds.set(question.generationRunId, randomUUID());
  }
  for (const node of pkg.references.filter((item) => item.kind === 'question')) {
    const oldId = node.id;
    node.id = versionIds.get(oldId);
    node.payload.id = node.id;
    node.payload.questionId = stableIds.get(node.payload.questionId);
    if (node.payload.generationRunId !== null) node.payload.generationRunId = runIds.get(node.payload.generationRunId);
    if (node.payload.parentVersionId) node.payload.parentVersionId = versionIds.get(node.payload.parentVersionId);
    node.references = node.references.map((ref) => ({
      kind: ref.kind,
      id: ref.kind === 'question' ? versionIds.get(ref.id) : ref.id,
    }));
  }
  for (const candidate of pkg.candidates) {
    const question = candidate.question;
    const oldRunId = question.generationRunId;
    question.id = versionIds.get(question.id);
    question.questionId = stableIds.get(question.questionId);
    question.generationRunId = runIds.get(oldRunId);
    if (question.parentVersionId) question.parentVersionId = versionIds.get(question.parentVersionId);
    candidate.run.generationRunId = question.generationRunId;
  }
  return pkg;
}

function retarget(pkg, taxonomy, authorId) {
  const copy = structuredClone(pkg);
  const tax = copy.references.find((node) => node.kind === 'taxonomy');
  tax.id = taxonomy.versionId;
  tax.payload = { schemaVersion: 'taxonomy/1', taxonomyVersionId: taxonomy.versionId, name: taxonomy.name, versionNo: 1,
    definitionHash: taxonomy.definitionHash, nodes: [...taxonomy.nodes].sort((left, right) => left.code.localeCompare(right.code)) };
  for (const candidate of copy.candidates) {
    candidate.question.taxonomyVersionId = taxonomy.versionId;
    candidate.question.domainId = 'MATH'; candidate.question.skillIds = ['ALGEBRA']; candidate.question.subskillIds = ['LINEAR'];
    candidate.question.createdBy = authorId;
  }
  for (const node of copy.references) {
    if (node.kind === 'question') {
      node.payload.taxonomyVersionId = taxonomy.versionId;
      node.payload.domainId = 'MATH';
      node.payload.skillIds = ['ALGEBRA'];
      node.payload.subskillIds = ['LINEAR'];
      node.payload.createdBy = authorId;
    }
  }
  for (const node of copy.references) {
    node.references = node.references.map((reference) => ({
      ...reference,
      id: reference.kind === 'taxonomy' && reference.id !== tax.id
        ? taxonomy.versionId
        : reference.id,
    }));
  }
  return rehashPackage(copy);
}
async function seedTaxonomy() {
  const versionId = randomUUID(); const domainId = randomUUID(); const skillId = randomUUID(); const subskillId = randomUUID();
  const definitionHash = 'sha256:' + 'a'.repeat(64);
  const nodes = [{ id: domainId, code: 'MATH', kind: 'DOMAIN', parentId: null, metadata: {} }, { id: skillId, code: 'ALGEBRA', kind: 'SKILL', parentId: domainId, metadata: {} }, { id: subskillId, code: 'LINEAR', kind: 'SUBSKILL', parentId: skillId, metadata: {} }];
  await withTransaction(harness.database.pool, async (client) => {
    await client.query(`INSERT INTO tsa.taxonomy_versions (id,name,version_no,definition_hash) VALUES ($1,$2,1,$3)`, [versionId, `Factory test ${versionId}`, definitionHash]);
    for (const node of nodes) await client.query(`INSERT INTO tsa.taxonomy_nodes (id,taxonomy_version_id,code,kind,parent_id,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [node.id,versionId,node.code,node.kind,node.parentId,JSON.stringify(node.metadata)]);
  });
  return { versionId, name: `Factory test ${versionId}`, definitionHash, nodes };
}

async function reconstructQuestion(client, versionId) {
  const result = await client.query(
    `SELECT qv.*, qs.answer_key, qs.explanation, qs.evidence AS evidence_refs,
            qs.scoring_policy_version,
            run.external_generation_run_id,
            stimulus.external_id AS external_stimulus_version_id
       FROM tsa.question_versions qv
       JOIN tsa_private.question_secrets qs ON qs.question_version_id = qv.id
       LEFT JOIN tsa_private.factory_import_runs run ON run.question_version_id = qv.id
       LEFT JOIN tsa_private.factory_external_mappings stimulus
         ON stimulus.external_kind = 'stimulus' AND stimulus.local_id = qv.stimulus_version_id
      WHERE qv.id = $1`, [versionId]);
  assert.equal(result.rowCount, 1);
  const row = result.rows[0];
  const question = QuestionVersionSchema.parse({
    schemaVersion: row.schema_version,
    id: row.id,
    questionId: row.question_id,
    versionNo: Number(row.version_no),
    parentVersionId: row.parent_version_id,
    language: row.language,
    section: row.section,
    taxonomyVersionId: row.taxonomy_version_id,
    domainId: row.domain_id,
    skillIds: row.skill_ids,
    subskillIds: row.subskill_ids,
    cognitiveLevel: row.cognitive_level,
    difficulty: row.difficulty,
    content: row.content,
    stimulusVersionId: row.external_stimulus_version_id ?? row.stimulus_version_id,
    interaction: row.interaction,
    private: {
      answerKey: row.answer_key,
      explanation: row.explanation,
      evidenceRefs: row.evidence_refs,
      scoringPolicy: row.scoring_policy_version,
    },
    origin: row.origin,
    provenanceIds: row.provenance_ids,
    generationRunId: row.external_generation_run_id ?? row.generation_run_id,
    createdBy: row.created_by,
    createdAt: row.authored_created_at,
    contentHash: row.content_hash,
  });
  return { row, question };
}

async function assertQuestionIdentity(client, versionId, expectedQuestion) {
  const { row, question } = await reconstructQuestion(client, versionId);
  if (expectedQuestion) assert.ok(sameCanonical(question, expectedQuestion));
  const graph = await resolveReferenceGraph(client, row.reference_namespace, [{ kind: 'question', id: versionId }]);
  const questionNode = graph.find((node) => node.kind === 'question' && node.id === versionId);
  assert.ok(questionNode);
  const { contentHash: _hash, ...projection } = question;
  assert.ok(sameCanonical(questionNode.payload, projection));
  const dependencies = graph.filter((node) => !(node.kind === 'question' && node.id === versionId));
  const identity = computeQuestionIdentity(question, dependencies);
  const fingerprint = computeDuplicateFingerprint(question, dependencies);
  assert.equal(identity.contentHash, row.content_hash);
  assert.equal(fingerprint.fingerprint, row.normalized_fingerprint);
  return { question, row, graph, identity, fingerprint };
}

async function importRowCounts() {
  const tables = [
    'tsa.sources', 'tsa.source_versions', 'tsa.source_rights', 'tsa.rights_decisions',
    'tsa.asset_versions', 'tsa.stimuli', 'tsa.stimulus_versions', 'tsa.stimulus_sources',
    'tsa.stimulus_assets', 'tsa.questions', 'tsa.question_versions', 'tsa_private.question_secrets',
    'tsa.question_taxonomy', 'tsa.question_provenance', 'tsa.question_assets', 'tsa.question_workflow',
    'tsa.validation_runs', 'tsa.duplicate_relations', 'tsa.reviews', 'tsa_private.reference_nodes',
    'tsa.audit_events', 'tsa.idempotency_records',
    'tsa_private.factory_import_manifests', 'tsa_private.factory_import_receipts',
    'tsa_private.factory_external_mappings', 'tsa_private.factory_import_runs', 'tsa_private.factory_asset_bytes',
  ];
  const counts = {};
  for (const table of tables) {
    const result = await harness.database.pool.query(`SELECT count(*)::int AS count FROM ${table}`);
    counts[table] = result.rows[0].count;
  }
  const bankState = await harness.database.pool.query('SELECT eligibility_revision::text FROM tsa.bank_state WHERE id=1');
  counts.bankEligibilityRevision = bankState.rows[0].eligibility_revision;
  return counts;
}

async function registerManualEvidence() {
  const sourceResponse = await bankRequest(harness, authorBrowser, '/api/v1/sources', {
    method: 'POST', key: `source-${randomUUID()}`,
    body: { title: 'Synthetic correction source', canonicalUri: null, origin: 'OWNED' },
  });
  assert.equal(sourceResponse.status, 201);
  const { sourceId } = await sourceResponse.json();
  const versionResponse = await bankRequest(harness, authorBrowser, `/api/v1/sources/${sourceId}/versions`, {
    method: 'POST', key: `source-version-${randomUUID()}`,
    body: { contentHash: `sha256:${createHash('sha256').update(sourceId).digest('hex')}`, evidenceUri: 'manual://synthetic', metadata: { test: 'true' } },
  });
  assert.equal(versionResponse.status, 201, JSON.stringify(await versionResponse.clone().json()));
  const { sourceVersionId } = await versionResponse.json();
  const rightsResponse = await bankRequest(harness, managerBrowser, `/api/v1/source-versions/${sourceVersionId}/rights`, {
    method: 'POST', key: `rights-${randomUUID()}`,
    body: {
      status: 'OWNED', allowedUses: ['DISPLAY', 'GENERATE'], territory: ['Worldwide'],
      validFrom: '2026-01-01T00:00:00Z', validTo: null,
      evidence: 'Synthetic test evidence only.', expectedRevision: 0,
    },
  });
  assert.equal(rightsResponse.status, 201);
  const { decisionId } = await rightsResponse.json();
  return { sourceId, sourceVersionId, decisionId };
}

before(async () => {
  harness = await createBankHarness();
  [authorBrowser, managerBrowser] = await Promise.all([
    loginActor(harness, 'author'),
    loginActor(harness, 'bankManager'),
  ]);
  principal = await harness.identity.authenticate(new Request(harness.origin, { headers: { cookie: authorBrowser.cookies.join('; ') } }));
  capability = Object.freeze({ purpose: 'factory-package-v2-test' });
  service = await createFactoryImportService({ bankPool: harness.bankPool, identityService: harness.identity, internalCapability: capability });
});
after(async () => { if (harness) await harness.close(); });

test('imports one exact registered package as private DRAFT receipts and replays only its exact manifest', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = retarget(buildSyntheticFactoryPackageV2({ withAsset: true, validationOutcome: 'INCONCLUSIVE' }), taxonomy, principal.userId);
  pkg.candidates[0].question.createdAt = '2026-10-19T08:00:00.123456789+05:30';
  rehashPackage(pkg);
  const first = await service.importFactoryPackageV2(principal, pkg, capability);
  assert.equal(first.replayed, false); assert.equal(first.receipts.length, 1); assert.equal(first.receipts[0].workflowState, 'DRAFT');
  const stored = await harness.database.pool.query(`SELECT qv.origin::text AS origin, qw.state::text AS state, qv.created_by, qv.authored_created_at, qv.generation_run_id, fir.external_generation_run_id, count(fab.asset_version_id)::int AS asset_count
    FROM tsa.question_versions qv JOIN tsa.question_workflow qw ON qw.question_version_id=qv.id JOIN tsa_private.factory_import_runs fir ON fir.question_version_id=qv.id LEFT JOIN tsa_private.factory_asset_bytes fab ON true
    WHERE qv.id=$1 GROUP BY qv.id,qw.state,fir.external_generation_run_id`, [first.receipts[0].questionVersionId]);
  assert.equal(stored.rows[0].origin, 'GENERATED'); assert.equal(stored.rows[0].state, 'DRAFT'); assert.equal(stored.rows[0].created_by, principal.userId);
  assert.equal(stored.rows[0].authored_created_at, '2026-10-19T08:00:00.123456789+05:30'); assert.equal(stored.rows[0].generation_run_id, null); assert.ok(stored.rows[0].external_generation_run_id);
  const importedQuestion = await assertQuestionIdentity(harness.database.pool, first.receipts[0].questionVersionId, pkg.candidates[0].question);
  assert.equal(importedQuestion.question.generationRunId, pkg.candidates[0].question.generationRunId);
  const importedSourceVersions = await harness.database.pool.query(
    `SELECT local_id FROM tsa_private.factory_external_mappings
      WHERE producer_namespace=$1 AND external_kind='source'`, [pkg.producerNamespace]);
  const currentRights = await harness.database.pool.query(
    'SELECT count(*)::int AS count FROM tsa.source_rights WHERE source_version_id=ANY($1::uuid[])',
    [importedSourceVersions.rows.map((row) => row.local_id)]);
  assert.equal(currentRights.rows[0].count, 0);
  await harness.database.pool.query(
    `UPDATE tsa.question_workflow SET state='IN_REVIEW', revision=revision+1
      WHERE question_version_id=$1`, [first.receipts[0].questionVersionId]);
  const replay = await service.importFactoryPackageV2(principal, structuredClone(pkg), capability);
  assert.equal(replay.replayed, true); assert.deepEqual(replay.receipts, first.receipts);
  const changed = structuredClone(pkg); changed.candidates[0].itemKey = 'changed-item';
  await assert.rejects(service.importFactoryPackageV2(principal, changed, capability), (error) => error.code === 'IMPORT_CONFLICT');
});

test('a late second-candidate database error rolls the whole package back', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = freshPackage(taxonomy, { candidateCount: 2, withAsset: true });
  const before = await importRowCounts();
  const suffix = randomUUID().replaceAll('-', '');
  const functionName = `fail_late_factory_import_${suffix}`;
  const triggerName = `fail_late_factory_import_${suffix}`;
  const secondId = pkg.candidates[1].question.id;
  await harness.database.pool.query(`CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id = '${secondId}'::uuid THEN RAISE EXCEPTION 'synthetic late import conflict' USING ERRCODE='23505'; END IF; RETURN NEW; END $$`);
  await harness.database.pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON tsa.question_versions FOR EACH ROW EXECUTE FUNCTION public.${functionName}()`);
  let failure;
  try {
    await assert.rejects(service.importFactoryPackageV2(principal, pkg, capability), (error) => {
      failure = error;
      return error.code === '23505';
    });
  } finally {
    await harness.database.pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON tsa.question_versions`);
    await harness.database.pool.query(`DROP FUNCTION IF EXISTS public.${functionName}()`);
  }
  assert.equal(failure?.code, '23505');
  assert.deepEqual(await importRowCounts(), before);
  const first = await harness.database.pool.query('SELECT 1 FROM tsa.question_versions WHERE id=$1', [pkg.candidates[0].question.id]);
  assert.equal(first.rowCount, 0);
});

test('imported ancestry and shared stimulus preserve every canonical reference and can be reused by a later batch', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = freshPackage(taxonomy, {
    withAsset: true,
    withStimulus: true,
    withParent: true,
    withDistinctStimulusProvenance: true,
    withDistinctParentProvenance: true,
    withParentOnlyAsset: true,
  });
  const candidate = pkg.candidates[0];
  candidate.question.createdAt = '2026-10-19T08:00:00.123456789+05:30';
  const parentNode = pkg.references.find((node) => node.kind === 'question');
  assert.ok(parentNode);
  parentNode.payload.origin = 'IMPORTED';
  parentNode.payload.generationRunId = null;
  parentNode.payload.createdAt = '2025-03-04T11:12:13.987654321-04:00';
  const parentProvenance = pkg.references.find((node) => node.kind === 'provenance'
    && node.id === parentNode.payload.provenanceIds[0]);
  assert.ok(parentProvenance);
  parentProvenance.payload.origin = 'IMPORTED';
  rehashPackage(pkg);
  const parentProjection = { ...structuredClone(parentNode.payload), contentHash: parentNode.contentHash };
  const expectedParent = {
    ...parentProjection,
    contentHash: computeQuestionIdentity(parentProjection, dependencyClosure(parentProjection, pkg.references)).contentHash,
  };
  const imported = await service.importFactoryPackageV2(principal, pkg, capability);
  assert.equal(imported.receipts.length, 1);
  const parentId = candidate.question.parentVersionId;
  const parent = await assertQuestionIdentity(harness.database.pool, parentId, expectedParent);
  const current = await assertQuestionIdentity(harness.database.pool, candidate.question.id, candidate.question);
  assert.equal(parent.question.createdAt, '2025-03-04T11:12:13.987654321-04:00');
  assert.equal(current.question.createdAt, '2026-10-19T08:00:00.123456789+05:30');
  assert.equal(parent.question.origin, 'IMPORTED');
  assert.equal(parent.question.generationRunId, null);
  assert.equal(current.question.origin, 'GENERATED');
  assert.equal(current.question.generationRunId, candidate.question.generationRunId);
  assert.notEqual(parent.question.provenanceIds[0], current.question.provenanceIds[0]);
  assert.notEqual(
    pkg.references.find((node) => node.kind === 'stimulus').payload.provenanceIds[0],
    current.question.provenanceIds[0],
  );
  const candidateProvenance = pkg.references.find((node) => node.kind === 'provenance'
    && node.id === current.question.provenanceIds[0]);
  const stimulusProvenanceId = pkg.references.find((node) => node.kind === 'stimulus').payload.provenanceIds[0];
  const stimulusProvenance = pkg.references.find((node) => node.kind === 'provenance' && node.id === stimulusProvenanceId);
  const parentProvenanceSource = parentProvenance.payload.sourceVersionId;
  assert.notEqual(candidateProvenance.payload.sourceVersionId, stimulusProvenance.payload.sourceVersionId);
  assert.notEqual(candidateProvenance.payload.sourceVersionId, parentProvenanceSource);
  assert.notEqual(stimulusProvenance.payload.sourceVersionId, parentProvenanceSource);
  assert.ok(pkg.assets.length >= 2, 'fixture includes candidate/stimulus and parent-only image assets');
  const importedSources = await harness.database.pool.query(
    `SELECT DISTINCT sv.id AS source_version_id
       FROM tsa_private.factory_external_mappings mapping
       JOIN tsa.source_versions sv ON sv.id=mapping.local_id
      WHERE mapping.producer_namespace=$1 AND mapping.external_kind='source'`, [pkg.producerNamespace]);
  assert.ok(importedSources.rows.length >= 3, 'candidate, stimulus, and parent provenance use distinct sources');
  const rights = await harness.database.pool.query(
    'SELECT count(*)::int AS count FROM tsa.source_rights WHERE source_version_id=ANY($1::uuid[])',
    [importedSources.rows.map((row) => row.source_version_id)]);
  assert.equal(rights.rows[0].count, 0);
  const decisions = await harness.database.pool.query(
    'SELECT count(*)::int AS count FROM tsa.rights_decisions WHERE source_version_id=ANY($1::uuid[])',
    [importedSources.rows.map((row) => row.source_version_id)]);
  assert.equal(decisions.rows[0].count, 0);
  const status = await harness.database.pool.query(
    `SELECT q.eligible_version_id, qw.state::text AS state,
            (SELECT count(*)::int FROM tsa.reviews review WHERE review.question_version_id=qv.id) AS reviews
       FROM tsa.question_versions qv JOIN tsa.questions q ON q.id=qv.question_id
       JOIN tsa.question_workflow qw ON qw.question_version_id=qv.id
      WHERE qv.id=ANY($1::uuid[]) ORDER BY qv.id`, [[parentId, candidate.question.id]]);
  assert.equal(status.rows.length, 2);
  for (const row of status.rows) assert.deepEqual(row, { eligible_version_id: null, state: 'DRAFT', reviews: 0 });
  const stimulusSources = await harness.database.pool.query(
    `SELECT ss.source_version_id FROM tsa.stimulus_sources ss
      WHERE ss.stimulus_version_id=(SELECT stimulus_version_id FROM tsa.question_versions WHERE id=$1)`, [candidate.question.id]);
  assert.ok(stimulusSources.rows.some((row) => importedSources.rows.some((source) => source.source_version_id === row.source_version_id)),
    'stimulus provenance is materialized as a separate source dependency');

  const next = structuredClone(pkg);
  next.batchKey = `later-batch-${randomUUID()}`;
  const priorCandidate = structuredClone(candidate.question);
  const { contentHash: _priorHash, ...priorPayload } = priorCandidate;
  next.references.push({
    kind: 'question',
    id: priorCandidate.id,
    payload: priorPayload,
    references: roots(priorCandidate),
    contentHash: priorCandidate.contentHash,
  });
  next.candidates[0].question.parentVersionId = priorCandidate.id;
  next.candidates[0].question.versionNo = 3;
  next.candidates[0].question.id = randomUUID();
  next.candidates[0].question.createdAt = '2026-10-20T10:11:12.000000001Z';
  next.candidates[0].question.generationRunId = randomUUID();
  next.candidates[0].run.generationRunId = next.candidates[0].question.generationRunId;
  rehashPackage(next);
  const later = await service.importFactoryPackageV2(principal, next, capability);
  assert.equal(later.receipts[0].questionVersionId, next.candidates[0].question.id);
  const reused = await harness.database.pool.query('SELECT id,count(*)::int AS count FROM tsa.question_versions WHERE id=ANY($1::uuid[]) GROUP BY id', [[parentId, priorCandidate.id]]);
  assert.equal(reused.rows.length, 2);
  assert.ok(reused.rows.every((row) => row.count === 1));
  await assertQuestionIdentity(harness.database.pool, parentId, expectedParent);

  const collision = structuredClone(pkg);
  collision.batchKey = `candidate-collision-${randomUUID()}`;
  await assert.rejects(service.importFactoryPackageV2(principal, collision, capability), (error) => error.code === 'IMPORT_CONFLICT');

  const otherQuestionId = randomUUID();
  await harness.database.pool.query('INSERT INTO tsa.questions (id) VALUES ($1)', [otherQuestionId]);
  await assert.rejects(harness.database.pool.query(
    `INSERT INTO tsa_private.factory_import_receipts
      (producer_namespace,batch_key,item_key,candidate_ordinal,input_hash,question_id,question_version_id,external_generation_run_id)
     VALUES ($1,$2,'wrong-question',99,$3,$4,$5,$6)`,
    [pkg.producerNamespace,pkg.batchKey,expectedParent.contentHash,otherQuestionId,parentId,expectedParent.generationRunId]),
  (error) => error.code === '23503');
  await assert.rejects(harness.database.pool.query(
    `INSERT INTO tsa_private.factory_import_receipts
      (producer_namespace,batch_key,item_key,candidate_ordinal,input_hash,question_id,question_version_id,external_generation_run_id)
     VALUES ($1,$2,'wrong-hash',99,$3,$4,$5,$6)`,
    [pkg.producerNamespace,pkg.batchKey,`sha256:${'f'.repeat(64)}`,expectedParent.questionId,parentId,expectedParent.generationRunId]),
  (error) => error.code === '23503');
});

test('exact replay verifies private mappings and raw asset bytes while allowing workflow to advance', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = freshPackage(taxonomy, { withAsset: true });
  await service.importFactoryPackageV2(principal, pkg, capability);
  const member = pkg.assets[0];
  const mapping = await harness.database.pool.query(
    `SELECT local_id, payload_hash FROM tsa_private.factory_external_mappings
      WHERE producer_namespace=$1 AND external_kind='asset' AND external_id=$2`, [pkg.producerNamespace, member.assetVersionId]);
  assert.equal(mapping.rowCount, 1);
  await harness.database.pool.query('ALTER TABLE tsa_private.factory_external_mappings DISABLE TRIGGER factory_external_mappings_immutable');
  try {
    await harness.database.pool.query(
      `DELETE FROM tsa_private.factory_external_mappings
        WHERE producer_namespace=$1 AND external_kind='asset' AND external_id=$2`, [pkg.producerNamespace, member.assetVersionId]);
  } finally {
    await harness.database.pool.query('ALTER TABLE tsa_private.factory_external_mappings ENABLE TRIGGER factory_external_mappings_immutable');
  }
  try {
    await assert.rejects(service.importFactoryPackageV2(principal, structuredClone(pkg), capability),
      (error) => error.code === 'IMPORT_INTEGRITY_CONFLICT');
  } finally {
    await harness.database.pool.query(
      `INSERT INTO tsa_private.factory_external_mappings
        (producer_namespace,external_kind,external_id,local_id,payload_hash)
       VALUES ($1,'asset',$2,$3,$4) ON CONFLICT DO NOTHING`,
      [pkg.producerNamespace, member.assetVersionId, mapping.rows[0].local_id, mapping.rows[0].payload_hash]);
  }

  const original = await harness.database.pool.query('SELECT bytes FROM tsa_private.factory_asset_bytes WHERE asset_version_id=$1', [mapping.rows[0].local_id]);
  assert.equal(original.rowCount, 1);
  await harness.database.pool.query('ALTER TABLE tsa_private.factory_asset_bytes DISABLE TRIGGER factory_asset_bytes_immutable');
  try {
    await harness.database.pool.query(
      'UPDATE tsa_private.factory_asset_bytes SET bytes=set_byte(bytes,0,get_byte(bytes,0)#1) WHERE asset_version_id=$1',
      [mapping.rows[0].local_id]);
  } finally {
    await harness.database.pool.query('ALTER TABLE tsa_private.factory_asset_bytes ENABLE TRIGGER factory_asset_bytes_immutable');
  }
  try {
    await assert.rejects(service.importFactoryPackageV2(principal, structuredClone(pkg), capability),
      (error) => error.code === 'IMPORT_INTEGRITY_CONFLICT');
  } finally {
    await harness.database.pool.query('ALTER TABLE tsa_private.factory_asset_bytes DISABLE TRIGGER factory_asset_bytes_immutable');
    try {
      await harness.database.pool.query('UPDATE tsa_private.factory_asset_bytes SET bytes=$2 WHERE asset_version_id=$1', [mapping.rows[0].local_id, original.rows[0].bytes]);
    } finally {
      await harness.database.pool.query('ALTER TABLE tsa_private.factory_asset_bytes ENABLE TRIGGER factory_asset_bytes_immutable');
    }
  }
  await harness.database.pool.query(
    `UPDATE tsa.question_workflow SET state='IN_REVIEW', revision=revision+1
      WHERE question_version_id=$1`, [pkg.candidates[0].question.id]);
  const replay = await service.importFactoryPackageV2(principal, structuredClone(pkg), capability);
  assert.equal(replay.replayed, true);
});

test('an AUTHOR can create an immutable correction after import without changing the imported identity', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = freshPackage(taxonomy);
  pkg.candidates[0].question.createdAt = '2026-10-19T08:00:00.123456789+05:30';
  rehashPackage(pkg);
  const imported = await service.importFactoryPackageV2(principal, pkg, capability);
  const original = structuredClone(pkg.candidates[0].question);
  const originalBefore = await assertQuestionIdentity(harness.database.pool, original.id, original);
  const evidence = await registerManualEvidence();
  const draft = {
    schemaVersion: 'question/1', language: 'vi-VN', section: 'MATH',
    taxonomyVersionId: taxonomy.versionId, domainId: taxonomy.nodes[0].id,
    skillIds: [taxonomy.nodes[1].id], subskillIds: [taxonomy.nodes[2].id],
    cognitiveLevel: 'M2', targetDifficulty: 'MEDIUM',
    content: [{ type: 'text', text: 'A reviewed correction of the imported test prompt.' }],
    stimulusVersionId: null,
    interaction: { type: 'SINGLE_CHOICE', options: [
      { id: 'a', content: [{ type: 'text', text: '2' }] },
      { id: 'b', content: [{ type: 'text', text: '3' }] },
    ] },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'b' },
    explanation: [{ type: 'text', text: 'Synthetic correction explanation.' }],
    evidenceRefs: [evidence.decisionId], origin: 'IMPORTED',
    provenance: [{ sourceVersionId: evidence.sourceVersionId, span: null, transformation: 'correction' }],
  };
  const response = await bankRequest(harness, authorBrowser, `/api/v1/questions/${original.questionId}/versions`, {
    method: 'POST', key: `correction-${randomUUID()}`,
    body: { parentVersionId: original.id, draft },
  });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const corrected = await response.json();
  assert.equal(corrected.questionId, original.questionId);
  assert.notEqual(corrected.versionId, original.id);
  assert.equal(corrected.state, 'DRAFT');
  const stillOriginal = await assertQuestionIdentity(harness.database.pool, original.id, original);
  assert.equal(stillOriginal.question.createdAt, '2026-10-19T08:00:00.123456789+05:30');
  assert.equal(stillOriginal.question.generationRunId, original.generationRunId);
  assert.ok(sameCanonical(stillOriginal.question.content, original.content));
  assert.equal(originalBefore.row.content_hash, stillOriginal.row.content_hash);
  assert.equal(imported.receipts[0].questionVersionId, original.id);
});

test('malformed reference graphs and altered asset bytes are rejected before any import rows', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = freshPackage(taxonomy, { withAsset: true });
  const tampered = structuredClone(pkg);
  tampered.batchKey = `bad-bytes-${randomUUID()}`;
  const bytes = Buffer.from(tampered.assets[0].bytesBase64, 'base64');
  bytes[0] ^= 1;
  tampered.assets[0].bytesBase64 = bytes.toString('base64');
  const before = await importRowCounts();
  await assert.rejects(service.importFactoryPackageV2(principal, tampered, capability), (error) => error.code === 'VALIDATION_ERROR');
  assert.deepEqual(await importRowCounts(), before);
  const missing = structuredClone(pkg);
  missing.batchKey = `missing-ref-${randomUUID()}`;
  missing.references = missing.references.filter((node) => node.kind !== 'evidence');
  await assert.rejects(service.importFactoryPackageV2(principal, missing, capability), (error) => error.code === 'VALIDATION_ERROR');
  assert.deepEqual(await importRowCounts(), before);
});

test('migration 004 to 005 preserves populated legacy bank, private draft, auth, rights, and receipt rows', async () => {
  const database = await startDisposablePostgres();
  let directory;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-factory-upgrade-'));
    const migrationNames = (await readdir(MIGRATIONS_DIRECTORY))
      .filter((name) => /^00[1-4]_.*\.sql$/.test(name));
    assert.equal(migrationNames.length, 4);
    for (const name of migrationNames) await cp(path.join(MIGRATIONS_DIRECTORY, name), path.join(directory, name));
    await migrate(database.pool, { directory });
    await bootstrapLocalSyntheticIdentity(database.pool, {
      env: { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:4173' },
    });

    const fixture = {
      sourceId: randomUUID(), sourceVersionId: randomUUID(), decisionId: randomUUID(),
      taxonomyId: randomUUID(), domainId: randomUUID(), skillId: randomUUID(),
      questionId: randomUUID(), versionId: randomUUID(), sessionId: randomUUID(),
      actorId: '00000000-0000-4000-8000-000000000201',
      key: `legacy-receipt-${randomUUID()}`,
      tokenHash: `sha256:${createHash('sha256').update(randomUUID()).digest('hex')}`,
      csrfHash: `sha256:${createHash('sha256').update(randomUUID()).digest('hex')}`,
      contentHash: `sha256:${createHash('sha256').update('legacy draft content').digest('hex')}`,
      fingerprint: `sha256:${createHash('sha256').update('legacy draft fingerprint').digest('hex')}`,
    };
    await withTransaction(database.pool, async (client) => {
      await client.query(
        `INSERT INTO tsa.sources (id,title,canonical_uri,owner_reference)
         VALUES ($1,'Legacy source retained by upgrade',NULL,'legacy fixture')`, [fixture.sourceId]);
      await client.query(
        `INSERT INTO tsa.source_versions (id,source_id,version_no,content_hash,metadata,evidence_uri)
         VALUES ($1,$2,1,$3,$4::jsonb,'legacy://evidence')`,
        [fixture.sourceVersionId,fixture.sourceId,fixture.contentHash,JSON.stringify({ legacy: 'preserve-me' })]);
      await client.query(
        `INSERT INTO tsa.rights_decisions
          (id,source_version_id,status,allowed_uses,territory,valid_from,valid_to,evidence,decided_by)
         VALUES ($1,$2,'UNKNOWN',ARRAY['DISPLAY']::tsa.rights_use[],ARRAY['Worldwide'],
                 '2024-01-01T00:00:00Z',NULL,'{"note":"unknown, not a grant"}'::jsonb,$3)`,
        [fixture.decisionId,fixture.sourceVersionId,fixture.actorId]);
      await client.query(
        `INSERT INTO tsa.source_rights (source_version_id,decision_id,revision)
         VALUES ($1,$2,1)`, [fixture.sourceVersionId,fixture.decisionId]);
      await client.query(
        `INSERT INTO tsa.taxonomy_versions (id,name,version_no,definition_hash)
         VALUES ($1,'legacy-upgrade-taxonomy',1,$2)`,
        [fixture.taxonomyId,`sha256:${createHash('sha256').update('legacy taxonomy').digest('hex')}`]);
      await client.query(
        `INSERT INTO tsa.taxonomy_nodes (id,taxonomy_version_id,code,kind,parent_id,metadata)
         VALUES ($1,$2,'LEGACY_DOMAIN','DOMAIN',NULL,'{}'::jsonb),
                ($3,$2,'LEGACY_SKILL','SKILL',$1,'{}'::jsonb)`,
        [fixture.domainId,fixture.taxonomyId,fixture.skillId]);
      await client.query('INSERT INTO tsa.questions (id) VALUES ($1)', [fixture.questionId]);
      await client.query(
        `INSERT INTO tsa.question_versions
          (id,question_id,version_no,parent_version_id,schema_version,language,section,
           taxonomy_version_id,domain_id,skill_ids,subskill_ids,cognitive_level,difficulty,
           content,stimulus_version_id,interaction,origin,provenance_ids,generation_run_id,
           created_by,created_at,authored_created_at,content_hash,normalized_fingerprint,reference_namespace)
         VALUES ($1,$2,1,NULL,'question/1','vi-VN','MATH',$3,'LEGACY_DOMAIN',
           '["LEGACY_SKILL"]'::jsonb,'[]'::jsonb,NULL,
           '{"target":"EASY","predicted":null,"empiricalStudyId":null}'::jsonb,
           '[{"type":"text","text":"Legacy draft prompt"}]'::jsonb,NULL,
           '{"type":"SINGLE_CHOICE","options":[{"id":"a","content":[{"type":"text","text":"A"}]}]}'::jsonb,
           'MANUAL','["legacy-provenance"]'::jsonb,NULL,$4,'2024-01-02T03:04:05Z',
           '2024-01-02T03:04:05.123456789+05:30',$5,$6,$7)`,
        [fixture.versionId,fixture.questionId,fixture.taxonomyId,fixture.actorId,fixture.contentHash,fixture.fingerprint,`question/1/${fixture.versionId}`]);
      await client.query(
        `INSERT INTO tsa_private.question_secrets
          (question_version_id,answer_key,explanation,scoring_policy_version,evidence)
         VALUES ($1,'{"type":"SINGLE_CHOICE","optionId":"a"}'::jsonb,
           '[{"type":"text","text":"private retained explanation"}]'::jsonb,
           'legacy-policy/1',$2::jsonb)`, [fixture.versionId,JSON.stringify([fixture.decisionId])]);
      await client.query(
        `INSERT INTO tsa.question_taxonomy (question_version_id,taxonomy_version_id,node_code,dimension,ordinal)
         VALUES ($1,$2,'LEGACY_DOMAIN','DOMAIN',0),($1,$2,'LEGACY_SKILL','SKILL',0)`, [fixture.versionId,fixture.taxonomyId]);
      await client.query(
        `INSERT INTO tsa.question_provenance
          (question_version_id,provenance_id,ordinal,source_version_id,origin,source_span,transformation,creator,rights_decision_at_authoring)
         VALUES ($1,'legacy-provenance',0,$2,'MANUAL',NULL,'original fixture','legacy author',$3)`,
        [fixture.versionId,fixture.sourceVersionId,fixture.decisionId]);
      await client.query(`INSERT INTO tsa.question_workflow (question_version_id,state,revision) VALUES ($1,'DRAFT',7)`, [fixture.versionId]);
      await client.query(
        `INSERT INTO tsa_private.local_auth_sessions
          (id,token_hash,csrf_hash,user_id,created_at,expires_at)
         VALUES ($1,$2,$3,$4,'2024-01-01T00:00:00Z','2024-01-01T01:00:00Z')`,
        [fixture.sessionId,fixture.tokenHash,fixture.csrfHash,fixture.actorId]);
      await client.query(
        `INSERT INTO tsa.idempotency_records
          (id,actor_id,route_scope,idempotency_key,request_hash,response_status,safe_response,resource_id)
         VALUES ($1,$2,'POST /api/v1/questions',$3,$4,201,$5::jsonb,$6)`,
        [randomUUID(),fixture.actorId,fixture.key,fixture.contentHash,
          JSON.stringify({ questionId: fixture.questionId, versionId: fixture.versionId, state: 'DRAFT' }),fixture.questionId]);
    });

    await migrate(database.pool);
    const source = await database.pool.query(
      `SELECT s.origin,s.created_by,sv.content_hash,sv.metadata,sv.evidence_uri
         FROM tsa.sources s JOIN tsa.source_versions sv ON sv.source_id=s.id
        WHERE s.id=$1 AND sv.id=$2`, [fixture.sourceId,fixture.sourceVersionId]);
    assert.equal(source.rowCount,1);
    assert.deepEqual(source.rows[0], {
      origin: null, created_by: null, content_hash: fixture.contentHash,
      metadata: { legacy: 'preserve-me' }, evidence_uri: 'legacy://evidence',
    });
    const draft = await database.pool.query(
      `SELECT qv.content_hash,qv.authored_created_at,qw.state::text AS state,qw.revision,
              qs.explanation,qs.answer_key,q.eligible_version_id
         FROM tsa.question_versions qv JOIN tsa.question_workflow qw ON qw.question_version_id=qv.id
         JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id
         JOIN tsa.questions q ON q.id=qv.question_id WHERE qv.id=$1`, [fixture.versionId]);
    assert.equal(draft.rowCount,1);
    assert.equal(draft.rows[0].content_hash,fixture.contentHash);
    assert.equal(draft.rows[0].authored_created_at,'2024-01-02T03:04:05.123456789+05:30');
    assert.equal(draft.rows[0].state,'DRAFT');
    assert.equal(draft.rows[0].revision,'7');
    assert.equal(draft.rows[0].eligible_version_id,null);
    assert.equal(draft.rows[0].answer_key.optionId,'a');
    assert.equal(draft.rows[0].explanation[0].text,'private retained explanation');
    const preserved = await database.pool.query(
      `SELECT
        (SELECT count(*)::int FROM tsa.rights_decisions WHERE id=$1) AS rights,
        (SELECT count(*)::int FROM tsa.source_rights WHERE source_version_id=$2) AS current_rights,
        (SELECT count(*)::int FROM tsa_private.local_auth_sessions WHERE id=$3 AND token_hash=$4) AS sessions,
        (SELECT count(*)::int FROM tsa.idempotency_records WHERE actor_id=$5 AND idempotency_key=$6) AS receipts`,
      [fixture.decisionId,fixture.sourceVersionId,fixture.sessionId,fixture.tokenHash,fixture.actorId,fixture.key]);
    assert.deepEqual(preserved.rows[0],{rights:1,current_rights:1,sessions:1,receipts:1});
    await assert.rejects(database.pool.query('UPDATE tsa.sources SET title=$2 WHERE id=$1',[fixture.sourceId,'rewrite']),
      (error)=>error.code==='23514');
    await assert.rejects(database.pool.query('UPDATE tsa.question_versions SET content_hash=$2 WHERE id=$1',
      [fixture.versionId,`sha256:${'f'.repeat(64)}`]),(error)=>error.code==='23514');
  } finally {
    await database.pool.end().catch(() => {});
    await database.stop().catch(() => {});
    if (directory) await rm(directory,{recursive:true,force:true});
  }
});

test('requires the private service capability and rejects an unknown authored identity without rows', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = retarget(buildSyntheticFactoryPackageV2(), taxonomy, principal.userId);
  await assert.rejects(service.importFactoryPackageV2(principal, pkg, Object.freeze({})), (error) => error.code === 'FORBIDDEN');
  pkg.producerNamespace = 'synthetic.factory.unknown-author'; pkg.candidates[0].question.createdBy = randomUUID();
  pkg.candidates[0].question.id = randomUUID(); pkg.candidates[0].question.questionId = randomUUID();
  pkg.references = hashNodes(pkg.references); const identity = computeQuestionIdentity(pkg.candidates[0].question, pkg.references); pkg.candidates[0].question.contentHash = identity.contentHash; pkg.candidates[0].contentHash = identity.contentHash; pkg.candidates[0].validations[0].inputHash = identity.contentHash;
  await assert.rejects(service.importFactoryPackageV2(principal, pkg, capability), (error) => error.code === 'AUTHOR_NOT_REGISTERED');
  const rows = await harness.database.pool.query(`SELECT count(*)::int AS count FROM tsa_private.factory_import_manifests WHERE producer_namespace='synthetic.factory.unknown-author'`);
  assert.equal(rows.rows[0].count, 0);
});

test('imports a declared two-candidate unit atomically and rejects tampered or unknown-taxonomy packages without a receipt', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = retarget(buildSyntheticFactoryPackageV2({ candidateCount: 2, validationOutcome: 'FAIL' }), taxonomy, principal.userId);
  pkg.producerNamespace = `synthetic.factory.${randomUUID()}`;
  pkg.batchKey = `two-candidate-${randomUUID()}`;
  for (const candidate of pkg.candidates) {
    candidate.question.id = randomUUID(); candidate.question.questionId = randomUUID();
    candidate.question.generationRunId = randomUUID(); candidate.run.generationRunId = candidate.question.generationRunId;
  }
  const nodeMap = new Map(pkg.references.map((node) => [keyOf(node), node]));
  for (const candidate of pkg.candidates) {
    const identity = computeQuestionIdentity(candidate.question, [...nodeMap.values()]);
    candidate.question.contentHash = identity.contentHash; candidate.contentHash = identity.contentHash;
    candidate.validations.forEach((validation) => { validation.inputHash = identity.contentHash; });
  }
  const result = await service.importFactoryPackageV2(principal, pkg, capability);
  assert.equal(result.receipts.length, 2);
  const states = await harness.database.pool.query(`SELECT qw.state::text AS state, count(*)::int AS count FROM tsa.question_workflow qw JOIN tsa_private.factory_import_receipts r ON r.question_version_id=qw.question_version_id WHERE r.batch_key=$1 GROUP BY qw.state`, [pkg.batchKey]);
  assert.deepEqual(states.rows, [{ state: 'DRAFT', count: 2 }]);
  const importedSourceVersions = await harness.database.pool.query(
    `SELECT local_id FROM tsa_private.factory_external_mappings
      WHERE producer_namespace=$1 AND external_kind='source'`, [pkg.producerNamespace]);
  const currentRights = await harness.database.pool.query(
    'SELECT count(*)::int AS count FROM tsa.source_rights WHERE source_version_id=ANY($1::uuid[])',
    [importedSourceVersions.rows.map((row) => row.local_id)]);
  assert.equal(currentRights.rows[0].count, 0);
  const tampered = structuredClone(pkg); tampered.batchKey = `tampered-${randomUUID()}`; tampered.references.pop();
  await assert.rejects(service.importFactoryPackageV2(principal, tampered, capability), (error) => error.code === 'VALIDATION_ERROR');
  const unknownTaxonomy = { ...taxonomy, versionId: randomUUID() };
  const unknown = retarget(buildSyntheticFactoryPackageV2(), unknownTaxonomy, principal.userId); unknown.batchKey = `unknown-taxonomy-${randomUUID()}`;
  await assert.rejects(service.importFactoryPackageV2(principal, unknown, capability), (error) => error.code === 'TAXONOMY_NOT_REGISTERED');
  const absent = await harness.database.pool.query(`SELECT count(*)::int AS count FROM tsa_private.factory_import_manifests WHERE batch_key = ANY($1::text[])`, [[tampered.batchKey, unknown.batchKey]]);
  assert.equal(absent.rows[0].count, 0);
});

test('private import tables are unreadable to web, factory, exam, and identity roles', async () => {
  await assert.rejects(harness.authPool.query('SELECT * FROM tsa_private.factory_import_manifests'), (error) => error.code === '42501');
  for (const role of ['web', 'factory', 'exam', 'identity']) {
    const login = `private_import_${role}_test`;
    await harness.database.pool.query(`CREATE ROLE ${login} LOGIN`);
    await harness.database.pool.query(`GRANT tsa_${role} TO ${login}`);
    const pool = createDatabasePool({ ...harness.database.connectionConfig, user: login }, {
      max: 1, applicationName: `factory-import-${role}-role-test`,
    });
    try {
      for (const table of ['factory_import_manifests', 'factory_import_receipts',
        'factory_external_mappings', 'factory_import_runs', 'factory_asset_bytes']) {
        await assert.rejects(pool.query(`SELECT * FROM tsa_private.${table}`),
          (error) => error.code === '42501', `${role} must not read ${table}`);
      }
    } finally { await pool.end(); }
  }
});

test('same-package imports serialize on the Bank guard and produce one import plus one replay', async () => {
  const taxonomy = await seedTaxonomy();
  const pkg = freshPackage(taxonomy);
  const acquired = deferred();
  const release = deferred();
  const lock = withTransaction(harness.bankPool, async (client) => {
    await client.query('SELECT id FROM tsa.bank_state WHERE id=1 FOR UPDATE');
    acquired.resolve();
    await release.promise;
  }, { role: 'tsa_bank' });
  let first;
  let second;
  let outcomes;
  try {
    await bounded(acquired.promise, 'Bank guard acquisition');
    first = service.importFactoryPackageV2(principal, structuredClone(pkg), capability);
    second = service.importFactoryPackageV2(principal, structuredClone(pkg), capability);
    await waitForImportLockWaiters(2);
  } finally {
    release.resolve();
    await bounded(lock, 'Bank lock transaction settlement');
    if (first || second) {
      outcomes = await bounded(Promise.allSettled([first, second]), 'Factory import settlement');
    }
  }
  assert.ok(outcomes?.every((outcome) => outcome.status === 'fulfilled'), JSON.stringify(outcomes));
  assert.deepEqual(outcomes.map((outcome) => outcome.value.replayed).sort(), [false, true]);
});
