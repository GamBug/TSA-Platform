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
const ACTIVE_PRIVATE_VIEW_CLEARERS = new WeakMap();
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
const REVIEW_HISTORY_RUBRIC = Object.freeze([
  ['correctness', 'Độ chính xác'],
  ['unambiguous', 'Rõ nghĩa'],
  ['relevant', 'Mức độ phù hợp'],
  ['language', 'Ngôn ngữ'],
  ['explanation', 'Lời giải'],
  ['rights', 'Quyền sử dụng'],
]);
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const FIXED_RUN_LIST_KEYS = Object.freeze([
  'schemaVersion', 'environment', 'accessBasis', 'observedAt', 'scope', 'limit', 'truncated', 'runs',
]);
const FIXED_RUN_DIAGNOSTIC_KEYS = Object.freeze([
  'schemaVersion', 'environment', 'accessBasis', 'observedAt', 'scope', 'run', 'algorithmVersion',
  'replayVerified', 'createsForm', 'qualification', 'publicationEligibility', 'outcome', 'failureCode',
  'visitedNodes', 'nodeLimit', 'capturedUnitCount', 'unitLimit', 'capturedCandidateCount', 'selectedCount', 'sections',
]);
const FIXED_RUN_SECTIONS = Object.freeze(['MATH', 'READING', 'SCIENCE']);
const FIXED_RUN_FAILURE_CODES = Object.freeze([
  'CONSTRAINT_CONFLICT', 'INSUFFICIENT_ELIGIBLE_INVENTORY', 'SEARCH_EXHAUSTED',
]);
const REVIEW_HISTORY_KEYS = Object.freeze([
  'schemaVersion', 'environment', 'accessBasis', 'observedAt', 'version',
  'workflowState', 'qualification', 'publicationEligibility', 'limit', 'truncated', 'reviews',
]);
const DATASET_PREFLIGHT_KEYS = Object.freeze([
  'schemaVersion', 'environment', 'accessBasis', 'scope', 'generatedAt', 'qualification',
  'publicationEligibility', 'publishing', 'eligibilityRevision', 'targets', 'counts',
  'shortfalls', 'duplicateFingerprintGroupCount', 'blockerCodes', 'versions',
]);
const PREFLIGHT_BLOCKER_LABELS = Object.freeze({
  CURRENT_RIGHTS_UNVERIFIED: 'Quyền sử dụng hiện tại chưa được xác minh.',
  HUMAN_EQUIVALENCE_REVIEW_REQUIRED: 'Cần người có thẩm quyền rà soát tính tương đương.',
  LAWFUL_INVENTORY_UNVERIFIED: 'Kho nội dung hợp pháp chưa được xác minh.',
  NAMED_HUMAN_AUTHOR_REQUIRED: 'Cần ghi nhận tác giả là con người có tên.',
  NAMED_INDEPENDENT_REVIEWER_REQUIRED: 'Cần ghi nhận người rà soát độc lập có tên.',
  STARTER_TARGET_SHORTFALL: 'Số lượng dưới một hoặc nhiều mục tiêu khởi động.',
  DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW: 'Có nhóm dấu vân tay trùng cần được rà soát.',
});
const REQUIRED_PREFLIGHT_BLOCKERS = Object.freeze([
  'CURRENT_RIGHTS_UNVERIFIED',
  'HUMAN_EQUIVALENCE_REVIEW_REQUIRED',
  'LAWFUL_INVENTORY_UNVERIFIED',
  'NAMED_HUMAN_AUTHOR_REQUIRED',
  'NAMED_INDEPENDENT_REVIEWER_REQUIRED',
]);

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function utcInstantMicros(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!match) return null;
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  const [year, month, day] = match[1].slice(0, 10).split('-').map(Number);
  const [hour, minute, second] = match[1].slice(11).split(':').map(Number);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
  return BigInt(milliseconds) * 1000n + BigInt((match[2] ?? '').padEnd(6, '0'));
}

function utcInstantMicros6(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)
    ? utcInstantMicros(value) : null;
}

function boundedJsonResponse(value, maxBytes = 1024 * 1024) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' && new TextEncoder().encode(serialized).byteLength <= maxBytes;
  } catch {
    return false;
  }
}

function fixedRunMetadataSupports(value) {
  return hasExactKeys(value, ['assemblyRunId', 'blueprintVersionId', 'outcome', 'createdAt'])
    && typeof value.assemblyRunId === 'string' && UUID_PATTERN.test(value.assemblyRunId)
    && typeof value.blueprintVersionId === 'string' && UUID_PATTERN.test(value.blueprintVersionId)
    && ['SUCCESS', 'FAILURE'].includes(value.outcome)
    && utcInstantMicros6(value.createdAt) !== null;
}

function fixedRunListSupportsResponse(list) {
  if (!hasExactKeys(list, FIXED_RUN_LIST_KEYS)
    || list.schemaVersion !== 'staff-fixed-assembly-runs/1'
    || list.environment !== 'LOCAL_SYNTHETIC_ONLY'
    || list.accessBasis !== 'BANK_MANAGER'
    || utcInstantMicros6(list.observedAt) === null
    || list.scope !== 'CAPTURED_FIXED_REFERENCE_RUNS_ONLY'
    || list.limit !== 20 || typeof list.truncated !== 'boolean'
    || !Array.isArray(list.runs) || list.runs.length > 20
    || (list.truncated && list.runs.length !== 20)
    || !boundedJsonResponse(list)) return false;
  const runIds = new Set();
  const observedAt = utcInstantMicros6(list.observedAt);
  let previousTimestamp = null;
  let previousId = '';
  return list.runs.every((run) => {
    const normalizedId = typeof run?.assemblyRunId === 'string' ? run.assemblyRunId.toLowerCase() : '';
    if (!fixedRunMetadataSupports(run) || runIds.has(normalizedId)) return false;
    const timestamp = utcInstantMicros6(run.createdAt);
    if (timestamp > observedAt || (previousTimestamp !== null
      && (previousTimestamp < timestamp || (previousTimestamp === timestamp && previousId < normalizedId)))) return false;
    runIds.add(normalizedId);
    previousTimestamp = timestamp;
    previousId = normalizedId;
    return true;
  });
}

function fixedRunDiagnosticSupportsResponse(diagnostic, expectedRun) {
  if (!hasExactKeys(diagnostic, FIXED_RUN_DIAGNOSTIC_KEYS)
    || diagnostic.schemaVersion !== 'staff-fixed-assembly-diagnostic/1'
    || diagnostic.environment !== 'LOCAL_SYNTHETIC_ONLY'
    || diagnostic.accessBasis !== 'BANK_MANAGER'
    || utcInstantMicros6(diagnostic.observedAt) === null
    || diagnostic.scope !== 'CAPTURED_FIXED_REFERENCE_RUN_ONLY'
    || !fixedRunMetadataSupports(diagnostic.run)
    || !expectedRun || !fixedRunMetadataSupports(expectedRun)
    || diagnostic.run.assemblyRunId !== expectedRun.assemblyRunId
    || diagnostic.run.blueprintVersionId !== expectedRun.blueprintVersionId
    || diagnostic.run.outcome !== expectedRun.outcome
    || diagnostic.run.createdAt !== expectedRun.createdAt
    || utcInstantMicros6(diagnostic.observedAt) < utcInstantMicros6(diagnostic.run.createdAt)
    || diagnostic.algorithmVersion !== 'assembly/1'
    || diagnostic.replayVerified !== true || diagnostic.createsForm !== false
    || diagnostic.qualification !== 'NOT_ATTESTED_BY_PLATFORM'
    || diagnostic.publicationEligibility !== 'NOT_EVALUATED'
    || diagnostic.outcome !== diagnostic.run.outcome
    || !(diagnostic.failureCode === null || FIXED_RUN_FAILURE_CODES.includes(diagnostic.failureCode))
    || !Number.isSafeInteger(diagnostic.visitedNodes) || diagnostic.visitedNodes < 0 || diagnostic.visitedNodes > 50_000
    || !Number.isSafeInteger(diagnostic.nodeLimit) || diagnostic.nodeLimit < 0 || diagnostic.nodeLimit > 50_000
    || diagnostic.visitedNodes > diagnostic.nodeLimit
    || !Number.isSafeInteger(diagnostic.capturedUnitCount) || diagnostic.capturedUnitCount < 0 || diagnostic.capturedUnitCount > 10_000
    || !Number.isSafeInteger(diagnostic.unitLimit) || diagnostic.unitLimit < 0 || diagnostic.unitLimit > 2_000
    || !Number.isSafeInteger(diagnostic.capturedCandidateCount) || diagnostic.capturedCandidateCount < 0 || diagnostic.capturedCandidateCount > 2_000_000
    || !Number.isSafeInteger(diagnostic.selectedCount) || diagnostic.selectedCount < 0 || diagnostic.selectedCount > 200
    || !Array.isArray(diagnostic.sections) || diagnostic.sections.length < 1 || diagnostic.sections.length > 3
    || !boundedJsonResponse(diagnostic)) return false;

  const seenSections = new Set();
  let previousSectionIndex = -1;
  let requiredTotal = 0;
  let selectedTotal = 0;
  for (const section of diagnostic.sections) {
    if (!hasExactKeys(section, ['section', 'requiredCount', 'selectedCount'])
      || !FIXED_RUN_SECTIONS.includes(section.section)
      || seenSections.has(section.section)
      || FIXED_RUN_SECTIONS.indexOf(section.section) <= previousSectionIndex
      || !Number.isSafeInteger(section.requiredCount) || section.requiredCount < 1 || section.requiredCount > 200
      || !Number.isSafeInteger(section.selectedCount) || section.selectedCount < 0 || section.selectedCount > 200
      || section.selectedCount > section.requiredCount) return false;
    seenSections.add(section.section);
    previousSectionIndex = FIXED_RUN_SECTIONS.indexOf(section.section);
    requiredTotal += section.requiredCount;
    selectedTotal += section.selectedCount;
  }
  if (requiredTotal > 200 || selectedTotal !== diagnostic.selectedCount) return false;
  if (diagnostic.outcome === 'SUCCESS') {
    return diagnostic.failureCode === null && diagnostic.selectedCount === requiredTotal;
  }
  return diagnostic.failureCode !== null && diagnostic.selectedCount === 0
    && diagnostic.sections.every((section) => section.selectedCount === 0);
}

