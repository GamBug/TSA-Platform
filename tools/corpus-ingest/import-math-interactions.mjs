// Explicit retained DRAFT intake. Never approves questions or grants publication rights.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import katex from 'katex';
import { startPersistentPostgres, runtimePoolConfig } from '../../src/local/postgres.mjs';
import { backupLocalDatabase } from '../../src/local/database-backup.mjs';
import { createDatabasePool } from '../../src/modules/database/pool.mjs';
import { createLocalSyntheticIdentityService } from '../../src/modules/identity/local-synthetic.mjs';
import { createManualFactoryImportService } from '../../src/modules/bank/manual-import-coordinator.mjs';
import { jsonDigest } from '../../src/modules/bank/common.mjs';
import { createPrivateOutputDirectory, writePrivateJson } from './reading-package.mjs';
import { sourceManifest, assertNoRevealedAnswers } from './reading-captures.mjs';
import { configureCorpusImport } from './verify-reading.mjs';
import { buildCorpusMathInteractionPackage, MATH_INTERACTION_NAMESPACE } from './math-interactions-package.mjs';

export async function readMathInteractionTranscription({ sourceRoot, transcriptionPath, sourceManifestPath }) {
  const bytes = await readFile(transcriptionPath);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  assert.equal((await readFile(`${transcriptionPath}.sha256`, 'utf8')).trim(), digest, 'TRANSCRIPTION_HASH_MISMATCH');
  const corpus = JSON.parse(bytes);
  assert.equal(corpus.schemaVersion, 'corpus-math-interactions-transcription/1');
  const manifest = await sourceManifest(sourceRoot);
  assert.deepEqual(manifest, JSON.parse(await readFile(sourceManifestPath, 'utf8')), 'ORIGINAL_CORPUS_CHANGED');
  const hashes = new Map(manifest.map((entry) => [entry.path, entry.hash])), seen = new Set();
  for (const item of [...corpus.items, ...corpus.deferred]) {
    assert.ok(!seen.has(item.sourcePath) && item.sourcePath.startsWith('TSA_ToanHoc_'), 'DUPLICATE_OR_NON_MATH_CAPTURE');
    seen.add(item.sourcePath);
    assert.equal(item.sourceHash, hashes.get(item.sourcePath), 'CAPTURE_HASH_MISMATCH');
  }
  let formulas = 0;
  for (const item of corpus.items) {
    assertNoRevealedAnswers(item.public);
    for (const match of item.public.prompt.matchAll(/\$([^$]+)\$/gu)) {
      katex.renderToString(match[1], { throwOnError: true, trust: false, strict: 'error' }); formulas += 1;
    }
  }
  return { ...corpus, manifest, transcriptionHash: digest, formulas };
}

async function counts(pool) {
  return (await pool.query(`SELECT (SELECT count(*)::int FROM tsa.question_versions) AS versions,
    (SELECT count(*)::int FROM tsa.question_versions WHERE section='MATH') AS math,
    (SELECT count(*)::int FROM tsa.question_versions WHERE section='READING') AS reading,
    (SELECT count(*)::int FROM tsa.reviews) AS reviews, (SELECT count(*)::int FROM tsa.source_rights) AS rights,
    (SELECT count(*)::int FROM tsa.questions WHERE eligible_version_id IS NOT NULL) AS eligible,
    (SELECT count(*)::int FROM tsa_private.factory_import_receipts WHERE producer_namespace=$1) AS receipts`,
  [MATH_INTERACTION_NAMESPACE])).rows[0];
}

