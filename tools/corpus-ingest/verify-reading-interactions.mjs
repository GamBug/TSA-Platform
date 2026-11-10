// Verify all explicitly keyed interaction captures through a disposable Bank database.
import assert from 'node:assert/strict';
import { chmod, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createManualImportFixture } from '../../tests/integration/bank/manual-import-fixture.mjs';
import { backupLocalDatabase } from '../../src/local/database-backup.mjs';
import { createQuestionService } from '../../src/modules/bank/questions.mjs';
import { createManualFactoryImportService } from '../../src/modules/bank/manual-import-coordinator.mjs';
import { createManualImportActiveState, manualImportActivationHash, manualImportConfigurationScopeHash,
  MANUAL_IMPORT_CONFIGURATION_LAYOUT as layout } from '../../src/modules/bank/manual-import-configuration.mjs';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { readReadingInteractionCorpus } from './reading-interactions.mjs';
import { buildCorpusReadingInteractionPackage } from './reading-interactions-package.mjs';
import { sourceManifest } from './reading-captures.mjs';
import { createPrivateOutputDirectory, writePrivateJson } from './reading-package.mjs';

function countBy(items, key) {
  const counts = {};
  for (const item of items) { const name = key(item); counts[name] = (counts[name] ?? 0) + 1; }
  return counts;
}

async function configureInteractionImport(outputDirectory, prepared, taxonomy, index) {
  const pkg = prepared.package;
  const activation = { schemaVersion: 'manual-import-activation/1', activationId: `reading-interactions-${index + 1}`,
    profile: pkg.profile,
    ownerDecisionRef: 'docs/decisions/OPEN_DECISIONS.md#cp4-derived-matching-drafts--2026-11-09; disposable verification only',
    producerNamespace: pkg.producerNamespace, registeredAuthorId: prepared.mapping.registeredAuthorId,
    declaredOperatorId: pkg.manualRun.declaredOperatorId, sourceVersionId: pkg.manualRun.sourceVersionIds[0],
    sourceTextHash: pkg.sourcePermissions[0].sourceTextHash, permissionHash: jsonDigest(pkg.sourcePermissions[0]),
    sourceAuthoringHash: jsonDigest(pkg.sourceAuthoring[0]), responseHash: pkg.manualRun.responseHash,
    promptHash: pkg.manualRun.promptHash, mappingHash: jsonDigest(prepared.mapping),
    taxonomyVersionId: taxonomy.taxonomyVersionId, taxonomyDefinitionHash: taxonomy.definitionHash,
    validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 3_600_000).toISOString() };
  const directory = join(outputDirectory, `configuration-${String(index + 1).padStart(2, '0')}`);
  await createPrivateOutputDirectory(directory);
  await writePrivateJson(join(directory, layout.activation), activation);
  await writePrivateJson(join(directory, layout.mapping), prepared.mapping);
  await writePrivateJson(join(directory, layout.state), createManualImportActiveState(activation));
  const approvedActivationHash = manualImportActivationHash(activation);
  const approvedConfigurationScopeHash = manualImportConfigurationScopeHash(directory, approvedActivationHash);
  await writePrivateJson(join(directory, 'verification-pins.json'), { approvedActivationHash, approvedConfigurationScopeHash });
  return { configurationDirectory: directory, approvedActivationHash, approvedConfigurationScopeHash };
}

