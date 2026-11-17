// Backed-up disposable verification through the existing corpus coordinator path.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, copyFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import katex from 'katex';
import { createManualImportFixture } from '../../tests/integration/bank/manual-import-fixture.mjs';
import { backupLocalDatabase } from '../../src/local/database-backup.mjs';
import { withTransaction } from '../../src/modules/database/pool.mjs';
import { createManualFactoryImportService } from '../../src/modules/bank/manual-import-coordinator.mjs';
import { prepareManualDraftTransport } from '../question-factory/manual-transport.mjs';
import { createQuestionService } from '../../src/modules/bank/questions.mjs';
import { createReviewContextService } from '../../src/modules/bank/review-context.mjs';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { assertNoRevealedAnswers, sourceManifest } from './reading-captures.mjs';
import { createPrivateOutputDirectory, writePrivateJson } from './reading-package.mjs';
import { configureCorpusImport } from './verify-reading.mjs';
import { buildCorpusMathPackage } from './math-package.mjs';
import { readMathBatches, readMathBlindChecks, saveMathVerificationProgress } from './math-batches.mjs';

const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
function renderText(value) {
  return value.split(/(\$[^$]+\$)/gu).map((part) => part.startsWith('$') && part.endsWith('$')
    ? katex.renderToString(part.slice(1, -1), { throwOnError: true, trust: false, strict: 'error' }) : escape(part)).join('');
}
function countBy(items, key) {
  const counts = {};
  for (const item of items) { const name = key(item); counts[name] = (counts[name] ?? 0) + 1; }
  return counts;
}

