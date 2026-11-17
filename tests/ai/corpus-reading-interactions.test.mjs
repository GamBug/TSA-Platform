import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { join } from 'node:path';
import { parseReadingInteractionCapture, readReadingInteractionCorpus } from '../../tools/corpus-ingest/reading-interactions.mjs';
import { sourceManifest } from '../../tools/corpus-ingest/reading-captures.mjs';
import { resolveReadingCorpusSource } from './fixtures/synthetic-reading-corpus.mjs';

const source = await resolveReadingCorpusSource();
after(source.cleanup);
const sourceRoot = source.sourceRoot;

test('the deferred Reading corpus yields the approved keyed drafts and preserves its source manifest', async () => {
  const before = await sourceManifest(sourceRoot);
  const corpus = await readReadingInteractionCorpus(sourceRoot);
  const after = await sourceManifest(sourceRoot);
  assert.deepEqual(after, before);
  assert.deepEqual(corpus.manifest, before);
  assert.equal(corpus.selected.length, 10);
  assert.equal(corpus.deferred.length, 10);
  assert.equal(corpus.sourceFileCount, before.length);
  assert.deepEqual(corpus.counts, {
    SINGLE_CHOICE: 36,
    MULTIPLE_CHOICE: 10,
    CLOZE: 19,
    MATCHING: 13,
    TRUE_FALSE_GROUP: 22,
  });
  assert.equal(corpus.selected.reduce((sum, group) => sum + group.items.length, 0), 78);
  assert.equal(corpus.deferred.reduce((sum, group) => sum + group.items.length, 0), 22);
  assert.ok(corpus.selected.every((group) => [7, 8].includes(group.items.length)));
  assert.ok(corpus.deferred.flatMap((group) => group.items).every((item) => item.type === 'TRUE_FALSE_GROUP'
    && item.reason === 'NO_EXPLICIT_SOURCE_KEY'));

  const keyed = corpus.selected.flatMap((group) => group.items);
  for (const item of keyed) {
    const bytes = await readFile(join(sourceRoot, item.sourcePath));
    assert.equal(item.sourceHash, `sha256:${(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')}`);
    assert.equal(item.hasExplicitKey, true);
    assert.ok(item.private.answerKey);
    assert.equal(Object.hasOwn(item.public, 'private'), false);
    assert.doesNotMatch(JSON.stringify(item.public), /(?:Ẩn đáp án|Xem lại|Câu trước|Câu tiếp|Lời giải|\(đúng\s*:)/iu);
  }
});

test('captured choices use only their explicit marked keys and stable A to D option IDs', async () => {
  const corpus = await readReadingInteractionCorpus(sourceRoot);
  const choices = corpus.selected.flatMap((group) => group.items).filter((item) => item.type === 'MULTIPLE_CHOICE');
  assert.equal(choices.length, 10);
  for (const item of choices) {
    assert.deepEqual(item.public.interaction.options.map((option) => option.id), ['A', 'B', 'C', 'D']);
    assert.ok(item.private.answerKey.optionIds.length === 2 || item.private.answerKey.optionIds.length === 3);
    assert.ok(item.private.answerKey.optionIds.every((id) => ['A', 'B', 'C', 'D'].includes(id)));
    assert.equal(item.public.interaction.minSelections, 1);
    assert.equal(item.public.interaction.maxSelections, 4);
    assert.ok(item.private.adaptationFlags.includes('MULTIPLE_CHOICE_SELECTION_RANGE_NOT_CAPTURED'));
  }
});

test('matching target identities sort captured correct texts and preserve explicit row assignments', () => {
  const capture = Buffer.from(`Ngữ liệu chung\nPassage text.\nTrả lời cho các câu 1-10 dưới đây:\n1\nXem lại\nẨn đáp án\nLời giải\nS\nKéo thả các cụm từ vào vị trí phù hợp.\n\n1\n—\n(sai)\n(đúng:\n\nZeta\n)\n\n2\n—\n(sai)\n(đúng:\n\nAlpha\n)\nCâu trước\nFooter`);
  const item = parseReadingInteractionCapture(capture, 'synthetic/matching.txt');
  assert.equal(item.type, 'MATCHING');
  assert.deepEqual(item.public.interaction.targets.map(({ id }) => id), ['target-1', 'target-2']);
  assert.deepEqual(item.private.answerKey.answers, { 'row-1': 'target-2', 'row-2': 'target-1' });
  assert.deepEqual(item.public.interaction.targets.map(({ maxUses }) => maxUses), [2, 2]);
});

test('generic correct-answer instructions without captured keys fail closed', () => {
  const capture = Buffer.from(`Ngữ liệu chung\nPassage text.\nTrả lời cho các câu 1-10 dưới đây:\n1\nXem lại\nẨn đáp án\nLời giải\nS\nChọn tất cả đáp án đúng.\nA\nFirst option\nB\nSecond option\nCâu trước\nFooter`);
  assert.throws(() => parseReadingInteractionCapture(capture, 'synthetic/unkeyed.txt'), /CAPTURE_EXPLICIT_KEY_REQUIRED/);
});

test('a captured position without a visible blank remains unchanged and carries an owner-review flag', async () => {
  const corpus = await readReadingInteractionCorpus(sourceRoot);
  const flagged = corpus.selected.flatMap((group) => group.items)
    .filter((item) => item.private.adaptationFlags.includes('MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION'));
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].sourcePath, 'TSA_DocHieu_VanHoc/000061.txt');
  assert.deepEqual(flagged[0].private.adaptationDetails, [{ flag: 'MISSING_VISIBLE_BLANK_FOR_CAPTURED_POSITION',
    visibleBlankCount: 2, capturedPositionCount: 3 }]);
  assert.equal(flagged[0].public.interaction.type, 'MATCHING');
});

test('inline cloze keys keep their own closing parenthesis and lose only the marker one', () => {
  const capture = (keyLines) => Buffer.from(`Ngữ liệu chung\nPassage text.\nTrả lời cho các câu 1-10 dưới đây:\n1\nXem lại\nẨn đáp án\nLời giải\nS\nĐiền vào chỗ trống.\n${keyLines}\nCâu trước\nFooter`);
  const key = (keyLines) => parseReadingInteractionCapture(capture(keyLines), 'synthetic/cloze.txt').private.answerKey.acceptedValues['field-1'];
  assert.deepEqual(key('(đúng: f(x))'), ['f(x)']);
  assert.deepEqual(key('(đúng: Hà Nội)'), ['Hà Nội']);
  assert.deepEqual(key('(đúng:\n\nf(x)\n)'), ['f(x)']);
  assert.deepEqual(key('(đúng:\n\nf(x))'), ['f(x)']);
  assert.deepEqual(key('Đáp án: f(x)'), ['f(x)']);
});
