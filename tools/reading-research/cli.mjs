// Offline explicit-file intake only: no networking, providers, Bank or runtime imports.
import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCapture, hash } from './parser.mjs';
import { aggregate, renderReport, generationGuide } from './report.mjs';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = join(REPO, '.local/reading-research');
const MAX_BYTES = 5 * 1024 * 1024;
const plainObject = o => o && typeof o === 'object' && !Array.isArray(o);
export function validateManifest(m) {
  if (!plainObject(m) || Object.keys(m).some(k => !['schemaVersion', 'operator', 'files'].includes(k)) ||
    m.schemaVersion !== 'reading-capture-manifest/1' || typeof m.operator !== 'string' || !m.operator.trim() ||
    !Array.isArray(m.files) || !m.files.length || m.files.length > 1000) throw Error('INVALID_MANIFEST');
  for (const f of m.files) {
    if (!plainObject(f) || Object.keys(f).some(k => !['path', 'source', 'rightsStatus', 'rightsNotes', 'kind'].includes(k)) ||
      !['path', 'source', 'rightsStatus', 'rightsNotes'].every(k => typeof f[k] === 'string' && f[k].trim()) ||
      !f.path.endsWith('.txt') || !['UNKNOWN', 'REFERENCE_ONLY', 'OPERATOR_DECLARED_PERMISSION'].includes(f.rightsStatus) ||
      !['SYNTHETIC', 'OPERATOR_CAPTURE'].includes(f.kind)) throw Error('INVALID_FILE_DECLARATION');
  }
  return m;
}
async function privateWorkspace(out) {
  const target = resolve(out), rel = relative(ROOT, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('OUTPUT_MUST_BE_NEW_CHILD_OF_.local/reading-research');
  // Reject symlinks at every existing component, including .local and the output.
  const repoReal = await realpath(REPO);
  let current = repoReal;
  for (const part of relative(REPO, target).split('/')) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw Error('SYMLINK_OUTPUT_REJECTED'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await mkdir(target, { mode: 0o700 }); // New-only: never overwrite a previous run.
  await mkdir(join(target, 'raw'), { mode: 0o700 });
  return target;
}
const save = (out, name, data) => writeFile(join(out, name), data, { mode: 0o600, flag: 'wx' });
export async function run(manifestPath, outputPath, reviewPath) {
  const m = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  const inputs = [], seen = new Set();
  for (const f of m.files) {
    const path = await realpath(resolve(dirname(resolve(manifestPath)), f.path));
    if (seen.has(path)) throw Error('DUPLICATE_INPUT_PATH'); seen.add(path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw Error('INPUT_NOT_REGULAR_OR_TOO_LARGE');
    const bytes = await readFile(path);
    if (bytes.length > MAX_BYTES) throw Error('INPUT_TOO_LARGE');
    inputs.push({ declaration: f, bytes, sha256: hash(bytes) });
  }
  if (inputs.length > 3) {
    if (!reviewPath) throw Error('BATCH_REQUIRES_APPROVED_PILOT_REVIEW');
    const review = JSON.parse(await readFile(reviewPath, 'utf8'));
    if (review.schemaVersion !== 'reading-pilot-review/1' || review.approved !== true ||
      typeof review.reviewer !== 'string' || !review.reviewer.trim() || typeof review.notes !== 'string' || !review.notes.trim() ||
      !Array.isArray(review.captureHashes) || review.captureHashes.length < 1 || review.captureHashes.length > 3 ||
      !review.captureHashes.every(h => inputs.some(i => i.sha256 === h))) throw Error('INVALID_PILOT_REVIEW');
  }
  const out = await privateWorkspace(outputPath), captures = [];
  await save(out, 'manifest.json', JSON.stringify(m, null, 2));
  for (const [index, input] of inputs.entries()) {
    const rawFile = `raw/${index + 1}.txt`;
    await save(out, rawFile, input.bytes);
    const capture = { declaration: input.declaration, sha256: input.sha256, byteLength: input.bytes.length, rawFile,
      rightsVerification: 'OPERATOR_DECLARATION_NOT_VERIFIED', externalUploadAuthorized: false, extraction: null };
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input.bytes); }
    catch { capture.warnings = [{ code: 'INVALID_UTF8_RAW_PRESERVED' }]; }
    if (text !== undefined) capture.extraction = parseCapture(text);
    captures.push(capture);
  }
  const summary = aggregate(captures);
  await save(out, 'extraction.json', JSON.stringify({ schemaVersion: 'reading-research/1', captures }, null, 2));
  await save(out, 'summary.json', JSON.stringify(summary, null, 2));
  await save(out, 'report.md', renderReport(summary));
  await save(out, 'taxonomy.json', JSON.stringify(summary.taxonomy, null, 2));
  await save(out, 'generation-guide.md', generationGuide(summary));
  if (reviewPath) await save(out, 'pilot-review-used.json', await readFile(reviewPath));
  await save(out, 'pilot-review-template.json', JSON.stringify({ schemaVersion: 'reading-pilot-review/1', approved: false,
    reviewer: '', notes: '', captureHashes: inputs.slice(0, 3).map(i => i.sha256) }, null, 2));
  return { output: out, captureCount: captures.length, questionCount: summary.questionCount, representativeness: summary.representativeness };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [manifest, out, review, ...extra] = process.argv.slice(2);
  try {
    if (!manifest || !out || extra.length) throw Error('Usage: node tools/reading-research/cli.mjs MANIFEST_JSON NEW_.local/reading-research/RUN [PILOT_REVIEW_JSON]');
    process.stdout.write(`${JSON.stringify(await run(manifest, out, review))}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
