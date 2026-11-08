// Imported captures are data only. This module performs no I/O or inference calls.
import { createHash } from 'node:crypto';
export const VERSION = 'reading-capture/1';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const measure = text => ({ whitespaceSegments: text.match(/\S+/gu)?.length ?? 0,
  codePoints: [...text].length, utf16Units: text.length });
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const passageHeading = /^(?:passage(?:\s+\d+)?|reading passage(?:\s+\d+)?|bài đọc(?:\s+\d+)?|văn bản(?:\s+\d+)?|đọc (?:văn bản|đoạn trích|bài đọc)(?: sau(?: đây)?)?)(?:\s*[:.]\s*.*)?$/iu;
const questionHeading = /^(?:câu(?: hỏi)?|question)\s+(\d+)(?:\s*[.:)]\s*(.*)|\s*)$/iu;
const optionHeading = /^([A-Ha-h])(?:[.)]\s*(.*)|\s*)$/u;
const keyHeading = /^(?:đáp án đúng|correct answer)\s*:\s*(.*)$/iu;
const explanationHeading = /^(?:lời giải|giải thích|explanation|solution)\s*[:：]/iu;
const boilerplate = /^(?:trang chủ|đăng nhập|đăng xuất|home|login|logout|menu|nộp bài|submit|câu trước|câu tiếp theo|previous|next|quay lại|back|thời gian còn lại\s*:\s*\d{1,2}:\d{2}(?::\d{2})?|time remaining\s*:\s*\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?|(?:tiến độ|progress)\s*:\s*\d+\s*\/\s*\d+)$/iu;

