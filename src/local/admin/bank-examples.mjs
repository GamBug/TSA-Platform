// Style examples for the AI studio: real questions from the Bank snapshot that match the owner's request, rendered as
// readable text with their keys and explanations. Owner decision 2026-11-24: any Bank question (corpus included) may be
// shown to the writer. Reading and Science examples are whole passages with every question of the passage, because the
// real test groups them that way.

const WORD = /[\p{L}\p{N}]{3,}/gu;

/** Plain text of content blocks, keeping math as $tex$ and table rows as " | " lines. Pure. */
export function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return '';
    if (block.type === 'text') return block.text ?? block.content ?? '';
    if (block.type === 'math') return `$${block.tex ?? block.content ?? ''}$`;
    if (block.type === 'table') {
      const rows = [block.headers ?? [], ...(block.rows ?? [])].map((row) => row.map((cell) => (typeof cell === 'string' ? cell : blocksToText([cell].flat()))).join(' | '));
      return [block.caption ? `[Bảng] ${block.caption}` : '[Bảng]', ...rows].join('\n');
    }
    if (block.type === 'image') return `[Hình: ${block.alt ?? 'hình minh họa'}]`;
    if (Array.isArray(block.content)) return blocksToText(block.content);
    return '';
  }).filter(Boolean).join('\n');
}

function words(text) {
  return new Set((String(text).toLowerCase().normalize('NFC').match(WORD) ?? []));
}

/** How many request words a text contains; ties keep a stable pseudo-random order seeded by the request. Pure. */
function score(requestWords, text, seed, key) {
  let hits = 0;
  const own = words(text);
  for (const word of requestWords) if (own.has(word)) hits += 1;
  let hash = 2166136261;
  for (const char of `${seed}:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hits + ((hash >>> 0) % 1000) / 10000;
}

function answerText(detail) {
  const key = detail.answerKey ?? {};
  if (Array.isArray(key.optionIds)) return key.optionIds.join(', ');
  if (typeof key.optionId === 'string') return key.optionId;
  if (key.values && typeof key.values === 'object') return Object.entries(key.values).map(([id, value]) => `${id}: ${value ? 'Đúng' : 'Sai'}`).join('; ');
  if (key.value !== undefined) return String(key.value);
  return JSON.stringify(key);
}

function optionsText(detail) {
  const interaction = detail.interaction ?? {};
  const options = interaction.options ?? interaction.choices ?? [];
  const statements = interaction.statements ?? [];
  const lines = [];
  for (const option of options) lines.push(`  ${option.id ?? option.optionId ?? '?'}. ${blocksToText(option.content ?? option.blocks ?? [])}`);
  for (const statement of statements) lines.push(`  (${statement.label ?? statement.id ?? '?'}) ${statement.content ? blocksToText(statement.content) : statement.text ?? ''}`);
  return lines.join('\n');
}

/** One question as the writer sees it. Pure. */
export function questionText(detail, number) {
  return [`Câu ${number} [${detail.interactionType}${detail.difficulty?.target ? `, ${detail.difficulty.target}` : ''}]`,
    blocksToText(detail.content), optionsText(detail), `Đáp án: ${answerText(detail)}`,
    detail.explanation?.length ? `Lời giải: ${blocksToText(detail.explanation)}` : ''].filter(Boolean).join('\n');
}

const usable = (detail, section) => detail && detail.section === section && detail.state === 'APPROVED' && detail.answerKey !== null;

/**
 * Pick examples for one request from the snapshot. Math: up to `questions` single questions. Reading/Science: up to
 * `passages` whole passages with all their approved questions. Resolves { text, count, ids }. Pure given the snapshot.
 */
export function selectBankExamples(snapshot, { section, request = '', questions = 6, passages = section === 'SCIENCE' ? 2 : 1 } = {}) {
  if (!snapshot?.summaries) return { text: '', count: 0, ids: [] };
  const requestWords = words(request);
  const details = snapshot.summaries.map((summary) => snapshot.detail(summary.versionId)).filter((detail) => usable(detail, section));
  const parts = [], ids = [];
  if (section === 'MATH') {
    const ranked = details.filter((detail) => detail.stimulusVersionId === null)
      .map((detail) => ({ detail, value: score(requestWords, blocksToText(detail.content), request, detail.versionId) }))
      .sort((a, b) => b.value - a.value).slice(0, questions);
    ranked.forEach(({ detail }, index) => { parts.push(questionText(detail, index + 1)); ids.push(detail.displayId); });
  } else {
    const groups = new Map();
    for (const detail of details) {
      if (!detail.stimulusVersionId) continue;
      if (!groups.has(detail.stimulusVersionId)) groups.set(detail.stimulusVersionId, []);
      groups.get(detail.stimulusVersionId).push(detail);
    }
    const ranked = [...groups.entries()].filter(([, members]) => members.length >= 2)
      .map(([id, members]) => ({ members, value: score(requestWords, blocksToText(members[0].passage), request, id) }))
      .sort((a, b) => b.value - a.value).slice(0, passages);
    ranked.forEach(({ members }, index) => {
      parts.push([`--- Bài đọc mẫu ${index + 1} (${members.length} câu hỏi) ---`, blocksToText(members[0].passage), '',
        ...members.map((detail, number) => questionText(detail, number + 1))].join('\n\n'));
      ids.push(...members.map((detail) => detail.displayId));
    });
  }
  if (parts.length === 0) return { text: '', count: 0, ids: [] };
  return { text: parts.join('\n\n'), count: ids.length, ids };
}
