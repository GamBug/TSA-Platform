// Synthetic stand-in for the private Reading capture corpus. It reproduces the shape the offline
// readers enforce (20 passages of ten captures; ten fully keyed passages and ten interaction
// passages with 36 single-choice, 10 multiple-choice, 19 cloze, 13 matching and 22 unkeyed
// true/false captures) using original English text, so CI never needs the gitignored corpus.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const folders = ['TSA_DocHieu_BaoChi', 'TSA_DocHieu_KhoaHoc', 'TSA_DocHieu_VanHoc'];
const labels = ['A', 'B', 'C', 'D'];

// The one capture whose matching positions outnumber its visible blanks.
export const flaggedSourcePath = 'TSA_DocHieu_VanHoc/000061.txt';

const passageText = (label) => `Synthetic passage ${label} describes an invented harbour town. Its lighthouse keeper logs every `
  + `tide in a ledger, and the ledger for passage ${label} is kept in a locked cupboard. Visitors learn that the town `
  + `market opens at dawn, closes at noon and reopens briefly after the evening bell.`;

const capture = (passage, index, body) => `Ngữ liệu chung\n${passage}\nTrả lời cho các câu 1-10 dưới đây:\n${index}\n`
  + `Xem lại\nẨn đáp án\nLời giải\nS\n${body}\nCâu trước\nCâu ${index} / 10\nCâu tiếp\n`;

function choiceBody(tag, keys, { prompt = `Question ${tag}?`, parenthesisMarker = false } = {}) {
  const marker = (label) => (keys.includes(label) ? (parenthesisMarker ? ' (đáp án đúng)' : ', đáp án đúng:') : '');
  return `${prompt}\n${labels.map((label) => `${label}${marker(label)}\n\nOption ${label} for ${tag}`).join('\n')}`;
}

const positionBlocks = (values) => values
  .map((value, index) => `${index + 1}\n—\n(sai)\n(đúng:\n\n${value}\n)`).join('\n\n');

function clozeBody(tag, style) {
  if (style === 0) return `Complete the sentence for ${tag}: the ____ boat leaves from the ____ pier.\n\n${positionBlocks(['red', 'north'])}`;
  if (style === 1) return `Complete the sentence for ${tag}: the keeper counts ____ lamps.\n(đúng: seven)`;
  return `Complete the sentence for ${tag}: the market bell rings at ____.\nĐáp án: noon`;
}

function matchingBody(tag, { flagged = false } = {}) {
  const prompt = 'Kéo thả các cụm từ vào vị trí phù hợp.';
  if (flagged) {
    return `${prompt}\nThe first ____ and the second ____ were noted for ${tag}.\n\n${positionBlocks(['Harbour', 'Lantern', 'Harbour'])}`;
  }
  return `${prompt}\nMatch the ____ with the ____ for ${tag}.\n\n${positionBlocks(['Zebra pier', 'Amber light'])}`;
}

const trueFalseBody = (tag) => `Which statements about ${tag} are accurate?\nStatement one for ${tag}\nĐúng\nSai\n`
  + `Statement two for ${tag}\nĐúng\nSai`;

// Interaction mix per passage; totals across ten passages are 78 keyed and 22 unkeyed captures.
function interactionKinds(passage) {
  const keyed = passage < 2 ? 7 : 8;
  const multiple = 1;
  const matching = passage < 3 ? 2 : 1;
  const cloze = passage < 9 ? 2 : 1;
  const single = keyed - multiple - matching - cloze;
  return [
    ...Array(single).fill('SINGLE'), 'MULTIPLE', ...Array(cloze).fill('CLOZE'), ...Array(matching).fill('MATCHING'),
    ...Array(10 - keyed).fill('TRUE_FALSE'),
  ];
}

export async function writeSyntheticReadingCorpus(root) {
  const files = new Map();
  let counter = 0;
  const add = (folder, name, content) => files.set(`${folder}/${name}`, content);

  for (let passage = 0; passage < 10; passage += 1) {
    const text = passageText(`K${passage}`);
    for (let item = 0; item < 10; item += 1) {
      const tag = `K${passage}-${item}`;
      add(folders[passage % 3], `${200000 + passage * 10 + item}.txt`,
        capture(text, item + 1, choiceBody(tag, [labels[(passage + item) % 4]])));
    }
  }

  let flaggedUsed = false;
  for (let passage = 0; passage < 10; passage += 1) {
    const text = passageText(`I${passage}`);
    const folder = folders[passage % 3];
    for (const [item, kind] of interactionKinds(passage).entries()) {
      const tag = `I${passage}-${item}`;
      counter += 1;
      let body;
      let name = `${100000 + counter}.txt`;
      if (kind === 'SINGLE') body = choiceBody(tag, [labels[(passage + item) % 4]]);
      else if (kind === 'MULTIPLE') {
        body = choiceBody(tag, passage % 2 ? ['A', 'C', 'D'] : ['B', 'D'], {
          prompt: `Question ${tag}? (chọn tất cả đáp án đúng)`, parenthesisMarker: passage === 1 });
      } else if (kind === 'CLOZE') body = clozeBody(tag, counter % 3);
      else if (kind === 'MATCHING') {
        const flagged = !flaggedUsed;
        flaggedUsed = true;
        body = matchingBody(tag, { flagged });
        if (flagged) { add('TSA_DocHieu_VanHoc', '000061.txt', capture(text, item + 1, body)); continue; }
      } else body = trueFalseBody(tag);
      add(folder, name, capture(text, item + 1, body));
    }
  }

  for (const [relative, content] of files) {
    const path = join(root, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
  return { fileCount: files.size, flaggedSourcePath };
}

// Resolves the source root for the Reading interaction suites. The default is always synthetic.
// Set TSA_PRIVATE_CORPUS_TESTS=1 (npm run test:corpus:private) to run the same assertions against
// the real, gitignored TSA_Example_Questions directory; a missing directory then fails loudly.
export async function resolveReadingCorpusSource() {
  if (process.env.TSA_PRIVATE_CORPUS_TESTS === '1') {
    return { mode: 'private', sourceRoot: join(process.cwd(), 'TSA_Example_Questions'), cleanup: async () => {} };
  }
  const sourceRoot = await mkdtemp(join(tmpdir(), 'tsa-synthetic-reading-corpus-'));
  await writeSyntheticReadingCorpus(sourceRoot);
  return { mode: 'synthetic', sourceRoot, cleanup: () => rm(sourceRoot, { recursive: true, force: true }) };
}
