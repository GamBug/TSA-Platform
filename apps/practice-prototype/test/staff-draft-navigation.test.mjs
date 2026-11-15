import assert from 'node:assert/strict';
import test from 'node:test';
import { Element, loadScript } from './staff-dom-adapter.mjs';

async function workspace({ create } = {}) {
  const root = new Element('main'), listeners = new Set(), requests = [];
  const browser = { allowDiscard: false, confirmations: 0,
    addEventListener(name, callback) { if (name === 'beforeunload') listeners.add(callback); },
    removeEventListener(name, callback) { if (name === 'beforeunload') listeners.delete(callback); },
    confirm() { this.confirmations++; return this.allowDiscard; } };
  let authenticated = true, back = 0;
  const template = { taxonomyVersionId: 'tax', section: 'MATH', domainId: 'domain', skillIds: ['skill'],
    content: [{ type: 'text', text: 'Synthetic question' }],
    interaction: { type: 'SINGLE_CHOICE', options: ['a', 'b'].map(id => ({ id, content: [{ type: 'text', text: id }] })) },
    answerKey: { type: 'SINGLE_CHOICE', optionId: 'a' }, explanation: [{ type: 'text', text: 'Synthetic explanation' }],
    evidenceRefs: ['evidence'], provenance: [{ sourceVersionId: 'source' }] };
  const document = { cookie: 'tsa_local_csrf=synthetic-csrf', createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('fragment') };
  const api = loadScript({ document, window: browser, fetch: async (path, options) => {
    requests.push({ path, method: options.method, body: options.body && JSON.parse(options.body) });
    if (path === '/local-auth/session') return Response.json({ principal: authenticated
      ? { authenticated: true, userId: 'author', actorKey: 'author', roles: ['AUTHOR'] } : null });
    if (path === '/local-auth/logout') { authenticated = false; return Response.json({ authenticated: false }); }
    if (path === '/local/workspace/template') return Response.json({ template, taxonomies: [{ taxonomyVersionId: 'tax',
      name: 'Synthetic taxonomy', versionNo: 1, nodes: [{ id: 'domain', code: 'MATH', kind: 'DOMAIN', parentId: null },
        { id: 'skill', code: 'MATH_REASONING', kind: 'SKILL', parentId: 'domain' }] }] });
    if (path.startsWith('/api/v1/questions?')) return Response.json({ items: [], nextCursor: null });
    if (path === '/api/v1/questions' && options.method === 'POST') return create
      ? create() : Response.json({ questionId: 'created-question', versionId: 'created-version' }, { status: 201 });
    throw new Error(`Unexpected request ${path}`);
  } });
  const open = () => api.openStaffWorkspace(root, () => { back++; root.replaceChildren(new Element('section')); });
  await open();
  const unloadBlocked = () => {
    let prevented = false;
    const event = { preventDefault() { prevented = true; }, returnValue: undefined };
    for (const callback of listeners) callback(event);
    return prevented;
  };
  return { root, document, browser, requests, listeners, open, unloadBlocked, back: () => back,
    edit: async (value = 'Unsaved author text') => { root.find('draft-prompt').value = value; await root.querySelector('form').dispatch('input'); } };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('author draft edits block unload and cancelled navigation preserves the editor', async () => {
  const h = await workspace();
  assert.equal(h.unloadBlocked(), false, 'the unchanged template needs no warning');
  await h.edit();
  assert.equal(h.unloadBlocked(), true);
  await h.root.find('staff-return').dispatch('click');
  assert.equal(h.back(), 0);
  await h.root.find('staff-logout').dispatch('click'); await settle();
  assert.equal(h.requests.some(request => request.path === '/local-auth/logout'), false);
  assert.equal(h.root.find('draft-prompt').value, 'Unsaved author text');
  assert.equal(h.browser.confirmations, 2);
  h.browser.allowDiscard = true;
  await h.root.find('staff-return').dispatch('click');
  assert.equal(h.back(), 1);
  assert.equal(h.listeners.size, 0, 'leaving the workspace removes its unload handler');
});

test('a confirmed creation clears the warning but edits made during the request remain unsaved', async () => {
  for (const editDuringSave of [false, true]) {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const h = await workspace({ create: () => pending });
    await h.edit();
    const submission = h.root.querySelector('form').dispatch('submit');
    await settle();
    assert.equal(h.unloadBlocked(), true, 'an unconfirmed creation must remain protected');
    if (editDuringSave) await h.edit('Newer edits while saving');
    release(Response.json({ questionId: 'created-question', versionId: 'created-version' }, { status: 201 }));
    await submission;
    assert.equal(h.unloadBlocked(), editDuringSave);
    assert.equal(h.requests.find(request => request.path === '/api/v1/questions').body.content[0].text, 'Unsaved author text');
    assert.equal(h.root.find('draft-prompt').value, editDuringSave ? 'Newer edits while saving' : 'Unsaved author text');
  }
});

test('a lost creation acknowledgement protects the pending command even for an unchanged template', async () => {
  const h = await workspace({ create: () => { throw new TypeError('Synthetic lost acknowledgement'); } });
  assert.equal(h.unloadBlocked(), false);
  await h.root.querySelector('form').dispatch('submit');
  assert.equal(h.unloadBlocked(), true);
  await h.root.find('staff-return').dispatch('click');
  assert.equal(h.back(), 0);
});

test('logout and workspace replacement clear old draft guards and private pending state', async () => {
  const h = await workspace();
  await h.edit();
  await h.open();
  assert.equal(h.listeners.size, 1, 'replacement must not accumulate listeners');
  assert.equal(h.unloadBlocked(), false);
  await h.edit(); h.browser.allowDiscard = true;
  await h.root.find('staff-logout').dispatch('click'); await settle();
  assert.ok(h.requests.some(request => request.path === '/local-auth/logout'));
  assert.equal(h.root.find('draft-prompt'), null);
  assert.equal(h.unloadBlocked(), false);
});

test('a changed session clears private unsaved fields without a discard prompt', async () => {
  const h = await workspace();
  await h.edit();
  h.document.cookie = 'tsa_local_csrf=replacement-session';
  await h.root.find('staff-refresh').dispatch('click'); await settle();
  assert.equal(h.root.find('draft-prompt'), null);
  assert.equal(h.unloadBlocked(), false);
  assert.equal(h.browser.confirmations, 0, 'privacy invalidation must not wait for discard consent');
});