async function loadMathTaxonomy(pool) {
  const versions = (await pool.query(`SELECT id,name,version_no,definition_hash FROM tsa.taxonomy_versions
    WHERE name='Private corpus Math provisional taxonomy'`)).rows;
  assert.equal(versions.length, 1, 'EXPECTED_ONE_RETAINED_MATH_TAXONOMY');
  const version = versions[0];
  const nodes = (await pool.query(`SELECT id,code,kind::text AS kind,parent_id AS "parentId",metadata
    FROM tsa.taxonomy_nodes WHERE taxonomy_version_id=$1 ORDER BY CASE kind::text WHEN 'DOMAIN' THEN 0 ELSE 1 END`, [version.id])).rows;
  const taxonomy = { schemaVersion: 'taxonomy/1', taxonomyVersionId: version.id, name: version.name,
    versionNo: version.version_no, definitionHash: '', nodes };
  assert.equal(jsonDigest(taxonomy), version.definition_hash, 'REGISTERED_TAXONOMY_HASH_MISMATCH');
  taxonomy.definitionHash = version.definition_hash;
  return taxonomy;
}

export async function assertNewMathCaptures(pool, items) {
  const imported = (await pool.query(`SELECT DISTINCT ref->'payload'->>'rawQuestionId' AS path
    FROM tsa_private.factory_import_manifests m CROSS JOIN LATERAL jsonb_array_elements(m.manifest->'references') ref
    WHERE m.producer_namespace=$1 AND ref->>'kind'='evidence'
      AND ref->'payload'->>'schemaVersion'='manual-candidate-map/1'`, [MATH_INTERACTION_NAMESPACE])).rows;
  const paths = new Set(imported.map((row) => row.path));
  for (const item of items) assert.ok(!paths.has(item.sourcePath), `CAPTURE_ALREADY_IMPORTED ${item.sourcePath}`);
}

