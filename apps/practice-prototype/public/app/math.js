// Render only explicit math blocks. Never interpret ordinary question text as HTML.
let renderer;

export function renderMath(block) {
  const container = document.createElement(block.inline ? 'span' : 'div');
  container.className = `content-math${block.display ? ' display' : ''}${block.inline ? ' inline' : ''}`;
  const visual = document.createElement('span');
  visual.className = 'math-visual';
  const fallback = () => {
    visual.textContent = block.accessibleText || block.tex || 'Biểu thức chưa hiển thị được.';
    container.dataset.mathState = 'fallback';
  };
  if (block.accessibleText) {
    const alternative = document.createElement('span');
    alternative.className = 'sr-only';
    alternative.textContent = block.accessibleText;
    container.append(alternative);
    visual.setAttribute('aria-hidden', 'true');
  }
  fallback();
  container.append(visual);
  // One explicitly allowlisted local asset; missing dependencies retain readable text.
  renderer ??= import('../vendor/katex.mjs');
  renderer.then(({ default: katex }) => {
    try {
      katex.render(block.tex || '', visual, {
        output: 'mathml', displayMode: Boolean(block.display), throwOnError: true,
        trust: false, strict: 'error', maxSize: 10, maxExpand: 500,
        macros: Object.create(null),
      });
      container.dataset.mathState = 'rendered';
    } catch {
      // Parser errors can contain authored input; never insert their HTML/message.
      fallback();
    }
  }).catch(fallback);
  return container;
}

// Authored text marks inline formulas as $...$ (no space inside the dollar signs). Everything else stays plain
// text nodes, so ordinary question text is never parsed as HTML.
const INLINE_MATH = /\$(?=\S)([^$]+?)(?<=\S)\$/gu;

export function renderTextWithMath(text) {
  const fragment = document.createDocumentFragment();
  const source = String(text ?? '');
  let cursor = 0;
  for (const match of source.matchAll(INLINE_MATH)) {
    if (match.index > cursor) fragment.append(source.slice(cursor, match.index));
    fragment.append(renderMath({ tex: match[1], display: false, inline: true }));
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) fragment.append(source.slice(cursor));
  return fragment;
}

const HAS_INLINE_MATH = /\$(?=\S)[^$]+?(?<=\S)\$/u;

/** True for a text block that needs no formula rendering, so callers may show it as plain text. */
export function isPlainTextBlock(block) {
  return block?.type === 'text' && !HAS_INLINE_MATH.test(String(block.text ?? ''));
}
