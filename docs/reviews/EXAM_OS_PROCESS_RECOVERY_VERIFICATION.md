# EXAM-002/OPS-001 app-process crash recovery — 2026-10-22

**Bounded engineering verification IMPLEMENTED / VERIFIED.** Accountable Codex
Sol6.1; branch `feat/track-b-data-auth`, base `ab3ab18`. Starting worktree contained
only owner AGENTS.md modifications and untracked reference research. Explicit
continued local engineering authority applies. New files are test-only; production
runtime, migrations, public G1 contracts and publication controls are unchanged.
No Astra, paid model API, live student inference, push, merge, deployment or real
publication. Luna previously reached its actual usage limit; Sol implemented with
a genuinely separate Sol6.1/Medium read-only reviewer.

## Implemented harness and observed behavior

[Test child](../../tests/integration/student-runtime/process-child.mjs) is a separate
Node OS process running the existing combined student HTTP runtime and grading
poller. It receives only restricted identity/exam/worker connection configurations
over parent IPC, never command-line credentials. The parent owns a live private
PostgreSQL18.6 fixture; the child neither starts/stops a database nor provisions
inventory. Mandatory test/synthetic/child opt-ins and IPC are required. Runtime
pool attestation remains intact; no owner/Bank credentials are sent to the child.
Private SQL, connection configurations and question data are not emitted to logs.

[Recovery tests](../../tests/integration/student-runtime/process-recovery.test.mjs)
use the original disposable shared-reading fixture and frozen HTTP/client transport.
Each case starts/answers a READING2 attempt in process1, receives real save
acknowledgements, then sends **SIGKILL** to that owned child and waits for its actual
signal exit. Its listener becomes unavailable. Process2 has a different PID and
binds the same loopback port. The original session cookie works without another
login/bootstrap. Exact answers, shared passage, original clocks, immutable manifest,
sealed form/public snapshots/private keys and assignment history remain unchanged.

Submission commits through HTTP200 with one durable receipt/job. After an IPC barrier
at a real SQL boundary, process2 is also SIGKILLed. Process3, another new PID using
normal unmodified runtime behavior, starts at the same origin and recovers:

| Crash point | Observed result |
|---|---|
| QUEUED | Worker claim is paused before SQL execution; submitted job persists QUEUED without a consumed lease. Process3 claims/grades it once with token1. |
| RUNNING | Claim has committed before the test pauses worker load. Exact RUNNING row/token/lease survives the kill. Process3 cannot steal/reset the live lease, a rival claim returns IDLE, and there is no premature score. After actual PostgreSQL lease expiry, recovery uses token2; SQL verifies score creation is at/after the original lease deadline. Stale old-token load/finish probes return LOST_LEASE. |
| COMMITTED | Actual worker finish transaction COMMIT succeeds; the test withholds the commit result from the worker before SIGKILL. Process3 retains the exact immutable score/items/release and SUCCEEDED job, without another claim or grade. This is interrupted **worker-level COMMIT acknowledgement**, not an injected PostgreSQL wire failure. |

All cases replay the same submission key/body with the identical HTTP200 receipt,
return100.00% for two independently scored questions, preserve exact immutable
inputs/history and dispatch identity/digest, and end with one attempt, two historical
identities, one job, one score, one release and one ATTEMPT_GRADED audit. A final
normal child drains and exits0. On assertion/startup failure, registered owned
children are killed/reaped before parent pools and the disposable database close.
IPC messages are buffered so an early QUEUED pause is not missed. Parent polling
bounds only waiting; it does not change clocks, lease timestamps or database results.

Postmaster start time is checked unchanged after each crash/recovery and the existing
postmaster-bound synthetic publication scope remains active. PostgreSQL continues
running throughout each test. No old application object is reused across child
processes. Existing same-process runtime recreation and postmaster-restart tests
remain separate evidence. This proves neither host failure nor ungraceful database
failure, production supervision, production inventory, nor independent HTTP and
worker-service deployment: HTTP and poller share the killed child in this local
composition. Stale-token probes are real SQL calls from a trusted test worker,
not a claim that the killed process resumed.

