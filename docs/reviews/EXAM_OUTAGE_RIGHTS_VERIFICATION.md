# EXAM-002/OPS-001 rights during worker outage — 2026-10-22

**Bounded engineering verification IMPLEMENTED / VERIFIED.** Accountable Codex
Sol6.1, branch `feat/track-b-data-auth`, base `ebb25f2`. Starting worktree contained
only owner AGENTS.md changes and untracked reference research. Existing continued
local engineering authority applies. Only the existing process-recovery test file
and coordinated records changed; the child harness, production code, schema, G1
contracts, rights policy and publication capabilities are unchanged. No Astra,
paid model API, live inference, push, merge, deployment or real publication.

## Observed behavior

Two actual PostgreSQL/OS-process scenarios extend the existing crash harness:

1. Original isolated READING2 stock is allocated, started, answered and submitted
   through the existing student HTTP/client transport. Worker execution pauses
   before claim (QUEUED) or before load after a committed claim (RUNNING).
2. The owned combined HTTP/worker child is killed with SIGKILL and reaped; its
   listener is confirmed unavailable. PostgreSQL stays running and the existing
   synthetic publication scope stays active.
3. The separately authorized Bank service records a REVOKED decision for only the
   passage source while the child is dead. The primary question source remains
   OWNED. Existing Bank fanout changes the submitted attempt to INVALIDATED.
   Exact manifest/form/public passage/private keys/answers/history/clocks stay
   unchanged; the existing queued/leased job is not rewritten by that fanout.
4. A new child PID starts the normal restricted runtime at the same origin. A
   live old RUNNING lease is preserved, not stolen. Owner GET/result return410;
   matching original submission-key retry returns410 CONTENT_WITHDRAWN because
   current withdrawal precedes receipt replay. Error bodies contain no passage,
   question text, source reference, keys, explanations or internal metadata.
   Foreign candidate GET/result return404. Future allocation returns422
   INSUFFICIENT_ELIGIBLE_INVENTORY despite the previous fixture approvals.
5. Recovery claims the queued work, or reclaims RUNNING work after actual lease
   expiry. Current-rights checks cancel it with CONTENT_WITHDRAWN, clear the lease,
   and retain immutable job identity/dispatch/digest. RUNNING increments its fence
   token; stale old load/finish probes return LOST_LEASE. A fresh claim returns IDLE.
   Final counts are one attempt, two historical identities, one CANCELLED job,
   **zero scores, score items, releases and ATTEMPT_GRADED audits**.

Claiming invalidated work is allowed for cleanup. These tests prove cancellation
before grading/release, not a rule forbidding every claim. The RUNNING stale command
probes occur after recovery cancellation; a first still-live token call immediately
after revocation can instead return CANCELLED under the existing worker contract.
Existing grade/rights lock-order regression covers that live-token ordering.

No artificial clock movement, shortened lease, mocked database result or direct
rights-table rewrite establishes these results. Rights changes use the existing
restricted SourceService command and independent Bank-manager fixture principal.
Children exit/are reaped before parent database cleanup. Original test-only review
and source evidence establish no real content rights or qualified human approval.

## Executed verification

Node24.18.0, npm11.16.0, private actual PostgreSQL18.6. Coordinator commands:

| Executed command | Observed result |
|---|---|
| `node --test --test-name-pattern='rights revoked' tests/integration/student-runtime/process-recovery.test.mjs` | PASS2/2 new cases; QUEUED about1.6s, RUNNING11.2s |
| `npm run test:student` | PASS24/24, zero failures/skips; includes all five OS-process recovery cases and prior transport/security/demo/shared-reading cases |
| `npm run test:grading` | PASS22/22, including actual grade/rights lock ordering and lease fencing |
| `npm run test:results` | PASS6/6 |
| `npm test`, `npm run test:consumers`, `npm run test:built` | PASS106/106,11/11 and emitted smoke |
| `npm run build`, `npm run typecheck` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS generated drift and consumer/import boundaries |
| `npm run docs:check`, staged `git diff --check` | PASS; zero documentation errors, preserved historical whitespace warning |
| `pg_dump --version`, `pg_restore --version` | Both18.6; tool availability only, no backup/restore drill executed |

The new focused cases passed on their first execution. No failed or missing test
was counted as a pass. The existing harmless parent-module type warning remains;
child stdout/stderr are asserted empty. Actual separate-process/PID and database
checks are in [the test](../../tests/integration/student-runtime/process-recovery.test.mjs).

Not rerun: full Bank/foundation/auth/assembly/attempt/local/recovery/scoring suites
and browser/manual accessibility. Their production code is unchanged; earlier
executed evidence remains in the prior handoffs. This slice verifies no host/DB
crash, production supervision, native zoom, qualified screen reader or real inventory.

## Independent engineering review and preservation

Actual separate native `/root/directory_review`, Sol6.1/Medium, read-only: audited
existing withdrawal/receipt/worker policy, then reviewed the final99-line test delta.
No concrete P1/P2 findings. Independently ran scoped syntax and whitespace checks:
PASS. Inspected coordinator focused log; did not independently execute PostgreSQL.
Child harness unchanged; no reviewer files edited. Sol implemented while Luna had
previously reached its actual usage limit. Engineering review is not qualified
human content, rights or publication approval.

Owner files remain byte-preserved and excluded from the checkpoint:

- AGENTS.md: `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
- Reference research: `6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba`.

## Continuation

The integrated student backend now has actual failure/recovery evidence that
current passage rights override old approvals, leases and matching receipts.
No product defect was reproduced, so production code was not expanded. G1 accepted;
G2/G3 OWNER_ACCEPTED unchanged. Full OPS/EXAM/pilot acceptance, lawful inventory,
named qualified reviewers, manual accessibility and Track A remain outstanding.

Next bounded OPS-001 card: **disposable PostgreSQL backup/restore integrity drill**.
Inspect existing database fixtures and use the pinned18.6 dump/restore tools with
original synthetic data only. Restore into an isolated target, preserve exact sealed
questions/manifests/private keys/answers/history and durable job input/digest;
re-attest restricted roles, verify current rights/ownership and exactly-one pending
job recovery. Confirm old postmaster/database-bound synthetic publication scope
cannot authorize new publication in the restored environment. Keep any archive
private and delete owned temporary artifacts after the drill. No production backup,
retention-policy decision, real inventory, publication grant or deployment is
implied. Recommended implementer Codex Sol6.1/High for restoration/security boundaries
while Luna is usage-limited; separate Sol6.1/Medium read-only independent reviewer.
Tool versions were checked; the drill itself is not yet implemented or verified.
