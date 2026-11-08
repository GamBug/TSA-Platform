import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { mountTopicPractice } from '../public/app/topic-practice.js';

class Node {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.dataset = {}; this.events = {}; this.isConnected = true; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name, listener) { this.events[name] = listener; }
  focus() {}
  reportValidity() { return true; }
  querySelectorAll() { return this.children.flatMap((child) => child instanceof Node
    ? [...(child.tagName === 'input' && child.type === 'checkbox' ? [child] : []), ...child.querySelectorAll()] : []); }
  find(id) { if (this.dataset.testid === id) return this; return this.children.map((child) => child.find?.(id)).find(Boolean); }
}
const document = { createElement: (tag) => new Node(tag), createDocumentFragment: () => new Node('fragment'), createTextNode: (text) => text };

test('rejected cross-domain selection preserves an uncertain creation key and body', async () => {
  const previousDocument = globalThis.document; globalThis.document = document;
  try {
    const host = new Node('section');
    const posts = [];
    mountTopicPractice(host, { load: async () => ({ groups: [
      { id: 'math', taxonomyVersionId: 'math-v1', label: 'Math', children: [{ id: 'algebra', eligibleCount: 4 }] },
      { id: 'reading', taxonomyVersionId: 'reading-v1', label: 'Reading', children: [{ id: 'inference', eligibleCount: 2 }] },
    ] }), create: async (intent) => {
      posts.push(structuredClone(intent));
      if (posts.length === 1) throw Object.assign(new Error('Synthetic lost acknowledgement'), { status: 503 });
      return { attempt: {} };
    }, canCreate: () => true, isCurrent: () => true, onResume() {}, onAttempt() {} });
    await new Promise((resolve) => setImmediate(resolve));
    const inputs = host.querySelectorAll();
    const math = inputs.find((input) => input.value === 'math');
    math.checked = true; math.events.change();
    const form = host.children.find((child) => child.tagName === 'form');
    await form.events.submit({ preventDefault() {} });
    assert.equal(posts.length, 1);
    const other = inputs.find((input) => input.value === 'reading');
    other.checked = true; other.events.change();
    assert.equal(other.checked, false, 'cross-domain selection is rejected');
    await form.events.submit({ preventDefault() {} });
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[1], posts[0], 'unchanged selection replays the original intent');
  } finally { globalThis.document = previousDocument; }
});

test('stale topic load and creation rejections never clear a replacement identity', async () => {
  const source = await readFile(new URL('../public/app/main.js', import.meta.url), 'utf8');
  const screen = source.slice(source.indexOf('function renderTopicPractice() {'), source.indexOf('function renderPracticeModes() {'));
  for (const operation of ['load', 'create']) {
    let captured, rejectRequest, handled = 0;
    const state = { identityGeneration: 1 };
    const pending = new Promise((_, reject) => { rejectRequest = reject; });
    const context = { document, state, header: () => new Node('header'), element: (tag) => new Node(tag),
      actionButton: () => new Node('button'), renderCatalog() {}, footerNote: () => new Node('footer'), replaceApp() {},
      mountTopicPractice: (_, options) => { captured = options; }, api: { loadTopics: () => pending, createTopicAttempt: () => pending },
      resumePersistentAttempt() {}, handlePersistentError: () => { handled += 1; },
      currentActivePersistentAttempt: () => null, refreshPersistentHistory() {}, acceptAttempt() {},
    };
    vm.runInNewContext(`${screen}\nrenderTopicPractice();`, context);
    const request = captured[operation]({});
    state.identityGeneration = 2;
    rejectRequest(Object.assign(new Error('Synthetic stale session denial'), { code: 'UNAUTHENTICATED' }));
    await assert.rejects(request, { code: 'UNAUTHENTICATED' });
    assert.equal(handled, 0, `${operation}: replacement login is untouched`);
  }
});
