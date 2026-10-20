const ACTORS = Object.freeze([
  { key: 'author', label: 'Tác giả tổng hợp' },
  { key: 'reviewer', label: 'Người rà soát tổng hợp' },
  { key: 'bankManager', label: 'Quản lý ngân hàng câu hỏi tổng hợp' },
  { key: 'studentA', label: 'Học viên tổng hợp A' },
]);

const ERROR_TEXT = Object.freeze({
  UNAUTHENTICATED: 'Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.',
  FORBIDDEN: 'Vai trò tổng hợp này không được phép thực hiện thao tác đó.',
  CSRF_FAILED: 'Yêu cầu xác thực chưa hợp lệ. Hãy tải lại khu vực này rồi thử lại.',
  VALIDATION_ERROR: 'Thông tin bản nháp chưa hợp lệ. Hãy kiểm tra các trường rồi thử lại.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu bị trùng với một nội dung khác. Hãy gửi lại thao tác mới.',
  CONCURRENT_MODIFICATION: 'Dữ liệu thay đổi trong lúc thao tác. Hãy tải lại danh sách.',
  REVISION_CONFLICT: 'Phiên bản đã thay đổi. Hãy tải lại trước khi tiếp tục.',
  RIGHTS_BLOCKED: 'Bản ghi quyền sử dụng không cho phép thao tác này.',
  TEMPORARILY_UNAVAILABLE: 'Cơ sở dữ liệu cục bộ chưa thể hoàn tất yêu cầu.',
  PAYLOAD_TOO_LARGE: 'Nội dung vượt quá giới hạn kích thước.',
});

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label, testId, callback, className = 'button') {
  const element = node('button', className, label);
  element.type = 'button';
  element.dataset.testid = testId;
  element.addEventListener('click', () => { void callback(); });
  return element;
}

function readCookie(name) {
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return null;
}

async function request(path, { method = 'GET', body, csrf = false, idempotencyKey } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (csrf) {
    const token = readCookie('tsa_local_csrf');
    if (!token) throw new Error('Phiên cục bộ chưa sẵn sàng. Hãy đăng nhập lại.');
    headers.set('x-csrf-token', token);
  }
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Không thể kết nối với máy chủ cục bộ. Hãy kiểm tra tiến trình Track B rồi thử lại.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error?.code ?? payload?.error ?? 'REQUEST_FAILED';
    const error = new Error(ERROR_TEXT[code] ?? 'Yêu cầu chưa hoàn tất. Hãy thử lại.');
    error.status = response.status;
    error.code = code;
    throw error;
  }
  return payload;
}

function makeHeader() {
  const header = node('header', 'topbar');
  const brand = node('div', 'brand');
  brand.append(node('span', 'brand-mark', 'P'), node('span', 'brand-name', 'KHÔNG GIAN SOẠN THẢO'));
  header.append(brand, node('span', 'demo-chip', 'DỮ LIỆU TỔNG HỢP'));
  return header;
}

function footer() {
  return node('p', 'footer-note', 'Chỉ dành cho kiểm thử cục bộ với dữ liệu tổng hợp. Quyền nguồn hiện ở trạng thái UNKNOWN; bản nháp không phải nội dung đã rà soát, được duyệt hay được phép xuất bản.');
}

function showMessage(container, message, tone = 'notice-panel') {
  let item = container.querySelector('[data-testid="staff-message"]');
  if (!item) {
    item = node('p', tone);
    item.dataset.testid = 'staff-message';
    item.setAttribute('role', 'status');
    container.prepend(item);
  }
  item.className = tone;
  item.textContent = message;
}

function actorSelect() {
  const select = node('select', 'staff-input');
  select.id = 'synthetic-actor';
  select.dataset.testid = 'actor-select';
  for (const actor of ACTORS) {
    const option = node('option', '', actor.label);
    option.value = actor.key;
    select.append(option);
  }
  return select;
}

