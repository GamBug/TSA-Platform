// Offline, deterministic capture extraction. Source files are never modified.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const normalizePassage = (text) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const chrome = /(?:đáp án đúng|Ẩn đáp án|Xem lại|Câu trước|Câu tiếp|Lời giải)/iu;
export function assertNoRevealedAnswers(value) {
  if (chrome.test(JSON.stringify(value))) throw new Error('PUBLIC_ANSWER_OR_CHROME');
}

export function parseReadingCapture(bytes, sourcePath) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n/gu, '\n');
  const shared = text.split('Ngữ liệu chung\n');
  if (shared.length !== 2) throw new Error(`CAPTURE_SHARED_BOUNDARY: ${sourcePath}`);
  const parts = shared[1].split(/\n(?:\d+\n)?Xem lại\n/u);
  if (parts.length !== 2) throw new Error(`CAPTURE_QUESTION_BOUNDARY: ${sourcePath}`);
  const passage = parts[0].trim().replace(/\nTrả lời cho các câu[^\n]*\n?$/u, '').trim()
    .replace(/^Dựa vào thông tin dưới đây\s*/u, '');
  const body = parts[1].replace(/^Ẩn đáp án\nLời giải\nS\s*/u, '').split('\nCâu trước\n')[0].trim();
  const markers = [...body.matchAll(/^([A-D])(?:, đáp án đúng:)?\s*$/gmu)];
  const keys = [...body.matchAll(/^([A-D]), đáp án đúng:\s*$/gmu)].map((m) => m[1]);
  const type = markers.length === 4 && markers.map((m) => m[1]).join('') === 'ABCD'
    ? 'SINGLE_CHOICE' : /\nĐúng\n|\nSai\n/u.test(body) ? 'TRUE_FALSE_GROUP'
      : /kéo|thả/iu.test(body) ? 'MATCHING' : 'CLOZE_OR_MATCHING';
  const record = { id: sourcePath, sourcePath, sourceHash: sha256(bytes),
    passageId: sha256(normalizePassage(passage)), passage, type,
    proposedTaxonomy: { section: 'READING', skill: 'READING_REASONING',
      genre: sourcePath.split('/')[0].replace('TSA_DocHieu_', ''), status: 'REQUIRES_VERIFICATION' } };
  if (type !== 'SINGLE_CHOICE' || keys.length !== 1) return { ...record, hasExplicitKey: false };
  const prompt = body.slice(0, markers[0].index).trim();
  const options = markers.map((marker, i) => ({ id: marker[1], content: [{ type: 'text',
    text: body.slice(marker.index + marker[0].length, markers[i + 1]?.index ?? body.length).trim() }] }));
  if (!prompt || options.some((option) => !option.content[0].text)) throw new Error('EMPTY_CAPTURE_CONTENT');
  const publicFields = { passage, prompt, options };
  assertNoRevealedAnswers(publicFields);
  return { ...record, hasExplicitKey: true, public: publicFields,
    private: { answerKey: { type, optionId: keys[0] }, explanation: null,
      extractedKeyText: `${keys[0]}, đáp án đúng:` } };
}

export function groupReadingCaptures(records) {
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.passageId) ?? [];
    group.push(record); groups.set(record.passageId, group);
  }
  const selected = [], deferred = [], needs_owner_keys = [], cp4_types = [];
  for (const [passageId, items] of groups) {
    if (items.length !== 10) throw new Error('TEN_CAPTURE_PASSAGE_REQUIRED');
    if (items.every((item) => item.hasExplicitKey)) selected.push({ passageId, passage: items[0].passage, items });
    else {
      deferred.push({ passageId, items: items.map(({ sourcePath, sourceHash, type, hasExplicitKey }) => ({ sourcePath, sourceHash, type, hasExplicitKey })), reason: 'WHOLE_BUNDLE_DEFERRED' });
      for (const item of items) {
        const entry = { sourcePath: item.sourcePath, sourceHash: item.sourceHash, passageId, type: item.type };
        if (item.type === 'TRUE_FALSE_GROUP' || item.type === 'SINGLE_CHOICE' && !item.hasExplicitKey) needs_owner_keys.push(entry);
        if (!['TRUE_FALSE_GROUP', 'SINGLE_CHOICE'].includes(item.type)) cp4_types.push(entry);
      }
    }
  }
  return { selected, deferred, needs_owner_keys, cp4_types };
}

export async function sourceManifest(root) {
  const entries = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('SOURCE_SYMLINK_FORBIDDEN');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) entries.push({ path: relative(root, path), hash: sha256(await readFile(path)) });
    }
  }
  await walk(root); return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readReadingCorpus(root) {
  const manifest = await sourceManifest(root);
  const records = [];
  for (const entry of manifest.filter((item) => item.path.startsWith('TSA_DocHieu_') && item.path.endsWith('.txt'))) {
    records.push(parseReadingCapture(await readFile(join(root, entry.path)), entry.path));
  }
  return { manifest, records, ...groupReadingCaptures(records) };
}
