import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/app/staff.js', import.meta.url), 'utf8');

// A small DOM adapter follows the existing topic-screen unit-test pattern.
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.events = {}; this.attributes = {};
    this.style = {}; this.isConnected = true; this.disabled = false; this.hidden = false; this.error = '';
  }
  append(...children) {
    for (const child of children) {
      if (child.tagName === 'fragment') this.append(...child.children);
      else { this.children.push(child); if (child instanceof Element) child.parentElement = this; }
    }
  }
  prepend(child) { this.children.unshift(child); }
  replaceChildren(...children) { this.children = []; this._text = ''; this._value = undefined; this.append(...children); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return (this._text ?? '') + this.children.map((child) => child.textContent ?? child).join(''); }
  set value(value) {
    this._value = value;
    if (this.tagName === 'select') for (const option of this.children) option.selected = option.value === value;
  }
  get value() {
    if (this.tagName === 'select') return this.selectedOptions[0]?.value ?? '';
    return this._value ?? '';
  }
  get selectedOptions() {
    const selected = this.children.filter((option) => option.selected);
    return selected.length || this.multiple ? selected : this.children.slice(0, 1);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { (this.events[name] ??= []).push(callback); }
  async dispatch(name) { for (const callback of this.events[name] ?? []) await callback({ preventDefault() {}, target: this }); }
  setCustomValidity(error) { this.error = error; }
  reportValidity() {
    return [this, ...this.querySelectorAll('input, textarea, select')].every((input) => input.disabled
      || (!input.error && (!input.required || Boolean(input.value))));
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const data = /^\[data-testid="([^"]+)"\]$/.exec(selector);
    if (data) return this.dataset.testid === data[1];
    return this.tagName === selector;
  }
  querySelectorAll(selectors) {
    const selected = selectors.split(',').map((value) => value.trim());
    return this.children.flatMap((child) => child instanceof Element
      ? [...(selected.some((selector) => child.matches(selector)) ? [child] : []), ...child.querySelectorAll(selectors)] : []);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  find(id) { return this.querySelector(`[data-testid="${id}"]`); }
  focus() {}
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function loadScript(extra = {}) {
  const context = vm.createContext({ Headers, Response, URLSearchParams, crypto: globalThis.crypto,
    renderMath: () => new Element('div'), ...extra });
  vm.runInContext(source.replace(/^import .*\n/, '').replace('export async function openStaffWorkspace', 'async function openStaffWorkspace')
    + '\nglobalThis.api = { openStaffWorkspace, normalizeStaffDecimal, supportedInteraction, renderPrivateQuestion };', context);
  return context.api;
}

test('staff decimal validation preserves exact precision and rejects partial or noncanonical author keys', () => {
  const { normalizeStaffDecimal, supportedInteraction } = loadScript();
  const exact = `${'9'.repeat(40)}.${'1'.repeat(20)}`;
  assert.equal(normalizeStaffDecimal(` +${'0'.repeat(40)},${'0'.repeat(20)} `), '0', '64 characters including whitespace');
  assert.equal(normalizeStaffDecimal(`  +${'0'.repeat(40)},${'0'.repeat(20)} `), null);
  assert.equal(normalizeStaffDecimal(exact), exact);
  assert.equal(normalizeStaffDecimal('-000,000'), '0');
  assert.equal(normalizeStaffDecimal(' +0012,3400 '), '12.34');
  assert.equal(normalizeStaffDecimal('9007199254740993.00000000000000000001'), '9007199254740993.00000000000000000001');
  for (const value of [null, {}, 12, '', '1.', '.1', '1/2', '1e3', '0x10', 'NaN', 'Infinity', '1 000', '1,234.5',
    '１２', '١٢', '1 kg', '<b>1</b>', '1+2', '1\n2', '9'.repeat(41), `1.${'1'.repeat(21)}`]) {
    assert.equal(normalizeStaffDecimal(value), null, String(value));
  }
  const interaction = { type: 'NUMERIC_RESPONSE', label: 'Đáp án', format: 'DECIMAL' };
  for (const value of ['12.34', '0', '-0.01', exact]) assert.equal(supportedInteraction(interaction, { type: 'NUMERIC_RESPONSE', value }), true);
  for (const value of ['+1', '01', '1,2', '1.0', '-0', ' 1 ', null]) assert.equal(supportedInteraction(interaction, { type: 'NUMERIC_RESPONSE', value }), false);
  for (const label of ['', ' ', '<b>Answer</b>', 'Answer\n', 'x'.repeat(201)]) {
    assert.equal(supportedInteraction({ ...interaction, label }, { type: 'NUMERIC_RESPONSE', value: '1' }), false);
  }
});

async function workspace(capability) {
  const root = new Element('main');
  const document = { cookie: 'tsa_local_csrf=synthetic-unit-csrf', createElement: (tag) => new Element(tag),
    createDocumentFragment: () => new Element('fragment') };
  const requests = [];
  const template = { taxonomyVersionId: 'tax', section: 'READING', domainId: 'domain', skillIds: ['skill'],
    content: [{ type: 'text', text: 'Câu hỏi tổng hợp' }],
    interaction: { type: 'SINGLE_CHOICE', options: [{ id: 'a', content: [{ type: 'text', text: 'Một' }] },
      { id: 'b', content: [{ type: 'text', text: 'Hai' }] }] }, answerKey: { type: 'SINGLE_CHOICE', optionId: 'a' },
    explanation: [{ type: 'text', text: 'Lời giải riêng' }], evidenceRefs: ['evidence'], provenance: [{ sourceVersionId: 'source' }] };
  const taxonomy = { taxonomyVersionId: 'tax', name: 'Synthetic taxonomy', versionNo: 1, nodes: [
    { id: 'domain', kind: 'DOMAIN', code: 'READING', parentId: null },
    { id: 'skill', kind: 'SKILL', code: 'reading-skill', parentId: 'domain' },
  ] };
  const api = loadScript({ document, fetch: async (path, options) => {
    requests.push({ path, method: options.method, body: options.body && JSON.parse(options.body) });
    if (path === '/local-auth/session') return Response.json({ principal: {
      authenticated: true, userId: 'author-id', actorKey: 'author', roles: ['AUTHOR'],
    } });
    if (path === '/local/workspace/template') return Response.json({ template, taxonomies: [taxonomy], capabilities: { numericQuestions: capability } });
    if (/^\/api\/v[12]\/questions\?/.test(path)) return Response.json({ items: [], nextCursor: null });
    if (options.method === 'POST' && /^\/api\/v[12]\/questions$/.test(path)) return Response.json({ questionId: 'new-question', versionId: 'new-version' }, { status: 201 });
    throw new Error(`Unexpected unit request ${path}`);
  } });
  await api.openStaffWorkspace(root, () => {});
  assert.ok(root.find('draft-interaction-type'), root.textContent);
  return { root, requests, api, form: root.querySelector('form') };
}

test('staff editor enables numeric only from a true template capability and retains choice templates and taxonomy', async () => {
  for (const capability of [undefined, false, 'true']) {
    const { root, requests, form } = await workspace(capability);
    assert.equal(root.find('draft-interaction-type').children.some((option) => option.value === 'NUMERIC_RESPONSE'), false);
    assert.ok(requests.some((request) => request.path.startsWith('/api/v1/questions?')));
    await form.dispatch('submit');
    const created = requests.find((request) => request.method === 'POST');
    assert.equal(created.path, '/api/v1/questions');
    assert.equal(created.body.schemaVersion, 'question/1');
    assert.equal(created.body.interaction.type, 'SINGLE_CHOICE');
    assert.equal(created.body.section, 'READING');
    assert.deepEqual(created.body.skillIds, ['skill']);
  }
});

test('numeric form hides old required inputs, blocks invalid keys without a POST, and sends the exact canonical v2 draft', async () => {
  const { root, requests, form, api } = await workspace(true);
  const type = root.find('draft-interaction-type');
  assert.equal(type.value, 'SINGLE_CHOICE');
  assert.ok(requests.some((request) => request.path.startsWith('/api/v2/questions?')));
  type.value = 'NUMERIC_RESPONSE'; await type.dispatch('change');
  for (const id of ['draft-option-a', 'draft-option-b']) {
    const input = root.find(id);
    assert.equal(input.required, false); assert.equal(input.disabled, true); assert.equal(input.parentElement.hidden, true);
    input.value = '';
  }
  const answer = root.find('draft-numeric-answer');
  const label = root.find('draft-numeric-label');
  assert.equal(answer.type, 'text');
  for (const value of ['', '01', '1,2', '1.0', '+1', '-0', '1e2', ' 1 ']) {
    answer.value = value; await form.dispatch('submit');
    assert.equal(requests.some((request) => request.method === 'POST'), false, value);
  }
  answer.value = '9007199254740993.00000000000000000001';
  label.value = '<b>Answer</b>'; await form.dispatch('submit');
  assert.equal(requests.some((request) => request.method === 'POST'), false);
  label.value = 'Đáp án chính xác'; await form.dispatch('submit');
  const created = requests.find((request) => request.method === 'POST');
  assert.equal(created.path, '/api/v2/questions');
  assert.equal(created.body.schemaVersion, 'question/2');
  assert.deepEqual(created.body.interaction, { type: 'NUMERIC_RESPONSE', label: 'Đáp án chính xác', format: 'DECIMAL' });
  assert.deepEqual(created.body.answerKey, { type: 'NUMERIC_RESPONSE', value: answer.value });
  assert.equal(created.body.taxonomyVersionId, 'tax');
  assert.deepEqual(created.body.skillIds, ['skill']);
  const preview = api.renderPrivateQuestion({ content: [{ type: 'text', text: 'Synthetic preview' }], stimulus: null,
    interaction: created.body.interaction, answerKey: created.body.answerKey,
    explanation: [{ type: 'text', text: 'Private explanation' }], scoringPolicyVersion: 'practice-binary-v2' });
  assert.ok(preview.textContent.includes(answer.value));
  type.value = 'SINGLE_CHOICE'; await type.dispatch('change');
  assert.equal(root.find('draft-option-a').required, true);
  assert.equal(root.find('draft-option-a').disabled, false);
  assert.equal(root.find('draft-option-a').parentElement.hidden, false);
  assert.equal(root.find('draft-numeric-answer'), null);
  assert.equal(root.find('draft-answer').value, '', 'changing type clears the answer');
});
