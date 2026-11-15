// Export the portable question-format reference package: everything an outside author or AI needs, and nothing else.
//   node tools/question-bank/export-package.mjs --out <new-directory>
// The package holds the schema, the format guide, the standalone generation prompt, valid and invalid examples and a
// manifest with a SHA-256 for every file. It contains no repository code, no database content and no answer keys.
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(ROOT, 'docs', 'question-bank');
const FILES = ['QUESTION_FORMAT.md', 'AI_QUESTION_GENERATION_PROMPT.md', 'question-set.schema.json'];
const DIRECTORIES = ['examples'];

const README = `# TSA question-format reference package

Everything needed to write practice questions in the TSA exchange format (\`tsa-question/1\`) without access to the
platform's code, database or history.

| File | Use |
|---|---|
| \`AI_QUESTION_GENERATION_PROMPT.md\` | Paste into any AI conversation (below the line), after filling the request block. |
| \`QUESTION_FORMAT.md\` | The complete format: fields, the six question types, images, passages, what makes a question invalid. |
| \`question-set.schema.json\` | Machine-readable JSON Schema (2020-12). Structural rules only; see "Validation" below for the rest. |
| \`examples/valid/\` | Complete, valid files for every question type, shared and multiple images, a reading passage and an image request. |
| \`examples/invalid/\` | Files that must be rejected, one defect each; \`expected.json\` names the error code for each. |
| \`MANIFEST.json\` | SHA-256 of every file in this package. |

## Using it

1. Open \`AI_QUESTION_GENERATION_PROMPT.md\`, fill in the request (subject, topic, count, difficulty, batch id, available
   image assets) and paste it into an AI conversation. Attach \`question-set.schema.json\` if the tool accepts schemas.
2. Save the single JSON document it returns as \`questions.json\`.
3. Validate it (below). Fix and regenerate anything reported; do not edit answers by guesswork.
4. Hand the validated file to the platform operator to import as DRAFTs. Nothing is ever published by importing: a
   reviewer approves every question.

## Validation

Structure is checked against \`question-set.schema.json\`. The platform validator additionally checks that answers refer
to existing options, image references match the images used and exist in the image library, ids and prompts are unique,
text is safe to render, and LaTeX stays within the supported subset. In the platform repository:

    node tools/question-bank/validate.mjs questions.json --assets asset-ids.json

It prints each problem with its location and an error code (see \`QUESTION_FORMAT.md\`, section 7) and exits 0 only when the
file is valid. Passing validation proves structure and internal consistency; it does not prove the mathematics is right.
A human reviewer, and the platform's answer-verification workflow, check that.

## Image rule

Images are referenced by asset id (\`IMG-AREA-000123\`) and never embedded. An author must never invent an id. If a figure is
needed and no id is available, use an \`image_request\` block; the question then waits until the figure is registered.
`;

async function listFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await listFiles(full));
    else found.push(full);
  }
  return found.sort();
}

export async function exportPackage(outDirectory) {
  const target = path.resolve(outDirectory);
  const existing = await stat(target).catch(() => null);
  if (existing) throw new Error(`${target} already exists; choose a new directory`);
  await mkdir(target, { recursive: true });
  for (const file of FILES) await cp(path.join(SOURCE, file), path.join(target, file));
  for (const directory of DIRECTORIES) await cp(path.join(SOURCE, directory), path.join(target, directory), { recursive: true });
  await writeFile(path.join(target, 'README.md'), README);
  const files = {};
  for (const full of await listFiles(target)) {
    const relative = path.relative(target, full).split(path.sep).join('/');
    files[relative] = `sha256:${createHash('sha256').update(await readFile(full)).digest('hex')}`;
  }
  const manifest = { package: 'tsa-question-format-reference', format: 'tsa-question-set/1', question: 'tsa-question/1', files };
  await writeFile(path.join(target, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory: target, files: Object.keys(files).length + 1 };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const out = process.argv[2] === '--out' ? process.argv[3] : null;
  if (!out) { process.stderr.write('Usage: node tools/question-bank/export-package.mjs --out <new-directory>\n'); process.exit(2); }
  try {
    const result = await exportPackage(out);
    process.stdout.write(`Exported ${result.files} files to ${result.directory}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
