// Render only explicit math blocks. Never interpret ordinary question text as HTML.
let renderer;

export function renderMath(block) {
  const container = document.createElement('div');
  container.className = `content-math${block.display ? ' display' : ''}`;
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
