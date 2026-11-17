import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManualFactoryPackageV3 } from '../../../packages/contracts/dist/internal.js';
import { createDatabasePool, withTransaction } from '../../../src/modules/database/pool.mjs';
import { migrate } from '../../../src/modules/database/migrate.mjs';
import { bootstrapLocalSyntheticIdentity, createLocalSyntheticIdentityService } from '../../../src/modules/identity/local-synthetic.mjs';
import { jsonDigest } from '../../../src/modules/bank/common.mjs';
import { makeFixtureInput, fixtureOutput } from '../../../tools/question-factory/reading.mjs';
import { exportManualRequest } from '../../../tools/question-factory/manual.mjs';
import { startDisposablePostgres } from '../database/foundation/postgres.mjs';
import { createManualImportActiveState, manualImportActivationHash } from '../../../src/modules/bank/manual-import-configuration.mjs';

function run(file, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], env, shell: false });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.resume();
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error('Private disposable database backup failed')));
  });
}

export async function createManualImportFixture() {
  const root = await mkdtemp(join(tmpdir(), 'tsa-manual-v3-'));
  const database = await startDisposablePostgres();
  const pools = [];
  const services = [];
  const env = { NODE_ENV: 'test', LOCAL_SYNTHETIC_ONLY: 'true', LOCAL_AUTH_TRUSTED_ORIGIN: 'http://127.0.0.1:1' };
  async function close() {
    for (const service of services) await service.stop().catch(() => {});
    await Promise.all(pools.map((pool) => pool.end()));
    await database.stop();
    await rm(root, { recursive: true, force: true });
  }
  try {
    // Preserve the empty disposable baseline before its first migration/data write.
    const bin = process.env.PG_BIN ?? await run('pg_config', ['--bindir']);
    const backup = join(root, 'before-migrations.dump');
    await run(join(bin, 'pg_dump'), ['-Fc', '-f', backup], { ...process.env,
      PGHOST: database.connectionConfig.host, PGPORT: String(database.connectionConfig.port),
      PGUSER: database.connectionConfig.user, PGDATABASE: database.connectionConfig.database });
    await chmod(backup, 0o600);
    await migrate(database.pool);
    await bootstrapLocalSyntheticIdentity(database.pool, { env });
    await database.pool.query('CREATE ROLE manual_bank_runtime LOGIN');
    await database.pool.query('GRANT tsa_bank TO manual_bank_runtime');
    await database.pool.query('CREATE ROLE manual_identity_runtime LOGIN');
    await database.pool.query('GRANT tsa_identity TO manual_identity_runtime');
    const bankPool = createDatabasePool({ ...database.connectionConfig, user: 'manual_bank_runtime' }, { max: 6, applicationName: 'tsa-manual-bank-test' });
    const authPool = createDatabasePool({ ...database.connectionConfig, user: 'manual_identity_runtime' });
    pools.push(bankPool, authPool);
    const identity = await createLocalSyntheticIdentityService(authPool, { env });
    async function actor(key) {
      const guest = await identity.createGuestSession();
      const guestPrincipal = await identity.authenticate(new Request(env.LOCAL_AUTH_TRUSTED_ORIGIN,
        { headers: { cookie: `tsa_local_session=${guest.token}` } }));
      const login = await identity.login(guestPrincipal, key);
      const request = new Request(env.LOCAL_AUTH_TRUSTED_ORIGIN, { headers: { cookie: `tsa_local_session=${login.token}` } });
      return { request, principal: await identity.authenticate(request) };
    }
    const author = await actor('author');
    const manager = await actor('bankManager');
    const student = await actor('studentA');
    const seed = makeFixtureInput(); seed.sources = seed.sources.slice(0, 1);
    const domainId = randomUUID();
    const taxonomy = { schemaVersion: 'taxonomy/1', taxonomyVersionId: randomUUID(),
      name: 'Private manual transport synthetic taxonomy', versionNo: 1, definitionHash: '', nodes: [
        { id: domainId, code: 'READING', kind: 'DOMAIN', parentId: null, metadata: {} },
        { id: randomUUID(), code: seed.sources[0].skillId, kind: 'SKILL', parentId: domainId, metadata: {} },
      ].sort((a, b) => a.code.localeCompare(b.code)) };
    taxonomy.definitionHash = jsonDigest(taxonomy);
    await withTransaction(database.pool, async (client) => {
      await client.query('INSERT INTO tsa.taxonomy_versions(id,name,version_no,definition_hash) VALUES($1,$2,1,$3)', [taxonomy.taxonomyVersionId, taxonomy.name, taxonomy.definitionHash]);
      for (const node of [...taxonomy.nodes].sort((a, b) => a.kind === 'DOMAIN' ? -1 : b.kind === 'DOMAIN' ? 1 : 0)) {
        await client.query('INSERT INTO tsa.taxonomy_nodes(id,taxonomy_version_id,code,kind,parent_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)', [node.id, taxonomy.taxonomyVersionId, node.code, node.kind, node.parentId, JSON.stringify(node.metadata)]);
      }
    });
    return { root, backup, database, bankPool, authPool, identity, env, author, manager, student,
      seed, taxonomy, actor, services, close };
  } catch (error) { await close(); throw error; }
}

