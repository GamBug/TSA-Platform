# Track B supervisor demonstration

For a concise presentation sequence, use the [one-page run of show](TRACK_B_SUPERVISOR_RUN_OF_SHOW.md). This guide contains setup and optional engineering/staff details.

Current engineering acceptance and remaining human inputs: [dated acceptance map](../reviews/TRACK_B_LOCAL_ACCEPTANCE_2026_10_25.md).

This guide demonstrates an unofficial TSA practice website using real local
PostgreSQL services and original synthetic engineering questions. It does not
establish university affiliation, official scoring equivalence, qualified content
review, lawful real-exam stock, formal accessibility acceptance or production
readiness. No paid service or model runs during practice.

## Prepare and start

Use Linux as an ordinary user with Node **24.18.0**, npm **11.16.0**, and installed
PostgreSQL **18.6** binaries (`initdb`, `postgres`, `pg_ctl`, `psql`). The disposable
fixture verifies this PostgreSQL version. `PG_BIN` may select the binary directory,
for example `/usr/lib/postgresql/18/bin`. PostgreSQL must be able to create private
Unix sockets and child processes. No system database or TCP database listener is
required. Other operating systems have not been verified by this checkpoint.

From a clean checkout of this branch, in the repository root:

```sh
node --version
npm --version
npm ci --ignore-scripts
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains
```

Installation needs access to the npm registry or a complete local npm cache. After
installation all application assets, fonts and math rendering are served locally.
No browser extension, API key, personal account or external authentication is
required. Chromium or Firefox is sufficient for the interactive demonstration.
Automated checks additionally need installed Chromium and Firefox/geckodriver.

Open the exact printed `http://127.0.0.1:<port>/?student=postgres` URL. The port is
chosen automatically. Keep the terminal running. The URL query selects the
persistent student client; `/` alone selects the separately labelled mock client.

## Present the complete journey

1. Explain the synthetic-only notice. Choose **Đăng nhập hồ sơ tổng hợp A**.
   The explicit local profile is development authentication, not a real student
   account. Profile B has separate ownership; no password or personal data is used.
2. Open **Trang đầu** to show the landing page, then **Bài luyện tập**. The catalog
   offers independent **Toán học**, **Đọc hiểu**, and **Khoa học** attempts. Open
   **Xem chi tiết** for question count, duration, admission window and timing rules.
   Configuration is the selected server-defined domain profile, not editable
   scoring/timing/reuse rules.
3. Start Mathematics. Answer single-choice, multiple-choice and true/false items
   as encountered; their order may vary. Multiple-choice needs its stated minimum
   selections. Wait for **Đã lưu** after each answer. Show question navigation and
   the mark-for-review control. Formulas are typeset locally and tables are readable.
4. Reload the page. The same attempt, original deadline and acknowledged answers
   return from PostgreSQL. Reload does not allocate another attempt. Time continues
   while disconnected; there is no grace period. Unsaved changes can be lost.
5. Choose **Nộp bài**, inspect the confirmation, and confirm. The background worker
   grades the sealed answers. A short pending screen may appear; fast local grading
   can finish before it is visible. Submission is successful only after the server
   acknowledges it. A network error does not mean submission succeeded.
6. Show the unofficial result, domain label and answer counts. Open the released
   review, move among questions and expand explanations. Private keys and
   explanations are released through this separate authorized view after grading.
7. Return to the catalog. Repeat Reading and Science explicitly. Each has its own
   attempt, clock, submission, score and history entry. No combined official score
   or automatic transition to another domain exists.
8. Show all three completed history entries and reopen a result. A later attempt
   can exhaust this tiny NEW_ONLY inventory. That shortage is intentional; the
   application does not silently repeat questions or switch reuse policies.

### Optional explicit review practice

Keep the same disposable student launcher running. After completing a domain,
request its default practice again. Once previously assigned inventory is exhausted,
the genuine unseen-inventory shortage offers review of the **same** domain profile.
Choose **Xem lựa chọn ôn tập** and show that its repeat-consent checkbox starts
unchecked. Cancel or Escape sends no creation request. Check it deliberately and
choose **Xác nhận và tạo bài ôn tập** to create a new review attempt. Select
**Bắt đầu bài luyện tập** explicitly from its reserved screen. The count, duration and server timing rules remain the same.

