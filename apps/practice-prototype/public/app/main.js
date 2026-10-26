import * as demoApi from "./api.js";
import { createPersistentApi } from "./persistent-api.js";
import { openStaffWorkspace } from "./staff.js";
import { renderMath } from "./math.js";

const app = document.querySelector("#app");
const announcements = document.querySelector("#announcements");
const persistentMode = new URLSearchParams(window.location.search).get("student") === "postgres";
const api = persistentMode ? createPersistentApi() : demoApi;

function replaceApp(content, { examMode = false, resultMode = false, reviewMode = false, catalogMode = false, introMode = false } = {}) {
  if (persistentMode && !catalogMode && (state.reviewOffer || state.reviewIntent || state.reviewDialog)) clearReviewFlow();
  const routeChanged = persistentMode && (
    app.classList.contains("exam-mode") !== examMode
    || app.classList.contains("result-mode") !== resultMode
    || app.classList.contains("review-mode") !== reviewMode
    || app.classList.contains("catalog-mode") !== catalogMode
    || app.classList.contains("intro-mode") !== introMode
  );
  const active = app.contains(document.activeElement) ? document.activeElement : null;
  const activeId = active?.id;
  const activeTestId = active?.dataset?.testid;
  app.classList.toggle("exam-mode", examMode);
  app.classList.toggle("result-mode", resultMode);
  app.classList.toggle("review-mode", reviewMode);
  app.classList.toggle("catalog-mode", catalogMode);
  app.classList.toggle("intro-mode", introMode);
  document.body.classList.toggle("exam-active", examMode);
  document.body.classList.toggle("review-active", reviewMode);
  app.replaceChildren(content);
  if (!examMode && !reviewMode) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  if (persistentMode) {
    if (routeChanged) {
      app.querySelector("h1, #question-title")?.focus();
    } else {
      const restored = activeId ? document.getElementById(activeId)
        : activeTestId ? [...app.querySelectorAll("[data-testid]")].find((node) => node.dataset.testid === activeTestId)
          : null;
      if (restored && app.contains(restored) && !restored.disabled) restored.focus({ preventScroll: true });
      else if (active && !restored) app.querySelector("h1, #question-title")?.focus();
    }
  }
}

function openStaff() {
  for (const mode of ["exam-mode", "result-mode", "review-mode", "catalog-mode", "intro-mode"]) app.classList.remove(mode);
  document.body.classList.remove("exam-active", "review-active");
  openStaffWorkspace(app, renderLanding);
}

const domainNames = { MATH: "Toán học", READING: "Đọc hiểu", SCIENCE: "Khoa học" };
const attemptStateNames = { CREATED: "Đã giữ bài", IN_PROGRESS: "Đang làm", SUBMITTED: "Đã nộp", EXPIRED: "Hết giờ", GRADED: "Đã chấm", CANCELLED: "Đã hủy", INVALIDATED: "Không còn hợp lệ" };
const gradingStateNames = { PENDING: "Đang chờ chấm", RUNNING: "Đang chấm", SUCCEEDED: "Đã chấm xong", FAILED_RETRYABLE: "Chấm chưa thành công; máy chủ sẽ thử lại", FAILED_FINAL: "Chưa thể chấm; cần người phụ trách kiểm tra" };
const state = {
  catalog: [],
  identityGeneration: 0,
  history: [],
  historyStatus: "",
  attempt: null,
  review: null,
  resumeNotice: "",
  currentIndex: 0,
  savingSlotId: null,
  pendingAnswer: null,
  pendingMultipleChoice: null,
  busy: false,
  clockAttemptId: null,
  clockDeadlineMs: 0,
  nextExpiryCheckAt: 0,
  timerHandle: null,
  gradePollHandle: null,
  gradePollAttemptId: null,
  gradePollInFlight: false,
  gradePollGeneration: 0,
  warningSent: false,
  checkingExpiry: false,
  markedAttemptId: null,
  markedSlotIds: new Set(),
  navigatorFilter: "all",
  reviewOffer: null,
  reviewIntent: null,
  reviewDialog: null,
};

const REVIEW_MARKS_STORAGE_PREFIX = "tsa-practice:attempt-review:";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isReviewAllowedAttempt(attempt) {
  return attempt?.formMode === "PERSONALIZED_PRACTICE" && attempt?.reuseMode === "REVIEW_ALLOWED";
}

function readExpectedAttempt(attemptId, expected) {
  if (expected?.formMode && expected?.reuseMode) return api.readAttempt(attemptId, expected);
  return api.readAttempt(attemptId);
}

function reviewModeLabel() {
  return "Lượt ôn tập · có thể lặp câu";
}

