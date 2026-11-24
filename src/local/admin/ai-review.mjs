// The independent AI review of the AI studio: a second agent solves each question blind and returns PASS, FIX or
// REJECT with concrete issues. Only questions that PASS can be published from the studio.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJson } from '../../../scripts/questions-inbox.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const VERDICTS = new Set(['PASS', 'FIX', 'REJECT']);

/** A stable fingerprint of one question with its passage: a review is reused while neither changes. Pure. */
export function questionHash(question, passage) {
  return createHash('sha256').update(JSON.stringify([question ?? null, passage ?? null])).digest('hex').slice(0, 24);
}

/** The questions (with only their passages) to review, as a smaller question set. Pure. */
export function reviewSubset(document, questionIds) {
  const wanted = new Set(questionIds);
  const questions = (document.questions ?? []).filter((question) => wanted.has(question.question_id));
  const refs = new Set(questions.map((question) => question.passage_ref).filter(Boolean));
  return { format: document.format, batch_id: document.batch_id, ...(document.passages ? { passages: document.passages.filter((passage) => refs.has(passage.passage_id)) } : {}), questions };
}

/** The reviewer's prompt. `material` is the question set JSON or a text rendering; figures and attachments are file names. Pure but for reading the instruction files. */
export async function reviewerPrompt({ section, material, transcription = false, figures = [], attachments = [], web = true }) {
  const read = (file) => readFile(path.join(ROOT, file), 'utf8');
  return [
    ['REVIEWER.md', await read('docs/guides/ai-studio/REVIEWER.md')],
    [`SUBJECT_${section}.md (what the section looks like)`, await read(`docs/guides/chatgpt-projects/SUBJECT_${section}.md`)],
    ['This review', [
      `Section: ${section}. Kind: ${transcription ? 'TRANSCRIPTION of the owner\'s attached material (source keys are authoritative)' : 'NEW original questions'}.`,
      web ? 'Web search is available: use it to check facts you are unsure of.' : 'No web search in this run.',
      figures.length ? `Figures to open: ${figures.map((name) => `figures/${name}`).join(', ')}` : 'No figure files.',
      attachments.length ? `Owner's attachments: ${attachments.map((name) => `attachments/${name}`).join(', ')}` : '',
      'Do not create, edit or run files. Your reply text is the deliverable.'].filter(Boolean).join('\n')],
    ['Questions to review', typeof material === 'string' ? material : JSON.stringify(material, null, 2)],
  ].map(([title, text]) => `===== ${title} =====\n${String(text).trim()}`).join('\n\n');
}

/**
 * The reviewer's verdicts by question id, or { error }. A missing or malformed entry becomes FIX with a note, so a
 * question is never passed by accident. Pure.
 */
export function parseReview(text, questionIds) {
  const extracted = extractJson(String(text ?? ''));
  const list = Array.isArray(extracted.document?.reviews) ? extracted.document.reviews : null;
  if (!list) return { error: extracted.error ?? 'The reviewer did not return a reviews list.' };
  const byId = new Map();
  for (const entry of list) {
    if (!entry || typeof entry.question_id !== 'string') continue;
    const verdict = String(entry.verdict ?? '').toUpperCase();
    byId.set(entry.question_id, {
      verdict: VERDICTS.has(verdict) ? verdict : 'FIX',
      myAnswer: entry.my_answer === undefined ? null : String(entry.my_answer).slice(0, 300),
      issues: (Array.isArray(entry.issues) ? entry.issues : [entry.issues]).filter((issue) => typeof issue === 'string' && issue.trim()).map((issue) => issue.slice(0, 1000)).slice(0, 10),
    });
  }
  const reviews = new Map(questionIds.map((id) => [id, byId.get(id) ?? { verdict: 'FIX', myAnswer: null, issues: ['The reviewer returned no verdict for this question.'] }]));
  const summary = typeof extracted.document.summary === 'string' ? extracted.document.summary.slice(0, 2000) : '';
  return { reviews, summary };
}

/** The FIX message for the writer from the reviewer's verdicts. Pure. */
export function reviewFixMessage(entries) {
  return ['FIX · The independent reviewer found problems. For each question below: fix it exactly as described, or replace it',
    'with a new question on the same passage and skill when it cannot be fixed (keep its id). Keep every other question',
    'byte for byte, keep the batch id and ids, and send the whole batch again as one ```json code block.', '',
    ...entries.map(([id, review]) => `- ${id} [${review.verdict}]${review.myAnswer ? ` (reviewer's answer: ${review.myAnswer})` : ''}: ${review.issues.join(' ') || 'No details given; re-check the key and the options.'}`)].join('\n');
}
