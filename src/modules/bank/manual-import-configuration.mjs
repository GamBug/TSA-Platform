import { constants } from 'node:fs';
import { lstat, open, realpath, rename, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalize, parseManualImportMapping, parseManualImportMappingV4, parseManualJsonBytes } from '../../../packages/contracts/dist/internal.js';
import { BankCommandError } from './common.mjs';

const files = Object.freeze({ activation: 'activation.json', mapping: 'mapping.json', state: 'active-state.json', retired: 'retired-activations.ndjson', admissions: 'admissions.ndjson' });
export const MANUAL_IMPORT_CONFIGURATION_LAYOUT = files;
const INTERACTION_PROFILE = 'corpus-reading-interactions-draft/1';
const PROFILES = new Set(['manual-reading-draft/1', 'corpus-reading-draft/1', 'corpus-math-draft/1', INTERACTION_PROFILE]);
const activationKeys = ['schemaVersion', 'activationId', 'profile', 'ownerDecisionRef', 'producerNamespace', 'registeredAuthorId', 'declaredOperatorId', 'sourceVersionId', 'sourceTextHash', 'permissionHash', 'sourceAuthoringHash', 'responseHash', 'promptHash', 'mappingHash', 'taxonomyVersionId', 'taxonomyDefinitionHash', 'validFrom', 'validUntil'];
const stateKeys = ['schemaVersion', 'activationId', 'activationHash', 'status'];
const hashPattern = /^sha256:[0-9a-f]{64}$/;