export function parseCapture(raw) {
  const rows = []; let offset = 0;
  for (const chunk of raw.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
    const text = chunk.replace(/\r?\n$/u, '');
    rows.push({ line: rows.length + 1, start: offset, end: offset + text.length, text, trimmed: text.trim().replace(/^\uFEFF/u, '') });
    offset += chunk.length;
  }
  const span = row => ({ line: row.line, start: row.start, end: row.end });
  const passages = [], questions = [], removed = [], unassigned = [], warnings = [];
  let passage = null, question = null, option = null, mode = 'unassigned';
  for (const row of rows) {
    const t = row.trimmed;
    if (!t) continue;
    // Boilerplate removal is restricted to outside content blocks. Inside a passage
    // or question it may be meaningful content, so preserve and flag it.
    if (/^(?:(?:thời gian còn lại|time remaining|tiến độ|progress)\s*:|\d{1,2}:\d{2}(?::\d{2})?$)/iu.test(t) && boilerplate.test(t)) {
      removed.push({ ...span(row), rule: 'timer-progress/1' }); continue;
    }
    if (boilerplate.test(t)) {
      if (mode === 'unassigned') { removed.push({ ...span(row), rule: 'exact-ui-line/1' }); continue; }
      warnings.push({ code: 'UI_LIKE_LINE_RETAINED', ...span(row) });
    }
    if (passageHeading.test(t)) {
      passage = { id: `p${passages.length + 1}`, heading: span(row), lines: [] };
      const colon = row.text.indexOf(':');
      if (colon >= 0 && row.text.slice(colon + 1).trim()) {
        passage.lines.push({ line: row.line, start: row.start + colon + 1, end: row.end });
        warnings.push({ code: 'INLINE_PASSAGE_HEADING_CONTENT', ...span(row) });
      }
      passages.push(passage); question = null; option = null; mode = 'passage'; continue;
    }
    if (/^(?:câu(?: hỏi)?|question)\s+\d+/iu.test(t) && !questionHeading.test(t)) {
      warnings.push({ code: 'UNRECOGNIZED_QUESTION_BOUNDARY', ...span(row) });
    }
    const qm = t.match(questionHeading);
    if (qm) {
      question = { id: `q${questions.length + 1}`, sourceNumber: qm[1], passageId: passage?.id ?? null,
        heading: span(row), stemParts: qm[2] ? [qm[2]] : [], lines: [span(row)], options: [],
        answerMarkers: [], explanationLines: [], warnings: [] };
      questions.push(question); option = null; mode = 'question'; continue;
    }
    if (question) {
      question.lines.push(span(row));
      const km = t.match(keyHeading);
      if (km) { question.answerMarkers.push({ text: km[1], ...span(row) }); option = null; mode = 'key'; continue; }
      if (explanationHeading.test(t)) { mode = 'explanation'; option = null; }
      if (mode === 'explanation') { question.explanationLines.push(span(row)); continue; }
      // Once a key has appeared, preserve trailing text as unresolved rather than
      // accidentally appending UI or explanations to the last answer option.
      if (mode === 'key') { question.warnings.push({ code: 'TRAILING_UNPARSED_TEXT', ...span(row) }); continue; }
      const om = t.match(optionHeading);
      if (om) { option = { id: om[1].toUpperCase(), parts: om[2] ? [om[2]] : [], lines: [span(row)] };
        question.options.push(option); continue; }
      if (option) { option.parts.push(row.text); option.lines.push(span(row)); }
      else question.stemParts.push(row.text);
    } else if (mode === 'passage') passage.lines.push(span(row));
    else unassigned.push(span(row));
  }
  for (const p of passages) {
    p.text = p.lines.map(s => raw.slice(s.start, s.end)).join('\n');
    p.exactHash = hash(p.text); p.normalizedHash = hash(p.text.normalize('NFC').replace(/\s+/gu, ' ').trim());
    p.metrics = measure(p.text);
    if (!p.text) warnings.push({ code: 'EMPTY_PASSAGE', passageId: p.id });
    if (!questions.some(q => q.passageId === p.id)) warnings.push({ code: 'PASSAGE_WITHOUT_QUESTIONS', passageId: p.id });
  }
  for (const q of questions) {
    q.stem = q.stemParts.join('\n'); delete q.stemParts;
    for (const o of q.options) { o.text = o.parts.join('\n'); delete o.parts; }
    const flag = code => q.warnings.push({ code });
    if (!q.passageId) flag('MISSING_PASSAGE_BOUNDARY');
    if (!q.stem) flag('EMPTY_STEM');
    if (q.options.length < 2) flag('OPTIONS_MISSING_OR_UNSUPPORTED');
    if (q.options.some(o => !o.text)) flag('EMPTY_OPTION');
    if (new Set(q.options.map(o => o.id)).size !== q.options.length) flag('DUPLICATE_OPTION_ID');
    q.markedAnswer = null; q.markedTruthValues = null;
    if (q.answerMarkers.length === 1) {
      const marker = q.answerMarkers[0].text;
      if (/^[A-H](?:\s*[,;]\s*[A-H])*$/u.test(marker)) {
        const ids = marker.split(/\s*[,;]\s*/u);
        if (new Set(ids).size === ids.length && ids.every(id => q.options.some(o => o.id === id))) q.markedAnswer = ids;
        else flag('ANSWER_REFERENCES_INVALID_OPTIONS');
      } else if (/^[A-Ha-h]\s*[:=]\s*(?:đúng|sai|true|false)(?:\s*[;,]\s*[A-Ha-h]\s*[:=]\s*(?:đúng|sai|true|false))*$/iu.test(marker)) {
        const pairs = [...marker.matchAll(/([A-Ha-h])\s*[:=]\s*(đúng|sai|true|false)/giu)];
        const values = Object.fromEntries(pairs.map(([, id, value]) => [id.toUpperCase(), /^(?:đúng|true)$/iu.test(value)]));
        if (pairs.length === Object.keys(values).length && q.options.length === pairs.length && q.options.every(o => o.id in values)) q.markedTruthValues = values;
        else flag('INCOMPLETE_OR_INVALID_TRUTH_MARKERS');
      } else flag('UNSUPPORTED_ANSWER_MARKER');
    } else flag(q.answerMarkers.length ? 'CONFLICTING_ANSWER_MARKERS' : 'NO_EXPLICIT_CORRECT_ANSWER');
    // A visible marker is not independently verified correctness.
    q.answerStatus = (q.markedAnswer || q.markedTruthValues) ? 'OBSERVED_MARKER_UNVERIFIED' : 'UNKNOWN';
    q.explanation = null; q.evidence = null;
    flag('PASSAGE_ASSOCIATION_REQUIRES_REVIEW');
    if (q.options.some(o => /[✓✔☑]/u.test(o.text))) flag('VISUAL_SELECTION_IS_NOT_A_KEY');
    if (questions.filter(other => other.sourceNumber === q.sourceNumber).length > 1) flag('REPEATED_QUESTION_NUMBER');
    q.metrics = { stem: measure(q.stem), optionSegments: q.options.map(o => measure(o.text).whitespaceSegments) };
    q.analysis = analyzeQuestion(q, passages.find(p => p.id === q.passageId));
  }
  if (!passages.length) warnings.push({ code: 'NO_EXPLICIT_PASSAGE_HEADING' });
  if (!questions.length) warnings.push({ code: 'NO_QUESTIONS_DETECTED' });
  if (unassigned.length) warnings.push({ code: 'UNASSIGNED_TEXT', count: unassigned.length });
  return { schemaVersion: VERSION, offsets: 'zero-based UTF-16 [start,end), one-based lines; raw UTF-8 bytes stored separately',
    passages, questions, removed, unassigned, warnings, quality: 'REQUIRES_OPERATOR_REVIEW' };
}

