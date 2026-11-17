// Keep the supported-LaTeX lists in the standalone generation prompt equal to the Bank's real allowlist.
//   node tools/question-bank/sync-prompt.mjs           rewrite the lists in docs/question-bank/AI_QUESTION_GENERATION_PROMPT.md
//   node tools/question-bank/sync-prompt.mjs --check   fail when the prompt lists are out of date
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SUPPORTED_TEX_COMMANDS, SUPPORTED_TEX_ENVIRONMENTS } from '../../src/modules/bank/content-safety.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROMPT_PATH = path.join(ROOT, 'docs', 'question-bank', 'AI_QUESTION_GENERATION_PROMPT.md');
const NAMED = /^[A-Za-z]+$/;

export function texLists() {
  const commands = SUPPORTED_TEX_COMMANDS.filter((name) => NAMED.test(name)).map((name) => `\\${name}`);
  const environments = SUPPORTED_TEX_ENVIRONMENTS.map((name) => `\`${name}\``).join(', ');
  return { commands: commands.join(' '), environments };
}

/** Replace the text between a pair of marker comments. Throws when a marker pair is missing. */
export function fillMarkers(text, { commands, environments }) {
  const fill = (source, name, body, block) => {
    const open = `<!-- ${name}:start -->`;
    const close = `<!-- ${name}:end -->`;
    const start = source.indexOf(open);
    const end = source.indexOf(close);
    if (start < 0 || end < start) throw new Error(`Marker pair ${name} is missing from the prompt`);
    return `${source.slice(0, start + open.length)}${block ? `\n${body}\n` : body}${source.slice(end)}`;
  };
  return fill(fill(text, 'tex-commands', commands, true), 'tex-environments', environments, false);
}

export async function renderPrompt() {
  return fillMarkers(await readFile(PROMPT_PATH, 'utf8'), texLists());
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const rendered = await renderPrompt();
  if (process.argv.includes('--check')) {
    if (rendered !== await readFile(PROMPT_PATH, 'utf8')) {
      process.stderr.write('The LaTeX lists in AI_QUESTION_GENERATION_PROMPT.md are out of date; run: node tools/question-bank/sync-prompt.mjs\n');
      process.exitCode = 1;
    }
  } else {
    await writeFile(PROMPT_PATH, rendered);
    process.stdout.write('Updated the LaTeX lists in docs/question-bank/AI_QUESTION_GENERATION_PROMPT.md\n');
  }
}
