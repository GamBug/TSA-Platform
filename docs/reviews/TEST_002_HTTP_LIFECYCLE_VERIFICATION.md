# Generated lifecycle over real HTTP — TEST-002

2026-10-23, `feat/track-b-data-auth`, base `db9c51c`. Accountable implementer:
Codex Sol6.1. Last Luna attempt was usage-limited; current capacity not freshly
verified. Status: IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED.
Final review closure is recorded below; full TEST-002 acceptance remains open.

## Implementation and boundaries

The existing seeded model now runs both direct-service and loopback HTTP variants.
The same expected-state/answer/revision/score/immutable-input/raw-clock oracles
remain; no duplicate solver, scorer, publication or lifecycle implementation.
New test-only `student-http-harness.mjs` composes the real student runtime, separate
restricted identity/exam/worker pools and actual local bootstrap/login sessions
for studentA, studentB and author. Requests carry their own cookies/CSRF; no
principal identity header is trusted. The fixture remains private and synthetic.

The ordinary runtime poller is deliberately isolated at its sweep/claim query
boundary while role/pool attestation and other SQL execute normally. The model's
separate trusted worker runs real claim/load/score/finish operations. Isolation
throws a fixed test error rather than fabricating query rows; this is not evidence
of normal automatic worker-loop progress, which has separate runtime coverage.

All generated student mutations, reads and result requests in HTTP mode use
actual loopback fetch, frozen route response schemas and egress/private-field
checks. No-store, nosniff and JSON headers are checked. Error request-ID headers
must match bodies when provided; the frozen GET boundary does not require that
header. Internal service `replayed` flags are asserted only in service mode;
HTTP replay is proven by exact public receipt bodies, never a synthesized flag.

Both CREATED and started HTTP phases additionally exercise valid-shaped writes
with missing CSRF, untrusted Origin, no session cookie and a real author-role
session. Expected responses are403 CSRF_FAILED,403 FORBIDDEN,401 UNAUTHENTICATED
and403 FORBIDDEN respectively. Every probe is followed by database/model checks;
denial cannot alter answers, immutable artifacts, state, history or job/score counts.
The untrusted Origin is only a request header; requests still target loopback.

## Observed cases

| Action seed | Progression | Service actions | HTTP actions including probes | Validated API responses | Denied probes |
|---|---|---|---|---|---|
| 79225 | explicit submit/grade | 80 | 88 | 84 | 8 |
| 149120 | actual10sec expiry/grade | 80 | 88 | 87 | 8 |
| 201749 | active source-rights invalidation | 65 | 73 | 72 | 8 |
| 160130 | never-started rights cancellation | 32 | 36 | 36 | 4 |

Total542 actions across both transports; HTTP covers279 API responses and28 denied
security probes, excluding the additional real auth bootstrap/login responses.
Started cases exercise SC/MC/TFG; never-started cancellation correctly has no
successful answer writes. Existing phase-bounded/reproducible action semantics,
fixture-ID/solver-RNG limits and non-exhaustive/non-concurrent scope still apply.

Initial HTTP run failed0/4 because the test expected CSRF_FAILED for an Origin
denied by the outer FORBIDDEN guard. A subsequent run failed0/4 on an unsupported
mandatory X-Request-Id expectation for the frozen GET boundary. Both expectations
were corrected against existing implementation/contracts; no production behavior
or G1 contract changed. Those runs are failures, not passing evidence.

Sanitized diagnostics now retain only an allowlisted model/helper basename and
source coordinates, never the private parent path or original assertion data.
The pure sentinel test exercises a private path in a helper-origin failure and
checks the marker, original causes/values and unknown trace fields are omitted.

## Actual coordinator verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux.

| Command | Observed result |
|---|---|
| `node --test --test-name-pattern='transport=http' tests/critical/student-state-machine.test.mjs` | Final PASS4 |
| `npm run test:critical:student` | PASS9: eight real-PG models plus one pure diagnostics test |
| `npm run test:student` / `npm run test:attempts` / `npm run test:auth` | PASS34 / PASS28 / PASS5 |
| `npm run test:grading` / `npm run test:results` | PASS23 / PASS6 |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| Typecheck/build/emitted smoke/contract drift/consumer import boundaries | PASS |
| Coordinator syntax/scoped whitespace and `npm run docs:check` | PASS |

