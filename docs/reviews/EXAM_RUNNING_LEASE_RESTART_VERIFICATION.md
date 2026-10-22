# EXAM-002 running lease across PostgreSQL restart

2026-10-22, `feat/track-b-data-auth`, base `04bff31`. Accountable implementer
Sol6.1; Luna/XHigh remains usage-limited. Test-only follow-up to
[queued restart evidence](EXAM_POSTMASTER_RESTART_VERIFICATION.md), using its
existing disposable private postmaster restart helper. No product/schema/contract,
fixture-publication authorization or production operations changes.

## Actual experiment

The isolated synthetic fixture submits persisted answers and queues grading.
Executor one claims a10-second lease and loads the original digest-bound input.
The test snapshots the entire RUNNING job, cleanly fast-restarts the real owned
PostgreSQL process and reconnects restricted pools. A changed postmaster timestamp
and expected57P01 idle disconnects establish actual process replacement.

The complete job, including owner/token/deadline, is unchanged. The lease remains
live and executor two receives IDLE instead of stealing it. The old postmaster-bound
synthetic publication scope is inactive; it is never renewed. The test waits for
actual PostgreSQL clock expiry without rewriting lease timestamps, then reclaims
the same job with an increased token. Executor one's old load and finish both
return LOST_LEASE; no premature score exists. Executor two loads the same scoring
input and produces exactly one successful score/release. Another claim is IDLE.

This exercises a clean database-process restart with a pending worker lease.
It does not kill an OS application process, test ungraceful WAL crash recovery,
provision production identities/inventory or establish human publication rights.
A slow environment that outlasts the initial10-second lease fails the explicit
live-lease assertion; the test does not silently count an expired lease as live.

## Verification and separate review

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux,2026-10-22.

| Command | Observed coordinator result |
|---|---|
| `node --test --test-name-pattern='running grading lease survives' tests/integration/grading/worker.test.mjs` | PASS1, real elapsed lease expiry; approximately11s test body |
| `npm run test:grading` | PASS22 |
| `npm run test:scoring` | PASS5 |
| `npm run docs:check` / scoped `git diff --check` | PASS; one preserved historical whitespace warning |

No initial failing run of this added test. The preceding checkpoint's broader
student9/foundation34/Bank94/assembly23/attempt28/recovery16/results6/directory9/auth5
passes remain separate evidence. Those suites and build/contracts/browser were
not rerun for this one test-only addition. Hosted CI/manual AT NOT RUN.
Temporary logs: `/tmp/tsa-running-restart-{focused,grading,scoring}.log`.

Actual separate read-only `/root/directory_review`, Sol6.1/Medium: no P1/P2 findings;
syntax/scoped whitespace PASS, no files changed. Review confirmed full lease
persistence, real-clock expiry, fencing and single release; noted the explicit
10-second slow-environment boundary. No independent PostgreSQL execution is
claimed. Engineering review does not constitute qualified human content review.

## Continuation and owner boundaries

G1 accepted; G2/G3 OWNER_ACCEPTED unchanged. Lawful stock, named independent human
rights/content review, qualified accessibility acceptance and Track A remain
outstanding. The local student/backend path is closer to a credible persistent
MVP: both queued and leased work now have actual postmaster-restart evidence.
This does not authorize real publication or claim retained approved stock.

Next integration acceptance card: execute the existing qualified manual
[accessibility packet](../quality/STUDENT_MANUAL_ACCESSIBILITY_CHECK.md), record
native200% zoom/screen-reader findings and repair concrete defects. The packet
remains NOT EXECUTED. For a real retained exam demonstration, provide lawful
question-specific rights/content-review evidence and authorized inventory handling;
current local runtime must continue to seed no eligible stock. Recommended Sol6.1/
High for subsequent concrete fixes while Luna is usage-limited, separate Sol6.1/
Medium engineering review and a qualified human accessibility reviewer.

Owner AGENTS/research bytes and unstaged status preserved; no push/merge/deploy,
Astra/paid APIs/live student LLM/unauthorized publication. Reservations released.
