import * as api from "./api.js";
import { openStaffWorkspace } from "./staff.js";

const app = document.querySelector("#app");
const announcements = document.querySelector("#announcements");

const domainNames = { MATH: "Toán học", READING: "Đọc hiểu", SCIENCE: "Khoa học" };
const state = {
  catalog: [],
  attempt: null,
  review: null,
  resumeNotice: "",
  currentIndex: 0,
  savingSlotId: null,
  busy: false,
  clockAttemptId: null,
  clockDeadlineMs: 0,
  nextExpiryCheckAt: 0,
  timerHandle: null,
  warningSent: false,
  checkingExpiry: false,
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
  const current = app.querySelector("[data-testid='screen-message']");
  const messageNode = current ?? element("p", tone);
  messageNode.dataset.testid = "screen-message";
  messageNode.textContent = message;
  if (current === null) app.prepend(messageNode);
  announce(message);
}

function setTimer(value) {
  const timer = app.querySelector("[data-testid='timer']");
  if (timer) timer.textContent = value;
}

function clearTimer() {
  if (state.timerHandle !== null) window.clearInterval(state.timerHandle);
  state.timerHandle = null;
  state.checkingExpiry = false;
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
  if (state.checkingExpiry || state.attempt === null) return;
  state.checkingExpiry = true;
  try {
    const data = await api.readAttempt(state.attempt.attemptId);
    if (data.attempt.state === "IN_PROGRESS") {
      startTimer(data.attempt, true);
      return;
    }
    acceptAttempt(data.attempt);
  } catch {
    showMessage("Chưa kiểm tra được trạng thái thời gian. Đang giữ nguyên câu trả lời đã ghi nhận.");
    state.nextExpiryCheckAt = performance.now() + 2000;
  } finally {
    state.checkingExpiry = false;
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

function clearAttemptState() {
  clearTimer();
  state.attempt = null;
  state.clockAttemptId = null;
  state.currentIndex = 0;
  state.savingSlotId = null;
  state.busy = false;
  state.review = null;
  state.resumeNotice = "";
}

function acceptAttempt(attempt) {
  state.attempt = attempt;
  if (attempt.state === "IN_PROGRESS") {
    startTimer(attempt);
    renderExam();
    return;
  }
  state.savingSlotId = null;
  state.busy = false;
  clearTimer();
  if (attempt.state === "GRADED" && attempt.result) {
    renderResult(attempt.result);
    return;
  }
  clearAttemptState();
  renderCatalog();
}

function resumeNotice() {
  if (!state.resumeNotice) return null;
  const notice = element("p", "resume-notice", state.resumeNotice);
  notice.dataset.testid = "resume-notice";
  notice.setAttribute("role", "status");
  return notice;
}

function header() {
  const topbar = element("header", "topbar");
  const brand = element("div", "brand");
  brand.append(element("span", "brand-mark", "P"));
  brand.append(element("span", "brand-name", "PHÒNG LUYỆN TẬP"));
  topbar.append(brand, element("span", "demo-chip", "BẢN DEMO"));
  return topbar;
}

function footerNote() {
  return element("p", "footer-note", "Phiên minh họa chạy cục bộ, dùng dữ liệu kiểm thử lặp lại; không phải dịch vụ thi thật, không có tài khoản hay lưu trữ bền vững.");
}

function renderLanding() {
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const hero = element("section", "hero");
  const copy = element("div");
  copy.append(element("p", "eyebrow", "LUYỆN TẬP THEO TỪNG LĨNH VỰC"));
  copy.append(element("h1", "", "Mỗi lượt luyện tập. Một bước tiến."));
  copy.append(element("p", "hero-copy", "Làm quen với nhịp luyện tập ngắn, tập trung và dễ theo dõi. Phiên demo này minh họa thao tác làm bài; nội dung chưa phải học liệu đã duyệt."));
  const actions = element("div", "hero-actions");
  actions.append(actionButton("Chọn bài luyện tập", "catalog-open", () => renderCatalog(), "button primary-light"));
  actions.append(actionButton("Không gian bản nháp cục bộ", "staff-open", () => openStaffWorkspace(app, renderLanding), "button secondary staff-launch"));
  actions.append(element("span", "", "Một bài một lần · Có đồng hồ demo"));
  copy.append(actions);
  const art = element("div", "hero-art");
  art.append(element("div", "hero-orbit"));
  const card = element("div", "hero-card");
  card.append(element("span", "mini-label", "PHIÊN TẬP TRUNG"));
  card.append(element("div", "mini-line"), element("div", "mini-line short"));
  card.append(element("span", "mini-check", "✓"));
  art.append(card);
  hero.append(copy, art);
  fragment.append(hero);

  const trust = element("section", "trust-row");
  for (const [icon, title, detail] of [
    ["01", "Từng bước rõ ràng", "Biết mình đang ở vị trí nào và đã trả lời bao nhiêu."],
    ["02", "Thời gian dễ theo dõi", "Đồng hồ chỉ dành cho bài demo sáu phút này."],
    ["03", "Minh bạch dữ liệu", "Bốn vị trí dùng cùng một câu hỏi kiểm thử lặp lại."],
  ]) {
    const item = element("div", "trust-item");
    item.append(element("span", "trust-icon", icon));
    const text = element("div");
    text.append(element("strong", "", title), element("span", "", detail));
    item.append(text);
    trust.append(item);
  }
  fragment.append(trust, footerNote());
  app.replaceChildren(fragment);
}

function domainCard(domain) {
  const card = element("article", domain.available ? "domain-card available" : "domain-card");
  const index = domain.domain === "MATH" ? "01" : domain.domain === "READING" ? "02" : "03";
  card.append(element("span", "domain-index", index));
  card.append(element("h2", "", domainNames[domain.domain]));
  card.append(element("p", "domain-meta", `${domain.questionCount} vị trí · ${domain.durationSeconds / 60} phút${domain.available ? " (thời lượng demo)" : ""}`));
  if (domain.available) {
    card.append(element("p", "repeat-note", "4 vị trí lặp lại cùng dữ liệu kiểm thử; không phải đề TSA/học liệu đã duyệt."));
    const completed = state.attempt?.state === "GRADED";
    const startLabel = completed ? "Bắt đầu lượt demo mới" : state.attempt?.state === "IN_PROGRESS" ? "Tiếp tục bài demo" : "Bắt đầu bài demo";
    card.append(actionButton(startLabel, "demo-start", startDemo, "button"));
    const start = card.querySelector("[data-testid='demo-start']");
    start.disabled = state.busy;
  } else {
    card.append(element("p", "repeat-note", "Nội dung demo chưa được chuẩn bị cho lĩnh vực này."));
    const disabled = element("button", "coming-soon", "Chưa có nội dung demo");
    disabled.type = "button";
    disabled.disabled = true;
    card.append(disabled);
  }
  return card;
}

function renderCatalog() {
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const heading = element("section", "page-heading");
  const headingText = element("div");
  headingText.append(element("p", "eyebrow", "CHỌN MỘT LĨNH VỰC"));
  headingText.append(element("h1", "", "Bắt đầu từ đây."));
  headingText.append(element("p", "", "Mỗi lĩnh vực là một bài luyện tập riêng. Trong bản demo chỉ có một bài Toán học với dữ liệu kiểm thử lặp lại; các mục còn lại đang tắt."));
  heading.append(headingText, actionButton("Về trang đầu", "home", () => renderLanding(), "button secondary"));
  fragment.append(heading);
  const grid = element("div", "catalog-grid");
  for (const domain of state.catalog) grid.append(domainCard(domain));
  fragment.append(grid);
  fragment.append(element("p", "demo-disclaimer", "Đây là bản demo giao diện với phiên trong bộ nhớ. Không có tài khoản thật, cơ sở dữ liệu, phân bổ câu hỏi mới, hoặc cam kết lưu dữ liệu sau khi dừng máy chủ."));
  const staffCallout = element("section", "staff-callout");
  staffCallout.append(element("div", "", "Không gian nhân viên cục bộ"));
  staffCallout.append(element("p", "", "Một khu riêng dùng vai trò tổng hợp và PostgreSQL cục bộ để soạn bản nháp. Không kết nối với phiên luyện tập demo."));
  staffCallout.append(actionButton("Mở không gian bản nháp", "staff-open", () => openStaffWorkspace(app, renderLanding), "button secondary"));
  fragment.append(staffCallout);
  fragment.append(footerNote());
  app.replaceChildren(fragment);
}

async function startDemo() {
  if (state.busy) return;
  state.busy = true;
  renderCatalog();
  try {
    const response = await api.startDemo("MATH");
    state.busy = false;
    state.resumeNotice = response.resumed ? "Đã tiếp tục phiên demo" : "";
    state.review = null;
    state.currentIndex = 0;
    acceptAttempt(response.attempt);
  } catch (error) {
    state.busy = false;
    renderCatalog();
    showMessage(error.message || "Không thể bắt đầu phiên demo.");
  }
}

function selectedOption(slotId) {
  return state.attempt.answers.find((answer) => answer.slotId === slotId)?.optionId ?? null;
}

function renderOptions(question, saving) {
  const list = element("div", "option-list");
  for (const option of question.interaction.options) {
    const label = element("label", `option${selectedOption(question.slotId) === option.id ? " selected" : ""}`);
    const input = element("input");
    input.type = "radio";
    input.name = `answer-${question.slotId}`;
    input.value = option.id;
    input.checked = selectedOption(question.slotId) === option.id;
    input.disabled = saving || state.busy;
    input.dataset.testid = `option-${option.id}`;
    input.addEventListener("change", () => { void saveSelectedOption(question.slotId, option.id, `option-${option.id}`); });
    const letter = element("span", "option-letter", option.id.toUpperCase());
    const text = element("span", "option-text", option.content.map((block) => block.text ?? "").join(" "));
    label.append(input, letter, text);
    list.append(label);
  }
  return list;
}

function updateSaveStatus(message, kind = "") {
  const row = app.querySelector("[data-testid='save-status']");
  if (!row) return;
  row.className = `save-row${kind ? ` ${kind}` : ""}`;
  row.replaceChildren(element("span", "save-dot"), element("span", "", message));
}

async function saveSelectedOption(slotId, optionId, restoreFocusTestId) {
  if (state.busy || state.savingSlotId !== null) return;
  state.savingSlotId = slotId;
  const attemptId = state.attempt.attemptId;
  const options = app.querySelectorAll("input[type='radio']");
  for (const input of options) input.disabled = true;
  for (const control of app.querySelectorAll(
    ".question-nav button, [data-testid='question-prev'], [data-testid='question-next'], [data-testid='submit-open'], [data-testid='cancel-open'], [data-testid='clear-answer']",
  )) control.disabled = true;
  updateSaveStatus("Đang ghi nhớ lựa chọn…");
  try {
    const response = await api.saveAnswer(attemptId, slotId, optionId);
    if (state.attempt?.attemptId !== attemptId || state.attempt.state !== "IN_PROGRESS") return;
    state.attempt = response.attempt;
    state.savingSlotId = null;
    if (response.attempt.state !== "IN_PROGRESS") {
      acceptAttempt(response.attempt);
      return;
    }
    renderExam();
    updateSaveStatus(response.message, "saved");
    announce(response.message);
    app.querySelector(`[data-testid='${restoreFocusTestId}']`)?.focus();
  } catch (error) {
    if (state.attempt?.attemptId !== attemptId || state.attempt.state !== "IN_PROGRESS") return;
    state.savingSlotId = null;
    renderExam();
    updateSaveStatus(error.message || "Lựa chọn chưa được ghi nhận.", "error");
    announce(error.message || "Lựa chọn chưa được ghi nhận.");
    app.querySelector(`[data-testid='${restoreFocusTestId}']`)?.focus();
  }
}

function appendDialog(parent, { id, title, body, cancelTestId, cancelText, confirmTestId, confirmText, confirmAction, danger = false }) {
  const dialog = element("dialog");
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
  actions.append(cancel, confirm);
  dialog.append(actions);
  parent.append(dialog);
  return dialog;
}

function openDialog(id) {
  if (state.busy || state.savingSlotId !== null) return;
  const dialog = app.querySelector(`#${id}`);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

function renderExam() {
  if (state.attempt === null) return;
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const restored = resumeNotice();
  if (restored) fragment.append(restored);
  const examHeader = element("div", "exam-header");
  const examTitle = element("div", "exam-title");
  examTitle.append(element("p", "eyebrow", "PHIÊN LUYỆN TẬP ĐỘC LẬP"));
  examTitle.append(element("h1", "", "Toán học · bài demo"));
  examTitle.append(element("p", "", "Thời lượng sáu phút chỉ dùng trong bản minh họa này."));
  const timerCard = element("div", "timer-card");
  timerCard.append(element("span", "", "Còn lại"));
  const timer = element("strong", "", "06:00");
  timer.dataset.testid = "timer";
  timer.setAttribute("aria-live", "off");
  timerCard.append(timer);
  examHeader.append(examTitle, timerCard);
  fragment.append(examHeader);
  const repeatAlert = element("p", "repeat-alert", state.attempt.repeatNotice);
  fragment.append(repeatAlert);

  const layout = element("div", "exam-layout");
  const sidebar = element("aside", "exam-sidebar");
  const answeredCount = state.attempt.answeredCount;
  const sidebarHeading = element("div", "sidebar-heading");
  sidebarHeading.append(element("strong", "", "Vị trí trong bài"));
  const answeredText = element("span", "", `Đã trả lời ${answeredCount}/${state.attempt.slots.length}`);
  answeredText.dataset.testid = "answered-count";
  sidebarHeading.append(answeredText);
  sidebar.append(sidebarHeading);
  const nav = element("nav", "question-nav");
  nav.setAttribute("aria-label", "Chọn vị trí câu hỏi");
  state.attempt.slots.forEach((slot, index) => {
    const button = element("button", selectedOption(slot.slotId) === null ? "" : "answered", String(slot.ordinal));
    button.type = "button";
    button.dataset.testid = `question-nav-${slot.ordinal}`;
    button.disabled = state.busy || state.savingSlotId !== null;
    if (index === state.currentIndex) button.setAttribute("aria-current", "step");
    button.setAttribute("aria-label", `Đi đến vị trí ${slot.ordinal}${selectedOption(slot.slotId) === null ? " chưa trả lời" : " đã trả lời"}`);
    button.addEventListener("click", () => navigateTo(index));
    nav.append(button);
  });
  sidebar.append(nav);
  const progress = element("div", "progress-track");
  progress.setAttribute("aria-hidden", "true");
  const fill = element("div", "progress-fill");
  fill.style.width = `${(answeredCount / state.attempt.slots.length) * 100}%`;
  progress.append(fill);
  sidebar.append(progress, element("p", "sidebar-caption", "Có thể chuyển vị trí bất cứ lúc nào. Câu chưa trả lời được tính là sai trong kết quả demo."));

  const question = state.attempt.slots[state.currentIndex];
  const card = element("section", "question-card");
  card.setAttribute("aria-labelledby", "question-title");
  card.append(element("p", "question-kicker", `VỊ TRÍ ${question.ordinal} / ${state.attempt.slots.length}`));
  const title = element("h2", "", question.content.map((block) => block.text ?? "").join(" "));
  title.id = "question-title";
  title.tabIndex = -1;
  card.append(title, renderOptions(question, state.savingSlotId === question.slotId));
  const saveRow = element("div", "save-row");
  saveRow.dataset.testid = "save-status";
  const saved = selectedOption(question.slotId) !== null;
  saveRow.classList.toggle("saved", saved);
  saveRow.append(element("span", "save-dot"), element("span", "", saved ? "Đã ghi nhớ trong phiên demo" : "Chưa chọn đáp án"));
  saveRow.setAttribute("role", "status");
  saveRow.setAttribute("aria-live", "polite");
  card.append(saveRow);
  const selected = selectedOption(question.slotId);
  const clear = actionButton("Xóa lựa chọn", "clear-answer", () => {
    if (selected !== null) void saveSelectedOption(question.slotId, null, `option-${selected}`);
  }, "text-button clear-answer");
  clear.disabled = selected === null || state.busy || state.savingSlotId !== null;
  clear.setAttribute("aria-label", "Xóa lựa chọn đã ghi nhận cho vị trí hiện tại");
  card.append(clear);
  layout.append(sidebar, card);
  fragment.append(layout);

  const footer = element("div", "exam-footer");
  const previous = actionButton("← Trước", "question-prev", () => navigateTo(Math.max(0, state.currentIndex - 1)), "button secondary small");
  previous.disabled = state.currentIndex === 0 || state.busy || state.savingSlotId !== null;
  const footerActions = element("div", "footer-actions");
  const next = actionButton("Tiếp →", "question-next", () => navigateTo(Math.min(state.attempt.slots.length - 1, state.currentIndex + 1)), "button secondary small");
  next.disabled = state.currentIndex === state.attempt.slots.length - 1 || state.busy || state.savingSlotId !== null;
  const cancelOpen = actionButton("Kết thúc", "cancel-open", () => openDialog("cancel-dialog"), "button secondary small");
  const submitOpen = actionButton("Nộp bài", "submit-open", () => openDialog("submit-dialog"), "button small");
  cancelOpen.disabled = state.busy || state.savingSlotId !== null;
  submitOpen.disabled = state.busy || state.savingSlotId !== null;
  footerActions.append(next, cancelOpen, submitOpen);
  footer.append(previous, footerActions);
  fragment.append(footer, footerNote());

  const answered = state.attempt.answeredCount;
  const summary = element("div", "submit-summary");
  summary.append(element("p", "", `Đã trả lời ${answered} trên ${state.attempt.slots.length} vị trí. Vị trí còn trống sẽ được tính là sai trong kết quả minh họa.`));
  const summaryList = element("ul", "submit-summary-list");
  for (const slot of state.attempt.slots) {
    const hasAnswer = selectedOption(slot.slotId) !== null;
    const item = element("li", hasAnswer ? "answered" : "unanswered");
    item.append(element("strong", "", `Vị trí ${slot.ordinal}`));
    item.append(element("span", "", hasAnswer ? "Đã trả lời" : "Chưa trả lời"));
    summaryList.append(item);
  }
  summary.append(summaryList);
  appendDialog(fragment, {
    id: "submit-dialog",
    title: "Nộp bài luyện tập?",
    body: summary,
    cancelTestId: "submit-cancel",
    cancelText: "Tiếp tục làm",
    confirmTestId: "submit-confirm",
    confirmText: "Xác nhận nộp",
    confirmAction: submitCurrentAttempt,
  });
  appendDialog(fragment, {
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
  app.replaceChildren(fragment);
  tick();
}

function navigateTo(index) {
  if (state.attempt === null || state.busy || state.savingSlotId !== null) return;
  state.currentIndex = Math.max(0, Math.min(index, state.attempt.slots.length - 1));
  renderExam();
  app.querySelector("#question-title")?.focus();
}

async function submitCurrentAttempt() {
  if (state.attempt === null || state.busy || state.savingSlotId !== null) return;
  state.busy = true;
  try {
    const response = await api.submitAttempt(state.attempt.attemptId);
    state.busy = false;
    acceptAttempt(response.attempt);
  } catch (error) {
    state.busy = false;
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

function renderResult(result) {
  clearTimer();
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const restored = resumeNotice();
  if (restored) fragment.append(restored);
  const card = element("section", "result-card");
  card.dataset.testid = "result";
  card.append(element("span", "result-mark", "✓"));
  card.append(element("p", "eyebrow", "PHIÊN DEMO ĐÃ KHÉP LẠI"));
  const title = element("h1", "", "Bạn đã hoàn thành.");
  title.id = "result-title";
  title.tabIndex = -1;
  card.append(title);
  card.append(element("p", "", result.label));
  const score = element("div", "result-score");
  score.append(element("strong", "score-number", `${result.correctCount}/${result.totalCount}`));
  const scoreCopy = element("div", "score-copy");
  scoreCopy.append(element("strong", "", `${result.percentage}%`));
  scoreCopy.append(element("span", "", "Kết quả thực hành minh họa"));
  score.append(scoreCopy);
  card.append(score);
  card.append(element("p", "result-note", "Đây là phép chấm kiểm thử cho bốn vị trí lặp lại. Kết quả không phải điểm TSA chính thức và không đại diện cho năng lực ở một đề thi thực tế."));
  card.append(actionButton("Ôn tập đáp án", "review-open", () => { void openReview(); }, "button secondary"));
  card.append(actionButton("Quay lại danh sách", "return-catalog", () => renderCatalog(), "button"));
  fragment.append(card, footerNote());
  app.replaceChildren(fragment);
  announce(`Kết quả minh họa: ${result.correctCount} trên ${result.totalCount}.`);
}

async function openReview() {
  if (state.busy || state.attempt?.state !== "GRADED") return;
  state.busy = true;
  const trigger = app.querySelector("[data-testid='review-open']");
  if (trigger) trigger.disabled = true;
  try {
    const response = await api.readReview(state.attempt.attemptId);
    state.review = response.review;
    state.busy = false;
    renderReview();
    app.querySelector("#review-title")?.focus();
  } catch (error) {
    state.busy = false;
    if (trigger?.isConnected) trigger.disabled = false;
    showMessage(error.message || "Chưa mở được phần ôn tập.");
  }
}

function renderReview() {
  if (state.attempt === null) return renderCatalog();
  if (state.attempt.state !== "GRADED" || state.review === null) return renderResult(state.attempt.result);
  const fragment = document.createDocumentFragment();
  fragment.append(header());
  const restored = resumeNotice();
  if (restored) fragment.append(restored);
  const card = element("section", "review-card");
  card.dataset.testid = "review";
  card.append(element("p", "eyebrow", state.review.label));
  const title = element("h1", "", "Ôn tập sau khi bài demo đã được chấm.");
  title.id = "review-title";
  title.tabIndex = -1;
  card.append(title, element("p", "repeat-alert", state.review.repeatNotice));
  card.append(element("p", "review-disclaimer", "Đáp án và lời giải chỉ được hiển thị sau khi phiên demo đã khép lại. Đây vẫn là dữ liệu kiểm thử lặp lại."));

  for (const released of state.review.slots) {
    const sourceSlot = state.attempt.slots.find((slot) => slot.slotId === released.slotId);
    if (!sourceSlot || sourceSlot.ordinal !== released.ordinal) continue;
    const item = element("article", "review-item");
    item.append(element("p", "question-kicker", `VỊ TRÍ ${released.ordinal} / ${state.attempt.slots.length}`));
    item.append(element("h2", "", sourceSlot.content.map((block) => block.text ?? "").join(" ")));
    const options = element("ul", "review-options");
    for (const option of sourceSlot.interaction.options) {
      const optionRow = element("li", option.id === released.correctOptionId ? "correct" : "");
      optionRow.append(element("span", "option-letter", option.id.toUpperCase()));
      optionRow.append(element("span", "", option.content.map((block) => block.text ?? "").join(" ")));
      if (option.id === released.correctOptionId) optionRow.append(element("strong", "review-correct", "Đáp án đúng"));
      options.append(optionRow);
    }
    item.append(options);
    item.append(element("p", "review-explanation", released.explanation.map((block) => block.text ?? "").join(" ")));
    card.append(item);
  }

  card.append(actionButton("Quay lại kết quả", "back-score", () => {
    state.review = null;
    renderResult(state.attempt.result);
    app.querySelector("#result-title")?.focus();
  }, "button"));
  fragment.append(card, footerNote());
  app.replaceChildren(fragment);
}

function renderFatal(error) {
  clearTimer();
  const card = element("section", "screen-error");
  card.append(element("p", "eyebrow", "PHIÊN DEMO"));
  card.append(element("h1", "", "Chưa mở được bài luyện tập."));
  card.append(element("p", "", error?.message || "Hãy kiểm tra máy chủ demo cục bộ rồi tải lại trang."));
  card.append(actionButton("Thử lại", "retry", () => { void initialize(); }, "button"));
  app.replaceChildren(card);
  announce("Chưa mở được bài luyện tập. Hãy thử lại.");
}

async function initialize() {
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
