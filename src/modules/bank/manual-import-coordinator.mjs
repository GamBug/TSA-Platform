import { parseManualFactoryPackageV3, parseManualFactoryPackageV4 } from '../../../packages/contracts/dist/internal.js';
import { assertBankConnection, jsonDigest, reject, requireActor } from './common.mjs';
import { persistValidatedFactoryPackage, verifyStoredFactoryPackage, verifyStoredFactoryReceipts } from './factory-import.mjs';
import { verifyManualRegisteredMapping } from './manual-import-mapping.mjs';
import { factoryImportNamespace } from './factory-namespace.mjs';
import { beginManualImportAdmission, configurationFingerprint, loadManualImportConfiguration, retireManualImportConfiguration, reconcileManualImportAdmission } from './manual-import-configuration.mjs';

// This session lock intentionally differs from the shared xact Bank guard.
const coordinatorKey = [1414742321, 3];
const bankTransactionKey = [1414742321, 1];
const interactionProfile = 'corpus-reading-interactions-draft/1';

function disabledByEnvironment(enabled, env) {
  return (process.env.NODE_ENV !== undefined && !['development', 'test'].includes(process.env.NODE_ENV)) || enabled !== true
    || !['development', 'test'].includes(env?.NODE_ENV) || env?.LOCAL_SYNTHETIC_ONLY !== 'true';
}

function bindActivation(pkg, configuration) {
  const activation = configuration.activation;
  const permission = pkg.sourcePermissions?.[0];
  const authoring = pkg.sourceAuthoring?.[0];
  const packageVersionMatches = activation.profile === interactionProfile
    ? pkg.schemaVersion === 'factory-package/4' && pkg.profile === interactionProfile
    : pkg.schemaVersion === 'factory-package/3' && ['manual-reading-draft/1', 'corpus-reading-draft/1', 'corpus-math-draft/1'].includes(pkg.profile);
  if (!packageVersionMatches || pkg.profile !== activation.profile
      || pkg.producerNamespace !== activation.producerNamespace
      || pkg.manualRun?.declaredOperatorId !== activation.declaredOperatorId
      || pkg.manualRun?.sourceVersionIds?.length !== 1 || pkg.manualRun.sourceVersionIds[0] !== activation.sourceVersionId
      || pkg.manualRun?.responseHash !== activation.responseHash || pkg.manualRun?.promptHash !== activation.promptHash
      || !permission || !authoring || permission.sourceVersionId !== activation.sourceVersionId
      || authoring.sourceVersionId !== activation.sourceVersionId || permission.sourceTextHash !== activation.sourceTextHash
      || authoring.sourceTextHash !== activation.sourceTextHash || jsonDigest(permission) !== activation.permissionHash
      || jsonDigest(authoring) !== activation.sourceAuthoringHash) reject(403, 'MANUAL_IMPORT_ACTIVATION_MISMATCH');
}

async function currentAdmissionWindow(client, configuration, permission) {
  const result = await client.query('SELECT clock_timestamp() AS now');
  const clock = result.rows[0]?.now;
  const now = clock instanceof Date ? clock.getTime() : Date.parse(clock);
  const activation = configuration.activation;
  if (!Number.isFinite(now) || now < Date.parse(activation.validFrom) || now >= Date.parse(activation.validUntil)
      || !permission || now < Date.parse(permission.validFrom)
      || (permission.validUntil !== null && now >= Date.parse(permission.validUntil))) {
    reject(403, 'MANUAL_IMPORT_NOT_ACTIVE');
  }
}

