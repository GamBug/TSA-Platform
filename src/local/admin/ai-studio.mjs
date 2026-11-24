// The AI studio of the local admin page (owner request 2026-11-24): a chat in which the owner asks a writer agent for
// TSA questions, attaching pictures, PDFs or text when needed. Each batch the writer returns is normalised, validated,
// checked against the Bank as a dry run, sent back to the writer with every problem (up to `maxRounds` times), then
// reviewed by a second agent that solves each question blind. Questions that still fail are dropped. A ready batch is
// imported as DRAFTs and published (exactly its own versions, whole passages only) when the owner presses Publish, or
// at once when the session's auto-publish switch is on (owner decision 2026-11-24, off by default).
// Sessions live in `rootDirectory` (.local/ai-studio): one folder per chat with session.json, attachments and batches.
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJson, chatGptFixMessage } from '../../../scripts/questions-inbox.mjs';
import { validateExchange } from '../../../tools/question-bank/validate.mjs';
import { imageRequests, parseFigureName } from '../inbox-figures.mjs';
import { batchDate } from './admin-generate.mjs';
import { INBOX_FOLDERS } from './admin-jobs.mjs';
import { agentCatalog, PROVIDER_LABELS, runAgentTask, runProcess } from './ai-agents.mjs';
import { parseReview, questionHash, reviewerPrompt, reviewFixMessage, reviewSubset } from './ai-review.mjs';
import { blocksToText, questionText, selectBankExamples } from './bank-examples.mjs';
import { batchIds, dropQuestions, looksTranscribed, normalizeExchange } from './exchange-normalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GUIDE = path.join(ROOT, 'docs', 'guides');
const BANK_DOCS = path.join(ROOT, 'docs', 'question-bank');
export const SECTIONS = Object.freeze(['MATH', 'READING', 'SCIENCE']);
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
// The prototype server accepts at most 36 MiB per request; base64 makes 24 MiB of files about 32 MiB.
export const MAX_MESSAGE_BYTES = 24 * 1024 * 1024;
const ATTACHMENT_TYPES = Object.freeze({ '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image',
  '.pdf': 'pdf', '.txt': 'text', '.md': 'text', '.csv': 'text', '.json': 'text' });
const STUDENT_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP']);
const EXAMPLE_FILES = Object.freeze(['single-choice.json', 'multiple-choice.json', 'true-false-group.json', 'reading-passage.json', 'image-needed.json']);
const HISTORY_MESSAGES = 12;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const nowIso = (now) => now().toISOString();
const safeName = (name) => path.basename(String(name ?? '')).normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[.-]+/, '').slice(0, 80) || 'file';
const failure = (message, extra = {}) => Object.assign(new Error(message), extra);

/** A readable name of a writer or reviewer setting. Pure. */
export const agentLabel = (agent) => (agent ? `${PROVIDER_LABELS[agent.provider] ?? agent.provider}${agent.model ? ` · ${agent.model}` : ''}${agent.effort ? ` · ${agent.effort}` : ''}` : 'none');

/** The first free batch letter of one subject and day across every text given (GPT- and SRC- batches). Pure. */
export function freeBatchLetter(texts, section, yymmdd, reserved = new Set()) {
  const used = new Set(reserved);
  const pattern = new RegExp(`(?:GPT|SRC)-${section}-${yymmdd}-([A-Z])(?![A-Za-z0-9])`, 'g');
  for (const text of texts) for (const match of String(text).matchAll(pattern)) used.add(match[1]);
  return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((letter) => !used.has(letter)) ?? null;
}

/** Problems the platform finds without the Bank: schema, student-supported types, figures. Pure. */
export function localProblems(document, figureKeys) {
  const problems = [];
  const questions = Array.isArray(document?.questions) ? document.questions : [];
  const idAt = (issuePath) => { const match = /^questions\[(\d+)\]/.exec(issuePath ?? ''); return match ? questions[Number(match[1])]?.question_id ?? null : null; };
  for (const issue of validateExchange(document).errors) problems.push({ questionId: idAt(issue.path), code: issue.code, message: `${issue.path || '(document)'}: ${issue.message}` });
  if (questions.length === 0) problems.push({ questionId: null, code: 'NO_QUESTIONS', message: 'The batch has no questions.' });
  for (const question of questions) {
    if (!STUDENT_TYPES.has(question?.question_type)) {
      problems.push({ questionId: question?.question_id ?? null, code: 'TYPE_NOT_SERVED', message: `question_type ${question?.question_type} is not answered on the student page; use SINGLE_CHOICE, MULTIPLE_CHOICE or TRUE_FALSE_GROUP` });
    }
  }
  const missing = imageRequests(document).filter((request) => !figureKeys.has(request.key));
  return { problems, missing };
}

function byQuestion(problems) {
  const map = new Map();
  for (const problem of problems) { const key = problem.questionId ?? null; if (!map.has(key)) map.set(key, []); map.get(key).push(problem); }
  return map;
}

/** Question ids owned by the given question or passage ids (a passage problem takes all its questions). Pure. */
function idsOwning(document, ownerIds) {
  const owners = new Set(ownerIds);
  return (document.questions ?? []).filter((question) => owners.has(question.question_id) || (question.passage_ref && owners.has(question.passage_ref))).map((question) => question.question_id);
}

function questionRows(document, reviews) {
  return (document.questions ?? []).map((question) => ({
    id: question.question_id, type: question.question_type, difficulty: question.difficulty ?? null, topic: question.topic ?? null,
    passageRef: question.passage_ref ?? null, preview: blocksToText(question.content_blocks ?? []).slice(0, 240),
    review: reviews.get(question.question_id) ?? null,
  }));
}

