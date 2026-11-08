## Final compatible reconstruction accepted — 2026-10-20

IMPLEMENTED/VERIFIED: catalog/detail joins accepted exam/result/review. Final
Chromium155 run PASS26 PNGs/17 layouts/11 check groups at1440x900,768x1024 and
390x844; independent actual Sol reviewer has no unresolved findings. New group
width evidence `catalog-loaded-widths.json` supersedes loading/transient rects: panel
1024px desktop,657.116px tablet,311.814px mobile; local1024px desktop and mobile
326px with native CSS viewport/scrollbar difference documented. No pixel-perfect
claim. Verified original adaptation and test evidence in
[WEB-B0.3](../reviews/WEB_B0_3_VERIFICATION.md).

Removed reference40/20/40 student banner; actual3-domain availability,4-slot6-minute
metadata,3SC+1TF structure and disabled states remain honest. No reference branding,
assets, private history or question content reused. All required screenshot names
01–06 now exist privately and verified; owner catalog/cards and detail1920x1080
images resolve the earlier manual gate. No reference attempts created/submitted.
Remaining live-service and unobserved utility/section-rule dependencies are
explicitly BLOCKED/NOT IMPLEMENTED, not claimed as complete. Earlier checkpoints
below preserve actual failures and manual evidence progression.

---

## Catalog/detail manual evidence gate PASSED — 2026-10-20

Owner supplied two actual reference images: `catalog_cards_owner.png` and
`02_exam_details_desktop.png`, both1920x1080, verified PNG bytes/dimensions/SHA
in private `owner-catalog-details-provenance.json`. Browser banner is included;
these are not exact1440x900 viewport captures. Account area is masked. Detail
history is owner-provided private material and is not transcribed or implemented.
Previous owner uploads showed local TSA Practice; they were correctly excluded
from reference evidence. Current uploads satisfy the catalog/detail visual gate.
No additional reference attempt/start/retry/submission occurred.

VERIFIED: pale grouped catalog panel, three-column desktop ticket cards with red
left strip, white surface/radius16px, title and compact metadata, dashed footer
with detail action. Actual CSS: padding24px/left28px, title18px bold, body16px,
metadata14px, gap20px; grid1 column below768px,2 at768px,3 at1024px. Group count
and reveal-more appear on reference, but local has only3 domains and must not
invent10 exams, duplicate cards or a fake reveal action. Catalog filter controls
and availability come from existing local domain data; this adaptation is INFERRED.

VERIFIED detail: breadcrumb, compact identity/type badge, title24px bold,
count/duration metadata, red primary48px action, structure rows in a white
radius16px card; centered outer max768px, padding24px desktop/tablet and16px
mobile. Reference history is not local demo history. Fresh content-free CSS is in
`detail-current-{1440,768,390}-metrics.json`, `catalog-cards-{1440,768,390}-metrics.json`
and `catalog-card-anatomy.json`. Initial catalog matrix sampled loading rows;
loaded card anatomy was separately confirmed. Later live viewport1429x749 and
animated card transforms mean exact card rects should not be treated as fixed.
Measured CSS/breakpoints, not transient rects, guide implementation.

Ready medium-impact/medium-complexity/low-contract-risk slice: reuse domainCard,
renderCatalog and renderExamIntro; original ticket cards, grouped availability
filter/count, measured detail hierarchy, genuine4-slot/6-minute metadata and
3SC+1TF structure. Remove confusing reference40/20/40 banner from this demo flow;
retain clear synthetic/unofficial warning. Original branding only. No protected
assets, fabricated history, unavailable filters, new endpoints, scoring or lifecycle
changes. Browser tests: filter counts/disabled cards, intro/back/start, 3/2/1 grid,
breadcrumb focus, no overflow at1440/768/390 and full prior exam/review regression.
Native Luna/XHigh owns main/styles; root owns harness/docs; Sol read-only review
follows. Broader task IN_PROGRESS again; screenshot blocker superseded.

---

## Accepted core / continuation screenshot blocker — 2026-10-20

**IMPLEMENTED / VERIFIED:** evidenced exam/result/review reconstruction accepted
locally after final Chromium155 run PASS22 captures,11 layout records and10 check
groups; prototype16, contract106, emitted-consumer11, PostgreSQL staff13 and final
staff browser4 captures PASS. Actual Sol read-only reviewer closed disclosure
IDREF, navigator stale-close and mobile error followups; no unresolved findings.
Details in [WEB-B0.3 verification](../reviews/WEB_B0_3_VERIFICATION.md).

Owner then requested continuation after usage reset. Additional catalog/detail
research was attempted without creating/submitting any external attempt.
Authenticated session remains on `/tests`, TSA filter selected. Minimized native
window was one capture problem: restoring it changed visibility hidden→visible,
but did not resolve surface capture. Normal state and dimensions were set
separately, with viewport1439x900 observed; native catalog capture still timed
out12s. Repeated identical attempts must not continue.

One alternate `fromSurface:false` detail capture succeeded: verified
`exam_details_native_partial.png`,819x729 PNG. It shows upper detail structure,
not a matched desktop image. The immediately preceding viewport reading was
stale during native resize; subsequent actual viewport610x543 is recorded.
Do not label this as a successful1440x900 detail capture. Earlier02 filename was
renamed to avoid that misleading implication. Manifest/provenance updated.
Native catalog capture failed as well; no successful catalog-current PNG claimed.
No OS screenshot utility was available; none installed. Browser/session preserved.

**BLOCKED:** further catalog/detail reconstruction awaits owner manual screenshots
of TSA catalog including cards, and detail/introduction. Do not click Start/Retry
or create another attempt. This is the owner's mandatory screenshot-evidence
gate, not a usage-budget or permission limitation. Core slice is accepted; broader
visual reconstruction is unfinished. Old checkpoints below are historical.