export async function createManualFactoryImportService({ bankPool, identityService, internalCapability, enabled = false, enableClozeMatching = false, env = process.env, configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash }) {
  if (typeof enableClozeMatching !== 'boolean') throw new TypeError('enableClozeMatching must be a boolean');
  if (!internalCapability || (typeof internalCapability !== 'object' && typeof internalCapability !== 'function')) throw new TypeError('An internal import capability is required');
  if (!identityService || typeof identityService.authenticate !== 'function' || typeof identityService.mayPerform !== 'function') throw new TypeError('A local synthetic identity service is required');
  if (disabledByEnvironment(enabled, env)) {
    return Object.freeze({
      importManualFactoryPackageV3: async () => reject(403, 'MANUAL_IMPORT_DISABLED'),
      importManualFactoryPackageV4: async () => reject(403, 'MANUAL_IMPORT_DISABLED'),
      stop: async () => ({ status: 'DISABLED' }),
      status: () => Object.freeze({ status: 'DISABLED' }),
    });
  }
  const configuration = await loadManualImportConfiguration({ configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash });
  if (configuration.activation.profile === interactionProfile && !enableClozeMatching) reject(403, 'MANUAL_CLOZE_MATCHING_DISABLED');
  await assertBankConnection(bankPool);
  const client = await bankPool.connect();
  let state = 'STARTING'; let connectionLost = false; let uncertainCommit = false; let active = null; let released = false; let stopPromise = null;
  const queued = [];
  const failQueued = (code) => { for (const job of queued.splice(0)) job.reject(Object.assign(new Error(code), { code })); };
  const release = (destroy = false) => {
    if (!released) { released = true; client.off('error', markLost); client.release(destroy); }
  };
  const becomeUnsafe = (code) => { if (state !== 'STOPPED') state = 'UNSAFE'; failQueued(code); };
  const markLost = () => { connectionLost = true; becomeUnsafe('MANUAL_IMPORT_CONNECTION_LOST'); };
  client.on('error', markLost);
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock($1,$2) AS acquired', coordinatorKey);
    if (!lock.rows[0]?.acquired) reject(409, 'MANUAL_IMPORT_COORDINATOR_ACTIVE');
    const current = await loadManualImportConfiguration({ configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash });
    if (current.fingerprint !== configuration.fingerprint) reject(409, 'MANUAL_IMPORT_CONFIGURATION_CHANGED');
    state = 'ACTIVE';
  } catch (error) { release(true); throw error; }

  async function execute(job) {
    active = job;
    let began = false;
    let admission;
    let committed = false;
    try {
      if (state !== 'ACTIVE' || connectionLost) reject(503, 'MANUAL_IMPORT_UNAVAILABLE');
      try {
        if (await configurationFingerprint(configuration.directory) !== configuration.fingerprint) {
          reject(503, 'MANUAL_IMPORT_CONFIGURATION_CHANGED');
        }
      } catch (error) { becomeUnsafe('MANUAL_IMPORT_CONFIGURATION_CHANGED'); throw error; }
      await client.query('BEGIN'); began = true;
      await client.query('SET LOCAL ROLE tsa_bank');
      await client.query('SELECT pg_advisory_xact_lock($1,$2)', bankTransactionKey);
      await client.query('SELECT id FROM tsa.bank_state WHERE id=1 FOR UPDATE');
      if (!(job.request instanceof Request)) reject(401, 'UNAUTHENTICATED');
      const principal = await identityService.authenticate(job.request);
      requireActor(identityService, principal, 'bank.question.author');
      if (job.capability !== internalCapability) reject(403, 'FORBIDDEN');
      bindActivation(job.pkg, configuration);
      await currentAdmissionWindow(client, configuration, job.pkg.sourcePermissions?.[0]);
      const registered = await verifyManualRegisteredMapping(client, principal, job.pkg, configuration.mapping);
      if (registered.mapping.registeredAuthorId !== configuration.activation.registeredAuthorId) reject(403, 'MANUAL_IMPORT_MAPPING_MISMATCH');
      try { admission = await beginManualImportAdmission(configuration, job.pkg); }
      catch (error) { becomeUnsafe('MANUAL_IMPORT_JOURNAL_UNSAFE'); throw error; }
      const result = await persistValidatedFactoryPackage(client, principal, job.pkg);
      try { await client.query('COMMIT'); began = false; committed = true; } catch (error) { uncertainCommit = true; becomeUnsafe('MANUAL_IMPORT_COMMIT_UNCERTAIN'); throw error; }
      await reconcileManualImportAdmission({ configurationDirectory: configuration.directory, approvedActivationHash: configuration.activationHash, approvedConfigurationScopeHash: configuration.scopeHash,
        admissionId: admission.admissionId, approvedReconciliationHash: jsonDigest({ activationHash: configuration.activationHash, admissionId: admission.admissionId, manifestHash: admission.manifestHash }),
        verify: async () => 'COMMITTED' });
      return result;
    } catch (error) {
      if (committed) becomeUnsafe('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
      if (began) {
        try { await client.query('ROLLBACK'); } catch { connectionLost = true; becomeUnsafe('MANUAL_IMPORT_CONNECTION_LOST'); }
      }
      if (admission && !committed && !uncertainCommit && !connectionLost) {
        try {
          await reconcileManualImportAdmission({ configurationDirectory: configuration.directory, approvedActivationHash: configuration.activationHash, approvedConfigurationScopeHash: configuration.scopeHash,
            admissionId: admission.admissionId, approvedReconciliationHash: jsonDigest({ activationHash: configuration.activationHash, admissionId: admission.admissionId, manifestHash: admission.manifestHash }),
            verify: async () => 'ROLLED_BACK' });
        } catch (journalError) { becomeUnsafe('MANUAL_IMPORT_RECONCILIATION_REQUIRED'); throw journalError; }
      }
      throw error;
    } finally { active = null; if (state === 'UNSAFE') release(true); schedule(); }
  }
  function schedule() {
    if (active || state !== 'ACTIVE') return;
    const job = queued.shift(); if (!job) return;
    execute(job).then(job.resolve, job.reject);
  }
  function admitWith(parser, request, input, capability) {
    if (capability !== internalCapability) return Promise.reject(Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' }));
    let pkg; try { pkg = parser(input); } catch { return Promise.reject(Object.assign(new Error('VALIDATION_ERROR'), { code: 'VALIDATION_ERROR' })); }
    if (state !== 'ACTIVE' || connectionLost) return Promise.reject(Object.assign(new Error('MANUAL_IMPORT_UNAVAILABLE'), { code: 'MANUAL_IMPORT_UNAVAILABLE' }));
    return new Promise((resolve, rejectJob) => { queued.push({ request, pkg, capability, resolve, reject: rejectJob }); schedule(); });
  }
  const admitV3 = (request, input, capability) => admitWith(parseManualFactoryPackageV3, request, input, capability);
  const admitV4 = (request, input, capability) => {
    if (!enableClozeMatching || configuration.activation.profile !== interactionProfile) {
      return Promise.reject(Object.assign(new Error('MANUAL_CLOZE_MATCHING_DISABLED'), { code: 'MANUAL_CLOZE_MATCHING_DISABLED' }));
    }
    return admitWith(parseManualFactoryPackageV4, request, input, capability);
  };
  async function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = stopInternal();
    return stopPromise;
  }
  async function stopInternal() {
    if (state === 'STOPPED') return { status: 'STOPPED' };
    if (state === 'UNSAFE' || connectionLost || uncertainCommit) { release(true); return { status: 'UNSAFE_RECONCILIATION_REQUIRED' }; }
    state = 'STOPPING'; failQueued('MANUAL_IMPORT_STOPPED');
    while (active) await new Promise((resolve) => setTimeout(resolve, 5));
    if (connectionLost || uncertainCommit) { becomeUnsafe('MANUAL_IMPORT_CONNECTION_LOST'); release(true); return { status: 'UNSAFE_RECONCILIATION_REQUIRED' }; }
    try {
      await retireManualImportConfiguration(configuration);
      await client.query('SELECT pg_advisory_unlock($1,$2)', coordinatorKey);
      state = 'STOPPED'; return { status: 'STOPPED' };
    } catch (error) {
      becomeUnsafe('MANUAL_IMPORT_RETIREMENT_UNSAFE');
      throw error;
    } finally { release(state !== 'STOPPED'); }
  }
  return Object.freeze({
    importManualFactoryPackageV3: admitV3,
    importManualFactoryPackageV4: admitV4,
    stop,
    status: () => Object.freeze({ status: state, queued: queued.length, active: active !== null, uncertainCommit, connectionLost }),
  });
}

