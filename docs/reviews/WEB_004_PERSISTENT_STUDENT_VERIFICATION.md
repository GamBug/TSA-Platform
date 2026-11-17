# Persistent student client integration

2026-10-22, branch `feat/track-b-data-auth`, base `ccc14e0`.
Accountable implementer: Codex Sol. Native Luna/XHigh implemented the coordinated
existing client changes; Sol implemented transport, integration repairs and actual
PostgreSQL/browser verification. A separate read-only native Sol6.1/Medium reviewed
both components. This is engineering review, never qualified human content review.
Owner continuation authorizes this bounded integration; G1 contracts are unchanged.

## Implemented behavior

Explicit `?student=postgres` selects the existing local synthetic candidate auth
and frozen catalog/attempt/answer/submission/result APIs. There is no mock fallback,
automatic candidate identity, question seed or publication privilege. Default demo
mode remains available. The static server allowlists exactly the new transport
module; private fixture/source paths remain inaccessible.

The client presents actual catalog/history and resumes persisted attempts. CREATED
attempts require explicit start. Saves display only acknowledged revisions, retain
an unknown-outcome retry key, and reconcile conflicts explicitly. Single choice,
multiple choice and true/false groups use the frozen typed payloads. Multiple-choice
selections below the configured minimum stay visibly unsaved and block navigation
and submission. Opaque statement IDs remain safe; clearing uses the existing API.

Pending submissions wait for the separate background worker. Ordinary results show
released practice scores; review makes a fresh owner-only result request. Rights
revocation clears private content. Logout clears private DOM immediately; identity
generations fence delayed successes and authentication errors, including paginated
history and retry-key caches. Navigation resets when the attempt identity changes.
Text, Vietnamese, raw TeX/accessibility text and structured tables render without
executable markup or external resources. No mathematical renderer dependency added.

## Actual verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6/Chromium155.0.8059.79, Linux,
2026-10-22. All positive inventory is original disposable synthetic engineering
content in postmaster-bound fixture scope; no lawful production inventory or human
review is claimed. Real PostgreSQL transactions and actual loopback HTTP were used.

| Executed command | Observed result |
|---|---|
| `npm run test:student` | 6/6 PASS, including new actual transport/auth/PG test |
| `npm run test:b0` | 21/21 PASS, including transport3 and stale identity2 |
| `npm run test:local` | 13/13 PASS |
| `npm run test:b0:browser` | PASS, existing demo Chromium regression |
| `node scripts/verify-student-browser.mjs` | PASS, real mixed-type PostgreSQL browser journey and six screenshots |
| `npm run typecheck`, `build`, `test:built` | PASS |
| `contracts:check`, `contracts:consumer-check` | PASS |
| `npm test`, `npm run test:consumers` | 106/11 PASS on permitted rerun |
| `npm run docs:check` | FAIL: unchanged owner research whitespace and four missing temporary screenshot links |

The new PostgreSQL test proves actual candidate session/CSRF rotation, lost committed
save acknowledgement replaying one revision, second-tab revision conflict, clear,
all three response types, queued grading/result/history and foreign ownership denial.
The browser proves explicit candidate login, actual safe mixed-type question delivery,
actual offline save failure with no database write and explicit same-key reconnect
retry, and a second Chromium tab committing a newer revision that the stale tab
cannot overwrite before explicit reload/reconciliation,
lost committed acknowledgement with explicit retry, unsaved selection guards, delayed
old-account history rejection after A-to-B login, original clocks/answers after fresh
document reload, countdown resistance to forward/backward wall-clock and timezone
changes, pending grading while the worker is unavailable, recovery to 100%,
HTTP runtime restart with the same PostgreSQL/session/result, and fresh review denial
after real source-rights revocation. It also checks foreign result404, explicit
rights-constrained inventory shortage, actual API response privacy, absence of mock
and external requests, uncaught exceptions and desktop/mobile horizontal overflow.
Screenshots/report are temporary artifacts under `/tmp/tsa-student-browser-evidence`;
coordinator inspected the exam and fresh restored result images. They are not a
hosted-browser or deployment claim.

Independent review: separate `/root/directory_review` Sol6.1/Medium actually inspected
transport/client/tests and final changes, independently executed transport3, stale
identity2 and real-PG transport1, and ran syntax/scoped whitespace checks. Two P2
findings (old navigation index and late account history response) were reproduced,
fixed and independently retested. Final report: no open P1/P2. It read coordinator
Chromium evidence and inspected mobile output; it did not rerun Chromium. The
separate reviewer also inspected the final offline/second-tab assertions and
resource cleanup, reporting no open findings. Luna executed the expanded actual
Chromium/PostgreSQL journey successfully; Sol independently reran the final script
with exit0. The final socket-cleanup finding is closed. Neither run is a human
content review or screen-reader test.