function reviewHistorySupportsResponse(history, versionId, contentHash) {
  if (!hasExactKeys(history, REVIEW_HISTORY_KEYS)
    || history.schemaVersion !== 'staff-review-history/1'
    || history.environment !== 'LOCAL_SYNTHETIC_ONLY'
    || history.accessBasis !== 'BANK_MANAGER'
    || utcInstantMicros(history.observedAt) === null
    || !hasExactKeys(history.version, ['versionId', 'contentHash', 'workflowRevision'])
    || history.version.versionId !== versionId
    || !UUID_PATTERN.test(history.version.versionId)
    || history.version.contentHash !== contentHash
    || !HASH_PATTERN.test(history.version.contentHash)
    || !Number.isSafeInteger(history.version.workflowRevision) || history.version.workflowRevision < 1
    || !Object.hasOwn(STATE_LABELS, history.workflowState)
    || history.qualification !== 'NOT_ATTESTED_BY_PLATFORM'
    || history.publicationEligibility !== 'NOT_EVALUATED'
    || history.limit !== 20 || typeof history.truncated !== 'boolean'
    || !Array.isArray(history.reviews) || history.reviews.length > 20
    || (history.truncated && history.reviews.length !== 20)) return false;

  const reviewIds = new Set();
  let previousTimestamp = null;
  let previousId = '';
  return history.reviews.every((review) => {
    const normalizedReviewId = typeof review?.reviewId === 'string' ? review.reviewId.toLowerCase() : '';
    if (!hasExactKeys(review, ['reviewId', 'recordedAt', 'decision', 'rubric', 'reason'])
      || typeof review.reviewId !== 'string' || !UUID_PATTERN.test(review.reviewId)
      || reviewIds.has(normalizedReviewId)
      || !['APPROVE', 'REJECT'].includes(review.decision)
      || !hasExactKeys(review.rubric, REVIEW_HISTORY_RUBRIC.map(([key]) => key))
      || !REVIEW_HISTORY_RUBRIC.every(([key]) => typeof review.rubric[key] === 'boolean')
      || typeof review.reason !== 'string' || !review.reason.trim() || review.reason.length > 4096) return false;
    const timestamp = utcInstantMicros(review.recordedAt);
    if (timestamp === null || (previousTimestamp !== null
      && (previousTimestamp < timestamp
        || (previousTimestamp === timestamp && previousId < normalizedReviewId)))) return false;
    reviewIds.add(normalizedReviewId);
    previousTimestamp = timestamp;
    previousId = normalizedReviewId;
    return true;
  });
}

function datasetPreflightSupportsResponse(report, requestedPins) {
  const sectionKeys = ['MATH', 'READING', 'SCIENCE'];
  const interactionKeys = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'];
  const knownBlockers = new Set(Object.keys(PREFLIGHT_BLOCKER_LABELS));
  const targets = { MATH: 12, READING: 6, SCIENCE: 12 };
  if (!hasExactKeys(report, DATASET_PREFLIGHT_KEYS)
    || report.schemaVersion !== 'staff-dataset-preflight/1'
    || report.environment !== 'LOCAL_SYNTHETIC_ONLY'
    || report.accessBasis !== 'BANK_MANAGER'
    || report.scope !== 'CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION'
    || utcInstantMicros(report.generatedAt) === null
    || report.qualification !== 'NOT_ATTESTED_BY_PLATFORM'
    || report.publicationEligibility !== 'NOT_EVALUATED'
    || report.publishing !== false
    || typeof report.eligibilityRevision !== 'string'
    || !/^(0|[1-9]\d*)$/.test(report.eligibilityRevision)
    || !hasExactKeys(report.targets, sectionKeys)
    || !sectionKeys.every((key) => report.targets[key] === targets[key])
    || !hasExactKeys(report.counts, ['total', 'bySection', 'byInteractionType'])
    || !Number.isSafeInteger(report.counts.total) || report.counts.total < 1 || report.counts.total > 100
    || !hasExactKeys(report.counts.bySection, sectionKeys)
    || !sectionKeys.every((key) => Number.isSafeInteger(report.counts.bySection[key])
      && report.counts.bySection[key] >= 0 && report.counts.bySection[key] <= 100)
    || !hasExactKeys(report.counts.byInteractionType, interactionKeys)
    || !interactionKeys.every((key) => Number.isSafeInteger(report.counts.byInteractionType[key])
      && report.counts.byInteractionType[key] >= 0 && report.counts.byInteractionType[key] <= 100)
    || !hasExactKeys(report.shortfalls, sectionKeys)
    || !sectionKeys.every((key) => Number.isSafeInteger(report.shortfalls[key])
      && report.shortfalls[key] === Math.max(0, targets[key] - report.counts.bySection[key]))
    || !Number.isSafeInteger(report.duplicateFingerprintGroupCount)
    || report.duplicateFingerprintGroupCount < 0 || report.duplicateFingerprintGroupCount > 100
    || !Array.isArray(report.blockerCodes) || report.blockerCodes.length > knownBlockers.size
    || !Array.isArray(report.versions) || report.versions.length !== report.counts.total
    || report.versions.length < 1 || report.versions.length > 100
    || !Array.isArray(requestedPins) || requestedPins.length < 1 || requestedPins.length > 100) return false;

  if (sectionKeys.reduce((sum, key) => sum + report.counts.bySection[key], 0) !== report.counts.total
    || interactionKeys.reduce((sum, key) => sum + report.counts.byInteractionType[key], 0) !== report.counts.total) return false;

  const expectedPins = new Map();
  for (const pin of requestedPins) {
    if (!hasExactKeys(pin, ['versionId', 'contentHash'])
      || typeof pin.versionId !== 'string' || !UUID_PATTERN.test(pin.versionId)
      || typeof pin.contentHash !== 'string' || !HASH_PATTERN.test(pin.contentHash)
      || expectedPins.has(pin.versionId)) return false;
    expectedPins.set(pin.versionId, pin.contentHash);
  }

  const returnedPins = new Set();
  let previousVersionId = '';
  for (const version of report.versions) {
    if (!hasExactKeys(version, ['versionId', 'contentHash', 'workflowRevision', 'state'])
      || typeof version.versionId !== 'string' || !UUID_PATTERN.test(version.versionId)
      || returnedPins.has(version.versionId)
      || expectedPins.get(version.versionId) !== version.contentHash
      || typeof version.contentHash !== 'string' || !HASH_PATTERN.test(version.contentHash)
      || !Number.isSafeInteger(version.workflowRevision) || version.workflowRevision < 1
      || !Object.hasOwn(STATE_LABELS, version.state)
      || (previousVersionId && previousVersionId >= version.versionId)) return false;
    returnedPins.add(version.versionId);
    previousVersionId = version.versionId;
  }
  if (returnedPins.size !== expectedPins.size
    || [...expectedPins.keys()].some((versionId) => !returnedPins.has(versionId))) return false;

  let previousBlocker = '';
  for (const blocker of report.blockerCodes) {
    if (typeof blocker !== 'string' || !knownBlockers.has(blocker)
      || (previousBlocker && previousBlocker >= blocker)) return false;
    previousBlocker = blocker;
  }
  const requiredBlockers = [...REQUIRED_PREFLIGHT_BLOCKERS];
  const hasShortfall = sectionKeys.some((key) => report.shortfalls[key] > 0);
  if (hasShortfall) requiredBlockers.push('STARTER_TARGET_SHORTFALL');
  if (report.duplicateFingerprintGroupCount > 0) requiredBlockers.push('DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW');
  return requiredBlockers.every((code) => report.blockerCodes.includes(code))
    && report.blockerCodes.length === requiredBlockers.length;
}

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

