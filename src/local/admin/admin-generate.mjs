// AI question generation for the local admin page (owner decision 2026-11-22). With OPENAI_API_KEY set, the admin asks
// OpenAI for one CREATE batch using the same instructions as the ChatGPT Projects; the reply is saved into the question
// inbox and goes through the normal inbox check, DRAFT import and owner publication. Nothing generated is published
// here. Without a key the page shows how to do the same with a ChatGPT Project in the browser.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJson } from '../../../scripts/questions-inbox.mjs';
import { validateExchange } from '../../../tools/question-bank/validate.mjs';
import { INBOX_FOLDERS } from './admin-jobs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GUIDE = path.join(ROOT, 'docs', 'guides', 'chatgpt-projects');
const BANK_DOCS = path.join(ROOT, 'docs', 'question-bank');
// REQUIRES_VERIFICATION: the default model name must exist for the owner's account; OPENAI_MODEL overrides it.
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const EXAMPLES = Object.freeze({
  MATH: ['single-choice.json', 'true-false-group.json', 'numeric.json', 'multiple-choice.json'],
  READING: ['single-choice.json', 'true-false-group.json', 'reading-passage.json'],
  SCIENCE: ['single-choice.json', 'true-false-group.json', 'reading-passage.json'],
});

/** yymmdd in Asia/Bangkok, the owner's time zone, as the batch ids use. Pure given `date`. */
export function batchDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: '2-digit', month: '2-digit', day: '2-digit' })
    .formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}`;
}

/** The first batch letter not yet used for this subject and day in any inbox text. Pure. */
export function nextBatchLetter(texts, section, yymmdd) {
  const used = new Set();
  const pattern = new RegExp(`GPT-${section}-${yymmdd}-([A-Z])\\b`, 'g');
  for (const text of texts) for (const match of String(text).matchAll(pattern)) used.add(match[1]);
  return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((letter) => !used.has(letter)) ?? null;
}

async function inboxTexts(inboxDirectory, section) {
  const texts = [];
  const folder = path.join(inboxDirectory, INBOX_FOLDERS[section]);
  for (const directory of [folder, path.join(folder, 'imported'), path.join(folder, 'rejected')]) {
    const names = await readdir(directory).catch(() => []);
    for (const name of names) if (/\.(json|txt|md)$/i.test(name)) texts.push(name, await readFile(path.join(directory, name), 'utf8').catch(() => ''));
  }
  return texts;
}

/** The system prompt: the Project instructions and the files a ChatGPT Project would hold for this subject. */
export async function systemPrompt(section) {
  const read = (file) => readFile(file, 'utf8');
  const parts = [
    ['Project instructions', await read(path.join(GUIDE, `INSTRUCTIONS_${section}.txt`))],
    ['AGENT.md', await read(path.join(GUIDE, 'AGENT.md'))],
    [`SUBJECT_${section}.md`, await read(path.join(GUIDE, `SUBJECT_${section}.md`))],
    ['AI_QUESTION_GENERATION_PROMPT.md', await read(path.join(BANK_DOCS, 'AI_QUESTION_GENERATION_PROMPT.md'))],
    ['question-set.schema.json', await read(path.join(BANK_DOCS, 'question-set.schema.json'))],
  ];
  for (const example of EXAMPLES[section]) parts.push([`examples/valid/${example}`, await read(path.join(BANK_DOCS, 'examples', 'valid', example))]);
  return parts.map(([title, text]) => `===== ${title} =====\n${text.trim()}`).join('\n\n');
}

/** The owner's CREATE message, as typed in a ChatGPT Project chat. Pure. */
export function createMessage({ topic, count, letter, yymmdd }) {
  return [`CREATE · topic ${topic || 'any topic of the subject'} · ${count} questions · default 4/3/3 mix · batch letter ${letter}`,
    `Today is ${yymmdd} (yymmdd). Web search is not available in this conversation: rely on what you know of the public TSA style,`,
    'and still write only original questions. Reply with the short report and exactly one ```json code block.'].join('\n');
}

export function generationStatus(env = process.env) {
  return { configured: typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim() !== '',
    model: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL };
}

/**
 * Ask OpenAI for one CREATE batch and save the JSON into the inbox. Returns
 * { ok, file?, batchId?, questions?, problems?, report?, code? }. `fetchImpl` is injectable for tests.
 */
export async function generateQuestions({ section, topic = '', count = 10, inboxDirectory = path.join(ROOT, 'question-inbox'),
  env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const status = generationStatus(env);
  if (!status.configured) return { ok: false, code: 'NO_API_KEY' };
  if (!Object.hasOwn(INBOX_FOLDERS, section)) return { ok: false, code: 'INVALID_SECTION' };
  if (!Number.isSafeInteger(count) || count < 1 || count > 10) return { ok: false, code: 'INVALID_COUNT' };
  const cleanTopic = String(topic ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  const yymmdd = batchDate(now);
  const letter = nextBatchLetter(await inboxTexts(inboxDirectory, section), section, yymmdd);
  if (!letter) return { ok: false, code: 'NO_BATCH_LETTER' };

  let response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: status.model, messages: [
        { role: 'system', content: await systemPrompt(section) },
        { role: 'user', content: createMessage({ topic: cleanTopic, count, letter, yymmdd }) },
      ] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, code: 'PROVIDER_UNREACHABLE' };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // The provider's message names the problem (bad key, unknown model, quota); it never contains the key.
    return { ok: false, code: 'PROVIDER_ERROR', status: response.status, message: String(body?.error?.message ?? '').slice(0, 500) };
  }
  const reply = body?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || reply.trim() === '') return { ok: false, code: 'EMPTY_REPLY' };
  const extracted = extractJson(reply);
  const report = reply.split('```')[0].trim().slice(0, 4000);
  if (extracted.error) return { ok: false, code: 'NO_JSON', message: extracted.error, report };

  const validation = validateExchange(extracted.document);
  const batchId = typeof extracted.document?.batch_id === 'string' ? extracted.document.batch_id : `GPT-${section}-${yymmdd}-${letter}`;
  const directory = path.join(inboxDirectory, INBOX_FOLDERS[section]);
  await mkdir(directory, { recursive: true });
  const name = `${batchId.replace(/[^A-Za-z0-9-]+/g, '-')}-openai.json`;
  await writeFile(path.join(directory, name), `${JSON.stringify(extracted.document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return {
    ok: true, file: `${INBOX_FOLDERS[section]}/${name}`, batchId, model: status.model,
    questions: Array.isArray(extracted.document?.questions) ? extracted.document.questions.length : 0,
    problems: validation.errors.map((issue) => `${issue.path || '(document)'}: [${issue.code}] ${issue.message}`).slice(0, 50),
    report,
  };
}
