const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Images use only the owned-attempt asset route, never source URLs or paths. */
export function renderQuestionImage(block, { attemptId, purpose = 'question' } = {}) {
  const figure = document.createElement('figure'); figure.className = 'question-image';
  const alternative = document.createElement('p');
  alternative.textContent = block.alt || 'Hình minh họa chưa khả dụng.';
  figure.append(alternative);
  if (block.caption) {
    const caption = document.createElement('figcaption'); caption.textContent = block.caption; figure.append(caption);
  }
  if (!UUID.test(attemptId) || !UUID.test(block.assetVersionId) || !['question', 'explanation'].includes(purpose)) return figure;
  const url = `/api/v1/attempts/${attemptId}/assets/${block.assetVersionId}?purpose=${purpose}`;
  const enlarge = document.createElement('button'); enlarge.type = 'button'; enlarge.className = 'question-image-enlarge';
  enlarge.setAttribute('aria-label', `Phóng to hình: ${block.alt}`); enlarge.setAttribute('aria-haspopup', 'dialog');
  enlarge.disabled = true;
  const image = document.createElement('img'); image.alt = block.alt; image.loading = 'lazy'; image.decoding = 'async';
  image.addEventListener('load', () => { alternative.hidden = true; enlarge.disabled = false; });
  image.addEventListener('error', () => { alternative.hidden = false; enlarge.hidden = true; });
  const hint = document.createElement('span'); hint.className = 'question-image-hint';
  hint.textContent = 'Phóng to hình'; hint.setAttribute('aria-hidden', 'true');
  image.src = url; enlarge.append(image, hint); figure.prepend(enlarge);
  enlarge.addEventListener('click', () => {
    const dialog = document.createElement('dialog'); dialog.className = 'question-image-dialog';
    dialog.setAttribute('aria-label', `Hình phóng to: ${block.alt}`);
    const expanded = document.createElement('img'); expanded.src = url; expanded.alt = block.alt;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'button secondary'; close.textContent = 'Đóng hình';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); if (enlarge.isConnected) enlarge.focus(); });
    dialog.append(expanded, close); figure.append(dialog); dialog.showModal(); close.focus();
  });
  return figure;
}
