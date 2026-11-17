// Offline parser for keyed interaction captures. Source files remain immutable.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readReadingCorpus, sha256 } from './reading-captures.mjs';

const normalization = Object.freeze({ unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' });
const lineRows = (text) => {
  const result = [];
  let offset = 0;
  for (const value of text.split('\n')) {
    result.push({ value, trimmed: value.trim(), offset });
    offset += value.length + 1;
  }
  return result;
};
const fail = (code, sourcePath) => { throw new Error(`${code}: ${sourcePath}`); };
const blankCount = (text) => [...text.matchAll(/_{2,}|\[\s*\]/gu)].length;

function assertPublicCapture(value) {
  const text = JSON.stringify(value);
  if (/(?:Ẩn đáp án|Xem lại|Câu trước|Câu tiếp|Lời giải)/iu.test(text)
      || /(?:\b[A-D]\s*\(\s*đáp án đúng\s*\)|\b[A-D]\s*,\s*đáp án đúng\s*:|\(đúng\s*:)/iu.test(text)) {
    throw new Error('PUBLIC_ANSWER_OR_CAPTURE_CHROME');
  }
}

function captureSections(bytes, sourcePath) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n/gu, '\n'); }
  catch { fail('CAPTURE_INVALID_UTF8', sourcePath); }
  const shared = text.split('Ngữ liệu chung\n');
  if (shared.length !== 2) fail('CAPTURE_SHARED_BOUNDARY', sourcePath);
  const screen = shared[1].split(/\n(?:\d+\n)?Xem lại\n/u);
  if (screen.length !== 2) fail('CAPTURE_QUESTION_BOUNDARY', sourcePath);
  const passage = screen[0].trim().replace(/\nTrả lời cho các câu[^\n]*\n?$/u, '').trim()
    .replace(/^Dựa vào thông tin dưới đây\s*/u, '');
  const result = screen[1].replace(/^Ẩn đáp án\nLời giải\nS\s*/u, '').split('\nCâu trước\n');
  if (result.length !== 2) fail('CAPTURE_RESULT_BOUNDARY', sourcePath);
  const body = result[0].trim();
  if (!passage || !body) fail('CAPTURE_EMPTY_CONTENT', sourcePath);
  return { text, passage, body };
}

function optionMarkers(body) {
  return [...body.matchAll(/^([A-D])(?:(\s*,\s*đáp án đúng\s*:)|(\s*\(\s*đáp án đúng\s*\)))?\s*$/gimu)];
}

function parseChoice(body, markers, sourcePath) {
  if (markers.length !== 4 || markers.map((match) => match[1].toUpperCase()).join('') !== 'ABCD') {
    fail('CAPTURE_CHOICE_MARKERS_AMBIGUOUS', sourcePath);
  }
  const options = markers.map((marker, index) => {
    const start = marker.index + marker[0].length;
    const end = markers[index + 1]?.index ?? body.length;
    const label = marker[1].toUpperCase();
    const text = body.slice(start, end).trim();
    if (!text) fail('CAPTURE_EMPTY_OPTION', sourcePath);
    return { id: label, content: [{ type: 'text', text }] };
  });
  const answerIds = markers.filter((marker) => marker[2] || marker[3]).map((marker) => marker[1].toUpperCase());
  if (answerIds.length === 0 || new Set(answerIds).size !== answerIds.length) fail('CAPTURE_EXPLICIT_KEY_REQUIRED', sourcePath);
  const prompt = body.slice(0, markers[0].index)
    .replace(/\(?\s*chọn\s+(?:tất\s+cả|nhiều)\s+đáp\s+án\s+đúng\s*\)?/giu, '')
    .replace(/[\t ]+\n/gu, '\n').replace(/\n[\t ]+/gu, '\n').trim();
  if (!prompt) fail('CAPTURE_EMPTY_PROMPT', sourcePath);
  const type = answerIds.length === 1 ? 'SINGLE_CHOICE' : 'MULTIPLE_CHOICE';
  const interaction = type === 'SINGLE_CHOICE'
    ? { type, options }
    : { type, options, minSelections: 1, maxSelections: options.length };
  const answerKey = type === 'SINGLE_CHOICE'
    ? { type, optionId: answerIds[0] }
    : { type, optionIds: answerIds };
  const publicFields = { prompt, interaction };
  assertPublicCapture(publicFields);
  return { type, public: publicFields, private: { answerKey, explanation: null, adaptationFlags: type === 'MULTIPLE_CHOICE' ? ['MULTIPLE_CHOICE_SELECTION_RANGE_NOT_CAPTURED'] : [] } };
}