## Executed verification

Pinned Node24.18.0/npm11.16.0 and private actual PostgreSQL18.6. Runtime/worker SQL
operations and commits are real; wrappers only pause execution/acknowledgement.

| Executed command | Observed result |
|---|---|
| `node --test tests/integration/student-runtime/process-recovery.test.mjs` | PASS3/3 actual process/PG cases; QUEUED about1.9s, RUNNING11.6s, COMMITTED1.7s |
| `npm run test:student` | PASS22/22, zero failures/skips, including final exact score/release/audit and lease-expiry assertions |
| `npm run test:grading` | PASS22/22 |
| `npm run test:recovery` | PASS16/16 |
| `npm run test:results` | PASS6/6 |
| `npm run test:scoring` | PASS5/5 |
| `npm test`, `npm run test:consumers`, `npm run test:built` | PASS106/106,11/11 and emitted smoke |
| `npm run build`, `npm run typecheck` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS generated drift and consumer/import boundaries |
| `npm run docs:check`, staged `git diff --check` | PASS; zero documentation errors, preserved historical whitespace warning |

Initial test failures were repaired, not counted as passing evidence: a local
variable shadowed Node's process object; submit/replay incorrectly expected202
instead of the frozen200 status. An unimplemented helper function reference was
removed before that path executed; dispatch probes use the existing persisted
job-dispatch/1 fields. Final focused3 and fullstudent22 passed after the relevant
corrections; final fullstudent22 includes the subsequent tightened assertions.
The existing harmless parent-module type warning remains; child logs are asserted
empty. No application defect or new production behavior was inferred from test
construction errors.

Not rerun: Bank/full foundations/auth/assembly/attempt/local suites, browser and
manual accessibility (their production code/fixture is unchanged; previous evidence
at `7cee125`/`ab3ab18`). Existing student suite still executes role topology,
auth/transport, shared-reading rights and actual postmaster-restart regressions.
No new browser or host/database-crash claim is made.

## Independent review and preservation

Actual separate native `/root/directory_review`, Sol6.1/Medium, read-only, reviewed
both new files and existing worker transaction boundaries. Reviewed early IPC,
cleanup order, PID/exit evidence, immutable state, actual lease checks, stale-token
fencing and the COMMITTED acknowledgement boundary. No concrete P1/P2 findings.
Independently executed syntax and direct whitespace checks for both files: PASS.
Inspected coordinator logs; did not independently run PostgreSQL or browser tests.
No files edited. This is engineering review, not human content/rights approval.

Owner files remain byte-preserved and excluded from the checkpoint:

- AGENTS.md: `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
- Reference research: `6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba`.

## Continuation

The PostgreSQL-backed student demonstration now has actual OS-process crash
recovery evidence for acknowledged saves and all three grading boundaries. Full
OPS/EXAM/pilot acceptance remains distinct. G1 accepted; G2/G3 OWNER_ACCEPTED
unchanged. Lawful stock, named qualified human reviewers, manual accessibility and
Track A remain outstanding; synthetic engineering scope authorizes none of them.

Next bounded EXAM-002/OPS-001 card: extend the separate-process recovery harness
with **passage rights revoked while the app/worker is down**. Before recovery of
QUEUED/RUNNING work, commit restriction through the existing separated Bank service;
restart restricted runtime and prove current restrictions prevent delivery/release,
preserve sealed inputs/history and produce no unauthorized score or explanation.
Reuse existing holds/worker checks and isolated fixtures; change production code
only for a reproduced defect. Recommended implementer Codex Sol6.1/High while Luna
is usage-limited, separate Sol6.1/Medium read-only security/recovery review. No new
API, invalidation policy or publication authorization is proposed.