function formatPracticeDuration(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return "thời lượng do danh mục cung cấp";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${seconds} giây`;
  return remainder === 0 ? `${minutes} phút` : `${minutes} phút ${remainder} giây`;
}

function dismissReviewDialog({ restoreFocus = false } = {}) {
  const dialog = state.reviewDialog;
  if (!dialog) return;
  if (!restoreFocus) dialog.dataset.suppressFocusRestore = "true";
  if (dialog.open) dialog.close();
  dialog.remove();
  if (state.reviewDialog === dialog) state.reviewDialog = null;
}

function clearReviewFlow() {
  const hadPendingIntent = state.reviewIntent !== null;
  state.reviewOffer = null;
  state.reviewIntent = null;
  dismissReviewDialog();
  if (hadPendingIntent) state.busy = false;
}

function reviewOfferIsCurrent(offer) {
  if (!offer || state.reviewOffer !== offer || offer.identityGeneration !== state.identityGeneration) return false;
  const profile = state.catalog.find((entry) => entry.domain === offer.domain);
  return profile?.blueprintVersionId === offer.blueprintVersionId
    && profile.questionCount === offer.questionCount
    && profile.durationSeconds === offer.durationSeconds;
}

function reconcileReviewFlowWithCatalog() {
  const flow = state.reviewIntent ?? state.reviewOffer;
  if (!flow) return;
  const profile = state.catalog.find((entry) => entry.domain === flow.domain);
  if (flow.identityGeneration !== state.identityGeneration || profile?.blueprintVersionId !== flow.blueprintVersionId
      || profile.questionCount !== flow.questionCount || profile.durationSeconds !== flow.durationSeconds) {
    clearReviewFlow();
  }
}

function reviewAlternativeFrom(error, profile) {
  if (error?.code !== "INSUFFICIENT_UNSEEN_INVENTORY" || error.status !== 422 || !profile) return null;
  if (!Number.isSafeInteger(profile.questionCount) || profile.questionCount <= 0
      || !Number.isSafeInteger(profile.durationSeconds) || profile.durationSeconds <= 0) return null;
  const details = error.details;
  if (details?.reuseMode !== "NEW_ONLY" || details.blueprintVersionId !== profile.blueprintVersionId
      || !Array.isArray(details.alternatives)) return null;
  const alternatives = details.alternatives.filter((item) => item?.kind === "REVIEW_MODE");
  if (alternatives.length !== 1) return null;
  const alternative = alternatives[0];
  const keys = Object.keys(alternative).sort();
  if (keys.length !== 3 || keys[0] !== "blueprintVersionId" || keys[1] !== "kind" || keys[2] !== "requiresRepeatConsent"
      || alternative.blueprintVersionId !== profile.blueprintVersionId || alternative.requiresRepeatConsent !== true) return null;
  return alternative;
}

function isCanonicalUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function isMatchingReviewReceipt(receipt, intent) {
  return receipt?.state === "CREATED"
    && receipt.formMode === "PERSONALIZED_PRACTICE"
    && receipt.reuseMode === "REVIEW_ALLOWED"
    && receipt.reusePolicyVersion === "reuse/1"
    && receipt.domain === intent.domain
    && isCanonicalUuid(receipt.attemptId)
    && isCanonicalUuid(receipt.formId)
    && typeof receipt.startBefore === "string"
    && Number.isFinite(Date.parse(receipt.startBefore));
}

function contentText(blocks = []) {
  return blocks.map((block) => {
    if (block?.type === "text") return block.text ?? "";
    if (block?.type === "math") return block.accessibleText || block.tex || "";
    if (block?.type === "table") return [block.caption, ...(block.headers ?? []), ...(block.rows ?? []).flat()].filter(Boolean).join(" · ");
    if (block?.type === "image") return block.alt ?? "";
    return "";
  }).filter(Boolean).join(" ");
}

function renderContentBlocks(blocks = []) {
  const content = element("div", "question-content-blocks");
  for (const block of blocks) {
    if (block?.type === "text") {
      content.append(element("p", "content-text", block.text ?? ""));
    } else if (block?.type === "math") {
      content.append(renderMath(block));
    } else if (block?.type === "table") {
      const table = element("table", "content-table");
      table.style.width = "100%";
      if (block.caption) table.append(element("caption", "", block.caption));
      const head = element("thead");
      const headerRow = element("tr");
      for (const value of block.headers ?? []) {
        const heading = element("th", "", value);
        heading.scope = "col";
        headerRow.append(heading);
      }
      head.append(headerRow);
      const body = element("tbody");
      for (const row of block.rows ?? []) {
        const tableRow = element("tr");
        for (const value of row) tableRow.append(element("td", "", value));
        body.append(tableRow);
      }
      table.append(head, body);
      const scroll = element("div", "content-table-scroll");
      scroll.tabIndex = 0;
      scroll.setAttribute("role", "region");
      scroll.setAttribute("aria-label", block.caption || "Bảng dữ liệu câu hỏi");
      scroll.append(table);
      content.append(scroll);
    } else if (block?.type === "image") {
      const figure = element("figure", "content-image-placeholder");
      figure.append(element("p", "", block.alt ?? "Hình minh họa không khả dụng."));
      if (block.caption) figure.append(element("figcaption", "", block.caption));
      content.append(figure);
    }
  }
  return content;
}

function modeLabel() {
  return persistentMode ? "LOCAL PG · LUYỆN TẬP KHÔNG CHÍNH THỨC" : "BẢN DEMO";
}

function domainName(domain) {
  return domain?.name || domainNames[domain?.domain] || domainNames[state.attempt?.domain] || "Bài luyện tập";
}

function formatAdmissionTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date) + " ICT";
}

function actionButton(text, testId, onClick, className = "button") {
  const button = element("button", className, text);
  button.type = "button";
  if (testId) button.dataset.testid = testId;
  button.addEventListener("click", () => { void onClick(); });
  return button;
}

function announce(message) {
  announcements.textContent = "";
  window.setTimeout(() => { announcements.textContent = message; }, 20);
}

function showMessage(message, tone = "notice-panel") {
  const messageHost = app.querySelector(".exam-content") ?? app;
  const current = messageHost.querySelector("[data-testid='screen-message']");
  const messageNode = current ?? element("p", tone);
  messageNode.dataset.testid = "screen-message";
  messageNode.textContent = message;
  if (current === null) messageHost.prepend(messageNode);
  announce(message);
}

function setTimer(value) {
  const timer = app.querySelector("[data-testid='timer']");
  if (timer) timer.textContent = value;
}

function reviewMarksStorageKey(attemptId) {
  return `${REVIEW_MARKS_STORAGE_PREFIX}${encodeURIComponent(attemptId)}`;
}

function loadAttemptReviewState(attempt) {
  if (state.markedAttemptId === attempt.attemptId) return;
  state.markedAttemptId = attempt.attemptId;
  state.markedSlotIds = new Set();
  state.navigatorFilter = "all";
  try {
    const stored = window.sessionStorage.getItem(reviewMarksStorageKey(attempt.attemptId));
    if (stored === null) return;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return;
    const validSlotIds = new Set(attempt.slots.map((slot) => slot.slotId));
    state.markedSlotIds = new Set(parsed.filter((slotId) => typeof slotId === "string" && validSlotIds.has(slotId)));
  } catch {
    state.markedSlotIds = new Set();
  }
}

function persistAttemptReviewMarks() {
  if (state.attempt === null) return false;
  try {
    const key = reviewMarksStorageKey(state.attempt.attemptId);
    if (state.markedSlotIds.size === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify([...state.markedSlotIds]));
    return true;
  } catch {
    return false;
  }
}

function clearAttemptReviewState(attemptId = state.markedAttemptId) {
  if (attemptId !== null) {
    try {
      window.sessionStorage.removeItem(reviewMarksStorageKey(attemptId));
    } catch {}
  }
  state.markedAttemptId = null;
  state.markedSlotIds = new Set();
  state.navigatorFilter = "all";
}

function attemptAnswerCounts() {
  if (state.attempt === null) return { answered: 0, unanswered: 0, marked: 0, total: 0 };
  const total = state.attempt.slots.length;
  const answered = state.attempt.slots.filter(isQuestionAnswered).length;
  const marked = state.attempt.slots.filter((slot) => state.markedSlotIds.has(slot.slotId)).length;
  return { answered, unanswered: total - answered, marked, total };
}

function toggleMarkedForReview(slotId) {
  if (state.attempt === null || state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges()) return;
  const marked = state.markedSlotIds.has(slotId);
  if (marked) state.markedSlotIds.delete(slotId);
  else state.markedSlotIds.add(slotId);
  const saved = persistAttemptReviewMarks();
  renderExam();
  app.querySelector("[data-testid='mark-for-review']")?.focus();
  const message = marked ? "Đã bỏ đánh dấu xem lại câu hỏi." : "Đã đánh dấu câu hỏi để xem lại.";
  announce(saved ? message : `${message} Trạng thái chỉ còn trong bộ nhớ của tab này.`);
}

function clearTimer() {
  if (state.timerHandle !== null) window.clearInterval(state.timerHandle);
  state.timerHandle = null;
  state.checkingExpiry = false;
  state.clockAttemptId = null;
}

function stopGradePolling() {
  if (state.gradePollHandle !== null) window.clearInterval(state.gradePollHandle);
  state.gradePollHandle = null;
  state.gradePollAttemptId = null;
  state.gradePollInFlight = false;
  state.gradePollGeneration += 1;
}

function startTimer(attempt, forceSync = false) {
  if (state.clockAttemptId !== attempt.attemptId) {
    clearTimer();
    state.clockAttemptId = attempt.attemptId;
    state.clockDeadlineMs = performance.now() + Math.max(0, Date.parse(attempt.deadlineAt) - Date.parse(attempt.serverNow));
    state.nextExpiryCheckAt = 0;
    state.warningSent = false;
  } else if (forceSync) {
    state.clockDeadlineMs = performance.now() + Math.max(0, Date.parse(attempt.deadlineAt) - Date.parse(attempt.serverNow));
    state.nextExpiryCheckAt = 0;
  }
  if (state.timerHandle === null) state.timerHandle = window.setInterval(tick, 1000);
  tick();
}

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

async function refreshAfterDeadline() {
  const identityGeneration = state.identityGeneration;
  if (state.checkingExpiry || state.attempt === null) return;
  state.checkingExpiry = true;
  try {
    const data = await readExpectedAttempt(state.attempt.attemptId, state.attempt);
    if (identityGeneration !== state.identityGeneration) return;
    if (data.attempt.state === "IN_PROGRESS") {
      startTimer(data.attempt, true);
      return;
    }
    acceptAttempt(data.attempt);
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    if (persistentMode && handlePersistentError(error)) return;
    showMessage("Chưa kiểm tra được trạng thái thời gian. Đang giữ nguyên câu trả lời đã ghi nhận.");
    state.nextExpiryCheckAt = performance.now() + 2000;
  } finally {
    if (identityGeneration === state.identityGeneration) state.checkingExpiry = false;
  }
}

function tick() {
  if (state.attempt === null) return;
  const monotonicNow = performance.now();
  const remaining = state.clockDeadlineMs - monotonicNow;
  setTimer(formatRemaining(remaining));
  if (remaining <= 60_000 && remaining > 0 && !state.warningSent) {
    state.warningSent = true;
    announce("Còn 60 giây hoặc ít hơn trong phiên luyện tập demo này.");
  }
  if (remaining <= 0 && monotonicNow >= state.nextExpiryCheckAt) void refreshAfterDeadline();
}

function resetPersistentIdentity() {
  state.identityGeneration += 1;
  clearReviewFlow();
  state.history = [];
  state.historyStatus = "";
}

function clearAttemptState() {
  clearReviewFlow();
  stopGradePolling();
  clearAttemptReviewState(state.attempt?.attemptId ?? state.markedAttemptId);
  clearTimer();
  state.attempt = null;
  state.clockAttemptId = null;
  state.currentIndex = 0;
  state.savingSlotId = null;
  state.pendingAnswer = null;
  state.pendingMultipleChoice = null;
  state.busy = false;
  state.review = null;
  state.resumeNotice = "";
}

function acceptAttempt(attempt) {
  const previousAttemptId = state.attempt?.attemptId;
  const previousState = state.attempt?.state;
  const hadPendingChanges = hasUnacknowledgedChanges();
  if (previousAttemptId !== attempt.attemptId) {
    state.currentIndex = 0;
    state.pendingAnswer = null;
    state.pendingMultipleChoice = null;
  }
  state.attempt = attempt;
  if (persistentMode) {
    state.savingSlotId = null;
    state.busy = false;
    state.review = null;
    if (attempt.state === "CREATED") {
      stopGradePolling();
      clearTimer();
      renderCreatedAttempt();
      return;
    }
    if (attempt.state === "IN_PROGRESS") {
      stopGradePolling();
      loadAttemptReviewState(attempt);
      startTimer(attempt);
      renderExam();
      return;
    }
    if (attempt.state === "GRADED") {
      stopGradePolling();
      clearTimer();
      if (hadPendingChanges) state.resumeNotice = "Tab này chưa nhận được xác nhận cho một thay đổi. Kết quả chỉ dùng câu trả lời máy chủ đã ghi nhận trước khi đóng bài.";
      state.pendingMultipleChoice = null;
      state.pendingAnswer = null;
      if (attempt.result) renderResult(attempt.result);
      else renderReleasedResultUnavailable();
      return;
    }
    if (["SUBMITTED", "EXPIRED"].includes(attempt.state)) {
      clearTimer();
      clearAttemptReviewState(attempt.attemptId);
      if (hadPendingChanges) state.resumeNotice = "Tab này chưa nhận được xác nhận cho một thay đổi. Kết quả chỉ dùng câu trả lời máy chủ đã ghi nhận trước khi đóng bài.";
      state.pendingMultipleChoice = null;
      state.pendingAnswer = null;
      if (attempt.gradingStatus === "FAILED_FINAL") {
        stopGradePolling();
        renderFailedGrade();
      } else {
        const status = app.querySelector("[data-testid='grading-status']");
        if (previousAttemptId === attempt.attemptId && previousState === attempt.state && status) {
          status.textContent = `Trạng thái chấm: ${gradingStateNames[attempt.gradingStatus] || gradingStateNames.PENDING}.`;
          status.dataset.gradingStatus = attempt.gradingStatus || "PENDING";
        } else {
          renderPendingGrade();
        }
        startGradePolling(attempt);
      }
      return;
    }
    if (["CANCELLED", "INVALIDATED"].includes(attempt.state)) {
      const reason = attempt.closureReason;
      clearAttemptState();
      renderPersistentBlocked(reason === "START_TTL_EXPIRED"
        ? "Bài luyện tập đã hết thời hạn bắt đầu. Bài đã được hủy; không có bài thay thế nào được tạo tự động."
        : reason === "RIGHTS_BLOCKED" || reason === "FORM_WITHDRAWN"
        ? `Bài luyện tập này đã bị khóa và nội dung không còn khả dụng.${hadPendingChanges ? " Thay đổi chưa được xác nhận trong tab này đã không được gửi đi." : ""}`
        : `Bài luyện tập này đã kết thúc và không thể tiếp tục.${hadPendingChanges ? " Thay đổi chưa được xác nhận trong tab này đã không được gửi đi." : ""}`);
      return;
    }
    clearAttemptState();
    renderPersistentBlocked("Trạng thái bài luyện tập chưa được hỗ trợ. Hãy tải lại trạng thái từ máy chủ.");
    return;
  }
  if (attempt.state === "IN_PROGRESS") {
    loadAttemptReviewState(attempt);
    startTimer(attempt);
    renderExam();
    return;
  }
  state.savingSlotId = null;
  state.busy = false;
  clearAttemptReviewState(attempt.attemptId);
  clearTimer();
  if (attempt.state === "GRADED" && attempt.result) {
    renderResult(attempt.result);
    return;
  }
  clearAttemptState();
  renderCatalog();
}

function startGradePolling(attempt) {
  if (state.gradePollAttemptId === attempt.attemptId && state.gradePollHandle !== null) return;
  stopGradePolling();
  state.gradePollAttemptId = attempt.attemptId;
  state.gradePollHandle = window.setInterval(() => { void refreshGradeStatus(attempt.attemptId); }, 1000);
}

async function refreshGradeStatus(attemptId, { finalCheck = false } = {}) {
  const identityGeneration = state.identityGeneration;
  if (!persistentMode || state.attempt?.attemptId !== attemptId || state.gradePollInFlight) return;
  const generation = state.gradePollGeneration;
  state.gradePollInFlight = true;
  try {
    const data = await readExpectedAttempt(attemptId, state.attempt);
    if (identityGeneration !== state.identityGeneration) return;
    if (generation !== state.gradePollGeneration || state.attempt?.attemptId !== attemptId) return;
    acceptAttempt(data.attempt);
    if (data.attempt.state === "GRADED") void refreshPersistentHistory();
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    if (generation !== state.gradePollGeneration || state.attempt?.attemptId !== attemptId) return;
    if (handlePersistentError(error)) return;
    const status = app.querySelector("[data-testid='grading-status']");
    if (status) status.textContent = finalCheck
      ? "Chưa đọc được trạng thái. Hãy thử kiểm tra lại khi kết nối sẵn sàng."
      : "Đang chờ máy chủ chấm. Chưa đọc được lần cập nhật mới nhất; sẽ tiếp tục kiểm tra.";
  } finally {
    if (generation === state.gradePollGeneration) state.gradePollInFlight = false;
  }
}

function renderTimingNotice() {
  const notice = element("p", "notice-panel", "Đồng hồ máy chủ chạy liên tục sau khi bắt đầu. Mất kết nối hoặc tải lại trang không dừng đồng hồ, không kéo dài hạn nộp và không có thời gian gia hạn. Bài được chấm theo câu trả lời máy chủ đã ghi nhận; lựa chọn chưa được xác nhận có thể chưa được lưu.");
  notice.id = "attempt-timing-notice";
  notice.dataset.testid = "timing-notice";
  return notice;
}

function renderCreatedAttempt() {
  const attempt = state.attempt;
  const profile = state.catalog.find((entry) => entry.domain === attempt.domain);
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const card = element("section", "intro-card persistent-attempt-card");
  card.dataset.testid = "created-attempt";
  card.append(element("p", "eyebrow", "BÀI ĐÃ ĐƯỢC GIỮ CHO TÀI KHOẢN CỤC BỘ"));
  const title = element("h1", "intro-title", `${domainName({ domain: attempt.domain })} · bài luyện tập`);
  title.tabIndex = -1;
  card.append(title);
  if (isReviewAllowedAttempt(attempt)) {
    card.append(element("p", "review-mode-label", reviewModeLabel()));
    card.append(element("p", "intro-lead", "Lượt này có thể dùng câu hỏi đã được giao trước đây. Không có cam kết rằng mọi câu sẽ lặp lại."));
  }
  card.append(element("p", "intro-lead", "Bài đã được lưu trong PostgreSQL cục bộ. Bắt đầu chỉ khi bạn chọn nút bên dưới; đồng hồ máy chủ chạy liên tục sau khi bắt đầu."));
  const facts = element("div", "intro-metrics");
  facts.append(element("div", "intro-metric", `${attempt.questionCount || attempt.slots.length || profile?.questionCount || 0} câu`));
  facts.append(element("div", "intro-metric", `${Math.ceil((attempt.durationSeconds || profile?.durationSeconds || 0) / 60)} phút`));
  card.append(facts);
  card.append(element("p", "notice-panel", `Bắt đầu trước ${formatAdmissionTime(attempt.startBefore) || "thời hạn do máy chủ lưu"}.`));
  const actions = element("div", "intro-actions");
  card.append(renderTimingNotice());
  const start = actionButton("Bắt đầu bài luyện tập", "created-start", startReservedAttempt, "button intro-start");
  start.setAttribute("aria-describedby", "attempt-timing-notice");
  actions.append(start);
  actions.append(actionButton("Quay lại danh sách", "return-catalog", () => renderCatalog(), "button secondary"));
  card.append(actions);
  fragment.append(card, footerNote());
  replaceApp(fragment, { introMode: true });
  app.querySelector("h1")?.focus();
}

async function startReservedAttempt() {
  const identityGeneration = state.identityGeneration;
  if (!persistentMode || state.busy || state.attempt?.state !== "CREATED") return;
  const attempt = state.attempt;
  state.busy = true;
  try {
    const response = await api.startReservedAttempt(attempt.attemptId, attempt);
    if (identityGeneration !== state.identityGeneration) return;
    void refreshPersistentHistory();
    state.resumeNotice = response.resumed ? "Đã tiếp tục bài đã được giữ" : "";
    acceptAttempt(response.attempt);
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (handlePersistentError(error)) return;
    if (["FORM_UNAVAILABLE", "CONTENT_UNAVAILABLE"].includes(error.code)) {
      clearAttemptState();
      renderPersistentBlocked("Bài luyện tập đã hết hạn hoặc không còn khả dụng. Tải lại danh mục để xem trạng thái mới nhất.");
      return;
    }
    renderCreatedAttempt();
    showMessage(error.message || "Chưa bắt đầu được bài luyện tập. Hãy đọc lại trạng thái trước khi thử.");
  }
}

function renderPendingGrade() {
  const attempt = state.attempt;
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const card = element("section", "result-card persistent-grade-card");
  card.dataset.testid = "grading-pending";
  card.append(element("p", "result-badge", "KẾT QUẢ LUYỆN TẬP · ĐANG CHỜ"));
  const title = element("h1", "", "Bài đã được gửi đến máy chấm.");
  title.id = "pending-grade-title";
  title.tabIndex = -1;
  card.append(title);
  if (isReviewAllowedAttempt(attempt)) card.append(element("p", "review-mode-label", reviewModeLabel()));
  card.append(element("p", "result-note", "Máy chủ đang xử lý bài đã gửi. Bạn có thể quay lại danh sách; trạng thái được lưu và có thể đọc lại sau."));
  if (state.resumeNotice) card.append(element("p", "notice-panel", state.resumeNotice));
  const status = element("p", "notice-panel", `Trạng thái chấm: ${gradingStateNames[attempt.gradingStatus] || gradingStateNames.PENDING}.`);
  status.dataset.testid = "grading-status";
  status.dataset.gradingStatus = attempt.gradingStatus || "PENDING";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  card.append(status, actionButton("Quay lại danh sách", "return-catalog", () => renderCatalog(), "button secondary"));
  fragment.append(card, footerNote());
  replaceApp(fragment, { resultMode: true });
}

function renderFailedGrade() {
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const card = element("section", "result-card persistent-grade-card");
  card.dataset.testid = "grading-failed-final";
  card.append(element("p", "result-badge", "KẾT QUẢ LUYỆN TẬP · CHƯA CÓ ĐIỂM"));
  const title = element("h1", "", "Máy chủ chưa thể chấm bài này.");
  title.tabIndex = -1;
  card.append(title);
  if (isReviewAllowedAttempt(state.attempt)) card.append(element("p", "review-mode-label", reviewModeLabel()));
  card.append(element("p", "result-note", "Chưa có kết quả nào được công bố. Bạn có thể đọc lại trạng thái từ máy chủ; không có thao tác thử chấm lại trong màn hình này."));
  const status = element("p", "notice-panel", gradingStateNames.FAILED_FINAL + ".");
  status.dataset.testid = "grading-status";
  status.dataset.gradingStatus = "FAILED_FINAL";
  status.setAttribute("role", "status");
  card.append(status, actionButton("Kiểm tra trạng thái", "grade-status-retry", () => refreshGradeStatus(state.attempt.attemptId, { finalCheck: true }), "button"));
  card.append(actionButton("Quay lại danh sách", "return-catalog", () => renderCatalog(), "button secondary"));
  fragment.append(card, footerNote());
  replaceApp(fragment, { resultMode: true });
}

function renderReleasedResultUnavailable() {
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const card = element("section", "result-card persistent-grade-card");
  card.append(element("h1", "", "Bài đã được chấm, nhưng kết quả chưa tải được."));
  if (isReviewAllowedAttempt(state.attempt)) card.append(element("p", "review-mode-label", reviewModeLabel()));
  card.append(element("p", "result-note", "Hãy đọc lại trạng thái từ máy chủ. Đáp án và lời giải chỉ xuất hiện sau khi máy chủ xác nhận bản phát hành."));
  card.append(actionButton("Tải lại trạng thái", "grade-status-retry", () => refreshGradeStatus(state.attempt.attemptId, { finalCheck: true }), "button"));
  card.append(actionButton("Quay lại danh sách", "return-catalog", () => renderCatalog(), "button secondary"));
  fragment.append(card, footerNote());
  replaceApp(fragment, { resultMode: true });
}

function renderPersistentBlocked(message) {
  stopGradePolling();
  clearTimer();
  const card = element("section", "fatal-card persistent-blocked");
  card.dataset.testid = "persistent-blocked";
  card.append(element("p", "eyebrow", "TRẠNG THÁI MÁY CHỦ"));
  card.append(element("h1", "", "Bài luyện tập đang bị chặn."));
  card.append(element("p", "", message));
  card.append(actionButton("Đọc lại trạng thái", "persistent-retry", () => { void initializePersistent(); }, "button"));
  card.append(actionButton("Đăng xuất khỏi tài khoản cục bộ", "persistent-logout", logoutPersistentCandidate, "button secondary"));
  replaceApp(card);
}

async function resumePersistentAttempt() {
  const identityGeneration = state.identityGeneration;
  if (!persistentMode || state.busy || !state.attempt) return;
  const attemptId = state.attempt.attemptId;
  state.busy = true;
  try {
    const data = await readExpectedAttempt(attemptId, state.attempt);
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    state.resumeNotice = "Đã đọc lại trạng thái đã lưu từ PostgreSQL cục bộ";
    acceptAttempt(data.attempt);
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (handlePersistentError(error)) return;
    showMessage(error.message || "Chưa đọc lại được trạng thái bài luyện tập.");
  }
}

async function openPersistentHistoryAttempt(attemptId) {
  const identityGeneration = state.identityGeneration;
  if (!persistentMode || state.busy || hasUnacknowledgedChanges()) return;
  state.busy = true;
  try {
    const record = state.history.find((item) => item.attemptId === attemptId);
    const data = await readExpectedAttempt(attemptId, record);
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    state.resumeNotice = "Đã tải trạng thái bài từ lịch sử PostgreSQL cục bộ";
    acceptAttempt(data.attempt);
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (!handlePersistentError(error)) renderCatalogWithMessage(error.message || "Không mở được bài đã lưu.");
  }
}

function renderCatalogWithMessage(message) {
  renderCatalog();
  showMessage(message);
}

async function refreshPersistentHistory() {
  const identityGeneration = state.identityGeneration;
  if (!persistentMode) return;
  try {
    const history = await api.loadHistory();
    if (identityGeneration !== state.identityGeneration) return;
    state.history = history;
    state.historyStatus = "";
    if (app.querySelector("[data-testid='persistent-history']")) renderCatalog();
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    if (handlePersistentError(error)) return;
    state.historyStatus = "Lịch sử chưa tải được. Các bài hiện có vẫn được lưu trên máy chủ.";
    const historyStatus = app.querySelector("[data-testid='history-status']");
    if (historyStatus) historyStatus.textContent = state.historyStatus;
    else if (app.querySelector("[data-testid='persistent-history']")) renderCatalog();
  }
}

function resumeNotice() {
  if (!state.resumeNotice) return null;
  const notice = element("p", "resume-notice", state.resumeNotice);
  notice.dataset.testid = "resume-notice";
  notice.setAttribute("role", "status");
  return notice;
}

function header(exam = false) {
  const topbar = element("header", `topbar${exam ? " exam-topbar" : ""}`);
  const brand = element("div", "brand");
  brand.append(element("span", "brand-mark", "T"));
  const brandCopy = element("span", "brand-copy");
  brandCopy.append(element("span", "brand-name", "TSA PRACTICE"), element("span", "brand-subtitle", "Phòng luyện tập tư duy"));
  brand.append(brandCopy);
  topbar.append(brand);
  if (!exam) {
    const navigation = element("nav", "topbar-nav");
    navigation.id = "product-navigation";
    navigation.setAttribute("aria-label", "Điều hướng bản demo");
    const openScreen = render => {
      render();
      const title = app.querySelector("h1");
      if (title) { title.tabIndex = -1; title.focus(); }
    };
    navigation.append(actionButton("Trang đầu", "nav-home", () => openScreen(renderLanding), "topbar-link"));
    navigation.append(actionButton("Bài luyện tập", "nav-catalog", () => openScreen(renderCatalog), "topbar-link"));
    if (persistentMode) {
      const logout = actionButton("Đăng xuất", "persistent-logout", logoutPersistentCandidate, "topbar-link");
      logout.disabled = (state.busy && state.reviewIntent === null) || hasUnacknowledgedChanges();
      navigation.append(logout);
    }
    if (state.attempt?.state === "GRADED") {
      navigation.append(actionButton(persistentMode ? "Kết quả luyện tập" : "Kết quả demo", "nav-result", () => openScreen(() => renderResult(state.attempt.result)), "topbar-link"));
    }
    const menu = actionButton("Mở menu", "menu-toggle", () => {
      const expanded = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(expanded));
      menu.textContent = expanded ? "Đóng menu" : "Mở menu";
      navigation.classList.toggle("is-open", expanded);
    }, "button secondary small menu-toggle");
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-controls", navigation.id);
    topbar.append(navigation, menu);
  }
  topbar.append(element("span", "demo-chip", modeLabel()));
  return topbar;
}

function footerNote() {
  return element("p", "footer-note", persistentMode
    ? "Luyện tập không chính thức trên PostgreSQL cục bộ bằng hồ sơ tổng hợp. Thời hạn và câu trả lời đã xác nhận do máy chủ quản lý."
    : "Phiên minh họa chạy cục bộ, gồm ba câu trắc nghiệm lặp lại và một nhóm đúng/sai tổng hợp; không phải dịch vụ thi thật, không có tài khoản hay lưu trữ bền vững.");
}

function renderLanding() {
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const hero = element("section", "hero");
  const copy = element("div");
  copy.append(element("p", "eyebrow", "LUYỆN THI TƯ DUY"));
  const title = element("h1", "", "Tập trung vào cách bạn tư duy.");
  title.tabIndex = -1;
  copy.append(title);
  copy.append(element("p", "hero-copy", persistentMode
    ? "Danh mục luyện tập cục bộ dùng hồ sơ tổng hợp. Chọn rõ một tài khoản kiểm thử để mở các bài có sẵn; thời gian được máy chủ quản lý."
    : "Một không gian luyện tập ngắn gọn để làm quen với nhịp thi TSA: chọn một lĩnh vực, theo dõi thời gian và xem lại từng lựa chọn sau khi nộp bài."));
  const actions = element("div", "hero-actions");
  actions.append(actionButton("Chọn bài luyện tập", "catalog-open", () => renderCatalog(), "button primary-light"));
  if (!persistentMode) actions.append(actionButton("Không gian bản nháp cục bộ", "staff-open", openStaff, "button secondary staff-launch"));
  actions.append(element("span", "hero-caption", persistentMode ? "PostgreSQL cục bộ · đăng nhập tổng hợp có chủ đích" : "Bản demo cục bộ · không cần tài khoản"));
  copy.append(actions);
  const art = element("div", "hero-art");
  art.append(element("div", "hero-orbit"));
  const card = element("div", "hero-card");
  card.append(element("span", "mini-label", "BẢNG ĐIỀU KHIỂN"));
  card.append(element("div", "mini-stat", persistentMode ? "LOCAL PG" : "06:00"));
  card.append(element("div", "mini-line"), element("div", "mini-line short"));
  card.append(element("span", "mini-check", "✓"));
  art.append(card);
  hero.append(copy, art);
  fragment.append(hero);

  const trust = element("section", "trust-row");
  for (const [icon, title, detail] of persistentMode ? [
    ["01", "Danh mục độc lập", "Mỗi bài có số câu, thời lượng và khoảng mở riêng."],
    ["02", "Lưu có xác nhận", "Lựa chọn chỉ được đánh dấu đã lưu sau phản hồi của máy chủ."],
    ["03", "Kết quả sau phát hành", "Đáp án và lời giải chỉ mở sau khi máy chủ phát hành kết quả."],
  ] : [
    ["01", "Điều hướng rõ ràng", "Biết mình đang ở câu nào và còn bao nhiêu câu chưa trả lời."],
    ["02", "Tự động ghi nhớ", "Mỗi lựa chọn được xác nhận trong phiên demo trước khi chuyển câu."],
    ["03", "Ôn tập sau khi nộp", "Xem điểm minh họa và lời giải ở một màn hình riêng."],
  ]) {
    const item = element("div", "trust-item");
    item.append(element("span", "trust-icon", icon));
    const text = element("div");
    text.append(element("strong", "", title), element("span", "", detail));
    item.append(text);
    trust.append(item);
  }
  fragment.append(trust, footerNote());
  replaceApp(fragment);
}

function renderExamIntro(domain) {
  const fragment = document.createDocumentFragment();
  const topbar = header();
  topbar.querySelector("[data-testid='nav-catalog']")?.classList.add("active");
  fragment.append(topbar);
  const page = element("section", "intro-page");
  page.dataset.testid = "intro";
  const breadcrumb = element("nav", "intro-breadcrumb");
  breadcrumb.dataset.testid = "intro-breadcrumb";
  breadcrumb.setAttribute("aria-label", "Đường dẫn bài luyện tập");
  const homeCrumb = actionButton("Trang đầu", "intro-breadcrumb-home", () => {
    renderLanding();
    app.querySelector("h1")?.focus();
  }, "intro-breadcrumb-link");
  const catalogCrumb = actionButton("Bài luyện tập", "intro-breadcrumb-catalog", () => {
    renderCatalog();
    app.querySelector("h1")?.focus();
  }, "intro-breadcrumb-link");
  breadcrumb.append(homeCrumb, element("span", "intro-breadcrumb-separator", "›"), catalogCrumb,
    element("span", "intro-breadcrumb-separator", "›"), element("span", "intro-breadcrumb-current", domainName(domain)));
  page.append(breadcrumb);

  const card = element("section", "intro-card");
  card.dataset.testid = "intro-content";
  const identity = element("div", "intro-identity");
  identity.append(element("span", "intro-brand-mark", "T"));
  const identityCopy = element("div", "intro-identity-copy");
  identityCopy.append(element("span", "intro-brand-name", "TSA Practice"), element("span", "intro-demo-badge", modeLabel()));
  identity.append(identityCopy);
  card.append(identity);
  const title = element("h1", "intro-title", `${domainName(domain)} · ${persistentMode ? "bài luyện tập" : "bài demo"}`);
  title.id = "intro-title";
  title.tabIndex = -1;
  card.append(title);
  card.append(element("p", "intro-lead", persistentMode
    ? "Bài luyện tập độc lập dùng nội dung đã được máy chủ cung cấp. Việc bắt đầu lưu một lượt cho hồ sơ này; đồng hồ máy chủ chạy liên tục sau khi bắt đầu."
    : "Phiên luyện tập cục bộ gồm bốn vị trí minh họa. Câu trả lời và kết quả chỉ dùng để kiểm tra luồng giao diện."));

  const metrics = element("div", "intro-metrics");
  metrics.dataset.testid = "intro-metadata";
  for (const [value, label] of [[`${domain.questionCount} câu`, persistentMode ? "vị trí" : "vị trí demo"], [`${Math.ceil(domain.durationSeconds / 60)} phút`, persistentMode ? "thời lượng" : "thời lượng demo"]]) {
    const metric = element("div", "intro-metric");
    metric.append(element("strong", "", value), element("span", "", label));
    metrics.append(metric);
  }
  card.append(metrics);

  const structure = element("section", "intro-structure");
  structure.dataset.testid = "intro-structure";
  const structureRows = element("div", "intro-structure-rows");
  if (persistentMode) {
    structure.append(element("h2", "", "Thông tin do danh mục cung cấp"));
    structureRows.append(element("p", "intro-structure-row", `${domain.questionCount} câu trong bài độc lập`));
    structureRows.append(element("p", "intro-structure-row", `Thời lượng: ${Math.ceil(domain.durationSeconds / 60)} phút`));
    if (domain.availableFrom || domain.availableUntil) {
      structureRows.append(element("p", "intro-structure-row", `Mở: ${formatAdmissionTime(domain.availableFrom) || "—"} · Đóng: ${formatAdmissionTime(domain.availableUntil) || "—"}`));
    }
    if (domain.blueprintVersionId) structure.dataset.blueprintVersionId = domain.blueprintVersionId;
    structure.append(structureRows, element("p", "intro-structure-total", "Danh mục và trạng thái có thể thay đổi theo máy chủ; nội dung chưa được hứa trước khi bắt đầu."));
  } else {
    structure.append(element("h2", "", "Cấu trúc bài luyện tập"));
    for (const [position, kind, quantity, testId, countTestId] of [
      ["Vị trí 1–3", "Trắc nghiệm", "3", "intro-structure-single-choice", "intro-sc-count"],
      ["Vị trí 4", "Đúng/sai", "1", "intro-structure-true-false", "intro-tf-count"],
    ]) {
      const row = element("div", "intro-structure-row");
      row.dataset.testid = testId;
      const countValue = element("span", "intro-structure-count-value", quantity);
      countValue.dataset.testid = countTestId;
      const count = element("span", "intro-structure-count");
      count.append(countValue, element("span", "intro-structure-count-unit", " câu"));
      row.append(element("span", "intro-structure-position", position), element("span", "intro-structure-kind", kind), count);
      structureRows.append(row);
    }
    structure.append(structureRows, element("p", "intro-structure-total", `${domain.questionCount} vị trí · một phần độc lập · đồng hồ demo ${domain.durationSeconds / 60} phút`));
  }
  card.append(structure);

  const rules = element("div", "intro-rules");
  rules.append(element("h2", "", "Lưu ý khi làm bài"));
  for (const [title, detail] of persistentMode ? [
    ["Làm theo từng câu", "Loại câu hỏi và lựa chọn được mô tả cùng nội dung đã gửi bởi máy chủ."],
    ["Chờ xác nhận lưu", "Một lựa chọn chỉ được đánh dấu đã lưu sau khi máy chủ xác nhận."],
    ["Thời hạn chạy liên tục", "Thời gian ngoại tuyến cũng tính; tải lại không kéo dài hạn nộp và không có thời gian gia hạn."],
  ] : [
    ["Chọn phương án hoặc đúng/sai", "Ba câu trắc nghiệm có một đáp án đúng; câu cuối yêu cầu đánh giá từng mệnh đề. Bạn có thể xóa lựa chọn trước khi nộp."],
    ["Lựa chọn được lưu", "Trạng thái chỉ được cập nhật sau khi máy chủ demo xác nhận đã ghi nhận."],
    ["Có thể chuyển câu", "Dùng bảng số câu để quay lại các vị trí còn trống trước khi nộp bài."],
  ]) {
    const rule = element("div", "intro-rule");
    rule.append(element("span", "intro-rule-icon", "✓"));
    const copy = element("div");
    copy.append(element("strong", "", title), element("span", "", detail));
    rule.append(copy);
    rules.append(rule);
  }
  card.append(rules);

  const actions = element("div", "intro-actions");
  actions.append(actionButton("Quay lại danh sách", "intro-back", () => {
    renderCatalog();
    app.querySelector("h1")?.focus();
  }, "button secondary"));
  const startLabel = state.attempt?.state === "GRADED"
    ? "Bắt đầu lượt demo mới"
    : state.attempt?.state === "IN_PROGRESS"
      ? "Tiếp tục bài demo"
      : "Bắt đầu bài demo";
  const activePersistentAttempt = persistentMode && ["CREATED", "IN_PROGRESS"].includes(state.attempt?.state) ? state.attempt : null;
  const sameActiveDomain = activePersistentAttempt?.domain === domain.domain;
  const persistentStart = activePersistentAttempt
    ? sameActiveDomain
      ? activePersistentAttempt.state === "CREATED" ? startReservedAttempt : resumePersistentAttempt
      : null
    : () => startDemo(domain);
  const start = actionButton(
    persistentMode ? activePersistentAttempt
      ? sameActiveDomain ? activePersistentAttempt.state === "CREATED" ? "Bắt đầu bài đã giữ" : "Tiếp tục bài đang làm" : "Hoàn tất bài đang làm trước"
      : "Bắt đầu bài luyện tập"
      : startLabel,
    "intro-start",
    persistentMode ? (persistentStart ?? (() => showMessage("Hoàn tất hoặc đọc lại bài đang làm trước khi bắt đầu bài khác."))) : () => startDemo(domain),
    "button intro-start",
  );
  start.disabled = state.busy || (persistentMode && ((activePersistentAttempt !== null && !sameActiveDomain) || (!domain.available && !sameActiveDomain)));
  actions.append(start);
  if (persistentMode) {
    start.setAttribute("aria-describedby", "attempt-timing-notice");
    card.insertBefore(renderTimingNotice(), structure);
  }
  card.insertBefore(actions, structure);
  page.append(card);
  fragment.append(page, footerNote());
  replaceApp(fragment, { introMode: true });
  app.querySelector("#intro-title")?.focus();
}

function domainCard(domain) {
  const activeAttempt = persistentMode && ["CREATED", "IN_PROGRESS"].includes(state.attempt?.state) ? state.attempt : null;
  const sameActiveDomain = activeAttempt?.domain === domain.domain;
  const card = element("article", `domain-card catalog-ticket${domain.available ? " available" : ""}`);
  card.dataset.testid = `catalog-card-${domain.domain}`;
  const index = domain.domain === "MATH" ? "01" : domain.domain === "READING" ? "02" : "03";
  const domainTopline = element("div", "domain-topline");
  domainTopline.append(element("span", "domain-index", index));
  domainTopline.append(element("span", domain.available ? "status-badge ready" : "status-badge", domain.available ? "Sẵn sàng" : persistentMode ? "Chưa mở" : "Sắp có"));
  card.append(domainTopline);
  card.append(element("p", "domain-overline", `LĨNH VỰC ${index}`));
  card.append(element("h2", "", domainName(domain)));
  const descriptions = { MATH: "Bài luyện tập tư duy Toán học.", READING: "Bài luyện tập tư duy Đọc hiểu.", SCIENCE: "Bài luyện tập tư duy Khoa học." };
  card.append(element("p", "domain-meta", persistentMode ? "Bài luyện tập độc lập trong danh mục PostgreSQL cục bộ." : descriptions[domain.domain]));
  const facts = element("div", "domain-facts");
  if (domain.available || persistentMode) {
    facts.append(element("span", "", `${domain.questionCount} câu${persistentMode ? "" : " demo"}`));
    facts.append(element("span", "", `${Math.ceil(domain.durationSeconds / 60)} phút`));
    if (persistentMode && (domain.availableFrom || domain.availableUntil)) {
      facts.append(element("span", "", `Mở ${formatAdmissionTime(domain.availableFrom) || "—"}`));
      facts.append(element("span", "", `Đóng ${formatAdmissionTime(domain.availableUntil) || "—"}`));
    }
  } else {
    facts.append(element("span", "", persistentMode ? "Hiện chưa mở cho lượt mới" : "Chưa có bộ câu hỏi demo"));
  }
  const cardFooter = element("div", "catalog-card-footer");
  cardFooter.append(facts);
  if (domain.available || persistentMode) {
    card.append(element("p", "catalog-card-note", persistentMode
      ? !domain.available ? "Khung này chưa mở cho lượt mới. Bài đã giữ hoặc đang làm dùng thời hạn máy chủ đã lưu."
      : "Số câu và thời lượng độc lập với các bài khác. Danh mục không cam kết có đủ nội dung sau khi bạn chọn bắt đầu."
      : "Bản demo gồm 3 câu trắc nghiệm và 1 nhóm đúng/sai; một số câu dùng dữ liệu lặp lại."));
    const completed = state.attempt?.state === "GRADED";
    const startLabel = completed ? "Bắt đầu lượt demo mới" : state.attempt?.state === "IN_PROGRESS" ? "Tiếp tục bài demo" : "Bắt đầu bài demo";
    const actions = element("div", "domain-actions");
    actions.append(actionButton("Xem chi tiết", "exam-intro", () => renderExamIntro(domain), "button catalog-details-link"));
    if (activeAttempt) {
      const sameDomain = activeAttempt.domain === domain.domain;
      const activeLabel = sameDomain
        ? activeAttempt.state === "CREATED" ? "Bắt đầu bài đã giữ" : "Tiếp tục bài đang làm"
        : "Hoàn tất bài đang làm trước";
      const continueAttempt = actionButton(activeLabel, "demo-start", () => {
        if (!sameDomain) return;
        if (activeAttempt.state === "CREATED") void startReservedAttempt();
        else void resumePersistentAttempt();
      }, "button secondary small catalog-direct-start");
      continueAttempt.disabled = !sameDomain || state.busy;
      actions.append(continueAttempt);
    } else {
      actions.append(actionButton(persistentMode ? "Bắt đầu bài luyện tập" : startLabel, "demo-start", () => startDemo(persistentMode ? domain : undefined), "button secondary small catalog-direct-start"));
    }
    cardFooter.append(actions);
    const start = actions.querySelector("[data-testid='demo-start']");
    if (persistentMode && start) start.setAttribute("aria-describedby", "attempt-timing-notice");
    if (start && !start.disabled) start.disabled = state.busy || (persistentMode && !domain.available && !sameActiveDomain);
  } else {
    card.append(element("p", "catalog-card-note", persistentMode ? "Đề nghị này đang đóng theo danh mục máy chủ." : "Nội dung demo chưa được chuẩn bị cho lĩnh vực này."));
    const disabled = element("button", "coming-soon", persistentMode ? "Chưa mở" : "Chưa có nội dung demo");
    disabled.type = "button";
    disabled.disabled = true;
    cardFooter.append(disabled);
  }
  card.append(cardFooter);
  if (persistentMode && state.reviewOffer?.domain === domain.domain) {
    card.append(renderReviewOffer(state.reviewOffer));
  }
  if (persistentMode && state.reviewIntent?.domain === domain.domain) {
    card.append(renderReviewIntentPanel(state.reviewIntent));
  }
  return card;
}

function appendReviewStatus(panel, stage, message) {
  const status = element("p", "review-mode-status", message);
  status.dataset.testid = "review-mode-status";
  status.dataset.stage = stage;
  status.tabIndex = -1;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  panel.append(status);
  return status;
}

function focusReviewStatus() {
  const status = app.querySelector("[data-testid='review-mode-status']");
  if (!status) return;
  status.focus({ preventScroll: true });
  status.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
}

function renderReviewOffer(offer) {
  const panel = element("section", "review-mode-card review-mode-offer");
  panel.dataset.testid = "review-mode-offer";
  panel.dataset.blueprintVersionId = offer.blueprintVersionId;
  panel.setAttribute("aria-labelledby", `review-mode-offer-title-${offer.offerId}`);
  const title = element("h3", "", "Có thể chọn bài ôn tập có lặp câu");
  title.id = `review-mode-offer-title-${offer.offerId}`;
  panel.append(title);
  panel.append(element("p", "", "Máy chủ chưa tìm đủ câu mới cho bộ này. Bạn có thể yêu cầu một bài mới theo cùng lĩnh vực, số câu và thời lượng; bài có thể gồm câu đã được giao trước đây."));
  appendReviewStatus(panel, "offered", "Chưa tạo bài ôn tập. Cần xác nhận riêng trước khi gửi yêu cầu.");
  const open = actionButton("Xem lựa chọn ôn tập", "review-mode-open", () => openReviewConsent(offer), "button secondary");
  open.setAttribute("aria-haspopup", "dialog");
  open.setAttribute("aria-controls", "review-mode-dialog");
  open.disabled = state.busy;
  panel.append(open);
  return panel;
}

function renderReviewIntentPanel(intent) {
  const panel = element("section", "review-mode-card review-mode-outcome");
  panel.dataset.testid = "review-mode-outcome";
  panel.dataset.blueprintVersionId = intent.blueprintVersionId;
  const messages = {
    posting: "Đang gửi yêu cầu ôn tập. Chưa tải xong trạng thái bài từ máy chủ.",
    uncertain: "Chưa xác nhận được phản hồi. Máy chủ có thể đã ghi nhận yêu cầu; hãy thử lại đúng yêu cầu này để kiểm tra.",
    receipt: "Máy chủ đã ghi nhận yêu cầu ôn tập. Đang đọc trạng thái bài từ máy chủ.",
    "read-unavailable": "Máy chủ đã ghi nhận yêu cầu, nhưng chưa đọc được trạng thái bài. Có thể tải lại trạng thái mà không gửi yêu cầu tạo bài lần nữa.",
    unverified: "Phản hồi máy chủ chưa khớp với chế độ ôn tập đã yêu cầu. Bài chưa được mở trong giao diện này.",
    failed: intent.message || "Không tạo được bài ôn tập. Không có thao tác thay thế tự động nào được gửi.",
  };
  appendReviewStatus(panel, intent.phase, messages[intent.phase] || messages.failed);
  if (intent.phase === "uncertain") {
    const retry = actionButton("Thử lại cùng yêu cầu", "review-mode-retry", () => { void submitReviewIntent(intent); }, "button secondary");
    retry.disabled = state.busy;
    panel.append(retry);
  } else if (intent.phase === "read-unavailable" && intent.receipt?.attemptId) {
    const reload = actionButton("Tải lại trạng thái bài", "review-mode-reload", () => { void readReviewReceipt(intent); }, "button secondary");
    reload.disabled = state.busy;
    panel.append(reload);
  } else if (["failed", "unverified"].includes(intent.phase)) {
    const recover = actionButton("Đọc lại bài đã lưu từ máy chủ", "review-mode-recover", () => { void initializePersistent(); }, "button secondary");
    recover.disabled = state.busy;
    panel.append(recover);
  }
  return panel;
}

function openReviewConsent(offer) {
  if (state.busy || !reviewOfferIsCurrent(offer)) {
    if (state.reviewOffer === offer) {
      clearReviewFlow();
      renderCatalog();
      showMessage("Lựa chọn ôn tập không còn khớp với danh mục hiện tại. Hãy đọc lại danh mục.");
    }
    return;
  }
  dismissReviewDialog();
  const dialog = element("dialog", "review-mode-dialog");
  dialog.id = "review-mode-dialog";
  dialog.dataset.testid = "review-mode-dialog";
  dialog.dataset.stage = "confirming";
  dialog.setAttribute("aria-labelledby", "review-mode-dialog-title");
  dialog.setAttribute("aria-describedby", "review-mode-dialog-description");
  dialog.reviewOffer = offer;
  const title = element("h2", "", "Xác nhận bài ôn tập");
  title.id = "review-mode-dialog-title";
  const description = element("p", "", `${domainName({ domain: offer.domain })} · ${offer.questionCount} câu · ${formatPracticeDuration(offer.durationSeconds)}. Bài mới có thể dùng câu hỏi đã được giao trước đây; không có cam kết rằng mọi câu sẽ lặp lại.`);
  description.id = "review-mode-dialog-description";
  const warning = element("p", "review-mode-warning", "Lượt này tạo một bài luyện tập mới theo bộ đã chọn. Xác nhận này không xóa lịch sử bài trước và không bảo đảm bài sẽ được tạo nếu nội dung đủ điều kiện thay đổi.");
  const fieldset = element("fieldset", "review-mode-consent-group");
  const legend = element("legend", "", "Đồng ý lặp câu");
  const label = element("label", "review-mode-consent-label");
  const checkbox = element("input", "review-mode-consent-checkbox");
  checkbox.type = "checkbox";
  checkbox.dataset.testid = "review-mode-consent";
  checkbox.id = "review-mode-consent-input";
  const labelText = element("span", "", "Tôi đồng ý rằng bài này có thể dùng câu hỏi đã được giao trong bài trước.");
  label.append(checkbox, labelText);
  fieldset.append(legend, label);
  const actions = element("div", "review-mode-dialog-actions");
  const cancel = actionButton("Hủy", "review-mode-cancel", () => closeReviewConsent(dialog, true), "button secondary");
  const confirm = actionButton("Xác nhận và tạo bài ôn tập", "review-mode-confirm", () => { void confirmReviewConsent(offer, checkbox, dialog); }, "button");
  confirm.disabled = true;
  checkbox.addEventListener("change", () => { confirm.disabled = !checkbox.checked; });
  actions.append(cancel, confirm);
  dialog.append(title, description, warning, fieldset, actions);
  dialog.returnFocusTarget = app.querySelector("[data-testid='review-mode-open']");
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReviewConsent(dialog, true);
  });
  dialog.addEventListener("close", () => {
    if (!dialog.isConnected) return;
    checkbox.checked = false;
    confirm.disabled = true;
    if (state.reviewDialog === dialog) state.reviewDialog = null;
    if (state.reviewOffer === offer) {
      const status = app.querySelector("[data-testid='review-mode-offer'] [data-testid='review-mode-status']");
      if (status) {
        status.dataset.stage = "offered";
        status.textContent = "Chưa tạo bài ôn tập. Cần xác nhận riêng trước khi gửi yêu cầu.";
      }
    }
    const target = dialog.returnFocusTarget;
    dialog.remove();
    if (dialog.dataset.suppressFocusRestore !== "true" && target?.isConnected) target.focus({ preventScroll: true });
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !dialog.open) return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((control) => control.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  state.reviewDialog = dialog;
  const offerStatus = app.querySelector("[data-testid='review-mode-offer'] [data-testid='review-mode-status']");
  if (offerStatus) {
    offerStatus.dataset.stage = "confirming";
    offerStatus.textContent = "Đang chờ xác nhận rõ ràng. Chưa gửi yêu cầu tạo bài.";
  }
  app.append(dialog);
  dialog.showModal();
  checkbox.focus({ preventScroll: true });
}

function closeReviewConsent(dialog, restoreFocus) {
  if (state.reviewDialog !== dialog) return;
  if (!restoreFocus) {
    dialog.dataset.suppressFocusRestore = "true";
    if (dialog.open) dialog.close();
    state.reviewDialog = null;
    return;
  }
  if (dialog.open) dialog.close();
}

async function confirmReviewConsent(offer, checkbox, dialog) {
  if (state.busy || !checkbox.checked || dialog.reviewOffer !== offer || !reviewOfferIsCurrent(offer)) return;
  let requestIntent;
  try {
    requestIntent = api.prepareReviewAttempt(offer.blueprintVersionId);
  } catch {
    state.reviewOffer = null;
    state.reviewIntent = { ...offer, phase: "failed", message: "Không thể chuẩn bị yêu cầu theo mã bộ hiện tại. Hãy đọc lại danh mục." };
    closeReviewConsent(dialog, false);
    renderCatalog();
    return;
  }
  state.reviewOffer = null;
  const intent = {
    ...offer,
    phase: "posting",
    requestIntent,
    receipt: null,
    message: "",
  };
  state.reviewIntent = intent;
  closeReviewConsent(dialog, false);
  await submitReviewIntent(intent);
}

async function submitReviewIntent(intent) {
  if (state.busy || state.reviewIntent !== intent || intent.identityGeneration !== state.identityGeneration
      || !intent.requestIntent) return;
  state.busy = true;
  intent.phase = "posting";
  renderCatalog();
  focusReviewStatus();
  if (state.reviewIntent !== intent || state.identityGeneration !== intent.identityGeneration) {
    state.busy = false;
    return;
  }
  try {
    const receipt = await api.createReviewAttempt(intent.requestIntent);
    if (state.identityGeneration !== intent.identityGeneration || state.reviewIntent !== intent) return;
    state.busy = false;
    intent.requestIntent = null;
    if (!isMatchingReviewReceipt(receipt, intent)) {
      intent.phase = "unverified";
      renderCatalog();
      focusReviewStatus();
      return;
    }
    intent.receipt = Object.freeze({ attemptId: receipt.attemptId, domain: receipt.domain });
    intent.phase = "receipt";
    renderCatalog();
    focusReviewStatus();
    await readReviewReceipt(intent);
  } catch (error) {
    if (state.identityGeneration !== intent.identityGeneration || state.reviewIntent !== intent) return;
    state.busy = false;
    if (handlePersistentError(error)) return;
    if (error?.status === 503 || error?.status === 429) {
      intent.phase = "uncertain";
    } else {
      intent.requestIntent = null;
      intent.phase = "failed";
      intent.message = error?.message || "Máy chủ đã từ chối yêu cầu ôn tập. Hãy đọc lại danh mục trước khi chọn lại.";
    }
    renderCatalog();
    focusReviewStatus();
  }
}

async function readReviewReceipt(intent) {
  if (state.busy || state.reviewIntent !== intent || intent.identityGeneration !== state.identityGeneration
      || !intent.receipt?.attemptId) return;
  state.busy = true;
  intent.phase = "receipt";
  renderCatalog();
  focusReviewStatus();
  if (state.reviewIntent !== intent || state.identityGeneration !== intent.identityGeneration) {
    state.busy = false;
    return;
  }
  try {
    const response = await api.readReviewAttempt(intent.receipt.attemptId, intent.domain);
    if (state.identityGeneration !== intent.identityGeneration || state.reviewIntent !== intent) return;
    state.busy = false;
    const attempt = response?.attempt;
    if (!attempt || attempt.attemptId !== intent.receipt.attemptId || attempt.domain !== intent.domain
        || attempt.formMode !== "PERSONALIZED_PRACTICE" || attempt.reuseMode !== "REVIEW_ALLOWED") {
      intent.phase = "unverified";
      renderCatalog();
      focusReviewStatus();
      return;
    }
    state.reviewIntent = null;
    state.resumeNotice = "Đã tải trạng thái bài ôn tập có thể lặp câu từ máy chủ.";
    state.review = null;
    state.currentIndex = 0;
    void refreshPersistentHistory();
    acceptAttempt(attempt);
  } catch (error) {
    if (state.identityGeneration !== intent.identityGeneration || state.reviewIntent !== intent) return;
    state.busy = false;
    if (handlePersistentError(error)) return;
    intent.phase = error?.code === "UNEXPECTED_ATTEMPT_MODE" ? "unverified" : "read-unavailable";
    renderCatalog();
    focusReviewStatus();
  }
}

function renderCatalog() {
  if (persistentMode) reconcileReviewFlowWithCatalog();
  if (persistentMode) {
    stopGradePolling();
    clearTimer();
  }
  const fragment = document.createDocumentFragment();
  const topbar = header();
  topbar.querySelector("[data-testid='nav-catalog']")?.classList.add("active");
  fragment.append(topbar);
  const panel = element("section", "catalog-panel");
  panel.dataset.testid = "catalog-panel";
  const panelHeader = element("div", "catalog-panel-header");
  const heading = element("div", "catalog-panel-heading");
  heading.append(element("p", "catalog-overline", persistentMode ? "DANH MỤC · POSTGRESQL CỤC BỘ" : "BÀI LUYỆN TẬP · BẢN DEMO"));
  const title = element("h1", "", persistentMode ? "Chọn một bài luyện tập." : "Chọn phần muốn luyện.");
  title.id = "catalog-title";
  title.tabIndex = -1;
  heading.append(title, element("p", "catalog-panel-description", persistentMode
    ? "Danh mục hiển thị số câu, thời lượng và khoảng mở mà máy chủ cung cấp cho từng bài độc lập."
    : "Chọn một lĩnh vực để xem thông tin bài luyện tập cục bộ."));
  const headerActions = element("div", "catalog-panel-header-actions");
  const catalogCount = element("span", "catalog-count", `${state.catalog.length} lĩnh vực`);
  catalogCount.dataset.testid = "catalog-count";
  catalogCount.setAttribute("role", "status");
  catalogCount.setAttribute("aria-live", "polite");
  headerActions.append(catalogCount, actionButton("Trang đầu", "home", () => {
    renderLanding();
    app.querySelector("h1")?.focus();
  }, "button secondary small"));
  panelHeader.append(heading, headerActions);

  const filters = element("div", "catalog-filters");
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", persistentMode ? "Lọc bài luyện tập" : "Lọc bài demo");
  const grid = element("div", "catalog-grid");
  grid.dataset.testid = "catalog-grid";
  function applyFilter(key, activeControl) {
    const domains = state.catalog.filter(domain => {
      const ownedActive = persistentMode && ["CREATED", "IN_PROGRESS"].includes(state.attempt?.state) && state.attempt.domain === domain.domain;
      return key === "all" || (domain.available || ownedActive) === (key === "available");
    });
    const flow = state.reviewIntent ?? state.reviewOffer;
    if (flow && !domains.some((domain) => domain.domain === flow.domain)) clearReviewFlow();
    for (const button of filters.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button === activeControl));
    grid.replaceChildren(...domains.map(domainCard));
    catalogCount.textContent = `${domains.length} lĩnh vực`;
    announce(`${domains.length} lĩnh vực trong bộ lọc.`);
  }
  for (const [key, label] of [["all", "Tất cả"], ["available", "Có thể làm"], ["unavailable", persistentMode ? "Chưa mở" : "Chưa có nội dung"]]) {
    const control = actionButton(label, `catalog-filter-${key}`, () => {
      applyFilter(key, control);
      control.focus({ preventScroll: true });
    }, "button secondary small catalog-filter");
    control.setAttribute("aria-pressed", String(key === "all"));
    filters.append(control);
  }
  for (const domain of state.catalog) grid.append(domainCard(domain));
  panel.append(panelHeader);
  if (persistentMode) panel.append(renderTimingNotice());
  panel.append(filters, grid);
  if (persistentMode && state.attempt && !state.reviewIntent) {
    const current = element("section", "staff-callout persistent-current-attempt");
    current.dataset.testid = "persistent-current-attempt";
    const currentTitle = state.attempt.state === "GRADED" ? "Kết quả đã sẵn sàng" : ["SUBMITTED", "EXPIRED"].includes(state.attempt.state)
      ? "Bài đã gửi; trạng thái chấm được lưu" : "Bài đã lưu cho hồ sơ này";
    current.append(element("h2", "", currentTitle));
    current.append(element("p", "", `${domainName({ domain: state.attempt.domain })} · ${attemptStateNames[state.attempt.state] || "Chưa đọc được trạng thái"}${state.attempt.gradingStatus ? ` · ${gradingStateNames[state.attempt.gradingStatus] || "Chưa đọc được trạng thái chấm"}` : ""}`));
    if (isReviewAllowedAttempt(state.attempt)) current.append(element("p", "review-mode-label", reviewModeLabel()));
    current.append(actionButton(state.attempt.state === "GRADED" ? "Mở kết quả" : "Đọc lại bài đã lưu", "persistent-resume", resumePersistentAttempt, "button secondary"));
    fragment.append(panel, current);
  } else {
    fragment.append(panel);
  }
  if (persistentMode) {
    const history = element("section", "staff-callout persistent-history");
    history.dataset.testid = "persistent-history";
    history.append(element("h2", "", "Lịch sử bài luyện tập"));
    if (state.historyStatus) {
      const status = element("p", "", state.historyStatus);
      status.dataset.testid = "history-status";
      history.append(status);
    } else if (state.history.length === 0) {
      history.append(element("p", "", "Chưa có bài đã lưu cho hồ sơ này."));
    } else {
      const status = element("p", "", `${state.history.length} bài trong lịch sử tài khoản.`);
      status.dataset.testid = "history-status";
      const entries = element("div", "persistent-history-list");
      for (const record of state.history.slice(0, 10)) {
        const row = element("article", "persistent-history-item");
        row.append(element("strong", "", `${domainNames[record.domain] || record.domain} · ${attemptStateNames[record.state] || "Chưa đọc được trạng thái"}`));
        if (record.formMode === "PERSONALIZED_PRACTICE" && record.reuseMode === "REVIEW_ALLOWED") {
          row.append(element("span", "review-mode-label", reviewModeLabel()));
        }
        if (record.score && record.state === "GRADED") {
          row.append(element("span", "", `${record.score.correctCount}/${record.score.totalCount} · ${record.score.percentage}% · luyện tập không chính thức`));
        } else if (record.state === "SUBMITTED" || record.state === "EXPIRED") {
          row.append(element("span", "", "Đang chờ trạng thái chấm"));
        }
        row.append(actionButton("Đọc bài đã lưu", `history-${record.attemptId}`, () => openPersistentHistoryAttempt(record.attemptId), "button secondary small"));
        entries.append(row);
      }
      history.append(status, entries);
    }
    fragment.append(history);
  }
  fragment.append(element("p", "demo-disclaimer catalog-disclaimer", persistentMode
    ? "Đây là luyện tập không chính thức trên dịch vụ PostgreSQL cục bộ bằng hồ sơ tổng hợp. Không khẳng định tương đương cách chấm chính thức."
    : "Đây là bản demo cục bộ với bốn vị trí kiểm thử; một số câu lặp lại và kết quả không phải điểm TSA chính thức."));
  if (!persistentMode) {
    const staffCallout = element("section", "staff-callout");
    staffCallout.append(element("div", "", "Không gian nhân viên cục bộ"));
    staffCallout.append(element("p", "", "Một khu riêng để chuẩn bị và kiểm tra các bản nháp câu hỏi trong môi trường thử nghiệm."));
    staffCallout.append(actionButton("Mở không gian bản nháp", "staff-open", openStaff, "button secondary"));
    fragment.append(staffCallout);
  }
  fragment.append(footerNote());
  replaceApp(fragment, { catalogMode: true });
}

async function startDemo(selectedDomain = null) {
  const identityGeneration = state.identityGeneration;
  if (state.busy) return;
  if (persistentMode) clearReviewFlow();
  state.busy = true;
  renderCatalog();
  let profile = null;
  try {
    profile = persistentMode
      ? (typeof selectedDomain === "object" && selectedDomain !== null
        ? selectedDomain
        : state.catalog.find((entry) => entry.domain === selectedDomain))
      : null;
    if (persistentMode && !profile) throw new Error("Chọn một bài đang mở trong danh mục máy chủ.");
    const response = persistentMode
      ? await api.startDemo(profile.domain, profile.blueprintVersionId)
      : await api.startDemo("MATH");
    if (identityGeneration !== state.identityGeneration) return;
    if (persistentMode) void refreshPersistentHistory();
    state.busy = false;
    state.resumeNotice = persistentMode
      ? response.resumed ? "Đã tiếp tục bài đã lưu" : ""
      : response.resumed ? "Đã tiếp tục phiên demo" : "";
    state.review = null;
    state.currentIndex = 0;
    acceptAttempt(response.attempt);
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    const alternative = persistentMode ? reviewAlternativeFrom(error, profile) : null;
    if (alternative && state.catalog.some((entry) => entry.domain === profile.domain
        && entry.blueprintVersionId === profile.blueprintVersionId)) {
      state.reviewOffer = Object.freeze({
        offerId: window.crypto.randomUUID(),
        domain: profile.domain,
        blueprintVersionId: alternative.blueprintVersionId,
        questionCount: profile.questionCount,
        durationSeconds: profile.durationSeconds,
        identityGeneration,
      });
      renderCatalog();
      focusReviewStatus();
      announce("Có lựa chọn ôn tập cần xác nhận riêng.");
      return;
    }
    if (persistentMode && handlePersistentError(error)) return;
    renderCatalog();
    showMessage(error.message || (persistentMode ? "Không thể bắt đầu bài luyện tập." : "Không thể bắt đầu phiên demo."));
  }
}

function selectedAnswer(slotId) {
  if (state.pendingAnswer?.slotId === slotId) return state.pendingAnswer.value;
  return state.attempt.answers.find((answer) => answer.slotId === slotId) ?? null;
}

function acknowledgedAnswer(slotId) {
  return state.attempt.answers.find((answer) => answer.slotId === slotId) ?? null;
}

function selectedOption(slotId) {
  return selectedAnswer(slotId)?.optionId ?? null;
}

function acknowledgedOptions(slotId) {
  const answer = acknowledgedAnswer(slotId);
  if (answer?.type !== "MULTIPLE_CHOICE" || !Array.isArray(answer.optionIds)) return [];
  return answer.optionIds;
}

function selectedOptions(slotId) {
  if (state.pendingMultipleChoice?.slotId === slotId) return state.pendingMultipleChoice.optionIds;
  return acknowledgedOptions(slotId);
}

function hasUnacknowledgedChanges() {
  return state.pendingAnswer !== null || state.pendingMultipleChoice !== null;
}

function hasPendingForSlot(slotId) {
  return state.pendingAnswer?.slotId === slotId || state.pendingMultipleChoice?.slotId === slotId;
}

function selectedStatementValues(slotId) {
  const answer = selectedAnswer(slotId);
  if (answer?.type !== "TRUE_FALSE_GROUP" || !Array.isArray(answer.statementValues)) return {};
  return Object.fromEntries(answer.statementValues
    .filter((entry) => entry !== null && typeof entry === "object" && typeof entry.statementId === "string" && typeof entry.value === "boolean")
    .map(({ statementId, value }) => [statementId, value]));
}

function acknowledgedStatementValues(slotId) {
  const answer = acknowledgedAnswer(slotId);
  if (answer?.type !== "TRUE_FALSE_GROUP" || !Array.isArray(answer.statementValues)) return {};
  return Object.fromEntries(answer.statementValues
    .filter((entry) => entry !== null && typeof entry === "object" && typeof entry.statementId === "string" && typeof entry.value === "boolean")
    .map(({ statementId, value }) => [statementId, value]));
}

function isQuestionAnswered(slot) {
  if (slot.interaction.type === "MULTIPLE_CHOICE") {
    const count = acknowledgedOptions(slot.slotId).length;
    return count >= slot.interaction.minSelections && count <= slot.interaction.maxSelections;
  }
  if (slot.interaction.type !== "TRUE_FALSE_GROUP") return acknowledgedAnswer(slot.slotId)?.optionId != null;
  const values = acknowledgedStatementValues(slot.slotId);
  return slot.interaction.statements.length > 0 && slot.interaction.statements.every(({ id }) => Object.hasOwn(values, id));
}

function hasAnySavedAnswer(slotId) {
  const answer = acknowledgedAnswer(slotId);
  if (answer?.type === "TRUE_FALSE_GROUP") return Array.isArray(answer.statementValues) && answer.statementValues.length > 0;
  if (answer?.type === "MULTIPLE_CHOICE") return Array.isArray(answer.optionIds) && answer.optionIds.length > 0;
  return answer?.optionId !== undefined && answer.optionId !== null;
}

function questionAnswerStatus(slot) {
  if (isQuestionAnswered(slot)) return "answered";
  return hasAnySavedAnswer(slot.slotId) ? "partial" : "unanswered";
}

function trueFalseAnswer(values) {
  return {
    type: "TRUE_FALSE_GROUP",
    statementValues: Object.entries(values).map(([statementId, value]) => ({ statementId, value })),
  };
}

function stageMultipleChoice(question, optionId, checked, restoreFocusTestId) {
  const selected = new Set(selectedOptions(question.slotId));
  if (checked) {
    if (selected.size >= question.interaction.maxSelections) return;
    selected.add(optionId);
  } else {
    selected.delete(optionId);
  }
  const optionIds = question.interaction.options.filter(({ id }) => selected.has(id)).map(({ id }) => id);
  state.pendingMultipleChoice = { slotId: question.slotId, optionIds, clearRequested: false, saveAttempted: false };
  renderExam();
  if (optionIds.length >= question.interaction.minSelections && optionIds.length <= question.interaction.maxSelections) {
    void saveSelectedAnswer(question.slotId, { type: "MULTIPLE_CHOICE", optionIds }, restoreFocusTestId);
  } else {
    updateSaveStatus(`Chưa lưu: chọn ít nhất ${question.interaction.minSelections} phương án, hoặc xóa thay đổi.`, "unsaved");
    app.querySelector(`[data-testid='${restoreFocusTestId}']`)?.focus();
  }
}

function discardPendingMultipleChoice() {
  if (!hasUnacknowledgedChanges() || state.busy || state.savingSlotId !== null) return;
  if (state.pendingMultipleChoice?.saveAttempted || state.pendingAnswer?.saveAttempted) {
    void reloadAttemptAfterSaveConflict();
    return;
  }
  state.pendingAnswer = null;
  state.pendingMultipleChoice = null;
  renderExam();
  app.querySelector("[data-testid='question-title']")?.focus();
  announce("Đã bỏ thay đổi chưa lưu. Các câu trả lời đã xác nhận vẫn được giữ.");
}

function retryPendingAnswer() {
  const pending = state.pendingAnswer;
  if (!pending || state.busy || state.savingSlotId !== null) return;
  void saveSelectedAnswer(pending.slotId, pending.value, "clear-answer");
}

function retryPendingMultipleChoice() {
  const pending = state.pendingMultipleChoice;
  const slot = state.attempt?.slots.find((item) => item.slotId === pending?.slotId);
  if (!pending || !slot || state.busy || state.savingSlotId !== null) return;
  if (!pending.clearRequested && pending.optionIds.length < slot.interaction.minSelections) return;
  void saveSelectedAnswer(pending.slotId, { type: "MULTIPLE_CHOICE", optionIds: pending.optionIds }, "clear-answer");
}

function renderOptions(question, saving) {
  const list = element("div", "option-list");
  const multiple = question.interaction.type === "MULTIPLE_CHOICE";
  const selected = multiple ? selectedOptions(question.slotId) : [];
  for (const option of question.interaction.options) {
    const isSelected = multiple ? selected.includes(option.id) : selectedOption(question.slotId) === option.id;
    const atLimit = multiple && selected.length >= question.interaction.maxSelections && !isSelected;
    const label = element("label", `option${isSelected ? " selected" : ""}`);
    const input = element("input");
    input.type = multiple ? "checkbox" : "radio";
    input.name = `answer-${question.slotId}`;
    input.value = option.id;
    input.checked = isSelected;
    input.disabled = saving || state.busy || atLimit;
    input.dataset.testid = `option-${option.id}`;
    input.addEventListener("change", () => {
      if (multiple) {
        stageMultipleChoice(question, option.id, input.checked, `option-${option.id}`);
      } else {
        void saveSelectedAnswer(question.slotId, { optionId: option.id }, `option-${option.id}`);
      }
    });
    const letter = element("span", "option-letter", option.id.toUpperCase());
    const simpleText = option.content.every((block) => block.type === "text");
    const text = element("span", "option-text", simpleText ? contentText(option.content) : undefined);
    if (!simpleText) text.append(renderContentBlocks(option.content));
    label.append(input, letter, text);
    list.append(label);
  }
  return list;
}

function renderTrueFalseGroup(question, saving) {
  const group = element("div", "true-false-group");
  group.dataset.testid = "true-false-group";
  const values = selectedStatementValues(question.slotId);
  question.interaction.statements.forEach((statement, index) => {
    const fieldset = element("fieldset", "tf-statement");
    fieldset.dataset.testid = `tf-statement-${statement.id}`;
    const prompt = contentText(statement.content);
    const legend = element("legend", "tf-statement-label", `Mệnh đề ${index + 1}`);
    const simpleText = statement.content.every((block) => block.type === "text");
    const copy = simpleText
      ? element("p", "tf-statement-copy", contentText(statement.content))
      : element("div", "tf-statement-copy");
    if (!simpleText) copy.append(renderContentBlocks(statement.content));
    const choices = element("div", "tf-choices");
    choices.setAttribute("role", "radiogroup");
    choices.setAttribute("aria-label", `Mệnh đề ${index + 1}: ${prompt}`);
    for (const [value, label] of [[true, "Đúng"], [false, "Sai"]]) {
      const choice = element("label", `tf-choice${values[statement.id] === value ? " selected" : ""}`);
      const input = element("input");
      input.type = "radio";
      input.name = `answer-${question.slotId}-${statement.id}`;
      input.value = String(value);
      input.checked = values[statement.id] === value;
    input.disabled = saving || state.busy;
      input.dataset.testid = `tf-${statement.id}-${value ? "true" : "false"}`;
      input.setAttribute("aria-label", `${prompt}: ${label}`);
      input.addEventListener("change", () => {
        const updated = { ...selectedStatementValues(question.slotId), [statement.id]: value };
        void saveSelectedAnswer(question.slotId, trueFalseAnswer(updated), input.dataset.testid);
      });
      choice.append(input, element("span", "tf-choice-label", label));
      choices.append(choice);
    }
    fieldset.append(legend, copy, choices);
    group.append(fieldset);
  });
  return group;
}

function updateSaveStatus(message, kind = "", action = null, actionLabel = "Tải lại câu trả lời đã lưu") {
  const row = app.querySelector("[data-testid='save-status']");
  if (!row) return;
  const compact = row.classList.contains("compact-save-row") ? " compact-save-row" : "";
  row.className = `save-row${compact}${kind ? ` ${kind}` : ""}`;
  row.title = message;
  const visibleMessage = kind === "saved" ? "Đã lưu" : kind === "error" ? "Chưa lưu" : message;
  row.replaceChildren(element("span", "save-dot"), element("span", "", visibleMessage));
  if (message !== visibleMessage) row.append(element("span", "sr-only", message));
  app.querySelector("[data-testid='save-error']")?.remove();
  if (kind === "error") {
    const notice = element("p", "exam-save-error", `${message} Thử lại thao tác khi có kết nối.`);
    notice.dataset.testid = "save-error";
    if (action) {
      notice.textContent = message;
      notice.append(actionButton(actionLabel, "save-error-action", action, "button secondary small"));
    }
    app.querySelector("[data-testid='question-toolbar']")?.after(notice);
  }
}

async function reloadAttemptAfterSaveConflict() {
  const identityGeneration = state.identityGeneration;
  if (!persistentMode || !state.attempt || state.busy || state.savingSlotId !== null) return;
  const originalAttempt = state.attempt;
  const attemptId = originalAttempt.attemptId;
  state.busy = true;
  for (const control of app.querySelectorAll("button, input")) control.disabled = true;
  updateSaveStatus("Tải lại trạng thái đã lưu từ máy chủ…");
  try {
    const data = originalAttempt.formMode === "PERSONALIZED_PRACTICE" && originalAttempt.reuseMode === "REVIEW_ALLOWED"
      ? await api.readReviewAttempt(attemptId, originalAttempt.domain)
      : await api.readAttempt(attemptId);
    if (identityGeneration !== state.identityGeneration || state.attempt !== originalAttempt) return;
    // Terminal acceptance must see pending edits to explain unresolved saves.
    if (data.attempt.state === "IN_PROGRESS") {
      state.pendingAnswer = null;
      state.pendingMultipleChoice = null;
      state.resumeNotice = "Đã tải lại trạng thái đã lưu. Chọn lại câu trả lời nếu muốn thử lưu lần nữa.";
    }
    acceptAttempt(data.attempt);
  } catch (error) {
    if (identityGeneration !== state.identityGeneration || state.attempt !== originalAttempt) return;
    state.busy = false;
    if (!handlePersistentError(error)) {
      renderExam();
      updateSaveStatus("Chưa tải lại được trạng thái. Lựa chọn vẫn chưa được xác nhận; hãy thử đọc lại.", "error", reloadAttemptAfterSaveConflict, "Tải lại trạng thái");
      showMessage(error.message || "Chưa tải lại được trạng thái đã lưu.");
    }
  }
}

async function saveSelectedAnswer(slotId, answer, restoreFocusTestId) {
  const identityGeneration = state.identityGeneration;
  if (state.busy || state.savingSlotId !== null) return;
  state.savingSlotId = slotId;
  const attemptId = state.attempt.attemptId;
  if (persistentMode) {
    if (state.pendingMultipleChoice?.slotId === slotId) {
      state.pendingMultipleChoice.saveAttempted = true;
    } else {
      state.pendingAnswer = { slotId, value: structuredClone(answer), saveAttempted: true };
      renderExam();
    }
  }
  const options = app.querySelectorAll("input");
  for (const input of options) input.disabled = true;
  for (const control of app.querySelectorAll(".exam-mode button, .exam-mode input")) control.disabled = true;
  updateSaveStatus("Đang ghi nhớ lựa chọn…");
  try {
    const response = await api.saveAnswer(attemptId, slotId, answer);
    if (identityGeneration !== state.identityGeneration) return;
    if (state.attempt?.attemptId !== attemptId || state.attempt.state !== "IN_PROGRESS") return;
    state.attempt = response.attempt;
    state.savingSlotId = null;
    if (response.attempt.state !== "IN_PROGRESS") {
      acceptAttempt(response.attempt);
      return;
    }
    if (state.pendingMultipleChoice?.slotId === slotId) state.pendingMultipleChoice = null;
    if (state.pendingAnswer?.slotId === slotId) state.pendingAnswer = null;
    renderExam();
    const savedMessage = response.message || "Máy chủ đã xác nhận lưu lựa chọn.";
    updateSaveStatus(savedMessage, "saved");
    announce(savedMessage);
    app.querySelector(`[data-testid='${restoreFocusTestId}']`)?.focus();
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    if (state.attempt?.attemptId !== attemptId || state.attempt.state !== "IN_PROGRESS") return;
    if (persistentMode && handlePersistentError(error)) return;
    state.savingSlotId = null;
    renderExam();
    const revisionConflict = persistentMode && error.code === "REVISION_CONFLICT";
    const attemptClosed = persistentMode && error.code === "ATTEMPT_CLOSED";
    const needsReload = revisionConflict || attemptClosed;
    const message = attemptClosed
      ? "Máy chủ đã đóng bài luyện tập. Lựa chọn này chưa được xác nhận; tải lại trạng thái để xem bài đã gửi."
      : revisionConflict
      ? "Lựa chọn chưa được xác nhận vì trạng thái đã lưu thay đổi ở nơi khác. Tải lại câu trả lời đã lưu trước khi chọn lại."
      : error.message || "Lựa chọn chưa được ghi nhận.";
    const retryMultipleChoice = state.pendingMultipleChoice?.slotId === slotId
      && (state.pendingMultipleChoice.clearRequested || state.pendingMultipleChoice.optionIds.length > 0);
    const retrySingleAnswer = state.pendingAnswer?.slotId === slotId;
    const action = needsReload
      ? reloadAttemptAfterSaveConflict
      : retryMultipleChoice ? retryPendingMultipleChoice : retrySingleAnswer ? retryPendingAnswer : null;
    const actionLabel = attemptClosed ? "Tải lại trạng thái bài"
      : revisionConflict ? "Tải lại câu trả lời đã lưu" : "Thử lưu lựa chọn đang chờ";
    updateSaveStatus(message, "error", action, actionLabel);
    announce(message);
    app.querySelector(`[data-testid='${restoreFocusTestId}']`)?.focus();
  }
}

function appendDialog(parent, { id, title, body, cancelTestId, cancelText, confirmTestId, confirmText, confirmAction, danger = false, confirmFirst = false, className = "" }) {
  const dialog = element("dialog", className);
  dialog.id = id;
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  const heading = element("h2", "", title);
  heading.id = `${id}-title`;
  dialog.append(heading, typeof body === "string" ? element("p", "", body) : body);
  const error = element("p", "dialog-error");
  error.dataset.testid = `${id}-error`;
  error.setAttribute("role", "status");
  dialog.append(error);
  const actions = element("div", "dialog-actions");
  const cancel = actionButton(cancelText, cancelTestId, () => dialog.close(), "button secondary small");
  const confirm = actionButton(confirmText, confirmTestId, async () => {
    confirm.disabled = true;
    error.textContent = "";
    try {
      await confirmAction();
    } catch (cause) {
      error.textContent = cause.message || "Không thể hoàn tất thao tác.";
      confirm.disabled = false;
    }
  }, `button small${danger ? " danger" : ""}`);
  actions.append(...(confirmFirst ? [confirm, cancel] : [cancel, confirm]));
  dialog.append(actions);
  if (persistentMode) dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !dialog.open) return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((control) => control.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  parent.append(dialog);
  return dialog;
}

function openDialog(id) {
  if (state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges()) return;
  const dialog = app.querySelector(`#${id}`);
  if (!(dialog instanceof HTMLDialogElement)) return;
  if (id === "navigator-dialog") {
    const counter = app.querySelector("[data-testid='question-counter']");
    if (dialog.open) {
      dialog.close();
      return;
    }
    dialog.show();
    counter?.setAttribute("aria-expanded", "true");
    dialog.querySelector("[aria-current='step']")?.focus();
    if (!dialog.querySelector("[aria-current='step']")) dialog.querySelector("[data-testid='navigator-close']")?.focus();
    return;
  }
  if (!dialog.open) dialog.showModal();
}

