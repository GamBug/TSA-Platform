# EXAM-001 persisted start and safe delivery

2026-10-21. Base `6fc219e`, branch `feat/track-b-data-auth`. Accountable
integrator Codex Sol; actual native Luna/XHigh implemented the isolated attempt
service, loopback HTTP adapter and main service/HTTP tests. Sol implemented SQL011,
deadline/schedule tests and coordinated records. Separate read-only Sol6.1/Medium
engineering review is recorded below; it is not qualified human content review.

## Implemented boundary

- Existing atomic standalone NEW_ONLY allocator exposed through a strict local
  create adapter. Durable USER_CREATE token buckets are shared across replicas;
  matching retained receipts replay before charging. Configuration is explicit,
  with no production defaults. Technical bounds: integer capacity 1–1000 and
  finite refill 0.000001–1000 tokens/second; six-decimal tokens truncate downward.
- SQL011 grants only owned start/read/budget commands to `tsa_exam`. Internal
  functions and private keys are not granted. Frozen G1 schemas/solver remain
  unchanged. No new table or public error code.
- First start locks the shared Bank guard, owned attempt and availability in
  existing order. Immutable stored TTL and current holds/rights apply. Actual
  trigger-generated start/deadline are authoritative; uncovered actual deadlines
  roll back first-start/section changes before committing cancellation. No
  reselection, snapshot replacement or assignment-history deletion.
- Repeated starts return the same persisted clocks. Exact route/actor/key/hash
  receipts remain tied to lifecycle retention. Clock-only replay never grants
  content access. Ordinary admission schedule edits preserve committed TTL.
- Owned safe GET uses the frozen response boundary, including its fresh final
  guard, inside one PostgreSQL transaction. CREATED/terminal views contain no
  slots/answers; active views expose only the sealed public projection. Rights
  invalidation denies HTTP delivery. Deadline expiry commits EXPIRED plus exactly
  one durable grading job using the existing SQL grading digest/dedup convention.
- HTTP requires canonical loopback origin, trusted authentication, candidate
  permission and CSRF for mutations; strict request/response validation, bounded
  JSON and no-store/nosniff apply. Unsupported answer/submit routes stay unavailable.

This adapter is exercised over real loopback HTTP in tests. It is not wired into
the existing prototype server/UI; that application still uses mock student exams.
No production publication path is enabled. Disposable synthetic approvals use
the existing database/postmaster-scoped fixture boundary and are not human review.

## Verification

Pinned Node24.18.0, npm11.16.0, PostgreSQL18.6; disposable real PostgreSQL clusters.
Commands run locally, not hosted CI. PostgreSQL/socket and fixture subprocess
tests used permitted execution outside the restricted wrapper.

| Command | Observed result |
|---|---|
| `npm run test:attempts` | 5/5 PASS; zero failures/skips/cancellations |
| `node --test tests/integration/attempts/deadline-races.test.mjs` | 3/3 PASS |
| `npm run test:assembly` | 23/23 PASS |
| `npm run test:bank` | 94/94 PASS |
| `npm run test:db:foundation` | 34/34 PASS |
| `npm run test:auth` | 5/5 PASS |
| `npm run test:local` | 13/13 PASS |
| `npm run test:b0` | 16/16 PASS |
| `npm test` with permitted subprocesses | 106/106 PASS |
| `npm run test:consumers` | 11/11 PASS |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS |
| `npm run docs:check` | FAIL: preserved owner research whitespace and four missing `/tmp` screenshot targets |

Focused tests cover owned/missing/foreign access, no pre-start content, private
field exclusion, immutable sealed public/private snapshots, exact repeated start
receipts, shared creation throttling without start throttling, restart via new
service instance, real stored TTL expiry/cancellation and retained NEW_ONLY
history. Deadline tests prove the actual post-trigger coverage check, rollback
of section/receipt, final-guard payload discard at elapsed deadline, one queued
job, and non-retroactive ordinary schedule shortening/extension.

Initial service-test defects (four-slot expectations, wrong closure path, wrong
question column, mismatched randomized replay key and Date conversion precision)
and lock-observer/helper/forged-principal status defects were corrected before
final verification. The initial test-only immutable TTL
rewrite was replaced with an actually expiring short admission window. An initial
oversized approval request timed out without execution; splitting filesystem
edits from small permitted PostgreSQL commands succeeded. Restricted contract
execution reported two child-fixture file failures; the permitted complete run
passed106. Neither failed execution is described as passing evidence.

## Independent engineering review

Separate read-only Sol6.1/Medium reproduced a P2 rate-limit overflow: the accepted
`1e-300` refill produced SQL22003 instead of429. SQL and constructor now enforce
the technical minimum above. Reviewer independently ran the initial two deadline
tests successfully. Final stable-tree independent `npm run test:attempts` passed
5/5 and `npm run test:bank` passed94/94, with no failures/skips/cancellations; scoped
whitespace check passed. Reviewer reported no unresolved concrete P1/P2 findings
and edited no files.
Review also required actual first-start/revocation lock ordering instead of an
already-started receipt race, and corrected misleading fixture expectations.
Final real PostgreSQL `pg_stat_activity` evidence verifies both winner orders:
first-start shared lock blocks revocation until its clock receipt commits, then
revocation invalidates without slots; an exclusive rights hold blocks first start,
then start fails410 with committed RIGHTS_BLOCKED cancellation. These tests execute
real SQL transactions; driver barriers pause commits without mocking DB results.

## Preservation and remaining work

Sixteen unrelated tracked diffs and nineteen original untracked files compared
identically with the starting recovery snapshot. AGENTS.md SHA256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Shared owner records remain unstaged; only named implementation/test/evidence
files enter the local checkpoint. No push, merge, deployment, live LLM, paid API,
research change, production publication or G1 change.

EXAM-001 remains IN_PROGRESS: revisioned answers/autosave are not implemented.
Submission/grade worker/scoring/released results/sweeps and complete browser
integration remain later work. Lazy expiry queues work; it does not grade it.
Full ASSEMBLY bundle/repeat/fixed modes and diagnostics are outside this slice.
Track A remains separate. G1 accepted; BANK-002 formal acceptance and G2/G3 remain
unaccepted pending lawful inventory, current rights, named distinct qualified
human exact-hash content/equivalence review and authorized publication evidence.

Next executable card: EXAM-001 persisted revisioned answer saves over the existing
frozen slot/answer/revision DTOs. Enforce ownership, active section/deadline/current
holds and sealed slot identity; serialize same-attempt writes, exact-key lost-ACK
replay and stale-revision conflicts; implement independent USER_SAVE throttling
without throttling submission. Test real PostgreSQL restart/cross-tab/closure
races with disposable synthetic fixtures. Recommended Codex Sol6.1/High for the
coupled SQL/authorization, isolated Luna/XHigh implementation if available, and
separate Sol6.1/Medium read-only engineering review; Sol fallback, no paid APIs.
