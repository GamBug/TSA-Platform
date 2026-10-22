import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Exercise the actual private UI callback without introducing a production
// export or a DOM dependency solely for a delayed-response regression.
const source = await readFile(new URL('../public/app/main.js', import.meta.url), 'utf8');
const match = source.match(/^async function refreshPersistentHistory\(\) \{[\s\S]*?(?=^function |^async function )/m);
assert.ok(match, 'the real history callback exists');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
for (const outcome of ['success', 'authentication failure']) test(`late history ${outcome} cannot overwrite or clear a newer identity`, async () => {
  const state = { identityGeneration: 1, history: [{ attemptId: 'candidate-a' }], historyStatus: '' };
  const gate = deferred(); let renders = 0, errorHandlers = 0;
  const refresh = new Function('state', 'api', 'persistentMode', 'app', 'renderCatalog', 'handlePersistentError',
    `return (${match[0]});`)(state, { loadHistory: () => gate.promise }, true,
    { querySelector: () => ({}) }, () => { renders++; }, () => { errorHandlers++; return true; });
  const pending = refresh();
  state.identityGeneration += 1;
  const current = [{ attemptId: 'candidate-b' }]; state.history = current;
  if (outcome === 'success') gate.resolve([{ attemptId: 'candidate-a', score: { percentage: '100.00' } }]);
  else gate.reject(Object.assign(new Error('Old session ended'), { code: 'UNAUTHENTICATED', status: 401 }));
  await pending;
  assert.equal(state.history, current); assert.equal(renders, 0); assert.equal(errorHandlers, 0);
});
