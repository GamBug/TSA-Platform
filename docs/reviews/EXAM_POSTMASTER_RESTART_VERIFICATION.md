# EXAM-002 PostgreSQL restart recovery — executed evidence

2026-10-22, `feat/track-b-data-auth`, base `e5dafee`. Accountable Sol6.1;
Luna/XHigh remains usage-limited. This bounded follow-up adds test scaffolding
and evidence only. No runtime, schema, contract, solver or publication changes.

## Actual recovery experiment

The disposable PostgreSQL18.6 helper can now cleanly fast-restart its own
postmaster using the same private temporary data directory/socket. Its current
owner pool is exposed through a getter after restart; final stop still removes
only its owned temporary cluster. Caller-owned application pools are quiesced and
handle expected57P01 idle-client disconnects in the test. This helper is test-only,
not a persistent stock provisioner or production operations tool.

The student-runtime test uses existing original isolated inventory and the existing
postmaster-bound synthetic publication workflow. A claim fault is active before
worker startup; outstanding operations drain before submit. After saved answers
and atomic HTTP submission, the test confirms exactly one QUEUED job. It closes
HTTP/worker composition, restarts the actual PostgreSQL process, and reconnects
restricted credentials. The postmaster timestamp changes and old idle clients are
actually disconnected; this is not mocked database persistence.

SQL snapshots compare exact pre/post restart and post-grade:

- Sealed form, ordered slots and private keys.
- Assembly run/manifest and assignment history.
- Creation, start-before, started, deadline and closed clocks.
- Persisted answers and computed grading-input digest.

The queued job retains its ID/state/dedup key. The old synthetic publication scope
is inactive under the new postmaster; no attestation is renewed and no subsequent
publication is authorized. The recreated student HTTP/worker composition uses the
previous student session, hides the pending review, denies another student's
result request, replays the same submission receipt, and then recovers grading.
Exactly the original job succeeds, with one score and one active release,100.00%
unofficial practice score. Immutable snapshots still match after grading.

This restarts the actual PostgreSQL process and recreates application objects in
the same test Node process. It does NOT simulate an OS application-process crash,
ungraceful database crash, running-lease reclaim across restart, production auth,
qualified human approval, real publication or a retained approved exam journey.
The retained staff/student runtime from `e5dafee` separately proves draft/session
persistence without provisioning eligible stock.

## Executed verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux,2026-10-22.

| Command | Actual coordinator outcome |
|---|---|
| `npm run test:student` | PASS9, including real queued-job postmaster restart |
| `npm run test:db:foundation` | PASS34 |
| `npm run test:bank` | PASS94 |
| `npm run test:assembly` | PASS23 |
| `npm run test:attempts` | PASS28 |
| `npm run test:grading` | PASS21 |
| `npm run test:recovery` | PASS16 |
| `npm run test:results` | PASS6 |
| `npm run test:directory` | PASS9 |
| `npm run test:auth` | PASS5 |
| `npm run docs:check` / scoped `git diff --check` | PASS; preserved historical whitespace warning |

Build/typecheck/contracts106/consumers11/B021/Chromium journey passed in the prior
runtime integration batch, recorded in [retained-workspace evidence](WEB_001_RETAINED_WORKSPACE_VERIFICATION.md).
They were not rerun for these test-only changes. No hosted CI or manual AT run.
Temporary logs: `/tmp/tsa-restart-{student,database,exam}.log`.

Initial focused experiment failed because smart SIGTERM shutdown waited for idle
clients; switched to clean PostgreSQL fast SIGINT shutdown. A second run reached
grading but failed a wrong nested DTO assertion; the frozen percentage is top-level.
The independent reviewer identified the same defect. Both were corrected before
final PASS9. Claim-fault startup/drain also removes an avoidable queued-work race.
These initial failures are not reported as passes.

## Independent engineering review and continuation

Separate read-only `/root/directory_review`, Sol6.1/Medium, reviewed final helper,
claim-fault/drain, immutable snapshots, ownership and stale-scope checks. Final:
no open P1/P2, syntax/scoped whitespace PASS, no files touched. Its prior PG run
was blocked by socket permissions; no independent PG execution is claimed here.
Engineering review is not qualified human content or accessibility review.

G1 accepted; G2/G3 owner accepted. WEB-001/EXAM-002 acceptance remains distinct
from this verified bounded recovery scenario. Lawful inventory/human publication,
Track A and qualified manual screen-reader/native zoom evidence remain outstanding.
Next executable EXAM-002 card: verify a RUNNING job's persisted lease/fencing and
reclaim across an actual disposable postmaster restart, without renewing synthetic
publication scope. Recommended Sol6.1/High while Luna is usage-limited, separate
Sol6.1/Medium reviewer. No production provisioning or speculative UI work.

Owner AGENTS/research remain byte-preserved and unstaged with the hashes recorded
in retained-workspace evidence. No push/merge/deploy/Astra/paid API/live student LLM
or unauthorized publication. Reservations released at checkpoint.