function findPositionBlocks(body, sourcePath) {
  const lines = lineRows(body);
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ;
    const named = /^vị trí\s+(\d+)$/iu.exec(line.trimmed);
    if (named) { starts.push({ index, position: Number(named[1]) }); continue; }
    if (!/^\d{1,2}$/u.test(line.trimmed)) continue;
    const after = lines.slice(index + 1, index + 4).map((row) => row.trimmed);
    if (after[0] === '—' && /^\(sai\)$/iu.test(after[1] ?? '') && /^\(đúng\s*:/iu.test(after[2] ?? '')) {
      starts.push({ index, position: Number(line.trimmed) });
    }
  }
  if (starts.length === 0) return null;
  const rows = [];
  for (const [offset, start] of starts.entries()) {
    const end = starts[offset + 1]?.index ?? lines.length;
    let marker = -1;
    for (let index = start.index + 1; index < end; index += 1) {
      if (/^\(đúng\s*:/iu.test(lines[index].trimmed)) { marker = index; break; }
    }
    if (marker < 0) fail('CAPTURE_POSITION_KEY_MISSING', sourcePath);
    let value = lines[marker].trimmed.replace(/^\(đúng\s*:\s*/iu, '').trim();
    if (!value) {
      for (let index = marker + 1; index < end; index += 1) {
        if (lines[index].trimmed) { value = lines[index].trimmed; break; }
      }
    }
    value = stripMarkerClosing(value);
    if (!value || /^\(sai\)$/iu.test(value)) fail('CAPTURE_POSITION_KEY_EMPTY', sourcePath);
    rows.push({ position: start.position, value, startOffset: lines[start.index].offset });
  }
  if (new Set(rows.map((row) => row.position)).size !== rows.length
      || rows.some((row) => !Number.isInteger(row.position) || row.position < 1)) fail('CAPTURE_POSITION_DUPLICATE', sourcePath);
  rows.sort((a, b) => a.position - b.position);
  return rows;
}

// A "(đúng: ...)" marker may close on the key's own line. Remove that one unmatched parenthesis and
// nothing else, so a key such as "f(x)" is never clipped.
function stripMarkerClosing(text) {
  const value = text.trim();
  const unmatched = (value.match(/\)/gu) ?? []).length > (value.match(/\(/gu) ?? []).length;
  return unmatched ? value.replace(/\)$/u, '').trim() : value;
}

function findInlineClozeKeys(body, sourcePath) {
  const lines = lineRows(body);
  const keys = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimmed;
    const resultMarker = /^\(đúng\s*:\s*(.*)$/iu.exec(line);
    const directMarker = /^(?:đáp án(?: đúng)?|đúng)\s*:\s*(.+)$/iu.exec(line);
    const marker = resultMarker ?? directMarker;
    if (!marker) continue;
    let value = stripMarkerClosing(marker[1]);
    if (!value) {
      for (let next = index + 1; next < lines.length; next += 1) {
        if (lines[next].trimmed) { value = stripMarkerClosing(lines[next].trimmed); break; }
      }
    }
    if (!value) fail('CAPTURE_CLOZE_KEY_EMPTY', sourcePath);
    keys.push({ position: keys.length + 1, value, startOffset: lines[index].offset });
  }
  return keys.length ? keys : null;
}

function parseClozeOrMatching({ body, matching, sourcePath }) {
  const positioned = findPositionBlocks(body, sourcePath);
  const answerRows = positioned ?? findInlineClozeKeys(body, sourcePath);
  if (!answerRows) fail('CAPTURE_EXPLICIT_KEY_REQUIRED', sourcePath);
  const promptEnd = Math.min(...answerRows.map((row) => row.startOffset));
  const prompt = body.slice(0, promptEnd).trim();
  if (!prompt) fail('CAPTURE_EMPTY_PROMPT', sourcePath);
  if (matching) {
    const rows = answerRows.map(({ position }) => ({ id: `row-${position}`, label: `Vị trí ${position}` }));
    const targetLabels = [...new Set(answerRows.map(({ value }) => value))].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const targetId = new Map(targetLabels.map((label, index) => [label, `target-${index + 1}`]));
    const targets = targetLabels.map((label, index) => ({ id: `target-${index + 1}`, label, maxUses: rows.length }));
    const answers = Object.fromEntries(answerRows.map(({ position, value }) => [`row-${position}`, targetId.get(value)]));
    const interaction = { type: 'MATCHING', rows, targets };
    const publicFields = { prompt, interaction };
    assertPublicCapture(publicFields);
    const visibleBlanks = blankCount(prompt);
    const missingVisibleBlank = visibleBlanks > 0 && rows.length > visibleBlanks;
    const adaptationFlags = ['MATCHING_TARGET_POOL_DERIVED_FROM_CAPTURED_CORRECT_TEXTS', 'MATCHING_TARGET_REUSE_MAXIMUM_SET_TO_ROW_COUNT'];
    if (missingVisibleBlank) adaptationFlags.push('MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION');
    return { type: 'MATCHING', public: publicFields, private: { answerKey: { type: 'MATCHING', answers }, explanation: null,
      adaptationFlags, ...(missingVisibleBlank ? { adaptationDetails: [{ flag: 'MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION',
        visibleBlankCount: visibleBlanks, capturedPositionCount: rows.length }] } : {}) } };
  }

  const visibleBlanks = blankCount(prompt);
  if (visibleBlanks > answerRows.length) fail('CAPTURE_CLOZE_POSITION_AMBIGUOUS', sourcePath);
  const fields = answerRows.map(({ position }) => ({ id: `field-${position}`, label: `Vị trí ${position}` }));
  const acceptedValues = Object.fromEntries(answerRows.map(({ position, value }) => [`field-${position}`, [value]]));
  const interaction = { type: 'CLOZE', fields, maxLength: 256, normalization };
  const adaptationFlags = visibleBlanks > 0 && answerRows.length > visibleBlanks
    ? ['MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION'] : [];
  const publicFields = { prompt, interaction };
  assertPublicCapture(publicFields);
  return { type: 'CLOZE', public: publicFields, private: { answerKey: { type: 'CLOZE', acceptedValues }, explanation: null, adaptationFlags } };
}

export function parseReadingInteractionCapture(bytes, sourcePath, { legacyType = null } = {}) {
  const { passage, body } = captureSections(bytes, sourcePath);
  const markers = optionMarkers(body);
  let parsed;
  if (markers.length === 4 && markers.map((match) => match[1].toUpperCase()).join('') === 'ABCD') {
    parsed = parseChoice(body, markers, sourcePath);
  } else if (legacyType === 'TRUE_FALSE_GROUP') {
    return { sourcePath, sourceHash: sha256(bytes), passageId: sha256(passage.normalize('NFC').replace(/\s+/gu, ' ').trim()), passage,
      type: 'TRUE_FALSE_GROUP', hasExplicitKey: false, deferredReason: 'NO_EXPLICIT_SOURCE_KEY' };
  } else {
    const matching = /kéo[\s\S]{0,40}thả|thả[\s\S]{0,40}kéo/iu.test(body);
    parsed = parseClozeOrMatching({ body, matching, sourcePath });
    const visibleBlanks = blankCount(parsed.public.prompt);
    if (parsed.type === 'CLOZE' && parsed.private.adaptationFlags.includes('MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION')) {
      parsed.private.adaptationDetails = [{ flag: 'MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION', visibleBlankCount: visibleBlanks,
        capturedPositionCount: parsed.public.interaction.fields.length }];
    }
  }
  const record = { sourcePath, sourceHash: sha256(bytes), passageId: sha256(passage.normalize('NFC').replace(/\s+/gu, ' ').trim()),
    passage, type: parsed.type, hasExplicitKey: true, public: parsed.public, private: parsed.private };
  return record;
}

export function groupReadingInteractionCaptures(groups) {
  if (!Array.isArray(groups)) throw new TypeError('Capture groups are required');
  const selected = [];
  const deferred = [];
  const counts = { SINGLE_CHOICE: 0, MULTIPLE_CHOICE: 0, CLOZE: 0, MATCHING: 0, TRUE_FALSE_GROUP: 0 };
  for (const group of groups) {
    if (!Array.isArray(group.items) || group.items.length !== 10) throw new Error('TEN_CAPTURE_PASSAGE_REQUIRED');
    const keyed = group.items.filter((item) => item.hasExplicitKey);
    const missing = group.items.filter((item) => !item.hasExplicitKey);
    if (keyed.length + missing.length !== 10 || missing.some((item) => item.type !== 'TRUE_FALSE_GROUP')) {
      throw new Error('UNSUPPORTED_OR_AMBIGUOUS_READING_CAPTURE');
    }
    if (keyed.length < 7 || keyed.length > 8 || missing.length !== 10 - keyed.length) throw new Error('PARTIAL_PASSAGE_CARDINALITY_INVALID');
    for (const item of keyed) counts[item.type] += 1;
    counts.TRUE_FALSE_GROUP += missing.length;
    selected.push({ passageId: group.passageId, passage: group.items[0].passage, items: keyed });
    deferred.push({ passageId: group.passageId, items: missing.map(({ sourcePath, sourceHash, type, deferredReason }) => ({ sourcePath, sourceHash, type, reason: deferredReason })) });
  }
  if (selected.length !== 10 || counts.SINGLE_CHOICE !== 36 || counts.MULTIPLE_CHOICE !== 10
      || counts.CLOZE !== 19 || counts.MATCHING !== 13 || counts.TRUE_FALSE_GROUP !== 22) {
    throw new Error('READING_INTERACTION_CORPUS_COUNTS_MISMATCH');
  }
  return { selected, deferred, counts };
}

export async function readReadingInteractionCorpus(sourceRoot) {
  const legacy = await readReadingCorpus(sourceRoot);
  if (legacy.records.length !== 200 || legacy.selected.length !== 10 || legacy.deferred.length !== 10) {
    throw new Error('READING_CORPUS_BASELINE_MISMATCH');
  }
  const groups = [];
  for (const group of legacy.deferred) {
    const items = [];
    for (const source of group.items) {
      const bytes = await readFile(join(sourceRoot, source.sourcePath));
      const item = parseReadingInteractionCapture(bytes, source.sourcePath, { legacyType: source.type });
      if (item.sourceHash !== source.sourceHash || item.passageId !== group.passageId) throw new Error('CAPTURE_SOURCE_BINDING_MISMATCH');
      items.push(item);
    }
    groups.push({ passageId: group.passageId, items });
  }
  const grouped = groupReadingInteractionCaptures(groups);
  return { manifest: legacy.manifest, sourceFileCount: legacy.manifest.length, ...grouped };
}
