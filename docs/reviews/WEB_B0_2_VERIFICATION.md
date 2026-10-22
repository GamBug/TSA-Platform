# WEB-B0.2 — Research-informed exam UX evidence

Date: 2026-10-20, Asia/Bangkok. Accountable integrator: Codex Sol 6.1.
Starting branch `feat/track-b-data-auth`, HEAD `f72f6a8`; all work uncommitted.
Owner-authorized local implementation; no G2/G3 or production acceptance.
Pre-existing AGENTS.md, main.js, styles.css modifications and untracked
`docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md` (owner local research, not checkpointed) preserved.

## Evidence classification and prioritization

The research report records authenticated observations; this work does not
repeat external access or independently authenticate its temporary screenshots.
VERIFIED below means directly observed in that supplied report. INFERRED means
our original implementation choice, never a reference-confirmed behavior.
UNAVAILABLE means the report has insufficient observation.

| Finding / classification | Impact / complexity / regression risk | Reuse and dependencies | Resolution / required evidence |
|---|---|---|---|
| Bookmark separate from navigator, VERIFIED | High / low / low | Existing attempt/slot IDs; tab-local metadata | Implemented; reload, toggle, attempt isolation |
| Answered/review/unanswered navigator, VERIFIED | High / medium / medium | Existing nav/save guards; no future sections returned | Implemented filters/modal; pending save and direct jump tests |
| Live submission counts, VERIFIED | High / low / medium | Existing acknowledged answers/confirmation | Implemented; cancel/confirm and marked count tests |
| Saved answers and countdown, VERIFIED | High / existing / high | Existing mock service; immutable running deadline | Preserved; delayed/offline/retry/reload/privacy tests |
| Single-choice and true/false groups, VERIFIED | High / medium / high | Existing mock only; strict validation and released review | Single choice preserved; true/false cycle below |
| Catalog filters/detail, VERIFIED | Medium / low / low | Existing domain cards/intro | Availability filtering and intro tested; original local filter semantics INFERRED |
| Result counts/time/status, VERIFIED | Medium / low / medium | Existing server grade and closure timestamps | Correct/incorrect/skipped/time, selected answer status implemented; no official score model |
| Inline and separate explanation review, VERIFIED | High / medium / high | Explicit owned GRADED mock review request only | Implemented disclosure, focused review, filters; no pre-release private response fields |
| Compact timer/footer, VERIFIED desktop layout | High / low / medium | Existing exam header/nav | Sticky responsive adaptation INFERRED; local 1440/768/390 tested |
| Mobile results collapse, VERIFIED; mobile exam UNAVAILABLE | Medium / medium / medium | Original existing responsive shell | Original local layouts tested; no reference mobile-exam fidelity claim |
| Sequential locked full-exam sections/mode/fullscreen, VERIFIED | High / high / high | Conflicts with current one-domain offering; future approval/services | BLOCKED for integrated sequencing; do not fabricate future section data or combine attempts |
| Calculator/notes/report/exclusion visible, VERIFIED; detailed behavior UNAVAILABLE | Lower than delivery / medium / medium | New tools and reporting service | NOT IMPLEMENTED; no claim about reference tool behavior |
| Warning/expiry/retry policy, UNAVAILABLE in reference | High / existing / high | Current mock authoritative closure, not reference speculation | Existing engine/API boundary tests; local warning choice INFERRED |
| Sharing/leaderboard/topic analysis, VERIFIED visible surfaces | Lower / medium / medium | No meaningful stock/history/analysis services | NOT IMPLEMENTED; do not fabricate metrics or external actions |

## Cycle 1 — navigation and results

IMPLEMENTED: bookmarks scoped to attempt and tab, graceful unavailable storage,
filtered accessible navigator with empty state, live submit counts, availability
catalog filters, sticky timer/footer, correct/incorrect/skipped/time result metrics,
selected answer review, filtered/paged focused review, collapsed explanations,
explicit inline result details. Stale released-review responses cannot replace a
screen after its trigger is removed. No API/DB/scoring/auth changes in this cycle.

