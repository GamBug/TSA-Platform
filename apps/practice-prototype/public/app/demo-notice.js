// Visible notice for the practice prototype. Every string is rendered with textContent.
const SCHEMA_VERSION = 'demo-notice/1';
const NOTICE_URL = '/local/demo-notice';
const CONTENT_MODES = new Set(['PUBLISHED', 'REHEARSAL']);
const MAX_CREDIT_LENGTH = 500;

const COPY = {
  vi: {
    label: 'Thông tin về trang luyện tập',
    unofficial: 'Luyện tập không chính thức — không liên kết với Đại học Bách khoa Hà Nội (HUST).',
    nonprofit: 'Dự án phi lợi nhuận: không quảng cáo, không thu phí.',
    source: 'Nguồn nội dung: ',
    rehearsal: 'DIỄN TẬP · NỘI DUNG TỔNG HỢP',
  },
  en: {
    label: 'About this practice site',
    unofficial: 'Unofficial practice — not affiliated with HUST.',
    nonprofit: 'Non-profit project: no ads, no fees.',
    source: 'Content source: ',
    rehearsal: 'REHEARSAL · SYNTHETIC CONTENT',
  },
};

let noticePromise = null;

function isRecord(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isCredit(value) {
  if (typeof value !== 'string') return false;
  const length = value.trim().length;
  return length >= 1 && length <= MAX_CREDIT_LENGTH;
}

export function parseDemoNotice(value) {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) return null;
  const { contentMode, sourceCredit } = value;
  if (!CONTENT_MODES.has(contentMode) || !isRecord(sourceCredit)) return null;
  if (!isCredit(sourceCredit.vi) || !isCredit(sourceCredit.en)) return null;
  return Object.freeze({
    contentMode,
    sourceCredit: Object.freeze({ vi: sourceCredit.vi, en: sourceCredit.en }),
  });
}

async function fetchDemoNotice(fetchImpl) {
  try {
    const response = await fetchImpl(NOTICE_URL, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    return parseDemoNotice(await response.json());
  } catch {
    return null;
  }
}

export function loadDemoNotice({ fetchImpl = globalThis.fetch } = {}) {
  noticePromise ??= fetchDemoNotice(fetchImpl);
  return noticePromise;
}

export function resetDemoNoticeCache() {
  noticePromise = null;
}

function listItem(testid, text) {
  const node = document.createElement('li');
  node.dataset.testid = testid;
  node.textContent = text;
  return node;
}

export function renderDemoNotice({ language = 'vi', notice = loadDemoNotice() } = {}) {
  const en = language === 'en';
  const copy = en ? COPY.en : COPY.vi;
  const aside = document.createElement('aside');
  aside.className = 'demo-notice';
  aside.dataset.testid = 'demo-notice';
  aside.setAttribute('aria-label', copy.label);
  // Shown only where the server supplies a notice, so other local workspaces are unchanged.
  aside.hidden = true;
  const list = document.createElement('ul');
  list.append(listItem('demo-notice-unofficial', copy.unofficial), listItem('demo-notice-nonprofit', copy.nonprofit));
  aside.append(list);

  const apply = (parsed) => {
    if (parsed === null) return;
    aside.hidden = false;
    list.append(listItem('demo-notice-source', copy.source + (en ? parsed.sourceCredit.en : parsed.sourceCredit.vi)));
    if (parsed.contentMode !== 'REHEARSAL') return;
    aside.classList.add('demo-notice--rehearsal');
    const mode = document.createElement('strong');
    mode.dataset.testid = 'demo-notice-mode';
    mode.textContent = copy.rehearsal;
    aside.prepend(mode);
  };

  if (notice !== null && typeof notice?.then === 'function') {
    Promise.resolve(notice).then(apply, () => {});
  } else {
    apply(notice);
  }
  return aside;
}
