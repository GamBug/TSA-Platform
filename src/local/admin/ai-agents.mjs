// Coding-agent CLIs (and the optional OpenAI API) as writers and reviewers for the AI studio on the owner's computer.
// Each run happens in its own temporary folder with no shell between us and the CLI: the prompt goes in on stdin (or a
// PROMPT.md file for Antigravity), attachments are copied into attachments/, and an agent allowed to draw saves PNG
// figures into figures/. Web search is the agent's own tool. Secrets of the demo are removed from the environment.
import { spawn } from 'node:child_process';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

export const AGENT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_OUTPUT = 8 * 1024 * 1024;
const CATALOG_TTL_MS = 10 * 60 * 1000;
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const SECRET_ENV = Object.freeze(['DEMO_ADMIN_PASSWORD', 'OPENAI_API_KEY', 'TRACK_B_DATA_DIRECTORY', 'PGPASSWORD']);

export const PROVIDER_LABELS = Object.freeze({ claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity', openai: 'OpenAI API' });
const COMMANDS = Object.freeze({ claude: 'claude', codex: 'codex', agy: 'agy' });

/** The full path of a command on PATH, or null. */
export async function onPath(command, env) {
  for (const directory of String(env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch { /* next directory */ }
  }
  return null;
}

/** The environment an agent CLI gets: the owner's, minus the demo's secrets. Pure. */
export function agentEnv(env) {
  const copy = { ...env };
  for (const name of SECRET_ENV) delete copy[name];
  return copy;
}

// Agent processes still running; they are stopped when the demo exits, so none is left behind.
const active = new Set();
let exitHookInstalled = false;
function stopAllOnExit() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  const stopAll = () => { for (const child of active) child.kill('SIGTERM'); };
  process.once('exit', stopAll);
  // Only stop agents here; the demo's own signal handler (when it has one) still decides how the demo stops.
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stopAll(); if (process.listenerCount(signal) === 0) process.kill(process.pid, signal); });
}

/** Run one command with stdin; resolves { exitCode, stdout, stderr, timedOut, aborted }. Never uses a shell. */
export function runProcess(executable, args, { cwd, env, stdin = null, timeoutMs = AGENT_TIMEOUT_MS, signal = null }) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    stopAllOnExit();
    active.add(child);
    const chunks = { stdout: [], stderr: [] }, sizes = { stdout: 0, stderr: 0 };
    let timedOut = false, aborted = false;
    const stop = () => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5_000).unref(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const onAbort = () => { aborted = true; stop(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', (chunk) => {
      if (sizes[stream] < MAX_OUTPUT) { chunks[stream].push(chunk); sizes[stream] += chunk.length; }
    });
    const finish = (exitCode) => {
      active.delete(child);
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      resolve({ exitCode, timedOut, aborted, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') });
    };
    child.on('error', () => { chunks.stderr = [Buffer.from('The command could not be started.')]; finish(null); });
    child.on('close', finish);
    child.stdin.on('error', () => {});
    child.stdin.end(stdin ?? '');
    if (signal?.aborted) onAbort();
  });
}

/** Model lists read from each CLI, cached; a CLI that cannot list models gets the default only. */
const catalogCache = new Map();
async function cached(key, load) {
  const hit = catalogCache.get(key);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.value;
  const value = await load().catch(() => null);
  catalogCache.set(key, { at: Date.now(), value });
  return value;
}

/** Codex models from `codex debug models` (JSON). Pure. */
export function parseCodexModels(text) {
  const start = text.indexOf('{');
  if (start === -1) return [];
  const data = JSON.parse(text.slice(start));
  return (data.models ?? []).filter((model) => model.visibility === 'list' && typeof model.slug === 'string').map((model) => ({
    id: model.slug, label: model.display_name ?? model.slug,
    efforts: (model.supported_reasoning_levels ?? []).map((level) => level.effort).filter((effort) => EFFORTS.includes(effort)),
  }));
}

/** Antigravity models from `agy models` ("id<TAB>label" lines). Pure. */
export function parseAgyModels(text) {
  return String(text).split('\n').map((line) => line.split('\t')).filter((parts) => parts.length >= 2 && /^[a-z0-9][a-z0-9.-]+$/i.test(parts[0].trim()))
    .map(([id, label]) => ({ id: id.trim(), label: label.trim(), efforts: [] }));
}

const CLAUDE_MODELS = Object.freeze([
  { id: 'opus', label: 'Opus (latest)', efforts: EFFORTS }, { id: 'sonnet', label: 'Sonnet (latest)', efforts: EFFORTS },
  { id: 'fable', label: 'Fable (latest)', efforts: EFFORTS }, { id: 'haiku', label: 'Haiku (latest)', efforts: EFFORTS },
]);

