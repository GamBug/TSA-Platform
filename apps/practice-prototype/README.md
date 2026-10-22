# Local practice prototype

This dependency-free browser prototype demonstrates a short practice flow with local mock data. It is unofficial and does not provide TSA scoring, approved learning content, accounts, durable storage, question selection, or a production backend.

## Run locally

From the repository root, start the loopback-only server:

```sh
node apps/practice-prototype/server.mjs
```

Open <http://127.0.0.1:4173>. To use a different local port, set `PORT` when starting the server. The mock session and answers live only in server memory and are cleared when the process stops.

Choose **Chọn bài luyện tập**, filter available demos, and open the Toán học
instructions or start directly. The timer is six minutes. Positions 1–3 repeat
the existing single-choice fixture; position4 is an original synthetic arithmetic
true/false group. All are test content, not approved TSA inventory. Select or
clear choices, bookmark a question, use the filtered question navigator, and
review answered/unfinished/bookmarked counts before confirming submission.

Reloading in the same browser resumes acknowledged answers and the original
deadline while the server process remains running. Partial true/false selections
are saved but the question remains unfinished until every statement is answered.
The group earns one point only when every statement is correct. Bookmarks live
in tab-scoped sessionStorage, independently of server answer saves; they clear
on completion/cancellation and degrade to memory if browser storage is unavailable.

Results show unofficial correct/incorrect/unfinished counts and elapsed time.
**Chi tiết đáp án** explicitly loads released inline answer details;
**Ôn tập đáp án** opens focused question review with previous/next, answer filters
and expandable explanations. The score response remains free of keys/explanations.
The catalog lets you explicitly start another demo; Đọc hiểu and Khoa học remain
unavailable. No automatic cross-domain transition or combined exam is implemented.

The catalog uses a grouped responsive grid with real availability counts; only
Toán học is enabled. **Xem chi tiết** opens the measured detail/introduction
layout with breadcrumbs, genuine demo structure and the existing start/resume
action. Three cards represent domains, not a replicated reference exam bank.

The measured exam workspace uses a compact persistent header/timer and footer,
an independently scrolling question column, and a bottom counter that opens the
question drawer. Press Escape to close the drawer. Submission requires explicit
confirmation. The result ticket shows raw demo counts and percentage; focused
review opens a warm explanation pane beside the question at desktop/tablet
widths and below it on mobile. The solution heading stays visible during scroll.
Be Vietnam Pro is bundled locally under OFL1.1; no runtime font service is used.
See [direct-observation evidence](../../docs/reviews/WEB_B0_3_VERIFICATION.md) for
measurements, verification and capture limitations.

The single-choice fixture is from
[`packages/contracts/test/question.test.ts`](../../packages/contracts/test/question.test.ts).
The arithmetic true/false fixture is original synthetic test material in the
server-only `src/private-question-fixture.mjs`. No reference-site question content,
assets, branding or code was reused. The owned GRADED review route alone exposes
keys and explanations; active/foreign sessions cannot read them. The mock service
scores only after submission or expiry.

## Tests

Run the focused Node tests with:

```sh
node --test apps/practice-prototype/test/*.test.mjs
```

They cover mock-session and answer handling, partial/complete/cleared true/false
answers, exact-match group scoring, timer/closure, resume, review authorization,
strict per-slot validation, private-field exclusion and static public boundaries.

Run `npm run test:b0:browser` for the installed-Chromium journey (no download).
It exercises save delays/offline retry, bookmarks, filters, original deadline
resume, submission and released inline/focused review at1440/768/390 widths.
Screenshots/report are written to `/tmp/tsa-b0-browser-evidence` by default;
`B0_BROWSER` selects an installed browser and `B0_ARTIFACT_DIR` selects output.
See [latest executed evidence](../../docs/reviews/WEB_B0_3_VERIFICATION.md) for observed
results and limitations.

## Default mock server limits

The default mock server binds to `127.0.0.1` and has no external requests. Its random session cookie is only an in-memory demo handle, not authentication; the review ownership check is not a production access-control mechanism. It does not use a database, persist progress, select fresh questions, verify content permissions, or provide real exam services. Client code and browser assets are public; the prototype demonstrates server-side separation of the answer key and a post-grade review boundary, but it is not a deployment or browser-bundle security assessment.

## Persistent local staff mode

