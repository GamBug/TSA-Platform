import assert from 'node:assert/strict';
import test from 'node:test';

function fakeNode(tag) {
  return {
    tag, className: '', dataset: {}, children: [], textContent: '',
    append(...items) { this.children.push(...items); },
    setAttribute() {},
  };
}

globalThis.document = {
  createElement: fakeNode,
  createDocumentFragment: () => fakeNode('#fragment'),
};
const { isPlainTextBlock, renderTextWithMath } = await import('../public/app/math.js');

const describe = (child) => (typeof child === 'string' ? child : `${child.tag}.${child.className}`);

test('inline $...$ becomes an inline math element and the rest stays text', () => {
  const fragment = renderTextWithMath('Điểm cực tiểu của hàm số $y=-x^3+x^2+5x-5$ là');
  assert.deepEqual(fragment.children.map(describe),
    ['Điểm cực tiểu của hàm số ', 'span.content-math inline', ' là']);
});

test('several formulas, formula-only text and no formula are all handled', () => {
  assert.deepEqual(renderTextWithMath('$(-1;-8)$').children.map(describe), ['span.content-math inline']);
  assert.deepEqual(renderTextWithMath('$a$ và $\\frac53$').children.map(describe),
    ['span.content-math inline', ' và ', 'span.content-math inline']);
  assert.deepEqual(renderTextWithMath('-8').children.map(describe), ['-8']);
  assert.deepEqual(renderTextWithMath('').children, []);
});

test('currency-like dollar signs are not treated as formulas', () => {
  assert.deepEqual(renderTextWithMath('Giá $5 và $ 6').children.map(describe), ['Giá $5 và $ 6']);
});

test('text is never parsed as HTML', () => {
  const fragment = renderTextWithMath('<img src=x onerror=alert(1)> $x$');
  assert.equal(fragment.children[0], '<img src=x onerror=alert(1)> ');
});

test('only formula-free text blocks are plain', () => {
  assert.equal(isPlainTextBlock({ type: 'text', text: '-8' }), true);
  assert.equal(isPlainTextBlock({ type: 'text', text: '$x^2$' }), false);
  assert.equal(isPlainTextBlock({ type: 'math', tex: 'x' }), false);
});