export const TAXONOMY = [
  { skill: 'evaluation', cue: 'danh gia|phan bien|thuyet phuc|evaluate|critique', level: 'M3', pattern: 'Evaluate a claim using passage evidence and limitations.' },
  { skill: 'inference', cue: 'suy ra|suy luan|ham y|infer|implies', level: 'M2', pattern: 'Infer an unstated conclusion supported by the passage.' },
  { skill: 'main_idea', cue: 'y chinh|noi dung chinh|nhan de|main idea|title', level: 'M2', pattern: 'Synthesize the central claim across the passage.' },
  { skill: 'vocabulary_context', cue: 'nghia cua|tu .* nghia|meaning|refers to', level: 'M2', pattern: 'Interpret a word or reference in its local context.' },
  { skill: 'relationship', cue: 'nguyen nhan|ket qua|so sanh|cause|compare', level: 'M2', pattern: 'Explain a causal, contrastive or comparative relation.' },
  { skill: 'retrieval', cue: 'theo (?:van ban|doan)|chi tiet|according to|stated', level: 'M1', pattern: 'Locate explicitly stated information.' },
];
export function analyzeQuestion(q, passage) {
  const text = fold(q.stem), cues = TAXONOMY.filter(t => new RegExp(t.cue, 'u').test(text));
  let format = 'UNKNOWN', reason = 'No reliable format cue; option count alone does not prove single choice.';
  if (/dung.{0,12}sai|true.{0,12}false/u.test(text)) { format = 'TRUE_FALSE_GROUP'; reason = 'Explicit true/false cue; statement extraction requires review.'; }
  else if (/chon (?:tat ca|nhieu)|select all|multiple answers/u.test(text)) { format = 'MULTIPLE_CHOICE'; reason = 'Explicit multiple-selection cue.'; }
  else if (/chon (?:mot|1)|select one|single choice/u.test(text)) { format = 'SINGLE_CHOICE'; reason = 'Explicit single-selection cue.'; }
  else if (/dien|fill|nhap dap an/u.test(text)) { format = 'TEXT_ENTRY'; reason = 'Text-entry cue; unsupported by current question/1.'; }
  const tokens = s => new Set(fold(s).match(/[\p{L}\p{N}]+/gu) ?? []);
  const pTokens = tokens(passage?.text ?? '');
  return { status: 'ASSUMPTION', method: 'lexical-cues/1', interaction: { proposed: format, reason, confidence: format === 'UNKNOWN' ? 'unknown' : 'low', requiresReview: true },
    skills: cues.map(t => t.skill), cognitive: { proposed: cues.length === 1 ? cues[0].level : null,
      alternatives: ['M1', 'M2', 'M3'], confidence: cues.length === 1 ? 'low' : 'unknown',
      rationale: cues.length ? 'Stem lexical cues only; actual evidence/reasoning demand unverified.' : 'No recognized skill cue.', requiresReview: true },
    distractors: q.options.map(o => {
      const ts = tokens(o.text);
      return { optionId: o.id, role: q.markedAnswer ? (q.markedAnswer.includes(o.id) ? 'marked_correct_unverified' : 'candidate_distractor') : 'unknown',
        signals: [...(/\b(always|never|all|only)\b|luon luon|khong bao gio|tat ca|duy nhat/u.test(fold(o.text)) ? ['absolute_or_scope_cue'] : []),
          ...(/\bnot\b|khong|chua/u.test(fold(o.text)) ? ['negation_cue'] : [])],
        passageTokenOverlap: ts.size && passage ? [...ts].filter(t => pTokens.has(t)).length / ts.size : null,
        construction: 'UNKNOWN_REQUIRES_SEMANTIC_REVIEW', explanation: null };
    }) };
}
