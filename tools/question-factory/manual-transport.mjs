// Private preparation only. Bank admission independently revalidates this output.
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManualFactoryPackageV3, parseManualImportMapping } from '../../packages/contracts/dist/internal.js';
import { withTransaction } from '../../src/modules/database/pool.mjs';
import { assertBankConnection, jsonDigest, reject, requireActor } from '../../src/modules/bank/common.mjs';
import { loadRegisteredManualTaxonomy, verifyManualRegisteredMapping } from '../../src/modules/bank/manual-import-mapping.mjs';

const PUBLIC_ROOT = fileURLToPath(new URL('../../apps/practice-prototype/public/', import.meta.url));
const ARTIFACT_NAMES = new Set(['input', 'prompt', 'response', 'declaration', 'sourceDeclaration',
  'criticResponse', 'criticDeclaration', 'criticNotes']);

async function privatePath(value, { directory = false } = {}) {
  const path = resolve(value);
  let current = path;
  while (true) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new TypeError('PRIVATE_PATH_NO_SYMLINKS_REQUIRED');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const info = await lstat(path);
  if ((directory ? !info.isDirectory() : !info.isFile())
      || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) {
    throw new TypeError('OWNER_ONLY_PRIVATE_PATH_REQUIRED');
  }
  const canonical = await realpath(path);
  const publicRoot = await realpath(PUBLIC_ROOT);
  const rel = relative(publicRoot, canonical);
  if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) {
    throw new TypeError('PRIVATE_PATH_OUTSIDE_PUBLIC_REQUIRED');
  }
  return { path, info };
}

export async function readPrivateManualArtifact(value) {
  const { path, info } = await privatePath(value);
  await privatePath(dirname(path), { directory: true });
  if (info.size > 128 * 1024) throw new TypeError('MANUAL_ARTIFACT_TOO_LARGE');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await handle.stat();
    if (actual.ino !== info.ino || actual.dev !== info.dev || !actual.isFile()
        || actual.size > 128 * 1024 || (actual.mode & 0o077) !== 0) throw new TypeError('PRIVATE_FILE_CHANGED');
    const bytes = Buffer.alloc(128 * 1024 + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > 128 * 1024) throw new TypeError('MANUAL_ARTIFACT_TOO_LARGE');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

async function writeNew(path, value) {
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}

/** Explicit registered preparation; no registration, DB writes, or activation. */
export async function prepareManualDraftTransport({ bankPool, identityService, request,
  capability, internalCapability, enabled = false, env = process.env, mapping: inputMapping,
  artifactPaths, outputDirectory, manualRunId, permissionId, authoringId, transformation }) {
  if (enabled !== true || !['development', 'test'].includes(env.NODE_ENV)
      || env.LOCAL_SYNTHETIC_ONLY !== 'true'
      || (process.env.NODE_ENV !== undefined && !['development', 'test'].includes(process.env.NODE_ENV))
      || !internalCapability || !['object', 'function'].includes(typeof internalCapability)
      || capability !== internalCapability) reject(403, 'FORBIDDEN');
  await assertBankConnection(bankPool);
  const mapping = parseManualImportMapping(inputMapping);
  if (!artifactPaths || Object.getPrototypeOf(artifactPaths) !== Object.prototype
      || Object.keys(artifactPaths).some((name) => !ARTIFACT_NAMES.has(name))) reject(422, 'VALIDATION_ERROR');
  const artifacts = {};
  for (const [name, path] of Object.entries(artifactPaths)) artifacts[name] = await readPrivateManualArtifact(path);
  const pkg = await withTransaction(bankPool, async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const principal = await identityService.authenticate(request);
    requireActor(identityService, principal, 'bank.question.author');
    if (principal.userId !== mapping.registeredAuthorId) reject(403, 'FORBIDDEN');
    const taxonomy = await loadRegisteredManualTaxonomy(client, mapping);
    const result = buildManualFactoryPackageV3({ mapping, taxonomy, artifacts,
      manualRunId, permissionId, authoringId, transformation });
    await verifyManualRegisteredMapping(client, principal, result, mapping);
    return result;
  }, { role: 'tsa_bank' });
  const directory = resolve(outputDirectory);
  await privatePath(dirname(directory), { directory: true });
  await mkdir(directory, { mode: 0o700 });
  await privatePath(directory, { directory: true });
  await writeNew(resolve(directory, 'package.json'), pkg);
  await writeNew(resolve(directory, 'mapping.json'), mapping);
  const receipt = { schemaVersion: 'manual-draft-preparation/1', manifestHash: jsonDigest(pkg),
    mappingHash: jsonDigest(mapping), questionCount: 10, workflowState: 'DRAFT',
    bankImported: false, providerCalled: false, humanApprovedQuestions: 0,
    usage: null, usageVerification: 'UNVERIFIED', publicationPermission: false };
  await writeNew(resolve(directory, 'preparation.json'), receipt);
  return { directory, package: pkg, mapping, receipt };
}
