import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { exportPackage } from '../../tools/question-bank/export-package.mjs';
import { renderSchema, SCHEMA_PATH } from '../../tools/question-bank/generate-schema.mjs';
import { PROMPT_PATH, renderPrompt, texLists } from '../../tools/question-bank/sync-prompt.mjs';
import { formatReport, validateExchange } from '../../tools/question-bank/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VALIDATE = path.join(ROOT, 'tools', 'question-bank', 'validate.mjs');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'tsa-question-bank-'));
after(() => rm(scratch, { recursive: true, force: true }));

const run = (...args) => spawnSync(process.execPath, [VALIDATE, ...args], { encoding: 'utf8', cwd: scratch });
const lastJsonBlock = (text) => {
  const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/gu)];
  return JSON.parse(blocks.at(-1)[1]);
};

test('the committed JSON Schema is exactly what the Zod definitions generate', async () => {
  assert.equal(await readFile(SCHEMA_PATH, 'utf8'), renderSchema());
});

test('the generation prompt lists exactly the LaTeX the Bank accepts', async () => {
  assert.equal(await readFile(PROMPT_PATH, 'utf8'), await renderPrompt(), 'run: node tools/question-bank/sync-prompt.mjs');
  const { commands } = texLists();
  assert.ok(commands.includes('\\frac') && commands.includes('\\sqrt') && !commands.includes('\\newcommand'));
});

test('the complete example inside the standalone prompt is itself a valid question set', async () => {
  const report = validateExchange(lastJsonBlock(await readFile(PROMPT_PATH, 'utf8')));
  assert.deepEqual(report.errors, []);
  assert.equal(report.summary.questions, 1);
});

test('the standalone prompt needs no repository: no paths, commands or code references', async () => {
  const prompt = await readFile(PROMPT_PATH, 'utf8');
  for (const pattern of [/\.mjs\b/u, /\.ts\b/u, /\bnpm\b/u, /\bsrc\//u, /\bdocs\//u, /\bpackages\//u, /TSA-Platform/u, /\.local\b/u, /corpus/iu, /repository/iu]) {
    // Only the human preamble above the rule may mention the validator.
    const body = prompt.slice(prompt.indexOf('\n---\n'));
    assert.doesNotMatch(body, pattern, String(pattern));
  }
  const forbidsInvention = /Never invent an image asset id/u;
  assert.match(prompt, forbidsInvention);
  assert.match(prompt, /image_request/u);
});

test('the package export is self-contained and an outside file validates against it without the repository context', async () => {
  const out = path.join(scratch, 'package');
  const exported = await exportPackage(out);
  assert.ok(exported.files >= 25);
  await assert.rejects(exportPackage(out), /already exists/u, 'an export never overwrites');
  const names = (await readdir(out)).sort();
  assert.deepEqual(names, ['AI_QUESTION_GENERATION_PROMPT.md', 'MANIFEST.json', 'QUESTION_FORMAT.md', 'README.md', 'examples', 'question-set.schema.json']);
  const manifest = JSON.parse(await readFile(path.join(out, 'MANIFEST.json'), 'utf8'));
  assert.equal(manifest.format, 'tsa-question-set/1');
  assert.ok(Object.keys(manifest.files).includes('examples/valid/single-choice.json'));
  for (const file of Object.keys(manifest.files)) {
    const text = await readFile(path.join(out, file), 'utf8');
    assert.doesNotMatch(text, /data\/corpus-ingest|\.local\/|TSA_Example_Questions|answerKey|@gmail\./u, file);
  }
  // What an unrelated AI would return after reading only the packaged prompt: validated from a directory outside the repository.
  const generated = path.join(scratch, 'ai-output.json');
  await writeFile(generated, JSON.stringify(lastJsonBlock(await readFile(path.join(out, 'AI_QUESTION_GENERATION_PROMPT.md'), 'utf8'))));
  const ok = run(generated);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /VALID: 1 question\(s\) \(SINGLE_CHOICE 1\)/u);
});

test('the command line reports problems with locations and exits non-zero', async () => {
  const bad = path.join(scratch, 'bad.json');
  const document = JSON.parse(await readFile(path.join(ROOT, 'docs/question-bank/examples/valid/single-choice.json'), 'utf8'));
  document.questions[0].answer.option_id = 'E';
  await writeFile(bad, JSON.stringify(document));
  const result = run(bad);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /ERROR\s+questions\[0\]\.answer\.option_id\s+\[ANSWER_NOT_AN_OPTION\]/u);
  assert.match(result.stdout, /INVALID: 1 error\(s\)/u);
  const json = JSON.parse(run(bad, '--json').stdout);
  assert.equal(json.ok, false);
  assert.equal(json.errors[0].code, 'ANSWER_NOT_AN_OPTION');
  assert.equal(run(path.join(scratch, 'missing.json')).status, 2);
  assert.equal(run().status, 2);
  await writeFile(path.join(scratch, 'broken.json'), '{ not json');
  assert.equal(run(path.join(scratch, 'broken.json')).status, 2);
});

test('the command line checks image ids against an asset catalog and the Bank TeX allowlist', async () => {
  const file = path.join(ROOT, 'docs/question-bank/examples/valid/images-shared-and-multiple.json');
  const catalog = path.join(scratch, 'assets.json');
  await writeFile(catalog, JSON.stringify(['IMG-GEO-000123']));
  const missing = run(file, '--assets', catalog);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /\[ASSET_NOT_FOUND\].*IMG-GEO-000124/u);
  await writeFile(catalog, JSON.stringify({ assets: ['IMG-GEO-000123', 'IMG-GEO-000124'] }));
  assert.equal(run(file, '--assets', catalog).status, 0);
  const document = JSON.parse(await readFile(file, 'utf8'));
  document.questions[0].content_blocks[0].content = 'Tính $\\write18{x}$.';
  assert.deepEqual(validateExchange(document).errors.map((issue) => issue.code), ['UNSUPPORTED_TEX']);
  assert.match(formatReport(validateExchange(document)), /UNSUPPORTED_TEX/u);
});

test('an image request is a warning and not an import-ready question', async () => {
  const report = validateExchange(JSON.parse(await readFile(path.join(ROOT, 'docs/question-bank/examples/valid/image-needed.json'), 'utf8')));
  assert.equal(report.ok, true);
  assert.match(formatReport(report), /1 need a new image asset before import/u);
});