Answer, wait for acknowledged saves, reload, submit and open the released result
and explanations as before. Review labels persist through the attempt, result and
history. Questions may include prior assignments; the algorithm does not promise
the fewest repeats. Earlier assignment history is preserved, so a later default
NEW_ONLY request still truthfully reports exhaustion. Review never starts
automatically and does not repair a lack of currently eligible content.

If creation acknowledgement is lost, use the explicit retry for that same request.
After acknowledgement, a failed attempt read offers a read-only retry. An uncertain
or unverified response is not a confirmed reservation. Reload never repeats the
creation request. Switching accounts clears consent and prior private state.
The synthetic launcher explicitly enables this capability; shared runtime/service
constructors keep it disabled by default. See the [executed review-practice checks
and limits](../reviews/WEB_003_REVIEW_PRACTICE_VERIFICATION.md).

| Synthetic profile | Questions | Independent duration |
| --- | --- | --- |
| Mathematics | 4 | 6 minutes |
| Reading | 2 | 3 minutes |
| Science | 4 | 6 minutes |

These are project demonstration settings, not verified official examination rules.
Reading in this profile uses standalone synthetic items. For the separate ordered
shared-passage example, stop this demo and run the same flags with
`npm run demo:student:reading`. Do not combine the two fixture profiles.

## Optional shared fixed forms

For a fresh fixed-form presentation, stop the other launcher and run:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:fixed
```

This automatically seals three original synthetic forms through the real local
Bank service before starting the student site. No SQL patch or manual API call is
needed. Personal practice stays in the catalog; the separate **Bài dùng chung**
section offers the same MATH4/READING2/SCIENCE4 independent timings above. Form
references distinguish choices with the same title. These are immutable shared
contents, not an official examination or qualified human-reviewed inventory.

Choose **Chọn bài dùng chung**. The repeat-consent checkbox starts unchecked;
Cancel/Escape creates no attempt. Give consent and confirm the reservation, then
choose **Bắt đầu bài luyện tập** explicitly. Answer, wait for **Đã lưu**, reload,
submit and open the released explanations. Return to the catalog and repeat the
other domains. Fixed mode remains labeled in result and history. A fresh explicit
repeat uses the same sealed form with a new owned attempt, preserving first-history;
a later default NEW_ONLY request can still truthfully exhaust its inventory.

If assignment response is uncertain, use **Thử lại cùng yêu cầu**. Once the server
has acknowledged it, **Tải lại trạng thái bài** performs only a read. Reload resumes
existing state and never silently assigns another attempt. Current admission,
rights or withdrawal may reject a new reservation or delivery. Both synthetic
profiles may receive the same form, but their answers/results/history stay private.
Stopping this disposable launcher discards all forms and progress. Shared/retained
runtime defaults keep new fixed catalog/creation disabled. See
[executed checks and limits](../reviews/WEB_003_B10_FIXED_STUDENT_VERIFICATION.md).

## Optional shorter personal practice

Stop the other launcher and start a fresh isolated demonstration:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:short
```

The original Mathematics4/Reading2/Science4 profiles keep their existing durations.
Two additional green cards offer Mathematics2 and Science2, each3minutes, using
only questions never assigned to the current student. Reading stays2; a passage
bundle is never split to manufacture a shorter offer. This launcher automatically
creates original synthetic inventory/profile pins, not accepted real question stock.

Complete the full Mathematics profile, return to the catalog and request it again.
The small unseen pool cannot supply another four-question attempt; its truthful
shortage can now suggest the separate two-question profile. Merely seeing that
offer does not allocate anything or guarantee current stock. Choose the short
profile, inspect its native confirmation and cancel/Escape once to show nothing
was created. Reopen, confirm the reservation, then explicitly choose **Bắt đầu bài
luyện tập**. No repeat-consent checkbox is needed for this NEW_ONLY choice.

Answer, wait for acknowledged saves, reload, submit and view the released result/
explanation. Repeat the full→short journey for Science. The four owned history
entries retain their separate counts/scores; all earlier assignment history stays.
The server can truthfully reject an exhausted short profile too; it does not switch
policy, generate content or replace the request automatically.

A lost creation response offers the same-request retry. After acknowledgement,
failed reads recover through GET only. Reloading a reservation never starts or
reallocates it; if its exact profile/duration cannot be proven from the frozen
response, the screen says unavailable before Start. After explicit Start, actual
server start/deadline supply the correct3minute clock. Existing attempts block new
profile choices; an externally created reservation is read explicitly and never
started merely by choosing another card. Changing accounts invalidates old intents.
See [executed checks/review/limits](../reviews/WEB_003_B11_SHORTER_PROFILE_VERIFICATION.md).

