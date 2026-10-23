# Immediate PostgreSQL recovery — EXAM-002 / OPS-001

2026-10-23, `feat/track-b-data-auth`, base `c74cc6d`. Accountable implementer:
Codex Sol6.1/High; Luna/XHigh remains usage-limited. Separate read-only reviewer:
`/root/directory_review`, Sol6.1/Medium. This closes the bounded abrupt database
process recovery card from the preceding handoff, not full OPS acceptance.

## Implemented and observed

The disposable PostgreSQL helper retains fast shutdown as its default and adds
an explicit allowlisted `immediate` test option. It signals only its owned
postmaster with SIGQUIT, waits for termination, and starts the same private data
directory. Startup must reach SQL readiness. Tests assert both interruption and
redo-start log markers, a changed postmaster timestamp, and `fsync`,
`full_page_writes`, and `synchronous_commit` set to `on`. Raw logs are not exposed
through student responses. The child-close watchdog is cleared on completion.

PostgreSQL documents that [immediate shutdown skips normal shutdown processing
and requires WAL recovery](https://www.postgresql.org/docs/18/server-shutdown.html).
The fixture retains the [WAL durability settings](https://www.postgresql.org/docs/18/runtime-config-wal.html);
this experiment does not simulate host power loss or establish storage durability.

- A separate checked-out connection holds an actual open transaction during
  immediate shutdown. A previously confirmed committed row survives recovery;
  the uncommitted row disappears. The held connection actually disconnects.
- Existing QUEUED student-runtime and RUNNING grading tests now execute both
  fast and immediate modes, retaining the previous fast test names/behavior.
  Restricted pools reconnect, and the prior postmaster-bound synthetic publication
  scope remains inactive; it is never renewed to obtain a passing grade.
- QUEUED recovery preserves exact manifests, sealed slots/private keys, acknowledged
  answers, assignment history, clocks, digest and queued job. Owned pending/replayed
  submission and foreign-access checks still apply; one score/release results.
- RUNNING recovery preserves the entire live job lease and exact immutable input
  graph. Another executor cannot steal a live lease. After actual database-clock
  expiry, it reclaims the same job with a higher fence; old load/finish commands
  lose their lease. Recovery produces one score/release with unchanged inputs.

Application services are quiesced before these database restarts; caller pools
remain connected. The independent foundation transaction supplies the open-write
rollback evidence. This does not inject a crash during an application COMMIT,
kill the host, test disk failure/PITR, or prove production RPO/RTO/capacity targets.
No product, schema, public API, publication authorization or dependency changed.

## Verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux. Actual coordinator execution:

| Command | Observed result |
|---|---|
| `node --test tests/integration/database/foundation/immediate-recovery.test.mjs` | PASS1 |
| `node --test --test-name-pattern='immediate PostgreSQL' tests/integration/student-runtime/student-runtime.test.mjs tests/integration/grading/worker.test.mjs` | PASS2 |
| `npm run test:db:foundation` | PASS35 |
| `npm run test:grading` | PASS23 |
| `npm run test:student` | PASS32 |
| `npm run test:recovery` / `npm run test:results` | PASS16 / PASS6 |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| Typecheck/build/emitted smoke/contract drift/consumer import boundaries | PASS |

The first focused foundation run passed but exposed an unnecessary retained
watchdog timer (about8s total versus0.44s test body). The helper now cancels that
timer; final focused and full foundation runs passed. No failing test is counted
as passing. Existing non-failing browser-module detection and historical
documentation whitespace warnings remain. Browser/Bank/assembly/attempt/directory
suites were not rerun for this test-helper-only change; their prior evidence
remains separate. Hosted CI, qualified manual accessibility and production
operations acceptance were not executed.

Transient command logs: `/tmp/tsa-immediate-{foundation-final,focused,foundation-suite,grading-suite,student-suite,recovery-suite,results-suite,contracts,consumers,static}.log`.
The commands and results here are the durable evidence, not the existence of logs.

Separate reviewer inspected the final timer cleanup, foundation open transaction,
both restart modes and RUNNING exact snapshots: no concrete P1/P2 findings.
Independently executed four-file syntax and scoped whitespace checks passed;
no files edited and no independent PostgreSQL execution claimed. Engineering
review is not qualified human question/content/rights or accessibility review.

## Status and continuation

G1 accepted; G2/G3 OWNER_ACCEPTED unchanged. Lawful inventory, named independent
human rights/content review, qualified accessibility acceptance and Track A remain
outstanding. Synthetic fixtures still cannot authorize production publication.
Owner AGENTS.md and unrelated research remain byte-preserved and unstaged.
No push, merge, deployment, paid model API, Astra or live student inference.

This adds real immediate database recovery evidence to the PostgreSQL student
path. Full OPS/pilot acceptance remains open. Next executable integration work
should address a documented uncovered requirement or concrete defect rather than
repeat browser variants; inspect database-unavailability handling against the
frozen failure contracts. Manual accessibility reviewer/platform and production
traffic/operational targets remain human inputs. Recommended implementer:
Sol6.1/High while Luna is unavailable; separate Sol6.1/Medium engineering reviewer.