/** Can Claude Code run Bash in its own sandbox here (bubblewrap and socat on Linux)? Without it Claude gets no shell. */
async function claudeSandboxReady(env) {
  return process.platform === 'linux' ? (await onPath('bwrap', env)) !== null && (await onPath('socat', env)) !== null : process.platform === 'darwin';
}

/**
 * Which writers and reviewers can run here, with their models, efforts and abilities. `run` is injectable for tests.
 * Each provider: { id, label, available, models: [{ id, label, efforts }], abilities: { images, files, web, figures }, note }.
 */
export async function agentCatalog(env = process.env, { run = runProcess } = {}) {
  const clean = agentEnv(env);
  const providers = [];
  for (const id of ['claude', 'codex', 'agy']) {
    const executable = await onPath(COMMANDS[id], env);
    const entry = { id, label: PROVIDER_LABELS[id], available: executable !== null, models: [], abilities: { images: true, files: true, web: true, figures: true }, note: null };
    if (executable) {
      if (id === 'claude') {
        entry.models = CLAUDE_MODELS.map((model) => ({ ...model, efforts: [...model.efforts] }));
        if (!(await claudeSandboxReady(env))) {
          entry.abilities.figures = false;
          entry.note = 'Claude Code draws figures only inside its sandbox, which needs bubblewrap and socat (sudo apt install bubblewrap socat). Until then another agent draws the figures.';
        }
      } else if (id === 'codex') {
        entry.models = await cached(`codex:${executable}`, async () => parseCodexModels((await run(executable, ['debug', 'models'], { cwd: path.dirname(executable), env: clean, timeoutMs: 30_000 })).stdout)) ?? [];
      } else {
        entry.models = await cached(`agy:${executable}`, async () => parseAgyModels((await run(executable, ['models'], { cwd: path.dirname(executable), env: clean, timeoutMs: 30_000 })).stdout)) ?? [];
        entry.models.forEach((model) => { model.efforts = [...EFFORTS]; });
      }
    }
    providers.push(entry);
  }
  const key = typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim() !== '';
  const openAiModel = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  providers.push({ id: 'openai', label: PROVIDER_LABELS.openai, available: key, models: [{ id: openAiModel, label: openAiModel, efforts: [] }],
    abilities: { images: true, files: false, web: false, figures: false }, note: key ? 'No web search and no figure drawing through the API.' : 'Set OPENAI_API_KEY to use it.' });
  return providers;
}

/** A plain-language reason for a failed agent run, from its exit and output. Pure. */
export function explainFailure(provider, result, timeoutMs = AGENT_TIMEOUT_MS) {
  const label = PROVIDER_LABELS[provider] ?? provider;
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  if (result.aborted) return { kind: 'STOPPED', retry: false, message: 'Stopped.' };
  if (result.timedOut) return { kind: 'TIMEOUT', retry: true, message: `${label} did not finish in ${Math.round(timeoutMs / 60000)} minutes.` };
  if (result.exitCode === null && /could not be started/.test(text)) return { kind: 'NOT_INSTALLED', retry: false, message: `${label} could not be started. Is it installed?` };
  if (/not (logged|signed) in|log ?in again|please (log|sign) ?in|auth(entication)? (failed|required|expired)|unauthori[sz]ed|invalid api key|\b401\b|token (has )?expired/i.test(text)) {
    const how = { claude: 'claude auth login', codex: 'codex login', agy: 'agy (then sign in)' }[provider];
    return { kind: 'SIGNED_OUT', retry: false, message: `${label} is not signed in on this computer.${how ? ` Open a terminal and run: ${how}` : ''}` };
  }
  if (/usage limit|rate.?limit|quota|too many requests|\b429\b|limit reached|out of credits/i.test(text)) {
    return { kind: 'LIMIT', retry: false, message: `${label} has reached its usage limit for now. Choose another agent, or try again later.` };
  }
  if (/overloaded|\b5\d\d\b|temporarily unavailable|network|ECONNRESET|ETIMEDOUT|socket hang up/i.test(text)) {
    return { kind: 'BUSY', retry: true, message: `${label} is busy or the network dropped.` };
  }
  const tail = text.trim().split('\n').filter((line) => line.trim() && !/^(hook:|warning:)/i.test(line.trim())).slice(-3).join(' ').slice(0, 300);
  return { kind: 'FAILED', retry: true, message: `${label} stopped without an answer${tail ? `: ${tail}` : '.'}` };
}

const imageFiles = (attachments) => attachments.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()));