export async function manualPackage(f, { producerNamespace = `manual.synthetic.${randomUUID()}`, batchKey = `batch-${randomUUID()}` } = {}) {
  const directory = join(f.root, randomUUID()); await mkdir(directory, { mode: 0o700 });
  const input = structuredClone(f.seed);
  input.producerNamespace = producerNamespace; input.batchKey = batchKey;
  input.sources[0].rights = { state: 'INTERNAL_EXPERIMENT_AUTHORIZED', allowedUses: ['DISPLAY', 'GENERATE'],
    territories: ['VN'], validFrom: '2020-01-01T00:00:00Z', validUntil: null,
    evidence: 'SYNTHETIC TEST ONLY; private transport, no lawful publication approval.', copyrightVerification: 'UNVERIFIED', publicationPermission: false };
  const sourceDeclaration = { kind: 'AI_AUTHORED_EXPERIMENTAL', model: 'SYNTHETIC_TEST_ONLY', exactModelRevision: null,
    authoringInterface: 'Synthetic engineering fixture, never a provider call', recordedAt: new Date().toISOString(),
    authorizationEvidence: 'SYNTHETIC_TEST_ONLY', operatorIdentityScope: 'Synthetic staging identity, not registered author' };
  const { request } = await exportManualRequest({ input, sourceProvenance: sourceDeclaration, outputDirectory: join(directory, 'request') });
  const declaration = { schemaVersion: 'manual-llm-declaration/1', operatorId: input.operatorId, model: 'SYNTHETIC_TEST_ONLY',
    exactModelRevision: null, generatedAt: new Date().toISOString(), interface: 'Synthetic fixture', promptHash: request.promptHash,
    usage: null, usageVerification: 'UNVERIFIED', evidenceNote: 'Not real AI output or qualified human evidence' };
  const values = { input, prompt: request.prompt, response: fixtureOutput(input.sources[0]), declaration, sourceDeclaration };
  const artifacts = {}; const artifactPaths = {};
  for (const [name, value] of Object.entries(values)) {
    const bytes = Buffer.from(JSON.stringify(value)); artifacts[name] = bytes;
    artifactPaths[name] = join(directory, `${name}.json`); await writeFile(artifactPaths[name], bytes, { flag: 'wx', mode: 0o600 });
  }
  const stimulusVersionId = randomUUID();
  const mapping = { schemaVersion: 'manual-import-mapping/1', profile: 'manual-reading-draft/1', producerNamespace, batchKey,
    declaredOperatorId: input.operatorId, registeredAuthorId: f.author.principal.userId, sourceVersionId: input.sources[0].sourceVersionId,
    taxonomy: { stagingVersionId: input.taxonomy.taxonomyVersionId, registeredVersionId: f.taxonomy.taxonomyVersionId,
      registeredDefinitionHash: f.taxonomy.definitionHash, nodes: f.taxonomy.nodes.map((node) => ({ stagingCode: node.code,
        stagingKind: node.kind, registeredNodeId: node.id, registeredCode: node.code, registeredKind: node.kind,
        parentCode: node.kind === 'DOMAIN' ? null : 'READING', section: 'READING' })) },
    candidates: values.response.questions.map((q, candidateOrdinal) => ({ rawQuestionId: q.id, candidateOrdinal,
      questionId: randomUUID(), questionVersionId: randomUUID(), stimulusVersionId })) };
  const args = { mapping, taxonomy: f.taxonomy, artifacts, manualRunId: randomUUID(), permissionId: randomUUID(),
    authoringId: randomUUID(), transformation: 'SYNTHETIC TEST ONLY; exact manual raw projection' };
  return { ...args, package: buildManualFactoryPackageV3(args), directory, artifactPaths, values };
}

