# Fresh staff browser verification

RECOVERY-023, November 5, 2026 (Asia/Bangkok). Root Codex is sole operator and
accountable verifier. The [recovery plan](../tasks/RECOVERY_PLAN_2026_11_02.md)
explicitly requires fresh student and staff browser results for RP-02. Earlier
recovery runs supplied student/service evidence; source-only staff inspection
did not satisfy this item. This run changes no application, harness, dependency,
contract, research or production configuration.

Branch `feat/track-b-data-auth`, base `a70861a`, inherited dirty tree preserved.
Existing Node 24.18.0/npm 11.16.0/PostgreSQL 18.6, Linux user 1000; installed
Chromium, Firefox and geckodriver. Each harness owns disposable synthetic data,
separate profiles and loopback listeners; no existing user browser profile or
system database is used. No paid provider call, commit, push, merge or deployment.

## Executed verification

| Exact command | Observed result | Evidence |
| --- | --- | --- |
| `TRACK_B_ARTIFACT_DIR=/tmp/tsa-recovery023-chromium npm run test:track-b:browser` | Exit 0; Chrome 156.0.8078.47; 50 recorded check entries, 34 captures | `/tmp/tsa-recovery023-chromium/report.json`, command log `/tmp/tsa-recovery023-chromium.log`. |
| `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-recovery023-firefox npm run test:staff:firefox` | Exit 0; Firefox 156.0; 18 recorded check entries, 42 captures | `/tmp/tsa-recovery023-firefox/report.json`, command log `/tmp/tsa-recovery023-firefox.log`. |

The commands ran sequentially. Check entries are the harness's grouped assertions,
not independent test files or an acceptance percentage. Firefox's count includes
four initial student checks and fourteen subsequent staff checks; its assertions
and coverage are not identical to the Chromium script.

The [Chromium harness](../../scripts/verify-track-b-browser.mjs) covers B1–B9:
role-scoped metadata and private inspection/evidence, author interaction editing,
explicit handoff/reject/quarantine, historical decisions, canonical preflight,
fixed references, stock rehearsal and sealing. Its retained and disposable
fixtures include actual role denials, delayed-response/identity fences, uncertain
acknowledgements and exact retries, historical/current-state separation, and
mock-mode unavailability. Its final assertion reports no uncaught browser errors
or external page requests. Exact assertions remain in the executable owner.

The [Firefox harness](../../scripts/verify-student-firefox.mjs) additionally runs
the existing student save/reload/outage/released-result journey before its staff
branch. Staff checks include B1–B9 controls, keyboard/native Escape/focus, explicit
commands and private-state cleanup. The report records desktop inner width 1280;
requested narrow outer width 450 was not honored and returned outer/inner width
500, document scroll width 488, scale 1. This is verified 500px narrow evidence,
not a successful 450px or 375px Firefox mobile run. Chromium's selected private
preview/evidence views record actual inner/document widths 375/375 and scale 1.

Root inspected both JSON reports and three captures: Chromium private preview on
mobile and fixed-seal detail on desktop, plus Firefox fixed-seal detail at 500px.
These show the expected selected content, wrapping and scope notices without an
observed horizontal layout problem. This is not an exhaustive visual audit of
all captures or qualified human accessibility/content review.

## Source and cleanup

Selected final source fingerprints, rechecked unchanged between the Chromium
inspection and final Firefox cleanup:

| File | SHA-256 |
| --- | --- |
| Chromium harness | `7b8c5e47493c5d9bd2a338182a36f0cbc75e6964c0c316806d246d7a86a35345` |
| Firefox harness | `c2fd6395b7bde0c5d0572c9d877a961d28295b899cdc62fd97cbd606a6f41771` |
| `apps/practice-prototype/public/app/main.js` | `82741a0d1ed620e1c0a963666ec3d3818604cb8d3be76c5a4f9073787223ad97` |
| `apps/practice-prototype/public/app/staff.js` | `f1f60f38930d7802ce985ee29321d8d4451d688f4ba3bf14027abe7fa112770c` |
| `src/local/track-b.mjs` | `8d9156ff263fe50645072ef7fcecfeb68426b8eae5ce0f84a6e9c3228e14e1ab` |

Native sessions 46149 and 33956 returned exit 0 after harness cleanup. A scoped
process inspection found no remaining verifier, owned Chromium profile or owned
Firefox test profile process. The harnesses remove their clusters and temporary
profiles; report/capture directories are intentionally retained under `/tmp`.
No user or unrelated process was stopped. No failure required an application
repair or additional unchanged unit/PG/browser runs.

Independent review/rerun was NOT PERFORMED for this verification-only task.
Existing reviewed harnesses were executed and their reports inspected by root.
No screen-reader/human usability, conformance, lawful stock, production identity,
full critical-matrix or hosted acceptance follows. Root `npm run docs:check`,
`git diff --check` and direct new-document whitespace checks PASS; no docs errors,
one preserved historical warning and anchors NOT_CHECKED. Log:
`/tmp/tsa-recovery023-docs.log`. Backlog, state, map, dated plan and handoff are
integrated; all verification/documentation reservations are released.