function renderNavigatorDialogContent(dialog) {
  const content = dialog.querySelector("[data-testid='navigator-content']");
  if (!content || state.attempt === null) return;
  const counts = attemptAnswerCounts();
  const filters = [
    ["all", "Tất cả", counts.total],
    ["answered", "Đã trả lời", counts.answered],
    ["unanswered", "Chưa hoàn tất", counts.unanswered],
    ["marked", "Đánh dấu xem lại", counts.marked],
  ];
  const filterGroup = element("div", "navigator-filters");
  filterGroup.setAttribute("role", "group");
  filterGroup.setAttribute("aria-label", "Lọc danh sách câu hỏi");
  for (const [filter, label, count] of filters) {
    const button = actionButton(`${label} (${count})`, `navigator-filter-${filter}`, () => {
      state.navigatorFilter = filter;
      renderNavigatorDialogContent(dialog);
      dialog.querySelector(`[data-testid='navigator-filter-${filter}']`)?.focus();
    }, "button secondary small");
    button.setAttribute("aria-label", `${label}: ${count} câu`);
    button.setAttribute("aria-pressed", String(state.navigatorFilter === filter));
    button.disabled = state.busy || state.savingSlotId !== null;
    filterGroup.append(button);
  }

  const questionList = element("nav", "question-nav navigator-questions");
  questionList.setAttribute("aria-label", "Chọn câu hỏi");
  const visibleSlots = state.attempt.slots
    .map((slot, index) => ({ slot, index, answered: isQuestionAnswered(slot), partial: questionAnswerStatus(slot) === "partial", marked: state.markedSlotIds.has(slot.slotId) }))
    .filter(({ answered, marked }) => {
      if (state.navigatorFilter === "answered") return answered;
      if (state.navigatorFilter === "unanswered") return !answered;
      if (state.navigatorFilter === "marked") return marked;
      return true;
    });
  if (visibleSlots.length === 0) {
    questionList.append(element("p", "navigator-empty", "Không có câu hỏi trong bộ lọc này."));
  }
  for (const { slot, index, answered, partial, marked } of visibleSlots) {
    const classes = [answered ? "answered" : "", partial ? "partial" : "", marked ? "marked" : ""].filter(Boolean).join(" ");
    const button = element("button", classes, `${slot.ordinal}${marked ? " ★" : ""}`);
    button.type = "button";
    button.dataset.testid = `navigator-question-${slot.ordinal}`;
    button.disabled = state.busy || state.savingSlotId !== null;
    if (index === state.currentIndex) button.setAttribute("aria-current", "step");
    button.setAttribute("aria-label", `Đi đến câu ${slot.ordinal}, ${answered ? "đã trả lời" : partial ? "chưa hoàn tất" : "chưa trả lời"}${marked ? ", được đánh dấu xem lại" : ""}${index === state.currentIndex ? ", câu hiện tại" : ""}`);
    button.addEventListener("click", () => {
      if (state.busy || state.savingSlotId !== null) return;
      dialog.dataset.suppressFocusRestore = "true";
      dialog.close();
      navigateTo(index);
    });
    questionList.append(button);
  }
  content.replaceChildren(filterGroup, questionList);
}

