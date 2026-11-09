// Local disposable verification only; this command never enables a retained Bank.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, copyFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createManualImportFixture } from '../../tests/integration/bank/manual-import-fixture.mjs';
import { backupLocalDatabase } from '../../src/local/database-backup.mjs';
import { createManualFactoryImportService } from '../../src/modules/bank/manual-import-coordinator.mjs';
import { createManualImportActiveState, manualImportActivationHash, manualImportConfigurationScopeHash,
  MANUAL_IMPORT_CONFIGURATION_LAYOUT as layout } from '../../src/modules/bank/manual-import-configuration.mjs';
import { prepareManualDraftTransport } from '../question-factory/manual-transport.mjs';
import { createQuestionService } from '../../src/modules/bank/questions.mjs';
import { createReviewContextService } from '../../src/modules/bank/review-context.mjs';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { parseManualFactoryPackageV3 } from '../../packages/contracts/dist/internal.js';
import { assertNoRevealedAnswers, readReadingCorpus, sourceManifest } from './reading-captures.mjs';
import { buildCorpusReadingPackage, createPrivateOutputDirectory, writePrivateJson } from './reading-package.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function compareBlindAnswers(corpus, blind) {
  const items = corpus.selected.flatMap((group) => group.items);
  assert.equal(blind.blinded, true); assert.equal(blind.checks.length, items.length);
  const byId = new Map(blind.checks.map((check) => [check.id, check]));
  assert.equal(byId.size, items.length);
  return items.map((item) => {
    const check = byId.get(item.id);
    assert.ok(check && /^[A-D]$/u.test(check.optionId) && typeof check.unambiguous === 'boolean'
      && typeof check.reason === 'string' && check.reason.trim() && typeof check.evidenceQuote === 'string');
    const flags = ['PROVISIONAL_COGNITION', 'NO_SOURCE_EXPLANATION', 'TAXONOMY_REQUIRES_VERIFICATION'];
    if (check.optionId !== item.private.answerKey.optionId) flags.push('BLIND_KEY_MISMATCH');
    if (!check.unambiguous) flags.push('BLIND_AMBIGUITY');
    if (!check.evidenceQuote || !item.passage.includes(check.evidenceQuote)) flags.push('BLIND_EVIDENCE_UNSUPPORTED');
    return { id: item.id, passageId: item.passageId, status: 'needs_owner_attention', flags,
      suppliedKey: item.private.answerKey.optionId, blindAnswer: check.optionId, blindCheck: check };
  });
}

async function configure(root, prepared, taxonomy) {
  const pkg = prepared.package;
  const activation = { schemaVersion: 'manual-import-activation/1', activationId: randomUUID(), profile: pkg.profile,
    ownerDecisionRef: 'docs/decisions/OPEN_DECISIONS.md#cp3a-corpus-transport-compatibility--2026-11-09; disposable verification only',
    producerNamespace: pkg.producerNamespace, registeredAuthorId: prepared.mapping.registeredAuthorId,
    declaredOperatorId: pkg.manualRun.declaredOperatorId, sourceVersionId: pkg.manualRun.sourceVersionIds[0],
    sourceTextHash: pkg.sourcePermissions[0].sourceTextHash, permissionHash: jsonDigest(pkg.sourcePermissions[0]),
    sourceAuthoringHash: jsonDigest(pkg.sourceAuthoring[0]), responseHash: pkg.manualRun.responseHash,
    promptHash: pkg.manualRun.promptHash, mappingHash: jsonDigest(prepared.mapping),
    taxonomyVersionId: taxonomy.taxonomyVersionId, taxonomyDefinitionHash: taxonomy.definitionHash,
    validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 3600_000).toISOString() };
  const directory = join(root, `activation-${activation.activationId}`); await createPrivateOutputDirectory(directory);
  await writePrivateJson(join(directory, layout.activation), activation);
  await writePrivateJson(join(directory, layout.mapping), prepared.mapping);
  await writePrivateJson(join(directory, layout.state), createManualImportActiveState(activation));
  const approvedActivationHash = manualImportActivationHash(activation);
  const approvedConfigurationScopeHash = manualImportConfigurationScopeHash(directory, approvedActivationHash);
  // Pins belong to this trusted disposable verification invocation, never package-controlled data.
  await writePrivateJson(join(directory, 'verification-pins.json'), { approvedActivationHash, approvedConfigurationScopeHash });
  return { configurationDirectory: directory, approvedActivationHash, approvedConfigurationScopeHash };
}

