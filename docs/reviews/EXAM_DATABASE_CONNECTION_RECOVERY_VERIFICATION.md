# Live database connection recovery — EXAM-002 / OPS-001

2026-10-23, `feat/track-b-data-auth`, base `3d05769`. Accountable implementer:
Codex Sol6.1/High; Luna/XHigh remains usage-limited. This follows the immediate
PostgreSQL restart drill and fixes an actual live-process failure.

## Defect and repair

The initial real child-process regression terminated the disposable child's
PostgreSQL sessions after acknowledged reading answers. The child exited1.
Installing a pool error listener alone passed the focused test but failed the full
student suite (32 passes/one failure). A subsequent focused reproduction with
corrected live stderr capture classified the failure as an unhandled checked-out
client error: the poller can hold a client between queries when disconnected.
These failed runs are not passing verification.

`createDatabasePool` now installs background pool and per-connected-client error
listeners. The PostgreSQL18.6 fixture uses pg8.23.1, whose client marks broken connections
non-queryable and rejects pending/future queries; pg-pool removes broken idle
clients. The listeners prevent fatal EventEmitter behavior, without retrying a
transaction or returning a successful result for failed SQL. Raw error/client
objects are not logged because they can contain private connection information.
Application code may still register its own error observers. No public API,
schema, role grants, authorization, scoring or publication control changed.

The [node-postgres pool documentation](https://node-postgres.com/apis/pool)
describes automatic removal of failed idle clients and the fatal unhandled-error
risk. The checked-out behavior was inspected in installed
`node_modules/pg/lib/client.js`; this is a bounded recovery repair, not a general
exception handler or an automatic uncertain-write retry policy.

## Actual database evidence

- An actual checked-out transaction inserts a marker and waits between queries.
  Another connection terminates its backend. Releasing the barrier cannot commit:
  the transaction rejects, its callback executed once, no marker survives, and
  the pool can connect anew. No test error listener masks the client event.
- A separate OS student/worker child uses real restricted identity/exam/worker
  pools, isolated application names and the normal HTTP/client stack. After two
  acknowledged reading answers, the parent terminates only this child's sessions.
  Identity/exam connections are observed idle; the worker may be checked out.
  The same child PID responds through IPC and HTTP, reads the same answers and
  original clocks, saves again, submits, grades100% and replays the same receipt.
  Exact immutable input/answer/history snapshots are compared at the appropriate
  save boundaries; one attempt/job/score/release/grading audit and two assignment
  rows remain. PostgreSQL itself and the existing fixture scope remain unchanged.
- The process harness now preserves live stdout/stderr getters using
  `Object.assign`; its former spread captured their initial empty strings.
  Successful final assertions therefore check current output. Failure diagnostics
  expose a fixed classification, not raw private PostgreSQL errors or clients.

This terminates backend sessions, not the whole postmaster or network/storage.
It does not establish live HTTP behavior during a complete database outage,
recovery of every possible client failure, production supervision, RPO/RTO or
qualified human acceptance. Immediate postmaster recovery evidence remains in
the [separate preceding drill](EXAM_IMMEDIATE_POSTGRES_RECOVERY_VERIFICATION.md).

## Verification record

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux. Actual coordinator execution:

| Command | Observed coordinator result |
|---|---|
| `node --test tests/integration/database/foundation/connection-loss.test.mjs` | PASS1 |
| `node --test --test-name-pattern='live student process survives' tests/integration/student-runtime/process-recovery.test.mjs` | PASS1 after both listeners |
| `npm run test:db:foundation` | PASS36 |
| `npm run test:student` | PASS33 |
| `npm run test:local` / `npm run test:auth` | PASS15 / PASS5 |
| `npm run test:bank` / `npm run test:assembly` | PASS94 / PASS49 |
| `npm run test:attempts` / `npm run test:grading` | PASS28 / PASS23 |
| `npm run test:recovery` / `npm run test:results` | PASS16 / PASS6 |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| `npm run test:b0` / `npm run test:scoring` | PASS31 / PASS5 |
| Typecheck/build/emitted smoke/contract drift/consumer import boundaries | PASS |
| `npm run docs:check` / scoped whitespace | PASS |

All final suites above had zero failures/cancellations/skips. Browser and directory
suites were not rerun for this backend repair; their prior evidence remains
separate. Hosted CI/manual accessibility were not executed. Existing non-failing
module-detection and historical documentation whitespace warnings remain.

Transient logs use `/tmp/tsa-connection-final-*.log`; baseline/intermediate
failures use `/tmp/tsa-idle-disconnect-*.log` and `/tmp/tsa-idle-student.log`.
Commands and observed outcomes here are durable evidence; log survival is not.

Actual separate read-only `/root/directory_review`, Sol6.1/Medium, reviewed the
final two-listener fix, installed client/pool removal behavior, real transaction
failure assertions and live capture repair: no concrete P1/P2. Independent
four-file syntax and scoped/new-file whitespace checks passed. No files edited
or independent PostgreSQL execution claimed; earlier review of the pool-only
fix did not establish passing integration. Engineering review is not qualified
human content, rights or accessibility review.

## Boundaries and continuation

Owner AGENTS.md and unrelated research are preserved. G1 accepted and G2/G3
OWNER_ACCEPTED remain unchanged. Lawful question-specific rights/content review,
qualified manual accessibility, operational targets and Track A remain separate
outstanding inputs. Synthetic fixtures cannot authorize real publication.
No push, merge, deployment, Astra, paid model API or live student inference.

Next executable integration card: bounded live postmaster downtime with HTTP and
poller running, safe frozen503 responses, same-process reconnection and unchanged
acknowledged inputs/clocks followed by one successful grade. Existing immediate
restart tests quiesce services, and this session-loss test leaves the server up.
Recommended Sol6.1/High while Luna remains unavailable; separate Sol6.1/Medium
engineering review. Human accessibility assignment remains independently pending.
