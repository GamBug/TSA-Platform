# WEB-001/004 ordinary admission edits and owned resume — 2026-10-23

Bounded client fix and browser evidence IMPLEMENTED / VERIFIED from `76af373`,
branch `feat/track-b-data-auth`. Accountable implementer Codex Sol6.1; Luna was
previously usage-limited. Separate native Sol6.1/Medium `directory_review` reviewed
read-only. Existing local engineering authority applies. Owner AGENTS.md and
untracked reference research remain byte-preserved and excluded.

## Reproduced defect and precise boundary

The actual baseline browser failed because a future ordinary offering window hid
the catalog start action for a valid owned CREATED reservation. Existing client
card gating required domain.available even for start/resume of that original
attempt. This contradicted the approved non-retroactive ordinary-schedule policy.

The assigned main.js changes keep same-domain owned CREATED/IN_PROGRESS actions
available on card/details and in the usable-domain filter. Future entries disclose
question count/duration and ICT admission dates, use the accurate 'not open' label,
and allow details. A candidate with no active attempt has disabled new-start
controls on both card and details. All actual start/read operations still use the
existing restricted backend; ordinary schedule edits do not override rights,
withdrawal, security, original start-before or running deadline guards.

Discovery correction: SQL017 intentionally omits elapsed offerings from catalog.
The earlier static review suggestion that an elapsed card needed a closed label
was incorrect. No expired entries were invented and the frozen catalog/API was
not changed. Existing owned-attempt callout can resume the original attempt even
when its offering no longer appears. This path is now demonstrated, not redesigned.

## Actual PostgreSQL/browser journey

New [journey](../../scripts/student-admission-journey.mjs) creates an original
isolated READING2 reservation while open, then changes only ordinary offering
metadata. Future-window reload preserves the owned reservation; catalog card,
details and usable filter expose its original start. A separate candidate sees
future metadata/ICT dates, cannot trigger a new-start control, and an explicit
negative API request gets409 FORM_NOT_OPEN with no additional attempt.

Honolulu timezone override is actually applied (UTC offset checked); future ICT
facts remain identical across candidate changes. StudentA explicitly starts the
original ID once, saves the first answer and resumes it through the future card.
After an ordinary edit makes the offering elapsed, catalog omits it for both
candidates. StudentB's explicit negative creation gets410 FORM_UNAVAILABLE. Owned
callout resumes studentA's same IN_PROGRESS attempt and acknowledged answer.
Second answer and normal submission yield100% despite closure of new admission.

Exact sealed form/assembly manifest/public+private snapshots, captured admission
bound/history and started/deadline clocks remain unchanged. Total committed
attempts1; start requests1; creation requests3 comprise initial successful creation
and the two deliberate negative API probes. No automatic replacement allocation
occurs. Disabled-button evidence uses actual CDP pointer presses/releases after
scrolling and hit-testing the native disabled control; the ordinary enabled-only
click helper is not used for those negative checks. No server response, clock,
content approval or publication authority is mocked.

## Executed verification and failures

Node24.18.0/npm11.16.0, PostgreSQL18.6, Chromium155.0.8059.79, Linux.

| Executed command | Observed result |
|---|---|
| `npm run test:student:admission` | Final separate run PASS,40 inspected responses/four screenshots |
| `npm run test:student` | Separate rerun31/31 PASS, zero failures/cancellations/skips |
| `npm run test:attempts` | 28/28 PASS |
| `npm run test:directory` | 9/9 PASS |
| `npm run test:b0` | 31/31 PASS |
| `npm run test:student:browser` | PASS, default mixed-question journey |
| `npm run test:student:keyboard` | PASS,75 focus records/zero failures,18 AX checks/22 responses |
| `npm run test:student:domains` | PASS, three independent profiles/78 responses |
| `npm test`, `npm run test:consumers` | 106/106 and11/11 PASS |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS |
| Changed-script syntax, `git diff --check`, `npm run docs:check` | PASS; historical whitespace warning only |

Baseline failure proved the missing original-start control. An initial post-fix
harness failure still waited for an elapsed catalog card; the helper was corrected
to wait for the catalog grid, consistent with SQL017. Independent review also
caught use of an enabled-only click helper for disabled controls; the final pointer
helper preserves native disabled behavior instead.

A concurrent verification batch then hit an8-second CDP Runtime.evaluate/body-read
timeout, and the standard student suite reported30 passes/one cancelled opt-in
rejection test at its15-second bound. Both runs were confirmed terminal, then the
admission command and unchanged standard student suite were rerun separately and
passed. Host load was observed high; contention is a possible cause, not proven.
No timeout was increased or failure silently counted as a pass. These results are
not measured production capacity/SLO evidence. Existing module-type warning remains.

Transient reports/screenshots: `/tmp/tsa-student-browser-evidence/admission`.
Coordinator inspected the disabled future-details screenshot and ICT disclosure.
Commands regenerate artifacts. Full Bank/assembly/foundation and Firefox were not
rerun for this client-only change; previous results remain historical.

Independent reviewer confirmed the P2 resolution and catalog omission correction,
reviewed main/journey/runner, reported no remaining concrete P1/P2 and independently
passed state callbacks12/12, syntax and whitespace. Those12 tests do not directly
exercise the new catalog branch; actual browser/PG execution belongs to coordinator.
Reviewer performed no browser/PG execution or file edits. This is engineering review,
not qualified human content, rights or accessibility acceptance.

## Handoff and next execution

No G1 contract, schema, backend function, dependency/lockfile, rights/review/
publication capability, mock API or retained inventory changed. No push/merge/deploy,
Astra, paid model API, live student inference or unauthorized publication. Owner
files preserved, task reservations released; broad goal stays active. G1 accepted
and G2/G3 OWNER_ACCEPTED unchanged. Full WEB/OPS/pilot, lawful inventory, named
qualified human review, manual AT/native zoom and Track A remain outstanding.

Next bounded WEB-001/004 card: two-tab same-candidate allocation conflict recovery.
Existing domain browser probes the raw409 contract; the transport's actual409 catch
path lacks explicit two-tab browser evidence. Hold genuine empty-history responses
until both clients are ready, release normal requests, verify one201/one409,
original-ID recovery in both tabs, one form/history assignment and unchanged
clocks. Reuse existing real-DB concurrency tests as locking evidence; do not mock
conflict responses or add idempotency promises. Recommended Sol6.1/High while Luna
is usage-limited, separate Sol6.1/Medium read-only review. No implementation of that
next card is claimed here.