function createNavigatorDialog() {
  const dialog = element("dialog", "navigator-dialog");
  dialog.id = "navigator-dialog";
  dialog.dataset.testid = "navigator-dialog";
  dialog.setAttribute("aria-labelledby", "navigator-dialog-title");
  const panel = element("div", "navigator-panel");
  const heading = element("h2", "", "Đi đến câu hỏi");
  heading.id = "navigator-dialog-title";
  const description = element("p", "", "Lọc theo trạng thái rồi chọn câu muốn mở.");
  const content = element("div", "navigator-dialog-content");
  content.dataset.testid = "navigator-content";
  const close = actionButton("Đóng danh sách", "navigator-close", () => dialog.close(), "button secondary small");
  const actions = element("div", "dialog-actions");
  actions.append(close);
  panel.append(heading, description, content, actions);
  dialog.append(panel);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog.open) {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener("close", () => {
    // Native close events may arrive after reopening or replacing this screen.
    if (dialog.open || !dialog.isConnected) return;
    app.querySelector("[data-testid='question-counter']")?.setAttribute("aria-expanded", "false");
    if (dialog.dataset.suppressFocusRestore === "true") {
      delete dialog.dataset.suppressFocusRestore;
      return;
    }
    app.querySelector("[data-testid='question-counter']")?.focus({ preventScroll: true });
  });
  renderNavigatorDialogContent(dialog);
  return dialog;
}

