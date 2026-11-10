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
const STATE_ORDER = { CREATED: 0, IN_PROGRESS: 1, SUBMITTED: 2, EXPIRED: 2, GRADED: 3, CANCELLED: 4, INVALIDATED: 4 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DOMAINS = new Set(['MATH', 'READING', 'SCIENCE']);
const PROFILE_KINDS = new Set(['INDEPENDENT_PRACTICE', 'PUBLIC_REFERENCE']);
const API_VERSIONS = new Set(['v1', 'v2', 'v4']);
const NUMERIC_DECIMAL = /^[+-]?[0-9]{1,40}(?:[.,][0-9]{1,20})?$/u;

function validNumericResponse(value) {
  return typeof value === 'string' && value.length <= 64 && NUMERIC_DECIMAL.test(value.trim());
}

function exactRecord(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function plainDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  });
}

function scalarLength(value) { return [...value].length; }

function wellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

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
  if (value?.type === 'NUMERIC_RESPONSE') return { slotId, type: value.type, value: value.value, revision };
  if (value?.type === 'CLOZE') return { slotId, type: value.type, values: clone(value.values), revision };
  if (value?.type === 'MATCHING') return { slotId, type: value.type, assignments: clone(value.assignments), revision };
  if (value?.type === 'TRUE_FALSE_GROUP') return { slotId, type: value.type, statementValues: group(value.values), revision };
  if (value?.type === 'MULTIPLE_CHOICE') return { slotId, type: value.type, optionIds: clone(value.optionIds), revision };
  return { slotId, type: 'SINGLE_CHOICE', optionId: value?.optionId ?? null, revision };
}
function answered(slot, value) {
  if (!value) return false;
  if (slot.interaction.type === 'NUMERIC_RESPONSE') {
    return value.type === 'NUMERIC_RESPONSE' && validNumericResponse(value.value);
  }
  if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
    return slot.interaction.statements.every(({ id }) => typeof value.values?.[id] === 'boolean');
  }
  if (slot.interaction.type === 'MULTIPLE_CHOICE') {
    return Array.isArray(value.optionIds) && value.optionIds.length >= slot.interaction.minSelections;
  }
  if (slot.interaction.type === 'CLOZE') {
    return value.type === 'CLOZE' && slot.interaction.fields.length > 0
      && slot.interaction.fields.every(({ id }) => Object.hasOwn(value.values ?? {}, id)
        && typeof value.values[id] === 'string' && value.values[id].trim().length > 0);
  }
  if (slot.interaction.type === 'MATCHING') {
    if (value.type !== 'MATCHING' || slot.interaction.rows.length === 0) return false;
    const limits = new Map(slot.interaction.targets.map(({ id, maxUses }) => [id, maxUses]));
    const uses = new Map();
    for (const { id } of slot.interaction.rows) {
      if (!Object.hasOwn(value.assignments ?? {}, id)) return false;
      const targetId = value.assignments[id];
      if (typeof targetId !== 'string' || !limits.has(targetId)) return false;
      const count = (uses.get(targetId) ?? 0) + 1;
      if (count > limits.get(targetId)) return false;
      uses.set(targetId, count);
    }
    return true;
  }
  return typeof value.optionId === 'string';
}
function publicSlot(value) {
  return { slotId: value.slotId, sectionId: value.sectionId, ordinal: value.ordinal,
    stimulus: clone(value.stimulus), content: clone(value.content), interaction: clone(value.interaction) };
}

