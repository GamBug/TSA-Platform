import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDemoNotice, parseDemoNotice, renderDemoNotice, resetDemoNoticeCache } from '../public/app/demo-notice.js';

// Minimal DOM adapter in the style of the existing topic-screen tests; no jsdom.
class Element {
  constructor(tagName) {
    this.tagName = tagName; this.children = []; this.dataset = {}; this.attributes = {};
    this.classes = new Set(); this.textValue = '';
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(' ').filter(Boolean)); }
  get classList() { return { add: (...names) => names.forEach((name) => this.classes.add(name)), contains: (name) => this.classes.has(name) }; }
  set textContent(value) { this.textValue = String(value); this.children = []; }
  get textContent() { return this.textValue + this.children.map((child) => child.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  prepend(node) { this.children.unshift(node); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  find(testid) {
    if (this.dataset.testid === testid) return this;
    for (const child of this.children) {
      const found = child.find?.(testid);
      if (found) return found;
    }
    return null;
  }
}

async function withDom(run) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  try { return await run(); } finally { globalThis.document = previous; }
}

const validNotice = {
  schemaVersion: 'demo-notice/1',
  contentMode: 'PUBLISHED',
  sourceCredit: { vi: 'Bộ câu hỏi tổng hợp', en: 'Synthetic question set' },
};

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('parseDemoNotice accepts a valid PUBLISHED or REHEARSAL notice and freezes it', () => {
  const published = parseDemoNotice(validNotice);
  assert.deepEqual(published, { contentMode: 'PUBLISHED', sourceCredit: { vi: 'Bộ câu hỏi tổng hợp', en: 'Synthetic question set' } });
  assert.equal(Object.isFrozen(published), true);
  assert.equal(Object.isFrozen(published.sourceCredit), true);
  assert.equal(parseDemoNotice({ ...validNotice, contentMode: 'REHEARSAL' }).contentMode, 'REHEARSAL');
});

test('parseDemoNotice rejects wrong schema, unknown mode, bad credits and non-objects', () => {
  const rejected = [
    { ...validNotice, schemaVersion: 'demo-notice/2' },
    { ...validNotice, schemaVersion: undefined },
    { ...validNotice, contentMode: 'DRAFT' },
    { ...validNotice, sourceCredit: { vi: '', en: 'Synthetic' } },
    { ...validNotice, sourceCredit: { vi: '   ', en: 'Synthetic' } },
    { ...validNotice, sourceCredit: { vi: 'Synthetic', en: 'x'.repeat(501) } },
    { ...validNotice, sourceCredit: { vi: 'Synthetic', en: 42 } },
    { ...validNotice, sourceCredit: 'Synthetic' },
    null,
    undefined,
    'demo-notice/1',
    [validNotice],
  ];
  for (const value of rejected) assert.equal(parseDemoNotice(value), null, JSON.stringify(value));
  assert.notEqual(parseDemoNotice({ ...validNotice, sourceCredit: { vi: 'x'.repeat(500), en: 'y' } }), null, 'length 500 is accepted');
});

test('loadDemoNotice returns null for non-OK responses, network failures and unreadable bodies', async () => {
  resetDemoNoticeCache();
  assert.equal(await loadDemoNotice({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => validNotice }) }), null);
  resetDemoNoticeCache();
  assert.equal(await loadDemoNotice({ fetchImpl: async () => { throw new TypeError('Synthetic network failure'); } }), null);
  resetDemoNoticeCache();
  assert.equal(await loadDemoNotice({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }) }), null);
});

test('loadDemoNotice requests the local route once per page load and caches the promise', async () => {
  resetDemoNoticeCache();
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => validNotice }; };
  const first = loadDemoNotice({ fetchImpl });
  const second = loadDemoNotice({ fetchImpl });
  assert.equal(first, second);
  assert.deepEqual(await first, parseDemoNotice(validNotice));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/local/demo-notice');
  assert.deepEqual(calls[0].init, { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
  resetDemoNoticeCache();
});