function examTopbar() {
  const header = element("header", "exam-topbar");
  header.dataset.testid = "exam-header";
  const identity = element("div", "exam-identity");
  identity.append(element("span", "exam-brand-mark", "T"));
  const identityCopy = element("span", "exam-identity-copy");
  identityCopy.append(element("strong", "", "TSA Practice"));
  const durationMinutes = Math.floor(state.attempt.durationSeconds / 60);
  identityCopy.append(element("span", "", `${domainNames[state.attempt.domain] || state.attempt.domain || "Bài luyện tập"} · ${persistentMode ? "Local PG" : "Demo"} · ${state.attempt.slots.length} câu · ${durationMinutes} phút`));
  if (isReviewAllowedAttempt(state.attempt)) identityCopy.append(element("span", "review-mode-label", reviewModeLabel()));
  identity.append(identityCopy);

  const clock = element("div", "exam-clock");
  clock.append(element("span", "", "THỜI GIAN CÒN LẠI"));
  const timer = element("strong", "", formatRemaining(state.clockDeadlineMs - performance.now()));
  timer.dataset.testid = "timer";
  timer.setAttribute("aria-live", "off");
  timer.setAttribute("aria-label", "Thời gian còn lại trong bản demo");
  clock.append(timer);

  const actions = element("div", "exam-header-actions");
  const exit = persistentMode
    ? actionButton("Danh sách", "exam-catalog", () => renderCatalog(), "button secondary small exam-exit")
    : actionButton("Thoát", "cancel-open", () => openDialog("cancel-dialog"), "button secondary small exam-exit");
  exit.setAttribute("aria-label", persistentMode ? "Quay lại danh sách; bài vẫn tiếp tục trên máy chủ" : "Kết thúc phiên demo");
  exit.disabled = state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges();
  const submit = actionButton("Nộp bài", "submit-open", () => openDialog("submit-dialog"), "button small exam-submit");
  submit.disabled = state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges();
  actions.append(exit, submit);
  header.append(identity, clock, actions);
  return header;
}

