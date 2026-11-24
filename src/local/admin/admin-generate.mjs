// AI question generation for the admin page on the owner's computer (owner decisions 2026-11-22 and 2026-11-24). The admin asks one
// provider for one CREATE batch using the same instructions as the ChatGPT Projects: a coding-agent CLI already signed
// in on this computer (Codex, Claude Code or Antigravity, paid by the owner's subscription) or OpenAI with
// OPENAI_API_KEY. The reply is saved into the question inbox and goes through the normal inbox check, DRAFT import and
// owner publication. Nothing generated is published here.
import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
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
const AGENT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_AGENT_OUTPUT = 4 * 1024 * 1024;
// Linux refuses one command-line argument longer than 128 KiB; Antigravity takes its prompt as an argument.
const MAX_ARGUMENT_BYTES = 120 * 1024;

/**
 * Coding-agent CLIs that run one prompt without tools and print the answer. Each runs in an empty temporary directory.
 * `args(dir, prompt)` builds the argument list, `stdin` says whether the prompt is piped, `reply(dir, stdout)` reads the answer.
 */
export const AGENT_PROVIDERS = Object.freeze({
  codex: Object.freeze({ label: 'Codex', command: 'codex', stdin: true,
    args: (dir) => ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '-o', path.join(dir, 'reply.md'), '-'],
    reply: (dir) => readFile(path.join(dir, 'reply.md'), 'utf8') }),
  claude: Object.freeze({ label: 'Claude Code', command: 'claude', stdin: true,
    args: () => ['-p', '--tools', '', '--no-session-persistence', '--output-format', 'text'],
    reply: (dir, stdout) => stdout }),
  agy: Object.freeze({ label: 'Antigravity', command: 'agy', stdin: false,
    args: (dir, prompt) => ['--output-format', 'text', '--sandbox', `--print=${prompt}`],
    reply: (dir, stdout) => stdout }),
});
export const PROVIDERS = Object.freeze(['openai', ...Object.keys(AGENT_PROVIDERS)]);

/** The full path of a command on PATH, or null. */
async function onPath(command, env) {
  for (const directory of String(env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch { /* next directory */ }
  }
  return null;
}

/** Run one agent CLI with a prompt; resolves { exitCode, stdout, stderr, timedOut }. Never uses a shell. */
function runAgent(executable, args, { cwd, env, stdin = null, timeoutMs = AGENT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = { stdout: [], stderr: [] }, sizes = { stdout: 0, stderr: 0 };
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5_000).unref(); }, timeoutMs);
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', (chunk) => {
      if (sizes[stream] < MAX_AGENT_OUTPUT) { chunks[stream].push(chunk); sizes[stream] += chunk.length; }
    });
    child.on('error', () => { clearTimeout(timer); resolve({ exitCode: null, stdout: '', stderr: 'The command could not be started.', timedOut }); });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, timedOut, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin ?? '');
  });
}

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

const openAiConfigured = (env) => typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim() !== '';

/** Which providers can run here: OpenAI with a key, and each agent CLI found on PATH. */
export async function generationStatus(env = process.env) {
  const providers = [{ id: 'openai', label: `OpenAI API (${env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL})`, available: openAiConfigured(env) }];
  for (const [id, provider] of Object.entries(AGENT_PROVIDERS)) {
    providers.push({ id, label: `${provider.label} CLI`, available: (await onPath(provider.command, env)) !== null });
  }
  return { configured: providers.some((provider) => provider.available), model: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL, providers };
}

/** The reply text of one OpenAI chat completion, or { error }. */
async function askOpenAi({ system, message, env, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL, messages: [
        { role: 'system', content: system },
        { role: 'user', content: message },
      ] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { error: { ok: false, code: 'PROVIDER_UNREACHABLE' } };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // The provider's message names the problem (bad key, unknown model, quota); it never contains the key.
    return { error: { ok: false, code: 'PROVIDER_ERROR', status: response.status, message: String(body?.error?.message ?? '').slice(0, 500) } };
  }
  return { reply: body?.choices?.[0]?.message?.content };
}

