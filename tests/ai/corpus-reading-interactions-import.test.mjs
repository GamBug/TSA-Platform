import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { createManualImportFixture, manualConfiguration } from '../integration/bank/manual-import-fixture.mjs';
import { createManualFactoryImportService, reconcileManualFactoryImportAdmission } from '../../src/modules/bank/manual-import-coordinator.mjs';
import { loadManualImportConfiguration, beginManualImportAdmission } from '../../src/modules/bank/manual-import-configuration.mjs';
import { createQuestionService } from '../../src/modules/bank/questions.mjs';
import { readReadingInteractionCorpus } from '../../tools/corpus-ingest/reading-interactions.mjs';
import { buildCorpusReadingInteractionPackage } from '../../tools/corpus-ingest/reading-interactions-package.mjs';
import { sourceManifest } from '../../tools/corpus-ingest/reading-captures.mjs';
import { parseManualFactoryPackageV4, parseManualImportMappingV4 } from '../../packages/contracts/dist/internal.js';
import { buildManualFactoryPackageV4 } from '../../packages/contracts/dist/internal.js';
import { digestManualCanonicalV4 } from '../../packages/contracts/dist/internal.js';
import { assertSafeQuestionContent } from '../../src/modules/bank/content-safety.mjs';

const sourceRoot = join(process.cwd(), 'TSA_Example_Questions');
const interactionProfile = 'corpus-reading-interactions-draft/1';

function changeSingleChoiceKey(packageValue) {
  const changed = structuredClone(packageValue);
  const candidate = changed.candidates.find(({ question }) => question.private.answerKey.type === 'SINGLE_CHOICE');
  assert.ok(candidate, 'a selected source group contains a single-choice candidate');
  candidate.question.private.answerKey.optionId = candidate.question.private.answerKey.optionId === 'A' ? 'B' : 'A';
  return changed;
}

async function rebuildWithSourceText(prepared, taxonomy, sourceText) {
  const artifacts = {}, decoded = {}, mapping = structuredClone(prepared.mapping);
  const passageId = `sha256:${createHash('sha256').update(sourceText.normalize('NFC').replace(/\s+/gu, ' ').trim()).digest('hex')}`;
  mapping.batchKey = passageId;
  for (const name of ['input', 'prompt', 'response', 'declaration', 'sourceDeclaration']) {
    const value = JSON.parse(await readFile(prepared.artifactPaths[name], 'utf8'));
    if (name === 'input') { value.sources[0].text = sourceText; value.batchKey = passageId; }
    if (name === 'prompt') value.sourceData = sourceText;
    if (name === 'response') for (const question of value.questions) {
      question.evidence.end = sourceText.length;
      question.evidence.quote = sourceText;
    }
    if (name === 'sourceDeclaration') value.prompt.passageId = passageId;
    decoded[name] = value;
  }
  decoded.declaration.promptHash = digestManualCanonicalV4(decoded.prompt);
  for (const [name, value] of Object.entries(decoded)) artifacts[name] = Buffer.from(JSON.stringify(value));
  return buildManualFactoryPackageV4({ mapping, taxonomy, artifacts,
    manualRunId: prepared.package.manualRun.manualRunId,
    permissionId: prepared.package.sourcePermissions[0].id,
    authoringId: prepared.package.sourceAuthoring[0].id });
}

