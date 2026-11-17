import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import test from 'node:test';
import { createManualImportFixture } from './manual-import-fixture.mjs';
import { withTransaction } from '../../../src/modules/database/pool.mjs';
import { createManualFactoryImportService } from '../../../src/modules/bank/manual-import-coordinator.mjs';
import { createQuestionService } from '../../../src/modules/bank/questions.mjs';
import { createReviewContextService } from '../../../src/modules/bank/review-context.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { prepareManualDraftTransport } from '../../../tools/question-factory/manual-transport.mjs';
import { buildCorpusMathNumericPackage } from '../../../tools/corpus-ingest/math-numeric-package.mjs';
import { configureCorpusImport } from '../../../tools/corpus-ingest/verify-reading.mjs';
import { listOwnerCandidates } from '../../../src/local/owner-publication.mjs';
import { planOwnerPublication } from '../../../scripts/owner-publish.mjs';

async function registerMathTaxonomy(fixture) {
  const domain = randomUUID();
  const taxonomy = { schemaVersion: 'taxonomy/1', taxonomyVersionId: randomUUID(), name: 'Numeric Math integration taxonomy',
    versionNo: 1, definitionHash: '', nodes: [
      { id: domain, code: 'MATH', kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: randomUUID(), code: 'MATH_REASONING', kind: 'SKILL', parentId: domain, metadata: {} },
    ] };
  taxonomy.definitionHash = jsonDigest(taxonomy);
  await withTransaction(fixture.database.pool, async (client) => {
    await client.query('INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)',
      [taxonomy.taxonomyVersionId, taxonomy.name, taxonomy.definitionHash]);
    for (const node of taxonomy.nodes) await client.query(`INSERT INTO tsa.taxonomy_nodes
      (id,taxonomy_version_id,code,kind,parent_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [node.id, taxonomy.taxonomyVersionId, node.code, node.kind, node.parentId, JSON.stringify(node.metadata)]);
  });
  return taxonomy;
}

const KEYS = ['1156', '-1', '0.25', '135.5'];
const numericItems = () => KEYS.map((key, index) => {
  const sourcePath = `TSA_ToanHoc_Test/${String(index + 1).padStart(6, '0')}.png`;
  return { id: sourcePath, sourcePath, sourceHash: `sha256:${String(index + 1).padStart(64, '0')}`,
    public: { prompt: `Điền một số thích hợp vào chỗ trống, bài ${index + 1}.` },
    private: { answerKey: { type: 'NUMERIC_RESPONSE', value: key }, explanation: null, extractedKeyText: `Đáp án: ${key}` },
    proposedTaxonomy: { section: 'MATH', topic: 'NUMBER_THEORY', status: 'REQUIRES_VERIFICATION' } };
});

test('numeric Math DRAFTs import as private question/2 versions, replay exactly and never become selectable', async (t) => {
  const fixture = await createManualImportFixture();
  t.after(() => fixture.close());
  const taxonomy = await registerMathTaxonomy(fixture);
  const capability = Object.freeze({});
  const raw = await buildCorpusMathNumericPackage({ items: numericItems(), taxonomy, authorId: fixture.author.principal.userId,
    directory: join(fixture.root, 'numeric-package'), batchKey: 'math-numeric-int-001' });
  const prepared = await prepareManualDraftTransport({ bankPool: fixture.bankPool, identityService: fixture.identity,
    request: fixture.author.request, capability, internalCapability: capability, enabled: true, env: fixture.env,
    mapping: raw.mapping, artifactPaths: raw.artifactPaths, outputDirectory: join(raw.directory, 'prepared'),
    manualRunId: raw.manualRunId, permissionId: raw.permissionId, authoringId: raw.authoringId, transformation: raw.transformation });
  assert.deepEqual(prepared.package, raw.package);
  const config = await configureCorpusImport(fixture.root, prepared, taxonomy,
    'docs/decisions/OPEN_DECISIONS.md#corpus-permission-attestation-and-owner-publication--2026-11-11; disposable test');
  const service = await createManualFactoryImportService({ bankPool: fixture.bankPool, identityService: fixture.identity,
    internalCapability: capability, enabled: true, env: fixture.env, ...config });
  fixture.services.push(service);
  const imported = await service.importManualFactoryPackageV3(fixture.author.request, prepared.package, capability);
  assert.equal(imported.replayed, false);
  assert.equal(imported.receipts.length, 4);
  const replay = await service.importManualFactoryPackageV3(fixture.author.request, prepared.package, capability);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipts, imported.receipts);
  assert.equal((await service.stop()).status, 'STOPPED');

  const ids = prepared.package.candidates.map((candidate) => candidate.question.id);
  const publication = planOwnerPublication(await listOwnerCandidates(fixture.database.pool, { section: 'MATH' }));
  assert.deepEqual(publication.targets.map(row => row.id).sort(), [...ids].sort());
  const localSourceId = (await fixture.database.pool.query(`SELECT local_id FROM tsa_private.factory_external_mappings
    WHERE producer_namespace=$1 AND external_kind='source' AND external_id=$2`,
  [raw.package.producerNamespace, raw.mapping.sourceVersionId])).rows[0].local_id;
  assert.deepEqual(publication.sources.map(row => row.id), [localSourceId]);
  assert.ok(publication.targets.every(row => row.sourceVersionIds.length === 1
    && row.sourceVersionIds[0] === localSourceId));
  const stored = (await fixture.database.pool.query(`SELECT qv.id,qv.schema_version,qv.section,qv.origin,qv.interaction,
      qs.answer_key,qs.scoring_policy_version,w.state::text AS state, tsa.bank_question_selection_allowed(qv.id) AS selectable
    FROM tsa.question_versions qv JOIN tsa_private.question_secrets qs ON qs.question_version_id=qv.id
    JOIN tsa.question_workflow w ON w.question_version_id=qv.id WHERE qv.id=ANY($1::uuid[]) ORDER BY qv.id`, [ids])).rows;
  assert.equal(stored.length, 4);
  for (const row of stored) {
    assert.equal(row.schema_version, 'question/2');
    assert.equal(row.scoring_policy_version, 'practice-binary-v2');
    assert.equal(row.section, 'MATH');
    assert.equal(row.origin, 'IMPORTED');
    assert.equal(row.interaction.type, 'NUMERIC_RESPONSE');
    assert.equal(row.state, 'DRAFT');
    assert.equal(row.selectable, false);
    assert.equal(row.answer_key.type, 'NUMERIC_RESPONSE');
  }
  const expectedKeys = new Map(prepared.package.candidates.map((candidate) => [candidate.question.id, candidate.question.private.answerKey.value]));
  assert.ok(stored.every((row) => row.answer_key.value === expectedKeys.get(row.id)));
  assert.deepEqual([...expectedKeys.values()].sort(), [...KEYS].sort());

  // Staff see the private DRAFTs only when the numeric opt-in is enabled, and the rights gate still blocks preview.
  const questions = await createQuestionService({ bankPool: fixture.bankPool, identityService: fixture.identity, enableNumericQuestions: true });
  const queue = await questions.listQuestionSummaries(fixture.manager.principal,
    new URLSearchParams({ section: 'MATH', state: 'DRAFT', limit: '100' }));
  assert.deepEqual(queue.items.map((item) => item.versionId).sort(), [...ids].sort());
  const context = await createReviewContextService({ bankPool: fixture.bankPool, identityService: fixture.identity, enableNumericQuestions: true });
  for (const id of ids) assert.equal((await context.read(fixture.manager.principal, id)).preview.reason, 'RIGHTS_BLOCKED');
  const gates = (await fixture.database.pool.query(`SELECT (SELECT count(*)::int FROM tsa.reviews) AS reviews,
    (SELECT count(*)::int FROM tsa.questions WHERE eligible_version_id IS NOT NULL) AS eligible`)).rows[0];
  assert.deepEqual(gates, { reviews: 0, eligible: 0 });
});
