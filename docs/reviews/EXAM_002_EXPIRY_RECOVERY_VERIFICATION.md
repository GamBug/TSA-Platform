# Bounded trusted attempt expiry recovery

2026-10-22, base `bc3ed0a`, branch `feat/track-b-data-auth`. Sustained owner
continuation, existing EXAM-002 scope and documented cancellation/rights policy
authorize this slice. Accountable Codex Sol implements SQL016, race/fault tests and
integration. Native Luna/XHigh implements the isolated sweeper adapter, focused
tests and explicit local-loop integration. Separate native Sol6.1/Medium reviewed
final files read-only and independently executed tests; no files edited.

## Implemented

Worker-only `tsa.exam_worker_sweep(executor,batch_limit)` processes at most 100
attempts per transaction. Configuration is explicit and validated; no student,
identity, Bank or Factory capability gains execution. The shared Bank guard
precedes attempt locks; SKIP LOCKED lets another worker process a different
student while one transaction remains open. Form-availability locks and fresh
current rights checks preserve the existing ordering and precedence.

- Unavailable CREATED attempts cancel with existing RIGHTS_BLOCKED/FORM_WITHDRAWN
  reasons; elapsed immutable start TTL cancels with START_TTL_EXPIRED.
- Unavailable active attempts or inadequate deadline rights coverage invalidate;
  elapsed permitted active attempts expire at their original database deadline.
- Expiry atomically enqueues one existing digest/policy-bound grade job. Changes,
  jobs and service audit (`EXAM:<executor>`) commit together or all roll back.
- Original clocks, sealed manifests/forms/keys and committed assignment history
  remain immutable. Ordinary admission schedule edits do not become cancellation
  guards. Repeated sweeps are idempotent. Disabled users' elapsed attempts can be
  cleaned without an active candidate session; no new user-disable policy exists.

`createExamSweeper` uses the restricted worker pool with no role override, validates
bounded result counts and sanitizes failures. The local runtime now requires
`sweepBatchSize`; each single-flight poll awaits a sweep and then grading, with
separate catches so a sweep failure cannot starve already-queued submissions.
There is no new HTTP endpoint, frozen contract, publication privilege or live LLM.

## Actual verification

Node24.18.0/npm11.16.0/PostgreSQL18.6. Disposable synthetic fixtures retain the
existing database/postmaster-bound publication-test scope; they are not approved
production inventory or human review. Real PostgreSQL transactions verify locking,
constraints and rollback; one separate adapter case uses fake transport solely
for malformed-result/configuration/error mapping.

| Command | Observed result |
|---|---|
| `npm run test:recovery` | 16/16 PASS: 15 PostgreSQL cases +1 adapter, zero skips/failures |
| `npm run test:student` | 5/5 PASS |
| `npm run test:attempts` / `test:grading` / `test:results` | 28/21/6 PASS |
| `npm run test:bank` / `test:assembly` / `test:db:foundation` | 94/23/34 PASS |
| Auth/local/prototype regressions | 5/13/16 PASS |
| Contracts/emitted consumers | 106/11 PASS |
| Build/typecheck/emitted smoke/generated drift/import boundaries | PASS |
| Documentation check | FAIL: unchanged owner research whitespace and four missing temporary screenshots |

Evidence includes unattended original-TTL cancellation, original one-second
deadline expiry to one zero-credit score/release, worker-only access, strict SQL
arguments, disabled-candidate cleanup and unchanged future CREATED attempts after
both offering/form schedule shortening. Runtime HTTP restart/pool separation tests
also demonstrate grading through a sweep-only transport fault.

Fourteen transaction/race cases cover independent students under concurrent
sweepers; sweep-first save/submit and first-start waiters; a valid in-flight start
skipped across its original TTL; failures at attempt/job/audit/deferred COMMIT and
on the second batch attempt; mixed CREATED/active withdrawal; natural rights
expiry without fanout; and both revocation/sweep winner orders with observed
PostgreSQL lock waiters. Sealed public/private snapshots and history are checked
after restrictions/rollback. No immutable trigger or historical clock is disabled
or rewritten. A sweep committed before later revocation may enqueue a job; current
rights invalidate the attempt and the existing worker cannot release held content.

Separate read-only Sol6.1/Medium independently passed final recovery16/student5
and scoped diff-check, no open concrete P1/P2. Initial root race tests failed
because test assertions guessed two column names (`attempt_id` versus
`first_attempt_id`, form manifest versus assembly-run manifest); assertions were
corrected and the final suite passed. Luna's initially restricted socket/subprocess
runs failed permission checks; permitted runs supplied the actual passing evidence.
No fabricated passing test or qualified human review is claimed.

AGENTS SHA256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`;
owner files/assets/research are preserved and shared records remain unstaged with
prior owner edits. Transient logs: `/tmp/tsa-sweep-*.log`. Browser NOT RUN (no UI);
hosted CI NOT OBSERVED. No push/merge/deploy/Astra/paid API/publication.

## Next integration and limits

Add the existing frozen catalog and caller-owned history GETs, including safe
pagination and lazy current-rights/TTL reconciliation; then connect the existing
student client without UI reconstruction. The bounded backend now supports
unattended expiry through grading and released results, in addition to explicit
submission. Catalog/history/browser integration, a production worker process,
OIDC/operator provisioning and operational recovery of final failures remain open.
No completion of full EXAM-002/SCORE-001 or production acceptance is implied.
G1/G2/G3 retain owner acceptance; lawful stock, qualified per-question human review
and Track A evidence remain separate outstanding requirements.