Earlier in this same continuation, unchanged backend regressions passed directory9,
Bank94, assembly23, foundations34, attempts28, grading21, results6, recovery16, auth5,
contracts106 and emitted consumers11; see the directory verification record. No
backend mutation was introduced by the client integration. Restricted contract runs
can fail at subprocess wrappers; these are failures, not passing nested tests.

## Checkpoint and preservation boundary

New transport, unit tests, mixed fixture and real-PG transport test can be checkpointed
independently of the owner UI. Only the two new static-server allowlist/MIME entries are staged. The existing
`main.js` integration and new browser/state tests remain reviewable in the working tree wherever they overlap
or depend on the owner's uncommitted baseline. Do not stage whole owner files or
claim a clean clone contains the integrated UI. The final handoff records the actual
checkpoint hash and any narrowly staged static-server lines.

Owner baselines for `main.js`, `api.js` and `server.mjs` were preserved under
`/tmp/tsa-client-owner-baseline`; the earlier owner snapshot is under
`/tmp/tsa-results-preserve`. AGENTS.md SHA256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
No push, merge, deployment, paid API, Astra, live student LLM or publication occurred.

Clean-source checkpoint verification: `e8a5f5b` was cloned with --no-hardlinks to
`/tmp/tsa-student-e8a5f5b-clean`; build/student6/B0 14 PASS without the owner changes.
The clean prototype count differs from worktree21 because owner regressions and
the UI-dependent state tests remain unstaged. Offline npm ci failed ENOTCACHED for
zod4.1.12; the successful checks used a copy of already-installed pinned dependencies,
not a successful fresh installation. The first hardlink clone failed across devices.

## Actual deadline-expiry continuation

`STUDENT_EXPIRY_TEST=true node scripts/verify-student-browser.mjs`: PASS in actual
Luna and independent coordinator Sol runs on Chromium155/PostgreSQL18.6. Default
browser journey also rerun by Luna: PASS. `npm run test:student`:6/6 PASS again.
The fixture accepts a bounded optional duration before blueprint hashing/allocation;
default600 is unchanged. Expiry mode uses8 seconds in an isolated disposable DB.

One correct SC answer is acknowledged before the original deadline. SQL verifies
page departure still precedes that deadline; the page stays away while actual DB
time crosses it and the worker/sweeper capability is unavailable. Reload performs
owned history and attempt reads, producing EXPIRED/PENDING with closure exactly at
the original deadline. It does not establish which read caused reconciliation.
Repeated reload creates no duplicate job or submit POST. Recovery completes the
original digest-bound job and releases exactly1/4,25.00%, four score items and one
active result release. PostgreSQL timestamp text, sealed form/snapshot hashes,
manifest hash, assignment history, saved answer/revision and grading digest remain
unchanged before/after closure and grading. At least five actual API responses are
privacy-inspected. No sealed clock or question is mutated to accelerate time.

Separate Sol6.1/Medium independently inspected both final test files and closed the
raw DTO-field, reconciliation-causality and response-count findings; no open P1/P2.
It did not execute Chromium. Earlier assertions were corrected before the final
successful runs; an initial sandboxed fixture launch could not bind its PG socket
and was not counted as a pass. Normal and expiry artifacts are separated under
`/tmp/tsa-student-browser-evidence` and its `expiry` subdirectory.

## Remaining acceptance and next task

WEB-004 remains IN_PROGRESS: broader keyboard/zoom, qualified screen-reader and
second-engine verification are outstanding. Real deadline expiry/recovery, offline
reconnect and actual second-tab revision conflict are now verified above. Synthetic
Chromium evidence is not full accessibility, production OIDC/worker operation or
formal EXAM/SCORE/WEB acceptance. Raw TeX is preserved rather than typeset. Only the
currently supported standalone NEW_ONLY profiles are integrated. No fixed/repeat or
combined domain workflow is invented. Track A remains incomplete.

Next executable card: finish the bounded WEB-004 keyboard/zoom/accessibility
regressions against this existing integration, then make a
safe UI checkpoint once the owner baseline can be included under explicit ownership.
Recommended native Luna/XHigh for isolated test implementation if available,
Sol6.1/High fallback; Sol integrates and separate Sol6.1/Medium reviews. No new Bank
features, live model calls, publication or UI reconstruction are needed.

G1 accepted; G2/G3 OWNER_ACCEPTED per durable owner decision. Real lawful stock,
rights/content evidence and qualified independent human reviewers remain separate
prerequisites for legitimate publication and a real-content demonstration.