The existing frontend also supports the owner-authorized synthetic staff adapter:

```sh
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b
```

Requires the root dependencies and PostgreSQL18.6 tools (`PG_BIN` optional).
Open <http://127.0.0.1:4174>, choose the staff workspace, and log in as the synthetic
author. Edit the existing question text/options, private key and explanation;
create a DRAFT and refresh. Reload and restart preserve records in ignored
`.local/track-b`; Ctrl+C gracefully stops this app's database, retaining its data.
Reviewer/Bank Manager profiles can see metadata only. The candidate profile is
denied draft access. Logout invalidates the local session. Mock-only `dev:b0`
reports that this workspace is unavailable.

Source rights remain UNKNOWN; this staff UI offers no approval or publication controls.
The private template is delivered only after server-side AUTHOR authorization;
it is absent from public assets. This mode adds real PostgreSQL identity/session
and Bank draft persistence, while the practice exam still uses mock services.
Synthetic roles do not establish production authentication or human review.

`npm run test:local` verifies real PostgreSQL/HTTP boundaries and restart
persistence; `npm run test:track-b:browser` exercises login, lost-response retry,
one persisted draft, candidate denial and the mock-only unavailable state.
Desktop/mobile screenshots are written to `/tmp/tsa-track-b-browser-evidence`.

To start an independent mock preview, run `PORT=4176 npm run dev:b0` and open
`http://127.0.0.1:4176`. No running preview is implied by this checkout.

## Retained local student mode

```sh
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true LOCAL_STUDENT_ENABLED=true npm run dev:track-b
```

Open the printed `/?student=postgres` URL in a dedicated private browser session.
The same local workspace serves staff and student APIs, with separate restricted
identity, Bank, exam and grading-worker PostgreSQL logins. Existing student
allocation/delivery/save/submit/result handlers and the expiry/grading loop are
reused. The migration owner connection closes before serving requests.

The default owned database remains `.local/track-b`. Optionally set
`TRACK_B_DATA_DIRECTORY` to an absolute private path; existing ownership/path
checks apply. `PORT=0` chooses an ephemeral loopback port. Ctrl+C drains the app
and worker before stopping its owned PostgreSQL process; it retains the data.
Sessions and author drafts persist across restart. Exam/worker roles are
provisioned only with `LOCAL_STUDENT_ENABLED=true`; other values besides `false`
or unset are rejected. Omit this opt-in for the existing staff-only behavior.

A fresh workspace has no blueprint offerings or eligible questions, so its catalog
is empty. No synthetic draft, review decision, rights assertion or eligible stock
is provisioned by this command. Existing publication and rights gates still apply.
This is local synthetic identity, not production authentication or deployment.
Actual retained-workspace verification covers empty stock and draft/session
persistence; it does not claim a retained approved exam journey. The disposable
demo below separately exercises the complete synthetic exam flow.

## Disposable PostgreSQL student demonstration

Use the pinned Node/npm/PostgreSQL toolchain from the repository root:

```sh
npm ci --ignore-scripts
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student
```

Open the printed `http://127.0.0.1:<port>/?student=postgres` URL. Choose synthetic
candidate A explicitly, start the available practice, answer the mixed question
types, submit, wait for background grading, and open the released review. Reload
preserves the attempt and acknowledged answers while this process remains running.
Ctrl+C stops the owned runtime and discards the disposable database. A fresh run
creates a fresh isolated fixture; this command is not persistent stock provisioning.

This opt-in launcher uses original engineering fixtures and simulated review roles
inside the existing postmaster-bound test scope. It refuses production/missing
opt-in flags and does not publish to any persistent or production Bank. No real
content-rights evidence, qualified human approval or official score is implied.
Candidate B has separate ownership. No question identity is selected automatically
for a real student and no live model is called. The ordinary `dev:b0` command still
starts only the in-memory mock service.

Automated actual PostgreSQL browser commands:

```sh
npm run build
npm run test:student
npm run test:student:browser
npm run test:student:reservation
npm run test:student:reservation:late
npm run test:student:warning-resume
npm run test:student:admission
npm run test:student:allocation-race
npm run test:student:domains
npm run test:student:reading
npm run test:student:rate-limit
npm run test:student:rate-limit:attempt
npm run test:student:rate-limit:expiry
npm run test:student:rate-limit:expiry:attempt
npm run test:student:closed-save
npm run test:student:keyboard
npm run test:student:expiry
npm run test:student:firefox
```