function fail(code = 'MANUAL_IMPORT_CONFIGURATION_INVALID', status = 503) { throw new BankCommandError(status, code); }
function digest(value) { return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`; }
export function manualImportActivationHash(activation) { return digest(activation); }
export function manualImportConfigurationScopeHash(directory, activationHash) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || !hashPattern.test(activationHash)) fail();
  return digest({ activationHash, configurationDirectory: directory });
}
export function createManualImportActiveState(activation) {
  return Object.freeze({ schemaVersion: 'manual-import-active-state/1', activationId: activation.activationId,
    activationHash: manualImportActivationHash(activation), status: 'ACTIVE' });
}
function strictObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail();
  return value;
}
function instant(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(); return value; }
function privateMode(metadata) { if ((metadata.mode & 0o077) !== 0 || metadata.uid !== process.getuid()) fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE'); }
async function privateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail();
  if (value.split(/[\\/]+/).includes('public')) fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE');
  const metadata = await lstat(value).catch(() => fail());
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE'); privateMode(metadata);
  let current = '/';
  for (const component of value.split('/').filter(Boolean)) {
    current = join(current, component);
    const parent = await lstat(current).catch(() => fail());
    if (parent.isSymbolicLink()) fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE');
  }
  return realpath(value).catch(() => fail());
}
async function privateFile(directory, name, optional = false) {
  const candidate = join(directory, name);
  const metadata = await lstat(candidate).catch((error) => error?.code === 'ENOENT' && optional ? null : fail());
  if (!metadata) return null;
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE'); privateMode(metadata);
  const path = await realpath(candidate).catch(() => fail());
  if (relative(directory, path).startsWith('..')) fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE');
  return path;
}
async function jsonFile(directory, name) {
  try { return parseManualJsonBytes(await boundedPrivateBytes(directory, name), name, 1024 * 1024); }
  catch (error) { if (error instanceof BankCommandError) throw error; fail(); }
}

async function boundedPrivateBytes(directory, name) {
  const path = await privateFile(directory, name);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => fail());
  try {
    const metadata = await handle.stat(); privateMode(metadata);
    if (!metadata.isFile() || metadata.size > 1024 * 1024) fail();
    const bytes = Buffer.alloc(1024 * 1024 + 1); let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break; length += result.bytesRead;
    }
    if (length > 1024 * 1024) fail(); return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

async function journalText(directory, name) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await boundedPrivateBytes(directory, name)); }
  catch { fail(); }
}
function validateActivation(activation, approvedActivationHash) {
  strictObject(activation, activationKeys);
  if (activation.schemaVersion !== 'manual-import-activation/1' || !PROFILES.has(activation.profile) || activation.validUntil === null
      || !['activationId', 'ownerDecisionRef', 'producerNamespace', 'registeredAuthorId', 'declaredOperatorId', 'sourceVersionId', 'taxonomyVersionId'].every((key) => typeof activation[key] === 'string' && activation[key].length)
      || !['sourceTextHash', 'permissionHash', 'sourceAuthoringHash', 'responseHash', 'promptHash', 'mappingHash', 'taxonomyDefinitionHash'].every((key) => hashPattern.test(activation[key]))) fail();
  instant(activation.validFrom); instant(activation.validUntil); if (Date.parse(activation.validFrom) >= Date.parse(activation.validUntil)) fail();
  const activationHash = manualImportActivationHash(activation);
  if (!hashPattern.test(approvedActivationHash ?? '') || activationHash !== approvedActivationHash) fail('MANUAL_IMPORT_ACTIVATION_UNAPPROVED', 403);
  return activationHash;
}
function validateState(state, activation, activationHash) {
  strictObject(state, stateKeys);
  if (state.schemaVersion !== 'manual-import-active-state/1' || state.status !== 'ACTIVE' || state.activationId !== activation.activationId || state.activationHash !== activationHash) fail();
}
function validateMapping(mapping, activation) {
  let parsed;
  try {
    parsed = activation.profile === INTERACTION_PROFILE
      ? parseManualImportMappingV4(mapping)
      : parseManualImportMapping(mapping);
  } catch { fail(); }
  if (parsed.profile !== activation.profile || parsed.producerNamespace !== activation.producerNamespace || parsed.declaredOperatorId !== activation.declaredOperatorId
      || parsed.registeredAuthorId !== activation.registeredAuthorId || parsed.sourceVersionId !== activation.sourceVersionId
      || parsed.taxonomy?.registeredVersionId !== activation.taxonomyVersionId || parsed.taxonomy?.registeredDefinitionHash !== activation.taxonomyDefinitionHash
      || digest(parsed) !== activation.mappingHash) fail('MANUAL_IMPORT_MAPPING_MISMATCH', 403);
  return parsed;
}
async function retiredHashes(directory) {
  const path = await privateFile(directory, files.retired, true); if (!path) return new Set();
  const text = await journalText(directory, files.retired);
  if (text && !text.endsWith('\n')) fail('MANUAL_IMPORT_RETIREMENT_UNCERTAIN');
  const result = new Set();
  for (const line of text.split('\n').filter(Boolean)) {
    let receipt; try { receipt = parseManualJsonBytes(Buffer.from(line), 'retirement'); } catch { fail('MANUAL_IMPORT_RETIREMENT_UNCERTAIN'); }
    strictObject(receipt, ['schemaVersion', 'activationHash', 'activationId', 'retiredAt', 'reason']);
    if (receipt.schemaVersion !== 'manual-import-retirement/1' || !hashPattern.test(receipt.activationHash) || typeof receipt.activationId !== 'string' || typeof receipt.reason !== 'string') fail();
    instant(receipt.retiredAt); result.add(receipt.activationHash);
  }
  return result;
}
const validCandidateCount = (profile, count) => profile === 'corpus-math-draft/1'
  ? count >= 1 && count <= 20 : profile === INTERACTION_PROFILE ? count === 7 || count === 8 : count === 10;
async function admissionEvents(directory, profile) {
  const path = await privateFile(directory, files.admissions, true); if (!path) return new Map();
  const text = await journalText(directory, files.admissions);
  if (text && !text.endsWith('\n')) fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
  const pending = new Map(), seen = new Set();
  for (const line of text.split('\n').filter(Boolean)) {
    let event; try { event = parseManualJsonBytes(Buffer.from(line), 'admission'); } catch { fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED'); }
    if (!event || typeof event !== 'object' || Array.isArray(event) || event.schemaVersion !== 'manual-import-admission/1'
        || typeof event.admissionId !== 'string' || !hashPattern.test(event.activationHash) || !hashPattern.test(event.manifestHash)
        || !['PENDING', 'RECONCILED'].includes(event.status)) fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
    const keys = Object.keys(event).sort();
    const expected = (event.status === 'PENDING'
      ? ['schemaVersion', 'admissionId', 'activationHash', 'manifestHash', 'producerNamespace', 'batchKey', 'candidateVersionIds', 'admittedAt', 'status']
      : ['schemaVersion', 'admissionId', 'activationHash', 'manifestHash', 'producerNamespace', 'batchKey', 'candidateVersionIds', 'admittedAt', 'status', 'outcome', 'reconciledAt']).sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])
        || typeof event.producerNamespace !== 'string' || typeof event.batchKey !== 'string'
        || !Array.isArray(event.candidateVersionIds) || !validCandidateCount(profile, event.candidateVersionIds.length)
        || event.candidateVersionIds.some((id) => typeof id !== 'string') || !Number.isFinite(Date.parse(event.admittedAt))
        || (event.status === 'RECONCILED' && (!['COMMITTED', 'ABSENT', 'ROLLED_BACK'].includes(event.outcome) || !Number.isFinite(Date.parse(event.reconciledAt))))) fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
    if (event.status === 'PENDING') {
      if (seen.has(event.admissionId)) fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
      seen.add(event.admissionId); pending.set(event.admissionId, event);
    } else {
      const original = pending.get(event.admissionId);
      const { status, outcome, reconciledAt, ...claim } = event;
      const { status: originalStatus, ...expectedClaim } = original ?? {};
      if (!original || digest(claim) !== digest(expectedClaim)) fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
      pending.delete(event.admissionId);
    }
  }
  return pending;
}
export async function configurationFingerprint(directory) {
  const entries = await Promise.all(Object.values(files).filter((name) => name !== files.admissions).map(async (name) => {
    const path = await privateFile(directory, name, name === files.retired); if (!path) return `${name}:absent`;
    return `${name}:${createHash('sha256').update(await boundedPrivateBytes(directory, name)).digest('hex')}`;
  }));
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}
export async function loadManualImportConfiguration({ configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash, allowPending = false }) {
  const directory = await privateDirectory(resolve(configurationDirectory));
  const [activation, mapping, state] = await Promise.all([jsonFile(directory, files.activation), jsonFile(directory, files.mapping), jsonFile(directory, files.state)]);
  const activationHash = validateActivation(activation, approvedActivationHash); validateState(state, activation, activationHash);
  const scopeHash = manualImportConfigurationScopeHash(directory, activationHash);
  if (scopeHash !== approvedConfigurationScopeHash) fail('MANUAL_IMPORT_CONFIGURATION_UNAPPROVED', 403);
  if ((await retiredHashes(directory)).has(activationHash)) fail('MANUAL_IMPORT_ACTIVATION_RETIRED', 403);
  const pendingAdmissions = await admissionEvents(directory, activation.profile);
  if (pendingAdmissions.size && !allowPending) fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
  const fingerprint = await configurationFingerprint(directory);
  return Object.freeze({ directory, activation: Object.freeze(activation), mapping: Object.freeze(validateMapping(mapping, activation)), activationHash, scopeHash, fingerprint, pendingAdmissions });
}
async function syncDirectory(directory) { const handle = await open(directory, 'r').catch(() => fail('MANUAL_IMPORT_RETIREMENT_UNCERTAIN')); try { await handle.sync(); } finally { await handle.close(); } }
export async function retireManualImportConfiguration(configuration, reason = 'STOPPED') {
  if (!configuration?.directory || await configurationFingerprint(configuration.directory) !== configuration.fingerprint) fail('MANUAL_IMPORT_CONFIGURATION_CHANGED');
  const directory = await privateDirectory(configuration.directory);
  const receipt = { schemaVersion: 'manual-import-retirement/1', activationHash: configuration.activationHash, activationId: configuration.activation.activationId, retiredAt: new Date().toISOString(), reason };
  const handle = await open(join(directory, files.retired), constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600).catch(() => fail());
  try {
    const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`), metadata = await handle.stat();
    privateMode(metadata);
    if (metadata.size + bytes.length > 1024 * 1024) fail('MANUAL_IMPORT_JOURNAL_FULL');
    await handle.writeFile(bytes); await handle.sync();
  } finally { await handle.close(); }
  await stat(join(directory, files.retired)).then(privateMode).catch(() => fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE'));
  await syncDirectory(directory);
  const temporary = join(directory, `.${files.state}.${process.pid}.tmp`);
  const stateFile = await open(temporary, 'wx', 0o600).catch(() => fail());
  try {
    await stateFile.writeFile(JSON.stringify({ schemaVersion: 'manual-import-active-state/1', activationId: configuration.activation.activationId, activationHash: configuration.activationHash, status: 'RETIRED' }));
    await stateFile.sync();
  } finally { await stateFile.close(); }
  await rename(temporary, join(directory, files.state)).catch(() => fail('MANUAL_IMPORT_RETIREMENT_UNCERTAIN'));
  await syncDirectory(directory); return Object.freeze(receipt);
}
async function appendAdmissionEvent(directory, event) {
  const handle = await open(join(directory, files.admissions), constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600).catch(() => fail());
  try {
    const line = Buffer.from(`${JSON.stringify(event)}\n`);
    const metadata = await handle.stat(); privateMode(metadata);
    if (metadata.size + line.length > 1024 * 1024) fail('MANUAL_IMPORT_JOURNAL_FULL');
    await handle.writeFile(line); await handle.sync();
  } finally { await handle.close(); }
  await stat(join(directory, files.admissions)).then(privateMode).catch(() => fail('MANUAL_IMPORT_CONFIGURATION_UNSAFE'));
  await syncDirectory(directory);
}
export async function beginManualImportAdmission(configuration, manifest) {
  if (!configuration?.directory || await configurationFingerprint(configuration.directory) !== configuration.fingerprint) fail('MANUAL_IMPORT_CONFIGURATION_CHANGED');
  if ((await admissionEvents(configuration.directory, configuration.activation.profile)).size !== 0) fail('MANUAL_IMPORT_RECONCILIATION_REQUIRED');
  if (manifest.profile !== configuration.activation.profile
      || !validCandidateCount(configuration.activation.profile, manifest.candidates?.length)) fail('MANUAL_IMPORT_CONFIGURATION_INVALID');
  const event = Object.freeze({ schemaVersion: 'manual-import-admission/1', admissionId: randomUUID(), activationHash: configuration.activationHash,
    manifestHash: digest(manifest), producerNamespace: manifest.producerNamespace, batchKey: manifest.batchKey,
    candidateVersionIds: manifest.candidates.map((candidate) => candidate.question.id), admittedAt: new Date().toISOString(), status: 'PENDING' });
  const current = await privateFile(configuration.directory, files.admissions, true);
  const size = current ? (await stat(current)).size : 0;
  // Reserve the matching resolution before beginning any application mutation.
  if (size + 2 * Buffer.byteLength(JSON.stringify(event)) + 512 > 1024 * 1024) fail('MANUAL_IMPORT_JOURNAL_FULL');
  await appendAdmissionEvent(configuration.directory, event); return event;
}
export async function reconcileManualImportAdmission({ configurationDirectory, approvedActivationHash, approvedConfigurationScopeHash, admissionId, approvedReconciliationHash, verify }) {
  if (typeof verify !== 'function') throw new TypeError('A trusted receipt reconciliation callback is required');
  const directory = await privateDirectory(resolve(configurationDirectory));
  const activation = await jsonFile(directory, files.activation); const activationHash = validateActivation(activation, approvedActivationHash);
  if (manualImportConfigurationScopeHash(directory, activationHash) !== approvedConfigurationScopeHash) fail('MANUAL_IMPORT_CONFIGURATION_UNAPPROVED', 403);
  const pending = await admissionEvents(directory, activation.profile); const event = pending.get(admissionId);
  if (!event || event.activationHash !== activationHash || approvedReconciliationHash !== digest({ activationHash, admissionId, manifestHash: event.manifestHash })) fail('MANUAL_IMPORT_RECONCILIATION_UNAPPROVED', 403);
  const outcome = await verify(Object.freeze(event));
  if (!['COMMITTED', 'ABSENT', 'ROLLED_BACK'].includes(outcome)) fail('MANUAL_IMPORT_RECONCILIATION_UNCERTAIN');
  await appendAdmissionEvent(directory, { ...event, status: 'RECONCILED', outcome, reconciledAt: new Date().toISOString() });
  return Object.freeze({ ...event, outcome });
}
