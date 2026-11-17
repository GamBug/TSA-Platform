// Write (or check) the JSON Schema of the question exchange format. The Zod definitions in
// packages/contracts/src/question-exchange.ts are the only source; this file is derived from them.
//   node tools/question-bank/generate-schema.mjs           rewrite docs/question-bank/question-set.schema.json
//   node tools/question-bank/generate-schema.mjs --check   fail when the committed schema is out of date
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { QUESTION_SET_FORMAT, questionSetJsonSchema } from '../../packages/contracts/dist/question-exchange.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEMA_PATH = path.join(ROOT, 'docs', 'question-bank', 'question-set.schema.json');

export function renderSchema() {
  const schema = {
    $id: `https://tsa-platform.invalid/schemas/${QUESTION_SET_FORMAT.replace('/', '-')}.json`,
    title: 'TSA question set (tsa-question-set/1)',
    description: 'A batch of DRAFT practice questions. Structural rules only: the validator also checks that answers refer to existing options, image references match, and ids are unique.',
    ...questionSetJsonSchema(),
  };
  return `${JSON.stringify(schema, null, 2)}\n`;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const rendered = renderSchema();
  if (process.argv.includes('--check')) {
    const current = await readFile(SCHEMA_PATH, 'utf8').catch(() => '');
    if (current !== rendered) {
      process.stderr.write('docs/question-bank/question-set.schema.json is out of date; run: node tools/question-bank/generate-schema.mjs\n');
      process.exitCode = 1;
    }
  } else {
    await writeFile(SCHEMA_PATH, rendered);
    process.stdout.write(`Wrote ${path.relative(ROOT, SCHEMA_PATH)}\n`);
  }
}