function renderReviewHistory(history) {
  const content = node('div', 'staff-review-history-content');
  content.dataset.versionId = history.version.versionId;
  content.dataset.contentHash = history.version.contentHash;
  content.dataset.workflowRevision = String(history.version.workflowRevision);
  content.dataset.currentState = history.workflowState;
  content.dataset.observedAt = history.observedAt;

  const metadata = node('dl', 'staff-review-metadata');
  appendMetadataPair(metadata, 'Môi trường', history.environment);
  appendMetadataPair(metadata, 'Cơ sở truy cập hiện tại', history.accessBasis);
  appendMetadataPair(metadata, 'Phiên bản chính xác', history.version.versionId);
  appendMetadataPair(metadata, 'Hash nội dung chính xác', history.version.contentHash);
  appendMetadataPair(metadata, 'Revision quy trình hiện tại', String(history.version.workflowRevision));
  appendMetadataPair(metadata, 'Trạng thái quy trình tại thời điểm quan sát', `${STATE_LABELS[history.workflowState] ?? history.workflowState} (${history.workflowState})`);
  appendMetadataPair(metadata, 'Thời điểm quan sát từ máy chủ', history.observedAt);
  appendMetadataPair(metadata, 'Tình trạng xác nhận của nền tảng', history.qualification);
  appendMetadataPair(metadata, 'Điều kiện xuất bản', history.publicationEligibility);
  content.append(metadata);

  content.append(node('p', 'staff-review-history-warning', 'Đây là các quyết định lịch sử được lưu trong cơ sở dữ liệu. Chúng không chứng thực người rà soát đủ điều kiện, quyền sử dụng hợp pháp hoặc khả năng xuất bản hiện tại. APPROVE chỉ là một bản ghi lịch sử, không phải lệnh phê duyệt mới.'));
  const status = node('p', 'staff-review-history-status');
  status.dataset.testid = 'staff-review-history-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  if (history.reviews.length === 0) {
    status.dataset.stage = 'empty';
    status.textContent = 'Không có lượt rà soát nào được ghi nhận cho phiên bản này.';
  } else if (history.truncated) {
    status.dataset.stage = 'truncated';
    status.textContent = 'Chỉ hiển thị 20 quyết định gần nhất; lịch sử cũ hơn chưa được hiển thị.';
  } else {
    status.dataset.stage = 'loaded';
    status.textContent = `Đang hiển thị ${history.reviews.length} quyết định gần nhất, tối đa 20 bản ghi.`;
  }
  content.append(status);

  const entries = node('section', 'staff-review-history-entries');
  entries.append(node('h3', '', 'Các quyết định được ghi nhận gần nhất'));
  for (const review of history.reviews) {
    const entry = node('article', 'staff-review-history-entry');
    entry.dataset.reviewId = review.reviewId;
    entry.dataset.decision = review.decision;
    entry.append(node('h4', '', `Quyết định lịch sử: ${review.decision}`));
    const reviewMetadata = node('dl', 'staff-review-metadata');
    appendMetadataPair(reviewMetadata, 'Mã bản ghi rà soát', review.reviewId);
    appendMetadataPair(reviewMetadata, 'Thời điểm ghi nhận', review.recordedAt);
    entry.append(reviewMetadata);

    const rubric = node('dl', 'staff-review-metadata staff-review-history-rubric');
    for (const [key, label] of REVIEW_HISTORY_RUBRIC) {
      appendMetadataPair(rubric, label, review.rubric[key] ? 'Đạt' : 'Chưa đạt');
    }
    entry.append(rubric, node('h5', '', 'Lý do được ghi nhận'));
    const reason = node('pre', 'staff-review-history-reason', review.reason);
    reason.dataset.testid = 'staff-review-history-reason';
    reason.setAttribute('aria-label', `Lý do lịch sử cho quyết định ${review.decision}`);
    entry.append(reason);
    entries.append(entry);
  }
  content.append(entries);
  return content;
}

function renderDatasetPreflight(report) {
  const content = node('div', 'staff-dataset-preflight-content');
  const metadata = node('dl', 'staff-review-metadata');
  appendMetadataPair(metadata, 'Môi trường', report.environment);
  appendMetadataPair(metadata, 'Cơ sở truy cập', report.accessBasis);
  appendMetadataPair(metadata, 'Phạm vi', report.scope);
  appendMetadataPair(metadata, 'Đủ điều kiện được nền tảng xác nhận', report.qualification);
  appendMetadataPair(metadata, 'Đánh giá quyền xuất bản', report.publicationEligibility);
  appendMetadataPair(metadata, 'Có thao tác xuất bản', report.publishing ? 'Có' : 'Không');
  appendMetadataPair(metadata, 'Revision điều kiện ghi nhận', report.eligibilityRevision);
  appendMetadataPair(metadata, 'Thời điểm tạo báo cáo từ máy chủ', report.generatedAt);
  content.append(metadata);

  content.append(node('p', 'staff-dataset-preflight-warning', 'Đây chỉ là kiểm tra đồ thị chuẩn tắc của các phiên bản đã chọn. Báo cáo không xác nhận kho câu hỏi đã được chấp nhận hoặc đủ điều kiện, quyền sử dụng hiện tại, rà soát của con người hay khả năng lắp đề. Báo cáo phản ánh một lần kiểm tra; quyền và trạng thái có thể thay đổi sau đó.'));
  content.append(node('p', 'staff-dataset-preflight-required-blockers', 'Năm điều kiện về quyền, nguồn hợp pháp và rà soát của con người vẫn cần được xác nhận, kể cả khi số lượng đạt mục tiêu.'));

  const sectionRows = ['MATH', 'READING', 'SCIENCE'].map((key) => [
    key,
    String(report.targets[key]),
    String(report.counts.bySection[key]),
    String(report.shortfalls[key]),
  ]);
  content.append(preflightTable('Mục tiêu chuẩn tắc và số lượng báo cáo', ['Miền', 'Mục tiêu', 'Số lượng', 'Thiếu'], sectionRows));

  const interactionRows = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP'].map((key) => [
    key, String(report.counts.byInteractionType[key]),
  ]);
  interactionRows.push(['Tổng số phiên bản', String(report.counts.total)]);
  content.append(preflightTable('Số lượng theo kiểu tương tác', ['Kiểu tương tác', 'Số lượng'], interactionRows));
  content.append(node('p', 'staff-dataset-preflight-duplicates', `Số nhóm dấu vân tay trùng cần rà soát: ${report.duplicateFingerprintGroupCount}.`));

  const blockers = node('section', 'staff-dataset-preflight-blockers');
  blockers.append(node('h3', '', 'Điều kiện chưa được xác nhận'));
  const blockerList = node('ul');
  for (const code of report.blockerCodes) {
    const item = node('li');
    item.append(node('strong', '', code), node('span', '', ` — ${PREFLIGHT_BLOCKER_LABELS[code]}`));
    blockerList.append(item);
  }
  blockers.append(blockerList);
  content.append(blockers);

  const versionRows = report.versions.map((version) => {
    const row = node('tr');
    row.dataset.versionId = version.versionId;
    row.dataset.contentHash = version.contentHash;
    row.dataset.workflowRevision = String(version.workflowRevision);
    row.dataset.workflowState = version.state;
    for (const value of [version.versionId, version.contentHash, String(version.workflowRevision), `${STATE_LABELS[version.state] ?? version.state} (${version.state})`]) {
      const cell = node('td', '', value);
      row.append(cell);
    }
    return row;
  });
  const pinTable = preflightTable('Phiên bản và hash được kiểm tra chính xác', ['Mã phiên bản', 'Hash nội dung', 'Revision quy trình', 'Trạng thái'], []);
  const pinBody = pinTable.querySelector('tbody');
  pinBody.replaceChildren(...versionRows);
  pinTable.dataset.testid = 'staff-preflight-version-pins';
  content.append(node('p', 'staff-form-help', 'Trên màn hình hẹp, cuộn ngang bảng để xem đủ phiên bản, hash và trạng thái. Khi dùng bàn phím, chọn vùng bảng rồi dùng các phím mũi tên.'), pinTable);
  return content;
}

function renderFixedRunList(list, openRun) {
  const content = node('div', 'staff-fixed-reference-content');
  content.append(node('p', 'staff-fixed-reference-warning', 'Đây là các lần chạy tham chiếu cố định đã được lưu; việc phát lại để xác minh chỉ diễn ra khi bạn mở chi tiết. Chúng không phải bản đề đã niêm phong, không phải kết quả chụp điều kiện đủ tư cách của ngân hàng câu hỏi, không xác nhận quyền sử dụng và không tạo biểu mẫu cho học viên.'));
  content.append(node('p', 'staff-fixed-reference-observation', `Máy chủ ghi nhận danh sách lúc ${list.observedAt}.`));
  if (list.truncated) {
    content.append(node('p', 'staff-fixed-reference-note', 'Danh sách hiển thị 20 lần chạy mới nhất; còn các lần chạy cũ hơn.'));
  }
  if (list.runs.length === 0) {
    content.append(node('p', 'staff-empty staff-fixed-reference-empty', 'Chưa có lần chạy tham chiếu cố định nào được lưu.'));
    return content;
  }

  const region = node('div', 'staff-fixed-reference-table-wrap');
  region.tabIndex = 0;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Các lần chạy tham chiếu cố định đã lưu');
  const table = node('table', 'staff-fixed-reference-table');
  table.append(node('caption', '', 'Tối đa 20 lần chạy tham chiếu cố định mới nhất'));
  const head = node('thead');
  const headerRow = node('tr');
  for (const label of ['Mã lần chạy', 'Phiên bản cấu hình', 'Kết quả được ghi nhận', 'Thời điểm tạo', 'Thao tác']) {
    const header = node('th', '', label);
    header.scope = 'col';
    headerRow.append(header);
  }
  head.append(headerRow);
  table.append(head);
  const body = node('tbody');
  for (const run of list.runs) {
    const row = node('tr');
    row.dataset.runId = run.assemblyRunId;
    row.append(node('td', '', run.assemblyRunId));
    row.append(node('td', '', run.blueprintVersionId));
    row.append(node('td', '', `${run.outcome === 'SUCCESS' ? 'Thành công' : 'Thất bại'} (${run.outcome})`));
    row.append(node('td', '', run.createdAt));
    const actionCell = node('td');
    const trigger = button('Phát lại và xem chẩn đoán', 'staff-fixed-run-open', async () => {
      await openRun(run, trigger);
    }, 'button secondary small');
    trigger.dataset.runId = run.assemblyRunId;
    trigger.setAttribute('aria-controls', 'staff-review-host');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', `Xem chẩn đoán đã phát lại cho lần chạy ${run.assemblyRunId}`);
    actionCell.append(trigger);
    row.append(actionCell);
    body.append(row);
  }
  table.append(body);
  region.append(table);
  content.append(node('p', 'staff-form-help', 'Trên màn hình hẹp, cuộn ngang vùng bảng để xem đủ thông tin. Dùng phím Tab để mở chi tiết một lần chạy.'));
  content.append(region);
  return content;
}

