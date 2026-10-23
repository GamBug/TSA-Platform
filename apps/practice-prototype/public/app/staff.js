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

const QUESTION_STATES = Object.freeze([
  ['', 'Tất cả trạng thái'],
  ['DRAFT', 'Bản nháp'],
  ['IN_REVIEW', 'Đang chờ rà soát'],
  ['APPROVED', 'Đã duyệt'],
  ['REJECTED', 'Bị từ chối'],
  ['QUARANTINED', 'Đang cách ly'],
  ['RETIRED', 'Đã ngừng sử dụng'],
]);

const QUESTION_SECTIONS = Object.freeze([
  ['', 'Tất cả miền'],
  ['MATH', 'Toán học'],
  ['READING', 'Đọc hiểu'],
  ['SCIENCE', 'Khoa học'],
]);

const STATE_LABELS = Object.freeze(Object.fromEntries(QUESTION_STATES.filter(([value]) => value)));
const ACTIVE_WORKSPACE_GENERATIONS = new WeakMap();

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
  const workspaceGeneration = (ACTIVE_WORKSPACE_GENERATIONS.get(container) ?? 0) + 1;
  ACTIVE_WORKSPACE_GENERATIONS.set(container, workspaceGeneration);
  const isWorkspaceActive = () => ACTIVE_WORKSPACE_GENERATIONS.get(container) === workspaceGeneration;
  const invalidateWorkspace = () => {
    if (!isWorkspaceActive()) return false;
    ACTIVE_WORKSPACE_GENERATIONS.set(container, workspaceGeneration + 1);
    return true;
  };
  const showWorkspaceMessage = (target, message, tone) => {
    if (isWorkspaceActive()) showMessage(target, message, tone);
  };
  const state = {
    principal: null,
    template: null,
    items: [],
    nextCursor: null,
    filters: { state: 'DRAFT', section: '' },
    busy: false,
    canReadList: false,
    listLoading: false,
    listLoadingMore: false,
    listError: null,
    listRequestId: 0,
    identityEpoch: 0,
    pendingCreate: null,
  };
  const returnToPractice = () => {
    if (!invalidateWorkspace()) return;
    onBack();
  };
  const backButton = () => button('Quay lại khu luyện tập', 'staff-return', returnToPractice, 'button secondary');

  async function refreshSession() {
    const session = await request('/local-auth/session');
    if (!isWorkspaceActive()) return false;
    state.principal = session.principal;
    return true;
  }

  function renderLogin(message = '') {
    if (!isWorkspaceActive()) return;
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
      if (!isWorkspaceActive() || state.busy) return;
      state.busy = true;
      submit.disabled = true;
      try {
        const challenge = await request('/local-auth/bootstrap', { method: 'POST', body: {} });
        if (!isWorkspaceActive()) return;
        if (!challenge || typeof challenge.csrfToken !== 'string') throw new Error('Không thể mở phiên đăng nhập cục bộ.');
        await request('/local-auth/login', { method: 'POST', body: { actorKey: select.value }, csrf: true });
        if (!isWorkspaceActive()) return;
        await loadWorkspace();
      } catch (error) {
        showWorkspaceMessage(container, error.message, 'notice-panel');
        if (isWorkspaceActive()) submit.disabled = false;
      } finally {
        if (isWorkspaceActive()) state.busy = false;
      }
    });
    card.append(form);
    if (message) showWorkspaceMessage(card, message);
    card.append(backButton());
    shell.append(card, footer());
    container.replaceChildren(shell);
  }

  function renderUnavailable() {
    if (!isWorkspaceActive()) return;
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
      list.append(node('li', 'staff-empty', 'Không có câu hỏi nào phù hợp với bộ lọc.'));
      return list;
    }
    for (const item of items) {
      const row = node('li', 'staff-question-item');
      row.append(node('span', 'staff-state', `${STATE_LABELS[item.state] ?? item.state} (${item.state})`));
      const info = node('span', 'staff-question-meta');
      info.append(node('strong', '', `${item.section} · ${item.interactionType}`));
      info.append(node('code', '', item.questionId));
      info.append(node('small', '', `Phiên bản ${item.versionId} · ${item.contentHash}`));
      row.append(info);
      list.append(row);
    }
    return list;
  }

  function principalKey(principal) {
    if (!principal) return '';
    return JSON.stringify([principal.userId, principal.actorKey, [...principal.roles].sort()]);
  }

  function updateQuestionListView() {
    if (!isWorkspaceActive()) return;
    const target = container.querySelector('[data-testid="staff-question-list"]');
    if (target) target.replaceChildren(metadataList(state.items));

    const status = container.querySelector('[data-testid="staff-list-status"]');
    if (status) {
      status.textContent = state.listLoading
        ? state.listLoadingMore ? 'Đang tải trang metadata tiếp theo…' : 'Đang tải danh sách metadata…'
        : state.listError ? `Không thể tải danh sách metadata: ${state.listError}`
          : state.items.length === 0 ? 'Không có bản ghi metadata phù hợp với bộ lọc.'
            : `Đang hiển thị ${state.items.length} bản ghi metadata${state.nextCursor ? '. Có thể tải trang tiếp theo.' : '.'}`;
      status.setAttribute('role', state.listError ? 'alert' : 'status');
      status.setAttribute('aria-live', state.listError ? 'assertive' : 'polite');
    }

    const more = container.querySelector('[data-testid="staff-load-more"]');
    if (more) {
      more.hidden = !state.nextCursor;
      more.disabled = state.listLoading || !state.nextCursor;
    }
  }

  async function loadQuestionList({ reset = true } = {}) {
    if (!isWorkspaceActive()) return;
    if (!state.canReadList) throw new Error('Vai trò này không được cấp quyền xem danh sách bản nháp.');
    if (!reset && (state.listLoading || !state.nextCursor)) return;

    const requestId = ++state.listRequestId;
    const identityEpoch = state.identityEpoch;
    const requestPrincipal = principalKey(state.principal);
    const requestFilters = { ...state.filters };
    const cursor = reset ? null : state.nextCursor;
    const filterKey = JSON.stringify(requestFilters);
    if (reset) {
      state.items = [];
      state.nextCursor = null;
    }
    state.listLoading = true;
    state.listLoadingMore = !reset;
    state.listError = null;
    updateQuestionListView();

    const isCurrent = () => isWorkspaceActive()
      && requestId === state.listRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && filterKey === JSON.stringify(state.filters);
    const params = new URLSearchParams({ limit: '20' });
    if (requestFilters.state) params.set('state', requestFilters.state);
    if (requestFilters.section) params.set('section', requestFilters.section);
    if (cursor) params.set('cursor', cursor);

    try {
      const result = await request(`/api/v1/questions?${params.toString()}`);
      if (!isCurrent()) return;
      state.items = reset ? result.items : [...state.items, ...result.items];
      state.nextCursor = result.nextCursor;
    } catch (error) {
      if (isCurrent()) state.listError = error.message;
    } finally {
      if (isCurrent()) {
        state.listLoading = false;
        state.listLoadingMore = false;
        updateQuestionListView();
      }
    }
  }

  function questionFilter(labelText, id, options, selected, onChange) {
    const field = node('div', 'staff-field');
    const label = node('label', '', labelText);
    label.htmlFor = id;
    const select = node('select', 'staff-input');
    select.id = id;
    select.dataset.testid = id;
    for (const [value, text] of options) {
      const option = node('option', '', text);
      option.value = value;
      select.append(option);
    }
    select.value = selected;
    select.addEventListener('change', () => {
      if (isWorkspaceActive()) onChange(select.value);
    });
    field.append(label, select);
    return field;
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
    if (!isWorkspaceActive()) return;
    const shell = document.createDocumentFragment();
    shell.append(makeHeader());
    const heading = node('section', 'staff-heading');
    const headingText = node('div');
    headingText.append(node('p', 'eyebrow', 'BẢN NHÁP TRÊN POSTGRESQL CỤC BỘ'));
    headingText.append(node('h1', '', state.principal.roles.includes('AUTHOR') ? 'Soạn câu hỏi thử nghiệm.' : 'Theo dõi câu hỏi thử nghiệm.'));
    headingText.append(node('p', '', `Vai trò hiện tại: ${state.principal.roles.join(', ')}. Phiên tổng hợp ${state.principal.actorKey} được kiểm tra ở máy chủ.`));
    const actions = node('div', 'staff-header-actions');
    if (state.canReadList) {
      actions.append(button('Tải lại danh sách', 'staff-refresh', async () => {
        if (!isWorkspaceActive()) return;
        try {
          await loadQuestionList({ reset: true });
        } catch (error) {
          showWorkspaceMessage(container, error.message);
        }
      }, 'button secondary'));
    }
    actions.append(button('Đăng xuất', 'staff-logout', async () => {
      if (!isWorkspaceActive()) return;
      try {
        await request('/local-auth/logout', { method: 'POST', body: {}, csrf: true });
        if (!isWorkspaceActive()) return;
        state.identityEpoch += 1;
        state.listRequestId += 1;
        state.principal = null;
        state.template = null;
        state.canReadList = false;
        state.items = [];
        state.nextCursor = null;
        state.listLoading = false;
        state.listLoadingMore = false;
        state.listError = null;
        renderLogin('Phiên tổng hợp đã kết thúc.');
      } catch (error) {
        showWorkspaceMessage(container, error.message);
      }
    }, 'button secondary small'));
    heading.append(headingText, actions);
    shell.append(heading);
    const note = node('p', 'repeat-alert', 'Nguồn tổng hợp đi kèm trạng thái quyền UNKNOWN, không phải xác nhận cho phép sử dụng. Danh sách chỉ hiển thị metadata, không có nội dung câu hỏi, đáp án, lời giải riêng hoặc bằng chứng rà soát; không có chức năng xem trước, rà soát, duyệt hay xuất bản. Tài khoản REVIEWER trong môi trường tổng hợp không đại diện cho người rà soát độc lập đủ điều kiện.');
    shell.append(note);

    if (!state.principal.roles.includes('AUTHOR')) {
      const denied = node('section', 'staff-card staff-denied');
      if (state.canReadList) {
        denied.append(node('h2', '', 'Vai trò này chỉ xem được danh sách.'), node('p', '', 'Tạo bản nháp và mở mẫu riêng cần vai trò AUTHOR. Không có thao tác quản lý quyền, rà soát hoặc xuất bản ở đây.'));
        denied.append(button('Tải danh sách', 'staff-refresh-denied', async () => {
          if (!isWorkspaceActive()) return;
          try {
            await loadQuestionList({ reset: true });
          } catch (error) {
            showWorkspaceMessage(container, error.message);
          }
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
        if (!isWorkspaceActive() || state.busy) return;
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
          if (!isWorkspaceActive()) return;
          state.pendingCreate = null;
          state.filters = { state: 'DRAFT', section: '' };
          const stateFilter = container.querySelector('[data-testid="staff-state-filter"]');
          const sectionFilter = container.querySelector('[data-testid="staff-section-filter"]');
          if (stateFilter) stateFilter.value = state.filters.state;
          if (sectionFilter) sectionFilter.value = state.filters.section;
          await loadQuestionList({ reset: true });
          showWorkspaceMessage(container, `Đã tạo bản nháp DRAFT ${result.questionId}. Chưa có rà soát, phê duyệt hoặc quyền xuất bản.`);
        } catch (error) {
          showWorkspaceMessage(container, error.message);
        } finally {
          if (isWorkspaceActive()) {
            state.busy = false;
            create.disabled = false;
          }
        }
      });
      formCard.append(form);
      shell.append(formCard);
    }

    if (state.canReadList) {
      const listCard = node('section', 'staff-card');
      listCard.append(node('div', 'staff-list-heading', 'Thông tin tóm tắt phiên bản câu hỏi'));
      listCard.append(node('p', 'staff-intro', 'Các hàng bên dưới chỉ là metadata an toàn do máy chủ trả về. Nội dung, lời giải, đáp án và bằng chứng riêng không được tải vào danh sách.'));
      const filters = node('div', 'staff-draft-form');
      filters.dataset.testid = 'staff-question-filters';
      filters.append(questionFilter('Lọc theo trạng thái', 'staff-state-filter', QUESTION_STATES, state.filters.state, (value) => {
        state.filters.state = value;
        void loadQuestionList({ reset: true });
      }));
      filters.append(questionFilter('Lọc theo miền', 'staff-section-filter', QUESTION_SECTIONS, state.filters.section, (value) => {
        state.filters.section = value;
        void loadQuestionList({ reset: true });
      }));
      listCard.append(filters);
      const status = node('p', 'notice-panel', 'Đang tải danh sách metadata…');
      status.dataset.testid = 'staff-list-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      listCard.append(status);
      const list = node('div', 'staff-question-list-wrap');
      list.dataset.testid = 'staff-question-list';
      list.append(metadataList(state.items));
      listCard.append(list);
      const more = button('Tải thêm metadata', 'staff-load-more', async () => {
        if (isWorkspaceActive()) await loadQuestionList({ reset: false });
      }, 'button secondary');
      more.hidden = !state.nextCursor;
      more.disabled = state.listLoading || !state.nextCursor;
      listCard.append(more);
      shell.append(listCard);
    }
    shell.append(button('Quay lại khu luyện tập', 'staff-return', returnToPractice, 'button secondary'), footer());
    container.replaceChildren(shell);
    updateQuestionListView();
  }

  async function loadWorkspace() {
    if (!isWorkspaceActive() || !await refreshSession() || !isWorkspaceActive()) return;
    state.identityEpoch += 1;
    state.listRequestId += 1;
    state.items = [];
    state.nextCursor = null;
    state.listLoading = false;
    state.listLoadingMore = false;
    state.listError = null;
    if (!state.principal?.authenticated) { renderLogin(); return; }
    state.canReadList = state.principal.roles.some((role) => ['AUTHOR', 'REVIEWER', 'BANK_MANAGER'].includes(role));
    const identityEpoch = state.identityEpoch;
    if (state.principal.roles.includes('AUTHOR')) {
      const result = await request('/local/workspace/template');
      if (!isWorkspaceActive() || identityEpoch !== state.identityEpoch) return;
      state.template = result.template;
    } else {
      state.template = null;
    }
    if (!isWorkspaceActive() || identityEpoch !== state.identityEpoch) return;
    if (state.canReadList) await loadQuestionList({ reset: true });
    if (!isWorkspaceActive() || identityEpoch !== state.identityEpoch) return;
    renderWorkspace();
  }

  try {
    if (!await refreshSession() || !isWorkspaceActive()) return;
    if (state.principal?.authenticated) await loadWorkspace();
    else renderLogin();
  } catch (error) {
    if (!isWorkspaceActive()) return;
    if (error.status === 404) renderUnavailable();
    else renderLogin(error.message);
  }
}
