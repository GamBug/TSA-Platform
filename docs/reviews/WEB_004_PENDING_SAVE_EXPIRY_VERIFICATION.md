# WEB-004 pending429 deadline boundary — 2026-10-23

Bounded engineering coverage IMPLEMENTED / VERIFIED from `f75f704`, branch
`feat/track-b-data-auth`. Accountable implementer Codex Sol6.1; separate native
Sol6.1/Medium `directory_review` reviewed read-only. Luna previously reached its
usage limit. Existing autonomous local engineering authority applies. Starting
owner AGENTS.md changes and untracked reference research remain byte-preserved
and excluded. No product defect reproduced; no product code was changed.

## Executable boundary

New [journey](../../scripts/student-rate-limit-expiry-journey.mjs) runs the existing
student runtime, timer, owned-read reconciliation and grader against PostgreSQL.
Test-only original shared-reading fixtures now accept an explicit positive integral
duration while preserving their180-second default. The expiry scenario creates a
new immutable eight-second blueprint; it never rewrites a sealed form or deadline.
Each mode independently configures USER_SAVE or ATTEMPT_SAVE capacity1/refill0.01;
the other bucket is ample. Real first answer200 consumes the selected budget;
second, correct choice receives real429 with matching Retry-After100 seconds.
No clock substitution, synthetic HTTP response or persisted bucket mutation.

The pending choice remains selected and visibly unsaved, with navigation/catalog/
submit disabled. A DB checkpoint proves the429 is still before the original
deadline. The browser remains on the page; its existing monotonic timer performs
an owned read and reaches EXPIRED/DEADLINE/PENDING with closed_at=deadline_at.
Worker/sweeper availability is held off to observe this intermediate durable state.
The notice explains scoring uses only server-recorded answers. Retry controls and
the pending editor disappear; no retry or POST submit occurs through grading.

Exact form/assembly manifest, sections, public/private snapshots, both assigned
question-history rows, start/deadline and acknowledged answer remain unchanged.
The rejected second answer has no row or receipt. Both persisted save-bucket rows
remain unchanged. One queued job is bound to the original grading-input hash;
a repeated owned read leaves it unchanged. Restoring the real grader produces
one score and one release,1/2=50.00%, with earned values[1,0]. This demonstrates
that the correct but unsaved second choice was excluded. Reload retains the same
result, successful job, snapshots and answer. Capacity is still depleted after
grading; no wait for refill or forced submission is required for expiry.

## Actual verification

Node24.18.0/npm11.16.0, pinned PostgreSQL18.6, Chromium155.0.8059.79, Linux.
All commands below executed successfully; counted suites had zero failures/skips.

| Command | Observed result |
|---|---|
| `npm run test:student:rate-limit:expiry` | PASS, USER_SAVE,24 API responses/four screenshots |
| `npm run test:student:rate-limit:expiry:attempt` | PASS, ATTEMPT_SAVE,24 API responses/four screenshots |
| `npm run test:student:rate-limit` | PASS, existing refill/retry journey,20 responses |
| `npm run test:student:reading` | PASS, default180-second shared-reading journey,32 responses |
| `npm run test:student:expiry` | PASS, existing mixed-question expiry/reload journey |
| `npm run test:assembly` | 49/49 PASS, including default bundle fixture consumers |
| `npm run test:student` | 31/31 PASS, including security/restart/restore/default reading |
| `npm test`, `npm run test:consumers` | 106/106 and11/11 PASS |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS |
| `node --check` changed scripts/fixtures; `git diff --check`; `npm run docs:check` | PASS; historical whitespace warning only |

Both initial expiry runs passed. Independent reviewer requested no-retry/no-submit
assertions repeated after grading immediately before reload; those were added and
both scopes rerun successfully. Final independent review: no unresolved findings,
syntax/whitespace PASS, no browser/PG execution by reviewer. Actual runtime results
are coordinator-owned; review is not qualified human content/rights acceptance.
Coordinator visually inspected USER_SAVE expired-pending screenshot and truthful
server-recorded-answer notice. Reports/screenshots are transient under
`/tmp/tsa-student-browser-evidence/rate-limit-expiry-{user_save,attempt_save}`;
commands regenerate them. Existing module-type warning remains. Full Bank/attempt/
foundation suites and Firefox were not rerun for these test-only fixture/runner
changes; earlier results remain historical.

## Handoff and remaining prerequisites

No G1 contract, schema, product transport/renderer, dependency/lockfile, rights/
review/publication control or retained inventory changed. No push/merge/deploy,
Astra, paid model API, live student inference or unauthorized publication. G1
accepted and G2/G3 OWNER_ACCEPTED remain unchanged. Broad goal stays active. Full
WEB/OPS/pilot, lawful inventory, named qualified human review, manual AT/native
zoom and Track A remain outstanding. Task reservations released.

Next bounded WEB-001/004 card: CREATED reservation recovery through the existing
browser. Verify reload does not start a reserved attempt, explicit start preserves
its original TTL/form/history, and a late start shows authoritative cancellation
without questions or a replacement allocation. Existing browser coverage lacks
this explicit path (repository search); backend admission regressions exist.
Use isolated original fixtures and documented policies, no new API or retention
policy. Recommended Sol6.1/High while Luna remains usage-limited, separate
Sol6.1/Medium read-only engineering review. No implementation of this next card
is claimed by the current evidence.