export { reconcileManualImportAdmission };

/** Resolve a crash/unknown-commit admission without ever resubmitting its manifest. */
export async function reconcileManualFactoryImportAdmission({ bankPool, identityService, internalCapability, enableClozeMatching = false, env = process.env, configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash, approvedReconciliationHash, request, input, capability, admissionId }) {
  if (typeof enableClozeMatching !== 'boolean') throw new TypeError('enableClozeMatching must be a boolean');
  if (disabledByEnvironment(true, env) || capability !== internalCapability) reject(403, 'FORBIDDEN');
  const configuration = await loadManualImportConfiguration({ configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash, allowPending: true });
  if (configuration.activation.profile === interactionProfile && !enableClozeMatching) reject(403, 'MANUAL_CLOZE_MATCHING_DISABLED');
  const pending = configuration.pendingAdmissions.get(admissionId);
  if (!pending) reject(409, 'MANUAL_IMPORT_RECONCILIATION_REQUIRED');
  let pkg;
  try {
    pkg = configuration.activation.profile === interactionProfile
      ? parseManualFactoryPackageV4(input)
      : parseManualFactoryPackageV3(input);
  } catch { reject(422, 'VALIDATION_ERROR'); }
  if (jsonDigest(pkg) !== pending.manifestHash || pkg.producerNamespace !== pending.producerNamespace || pkg.batchKey !== pending.batchKey) reject(409, 'MANUAL_IMPORT_RECONCILIATION_REQUIRED');
  bindActivation(pkg, configuration);
  await assertBankConnection(bankPool);
  const client = await bankPool.connect();
  try {
    const locked = await client.query('SELECT pg_try_advisory_lock($1,$2) AS acquired', coordinatorKey);
    if (!locked.rows[0]?.acquired) reject(409, 'MANUAL_IMPORT_COORDINATOR_ACTIVE');
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE tsa_bank');
      await client.query('SELECT pg_advisory_xact_lock($1,$2)', bankTransactionKey);
      await client.query('SELECT id FROM tsa.bank_state WHERE id=1 FOR UPDATE');
      if (!(request instanceof Request)) reject(401, 'UNAUTHENTICATED');
      const principal = await identityService.authenticate(request); requireActor(identityService, principal, 'bank.question.author');
      await verifyManualRegisteredMapping(client, principal, pkg, configuration.mapping);
      const manifest = await client.query(`SELECT manifest_hash,manifest FROM tsa_private.factory_import_manifests WHERE producer_namespace=$1 AND batch_key=$2`, [pkg.producerNamespace, pkg.batchKey]);
      let outcome;
      if (manifest.rowCount === 1) {
        if (manifest.rows[0].manifest_hash !== pending.manifestHash || jsonDigest(manifest.rows[0].manifest) !== pending.manifestHash) reject(409, 'IMPORT_INTEGRITY_CONFLICT');
        await verifyStoredFactoryPackage(client, pkg); await verifyStoredFactoryReceipts(client, pkg); outcome = 'COMMITTED';
      } else {
        const partial = await client.query(`SELECT
          (SELECT count(*) FROM tsa_private.factory_import_receipts WHERE producer_namespace=$1 AND batch_key=$2)
          + (SELECT count(*) FROM tsa_private.factory_import_runs WHERE question_version_id=ANY($3::uuid[]))
          + (SELECT count(*) FROM tsa.question_versions WHERE id=ANY($3::uuid[]))
          + (SELECT count(*) FROM tsa_private.reference_nodes WHERE reference_namespace=$4) AS count`,
        [pkg.producerNamespace, pkg.batchKey, pending.candidateVersionIds, factoryImportNamespace(pkg)]);
        if (Number(partial.rows[0]?.count) !== 0) reject(409, 'IMPORT_INTEGRITY_CONFLICT');
        outcome = 'ABSENT';
      }
      await client.query('ROLLBACK');
      return await reconcileManualImportAdmission({ configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash,
        admissionId, approvedReconciliationHash, verify: async () => outcome });
    } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
    finally { await client.query('SELECT pg_advisory_unlock($1,$2)', coordinatorKey); }
  } finally { client.release(); }
}