export async function manualConfiguration(f, prepared, { validFrom = '2020-01-01T00:00:00Z', validUntil = new Date(Date.now() + 3600_000).toISOString() } = {}) {
  const pkg = prepared.package;
  const activation = { schemaVersion: 'manual-import-activation/1', activationId: randomUUID(), profile: pkg.profile,
    ownerDecisionRef: 'SYNTHETIC TEST AUTHORIZATION ONLY; not a human signature', producerNamespace: pkg.producerNamespace,
    registeredAuthorId: prepared.mapping.registeredAuthorId, declaredOperatorId: pkg.manualRun.declaredOperatorId,
    sourceVersionId: pkg.manualRun.sourceVersionIds[0], sourceTextHash: pkg.sourcePermissions[0].sourceTextHash,
    permissionHash: jsonDigest(pkg.sourcePermissions[0]), sourceAuthoringHash: jsonDigest(pkg.sourceAuthoring[0]),
    responseHash: pkg.manualRun.responseHash, promptHash: pkg.manualRun.promptHash, mappingHash: jsonDigest(prepared.mapping),
    taxonomyVersionId: f.taxonomy.taxonomyVersionId, taxonomyDefinitionHash: f.taxonomy.definitionHash, validFrom, validUntil };
  const directory = join(f.root, `configuration-${randomUUID()}`); await mkdir(directory, { mode: 0o700 });
  for (const [name, value] of Object.entries({ 'activation.json': activation, 'mapping.json': prepared.mapping,
    'active-state.json': createManualImportActiveState(activation) })) {
    await writeFile(join(directory, name), JSON.stringify(value), { flag: 'wx', mode: 0o600 });
  }
  await writeFile(join(directory, 'retired-activations.ndjson'), '', { flag: 'wx', mode: 0o600 });
  const approvedActivationHash = manualImportActivationHash(activation);
  return { directory, activation, approvedActivationHash,
    approvedConfigurationScopeHash: jsonDigest({ activationHash: approvedActivationHash, configurationDirectory: directory }) };
}

export async function applicationSnapshot(pool) {
  const tables = await pool.query(`SELECT table_schema,table_name FROM information_schema.tables
    WHERE table_schema IN ('tsa','tsa_private') AND table_type='BASE TABLE' ORDER BY table_schema,table_name`);
  const result = {};
  for (const row of tables.rows) {
    if (!/^[a-z_]+$/.test(row.table_name)) throw new Error('Unexpected fixture table');
    result[`${row.table_schema}.${row.table_name}`] = (await pool.query(`SELECT COALESCE(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) AS rows
      FROM (SELECT to_jsonb(t) AS value FROM "${row.table_schema}"."${row.table_name}" t) s`)).rows[0].rows;
  }
  return result;
}