export async function openStaffWorkspace(container, onBack) {
  const state = { principal: null, template: null, items: [], busy: false, canReadList: false, pendingCreate: null };
  const backButton = () => button('Quay lại khu luyện tập', 'staff-return', onBack, 'button secondary');

  async function refreshSession() {
    const session = await request('/local-auth/session');
    state.principal = session.principal;
  }

  function renderLogin(message = '') {
    const shell = document.createDocumentFragment();
    shell.append(makeHeader());
    const card = node('section', 'staff-card');
    card.append(node('p', 'eyebrow', 'MÁY CHỦ VÀ CƠ SỞ DỮ LIỆU CỤC BỘ'));
    const title = node('h1', '', 'Không gian bản nháp.');
    title.id = 'staff-title';
    card.append(title);
    card.append(node('p', 'staff-intro', 'Đăng nhập bằng một vai trò tổng hợp cố định. Khu này kết nối PostgreSQL cục bộ riêng với phiên luyện tập demo trong bộ nhớ.'));
    const notice = node('p', 'repeat-alert', 'Mọi nội dung ở đây chỉ là dữ liệu kiểm thử tổng hợp. Quyền nguồn UNKNOWN không xác nhận quyền sử dụng; không có chức năng rà soát hoặc xuất bản.');
    card.append(notice);
    const form = node('form', 'staff-login-form');
    const label = node('label', '', 'Vai trò thử nghiệm');
    label.htmlFor = 'synthetic-actor';
    const select = actorSelect();
    const submit = node('button', 'button', 'Đăng nhập tổng hợp');
    submit.type = 'submit';
    submit.dataset.testid = 'staff-login';
    form.append(label, select, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.busy) return;
      state.busy = true;
      submit.disabled = true;
      try {
        const challenge = await request('/local-auth/bootstrap', { method: 'POST', body: {} });
        if (!challenge || typeof challenge.csrfToken !== 'string') throw new Error('Không thể mở phiên đăng nhập cục bộ.');
        await request('/local-auth/login', { method: 'POST', body: { actorKey: select.value }, csrf: true });
        await loadWorkspace();
      } catch (error) {
        showMessage(container, error.message, 'notice-panel');
        submit.disabled = false;
      } finally {
        state.busy = false;
      }
    });
    card.append(form);
    if (message) showMessage(card, message);
    card.append(backButton());
    shell.append(card, footer());
    container.replaceChildren(shell);
  }

  function renderUnavailable() {
    const shell = document.createDocumentFragment();
    shell.append(makeHeader());
    const card = node('section', 'staff-card');
    card.append(node('p', 'eyebrow', 'KHÔNG GIAN NHÂN VIÊN CỤC BỘ'));
    card.append(node('h1', '', 'Không gian bản nháp chưa sẵn sàng.'));
    card.append(node('p', 'staff-intro', 'Máy chủ PostgreSQL cục bộ chưa được khởi chạy. Khu luyện tập demo không cung cấp đăng nhập nhân viên hay lưu bản nháp vào cơ sở dữ liệu.'));
    card.append(node('p', 'repeat-alert', 'Chỉ tiếp tục khi bạn chủ động khởi chạy môi trường Track B với chế độ tổng hợp cục bộ.'));
    card.append(backButton());
    shell.append(card, footer());
    container.replaceChildren(shell);
  }

  function metadataList(items) {
    const list = node('ul', 'staff-question-list');
    if (items.length === 0) {
      list.append(node('li', 'staff-empty', 'Chưa có bản nháp nào trong danh sách.'));
      return list;
    }
    for (const item of items) {
      const row = node('li', 'staff-question-item');
      row.append(node('span', 'staff-state', item.state));
      const info = node('span', 'staff-question-meta');
      info.append(node('strong', '', `${item.section} · ${item.interactionType}`));
      info.append(node('code', '', item.questionId));
      info.append(node('small', '', `Phiên bản ${item.versionId} · ${item.contentHash}`));
      row.append(info);
      list.append(row);
    }
    return list;
  }

  async function loadQuestionList() {
    if (!state.canReadList) throw new Error('Vai trò này không được cấp quyền xem danh sách bản nháp.');
    const result = await request('/api/v1/questions?state=DRAFT&limit=100');
    state.items = result.items;
    const target = container.querySelector('[data-testid="staff-question-list"]');
    if (target) target.replaceChildren(metadataList(state.items));
  }

  function labeledInput(labelText, id, value, multiline = false) {
    const field = node('div', 'staff-field');
    const label = node('label', '', labelText);
    label.htmlFor = id;
    const input = node(multiline ? 'textarea' : 'input', 'staff-input');
    input.id = id;
    input.value = value;
    input.required = true;
    input.dataset.testid = id;
    if (!multiline) input.type = 'text';
    field.append(label, input);
    return { field, input };
  }

  function renderWorkspace() {
    const shell = document.createDocumentFragment();
    shell.append(makeHeader());
    const heading = node('section', 'staff-heading');
    const headingText = node('div');
    headingText.append(node('p', 'eyebrow', 'BẢN NHÁP TRÊN POSTGRESQL CỤC BỘ'));
    headingText.append(node('h1', '', 'Soạn câu hỏi thử nghiệm.'));
    headingText.append(node('p', '', `Vai trò hiện tại: ${state.principal.roles.join(', ')}. Phiên tổng hợp ${state.principal.actorKey} được kiểm tra ở máy chủ.`));
    const actions = node('div', 'staff-header-actions');
    if (state.canReadList) {
      actions.append(button('Tải lại danh sách', 'staff-refresh', async () => {
        try { await loadQuestionList(); showMessage(container, 'Danh sách đã được tải lại từ cơ sở dữ liệu cục bộ.'); }
        catch (error) { showMessage(container, error.message); }
      }, 'button secondary'));
    }
    actions.append(button('Đăng xuất', 'staff-logout', async () => {
      try {
        await request('/local-auth/logout', { method: 'POST', body: {}, csrf: true });
        state.principal = null;
        state.template = null;
        renderLogin('Phiên tổng hợp đã kết thúc.');
      } catch (error) { showMessage(container, error.message); }
    }, 'button secondary small'));
    heading.append(headingText, actions);
    shell.append(heading);
    const note = node('p', 'repeat-alert', 'Nguồn tổng hợp đi kèm trạng thái quyền UNKNOWN, không phải xác nhận cho phép sử dụng. Bản nháp không được rà soát, duyệt hoặc đưa vào đề thi.');
    shell.append(note);

    if (!state.principal.roles.includes('AUTHOR')) {
      const denied = node('section', 'staff-card staff-denied');
      if (state.canReadList) {
        denied.append(node('h2', '', 'Vai trò này chỉ xem được danh sách.'), node('p', '', 'Tạo bản nháp và mở mẫu riêng cần vai trò AUTHOR. Không có thao tác quản lý quyền, rà soát hoặc xuất bản ở đây.'));
        denied.append(button('Tải danh sách', 'staff-refresh-denied', async () => {
          try { await loadQuestionList(); showMessage(container, 'Danh sách đã được tải lại.'); }
          catch (error) { showMessage(container, error.message); }
        }, 'button secondary'));
      } else {
        denied.append(node('h2', '', 'Vai trò này không có quyền xem bản nháp.'), node('p', '', 'Chỉ vai trò AUTHOR, REVIEWER hoặc BANK_MANAGER được mở danh sách nhân viên trong môi trường tổng hợp.'));
      }
      shell.append(denied);
    } else {
      const formCard = node('section', 'staff-card');
      formCard.append(node('h2', '', 'Bản nháp từ mẫu tổng hợp riêng'));
      formCard.append(node('p', 'staff-private-notice', 'Mẫu riêng chỉ được gửi sau khi máy chủ xác nhận vai trò AUTHOR. Chỉnh sửa văn bản, lựa chọn, đáp án và lời giải trước khi tạo bản nháp.'));
      const form = node('form', 'staff-draft-form');
      const prompt = labeledInput('Nội dung câu hỏi', 'draft-prompt', state.template.content[0]?.text ?? '', true);
      prompt.input.rows = 3;
      const firstOption = labeledInput('Lựa chọn A', 'draft-option-a', state.template.interaction.options[0]?.content[0]?.text ?? '');
      const secondOption = labeledInput('Lựa chọn B', 'draft-option-b', state.template.interaction.options[1]?.content[0]?.text ?? '');
      const answerField = node('div', 'staff-field');
      const answerLabel = node('label', '', 'Đáp án trong bản nháp');
      answerLabel.htmlFor = 'draft-answer';
      const answer = node('select', 'staff-input');
      answer.id = 'draft-answer';
      answer.dataset.testid = 'draft-answer';
      for (const [value, labelText] of [['a', 'A'], ['b', 'B']]) {
        const option = node('option', '', labelText);
        option.value = value;
        answer.append(option);
      }
      answer.value = state.template.answerKey.optionId;
      answerField.append(answerLabel, answer);
      const explanation = labeledInput('Lời giải riêng', 'draft-explanation', state.template.explanation[0]?.text ?? '', true);
      explanation.input.rows = 3;
      const create = node('button', 'button', 'Tạo bản nháp');
      create.type = 'submit';
      create.dataset.testid = 'draft-create';
      form.append(prompt.field, firstOption.field, secondOption.field, answerField, explanation.field, create);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.busy) return;
        state.busy = true;
        create.disabled = true;
        try {
          const draft = {
            schemaVersion: 'question/1',
            language: 'vi-VN',
            section: 'MATH',
            taxonomyVersionId: state.template.taxonomyVersionId,
            domainId: state.template.domainId,
            skillIds: state.template.skillIds,
            subskillIds: [],
            cognitiveLevel: null,
            targetDifficulty: 'EASY',
            content: [{ type: 'text', text: prompt.input.value }],
            stimulusVersionId: null,
            interaction: {
              type: 'SINGLE_CHOICE',
              options: [
                { id: 'a', content: [{ type: 'text', text: firstOption.input.value }] },
                { id: 'b', content: [{ type: 'text', text: secondOption.input.value }] },
              ],
            },
            answerKey: { type: 'SINGLE_CHOICE', optionId: answer.value },
            explanation: [{ type: 'text', text: explanation.input.value }],
            evidenceRefs: state.template.evidenceRefs,
            origin: 'MANUAL',
            provenance: state.template.provenance,
          };
          const bodySignature = JSON.stringify(draft);
          if (!state.pendingCreate || state.pendingCreate.bodySignature !== bodySignature) {
            state.pendingCreate = { bodySignature, key: crypto.randomUUID() };
          }
          const result = await request('/api/v1/questions', {
            method: 'POST', body: draft, csrf: true, idempotencyKey: state.pendingCreate.key,
          });
          await loadQuestionList();
          state.pendingCreate = null;
          showMessage(container, `Đã tạo bản nháp DRAFT ${result.questionId}. Chưa có rà soát, phê duyệt hoặc quyền xuất bản.`);
        } catch (error) {
          showMessage(container, error.message);
        } finally {
          state.busy = false;
          create.disabled = false;
        }
      });
      formCard.append(form);
      shell.append(formCard);
    }

    if (state.canReadList) {
      const listCard = node('section', 'staff-card');
      listCard.append(node('div', 'staff-list-heading', 'Danh sách tóm tắt bản nháp'));
      const list = node('div', 'staff-question-list-wrap');
      list.dataset.testid = 'staff-question-list';
      list.append(metadataList(state.items));
      listCard.append(list);
      shell.append(listCard);
    }
    shell.append(button('Quay lại khu luyện tập', 'staff-return', onBack, 'button secondary'), footer());
    container.replaceChildren(shell);
  }

  async function loadWorkspace() {
    await refreshSession();
    if (!state.principal?.authenticated) { renderLogin(); return; }
    state.canReadList = state.principal.roles.some((role) => ['AUTHOR', 'REVIEWER', 'BANK_MANAGER'].includes(role));
    if (state.principal.roles.includes('AUTHOR')) {
      const result = await request('/local/workspace/template');
      state.template = result.template;
    } else {
      state.template = null;
    }
    if (state.canReadList) await loadQuestionList();
    renderWorkspace();
  }

  try {
    await refreshSession();
    if (state.principal?.authenticated) await loadWorkspace();
    else renderLogin();
  } catch (error) {
    if (error.status === 404) renderUnavailable();
    else renderLogin(error.message);
  }
}
