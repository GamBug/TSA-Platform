const TOPIC_LABELS = { MATH: 'Tư duy Toán học', READING: 'Tư duy Đọc hiểu', SCIENCE: 'Tư duy Khoa học / Giải quyết vấn đề',
  ALGEBRA: 'Đại số', MATH_REASONING: 'Toán học và suy luận', READING_REASONING: 'Đọc và suy luận',
  SCIENCE_REASONING: 'Phân tích thông tin khoa học' };
const topicLabel = (item) => (!item.label || item.label === item.code) ? TOPIC_LABELS[item.code] ?? item.code : item.label;

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}

/** Mount one identity-scoped catalog; stale responses never replace a newer route. */
export function mountTopicPractice(host, { load, create, onAttempt, onResume, canCreate, isCurrent }) {
  const selected = new Set();
  let catalog;
  let busy = false;
  let intent = null;
  const heading = node('h2', 'Chọn chủ đề luyện tập');
  const description = node('p', 'Chọn một hoặc nhiều chủ đề trong cùng phần thi. Số câu lấy từ ngân hàng đủ điều kiện hiện tại.', 'topic-description');
  const status = node('p', 'Đang tải cây chủ đề…', 'topic-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.dataset.testid = 'topic-status';
  const tree = node('div', undefined, 'topic-tree');
  tree.dataset.testid = 'topic-tree';
  const form = node('form', undefined, 'topic-configuration');
  const countLabel = node('label', 'Số câu');
  const count = node('input');
  count.type = 'number'; count.min = '1'; count.max = '100'; count.value = '2'; count.required = true;
  count.id = 'topic-question-count'; count.dataset.testid = 'topic-question-count'; countLabel.htmlFor = count.id;
  const timingLabel = node('label', 'Thời lượng (phút, tùy chọn)');
  const timing = node('input');
  timing.type = 'number'; timing.min = '1'; timing.max = '180'; timing.placeholder = 'Theo cấu hình máy chủ';
  timing.id = 'topic-duration'; timing.dataset.testid = 'topic-duration'; timingLabel.htmlFor = timing.id;
  const start = node('button', 'Tạo bài luyện tập', 'button');
  start.type = 'submit'; start.dataset.testid = 'topic-start'; start.disabled = true;
  const retry = node('button', 'Tải lại chủ đề', 'button secondary');
  retry.type = 'button'; retry.dataset.testid = 'topic-reload';
  const summary = node('p', 'Chưa chọn chủ đề.', 'topic-selection-summary');
  summary.dataset.testid = 'topic-selection-summary'; summary.setAttribute('aria-live', 'polite');
  form.append(countLabel, count, timingLabel, timing, start);
  host.append(heading, description, status, tree, summary, form, retry);

  function descendants(item) {
    return [item, ...(item.children ?? []).flatMap(descendants)];
  }
  function allNodes() { return (catalog?.groups ?? []).flatMap(descendants); }
  function sync() {
    const chosen = allNodes().filter((item) => selected.has(item.id));
    summary.textContent = chosen.length ? `Đã chọn ${chosen.length} chủ đề. Máy chủ kiểm tra lại tồn kho khi tạo bài.` : 'Chưa chọn chủ đề.';
    for (const input of tree.querySelectorAll('input[type="checkbox"]')) {
      const item = allNodes().find((entry) => entry.id === input.value);
      const ids = descendants(item).map((entry) => entry.id);
      const n = ids.filter((id) => selected.has(id)).length;
      input.checked = n === ids.length && ids.length > 0;
      input.indeterminate = n > 0 && n < ids.length;
      input.disabled = busy;
    }
    start.disabled = busy || selected.size === 0 || !canCreate();
    count.disabled = timing.disabled = busy;
  }
  function renderItem(item) {
    const children = item.children ?? [];
    const row = node('label', undefined, 'topic-row');
    const input = node('input'); input.type = 'checkbox'; input.value = item.id;
    input.dataset.testid = 'topic-select';
    const label = node('span', children.length ? `Chọn toàn bộ ${topicLabel(item)}` : topicLabel(item), 'topic-label');
    const stats = node('span', `${item.eligibleCount ?? 0} câu khả dụng · ${item.attemptedCount ?? 0} đã làm`, 'topic-stats');
    if (item.accuracy !== null && item.accuracy !== undefined) stats.append(document.createTextNode(` · ${Math.round(item.accuracy)}% đúng`));
    input.addEventListener('change', () => {
      const first = allNodes().find((entry) => selected.has(entry.id));
      if (input.checked && first && (first.taxonomyVersionId !== item.taxonomyVersionId || first.rootId !== item.rootId)) {
        input.checked = false;
        status.textContent = 'Chọn các chủ đề trong cùng một phần và phiên bản phân loại. Bỏ lựa chọn cũ để đổi phần.';
        return;
      }
      intent = null;
      const members = descendants(item);
      for (const entry of members) { if (input.checked) selected.add(entry.id); else selected.delete(entry.id); }
      if (!input.checked) {
        for (const ancestor of allNodes().filter((entry) => entry.id !== item.id && descendants(entry).some((child) => child.id === item.id))) selected.delete(ancestor.id);
      }
      sync();
    });
    row.append(input, label, stats);
    if (!children.length) return row;
    const details = node('details', undefined, 'topic-group'); details.open = true;
    const disclosure = node('summary', topicLabel(item));
    disclosure.dataset.testid = 'topic-expand';
    details.append(disclosure, row, ...children.map(renderItem));
    return details;
  }
  async function refresh(preserveSelection = false) {
    if (busy) return;
    busy = true; status.textContent = 'Đang tải cây chủ đề…'; retry.disabled = true; sync();
    try {
      const result = await load({ durationSeconds: timing.value ? Number(timing.value) * 60 : Number(count.value) * 60 });
      if (!isCurrent() || !host.isConnected) return;
      const normalize = (item, taxonomyVersionId, rootId) => ({ ...item, taxonomyVersionId: item.taxonomyVersionId ?? taxonomyVersionId, rootId,
        children: (item.children ?? []).map((child) => normalize(child, item.taxonomyVersionId ?? taxonomyVersionId, rootId)) });
      if (!Array.isArray(result?.groups)) throw new Error('Danh mục chủ đề chưa đúng định dạng.');
      catalog = { ...result, groups: [...result.groups].sort((left, right) => ({ MATH: 0, READING: 1, SCIENCE: 2 }[left.code] ?? 3) - ({ MATH: 0, READING: 1, SCIENCE: 2 }[right.code] ?? 3)).map((item) => normalize(item, item.taxonomyVersionId, item.id)) };
      if (!preserveSelection) selected.clear();
      else for (const id of selected) if (!allNodes().some((item) => item.id === id)) selected.delete(id);
      intent = null;
      tree.replaceChildren(...catalog.groups.map(renderItem));
      status.textContent = catalog.groups.length ? 'Số câu khả dụng được cập nhật theo thời lượng đã chọn.' : 'Chưa có chủ đề được đăng ký hoặc câu hỏi đủ điều kiện.';
    } catch (error) {
      if (!isCurrent() || !host.isConnected) return;
      status.textContent = error.message || 'Chưa tải được chủ đề. Hãy thử lại.';
    } finally {
      busy = false; retry.disabled = false; if (host.isConnected) sync();
    }
  }
  retry.addEventListener('click', () => refresh());
  for (const input of [count, timing]) input.addEventListener('change', () => {
    if (Number.isSafeInteger(Number(count.value)) && Number(count.value) >= 1 && Number(count.value) <= 100
        && (!timing.value || Number.isSafeInteger(Number(timing.value)) && Number(timing.value) >= 1 && Number(timing.value) <= 180)) void refresh(true);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !isCurrent() || !canCreate() || !selected.size || !form.reportValidity()) return;
    const taxonomyVersionId = allNodes().find((item) => selected.has(item.id))?.taxonomyVersionId;
    const body = { taxonomyVersionId, topicIds: [...selected].sort(), questionCount: Number(count.value),
      ...(timing.value ? { durationSeconds: Number(timing.value) * 60 } : {}) };
    const signature = JSON.stringify(body);
    if (!intent || intent.signature !== signature) intent = { signature, body, key: crypto.randomUUID() };
    busy = true; status.textContent = 'Đang tạo bài từ câu hỏi đủ điều kiện…'; retry.disabled = true; sync();
    try {
      const attempt = await create(intent);
      if (!isCurrent() || !host.isConnected) return;
      intent = null;
      onAttempt(attempt);
    } catch (error) {
      if (!isCurrent() || !host.isConnected) return;
      if (error.status >= 400 && error.status < 500 && error.status !== 429) intent = null;
      status.textContent = error.code === 'INSUFFICIENT_ELIGIBLE_INVENTORY'
        ? 'Chưa đủ câu hỏi mới đủ điều kiện cho lựa chọn này. Giảm số câu hoặc chọn thêm chủ đề cùng phần.'
        : error.message || 'Chưa xác nhận được việc tạo bài. Thử lại giữ nguyên yêu cầu để tránh tạo trùng.';
    } finally { busy = false; retry.disabled = false; if (host.isConnected) sync(); }
  });
  if (!canCreate()) {
    const resume = node('button', 'Tiếp tục bài đang làm', 'button secondary');
    resume.type = 'button'; resume.dataset.testid = 'topic-resume'; resume.addEventListener('click', onResume);
    host.append(resume);
  }
  void refresh();
}