function renderExam() {
  if (state.attempt === null) return;
  if (state.attempt.slots.length === 0) {
    if (persistentMode) {
      clearAttemptState();
      renderPersistentBlocked("Máy chủ chưa cung cấp câu hỏi cho lượt đang mở. Hãy đọc lại trạng thái trước khi tiếp tục.");
    }
    return;
  }
  const fragment = document.createDocumentFragment();
  const workspace = element("div", "exam-workspace");
  workspace.append(examTopbar());

  const scrollRegion = element("section", "exam-scroll");
  scrollRegion.dataset.testid = "exam-body";
  scrollRegion.setAttribute("aria-label", "Bài luyện tập demo");
  const content = element("div", "exam-content");
  content.dataset.testid = "exam-content";
  const restored = resumeNotice();
  const repeatAlert = element("p", "repeat-alert", persistentMode ? state.attempt.repeatNotice : `Bản demo · ${state.attempt.repeatNotice}`);

  const question = state.attempt.slots[state.currentIndex];
  const counts = attemptAnswerCounts();
  const toolbar = element("div", "question-toolbar");
  toolbar.dataset.testid = "question-toolbar";
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", `Câu ${question.ordinal} trên ${state.attempt.slots.length}`);
  toolbar.append(element("span", "question-number", String(question.ordinal).padStart(2, "0")));
  const questionKind = question.interaction.type === "TRUE_FALSE_GROUP"
    ? "Đúng / sai"
    : question.interaction.type === "MULTIPLE_CHOICE" ? "Chọn nhiều phương án" : "Trắc nghiệm";
  toolbar.append(element("span", "question-kind", questionKind));
  const markedForReview = state.markedSlotIds.has(question.slotId);
  const markButton = actionButton(
    markedForReview ? "★ Đã đánh dấu" : "☆ Đánh dấu",
    "mark-for-review",
    () => toggleMarkedForReview(question.slotId),
    "button secondary small mark-for-review",
  );
  markButton.setAttribute("aria-pressed", String(markedForReview));
  markButton.setAttribute("aria-label", markedForReview ? "Bỏ đánh dấu câu hỏi để xem lại sau" : "Đánh dấu câu hỏi để xem lại sau");
  markButton.disabled = state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges();
  toolbar.append(markButton);
  const answeredText = element("span", "answered-count", `${counts.answered}/${counts.total} hoàn tất`);
  answeredText.dataset.testid = "answered-count";
  toolbar.append(answeredText);
  const saveRow = element("span", "save-row compact-save-row");
  saveRow.dataset.testid = "save-status";
  const saved = hasAnySavedAnswer(question.slotId);
  const pending = hasPendingForSlot(question.slotId);
  saveRow.classList.toggle("saved", saved && !pending);
  saveRow.classList.toggle("unsaved", pending);
  saveRow.append(element("span", "save-dot"), element("span", "", pending ? "Chưa lưu" : saved ? "Đã lưu" : "Chưa chọn"));
  if (pending) {
    saveRow.title = "Thay đổi mới chưa được máy chủ xác nhận.";
    saveRow.append(element("span", "sr-only", "Thay đổi mới chưa được máy chủ xác nhận."));
  } else if (saved) {
    const fullSavedMessage = "Đã ghi nhớ trong phiên demo";
    saveRow.title = fullSavedMessage;
    saveRow.append(element("span", "sr-only", fullSavedMessage));
  }
  saveRow.setAttribute("role", "status");
  saveRow.setAttribute("aria-live", "polite");
  toolbar.append(saveRow);

  const card = element("section", "question-body question-card");
  card.dataset.testid = "question-card";
  card.setAttribute("aria-labelledby", "question-title");
  const simpleText = question.content.every((block) => block.type === "text");
  const title = element("h2", "", simpleText ? contentText(question.content) : "Nội dung câu hỏi");
  title.id = "question-title";
  title.tabIndex = -1;
  const instruction = question.interaction.type === "TRUE_FALSE_GROUP"
    ? "Chọn Đúng hoặc Sai cho từng mệnh đề. Câu chỉ hoàn tất khi đã chọn cho tất cả mệnh đề."
    : question.interaction.type === "MULTIPLE_CHOICE"
      ? `Chọn từ ${question.interaction.minSelections} đến ${question.interaction.maxSelections} phương án.`
      : "Chọn một phương án bạn cho là đúng nhất.";
  const answerControl = question.interaction.type === "TRUE_FALSE_GROUP"
    ? renderTrueFalseGroup(question, state.savingSlotId === question.slotId)
    : renderOptions(question, state.savingSlotId === question.slotId);
  card.append(title);
  if (question.stimulus?.content) card.append(renderContentBlocks(question.stimulus.content));
  if (!simpleText) card.append(renderContentBlocks(question.content));
  card.append(element("p", "question-instruction", instruction), answerControl);
  const clear = actionButton("Xóa lựa chọn", "clear-answer", () => {
    if (question.interaction.type === "TRUE_FALSE_GROUP") {
      if (hasAnySavedAnswer(question.slotId)) void saveSelectedAnswer(question.slotId, trueFalseAnswer({}), "clear-answer");
    } else if (question.interaction.type === "MULTIPLE_CHOICE") {
      if (hasAnySavedAnswer(question.slotId)) {
        state.pendingMultipleChoice = { slotId: question.slotId, optionIds: [], clearRequested: true, saveAttempted: false };
        void saveSelectedAnswer(question.slotId, { type: "MULTIPLE_CHOICE", optionIds: [] }, "clear-answer");
      }
    } else {
      const selected = selectedOption(question.slotId);
      if (selected !== null) void saveSelectedAnswer(question.slotId, { optionId: null }, `option-${selected}`);
    }
  }, "text-button clear-answer");
  clear.disabled = !hasAnySavedAnswer(question.slotId) || state.busy || state.savingSlotId !== null;
  clear.setAttribute("aria-label", "Xóa lựa chọn đã ghi nhận cho vị trí hiện tại");
  card.append(clear);
  if (pending) {
    const multipleChoiceDraft = state.pendingMultipleChoice?.slotId === question.slotId;
    const pendingMessage = multipleChoiceDraft && !state.pendingMultipleChoice.clearRequested
      && state.pendingMultipleChoice.optionIds.length < question.interaction.minSelections
      ? `Chưa lưu. Cần ít nhất ${question.interaction.minSelections} phương án được chọn.`
      : "Thay đổi chưa được máy chủ xác nhận. Hãy thử lưu lại hoặc tải trạng thái đã lưu trước khi tiếp tục.";
    const draftNote = element("p", "exam-save-error", pendingMessage);
    draftNote.dataset.testid = multipleChoiceDraft ? "multiple-choice-unsaved" : "answer-unsaved";
    const discard = actionButton("Bỏ thay đổi chưa lưu", "multiple-choice-discard", discardPendingMultipleChoice, "button secondary small");
    discard.disabled = state.busy || state.savingSlotId !== null;
    draftNote.append(discard);
    card.append(draftNote);
  }
  content.append(toolbar);
  if (restored) content.append(restored);
  if (state.attempt.repeatNotice) content.append(repeatAlert);
  content.append(card);
  scrollRegion.append(content);

  const footer = element("footer", "exam-footer");
  footer.dataset.testid = "exam-footer";
  const footerInner = element("div", "exam-footer-inner");
  const previous = actionButton("← Trước", "question-prev", () => navigateTo(Math.max(0, state.currentIndex - 1)), "button secondary small question-step");
  previous.setAttribute("aria-label", "Câu trước");
  previous.disabled = state.currentIndex === 0 || state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges();
  const questionCounter = actionButton(
    `Câu ${state.currentIndex + 1} / ${state.attempt.slots.length}`,
    "question-counter",
    () => openDialog("navigator-dialog"),
    "button question-counter",
  );
  questionCounter.setAttribute("aria-label", `Câu ${state.currentIndex + 1} trên ${state.attempt.slots.length}. Mở danh sách câu hỏi.`);
  questionCounter.setAttribute("aria-controls", "navigator-dialog");
  questionCounter.setAttribute("aria-expanded", "false");
  questionCounter.disabled = state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges();
  const next = actionButton("Tiếp →", "question-next", () => navigateTo(Math.min(state.attempt.slots.length - 1, state.currentIndex + 1)), "button secondary small question-step");
  next.setAttribute("aria-label", "Câu tiếp theo");
  next.disabled = state.currentIndex === state.attempt.slots.length - 1 || state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges();
  footerInner.append(previous, questionCounter, next);
  footer.append(footerInner);
  workspace.append(scrollRegion, footer);

  const summary = element("div", "submit-summary");
  summary.append(element("p", "", `Đã hoàn tất ${counts.answered} trên ${counts.total} câu. ${counts.unanswered > 0 ? `${counts.unanswered} câu chưa hoàn tất sẽ được tính là sai trong kết quả minh họa.` : "Tất cả câu hỏi đều đã được hoàn tất."}`));
  const countSummary = element("div", "submit-counts submit-counts-inline");
  for (const [kind, label, count] of [
    ["answered", "Đã trả lời", counts.answered],
    ["unanswered", "Chưa hoàn tất", counts.unanswered],
    ["marked", "Đánh dấu xem lại", counts.marked],
  ]) {
    const item = element("div", "submit-count");
    const value = element("strong", "", String(count));
    value.dataset.testid = `submit-${kind}-count`;
    item.append(value, element("span", "", label));
    countSummary.append(item);
  }
  summary.append(countSummary);
  const summaryList = element("ul", "submit-summary-list");
  for (const slot of state.attempt.slots) {
    const status = questionAnswerStatus(slot);
    const marked = state.markedSlotIds.has(slot.slotId);
    const item = element("li", `${status}${marked ? " marked" : ""}`);
    item.append(element("strong", "", `Vị trí ${slot.ordinal}`));
    const statusText = status === "answered" ? "Đã hoàn tất" : status === "partial" ? "Chưa hoàn tất" : "Chưa trả lời";
    item.append(element("span", "", `${statusText}${marked ? " · Xem lại" : ""}`));
    summaryList.append(item);
  }
  const detailDisclosure = element("details", "submit-detail-disclosure");
  detailDisclosure.append(element("summary", "", "Xem trạng thái từng vị trí"), summaryList);
  summary.append(detailDisclosure);
  appendDialog(workspace, {
    id: "submit-dialog",
    title: "Nộp bài luyện tập?",
    body: summary,
    cancelTestId: "submit-cancel",
    cancelText: "Tiếp tục làm",
    confirmTestId: "submit-confirm",
    confirmText: "Xác nhận nộp",
    confirmAction: submitCurrentAttempt,
    confirmFirst: true,
    className: "submit-dialog",
  });
  appendDialog(workspace, {
    id: "cancel-dialog",
    title: "Kết thúc phiên demo?",
    body: "Các lựa chọn đã ghi nhớ vẫn chỉ nằm trong phiên demo này. Bạn sẽ quay lại danh sách bài tập.",
    cancelTestId: "cancel-cancel",
    cancelText: "Tiếp tục làm",
    confirmTestId: "cancel-confirm",
    confirmText: "Kết thúc phiên",
    confirmAction: cancelCurrentAttempt,
    danger: true,
  });
  workspace.append(createNavigatorDialog());
  fragment.append(workspace);
  replaceApp(fragment, { examMode: true });
  tick();
}

