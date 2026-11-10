import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Element, loadScript } from './staff-dom-adapter.mjs';

const normalization = { unicode: 'NFC', trim: 'OUTER', caseSensitive: true, diacritics: 'PRESERVE' };

test('cloze and matching draft parsers build contract-shaped interactions and reject unsafe entries', () => {
  const { parseClozeDraft, parseMatchingDraft, supportedInteraction } = loadScript();
  const cloze = parseClozeDraft('Thành phố | Hà Nội | Ha Noi\n\n Tỉ lệ | 3:2 ', 40);
  assert.deepEqual(JSON.parse(JSON.stringify(cloze)), {
    interaction: { type: 'CLOZE', fields: [{ id: 'field-1', label: 'Thành phố' }, { id: 'field-2', label: 'Tỉ lệ' }],
      maxLength: 40, normalization },
    answerKey: { type: 'CLOZE', acceptedValues: { 'field-1': ['Hà Nội', 'Ha Noi'], 'field-2': ['3:2'] } },
  });
  assert.equal(supportedInteraction(cloze.interaction, cloze.answerKey), true);
  for (const [text, maxLength] of [['', 40], ['Nhãn', 40], ['Nhãn | ', 40], ['<b>Nhãn</b> | a', 40], ['Nhãn | a | a', 40],
    ['Nhãn | Ha Nõi | Ha Nõi', 40], ['Nhãn | quá dài', 3], ['Nhãn | a', 0], ['Nhãn | a', 257], ['Nhãn | a', Number.NaN]]) {
    assert.equal(typeof parseClozeDraft(text, maxLength).error, 'string', `${text} / ${maxLength}`);
  }
  assert.equal(parseClozeDraft('Nhãn | 😀😀', 2).error, undefined, 'limits count Unicode scalar values, not UTF-16 units');

  const matching = parseMatchingDraft('Hàng một | Xanh\nHàng hai | Đỏ\nHàng ba | Xanh', 'Vàng\nĐỏ', 2);
  assert.deepEqual([...matching.interaction.rows.map((row) => row.id)], ['row-1', 'row-2', 'row-3']);
  assert.deepEqual([...matching.interaction.targets.map((target) => target.label)], ['Vàng', 'Xanh', 'Đỏ'],
    'targets are ordered by label and deduplicated, independent of row order');
  assert.ok(matching.interaction.targets.every((target) => target.maxUses === 2));
  const targetLabel = (rowId) => matching.interaction.targets.find((target) => target.id === matching.answerKey.answers[rowId]).label;
  assert.deepEqual(['row-1', 'row-2', 'row-3'].map(targetLabel), ['Xanh', 'Đỏ', 'Xanh']);
  assert.equal(supportedInteraction(matching.interaction, matching.answerKey), true);
  for (const [rows, extras, maxUses] of [['', '', 1], ['Hàng', '', 1], ['Hàng | A | B', '', 1], ['A | X\nB | X', '', 1],
    ['A | <i>X</i>', '', 1], ['A | X', '<b>', 1], ['A | X', '', 0], ['A | X', '', 41]]) {
    assert.equal(typeof parseMatchingDraft(rows, extras, maxUses).error, 'string', `${rows} / ${extras} / ${maxUses}`);
  }
});

test('private preview support fails closed for malformed cloze and matching graphs', () => {
  const { supportedInteraction } = loadScript();
  const cloze = { type: 'CLOZE', fields: [{ id: 'city', label: 'City' }], maxLength: 10, normalization };
  assert.equal(supportedInteraction(cloze, { type: 'CLOZE', acceptedValues: { city: ['Ha Noi'] } }), true);
  for (const key of [{ type: 'CLOZE', acceptedValues: {} }, { type: 'CLOZE', acceptedValues: { city: [] } },
    { type: 'CLOZE', acceptedValues: { city: ['x'.repeat(11)] } }, { type: 'CLOZE', acceptedValues: { city: ['a'], other: ['b'] } },
    { type: 'CLOZE', acceptedValues: { city: [' '] } }, { type: 'MATCHING', answers: {} }]) {
    assert.equal(supportedInteraction(cloze, key), false, JSON.stringify(key));
  }
  assert.equal(supportedInteraction({ ...cloze, fields: [{ id: 'city', label: '<b>City</b>' }] },
    { type: 'CLOZE', acceptedValues: { city: ['a'] } }), false);
  const matching = { type: 'MATCHING', rows: [{ id: 'row-a', label: 'Row A' }, { id: 'row-b', label: 'Row B' }],
    targets: [{ id: 'red', label: 'Red', maxUses: 1 }, { id: 'blue', label: 'Blue', maxUses: 1 }] };
  assert.equal(supportedInteraction(matching, { type: 'MATCHING', answers: { 'row-a': 'red', 'row-b': 'blue' } }), true);
  for (const answers of [{ 'row-a': 'red' }, { 'row-a': 'red', 'row-b': 'red' }, { 'row-a': 'red', 'row-b': 'green' },
    { 'row-a': 'red', 'row-b': 'blue', 'row-c': 'blue' }]) {
    assert.equal(supportedInteraction(matching, { type: 'MATCHING', answers }), false, JSON.stringify(answers));
  }
});