export async function verifyCorpusReadingInteractions({ sourceRoot, outputDirectory }) {
  const before = await sourceManifest(sourceRoot);
  const corpus = await readReadingInteractionCorpus(sourceRoot);
  assert.deepEqual(corpus.manifest, before);
  assert.equal(corpus.sourceFileCount, 600);
  assert.equal(corpus.selected.length, 10);
  assert.equal(corpus.selected.reduce((total, group) => total + group.items.length, 0), 78);
  assert.equal(corpus.deferred.reduce((total, group) => total + group.items.length, 0), 22);
  const output = await createPrivateOutputDirectory(outputDirectory);
  await writePrivateJson(join(output, 'source-manifest-before.json'), before);
  await writePrivateJson(join(output, 'deferred.json'), corpus.deferred);
  await writePrivateJson(join(output, 'capture-counts.json'), corpus.counts);

  let fixture;
  const capability = Object.freeze({});
  const packages = [];
  const receipts = [];
  const pins = [];
  try {
    fixture = await createManualImportFixture();
    await copyFile(fixture.backup, join(output, 'before-migrations.dump'));
    await chmod(join(output, 'before-migrations.dump'), 0o600);
    const backup = await backupLocalDatabase({ connectionConfig: fixture.database.connectionConfig,
      directory: join(output, 'before-interaction-import') });
    await writePrivateJson(join(output, 'backup.json'), backup);

    const deferredByPassage = new Map(corpus.deferred.map((group) => [group.passageId, group.items]));
    for (const [index, group] of corpus.selected.entries()) {
      const prepared = await buildCorpusReadingInteractionPackage({ group,
        deferred: deferredByPassage.get(group.passageId), taxonomy: fixture.taxonomy,
        authorId: fixture.author.principal.userId, directory: join(output, `bundle-${String(index + 1).padStart(2, '0')}`) });
      assert.equal(prepared.mapping.profile, 'corpus-reading-interactions-draft/1');
      assert.equal(prepared.package.candidates.length, group.items.length);
      const stimulus = prepared.package.references.find((node) => node.kind === 'stimulus');
      assert.ok(stimulus);
      assert.equal(stimulus.payload.content[0].text, group.passage, 'the complete source passage is retained');
      for (const [candidateIndex, candidate] of prepared.package.candidates.entries()) {
        const sourceItem = group.items[candidateIndex];
        const evidence = prepared.package.references.find((node) => node.kind === 'evidence'
          && node.id === candidate.question.private.evidenceRefs[1]).payload;
        assert.deepEqual(candidate.question.content, [{ type: 'text', text: sourceItem.public.prompt }]);
        assert.deepEqual(candidate.question.interaction, sourceItem.public.interaction);
        assert.deepEqual(candidate.question.private.answerKey, sourceItem.private.answerKey);
        assert.deepEqual(evidence.adaptationFlags, sourceItem.private.adaptationFlags);
        assert.deepEqual(evidence.adaptationDetails, sourceItem.private.adaptationDetails ?? []);
      }
      const config = await configureInteractionImport(output, prepared, fixture.taxonomy, index);
      pins.push({ configurationDirectory: config.configurationDirectory,
        approvedActivationHash: config.approvedActivationHash,
        approvedConfigurationScopeHash: config.approvedConfigurationScopeHash });
      const service = await createManualFactoryImportService({ bankPool: fixture.bankPool,
        identityService: fixture.identity, internalCapability: capability, enabled: true, enableClozeMatching: true,
        env: fixture.env, ...config });
      fixture.services.push(service);
      let importError;
      try {
        const imported = await service.importManualFactoryPackageV4(fixture.author.request, prepared.package, capability);
        assert.equal(imported.replayed, false);
        assert.equal(imported.receipts.length, group.items.length);
        const replay = await service.importManualFactoryPackageV4(fixture.author.request, prepared.package, capability);
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.receipts, imported.receipts);
        receipts.push(...imported.receipts);
        packages.push(prepared.package);
        await writePrivateJson(join(prepared.directory, 'import-receipts.json'), imported.receipts);
      } catch (error) { importError = error; throw error; }
      finally {
        const stopped = await service.stop();
        if (stopped.status !== 'STOPPED') {
          const stopError = new Error(`INTERACTION_IMPORT_STOP_${stopped.status}`);
          throw importError ? new AggregateError([importError, stopError], 'Interaction import and retirement failed') : stopError;
        }
      }
    }

    const ids = packages.flatMap((pkg) => pkg.candidates.map(({ question }) => question.id));
    assert.equal(ids.length, 78);
    const questions = await createQuestionService({ bankPool: fixture.bankPool,
      identityService: fixture.identity, enableClozeMatching: true });
    const queue = await questions.listQuestionSummaries(fixture.manager.principal,
      new URLSearchParams({ section: 'READING', state: 'DRAFT', limit: '100' }));
    assert.equal(queue.items.length, 78);
    assert.equal(queue.nextCursor, null);
    assert.ok(queue.items.every((item) => item.state === 'DRAFT'));
    assert.deepEqual(queue.items.map((item) => item.versionId).sort(), [...ids].sort());

    const gates = (await fixture.database.pool.query(`SELECT
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND schema_version='question/3') AS v3,
      (SELECT count(*)::int FROM tsa.question_workflow WHERE question_version_id=ANY($1::uuid[]) AND state='DRAFT') AS drafts,
      (SELECT count(*)::int FROM tsa.reviews WHERE question_version_id=ANY($1::uuid[])) AS reviews,
      (SELECT count(*)::int FROM tsa.source_rights) AS source_rights,
      (SELECT count(*)::int FROM tsa.questions WHERE eligible_version_id=ANY($1::uuid[])) AS eligible,
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND tsa.bank_question_selection_allowed(id)) AS selectable,
      (SELECT count(DISTINCT stimulus_version_id)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[])) AS stimuli,
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND created_by=$2) AS import_authored`,
    [ids, fixture.author.principal.userId])).rows[0];
    assert.deepEqual(gates, { v3: 78, drafts: 78, reviews: 0, source_rights: 0,
      eligible: 0, selectable: 0, stimuli: 10, import_authored: 78 });
    const typeRows = (await fixture.database.pool.query(`SELECT interaction->>'type' AS type,count(*)::int AS count
      FROM tsa.question_versions WHERE id=ANY($1::uuid[]) GROUP BY interaction->>'type' ORDER BY type`, [ids])).rows;
    const types = Object.fromEntries(typeRows.map(({ type, count }) => [type, count]));
    assert.deepEqual(types, { CLOZE: 19, MATCHING: 13, MULTIPLE_CHOICE: 10, SINGLE_CHOICE: 36 });

    const after = await sourceManifest(sourceRoot);
    assert.deepEqual(after, before);
    await writePrivateJson(join(output, 'source-manifest-after.json'), after);
    await writePrivateJson(join(output, 'review-queue.json'), queue);
    await writePrivateJson(join(output, 'import-receipts.json'), receipts);
    const summary = { status: 'PASS', drafts: 78, passages: 10, deferred: 22, types,
      sourceFiles: after.length, sourceManifestHash: jsonDigest(after), gates,
      disposableDatabase: true, retainedDatabase: false, activationPins: pins, providerCalled: false,
      outputDirectory: output };
    await writePrivateJson(join(output, 'summary.json'), summary);
    return summary;
  } catch (error) {
    await writePrivateJson(join(output, 'failure.json'), { code: error.code ?? error.name, message: String(error.message).slice(0, 240) })
      .catch(() => {});
    throw error;
  } finally {
    await fixture?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourceRootArg, outputArg] = process.argv.slice(2);
  const root = resolve(sourceRootArg ?? 'TSA_Example_Questions');
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const output = resolve(outputArg ?? join('data', 'corpus-ingest', `reading-interactions-${stamp}`));
  const summary = await verifyCorpusReadingInteractions({ sourceRoot: root, outputDirectory: output });
  console.log(JSON.stringify({ status: summary.status, drafts: summary.drafts, passages: summary.passages,
    deferred: summary.deferred, types: summary.types, sourceFiles: summary.sourceFiles,
    outputDirectory: summary.outputDirectory }));
}
