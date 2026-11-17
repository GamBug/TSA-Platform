import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { renderQuestionImage } from '../public/app/question-media.js';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; }
  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
  setAttribute() {}
  addEventListener(name, handler) { this.events[name] = handler; }
}

const attemptId = '00000000-0000-4000-8000-000000000001';
const assetVersionId = '00000000-0000-4000-8000-000000000002';
const block = { type: 'image', assetVersionId, alt: 'Synthetic diagram' };
const source = await readFile(new URL('../public/app/main.js', import.meta.url), 'utf8');
const modeSetup = source.slice(source.indexOf('const studentMode ='), source.indexOf('let characterShortcutsEnabled'));
const renderContent = source.slice(source.indexOf('function renderContentBlocks('), source.indexOf('function modeLabel()'));

test('question and released explanation images use the active student protocol', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  try {
    for (const [mode, version] of [['postgres', 'v1'], ['postgres-v2', 'v2'], ['postgres-v4', 'v4']]) {
      let apiVersion;
      const context = { URLSearchParams, window: { location: { search: `?student=${mode}` } },
        productHeader: { dataset: {} }, createPersistentApi: options => { apiVersion = options.apiVersion; return {}; },
        state: { attempt: { attemptId } }, element: tag => new Element(tag), renderQuestionImage, block };
      vm.runInNewContext(modeSetup, context);
      assert.equal(apiVersion, version);
      for (const purpose of ['question', 'explanation']) {
        context.purpose = purpose;
        const content = vm.runInNewContext(`${renderContent}\nrenderContentBlocks([block], { purpose });`, context);
        const figure = content.children[0], button = figure.children[0], image = button.children[0];
        assert.equal(image?.tag, 'img', `${mode} must render an image`);
        assert.equal(image.src, `/api/${version}/attempts/${attemptId}/assets/${assetVersionId}?purpose=${purpose}`);
      }
    }
    const denied = renderQuestionImage(block, { attemptId, apiVersion: 'v5' });
    assert.equal(denied.children.some(child => child.tag === 'button'), false);
  } finally { globalThis.document = previous; }
});