## Stop, reset and recover

Press **Ctrl+C once** in the launcher terminal and wait for it to exit. The owned
HTTP server, worker, pools and private PostgreSQL instance close; the temporary
fixture database is deleted. Restart the command for a fresh isolated inventory.
Reloading while the same launcher is running preserves progress; stopping and
restarting this disposable command does not. No manual SQL or API calls are part
of the student presentation.

If startup fails, check the pinned versions, installed dependencies, `PG_BIN`, and
permission to create local sockets/processes. Production mode or missing opt-in
flags is intentionally rejected. If the browser loses connectivity, restore the
same server and read the attempt again before retrying. Never report an uncertain
save or submission as confirmed. The launcher is local-only; remote access and
production deployment are outside this guide.

## Optional staff demonstration

Stop the disposable student launcher. In a separate browser profile/private window
(localhost cookies are shared across ports), start the retained synthetic staff app:

```sh
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b
```

Open the printed URL, choose the staff workspace and the synthetic AUTHOR. Create
a DRAFT, filter the version list and choose **Kiểm tra riêng phiên bản**. The server
returns exact version/hash/workflow and current source-rights metadata. The retained
source remains UNKNOWN, so its content preview is blocked truthfully. B1 supplies
no raw rights evidence; the separate approved B2 action below reads it without
changing rights. Approval, rights-edit and publication controls remain unavailable.

