// Blind answer verification. A solver receives questions WITHOUT answer keys or explanations, solves them independently
// and records an answer, a confidence and any ambiguity. Only afterwards are the answers compared with the stored keys.
// Nothing here reads or writes the Bank: it classifies. Uncertain results are never promoted to VERIFIED, and no key is
// ever changed from this output without a human decision.
import { createHash } from 'node:crypto';
import { normalizeClozeText } from '../../packages/contracts/dist/internal.js';
import { normalizeDecimal } from '../../packages/contracts/dist/numeric-response.js';

export const VERDICTS = Object.freeze(['VERIFIED', 'DISPUTED', 'NEEDS_HUMAN_REVIEW']);
export const CONFIDENCE = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
export const EXPORT_FORMAT = 'tsa-blind-export/1';
export const SOLUTIONS_FORMAT = 'tsa-blind-solutions/1';

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
};
export const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(sortKeys(value))).digest('hex')}`;

/** A stable opaque id for an item, so the solver sees neither version ids nor source file names. */
export const itemId = (versionId, salt) => `Q-${createHash('sha256').update(`${salt}|${versionId}`).digest('hex').slice(0, 10)}`;

function blockText(block) {
  if (block.type === 'text') return block.text;
  if (block.type === 'math') return block.display ? `\n$$${block.tex}$$\n` : `$${block.tex}$`;
  if (block.type === 'table') return `[Bảng: ${block.caption}] ${block.headers.join(' | ')}\n${block.rows.map((row) => row.join(' | ')).join('\n')}`;
  if (block.type === 'image') return `[Hình: ${block.alt}]`;
  return '';
}
export const render = (blocks) => (blocks ?? []).map(blockText).join(' ').replace(/\s+\n/gu, '\n').trim();

/**
 * The solver's view of one question. Only prompt, choices and response structure: never the answer key, explanation,
 * evidence, provenance, version ids or source names. `version` carries the private join key and is stored apart.
 */
export function blindItem(version, salt) {
  const interaction = version.interaction;
  const view = { itemId: itemId(version.id, salt), type: interaction.type, prompt: render(version.content) };
  if (version.passage) view.passage = render(version.passage);
  switch (interaction.type) {
    case 'SINGLE_CHOICE': case 'MULTIPLE_CHOICE':
      view.options = interaction.options.map((option) => ({ id: option.id, text: render(option.content) }));
      if (interaction.type === 'MULTIPLE_CHOICE') view.selections = { min: interaction.minSelections, max: interaction.maxSelections };
      break;
    case 'TRUE_FALSE_GROUP':
      view.statements = interaction.statements.map((statement) => ({ id: statement.id, text: render(statement.content) }));
      break;
    case 'NUMERIC_RESPONSE': view.label = interaction.label; view.format = interaction.format; break;
    case 'CLOZE': view.fields = interaction.fields.map((field) => ({ id: field.id, label: field.label })); view.maxLength = interaction.maxLength; break;
    case 'MATCHING':
      view.rows = interaction.rows.map((row) => ({ id: row.id, label: row.label }));
      view.targets = interaction.targets.map((target) => ({ id: target.id, label: target.label, maxUses: target.maxUses }));
      break;
    default: throw new TypeError(`Unsupported interaction ${interaction.type}`);
  }
  return view;
}

/** Build the export document. `versions` hold id, interaction, content, answer_key (kept only in `private`). */
export function buildExport(versions, { salt, label }) {
  const items = versions.map((version) => blindItem(version, salt));
  const exportHash = digest(items);
  return {
    blind: { format: EXPORT_FORMAT, label, exportHash, count: items.length, items },
    private: { format: `${EXPORT_FORMAT}-private`, exportHash, salt, join: versions.map((version) => ({ itemId: itemId(version.id, salt), versionId: version.id, key: version.answer_key, type: version.interaction.type, interaction: version.interaction })) },
  };
}

const sameSet = (left, right) => left.length === right.length && [...left].sort().join('\u0000') === [...right].sort().join('\u0000');

/** Compare a solver answer with a stored key. Returns true, false, or null when the answer is malformed for the type. */
export function answersAgree(type, key, answer) {
  if (!answer || typeof answer !== 'object') return null;
  switch (type) {
    case 'SINGLE_CHOICE':
      return typeof answer.optionId === 'string' ? answer.optionId === key.optionId : null;
    case 'MULTIPLE_CHOICE':
      return Array.isArray(answer.optionIds) ? sameSet(answer.optionIds, key.optionIds) : null;
    case 'TRUE_FALSE_GROUP': {
      if (!answer.values || typeof answer.values !== 'object') return null;
      const ids = Object.keys(key.values);
      return ids.length === Object.keys(answer.values).length && ids.every((id) => answer.values[id] === key.values[id]);
    }
    case 'NUMERIC_RESPONSE': {
      const given = normalizeDecimal(answer.value);
      return given === null ? null : given === normalizeDecimal(key.value);
    }
    case 'CLOZE': {
      if (!answer.values || typeof answer.values !== 'object') return null;
      const ids = Object.keys(key.acceptedValues);
      return ids.length === Object.keys(answer.values).length && ids.every((id) => typeof answer.values[id] === 'string'
        && key.acceptedValues[id].some((variant) => normalizeClozeText(variant) === normalizeClozeText(answer.values[id])));
    }
    case 'MATCHING': {
      if (!answer.answers || typeof answer.answers !== 'object') return null;
      const rows = Object.keys(key.answers);
      return rows.length === Object.keys(answer.answers).length && rows.every((row) => answer.answers[row] === key.answers[row]);
    }
    default: return null;
  }
}

/** Classify one item. Only a HIGH-confidence, unambiguous agreement is VERIFIED; only a HIGH-confidence disagreement is DISPUTED. */
export function classify(join, solution) {
  if (!solution) return { verdict: 'NEEDS_HUMAN_REVIEW', reason: 'NO_SOLUTION', detail: 'The solver gave no answer for this item' };
  if (!CONFIDENCE.includes(solution.confidence)) return { verdict: 'NEEDS_HUMAN_REVIEW', reason: 'INVALID_CONFIDENCE', detail: 'confidence must be HIGH, MEDIUM or LOW' };
  const agree = answersAgree(join.type, join.key, solution.answer);
  if (agree === null) return { verdict: 'NEEDS_HUMAN_REVIEW', reason: 'MALFORMED_ANSWER', detail: 'The answer does not have the shape of this question type' };
  if (solution.ambiguous === true) return { verdict: 'NEEDS_HUMAN_REVIEW', reason: 'SOLVER_FLAGGED_AMBIGUOUS', detail: solution.reasoning ?? '' };
  if (agree && solution.confidence === 'HIGH') return { verdict: 'VERIFIED', reason: 'INDEPENDENT_SOLVE_AGREES', detail: '' };
  if (agree) return { verdict: 'NEEDS_HUMAN_REVIEW', reason: 'AGREES_WITHOUT_HIGH_CONFIDENCE', detail: 'The solver agreed but was not confident enough to verify' };
  if (solution.confidence === 'HIGH') return { verdict: 'DISPUTED', reason: 'CONFIDENT_DISAGREEMENT', detail: solution.reasoning ?? '' };
  return { verdict: 'NEEDS_HUMAN_REVIEW', reason: 'DISAGREES_WITHOUT_HIGH_CONFIDENCE', detail: 'The solver disagreed but was not confident' };
}

/**
 * Compare a solutions file with a private export. Refuses solutions that were not produced against this exact blind
 * export, and reports solver answers for items that do not exist.
 */
export function compareSolutions(privateExport, solutions) {
  if (solutions?.format !== SOLUTIONS_FORMAT) throw new TypeError(`solutions.format must be ${SOLUTIONS_FORMAT}`);
  if (solutions.exportHash !== privateExport.exportHash) throw new TypeError('The solutions were not written against this export (exportHash differs)');
  if (typeof solutions.solver !== 'string' || solutions.solver.trim() === '') throw new TypeError('solutions.solver must name the solver');
  if (!Array.isArray(solutions.solutions)) throw new TypeError('solutions.solutions must be a list');
  const byItem = new Map();
  const duplicates = [];
  for (const solution of solutions.solutions) {
    if (byItem.has(solution.itemId)) duplicates.push(solution.itemId);
    byItem.set(solution.itemId, solution);
  }
  if (duplicates.length) throw new TypeError(`Solutions repeat items: ${duplicates.join(', ')}`);
  const known = new Set(privateExport.join.map((join) => join.itemId));
  const unknown = [...byItem.keys()].filter((id) => !known.has(id));
  const results = privateExport.join.map((join) => {
    const solution = byItem.get(join.itemId);
    return { itemId: join.itemId, versionId: join.versionId, type: join.type, ...classify(join, solution), confidence: solution?.confidence ?? null };
  });
  const counts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, results.filter((result) => result.verdict === verdict).length]));
  return { solver: solutions.solver, exportHash: privateExport.exportHash, total: results.length, counts, unknownItems: unknown, results };
}