Files: `public/app/main.js`, `public/styles.css`, `scripts/verify-b0-browser.mjs`
plus coordinated backlog/decisions/state/handoff and prototype README records.
Luna / XHigh owned exam DOM helpers; Sol owned catalog/results/styles/harness.

Executed on Node24.18.0/npm11.16.0, system Chromium155:

- `node --check apps/practice-prototype/public/app/main.js` and browser harness:
  PASS; `git diff --check`: PASS.
- `npm run test:b0`: PASS11 tests/2 suites with permitted loopback execution.
  Restricted invocation reported only three wrapper files; not accepted as nested
  HTTP test evidence.
- `npm run test:b0:browser`: PASS, expanded 1440x900, 768x1024, 390x845 journey.
  Catalog filter/instructions, bookmark/reload, navigator filter/direct jump,
  pending save guards, clear/re-answer, offline failure/retry, unchanged resume
  attempt/deadline, ticking/sticky timer, submit counts/cancel/confirm, result
  25.00%, inline details, review paging/filter/disclosure, no overflow, no uncaught
  exceptions/external requests or private pre-submit response fields.
  Eleven screenshots/report at `/tmp/tsa-b0-browser-evidence`; transient.
- `npm run typecheck`, `npm run build`, `npm run test:built`,
  `npm run contracts:check`, `npm run contracts:consumer-check`: PASS.
- `npm test`: PASS106 tests; `npm run test:consumers`: PASS11 tests,
  with permitted subprocess/loopback execution.
- `npm run docs:check`: PASS with Git-backed permitted execution (49 tracked
  Markdown files,245 links,zero errors). Restricted fallback also reads untracked
  research and FAILS its existing trailing whitespace. Original research/hash and
  input bytes preserved; untracked evidence checked separately at finalization.
- Explicit Playwright Chromium1248 first failed to launch due to absent usable
  sandbox; installed system Chromium155 succeeded without disabling its sandbox.

Independent review: native tsa_reviewer (actual Sol6.1 / Medium), read-only review
of main.js/styles/harness. Found missing disabled states on new navigator/bookmark
controls during saves; coordinator fixed both and added delayed-save assertions.
Reviewer confirmed repair and no remaining concrete findings in cycle1 diff.
Reviewer executed syntax/scoped diff checks, inspected browser report/mobile
screenshot, and did not independently rerun the browser. No full WCAG claim.

## Cycle 2 — true/false interaction and functional shell

IMPLEMENTED/VERIFIED in the isolated mock. Slots1–3 retain the existing
single-choice fixture; slot4 contains original arithmetic true/false test content.
The six-minute duration, one-domain attempt and closure lifecycle are unchanged.
Partial group choices persist but do not count completed; clearing is supported;
only an exact full group earns one practice point. Strict per-slot input parsing
rejects duplicates, unknown IDs, missing/mistyped fields and foreign/expired
writes without mutating answers. The engine independently rejects invalid group
objects. Selected/correct statements and explanations remain owned-GRADED only.

The mock transport now accepts typed statement-group values while retaining legacy
single-choice calls. This is a compatible isolated-demo extension, not a frozen
production DTO change. No package export, dependency, schema, auth, real attempt,
scoring policy, allocation, question-reuse or publication contract changed.

Functional home/catalog/result controls replace decorative product navigation.
The mobile shell has an accessible menu disclosure; the active attempt uses a
compact header. Inline result answer details have all/incorrect filters; the
focused review has paging and explanation disclosure. Corrected catalog wording
keeps independent domains and removes unsupported per-section reference durations.

Files added to cycle1 scope: `public/app/api.js`, mock `src/exam-engine.mjs`,
`src/mock-api.mjs`, `src/private-question-fixture.mjs`, client/API tests, root and
prototype READMEs. Luna owned implementation/tests; coordinator integrated
header/styles/browser harness/docs. All writer reservations are released.

Final observed commands/results (Node24.18.0/npm11.16.0, Chromium155):