function navigateTo(index) {
  if (state.attempt === null || state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges()) return;
  state.currentIndex = Math.max(0, Math.min(index, state.attempt.slots.length - 1));
  renderExam();
  app.querySelector("#question-title")?.focus();
}

async function submitCurrentAttempt() {
  const identityGeneration = state.identityGeneration;
  if (state.attempt === null || state.busy || state.savingSlotId !== null || hasUnacknowledgedChanges()) return;
  state.busy = true;
  try {
    const response = await api.submitAttempt(state.attempt.attemptId);
    if (identityGeneration !== state.identityGeneration) return;
    if (persistentMode) void refreshPersistentHistory();
    state.busy = false;
    acceptAttempt(response.attempt);
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (persistentMode && handlePersistentError(error)) return;
    throw error;
  }
}

async function cancelCurrentAttempt() {
  if (state.attempt === null || state.busy || state.savingSlotId !== null) return;
  state.busy = true;
  try {
    await api.cancelAttempt(state.attempt.attemptId);
    state.busy = false;
    clearAttemptState();
    renderCatalog();
    announce("Phiên demo đã kết thúc. Bạn đã quay lại danh sách bài luyện tập.");
  } catch (error) {
    state.busy = false;
    throw error;
  }
}

function releasedAnswerStatus(released) {
  const sourceSlot = state.attempt.slots.find((slot) => slot.slotId === released.slotId && slot.ordinal === released.ordinal);
  if (released.type === "TRUE_FALSE_GROUP" && sourceSlot?.interaction.type === "TRUE_FALSE_GROUP") {
    const selected = Object.fromEntries((released.statementValues ?? []).map(({ statementId, value }) => [statementId, value]));
    const correct = Object.fromEntries((released.correctStatementValues ?? []).map(({ statementId, value }) => [statementId, value]));
    const complete = sourceSlot.interaction.statements.every(({ id }) => Object.hasOwn(selected, id));
    if (!complete) return Object.keys(selected).length > 0 ? "Chưa hoàn tất" : "Bỏ trống";
    return sourceSlot.interaction.statements.every(({ id }) => selected[id] === correct[id]) ? "Đúng" : "Sai";
  }
  if (sourceSlot?.interaction.type === "MULTIPLE_CHOICE") {
    const selected = acknowledgedOptions(released.slotId);
    if (selected.length === 0) return "Bỏ trống";
    if (selected.length < sourceSlot.interaction.minSelections) return "Chưa hoàn tất";
    const correct = released.correctOptionIds ?? [];
    return selected.length === correct.length && selected.every((id) => correct.includes(id)) ? "Đúng" : "Sai";
  }
  const answer = selectedOption(released.slotId);
  return answer === null ? "Bỏ trống" : answer === released.correctOptionId ? "Đúng" : "Sai";
}

function releasedQuestionCard(released, { includeExplanation = true } = {}) {
  const sourceSlot = state.attempt.slots.find((slot) => slot.slotId === released.slotId && slot.ordinal === released.ordinal);
  if (!sourceSlot) return element("p", "notice-panel", "Nội dung ôn tập không khả dụng.");
  const item = element("article", "review-item");
  item.dataset.testid = "review-question";
  item.append(element("p", "question-kicker", `VỊ TRÍ ${released.ordinal} / ${state.attempt.slots.length} · ${releasedAnswerStatus(released)}`));
  const simpleText = sourceSlot.content.every((block) => block.type === "text");
  item.append(element("h2", "", simpleText ? contentText(sourceSlot.content) : "Nội dung câu hỏi"));
  if (sourceSlot.stimulus?.content) item.append(renderContentBlocks(sourceSlot.stimulus.content));
  if (!simpleText) item.append(renderContentBlocks(sourceSlot.content));
  if (released.type === "TRUE_FALSE_GROUP" && sourceSlot.interaction.type === "TRUE_FALSE_GROUP") {
    const selected = Object.fromEntries((released.statementValues ?? []).map(({ statementId, value }) => [statementId, value]));
    const correct = Object.fromEntries((released.correctStatementValues ?? []).map(({ statementId, value }) => [statementId, value]));
    const statements = element("div", "tf-review-statements");
    for (const [index, statement] of sourceSlot.interaction.statements.entries()) {
      const hasSelection = Object.hasOwn(selected, statement.id);
      const chosenCorrectly = hasSelection && selected[statement.id] === correct[statement.id];
      const row = element("div", `tf-review-statement${hasSelection ? " selected" : ""}${chosenCorrectly ? " correct" : hasSelection ? " incorrect" : " unanswered"}`);
      row.dataset.testid = `review-statement-${statement.id}`;
      row.append(element("strong", "tf-review-label", `Mệnh đề ${index + 1}`));
      const simpleText = statement.content.every((block) => block.type === "text");
      const copy = simpleText
        ? element("p", "tf-review-copy", contentText(statement.content))
        : element("div", "tf-review-copy");
      if (!simpleText) copy.append(renderContentBlocks(statement.content));
      row.append(copy);
      row.append(element("span", "tf-review-choice", hasSelection ? `Bạn đã chọn: ${selected[statement.id] ? "Đúng" : "Sai"}` : "Bạn chưa chọn"));
      row.append(element("span", "tf-review-correct", `Đáp án đúng: ${correct[statement.id] ? "Đúng" : "Sai"}`));
      statements.append(row);
    }
    item.append(statements);
  } else if (released.type === "MULTIPLE_CHOICE" || sourceSlot.interaction.type === "MULTIPLE_CHOICE") {
    const selected = new Set(acknowledgedOptions(released.slotId));
    const correct = new Set(released.correctOptionIds ?? []);
    const options = element("ul", "review-options");
    for (const option of sourceSlot.interaction.options) {
      const optionRow = element("li", correct.has(option.id) ? "correct" : "");
      optionRow.append(element("span", "option-letter", option.id.toUpperCase()));
      const simpleText = option.content.every((block) => block.type === "text");
      const text = element("span", "", simpleText ? contentText(option.content) : undefined);
      if (!simpleText) text.append(renderContentBlocks(option.content));
      optionRow.append(text);
      if (selected.has(option.id)) optionRow.append(element("strong", "review-selected", "Bạn đã chọn"));
      if (correct.has(option.id)) optionRow.append(element("strong", "review-correct", "Đáp án đúng"));
      options.append(optionRow);
    }
    item.append(options);
  } else {
    const options = element("ul", "review-options");
    for (const option of sourceSlot.interaction.options) {
      const optionRow = element("li", option.id === released.correctOptionId ? "correct" : "");
      optionRow.append(element("span", "option-letter", option.id.toUpperCase()));
      const simpleText = option.content.every((block) => block.type === "text");
      const text = element("span", "", simpleText ? contentText(option.content) : undefined);
      if (!simpleText) text.append(renderContentBlocks(option.content));
      optionRow.append(text);
      if (option.id === selectedOption(released.slotId)) optionRow.append(element("strong", "review-selected", "Bạn đã chọn"));
      if (option.id === released.correctOptionId) optionRow.append(element("strong", "review-correct", "Đáp án đúng"));
      options.append(optionRow);
    }
    item.append(options);
  }
  if (includeExplanation) {
    const explanation = element("details", "explanation-disclosure");
    explanation.dataset.testid = "explanation";
    const toggle = element("summary", "", "Xem lời giải");
    explanation.addEventListener("toggle", () => { toggle.textContent = explanation.open ? "Ẩn lời giải" : "Xem lời giải"; });
    const simpleExplanation = released.explanation.every((block) => block.type === "text");
    const explanationContent = simpleExplanation
      ? element("p", "review-explanation", contentText(released.explanation))
      : element("div", "review-explanation");
    if (!simpleExplanation) explanationContent.append(renderContentBlocks(released.explanation));
    explanation.append(toggle, explanationContent);
    item.append(explanation);
  }
  return item;
}

function renderResult(result) {
  clearTimer();
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const restored = resumeNotice();
  if (restored) fragment.append(restored);
  const card = element("section", "result-card result-ticket");
  card.dataset.testid = "result";
  const hero = element("div", "result-hero");
  hero.dataset.testid = "result-hero";
  const score = element("div", "result-score");
  score.dataset.testid = "result-score";
  score.setAttribute("role", "img");
  score.setAttribute("aria-label", `${result.correctCount} trên ${result.totalCount} câu demo, ${result.percentage}%`);
  score.append(
    element("strong", "score-number", String(result.correctCount)),
    element("span", "score-total", `/ ${result.totalCount}`),
    element("span", "score-percentage", `${Number(result.percentage)}%`),
  );
  const summary = element("div", "result-ticket-copy");
  summary.append(element("p", "result-badge", persistentMode ? "KẾT QUẢ LUYỆN TẬP · LOCAL PG" : "PHIẾU KẾT QUẢ · BẢN DEMO"));
  const title = element("h1", "", "Bạn đã hoàn thành.");
  title.id = "result-title";
  title.tabIndex = -1;
  if (persistentMode) {
    const domain = element("p", "result-label", `Bài luyện tập độc lập · ${domainNames[state.attempt.domain] || state.attempt.domain} · ${result.totalCount} câu`);
    domain.dataset.testid = "result-domain";
    summary.append(domain);
    if (isReviewAllowedAttempt(state.attempt)) summary.append(element("p", "review-mode-label", reviewModeLabel()));
  }
  summary.append(title, element("p", "result-label", result.label));
  summary.append(element("p", "result-note", persistentMode
    ? "Kết quả luyện tập không chính thức đã được máy chủ phát hành cho hồ sơ tổng hợp này. Không đại diện cho điểm TSA chính thức hay đánh giá năng lực."
    : "Số câu đúng trên các vị trí demo. Đây không phải điểm TSA chính thức hay đánh giá năng lực."));
  summary.append(actionButton("Ôn tập câu hỏi", "review-open", () => { void openReview(); }, "button result-review-action"));
  hero.append(score, summary);
  card.append(hero);
  const stats = element("dl", "result-stats");
  stats.dataset.testid = "result-stats";
  const skipped = state.attempt.slots.length - state.attempt.answeredCount;
  const elapsed = Math.min(state.attempt.durationSeconds, Math.max(0,
    Math.floor((Date.parse(state.attempt.closedAt) - Date.parse(state.attempt.startedAt)) / 1000)));
  for (const [label, value] of [["Đúng", result.correctCount], ["Sai đã trả lời", state.attempt.answeredCount - result.correctCount], ["Chưa hoàn tất", skipped], ["Thời gian làm", formatRemaining(elapsed * 1000)]]) {
    const metric = element("div");
    metric.append(element("dt", "", label), element("dd", "", String(value)));
    stats.append(metric);
  }
  card.append(stats);
  card.append(element("p", "result-closure-note", state.attempt.closureReason === "DEADLINE"
    ? persistentMode ? "Hết thời gian do máy chủ quản lý. Kết quả dùng các lựa chọn đã được máy chủ ghi nhận." : "Hết thời gian demo. Kết quả dùng các lựa chọn đã được máy chủ ghi nhận."
    : persistentMode ? "Bài đã được gửi. Kết quả dùng các lựa chọn đã được máy chủ ghi nhận." : "Đã nộp bài demo. Lựa chọn được giữ nguyên để ôn tập."));
  const actions = element("div", "result-actions");
  actions.append(actionButton("Chi tiết đáp án", "result-details-open", () => openReview(true), "button secondary"));
  actions.append(actionButton("Quay lại danh sách", "return-catalog", () => renderCatalog(), "button secondary"));
  card.append(actions);
  if (state.review !== null) {
    const details = element("section", "result-details");
    details.dataset.testid = "result-details";
    details.append(element("h2", "", persistentMode ? "Chi tiết đáp án đã phát hành" : "Chi tiết đáp án · dữ liệu demo"));
    const filters = element("div", "catalog-filters");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Lọc chi tiết đáp án");
    const questions = element("div");
    questions.dataset.testid = "result-question-list";
    const incorrect = state.review.slots.filter(slot => releasedAnswerStatus(slot) !== "Đúng");
    for (const [key, label, slots] of [["all", "Tất cả", state.review.slots], ["incorrect", "Sai / chưa hoàn tất", incorrect]]) {
      const control = actionButton(`${label} (${slots.length})`, `result-filter-${key}`, () => {
        for (const button of filters.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button === control));
        questions.replaceChildren(...slots.map(releasedQuestionCard));
        if (slots.length === 0) questions.append(element("p", "notice-panel", "Không có câu nào trong bộ lọc này."));
        announce(`${slots.length} câu trong chi tiết đáp án.`);
      }, "button secondary small");
      control.setAttribute("aria-pressed", String(key === "all"));
      filters.append(control);
    }
    questions.replaceChildren(...state.review.slots.map(releasedQuestionCard));
    details.append(filters, questions);
    card.append(details);
  }
  fragment.append(card, footerNote());
  replaceApp(fragment, { resultMode: true });
  announce(`${persistentMode ? "Kết quả luyện tập không chính thức" : "Kết quả minh họa"}: ${result.correctCount} trên ${result.totalCount}.`);
}

