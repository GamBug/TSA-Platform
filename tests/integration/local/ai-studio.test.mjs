import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { agentArgs, explainFailure, parseAgyModels, parseCodexModels } from '../../../src/local/admin/ai-agents.mjs';
import { parseReview } from '../../../src/local/admin/ai-review.mjs';
import { createAiStudio, freeBatchLetter, localProblems } from '../../../src/local/admin/ai-studio.mjs';
import { selectBankExamples } from '../../../src/local/admin/bank-examples.mjs';
import { batchIds, normalizeExchange } from '../../../src/local/admin/exchange-normalize.mjs';

const EXAMPLE = JSON.parse(await readFile(new URL('../../../docs/question-bank/examples/valid/reading-passage.json', import.meta.url), 'utf8'));
const fence = (value) => `Report line.\n\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;

async function fakeBin(root, commands) {
  const bin = path.join(root, 'bin');
  await mkdir(bin, { recursive: true });
  for (const command of commands) await writeFile(path.join(bin, command), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return bin;
}

/** A fake agent CLI: `script` answers each call from the prompt; codex writes its reply to the -o file. */
function fakeRun(script, calls) {
  return async (executable, args, options) => {
    const name = path.basename(executable);
    if (args[0] === 'debug') return { exitCode: 0, stdout: JSON.stringify({ models: [{ slug: 'gpt-test', display_name: 'GPT Test', visibility: 'list', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'ultra' }] }] }), stderr: '' };
    const prompt = options.stdin ?? await readFile(path.join(options.cwd, 'PROMPT.md'), 'utf8');
    const role = prompt.includes('===== REVIEWER.md') ? 'reviewer' : prompt.startsWith('FIGURES') ? 'figures' : 'writer';
    calls.push({ name, role, args, prompt, cwd: options.cwd });
    const answer = await script({ name, role, prompt, calls: calls.filter((call) => call.role === role).length, cwd: options.cwd });
    if (answer.exitCode && answer.exitCode !== 0) return { stdout: '', ...answer };
    if (name === 'codex') await writeFile(args[args.indexOf('-o') + 1], answer.text);
    return { exitCode: 0, stdout: name === 'codex' ? '' : answer.text, stderr: '' };
  };
}

function fakeJobs(log) {
  return {
    available: true,
    async checkAndImportOne({ only, importIt }) {
      const [folder, name] = only.split('/');
      log.push({ job: importIt ? 'import' : 'check', only });
      return { ok: true, imported: importIt, report: { taxonomyVersionId: 'pool', phrase: 'IMPORT 2', createdVersionIds: importIt ? ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] : [],
        twinVersionIds: [], files: [{ folder, name, writes: 2, problems: [], missingFigures: [] }] } };
    },
    async ensurePool() { log.push({ job: 'pool' }); return { ok: true }; },
    async publishVersions({ versionIds }) { log.push({ job: 'publish', versionIds }); return { ok: true, output: 'Approved and published: 2' }; },
  };
}

const emptySnapshot = { summaries: [], detail: () => null, practicePoolTaxonomyId: 'pool' };

test('pure helpers: ids, normalisation, letters, problems, verdicts, model lists, failures', () => {
  const ids = batchIds({ section: 'READING', yymmdd: '261124', letter: 'B' });
  assert.equal(ids.batchId, 'GPT-READING-261124-B');
  const { document } = normalizeExchange(EXAMPLE, { section: 'READING', ids, now: new Date('2026-11-24T09:00:00.500Z') });
  assert.deepEqual(document.questions.map((question) => [question.question_id, question.passage_ref]),
    [['READ-G261124B-000001', 'READ-GP261124B-000001'], ['READ-G261124B-000002', 'READ-GP261124B-000001']]);
  assert.equal(document.questions[0].metadata.created_at, '2026-11-24T09:00:00Z');
  assert.ok(document.questions.every((question) => question.tags.includes('ai-original')));
  assert.deepEqual(localProblems(document, new Set()).problems, []);
  const numeric = structuredClone(document); numeric.questions[1].question_type = 'NUMERIC';
  assert.ok(localProblems(numeric, new Set()).problems.some((problem) => problem.code === 'TYPE_NOT_SERVED' && problem.questionId === 'READ-G261124B-000002'));
  assert.equal(freeBatchLetter(['GPT-READING-261124-A', 'SRC-READING-261124-B-P1', 'GPT-MATH-261124-C'], 'READING', '261124', new Set(['C'])), 'D');
  const review = parseReview(fence({ reviews: [{ question_id: 'a', verdict: 'pass', my_answer: 'B', issues: [] }, { question_id: 'b', verdict: 'odd' }] }), ['a', 'b', 'c']);
  assert.deepEqual([...review.reviews].map(([id, value]) => [id, value.verdict]), [['a', 'PASS'], ['b', 'FIX'], ['c', 'FIX']]);
  assert.deepEqual(parseCodexModels('noise {"models":[{"slug":"m","visibility":"list","supported_reasoning_levels":[{"effort":"high"},{"effort":"ultra"}]},{"slug":"x","visibility":"hide"}]}'), [{ id: 'm', label: 'm', efforts: ['high'] }]);
  assert.deepEqual(parseAgyModels('Fetching available models...\ngemini-x\tGemini X\n'), [{ id: 'gemini-x', label: 'Gemini X', efforts: [] }]);
  assert.equal(explainFailure('claude', { exitCode: 1, stderr: 'Not logged in · Please run /login' }).kind, 'SIGNED_OUT');
  assert.equal(explainFailure('codex', { exitCode: 1, stderr: 'You have hit your usage limit' }).kind, 'LIMIT');
  assert.deepEqual(agentArgs('claude', { model: 'opus', effort: 'high', web: true, figures: false }).slice(0, 8), ['-p', '--no-session-persistence', '--output-format', 'text', '--model', 'opus', '--effort', 'high']);
  assert.ok(agentArgs('codex', { figures: true, replyFile: 'r', images: ['attachments/a.png'] }).join(' ').includes('--sandbox workspace-write'));
  assert.ok(agentArgs('agy', {}).at(-1).startsWith('--print=Read the file PROMPT.md'));
});

test('bank examples give Reading whole passages with every question and their keys', () => {
  const passage = [{ type: 'text', text: 'Năng lượng mặt trời ở Việt Nam phát triển nhanh.' }];
  const detail = (index, extra = {}) => ({ versionId: `v${index}`, displayId: `READ-X-${index}`, section: 'READING', state: 'APPROVED', answerKey: { type: 'SINGLE_CHOICE', optionId: 'B' },
    stimulusVersionId: 's1', passage, content: [{ type: 'text', text: `Câu hỏi ${index}` }], interaction: { type: 'SINGLE_CHOICE', options: [{ id: 'A', content: [{ type: 'text', text: 'x' }] }, { id: 'B', content: [{ type: 'text', text: 'y' }] }] },
    interactionType: 'SINGLE_CHOICE', explanation: [], difficulty: { target: 'EASY' }, ...extra });
  const details = [detail(1), detail(2), detail(3, { state: 'DRAFT' })];
  const snapshot = { summaries: details.map((item) => ({ versionId: item.versionId })), detail: (id) => details.find((item) => item.versionId === id) };
  const examples = selectBankExamples(snapshot, { section: 'READING', request: 'năng lượng mặt trời' });
  assert.equal(examples.count, 2);
  assert.match(examples.text, /Năng lượng mặt trời[\s\S]*Câu hỏi 1[\s\S]*Đáp án: B[\s\S]*Câu hỏi 2/);
});

test('a chat turn writes, fixes, reviews and publishes exactly its batch', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-studio-'));
  try {
    const bin = await fakeBin(root, ['claude', 'codex']);
    const inboxDirectory = path.join(root, 'inbox');
    const calls = [], log = [];
    const bad = structuredClone(EXAMPLE); bad.questions[1].question_type = 'NUMERIC';
    const run = fakeRun(async ({ role, prompt, calls: n }) => {
      if (role === 'writer') {
        if (prompt.includes("===== Owner's new message =====\nWhat topics")) return { text: 'Try energy and medicine.' };
        if (n === 1) return { text: fence(bad) };
        const current = JSON.parse(prompt.split('===== Your current batch (JSON) =====\n')[1].split('\n\n=====')[0]);
        if (n === 2) { assert.match(prompt, /TYPE_NOT_SERVED/); current.questions[1].question_type = 'SINGLE_CHOICE'; return { text: fence(current) }; }
        assert.match(prompt, /reviewer found problems[\s\S]*READ-G\d{6}A-000002 \[FIX\]/);
        current.questions[1].explanation[0].content = 'Đoạn văn, câu 2: khoảng mười cuốn sách.';
        return { text: fence(current) };
      }
      const ids = [...new Set([...prompt.matchAll(/"question_id":\s*"(READ-[^"]+)"/g)].map((match) => match[1]))];
      if (n === 1) return { text: fence({ reviews: ids.map((id, index) => ({ question_id: id, verdict: index === 1 ? 'FIX' : 'PASS', issues: index === 1 ? ['Name the sentence.'] : [] })) }) };
      return { text: fence({ reviews: ids.map((id) => ({ question_id: id, verdict: 'PASS', issues: [] })), summary: 'All good.' }) };
    }, calls);
    const studio = createAiStudio({ rootDirectory: path.join(root, 'studio'), inboxDirectory, jobs: fakeJobs(log), getSnapshot: () => emptySnapshot,
      env: { PATH: bin }, run, now: () => new Date('2026-11-24T09:00:00Z') });
    const catalog = await studio.catalog();
    assert.deepEqual(catalog.map((entry) => [entry.id, entry.available]), [['claude', true], ['codex', true], ['agy', false], ['openai', false]]);
    assert.deepEqual(catalog[1].models, [{ id: 'gpt-test', label: 'GPT Test', efforts: ['low'] }]);
    const session = await studio.create({ section: 'READING' });
    assert.deepEqual([session.settings.writer.provider, session.settings.reviewer.provider, session.settings.autoPublish], ['claude', 'codex', false]);

    await studio.send(session.id, { text: 'Một bài đọc về đọc sách', attachments: [{ name: 'page 1.png', base64: Buffer.from('fake').toString('base64') }] });
    await studio.settle(session.id);
    let view = await studio.get(session.id);
    const answer = view.messages.at(-1);
    assert.equal(answer.role, 'assistant', String(view.messages.at(-1).text).slice(0, 1500));
    assert.equal(answer.batch.status, 'READY');
    assert.equal(answer.batch.batchId, 'GPT-READING-261124-A');
    assert.equal(answer.batch.rounds, 2);
    assert.deepEqual(answer.batch.questions.map((question) => question.review.verdict), ['PASS', 'PASS']);
    assert.deepEqual(calls.map((call) => `${call.name}:${call.role}`), ['claude:writer', 'claude:writer', 'codex:reviewer', 'claude:writer', 'codex:reviewer']);
    assert.match(calls[0].prompt, /Attachments \(open them\): attachments\/page-1\.png/);
    assert.deepEqual(await readdir(path.join(calls[0].cwd)).catch(() => 'removed'), 'removed', 'the run folder is removed afterwards');
    assert.equal(log.filter((entry) => entry.job === 'check').length, 2, 'the Bank dry run runs before each review');
    assert.deepEqual(await readdir(path.join(inboxDirectory, 'reading')), ['rejected'].filter(() => false), 'staged files are removed');

    await studio.publish(session.id, { messageId: answer.id });
    await studio.settle(session.id);
    view = await studio.get(session.id);
    const published = view.messages.find((message) => message.id === answer.id).batch;
    assert.equal(published.status, 'PUBLISHED', JSON.stringify(view.messages.at(-1)));
    assert.deepEqual(log.at(-1), { job: 'publish', versionIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] });

    await studio.send(session.id, { text: 'What topics are missing?' });
    await studio.settle(session.id);
    view = await studio.get(session.id);
    assert.equal(view.messages.at(-1).text, 'Try energy and medicine.');
    assert.equal(view.messages.at(-1).batch, undefined);

    // A fresh studio reads the chats back.
    const again = createAiStudio({ rootDirectory: path.join(root, 'studio'), inboxDirectory, jobs: fakeJobs([]), getSnapshot: () => emptySnapshot, env: { PATH: bin }, run });
    assert.equal((await again.list()).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a figure the writer draws is kept with the batch and staged with the import', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-studio-'));
  try {
    const bin = await fakeBin(root, ['claude', 'codex']);
    const log = [], calls = [];
    const withFigure = structuredClone(EXAMPLE);
    withFigure.passages[0].content_blocks.push({ type: 'image_request', request_id: 'NEW-IMG-001', description: 'Đồ thị số sách đọc theo tháng', alt: 'Đồ thị' });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64');
    const run = fakeRun(async ({ role, prompt, cwd }) => {
      if (role === 'writer') {
        await mkdir(path.join(cwd, 'figures'), { recursive: true });
        await writeFile(path.join(cwd, 'figures', 'READ-PASSAGE-000001_NEW-IMG-001.png'), png);
        return { text: fence(withFigure) };
      }
      const ids = [...new Set([...prompt.matchAll(/"question_id":\s*"(READ-[^"]+)"/g)].map((match) => match[1]))];
      return { text: fence({ reviews: ids.map((id) => ({ question_id: id, verdict: 'PASS', issues: [] })) }) };
    }, calls);
    const inboxDirectory = path.join(root, 'inbox');
    const jobs = fakeJobs(log);
    const staged = [];
    const check = jobs.checkAndImportOne;
    jobs.checkAndImportOne = async (options) => { staged.push((await readdir(path.join(inboxDirectory, 'reading'))).sort()); return check(options); };
    const studio = createAiStudio({ rootDirectory: path.join(root, 'studio'), inboxDirectory, jobs, getSnapshot: () => emptySnapshot, env: { PATH: bin }, run });
    const session = await studio.create({ section: 'READING', writer: { provider: 'codex' }, reviewer: { provider: 'claude' } });
    await studio.send(session.id, { text: 'Một bài đọc có đồ thị' });
    await studio.settle(session.id);
    const answer = (await studio.get(session.id)).messages.at(-1);
    assert.equal(answer.role, 'assistant', answer.text);
    assert.deepEqual(answer.batch.figures, ['READ-GP261124A-000001_NEW-IMG-001.png'].map((name) => name.replace('261124', answer.batch.yymmdd)));
    const figure = await studio.file(session.id, { kind: 'figure', owner: answer.id, name: answer.batch.figures[0] });
    assert.deepEqual(figure.bytes, png);
    assert.ok(staged[0].includes(answer.batch.figures[0]), 'the figure is staged next to the batch for the Bank check');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failures read as plain sentences; auto-publish publishes a passed batch at once', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsa-studio-'));
  try {
    const bin = await fakeBin(root, ['claude', 'codex']);
    const log = [], calls = [];
    let signedIn = false;
    const run = fakeRun(async ({ role, prompt }) => {
      if (role === 'writer' && !signedIn) return { exitCode: 1, stderr: 'Not logged in · Please run /login' };
      if (role === 'writer') return { text: fence(EXAMPLE) };
      const ids = [...new Set([...prompt.matchAll(/"question_id":\s*"(READ-[^"]+)"/g)].map((match) => match[1]))];
      return { text: fence({ reviews: ids.map((id) => ({ question_id: id, verdict: 'PASS', issues: [] })) }) };
    }, calls);
    const studio = createAiStudio({ rootDirectory: path.join(root, 'studio'), inboxDirectory: path.join(root, 'inbox'), jobs: fakeJobs(log), getSnapshot: () => emptySnapshot,
      env: { PATH: bin }, run });
    const session = await studio.create({ section: 'READING', autoPublish: true });
    await studio.send(session.id, { text: 'Một bài đọc' });
    await studio.settle(session.id);
    let view = await studio.get(session.id);
    assert.equal(view.messages.at(-1).role, 'notice');
    assert.match(view.messages.at(-1).text, /Claude Code is not signed in on this computer\. Open a terminal and run: claude auth login/);
    assert.deepEqual(view.messages.at(-1).actions, ['retry', 'settings']);
    signedIn = true;
    await studio.retry(session.id);
    await studio.settle(session.id);
    view = await studio.get(session.id);
    assert.equal(view.messages.at(-1).batch.status, 'PUBLISHED', JSON.stringify(view.messages.at(-1)));
    assert.deepEqual(log.map((entry) => entry.job), ['check', 'import', 'publish']);
    await assert.rejects(studio.update(session.id, { section: 'ART' }), /Choose Math, Reading or Science/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