export async function verifyCorpusReading({ sourceRoot, extractionDirectory, outputDirectory }) {
  const corpus = await readReadingCorpus(sourceRoot);
  assert.deepEqual(corpus, await readJson(join(extractionDirectory, 'extraction.json')));
  assert.deepEqual(corpus.manifest, await readJson(join(extractionDirectory, 'source-manifest-before.json')));
  assert.equal(corpus.records.length, 200); assert.equal(corpus.selected.length, 10);
  assert.equal(corpus.selected.flatMap((group) => group.items).length, 100);
  const blind = await readJson(join(extractionDirectory, 'blind-solve.json'));
  const triage = compareBlindAnswers(corpus, blind);
  await createPrivateOutputDirectory(outputDirectory);
  await writePrivateJson(join(outputDirectory, 'needs-owner-attention.json'), triage);
  for (const name of ['deferred', 'needs_owner_keys', 'cp4_types']) await writePrivateJson(join(outputDirectory, `${name}.json`), corpus[name]);
  const fixture = await createManualImportFixture();
  const capability = Object.freeze({});
  const receipts = [], packages = [], pins = [];
  try {
    await copyFile(fixture.backup, join(outputDirectory, 'before-migrations.dump'));
    await chmod(join(outputDirectory, 'before-migrations.dump'), 0o600);
    const backup = await backupLocalDatabase({ connectionConfig: fixture.database.connectionConfig,
      directory: join(outputDirectory, 'before-corpus-import') });
    await writePrivateJson(join(outputDirectory, 'backup.json'), backup);
    for (const [index, group] of corpus.selected.entries()) {
      const raw = await buildCorpusReadingPackage({ group, taxonomy: fixture.taxonomy,
        authorId: fixture.author.principal.userId, directory: join(outputDirectory, `bundle-${index + 1}`),
        triage: triage.filter((item) => item.passageId === group.passageId) });
      const prepared = await prepareManualDraftTransport({ bankPool: fixture.bankPool, identityService: fixture.identity,
        request: fixture.author.request, capability, internalCapability: capability, enabled: true, env: fixture.env,
        mapping: raw.mapping, artifactPaths: raw.artifactPaths, outputDirectory: join(raw.directory, 'prepared'),
        manualRunId: raw.manualRunId, permissionId: raw.permissionId, authoringId: raw.authoringId, transformation: raw.transformation });
      assert.deepEqual(prepared.package, raw.package);
      parseManualFactoryPackageV3(prepared.package);
      for (const [i, candidate] of prepared.package.candidates.entries()) {
        const publicFields = { content: candidate.question.content, interaction: candidate.question.interaction,
          passage: group.passage };
        assertNoRevealedAnswers(publicFields);
        assert.equal(JSON.stringify(publicFields).includes(group.items[i].private.extractedKeyText), false);
        assert.deepEqual(candidate.question.private.answerKey, group.items[i].private.answerKey);
      }
      const config = await configure(outputDirectory, prepared, fixture.taxonomy); pins.push(config);
      const service = await createManualFactoryImportService({ bankPool: fixture.bankPool, identityService: fixture.identity,
        internalCapability: capability, enabled: true, env: fixture.env, ...config });
      fixture.services.push(service);
      try {
        const imported = await service.importManualFactoryPackageV3(fixture.author.request, prepared.package, capability);
        assert.equal(imported.replayed, false); assert.equal(imported.receipts.length, 10);
        const replay = await service.importManualFactoryPackageV3(fixture.author.request, prepared.package, capability);
        assert.equal(replay.replayed, true); assert.deepEqual(replay.receipts, imported.receipts);
        receipts.push(...imported.receipts); packages.push(prepared.package);
      } finally { assert.equal((await service.stop()).status, 'STOPPED'); }
    }
    const ids = packages.flatMap((pkg) => pkg.candidates.map((candidate) => candidate.question.id));
    const questions = await createQuestionService({ bankPool: fixture.bankPool, identityService: fixture.identity });
    const queue = await questions.listQuestionSummaries(fixture.manager.principal,
      new URLSearchParams({ section: 'READING', state: 'DRAFT', limit: '100' }));
    assert.equal(queue.items.length, 100); assert.equal(queue.nextCursor, null);
    assert.deepEqual(queue.items.map((item) => item.versionId).sort(), [...ids].sort());
    const groups = await fixture.database.pool.query(`SELECT stimulus_version_id,count(*)::int AS items
      FROM tsa.question_versions WHERE id=ANY($1::uuid[]) GROUP BY stimulus_version_id`, [ids]);
    assert.equal(groups.rowCount, 10); assert.ok(groups.rows.every((group) => group.items === 10));
    const gates = (await fixture.database.pool.query(`SELECT
      (SELECT count(*)::int FROM tsa.reviews) AS reviews,
      (SELECT count(*)::int FROM tsa.source_rights) AS rights,
      (SELECT count(*)::int FROM tsa.questions WHERE eligible_version_id IS NOT NULL) AS eligible,
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND tsa.bank_question_selection_allowed(id)) AS selectable,
      (SELECT count(*)::int FROM tsa.question_versions WHERE id=ANY($1::uuid[]) AND created_by=$2) AS import_authored`,
    [ids, fixture.author.principal.userId])).rows[0];
    assert.deepEqual(gates, { reviews: 0, rights: 0, eligible: 0, selectable: 0, import_authored: 100 });
    assert.notEqual(fixture.author.principal.userId, fixture.manager.principal.userId);
    const context = await createReviewContextService({ bankPool: fixture.bankPool, identityService: fixture.identity });
    for (const pkg of packages) {
      const result = await context.read(fixture.manager.principal, pkg.candidates[0].question.id);
      assert.equal(result.preview.reason, 'RIGHTS_BLOCKED');
    }
    await writePrivateJson(join(outputDirectory, 'review-queue.json'), queue);
    await writePrivateJson(join(outputDirectory, 'import-receipts.json'), receipts);
    await writePrivateJson(join(outputDirectory, 'passage-groups.json'), groups.rows);
    const samples = corpus.selected.map((group) => group.items[0]);
    await writePrivateJson(join(outputDirectory, 'samples.json'), samples);
    const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'"><title>Private corpus DRAFT samples</title><style>body{font:17px/1.6 system-ui;max-width:900px;margin:2rem auto;padding:1rem}article{border-top:2px solid}p{white-space:pre-wrap}</style><h1>PRIVATE · Ten DRAFT samples · Owner approval pending</h1>'
      + samples.map((item) => `<article><h2>${escape(item.id)}</h2><p>${escape(item.passage)}</p><p>${escape(item.public.prompt)}</p><ol type="A">${item.public.options.map((option) => `<li>${escape(option.content[0].text)}</li>`).join('')}</ol><details><summary>Private key and triage</summary><pre>${escape(JSON.stringify({ private: item.private, triage: triage.find((entry) => entry.id === item.id) }, null, 2))}</pre></details></article>`).join('') + '</html>';
    await import('node:fs/promises').then(({ writeFile }) => writeFile(join(outputDirectory, 'samples.html'), html, { flag: 'wx', mode: 0o600 }));
    const after = await sourceManifest(sourceRoot); assert.deepEqual(after, corpus.manifest);
    await writePrivateJson(join(outputDirectory, 'source-manifest-after.json'), after);
    const topicCounts = {};
    for (const item of corpus.selected.flatMap((group) => group.items)) topicCounts[item.proposedTaxonomy.genre] = (topicCounts[item.proposedTaxonomy.genre] ?? 0) + 1;
    const summary = { status: 'PASS', drafts: 100, passages: 10, domain: 'READING', types: { SINGLE_CHOICE: 100 },
      topicCounts, topicStatus: 'PROPOSED_GENRES_REQUIRES_VERIFICATION', skill: fixture.taxonomy.nodes.find((node) => node.kind === 'SKILL').code,
      deferredPassages: corpus.deferred.length, needsOwnerKeys: corpus.needs_owner_keys.length, cp4Types: corpus.cp4_types.length,
      blindSolves: triage.length, blindMismatches: triage.filter((item) => item.flags.includes('BLIND_KEY_MISMATCH')).length,
      blindAmbiguities: triage.filter((item) => item.flags.includes('BLIND_AMBIGUITY')).length,
      needsOwnerAttention: triage.length, samples: samples.length, unchangedSourceFiles: after.length,
      sourceManifestHash: jsonDigest(after), gates, disposableDatabase: true, retainedDatabase: false,
      activationPins: pins, providerCalled: false };
    await writePrivateJson(join(outputDirectory, 'summary.json'), summary);
    return summary;
  } finally { await fixture.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourceRoot, extractionDirectory, outputDirectory] = process.argv.slice(2).map((value) => resolve(value));
  if (!sourceRoot || !extractionDirectory || !outputDirectory) throw new Error('Usage: verify-reading SOURCE_ROOT EXTRACTION_DIR NEW_PRIVATE_OUTPUT_DIR');
  const summary = await verifyCorpusReading({ sourceRoot, extractionDirectory, outputDirectory });
  console.log(JSON.stringify({ status: summary.status, drafts: summary.drafts, passages: summary.passages,
    blindSolves: summary.blindSolves, blindMismatches: summary.blindMismatches, samples: summary.samples, sourceFilesUnchanged: summary.unchangedSourceFiles }));
}
