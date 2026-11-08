import assert from 'node:assert/strict';
import { chmod, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadManualImportConfiguration, createManualImportActiveState, manualImportActivationHash,
  manualImportConfigurationScopeHash, beginManualImportAdmission, reconcileManualImportAdmission } from '../../src/modules/bank/manual-import-configuration.mjs';
import { buildManualFactoryPackageV3, digestManualCanonical } from '../../packages/contracts/src/factory-package-v3.ts';
import { buildManualFixture } from '../../packages/contracts/test/fixtures/manual-factory-package.ts';

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'tsa-manual-config-scope-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'active'); await mkdir(directory, { mode: 0o700 });
  const fixture = buildManualFixture(), pkg = buildManualFactoryPackageV3(fixture);
  const activation = { schemaVersion: 'manual-import-activation/1', activationId: fixture.manualRunId,
    profile: pkg.profile, ownerDecisionRef: 'SYNTHETIC TEST ONLY', producerNamespace: pkg.producerNamespace,
    registeredAuthorId: fixture.mapping.registeredAuthorId, declaredOperatorId: pkg.manualRun.declaredOperatorId,
    sourceVersionId: pkg.manualRun.sourceVersionIds[0], sourceTextHash: pkg.sourcePermissions[0].sourceTextHash,
    permissionHash: digestManualCanonical(pkg.sourcePermissions[0]), sourceAuthoringHash: digestManualCanonical(pkg.sourceAuthoring[0]),
    responseHash: pkg.manualRun.responseHash, promptHash: pkg.manualRun.promptHash, mappingHash: digestManualCanonical(fixture.mapping),
    taxonomyVersionId: fixture.mapping.taxonomy.registeredVersionId, taxonomyDefinitionHash: fixture.mapping.taxonomy.registeredDefinitionHash,
    validFrom: '2020-01-01T00:00:00Z', validUntil: '2030-01-01T00:00:00Z' };
  for (const [name, value] of Object.entries({ 'activation.json': activation, 'mapping.json': fixture.mapping,
    'active-state.json': createManualImportActiveState(activation) })) {
    await writeFile(join(directory, name), JSON.stringify(value), { flag: 'wx', mode: 0o600 });
  }
  await writeFile(join(directory, 'retired-activations.ndjson'), '', { flag: 'wx', mode: 0o600 });
  const approvedActivationHash = manualImportActivationHash(activation);
  const args = { configurationDirectory: directory, approvedActivationHash,
    approvedConfigurationScopeHash: manualImportConfigurationScopeHash(directory, approvedActivationHash) };
  return { root, directory, args, pkg, activation };
}

test('manual activation configuration refuses absent and symlinked private directories', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'tsa-manual-configuration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(loadManualImportConfiguration({ configurationDirectory: join(root, 'missing'), approvedActivationHash: 'sha256:' + '0'.repeat(64) }), { code: 'MANUAL_IMPORT_CONFIGURATION_INVALID' });
  const privateDirectory = join(root, 'private');
  await mkdir(privateDirectory, { mode: 0o700 });
  const linkedDirectory = join(root, 'linked');
  await symlink(privateDirectory, linkedDirectory);
  await assert.rejects(loadManualImportConfiguration({ configurationDirectory: linkedDirectory, approvedActivationHash: 'sha256:' + '0'.repeat(64) }), { code: 'MANUAL_IMPORT_CONFIGURATION_UNSAFE' });
});

test('the trusted configuration scope binds canonical location and exact snapshot, including copied historical directories', async (t) => {
  const f = await setup(t);
  assert.equal((await loadManualImportConfiguration(f.args)).activationHash, f.args.approvedActivationHash);
  const copy = join(f.root, 'copied'); await cp(f.directory, copy, { recursive: true });
  await assert.rejects(loadManualImportConfiguration({ ...f.args, configurationDirectory: copy }), { code: 'MANUAL_IMPORT_CONFIGURATION_UNAPPROVED' });
  await assert.rejects(loadManualImportConfiguration({ ...f.args, approvedActivationHash: digestManualCanonical('unapproved') }), { code: 'MANUAL_IMPORT_ACTIVATION_UNAPPROVED' });
});

