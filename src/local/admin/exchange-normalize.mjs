// Mechanical clean-up of an AI-written question set before validation, so the writer is never sent back for things the
// platform can set itself: the assigned batch id and id scheme, the subject, the fixed scoring and metadata fields and
// the ai-original tag. Content (stems, options, keys, explanations) is never changed here.

const PREFIX = Object.freeze({ MATH: 'MATH', READING: 'READ', SCIENCE: 'SCIE' });
const SCORING = Object.freeze({ policy: 'BINARY_ALL_OR_NOTHING', points: 1 });

/** The id scheme of one batch. kind CREATE or TRANSCRIBE. Pure. */
export function batchIds({ section, yymmdd, letter, kind = 'CREATE' }) {
  const prefix = PREFIX[section];
  if (!prefix) throw new TypeError(`Unknown section ${section}`);
  const create = kind !== 'TRANSCRIBE';
  return Object.freeze({
    kind: create ? 'CREATE' : 'TRANSCRIBE',
    batchId: create ? `GPT-${section}-${yymmdd}-${letter}` : `SRC-${section}-${yymmdd}-${letter}-P1`,
    questionPrefix: `${prefix}-${create ? 'G' : 'S'}${yymmdd}${letter}-`,
    passagePrefix: `${prefix}-${create ? 'GP' : 'SP'}${yymmdd}${letter}-`,
  });
}

const pad = (number) => String(number).padStart(6, '0');

/** Keep ids that already follow the scheme and are unique; number the others after the highest one. Pure. */
function renumber(values, prefix) {
  const pattern = new RegExp(`^${prefix.replace(/[-]/g, '\\-')}(\\d{6})$`);
  const kept = new Set(), map = new Map();
  let next = 1;
  for (const value of values) {
    const match = pattern.exec(value ?? '');
    if (match && !kept.has(value)) { kept.add(value); next = Math.max(next, Number(match[1]) + 1); }
  }
  const used = new Set();
  for (const [index, value] of values.entries()) {
    if (kept.has(value) && !used.has(value)) { used.add(value); map.set(index, value); continue; }
    let candidate;
    do { candidate = `${prefix}${pad(next)}`; next += 1; } while (kept.has(candidate));
    map.set(index, candidate);
  }
  return map;
}

/** True when a document looks like a transcription of the owner's material (SRC batch or S-ids). Pure. */
export function looksTranscribed(document) {
  if (typeof document?.batch_id === 'string' && /^SRC-/i.test(document.batch_id)) return true;
  const ids = (document?.questions ?? []).map((question) => String(question?.question_id ?? ''));
  return ids.length > 0 && ids.every((id) => /^[A-Z]{4}-S\d{6}[A-Z]-/.test(id));
}

/**
 * Normalise one question set to the batch's ids and fixed fields. Returns { document, renamed } where `renamed` maps
 * every old question or passage id to its new id (figure files are renamed with it). Pure; the input is not mutated.
 */
export function normalizeExchange(input, { section, ids, now = new Date() }) {
  const document = structuredClone(input ?? {});
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const renamed = new Map();
  document.format = 'tsa-question-set/1';
  document.batch_id = ids.batchId;
  const passages = Array.isArray(document.passages) ? document.passages : [];
  const passageIds = renumber(passages.map((passage) => passage?.passage_id), ids.passagePrefix);
  passages.forEach((passage, index) => {
    if (!passage || typeof passage !== 'object') return;
    const next = passageIds.get(index);
    if (typeof passage.passage_id === 'string' && passage.passage_id !== next) renamed.set(passage.passage_id, next);
    passage.passage_id = next;
    if (!Array.isArray(passage.asset_refs)) passage.asset_refs = [];
  });
  if (passages.length) document.passages = passages; else delete document.passages;
  const questions = Array.isArray(document.questions) ? document.questions : [];
  const questionIds = renumber(questions.map((question) => question?.question_id), ids.questionPrefix);
  questions.forEach((question, index) => {
    if (!question || typeof question !== 'object') return;
    const next = questionIds.get(index);
    if (typeof question.question_id === 'string' && question.question_id !== next) renamed.set(question.question_id, next);
    question.question_id = next;
    question.subject = section;
    if (typeof question.passage_ref === 'string' && renamed.has(question.passage_ref)) question.passage_ref = renamed.get(question.passage_ref);
    if (question.passage_ref === null || question.passage_ref === '') delete question.passage_ref;
    question.schema_version ??= 'tsa-question/1';
    question.scoring_config = { ...SCORING };
    if (!Array.isArray(question.asset_refs)) question.asset_refs = [];
    const tags = Array.isArray(question.tags) ? question.tags.filter((tag) => typeof tag === 'string') : [];
    if (ids.kind === 'CREATE' && !tags.includes('ai-original')) tags.push('ai-original');
    question.tags = [...new Set(tags)];
    question.metadata = { ...(question.metadata && typeof question.metadata === 'object' ? question.metadata : {}),
      created_at: stamp, updated_at: stamp, status: 'DRAFT', content_version: 1 };
  });
  document.questions = questions;
  return { document, renamed };
}

/** Remove questions by id, and any passage left without a question. Pure. */
export function dropQuestions(input, questionIds) {
  const drop = new Set(questionIds);
  const document = structuredClone(input);
  document.questions = (document.questions ?? []).filter((question) => !drop.has(question?.question_id));
  const used = new Set(document.questions.map((question) => question.passage_ref).filter(Boolean));
  if (Array.isArray(document.passages)) {
    document.passages = document.passages.filter((passage) => used.has(passage.passage_id));
    if (document.passages.length === 0) delete document.passages;
  }
  return document;
}