Final counted suites have zero failures/cancellations/skips. Full Bank/assembly/
foundation/recovery/local/directory/browser suites were not rerun for this
test-only addition; earlier evidence remains separate. Hosted CI/manual
accessibility not executed. Existing non-failing warnings remain.
Transient logs: `/tmp/tsa-critical-http-*.log`; commands/results here are durable.

## Independent review status and exact packet

Actual `/root/directory_review`, Sol6.1/Medium, inspected the earlier structure,
real cookie/CSRF sessions, schema checks, worker isolation and model-worker split.
It independently passed syntax/whitespace and the earlier pure diagnostics1 test,
but correctly reported that its inspected intermediate HTTP log failed0/4 and
the helper was still changing. That is not a final no-findings or passing-review
claim. The requested final recheck then returned an actual usage-limit error.
No replacement review or independent final PostgreSQL execution is fabricated.

Final exact file SHA-256 values for resumed read-only review:

- `tests/critical/student-http-harness.mjs`:
  `1b939cf99b2570e9ec720f00a2d80ca0f2d34eee56ff029af8ce71cf14be0ee9`.
- `tests/critical/student-state-machine.test.mjs`:
  `18190433c053a436844edc4ff162e3b4e280552322b4d4c52278930a7cded158`.

Review the diff from`db9c51c`, especially final conditional request-ID handling,
allowlisted diagnostic filename, auth/cookie isolation, real probe precedence,
worker gating/cleanup and preservation of the independent model. Rerun syntax/
whitespace and `node --test --test-name-pattern='generated failure diagnostics' tests/critical/student-state-machine.test.mjs`;
run actual PG cases only where the reviewer can execute them and report that
scope honestly. Coordinator results are evidence, not independent review.
Recommended separate Sol6.1/Medium context once available; use an existing owner
subscription only, without assuming availability or buying/using paid model APIs.

## Handoff

Next action is the missing final independent review; repair concrete findings
before treating this critical-test extension as reviewed evidence. TEST-002 stays
IN_PROGRESS; no complete harness, EXAM/SCORE/WEB/OPS/pilot acceptance claim.
G1 accepted/G2/G3 OWNER_ACCEPTED unchanged. Qualified human review/accessibility,
lawful inventory, operator-regrade authorization/contract and operational targets
remain distinct; Track A remains separate/incomplete.

Owner AGENTS.md/unrelated research preserved. No application/schema/contracts/
publication grants changed, push/merge/deployment/Astra/paid APIs/live student
inference or unauthorized publication. Broad goal remains active. A local test-only
checkpoint preserves reviewable work; it does not waive pending independent review.

## Final independent review closure — 2026-10-23

Separate native agent `/root/lifecycle_review`, Codex Sol6.1 / Medium, performed
read-only review of `db9c51c..b4a8097`. Both exact hashes above matched before and
after review. No concrete findings. Review covered authentication/principal
isolation, CSRF/Origin/role denials, independent oracles, worker gating/cleanup,
diagnostic privacy, conditional request IDs and unchanged frozen contracts.

Independently executed Node24.18.0/npm11.16.0/PostgreSQL18.6 checks:

- `node --check tests/critical/student-http-harness.mjs` and
  `node --check tests/critical/student-state-machine.test.mjs`: PASS.
- `git diff --check db9c51c..b4a8097 -- tests/critical/student-http-harness.mjs tests/critical/student-state-machine.test.mjs`: PASS.
- `node --test --test-name-pattern='generated failure diagnostics' tests/critical/student-state-machine.test.mjs`: PASS1.
- `node --test --test-name-pattern='transport=http' tests/critical/student-state-machine.test.mjs`:
  PASS4, zero failures/skips/cancellations; 285 actions, 279 validated responses,
  28 denied probes. Initial restricted execution failed at private socket setup
  with EPERM; an approved unrestricted rerun produced these observed passes.

The reviewer did not rerun service models or broader regression/browser suites.
No files changed during review. The earlier pending-review account remains
historical evidence of the interruption; this closure supersedes its next-action
instruction only. No full critical-harness, human acceptance or production claim.