function fixedRunOutcomeMessage(diagnostic) {
  if (diagnostic.outcome === 'SUCCESS') {
    return 'Tìm được tổ hợp đáp ứng các điều kiện đã ghi nhận. Kết quả này chưa xác nhận câu hỏi đủ điều kiện sử dụng, quyền nội dung hoặc rà soát của con người, và không tạo đề thi cho học viên.';
  }
  if (diagnostic.failureCode === 'CONSTRAINT_CONFLICT') {
    return 'Các yêu cầu trong bài toán đã ghi nhận mâu thuẫn với nhau. Kết quả này không mô tả kho câu hỏi hiện tại.';
  }
  if (diagnostic.failureCode === 'INSUFFICIENT_ELIGIBLE_INVENTORY') {
    return 'Không có tổ hợp đáp ứng các điều kiện đã ghi nhận. Đây không phải kết luận về số lượng hoặc tình trạng hiện tại của kho câu hỏi.';
  }
  return 'Đã đạt giới hạn tìm kiếm; tính khả thi của bài toán đã ghi nhận vẫn chưa rõ.';
}

function renderFixedRunDiagnostic(diagnostic) {
  const content = node('div', 'staff-fixed-reference-content');
  const metadata = node('dl', 'staff-review-metadata');
  appendMetadataPair(metadata, 'Môi trường', diagnostic.environment);
  appendMetadataPair(metadata, 'Cơ sở truy cập', diagnostic.accessBasis);
  appendMetadataPair(metadata, 'Phạm vi', diagnostic.scope);
  appendMetadataPair(metadata, 'Mã lần chạy', diagnostic.run.assemblyRunId);
  appendMetadataPair(metadata, 'Phiên bản cấu hình', diagnostic.run.blueprintVersionId);
  appendMetadataPair(metadata, 'Thời điểm tạo lần chạy', diagnostic.run.createdAt);
  appendMetadataPair(metadata, 'Quan sát mới từ máy chủ', diagnostic.observedAt);
  appendMetadataPair(metadata, 'Kết quả được ghi nhận', `${diagnostic.outcome === 'SUCCESS' ? 'Thành công' : 'Thất bại'} (${diagnostic.outcome})`);
  appendMetadataPair(metadata, 'Mã kết quả thất bại', diagnostic.failureCode ?? 'Không có');
  appendMetadataPair(metadata, 'Thuật toán', diagnostic.algorithmVersion);
  appendMetadataPair(metadata, 'Phát lại đã xác minh', diagnostic.replayVerified ? 'Có' : 'Không');
  appendMetadataPair(metadata, 'Có tạo đề thi', diagnostic.createsForm ? 'Có' : 'Không');
  appendMetadataPair(metadata, 'Xác nhận đủ tư cách', diagnostic.qualification);
  appendMetadataPair(metadata, 'Đánh giá khả năng xuất bản', diagnostic.publicationEligibility);
  content.append(metadata);

  content.append(node('p', 'staff-fixed-reference-result', fixedRunOutcomeMessage(diagnostic)));
  content.append(node('p', 'staff-fixed-reference-warning', 'Đây là bài toán tham chiếu tổng hợp, chưa lấy ứng viên từ kho câu hỏi đủ điều kiện. Kiểm tra lại kết quả đã lưu không tạo đề thi, lượt thi hay lịch sử làm bài; không xác nhận quyền sử dụng hoặc rà soát của con người.'));

  const countRows = [
    ['Đơn vị ứng viên đã chụp', diagnostic.capturedUnitCount],
    ['Giới hạn đơn vị', diagnostic.unitLimit],
    ['Ứng viên thành viên đã chụp', diagnostic.capturedCandidateCount],
    ['Số mục được chọn', diagnostic.selectedCount],
    ['Nút đã thăm', diagnostic.visitedNodes],
    ['Giới hạn nút tìm kiếm', diagnostic.nodeLimit],
  ].map(([label, value]) => [label, String(value)]);
  content.append(preflightTable('Số lượng và giới hạn trong lần chạy', ['Chỉ số', 'Giá trị'], countRows));
  const sectionRows = diagnostic.sections.map((section) => [
    section.section,
    String(section.requiredCount),
    String(section.selectedCount),
  ]);
  content.append(preflightTable('Số lượng theo miền trong dữ liệu đã ghi nhận', ['Miền', 'Yêu cầu', 'Được chọn'], sectionRows));
  return content;
}