function groupByPassage(items, keyOf) {
  const groups = new Map();
  for (const item of items) { const key = keyOf(item); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  return [...groups.values()];
}

/**
 * The studio for one admin page. `jobs` are the admin jobs of the retained Bank, `getSnapshot` the current Bank
 * snapshot. `run`, `fetchImpl` and `now` are injectable for tests.
 */
export function createAiStudio({ rootDirectory, inboxDirectory, jobs, getSnapshot, env = process.env, run = runProcess, fetchImpl = fetch,
  now = () => new Date(), maxRounds = 3 }) {
  const sessionsDirectory = path.join(rootDirectory, 'sessions');
  const reviewsFile = path.join(rootDirectory, 'reviews.json');
  const sessions = new Map();
  const controllers = new Map();
  const running = new Map();
  const reservedLetters = new Set();
  let reviewStore = {};
  let catalogCache = null;

  const loaded = (async () => {
    await mkdir(sessionsDirectory, { recursive: true });
    reviewStore = await readFile(reviewsFile, 'utf8').then(JSON.parse, () => ({}));
    for (const id of await readdir(sessionsDirectory).catch(() => [])) {
      if (!ID.test(id)) continue;
      const session = await readFile(path.join(sessionsDirectory, id, 'session.json'), 'utf8').then(JSON.parse, () => null);
      if (!session) continue;
      if (session.turn) {
        session.messages.push({ id: randomUUID(), role: 'notice', at: nowIso(now), tone: 'error', text: 'The demo restarted while this was running. Press Retry to run it again.', actions: ['retry'] });
        session.turn = null;
      }
      sessions.set(id, session);
    }
  })();

  async function save(session) {
    session.updatedAt = nowIso(now);
    const directory = path.join(sessionsDirectory, session.id);
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.session-${randomUUID()}.json`);
    await writeFile(temporary, JSON.stringify(session), 'utf8');
    await rename(temporary, path.join(directory, 'session.json'));
  }

  async function saveReviews(entries) {
    Object.assign(reviewStore, entries);
    await writeFile(reviewsFile, JSON.stringify(reviewStore), 'utf8');
  }

  async function catalog({ fresh = false } = {}) {
    if (!fresh && catalogCache && Date.now() - catalogCache.at < 60_000) return catalogCache.value;
    const value = await agentCatalog(env, { run });
    catalogCache = { at: Date.now(), value };
    return value;
  }
  const provider = async (id) => (await catalog()).find((entry) => entry.id === id) ?? null;

  /** Default writer and reviewer: the first available agents, the reviewer different from the writer. */
  async function defaults(section = 'MATH') {
    const available = (await catalog()).filter((entry) => entry.available);
    const ranked = ['claude', 'codex', 'agy', 'openai'].map((id) => available.find((entry) => entry.id === id)).filter(Boolean);
    const writer = ranked[0] ?? null;
    const reviewer = ranked.find((entry) => entry.id !== writer?.id) ?? writer;
    const agent = (entry) => (entry ? { provider: entry.id, model: '', effort: '' } : null);
    return { section, writer: agent(writer), reviewer: agent(reviewer), web: true, bankExamples: true, autoPublish: false };
  }

  /** Validated settings, merged over the current ones. Throws a TypeError with a readable message. */
  async function cleanSettings(input, current) {
    const merged = { ...current, ...(input && typeof input === 'object' ? input : {}) };
    if (!SECTIONS.includes(merged.section)) throw new TypeError('Choose Math, Reading or Science.');
    const entries = await catalog();
    const agent = (value, role) => {
      if (!value && role === 'reviewer') return null;
      const entry = entries.find((item) => item.id === value?.provider);
      if (!entry) throw new TypeError(`Choose a ${role}. No AI agent was found on this computer: install and sign in to Claude Code, Codex or Antigravity.`);
      const model = typeof value.model === 'string' ? value.model.trim().slice(0, 80) : '';
      if (model && !/^[A-Za-z0-9._:/-]+$/.test(model)) throw new TypeError('That model name is not valid.');
      const effort = typeof value.effort === 'string' && ['low', 'medium', 'high', 'xhigh', 'max'].includes(value.effort) ? value.effort : '';
      return { provider: entry.id, model, effort };
    };
    return { section: merged.section, writer: agent(merged.writer, 'writer'), reviewer: agent(merged.reviewer ?? null, 'reviewer'),
      web: merged.web !== false, bankExamples: merged.bankExamples !== false, autoPublish: merged.autoPublish === true };
  }

  const view = (session) => ({ id: session.id, title: session.title, createdAt: session.createdAt, updatedAt: session.updatedAt, settings: session.settings,
    turn: session.turn, messages: session.messages });
  const summaryOf = (session) => ({ id: session.id, title: session.title, section: session.settings.section, updatedAt: session.updatedAt,
    working: session.turn !== null, messages: session.messages.length });

  function getSession(id) {
    const session = ID.test(id ?? '') ? sessions.get(id) : null;
    if (!session) throw failure('That chat no longer exists.', { code: 'NOT_FOUND' });
    return session;
  }

  function progress(session, stage, note) {
    if (!session.turn) return;
    session.turn.stage = stage; session.turn.note = note;
    session.turn.steps = [...(session.turn.steps ?? []), { at: nowIso(now), stage, note }].slice(-40);
    save(session).catch(() => {});
  }

  // ------------------------------------------------------------------ attachments

  async function storeAttachments(session, messageId, attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return [];
    if (attachments.length > MAX_ATTACHMENTS) throw new TypeError(`Attach at most ${MAX_ATTACHMENTS} files at once.`);
    const directory = path.join(sessionsDirectory, session.id, 'attachments', messageId);
    await mkdir(directory, { recursive: true });
    const stored = [], names = new Set();
    let total = 0;
    for (const attachment of attachments) {
      let name = safeName(attachment?.name);
      const kind = ATTACHMENT_TYPES[path.extname(name).toLowerCase()];
      if (!kind) throw new TypeError(`${name}: attach pictures (PNG, JPEG, WebP, GIF), PDFs or text files (.txt, .md, .csv, .json).`);
      const bytes = Buffer.from(String(attachment?.base64 ?? ''), 'base64');
      if (bytes.byteLength === 0) throw new TypeError(`${name} is empty.`);
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new TypeError(`${name} is larger than 20 MB.`);
      total += bytes.byteLength;
      if (total > MAX_MESSAGE_BYTES) throw new TypeError('Attach at most 24 MB in one message; send the rest in the next one.');
      for (let index = 2; names.has(name); index += 1) name = name.replace(/(\.[^.]+)$/, `-${index}$1`);
      names.add(name);
      await writeFile(path.join(directory, name), bytes);
      stored.push({ name, kind, bytes: bytes.byteLength });
    }
    return stored;
  }

  /** Copy the chat's attachments (latest first, at most MAX_ATTACHMENTS) into a run folder; returns their paths there. */
  async function copyAttachments(session, directory) {
    const target = path.join(directory, 'attachments');
    await mkdir(target, { recursive: true });
    const files = [];
    const messages = session.messages.filter((message) => message.role === 'user' && message.attachments?.length).reverse();
    for (const message of messages) {
      for (const attachment of message.attachments) {
        if (files.length >= MAX_ATTACHMENTS) break;
        const name = files.some((file) => path.basename(file) === attachment.name) ? `${message.id.slice(0, 4)}-${attachment.name}` : attachment.name;
        await copyFile(path.join(sessionsDirectory, session.id, 'attachments', message.id, attachment.name), path.join(target, name));
        files.push(path.join(target, name));
      }
    }
    return files;
  }

  // ------------------------------------------------------------------ prompts

  async function writerPrompt(session, { message, ids, pending, canDraw, attachments, examples, fix = null, current = null }) {
    const read = (file) => readFile(file, 'utf8');
    const section = session.settings.section;
    const parts = [
      ['Studio instructions (WRITER.md)', await read(path.join(GUIDE, 'ai-studio', 'WRITER.md'))],
      ['AGENT.md', await read(path.join(GUIDE, 'chatgpt-projects', 'AGENT.md'))],
      [`SUBJECT_${section}.md`, await read(path.join(GUIDE, 'chatgpt-projects', `SUBJECT_${section}.md`))],
      ['AI_QUESTION_GENERATION_PROMPT.md', await read(path.join(BANK_DOCS, 'AI_QUESTION_GENERATION_PROMPT.md'))],
      ['question-set.schema.json', await read(path.join(BANK_DOCS, 'question-set.schema.json'))],
    ];
    for (const example of EXAMPLE_FILES) parts.push([`examples/valid/${example}`, await read(path.join(BANK_DOCS, 'examples', 'valid', example))]);
    if (examples?.text) parts.push([`Bank examples (${examples.count} real ${section} questions from the platform's Bank: match their level and style, never copy them)`, examples.text]);
    parts.push(['This batch', [
      `Today: ${nowIso(now).slice(0, 10)} (yymmdd ${batchDate(now())}). Subject: ${section}.`,
      `New questions: batch_id ${ids.create.batchId}; question ids ${ids.create.questionPrefix}000001 up; passage ids ${ids.create.passagePrefix}000001 up.`,
      `Transcription of the owner's material: batch_id ${ids.transcribe.batchId}; question ids ${ids.transcribe.questionPrefix}000001 up; passage ids ${ids.transcribe.passagePrefix}000001 up.`,
      pending ? `The current unsaved batch is ${pending.batchId}. To change it, send it again with batch_id ${pending.batchId} and the same ids.` : '',
      session.settings.web ? 'Web search: available. Use it for TSA style and to check facts.' : 'Web search: off for this chat.',
      canDraw ? 'Figures: you can run python3 in this folder. Save each figure as figures/<question_or_passage_id>_<request_id>.png.'
        : 'Figures: you cannot run code here. Add image_request blocks with precise descriptions; another agent draws them.',
      attachments.length ? `Attachments (open them): ${attachments.map((file) => `attachments/${path.basename(file)}`).join(', ')}` : 'No attachments.',
    ].filter(Boolean).join('\n')]);
    if (!fix) {
      const history = session.messages.filter((item) => item.role === 'user' || item.role === 'assistant').slice(0, -1).slice(-HISTORY_MESSAGES);
      if (history.length) {
        parts.push(['Conversation so far', history.map((item) => {
          if (item.role === 'user') return `OWNER: ${item.text}${item.attachments?.length ? ` [attached: ${item.attachments.map((file) => file.name).join(', ')}]` : ''}`;
          const batch = item.batch ? ` [batch ${item.batch.batchId}: ${item.batch.questions.length} question(s), ${item.batch.status.toLowerCase()}]` : '';
          return `YOU: ${String(item.text ?? '').slice(0, 3000)}${batch}`;
        }).join('\n\n')]);
      }
      if (pending) parts.push([`Current unsaved batch ${pending.batchId} (JSON)`, JSON.stringify(pending.document)]);
      parts.push(["Owner's new message", message]);
    } else {
      parts.push(["Owner's request for this batch", message]);
      parts.push(['Your current batch (JSON)', JSON.stringify(current)]);
      parts.push(['Message from the platform', fix]);
    }
    return parts.map(([title, text]) => `===== ${title} =====\n${String(text).trim()}`).join('\n\n');
  }

  // ------------------------------------------------------------------ agent calls

  /** Run one agent, retrying once on a passing failure. */
  async function callAgent(agent, { prompt, directory, attachments, figures, signal }) {
    const entry = await provider(agent.provider);
    const task = () => runAgentTask({ provider: agent.provider, model: agent.model || null, effort: agent.effort || null, prompt, directory,
      attachments, web: entry?.abilities.web !== false, figures: figures && entry?.abilities.figures === true, env, signal, run, fetchImpl });
    const first = await task();
    if (first.ok || !first.error.retry || signal?.aborted) return first;
    return task();
  }

  /** The agent that draws missing figures: the writer when it can, else the first available agent that can. */
  async function figureAgent(writer) {
    const entries = (await catalog()).filter((entry) => entry.available && entry.abilities.figures);
    if (entries.some((entry) => entry.id === writer.provider)) return writer;
    const entry = ['codex', 'agy', 'claude'].map((id) => entries.find((item) => item.id === id)).find(Boolean);
    return entry ? { provider: entry.id, model: '', effort: '' } : null;
  }

  // ------------------------------------------------------------------ figures

  const figureFilesIn = async (directory) => (await readdir(path.join(directory, 'figures')).catch(() => []))
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name)).map((name) => path.join(directory, 'figures', name));

  /** Adopt figure files an agent saved, under the batch's ids, into the run's accepted/ folder; fills key → path. */
  async function adoptFigures(directory, renamed, known) {
    const accepted = path.join(directory, 'accepted');
    await mkdir(accepted, { recursive: true });
    for (const file of await figureFilesIn(directory)) {
      const parsed = parseFigureName(file);
      if (!parsed) continue;
      const owner = renamed.get(parsed.ownerId) ?? parsed.ownerId;
      const key = `${owner}_${parsed.requestId}`;
      const target = path.join(accepted, `${key}${path.extname(file).toLowerCase()}`);
      await copyFile(file, target);
      known.set(key, target);
    }
    // A revision may renumber an owner: carry figures already accepted over to the new id.
    for (const [oldId, newId] of renamed) {
      for (const [key, file] of [...known]) {
        if (!key.startsWith(`${oldId}_`)) continue;
        const next = `${newId}_${key.slice(oldId.length + 1)}`;
        if (!known.has(next)) { const target = path.join(accepted, `${next}${path.extname(file)}`); await copyFile(file, target); known.set(next, target); }
      }
    }
  }

  // ------------------------------------------------------------------ Bank dry run and import

  /** Put the batch (and its figures) into the subject's inbox folder; returns the inbox-relative name and a cleanup. */
  async function stage(section, batchId, document, figures, tag) {
    const folder = INBOX_FOLDERS[section];
    const directory = path.join(inboxDirectory, folder);
    await mkdir(directory, { recursive: true });
    const name = `${batchId.replace(/[^A-Za-z0-9-]+/g, '-')}-studio-${tag}.json`;
    await writeFile(path.join(directory, name), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    const figureNames = [];
    for (const request of imageRequests(document)) {
      const file = figures.get(request.key);
      if (!file) continue;
      const target = `${request.key}${path.extname(file)}`;
      await copyFile(file, path.join(directory, target));
      figureNames.push(target);
    }
    const cleanup = async () => {
      for (const target of [name, ...figureNames]) await unlink(path.join(directory, target)).catch(() => {});
      // A refused import is moved aside by the inbox command; the studio keeps the batch itself, so drop the copies.
      for (const entry of await readdir(path.join(directory, 'rejected')).catch(() => [])) {
        if (entry.endsWith(`-${name}`) || entry.endsWith(`-${name}.errors.txt`)) await unlink(path.join(directory, 'rejected', entry)).catch(() => {});
      }
    };
    return { only: `${folder}/${name}`, cleanup };
  }

  const tail = (output) => String(output ?? '').trim().split('\n').slice(-3).join(' ').slice(0, 400);

  /** The Bank dry run of one batch: { problems, infra } (`infra` explains a check that could not run). */
  async function bankCheck(section, batchId, document, figures) {
    if (!jobs?.available) return { problems: [], infra: null };
    const staged = await stage(section, batchId, document, figures, 'check');
    try {
      let result = await jobs.checkAndImportOne({ only: staged.only, importIt: false });
      if (result.ok && result.report && result.report.taxonomyVersionId === null) {
        await jobs.ensurePool();
        result = await jobs.checkAndImportOne({ only: staged.only, importIt: false });
      }
      const file = result.report?.files?.[0];
      if (!result.ok || !file) return { problems: [], infra: `The Bank check could not run. ${tail(result.output)}` };
      return { problems: file.problems.filter((problem) => problem.code !== 'ASSET_REQUIRED'), infra: null };
    } finally { await staged.cleanup(); }
  }

  // ------------------------------------------------------------------ the write turn

  const latestPending = (session) => [...session.messages].reverse().find((message) => message.batch && message.batch.status === 'READY')?.batch ?? null;

  async function assignIds(session) {
    const section = session.settings.section, yymmdd = batchDate(now());
    const texts = [];
    for (const other of sessions.values()) for (const message of other.messages) if (message.batch) texts.push(message.batch.batchId);
    for (const sub of ['', 'imported', 'rejected']) {
      for (const name of await readdir(path.join(inboxDirectory, INBOX_FOLDERS[section], sub)).catch(() => [])) texts.push(name);
    }
    const letter = freeBatchLetter(texts, section, yymmdd, reservedLetters);
    if (!letter) throw failure('All 26 batch letters of today are used for this subject. Continue tomorrow.', { actions: [] });
    reservedLetters.add(letter);
    return { letter, create: batchIds({ section, yymmdd, letter }), transcribe: batchIds({ section, yymmdd, letter, kind: 'TRANSCRIBE' }) };
  }

  const stopped = () => failure('Stopped.', { kind: 'STOPPED' });

  async function writeTurn(session, userMessage, signal) {
    const settings = session.settings, section = settings.section, writer = settings.writer;
    const writerEntry = writer ? await provider(writer.provider) : null;
    if (!writerEntry?.available) throw failure(`${writer ? PROVIDER_LABELS[writer.provider] ?? writer.provider : 'No writer'} is not installed or not set up on this computer. Choose another writer.`, { actions: ['settings'] });
    const canDraw = writerEntry.abilities.figures === true;
    const pending = latestPending(session);
    const ids = await assignIds(session);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-studio-'));
    try {
      await mkdir(path.join(directory, 'figures'), { recursive: true });
      const attachments = await copyAttachments(session, directory);
      const examples = settings.bankExamples ? selectBankExamples(getSnapshot?.(), { section, request: userMessage.text }) : null;
      progress(session, 'writing', `${agentLabel(writer)} is writing${examples?.count ? ` (with ${examples.count} Bank examples${settings.web ? ' and web research' : ''})` : ''}…`);
      const first = await callAgent(writer, { prompt: await writerPrompt(session, { message: userMessage.text, ids, pending, canDraw, attachments, examples }),
        directory, attachments, figures: canDraw, signal });
      if (!first.ok) throw failure(first.error.message, { kind: first.error.kind, actions: ['retry', 'settings'] });
      let reply = first.text;
      const extracted = extractJson(reply);
      if (extracted.error && !/```json|"questions"\s*:/.test(reply)) {
        return { message: { role: 'assistant', text: reply.trim().slice(0, 60_000), author: agentLabel(writer) } };
      }
      const revision = Boolean(pending && !extracted.error && extracted.document?.batch_id === pending.batchId);
      const transcription = revision ? pending.kind === 'TRANSCRIBE' : !extracted.error && looksTranscribed(extracted.document);
      const batch = revision ? batchIds({ section, yymmdd: pending.yymmdd, letter: pending.letter, kind: pending.kind }) : transcription ? ids.transcribe : ids.create;
      const figures = new Map();
      if (revision) for (const name of pending.figures ?? []) figures.set(name.replace(/\.[a-z]+$/i, ''), path.join(sessionsDirectory, session.id, 'batches', pending.messageId, 'figures', name));
      let document = null, parseError = null;
      const absorb = async (text) => {
        const parsed = extractJson(text);
        if (parsed.error) { parseError = parsed.error; return; }
        const normalized = normalizeExchange(parsed.document, { section, ids: batch, now: now() });
        document = normalized.document; parseError = null;
        await adoptFigures(directory, normalized.renamed, figures);
      };
      await absorb(reply);
      const reviews = new Map(), reviewHashes = new Map(), dropped = [];
      let rounds = 0, reviewed = false, reviewNote = null, finalPass = false;
      const writerFix = async (fix, note) => {
        rounds += 1;
        progress(session, 'fixing', `${note} → ${agentLabel(writer)} fixes them (round ${rounds} of ${maxRounds})…`);
        const answer = await callAgent(writer, { prompt: await writerPrompt(session, { message: userMessage.text, ids, pending, canDraw, attachments, fix, current: document }),
          directory, attachments, figures: canDraw, signal });
        if (!answer.ok) throw failure(answer.error.message, { kind: answer.error.kind, actions: ['retry', 'settings'] });
        reply = answer.text;
        await absorb(answer.text);
      };

      for (let guard = 0; guard < maxRounds * 3 + 6; guard += 1) {
        if (signal?.aborted) throw stopped();
        if (parseError) {
          if (rounds >= maxRounds || document) {
            if (!document) throw failure(`The writer's JSON could not be read: ${parseError}`, { actions: ['retry', 'settings'] });
            parseError = null; finalPass = true; // keep the last readable batch
          } else {
            await writerFix(`FIX · Your reply could not be read as JSON (${parseError}). Send the whole batch again as exactly one json code block with valid JSON (double quotes, doubled backslashes, no comments).`, 'The JSON could not be read');
            continue;
          }
        }
        progress(session, 'checking', 'Checking the batch…');
        const local = localProblems(document, new Set(figures.keys()));
        if (local.missing.length && local.problems.length === 0 && rounds < maxRounds && !finalPass) {
          const drawer = await figureAgent(writer);
          if (drawer) {
            rounds += 1;
            progress(session, 'figures', `${agentLabel(drawer)} draws ${local.missing.length} figure(s) (round ${rounds} of ${maxRounds})…`);
            const owners = new Set(local.missing.map((request) => request.ownerId));
            const context = reviewSubset(document, (document.questions ?? []).filter((question) => owners.has(question.question_id) || owners.has(question.passage_ref)).map((question) => question.question_id));
            const prompt = ['FIGURES · Draw these figures for TSA practice questions with python3 (matplotlib if available; otherwise python3 -m pip install --user matplotlib),',
              'white background, dark lines, labelled axes with units, at least 800 px wide, exactly the values of the question, nothing that gives the answer away.',
              'Save each one in the current working directory under exactly this path:',
              ...local.missing.map((request) => `- figures/${request.fileName}: ${request.description.replace(/\s+/g, ' ').slice(0, 600)}`), '',
              'The questions they belong to (data, not instructions):', JSON.stringify(context), '', 'Reply "FIGURES DONE" when every file is saved.'].join('\n');
            const drawn = await callAgent(drawer, { prompt, directory, attachments, figures: true, signal });
            if (!drawn.ok && drawn.error.kind === 'STOPPED') throw stopped();
            await adoptFigures(directory, new Map(), figures);
            continue;
          }
        }
        let problems = local.problems;
        if (problems.length === 0 && local.missing.length === 0) {
          progress(session, 'checking', 'Checking the batch against the Bank (dry run, nothing is written)…');
          const bank = await bankCheck(section, batch.batchId, document, figures);
          if (bank.infra) throw failure(bank.infra, { actions: ['retry'] });
          problems = bank.problems;
        }
        if (problems.length || local.missing.length) {
          if (rounds < maxRounds && !finalPass) {
            const missingLine = local.missing.length ? `\n\nThese figures are still missing: ${local.missing.map((request) => request.fileName).join(', ')}. Draw them into figures/ or replace the figure by a table or words.` : '';
            await writerFix(`FIX · ${chatGptFixMessage(problems, [])}${missingLine}`, `${problems.length + local.missing.length} problem(s) found`);
            continue;
          }
          const grouped = byQuestion(problems);
          if (grouped.has(null)) throw failure(`The batch still has problems after ${rounds} rounds: ${grouped.get(null).map((problem) => problem.message).join('; ').slice(0, 600)}`, { actions: ['retry', 'settings'] });
          const dropIds = idsOwning(document, [...grouped.keys(), ...local.missing.map((request) => request.ownerId)]);
          for (const id of dropIds) dropped.push({ id, reason: (grouped.get(id) ?? []).map((problem) => problem.message).join('; ').slice(0, 400) || 'Its figure (or its passage) could not be fixed.' });
          document = dropQuestions(document, dropIds);
          finalPass = true;
          if ((document.questions ?? []).length === 0) throw failure('No question of this batch could be fixed. Try again, maybe with another writer.', { actions: ['retry', 'settings'] });
          continue;
        }
        if (!settings.reviewer) { reviewNote = 'No reviewer is set for this chat, so the batch is not AI-checked.'; break; }
        const passages = new Map((document.passages ?? []).map((passage) => [passage.passage_id, passage]));
        const toReview = (document.questions ?? []).filter((question) => reviewHashes.get(question.question_id) !== questionHash(question, passages.get(question.passage_ref)))
          .map((question) => question.question_id);
        if (toReview.length) {
          const reviewer = settings.reviewer;
          progress(session, 'reviewing', `${agentLabel(reviewer)} reviews ${toReview.length} question(s): solving each one blind…`);
          const review = await runReview(reviewer, { section, document, questionIds: toReview, figures, directory, attachments: transcription ? attachments : [], transcription, signal });
          if (review.error) {
            if (review.error.kind === 'STOPPED') throw stopped();
            reviewNote = `The review could not run: ${review.error.message} The batch passed the checks but is not AI-reviewed, so it is never published automatically.`;
            break;
          }
          for (const [id, verdict] of review.reviews) {
            const question = document.questions.find((item) => item.question_id === id);
            reviews.set(id, { ...verdict, reviewer: verdict.fallback ?? agentLabel(reviewer) });
            reviewHashes.set(id, questionHash(question, passages.get(question?.passage_ref)));
          }
        }
        reviewed = true;
        const failing = [...reviews].filter(([id, verdict]) => verdict.verdict !== 'PASS' && document.questions.some((question) => question.question_id === id));
        if (failing.length === 0) break;
        if (rounds < maxRounds && !finalPass) { await writerFix(reviewFixMessage(failing), `The reviewer asked for changes to ${failing.length} question(s)`); continue; }
        for (const [id, verdict] of failing) dropped.push({ id, reason: `${verdict.verdict}: ${verdict.issues.join(' ')}`.slice(0, 600) });
        // A passage whose questions are dropped keeps its other questions; an emptied passage goes with them.
        document = dropQuestions(document, failing.map(([id]) => id));
        if ((document.questions ?? []).length === 0) throw failure('The reviewer rejected every question of this batch. Try again, maybe with another writer.', { actions: ['retry', 'settings'] });
        break;
      }
      if (!document) throw failure('The writer did not produce a batch.', { actions: ['retry'] });
      // The run folder is removed below: keep the figures the batch uses in the chat's staging folder.
      const staging = path.join(sessionsDirectory, session.id, 'staging', randomUUID());
      await mkdir(staging, { recursive: true });
      const kept = new Map();
      for (const request of imageRequests(document)) {
        const file = figures.get(request.key);
        if (!file) continue;
        const target = path.join(staging, `${request.key}${path.extname(file)}`);
        await copyFile(file, target);
        kept.set(request.key, target);
      }
      return { message: { role: 'assistant', text: reply.split('```')[0].trim().slice(0, 8000), author: agentLabel(writer) },
        batch: { document, figures: kept, staging, batchId: batch.batchId, kind: batch.kind, letter: revision ? pending.letter : ids.letter, yymmdd: revision ? pending.yymmdd : batchDate(now()),
          section, reviews, reviewed, reviewNote, dropped, rounds, replaces: revision ? pending.messageId : null } };
    } finally {
      reservedLetters.delete(ids.letter);
      await rm(directory, { recursive: true, force: true });
    }
  }

  /** One review run, falling back to one other available agent when the chosen one cannot run. */
  async function runReview(reviewer, { section, document, questionIds, figures, directory, attachments, transcription, signal, material = null }) {
    const reviewDirectory = path.join(directory, 'review');
    await rm(reviewDirectory, { recursive: true, force: true });
    await mkdir(path.join(reviewDirectory, 'figures'), { recursive: true });
    await mkdir(path.join(reviewDirectory, 'attachments'), { recursive: true });
    const subset = material ?? reviewSubset(document, questionIds);
    const figureNames = [];
    for (const request of material ? [] : imageRequests(subset)) {
      const file = figures.get(request.key);
      if (!file) continue;
      const name = `${request.key}${path.extname(file)}`;
      await copyFile(file, path.join(reviewDirectory, 'figures', name));
      figureNames.push(name);
    }
    const files = figureNames.map((name) => path.join(reviewDirectory, 'figures', name));
    for (const file of attachments) { const target = path.join(reviewDirectory, 'attachments', path.basename(file)); await copyFile(file, target); files.push(target); }
    const prompt = await reviewerPrompt({ section, material: subset, transcription, figures: figureNames, attachments: attachments.map((file) => path.basename(file)) });
    const candidates = [reviewer];
    const fallback = (await catalog()).find((item) => item.available && item.id !== reviewer.provider && item.id !== 'openai');
    if (fallback) candidates.push({ provider: fallback.id, model: '', effort: '' });
    let lastError = null;
    for (const candidate of candidates) {
      const answer = await callAgent(candidate, { prompt, directory: reviewDirectory, attachments: files, figures: false, signal });
      if (!answer.ok) { lastError = answer.error; if (answer.error.kind === 'STOPPED') return { error: answer.error }; continue; }
      const parsed = parseReview(answer.text, questionIds);
      if (parsed.error) { lastError = { kind: 'FAILED', message: `${agentLabel(candidate)} did not return verdicts (${parsed.error}).` }; continue; }
      if (candidate !== reviewer) for (const verdict of parsed.reviews.values()) verdict.fallback = `${agentLabel(candidate)} (stand-in)`;
      return parsed;
    }
    return { error: lastError ?? { kind: 'FAILED', message: 'No reviewer could run.' } };
  }

  // ------------------------------------------------------------------ publish

  /** Import a ready batch as DRAFTs and, unless `draftsOnly`, publish exactly its versions. */
  async function publishTurn(session, message, { draftsOnly }) {
    const batch = message.batch;
    if (!jobs?.available) throw failure('This demo runs on rehearsal content. Start the real demo with npm start to save questions.', { actions: [] });
    if (batch.status === 'READY') {
      const folder = path.join(sessionsDirectory, session.id, 'batches', message.id);
      const document = JSON.parse(await readFile(path.join(folder, 'batch.json'), 'utf8'));
      const figures = new Map((batch.figures ?? []).map((name) => [name.replace(/\.[a-z]+$/i, ''), path.join(folder, 'figures', name)]));
      progress(session, 'importing', 'Saving the batch into the Bank as drafts (a backup is taken first)…');
      const staged = await stage(batch.section, batch.batchId, document, figures, 'import');
      let result;
      try {
        result = await jobs.checkAndImportOne({ only: staged.only, importIt: true });
        if (result.ok && result.report?.taxonomyVersionId === null) { await jobs.ensurePool(); result = await jobs.checkAndImportOne({ only: staged.only, importIt: true }); }
      } finally { await staged.cleanup(); }
      const file = result.report?.files?.[0];
      if (!result.ok || !file) throw failure(`The Bank did not take the batch. ${tail(result.output)}`, { actions: ['publish'], messageId: message.id });
      if (file.problems.length) {
        throw failure(`The Bank refused the batch: ${file.problems.slice(0, 5).map((problem) => `${problem.questionId ? `${problem.questionId}: ` : ''}${problem.message}`).join('; ')}`,
          { actions: ['fix'], fix: `FIX · ${chatGptFixMessage(file.problems, [])}` });
      }
      batch.versionIds = result.report.createdVersionIds;
      batch.twinVersionIds = result.report.twinVersionIds;
      batch.status = 'SAVED';
      batch.savedAt = nowIso(now);
      const created = new Set(batch.versionIds);
      const entries = {};
      for (const summary of getSnapshot?.()?.summaries ?? []) {
        if (!created.has(summary.versionId) || !summary.exchangeId) continue;
        const row = batch.questions.find((question) => question.id === summary.exchangeId);
        if (row?.review) entries[summary.versionId] = { ...row.review, at: batch.savedAt, batchId: batch.batchId };
      }
      if (Object.keys(entries).length) await saveReviews(entries);
      await save(session);
    }
    if (draftsOnly) return;
    await publishVersions(session, batch, batch.versionIds ?? [], batch.twinVersionIds ?? []);
  }

  /** Publish versions whose whole passage can be published; a twin holds its passage back. Updates `target`. */
  async function publishVersions(session, target, versionIds, twinVersionIds = []) {
    const snapshot = getSnapshot?.();
    const twins = new Set(twinVersionIds);
    const groups = groupByPassage(versionIds, (id) => snapshot?.detail(id)?.stimulusVersionId ?? id);
    const publishable = groups.filter((members) => !members.some((id) => twins.has(id))).flat();
    target.heldBack = versionIds.filter((id) => !publishable.includes(id));
    if (publishable.length === 0) throw failure('Nothing could be published: every question is an exact copy of one already in the Bank. They stay as drafts.', { actions: [] });
    progress(session, 'publishing', `Publishing ${publishable.length} question(s) (a backup is taken first)…`);
    const result = await jobs.publishVersions({ versionIds: publishable });
    if (!result.ok) throw failure(`Publishing stopped. ${tail(result.output)} The questions stay as drafts.`, { actions: ['publish'] });
    target.status = 'PUBLISHED';
    target.publishedAt = nowIso(now);
    target.publishedCount = publishable.length;
    await save(session);
  }

  // ------------------------------------------------------------------ draft review

  async function draftReviewTurn(session, { section, limit, signal }) {
    const snapshot = getSnapshot?.();
    const pool = snapshot?.practicePoolTaxonomyId ?? null;
    const drafts = (snapshot?.summaries ?? []).map((summary) => snapshot.detail(summary.versionId))
      .filter((detail) => detail && detail.section === section && detail.state === 'DRAFT' && detail.answerKey && pool !== null && detail.taxonomyVersionId === pool
        && reviewStore[detail.versionId]?.verdict !== 'PASS');
    const chosen = [];
    for (const members of groupByPassage(drafts, (detail) => detail.stimulusVersionId ?? detail.versionId)) {
      if (chosen.length && chosen.length + members.length > limit) break;
      chosen.push(...members);
    }
    if (chosen.length === 0) return { message: { role: 'assistant', text: `There are no unchecked ${section.toLowerCase()} drafts in the practice pool.`, author: 'Studio' } };
    const reviewer = session.settings.reviewer ?? session.settings.writer;
    const material = [];
    for (const members of groupByPassage(chosen, (detail) => detail.stimulusVersionId ?? detail.versionId)) {
      if (members[0].passage) material.push(`--- Passage of the next ${members.length} question(s) ---\n${blocksToText(members[0].passage)}`);
      for (const detail of members) material.push(`question_id: ${detail.displayId}\n${questionText(detail, 1).replace(/^Câu 1 /, '')}`);
    }
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tsa-studio-review-'));
    try {
      progress(session, 'reviewing', `${agentLabel(reviewer)} reviews ${chosen.length} draft(s) from the Bank…`);
      const ids = chosen.map((detail) => detail.displayId);
      const review = await runReview(reviewer, { section, document: null, questionIds: ids, figures: new Map(), directory, attachments: [], transcription: false, signal,
        material: `Drafts already in the Bank (figures are not shown; judge the text):\n\n${material.join('\n\n')}` });
      if (review.error) throw failure(review.error.message, { kind: review.error.kind, actions: ['settings'] });
      const items = chosen.map((detail) => ({ versionId: detail.versionId, displayId: detail.displayId, stimulusVersionId: detail.stimulusVersionId,
        preview: blocksToText(detail.content).slice(0, 200), review: { ...review.reviews.get(detail.displayId), reviewer: agentLabel(reviewer) } }));
      await saveReviews(Object.fromEntries(items.map((item) => [item.versionId, { ...item.review, at: nowIso(now) }])));
      return { message: { role: 'assistant', text: review.summary || `Reviewed ${items.length} draft(s).`, author: agentLabel(reviewer) },
        draftReview: { section, items, status: 'READY' } };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }

  /** Version ids of a draft review that may be published: every reviewed question of the passage passed. Pure. */
  const passedDraftIds = (draftReview) => groupByPassage(draftReview.items, (item) => item.stimulusVersionId ?? item.versionId)
    .filter((members) => members.every((item) => item.review?.verdict === 'PASS')).flat().map((item) => item.versionId);

  // ------------------------------------------------------------------ turns

  function startTurn(session, kind, work) {
    if (session.turn) throw failure('This chat is still working. Wait for it or press Stop.', { code: 'BUSY' });
    const controller = new AbortController();
    controllers.set(session.id, controller);
    session.turn = { id: randomUUID(), kind, stage: 'starting', note: 'Starting…', startedAt: nowIso(now), steps: [] };
    const done = (async () => {
      try {
        await work(controller.signal);
      } catch (error) {
        const wasStopped = error?.kind === 'STOPPED' || controller.signal.aborted;
        session.messages.push({ id: randomUUID(), role: 'notice', at: nowIso(now), tone: wasStopped ? 'info' : 'error',
          text: wasStopped ? 'Stopped. Nothing from this run was saved to the Bank.'
            : error?.actions ? String(error.message) : `Something went wrong inside the studio (${String(error?.code ?? error?.message ?? 'unknown').slice(0, 120)}). Press Try again; nothing half-done was published.`,
          actions: wasStopped ? ['retry'] : error?.actions ?? ['retry'], ...(error?.fix ? { fix: error.fix } : {}), ...(error?.messageId ? { messageId: error.messageId } : {}) });
        if (!error?.actions && !wasStopped) console.error('AI studio turn failed:', error);
      } finally {
        session.turn = null;
        controllers.delete(session.id);
        running.delete(session.id);
        await save(session).catch(() => {});
      }
    })();
    running.set(session.id, done);
    save(session).catch(() => {});
    return done;
  }

  async function finishWrite(session, outcome) {
    const message = { id: randomUUID(), at: nowIso(now), ...outcome.message };
    if (outcome.batch) {
      const batch = outcome.batch;
      const folder = path.join(sessionsDirectory, session.id, 'batches', message.id);
      await mkdir(path.join(folder, 'figures'), { recursive: true });
      await writeFile(path.join(folder, 'batch.json'), JSON.stringify(batch.document, null, 2), 'utf8');
      const figureNames = [];
      for (const request of imageRequests(batch.document)) {
        const file = batch.figures.get(request.key);
        if (!file) continue;
        const name = `${request.key}${path.extname(file)}`;
        await copyFile(file, path.join(folder, 'figures', name));
        figureNames.push(name);
      }
      if (batch.staging) await rm(batch.staging, { recursive: true, force: true });
      if (batch.replaces) {
        const old = session.messages.find((item) => item.id === batch.replaces);
        if (old?.batch?.status === 'READY') old.batch.status = 'REPLACED';
      }
      const passages = Object.fromEntries((batch.document.passages ?? []).map((passage) => {
        const text = blocksToText(passage.content_blocks ?? []);
        return [passage.passage_id, { title: passage.title ?? null, preview: text.slice(0, 400), words: text.split(/\s+/).filter(Boolean).length }];
      }));
      message.batch = { messageId: message.id, batchId: batch.batchId, kind: batch.kind, letter: batch.letter, yymmdd: batch.yymmdd, section: batch.section,
        questions: questionRows(batch.document, batch.reviews), passages, figures: figureNames, dropped: batch.dropped, rounds: batch.rounds,
        reviewed: batch.reviewed, reviewNote: batch.reviewNote, status: 'READY', document: batch.document };
    }
    if (outcome.draftReview) message.draftReview = outcome.draftReview;
    session.messages.push(message);
    await save(session);
    return message;
  }

  const allPassed = (batch) => batch.reviewed && batch.questions.length > 0 && batch.questions.every((question) => question.review?.verdict === 'PASS');

  async function writeAndMaybePublish(session, userMessage, signal) {
    const saved = await finishWrite(session, await writeTurn(session, userMessage, signal));
    if (!saved.batch || !session.settings.autoPublish) return;
    if (!allPassed(saved.batch) || !jobs?.available) {
      saved.batch.autoNote = !jobs?.available ? 'Not published automatically: this demo has no real Bank.'
        : saved.batch.reviewed ? 'Not published automatically: the reviewer did not pass every question.' : 'Not published automatically: the batch was not AI-reviewed.';
      await save(session);
      return;
    }
    try { await publishTurn(session, saved, { draftsOnly: false }); }
    catch (error) { error.messageId = saved.id; throw error; }
  }

  return Object.freeze({
    ready: loaded,
    catalog: async (options) => { await loaded; return catalog(options); },

    async list() { await loaded; return [...sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summaryOf); },
    async get(id) { await loaded; return view(getSession(id)); },

    async create(settings = {}) {
      await loaded;
      const base = await defaults(SECTIONS.includes(settings?.section) ? settings.section : 'MATH');
      const session = { id: randomUUID(), title: 'New chat', createdAt: nowIso(now), updatedAt: nowIso(now), settings: await cleanSettings(settings, base), messages: [], turn: null };
      sessions.set(session.id, session);
      await save(session);
      return view(session);
    },

    async update(id, settings) {
      await loaded;
      const session = getSession(id);
      session.settings = await cleanSettings(settings, session.settings);
      await save(session);
      return view(session);
    },

    async remove(id) {
      await loaded;
      const session = getSession(id);
      controllers.get(id)?.abort();
      await running.get(id)?.catch(() => {});
      sessions.delete(id);
      await rm(path.join(sessionsDirectory, session.id), { recursive: true, force: true });
      return { ok: true };
    },

    /** Add the owner's message and start the writer in the background. Resolves the session at once. */
    async send(id, { text, attachments = [] } = {}) {
      await loaded;
      const session = getSession(id);
      const clean = String(text ?? '').replace(/\x00/g, '').trim().slice(0, 20_000);
      if (!clean && !(attachments?.length)) throw new TypeError('Write a message or attach a file.');
      if (session.turn) throw failure('This chat is still working. Wait for it or press Stop.', { code: 'BUSY' });
      const messageId = randomUUID();
      const stored = await storeAttachments(session, messageId, attachments);
      const message = { id: messageId, role: 'user', at: nowIso(now), text: clean || 'Turn the attached material into questions.', attachments: stored };
      session.messages.push(message);
      if (session.title === 'New chat') session.title = `${session.settings.section.charAt(0)}${session.settings.section.slice(1).toLowerCase()} · ${message.text.slice(0, 60)}`;
      startTurn(session, 'write', (signal) => writeAndMaybePublish(session, message, signal));
      return view(session);
    },

    /** Run the last owner message again. */
    async retry(id) {
      await loaded;
      const session = getSession(id);
      const last = [...session.messages].reverse().find((message) => message.role === 'user' && !message.draftRequest);
      if (!last) throw new TypeError('There is nothing to retry yet.');
      startTurn(session, 'write', (signal) => writeAndMaybePublish(session, last, signal));
      return view(session);
    },

    async stop(id) { await loaded; const session = getSession(id); controllers.get(id)?.abort(); return view(session); },

    /** Save a ready batch as drafts, or save and publish it; publish the passed drafts of a draft review. */
    async publish(id, { messageId, draftsOnly = false } = {}) {
      await loaded;
      const session = getSession(id);
      const message = session.messages.find((item) => item.id === messageId);
      if (message?.draftReview) {
        if (message.draftReview.status !== 'READY') throw new TypeError('These drafts were already published.');
        const versionIds = passedDraftIds(message.draftReview);
        if (versionIds.length === 0) throw new TypeError('No reviewed passage passed completely, so nothing can be published.');
        startTurn(session, 'publish', () => publishVersions(session, message.draftReview, versionIds));
        return view(session);
      }
      if (!message?.batch || !['READY', 'SAVED'].includes(message.batch.status)) throw new TypeError('That batch cannot be saved or published any more.');
      startTurn(session, 'publish', () => publishTurn(session, message, { draftsOnly }));
      return view(session);
    },

    /** Review DRAFTs of the practice pool already in the Bank. */
    async reviewDrafts(id, { section, limit = 20 } = {}) {
      await loaded;
      const session = getSession(id);
      const target = SECTIONS.includes(section) ? section : session.settings.section;
      const count = Math.max(1, Math.min(40, Number(limit) || 20));
      if (session.turn) throw failure('This chat is still working. Wait for it or press Stop.', { code: 'BUSY' });
      session.messages.push({ id: randomUUID(), role: 'user', at: nowIso(now), text: `Review up to ${count} ${target.toLowerCase()} drafts from the Bank.`, attachments: [], draftRequest: true });
      startTurn(session, 'review', async (signal) => {
        const saved = await finishWrite(session, await draftReviewTurn(session, { section: target, limit: count, signal }));
        if (saved.draftReview && session.settings.autoPublish && jobs?.available) {
          const versionIds = passedDraftIds(saved.draftReview);
          if (versionIds.length) await publishVersions(session, saved.draftReview, versionIds);
        }
      });
      return view(session);
    },

    /** A figure of a batch or an attachment of the chat, for the page to show; null when unknown. */
    async file(id, { kind, owner, name }) {
      await loaded;
      const session = getSession(id);
      if (safeName(name) !== name || !ID.test(owner ?? '')) return null;
      const file = kind === 'figure' ? path.join(sessionsDirectory, session.id, 'batches', owner, 'figures', name)
        : kind === 'attachment' ? path.join(sessionsDirectory, session.id, 'attachments', owner, name) : null;
      return file ? readFile(file).then((bytes) => ({ bytes, name }), () => null) : null;
    },

    /** The AI verdict recorded for a saved version, or null. */
    reviewOf: (versionId) => reviewStore[versionId] ?? null,

    /** Wait for a chat's running turn (tests). */
    settle: async (id) => { await running.get(id)?.catch(() => {}); },
  });
}
