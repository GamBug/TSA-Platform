const ERROR_TEXT = {
  UNAUTHENTICATED: 'Hãy đăng nhập học viên tổng hợp để tiếp tục.',
  FORBIDDEN: 'Phiên hiện tại không có quyền học viên.',
  CSRF_FAILED: 'Phiên xác thực đã thay đổi. Hãy tải lại trang.',
  REVISION_CONFLICT: 'Lựa chọn đã thay đổi ở một thẻ khác. Hãy tải lại câu trả lời trước khi thử lại.',
  ATTEMPT_CLOSED: 'Bài luyện tập đã khép lại; lựa chọn chưa được ghi nhận.',
  CONTENT_WITHDRAWN: 'Nội dung đã bị thu hồi. Bài luyện tập không còn được cung cấp.',
  FORM_UNAVAILABLE: 'Bài luyện tập không còn khả dụng hoặc đã quá hạn bắt đầu.',
  FORM_NOT_OPEN: 'Bài luyện tập chưa đến thời gian mở.',
  INSUFFICIENT_UNSEEN_INVENTORY: 'Chưa đủ câu hỏi mới phù hợp cho bạn. Không có câu hỏi nào được thay thế tự động.',
  INSUFFICIENT_ELIGIBLE_INVENTORY: 'Chưa đủ câu hỏi đủ điều kiện cho bài luyện tập này.',
  SEARCH_EXHAUSTED: 'Chưa chọn được bộ câu hỏi trong giới hạn tìm kiếm. Hãy thử lại sau.',
  RATE_LIMITED: 'Bạn đang gửi yêu cầu quá nhanh. Hãy đợi rồi thử lại.',
  RESULT_NOT_READY: 'Kết quả chưa được phát hành. Hãy đợi quá trình chấm bài.',
  TEMPORARILY_UNAVAILABLE: 'Máy chủ chưa hoàn tất yêu cầu. Bạn có thể thử lại cùng thao tác.',
};
const STATES = new Set(['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'GRADED', 'CANCELLED', 'INVALIDATED']);

function failure(code, status = 503, details = {}) {
  const error = new Error(ERROR_TEXT[code] ?? 'Yêu cầu chưa hoàn tất. Hãy kiểm tra trạng thái rồi thử lại.');
  Object.assign(error, { code, status, details });
  return error;
}
function cookie(name) {
  for (const part of (globalThis.document?.cookie ?? '').split(';')) {
    const item = part.trim();
    if (item.startsWith(`${name}=`)) return item.slice(name.length + 1);
  }
  return null;
}
function clone(value) { return structuredClone(value); }
function group(values = {}) {
  return Object.entries(values).filter(([, value]) => typeof value === 'boolean')
    .map(([statementId, value]) => ({ statementId, value }));
}
function answer(slotId, value, revision = 0) {
  if (value?.type === 'TRUE_FALSE_GROUP') return { slotId, type: value.type, statementValues: group(value.values), revision };
  if (value?.type === 'MULTIPLE_CHOICE') return { slotId, type: value.type, optionIds: clone(value.optionIds), revision };
  return { slotId, type: 'SINGLE_CHOICE', optionId: value?.optionId ?? null, revision };
}
function answered(slot, value) {
  if (!value) return false;
  if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
    return slot.interaction.statements.every(({ id }) => typeof value.values?.[id] === 'boolean');
  }
  if (slot.interaction.type === 'MULTIPLE_CHOICE') {
    return Array.isArray(value.optionIds) && value.optionIds.length >= slot.interaction.minSelections;
  }
  return typeof value.optionId === 'string';
}
function publicSlot(value) {
  return { slotId: value.slotId, sectionId: value.sectionId, ordinal: value.ordinal,
    stimulus: clone(value.stimulus), content: clone(value.content), interaction: clone(value.interaction) };
}

/** Explicit local PostgreSQL mode; never falls back to demo routes or publishes stock. */
export function createPersistentApi({ fetchImpl = (...args) => globalThis.fetch(...args), readCookie = cookie } = {}) {
  const attempts = new Map();
  const pendingKeys = new Map();
  let principal = null;
  let identityGeneration = 0;

  async function request(path, { method = 'GET', body, key, csrfToken = null } = {}) {
    const generation = identityGeneration;
    const headers = new Headers({ accept: 'application/json' });
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (method !== 'GET') {
      const csrf = csrfToken ?? readCookie('tsa_local_csrf');
      if (csrf) headers.set('x-csrf-token', csrf);
    }
    if (key) headers.set('idempotency-key', key);
    let response, value;
    try {
      response = await fetchImpl(path, { method, headers, credentials: 'same-origin', cache: 'no-store',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      value = await response.json();
    } catch { throw failure('TEMPORARILY_UNAVAILABLE'); }
    if (generation !== identityGeneration) throw failure('UNAUTHENTICATED', 401);
    if (!response.ok) {
      const code = value?.error?.code ?? value?.error ?? 'TEMPORARILY_UNAVAILABLE';
      if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') attempts.clear();
      throw failure(typeof code === 'string' ? code : 'TEMPORARILY_UNAVAILABLE', response.status, value?.error?.details ?? {});
    }
    return value;
  }
  async function mutation(path, body, explicitKey = null, csrfToken = null) {
    const signature = `${path}:${JSON.stringify(body)}`;
    const key = explicitKey ?? pendingKeys.get(signature) ?? globalThis.crypto.randomUUID();
    if (explicitKey === null) pendingKeys.set(signature, key);
    try {
      const value = await request(path, { method: path.includes('/answers/') ? 'PUT' : 'POST', body, key, csrfToken });
      if (explicitKey === null && pendingKeys.get(signature) === key) pendingKeys.delete(signature);
      return value;
    } catch (error) {
      // An uncertain network/503 acknowledgement keeps its exact key for retry.
      // A reload resolves durable state through history/GET, not an invented key guarantee.
      if (explicitKey === null && error.status >= 400 && error.status < 500 && error.status !== 429
          && pendingKeys.get(signature) === key) pendingKeys.delete(signature);
      throw error;
    }
  }
  async function pages(path) {
    const generation = identityGeneration;
    const items = []; let cursor = null; const seen = new Set();
    do {
      const result = await request(`${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (generation !== identityGeneration) throw failure('UNAUTHENTICATED', 401);
      if (!Array.isArray(result?.items) || !(result.nextCursor === null || typeof result.nextCursor === 'string')) {
        throw failure('TEMPORARILY_UNAVAILABLE');
      }
      items.push(...result.items); cursor = result.nextCursor;
      if (cursor && seen.has(cursor)) throw failure('TEMPORARILY_UNAVAILABLE');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }
  function display(view, review = null) {
    if (!view || !STATES.has(view.state) || !Array.isArray(view.slots) || !Array.isArray(view.answers)) {
      throw failure('TEMPORARILY_UNAVAILABLE');
    }
    const slots = review ? review.items.map((item) => publicSlot(item.question)) : view.slots.map(publicSlot);
    const values = review ? review.items.map((item) => ({ slotId: item.slotId, value: item.response, revision: 0 })) : view.answers;
    const responses = new Map(values.map((item) => [item.slotId, item.value]));
    return {
      attemptId: view.attemptId, formId: view.formId, domain: view.domain, state: view.state,
      formMode: view.formMode, reuseMode: view.reuseMode, startBefore: view.startBefore,
      serverNow: view.serverNow, startedAt: view.startedAt, deadlineAt: view.deadlineAt,
      closedAt: view.closure.closedAt, closureReason: view.closure.cancellationReason ?? view.closure.terminalReason,
      gradingStatus: view.closure.gradingStatus,
      questionCount: view.sections.reduce((sum, section) => sum + section.count, 0),
      durationSeconds: view.startedAt && view.deadlineAt ? (Date.parse(view.deadlineAt) - Date.parse(view.startedAt)) / 1000 : 0,
      slots, answers: values.map((item) => answer(item.slotId, item.value, item.revision)),
      answeredCount: slots.filter((slot) => answered(slot, responses.get(slot.slotId))).length,
      result: review ? { label: 'KẾT QUẢ LUYỆN TẬP KHÔNG CHÍNH THỨC', correctCount: review.correctCount,
        totalCount: review.totalCount, percentage: review.percentage } : null,
    };
  }
  async function readAttempt(attemptId, expected = null) {
    const path = `/api/v1/attempts/${encodeURIComponent(attemptId)}`;
    const view = await request(path);
    if (expected?.reuseMode && (!view || view.formMode !== (expected.formMode ?? 'PERSONALIZED_PRACTICE')
        || view.reuseMode !== expected.reuseMode
        || (expected.domain && view.domain !== expected.domain))) {
      throw failure('UNEXPECTED_ATTEMPT_MODE', 502);
    }
    let released = null;
    if (view.state === 'GRADED') {
      released = await request(`${path}/result`);
      if (released.attemptId !== attemptId || released.scoreLabel !== 'UNOFFICIAL_PRACTICE' || !Array.isArray(released.items)) {
        throw failure('TEMPORARILY_UNAVAILABLE');
      }
    }
    const result = display(view, released);
    attempts.set(attemptId, { view: clone(view), display: clone(result) });
    return { attempt: result };
  }
  async function session() {
    const current = await request('/local-auth/session');
    if (!current.authenticated) throw failure('UNAUTHENTICATED', 401);
    if (!current.principal?.roles?.includes('CANDIDATE')) throw failure('FORBIDDEN', 403);
    if (principal?.userId !== current.principal.userId) { identityGeneration += 1; attempts.clear(); pendingKeys.clear(); }
    principal = current.principal;
    return current;
  }
  async function openDemoSession() {
    await session();
    const history = await request('/api/v1/attempts?limit=100');
    if (!Array.isArray(history?.items)) throw failure('TEMPORARILY_UNAVAILABLE');
    const current = history.items.find((item) => ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED'].includes(item.state))
      ?? history.items.find((item) => item.state === 'GRADED');
    return current ? readAttempt(current.attemptId, current) : { attempt: null };
  }
  async function loginCandidate(actorKey) {
    if (!['studentA', 'studentB'].includes(actorKey)) throw failure('FORBIDDEN', 403);
    identityGeneration += 1; attempts.clear(); pendingKeys.clear();
    const current = await request('/local-auth/session');
    if (current.authenticated) {
      if (current.principal?.actorKey !== actorKey) throw failure('FORBIDDEN', 403);
      return session();
    }
    await request('/local-auth/bootstrap', { method: 'POST', body: {} });
    await request('/local-auth/login', { method: 'POST', body: { actorKey } });
    return session();
  }
  async function logout() {
    identityGeneration += 1; principal = null; attempts.clear(); pendingKeys.clear();
    await request('/local-auth/logout', { method: 'POST', body: {} });
    principal = null; attempts.clear(); pendingKeys.clear();
  }
  async function loadCatalog() {
    const items = await pages('/api/v1/catalog');
    return { domains: items.filter((item) => item.mode === 'PERSONALIZED_PRACTICE').map((item) => ({
      domain: item.domain, name: item.name, questionCount: item.questionCount, durationSeconds: item.durationSeconds,
      availableFrom: item.availableFrom, availableUntil: item.availableUntil, blueprintVersionId: item.blueprintVersionId,
      available: Date.parse(item.availableFrom) <= Date.now() && Date.now() < Date.parse(item.availableUntil),
    })) };
  }
  function prepareReviewAttempt(blueprintVersionId) {
    if (typeof blueprintVersionId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(blueprintVersionId)) {
      throw failure('VALIDATION_ERROR', 422);
    }
    const body = Object.freeze({ mode: 'PERSONALIZED_PRACTICE', blueprintVersionId,
      reuseMode: 'REVIEW_ALLOWED', acknowledgeRepeats: true });
    const csrfToken = readCookie('tsa_local_csrf');
    if (typeof csrfToken !== 'string' || csrfToken.length === 0) throw failure('UNAUTHENTICATED', 401);
    return Object.freeze({ body, key: globalThis.crypto.randomUUID(), generation: identityGeneration, csrfToken });
  }
  async function createReviewAttempt(intent) {
    if (!intent || intent.generation !== identityGeneration || !intent.body
        || intent.body.mode !== 'PERSONALIZED_PRACTICE' || intent.body.reuseMode !== 'REVIEW_ALLOWED'
        || intent.body.acknowledgeRepeats !== true
        || typeof intent.body.blueprintVersionId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.body.blueprintVersionId)
        || typeof intent.key !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.key)) {
      throw failure('VALIDATION_ERROR', 422);
    }
    await session();
    if (intent.generation !== identityGeneration || intent.csrfToken !== readCookie('tsa_local_csrf')) {
      throw failure('UNAUTHENTICATED', 401);
    }
    // Freeze the session nonce too: a cookie change after this check must fail CSRF,
    // never transfer one candidate's repeat consent to another candidate.
    return mutation('/api/v1/attempts', intent.body, intent.key, intent.csrfToken);
  }
  async function readReviewAttempt(attemptId, domain) {
    return readAttempt(attemptId, { formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'REVIEW_ALLOWED', domain });
  }
  async function startDemo(domain = 'MATH', blueprintVersionId) {
    await session();
    const history = await request('/api/v1/attempts?limit=100');
    let existing = history.items.find((item) => ['CREATED', 'IN_PROGRESS'].includes(item.state));
    let resumed = Boolean(existing);
    if (!existing) {
      if (typeof blueprintVersionId !== 'string') throw failure('VALIDATION_ERROR', 422);
      try { existing = await mutation('/api/v1/attempts', { blueprintVersionId }); }
      catch (error) {
        if (error.code !== 'CONCURRENT_ATTEMPT_EXISTS' || !error.details.existingAttemptId) throw error;
        existing = { attemptId: error.details.existingAttemptId }; resumed = true;
      }
    }
    const loaded = await readAttempt(existing.attemptId, existing);
    if (loaded.attempt.state === 'CREATED') {
      await mutation(`/api/v1/attempts/${encodeURIComponent(existing.attemptId)}/start`, {});
    }
    return { ...await readAttempt(existing.attemptId, existing), resumed };
  }
  async function startReservedAttempt(attemptId, expected = null) {
    // A reservation action must never fall through to a replacement allocation.
    try { await mutation(`/api/v1/attempts/${encodeURIComponent(attemptId)}/start`, {}); }
    catch (error) {
      if (error.code !== 'FORM_UNAVAILABLE') throw error;
      // Start commits cancellation before returning410; read its safe reason.
      return { ...await readAttempt(attemptId, expected), resumed: true };
    }
    return { ...await readAttempt(attemptId, expected), resumed: true };
  }
  async function saveAnswer(attemptId, slotId, input) {
    const cached = attempts.get(attemptId);
    const slot = cached?.view.slots.find((item) => item.slotId === slotId);
    if (!slot || cached.view.state !== 'IN_PROGRESS') throw failure('ATTEMPT_CLOSED', 409);
    let value;
    if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
      const entries = input?.statementValues ?? [];
      if (!Array.isArray(entries) || new Set(entries.map((item) => item.statementId)).size !== entries.length
          || entries.some((item) => typeof item.value !== 'boolean'
            || !slot.interaction.statements.some(({ id }) => id === item.statementId))) throw failure('VALIDATION_ERROR', 422);
      const choices = new Map(entries.map((item) => [item.statementId, item.value]));
      value = { type: 'TRUE_FALSE_GROUP', values: Object.fromEntries(slot.interaction.statements.map(({ id }) => [id, choices.get(id) ?? null])) };
    } else if (slot.interaction.type === 'MULTIPLE_CHOICE') {
      const ids = input?.optionIds;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length
          || ids.some((id) => !slot.interaction.options.some((item) => item.id === id))) throw failure('VALIDATION_ERROR', 422);
      value = { type: 'MULTIPLE_CHOICE', optionIds: slot.interaction.options.filter((item) => ids.includes(item.id)).map((item) => item.id) };
    } else value = { type: 'SINGLE_CHOICE', optionId: typeof input === 'string' ? input : input?.optionId ?? null };
    const expectedRevision = cached.view.answers.find((item) => item.slotId === slotId)?.revision ?? 0;
    const ack = await mutation(`/api/v1/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(slotId)}`,
      { expectedRevision, value });
    // PostgreSQL JSON object key order is not a browser serialization contract.
    if (ack.slotId !== slotId || ack.revision !== expectedRevision + 1
        || !sameValue(ack.value, value)) throw failure('TEMPORARILY_UNAVAILABLE');
    const current = attempts.get(attemptId);
    if (current !== cached) throw failure('REVISION_CONFLICT', 409);
    const entry = { slotId, value: clone(ack.value), revision: ack.revision, savedAt: ack.savedAt };
    const index = cached.view.answers.findIndex((item) => item.slotId === slotId);
    if (index < 0) cached.view.answers.push(entry); else cached.view.answers[index] = entry;
    cached.view.serverNow = ack.savedAt;
    cached.display = display(cached.view);
    return { attempt: clone(cached.display), message: 'Đã lưu lựa chọn vào bài luyện tập.' };
  }
  async function submitAttempt(attemptId) {
    const closure = await mutation(`/api/v1/attempts/${encodeURIComponent(attemptId)}/submit`, {});
    const cached = attempts.get(attemptId);
    if (!cached || closure.state === 'GRADED') return readAttempt(attemptId, cached?.view ?? null);
    const view = { ...cached.view, state: closure.state, startBefore: null, activeSectionId: null,
      slots: [], answers: [], closure, serverNow: closure.closedAt ?? cached.view.serverNow };
    const result = display(view);
    attempts.set(attemptId, { view, display: clone(result) });
    return { attempt: result };
  }
  async function readReview(attemptId) {
    const review = await request(`/api/v1/attempts/${encodeURIComponent(attemptId)}/result`);
    if (review.attemptId !== attemptId || review.scoreLabel !== 'UNOFFICIAL_PRACTICE' || !Array.isArray(review.items)) {
      throw failure('TEMPORARILY_UNAVAILABLE');
    }
    return { review: { attemptId, label: 'ÔN TẬP BÀI LUYỆN TẬP ĐÃ PHÁT HÀNH',
      repeatNotice: 'Câu hỏi thuộc bài luyện tập độc lập; đây không phải kỳ thi TSA chính thức.',
      slots: review.items.map((item) => ({ slotId: item.slotId, ordinal: item.question.ordinal,
        type: item.question.interaction.type, earned: item.earned,
        ...(item.correctAnswer.type === 'SINGLE_CHOICE' ? { correctOptionId: item.correctAnswer.optionId } : {}),
        ...(item.correctAnswer.type === 'MULTIPLE_CHOICE' ? { correctOptionIds: clone(item.correctAnswer.optionIds) } : {}),
        ...(item.correctAnswer.type === 'TRUE_FALSE_GROUP' ? { correctStatementValues: group(item.correctAnswer.values),
          statementValues: group(item.response?.values) } : {}), explanation: clone(item.explanation) })) } };
  }
  return Object.freeze({ persistent: true, openDemoSession, loginCandidate, logout, loadCatalog,
    startDemo, prepareReviewAttempt, createReviewAttempt, readReviewAttempt,
    startReservedAttempt, readAttempt, saveAnswer, submitAttempt, readReview,
    loadHistory: () => pages('/api/v1/attempts') });
}

function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}