For a complete disposable private-preview demonstration, stop retained mode and run:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STAFF_REVIEW_FIXTURE_DEMO=true npm run demo:staff:review
```

Open the printed root URL (without `student=postgres`), choose **Không gian bản nháp
cục bộ**, then synthetic AUTHOR **Tác giả tổng hợp**. Inspect the four versions
explicitly: three show the supported interactions, locally typeset math, table,
private key and explanation; the unsafe synthetic version shows a metadata-only
CONTENT_UNSUPPORTED block. Close the view by its control or Escape; return/logout
clears private content. These private reads are denied to ordinary students.

Each exact-version inspection shows **Publication eligibility: Not evaluated by
this inspection** before its metadata. An AVAILABLE preview or APPROVED workflow
state is separate from lawful rights, qualified review and permission to publish.
This status section provides no approval/publication action.

The author form now supports **Một đáp án đúng**, **Nhiều đáp án đúng** and
**Đúng hoặc sai cho từng mệnh đề**. This compact synthetic MATH editor has exactly
two options/statements. MC requires one or both correct options (student selection
bounds1..2); TF requires an explicit Đúng/Sai value for both statements. Changing
type clears answer choices; empty/whitespace text cannot be submitted. Create a
draft, reload, reopen the staff workspace and inspect its exact private version to
verify persistence. Creating a draft never submits it for review automatically.
[Browser evidence](../reviews/WEB_002_AUTHOR_EDITOR_VERIFICATION.md).

To demonstrate the author-to-reviewer handoff, create a safe original synthetic
DRAFT through the author form, or inspect one of the three safe fixture versions.
After explicit AUTHOR_OWN inspection, choose **Chuyển bản nháp vào hàng chờ rà soát**.
Check the version/hash/revision in the confirmation. Cancel/Escape makes no change;
confirm once to submit. The receipt and the freshly read workflow state are shown
separately. A failed connection is uncertain: use the explicit same-request retry,
never assume success. A conflict offers authoritative reload. Reloading the page
does not submit again. UNKNOWN rights do not become approved through handoff;
unsafe content truthfully fails validation.

Sign out and choose synthetic REVIEWER **Người rà soát tổng hợp**. Choose
**Hàng chờ rà soát**, inspect the exact submitted version and open its recorded
evidence. This is independent queued-role access, not qualified human review.
The UI cannot approve content, change rights or publish it. The bounded synthetic
negative actions below require explicit confirmation.

For recorded evidence, sign out and choose synthetic BANK_MANAGER **Quản lý ngân
hàng câu hỏi tổng hợp**. Select **Xem bằng chứng quyền** for an exact version.
The separate observation shows version/hash, workflow revision, server observation
time, current decision ID/revision/status and its recorded text. Markup and URLs
are inert text; the intentionally hostile synthetic example must not open links
or load images. Close/Escape restores focus; navigation/logout clears the text.
The **Hàng chờ rà soát** shortcut selects the existing IN_REVIEW metadata filter.
An empty queue is truthful until an author explicitly submits a draft; the
shortcut itself does not submit or approve anything.
AUTHOR alone and students cannot access evidence. REVIEWER access is limited to current
independent IN_REVIEW versions; the fixture does not manufacture a human approval.
This is an unverified administrative claim, including any pasted sensitive text,
not a rights attestation. No manual SQL or API calls are required.

For a simulated rejection, remain the independent REVIEWER, inspect a queued
version with an AVAILABLE preview and select **Từ chối phiên bản đang chờ rà soát**.
All six Pass/Fail choices initially remain unset. Make explicit demonstration
choices, enter a synthetic reason, review the version/hash/revision and confirm.
Cancel/Escape makes no change and clears typed private summary text. Stored reasons
are prefixed `Local synthetic disposition: `; neither the role nor the rubric is
qualified human review. After REJECTED, queue private access normally disappears.
The UI retains the acknowledged receipt and says exact current state is unobserved;
a missing queue row alone is not proof of its current state.

To inspect the recorded decision, sign out and choose BANK_MANAGER. Select the
REJECTED state or all states, find that exact version and choose **Xem lịch sử rà
soát**. It makes an explicit private read and shows the server observation/current
workflow separately from stored decision, six findings and reason. A recorded
APPROVE/REJECT does not establish qualified review, legal rights or current
publication eligibility. Reasons are shown verbatim as inert text and may contain
pasted private material; no redaction is promised. Only the latest20 decisions
are shown, with an explicit notice if older entries are omitted. A version with
none shows an empty state. Close/Escape restores focus; return/logout clears it.
AUTHOR/REVIEWER/student accounts cannot access this administrative history.
[History evidence](../reviews/WEB_002_B5_RUNTIME_VERIFICATION.md).

For a canonical dataset check, remain BANK_MANAGER, select the supported manual
synthetic versions using their labeled checkboxes, then choose **Kiểm tra tập
phiên bản**. Nothing runs automatically. The report shows only the selected
versions' canonical counts, fixed starter targets12/6/12, shortfalls and required
human/rights blockers. These are NOT accepted/eligible inventory counts or assembly
feasibility; meeting the counts does not remove human/rights requirements.
No content is approved or published. Exact version/hash/workflow observations and
server report-creation time identify the selection, not an exam deadline.

Changing the selection, filter/page, refresh, private target, return or logout
clears the report and fences pending results. Close/Escape clears selection/report
and focuses the selection summary; choose versions again for a new explicit check.
An unavailable/lost report is an error, never a saved success. A new check is
explicit and read-only. Some existing Factory opaque-ID graphs are unsupported by
the unchanged canonical service and return a safe validation error; no partial
success or alternate graph substitution. [Executed preflight scope/limits](../reviews/WEB_002_B6_RUNTIME_VERIFICATION.md).
Canonical dataset preflight remains distinct from the stored fixed reference
diagnostics below. The additive fixed replay contract is now implemented; personal
manifests/history remain private and fixed student delivery remains unavailable.

To inspect stored fixed reference problems, remain BANK_MANAGER and choose
**Kết quả lắp đề cố định**. The disposable demo automatically stores three genuine
solver reference runs: success, proven-infeasible captured constraints and exhausted
search budget. Select a row to **Phát lại và xem chẩn đoán**. The server verifies
stored canonical inputs/result before displaying only aggregate counts, limits,
exact run identity and observation time. The list itself is recorded metadata;
replay verification happens only on explicit detail. Back uses that captured list
without claiming a new observation; close/Escape restores focus.

SEARCH_EXHAUSTED means feasibility remains unknown, not a proved shortage. Even
proven infeasibility concerns that captured constraint problem, not today's stock
or simply the number of items. These are synthetic reference problems, not Bank
eligibility capture, sealed forms or fixed student delivery; no student attempt,
assignment history, result, rights or publication is created. Candidate/source/
history identifiers and raw manifests never cross this manager aggregate API.
Retained mode truthfully shows empty until supported fixed reference rows exist;
legacy placeholders and personal runs remain unreadable. Discovery is capped at20
with explicit older-record notice. Every successful list/detail read is audited.
[Fixed reference diagnostics evidence](../reviews/WEB_002_B7_STORED_DIAGNOSTICS_VERIFICATION.md).

For quarantine, sign out and choose BANK_MANAGER. Select a different DRAFT or
IN_REVIEW version (use the state filter if necessary), inspect it and choose
**Cách ly phiên bản**. Enter a reason and read the impact warning: related published
descendants, forms, attempts, results and access may be affected. Confirm only the
intended synthetic version. Fresh QUARANTINED metadata contains no question/key/
explanation. An error may occur after commit; the explicit retry reuses the same
command key/body. Do not infer that a hold never happened from an error response.
There is no automatic undo, APPROVE or publication action. All of this runs in the
owned disposable fixture; it creates no lawful published inventory.

The isolated fixture's rights records are simulations, not a lawful real-content
attestation or qualified human review. Its B8 eligible synthetic stock is test
machinery, not lawful accepted real inventory. The
synthetic REVIEWER has only server-authorized access to independent IN_REVIEW
versions; it cannot act as a qualified approver through this interface.

Ctrl+C deletes the **disposable** staff fixture database. By contrast,
`dev:track-b` stops its owned server/database and **retains** ignored `.local/track-b`
data. Use separate browser profiles/private windows between modes because cookies
are shared across localhost ports. The [B1 authority](../decisions/OPEN_DECISIONS.md#web-002-b12--owner-approved-private-inspection-2026-10-23)
grants inspection only. [B2 authority](../decisions/OPEN_DECISIONS.md#web-002-b21--owner-approved-recorded-evidence-read-2026-10-23)
separately grants the bounded recorded-text read. [B3 authority](../decisions/OPEN_DECISIONS.md#web-002-b31--owner-approved-author-draft-handoff-2026-10-24)
grants the explicit author draft handoff. [B4 engineering disposition](../decisions/OPEN_DECISIONS.md#web-002-b41--engineering-scope-selected-under-owner-delegation-2026-10-24)
adds only the simulated negative actions above and attribution repair; rights
edits/approval/publication and qualified human acceptance remain separate.

If another tab changes the authenticated session, an old workspace confirmation
cannot move onto that replacement session. The workspace clears private content
and pending confirmations and offers **Reload current session**. This reads the
current account; it does not resend a command or log out that account. Inspect
current state and make a fresh explicit choice before another command. A previously
unacknowledged operation remains unconfirmed, even after this local cleanup.
[Session-binding evidence](../reviews/WEB_002_STAFF_SESSION_BINDING_VERIFICATION.md).

### Eligible Bank stock rehearsal (B8.1)

The same disposable staff launcher automatically provisions four additional
technically eligible synthetic MATH questions, separately from the four preview
drafts and B7 reference-only examples. These use a disposable fixture publication
capability; they are not lawful accepted stock or qualified human approvals.
No database patching or manual API calls are needed.

1. Sign out, select **Synthetic exam manager (EXAM_MANAGER)**, and sign in.
   Choose **Load supported rehearsal blueprints**. This role receives blueprint
   metadata; it cannot read private questions or Bank diagnostics.
2. Choose the displayed MATH4 blueprint version and a window of **60** minutes.
   Choose **Review rehearsal confirmation**, check the exact version/hash/window
   and no-form disclosure, then confirm. The database sets capture time and checks
   rights through the proposed window plus the600-second Start TTL and domain
   duration. The client clock supplies no eligibility timestamp.
3. Read the historical SUCCESS receipt. No form, attempt, score or assignment
   history was created. A lost acknowledgement shows uncertainty; **Retry the same
   rehearsal request** retains its exact body/key. Reload never resubmits a command.
4. Sign out and choose BANK_MANAGER. Open **Eligible-stock rehearsal history**,
   then **View diagnostics** for that receipt. The server replays stored inputs and
   shows aggregate feasibility, counts and `BANK_ELIGIBLE_AT_CAPTURE` provenance.
   `NOT_REVALIDATED` means current eligibility was not checked by this read.
5. To show stock loss, close the history, filter question metadata to APPROVED,
   inspect one of the four synthetic eligible versions, then use the existing
   explicit quarantine action with a synthetic reason. This is a real local
   negative disposition, never content approval. Sign in as EXAM_MANAGER and
   explicitly request another rehearsal. It records FAILURE with a proven one-item
   MATH shortfall; no reuse-policy fallback occurs.
6. Return as BANK_MANAGER and reopen the first SUCCESS. It remains an immutable
   historical result, clearly separate from current inventory and the new failure.

The command receipt reveals only safe pins/times/outcome and bounded proven count
shortfall. Bank aggregate inspection is a separate role. Successful rehearsal
neither reserves content nor seals an exam; future fixed sealing/delivery is a
separate milestone. Current rights/human review/publication and real12/6/12 starter
inventory remain external acceptance requirements.
[Executed checks and limitations](../reviews/WEB_002_B8_BANK_STOCK_REHEARSAL_VERIFICATION.md).

### Seal and inspect a fixed form (B9.1)

Use a fresh disposable `demo:staff:review` run if B8 quarantine already removed
stock. Its automatic setup provides four technically eligible original synthetic
MATH questions. No database patch or manual API call is required. The retained
workspace exposes stored metadata but does not enable new sealing by default.

1. Sign in as **Synthetic exam manager (EXAM_MANAGER)**. Choose **Seal a fixed
   form**, select the supported MATH4 blueprint and keep the60-minute window.
2. Choose **Review seal confirmation**. Inspect the version/hash, domain/count/
   duration, window and real-form warning. Cancel/Escape does nothing. Open it
   again and choose **Seal fixed form** explicitly.
3. Read the historical SEALED receipt, form/run IDs, hashes and server times. The
   operation creates an immutable form and creates no student attempt, assignment
   history, score or delivery. A lost acknowledgement is uncertain; **Retry the
   same seal request** keeps its original body/key and cannot create a duplicate.
4. Choose **Sealed fixed forms** explicitly. Open **View safe metadata** for that
   exact form. Historical receipt and freshly observed stored availability are
   separate. Neither revalidates current rights or permits student access.
5. Reload, reopen the staff workspace and discover the same form in the list.
   Reload does not seal again. Read failures offer a GET-only retry; no replacement
   form is silently created. Only the latest20 records appear, with an older-record
   notice when applicable.
6. To show a current restriction, use the existing manager quarantine demonstration
   on eligible synthetic stock, then return as EXAM_MANAGER. The original seal
   remains immutable; its freshly observed availability may show withdrawal, and
   a new seal request can truthfully report shortage. Do not treat the old receipt
   as proof of current delivery or legal rights.

The current student catalog still offers personal practice/review only. Fixed
student delivery, scheduling edits, real-content approval and publication controls
are outside B9. [Executed sealing checks and limits](../reviews/WEB_002_B9_FIXED_SEALING_VERIFICATION.md).

## Reproduce verification

From the installed repository root:

```sh
npm run build
npm run test:student
npm run test:student:domains
npm run test:student:review
npm run test:student:review:firefox
npm run test:student:keyboard
npm run test:student:firefox
npm run test:student:zoom:firefox
npm run test:student:short
npm run test:student:short:firefox
npm run test:staff:review
npm run test:track-b:browser
npm run test:staff:firefox
```

The domain check exercises real PostgreSQL allocation/save/reload/submission/
grading/review/history for all three domains. The keyboard check adds focus,
accessible-tree and equation-injection checks; it is not qualified screen-reader
or WCAG acceptance. Firefox checks the mixed-type persistent journey on a second
engine. Default screenshot/report locations are `/tmp/tsa-student-browser-evidence`
and `/tmp/tsa-student-firefox-evidence`; they contain disposable identifiers and
should not be committed as private production evidence.

The full lawful starter stock remains a separate human dependency: **12 Mathematics,
6 Reading, 12 Science** accepted items with provenance, rights attestation and
independent qualified review. The synthetic demo supplies none of those approvals.
The staff metadata workspace is separate from this disposable student launcher;
see [staff capabilities and proposed next contract](../decisions/WEB_002_STAFF_READ_PROPOSAL.md).

Real-content acceptance inputs are listed in the separate [content handoff](TRACK_B_CONTENT_HANDOFF.md).
The demonstration does not supply those human/rights attestations. Fixed
assembly scope has a [specific contract/service dependency record](../decisions/WEB_002_FIXED_DIAGNOSTICS_DEPENDENCIES.md);
canonical dataset preflight does not replace it.


The optional `test:student:zoom:firefox` command reuses the isolated mixed-question
journey at actual Firefox native200% zoom, including saved reload, submit/Escape,
result and explanation/Space. Verified with Firefox156/geckodriver0.37.1; this mode
requires geckodriver's `--allow-system-access` option for the owned disposable
browser's FullZoom control. Ordinary/fixed/staff modes do not enable that option.
No owner browser profile is reused. Evidence is local under
`/tmp/tsa-student-native-zoom-evidence`; screenshots are normalized CSS pixels.
[Automation evidence/limits](../reviews/WEB_004_NATIVE_ZOOM_VERIFICATION.md) remains
separate from qualified human accessibility/nativezoom acceptance.
