import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the real private callbacks, as in persistent-state.test.mjs, without
// adding production exports or a DOM dependency for delayed-response checks.
const source = await readFile(new URL('../public/app/simulation.js', import.meta.url), 'utf8');
function between(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `actual callback exists: ${start}`);
  return source.slice(from, to);
}
function harness() {
  let resolve, reject, poll;
  const response = new Promise((yes, no) => { resolve = yes; reject = no; });
  const current = { nonce: 'session-a', renders: 0 };
  const context = { authenticated: true, boundNonce: current.nonce, view: { attemptId: 'attempt-a', state: 'SUBMITTED' },
    busy: false, polling: false, readSequence: 0, pending: null, draft: null, uncertainSwitch: null,
    released: null, notice: '', keys: new Map(), csrf: () => current.nonce,
    render: () => { current.renders++; }, setInterval: callback => { poll = callback; return 1; },
    fetch: () => response, performance, sectionId: 'math', syncedAt: 0 };
  vm.runInNewContext([
    between('  function clearIdentity()', '  function el('),
    between('  async function request(', '  async function run('),
    between('  function accept(', '  async function home('),
    between('  const timer=setInterval(', "  window.addEventListener('pagehide'"),
  ].join('\n'), context);
  return { context, current, poll, resolve, reject };
}

for (const outcome of ['authentication failure', 'network failure', 'success']) {
  test(`late simulation poll ${outcome} cannot disturb a replacement identity`, async () => {
    const h = harness();
    const pending = h.poll();
    h.current.nonce = 'session-b';
    h.context.boundNonce = 'session-b';
    h.context.readSequence += 2;
    const replacement = { attemptId: 'attempt-b', state: 'SUBMITTED' };
    h.context.view = replacement;
    h.context.notice = 'Current session status';
    if (outcome === 'network failure') h.reject(new Error('Synthetic lost response'));
    else h.resolve(new Response(JSON.stringify(outcome === 'success'
      ? { attemptId: 'attempt-a', state: 'SUBMITTED' }
      : { error: { code: 'UNAUTHENTICATED' } }), { status: outcome === 'success' ? 200 : 401 }));
    await pending;
    assert.equal(h.context.authenticated, true);
    assert.equal(h.context.view, replacement);
    assert.equal(h.context.notice, 'Current session status');
    assert.equal(h.current.renders, 0, 'stale polling must not rerender current controls');
    assert.equal(h.context.polling, false);
  });
}

test('current simulation poll still clears a revoked identity', async () => {
  const h = harness();
  const pending = h.poll();
  h.resolve(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }));
  await pending;
  assert.equal(h.context.authenticated, false);
  assert.equal(h.context.view, null);
  assert.equal(h.current.renders, 1);
  assert.equal(h.context.polling, false);
});

for (const status of [200, 503]) {
  test(`a newer same-session read fences an older simulation poll with status ${status}`, async () => {
    const h = harness();
    const pending = h.poll();
    h.context.readSequence++;
    const replacement = { attemptId: 'attempt-a', state: 'SUBMITTED', revision: 'newer' };
    h.context.view = replacement;
    h.context.notice = 'Current saved state';
    h.resolve(new Response(JSON.stringify(status === 200
      ? { attemptId: 'attempt-a', state: 'SUBMITTED' }
      : { error: { code: 'TEMPORARILY_UNAVAILABLE' } }), { status }));
    await pending;
    assert.equal(h.context.view, replacement);
    assert.equal(h.context.notice, 'Current saved state');
    assert.equal(h.current.renders, 0);
    assert.equal(h.context.polling, false);
  });
}

test('a current successful simulation poll accepts and renders its refreshed state', async () => {
  const h = harness();
  const pending = h.poll();
  h.resolve(new Response(JSON.stringify({ attemptId: 'attempt-a', state: 'SUBMITTED',
    sections: [{ sectionId: 'math', firstOpenedAt: '2026-11-12T00:00:00Z' }] })));
  await pending;
  assert.equal(h.context.view.attemptId, 'attempt-a');
  assert.equal(h.context.view.sections.length, 1);
  assert.equal(h.current.renders, 1);
  assert.equal(h.context.authenticated, true);
  assert.equal(h.context.polling, false);
});
