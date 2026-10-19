let sessionOpened = false;

const studentErrorMessages = {
  PAYLOAD_TOO_LARGE: "Yêu cầu vượt quá dung lượng cho phép của bản demo.",
  MALFORMED_JSON: "Yêu cầu chưa đúng định dạng. Hãy thử lại.",
  VALIDATION_ERROR: "Thông tin gửi lên chưa hợp lệ. Hãy kiểm tra lựa chọn rồi thử lại.",
  CONTENT_UNAVAILABLE: "Nội dung demo cho lĩnh vực này hiện chưa sẵn sàng.",
  SESSION_REQUIRED: "Phiên demo chưa sẵn sàng. Hãy tải lại trang để bắt đầu phiên mới.",
  NOT_FOUND: "Không tìm thấy phiên demo này. Hãy tải lại trang để bắt đầu phiên mới.",
  ATTEMPT_CLOSED: "Phiên demo đã kết thúc nên không thể thay đổi lựa chọn.",
  REVIEW_NOT_AVAILABLE: "Phần ôn tập chỉ mở sau khi phiên demo đã được chấm.",
  INTERNAL_ERROR: "Máy chủ demo chưa thể hoàn tất yêu cầu. Hãy thử lại.",
};

async function request(path, { method = "GET", body } = {}) {
  const headers = body === undefined ? {} : { "Content-Type": "application/json" };
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new Error("Không thể kết nối với máy chủ demo cục bộ. Hãy kiểm tra máy chủ rồi thử lại.");
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error("Máy chủ demo trả về dữ liệu không đọc được.");
  }
  if (!response.ok) {
    const error = new Error(studentErrorMessages[value?.error?.code] ?? "Yêu cầu chưa hoàn tất. Hãy thử lại.");
    error.code = value?.error?.code ?? "REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }
  return value;
}

export async function openDemoSession() {
  const snapshot = await request("/mock/session", { method: "POST" });
  sessionOpened = true;
  return snapshot;
}

export async function loadCatalog() {
  return request("/mock/catalog");
}

function requireSession() {
  if (!sessionOpened) throw new Error("Phiên demo chưa sẵn sàng. Hãy tải lại trang để bắt đầu phiên mới.");
}

export async function startDemo(domain = "MATH") {
  requireSession();
  return request("/mock/attempts", { method: "POST", body: { domain } });
}

export async function readAttempt(attemptId) {
  requireSession();
  return request(`/mock/attempts/${encodeURIComponent(attemptId)}`);
}

export async function readReview(attemptId) {
  requireSession();
  return request(`/mock/attempts/${encodeURIComponent(attemptId)}/review`);
}

export async function saveAnswer(attemptId, slotId, optionId) {
  requireSession();
  return request(`/mock/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(slotId)}`, {
    method: "PUT",
    body: { optionId },
  });
}

export async function submitAttempt(attemptId) {
  requireSession();
  return request(`/mock/attempts/${encodeURIComponent(attemptId)}/submit`, { method: "POST", body: {} });
}

export async function cancelAttempt(attemptId) {
  requireSession();
  return request(`/mock/attempts/${encodeURIComponent(attemptId)}/cancel`, { method: "POST", body: {} });
}