async function openReview(inline = false) {
  const identityGeneration = state.identityGeneration;
  if (state.busy || state.attempt?.state !== "GRADED") return;
  state.busy = true;
  const trigger = app.querySelector(inline ? "[data-testid='result-details-open']" : "[data-testid='review-open']");
  if (trigger) trigger.disabled = true;
  try {
    const response = await api.readReview(state.attempt.attemptId);
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (!trigger?.isConnected) return;
    state.review = response.review;
    if (inline) {
      renderResult(state.attempt.result);
      const details = app.querySelector("[data-testid='result-details']");
      details.tabIndex = -1;
      details.focus();
    } else {
      renderReview();
      app.querySelector("#review-title")?.focus();
    }
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (persistentMode && handlePersistentError(error)) return;
    if (trigger?.isConnected) {
      trigger.disabled = false;
      showMessage(error.message || "Chưa mở được phần ôn tập.");
    }
  }
}

function renderReview() {
  if (state.attempt === null) return renderCatalog();
  if (state.attempt.state !== "GRADED" || state.review === null) return renderResult(state.attempt.result);
  const fragment = document.createDocumentFragment();
  const shell = element("div", "review-shell");
  shell.dataset.testid = "review";
  const headerBar = element("header", "review-topbar");
  headerBar.dataset.testid = "review-header";
  const identity = element("div", "review-identity");
  identity.append(element("span", "review-brand-mark", "T"));
  const title = element("h1", "", `Ôn tập · ${domainNames[state.attempt.domain] || state.attempt.domain || "Bài luyện tập"}`);
  title.id = "review-title";
  title.tabIndex = -1;
  const identityCopy = element("div", "review-identity-copy");
  identityCopy.append(element("span", "review-identity-label", "TSA Practice"), title);
  identity.append(identityCopy);
  headerBar.append(identity, element("span", "review-demo-label", persistentMode ? "LOCAL PG · KẾT QUẢ ĐÃ PHÁT HÀNH" : "BẢN DEMO · ĐÁP ÁN ĐÃ MỞ"));

  const toolbar = element("div", "review-toolbar");
  toolbar.dataset.testid = "review-toolbar";
  const position = element("span", "review-position");
  position.dataset.testid = "review-position";
  const explanationDetails = element("details", "review-explanation-disclosure");
  explanationDetails.id = "review-explanation-details";
  explanationDetails.dataset.testid = "explanation";
  explanationDetails.setAttribute("aria-controls", "review-explanation-pane");
  const explanationToggle = element("summary", "button review-explanation-toggle", "Xem lời giải");
  explanationToggle.dataset.testid = "review-explanation-toggle";
  explanationToggle.setAttribute("aria-controls", "review-explanation-pane");
  explanationToggle.setAttribute("aria-expanded", "false");
  explanationDetails.append(explanationToggle, element("span", "sr-only", "Lời giải đã công bố được hiển thị trong bảng lời giải."));
  toolbar.append(position, explanationDetails);

  const workspace = element("section", "review-workspace");
  workspace.dataset.testid = "review-workspace";
  workspace.setAttribute("aria-label", "Khu vực ôn tập");
  const questionPane = element("section", "review-question-pane");
  questionPane.dataset.testid = "review-question-pane";
  questionPane.setAttribute("aria-label", "Câu hỏi và lựa chọn");
  const filterGroup = element("div", "review-filters");
  filterGroup.setAttribute("role", "group");
  filterGroup.setAttribute("aria-label", "Lọc kết quả ôn tập");
  const context = element("div", "review-context");
  if (isReviewAllowedAttempt(state.attempt)) {
    context.append(element("p", "review-mode-label", "Bài mới được tạo theo chế độ ôn tập có thể lặp câu. Lượt này không sửa hay thay thế các bài đã lưu trước đây."));
  }
  context.append(
    element("p", "review-repeat-notice", state.review.repeatNotice),
    element("p", "review-disclaimer", persistentMode
      ? "Đáp án và lời giải chỉ được hiển thị sau khi máy chủ xác nhận kết quả đã phát hành. Nội dung này là luyện tập không chính thức."
      : "Đáp án và lời giải chỉ được hiển thị sau khi phiên demo đã khép lại. Ba câu trắc nghiệm lặp lại dữ liệu; nhóm đúng/sai là nội dung tổng hợp."),
  );
  const content = element("div", "review-question-content");
  content.setAttribute("aria-live", "polite");
  questionPane.append(filterGroup, context, content);

  const divider = element("div", "review-pane-divider");
  divider.setAttribute("aria-hidden", "true");
  divider.hidden = true;
  const explanationPane = element("aside", "review-explanation-pane");
  explanationPane.dataset.testid = "review-explanation-pane";
  explanationPane.id = "review-explanation-pane";
  explanationPane.setAttribute("aria-label", "Lời giải đã công bố");
  explanationPane.hidden = true;
  const explanationHeading = element("div", "review-explanation-heading");
  explanationHeading.append(element("strong", "", "Hướng dẫn giải"));
  const closeExplanation = actionButton("×", "review-explanation-close", () => {
    setExplanationOpen(false);
    explanationToggle.focus({ preventScroll: true });
  }, "button review-explanation-close");
  closeExplanation.setAttribute("aria-label", "Ẩn lời giải");
  explanationHeading.append(closeExplanation);
  const explanationCopy = element("div", "review-explanation-copy");
  explanationCopy.dataset.testid = "review-explanation-scroll";
  explanationPane.append(explanationHeading, explanationCopy);
  workspace.append(questionPane, divider, explanationPane);

  const footer = element("footer", "review-footer");
  footer.dataset.testid = "review-footer";
  let filtered = state.review.slots;
  let current = 0;
  const previous = actionButton("← Trước", "review-prev", () => { current--; draw(); }, "button secondary small review-step");
  previous.setAttribute("aria-label", "Câu trước");
  const counter = element("span", "review-counter review-counter-chip");
  counter.dataset.testid = "review-counter";
  counter.setAttribute("role", "status");
  const next = actionButton("Tiếp →", "review-next", () => { current++; draw(); }, "button secondary small review-step");
  next.setAttribute("aria-label", "Câu tiếp theo");
  const returnButton = actionButton("Kết quả", "back-score", () => {
    state.review = null;
    renderResult(state.attempt.result);
    app.querySelector("#result-title")?.focus();
  }, "button back-score");
  returnButton.setAttribute("aria-label", "Quay lại kết quả");
  footer.append(previous, counter, next, returnButton);

  let currentReleased = null;
  function setExplanationOpen(open) {
    const isOpen = Boolean(open && currentReleased);
    explanationDetails.open = isOpen;
    explanationPane.hidden = !isOpen;
    divider.hidden = !isOpen;
    workspace.classList.toggle("is-open", isOpen);
    explanationToggle.tabIndex = currentReleased === null ? -1 : 0;
    explanationToggle.setAttribute("aria-disabled", String(currentReleased === null));
    explanationToggle.setAttribute("aria-expanded", String(isOpen));
    explanationToggle.textContent = isOpen ? "Ẩn lời giải" : "Xem lời giải";
  }

  explanationDetails.addEventListener("toggle", () => {
    setExplanationOpen(explanationDetails.open);
  });
  function draw() {
    content.replaceChildren();
    currentReleased = filtered[current] ?? null;
    previous.disabled = current <= 0;
    next.disabled = current >= filtered.length - 1;
    counter.textContent = filtered.length ? `${current + 1} / ${filtered.length}` : "0 / 0";
    position.textContent = currentReleased ? `Câu ${currentReleased.ordinal}` : "Không có câu";
    if (!currentReleased) {
      explanationCopy.replaceChildren();
      content.append(element("p", "notice-panel", "Không có câu nào trong bộ lọc này."));
      setExplanationOpen(false);
      return;
    }
    content.append(releasedQuestionCard(currentReleased, { includeExplanation: false }));
    const simpleExplanation = currentReleased.explanation.every((block) => block.type === "text");
    const explanationContent = simpleExplanation
      ? element("p", "review-explanation", contentText(currentReleased.explanation))
      : renderContentBlocks(currentReleased.explanation);
    if (!simpleExplanation) explanationContent.classList.add("review-explanation");
    explanationCopy.replaceChildren(explanationContent);
    setExplanationOpen(false);
  }
  for (const [key, label] of [["all", "Tất cả"], ["incorrect", "Sai / bỏ trống"]]) {
    const control = actionButton(label, `review-filter-${key}`, () => {
      filtered = state.review.slots.filter(slot => key === "all" || releasedAnswerStatus(slot) !== "Đúng");
      current = 0;
      for (const button of filterGroup.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button === control));
      draw();
    }, "button secondary small review-filter");
    control.setAttribute("aria-pressed", String(key === "all"));
    filterGroup.append(control);
  }
  draw();
  shell.append(headerBar, toolbar, workspace, footer);
  fragment.append(shell);
  replaceApp(fragment, { reviewMode: true });
}

function renderFatal(error) {
  clearTimer();
  const card = element("section", "screen-error");
  card.append(element("p", "eyebrow", "PHIÊN DEMO"));
  card.append(element("h1", "", "Chưa mở được bài luyện tập."));
  card.append(element("p", "", error?.message || "Hãy kiểm tra máy chủ demo cục bộ rồi tải lại trang."));
  card.append(actionButton("Thử lại", "retry", () => { void initialize(); }, "button"));
  replaceApp(card);
  announce("Chưa mở được bài luyện tập. Hãy thử lại.");
}

function renderPersistentLogin(message = "Chọn một hồ sơ kiểm thử tổng hợp để đăng nhập vào PostgreSQL cục bộ.", { forbidden = false } = {}) {
  stopGradePolling();
  clearTimer();
  const card = element("section", "intro-card persistent-login-card");
  card.dataset.testid = "persistent-login";
  card.append(element("p", "eyebrow", "LOCAL POSTGRESQL · HỒ SƠ TỔNG HỢP"));
  const title = element("h1", "intro-title", "Đăng nhập có chủ đích.");
  title.tabIndex = -1;
  card.append(title);
  card.append(element("p", "intro-lead", "Chế độ này dùng tài khoản kiểm thử cục bộ, dữ liệu luyện tập không chính thức và đồng hồ do máy chủ quản lý. Chưa có tài khoản nào được chọn tự động."));
  const notice = element("p", "notice-panel", message);
  notice.dataset.testid = "persistent-login-message";
  card.append(notice);
  if (forbidden) {
    card.append(element("p", "", "Phiên hiện tại không phải hồ sơ học viên. Đăng xuất trước khi chọn một hồ sơ kiểm thử."));
    card.append(actionButton("Đăng xuất khỏi phiên hiện tại", "persistent-logout", logoutPersistentCandidate, "button"));
  } else {
    const actions = element("div", "intro-actions");
    for (const [actorKey, label] of [["studentA", "Đăng nhập hồ sơ tổng hợp A"], ["studentB", "Đăng nhập hồ sơ tổng hợp B"]]) {
      actions.append(actionButton(label, `persistent-login-${actorKey}`, () => loginPersistentCandidate(actorKey), "button secondary"));
    }
    card.append(actions);
  }
  card.append(element("p", "footer-note", "Chỉ dùng dữ liệu tổng hợp cục bộ. Đây không phải tài khoản thật hay dịch vụ chính thức."));
  replaceApp(card, { introMode: true });
  app.querySelector("h1")?.focus();
}

function renderPersistentLoading() {
  const status = element("p", "notice-panel", "Đang đọc phiên PostgreSQL cục bộ…");
  status.setAttribute("role", "status");
  replaceApp(status);
}

function handlePersistentError(error) {
  if (!persistentMode) return false;
  const code = error?.code;
  const status = error?.status;
  const hadPending = hasUnacknowledgedChanges();
  if (code === "UNAUTHENTICATED" || status === 401) {
    resetPersistentIdentity();
    clearAttemptState();
    renderPersistentLogin(`Đăng nhập vào hồ sơ tổng hợp để mở danh mục và bài đã lưu.${hadPending ? " Thay đổi chưa được xác nhận trong tab này đã không được gửi đi." : ""}`);
    return true;
  }
  if (code === "FORBIDDEN" || status === 403) {
    resetPersistentIdentity();
    clearAttemptState();
    renderPersistentLogin(`Phiên hiện tại không có quyền truy cập danh mục học viên.${hadPending ? " Thay đổi chưa được xác nhận trong tab này đã không được gửi đi." : ""}`, { forbidden: true });
    return true;
  }
  if (["CONTENT_WITHDRAWN", "ATTEMPT_INVALIDATED", "FORM_UNAVAILABLE"].includes(code) || status === 410) {
    resetPersistentIdentity();
    clearAttemptState();
    renderPersistentBlocked(`Máy chủ đã khóa nội dung bài này. Không có câu hỏi hay đáp án nào được giữ trên màn hình.${hadPending ? " Thay đổi chưa được xác nhận trong tab này đã không được gửi đi." : ""}`);
    return true;
  }
  return false;
}

async function loginPersistentCandidate(actorKey) {
  if (state.busy) return;
  resetPersistentIdentity();
  const identityGeneration = state.identityGeneration;
  state.busy = true;
  for (const button of app.querySelectorAll("button")) button.disabled = true;
  try {
    await api.loginCandidate(actorKey);
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    await initializePersistent();
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (!handlePersistentError(error)) renderPersistentLogin(error.message || "Chưa đăng nhập được hồ sơ tổng hợp.");
  }
}

async function logoutPersistentCandidate() {
  if (state.busy && state.reviewIntent === null) return;
  resetPersistentIdentity();
  const identityGeneration = state.identityGeneration;
  state.busy = true;
  clearAttemptState();
  state.busy = true;
  renderPersistentLoading();
  try {
    await api.logout();
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    renderPersistentLogin("Đã đăng xuất. Chọn rõ một hồ sơ tổng hợp để tiếp tục.");
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    state.busy = false;
    if (!handlePersistentError(error)) renderPersistentLogin(error.message || "Chưa đăng xuất được phiên hiện tại.", { forbidden: true });
  }
}

async function initializePersistent() {
  resetPersistentIdentity();
  const identityGeneration = state.identityGeneration;
  clearAttemptState();
  renderPersistentLoading();
  try {
    const session = await api.openDemoSession();
    if (identityGeneration !== state.identityGeneration) return;
    const data = await api.loadCatalog();
    if (identityGeneration !== state.identityGeneration) return;
    state.catalog = data.domains;
    try {
      const history = await api.loadHistory();
      if (identityGeneration !== state.identityGeneration) return;
      state.history = history;
      state.historyStatus = "";
    } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
      if (handlePersistentError(error)) return;
      state.history = [];
      state.historyStatus = "Lịch sử chưa tải được. Các bài hiện có vẫn được lưu trên máy chủ.";
    }
    if (session.attempt) {
      state.resumeNotice = "Đã khôi phục bài gần nhất từ PostgreSQL cục bộ";
      acceptAttempt(session.attempt);
    } else {
      state.resumeNotice = "";
      renderCatalog();
    }
  } catch (error) {
    if (identityGeneration !== state.identityGeneration) return;
    if (handlePersistentError(error)) return;
    renderPersistentBlocked(error.message || "Chưa tải được danh mục từ PostgreSQL cục bộ.");
  }
}

async function initialize() {
  if (persistentMode) {
    await initializePersistent();
    return;
  }
  try {
    const session = await api.openDemoSession();
    const data = await api.loadCatalog();
    state.catalog = data.domains;
    if (session.attempt?.state === "IN_PROGRESS" || session.attempt?.state === "GRADED") {
      state.resumeNotice = "Đã tiếp tục phiên demo";
      acceptAttempt(session.attempt);
    } else {
      renderLanding();
    }
  } catch (error) {
    renderFatal(error);
  }
}

void initialize();
window.addEventListener("beforeunload", (event) => {
  if (!hasUnacknowledgedChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});