/** Explicit local PostgreSQL mode; never falls back to demo routes or publishes stock. */
export function createPersistentApi({ fetchImpl = (...args) => globalThis.fetch(...args), readCookie = cookie, apiVersion = 'v1' } = {}) {
  if (!API_VERSIONS.has(apiVersion)) throw failure('VALIDATION_ERROR', 422);
  const apiRoot = `/api/${apiVersion}`;
  const attempts = new Map();
  const pendingKeys = new Map();
  const catalogProfiles = new Map(),personalProfiles = new Map();
  const shortIntents = new WeakSet();
  const topicIntents = new WeakMap();
  let topicCatalogBinding = null;
  let principal = null;
  let identityGeneration = 0;
  let readSequence = 0;

  function invalidateIdentity() {
    identityGeneration += 1; principal = null; topicCatalogBinding = null;
    attempts.clear(); personalProfiles.clear(); catalogProfiles.clear(); pendingKeys.clear();
  }
  function identityBinding() {
    return { generation: identityGeneration, nonce: readCookie('tsa_local_csrf') };
  }
  function requireIdentity(binding) {
    // A stale operation must not invalidate the replacement identity's state.
    if (binding.generation !== identityGeneration) throw failure('UNAUTHENTICATED', 401);
    if (binding.nonce !== readCookie('tsa_local_csrf')) {
      invalidateIdentity(); throw failure('UNAUTHENTICATED', 401);
    }
  }

  async function request(path, { method = 'GET', body, key, csrfToken = null } = {}) {
    const generation = identityGeneration;
    const studentRequest = /^\/api\/v[124]\//u.test(path);
    const sessionNonce = studentRequest ? readCookie('tsa_local_csrf') : null;
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
    if (studentRequest && sessionNonce !== readCookie('tsa_local_csrf')) {
      identityGeneration += 1; principal = null; topicCatalogBinding = null; attempts.clear(); personalProfiles.clear(); catalogProfiles.clear(); pendingKeys.clear();
      const denied = response.status === 403;
      const code = denied && typeof value?.error?.code === 'string' ? value.error.code : 'UNAUTHENTICATED';
      throw failure(code, denied ? 403 : 401);
    }
    if (!response.ok) {
      const code = value?.error?.code ?? value?.error ?? 'TEMPORARILY_UNAVAILABLE';
      if (code === 'UNAUTHENTICATED' || code === 'FORBIDDEN') invalidateIdentity();
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
    const binding = identityBinding();
    const items = []; let cursor = null; const seen = new Set();
    do {
      const result = await request(`${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      requireIdentity(binding);
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
      practiceProfile: clone(personalProfiles.get(view.attemptId) ?? null),
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
    const binding = identityBinding();
    const readId = ++readSequence;
    const path = `${apiRoot}/attempts/${encodeURIComponent(attemptId)}`;
    const view = await request(path);
    requireIdentity(binding);
    const expectedMode = expected?.formMode
      ?? (expected?.reuseMode === 'FIXED_AS_PUBLISHED' ? 'PUBLISHED_FIXED' : 'PERSONALIZED_PRACTICE');
    if (!view || view.attemptId !== attemptId
        || (expected?.reuseMode && (view.formMode !== expectedMode
          || view.reuseMode !== expected.reuseMode
          || (expected.domain && view.domain !== expected.domain)
          || (expected.formId && view.formId !== expected.formId)
        || (expected.questionCount && (!Array.isArray(view.sections)
          || view.sections.reduce((sum,section)=>sum+section.count,0)!==expected.questionCount))))) {
      throw failure('UNEXPECTED_ATTEMPT_MODE', 502);
    }
    const interactionTypes = new Set(Array.isArray(view?.slots)
      ? view.slots.map((slot) => slot?.interaction?.type) : []);
    const hasV3OnlyInteraction = [...interactionTypes].some((type) => ['CLOZE', 'MATCHING'].includes(type));
    const invalidV4Interaction = apiVersion === 'v4'
      && [...interactionTypes].some((type) => !['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE_GROUP',
        'NUMERIC_RESPONSE', 'CLOZE', 'MATCHING'].includes(type));
    if (!STATES.has(view.state) || !Array.isArray(view.slots) || !Array.isArray(view.answers)
        || (apiVersion === 'v1' && view.slots.some((slot) => slot?.interaction?.type === 'NUMERIC_RESPONSE'))
        || (apiVersion !== 'v4' && hasV3OnlyInteraction) || invalidV4Interaction) {
      throw failure('TEMPORARILY_UNAVAILABLE');
    }
    let released = null;
    if (view.state === 'GRADED') {
      released = await request(`${path}/result`);
      requireIdentity(binding);
      if (released.attemptId !== attemptId || released.scoreLabel !== 'UNOFFICIAL_PRACTICE' || !Array.isArray(released.items)) {
        throw failure('TEMPORARILY_UNAVAILABLE');
      }
    }
    // Reads and mutations have separate ordering: an earlier read completion
    // cannot suppress a later read's authoritative closure. Known lifecycle and
    // answer revisions never move backward. Auth/release/mode checks run first.
    const current = attempts.get(attemptId);
    if (current) {
      const olderState = STATE_ORDER[view.state] < STATE_ORDER[current.view.state];
      const sameState = STATE_ORDER[view.state] === STATE_ORDER[current.view.state];
      const olderAnswers = current.view.answers.some((item) => item.revision > (view.answers.find((entry) => entry.slotId === item.slotId)?.revision ?? 0));
      const newerAnswers = view.answers.some((item) => item.revision > (current.view.answers.find((entry) => entry.slotId === item.slotId)?.revision ?? 0));
      if (olderState || (sameState && (olderAnswers || (!newerAnswers && current.readId > readId)))) {
        return { attempt: clone(current.display) };
      }
    }
    const result = display(view, released);
    attempts.set(attemptId, { view: clone(view), display: clone(result), readId });
    return { attempt: result };
  }
  async function session(bound = false) {
    const binding = identityBinding();
    const current = await request('/local-auth/session');
    requireIdentity(binding);
    if (!current.authenticated) { invalidateIdentity(); throw failure('UNAUTHENTICATED', 401); }
    if (!current.principal?.roles?.includes('CANDIDATE')) { invalidateIdentity(); throw failure('FORBIDDEN', 403); }
    if (principal?.userId !== current.principal.userId) { identityGeneration += 1; attempts.clear(); personalProfiles.clear(); catalogProfiles.clear(); pendingKeys.clear(); }
    principal = current.principal;
    return bound ? { current, binding: identityBinding() } : current;
  }
  async function openDemoSession() {
    const { binding } = await session(true);
    requireIdentity(binding);
    const history = await request(`${apiRoot}/attempts?limit=100`);
    requireIdentity(binding);
    if (!Array.isArray(history?.items)) throw failure('TEMPORARILY_UNAVAILABLE');
    const current = history.items.find((item) => ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED'].includes(item.state))
      ?? history.items.find((item) => item.state === 'GRADED');
    const result = current ? await readAttempt(current.attemptId, current) : { attempt: null };
    requireIdentity(binding);
    return result;
  }
  async function loginCandidate(actorKey) {
    if (!['studentA', 'studentB'].includes(actorKey)) throw failure('FORBIDDEN', 403);
    invalidateIdentity();
    const binding = identityBinding();
    const current = await request('/local-auth/session');
    requireIdentity(binding);
    if (current.authenticated) {
      if (current.principal?.actorKey !== actorKey) throw failure('FORBIDDEN', 403);
    } else {
      const guest = await request('/local-auth/bootstrap', { method: 'POST', body: {} });
      if (binding.generation !== identityGeneration) throw failure('UNAUTHENTICATED', 401);
      const guestNonce = guest.csrfToken ?? binding.nonce;
      if (guestNonce !== readCookie('tsa_local_csrf')) { invalidateIdentity(); throw failure('UNAUTHENTICATED', 401); }
      await request('/local-auth/login', { method: 'POST', body: { actorKey }, csrfToken: guestNonce });
      // Login intentionally rotates the cookie; adopt only after a fresh session
      // confirms the requested actor, while preserving generation ownership.
      if (binding.generation !== identityGeneration) throw failure('UNAUTHENTICATED', 401);
    }
    const authenticated = await session(true);
    requireIdentity(authenticated.binding);
    if (authenticated.current.principal.actorKey !== actorKey) { invalidateIdentity(); throw failure('FORBIDDEN', 403); }
    return authenticated.current;
  }
  async function logout() {
    invalidateIdentity();
    const generation = identityGeneration;
    await request('/local-auth/logout', { method: 'POST', body: {} });
    if (generation !== identityGeneration) throw failure('UNAUTHENTICATED', 401);
    invalidateIdentity();
  }
  async function loadTopics({ durationSeconds = 120 } = {}) {
    const binding = identityBinding();
    const result = await request(`/api/v1/topics?durationSeconds=${encodeURIComponent(durationSeconds)}`);
    requireIdentity(binding);
    if (!Array.isArray(result?.groups)) throw failure('TEMPORARILY_UNAVAILABLE');
    topicCatalogBinding = Object.freeze(binding);
    return result;
  }
  async function createTopicAttempt(intent) {
    if (!intent || typeof intent.key !== 'string' || !intent.body) throw failure('VALIDATION_ERROR', 422);
    if (!topicIntents.has(intent)) {
      if (!topicCatalogBinding) throw failure('UNAUTHENTICATED', 401);
      topicIntents.set(intent, { binding: topicCatalogBinding, body: clone(intent.body), key: intent.key });
    }
    const prepared = topicIntents.get(intent);
    const { binding } = prepared;
    requireIdentity(binding);
    await session();
    requireIdentity(binding);
    // The selected catalog and exact retry body belong to the initiating identity.
    const receipt = await mutation('/api/v1/topic-practice', prepared.body, prepared.key, binding.nonce);
    requireIdentity(binding);
    if (!UUID.test(receipt?.attemptId) || receipt.formMode !== 'PERSONALIZED_PRACTICE'
        || receipt.reuseMode !== 'NEW_ONLY') throw failure('UNEXPECTED_ATTEMPT_MODE', 502);
    const profile = receipt.practiceProfile;
    if (profile?.topicPractice === true && UUID.test(profile.blueprintVersionId)
        && DOMAINS.has(profile.domain) && profile.questionCount === prepared.body.questionCount
        && Number.isSafeInteger(profile.durationSeconds) && profile.durationSeconds >= 60 && profile.durationSeconds <= 10800) {
      personalProfiles.set(receipt.attemptId, clone(profile));
    }
    const result = await readAttempt(receipt.attemptId, receipt);
    requireIdentity(binding);
    return result;
  }
  async function loadCatalog() {
    const binding = identityBinding();
    const items = await pages(`${apiRoot}/catalog`);
    requireIdentity(binding);
    const domains = items.filter((item) => item.mode === 'PERSONALIZED_PRACTICE').map((item) => ({
      domain: item.domain, name: item.name, questionCount: item.questionCount, durationSeconds: item.durationSeconds,
      isShort: ['MATH','SCIENCE'].includes(item.domain)&&item.questionCount===2&&item.durationSeconds===180,
      reviewAllowed:item.reviewAllowed===true,
      availableFrom: item.availableFrom, availableUntil: item.availableUntil, blueprintVersionId: item.blueprintVersionId,
      available: Date.parse(item.availableFrom) <= Date.now() && Date.now() < Date.parse(item.availableUntil),
    }));
    catalogProfiles.clear();
    for(const profile of domains)catalogProfiles.set(profile.blueprintVersionId,Object.freeze(clone(profile)));
    const fixedForms = items.filter((item) => item.mode === 'PUBLISHED_FIXED').map((item) => {
      const from = typeof item.availableFrom === 'string' ? Date.parse(item.availableFrom) : Number.NaN;
      const until = typeof item.availableUntil === 'string' ? Date.parse(item.availableUntil) : Number.NaN;
      if (!UUID.test(item.formId) || typeof item.name !== 'string' || item.name.trim().length === 0
          || !DOMAINS.has(item.domain) || !Number.isSafeInteger(item.questionCount) || item.questionCount <= 0
          || !Number.isSafeInteger(item.durationSeconds) || item.durationSeconds <= 0
          || !PROFILE_KINDS.has(item.profileKind) || item.repeatsAllowed !== true
          || !Number.isFinite(from) || !Number.isFinite(until) || until <= from) {
        throw failure('TEMPORARILY_UNAVAILABLE');
      }
      return Object.freeze({ mode: 'PUBLISHED_FIXED', formId: item.formId, repeatsAllowed: true,
        name: item.name, domain: item.domain, questionCount: item.questionCount, durationSeconds: item.durationSeconds,
        profileKind: item.profileKind, availableFrom: item.availableFrom, availableUntil: item.availableUntil });
    });
    return { domains, fixedForms: Object.freeze(fixedForms) };
  }
  function prepareShortAttempt(blueprintVersionId) {
    const profile=catalogProfiles.get(blueprintVersionId),csrfToken=readCookie('tsa_local_csrf');
    if(!profile?.isShort||!UUID.test(blueprintVersionId))throw failure('VALIDATION_ERROR',422);
    if(typeof csrfToken!=='string'||!csrfToken)throw failure('UNAUTHENTICATED',401);
    const intent=Object.freeze({body:Object.freeze({blueprintVersionId}),key:crypto.randomUUID(),
      generation:identityGeneration,csrfToken,profile});
    shortIntents.add(intent);return intent;
  }
  async function createShortAttempt(intent) {
    if(!shortIntents.has(intent)||intent.generation!==identityGeneration)throw failure('UNAUTHENTICATED',401);
    await session();
    if(intent.generation!==identityGeneration||intent.csrfToken!==readCookie('tsa_local_csrf'))throw failure('UNAUTHENTICATED',401);
    const receipt=await mutation(`${apiRoot}/attempts`,intent.body,intent.key,intent.csrfToken);
    requireIdentity({ generation: intent.generation, nonce: intent.csrfToken });
    if(!UUID.test(receipt?.attemptId)||!UUID.test(receipt?.formId)||receipt.state!=='CREATED'
      ||receipt.domain!==intent.profile.domain||receipt.formMode!=='PERSONALIZED_PRACTICE'
      ||receipt.reuseMode!=='NEW_ONLY')throw failure('UNEXPECTED_ATTEMPT_MODE',502);
    personalProfiles.set(receipt.attemptId,intent.profile);
    return receipt;
  }
  async function readShortAttempt(attemptId,domain) {
    const binding = identityBinding();
    if(!UUID.test(attemptId)||!['MATH','SCIENCE'].includes(domain))throw failure('VALIDATION_ERROR',422);
    const result = await readAttempt(attemptId,{formMode:'PERSONALIZED_PRACTICE',reuseMode:'NEW_ONLY',domain,questionCount:2});
    requireIdentity(binding); return result;
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
    const receipt = await mutation(`${apiRoot}/attempts`, intent.body, intent.key, intent.csrfToken);
    requireIdentity({ generation: intent.generation, nonce: intent.csrfToken }); return receipt;
  }
  function prepareFixedAttempt(formId) {
    if (typeof formId !== 'string' || !UUID.test(formId)) throw failure('VALIDATION_ERROR', 422);
    const body = Object.freeze({ mode: 'PUBLISHED_FIXED', formId,
      reuseMode: 'FIXED_AS_PUBLISHED', acknowledgeRepeats: true });
    const csrfToken = readCookie('tsa_local_csrf');
    if (typeof csrfToken !== 'string' || csrfToken.length === 0) throw failure('UNAUTHENTICATED', 401);
    return Object.freeze({ body, key: globalThis.crypto.randomUUID(), generation: identityGeneration, csrfToken });
  }
  async function createFixedAttempt(intent) {
    const intentKeys = ['body', 'key', 'generation', 'csrfToken'];
    const bodyKeys = ['mode', 'formId', 'reuseMode', 'acknowledgeRepeats'];
    if (!exactRecord(intent, intentKeys) || !exactRecord(intent.body, bodyKeys)
        || intent.generation !== identityGeneration
        || intent.body.mode !== 'PUBLISHED_FIXED' || !UUID.test(intent.body.formId)
        || intent.body.reuseMode !== 'FIXED_AS_PUBLISHED' || intent.body.acknowledgeRepeats !== true
        || typeof intent.key !== 'string' || !UUID.test(intent.key)
        || typeof intent.csrfToken !== 'string' || intent.csrfToken.length === 0) {
      throw failure('VALIDATION_ERROR', 422);
    }
    await session();
    if (intent.generation !== identityGeneration || intent.csrfToken !== readCookie('tsa_local_csrf')) {
      throw failure('UNAUTHENTICATED', 401);
    }
    const receipt = await mutation(`${apiRoot}/attempts`, intent.body, intent.key, intent.csrfToken);
    requireIdentity({ generation: intent.generation, nonce: intent.csrfToken }); return receipt;
  }
  async function readFixedAttempt(attemptId, domain, formId) {
    const binding = identityBinding();
    if (typeof attemptId !== 'string' || !UUID.test(attemptId)
        || !DOMAINS.has(domain) || typeof formId !== 'string' || !UUID.test(formId)) {
      throw failure('VALIDATION_ERROR', 422);
    }
    const result = await readAttempt(attemptId, { formMode: 'PUBLISHED_FIXED', reuseMode: 'FIXED_AS_PUBLISHED', domain, formId });
    requireIdentity(binding); return result;
  }
  async function readReviewAttempt(attemptId, domain) {
    const binding = identityBinding();
    const result = await readAttempt(attemptId, { formMode: 'PERSONALIZED_PRACTICE', reuseMode: 'REVIEW_ALLOWED', domain });
    requireIdentity(binding); return result;
  }
  async function startDemo(domain = 'MATH', blueprintVersionId) {
    const { binding } = await session(true);
    requireIdentity(binding);
    const history = await request(`${apiRoot}/attempts?limit=100`);
    requireIdentity(binding);
    let existing = history.items.find((item) => ['CREATED', 'IN_PROGRESS'].includes(item.state));
    if(existing)throw failure('CONCURRENT_ATTEMPT_EXISTS',409,{existingAttemptId:existing.attemptId});
    if (typeof blueprintVersionId !== 'string') throw failure('VALIDATION_ERROR', 422);
    existing=await mutation(`${apiRoot}/attempts`,{blueprintVersionId},null,binding.nonce);
    requireIdentity(binding);
    const profile=catalogProfiles.get(blueprintVersionId);
    if(profile && profile.domain===domain && existing.domain===domain && existing.formMode==='PERSONALIZED_PRACTICE'
      && existing.reuseMode==='NEW_ONLY')personalProfiles.set(existing.attemptId,profile);
    const loaded = await readAttempt(existing.attemptId, existing);
    requireIdentity(binding);
    if (loaded.attempt.state === 'CREATED') {
      await mutation(`${apiRoot}/attempts/${encodeURIComponent(existing.attemptId)}/start`, {}, null, binding.nonce);
      requireIdentity(binding);
    }
    const result = await readAttempt(existing.attemptId, existing);
    requireIdentity(binding); return { ...result, resumed:false };
  }
  async function startReservedAttempt(attemptId, expected = null) {
    const binding = identityBinding();
    // A reservation action must never fall through to a replacement allocation.
    try { await mutation(`${apiRoot}/attempts/${encodeURIComponent(attemptId)}/start`, {}, null, binding.nonce); requireIdentity(binding); }
    catch (error) {
      if (error.code !== 'FORM_UNAVAILABLE') throw error;
      requireIdentity(binding);
      // Start commits cancellation before returning410; read its safe reason.
      const result = await readAttempt(attemptId, expected);
      requireIdentity(binding); return { ...result, resumed: true };
    }
    const result = await readAttempt(attemptId, expected);
    requireIdentity(binding); return { ...result, resumed: true };
  }
  async function saveAnswer(attemptId, slotId, input) {
    const binding = identityBinding();
    const cached = attempts.get(attemptId);
    const slot = cached?.view.slots.find((item) => item.slotId === slotId);
    if (!slot || cached.view.state !== 'IN_PROGRESS') throw failure('ATTEMPT_CLOSED', 409);
    let value;
    if (slot.interaction.type === 'NUMERIC_RESPONSE') {
      if (!['v2', 'v4'].includes(apiVersion) || !exactRecord(input, ['type', 'value'])
          || input.type !== 'NUMERIC_RESPONSE'
          || !(input.value === null || validNumericResponse(input.value))) throw failure('VALIDATION_ERROR', 422);
      value = { type: 'NUMERIC_RESPONSE', value: input.value };
    } else if (slot.interaction.type === 'CLOZE') {
      const fields = new Set(slot.interaction.fields.map(({ id }) => id));
      if (apiVersion !== 'v4' || !exactRecord(input, ['type', 'values']) || input.type !== 'CLOZE'
          || !plainDataRecord(input.values)
          || Reflect.ownKeys(input.values).some((id) => !fields.has(id)
            || !(input.values[id] === null || typeof input.values[id] === 'string')
            || typeof input.values[id] === 'string' && (!wellFormedUnicode(input.values[id])
              || scalarLength(input.values[id]) > slot.interaction.maxLength))) {
        throw failure('VALIDATION_ERROR', 422);
      }
      value = { type: 'CLOZE', values: Object.fromEntries(Reflect.ownKeys(input.values)
        .map((id) => [id, input.values[id]])) };
    } else if (slot.interaction.type === 'MATCHING') {
      const rows = new Set(slot.interaction.rows.map(({ id }) => id));
      const limits = new Map(slot.interaction.targets.map(({ id, maxUses }) => [id, maxUses]));
      const uses = new Map();
      if (apiVersion !== 'v4' || !exactRecord(input, ['type', 'assignments']) || input.type !== 'MATCHING'
          || !plainDataRecord(input.assignments)
          || Reflect.ownKeys(input.assignments).some((id) => !rows.has(id)
            || !(input.assignments[id] === null || typeof input.assignments[id] === 'string'))) {
        throw failure('VALIDATION_ERROR', 422);
      }
      for (const targetId of Object.values(input.assignments)) {
        if (targetId === null) continue;
        if (!limits.has(targetId)) throw failure('VALIDATION_ERROR', 422);
        const count = (uses.get(targetId) ?? 0) + 1;
        if (count > limits.get(targetId)) throw failure('VALIDATION_ERROR', 422);
        uses.set(targetId, count);
      }
      value = { type: 'MATCHING', assignments: Object.fromEntries(Reflect.ownKeys(input.assignments)
        .map((id) => [id, input.assignments[id]])) };
    } else if (input?.type === 'NUMERIC_RESPONSE' || apiVersion === 'v1' && slot.interaction.type === 'NUMERIC_RESPONSE') {
      throw failure('VALIDATION_ERROR', 422);
    } else if (slot.interaction.type === 'TRUE_FALSE_GROUP') {
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
    } else if (apiVersion === 'v4') {
      const optionIds = new Set(slot.interaction.type === 'SINGLE_CHOICE'
        ? slot.interaction.options.map(({ id }) => id) : []);
      if (slot.interaction.type !== 'SINGLE_CHOICE'
          || !(exactRecord(input, ['optionId']) || exactRecord(input, ['type', 'optionId']) && input.type === 'SINGLE_CHOICE')
          || !(input.optionId === null || typeof input.optionId === 'string' && optionIds.has(input.optionId))) {
        throw failure('VALIDATION_ERROR', 422);
      }
      value = { type: 'SINGLE_CHOICE', optionId: input.optionId };
    } else value = { type: 'SINGLE_CHOICE', optionId: typeof input === 'string' ? input : input?.optionId ?? null };
    const expectedRevision = cached.view.answers.find((item) => item.slotId === slotId)?.revision ?? 0;
    const ack = await mutation(`${apiRoot}/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(slotId)}`,
      { expectedRevision, value }, null, binding.nonce);
    requireIdentity(binding);
    // PostgreSQL JSON object key order is not a browser serialization contract.
    if (ack.slotId !== slotId || ack.revision !== expectedRevision + 1
        || !sameValue(ack.value, value)) throw failure('TEMPORARILY_UNAVAILABLE');
    const current = attempts.get(attemptId);
    if (!current) throw failure('REVISION_CONFLICT', 409);
    // An intervening GET or a different slot's save is not itself a conflict.
    // Preserve any newer slot revision and never reopen a known closed attempt.
    if (current.view.state !== 'IN_PROGRESS') return { attempt: clone(current.display), message: 'Đã lưu lựa chọn vào bài luyện tập.' };
    const previous = current.view.answers.find((item) => item.slotId === slotId);
    if (previous && (previous.revision > ack.revision
        || (previous.revision === ack.revision && !sameValue(previous.value, ack.value)))) {
      throw failure('REVISION_CONFLICT', 409);
    }
    const nextView = clone(current.view);
    const entry = { slotId, value: clone(ack.value), revision: ack.revision, savedAt: ack.savedAt };
    const index = nextView.answers.findIndex((item) => item.slotId === slotId);
    if (index < 0) nextView.answers.push(entry); else nextView.answers[index] = entry;
    if (Date.parse(ack.savedAt) > Date.parse(nextView.serverNow)) nextView.serverNow = ack.savedAt;
    const nextDisplay = display(nextView);
    attempts.set(attemptId, { view: nextView, display: clone(nextDisplay), readId: current.readId });
    return { attempt: nextDisplay, message: 'Đã lưu lựa chọn vào bài luyện tập.' };
  }
  async function submitAttempt(attemptId) {
    const binding = identityBinding();
    const closure = await mutation(`${apiRoot}/attempts/${encodeURIComponent(attemptId)}/submit`, {}, null, binding.nonce);
    requireIdentity(binding);
    const cached = attempts.get(attemptId);
    if (!cached || closure.state === 'GRADED') {
      const result = await readAttempt(attemptId, cached?.view ?? null);
      requireIdentity(binding); return result;
    }
    if (STATE_ORDER[cached.view.state] > STATE_ORDER[closure.state]) return { attempt: clone(cached.display) };
    const view = { ...cached.view, state: closure.state, startBefore: null, activeSectionId: null,
      slots: [], answers: [], closure, serverNow: closure.closedAt ?? cached.view.serverNow };
    const result = display(view);
    attempts.set(attemptId, { view, display: clone(result), readId: cached.readId });
    return { attempt: result };
  }
  async function readReview(attemptId) {
    const binding = identityBinding();
    const review = await request(`${apiRoot}/attempts/${encodeURIComponent(attemptId)}/result`);
    requireIdentity(binding);
    if (review.attemptId !== attemptId || review.scoreLabel !== 'UNOFFICIAL_PRACTICE' || !Array.isArray(review.items)) {
      throw failure('TEMPORARILY_UNAVAILABLE');
    }
    return { review: { attemptId, label: 'ÔN TẬP BÀI LUYỆN TẬP ĐÃ PHÁT HÀNH',
      repeatNotice: 'Câu hỏi thuộc bài luyện tập độc lập; đây không phải kỳ thi TSA chính thức.',
      slots: review.items.map((item) => ({ slotId: item.slotId, ordinal: item.question.ordinal,
        type: item.question.interaction.type, earned: item.earned,
        ...(item.correctAnswer.type === 'NUMERIC_RESPONSE' ? {
          correctNumericValue: item.correctAnswer.value,
          numericResponseValue: item.response?.type === 'NUMERIC_RESPONSE' ? item.response.value : null,
        } : {}),
        ...(item.correctAnswer.type === 'SINGLE_CHOICE' ? { correctOptionId: item.correctAnswer.optionId } : {}),
        ...(item.correctAnswer.type === 'MULTIPLE_CHOICE' ? { correctOptionIds: clone(item.correctAnswer.optionIds) } : {}),
        ...(item.correctAnswer.type === 'TRUE_FALSE_GROUP' ? { correctStatementValues: group(item.correctAnswer.values),
          statementValues: group(item.response?.values) } : {}),
        ...(item.correctAnswer.type === 'CLOZE' ? {
          clozeResponseValues: clone(item.response?.values ?? {}),
          clozeAcceptedValues: clone(item.correctAnswer.acceptedValues),
        } : {}),
        ...(item.correctAnswer.type === 'MATCHING' ? {
          matchingAssignments: clone(item.response?.assignments ?? {}),
          correctMatchingAnswers: clone(item.correctAnswer.answers),
        } : {}), explanation: clone(item.explanation) })) } };
  }
  return Object.freeze({ persistent: true, openDemoSession, loginCandidate, logout, loadCatalog, loadTopics, createTopicAttempt,
    startDemo, prepareReviewAttempt, createReviewAttempt, readReviewAttempt,
    prepareFixedAttempt, createFixedAttempt, readFixedAttempt,
    prepareShortAttempt, createShortAttempt, readShortAttempt,
    startReservedAttempt, readAttempt, saveAnswer, submitAttempt, readReview,
    loadHistory: async () => {
      const binding = identityBinding();
      const result = await pages(`${apiRoot}/attempts`);
      requireIdentity(binding); return result;
    } });
}

function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}