test('keyed Reading interaction groups import as opted-in private DRAFTs with strict replay and isolation', async () => {
  const before = await sourceManifest(sourceRoot);
  const corpus = await readReadingInteractionCorpus(sourceRoot);
  assert.equal(corpus.selected.reduce((total, group) => total + group.items.length, 0), 78);
  assert.equal(corpus.deferred.reduce((total, group) => total + group.items.length, 0), 22);
  const fixture = await createManualImportFixture();
  const capability = Object.freeze({});
  const packages = [];
  const receipts = [];
  try {
    const deferredByPassage = new Map(corpus.deferred.map((group) => [group.passageId, group.items]));
    for (const [index, group] of corpus.selected.entries()) {
      const prepared = await buildCorpusReadingInteractionPackage({ group, deferred: deferredByPassage.get(group.passageId),
        taxonomy: fixture.taxonomy, authorId: fixture.author.principal.userId,
        directory: join(fixture.root, `interaction-bundle-${index + 1}`) });
      assert.equal(prepared.package.schemaVersion, 'factory-package/4');
      assert.equal(prepared.package.profile, interactionProfile);
      assert.deepEqual(parseManualFactoryPackageV4(prepared.package), prepared.package);
      assert.deepEqual(parseManualImportMappingV4(prepared.mapping), prepared.mapping);
      if (index === 0) {
        for (const inertText of ['Source excerpt! [...] continuation.', 'Source excerpt!\n\n[#] continuation.',
          'Source excerpt!\n\n[4] continuation.']) {
          await assert.doesNotReject(rebuildWithSourceText(prepared, fixture.taxonomy, inertText));
        }
        for (const imageText of ['![alt](https://example.invalid/image.png)', '! [alt](https://example.invalid/image.png)',
          '![...] (https://example.invalid/image.png)', '! [...][reference]', '![...]']) {
          await assert.rejects(rebuildWithSourceText(prepared, fixture.taxonomy, `Safe passage. ${imageText}`), /Unsafe text/);
          const unsafeQuestion = structuredClone(prepared.package.candidates[0].question);
          unsafeQuestion.content = [{ type: 'text', text: imageText }];
          assert.throws(() => assertSafeQuestionContent(unsafeQuestion, prepared.package.references, { clozeMatching: true }));
        }
      }
      assert.equal(prepared.package.candidates.length, group.items.length);
      assert.equal(prepared.package.sourcePermissions[0].copyrightVerification, 'UNVERIFIED');
      assert.equal(prepared.package.sourcePermissions[0].publicationPermission, false);
      assert.equal(prepared.package.sourceAuthoring[0].kind, 'CORPUS_IMPORTED');
      const sourceDeclaration = JSON.parse(await readFile(prepared.artifactPaths.sourceDeclaration, 'utf8'));
      assert.equal(sourceDeclaration.model, 'UNKNOWN_ORIGINAL_AUTHORSHIP');
      assert.equal(prepared.package.manualRun.kind, 'DETERMINISTIC_CORPUS_EXTRACTION');
      const declaration = JSON.parse(await readFile(prepared.artifactPaths.declaration, 'utf8'));
      assert.equal(declaration.model, 'NOT_APPLICABLE_DETERMINISTIC_EXTRACTION');
      const flagged = group.items.find((item) => item.private.adaptationFlags.includes('MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION'));
      if (flagged) {
        assert.equal(flagged.sourcePath, 'TSA_DocHieu_VanHoc/000061.txt');
        const flaggedIndex = group.items.indexOf(flagged);
        const question = prepared.package.candidates[flaggedIndex].question;
        const evidence = prepared.package.references.find((node) => node.kind === 'evidence'
          && node.id === question.private.evidenceRefs[1]).payload;
        assert.deepEqual(evidence.adaptationFlags, flagged.private.adaptationFlags);
        assert.deepEqual(evidence.adaptationDetails, flagged.private.adaptationDetails);
      }
      const packageStats = await stat(prepared.packagePath);
      assert.equal(packageStats.mode & 0o777, 0o600);
      assert.equal((await stat(prepared.directory)).mode & 0o777, 0o700);
      assert.ok(prepared.package.candidates.every(({ question }) => !Object.hasOwn(question, 'answerKey')));

      const config = await manualConfiguration(fixture, prepared);
      await assert.rejects(createManualFactoryImportService({ bankPool: fixture.bankPool, identityService: fixture.identity,
        internalCapability: capability, enabled: true, env: fixture.env,
        configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
        approvedConfigurationScopeHash: config.approvedConfigurationScopeHash }),
      (error) => error.code === 'MANUAL_CLOZE_MATCHING_DISABLED');
      await assert.rejects(createManualFactoryImportService({ bankPool: fixture.bankPool, identityService: fixture.identity,
        internalCapability: capability, enabled: true, enableClozeMatching: 'true', env: fixture.env,
        configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
        approvedConfigurationScopeHash: config.approvedConfigurationScopeHash }), /enableClozeMatching must be a boolean/);

      const reconciliationConfig = await manualConfiguration(fixture, prepared);
      const pendingConfig = await loadManualImportConfiguration({ configurationDirectory: reconciliationConfig.directory,
        approvedActivationHash: reconciliationConfig.approvedActivationHash,
        approvedConfigurationScopeHash: reconciliationConfig.approvedConfigurationScopeHash });
      const admission = await beginManualImportAdmission(pendingConfig, prepared.package);
      await assert.rejects(reconcileManualFactoryImportAdmission({ bankPool: fixture.bankPool, identityService: fixture.identity,
        internalCapability: capability, env: fixture.env, configurationDirectory: reconciliationConfig.directory,
        approvedActivationHash: reconciliationConfig.approvedActivationHash,
        approvedConfigurationScopeHash: reconciliationConfig.approvedConfigurationScopeHash,
        approvedReconciliationHash: 'sha256:' + '0'.repeat(64), request: fixture.author.request,
        input: prepared.package, capability, admissionId: admission.admissionId }),
      (error) => error.code === 'MANUAL_CLOZE_MATCHING_DISABLED');
      // This pending journal exists only in the disposable fixture and is removed at close.

      const service = await createManualFactoryImportService({ bankPool: fixture.bankPool, identityService: fixture.identity,
        internalCapability: capability, enabled: true, enableClozeMatching: true, env: fixture.env,
        configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
        approvedConfigurationScopeHash: config.approvedConfigurationScopeHash });
      fixture.services.push(service);
      if (index === 0) {
        await assert.rejects(service.importManualFactoryPackageV3(fixture.author.request, prepared.package, capability),
          (error) => error.code === 'VALIDATION_ERROR');
        await assert.rejects(service.importManualFactoryPackageV4(fixture.manager.request, prepared.package, capability));
        await assert.rejects(service.importManualFactoryPackageV4(fixture.author.request, changeSingleChoiceKey(prepared.package), capability),
          (error) => error.code === 'VALIDATION_ERROR');
      }
      const imported = await service.importManualFactoryPackageV4(fixture.author.request, prepared.package, capability);
      assert.equal(imported.replayed, false);
      assert.equal(imported.receipts.length, group.items.length);
      const replay = await service.importManualFactoryPackageV4(fixture.author.request, prepared.package, capability);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.receipts, imported.receipts);
      receipts.push(...imported.receipts);
      packages.push(prepared.package);
      assert.equal((await service.stop()).status, 'STOPPED');
    }

    assert.equal(receipts.length, 78);
    const ids = packages.flatMap((pkg) => pkg.candidates.map(({ question }) => question.id));
    const questions = await createQuestionService({ bankPool: fixture.bankPool, identityService: fixture.identity,
      enableClozeMatching: true });
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
    assert.deepEqual(gates, { v3: 78, drafts: 78, reviews: 0, source_rights: 0, eligible: 0,
      selectable: 0, stimuli: 10, import_authored: 78 });
    const typeCounts = (await fixture.database.pool.query(`SELECT interaction->>'type' AS type,count(*)::int AS count
      FROM tsa.question_versions WHERE id=ANY($1::uuid[]) GROUP BY interaction->>'type' ORDER BY type`, [ids])).rows;
    assert.deepEqual(Object.fromEntries(typeCounts.map(({ type, count }) => [type, count])), {
      CLOZE: 19, MATCHING: 13, MULTIPLE_CHOICE: 10, SINGLE_CHOICE: 36,
    });
    assert.notEqual(fixture.author.principal.userId, fixture.manager.principal.userId);
    const after = await sourceManifest(sourceRoot);
    assert.deepEqual(after, before);
  } finally {
    await fixture.close();
  }
});