test('configuration JSON rejects duplicate keys, nonprivate files and symlinked ancestors', async (t) => {
  const f = await setup(t);
  const bytes = await readFile(join(f.directory, 'activation.json'), 'utf8');
  await writeFile(join(f.directory, 'activation.json'), bytes.replace('{', '{"schemaVersion":"manual-import-activation/1",'));
  await assert.rejects(loadManualImportConfiguration(f.args));
  await writeFile(join(f.directory, 'activation.json'), bytes);
  await chmod(join(f.directory, 'mapping.json'), 0o640);
  await assert.rejects(loadManualImportConfiguration(f.args), { code: 'MANUAL_IMPORT_CONFIGURATION_UNSAFE' });
  await chmod(join(f.directory, 'mapping.json'), 0o600);
  await symlink(f.root, join(f.root, 'alias'));
  await assert.rejects(loadManualImportConfiguration({ ...f.args, configurationDirectory: join(f.root, 'alias', 'active') }), { code: 'MANUAL_IMPORT_CONFIGURATION_UNSAFE' });
});

test('durable pending and truncated journal records deny startup until an explicitly pinned resolution', async (t) => {
  const f = await setup(t), config = await loadManualImportConfiguration(f.args);
  const admission = await beginManualImportAdmission(config, f.pkg);
  await assert.rejects(loadManualImportConfiguration(f.args), { code: 'MANUAL_IMPORT_RECONCILIATION_REQUIRED' });
  await assert.rejects(reconcileManualImportAdmission({ ...f.args, admissionId: admission.admissionId,
    approvedReconciliationHash: digestManualCanonical('unapproved'), verify: async () => 'ABSENT' }));
  await reconcileManualImportAdmission({ ...f.args, admissionId: admission.admissionId,
    approvedReconciliationHash: digestManualCanonical({ activationHash: f.args.approvedActivationHash,
      admissionId: admission.admissionId, manifestHash: admission.manifestHash }),
    verify: async () => 'ABSENT' }); // Explicit synthetic callback; real DB reconciliation is tested separately.
  assert.equal((await loadManualImportConfiguration(f.args)).pendingAdmissions.size, 0);
  await writeFile(join(f.directory, 'admissions.ndjson'), '{"partial":');
  await assert.rejects(loadManualImportConfiguration(f.args), { code: 'MANUAL_IMPORT_RECONCILIATION_REQUIRED' });
});

test('admission reserves room for its resolution and refuses a full journal before appending', async (t) => {
  const f = await setup(t), config = await loadManualImportConfiguration(f.args);
  let text = '';
  for (let index = 0; index < 100; index++) {
    const event = { schemaVersion: 'manual-import-admission/1', admissionId: `synthetic-${index}`,
      activationHash: f.args.approvedActivationHash, manifestHash: digestManualCanonical(f.pkg),
      producerNamespace: f.pkg.producerNamespace, batchKey: f.pkg.batchKey,
      candidateVersionIds: f.pkg.candidates.map((c) => c.question.id), admittedAt: '2026-01-01T00:00:00Z', status: 'PENDING' };
    text += JSON.stringify(event) + '\n' + JSON.stringify({ ...event, status: 'RECONCILED', outcome: 'COMMITTED', reconciledAt: '2026-01-01T00:00:00Z' }) + '\n';
  }
  text += '\n'.repeat(1024 * 1024 - 64 - Buffer.byteLength(text));
  await writeFile(join(f.directory, 'admissions.ndjson'), text, { mode: 0o600 });
  await assert.rejects(beginManualImportAdmission(config, f.pkg), { code: 'MANUAL_IMPORT_JOURNAL_FULL' });
  assert.equal(await readFile(join(f.directory, 'admissions.ndjson'), 'utf8'), text);
});