---

## Owner result/review evidence gate — 2026-10-20

**VERIFIED / PASSED:** owner manually submitted the same attempt and supplied
three PNGs followed by DONE. Files exist, PNG dimensions1855x1039 and SHA-256
were verified: `05_results_desktop.png`, `06_review_desktop.png`, and
`review_explanation_owner.png` in ignored/private `tmp/vn-exams-ui-20261020/`.
Provenance/hashes are in `owner-results-provenance.json`. These owner captures
include browser chrome and are not exact1440x900 viewport captures. Earlier
capture failures below are historical and superseded by manual evidence.
Authenticated `/review/[owner-attempt]` remains accessible without a password
form. No new attempt or automated submission occurred. Content-free current
DOM/CSS measurements exist in `review-desktop-metrics.json` and
`review-{1440,768,390}-metrics.json`; result measurements already exist.

VERIFIED visual gaps: result ticket with red top edge, circular raw-result
summary, review action; focused review header, question toolbar and amber
solution toggle; independent question/explanation panes; green released correct
answer presentation. Review header56.74px, toolbar54.23px, footer64.74px,
8px desktop divider; body Be Vietnam Pro16px; correct green rgb(10,119,74),
warm explanation background and amber controls. At md breakpoint reference
uses two columns, below it two minmax(0,1fr) rows. Existing local result/review
baseline is conventional cards with inline disclosure, so this is a structural
gap. Geometry is observed directly, not inferred from screenshots.

P1 ready: reuse existing released mock review data for result ticket and focused
responsive split review. Complexity medium; main/styles only; preserve all
release gates, original fixtures, filters and answer semantics. Browser tests
must cover disclosure, paging, return, mobile overflow and hidden explanations.
Do not copy protected question/explanation content or official scoring/branding.
Unavailable: exact matching viewport result/review screenshots and detail PNG;
no pixel-perfect or full-screen capture-completeness claim. New reference attempt
or external submission is not authorized. Stage2 may proceed on evidenced surfaces.

---

## Implementation checkpoint / result screenshot gate — 2026-10-20

Owner replied `SUBMITTED` after manually submitting the same test attempt.
Authenticated route `/results/[owner-attempt]`, title `Kết quả bài thi | VN Exams`,
no password form, visible review link and result answer/explanation controls
were VERIFIED. No agent submission or additional attempt occurred.

Content-free result geometry/CSS is saved in `results-desktop-metrics.json`.
Both optimized viewport and focused native result screenshots timed out12s.
`05_results_desktop.png` and `06_review_desktop.png` do NOT exist; review navigation
was not executed after capture failure. Session remains open on owner results.
**Results/review reconstruction is PAUSED pending owner manual screenshots.**
Do not retry identical hanging captures or implement these surfaces from old
research. Ask owner for the result screenshot, then their review screenshot.

The independently ready active-exam slice is IMPLEMENTED but final independent
UI review/acceptance is pending. Native Luna builder changed only main.js/styles:
compact60px header, centered688px question content, independent middle scroll,
row-oriented native-radio answers,65px footer, upward nonmodal navigator with
counter toggle/Escape/focus return, and vertical confirmation. Original fixtures,
6-minute clock,4-slot local lifecycle and complete-group counting stay unchanged.

Root added open-licensed local typography, exact font public-file allowlisting,
and browser geometry/interaction checks. Font license/source/hash review passed;
no VN Exams assets/code/content reused. Independent static/font reviewer ran
server tests3/3 and all12 font size/SHA/signature checks PASS; final UI review
has NOT occurred. Browser checks are root-executed, not independent review.

Executed local after-state command:
`B0_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/local-after npm run test:b0:browser`
PASS on Chromium155. Existing clear/save/delayed/offline/partial/reload/resume,
private-release denial, live counts, submit/review, mobile/desktop, automatic
expiry and late-write rejection remain successful. New drawer toggle/Escape/focus,
font readiness, viewport-bottom footer, centered688px toolbar, red submit and
internal horizontal-overflow checks PASS. Matched geometry JSON/screenshot report
is under `local-after/`; desktop/tablet/mobile summaries in
`local-after/geometry-summary.json`. CSS sizes are60px header/65px footer versus
reference59.74/64.74; toolbar matches688px width at x376/y100 (desktop) and
x40/y100 (tablet), compared with reference x376/x40 and y99.74.

Remaining: manual result/review screenshots, final active-exam visual inspection
and independent UI review, required API/contract/staff regressions and coordinated
acceptance. No whole-phase, pixel-perfect or production-readiness claim.

---

## Owner-entered exam evidence and implementation gate — 2026-10-20

**The exam-taking reconstruction evidence gate PASSED.** This supersedes the
pending exam-taking gate immediately below; older checkpoints remain preserved.
Results/review research is pending owner manual submission of this same attempt,
not permission for an automated submit or another attempt.

### Fresh evidence and boundary

- Owner supplied a manual exam screenshot and a second `DONE`, confirming manual
  entry into one TSA test. Saved original `03_exam_taking_desktop.png` verified
  PNG1920x1011,194740bytes, SHA-256
  `bcc61421823456da12340cba5abb6b65a6412a6c66ac9fabc0f9e855e2251598`.
- Reconnected to the same authenticated `/take/[owner-entered-attempt]`; password
  form absent, fullscreen active, native CSS viewport1429x749/DPR1.34375.
  No new attempt was created by the agent. All evidence is private/ignored under
  `tmp/vn-exams-ui-20261020/`; no question text/answers/media/branding will be
  transcribed into code, fixtures or committed documentation.
