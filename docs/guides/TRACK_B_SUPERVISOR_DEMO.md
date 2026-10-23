# Track B supervisor demonstration

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

| Synthetic profile | Questions | Independent duration |
| --- | --- | --- |
| Mathematics | 4 | 6 minutes |
| Reading | 2 | 3 minutes |
| Science | 4 | 6 minutes |

These are project demonstration settings, not verified official examination rules.
Reading in this profile uses standalone synthetic items. For the separate ordered
shared-passage example, stop this demo and run the same flags with
`npm run demo:student:reading`. Do not combine the two fixture profiles.

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
changing rights. Review decisions and publication controls remain unavailable.

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

For recorded evidence, sign out and choose synthetic BANK_MANAGER **Quản lý ngân
hàng câu hỏi tổng hợp**. Select **Xem bằng chứng quyền** for an exact version.
The separate observation shows version/hash, workflow revision, server observation
time, current decision ID/revision/status and its recorded text. Markup and URLs
are inert text; the intentionally hostile synthetic example must not open links
or load images. Close/Escape restores focus; navigation/logout clears the text.
AUTHOR alone and students cannot access it. REVIEWER access is limited to current
independent IN_REVIEW versions; the fixture does not manufacture a human approval.
This is an unverified administrative claim, including any pasted sensitive text,
not a rights attestation. No manual SQL or API calls are required.

The isolated fixture's rights records are simulations, not a lawful real-content
attestation or qualified human review. It creates no published inventory. The
synthetic REVIEWER has only server-authorized access to independent IN_REVIEW
versions; it cannot act as a qualified approver through this interface.

Ctrl+C deletes the **disposable** staff fixture database. By contrast,
`dev:track-b` stops its owned server/database and **retains** ignored `.local/track-b`
data. Use separate browser profiles/private windows between modes because cookies
are shared across localhost ports. The [B1 authority](../decisions/OPEN_DECISIONS.md#web-002-b12--owner-approved-private-inspection-2026-10-23)
grants inspection only. [B2 authority](../decisions/OPEN_DECISIONS.md#web-002-b21--owner-approved-recorded-evidence-read-2026-10-23)
separately grants the bounded recorded-text read. Review decisions, rights edits
and diagnostics need their own scoped contracts and authorization.

## Reproduce verification

From the installed repository root:

```sh
npm run build
npm run test:student
npm run test:student:domains
npm run test:student:keyboard
npm run test:student:firefox
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