| Executed check | Observed result | Scope/limits |
|---|---|---|
| `npm run test:b0` with permitted execution | PASS15 tests,2 suites,0 failures/skips | Actual nested mock/client/server checks; restricted worker run showed only3 file wrappers |
| `npm run test:b0:browser` | PASS,17 screenshots | 1440x900,768x1024,390x845; actual browser local HTTP |
| `npm run test:track-b:browser` final rerun | PASS | Existing real staff login/draft retry/persistence and candidate denial |
| `npm run test:local` | PASS13 | Actual PostgreSQL/HTTP; no production acceptance |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 | Frozen code unchanged after cycle1; no new dependency |
| Typecheck/build/emitted smoke/drift | PASS | Commands recorded in cycle1; contracts unchanged |
| Final `contracts:consumer-check`, JS syntax and scoped `git diff --check` | PASS | Public import boundary retained |
| Final Git-backed `npm run docs:check` | PASS49 Markdown/246 links,0 errors | New untracked evidence separately checked for links/fences/whitespace: PASS |
| `npm run dev:b0` | EADDRINUSE | Existing listener on4173 preserved |
| `PORT=4175 npm run dev:b0` plus HTTP fetch | PASS HTTP200, Vietnamese HTML | Task-owned process stopped with Ctrl+C; owner listener untouched |

Final browser checks include SC clear/save, group pending-save disabling,
partial-group reload, full group keyboard selection, offline group rollback/retry,
clearing, bookmark reload, navigator filters, no horizontal overflow, sticky
mobile timer, live submit counts, cancel/confirm, result25.00%, inline filters,
selected/correct group review, expanded/collapsed explanations, and no uncaught
exceptions/external page requests or private pre-submit response fields.

Automatic expiry is verified using the existing server factory with an injected
clock in a harness-only child process; private parent/child IPC advances the
clock, reload resumes in the final second, the browser transitions to the expiry
result and a late answer returns409. No app time-control route/flag was added.
Screenshots/report remain transient under `/tmp/tsa-b0-browser-evidence`.
Coordinator visually inspected mixed answer/review and mobile shell captures.

Intermediate failures were repaired before final acceptance: an early run during
in-flight client/API edits timed out on save; added reload invalidated delayed CDP
response identifiers until the harness inspected bodies before each reload.
The reviewer’s initial restricted child test returned a generic file failure;
independent `node --test --test-isolation=none` over mock/client tests subsequently
PASS13,0 failures. These failed/transitional runs are not passing evidence.

Final independent read-only review: native tsa_reviewer (Sol6.1/Medium), actual
app/API/engine/fixture/test/harness changes; independent13 API/client tests,
syntax/scoped diff checks PASS. Save-control and adjacent review-text findings
resolved; final report/screenshots inspected, no outstanding concrete findings.
Reviewer did not independently rerun Chromium. No second-browser, screen-reader,
full WCAG, deployed security, real student-service or G2/G3 acceptance claim.

## Remaining dependencies and continuation

DEMO ONLY: all student content, session, timing, answer saves, grading and released
review use isolated in-memory services; stopping the server loses attempts.
Bookmarks are tab-local. Integrated local staff identity/Bank persistence remains
real PostgreSQL and separate from student delivery.

BLOCKED: production student integration requires named independent human review,
lawful approved stock/publication, G2 disposition and accepted assembly/attempt/
closure/scoring services. Sequential combined-exam sections additionally require
separate product approval; do not synthesize locked future sections or a shared
150-minute clock under the current one-domain contract.

NOT IMPLEMENTED: other live question formats, calculator/notes/report/exclusion,
sharing/leaderboard/topic analysis, full-exam mode/fullscreen gating, real student
history/authentication and durable examination persistence. The report has no
verified detailed interactions for several of these tools/types. No protected
content or external attempts were introduced. Highest-value next work is
BANK-002 human-controlled publication and lawful stock, then existing B1 services
and adapter integration; no architecture gate was advanced here.