- Captures now succeed with Page enable/foreground/focus emulation plus optimized
  viewport capture. This is an observed successful combination, not proof that
  focus alone caused every prior failure. A later single-choice capture timed
  out; it is NOT counted as successful and was not repeatedly retried.
- Verified actual viewport/PNG1440x900 and768x1024. Requested390x844 produces a
  PNG390x844 but native fractional scaling rounds CSS viewport to391x845; this
  +1 CSS-pixel difference is explicit, not a pixel-perfect comparison claim.
- Screens inspected: active true/false question, selected answer, bookmark,
  question navigator, submission confirmation, responsive active screen.
  One statement was selected solely for state inspection; no key/explanation
  accessed. Confirmation was opened and cancelled, never finally submitted.
- First partial true/false selection is counted as answered by the reference.
  Local mock counts only complete groups; preserve that existing local semantic
  and label it clearly rather than silently changing scoring/save contracts.

### Measured active examination contract for visual reconstruction

| Surface | Direct DOM/computed-CSS evidence |
|---|---|
| Shell | Full viewport white examination workspace; header59.74px (56px inner row plus top accent/border), footer64.74px (64px inner row); independently scrolling middle region |
| Question column |688px actual content width at desktop; toolbar44px high; pale background `rgb(239,242,247)`; rounded12px; question number in exam-red leading block |
| Header | Compact exam/domain identity left; countdown centered; calculator and submit controls right; exam red `rgb(212,48,42)` (#d4302a) |
| Type | Be Vietnam Pro16px/24px body; controls14px/20px; regular400, medium500, semibold600; text#101a2c, muted#5b657a |
| True/false rows | Separate bordered rounded12px rows, padding12px, flex gap12px; content left, two compact choices right; choices36px high, padding4px 12px, radius8px, border#c7cedc |
| Selected choice | `aria-pressed=true`; background/border#d4302a, white text |
| Bookmark | Muted default; filled amber icon/text when marked, separate from navigator |
| Navigator | Footer counter toggles an upward drawer; width100%, bottom64px, max-height55vh, overflow-y:auto, white with upward shadow; inner max-width1024px/padding20px |
| Navigator state |100 numbered controls;40 available/60 future locked; answered, bookmark and current accessible labels verified. No local future sections invented under one-domain contracts |
| Footer | Three-way previous / dark central counter / next; inner max-width1024px; central counter background#101a2c |
| Submission | Centered alertdialog384px wide, padding32px, radius16px; answered/unanswered/review counts; red confirm above full-width continue; continue cancels without closure |
| Mobile | Same compact header and footer; title truncates, timer/submit remain; statement text wraps left of right-side choices; navigator remains an upward drawer |

### Files and comparison before any implementation

Verified screenshot manifest: `verified-screenshot-manifest.json`, containing
file sizes/dimensions/SHA-256. Newly successful captures include:

- `exam-taking-1440x900.png`, `taking_desktop_selected_1440x900.png`
- `taking_tablet_768x1024.png`, `04_exam_taking_mobile.png`
- `navigator_desktop_1440x900.png`, `navigator_mobile_390x844.png`
- `submission_confirmation_1440x900.png`, `exam-taking-native-live.png`

Content-free DOM/CSS records: `exam-taking-desktop-metrics.json`,
`taking-1440-default.json`, `taking-768-default.json`, `taking-390-default.json`,
`taking-answer-selected.json`, `taking-bookmarked.json`, `taking-navigator.json`,
`navigator-layout-metrics.json`, `submission-layout-metrics.json`.

Unchanged local B0.2 baseline captured with
`B0_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/local-before npm run test:b0:browser`:
PASS on Chromium155,17 screenshots. Coordinator visually compared original
reference and local true/false desktop/mobile screens before implementation.
Local baseline has a wide sidebar/two-column canvas, oversized sticky title/timer
card, bottom submit control and full-width radio choices. Reference instead has a
centered question column, compact fixed shell, row-oriented answer controls,
header submit and upward navigator. These are VERIFIED structural differences;
question/media content differs deliberately and is not a fidelity target.

### Prioritized ready implementation

| Priority | Change / impact | Complexity / risk / dependency | Reuse / acceptance |
|---|---|---|---|
| P0 | Full-height shell, compact header,688px content,64px footer | Medium / scroll-focus regression; no API change | Existing timer/save/lifecycle; compare shell geometry and long content scroll |
| P0 | Row-oriented true/false and compact single-choice presentation | Medium / keyboard and pending-save regression | Existing native inputs, typed mock saves and original fixtures; delayed/offline/reload tests |
| P1 | Upward navigator, footer toggle and review-number state | Medium / focus and direct-jump regression | Existing filters/marks; preserve only4 local slots; keyboard/Escape/toggle/direct jump |
| P1 | Vertical submission dialog/counts | Low / accidental-submit risk | Existing native confirmation; cancel/confirm and in-flight guards |
| P1 | Exam-scoped measured palette, sizes and spacing | Low / unrelated stylesheet regression | Scope active-exam styles; preserve product/staff shells |
| P2 | Results/review visual alignment | Pending owner submission / private release boundary | No automatic external submit; do independent exam work while waiting |

Gate checklist before Stage2: manual authentication VERIFIED; authenticated TSA
observations VERIFIED; geometry VERIFIED; computed CSS VERIFIED; live answer/
bookmark/navigation/confirmation states VERIFIED; taking screenshots CAPTURED and
VERIFIED; baseline comparison DONE; prioritized gap analysis RECORDED.
Results/review captures05/06 remain NOT CAPTURED pending legitimate owner action.
No claim of all-screen or pixel-perfect reconstruction follows from the core gate.

---

## Current direct-observation checkpoint — 2026-10-20

**Stage1 IN_PROGRESS; fidelity gate NOT PASSED; no new implementation.**
This checkpoint follows the owner's mandatory manual-authentication directive.
The earlier report below is historical evidence, not a substitute for this gate.
Its bytes before this append had SHA-256 `da1aa5665a9474317306bb17e8d881be1fc33731535eefabebe7b5873a9c2185`.

- Owner manually authenticated and replied `DONE` in the current conversation.
  Reconnected to the same visible Chromium156 CDP browser, using its isolated
  temporary context; existing earlier session preserved. No credentials, cookies,
  tokens, storage secrets or personal account values inspected/exported.
- VERIFIED initial URL `https://vn-exams.com/dashboard`; title
  `Bảng điều khiển | VN Exams`; no password form. Visible product navigation:
  Trang chủ, Kỳ thi, Luyện đề, Ngân hàng câu hỏi, Thống kê, Bảng Vàng.
- VERIFIED visible Luyện đề link opened `/tests`; TSA filter exposed10 TSA
  offerings, grouped official/example and practice inventory. The catalog page
  title is `Đề thi thử V-ACT, HSA, TSA miễn phí | VN Exams`.
- VERIFIED first visible exam-card link opened
  `/tests/22a7f08f-cb34-41e0-848a-25518098e37e`, titled
  `Đề Thi Thử TSA 2026 mã 1.1`. Structure/detail headings were observed.
  No start/mode/answer/submit action was activated by this agent. Entering a new
  reference attempt remains an explicit owner action/authorization checkpoint.

### Actual computed styles — detail surface only

Measured through `getComputedStyle` and `getBoundingClientRect`, not guessed from
screenshots. Actual CSS viewport1072x670; native screenshot pixels differ due to
browser/display scaling. Do not claim1440x900,768x1024 or390x844 comparisons.

| Element | Observed value |
|---|---|
| Body/main text | `rgb(16, 26, 44)` (#101a2c); Be Vietnam Pro with system fallback;16px/24px,weight400 |
| Detail content | max-width768px; block layout; horizontal padding24px; vertical padding40px |
| Detail H1 | Bricolage Grotesque with Be Vietnam Pro fallback;24px/32px,weight700 |
| Breadcrumb |14px/20px; `rgb(91, 101, 122)` (#5b657a) |
| Primary detail button | `rgb(212, 48, 42)` (#d4302a), white text;16px/24px,weight600 |
| Primary button geometry | height48px; padding0 28px; radius12px; flex gap8px |
| Primary button shadow | 0px 8px 20px rgba(212,48,42,0.3) |

### Screenshot and capture evidence

Evidence directory: `tmp/vn-exams-ui-20261020/` (already ignored by repository
`tmp/` rule; `git check-ignore` confirmed). Directory mode0700, evidence files0600.
Account header area is masked; no question text or account data was transcribed.

- **CAPTURED/VERIFIED:** `01_catalog_desktop.png`,147682bytes,1441x901 native
  pixels. PNG signature/dimensions checked and image visually opened. It shows
  the upper catalog/filter/group surface; practice cards are below the fold.
  SHA-256 `14a9f1f52aba345f74b4890900930570bf51d7554af29069357f55c4ef9cdc55`.
- **MEASURED, NO SCREENSHOT:** `02_exam_details_desktop.json`, actual DOM geometry,
  semantic tags/roles and computed styles; no copied source or private content.
- **NOT CAPTURED:** `02_exam_details_desktop.png`, `03_exam_taking_desktop.png`,
  `04_exam_taking_mobile.png`, `05_results_desktop.png`, `06_review_desktop.png`;
  tablet/mobile reference set also unavailable.
- `Page.captureScreenshot` with explicit viewport/surface capture timed out12s.
  Native-view (`fromSurface:false`) without emulation succeeded once, then detail
  capture also timed out. `Page.startScreencast` produced no frame within5s.
  Failures occurred outside fullscreen; a fullscreen-only explanation is not
  supported. No repeated identical failed capture loop and no browser restart.
- Session preserved. Screenshot limitation requires an owner-provided manual
  exam-taking screenshot before implementation; owner must also enter an exam
  manually or explicitly authorize one test attempt. No automatic submission.

### Current prioritized gaps and gate

1. P0: obtain the actual exam-taking state and verified screenshot. UNAVAILABLE
   in this checkpoint; no take-screen geometry or interaction claims may be made.
2. P1: exact requested viewport evidence. Native pixel dimensions and CSS viewport
   differ; emulator capture is unreliable. Manual capture/viewport assistance or
   a working alternative is required before matched visual comparisons.
3. P1: verified detail typography/accent/container differ from local Inter/purple
   tokens and wider prototype surfaces (static local CSS comparison only).
   Low technical complexity but subject to take-screen evidence before adopting
   shared changes; reuse existing components, no contract change.
4. P2: catalog exam-card grouping/filter hierarchy differs from local domain-card
   demo. Medium complexity, reuse existing catalog primitives; avoid inventing
   inventory/attempt metadata. Requires catalog-card screenshots and browser tests.

Gate status: owner authentication PASS; authenticated catalog/detail observation
PASS; detail geometry/computed CSS PASS; partial catalog screenshot PASS;
exam-taking interaction/screenshot FAIL; exact responsive reference set FAIL;
matched local/reference visual comparison NOT RUN. Stage2 NOT STARTED.

---

# VN Exams TSA UI Gap Analysis

Assessment date: 2026-10-20  
Status: `VERIFIED` for the authenticated core flow; several secondary behaviors remain `REQUIRES_VERIFICATION`.

This document records browser evidence collected from the owner-authenticated
VN Exams session and compares it with the current local TSA practice prototype.
It records interface structure, states, and interactions without transcribing
protected question content.

## Research boundary and method

The owner authenticated manually in a temporary Chromium profile. The session
was inspected through the existing CDP endpoint at `localhost:9226` using the
visible page DOM, visible controls, computed geometry, and permitted viewport
screenshots. No password, cookie, local storage, session storage, or private
credential was requested, printed, or stored.

The full authenticated TSA flow was opened through visible links and controls:

`dashboard → tests → TSA filter → TSA test detail → Thi thật → take → question navigator → submit confirmation → results → review`

The research attempt was submitted after selecting only visible answer controls
needed to verify state handling. No question text, answer key, explanation text,
or protected media was copied into this report. The authenticated screenshots
remain local temporary evidence and are not committed to the repository.

The direct Playwright Chromium binary was used because the Snap Chromium
wrapper previously failed with a sandbox confinement error. The authenticated
browser session itself was available and reachable after manual sign in.

## Screens inspected

### Authenticated dashboard — verified

URL: `https://vn-exams.com/dashboard`

Observed structure:

- Global header with VN Exams identity, `Trang chủ`, `Kỳ thi`, `Luyện đề`,
  `Ngân hàng câu hỏi`, `Thống kê`, `Bảng Vàng`, notification/report
  affordances, and a profile control.
- Exam-date prompt with `Đặt ngày thi`.
- Subject progress cards for V-ACT, HSA, and TSA. Each card exposes a question
  inventory, progress state, and `Luyện ngay` action.
- `Đề thi mới nhất` cards with exam family, question count, duration, and
  `Xem đề`.
- Analysis blocks for study streak, accuracy, practice time, subject accuracy,
  and recent activity.
- Invitation/friend area exists; personal display values were intentionally
  omitted from this report.

The dashboard is an authenticated product shell rather than a separate TSA
attempt screen. Its navigation and progress affordances are relevant to the
catalog and resume flow.

### Authenticated practice catalog — verified

URL: `https://vn-exams.com/tests`

The authenticated catalog initially showed V-ACT inventory. Activating the
visible `TSA` filter changed the page to `10 đề TSA` and displayed TSA
practice cards grouped under `Đề chính thức/minh họa` and
`Đề luyện tập/thi thử`.

Verified controls and card data:

- Exam family filters: `V-ACT`, `HSA`, `TSA`.
- Format filters: `Đề đầy đủ`, `Đề 1 phần`.
- Attempt filters: `Đã làm`, `Chưa làm`.
- Explanation filters: `Đã có`, `Chưa có`.
- TSA practice cards expose year, attempt/round label, full-exam format,
  `100 câu`, `2 giờ 30 phút`, explanation availability, and
  `Xem chi tiết`.
- A `Xem thêm` control reveals additional cards in the practice group.

The catalog uses compact pill controls and three-column cards at the observed
desktop width. Activating the TSA control visibly changed the catalog state; no
protected question bank was requested.

### TSA practice detail and mode selection — verified

The selected TSA practice detail page exposed:

- Breadcrumbs: `Trang chủ → Đề thi thử → [exam title]`.
- TSA family marker and exam title.
- `100 câu` and `2 giờ 30 phút` summary values.
- `Bắt đầu` action.
- A structure summary with 40 mathematical-thinking questions, 20 reading-
  comprehension questions, and 40 science/problem-solving questions.
- A link to the exam-specific leaderboard.

After `Bắt đầu`, the site displayed `Chọn chế độ làm bài` with two visible
choices:

- `Thi thật`: “y như thi thật”, sequential section locking, and countdown.
- `Luyện tập`: choose a section/subtopic and optionally choose timing.

The `Thi thật` card was selected for the authenticated attempt. The visible
mode selector proves that attempt mode is part of the reference lifecycle; the
internal `Luyện tập` configuration screen was not opened.

### Authenticated exam-taking screen — verified

Route pattern: `https://vn-exams.com/take/[attempt-id]`

The attempt entered a browser full-screen requirement before showing the
question. The prompt explained that `Thi thật` requires full-screen display
and provided `Vào toàn màn hình`.

At a CSS viewport of approximately `1429 × 691` in full-screen mode, the
question view had these visible regions:

- Top bar: exam title, current section label, countdown, `Máy tính`, and
  `Nộp bài`.
- Question toolbar: answered-count indicator, `Xem lại` bookmark toggle,
  `Ghi chú`, `Báo lỗi câu hỏi`, and an `S` control labelled by aria text
  as answer-exclusion toggle.
- Question body with question number/category/difficulty context and a
  format-specific answer area.
- Bottom navigation: `Câu trước`, a central `Câu n / 100` navigator
  trigger, and `Câu tiếp`.

Two live answer formats were observed in the attempt:

- A multi-statement true/false item rendered one `Đúng` and one `Sai`
  button for each of four statements. Each button exposed `aria-pressed`;
  selecting a visible answer changed the selected button to the exam-color
  filled state and changed `aria-pressed` to `true`.
- A single-choice item rendered four selectable answer buttons labelled A–D.
  The options used the same pressed-state interaction model.

After answering and advancing, the interface displayed `Đã lưu`, and direct
navigation back to the earlier question restored the selected answer. This is
verified answer persistence within the attempt. The exact server
acknowledgement timing and retry behavior were not measured.

The timer began at the advertised 150-minute duration and visibly decreased
while navigating, for example from approximately `149:58` to `148:25`.
The observed attempt did not reach a warning threshold or expiry state.

The `Xem lại` control is a per-question bookmark. It changed from an unfilled
bookmark style to an amber filled style when selected. It is separate from the
question-list navigator.

### Question navigator — verified

Activating the central `Câu n / 100` control opened `Danh sách câu hỏi`.

Verified navigator elements:

- Summary filters: `Đã trả lời (n)`, `Xem lại (n)`, and `Chưa làm`.
- Section grouping:
  - `Tư duy Toán học · câu 1–40`
  - `Tư duy Đọc hiểu · câu 41–60`
  - `Vật lý · câu 61–73`
  - `Hóa học · câu 74–86`
  - `Sinh học · câu 87–100`
- Individual numbered controls expose state through accessible labels such as
  answered, unanswered, marked for review, or locked.
- Questions 41–100 were visibly locked while the full-exam attempt remained in
  the first sequential section.
- Selecting an available number jumped directly to that question and restored
  the previously selected answer.
- The first 40 question controls were available in the active section. Future
  groups used a muted locked state and `cursor-not-allowed` styling.

This is the clearest verified difference from a flat all-question navigator:
the reference combines section sequencing, answer state, bookmark state, and
locked future sections in one navigator.

### Submission confirmation — verified

Activating `Nộp bài` opened `Xác nhận nộp bài` with live attempt counts:

- `Đã trả lời: n / 100 câu`
- `Chưa trả lời: n câu`
- `Đã đánh dấu xem lại: n câu`
- Warning: unanswered questions are counted as incorrect.
- Actions: `Nộp bài` and `Tiếp tục làm bài`.

The confirmation is a modal step and leaves the attempt available for
continuation until the final submit action is selected.

### Results — verified

Route pattern: `https://vn-exams.com/results/[attempt-id]`

The result page exposed:

- Exam result summary with score over 100, percentage, and status label such as
  `Cần cải thiện`.
- Exam title and attempt date.
- `Xem lại bài làm` route.
- Result sharing controls with landscape/portrait preview choices, image
  download, Facebook, Zalo, and link-copy actions.
- Counts for correct, incorrect, skipped, and elapsed time.
- A visible caveat that the practice score is an estimate and that official
  scoring uses IRT/standardization with different item weights.
- Analysis by broad competency grouping and by subject/topic labels.
- `Chi tiết đáp án` tabs: `Tất cả (100)` and `Câu sai (n)`.
- Per-question cards with question number, topic, difficulty, answer status,
  selected controls, and `Xem lời giải`.

The research attempt produced a zero score because only a minimal answer state
was selected to test controls. That value is a test state, not a performance
assessment and not evidence about the exam’s scoring model.

### Explanation and review — verified

The result detail page supports `Xem lời giải` and `Ẩn lời giải`. Opening
the control changed the button to the amber active state and revealed a side
panel headed `Hướng dẫn giải` with numbered guidance steps.

The separate review route, opened through `Xem lại bài làm`, displayed:

- Exam title and `Chế độ xem lại · [section]`.
- A `Kết quả` return control.
- Current question number and `Xem lời giải` control.
- Question status, topic, difficulty, answer controls, and bottom previous/
  current/next navigation.

The review screen is a focused question-by-question experience. The result
page is a long-form analysis and answer-detail experience. They are distinct
reference surfaces.

### Responsive results layout — verified

At an emulated viewport of approximately `391 × 845`:

- The result content used the full available width.
- The desktop navigation collapsed behind a visible `Mở menu` control.
- The logo remained visible, while profile and utility controls became compact.
- Share format tabs expanded to touch-friendly heights.

The mobile exam-taking layout, mobile navigator, and mobile full-screen policy
were not observed.

## Screenshots obtained

Public evidence captured earlier in this research:

- [Public test catalog](/tmp/tsa-vn-exams-research-20261020/public-tests-headless.png)
- [Public TSA overview](/tmp/tsa-vn-exams-research-20261020/public-tsa-overview.png)

Authenticated evidence captured after manual sign in:

- [Authenticated results viewport](/tmp/tsa-vn-exams-research-20261020/authenticated-results.png)
- [Authenticated review viewport](/tmp/tsa-vn-exams-research-20261020/authenticated-review.png)

The authenticated captures are local temporary files. They contain the
owner-visible authenticated header and rendered protected question UI as part
of the visual evidence; protected text was not transcribed or reused in this
document. An authenticated take-screen screenshot was not obtained because
CDP `Page.captureScreenshot` hung while the target was in the full-screen take
state. The same capture operation succeeded after submission on results and
review screens.

## Reference visual inventory

The authenticated product shell uses a light paper/grid background, white
surfaces, cool-gray borders, dark navy text, amber/gold accents, and a red exam
accent for TSA controls and state. The authenticated dashboard/catalog header
is a white horizontal bar around 64 CSS pixels high at the desktop viewport.

Observed visual patterns:

- Desktop content is centered in a roughly 1,000–1,050 CSS-pixel main column.
- Cards use white surfaces, thin cool-gray borders, medium corner radii, and
  restrained shadows.
- Catalog filters are compact pill buttons. Active exam-family and result-state
  controls use filled dark or exam-color surfaces.
- The take screen removes the normal product navigation and uses a compact
  exam-specific top bar with a prominent timer and red submit action.
- The review screenshot shows a single centered question column, a
  sticky bottom navigation row, and answer controls aligned within wide white
  cards.
- The result detail screen uses a two-column question/explanation presentation
  when an explanation is open.

Approximate palette from visible screenshots and computed class names:

| Role | Approximate value | Evidence |
|---|---|---|
| Page canvas | `#f5f7fb` / paper-grid variant | Authenticated dashboard, results, and public catalog |
| Primary text | dark navy around `#152238` | Authenticated header, cards, and headings |
| TSA/exam accent | red around `#d52a23` | TSA detail, take controls, status badges |
| Success answer state | green around `#16804d` | Review/result answer controls |
| Review accent | amber/gold | Bookmark, explanation controls, guidance panel |
| Border/grid | cool gray around `#d8dfeb` | Cards, controls, navigator, table/grid |
| Surface | `#ffffff` | Header, cards, question panels |

Typography is a modern sans-serif with compact heavy headings, readable body
copy, tabular timer numerals, and small uppercase metadata labels.

## Current implementation comparison

The comparison uses the current source under
`apps/practice-prototype/public/` and the prior local browser evidence under
`/tmp/tsa-b0-browser-evidence`.

| Area | Current local implementation | Authenticated reference | Classification |
|---|---|---|---|
| Product shell | Original `TSA PRACTICE` shell with an explicit `BẢN DEMO` label | VN Exams shell with dashboard, catalog, stats, leaderboard, and profile affordances | `VERIFIED` difference |
| Catalog | Three domain cards; only MATH has demo content | Filterable exam inventory with TSA cards, grouped official/practice sections, and metadata | `VERIFIED` difference |
| TSA metadata | Reference summary plus a four-slot, six-minute fixture | 100 questions, 150 minutes, full/partial filters, round/year metadata | `VERIFIED` difference |
| Detail/start lifecycle | Local domain intro leads directly to a demo attempt | Test detail → mode selection → full-screen requirement → attempt | `VERIFIED` difference |
| Attempt mode | No full-screen mode selector | `Thi thật` and visible `Luyện tập` mode choice | `VERIFIED` difference |
| Section sequencing | Four demo slots in one open list | Sequential sections with future questions locked | `VERIFIED` difference |
| Question navigator | Four-number sidebar; answered state only | 100-question grouped navigator with answered, review, unanswered, and locked states | `VERIFIED` difference |
| Answer formats | Single-choice radio input only | Live take evidence shows true/false per statement and single-choice; public TSA page lists additional formats | `VERIFIED` capability gap; remaining formats `REQUIRES_VERIFICATION` live |
| Answer persistence | Local API-backed demo save status | Selected button state restored after navigation; `Đã lưu` visible | `VERIFIED` alignment at interaction level; server retry policy `REQUIRES_VERIFICATION` |
| Timer | Six-minute demo countdown and local expiry check | 150-minute countdown in full-screen attempt; warning/expiry behavior not observed | `VERIFIED` timing difference |
| Exam toolbar | Local timer card and basic navigation | Calculator, note, report, exclusion toggle, bookmark/review, submit | `VERIFIED` capability gap |
| Submission | Local dialog lists four slots and returns to catalog after submit | Modal counts answered/unanswered/review-marked questions and supports continue/final submit | `VERIFIED` difference |
| Results | Unofficial raw count/percentage for four synthetic slots | Score/status, timing, analysis, estimate caveat, answer filters, and per-question detail | `VERIFIED` difference |
| Explanations | Separate demo review after grading | In-place `Xem lời giải`/`Ẩn lời giải` guidance panel plus separate review route | `VERIFIED` difference |
| Content policy | Synthetic repeated fixtures and explicit demo warnings | Protected question/media/explanations visible only in authenticated flow | `VERIFIED` policy boundary; no protected content reused |
| Mobile shell | Local responsive CSS was verified in prior local smoke evidence | Reference results collapse navigation behind `Mở menu`; mobile take flow not observed | Reference mobile result `VERIFIED`; mobile take gap `REQUIRES_VERIFICATION` |

## Reference interaction inventory

The following behaviors were directly observed in the authenticated browser:

1. Dashboard links open subject practice and latest-exam routes.
2. Catalog filters switch exam family and expose format, attempt, and
   explanation filters.
3. A TSA card opens a detail screen with structure metadata and `Bắt đầu`.
4. `Bắt đầu` opens a mode selector with `Thi thật` and `Luyện tập`.
5. `Thi thật` opens a full-screen-gated, sequential exam attempt.
6. Selecting an answer changes its pressed/filled state and displays saved
   status after navigation.
7. `Câu trước`, `Câu tiếp`, and the central question counter navigate the
   attempt.
8. The question counter opens a grouped navigator with answer, bookmark, and
   locked states.
9. `Xem lại` bookmarks the current question; it is distinct from the
   navigator.
10. `Máy tính`, `Ghi chú`, `Báo lỗi câu hỏi`, and answer exclusion are
    visible tools in the exam toolbar. Their detailed behavior was not tested.
11. `Nộp bài` opens a confirmation modal with live counts and incomplete-answer
    warning.
12. Final submit opens a score/results page with analysis, answer details,
    sharing controls, and an explanation toggle.
13. `Xem lại bài làm` opens a separate review route with question navigation
    and `Xem lời giải`.

Visible but not opened:

- The `Luyện tập` configuration flow.
- Calculator interaction.
- Note creation, question reporting, answer exclusion behavior beyond the
  visible toggle, and full-screen exit/save behavior.
- Additional live question formats beyond true/false-per-statement and
  single-choice.

## Visual gap analysis

### Verified differences

- The local catalog is domain-first, while the reference catalog is exam-card
  first with filters, grouped inventory, and year/round/explanation metadata.
- The local start flow opens a single demo intro; the reference uses a detail
  page followed by mode selection and a full-screen gate.
- The local navigator exposes four open demo slots. The reference groups 100
  questions by section/topic and locks future sequential sections.
- The local question renderer assumes one radio answer. The reference live flow
  includes multi-statement true/false controls and single-choice button groups.
- The local timer is a six-minute demo value. The authenticated reference timer
  is a 150-minute countdown shown in the exam top bar.
- The reference provides bookmark, notes, report, exclusion, calculator, and
  review affordances in the question toolbar. The local prototype does not
  expose the same toolbar.
- The reference submit confirmation exposes answered, unanswered, and review
  counts and keeps the user in the attempt when cancelled. The local dialog is
  built around four demo slots and exits to the catalog after submit.
- The reference results surface provides score status, timing, subject analysis,
  answer filters, sharing, and expandable guidance. The local result surface is
  a synthetic count/percentage followed by a simple demo review.

### Supported by public research but not fully verified in live take mode

- The public TSA overview lists five question families: single choice,
  statement true/false, multiple correct answers, drag and drop, and answer
  entry. Only the first two were directly exercised in the authenticated
  attempt. The other three require live interaction verification before being
  implemented as reference behavior.
- The public overview describes the 40/20/40 structure and equal-weight
  practice score caveat. The authenticated detail and result pages confirm the
  structure and estimate caveat, while official-score equivalence remains out
  of scope.

### Inferred differences

- A production implementation will likely need backend-backed attempt snapshots
  and server-authoritative deadlines to preserve the observed sequential flow;
  the exact contract is governed by this repository’s existing contracts and
  was not changed during research.
- The reference’s visible saved state suggests autosave or a server-confirmed
  answer lifecycle, but request timing, offline retry, and cross-tab behavior
  were not measured.

### Unobservable or still requiring verification

- The internal `Luyện tập` configuration controls and timing options.
- Warning thresholds, expiry transition, reconnect handling, and retry states.
- Whether section transitions require a confirmation step and whether completed
  sections can be revisited.
- Full live interactions for multiple-correct, drag/drop, answer-entry, and
  reading-material controls.
- Calculator, notes, question reports, answer exclusion, keyboard behavior,
  focus management, and accessibility semantics beyond observed aria labels.
- Mobile question-taking layout, mobile navigator, and full-screen behavior.
- Protected media rendering details and exact explanation content.

## Prioritized implementation plan

This plan is based on the verified observations above and preserves the
repository’s existing attempt lifecycle, immutable snapshots, question reuse
policy, and approved contracts.

### P0 — model the observed attempt shell and section state

1. Add a catalog/detail state that can represent TSA cards, year/round, format,
   question count, duration, explanation availability, and grouped sections.
2. Add an explicit attempt-mode step with `Thi thật` and a clearly labeled
   practice mode. Keep the full-screen requirement and sequential section lock
   as UI states backed by the existing attempt lifecycle.
3. Replace the flat demo navigator with grouped numbered navigation that
   exposes answered, unanswered, bookmarked, current, and locked states.
4. Keep the timer derived from the server-authoritative attempt deadline and
   render the compact exam top bar shown by the reference. Add warning and
   expiry behavior only after the contract and live threshold are verified.

### P1 — implement verified answer and submission behaviors

1. Add reusable answer renderers for single-choice and per-statement true/false,
   including pressed state, saved state, keyboard focus, and navigation
   persistence.
2. Add the observed question toolbar affordances as explicit capability states:
   calculator, notes, report, answer exclusion, and bookmark. Avoid claiming
   behavior that has not been verified or supplied by a contract.
3. Match the submit modal’s answered/unanswered/bookmarked counts, incomplete
   warning, cancel action, and final-submit action.

### P1 — align results and review surfaces

1. Expand results to include score/status, correct/incorrect/skipped counts,
   elapsed time, estimate caveat, and subject/topic analysis.
2. Add `Tất cả` and `Câu sai` answer filters and per-question topic/difficulty
   metadata.
3. Add an expandable explanation panel and a separate question-by-question
   review route while keeping explanations release-gated by the existing
   lifecycle and contracts.

### P2 — responsive and secondary behavior

1. Add the collapsed mobile navigation pattern observed on results and test the
   same breakpoint against catalog and detail screens.
2. Verify and then implement mobile take layout, focus order, sticky navigation,
   navigator overflow, and full-screen behavior.
3. Research and implement the remaining live question formats only after their
   interaction rules and persistence contracts are verified.

## Remaining research blockers and minimum owner action

The core authenticated research blocker is cleared. The remaining limits are:

1. An authenticated take-screen screenshot was not captured because CDP
   `Page.captureScreenshot` hung only while the target was in the full-screen
   take state. Capture succeeded on results and review pages. Minimum action if
   that screenshot is required: reopen an authenticated attempt and provide a
   working viewport screenshot path or allow another browser capture method.
2. The `Luyện tập` mode and secondary tools were visible but not opened.
   Minimum action: authorize a non-destructive practice-mode exploration in the
   same owner-controlled session.
3. The remaining live question formats and mobile take layout were not reached.
   Minimum action: provide a safe sample attempt or an owner-approved route
   where those formats can be observed without bulk question-bank access.
4. No protected question content or explanation text may be reused without a
   separate rights decision. This report records format and structure only.

## Files changed and verification

Changed file:

- `docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md`

Verification performed:

- Owner-authenticated Chromium CDP inspection on `localhost:9226`: dashboard,
  catalog, TSA detail, mode selector, take screen, navigator, submit modal,
  results, review, and emulated mobile results were observed.
- CDP screenshot capture succeeded for authenticated results and review
  viewports. Capture timed out only in the full-screen take state; this is
  recorded above.
- `git diff --check -- docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md`: passed.
- Application tests were not rerun because this task changed documentation
  only and explicitly prohibited application code changes.

No application code, database schema, approved contract, commit, or push was
changed for this research task.