async function workspace({ capability, roles = ['AUTHOR'], routeEnabled = true } = { capability: true }) {
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
      authenticated: true, userId: 'staff-id', actorKey: 'staff', roles,
    } });
    if (path === '/local/workspace/template') return Response.json({ template, taxonomies: [taxonomy], capabilities: { clozeMatching: capability } });
    if (path.startsWith('/api/v4/') && !routeEnabled) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    if (/^\/api\/v[14]\/questions\?/.test(path)) return Response.json({ items: [], nextCursor: null });
    if (options.method === 'POST' && /^\/api\/v[14]\/questions$/.test(path)) return Response.json({ questionId: 'new-question', versionId: 'new-version' }, { status: 201 });
    throw new Error(`Unexpected unit request ${path}`);
  } });
  await api.openStaffWorkspace(root, () => {});
  return { root, requests, api, form: root.querySelector('form') };
}

test('cloze and matching authoring appears only from a true capability', async () => {
  for (const capability of [undefined, false, 'true']) {
    const { root, requests } = await workspace({ capability });
    const types = root.find('draft-interaction-type').children.map((option) => option.value);
    assert.equal(types.includes('CLOZE') || types.includes('MATCHING'), false);
    assert.equal(root.find('staff-protocol-filter'), null);
    assert.equal(requests.some((request) => request.path.startsWith('/api/v4/')), false);
  }
});

test('author creates question/3 cloze and matching drafts on the v4 route and the list follows that scope', async () => {
  const { root, requests, form, api } = await workspace();
  const type = root.find('draft-interaction-type');
  assert.equal(root.find('staff-protocol-filter').value, 'legacy');
  assert.ok(requests.some((request) => request.path.startsWith('/api/v1/questions?')));

  type.value = 'CLOZE'; await type.dispatch('change');
  for (const id of ['draft-option-a', 'draft-option-b']) {
    assert.equal(root.find(id).disabled, true); assert.equal(root.find(id).parentElement.hidden, true);
  }
  const fields = root.find('draft-cloze-fields');
  for (const value of ['', 'Thành phố', 'Thành phố | a | a']) {
    fields.value = value; await form.dispatch('submit');
    assert.equal(requests.some((request) => request.method === 'POST'), false, value);
  }
  fields.value = 'Thành phố | Hà Nội | Ha Noi'; await form.dispatch('submit');
  const cloze = requests.find((request) => request.method === 'POST');
  assert.equal(cloze.path, '/api/v4/questions');
  assert.equal(cloze.body.schemaVersion, 'question/3');
  assert.deepEqual(cloze.body.interaction, { type: 'CLOZE', fields: [{ id: 'field-1', label: 'Thành phố' }], maxLength: 40, normalization });
  assert.deepEqual(cloze.body.answerKey, { type: 'CLOZE', acceptedValues: { 'field-1': ['Hà Nội', 'Ha Noi'] } });
  assert.equal(root.find('staff-protocol-filter').value, 'cloze-matching');
  assert.ok(requests.at(-1).path.startsWith('/api/v4/questions?'), 'the list reloads from the route that owns the new draft');
  const clozePreview = api.renderPrivateQuestion({ content: [{ type: 'text', text: 'Synthetic preview' }], stimulus: null,
    interaction: cloze.body.interaction, answerKey: cloze.body.answerKey,
    explanation: [{ type: 'text', text: 'Private explanation' }], scoringPolicyVersion: 'practice-binary-v3' });
  assert.ok(clozePreview.textContent.includes('Thành phố: Hà Nội | Ha Noi'));

  type.value = 'MATCHING'; await type.dispatch('change');
  assert.equal(root.find('draft-cloze-fields'), null);
  root.find('draft-matching-rows').value = 'Hàng một | Xanh\nHàng hai | Đỏ';
  root.find('draft-matching-extra-targets').value = 'Vàng';
  await form.dispatch('submit');
  const matching = requests.filter((request) => request.method === 'POST')[1];
  assert.equal(matching.path, '/api/v4/questions');
  assert.equal(matching.body.schemaVersion, 'question/3');
  assert.deepEqual(matching.body.interaction.targets.map((target) => target.label), ['Vàng', 'Xanh', 'Đỏ']);
  const matchingPreview = api.renderPrivateQuestion({ content: [{ type: 'text', text: 'Synthetic preview' }], stimulus: null,
    interaction: matching.body.interaction, answerKey: matching.body.answerKey,
    explanation: [{ type: 'text', text: 'Private explanation' }], scoringPolicyVersion: 'practice-binary-v3' });
  assert.ok(matchingPreview.textContent.includes('Hàng một → Xanh · Hàng hai → Đỏ'));

  type.value = 'SINGLE_CHOICE'; await type.dispatch('change');
  root.find('draft-answer').value = 'a';
  await form.dispatch('submit');
  const legacy = requests.filter((request) => request.method === 'POST')[2];
  assert.equal(legacy.path, '/api/v1/questions');
  assert.equal(legacy.body.schemaVersion, 'question/1');
  assert.equal(root.find('staff-protocol-filter').value, 'legacy');
});

test('a reviewer without the author template reaches the cloze and matching list only when the route answers', async () => {
  const enabled = await workspace({ capability: true, roles: ['REVIEWER'] });
  const filter = enabled.root.find('staff-protocol-filter');
  assert.ok(filter, 'reviewers can switch to the cloze and matching scope');
  assert.equal(enabled.requests.some((request) => request.path === '/local/workspace/template'), false);
  filter.value = 'cloze-matching'; await filter.dispatch('change');
  assert.ok(enabled.requests.at(-1).path.startsWith('/api/v4/questions?'));
  const disabled = await workspace({ capability: true, roles: ['REVIEWER'], routeEnabled: false });
  assert.equal(disabled.root.find('staff-protocol-filter'), null);
  assert.ok(disabled.requests.at(-1).path.startsWith('/api/v1/questions?'));
});
