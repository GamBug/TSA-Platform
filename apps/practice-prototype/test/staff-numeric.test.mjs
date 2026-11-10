import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Element, loadScript } from './staff-dom-adapter.mjs';

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
