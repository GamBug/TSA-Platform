import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { createManualImportFixture, manualConfiguration } from '../integration/bank/manual-import-fixture.mjs';
import { buildCorpusReadingPackage } from '../../tools/corpus-ingest/reading-package.mjs';
import { parseReadingCapture, groupReadingCaptures } from '../../tools/corpus-ingest/reading-captures.mjs';
import { createManualFactoryImportService } from '../../src/modules/bank/manual-import-coordinator.mjs';
import { createQuestionService } from '../../src/modules/bank/questions.mjs';

test('corpus profile imports exact explicit-key bundles as private DRAFTs with replay and profile isolation', async () => {
  const f = await createManualImportFixture();
  const capability = Object.freeze({});
  try {
    const items = Array.from({ length: 10 }, (_, i) => parseReadingCapture(Buffer.from(
      `Ngữ liệu chung\nA source passage.\n${i}\nXem lại\nẨn đáp án\nLời giải\nS\nPrompt ${i}\nA\nFirst\nB, đáp án đúng:\nSecond\nC\nThird\nD\nFourth\nCâu trước\nFooter`), `test/${i}.txt`));
    const p = await buildCorpusReadingPackage({ group: groupReadingCaptures(items).selected[0],
      taxonomy: f.taxonomy, authorId: f.author.principal.userId, directory: join(f.root, 'corpus') });
    const config = await manualConfiguration(f, p);
    const service = await createManualFactoryImportService({ bankPool: f.bankPool, identityService: f.identity,
      internalCapability: capability, enabled: true, env: f.env,
      configurationDirectory: config.directory, approvedActivationHash: config.approvedActivationHash,
      approvedConfigurationScopeHash: config.approvedConfigurationScopeHash });
    f.services.push(service);
    const changed = structuredClone(p.package); changed.profile = 'manual-reading-draft/1';
    await assert.rejects(service.importManualFactoryPackageV3(f.author.request, changed, capability), /VALIDATION_ERROR/);
    await assert.rejects(service.importManualFactoryPackageV3(f.manager.request, p.package, capability));
    const imported = await service.importManualFactoryPackageV3(f.author.request, p.package, capability);
    assert.equal(imported.receipts.length, 10); assert.equal(imported.replayed, false);
    assert.deepEqual(await service.importManualFactoryPackageV3(f.author.request, p.package, capability), { receipts: imported.receipts, replayed: true });
    const questions = await createQuestionService({ bankPool: f.bankPool, identityService: f.identity });
    const queue = await questions.listQuestionSummaries(f.manager.principal, new URLSearchParams({ state: 'DRAFT', section: 'READING' }));
    assert.equal(queue.items.length, 10); assert.ok(queue.items.every((item) => item.state === 'DRAFT'));
    const stored = (await f.database.pool.query(`SELECT count(*)::int AS items,
      count(DISTINCT stimulus_version_id)::int AS passages FROM tsa.question_versions`)).rows[0];
    assert.deepEqual(stored, { items: 10, passages: 1 });
    assert.equal((await service.stop()).status, 'STOPPED');
    await assert.rejects(service.importManualFactoryPackageV3(f.author.request, p.package, capability));
  } finally { await f.close(); }
});