function preflightTable(captionText, headings, rows) {
  const region = node('div', 'staff-dataset-preflight-table-wrap');
  region.tabIndex = 0;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', captionText);
  const table = node('table', 'staff-dataset-preflight-table');
  table.append(node('caption', '', captionText));
  const head = node('thead');
  const headerRow = node('tr');
  for (const headingText of headings) {
    const heading = node('th', '', headingText);
    heading.scope = 'col';
    headerRow.append(heading);
  }
  head.append(headerRow);
  table.append(head);
  const body = node('tbody');
  for (const values of rows) {
    const row = node('tr');
    for (const value of values) row.append(node('td', '', value));
    body.append(row);
  }
  table.append(body);
  region.append(table);
  return region;
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
  ACTIVE_PRIVATE_VIEW_CLEARERS.get(container)?.();
  const workspaceGeneration = (ACTIVE_WORKSPACE_GENERATIONS.get(container) ?? 0) + 1;
  ACTIVE_WORKSPACE_GENERATIONS.set(container, workspaceGeneration);
  const previousPrivateHost = container.querySelector('[data-testid="staff-review-host"]');
  if (previousPrivateHost) {
    previousPrivateHost.replaceChildren();
    previousPrivateHost.hidden = true;
  }
  for (const trigger of container.querySelectorAll('[data-testid="staff-review-inspect"], [data-testid="staff-review-evidence-open"], [data-testid="staff-review-history-open"]')) {
    trigger.setAttribute('aria-expanded', 'false');
  }
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
    fixedRunRequestId: 0,
    fixedRunView: null,
    reviewHistoryRequestId: 0,
    reviewHistoryView: null,
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
    datasetPreflightSelections: new Map(),
    datasetPreflightRequestId: 0,
    datasetPreflightInFlight: false,
    datasetPreflightView: null,
    datasetPreflightStatus: { stage: 'idle', message: 'Chưa chạy kiểm tra tập phiên bản.' },
    datasetPreflightControls: null,
  };
  const returnToPractice = () => {
    if (!isWorkspaceActive()) return;
    clearPrivateReviewView();
    ACTIVE_PRIVATE_VIEW_CLEARERS.delete(container);
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

  function updateDatasetPreflightControls() {
    const controls = state.datasetPreflightControls;
    if (!controls) return;
    const selectedCount = state.datasetPreflightSelections.size;
    controls.count.textContent = `Đã chọn ${selectedCount} phiên bản.`;
    controls.clear.disabled = selectedCount === 0;
    controls.run.disabled = selectedCount === 0 || state.datasetPreflightInFlight || state.listLoading
      || !state.principal?.roles?.includes('BANK_MANAGER');
    controls.status.dataset.stage = state.datasetPreflightStatus.stage;
    controls.status.textContent = state.datasetPreflightStatus.message;
    const statusIsError = ['error', 'selection-limit'].includes(state.datasetPreflightStatus.stage);
    controls.status.setAttribute('role', statusIsError ? 'alert' : 'status');
    controls.status.setAttribute('aria-live', statusIsError ? 'assertive' : 'polite');
    for (const checkbox of container.querySelectorAll('[data-testid="staff-preflight-select"]')) {
      checkbox.checked = state.datasetPreflightSelections.has(checkbox.dataset.versionId);
    }
  }

  function clearDatasetPreflight({ clearSelection = true } = {}) {
    state.datasetPreflightRequestId += 1;
    state.datasetPreflightView = null;
    if (clearSelection) state.datasetPreflightSelections.clear();
    state.datasetPreflightStatus = state.datasetPreflightInFlight
      ? { stage: 'superseded', message: 'Đã bỏ qua báo cáo đang chờ vì lựa chọn, trang, mục tiêu hoặc phiên đã thay đổi. Hãy chờ yêu cầu kết thúc rồi chạy kiểm tra mới.' }
      : { stage: 'idle', message: 'Chưa có báo cáo hiện hành. Hãy chọn phiên bản rồi chủ động chạy kiểm tra.' };
    updateDatasetPreflightControls();
  }

  function datasetPreflightControls() {
    const section = node('section', 'staff-dataset-preflight-controls');
    section.dataset.testid = 'staff-preflight-controls';
    section.append(node('h3', '', 'Kiểm tra tập phiên bản chuẩn tắc'));
    section.append(node('p', 'staff-form-help', 'Chỉ BANK_MANAGER có thể chạy kiểm tra chỉ đọc sau khi chọn từng phiên bản đang hiển thị. Tối đa 100 phiên bản; không tự chọn mục ở trang chưa tải.'));
    const count = node('p', 'staff-dataset-preflight-count', 'Đã chọn 0 phiên bản.');
    count.dataset.testid = 'staff-preflight-selected-count';
    count.tabIndex = -1;
    count.setAttribute('aria-live', 'polite');
    const actions = node('div', 'staff-header-actions');
    const clear = button('Xóa lựa chọn', 'staff-preflight-clear', async () => {
      if (!isWorkspaceActive()) return;
      clearPrivateReviewView({ preservePreflight: true });
      clearDatasetPreflight();
      updateQuestionListView();
    }, 'button secondary');
    const run = button('Kiểm tra tập phiên bản', 'staff-preflight-run', async () => {
      await runDatasetPreflight(run);
    }, 'button');
    run.setAttribute('aria-controls', 'staff-review-host');
    actions.append(clear, run);
    const status = node('p', 'notice-panel', 'Chưa chạy kiểm tra tập phiên bản.');
    status.dataset.testid = 'staff-preflight-status';
    status.dataset.stage = 'idle';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    section.append(count, actions, status);
    state.datasetPreflightControls = { section, count, clear, run, status };
    updateDatasetPreflightControls();
    return section;
  }

  function metadataListView(items) {
    const list = metadataList(items);
    if (!state.principal?.roles?.includes('BANK_MANAGER')) return list;
    const fieldset = node('fieldset', 'staff-preflight-selection');
    fieldset.append(node('legend', '', 'Chọn các phiên bản cần kiểm tra'));
    const help = node('p', 'staff-form-help', 'Chỉ các phiên bản có checkbox được chọn mới được gửi. Khi đổi bộ lọc, làm mới hoặc tải trang khác, lựa chọn và báo cáo sẽ bị xóa.');
    help.id = 'staff-preflight-selection-help';
    fieldset.append(help, list);
    return fieldset;
  }

  function changeDatasetPreflightSelection(item, checkbox) {
    if (!isWorkspaceActive() || !state.principal?.roles?.includes('BANK_MANAGER')) {
      checkbox.checked = false;
      return;
    }
    const wantsSelected = checkbox.checked;
    clearPrivateReviewView({ preservePreflight: true });
    clearDatasetPreflight({ clearSelection: false });
    if (wantsSelected) {
      if (state.datasetPreflightSelections.size >= 100) {
        checkbox.checked = false;
        state.datasetPreflightStatus = state.datasetPreflightInFlight
          ? { stage: 'superseded', message: 'Đã bỏ qua kết quả đang chờ. Chỉ được chọn tối đa 100 phiên bản.' }
          : { stage: 'selection-limit', message: 'Chỉ được chọn tối đa 100 phiên bản cho một lần kiểm tra.' };
      } else {
        state.datasetPreflightSelections.set(item.versionId, {
          versionId: item.versionId,
          contentHash: item.contentHash,
        });
      }
    } else {
      state.datasetPreflightSelections.delete(item.versionId);
    }
    updateDatasetPreflightControls();
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
      if (state.canReadList && state.principal?.roles?.includes('BANK_MANAGER')) {
        const checkboxId = `staff-preflight-select-${item.versionId}`;
        const label = node('label', 'staff-preflight-choice');
        label.htmlFor = checkboxId;
        const checkbox = node('input', 'staff-preflight-checkbox');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.dataset.testid = 'staff-preflight-select';
        checkbox.dataset.versionId = item.versionId;
        checkbox.dataset.contentHash = item.contentHash;
        checkbox.dataset.hash = item.contentHash;
        checkbox.checked = state.datasetPreflightSelections.has(item.versionId);
        checkbox.disabled = state.listLoading;
        checkbox.setAttribute('aria-describedby', 'staff-preflight-selection-help');
        checkbox.setAttribute('aria-label', `Chọn phiên bản ${item.versionId}, hash ${item.contentHash} để kiểm tra tập phiên bản`);
        checkbox.addEventListener('change', () => changeDatasetPreflightSelection(item, checkbox));
        label.append(checkbox, node('span', '', 'Chọn phiên bản này để kiểm tra'));
        info.append(label);
      }
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
      if (state.canReadList && state.principal?.roles?.includes('BANK_MANAGER')) {
        const history = button('Xem lịch sử rà soát', 'staff-review-history-open', async () => {
          await loadReviewHistory(item.versionId, item.contentHash, history);
        }, 'button secondary small');
        history.dataset.versionId = item.versionId;
        history.setAttribute('aria-label', `Xem lịch sử rà soát của phiên bản ${item.versionId}`);
        history.setAttribute('aria-controls', 'staff-review-host');
        history.setAttribute('aria-expanded', 'false');
        info.append(history);
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

  function clearPrivateReviewView({ restoreFocus = false, preserveHandoff = false, preserveDisposition = false, preservePreflight = false } = {}) {
    const previousViews = [
      state.fixedRunView,
      ...(preservePreflight ? [] : [state.datasetPreflightView]),
      state.reviewHistoryView, state.evidenceView, state.reviewView,
    ];
    const previous = previousViews.find(Boolean);
    if (!preservePreflight) clearDatasetPreflight();
    state.fixedRunRequestId += 1;
    state.fixedRunView = null;
    state.reviewHistoryRequestId += 1;
    state.reviewHistoryView = null;
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
    for (const view of previousViews) {
      view?.triggerElement?.setAttribute('aria-expanded', 'false');
      view?.rowTriggerElement?.setAttribute('aria-expanded', 'false');
    }
    const host = container.querySelector('[data-testid="staff-review-host"]');
    if (host) {
      host.replaceChildren();
      host.hidden = true;
    }
    renderHandoffPanel();
    renderDispositionPanel();
    if (restoreFocus && previous?.kind === 'preflight' && state.datasetPreflightControls?.count?.isConnected) {
      // Clearing the selection disables Run, so focus the stable selection summary.
      state.datasetPreflightControls.count.focus();
    } else if (restoreFocus && previous?.triggerElement?.isConnected) previous.triggerElement.focus();
  }
  ACTIVE_PRIVATE_VIEW_CLEARERS.set(container, () => clearPrivateReviewView());

  async function loadFixedRunList(triggerElement = state.fixedRunView?.triggerElement) {
    if (!isWorkspaceActive() || !state.canReadList || !state.principal?.roles?.includes('BANK_MANAGER')) return;
    if (state.fixedRunView?.kind === 'fixed-runs' && state.fixedRunView.status === 'loading') return;
    clearPrivateReviewView();
    const requestId = ++state.fixedRunRequestId;
    const identityEpoch = state.identityEpoch;
    const requestPrincipal = principalKey(state.principal);
    state.fixedRunView = {
      kind: 'fixed-runs', status: 'loading', triggerElement, identityEpoch, principal: requestPrincipal,
    };
    triggerElement?.setAttribute('aria-expanded', 'true');
    renderReviewPanel({ focusTitle: true });
    const isCurrent = () => isWorkspaceActive()
      && requestId === state.fixedRunRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.canReadList
      && state.principal?.roles?.includes('BANK_MANAGER')
      && state.fixedRunView?.kind === 'fixed-runs'
      && state.fixedRunView?.status === 'loading';
    try {
      const result = await request('/api/v1/assembly-runs');
      if (!isCurrent()) return;
      if (!fixedRunListSupportsResponse(result)) {
        throw new Error('Máy chủ không trả về danh sách lần chạy tham chiếu cố định hợp lệ.');
      }
      state.fixedRunView = {
        ...state.fixedRunView, status: 'loaded', list: result,
      };
      renderReviewPanel({ focusTitle: true });
    } catch (error) {
      if (!isCurrent()) return;
      state.fixedRunView = {
        ...state.fixedRunView, status: 'error',
        error: error.message ?? 'Không thể tải danh sách lần chạy tham chiếu cố định.',
      };
      renderReviewPanel({ focusTitle: true });
    }
  }

  async function loadFixedRunDetail(run, rowTriggerElement, listSnapshot = state.fixedRunView) {
    if (!isWorkspaceActive() || !state.canReadList || !state.principal?.roles?.includes('BANK_MANAGER')
      || !fixedRunMetadataSupports(run) || !listSnapshot || listSnapshot.kind !== 'fixed-runs'
      || listSnapshot.status !== 'loaded' || !listSnapshot.list?.runs?.some((candidate) =>
        candidate.assemblyRunId === run.assemblyRunId && candidate.blueprintVersionId === run.blueprintVersionId
          && candidate.outcome === run.outcome && candidate.createdAt === run.createdAt)) return;

    const retainedList = listSnapshot;
    const triggerElement = retainedList.triggerElement;
    clearPrivateReviewView();
    const requestId = ++state.fixedRunRequestId;
    const identityEpoch = state.identityEpoch;
    const requestPrincipal = principalKey(state.principal);
    state.fixedRunView = {
      kind: 'fixed-detail', status: 'loading', run, triggerElement, rowTriggerElement,
      listSnapshot: retainedList, identityEpoch, principal: requestPrincipal,
    };
    triggerElement?.setAttribute('aria-expanded', 'true');
    rowTriggerElement?.setAttribute('aria-expanded', 'true');
    renderReviewPanel({ focusTitle: true });
    const isCurrent = () => isWorkspaceActive()
      && requestId === state.fixedRunRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.canReadList
      && state.principal?.roles?.includes('BANK_MANAGER')
      && state.fixedRunView?.kind === 'fixed-detail'
      && state.fixedRunView?.run?.assemblyRunId === run.assemblyRunId;
    try {
      const result = await request(`/api/v1/assembly-runs/${encodeURIComponent(run.assemblyRunId)}/diagnostics`);
      if (!isCurrent()) return;
      if (!fixedRunDiagnosticSupportsResponse(result, run)) {
        throw new Error('Máy chủ không trả về chẩn đoán hợp lệ cho lần chạy đã chọn.');
      }
      state.fixedRunView = {
        ...state.fixedRunView, status: 'loaded', diagnostic: result,
      };
      renderReviewPanel({ focusTitle: true });
    } catch (error) {
      if (!isCurrent()) return;
      state.fixedRunView = {
        ...state.fixedRunView, status: 'error',
        error: error.message ?? 'Không thể tải chẩn đoán cho lần chạy đã chọn.',
      };
      renderReviewPanel({ focusTitle: true });
    }
  }

  function returnToFixedRunList(view = state.fixedRunView) {
    if (!isWorkspaceActive() || state.fixedRunView !== view || view?.kind !== 'fixed-detail'
      || view.listSnapshot?.kind !== 'fixed-runs' || view.listSnapshot.status !== 'loaded') return;
    state.fixedRunRequestId += 1;
    state.fixedRunView = view.listSnapshot;
    view.triggerElement?.setAttribute('aria-expanded', 'true');
    view.rowTriggerElement?.setAttribute('aria-expanded', 'false');
    renderReviewPanel();
    const rowTrigger = [...container.querySelectorAll('[data-testid="staff-fixed-run-open"]')]
      .find((element) => element.dataset.runId === view.run.assemblyRunId);
    rowTrigger?.focus();
  }

  function retryFixedRunView(view = state.fixedRunView) {
    if (view?.kind === 'fixed-runs') return loadFixedRunList(view.triggerElement);
    if (view?.kind === 'fixed-detail') return loadFixedRunDetail(view.run, view.rowTriggerElement, view.listSnapshot);
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
    const view = state.datasetPreflightView ?? state.fixedRunView ?? state.reviewHistoryView ?? state.evidenceView ?? state.reviewView;
    host.replaceChildren();
    host.hidden = !view;
    if (!view) return;

    const isPreflight = view.kind === 'preflight';
    const isHistory = view.kind === 'history';
    const isEvidence = view.kind === 'evidence';
    const isFixedRunList = view.kind === 'fixed-runs';
    const isFixedRunDetail = view.kind === 'fixed-detail';
    const isFixedRun = isFixedRunList || isFixedRunDetail;
    const panel = node('section', `staff-card staff-review-context${isEvidence ? ' staff-review-evidence-panel' : ''}${isHistory ? ' staff-review-history-panel' : ''}${isPreflight ? ' staff-dataset-preflight-panel' : ''}${isFixedRun ? ' staff-fixed-reference-panel' : ''}`);
    panel.dataset.testid = isFixedRunDetail ? 'staff-fixed-detail' : isFixedRunList ? 'staff-fixed-list' : isPreflight ? 'staff-preflight-report' : isHistory ? 'staff-review-history' : isEvidence ? 'staff-review-evidence' : 'staff-review-context';
    if (isPreflight) {
      panel.dataset.scope = view.report.scope;
      panel.dataset.versionCount = String(view.report.versions.length);
      panel.dataset.generatedAt = view.report.generatedAt;
      panel.dataset.eligibilityRevision = view.report.eligibilityRevision;
    }
    if (isHistory) {
      panel.dataset.versionId = view.versionId;
      panel.dataset.contentHash = view.contentHash;
      if (view.history) {
        panel.dataset.workflowRevision = String(view.history.version.workflowRevision);
        panel.dataset.workflowState = view.history.workflowState;
        panel.dataset.currentState = view.history.workflowState;
        panel.dataset.observedAt = view.history.observedAt;
        panel.dataset.reviewCount = String(view.history.reviews.length);
        panel.dataset.truncated = String(view.history.truncated);
      }
    }
    if (isFixedRunList && view.list) {
      panel.dataset.observedAt = view.list.observedAt;
      panel.dataset.runCount = String(view.list.runs.length);
      panel.dataset.truncated = String(view.list.truncated);
    }
    if (isFixedRunDetail) {
      const diagnostic = view.diagnostic;
      panel.dataset.runId = diagnostic?.run?.assemblyRunId ?? view.run.assemblyRunId;
      if (diagnostic) {
        panel.dataset.blueprintVersionId = diagnostic.run.blueprintVersionId;
        panel.dataset.createdAt = diagnostic.run.createdAt;
        panel.dataset.outcome = diagnostic.outcome;
        panel.dataset.failureCode = diagnostic.failureCode ?? 'null';
        panel.dataset.observedAt = diagnostic.observedAt;
        panel.dataset.replayVerified = String(diagnostic.replayVerified);
        panel.dataset.selectedCount = String(diagnostic.selectedCount);
      }
    }
    const titleId = isFixedRunDetail ? 'staff-fixed-detail-title' : isFixedRunList ? 'staff-fixed-list-title' : isPreflight ? 'staff-preflight-title' : isHistory ? 'staff-review-history-title' : isEvidence ? 'staff-review-evidence-title' : 'staff-review-title';
    panel.setAttribute('aria-labelledby', titleId);
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearPrivateReviewView({ restoreFocus: true });
      }
    });
    const titleText = view.status === 'loading'
      ? (isFixedRunList ? 'Đang tải kết quả lắp đề cố định…' : isFixedRunDetail ? 'Đang phát lại chẩn đoán lần chạy…' : isPreflight ? 'Đang tạo báo cáo tập phiên bản…' : isHistory ? 'Đang tải lịch sử rà soát…' : isEvidence ? 'Đang tải bằng chứng được ghi nhận…' : 'Đang tải nội dung riêng…')
      : view.status === 'error'
        ? (isFixedRunList ? 'Không thể tải kết quả lắp đề cố định' : isFixedRunDetail ? 'Không thể tải chẩn đoán lần chạy' : isPreflight ? 'Không thể tạo báo cáo tập phiên bản' : isHistory ? 'Không thể tải lịch sử rà soát' : isEvidence ? 'Không thể tải bằng chứng quyền' : 'Không thể tải nội dung riêng')
        : (isFixedRunList ? 'Kết quả lắp đề cố định đã lưu' : isFixedRunDetail ? 'Chẩn đoán lần chạy cố định đã phát lại' : isPreflight ? 'Báo cáo kiểm tra đồ thị chuẩn tắc' : isHistory ? 'Lịch sử rà soát được ghi nhận' : isEvidence ? 'Bằng chứng quyền được ghi nhận' : 'Kiểm tra phiên bản riêng');
    const heading = node('h2', '', titleText);
    heading.id = titleId;
    heading.tabIndex = -1;
    const actions = node('div', 'staff-header-actions');
    if (view.status === 'error') {
      actions.append(button(isFixedRun ? 'Tải lại kết quả' : isPreflight ? 'Chạy kiểm tra mới' : isHistory ? 'Tải lại lịch sử rà soát' : isEvidence ? 'Thử tải lại bằng chứng' : 'Thử tải lại phiên bản này',
        isFixedRun ? 'staff-fixed-retry' : isHistory ? 'staff-review-history-reload' : isEvidence ? 'staff-review-evidence-retry' : 'staff-review-retry', async () => {
          if (isFixedRun) await retryFixedRunView(view);
          else if (isPreflight) await runDatasetPreflight(state.datasetPreflightControls?.run);
          else if (isHistory) await loadReviewHistory(view.versionId, view.contentHash, view.triggerElement);
          else if (isEvidence) await loadReviewEvidence(view.versionId, view.triggerElement);
          else if (state.dispositionStatus?.stage === 'acknowledged'
            && state.dispositionStatus.targetVersionId === view.versionId) {
            await reloadDispositionTarget(view.versionId, state.dispositionRequestId);
          }
          else await loadReviewContext(view.versionId, view.triggerElement);
        }, 'button secondary'));
    }
    if (isFixedRunDetail) {
      actions.append(button('Quay lại danh sách kết quả', 'staff-fixed-back', () => {
        returnToFixedRunList(view);
      }, 'button secondary'));
    }
    if (!isFixedRun && !isPreflight && !isEvidence && !isHistory && handoffEligible(view)) {
      const handoff = button('Chuyển bản nháp vào hàng chờ rà soát', 'handoff-open', async () => {
        openHandoffConfirmation(handoff);
      }, 'button secondary');
      handoff.dataset.versionId = view.versionId;
      handoff.setAttribute('aria-controls', 'handoff-dialog');
      actions.append(handoff);
    }
    if (!isFixedRun && !isPreflight && !isEvidence && !isHistory && dispositionEligible('reject', view)) {
      const reject = button('Từ chối phiên bản đang chờ rà soát', 'disposition-reject-open', async () => {
        openDispositionDialog('reject', reject);
      }, 'button secondary');
      reject.dataset.versionId = view.versionId;
      reject.setAttribute('aria-controls', 'disposition-dialog');
      actions.append(reject);
    }
    if (!isFixedRun && !isPreflight && !isEvidence && !isHistory && dispositionEligible('quarantine', view)) {
      const quarantine = button('Cách ly phiên bản', 'disposition-quarantine-open', async () => {
        openDispositionDialog('quarantine', quarantine);
      }, 'button secondary');
      quarantine.dataset.versionId = view.versionId;
      quarantine.setAttribute('aria-controls', 'disposition-dialog');
      actions.append(quarantine);
    }
    actions.append(button(isFixedRun ? 'Đóng kết quả' : isPreflight ? 'Đóng báo cáo' : isHistory ? 'Đóng lịch sử rà soát' : isEvidence ? 'Đóng bằng chứng quyền' : 'Đóng nội dung riêng',
      isFixedRun ? 'staff-fixed-close' : isPreflight ? 'staff-preflight-close' : isHistory ? 'staff-review-history-close' : isEvidence ? 'staff-review-evidence-close' : 'staff-review-close', () => {
        clearPrivateReviewView({ restoreFocus: true });
      }, 'button secondary'));
    panel.append(heading, actions);

    if (view.status === 'loading') {
      const status = node('p', 'notice-panel', isFixedRunList
        ? 'Đang yêu cầu danh sách lần chạy tham chiếu cố định từ máy chủ…'
        : isFixedRunDetail ? 'Đang yêu cầu chẩn đoán đã phát lại cho đúng lần chạy đã chọn…'
          : isHistory ? 'Đang yêu cầu lịch sử cho đúng phiên bản đã chọn từ máy chủ…' : 'Đang yêu cầu đúng phiên bản đã chọn từ máy chủ…');
      if (isFixedRun) {
        status.dataset.testid = 'staff-fixed-status';
        status.dataset.stage = isFixedRunList ? 'loading-list' : 'loading-detail';
      } else if (isHistory) {
        status.dataset.testid = 'staff-review-history-status';
        status.dataset.stage = 'loading';
      }
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      panel.append(status);
    } else if (view.status === 'error') {
      const status = node('p', 'notice-panel', view.error);
      if (isFixedRun) {
        status.dataset.testid = 'staff-fixed-status';
        status.dataset.stage = isFixedRunList ? 'list-error' : 'detail-error';
      } else if (isHistory) {
        status.dataset.testid = 'staff-review-history-status';
        status.dataset.stage = 'error';
      }
      status.setAttribute('role', 'alert');
      status.setAttribute('aria-live', 'assertive');
      panel.append(status);
    } else {
      if (isFixedRunList) {
        const empty = view.list.runs.length === 0;
        const status = node('p', 'notice-panel', empty
          ? 'Chưa có kết quả lắp đề cố định đã lưu.'
          : `Đã tải ${view.list.runs.length} kết quả lắp đề cố định đã ghi nhận.`);
        status.dataset.testid = 'staff-fixed-status';
        status.dataset.stage = empty ? 'list-empty' : 'list-loaded';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        panel.append(status, renderFixedRunList(view.list, (run, trigger) => loadFixedRunDetail(run, trigger, view)));
      } else if (isFixedRunDetail) {
        const status = node('p', 'notice-panel', 'Máy chủ đã xác nhận bản phát lại cho đúng lần chạy đã chọn. Thời điểm quan sát mới được hiển thị bên dưới.');
        status.dataset.testid = 'staff-fixed-status';
        status.dataset.stage = 'detail-loaded';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        panel.append(status, renderFixedRunDiagnostic(view.diagnostic));
      } else {
        panel.append(isPreflight ? renderDatasetPreflight(view.report) : isHistory ? renderReviewHistory(view.history)
          : isEvidence ? renderReviewEvidence(view.evidence) : renderReviewContext(view.context));
      }
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

  async function loadReviewHistory(versionId, contentHash, triggerElement) {
    if (!isWorkspaceActive() || !state.canReadList
      || !state.principal?.roles?.includes('BANK_MANAGER')
      || typeof versionId !== 'string' || typeof contentHash !== 'string') return;
    const item = state.items.find((candidate) => candidate.versionId === versionId);
    if (!item || item.contentHash !== contentHash || !HASH_PATTERN.test(contentHash)) return;

    clearPrivateReviewView();
    const requestId = ++state.reviewHistoryRequestId;
    const identityEpoch = state.identityEpoch;
    const requestPrincipal = principalKey(state.principal);
    state.reviewHistoryView = {
      kind: 'history', versionId, contentHash, status: 'loading', triggerElement,
      identityEpoch, principal: requestPrincipal,
    };
    triggerElement?.setAttribute('aria-expanded', 'true');
    renderReviewPanel({ focusTitle: true });
    const isCurrent = () => isWorkspaceActive()
      && requestId === state.reviewHistoryRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.canReadList
      && state.principal?.roles?.includes('BANK_MANAGER')
      && state.items.some((candidate) => candidate.versionId === versionId && candidate.contentHash === contentHash)
      && state.reviewHistoryView?.versionId === versionId
      && state.reviewHistoryView?.contentHash === contentHash;
    try {
      const result = await request(`/api/v1/question-versions/${encodeURIComponent(versionId)}/review-history`);
      if (!isCurrent()) return;
      if (!reviewHistorySupportsResponse(result, versionId, contentHash)) {
        throw new Error('Máy chủ không trả về lịch sử hợp lệ cho đúng phiên bản đã chọn.');
      }
      state.reviewHistoryView = {
        ...state.reviewHistoryView, status: 'loaded', history: result,
      };
      renderReviewPanel({ focusTitle: true });
    } catch (error) {
      if (!isCurrent()) return;
      state.reviewHistoryView = {
        ...state.reviewHistoryView, status: 'error', error: error.message,
      };
      renderReviewPanel({ focusTitle: true });
    }
  }

  async function runDatasetPreflight(triggerElement) {
    if (!isWorkspaceActive() || !state.canReadList
      || !state.principal?.roles?.includes('BANK_MANAGER')
      || state.datasetPreflightInFlight || state.datasetPreflightSelections.size < 1
      || state.datasetPreflightSelections.size > 100) return;
    const pins = Object.freeze([...state.datasetPreflightSelections.values()].map((pin) => Object.freeze({
      versionId: pin.versionId,
      contentHash: pin.contentHash,
    })));
    const body = Object.freeze({ versions: pins });
    if (!pins.every((pin) => state.items.some((item) => item.versionId === pin.versionId
      && item.contentHash === pin.contentHash))) {
      clearPrivateReviewView();
      state.datasetPreflightStatus = {
        stage: 'error',
        message: 'Danh sách hiện tại không còn khớp với các phiên bản đã chọn. Lựa chọn đã được xóa; hãy tải lại metadata rồi chọn lại.',
      };
      updateDatasetPreflightControls();
      return;
    }

    clearPrivateReviewView({ preservePreflight: true });
    const requestId = ++state.datasetPreflightRequestId;
    const identityEpoch = state.identityEpoch;
    const requestPrincipal = principalKey(state.principal);
    state.datasetPreflightView = null;
    state.datasetPreflightStatus = { stage: 'pending', message: `Đang kiểm tra ${pins.length} phiên bản đã chọn. Không có thao tác thay đổi.` };
    state.datasetPreflightInFlight = true;
    updateDatasetPreflightControls();

    const isCurrent = () => isWorkspaceActive()
      && requestId === state.datasetPreflightRequestId
      && identityEpoch === state.identityEpoch
      && requestPrincipal === principalKey(state.principal)
      && state.canReadList
      && state.principal?.roles?.includes('BANK_MANAGER')
      && state.datasetPreflightSelections.size === pins.length
      && pins.every((pin) => state.datasetPreflightSelections.get(pin.versionId)?.contentHash === pin.contentHash
        && state.items.some((item) => item.versionId === pin.versionId && item.contentHash === pin.contentHash));
    try {
      const report = await request('/api/v1/datasets/preflight', {
        method: 'POST', body, csrf: true,
      });
      if (!isCurrent()) return;
      if (!datasetPreflightSupportsResponse(report, pins)) {
        throw new Error('Máy chủ không trả về báo cáo hợp lệ khớp chính xác với các phiên bản đã chọn.');
      }
      state.datasetPreflightView = {
        kind: 'preflight', status: 'loaded', report, pins, triggerElement,
      };
      state.datasetPreflightStatus = {
        stage: 'loaded', message: 'Báo cáo khớp với các phiên bản đã chọn. Đây không phải xác nhận đủ điều kiện, quyền, rà soát con người hoặc khả năng lắp đề.',
      };
      renderReviewPanel({ focusTitle: true });
    } catch (error) {
      if (!isCurrent()) return;
      state.datasetPreflightView = null;
      const errorMessage = error.code === 'VALIDATION_ERROR'
        ? 'Máy chủ từ chối tập phiên bản này. Hãy thay đổi lựa chọn hoặc tải lại metadata.'
        : error.message;
      state.datasetPreflightStatus = {
        stage: 'error',
        message: `Không thể tạo báo cáo hiện hành: ${errorMessage} Hãy chủ động chạy kiểm tra mới sau khi kiểm tra lựa chọn hoặc tải lại metadata.`,
      };
      renderReviewPanel();
    } finally {
      if (isWorkspaceActive()) {
        state.datasetPreflightInFlight = false;
        if (state.datasetPreflightStatus.stage === 'superseded') {
          state.datasetPreflightStatus = {
            stage: 'idle',
            message: 'Báo cáo đã bị bỏ qua vì lựa chọn, trang, mục tiêu hoặc phiên thay đổi. Hãy xem lại lựa chọn rồi chủ động chạy kiểm tra mới.',
          };
        }
        updateDatasetPreflightControls();
      }
    }
  }

  function updateQuestionListView() {
    if (!isWorkspaceActive()) return;
    const target = container.querySelector('[data-testid="staff-question-list"]');
    if (target) target.replaceChildren(metadataListView(state.items));

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
    updateDatasetPreflightControls();
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
    return { field, input, label };
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
    if (state.principal.roles.includes('BANK_MANAGER')) {
      let fixedRuns;
      fixedRuns = button('Kết quả lắp đề cố định', 'staff-fixed-open', async () => {
        await loadFixedRunList(fixedRuns);
      }, 'button secondary');
      fixedRuns.setAttribute('aria-controls', 'staff-review-host');
      fixedRuns.setAttribute('aria-expanded', 'false');
      actions.append(fixedRuns);
    }
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
    const note = node('p', 'repeat-alert', 'Môi trường LOCAL_SYNTHETIC_ONLY chỉ dùng dữ liệu tổng hợp. Danh sách chỉ tải metadata; nội dung riêng và lịch sử rà soát chỉ được yêu cầu khi bạn chọn đúng phiên bản. BANK_MANAGER có thể chủ động kiểm tra đồ thị chuẩn tắc của các phiên bản được chọn; báo cáo không xác nhận tồn kho đủ điều kiện, quyền hiện tại, rà soát của con người hay khả năng lắp đề. Lịch sử rà soát chỉ mở cho BANK_MANAGER và chỉ hiển thị quyết định đã lưu. Chỉ có bàn giao bản nháp, từ chối tổng hợp và cách ly theo vai trò hiện tại, sau khi xác nhận rõ ràng. Không có thao tác phê duyệt, thay đổi quyền hoặc xuất bản. Tài khoản REVIEWER tổng hợp không đại diện cho người rà soát độc lập đủ điều kiện.');
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
      formCard.append(node('p', 'staff-form-help', 'Trình soạn thảo này hỗ trợ tối đa hai lựa chọn hoặc hai mệnh đề. Miền câu hỏi vẫn là Toán học; chỉ dùng nội dung tổng hợp trong môi trường cục bộ.'));
      const form = node('form', 'staff-draft-form');
      const prompt = labeledInput('Nội dung câu hỏi', 'draft-prompt', state.template.content[0]?.text ?? '', true);
      prompt.input.rows = 3;
      const firstOption = labeledInput('Lựa chọn A', 'draft-option-a', state.template.interaction.options[0]?.content[0]?.text ?? '');
      const secondOption = labeledInput('Lựa chọn B', 'draft-option-b', state.template.interaction.options[1]?.content[0]?.text ?? '');
      const interactionTypeField = node('div', 'staff-field');
      const interactionTypeLabel = node('label', '', 'Loại tương tác');
      interactionTypeLabel.htmlFor = 'draft-interaction-type';
      const interactionType = node('select', 'staff-input');
      interactionType.id = 'draft-interaction-type';
      interactionType.dataset.testid = 'draft-interaction-type';
      for (const [value, labelText] of [
        ['SINGLE_CHOICE', 'Một đáp án đúng'],
        ['MULTIPLE_CHOICE', 'Nhiều đáp án đúng'],
        ['TRUE_FALSE_GROUP', 'Đúng hoặc sai cho từng mệnh đề'],
      ]) {
        const option = node('option', '', labelText);
        option.value = value;
        interactionType.append(option);
      }
      interactionType.value = 'SINGLE_CHOICE';
      interactionTypeField.append(interactionTypeLabel, interactionType);
      const interactionHelp = node('p', 'staff-form-help', 'Chuyển loại sẽ xóa các đáp án đã chọn. Hãy chọn lại đáp án cho loại mới trước khi tạo bản nháp.');
      interactionHelp.id = 'draft-interaction-help';
      interactionType.setAttribute('aria-describedby', interactionHelp.id);
      interactionTypeField.append(interactionHelp);
      const answerField = node('fieldset', 'staff-interaction-fieldset');
      let activeAnswerControls = null;
      function renderAnswerControls(initialSingleChoice = '') {
        answerField.replaceChildren();
        const type = interactionType.value;
        firstOption.label.textContent = type === 'TRUE_FALSE_GROUP' ? 'Mệnh đề A' : 'Lựa chọn A';
        secondOption.label.textContent = type === 'TRUE_FALSE_GROUP' ? 'Mệnh đề B' : 'Lựa chọn B';

        if (type === 'SINGLE_CHOICE') {
          answerField.append(node('legend', '', 'Đáp án trong bản nháp'));
          const answerLabel = node('label', '', 'Lựa chọn đúng');
          answerLabel.htmlFor = 'draft-answer';
          const answer = node('select', 'staff-input');
          answer.id = 'draft-answer';
          answer.dataset.testid = 'draft-answer';
          answer.required = true;
          for (const [value, labelText] of [['', 'Chọn đáp án đúng'], ['a', 'Lựa chọn A'], ['b', 'Lựa chọn B']]) {
            const option = node('option', '', labelText);
            option.value = value;
            answer.append(option);
          }
          answer.value = initialSingleChoice;
          answerField.append(answerLabel, answer);
          activeAnswerControls = { type, answer };
          return;
        }

        if (type === 'MULTIPLE_CHOICE') {
          const legend = node('legend', '', 'Các đáp án đúng');
          const help = node('p', 'staff-form-help', 'Chọn ít nhất một đáp án; với hai lựa chọn, số đáp án được chọn từ 1 đến 2.');
          help.id = 'draft-multiple-answer-help';
          answerField.append(legend, help);
          const choices = [];
          for (const [value, labelText, testId] of [
            ['a', 'Lựa chọn A', 'draft-answer-multiple-a'],
            ['b', 'Lựa chọn B', 'draft-answer-multiple-b'],
          ]) {
            const label = node('label', 'staff-answer-choice');
            const checkbox = node('input', 'staff-answer-checkbox');
            checkbox.type = 'checkbox';
            checkbox.value = value;
            checkbox.id = testId;
            checkbox.dataset.testid = testId;
            checkbox.setAttribute('aria-describedby', help.id);
            const text = node('span', '', labelText);
            label.htmlFor = testId;
            label.append(checkbox, text);
            choices.push(checkbox);
            answerField.append(label);
          }
          const syncRequiredChoice = () => {
            choices[0].setCustomValidity(choices.some((choice) => choice.checked)
              ? '' : 'Chọn ít nhất một đáp án đúng.');
          };
          for (const choice of choices) choice.addEventListener('change', syncRequiredChoice);
          syncRequiredChoice();
          activeAnswerControls = { type, choices, syncRequiredChoice };
          return;
        }

        answerField.append(node('legend', '', 'Đáp án cho từng mệnh đề'));
        const trueFalseAnswers = [];
        for (const [value, statementLabel, testId] of [
          ['a', 'Mệnh đề A', 'draft-answer-true-false-a'],
          ['b', 'Mệnh đề B', 'draft-answer-true-false-b'],
        ]) {
          const field = node('div', 'staff-field staff-answer-true-false-field');
          const label = node('label', '', `${statementLabel}: chọn Đúng hoặc Sai`);
          label.htmlFor = testId;
          const answer = node('select', 'staff-input');
          answer.id = testId;
          answer.dataset.testid = testId;
          answer.required = true;
          for (const [answerValue, answerText] of [['', 'Chọn Đúng hoặc Sai'], ['true', 'Đúng'], ['false', 'Sai']]) {
            const option = node('option', '', answerText);
            option.value = answerValue;
            answer.append(option);
          }
          field.append(label, answer);
          answerField.append(field);
          trueFalseAnswers.push(answer);
        }
        activeAnswerControls = { type, trueFalseAnswers };
      }
      renderAnswerControls(state.template.answerKey?.type === 'SINGLE_CHOICE'
        ? state.template.answerKey.optionId : '');
      interactionType.addEventListener('change', () => {
        if (isWorkspaceActive()) renderAnswerControls();
      });
      const explanation = labeledInput('Lời giải riêng', 'draft-explanation', state.template.explanation[0]?.text ?? '', true);
      explanation.input.rows = 3;
      const requiredTextInputs = [
        [prompt.input, 'Nhập nội dung câu hỏi.'],
        [firstOption.input, 'Nhập nội dung lựa chọn hoặc mệnh đề A.'],
        [secondOption.input, 'Nhập nội dung lựa chọn hoặc mệnh đề B.'],
        [explanation.input, 'Nhập lời giải riêng.'],
      ];
      for (const [input, message] of requiredTextInputs) {
        input.addEventListener('input', () => input.setCustomValidity(input.value.trim() ? '' : message));
      }
      const create = node('button', 'button', 'Tạo bản nháp');
      create.type = 'submit';
      create.dataset.testid = 'draft-create';
      form.append(prompt.field, interactionTypeField, firstOption.field, secondOption.field, answerField, explanation.field, create);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!isWorkspaceActive() || state.busy) return;
        for (const [input, message] of requiredTextInputs) {
          input.setCustomValidity(input.value.trim() ? '' : message);
        }
        activeAnswerControls?.syncRequiredChoice?.();
        if (!form.reportValidity()) return;
        state.busy = true;
        create.disabled = true;
        try {
          const type = interactionType.value;
          const optionBlocks = [firstOption, secondOption].map((option) => ({
            id: option === firstOption ? 'a' : 'b',
            content: [{ type: 'text', text: option.input.value }],
          }));
          let interaction;
          let answerKey;
          if (type === 'SINGLE_CHOICE') {
            interaction = { type, options: optionBlocks };
            answerKey = { type, optionId: activeAnswerControls.answer.value };
          } else if (type === 'MULTIPLE_CHOICE') {
            interaction = { type, minSelections: 1, maxSelections: 2, options: optionBlocks };
            answerKey = { type, optionIds: activeAnswerControls.choices
              .filter((choice) => choice.checked).map((choice) => choice.value) };
          } else {
            interaction = {
              type,
              statements: optionBlocks.map(({ id, content }) => ({ id, content })),
            };
            answerKey = {
              type,
              values: Object.fromEntries(activeAnswerControls.trueFalseAnswers.map((answer, index) => [
                index === 0 ? 'a' : 'b', answer.value === 'true',
              ])),
            };
          }
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
            interaction,
            answerKey,
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
      if (state.principal.roles.includes('BANK_MANAGER')) listCard.append(datasetPreflightControls());
      listCard.append(filters);
      const status = node('p', 'notice-panel', 'Đang tải danh sách metadata…');
      status.dataset.testid = 'staff-list-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      listCard.append(status);
      const list = node('div', 'staff-question-list-wrap');
      list.dataset.testid = 'staff-question-list';
      list.append(metadataListView(state.items));
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