Chromium/Firefox/geckodriver must already be installed; these commands download no
browser. See [persistent integration](../../docs/reviews/WEB_004_PERSISTENT_STUDENT_VERIFICATION.md)
and [keyboard/cross-browser evidence](../../docs/reviews/WEB_004_ACCESSIBILITY_CROSS_BROWSER_VERIFICATION.md)
for executed scope and limitations. Keyboard AX/reflow checks do not establish
qualified screen-reader testing, native page zoom or WCAG conformance.

The two rate-limit commands exercise USER_SAVE and ATTEMPT_SAVE independently
against actual PostgreSQL budgets and wall-clock refill. An unacknowledged choice
stays visibly unsaved and blocks navigation/submission; explicit same-key retry
saves once. Submission succeeds without modifying either save budget. These
commands use disposable original synthetic reading fixtures, not approved inventory.
The expiry variants keep the second correct choice pending until the actual eight-
second deadline. The timer reconciles expiry, and only the first acknowledged
answer is scored (50%); the unsaved draft is never retried or submitted.

The reservation commands exercise an already allocated CREATED attempt. Reload
leaves it unstarted; explicit start targets that attempt. The late case uses a
real short admission cap with the mandatory600-second TTL unchanged, then extends
the offering to prove the captured deadline still applies. Expiry shows the
server's cancellation reason and never allocates a replacement automatically.

The warning-resume command observes the existing polite/atomic status region on
an actual45-second attempt. It verifies one warning in each loaded document,
including resume as required by the engine specification, without repeats during
ticks/save/navigation. Actual Honolulu/ICT timezone overrides and reload preserve
the original server deadline and acknowledged answer. This is automated semantic
coverage, not qualified screen-reader acceptance.

The admission command changes ordinary offering windows after a reservation.
Future windows still expose the original owned start/resume and ICT dates while
blocking new creation. Elapsed offerings remain absent from the server catalog;
the owned-attempt control resumes the original exam with its saved answer and
clocks. A separate candidate exercises the actual future409 and elapsed410 guards.
These ordinary edits do not override rights, withdrawal or security restrictions.

The allocation-race command opens two tabs for the same candidate. Both pause
only genuine empty-history responses, then send ordinary distinct-key creation
requests. A real201/409 pair recovers the same attempt/form/clocks; acknowledged
answers cross reloads and both tabs reach the same100% result. This verifies client
conflict recovery; the existing PostgreSQL barrier tests establish locking behavior.

The closed-save regression uses two real browser tabs against an isolated
PostgreSQL fixture. One tab submits while the other tries to save; an offline
state-read retry preserves its pending edit. A second scenario loses a committed
save acknowledgement before other-tab submission. Reconciliation explains that
scoring uses server-recorded answers and does not falsely label that saved answer
as excluded. These fixtures establish workflow behavior, not human approval.

For the explicitly disposable three-domain demonstration:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains
```

Select MATH4, READING2 or SCIENCE4 explicitly in the printed student catalog.
The original synthetic fixtures configure independent360/180/360-second clocks;
these are project timings, not official examination rules. Only one active attempt
is permitted across domains. Each result names its domain and has its own score,
review and history entry; completing a test does not start another automatically.
Ctrl+C discards this owned temporary database. Omit the domains command to retain
the existing mixed-MATH demo. Malformed `STUDENT_FIXTURE_DOMAINS` values are rejected.
These standalone fixtures do not establish shared-reading-stimulus/bundle support,
lawful question inventory, content quality or qualified human review. The retained
workspace continues to seed no eligible stock.

For an explicitly disposable shared-passage READING2 demonstration:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:reading
```

Select candidate A and the reading test. Both ordered questions use one original
Vietnamese passage, a180-second project clock and separate answer scores. Save,
reload, submit and inspect the released explanations. This profile is mutually
exclusive with `STUDENT_FIXTURE_DOMAINS=true`; malformed reading flags are rejected
before fixture creation. Ctrl+C discards the private fixture. It does not create
retained stock or establish lawful inventory, qualified human content review,
official examination timing/scoring or manual accessibility acceptance.
[Executed HTTP/browser and rights-revocation evidence](../../docs/reviews/WEB_001_SHARED_READING_VERIFICATION.md).
