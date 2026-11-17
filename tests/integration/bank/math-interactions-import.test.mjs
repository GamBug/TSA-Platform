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
import { buildCorpusMathInteractionPackage } from '../../../tools/corpus-ingest/math-interactions-package.mjs';
import { configureCorpusImport } from '../../../tools/corpus-ingest/verify-reading.mjs';
import { createPublicationService } from '../../../src/modules/bank/publication.mjs';
import { createSourceService } from '../../../src/modules/sources/service.mjs';
import { ownerApprove, ownerConfirmSingleton, listOwnerCandidates } from '../../../src/local/owner-publication.mjs';
import { backupLocalDatabase } from '../../../src/local/database-backup.mjs';
import { startUniDemo } from '../../../src/local/uni-demo.mjs';
import { bankRequest, loginActor } from './harness.mjs';
import { assertNewMathCaptures } from '../../../tools/corpus-ingest/import-math-interactions.mjs';
import { parseManualFactoryPackageV4, buildManualFactoryPackageV4, digestManualCanonicalV4 } from '../../../packages/contracts/dist/internal.js';

async function registerMathTaxonomy(fixture) {
  const domain = randomUUID();
  const taxonomy = { schemaVersion: 'taxonomy/1', taxonomyVersionId: randomUUID(), name: 'Math interactions integration taxonomy',
    versionNo: 1, definitionHash: '', nodes: [
      { id: domain, code: 'MATH', kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: randomUUID(), code: 'MATH_REASONING', kind: 'SKILL', parentId: domain, metadata: {} },
    ] };
  taxonomy.definitionHash = jsonDigest(taxonomy);
  await withTransaction(fixture.database.pool, async (client) => {
    await client.query('INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)',
      [taxonomy.taxonomyVersionId, taxonomy.name, taxonomy.definitionHash]);
    for (const n of taxonomy.nodes) await client.query(`INSERT INTO tsa.taxonomy_nodes
      (id,taxonomy_version_id,code,kind,parent_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
    [n.id, taxonomy.taxonomyVersionId, n.code, n.kind, n.parentId, JSON.stringify(n.metadata)]);
  });
  return taxonomy;
}

const items = () => Array.from({ length: 4 }, (_, i) => {
  const matching = i % 2 === 1;
  const interaction = matching ? { type: 'MATCHING', rows: [{ id: 'row-1', label: 'First sum' }, { id: 'row-2', label: 'Second sum' }],
    targets: ['3', '4', '5'].map((label, j) => ({ id: `target-${j + 1}`, label, maxUses: 2 })) }
    : { type: 'CLOZE', fields: [{ id: 'field-1', label: 'Sum' }], maxLength: 128,
      normalization: { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' } };
  return { sourcePath: `TSA_ToanHoc_Test/${i + 1}.png`, sourceHash: `sha256:${String(i + 1).padStart(64, '0')}`,
    public: { prompt: `Original synthetic arithmetic exercise ${i + 1}: calculate the indicated sums.`, interaction },
    private: { answerKey: matching ? { type: 'MATCHING', answers: { 'row-1': 'target-1', 'row-2': 'target-2' } }
      : { type: 'CLOZE', acceptedValues: { 'field-1': [String(i + 17)] } },
    extractedKeyText: matching ? ['3', '4'] : [String(i + 17)],
    targetPoolSource: matching ? 'VISIBLE_SOURCE_POOL' : null, capturedTargetLabels: matching ? ['3', '4', '5'] : [] } };
});

test('Math cloze/matching imports preserve private source keys, strict projection, opt-in and replay', async (t) => {
  const f = await createManualImportFixture(); t.after(() => f.close());
  const taxonomy = await registerMathTaxonomy(f), capability = Object.freeze({});
  const raw = await buildCorpusMathInteractionPackage({ items: items(), taxonomy, authorId: f.author.principal.userId,
    directory: join(f.root, 'math-interactions'), batchKey: 'math-interactions-001' });
  assert.deepEqual(parseManualFactoryPackageV4(raw.package), raw.package);
  assert.equal(raw.package.manualRun.kind, 'SUBSCRIPTION_VISION_TRANSCRIPTION');
  assert.equal(raw.package.manualRun.providerCalled, false);
  const changed = structuredClone(raw.package); changed.candidates[0].question.private.answerKey.acceptedValues['field-1'] = ['999'];
  assert.throws(() => parseManualFactoryPackageV4(changed));
  assert.throws(() => parseManualFactoryPackageV4({ ...raw.package, profile: 'corpus-reading-interactions-draft/1' }));
  const rebuild = (change) => {
    const artifacts = Object.fromEntries(Object.entries(raw.artifacts).map(([k, v]) => [k, JSON.parse(v)]));
    change(artifacts);
    artifacts.declaration.promptHash = digestManualCanonicalV4(artifacts.prompt);
    return buildManualFactoryPackageV4({ ...raw, artifacts: Object.fromEntries(Object.entries(artifacts).map(([k, v]) => [k, Buffer.from(JSON.stringify(v))])) });
  };
  assert.throws(() => rebuild((a) => { a.sourceDeclaration.prompt.candidates[0].sourceHash = 'sha256:' + '0'.repeat(64); }));
  assert.throws(() => rebuild((a) => { a.sourceDeclaration.prompt.candidates[1].capturedTargetLabels.pop(); }));
  assert.throws(() => rebuild((a) => { a.input.sources[0].rights.publicationPermission = true; }));
  const config = await configureCorpusImport(f.root, raw, taxonomy, 'Disposable Math interaction verification');
  const args = { bankPool: f.bankPool, identityService: f.identity, internalCapability: capability, enabled: true, env: f.env, ...config };
  await assert.rejects(createManualFactoryImportService(args), (e) => e.code === 'MANUAL_CLOZE_MATCHING_DISABLED');
  const service = await createManualFactoryImportService({ ...args, enableClozeMatching: true }); f.services.push(service);
  await assert.rejects(service.importManualFactoryPackageV4(f.manager.request, raw.package, capability));
  const imported = await service.importManualFactoryPackageV4(f.author.request, raw.package, capability);
  assert.equal(imported.replayed, false); assert.equal(imported.receipts.length, 4);
  const replay = await service.importManualFactoryPackageV4(f.author.request, raw.package, capability);
  assert.equal(replay.replayed, true); assert.deepEqual(replay.receipts, imported.receipts);
  await service.stop();
  await assert.rejects(assertNewMathCaptures(f.database.pool, items()), /CAPTURE_ALREADY_IMPORTED/);
  await assert.doesNotReject(assertNewMathCaptures(f.database.pool, [{ sourcePath: 'TSA_ToanHoc_Test/new.png' }]));
  const ids = raw.package.candidates.map((c) => c.question.id);
  const rows = (await f.database.pool.query(`SELECT v.id,v.schema_version,v.section,v.stimulus_version_id,s.answer_key,w.state,
    tsa.bank_question_selection_allowed(v.id) AS selectable FROM tsa.question_versions v
    JOIN tsa_private.question_secrets s ON s.question_version_id=v.id JOIN tsa.question_workflow w ON w.question_version_id=v.id
    WHERE v.id=ANY($1::uuid[])`, [ids])).rows;
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.schema_version, 'question/3'); assert.equal(row.section, 'MATH');
    assert.equal(row.stimulus_version_id, null); assert.equal(row.state, 'DRAFT'); assert.equal(row.selectable, false);
    assert.deepEqual(row.answer_key, raw.package.candidates.find((c) => c.question.id === row.id).question.private.answerKey);
  }
  const questions = await createQuestionService({ bankPool: f.bankPool, identityService: f.identity, enableClozeMatching: true });
  const queue = await questions.listQuestionSummaries(f.manager.principal, new URLSearchParams({ section: 'MATH', state: 'DRAFT', limit: '100' }));
  assert.deepEqual(queue.items.map((i) => i.versionId).sort(), [...ids].sort());
  const context = await createReviewContextService({ bankPool: f.bankPool, identityService: f.identity, enableClozeMatching: true });
  for (const id of ids) assert.equal((await context.read(f.manager.principal, id)).preview.reason, 'RIGHTS_BLOCKED');
  assert.equal((await f.database.pool.query('SELECT count(*)::int AS n FROM tsa.reviews')).rows[0].n, 0);

  // The owner-maintenance helpers are exercised only on these synthetic, disposable questions.
  const workflow = await createPublicationService({ bankPool: f.bankPool, identityService: f.identity, enableClozeMatching: true });
  for (const id of ids) await workflow.submitReview(f.author.principal, id, randomUUID(), { expectedRevision: 1 });
  await assert.rejects(ownerConfirmSingleton(f.database.pool, ids[0], { reviewerId: f.author.principal.userId }), /must differ/);
  for (const id of ids) await ownerConfirmSingleton(f.database.pool, id);
  await assert.rejects(ownerApprove(f.database.pool, ids[0]), (e) => e.code === 'RIGHTS_BLOCKED');
  const sources = await createSourceService({ bankPool: f.bankPool, identityService: f.identity });
  const unpublished = await listOwnerCandidates(f.database.pool, { section: 'MATH' });
  assert.equal(unpublished.versions.length, 4);
  await sources.registerRightsDecision(f.manager.principal, unpublished.sources[0].id, randomUUID(), {
    status: 'OWNED', allowedUses: ['DISPLAY'], territory: ['VN'], validFrom: '2020-01-01T00:00:00Z', validTo: null,
    evidence: 'Original synthetic fixture only; no real corpus approval.', expectedRevision: 0,
  });
  for (const id of ids) await ownerApprove(f.database.pool, id);
  const archive = await backupLocalDatabase({ connectionConfig: f.database.connectionConfig, directory: join(f.root, 'demo-source') });
  const demo = await startUniDemo({ mode: 'REHEARSAL', port: 0, sourceArchive: archive }); t.after(() => demo.close());
  assert.deepEqual(demo.report.published, { MATH: 4, READING: 0, SCIENCE: 0 });
  assert.deepEqual(demo.report.offerings.map((o) => o.kind), ['CLOZE_MATCHING_PRACTICE']);
  assert.match(demo.urls.clozeMatching, /postgres-v4$/);
  const student = await loginActor(demo, 'studentA');
  const body = async (response, status = 200) => { const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value)); return value; };
  const catalog = await body(await bankRequest(demo, student, '/api/v4/catalog', { query: 'limit=100' }));
  assert.equal(catalog.items.length, 1);
  assert.equal((await body(await bankRequest(demo, student, '/api/v2/catalog', { query: 'limit=100' }))).items.length, 0);
  const attempt = await body(await bankRequest(demo, student, '/api/v4/attempts', { method: 'POST', key: randomUUID(),
    body: { blueprintVersionId: catalog.items[0].blueprintVersionId } }), 201);
  const route = `/api/v4/attempts/${attempt.attemptId}`;
  await body(await bankRequest(demo, student, `${route}/start`, { method: 'POST', key: randomUUID(), body: {} }));
  const view = await body(await bankRequest(demo, student, route));
  assert.equal(view.slots.length, 4); assert.doesNotMatch(JSON.stringify(view), /acceptedValues|answerKey|capturedTargetLabels/);
  for (const slot of view.slots) {
    const index = Number(/exercise (\d+)/u.exec(slot.content[0].text)[1]) - 1;
    const key = items()[index].private.answerKey;
    const value = key.type === 'CLOZE' ? { type: 'CLOZE', values: Object.fromEntries(Object.entries(key.acceptedValues).map(([k, v]) => [k, v[0]])) }
      : { type: 'MATCHING', assignments: key.answers };
    await body(await bankRequest(demo, student, `${route}/answers/${slot.slotId}`, { method: 'PUT', key: randomUUID(), body: { expectedRevision: 0, value } }));
  }
  await body(await bankRequest(demo, student, `${route}/submit`, { method: 'POST', key: randomUUID(), body: {} }));
  let result;
  for (const until = Date.now() + 10_000; Date.now() < until;) {
    const response = await bankRequest(demo, student, `${route}/result`);
    if (response.status === 200) { result = await response.json(); break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(result, 'the Math interaction attempt is graded');
  assert.equal(result.correctCount, 4); assert.equal(result.policyVersion, 'practice-binary-v3');
  if (process.env.MATH_INTERACTIONS_BROWSER === 'true') {
    const { verifyMathInteractionsBrowser } = await import('../../../scripts/math-interactions-browser-journey.mjs');
    t.diagnostic(JSON.stringify(await verifyMathInteractionsBrowser(demo)));
  }
  await demo.close();
});