/** The reply text of one agent CLI run, or { error }. The agent works in an empty temporary directory. */
async function askAgent({ id, system, message, env, run = runAgent }) {
  const provider = AGENT_PROVIDERS[id];
  const executable = await onPath(provider.command, env);
  if (!executable) return { error: { ok: false, code: 'PROVIDER_NOT_INSTALLED', message: `${provider.command} is not on PATH.` } };
  const prompt = [system, '===== Owner message =====', message,
    'Answer in this one reply. Do not create, edit or run files; the reply text itself is the deliverable.'].join('\n\n');
  if (!provider.stdin && Buffer.byteLength(prompt) > MAX_ARGUMENT_BYTES) return { error: { ok: false, code: 'PROMPT_TOO_LARGE' } };
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-ai-generate-'));
  try {
    const result = await run(executable, provider.args(directory, prompt), { cwd: directory, env, stdin: provider.stdin ? prompt : null });
    if (result.timedOut) return { error: { ok: false, code: 'PROVIDER_TIMEOUT', message: `${provider.label} did not finish in ${AGENT_TIMEOUT_MS / 60000} minutes.` } };
    if (result.exitCode !== 0) {
      return { error: { ok: false, code: 'PROVIDER_ERROR', status: result.exitCode,
        message: `${provider.label} stopped: ${(result.stderr || result.stdout).trim().slice(-500)}` } };
    }
    return { reply: await Promise.resolve(provider.reply(directory, result.stdout)).catch(() => '') };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Ask one provider for one CREATE batch and save the JSON into the inbox. Returns
 * { ok, file?, batchId?, questions?, problems?, report?, code? }. `fetchImpl` and `runAgentImpl` are injectable for tests.
 */
export async function generateQuestions({ section, topic = '', count = 10, provider = 'openai', inboxDirectory = path.join(ROOT, 'question-inbox'),
  env = process.env, fetchImpl = fetch, runAgentImpl = runAgent, now = new Date() } = {}) {
  if (!PROVIDERS.includes(provider)) return { ok: false, code: 'INVALID_PROVIDER' };
  if (provider === 'openai' && !openAiConfigured(env)) return { ok: false, code: 'NO_API_KEY' };
  if (!Object.hasOwn(INBOX_FOLDERS, section)) return { ok: false, code: 'INVALID_SECTION' };
  if (!Number.isSafeInteger(count) || count < 1 || count > 10) return { ok: false, code: 'INVALID_COUNT' };
  const cleanTopic = String(topic ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  const yymmdd = batchDate(now);
  const letter = nextBatchLetter(await inboxTexts(inboxDirectory, section), section, yymmdd);
  if (!letter) return { ok: false, code: 'NO_BATCH_LETTER' };

  const system = await systemPrompt(section);
  const message = createMessage({ topic: cleanTopic, count, letter, yymmdd });
  const answer = provider === 'openai' ? await askOpenAi({ system, message, env, fetchImpl })
    : await askAgent({ id: provider, system, message, env, run: runAgentImpl });
  if (answer.error) return answer.error;
  const reply = answer.reply;
  if (typeof reply !== 'string' || reply.trim() === '') return { ok: false, code: 'EMPTY_REPLY' };
  const extracted = extractJson(reply);
  const report = reply.split('```')[0].trim().slice(0, 4000);
  if (extracted.error) return { ok: false, code: 'NO_JSON', message: extracted.error, report };

  const validation = validateExchange(extracted.document);
  const batchId = typeof extracted.document?.batch_id === 'string' ? extracted.document.batch_id : `GPT-${section}-${yymmdd}-${letter}`;
  const directory = path.join(inboxDirectory, INBOX_FOLDERS[section]);
  await mkdir(directory, { recursive: true });
  const name = `${batchId.replace(/[^A-Za-z0-9-]+/g, '-')}-${provider}.json`;
  await writeFile(path.join(directory, name), `${JSON.stringify(extracted.document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return {
    ok: true, file: `${INBOX_FOLDERS[section]}/${name}`, batchId, provider,
    questions: Array.isArray(extracted.document?.questions) ? extracted.document.questions.length : 0,
    problems: validation.errors.map((issue) => `${issue.path || '(document)'}: [${issue.code}] ${issue.message}`).slice(0, 50),
    report,
  };
}
