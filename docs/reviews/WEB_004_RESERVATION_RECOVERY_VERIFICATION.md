# WEB-001/004 CREATED reservation recovery — 2026-10-23

Bounded client fix and integration evidence IMPLEMENTED / VERIFIED from `6982af2`,
branch `feat/track-b-data-auth`. Accountable implementer Codex Sol6.1; Luna was
previously usage-limited. Separate native Sol6.1/Medium `directory_review` reviewed
read-only. Existing autonomous local engineering authority applies. Owner AGENTS.md
and untracked reference research remain byte-preserved and excluded.

## Reproduced defect and fix

A reserved-attempt button previously called the general `startDemo` flow. Its
history read reconciled an expired reservation to CANCELLED, then the client tried
a replacement allocation instead of starting the specific original attempt. The
first actual late-start browser run displayed a misleading content-lock message;
a second baseline run asserted allocation request count and failed with2 instead
of1. No replacement committed in that baseline; the extra request was still wrong.

The persistent adapter now exposes an internal `startReservedAttempt(attemptId)`
which uses the existing frozen POST /attempts/{id}/start and GET of that same ID.
Success reads the original attempt. FORM_UNAVAILABLE reads its committed safe
cancellation state/reason. No allocation endpoint is called. Existing mutation
keys, identity fences, CSRF/authentication and backend rights checks remain in use.
This is an internal client method, not a new public API or contract. Other errors
still propagate through existing handling; no alternate questions are selected.

The specific reserved button uses this method. Cancellation reason survives the
existing display projection, and START_TTL_EXPIRED shows that the start deadline
passed and the reservation was cancelled without automatic replacement. Rights/
withdrawal reasons keep their own blocked-content behavior. No sealed question,
clock, form, manifest, assignment history or backend state-machine rule changes.

## Actual browser/transaction evidence

New [journey](../../scripts/student-reservation-journey.mjs) uses original isolated
READING2 stock, restricted runtime and actual frozen creation/start/read endpoints.
It allocates one CREATED reservation, verifies safe empty question/answer payload
and null running clocks, and reloads twice. Reload displays the ICT start-before
notice without starting or creating another attempt. Exact form, assembly manifest,
public/private snapshots, captured admission bound and two history rows persist.

The normal case verifies the required600-second TTL, explicitly starts the original
ID once, saves two answers and produces100% through real PostgreSQL grading.
The late case captures a real12-second admission cap while configured TTL remains
600. It then extends the ordinary offering to a day: the reservation's captured
bound stays unchanged. With worker/sweeper unavailable, actual DB time crosses the
stored bound while current offering remains open. Explicit start targets the
original /start once and commits CANCELLED/START_TTL_EXPIRED, null running clocks,
empty questions/answers, no replacement creation, jobs or scores. Snapshots/history
remain exact. No clock substitution, shortened TTL configuration or immutable-row
rewrite was used. Coordinator inspected the late-start screenshot and its reason.

The existing real-PG transport test additionally denies a foreign reserved start,
creates studentB's reservation, loses the actual successful start acknowledgement,
then retries the same start key/body. Original committed start/deadline stay exact;
there are only the expected two students' attempts. This injects client-side ACK
loss after a real200; it is not a database wire-failure claim.

## Executed verification

Node24.18.0/npm11.16.0, PostgreSQL18.6, Chromium155.0.8059.79, Linux.

| Command | Observed result |
|---|---|
| `npm run test:student:reservation` | PASS,24 inspected API responses/three screenshots |
| `npm run test:student:reservation:late` | PASS after fix,17 responses/three screenshots; current offering extended |
| `node --test tests/integration/student-runtime/transport.test.mjs` | 1/1 PASS, including foreign start/lost committed start ACK retry |
| `npm run test:student` | 31/31 PASS on final transport test |
| `npm run test:attempts` | 28/28 PASS |
| `npm run test:b0` | 31/31 PASS |
| `npm run test:student:browser` | PASS, default mixed-question browser regression |
| `npm run test:student:keyboard` | PASS,76 focus records/zero failures,18 AX smoke checks/22 responses |
| `npm run test:student:firefox` | PASS, existing mixed-question journey |
| `npm test`, `npm run test:consumers` | 106/106 and11/11 PASS |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS |
| Changed-script syntax, `git diff --check`, `npm run docs:check` | PASS; existing historical whitespace warning only |

Both baseline failures are retained above rather than represented as passes.
Initial fixed late test passed; final late run also passed after adding the
ordinary-offering extension and exact original start-path assertion. Reports and
screenshots under `/tmp/tsa-student-browser-evidence/reservation{,-late}` are
transient and regenerated by the commands. Existing module-type warning remains.
Full Bank/assembly/foundation suites were not rerun for this client-only change;
prior results are historical. Firefox was a default-flow regression, not a claim
that the new reservation-specific scenarios ran in Firefox.

Separate reviewer confirmed the original control-flow defect, reviewed final
client/journey/transport changes and reported no remaining concrete findings.
Independent existing persistent API3/state callback12 tests, syntax and whitespace
checks passed. Those15 tests do not directly exercise the new method. Reviewer
performed no PostgreSQL/browser execution; runtime results above are coordinator-
owned. Engineering review is not qualified human content/rights/accessibility
acceptance. No other writer or fabricated review was used.

## Continuation

No G1 contract, schema, dependency/lockfile, rights/review/publication capability,
retained inventory or mock API changed. No push/merge/deploy/Astra/paid model API,
live student inference or unauthorized publication. G1 accepted and G2/G3
OWNER_ACCEPTED remain unchanged. Full WEB/OPS/pilot acceptance, lawful inventory,
named qualified human review, manual AT/native zoom and Track A remain outstanding.
Owner files preserved; task reservations released; broad goal remains active.

Next bounded WEB-001/004 card: resume inside the <=60-second warning window.
Verify the accessible warning, monotonic countdown and persisted deadline through
reload/timezone changes using existing original fixtures and real clocks. Existing
browser coverage asserts ticking clocks/timezone separately but lacks an explicit
warning-on-resume assertion (repository search). Reuse current contracts/renderer,
repair only reproduced defects. Recommended Sol6.1/High while Luna is usage-limited;
separate Sol6.1/Medium read-only engineering review. Manual AT remains distinct.