test('renderDemoNotice shows the two fixed items in Vietnamese and English without a notice', async () => {
  await withDom(() => {
    const vi = renderDemoNotice({ notice: null });
    assert.equal(vi.tagName, 'aside');
    assert.equal(vi.className, 'demo-notice');
    assert.equal(vi.dataset.testid, 'demo-notice');
    assert.equal(vi.getAttribute('aria-label'), 'Thông tin về trang luyện tập');
    assert.equal(vi.find('demo-notice-unofficial').textContent, 'Luyện tập không chính thức — không liên kết với Đại học Bách khoa Hà Nội (HUST).');
    assert.equal(vi.find('demo-notice-nonprofit').textContent, 'Dự án phi lợi nhuận: không quảng cáo, không thu phí.');
    assert.equal(vi.find('demo-notice-source'), null);
    assert.equal(vi.find('demo-notice-mode'), null);
    assert.equal(vi.classList.contains('demo-notice--rehearsal'), false);
    assert.equal(vi.hidden, true, 'without a server notice the block stays hidden');

    const en = renderDemoNotice({ language: 'en', notice: null });
    assert.equal(en.getAttribute('aria-label'), 'About this practice site');
    assert.equal(en.find('demo-notice-unofficial').textContent, 'Unofficial practice — not affiliated with HUST.');
    assert.equal(en.find('demo-notice-nonprofit').textContent, 'Non-profit project: no ads, no fees.');
    assert.equal(renderDemoNotice({ language: 'fr', notice: null }).getAttribute('aria-label'), 'Thông tin về trang luyện tập');
  });
});

test('renderDemoNotice adds the source item only after a published notice resolves', async () => {
  await withDom(async () => {
    const pending = deferred();
    const aside = renderDemoNotice({ language: 'en', notice: pending.promise });
    assert.equal(aside.find('demo-notice-source'), null, 'nothing is added before resolution');
    assert.equal(aside.hidden, true, 'hidden until the server notice resolves');
    pending.resolve(parseDemoNotice(validNotice));
    await pending.promise;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(aside.find('demo-notice-source').textContent, 'Content source: Synthetic question set');
    assert.equal(aside.hidden, false);
    assert.equal(aside.find('demo-notice-mode'), null);
    assert.equal(aside.classList.contains('demo-notice--rehearsal'), false);
  });
});

test('renderDemoNotice labels a REHEARSAL notice in Vietnamese and English', async () => {
  await withDom(async () => {
    const rehearsal = parseDemoNotice({ ...validNotice, contentMode: 'REHEARSAL' });
    const vi = renderDemoNotice({ language: 'vi', notice: Promise.resolve(rehearsal) });
    const en = renderDemoNotice({ language: 'en', notice: rehearsal });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(vi.classList.contains('demo-notice--rehearsal'), true);
    assert.equal(vi.children[0].tagName, 'strong');
    assert.equal(vi.find('demo-notice-mode').textContent, 'DIỄN TẬP · NỘI DUNG TỔNG HỢP');
    assert.equal(vi.find('demo-notice-source').textContent, 'Nguồn nội dung: Bộ câu hỏi tổng hợp');
    assert.equal(en.find('demo-notice-mode').textContent, 'REHEARSAL · SYNTHETIC CONTENT');
    assert.equal(en.find('demo-notice-source').textContent, 'Content source: Synthetic question set');
    assert.equal(en.children[0].tagName, 'strong');
  });
});

test('renderDemoNotice adds nothing for a null notice and does not reject on a failed notice promise', async () => {
  await withDom(async () => {
    const rejected = renderDemoNotice({ notice: Promise.reject(new Error('Synthetic failure')) });
    const fromNull = renderDemoNotice({ notice: Promise.resolve(null) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(rejected.find('demo-notice-source'), null);
    assert.equal(fromNull.find('demo-notice-source'), null);
    assert.equal(fromNull.find('demo-notice-mode'), null);
    assert.equal(fromNull.children[0].children.length, 2);
    assert.equal(fromNull.hidden, true);
    assert.equal(rejected.hidden, true);
  });
});
