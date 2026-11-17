import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { link, open, realpath, stat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportGenericFixturePackage } from './generic-fixture.mjs';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;

async function readPrivateInput(filename) {
  const handle = await open(resolve(filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > MAX_INPUT_BYTES) throw new Error('PRIVATE_INPUT_REQUIRED');
    // Bound the read even if another process appends after fstat.
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, null);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > MAX_INPUT_BYTES) throw new Error('INPUT_LIMIT');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used)));
  } finally { await handle.close(); }
}

async function privateTarget(filename) {
  const path = resolve(filename);
  const parent = await realpath(dirname(path));
  const publicRoot = await realpath(fileURLToPath(new URL('../../apps/practice-prototype/public/', import.meta.url)));
  const target = join(parent, basename(path));
  const fromPublic = relative(publicRoot, target);
  if (fromPublic === '' || (fromPublic !== '..' && !fromPublic.startsWith(`..${sep}`) && !isAbsolute(fromPublic))) {
    throw new Error('PRIVATE_OUTPUT_REQUIRED');
  }
  const info = await stat(parent);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new Error('PRIVATE_OUTPUT_REQUIRED');
  return target;
}

export async function exportFixtureFile(inputPath, outputPath) {
  const target = await privateTarget(outputPath);
  const generated = await exportGenericFixturePackage(await readPrivateInput(inputPath));
  const temporary = join(dirname(target), `.generic-fixture-${randomUUID()}.tmp`);
  let handle;
  let created = false;
  try {
    handle = await open(temporary, 'wx', 0o600); created = true;
    await handle.writeFile(generated.packageBytes); await handle.sync();
    await handle.close(); handle = undefined;
    // Same-directory link publishes a complete inode atomically and never replaces
    // an existing target. A killed writer may leave a private temporary file only.
    await link(temporary, target);
    const directory = await open(dirname(target), constants.O_RDONLY | constants.O_DIRECTORY);
    try { await directory.sync(); } finally { await directory.close(); }
    await unlink(temporary); created = false;
  } catch (error) {
    const errors = [error];
    try { await handle?.close(); } catch (closeError) { errors.push(closeError); }
    // Never unlink the target: publication may have committed before an uncertain
    // directory-sync/cleanup failure. The operator can inspect that complete file.
    if (created) try { await unlink(temporary); } catch (removeError) { if (removeError.code !== 'ENOENT') errors.push(removeError); }
    throw new AggregateError(errors, 'GENERIC_FIXTURE_EXPORT_FAILED');
  }
  return { fixture: true, liveLlmCalled: false, candidates: generated.package.candidates.length,
    humanReview: 'NOT_PERFORMED', publication: 'NOT_PERFORMED' };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length !== 4) throw new Error('INVALID_ARGUMENTS');
    const result = await exportFixtureFile(process.argv[2], process.argv[3]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Generic fixture export failed; inspect private inputs and output permissions.\n');
    process.exitCode = 1;
  }
}
