# Complete student-operation identity fencing

RECOVERY-020, started November 4 and verified November 5, 2026 (Asia/Bangkok).
Root Codex is accountable implementer; operation_tests_resume owns the narrow
test file and operation_review_final performs independent read-only review.
Existing Codex subscription only; no paid model API calls. Branch
`feat/track-b-data-auth`, base `a70861a412e0a1c88566f25cc42232c9f7987283`;
inherited uncommitted changes and owner instructions preserved.

## Reproduced behavior and repair

The SDK checked identity inside its HTTP helper, but callers could resume after
another microtask changed identity. Before repair, an attempt read returned
`IN_PROGRESS` after logout started between the inner check and outer continuation.
A separate public-SDK transport reproduction switched valid candidate A cookies
to valid B cookies after A's session response: A's initiated `startDemo` created
and started B's attempt. Server authorization still applied. These deterministic
transport reproductions establish client intent/state defects; they do not
establish a real user gesture or server authorization bypass.

The [SDK](../../apps/practice-prototype/public/app/persistent-api.js) now captures
an operation's identity generation and CSRF nonce, checks both after relevant
awaits, and uses the initiating nonce for chained writes. Outer attempt/review,
catalog/history, allocation/start/resume, save/submit and consent completions
cannot return stale private data or restore old cache state. Stale generations
are rejected before clearing replacement identity state. Login permits expected
bootstrap/login cookie rotation while requiring the requested candidate's fresh
session; first authenticated session establishment remains supported.

Earlier monotonic cache/revision and confirmed-denial repairs remain intact.
No server, database, grants, public DTOs, timing, scoring or architecture changed.
The existing [CI workflow](../../.github/workflows/contracts.yml) now selects
`tests/critical/persistent-api-*.test.mjs`, covering both client regression files.
No hosted CI execution is claimed.

## Verification scope

The new [offline regressions](../../tests/critical/persistent-api-operation-fence.test.mjs)
exercise session/history continuation swaps, queued logout before outer private
reads, legitimate initial session/login, replacement cache/retry-key preservation,
and fixed/review/short consent after nonce rotation. Injected responses control
microtask timing; these are client unit tests, separate from actual HTTP evidence.

The [PostgreSQL transport test](../../tests/integration/student-runtime/transport.test.mjs)
uses two actual authenticated sessions and two cookie-swap boundaries. Both deny
the A-initiated operation with zero create dispatches and unchanged counts for
attempts, forms, manifests, assignment history, allocation state, jobs, budgets
and receipts. Restoring A and explicitly initiating again succeeds. Existing
revision, revocation, immutable-clock and one-job assertions remain.

The first broader student run reported 44 PASS / 1 FAIL: the existing
[consent test](../../tests/integration/student-runtime/domains.test.mjs) restored
A's cookie after invalidation but prepared its second intent before establishing
A's new SDK generation. Explicitly reopening A's session repairs that scenario
setup. Its original dispatch-time server 403 CSRF, one POST and zero-attempt
assertions are retained. Focused domain rerun: 3 PASS.

The writer's first HEAD negative-control attempt was inconclusive because its
intentionally unhandled create route returned a client 503. Root then used an
isolated temporary copy of the same two cookie-swap tests, supplied successful
synthetic create/read responses, and imported the original HEAD SDK through a
data URI. Both tests failed with `Missing expected rejection`: the old SDK
completed allocation instead of denying the changed identity. The temporary
copy was removed; no workspace source changed. HEAD predates earlier cache and
denial repairs, so this negative control establishes only the two allocation
continuation defects, not a complete pre-020 regression baseline. The earlier
November 4 logout reproduction remains separate evidence for the read defect.

## Executed checks

Environment: Node 24.18.0, npm 11.16.0, PostgreSQL 18.6, existing local synthetic
fixtures. Prior runtime handles/logs were absent after the environment reset;
the November 5 checks below were executed afresh against persisted source.

| Command or check | Observed result | Scope |
| --- | --- | --- |
| `node --test apps/practice-prototype/test/persistent-api.test.mjs tests/critical/persistent-api-fixed-attempt.test.mjs` | 18 PASS | Root and independent reviewer. |
| `node --test tests/critical/persistent-api-operation-fence.test.mjs` | 7 PASS, no failures or skips | Writer and independent reviewer; final timeout/cleanup additions independently rechecked. |
| `node --test tests/ai/*.test.mjs tests/critical/persistent-api-*.test.mjs` | 84 PASS, no failures or skips | Root, exact updated CI selection. |
| Isolated original-HEAD allocation negative control described above | Both selected tests fail with missing expected rejection | Root; successful synthetic response routes, not a server integration. |
| `node --test tests/integration/student-runtime/transport.test.mjs` | 2 PASS | Root, real HTTP/PostgreSQL. |
| `node --test tests/integration/student-runtime/domains.test.mjs` | 3 PASS after setup repair | Root, original server rejection assertion retained. |
| `npm run test:b0` | 49 PASS | Root, final SDK source. |
| `npm run test:student` after the consent setup correction | 45 PASS, no failures or skips | Root; earlier 44/45 failure remains documented above. |
| `npm run contracts:consumer-check` | PASS | Both consumer boundaries. |
| `npm run docs:check` | 184 Markdown files, 1,102 links, 59 task records, zero errors | 149 tracked + 35 authored untracked; one preserved historical whitespace warning; anchors explicitly NOT_CHECKED. |
| `git diff --check` and direct new-file trailing-whitespace check | PASS | Existing tracked diff and both new task files. |
| `STUDENT_BROWSER=/home/wolfleo/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome STUDENT_BROWSER_NO_SANDBOX=true STUDENT_ARTIFACT_DIR=/tmp/tsa-recovery020-browser npm run test:student:domains` | PASS | Chrome 149.0.7827.55, 78 validated responses, 8 captures, three independent 4/2/4 journeys and 100% scores. |

Actual independent reviewer operation_review_final reports no material findings
in SDK, tests, consent setup or CI selection. Reviewer executed the existing
18 tests, new 7 tests, and final 7-test timeout/cleanup recheck. PostgreSQL,
browser, full-suite and hosted CI execution were not independently repeated.

Reviewed SDK SHA-256:
`3e302b1beb5db1822faa5e72ccba164d078496224e559c8eaf6654ec31ffbab1`.
Final new-test SHA-256:
`f576a9d0441e036e9c43706aad3e114a93cfed46b24e55e5b01af9b4942a589d`.
Final transport SHA-256:
`c39cbc54cf2606cedf81c6d629128ea50c5c795aedaa0ce9097b35f1b113c86f`.
Transient logs live under `/tmp/tsa-recovery020-*`; this record preserves commands
and observed outcomes if those logs disappear. Test fixtures own and clean up
their HTTP servers, workers, database clusters and browser processes; no user
browser is stopped.

## Remaining boundaries

No fresh Firefox or human assistive-technology acceptance, production identity,
full critical-matrix acceptance, deployment or lawful-content approval follows.
Manual transport/media/planner proposals remain pending specific owner decisions.
No dependencies, research, historical exams, commits, push, merge or deployment.
All implementation and review reservations are released. Root coordinated the
backlog, project state, latest handoff and dated plan; no broader milestone was
marked accepted.
