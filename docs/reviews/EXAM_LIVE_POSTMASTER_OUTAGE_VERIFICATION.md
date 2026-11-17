# Live PostgreSQL outage — EXAM-002 / OPS-001

2026-10-23, `feat/track-b-data-auth`, base `5d0a991`. Accountable implementer:
Codex Sol6.1/High while Luna/XHigh remains usage-limited. Separate read-only
engineering reviewer: `/root/directory_review`, Sol6.1/Medium. This completes the
bounded live-outage card; broader operations and human acceptance remain open.

## Implemented and actually exercised

The private disposable PostgreSQL helper accepts an optional validated
`whileStopped` callback. It executes only after its owned postmaster has exited
and before recovery starts. A callback assertion failure is retained, recovery is
attempted, and the failure is rethrown after successful startup; the restart flag
is reset. A real foundation test proves validation occurs before mutation, a
failing callback restores the server, SQL works afterward and another default
fast restart is possible. Default restart behavior is preserved. No production
code, public contract, schema, dependency or publication authorization changed.

The existing OS child runs actual restricted identity/exam/worker pools and the
normal student HTTP and grading poller. Original synthetic READING2 answers are
acknowledged and exact sealed input/answer/history/clock snapshots captured before
actual immediate SIGQUIT shutdown. HTTP and worker loops are never quiesced.

During the stopped-server callback:

- Authenticated, CSRF-bearing read/save/submit requests return actual503 responses,
  parsed with each frozen route's503 schema. Error code is
  `TEMPORARILY_UNAVAILABLE`, details empty, no-store and matching request-ID headers.
  Private field and question/provenance marker scans pass.
- The child reports an actual worker-pool connection rejection. This notification
  observes a real error and rethrows it through normal poller handling; it does
  not substitute a mocked query result. The barrier waits for the observation.
- The same live child PID answers IPC while PostgreSQL is still stopped.

After startup, actual interruption/redo markers and a changed postmaster timestamp
confirm WAL recovery. The exact pre-outage acknowledged graph is unchanged and
failed submit created no job. Original clocks and two answers are delivered by
the same process/session. The prior postmaster-bound synthetic publication scope
is inactive and never renewed. The failed save key retries successfully to
revision2, then the failed submit key commits normally. Grading reaches100%, the
same receipt replays, exactly one job/score/release exists and immutable inputs
remain unchanged across grading. Graceful child shutdown produces no stdout/stderr.

The first focused test passed but its save request had an invalid body and lacked
CSRF; that did not prove a valid save's outage behavior. It was corrected and
rerun with the frozen request shape and actual CSRF token. The final same-key200
revision2 assertion proves the corrected request is valid after recovery. No
invalid-request pass is used as the final valid-save evidence.

Outage503 may occur during database-backed authentication before command SQL.
This does not prove interruption of an already-running HTTP save or COMMIT.
The [separate connection-loss test](EXAM_DATABASE_CONNECTION_RECOVERY_VERIFICATION.md)
proves an interrupted checked-out transaction cannot commit or retry silently.
No hardware/disk/power-loss, deadline-expiry-during-outage, production supervision,
RPO/RTO, PITR or capacity guarantee follows from this bounded local experiment.

## Executed verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux. Coordinator actual execution:

| Command | Observed result |
|---|---|
| `node --test tests/integration/database/foundation/immediate-recovery.test.mjs` | PASS2 |
| `node --test --test-name-pattern='live HTTP and poller' tests/integration/student-runtime/process-recovery.test.mjs` | Final PASS1 with valid save/actual poller error |
| `npm run test:db:foundation` | PASS37 |
| `npm run test:student` | PASS34 |
| `npm run test:grading` / `npm run test:recovery` / `npm run test:results` | PASS23 / PASS16 / PASS6 |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| Typecheck/build/emitted smoke/contract drift/consumer import boundaries | PASS |
| `npm run docs:check` / scoped whitespace | PASS |

Final suites had zero failures/cancellations/skips. Full Bank/assembly/attempt/
local/directory/browser suites were not rerun for this test-only change; preceding
checkpoint regressions remain separate evidence. Hosted CI/manual accessibility
not executed. Existing module-detection/historical whitespace warnings remain.

Transient logs: `/tmp/tsa-live-outage-{foundation-focused,focused-final,foundation,student,grading,recovery,results,static,contracts,consumers}.log`.
Commands/results here remain the durable record. Separate reviewer inspected the
final barrier lifecycle/failure handling, child error observation, valid requests,
private-safe503 evidence and same-key recovery: no concrete P1/P2. Independent
four-file syntax and scoped whitespace passed; no independent PG run or files
edited. Review expressly distinguishes authentication failure from interrupted
command SQL. Engineering review is not human content/rights/accessibility review.

## Status and continuation

G1 accepted; G2/G3 OWNER_ACCEPTED unchanged. Owner AGENTS.md and unrelated research
remain byte-preserved and unstaged. No push/merge/deployment/Astra/paid model API/
live student inference/unauthorized publication. Lawful inventory, qualified human
content/rights/accessibility evidence, operational targets and Track A remain
outstanding; the active broad goal and full OPS/pilot acceptance remain open.

Next executable integration audit: populated migration rehearsal for the latest
assembly migration, preserving existing sealed attempts, answers, assignments,
jobs/results and role boundaries. Existing fresh migrations, early populated
upgrades and logical restore are separate evidence; inspect current coverage
before implementing only missing rehearsal work. Recommended Sol6.1/High while
Luna is unavailable; separate Sol6.1/Medium read-only engineering reviewer.
