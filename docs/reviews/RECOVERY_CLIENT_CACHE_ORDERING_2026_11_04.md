# RECOVERY-015 attempt cache response ordering

Date2026-11-04 Asia/Bangkok. Root Codex accountable implementer, actual
response_review independent read-only reviewer. Branch feat/track-b-data-auth,
basea70861a plus inherited dirty tree preserved. Existing autonomous client repair
scope; no server/SQL/schema/grant, timing, scoring, reuse or architecture changes.

## Observed defect and correction

Reviewer reproduced a delayed rev0 attempt GET overwriting an acknowledged rev1
save in the [browser transport](../../apps/practice-prototype/public/app/persistent-api.js).
The following save sent expectedRevision0 and received a conflict despite no
competing writer. This is an SDK race; current UI busy guards serialize many
actions, so a specific end-user gesture was not established by that reproduction.

Reads now reconcile known lifecycle progress and per-slot answer revisions, using
a read-request sequence to order otherwise equal observations. They cannot erase
acknowledged answer revisions or reopen known closed states. More advanced state
and revisions remain admissible. Authentication, exact attempt/mode binding and
authorized released-result checks still run before using a newer cached display.
Returned cached displays are cloned, so caller mutations cannot corrupt them.

Acknowledged saves merge into a fresh current view rather than rejecting solely
because an intervening GET replaced the cache object. Distinct-slot updates are
preserved, newer conflicting revisions remain protected, and an observed closure
is retained. An older acknowledgement does not regress a later observed server
timestamp. PostgreSQL still owns actual clocks, revisions and closure decisions.

## Regression evidence and independent findings

[Unit tests](../../apps/practice-prototype/test/persistent-api.test.mjs) use deferred
response barriers for old reads versus saves/submission, both orders of overlapping
GETs, acknowledgement after a read, parallel distinct-slot saves, newer revision/
closure protection, denied-read priority and mutation isolation. Existing retry
keys, three response types and release-revalidation cases remain.

A read-only negative control loaded the actual HEAD client as a temporary data
module into the new test harness without changing repository files. Four new
regressions failed and five tests passed, exit1, demonstrating the original
defects (`/tmp/tsa-recovery015-prerepair-negative.log`).

Reviewer found P2 in the first repair: object-identity fallback discarded a fresh
SUBMITTED response when an earlier active GET completed first. Root replaced that
approach with lifecycle/revision reconciliation and read ordering, and added both
response-order controls. A final root guard also prevents delayed SUBMITTED
acknowledgements from replacing an already observed GRADED result. Actual reviewer
confirmed both fixes and no remaining concrete findings on the final patch.

The [real HTTP/PostgreSQL test](../../tests/integration/student-runtime/transport.test.mjs)
captures actual complete responses before delaying delivery. It proves next PUT
revisions0/1/2, a persisted rev3 answer, a held acknowledgement coexisting with a
fresh GET, late active snapshot after submission returning SUBMITTED, no fourth
PUT, unchanged exact stored clocks and exactly one grading job. Worker progress is
isolated through a test-only restricted-pool wrapper, without production hooks.

## Verification checkpoints

Environment: Node24.18.0/npm11.16.0/PostgreSQL18.6, local synthetic fixtures.

| Executed command/check | Observed result | Attribution / limits |
| --- | --- | --- |
| Focused unit after ordering repair | 10PASS | `/tmp/tsa-recovery015-unit-final.log`. |
| Focused real transport file | 2PASS | `/tmp/tsa-recovery015-transport-final.log`; final integrated rerun follows source freeze. |
| Earlier `npm run test:b0` | 44PASS | `/tmp/tsa-recovery015-b0.log`; intermediate source, not final acceptance. |
| Earlier `npm run test:student` | 45PASS | `/tmp/tsa-recovery015-student.log`; intermediate source, includes new transport test. |
| Earlier three-domain Chromium journey | PASS,78APIresponses/8captures/each100% | `/tmp/tsa-recovery015-browser/`; intermediate source, not final acceptance. |
| `npm audit --ignore-scripts --json` | Exit0,0reported vulnerabilities/25dependencies | `/tmp/tsa-recovery-dependency-audit-2026-11-04.json`; registry advisory snapshot only, no dependency changes or complete security guarantee. |

Final root and independent focused unit+real transport13PASS,0fail/skip
(`/tmp/tsa-recovery015-focused-final.log`). Fixed-form identity/mode4PASS,
SDK syntax/scopedwhitespacePASS. Later broader checkpoint B045/student45 and
Chrome78responses/8captures PASS (`/tmp/tsa-recovery015-{b0,student,browser}-final.log`,
`/tmp/tsa-recovery015-browser-final/`), but those began before the last delayed-
submit guard. That guard has final focused coverage; the following identity task
will rerun the combined final broader scope rather than duplicate unchanged work.

Final reviewed SDK SHA-256
`a324f8afb85fb10acc4c0a44aa2d16848d9868e4d8589ca16b96f6151acb2c10`;
unit test `3ec5e1baea27a358e1147ce83c0b08d92ffea29dfd31fd96de03e3efa233572e`;
transport test `b1d86c825369d83a9818691d0d1c37ad07176ccaf7dc922e1f006e53f6a49790`.
VERIFIED complete in bounded SDK ordering scope. No specific UI gesture,
qualified-human/browser-conformance, production or full critical-matrix acceptance.
A separately reproduced preexisting401/unchanged-cookie epoch problem is queued
as RECOVERY-016; it is not claimed fixed here. No commit/push/merge/deployment.