async function registerMathTaxonomy(fixture) {
  const domain = randomUUID();
  const taxonomy = { schemaVersion: 'taxonomy/1', taxonomyVersionId: randomUUID(),
    name: 'Private corpus Math provisional taxonomy', versionNo: 1, definitionHash: '', nodes: [
      { id: domain, code: 'MATH', kind: 'DOMAIN', parentId: null, metadata: {} },
      { id: randomUUID(), code: 'MATH_REASONING', kind: 'SKILL', parentId: domain,
        metadata: { classification: 'PROVISIONAL_REQUIRES_OWNER_REVIEW' } },
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

export async function verifyCorpusMath({ sourceRoot, extractionDirectory, outputDirectory }) {
  const corpus = await readMathBatches(sourceRoot, extractionDirectory);
  assert.equal(corpus.items.length, 80, 'CP3B_REQUIRES_FOUR_COMPLETE_IMPORT_BATCHES');
  const checks = await readMathBlindChecks(extractionDirectory, corpus.items);
  await createPrivateOutputDirectory(outputDirectory);
  const progress = { outputDirectory: resolve(outputDirectory), status: 'STARTED', imported: 0,
    database: 'DISPOSABLE', batchSize: 20, batches: [] };
  await saveMathVerificationProgress(extractionDirectory, progress);
  let fixture;
  const capability = Object.freeze({});
  const receipts = [], packages = [], pins = [];
  try {
    fixture = await createManualImportFixture();
    await copyFile(fixture.backup, join(outputDirectory, 'before-migrations.dump'));
    await chmod(join(outputDirectory, 'before-migrations.dump'), 0o600);
    const backup = await backupLocalDatabase({ connectionConfig: fixture.database.connectionConfig,
      directory: join(outputDirectory, 'before-math-registration-and-import') });
    await writePrivateJson(join(outputDirectory, 'backup.json'), backup);
    const taxonomy = await registerMathTaxonomy(fixture);
    for (let offset = 0; offset < corpus.items.length; offset += 20) {
      const ordinal = offset / 20 + 1;
      const items = corpus.items.slice(offset, offset + 20);
      const raw = await buildCorpusMathPackage({ items, taxonomy, authorId: fixture.author.principal.userId,
        directory: join(outputDirectory, `batch-${String(ordinal).padStart(3, '0')}`),
        batchKey: `math-batch-${String(ordinal).padStart(3, '0')}` });
      const prepared = await prepareManualDraftTransport({ bankPool: fixture.bankPool, identityService: fixture.identity,
        request: fixture.author.request, capability, internalCapability: capability, enabled: true, env: fixture.env,
        mapping: raw.mapping, artifactPaths: raw.artifactPaths, outputDirectory: join(raw.directory, 'prepared'),
        manualRunId: raw.manualRunId, permissionId: raw.permissionId, authoringId: raw.authoringId, transformation: raw.transformation });
      assert.deepEqual(prepared.package, raw.package);
      assert.equal(prepared.receipt.questionCount, 20);
      for (const [index, candidate] of prepared.package.candidates.entries()) {
        const question = candidate.question;
        const publicFields = { content: question.content, interaction: question.interaction };
        assertNoRevealedAnswers(publicFields);
        assert.equal(JSON.stringify(publicFields).includes(items[index].private.extractedKeyText), false);
        assert.deepEqual(question.private.answerKey, items[index].private.answerKey);
        assert.equal(question.section, 'MATH'); assert.equal(question.stimulusVersionId, null);
        if (question.interaction.type === 'MULTIPLE_CHOICE') {
          assert.equal(question.interaction.minSelections, 1);
          assert.equal(question.interaction.maxSelections, question.interaction.options.length);
        }
      }
      const config = await configureCorpusImport(outputDirectory, prepared, taxonomy,
        'docs/decisions/OPEN_DECISIONS.md#cp3b-revised-math-ingestion-authority--2026-11-09; disposable verification only');
      pins.push(config);
      const service = await createManualFactoryImportService({ bankPool: fixture.bankPool, identityService: fixture.identity,
        internalCapability: capability, enabled: true, env: fixture.env, ...config });
      fixture.services.push(service);
      let importError;
      try {
        const imported = await service.importManualFactoryPackageV3(fixture.author.request, prepared.package, capability);
        assert.equal(imported.replayed, false); assert.equal(imported.receipts.length, 20);
        const replay = await service.importManualFactoryPackageV3(fixture.author.request, prepared.package, capability);
        assert.equal(replay.replayed, true); assert.deepEqual(replay.receipts, imported.receipts);
        await writePrivateJson(join(raw.directory, 'import-receipts.json'), imported.receipts);
        receipts.push(...imported.receipts); packages.push(prepared.package);
      } catch (error) { importError = error; throw error; }
      finally {
        const stopped = await service.stop();
        if (stopped.status !== 'STOPPED') {
          const stopError = new Error(`MATH_IMPORT_STOP_${stopped.status}`);
          throw importError ? new AggregateError([importError, stopError], 'Math import and retirement failed') : stopError;
        }
      }
      progress.batches.push({ batch: ordinal, count: 20, replayVerified: true,
        manifestHash: jsonDigest(prepared.package), packageDirectory: raw.directory });
      progress.imported += 20;
      await saveMathVerificationProgress(extractionDirectory, progress);
    }
    const ids = packages.flatMap((pkg) => pkg.candidates.map((candidate) => candidate.question.id));
    const questions = await createQuestionService({ bankPool: fixture.bankPool, identityService: fixture.identity });
    const queue = await questions.listQuestionSummaries(fixture.manager.principal,
      new URLSearchParams({ section: 'MATH', state: 'DRAFT', limit: '100' }));
    assert.equal(queue.items.length, 80); assert.equal(queue.nextCursor, null);
    assert.ok(queue.items.every((item) => item.state === 'DRAFT'));
    assert.deepEqual(queue.items.map((item) => item.versionId).sort(), [...ids].sort());
    const gates = (await fixture.database.pool.query(`SELECT
      (SELECT count(*)::int FROM tsa.reviews) AS reviews,
      (SELECT count(*)::int FROM tsa.source_rights) AS rights,
      (SELECT count(*)::int FROM tsa.questions WHERE eligible_version_id IS NOT NULL) AS eligible,
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND tsa.bank_question_selection_allowed(id)) AS selectable,
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND created_by=$2) AS import_authored,
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND stimulus_version_id IS NOT NULL) AS shared_stimuli`,
    [ids, fixture.author.principal.userId])).rows[0];
    assert.deepEqual(gates, { reviews: 0, rights: 0, eligible: 0, selectable: 0, import_authored: 80, shared_stimuli: 0 });
    assert.notEqual(fixture.author.principal.userId, fixture.manager.principal.userId);
    const context = await createReviewContextService({ bankPool: fixture.bankPool, identityService: fixture.identity });
    for (const id of ids) {
      const review = await context.read(fixture.manager.principal, id);
      assert.equal(review.preview.reason, 'RIGHTS_BLOCKED');
    }
    await writePrivateJson(join(outputDirectory, 'review-queue.json'), queue);
    await writePrivateJson(join(outputDirectory, 'import-receipts.json'), receipts);
    await writePrivateJson(join(outputDirectory, 'transcription-checks.json'), checks);
    await writePrivateJson(join(outputDirectory, 'needs-owner-attention.json'), corpus.log.needs_owner_attention);
    await writePrivateJson(join(outputDirectory, 'deferred.json'), corpus.log.deferred);
    await writePrivateJson(join(outputDirectory, 'uninspected.json'), corpus.uninspected);
    const samples = Array.from({ length: 10 }, (_, index) => corpus.items[Math.floor(index * (corpus.items.length - 1) / 9)]);
    await writePrivateJson(join(outputDirectory, 'samples.json'), samples);
    const css = await readFile(new URL('../../node_modules/katex/dist/katex.min.css', import.meta.url), 'utf8');
    const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'"><title>Private Math DRAFT samples</title><style>'
      + css + 'body{font:17px/1.6 system-ui;max-width:1000px;margin:2rem auto;padding:1rem}article{border-top:2px solid;padding:1rem}p{white-space:pre-wrap}</style><h1>PRIVATE · Ten Math DRAFT samples · Owner approval pending</h1>'
      + samples.map((item) => `<article><h2>${escape(item.id)}</h2><p>${renderText(item.public.prompt)}</p><ol>${(item.public.options ?? item.public.statements).map((entry) => `<li>${entry.content.map((block) => renderText(block.text)).join(' ')}</li>`).join('')}</ol><details><summary>Private source key</summary><pre>${escape(JSON.stringify(item.private.answerKey, null, 2))}</pre></details></article>`).join('') + '</html>';
    await writeFile(join(outputDirectory, 'samples.html'), html, { flag: 'wx', mode: 0o600 });
    const after = await sourceManifest(sourceRoot); assert.deepEqual(after, corpus.manifest);
    await writePrivateJson(join(outputDirectory, 'source-manifest-after.json'), after);
    const summary = { status: 'PASS', domain: 'MATH', drafts: 80, importBatches: 4, batchSize: 20,
      types: countBy(corpus.items, (item) => item.private.answerKey.type),
      topicCounts: countBy(corpus.items, (item) => item.proposedTaxonomy.topic),
      taxonomyStatus: 'PROVISIONAL_REQUIRES_VERIFICATION', blindChecks: checks.length,
      inspectedImages: corpus.log.inspected.length, deferred: corpus.log.deferred.length,
      needsOwnerAttention: corpus.log.needs_owner_attention.length, uninspectedImages: corpus.uninspected.length,
      samples: samples.length, unchangedSourceFiles: after.length, sourceManifestHash: jsonDigest(after), gates,
      disposableDatabase: true, retainedDatabase: false, activationPins: pins, providerCalled: false };
    await writePrivateJson(join(outputDirectory, 'summary.json'), summary);
    progress.status = 'VERIFIED';
    await saveMathVerificationProgress(extractionDirectory, progress);
    return summary;
  } catch (error) {
    progress.status = 'FAILED'; progress.errorCode = error.code ?? error.name;
    await saveMathVerificationProgress(extractionDirectory, progress);
    throw error;
  } finally { await fixture?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 3) throw new Error('Usage: verify-math SOURCE_ROOT EXTRACTION_DIR NEW_PRIVATE_OUTPUT_DIR');
  const [sourceRoot, extractionDirectory, outputDirectory] = args.map((value) => resolve(value));
  const summary = await verifyCorpusMath({ sourceRoot, extractionDirectory, outputDirectory });
  console.log(JSON.stringify({ status: summary.status, drafts: summary.drafts, batches: summary.importBatches,
    blindChecks: summary.blindChecks, samples: summary.samples, unchangedSourceFiles: summary.unchangedSourceFiles }));
}