/** The argument list for one CLI run. Pure. */
export function agentArgs(provider, { model = null, effort = null, web = true, figures = false, images = [], replyFile = null, settings = null } = {}) {
  if (provider === 'codex') {
    return ['exec', '--skip-git-repo-check', '--sandbox', figures ? 'workspace-write' : 'read-only', '--ephemeral', '--color', 'never',
      ...(model ? ['-m', model] : []), ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []),
      '-c', `web_search="${web ? 'live' : 'disabled'}"`, ...images.flatMap((image) => ['-i', image]), '-o', replyFile, '-'];
  }
  if (provider === 'claude') {
    const tools = ['Read', 'Glob', ...(web ? ['WebSearch', 'WebFetch'] : []), ...(figures ? ['Bash', 'Write'] : [])];
    return ['-p', '--no-session-persistence', '--output-format', 'text', ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : []),
      '--tools', tools.join(','), '--allowedTools', tools.join(','), ...(figures && settings ? ['--settings', settings] : [])];
  }
  if (provider === 'agy') {
    return ['--output-format', 'text', '--sandbox', ...(figures ? ['--mode', 'accept-edits'] : []), ...(model ? ['--model', model] : []),
      ...(effort ? ['--effort', effort] : []), '--print=Read the file PROMPT.md in the current working directory and do exactly what it asks. Your final reply text is the deliverable.'];
  }
  throw new TypeError(`Unknown agent ${provider}`);
}

// Claude Code runs Bash only inside its sandbox: writes stay in the run folder and commands cannot leave it.
const CLAUDE_SANDBOX = JSON.stringify({ sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false } });

/** PNG/JPEG/WebP files the agent saved into figures/, by file name. */
export async function collectFigures(directory) {
  const names = await readdir(path.join(directory, 'figures')).catch(() => []);
  return names.filter((name) => /\.(png|jpe?g|webp)$/i.test(name)).map((name) => path.join(directory, 'figures', name));
}

async function askOpenAi({ prompt, attachments, model, env, fetchImpl, signal }) {
  const parts = [{ type: 'text', text: prompt }];
  for (const file of imageFiles(attachments)) {
    const extension = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
    parts.push({ type: 'image_url', image_url: { url: `data:image/${extension};base64,${(await readFile(file)).toString('base64')}` } });
  }
  let response;
  try {
    response = await fetchImpl(OPENAI_URL, { method: 'POST', signal: signal ?? AbortSignal.timeout(AGENT_TIMEOUT_MS),
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: parts }] }) });
  } catch (error) {
    return { ok: false, error: signal?.aborted ? { kind: 'STOPPED', retry: false, message: 'Stopped.' } : { kind: 'BUSY', retry: true, message: 'OpenAI could not be reached.' } };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: explainFailure('openai', { exitCode: response.status, stderr: `${response.status} ${String(body?.error?.message ?? '')}` }) };
  }
  return { ok: true, text: String(body?.choices?.[0]?.message?.content ?? '') };
}

/**
 * One agent run in `directory` (already holding attachments/ and an empty figures/). Resolves { ok, text, figures } or
 * { ok: false, error: { kind, retry, message } }. `run` and `fetchImpl` are injectable for tests.
 */
export async function runAgentTask({ provider, model = null, effort = null, prompt, directory, attachments = [], web = true, figures = false,
  env = process.env, signal = null, timeoutMs = AGENT_TIMEOUT_MS, run = runProcess, fetchImpl = fetch }) {
  if (provider === 'openai') {
    if (!(typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.trim())) return { ok: false, error: { kind: 'NOT_INSTALLED', retry: false, message: 'OpenAI needs OPENAI_API_KEY.' } };
    const answer = await askOpenAi({ prompt, attachments, model: model || env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL, env, fetchImpl, signal });
    return answer.ok ? { ...answer, figures: [] } : answer;
  }
  if (!COMMANDS[provider]) return { ok: false, error: { kind: 'NOT_INSTALLED', retry: false, message: 'Unknown agent.' } };
  const executable = await onPath(COMMANDS[provider], env);
  if (!executable) return { ok: false, error: { kind: 'NOT_INSTALLED', retry: false, message: `${PROVIDER_LABELS[provider]} (${COMMANDS[provider]}) is not installed on this computer.` } };
  const replyFile = path.join(directory, '.reply.md');
  const relative = (file) => path.relative(directory, file);
  const args = agentArgs(provider, { model, effort, web, figures, replyFile, images: imageFiles(attachments).map(relative), settings: CLAUDE_SANDBOX });
  if (provider === 'agy') await writeFile(path.join(directory, 'PROMPT.md'), prompt, 'utf8');
  const result = await run(executable, args, { cwd: directory, env: agentEnv(env), stdin: provider === 'agy' ? null : prompt, timeoutMs, signal });
  if (result.exitCode !== 0 || result.timedOut || result.aborted) return { ok: false, error: explainFailure(provider, result, timeoutMs) };
  const text = provider === 'codex' ? await readFile(replyFile, 'utf8').catch(() => '') : result.stdout;
  if (!text.trim()) return { ok: false, error: { kind: 'EMPTY', retry: true, message: `${PROVIDER_LABELS[provider]} finished without an answer.` } };
  return { ok: true, text, figures: await collectFigures(directory) };
}
