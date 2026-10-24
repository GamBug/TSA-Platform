import { renderMath } from './math.js';

const ACTORS = Object.freeze([
  { key: 'author', label: 'Tác giả tổng hợp' },
  { key: 'reviewer', label: 'Người rà soát tổng hợp' },
  { key: 'bankManager', label: 'Quản lý ngân hàng câu hỏi tổng hợp' },
  { key: 'studentA', label: 'Học viên tổng hợp A' },
]);

const ERROR_TEXT = Object.freeze({
  UNAUTHENTICATED: 'Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.',
  NOT_FOUND: 'Phiên bản không còn sẵn có trong phạm vi truy cập của vai trò này.',
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
const DISPOSITION_REASON_PREFIX = 'Local synthetic disposition: ';
const DISPOSITION_REASON_MAX_LENGTH = 4096 - DISPOSITION_REASON_PREFIX.length;
const DISPOSITION_RUBRIC = Object.freeze([
  ['correctness', 'Độ chính xác'],
  ['unambiguous', 'Rõ nghĩa'],
  ['relevant', 'Phù hợp'],
  ['language', 'Ngôn ngữ'],
  ['explanation', 'Lời giải'],
  ['rights', 'Quyền sử dụng'],
]);

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
    const error = new Error('Không thể kết nối với máy chủ cục bộ. Hãy kiểm tra tiến trình Track B rồi thử lại.');
    error.uncertain = true;
    throw error;
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
  return node('p', 'footer-note', 'Chỉ dành cho kiểm thử cục bộ với dữ liệu tổng hợp trong môi trường LOCAL_SYNTHETIC_ONLY. Trạng thái quyền được hiển thị theo từng nguồn; bản xem riêng không thay thế đánh giá của người có thẩm quyền và không xác nhận quyền xuất bản.');
}

function supportedContentBlocks(blocks) {
  return Array.isArray(blocks) && blocks.every((block) => {
    if (!block || typeof block !== 'object') return false;
    if (block.type === 'text') return typeof block.text === 'string';
    if (block.type === 'math') return typeof block.tex === 'string' || typeof block.accessibleText === 'string';
    if (block.type === 'table') {
      return (block.caption === undefined || typeof block.caption === 'string')
        && Array.isArray(block.headers) && block.headers.every((value) => typeof value === 'string')
        && Array.isArray(block.rows) && block.rows.every((row) => Array.isArray(row) && row.every((value) => typeof value === 'string'));
    }
    return false;
  });
}

function supportedInteraction(interaction, answerKey) {
  if (!interaction || !answerKey || interaction.type !== answerKey.type) return false;
  if (interaction.type === 'SINGLE_CHOICE' || interaction.type === 'MULTIPLE_CHOICE') {
    if (!Array.isArray(interaction.options) || !interaction.options.length
      || !interaction.options.every((option) => option && typeof option.id === 'string' && supportedContentBlocks(option.content))) return false;
    const optionIds = new Set(interaction.options.map((option) => option.id));
    if (interaction.type === 'SINGLE_CHOICE') return typeof answerKey.optionId === 'string' && optionIds.has(answerKey.optionId);
    return Array.isArray(answerKey.optionIds) && answerKey.optionIds.every((id) => typeof id === 'string' && optionIds.has(id));
  }
  if (interaction.type === 'TRUE_FALSE_GROUP') {
    if (!Array.isArray(interaction.statements) || !interaction.statements.length
      || !interaction.statements.every((statement) => statement && typeof statement.id === 'string' && supportedContentBlocks(statement.content))) return false;
    const ids = interaction.statements.map((statement) => statement.id);
    return answerKey.values && typeof answerKey.values === 'object' && !Array.isArray(answerKey.values)
      && ids.every((id) => typeof answerKey.values[id] === 'boolean')
      && Object.keys(answerKey.values).length === ids.length;
  }
  return false;
}

function safeContentBlocks(blocks, label) {
  const content = node('div', 'question-content-blocks');
  for (const block of blocks) {
    if (block.type === 'text') {
      content.append(node('p', 'content-text', block.text));
    } else if (block.type === 'math') {
      content.append(renderMath(block));
    } else if (block.type === 'table') {
      const table = node('table', 'content-table');
      table.style.width = '100%';
      if (block.caption) table.append(node('caption', '', block.caption));
      const head = node('thead');
      const headerRow = node('tr');
      for (const value of block.headers) {
        const heading = node('th', '', value);
        heading.scope = 'col';
        headerRow.append(heading);
      }
      head.append(headerRow);
      const body = node('tbody');
      for (const values of block.rows) {
        const row = node('tr');
        for (const value of values) row.append(node('td', '', value));
        body.append(row);
      }
      table.append(head, body);
      const scroll = node('div', 'content-table-scroll');
      scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', block.caption || label || 'Bảng dữ liệu câu hỏi');
      scroll.append(table);
      content.append(scroll);
    }
  }
  return content;
}

function reviewContextSupportsPreview(context) {
  const question = context?.preview?.question;
  return context?.preview?.status === 'AVAILABLE'
    && question?.language === 'vi-VN'
    && supportedContentBlocks(question.content)
    && supportedInteraction(question.interaction, question.answerKey)
    && supportedContentBlocks(question.explanation)
    && (question.stimulus === null || (question.stimulus && supportedContentBlocks(question.stimulus.content)));
}

function displayInstant(value) {
  return typeof value === 'string' ? value : 'Không có';
}

function appendMetadataPair(list, label, value) {
  list.append(node('dt', '', label), node('dd', '', value));
}

function renderRightsMetadata(sources = []) {
  const section = node('section', 'staff-review-rights');
  section.append(node('h3', '', 'Thông tin quyền hiện tại theo nguồn'));
  if (!Array.isArray(sources) || sources.length === 0) {
    section.append(node('p', 'notice-panel', 'Không có nguồn nào trong phản hồi.'));
    return section;
  }
  for (const source of sources) {
    const item = node('article', 'review-item');
    item.append(node('h4', '', 'Nguồn'));
    item.append(node('code', '', source.sourceVersionId));
    const metadata = node('dl', 'staff-review-metadata');
    appendMetadataPair(metadata, 'Hash nguồn', source.contentHash);
    appendMetadataPair(metadata, 'Nguồn được ghi nhận', source.origin ?? 'Không xác định');
    if (source.currentRights === null) {
      appendMetadataPair(metadata, 'Quyền hiện tại', 'Không có quyết định quyền hiện tại');
    } else {
      const rights = source.currentRights;
      appendMetadataPair(metadata, 'Trạng thái quyền', rights.status);
      appendMetadataPair(metadata, 'Quyết định quyền', `${rights.decisionId} · revision ${rights.revision}`);
      appendMetadataPair(metadata, 'Mục đích được ghi nhận', rights.allowedUses.join(', ') || 'Không có');
      appendMetadataPair(metadata, 'Lãnh thổ', rights.territory.join(', ') || 'Không có');
      appendMetadataPair(metadata, 'Có hiệu lực từ', displayInstant(rights.validFrom));
      appendMetadataPair(metadata, 'Có hiệu lực đến', displayInstant(rights.validTo));
    }
    item.append(metadata);
    section.append(item);
  }
  return section;
}

function reviewEvidenceSupportsResponse(evidence, versionId) {
  return evidence?.schemaVersion === 'staff-review-evidence/1'
    && evidence.environment === 'LOCAL_SYNTHETIC_ONLY'
    && ['BANK_MANAGER', 'REVIEW_QUEUE'].includes(evidence.accessBasis)
    && evidence.version?.versionId === versionId
    && typeof evidence.version.contentHash === 'string'
    && Number.isSafeInteger(evidence.version.workflowRevision) && evidence.version.workflowRevision > 0
    && typeof evidence.observedAt === 'string'
    && evidence.qualification === 'NOT_ATTESTED_BY_PLATFORM'
    && evidence.publicationEligibility === 'NOT_EVALUATED'
    && Array.isArray(evidence.sources)
    && evidence.sources.every((source) => typeof source?.sourceVersionId === 'string'
      && (source.currentDecision === null || (source.currentDecision
        && typeof source.currentDecision.decisionId === 'string'
        && Number.isSafeInteger(source.currentDecision.revision) && source.currentDecision.revision > 0
        && typeof source.currentDecision.status === 'string'
        && (source.currentDecision.recordedEvidence?.state === 'NOT_RECORDED'
          || (source.currentDecision.recordedEvidence?.state === 'TEXT_AVAILABLE'
            && typeof source.currentDecision.recordedEvidence.text === 'string'
            && source.currentDecision.recordedEvidence.text.trim().length > 0)))));
}

function renderReviewEvidence(evidence) {
  const content = node('div', 'staff-review-evidence-content');
  const metadata = node('dl', 'staff-review-metadata');
  appendMetadataPair(metadata, 'Môi trường', evidence.environment);
  appendMetadataPair(metadata, 'Cơ sở truy cập', evidence.accessBasis);
  appendMetadataPair(metadata, 'Phiên bản', evidence.version.versionId);
  appendMetadataPair(metadata, 'Hash phiên bản', evidence.version.contentHash);
  appendMetadataPair(metadata, 'Revision quy trình tại thời điểm quan sát', String(evidence.version.workflowRevision));
  appendMetadataPair(metadata, 'Thời điểm quan sát mới từ máy chủ', evidence.observedAt);
  appendMetadataPair(metadata, 'Xác nhận của nền tảng', 'NOT_ATTESTED_BY_PLATFORM');
  appendMetadataPair(metadata, 'Đánh giá đủ điều kiện xuất bản', evidence.publicationEligibility);
  content.append(metadata);

  content.append(node('p', 'staff-review-evidence-warning', 'Bằng chứng là nội dung hành chính được ghi nhận và chưa được nền tảng xác minh. Đây không phải phê duyệt của con người, xác nhận quyền pháp lý hoặc quyết định xuất bản.'));
  const sources = node('section', 'staff-review-evidence-sources');
  sources.append(node('h3', '', 'Bằng chứng quyền hiện được ghi nhận'));
  if (evidence.sources.length === 0) {
    sources.append(node('p', 'staff-review-evidence-empty', 'Phiên bản này không có nguồn được ghi nhận.'));
  }
  for (const source of evidence.sources) {
    const item = node('article', 'staff-review-evidence-source');
    item.append(node('h4', '', 'Nguồn'), node('code', '', source.sourceVersionId));
    const decision = source.currentDecision;
    if (decision === null) {
      item.append(node('p', 'staff-review-evidence-empty', 'Không có quyết định quyền hiện tại cho nguồn này.'));
    } else {
      const decisionMetadata = node('dl', 'staff-review-metadata');
      appendMetadataPair(decisionMetadata, 'Quyết định hiện tại', decision.decisionId);
      appendMetadataPair(decisionMetadata, 'Revision quyết định', String(decision.revision));
      appendMetadataPair(decisionMetadata, 'Trạng thái quyền hiện tại', decision.status);
      item.append(decisionMetadata);
      if (decision.recordedEvidence.state === 'TEXT_AVAILABLE') {
        item.append(node('h5', '', 'Văn bản bằng chứng hiện được ghi nhận'));
        const text = node('pre', 'staff-review-evidence-text', decision.recordedEvidence.text);
        text.dataset.testid = 'staff-recorded-evidence-text';
        item.append(text);
      } else {
        item.append(node('p', 'staff-review-evidence-empty', 'Không có văn bản bằng chứng được ghi nhận cho quyết định hiện tại.'));
      }
    }
    sources.append(item);
  }
  content.append(sources);
  return content;
}

function renderPrivateQuestion(question) {
  const article = node('article', 'review-item');
  article.append(node('h3', '', 'Nội dung câu hỏi riêng'));
  article.append(safeContentBlocks(question.content, 'Nội dung câu hỏi'));
  if (question.stimulus) {
    article.append(node('h4', '', 'Ngữ liệu dùng chung'));
    article.append(node('code', '', `${question.stimulus.versionId} · ${question.stimulus.contentHash}`));
    article.append(safeContentBlocks(question.stimulus.content, 'Ngữ liệu câu hỏi'));
  }

  const interaction = question.interaction;
  if (interaction.type === 'TRUE_FALSE_GROUP') {
    const statements = node('ol', 'tf-review-statements');
    for (const [index, statement] of interaction.statements.entries()) {
      const row = node('li', 'tf-review-statement');
      row.append(node('strong', 'tf-review-label', `Mệnh đề ${index + 1} · ${statement.id}`));
      row.append(safeContentBlocks(statement.content, `Mệnh đề ${index + 1}`));
      statements.append(row);
    }
    article.append(statements);
  } else {
    if (interaction.type === 'MULTIPLE_CHOICE') {
      article.append(node('p', 'question-instruction', `Chọn từ ${interaction.minSelections} đến ${interaction.maxSelections} phương án.`));
    }
    const options = node('ol', 'review-options');
    for (const option of interaction.options) {
      const row = node('li');
      row.append(node('span', 'option-letter', option.id.toUpperCase()));
      row.append(safeContentBlocks(option.content, `Phương án ${option.id}`));
      options.append(row);
    }
    article.append(options);
  }

  let keyText;
  if (question.answerKey.type === 'SINGLE_CHOICE') keyText = question.answerKey.optionId;
  else if (question.answerKey.type === 'MULTIPLE_CHOICE') keyText = question.answerKey.optionIds.join(', ');
  else keyText = interaction.statements.map((statement) => `${statement.id}: ${question.answerKey.values[statement.id] ? 'Đúng' : 'Sai'}`).join(' · ');
  article.append(node('h4', '', 'Đáp án trong phiên bản này'), node('p', 'staff-private-notice', keyText));
  article.append(node('h4', '', 'Lời giải riêng'));
  article.append(safeContentBlocks(question.explanation, 'Lời giải câu hỏi'));
  article.append(node('p', 'staff-intro', `Phiên bản chính sách chấm điểm: ${question.scoringPolicyVersion}`));
  return article;
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
    reviewRequestId: 0,
    reviewView: null,
    evidenceRequestId: 0,
    evidenceView: null,
    pendingCreate: null,
    handoffRequestId: 0,
    handoffStatus: null,
    handoffConfirmation: null,
    handoffDialog: null,
    dispositionRequestId: 0,
    dispositionStatus: null,
    dispositionConfirmation: null,
    dispositionDialog: null,
  };
  const returnToPractice = () => {
    if (!isWorkspaceActive()) return;
    clearPrivateReviewView();
    if (!invalidateWorkspace()) return;
    onBack();
  };
  const backButton = () => button('Quay lại khu luyện tập', 'staff-return', returnToPractice, 'button secondary');

  function canRequestReviewEvidence(item) {
    const roles = state.principal?.roles ?? [];
    return roles.includes('BANK_MANAGER') || (roles.includes('REVIEWER') && item?.state === 'IN_REVIEW');
  }

  async function refreshSession() {
    const session = await request('/local-auth/session');
    if (!isWorkspaceActive()) return false;
    if (principalKey(session.principal) !== principalKey(state.principal)) clearPrivateReviewView();
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
      if (state.canReadList) {
        let inspect;
        inspect = button('Kiểm tra phiên bản này', 'staff-review-inspect', async () => {
          await loadReviewContext(item.versionId, inspect);
        }, 'button secondary small');
        inspect.dataset.versionId = item.versionId;
        inspect.setAttribute('aria-label', `Kiểm tra riêng phiên bản ${item.versionId}`);
        inspect.setAttribute('aria-controls', 'staff-review-host');
        inspect.setAttribute('aria-expanded', 'false');
        info.append(inspect);
      }
      if (canRequestReviewEvidence(item)) {
        const evidence = button('Xem bằng chứng quyền', 'staff-review-evidence-open', async () => {
          await loadReviewEvidence(item.versionId, evidence);
        }, 'button secondary small');
        evidence.dataset.versionId = item.versionId;
        evidence.setAttribute('aria-label', `Xem bằng chứng quyền được ghi nhận cho phiên bản ${item.versionId}`);
        evidence.setAttribute('aria-controls', 'staff-review-host');
        evidence.setAttribute('aria-expanded', 'false');
        info.append(evidence);
      }
      row.append(info);
      list.append(row);
    }
    return list;
  }

  function principalKey(principal) {
    if (!principal) return '';
    return JSON.stringify([principal.userId, principal.actorKey, [...principal.roles].sort()]);
  }

  function closeHandoffDialog({ restoreFocus = false } = {}) {
    const confirmation = state.handoffConfirmation;
    state.handoffConfirmation = null;
    if (state.handoffDialog?.open) state.handoffDialog.close();
    if (restoreFocus && confirmation?.triggerElement?.isConnected) confirmation.triggerElement.focus();
  }

  function closeDispositionDialog({ restoreFocus = false, reset = true } = {}) {
    const confirmation = state.dispositionConfirmation;
    state.dispositionConfirmation = null;
    if (state.dispositionDialog?.open) state.dispositionDialog.close();
    if (reset) {
      state.dispositionDialog?.querySelector('form')?.reset();
      state.dispositionDialog?.querySelector('[data-testid="disposition-confirmation-summary"]')?.replaceChildren();
    }
    confirmation?.triggerElement?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && confirmation?.triggerElement?.isConnected) confirmation.triggerElement.focus();
  }

  function clearPrivateReviewView({ restoreFocus = false, preserveHandoff = false, preserveDisposition = false } = {}) {
    const previousViews = [state.evidenceView, state.reviewView];
    const previous = previousViews.find(Boolean);
    state.reviewRequestId += 1;
    state.evidenceRequestId += 1;
    state.reviewView = null;
    state.evidenceView = null;
    if (!preserveHandoff) {
      state.handoffRequestId += 1;
      state.handoffStatus = null;
      closeHandoffDialog();
    }
    if (!preserveDisposition) {
      state.dispositionRequestId += 1;
      state.dispositionStatus = null;
      closeDispositionDialog();
    }
    for (const view of previousViews) view?.triggerElement?.setAttribute('aria-expanded', 'false');
    const host = container.querySelector('[data-testid="staff-review-host"]');
    if (host) {
      host.replaceChildren();
      host.hidden = true;
    }
    renderHandoffPanel();
    renderDispositionPanel();
    if (restoreFocus && previous?.triggerElement?.isConnected) previous.triggerElement.focus();
  }

  function dispositionEligible(kind, view = state.reviewView) {
    const context = view?.context;
    const version = context?.version;
    const workflow = context?.workflow;
    const status = state.dispositionStatus;
    const exactCurrentView = isWorkspaceActive()
      && view?.kind === 'context'
      && view.status === 'loaded'
      && typeof view.versionId === 'string'
      && version?.versionId === view.versionId
      && typeof version.contentHash === 'string'
      && Number.isSafeInteger(workflow?.revision)
      && workflow.revision > 0
      && (!status || (status.stage === 'reloaded' && status.targetVersionId === view.versionId && status.kind === kind));
    if (!exactCurrentView) return false;
    if (kind === 'reject') {
      return state.principal?.roles?.includes('REVIEWER')
        && context.accessBasis === 'REVIEW_QUEUE'
        && workflow.state === 'IN_REVIEW'
        && reviewContextSupportsPreview(context);
    }
    if (kind === 'quarantine') {
      return state.principal?.roles?.includes('BANK_MANAGER')
        && context.accessBasis === 'BANK_MANAGER'
        && ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(workflow.state);
    }
    return false;
  }

  function renderDispositionSummary() {
    const dialog = state.dispositionDialog;
    const confirmation = state.dispositionConfirmation;
    const summary = dialog?.querySelector('[data-testid="disposition-confirmation-summary"]');
    if (!summary || !confirmation) return;
    summary.replaceChildren();
    const list = node('dl', 'staff-disposition-summary-list');
    if (confirmation.kind === 'reject') {
      const findings = DISPOSITION_RUBRIC.map(([key, label]) => {
        const value = dialog.querySelector(`[data-testid="disposition-rubric-${key}"]`)?.value;
        return `${label}: ${value === 'PASS' ? 'Đạt' : value === 'FAIL' ? 'Chưa đạt' : 'Chưa chọn'}`;
      });
      summary.append(node('p', 'staff-disposition-findings', findings.join(' · ')));
    }
    const reason = dialog.querySelector('[data-testid="disposition-form-reason"]')?.value?.trim() ?? '';
    appendMetadataPair(list, 'Lý do được lưu trong bản ghi', reason
      ? `${DISPOSITION_REASON_PREFIX}${reason}`
      : 'Chưa nhập');
    summary.append(list);
  }

  function renderDispositionPanel() {
    const host = container.querySelector('[data-testid="disposition-host"]');
    if (!host) return;
    host.replaceChildren();
    const status = state.dispositionStatus;
    if (!status) return;

    const isError = status.stage === 'rejected' || status.stage === 'reload-failed';
    const panel = node('section', `staff-disposition-panel${isError ? ' is-error' : ''}`);
    const message = node('p', isError ? 'notice-panel' : 'staff-disposition-message');
    message.dataset.testid = 'disposition-status';
    message.dataset.stage = status.stage;
    message.dataset.kind = status.kind;
    message.dataset.currentState = status.currentState ?? 'unobserved';
    if (status.receipt?.state) message.dataset.receiptState = status.receipt.state;
    if (status.receipt?.reviewId) message.dataset.receiptReviewId = status.receipt.reviewId;
    message.setAttribute('role', isError ? 'alert' : 'status');
    message.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    message.tabIndex = -1;

    const kindLabel = status.kind === 'reject' ? 'từ chối' : 'cách ly';
    if (status.stage === 'pending') {
      message.textContent = `Đang gửi lệnh ${kindLabel} cho phiên bản ${status.intent.versionId}, revision ${status.intent.expectedRevision}. Chưa có kết luận nào khác được đưa ra.`;
    } else if (status.stage === 'uncertain') {
      message.textContent = `Chưa xác định được kết quả lệnh ${kindLabel}. Lệnh có thể đã được ghi nhận; thử lại sẽ gửi đúng đường dẫn, nội dung và khóa idempotency đã chụp.`;
    } else if (status.stage === 'rejected') {
      message.textContent = `Lệnh ${kindLabel} chưa được chấp nhận (${status.code ?? 'request failed'}): ${status.message} Hãy tải lại metadata và kiểm tra phiên bản trước khi xác nhận yêu cầu mới.`;
    } else if (status.stage === 'reloading') {
      message.textContent = status.receipt
        ? `Máy chủ đã xác nhận biên nhận ${status.receipt.state}, revision ${status.receipt.revision}. Đang tải lại metadata và kiểm tra trạng thái hiện tại.`
        : 'Đang tải lại metadata và kiểm tra phiên bản hiện tại. Không gửi lệnh mới.';
    } else if (status.stage === 'reload-failed') {
      message.textContent = status.receipt?.state === 'REJECTED'
        ? `Biên nhận xác nhận REJECTED, revision ${status.receipt.revision}; trạng thái riêng hiện tại chưa được quan sát vì lần đọc mới thất bại. Việc phiên bản không còn trong hàng chờ không chứng minh trạng thái chính xác.`
        : status.receipt
          ? `Biên nhận xác nhận QUARANTINED, revision ${status.receipt.revision}; trạng thái hiện tại chưa khả dụng vì lần đọc mới thất bại.`
          : `Lệnh ${kindLabel} chưa được chấp nhận (${status.code ?? 'request failed'}). Lần đọc lại dữ liệu cũng thất bại: ${status.message}`;
    } else if (status.stage === 'reloaded') {
      message.textContent = `Lệnh trước đó chưa được chấp nhận (${status.code ?? 'request failed'}). B1 mới ghi nhận trạng thái ${status.currentState ?? 'không xác định'}${status.currentRevision ? `, revision ${status.currentRevision}` : ''}. Chỉ mở lại xác nhận từ dữ liệu mới.`;
    } else if (status.stage === 'acknowledged') {
      const receiptText = `Máy chủ đã xác nhận biên nhận ${status.receipt.state}${status.receipt.reviewId ? ` (${status.receipt.reviewId})` : ''}, revision ${status.receipt.revision}.`;
      const fanoutNote = status.kind === 'quarantine' ? ' Biên nhận không xác nhận đã hoàn tất toàn bộ delivery-hold fan-out.' : '';
      if (status.currentState) {
        message.textContent = `${receiptText} B1 mới ghi nhận trạng thái hiện tại ${status.currentState}${status.currentRevision ? `, revision ${status.currentRevision}` : ''}. Biên nhận và trạng thái hiện tại là hai thông tin riêng biệt.${fanoutNote}`;
      } else if (status.currentReadPending) {
        message.textContent = `${receiptText} Đang đọc trạng thái hiện tại bằng B1.${fanoutNote}`;
      } else if (status.receipt.state === 'REJECTED') {
        message.textContent = `${receiptText} Trạng thái riêng chính xác hiện tại chưa được quan sát. Việc không còn trong hàng chờ không chứng minh trạng thái chính xác.${fanoutNote}`;
      } else {
        message.textContent = `${receiptText} Trạng thái hiện tại chưa khả dụng vì lần đọc mới thất bại.${fanoutNote}`;
      }
    }
    panel.append(message);

    if (status.stage === 'uncertain') {
      panel.append(button('Thử lại cùng yêu cầu', 'disposition-retry', async () => {
        if (state.dispositionStatus?.stage !== 'uncertain') return;
        await sendDisposition(status.intent, state.dispositionRequestId);
      }));
    }
    if (['rejected', 'reload-failed', 'acknowledged'].includes(status.stage)) {
      panel.append(button('Tải lại metadata và trạng thái', 'disposition-reload', async () => {
        await reloadDispositionTarget(status.targetVersionId, state.dispositionRequestId);
      }, 'button secondary'));
    }
    host.append(panel);
  }

  function createDispositionDialog() {
    const dialog = node('dialog', 'staff-disposition-dialog');
    dialog.id = 'disposition-dialog';
    dialog.dataset.testid = 'disposition-dialog';
    dialog.setAttribute('aria-labelledby', 'disposition-dialog-title');
    dialog.setAttribute('aria-describedby', 'disposition-dialog-description disposition-warning');
    const title = node('h2', '', 'Xác nhận lệnh nhân viên');
    title.id = 'disposition-dialog-title';
    const description = node('p', 'staff-disposition-dialog-description');
    description.id = 'disposition-dialog-description';
    const metadata = node('dl', 'staff-disposition-dialog-metadata');
    for (const [labelText, testId] of [
      ['Phiên bản', 'disposition-dialog-version'],
      ['Hash nội dung', 'disposition-dialog-hash'],
      ['Revision', 'disposition-dialog-revision'],
    ]) {
      metadata.append(node('dt', '', labelText));
      const value = node('dd');
      value.dataset.testid = testId;
      metadata.append(value);
    }
    const warning = node('p', 'staff-disposition-warning');
    warning.id = 'disposition-warning';
    warning.dataset.testid = 'disposition-warning';
    const summary = node('section', 'staff-disposition-summary');
    summary.dataset.testid = 'disposition-confirmation-summary';
    summary.setAttribute('aria-label', 'Nội dung xác nhận');
    summary.setAttribute('aria-live', 'polite');
    const form = node('form', 'staff-disposition-form');
    form.dataset.testid = 'disposition-form';
    const fields = node('div', 'staff-disposition-fields');
    fields.dataset.testid = 'disposition-fields';
    form.append(fields);
    const actions = node('div', 'staff-disposition-dialog-actions');
    const confirm = node('button', 'button', 'Xác nhận');
    confirm.type = 'submit';
    confirm.dataset.testid = 'disposition-confirm';
    actions.append(confirm, button('Hủy', 'disposition-cancel', () => closeDispositionDialog(), 'button secondary'));
    form.append(summary, actions);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await confirmDisposition();
    });
    dialog.append(title, description, metadata, warning, form);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDispositionDialog();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDispositionDialog();
    });
    state.dispositionDialog = dialog;
    return dialog;
  }

  function openDispositionDialog(kind, triggerElement) {
    const view = state.reviewView;
    if (!dispositionEligible(kind, view) || state.dispositionConfirmation) return;
    const context = view.context;
    const workflow = context.workflow;
    const dialog = state.dispositionDialog;
    if (!dialog || dialog.open) return;
    const confirmation = {
      kind,
      versionId: view.versionId,
      contentHash: context.version.contentHash,
      expectedRevision: workflow.revision,
      context,
      identityEpoch: state.identityEpoch,
      principal: principalKey(state.principal),
      requestId: state.dispositionRequestId,
      triggerElement,
    };
    state.dispositionConfirmation = confirmation;
    triggerElement?.setAttribute('aria-expanded', 'true');
    dialog.querySelector('#disposition-dialog-title').textContent = kind === 'reject'
      ? 'Xác nhận từ chối phiên bản'
      : 'Xác nhận cách ly phiên bản';
    dialog.querySelector('#disposition-dialog-description').textContent = kind === 'reject'
      ? 'Đây là thao tác tổng hợp, không phải đánh giá của người rà soát đủ điều kiện hoặc quyết định phê duyệt.'
      : 'Lệnh cách ly có thể ảnh hưởng phiên bản con đã xuất bản, biểu mẫu liên quan, lượt thi và kết quả hiện có; quyền truy cập lượt thi liên quan có thể bị vô hiệu hóa hoặc lượt thi bị hủy. Lệnh này không hoàn tác việc phơi lộ hay khôi phục quyền truy cập.';
    dialog.querySelector('[data-testid="disposition-dialog-version"]').textContent = confirmation.versionId;
    dialog.querySelector('[data-testid="disposition-dialog-hash"]').textContent = confirmation.contentHash;
    dialog.querySelector('[data-testid="disposition-dialog-revision"]').textContent = String(confirmation.expectedRevision);
    dialog.querySelector('[data-testid="disposition-warning"]').textContent = kind === 'reject'
      ? 'Sáu lựa chọn Pass/Fail phải được chọn rõ ràng. Nội dung, quyền sử dụng và tính đủ điều kiện xuất bản không được phê duyệt bởi thao tác này.'
      : 'Có thể ảnh hưởng phiên bản con đã xuất bản, biểu mẫu liên quan, lượt thi và kết quả; quyền truy cập có thể bị vô hiệu hóa hoặc lượt thi liên quan bị hủy. Lệnh có thể đã được ghi nhận dù phản hồi cuối cùng báo lỗi; không thử lại bằng khóa mới.';

    const fields = dialog.querySelector('[data-testid="disposition-fields"]');
    fields.replaceChildren();
    if (kind === 'reject') {
      for (const [key, labelText] of DISPOSITION_RUBRIC) {
        const field = node('div', 'staff-field staff-disposition-rubric-field');
        const label = node('label', '', labelText);
        const select = node('select', 'staff-input');
        select.id = `disposition-rubric-${key}`;
        select.dataset.testid = `disposition-rubric-${key}`;
        select.required = true;
        select.name = key;
        for (const [value, optionText] of [['', 'Chọn Pass/Fail'], ['PASS', 'Pass'], ['FAIL', 'Fail']]) {
          const option = node('option', '', optionText);
          option.value = value;
          select.append(option);
        }
        label.htmlFor = select.id;
        select.addEventListener('change', renderDispositionSummary);
        field.append(label, select);
        fields.append(field);
      }
    }
    const reasonField = node('div', 'staff-field');
    const reasonLabel = node('label', '', 'Lý do');
    const reason = node('textarea', 'staff-input');
    reason.id = 'disposition-form-reason';
    reason.dataset.testid = 'disposition-form-reason';
    reason.name = 'reason';
    reason.required = true;
    reason.maxLength = DISPOSITION_REASON_MAX_LENGTH;
    reason.rows = 3;
    reason.autocomplete = 'off';
    reason.setAttribute('aria-describedby', 'disposition-form-reason-hint');
    reasonLabel.htmlFor = reason.id;
    reason.addEventListener('input', () => {
      reason.setCustomValidity('');
      renderDispositionSummary();
    });
    const reasonHint = node('p', 'staff-disposition-reason-hint', `Nhập lý do rõ ràng; bản ghi sẽ lưu với tiền tố “${DISPOSITION_REASON_PREFIX}”.`);
    reasonHint.id = 'disposition-form-reason-hint';
    reasonField.append(reasonLabel, reason, reasonHint);
    fields.append(reasonField);
    dialog.querySelector('[data-testid="disposition-confirm"]').textContent = kind === 'reject'
      ? 'Xác nhận từ chối'
      : 'Xác nhận cách ly';
    renderDispositionSummary();
    dialog.showModal();
    dialog.querySelector('[data-testid="disposition-cancel"]').focus();
  }

  function handoffEligible(view = state.reviewView) {
    const context = view?.context;
    const version = context?.version;
    const workflow = context?.workflow;
    const handoffStatus = state.handoffStatus;
    return isWorkspaceActive()
      && state.principal?.roles?.includes('AUTHOR')
      && view?.kind === 'context'
      && view.status === 'loaded'
      && typeof view.versionId === 'string'
      && version?.versionId === view.versionId
      && context?.accessBasis === 'AUTHOR_OWN'
      && workflow?.state === 'DRAFT'
      && Number.isSafeInteger(workflow.revision)
      && workflow.revision > 0
      && typeof version.contentHash === 'string'
      && (!handoffStatus || (handoffStatus.stage === 'reloaded' && handoffStatus.targetVersionId === view.versionId));
  }

  function handoffAttemptIsCurrent(versionId, requestId, identityEpoch, requestPrincipal) {
    return isWorkspaceActive()
      && requestId === state.handoffRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.handoffStatus?.targetVersionId === versionId;
  }

  function handoffDialog() {
    const dialog = state.handoffDialog;
    if (!dialog) return null;
    const confirmation = state.handoffConfirmation;
    if (!confirmation || !handoffEligible()) return null;
    const version = confirmation.version;
    dialog.querySelector('[data-testid="handoff-dialog-version"]').textContent = version.versionId;
    dialog.querySelector('[data-testid="handoff-dialog-hash"]').textContent = version.contentHash;
    dialog.querySelector('[data-testid="handoff-dialog-revision"]').textContent = String(confirmation.revision);
    return dialog;
  }

  function cancelHandoffConfirmation({ restoreFocus = true } = {}) {
    closeHandoffDialog({ restoreFocus });
  }

  function openHandoffConfirmation(triggerElement) {
    const view = state.reviewView;
    if (!handoffEligible(view) || state.handoffConfirmation) return;
    const workflow = view.context.workflow;
    state.handoffConfirmation = {
      version: view.context.version,
      versionId: view.versionId,
      revision: workflow.revision,
      context: view.context,
      identityEpoch: state.identityEpoch,
      principal: principalKey(state.principal),
      requestId: state.handoffRequestId,
      triggerElement,
    };
    const dialog = handoffDialog();
    if (!dialog || dialog.open) {
      state.handoffConfirmation = null;
      return;
    }
    dialog.showModal();
    dialog.querySelector('[data-testid="handoff-cancel"]').focus();
  }

  function renderHandoffPanel() {
    const host = container.querySelector('[data-testid="handoff-host"]');
    if (!host) return;
    host.replaceChildren();
    const status = state.handoffStatus;
    if (!status) return;

    const isError = status.stage === 'rejected' || status.stage === 'reload-failed';
    const panel = node('section', `staff-handoff-panel${isError ? ' is-error' : ''}`);
    panel.setAttribute('aria-label', 'Trạng thái chuyển bản nháp');
    const message = node('p', isError ? 'notice-panel' : 'staff-handoff-message');
    message.dataset.testid = 'handoff-status';
    message.dataset.state = status.stage;
    message.dataset.stage = status.stage;
    message.setAttribute('role', isError ? 'alert' : 'status');
    message.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    message.tabIndex = -1;

    if (status.stage === 'pending') {
      message.textContent = `Đang chuyển phiên bản ${status.intent.versionId}, revision ${status.intent.expectedRevision}, vào hàng chờ rà soát. Thao tác này không đánh giá nội dung hoặc xác nhận quyền.`;
    } else if (status.stage === 'uncertain') {
      message.textContent = `Chưa nhận được phản hồi cho yêu cầu chuyển bản nháp; chưa thể xác nhận thao tác thành công. Thử lại sẽ gửi phiên bản ${status.intent.versionId}, revision ${status.intent.expectedRevision}, với cùng nội dung yêu cầu và khóa idempotency.`;
    } else if (status.stage === 'rejected') {
      message.textContent = `Yêu cầu chuyển bản nháp chưa được chấp nhận (${status.code ?? 'request failed'}): ${status.message} Hãy tải lại metadata và kiểm tra phiên bản hiện tại trước khi xác nhận lại.`;
    } else if (status.stage === 'reloading') {
      message.textContent = status.receipt
        ? `Máy chủ đã xác nhận yêu cầu chuyển: ${status.receipt.state}, revision ${status.receipt.revision}. Đang đọc lại trạng thái quy trình hiện tại và metadata.`
        : 'Đang tải lại metadata và kiểm tra phiên bản hiện tại. Không gửi yêu cầu chuyển mới.';
    } else if (status.stage === 'reload-failed') {
      message.textContent = status.receipt
        ? `Máy chủ đã xác nhận yêu cầu chuyển: ${status.receipt.state}, revision ${status.receipt.revision}. Không thể xác định trạng thái quy trình hiện tại vì lần đọc mới thất bại.`
        : `Yêu cầu chuyển bản nháp chưa được chấp nhận (${status.code ?? 'request failed'}). Lần đọc mới dữ liệu kiểm tra cũng thất bại: ${status.message}`;
    } else if (status.stage === 'reloaded') {
      message.textContent = `Yêu cầu chuyển trước đó chưa được chấp nhận (${status.code ?? 'request failed'}). Lần đọc mới ghi nhận trạng thái ${status.currentState ?? 'không xác định'}${status.currentRevision ? `, revision ${status.currentRevision}` : ''}. Chỉ xác nhận lại nếu lần kiểm tra AUTHOR_OWN mới nhất cho thấy trạng thái DRAFT.`;
    } else if (status.stage === 'acknowledged') {
      const receipt = status.receipt;
      const receiptText = `Máy chủ đã xác nhận yêu cầu chuyển: ${receipt.state}, revision ${receipt.revision}.`;
      message.textContent = status.currentState
        ? `${receiptText} Trạng thái hiện tại được máy chủ ghi nhận qua lần kiểm tra mới: ${status.currentState}${status.currentRevision ? `, revision ${status.currentRevision}` : ''}. Biên nhận và trạng thái hiện tại là hai thông tin riêng biệt.`
        : status.currentReadPending
          ? `${receiptText} Đang đọc trạng thái quy trình hiện tại.`
          : `${receiptText} Trạng thái quy trình hiện tại chưa khả dụng vì lần đọc mới thất bại.`;
    }
    panel.append(message);

    if (status.stage === 'uncertain') {
      panel.append(button('Thử lại cùng yêu cầu chuyển', 'handoff-retry', async () => {
        if (state.handoffStatus?.stage !== 'uncertain') return;
        await sendHandoff(status.intent, state.handoffRequestId);
      }));
    }
    if (['rejected', 'reload-failed', 'acknowledged'].includes(status.stage)) {
      panel.append(button('Tải lại trạng thái hiện tại', 'handoff-reload', async () => {
        await reloadHandoffTarget(status.targetVersionId, state.handoffRequestId);
      }, 'button secondary'));
    }
    host.append(panel);
  }

  function createHandoffDialog() {
    const dialog = node('dialog', 'staff-handoff-dialog');
    dialog.id = 'handoff-dialog';
    dialog.dataset.testid = 'handoff-dialog';
    dialog.setAttribute('aria-labelledby', 'handoff-dialog-title');
    dialog.setAttribute('aria-describedby', 'handoff-dialog-description');
    const title = node('h2', '', 'Chuyển bản nháp này vào hàng chờ rà soát?');
    title.id = 'handoff-dialog-title';
    const description = node('p', 'staff-handoff-dialog-description', 'Thao tác này chuyển đúng bản DRAFT đã chọn vào hàng chờ rà soát. Đây không phải phê duyệt nội dung hay quyền sử dụng, và không có nghĩa là con người hoặc nền tảng đã rà soát nội dung.');
    description.id = 'handoff-dialog-description';
    const metadata = node('dl', 'staff-handoff-dialog-metadata');
    const versionLabel = node('dt', '', 'Phiên bản');
    const versionValue = node('dd');
    versionValue.dataset.testid = 'handoff-dialog-version';
    const hashLabel = node('dt', '', 'Hash nội dung');
    const hashValue = node('dd');
    hashValue.dataset.testid = 'handoff-dialog-hash';
    const revisionLabel = node('dt', '', 'Revision hiện tại');
    const revisionValue = node('dd');
    revisionValue.dataset.testid = 'handoff-dialog-revision';
    metadata.append(versionLabel, versionValue, hashLabel, hashValue, revisionLabel, revisionValue);
    const actions = node('div', 'staff-handoff-dialog-actions');
    actions.append(
      button('Xác nhận chuyển bản nháp', 'handoff-confirm', async () => { await confirmHandoff(); }),
      button('Hủy', 'handoff-cancel', () => cancelHandoffConfirmation(), 'button secondary'),
    );
    dialog.append(title, description, metadata, actions);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      cancelHandoffConfirmation();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) cancelHandoffConfirmation();
    });
    state.handoffDialog = dialog;
    return dialog;
  }

  function renderReviewPanel({ focusTitle = false, focusHandoffStatus = false } = {}) {
    if (!isWorkspaceActive()) return;
    const host = container.querySelector('[data-testid="staff-review-host"]');
    if (!host) return;
    const view = state.evidenceView ?? state.reviewView;
    host.replaceChildren();
    host.hidden = !view;
    if (!view) return;

    const isEvidence = view.kind === 'evidence';
    const panel = node('section', `staff-card staff-review-context${isEvidence ? ' staff-review-evidence-panel' : ''}`);
    panel.dataset.testid = isEvidence ? 'staff-review-evidence' : 'staff-review-context';
    const titleId = isEvidence ? 'staff-review-evidence-title' : 'staff-review-title';
    panel.setAttribute('aria-labelledby', titleId);
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearPrivateReviewView({ restoreFocus: true });
      }
    });
    const titleText = view.status === 'loading'
      ? (isEvidence ? 'Đang tải bằng chứng được ghi nhận…' : 'Đang tải nội dung riêng…')
      : view.status === 'error'
        ? (isEvidence ? 'Không thể tải bằng chứng quyền' : 'Không thể tải nội dung riêng')
        : (isEvidence ? 'Bằng chứng quyền được ghi nhận' : 'Kiểm tra phiên bản riêng');
    const heading = node('h2', '', titleText);
    heading.id = titleId;
    heading.tabIndex = -1;
    const actions = node('div', 'staff-header-actions');
    if (view.status === 'error') {
      actions.append(button(isEvidence ? 'Thử tải lại bằng chứng' : 'Thử tải lại phiên bản này',
        isEvidence ? 'staff-review-evidence-retry' : 'staff-review-retry', async () => {
          if (isEvidence) await loadReviewEvidence(view.versionId, view.triggerElement);
          else if (state.dispositionStatus?.stage === 'acknowledged'
            && state.dispositionStatus.targetVersionId === view.versionId) {
            await reloadDispositionTarget(view.versionId, state.dispositionRequestId);
          }
          else await loadReviewContext(view.versionId, view.triggerElement);
        }, 'button secondary'));
    }
    if (!isEvidence && handoffEligible(view)) {
      const handoff = button('Chuyển bản nháp vào hàng chờ rà soát', 'handoff-open', async () => {
        openHandoffConfirmation(handoff);
      }, 'button secondary');
      handoff.dataset.versionId = view.versionId;
      handoff.setAttribute('aria-controls', 'handoff-dialog');
      actions.append(handoff);
    }
    if (!isEvidence && dispositionEligible('reject', view)) {
      const reject = button('Từ chối phiên bản đang chờ rà soát', 'disposition-reject-open', async () => {
        openDispositionDialog('reject', reject);
      }, 'button secondary');
      reject.dataset.versionId = view.versionId;
      reject.setAttribute('aria-controls', 'disposition-dialog');
      actions.append(reject);
    }
    if (!isEvidence && dispositionEligible('quarantine', view)) {
      const quarantine = button('Cách ly phiên bản', 'disposition-quarantine-open', async () => {
        openDispositionDialog('quarantine', quarantine);
      }, 'button secondary');
      quarantine.dataset.versionId = view.versionId;
      quarantine.setAttribute('aria-controls', 'disposition-dialog');
      actions.append(quarantine);
    }
    actions.append(button(isEvidence ? 'Đóng bằng chứng quyền' : 'Đóng nội dung riêng',
      isEvidence ? 'staff-review-evidence-close' : 'staff-review-close', () => {
        clearPrivateReviewView({ restoreFocus: true });
      }, 'button secondary'));
    panel.append(heading, actions);

    if (view.status === 'loading') {
      const status = node('p', 'notice-panel', 'Đang yêu cầu đúng phiên bản đã chọn từ máy chủ…');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      panel.append(status);
    } else if (view.status === 'error') {
      const status = node('p', 'notice-panel', view.error);
      status.setAttribute('role', 'alert');
      status.setAttribute('aria-live', 'assertive');
      panel.append(status);
    } else {
      panel.append(isEvidence ? renderReviewEvidence(view.evidence) : renderReviewContext(view.context));
    }
    host.append(panel);
    renderHandoffPanel();
    renderDispositionPanel();
    if (focusTitle) heading.focus();
    else if (focusHandoffStatus) container.querySelector('[data-testid="handoff-status"]')?.focus();
  }

  function renderReviewContext(context) {
    const content = node('div', 'staff-review-content');
    const version = context?.version ?? {};
    const workflow = context?.workflow ?? {};
    const metadata = node('dl', 'staff-review-metadata');
    appendMetadataPair(metadata, 'Môi trường', context?.environment ?? 'Không xác định');
    appendMetadataPair(metadata, 'Cơ sở truy cập', context?.accessBasis ?? 'Không xác định');
    appendMetadataPair(metadata, 'Mã câu hỏi', version.questionId ?? 'Không xác định');
    appendMetadataPair(metadata, 'Phiên bản', `${version.versionNo ?? 'Không xác định'} · ${version.versionId ?? 'Không xác định'}`);
    appendMetadataPair(metadata, 'Miền', version.section ?? 'Không xác định');
    appendMetadataPair(metadata, 'Hash phiên bản', version.contentHash ?? 'Không xác định');
    appendMetadataPair(metadata, 'Quy trình hiện tại', `${workflow.state ?? 'Không xác định'} · revision ${workflow.revision ?? 'không xác định'}`);
    appendMetadataPair(metadata, 'Thời điểm quan sát máy chủ', context?.observedAt ?? 'Không xác định');
    appendMetadataPair(metadata, 'Bằng chứng quyền được kèm theo', context?.rightsEvidenceIncluded === false ? 'Không' : 'Không được cung cấp');
    appendMetadataPair(metadata, 'Đánh giá đủ điều kiện xuất bản', context?.publicationEligibility ?? 'Không được đánh giá');
    content.append(metadata);

    const preview = context?.preview;
    if (workflow.state === 'QUARANTINED') {
      const held = node('section', 'staff-private-notice');
      held.append(
        node('h3', '', 'Phiên bản đang cách ly'),
        node('p', '', 'Chỉ hiển thị metadata hiện tại. Không hiển thị câu hỏi, đáp án hoặc lời giải.'),
      );
      content.append(held, renderRightsMetadata(context.sources));
      return content;
    }
    if (preview?.status === 'BLOCKED') {
      const messages = {
        RIGHTS_BLOCKED: 'Máy chủ không cho phép hiển thị nội dung theo quyền hiện tại của toàn bộ nguồn.',
        CONTENT_UNSUPPORTED: 'Máy chủ không cho phép hiển thị nội dung vì có thành phần không được hỗ trợ an toàn.',
        WORKFLOW_HELD: 'Máy chủ không cho phép hiển thị nội dung trong trạng thái quy trình hiện tại.',
      };
      const blocked = node('section', 'staff-private-notice');
      blocked.append(node('h3', '', 'Chỉ hiển thị metadata'), node('p', '', messages[preview.reason] ?? 'Máy chủ đã chặn nội dung riêng.'));
      content.append(blocked, renderRightsMetadata(context.sources));
      return content;
    }

    content.append(renderRightsMetadata(context?.sources));
    if (!reviewContextSupportsPreview(context)) {
      const unsupported = node('p', 'staff-private-notice', 'Nội dung phản hồi không thể hiển thị an toàn. Không hiển thị câu hỏi, đáp án hoặc lời giải.');
      unsupported.setAttribute('role', 'status');
      content.append(unsupported);
      return content;
    }
    const available = node('section', 'staff-review-preview');
    available.append(node('h3', '', 'Bản xem riêng được máy chủ cho phép'));
    available.append(node('p', 'staff-private-notice', 'Chỉ dùng dữ liệu tổng hợp cục bộ. Bản xem này không xác nhận quyền sử dụng hợp pháp, rà soát chuyên môn của con người hoặc quyền xuất bản.'));
    available.append(renderPrivateQuestion(preview.question));
    content.append(available);
    return content;
  }

  async function loadReviewContext(versionId, triggerElement, { preserveHandoff = false, preserveDisposition = false } = {}) {
    if (!isWorkspaceActive() || !state.canReadList || typeof versionId !== 'string') return;
    clearPrivateReviewView({ preserveHandoff, preserveDisposition });
    const requestId = ++state.reviewRequestId;
    const identityEpoch = state.identityEpoch;
    const requestPrincipal = principalKey(state.principal);
    state.reviewView = { kind: 'context', versionId, status: 'loading', triggerElement };
    triggerElement?.setAttribute('aria-expanded', 'true');
    renderReviewPanel({ focusTitle: true });
    const isCurrent = () => isWorkspaceActive()
      && requestId === state.reviewRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.reviewView?.versionId === versionId;
    try {
      const result = await request(`/api/v1/question-versions/${encodeURIComponent(versionId)}/review-context`);
      if (!isCurrent()) return;
      if (result?.version?.versionId !== versionId) throw new Error('Máy chủ không trả về đúng phiên bản đã chọn.');
      state.reviewView = { kind: 'context', versionId, status: 'loaded', triggerElement, context: result };
      renderReviewPanel({ focusTitle: true });
    } catch (error) {
      if (!isCurrent()) return;
      state.reviewView = {
        kind: 'context', versionId, status: 'error', triggerElement,
        error: error.message, errorStatus: error.status, errorCode: error.code,
      };
      renderReviewPanel({ focusTitle: true });
    }
  }

  function dispositionAttemptIsCurrent(versionId, requestId, identityEpoch, requestPrincipal) {
    return isWorkspaceActive()
      && requestId === state.dispositionRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.dispositionStatus?.targetVersionId === versionId;
  }

  async function confirmDisposition() {
    const confirmation = state.dispositionConfirmation;
    const view = state.reviewView;
    const dialog = state.dispositionDialog;
    const form = dialog?.querySelector('form');
    const reasonField = dialog?.querySelector('[data-testid="disposition-form-reason"]');
    if (!confirmation || !form || !reasonField || !dispositionEligible(confirmation.kind, view)
      || confirmation.requestId !== state.dispositionRequestId
      || confirmation.identityEpoch !== state.identityEpoch
      || confirmation.principal !== principalKey(state.principal)
      || confirmation.versionId !== view.versionId
      || confirmation.context !== view.context
      || confirmation.expectedRevision !== view.context.workflow.revision
      || confirmation.contentHash !== view.context.version.contentHash) {
      closeDispositionDialog();
      return;
    }

    const typedReason = reasonField.value.trim();
    if (!typedReason) {
      reasonField.setCustomValidity('Nhập lý do rõ ràng trước khi xác nhận.');
      form.reportValidity();
      return;
    }
    reasonField.setCustomValidity('');
    const reason = `${DISPOSITION_REASON_PREFIX}${typedReason}`;
    if (reason.length > 4096) {
      reasonField.setCustomValidity('Lý do vượt quá giới hạn 4096 ký tự.');
      form.reportValidity();
      return;
    }

    let body;
    if (confirmation.kind === 'reject') {
      const rubric = {};
      for (const [key] of DISPOSITION_RUBRIC) {
        const choice = dialog.querySelector(`[data-testid="disposition-rubric-${key}"]`)?.value;
        if (!['PASS', 'FAIL'].includes(choice)) {
          dialog.querySelector(`[data-testid="disposition-rubric-${key}"]`)?.reportValidity();
          return;
        }
        rubric[key] = choice === 'PASS';
      }
      body = Object.freeze({
        expectedRevision: confirmation.expectedRevision,
        contentHash: confirmation.contentHash,
        decision: 'REJECT',
        rubric: Object.freeze(rubric),
        reason,
      });
    } else {
      body = Object.freeze({ expectedRevision: confirmation.expectedRevision, reason });
    }

    const path = `/api/v1/question-versions/${encodeURIComponent(confirmation.versionId)}/${confirmation.kind === 'reject' ? 'reviews' : 'quarantine'}`;
    const intent = Object.freeze({
      kind: confirmation.kind,
      versionId: confirmation.versionId,
      path,
      expectedRevision: confirmation.expectedRevision,
      contentHash: confirmation.contentHash,
      body,
      key: crypto.randomUUID(),
      identityEpoch: confirmation.identityEpoch,
      principal: confirmation.principal,
    });
    const requestId = ++state.dispositionRequestId;
    state.dispositionStatus = {
      stage: 'pending', kind: intent.kind, targetVersionId: intent.versionId,
      intent, identityEpoch: intent.identityEpoch, principal: intent.principal,
    };
    closeDispositionDialog({ restoreFocus: false });
    clearPrivateReviewView({ preserveDisposition: true });
    renderDispositionPanel();
    container.querySelector('[data-testid="disposition-status"]')?.focus();
    await sendDisposition(intent, requestId);
  }

  async function sendDisposition(intent, requestId) {
    if (!dispositionAttemptIsCurrent(intent.versionId, requestId, intent.identityEpoch, intent.principal)
      || state.dispositionStatus?.intent !== intent
      || !['pending', 'uncertain'].includes(state.dispositionStatus.stage)) return;

    if (state.dispositionStatus.stage === 'uncertain') {
      state.dispositionStatus = { ...state.dispositionStatus, stage: 'pending' };
      renderDispositionPanel();
      container.querySelector('[data-testid="disposition-status"]')?.focus();
    }
    try {
      const response = await request(intent.path, {
        method: 'POST', body: intent.body, csrf: true, idempotencyKey: intent.key,
      });
      if (!dispositionAttemptIsCurrent(intent.versionId, requestId, intent.identityEpoch, intent.principal)
        || state.dispositionStatus?.intent !== intent) return;

      const expectedReceiptRevision = intent.expectedRevision + 1;
      const validRevision = Number.isSafeInteger(response?.revision)
        && response.revision === expectedReceiptRevision;
      const validReceipt = intent.kind === 'reject'
        ? typeof response?.reviewId === 'string'
          && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(response.reviewId)
          && response.state === 'REJECTED'
          && validRevision
        : response?.state === 'QUARANTINED' && validRevision;
      if (!validReceipt) {
        const error = new Error('Không thể đối chiếu biên nhận với lệnh đã gửi.');
        error.uncertain = true;
        throw error;
      }

      const receipt = intent.kind === 'reject'
        ? { reviewId: response.reviewId, state: response.state, revision: response.revision }
        : { state: response.state, revision: response.revision };
      state.dispositionStatus = {
        stage: 'acknowledged', kind: intent.kind, targetVersionId: intent.versionId,
        intent, identityEpoch: intent.identityEpoch, principal: intent.principal,
        receipt, currentState: null, currentRevision: null, currentReadPending: true,
      };
      renderDispositionPanel();
      container.querySelector('[data-testid="disposition-status"]')?.focus();
      await reloadDispositionTarget(intent.versionId, requestId);
    } catch (error) {
      if (!dispositionAttemptIsCurrent(intent.versionId, requestId, intent.identityEpoch, intent.principal)
        || state.dispositionStatus?.intent !== intent) return;
      const uncertain = error?.uncertain === true || (Number.isInteger(error?.status) && error.status >= 500);
      state.dispositionStatus = uncertain
        ? { ...state.dispositionStatus, stage: 'uncertain', message: error.message }
        : {
          stage: 'rejected', kind: intent.kind, targetVersionId: intent.versionId,
          identityEpoch: intent.identityEpoch, principal: intent.principal,
          code: error?.code, message: error?.message ?? 'Lệnh chưa được chấp nhận.',
        };
      renderDispositionPanel();
      container.querySelector('[data-testid="disposition-status"]')?.focus();
    }
  }

  async function reloadDispositionTarget(versionId, requestId) {
    const previous = state.dispositionStatus;
    if (!previous || previous.targetVersionId !== versionId || requestId !== state.dispositionRequestId
      || !['rejected', 'reload-failed', 'acknowledged'].includes(previous.stage)) return;
    const hasReceipt = Boolean(previous.receipt);
    const status = {
      ...previous,
      stage: 'reloading',
      ...(hasReceipt ? { currentState: null, currentRevision: null, currentReadPending: true } : {}),
    };
    state.dispositionStatus = status;
    renderDispositionPanel();

    const identityEpoch = previous.identityEpoch ?? state.identityEpoch;
    const requestPrincipal = previous.principal ?? principalKey(state.principal);
    const isCurrent = () => dispositionAttemptIsCurrent(versionId, requestId, identityEpoch, requestPrincipal);
    try {
      await loadQuestionList({ reset: true, preserveDisposition: true });
      if (!isCurrent()) return;
      const triggerElement = [...container.querySelectorAll('[data-testid="staff-review-inspect"]')]
        .find((element) => element.dataset.versionId === versionId) ?? null;
      await loadReviewContext(versionId, triggerElement, { preserveDisposition: true });
      if (!isCurrent()) return;

      const view = state.reviewView;
      const fresh = view?.kind === 'context' && view.status === 'loaded'
        && view.context?.version?.versionId === versionId;
      if (!fresh) {
        state.dispositionStatus = hasReceipt
          ? {
            ...status, stage: 'acknowledged', currentState: null, currentRevision: null,
            currentReadPending: false, currentReadFailed: true,
            currentReadStatus: view?.errorStatus, currentReadCode: view?.errorCode,
          }
          : { ...status, stage: 'reload-failed', message: view?.error ?? 'Lần kiểm tra B1 mới không khả dụng.' };
      } else if (hasReceipt) {
        state.dispositionStatus = {
          ...status, stage: 'acknowledged',
          currentState: view.context.workflow?.state ?? null,
          currentRevision: view.context.workflow?.revision ?? null,
          currentReadPending: false, currentReadFailed: false,
        };
      } else {
        state.dispositionStatus = {
          ...status, stage: 'reloaded',
          currentState: view.context.workflow?.state ?? null,
          currentRevision: view.context.workflow?.revision ?? null,
        };
      }
      renderReviewPanel();
      renderDispositionPanel();
    } catch (error) {
      if (!isCurrent()) return;
      state.dispositionStatus = hasReceipt
        ? {
          ...status, stage: 'acknowledged', currentState: null, currentRevision: null,
          currentReadPending: false, currentReadFailed: true,
        }
        : { ...status, stage: 'reload-failed', message: error.message };
      renderDispositionPanel();
    }
  }

  async function confirmHandoff() {
    const confirmation = state.handoffConfirmation;
    const view = state.reviewView;
    if (!confirmation || !handoffEligible(view)
      || confirmation.requestId !== state.handoffRequestId
      || confirmation.identityEpoch !== state.identityEpoch
      || confirmation.principal !== principalKey(state.principal)
      || confirmation.versionId !== view.versionId
      || confirmation.context !== view.context
      || confirmation.revision !== view.context.workflow.revision) {
      closeHandoffDialog();
      return;
    }

    const body = Object.freeze({ expectedRevision: confirmation.revision });
    const intent = Object.freeze({
      versionId: confirmation.versionId,
      expectedRevision: confirmation.revision,
      body,
      key: crypto.randomUUID(),
      identityEpoch: confirmation.identityEpoch,
      principal: confirmation.principal,
    });
    const requestId = ++state.handoffRequestId;
    state.handoffStatus = { stage: 'pending', targetVersionId: intent.versionId, intent };
    closeHandoffDialog({ restoreFocus: false });
    renderReviewPanel({ focusHandoffStatus: true });
    await sendHandoff(intent, requestId);
  }

  async function sendHandoff(intent, requestId) {
    if (!handoffAttemptIsCurrent(intent.versionId, requestId, intent.identityEpoch, intent.principal)
      || state.handoffStatus?.intent !== intent
      || !['pending', 'uncertain'].includes(state.handoffStatus.stage)) return;

    if (state.handoffStatus.stage === 'uncertain') {
      state.handoffStatus = { ...state.handoffStatus, stage: 'pending' };
      renderReviewPanel({ focusHandoffStatus: true });
    }
    try {
      const receipt = await request(`/api/v1/question-versions/${encodeURIComponent(intent.versionId)}/submit-review`, {
        method: 'POST', body: intent.body, csrf: true, idempotencyKey: intent.key,
      });
      if (!handoffAttemptIsCurrent(intent.versionId, requestId, intent.identityEpoch, intent.principal)
        || state.handoffStatus?.intent !== intent) return;
      if (receipt?.versionId !== intent.versionId
        || receipt?.state !== 'IN_REVIEW'
        || !Number.isSafeInteger(receipt?.revision)
        || receipt.revision !== intent.expectedRevision + 1) {
        const error = new Error('Không thể đối chiếu biên nhận từ máy chủ với yêu cầu chuyển này.');
        error.uncertain = true;
        throw error;
      }
      state.handoffStatus = {
        stage: 'acknowledged', targetVersionId: intent.versionId, intent, receipt,
        currentState: null, currentRevision: null, currentReadPending: true,
      };
      renderReviewPanel({ focusHandoffStatus: true });
      await reloadHandoffTarget(intent.versionId, requestId);
    } catch (error) {
      if (!handoffAttemptIsCurrent(intent.versionId, requestId, intent.identityEpoch, intent.principal)
        || state.handoffStatus?.intent !== intent) return;
      const uncertain = error?.uncertain === true || (Number.isInteger(error?.status) && error.status >= 500);
      state.handoffStatus = uncertain
        ? { stage: 'uncertain', targetVersionId: intent.versionId, intent, message: error.message }
        : {
          stage: 'rejected', targetVersionId: intent.versionId,
          code: error?.code, message: error?.message ?? 'The handoff request failed.',
        };
      renderReviewPanel({ focusHandoffStatus: true });
    }
  }

  async function reloadHandoffTarget(versionId, requestId) {
    const previous = state.handoffStatus;
    if (!previous || previous.targetVersionId !== versionId || requestId !== state.handoffRequestId
      || !['rejected', 'reload-failed', 'acknowledged'].includes(previous.stage)) return;
    const hasReceipt = Boolean(previous.receipt);
    const status = {
      ...previous,
      stage: 'reloading',
      ...(hasReceipt ? { currentState: null, currentRevision: null, currentReadPending: true } : {}),
    };
    state.handoffStatus = status;
    renderReviewPanel({ focusHandoffStatus: true });

    const isCurrent = () => handoffAttemptIsCurrent(versionId, requestId, previous.intent?.identityEpoch ?? state.identityEpoch,
      previous.intent?.principal ?? principalKey(state.principal));
    try {
      await loadQuestionList({ reset: true, preserveHandoff: true });
      if (!isCurrent()) return;
      const triggerElement = [...container.querySelectorAll('[data-testid="staff-review-inspect"]')]
        .find((element) => element.dataset.versionId === versionId) ?? null;
      await loadReviewContext(versionId, triggerElement, { preserveHandoff: true });
      if (!isCurrent()) return;

      const view = state.reviewView;
      const fresh = view?.kind === 'context' && view.status === 'loaded'
        && view.context?.version?.versionId === versionId;
      if (!fresh) {
        state.handoffStatus = hasReceipt
          ? { ...status, stage: 'acknowledged', currentState: null, currentRevision: null, currentReadPending: false, currentReadFailed: true }
          : { ...status, stage: 'reload-failed', message: view?.error ?? 'Lần đọc mới dữ liệu kiểm tra không khả dụng.' };
      } else if (hasReceipt) {
        state.handoffStatus = {
          ...status, stage: 'acknowledged',
          currentState: view.context.workflow?.state ?? null,
          currentRevision: view.context.workflow?.revision ?? null,
          currentReadPending: false,
          currentReadFailed: false,
        };
      } else {
        state.handoffStatus = {
          ...status, stage: 'reloaded',
          currentState: view.context.workflow?.state ?? null,
          currentRevision: view.context.workflow?.revision ?? null,
        };
      }
      renderReviewPanel({ focusHandoffStatus: true });
    } catch (error) {
      if (!isCurrent()) return;
      state.handoffStatus = hasReceipt
        ? { ...status, stage: 'acknowledged', currentState: null, currentRevision: null, currentReadPending: false, currentReadFailed: true }
        : { ...status, stage: 'reload-failed', message: error.message ?? 'Lần đọc mới dữ liệu kiểm tra thất bại.' };
      renderReviewPanel({ focusHandoffStatus: true });
    }
  }

  async function loadReviewEvidence(versionId, triggerElement) {
    if (!isWorkspaceActive() || typeof versionId !== 'string') return;
    const item = state.items.find((candidate) => candidate.versionId === versionId);
    if (!canRequestReviewEvidence(item)) return;
    clearPrivateReviewView();
    const requestId = ++state.evidenceRequestId;
    const identityEpoch = state.identityEpoch;
    const requestPrincipal = principalKey(state.principal);
    state.evidenceView = { kind: 'evidence', versionId, status: 'loading', triggerElement };
    triggerElement?.setAttribute('aria-expanded', 'true');
    renderReviewPanel({ focusTitle: true });
    const isCurrent = () => isWorkspaceActive()
      && requestId === state.evidenceRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.evidenceView?.versionId === versionId;
    try {
      const result = await request(`/api/v1/question-versions/${encodeURIComponent(versionId)}/review-evidence`);
      if (!isCurrent()) return;
      if (!reviewEvidenceSupportsResponse(result, versionId)) throw new Error('Máy chủ không trả về bằng chứng cho đúng phiên bản đã chọn.');
      state.evidenceView = { kind: 'evidence', versionId, status: 'loaded', triggerElement, evidence: result };
      renderReviewPanel({ focusTitle: true });
    } catch (error) {
      if (!isCurrent()) return;
      state.evidenceView = { kind: 'evidence', versionId, status: 'error', triggerElement, error: error.message };
      renderReviewPanel({ focusTitle: true });
    }
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
    renderReviewPanel();
    renderHandoffPanel();
    renderDispositionPanel();
  }

  async function loadQuestionList({ reset = true, preserveHandoff = false, preserveDisposition = false } = {}) {
    if (!isWorkspaceActive()) return;
    if (!state.canReadList) throw new Error('Vai trò này không được cấp quyền xem danh sách bản nháp.');
    if (!reset && (state.listLoading || !state.nextCursor)) return;
    clearPrivateReviewView({ preserveHandoff, preserveDisposition });

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
      actions.append(button('Hàng chờ rà soát', 'staff-review-queue', async () => {
        if (!isWorkspaceActive()) return;
        state.filters = { state: 'IN_REVIEW', section: '' };
        const stateFilter = container.querySelector('[data-testid="staff-state-filter"]');
        const sectionFilter = container.querySelector('[data-testid="staff-section-filter"]');
        if (stateFilter) stateFilter.value = state.filters.state;
        if (sectionFilter) sectionFilter.value = '';
        try {
          await loadQuestionList({ reset: true });
        } catch (error) {
          showWorkspaceMessage(container, error.message);
        }
      }, 'button secondary'));
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
      clearPrivateReviewView();
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
    const note = node('p', 'repeat-alert', 'Môi trường LOCAL_SYNTHETIC_ONLY chỉ dùng dữ liệu tổng hợp. Danh sách chỉ tải metadata; nội dung riêng chỉ được yêu cầu khi bạn chọn đúng phiên bản. Chỉ có bàn giao bản nháp, từ chối tổng hợp và cách ly theo vai trò hiện tại, sau khi xác nhận rõ ràng. Không có thao tác phê duyệt, thay đổi quyền, xuất bản hoặc chẩn đoán. Tài khoản REVIEWER tổng hợp không đại diện cho người rà soát độc lập đủ điều kiện.');
    shell.append(note);

    if (!state.principal.roles.includes('AUTHOR')) {
      const denied = node('section', 'staff-card staff-denied');
      if (state.canReadList) {
        denied.append(node('h2', '', 'Kiểm tra phiên bản theo quyền hiện tại.'), node('p', '', 'Vai trò này không tạo bản nháp hoặc mở mẫu tác giả. Máy chủ kiểm tra quyền và trạng thái quy trình trước khi cung cấp nội dung riêng. Thao tác từ chối hoặc cách ly chỉ xuất hiện sau khi mở phiên bản đủ điều kiện. Không có thao tác phê duyệt, quản lý quyền hoặc xuất bản ở đây.'));
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
      const reviewHost = node('div');
      reviewHost.dataset.testid = 'staff-review-host';
      reviewHost.id = 'staff-review-host';
      reviewHost.hidden = true;
      const handoffHost = node('div');
      handoffHost.dataset.testid = 'handoff-host';
      const dispositionHost = node('div');
      dispositionHost.dataset.testid = 'disposition-host';
      listCard.append(handoffHost);
      listCard.append(dispositionHost);
      listCard.append(reviewHost);
      listCard.append(createHandoffDialog());
      listCard.append(createDispositionDialog());
      shell.append(listCard);
    }
    shell.append(button('Quay lại khu luyện tập', 'staff-return', returnToPractice, 'button secondary'), footer());
    container.replaceChildren(shell);
    updateQuestionListView();
  }

  async function loadWorkspace() {
    if (!isWorkspaceActive() || !await refreshSession() || !isWorkspaceActive()) return;
    clearPrivateReviewView();
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