export async function importMathInteractions({ sourceRoot, transcriptionPath, sourceManifestPath, outputDirectory, dataDirectory, apply = false, expectedExistingReceipts = 0, batchStart = 1 }) {
  const corpus = await readMathInteractionTranscription({ sourceRoot, transcriptionPath, sourceManifestPath });
  assert.ok((await lstat(join(dataDirectory, '.tsa-track-b-cluster'))).isFile(), 'EXISTING_RETAINED_BANK_REQUIRED');
  const database = await startPersistentPostgres(dataDirectory), pools = [];
  let service;
  try {
    const before = await counts(database.ownerPool), taxonomy = await loadMathTaxonomy(database.ownerPool);
    if (!apply) return { mode: 'INSPECT', captures: corpus.items.length + corpus.deferred.length,
      eligible: corpus.items.length, deferred: corpus.deferred.length, formulas: corpus.formulas, before };
    assert.ok(Number.isSafeInteger(expectedExistingReceipts) && expectedExistingReceipts >= 0
      && Number.isSafeInteger(batchStart) && batchStart >= 1, 'INVALID_APPEND_BASELINE');
    assert.equal(before.receipts, expectedExistingReceipts, 'NAMESPACE_BASELINE_CHANGED; inspect existing receipts rather than importing duplicates');
    await assertNewMathCaptures(database.ownerPool, corpus.items);
    await createPrivateOutputDirectory(outputDirectory);
    const backup = await backupLocalDatabase({ connectionConfig: database.connectionConfig, directory: join(outputDirectory, 'backup') });
    await writePrivateJson(join(outputDirectory, 'backup.json'), backup);
    const oldVersions = (await database.ownerPool.query('SELECT id,content_hash FROM tsa.question_versions ORDER BY id')).rows;
    const bankPool = createDatabasePool(runtimePoolConfig(database.connectionConfig, 'tsa_track_b_bank', 'tsa-math-interactions-bank'));
    const identityPool = createDatabasePool(runtimePoolConfig(database.connectionConfig, 'tsa_track_b_identity', 'tsa-math-interactions-identity'));
    pools.push(bankPool, identityPool);
    const env = { NODE_ENV: 'development', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:1' };
    const identity = await createLocalSyntheticIdentityService(identityPool, { env });
    const guest = await identity.createGuestSession();
    const requestFor = (token) => new Request(env.LOCAL_AUTH_TRUSTED_ORIGIN, { headers: { cookie: `tsa_local_session=${token}` } });
    const login = await identity.login(await identity.authenticate(requestFor(guest.token)), 'author');
    const request = requestFor(login.token), author = await identity.authenticate(request), capability = Object.freeze({});
    const receipts = [], ids = [];
    for (let offset = 0; offset < corpus.items.length; offset += 20) {
      const batchKey = `math-interactions-${String(offset / 20 + batchStart).padStart(3, '0')}`;
      const raw = await buildCorpusMathInteractionPackage({ items: corpus.items.slice(offset, offset + 20), taxonomy,
        authorId: author.userId, directory: join(outputDirectory, batchKey), batchKey });
      await writePrivateJson(join(raw.directory, 'package.json'), raw.package);
      await writePrivateJson(join(raw.directory, 'mapping.json'), raw.mapping);
      const config = await configureCorpusImport(outputDirectory, raw, taxonomy,
        'docs/decisions/OPEN_DECISIONS.md#math-cloze-and-matching-intake--2026-11-11');
      service = await createManualFactoryImportService({ bankPool, identityService: identity, internalCapability: capability,
        enabled: true, enableClozeMatching: true, env, ...config });
      const imported = await service.importManualFactoryPackageV4(request, raw.package, capability);
      const replay = await service.importManualFactoryPackageV4(request, raw.package, capability);
      assert.equal(imported.replayed, false); assert.equal(replay.replayed, true);
      assert.deepEqual(replay.receipts, imported.receipts);
      receipts.push(...imported.receipts);
      ids.push(...raw.package.candidates.map((c) => c.question.id));
      await writePrivateJson(join(raw.directory, 'receipts.json'), imported);
      await service.stop(); service = null;
      const stored = (await database.ownerPool.query(`SELECT v.id,s.answer_key,w.state::text AS state,
        tsa.bank_question_selection_allowed(v.id) AS selectable FROM tsa.question_versions v
        JOIN tsa_private.question_secrets s ON s.question_version_id=v.id JOIN tsa.question_workflow w ON w.question_version_id=v.id
        WHERE v.id=ANY($1::uuid[])`, [raw.package.candidates.map((c) => c.question.id)])).rows;
      assert.equal(stored.length, raw.package.candidates.length);
      for (const row of stored) {
        assert.equal(row.state, 'DRAFT'); assert.equal(row.selectable, false);
        assert.deepEqual(row.answer_key, raw.package.candidates.find((c) => c.question.id === row.id).question.private.answerKey);
      }
    }
    const after = await counts(database.ownerPool);
    assert.deepEqual(after, { ...before, versions: before.versions + corpus.items.length,
      math: before.math + corpus.items.length, receipts: before.receipts + corpus.items.length });
    assert.deepEqual((await database.ownerPool.query('SELECT id,content_hash FROM tsa.question_versions WHERE NOT(id=ANY($1::uuid[])) ORDER BY id', [ids])).rows, oldVersions);
    assert.deepEqual(await sourceManifest(sourceRoot), corpus.manifest);
    const summary = { status: 'PASS', drafts: ids.length, deferred: corpus.deferred, before, after,
      transcriptionHash: corpus.transcriptionHash, formulas: corpus.formulas, sourceFilesUnchanged: corpus.manifest.length,
      independentReview: false, published: 0, backup: backup.archive };
    await writePrivateJson(join(outputDirectory, 'summary.json'), summary);
    return summary;
  } finally {
    try { await service?.stop(); }
    finally {
      try { await Promise.all(pools.map((pool) => pool.end())); }
      finally { await database.stop(); }
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--import') options.apply = true;
    else {
      const key = { '--source-root': 'sourceRoot', '--transcription': 'transcriptionPath', '--manifest': 'sourceManifestPath',
        '--output': 'outputDirectory', '--data-directory': 'dataDirectory',
        '--expected-existing-receipts': 'expectedExistingReceipts', '--batch-start': 'batchStart' }[args[i]];
      if (!key || !args[i + 1]) throw new TypeError('Expected --source-root, --transcription, --manifest, --output, --data-directory and optional --import');
      options[key] = ['expectedExistingReceipts', 'batchStart'].includes(key) ? Number(args[++i]) : resolve(args[++i]);
    }
  }
  const result = await importMathInteractions(options);
  console.log(JSON.stringify(result, null, 2));
}
