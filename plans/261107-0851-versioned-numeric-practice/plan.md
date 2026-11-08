# Versioned numeric practice

Status: IN_PROGRESS. Accountable implementer: current Codex controller. Source a70861a on feat/track-b-data-auth. Owner explicitly continued implementation after the prior report identified remaining entry formats. Scope follows the original mission's compatible shared-contract extension authority; no commit, publication, production database, paid API or source-corpus import.

## Outcome and constraints

Deliver one complete numeric-response vertical slice through real Bank draft/review, eligible allocation, owned attempt, exact answer persistence, authoritative grading and released review. Reuse the existing engine and independent-section H3 semantics. Preserve frozen question/1 and v1 route/schema/hash behavior; introduce explicit question/2 and v2 capability/policy. Do not fake numeric entry as a choice option. Default-off until its focused tests and independent review pass. Other formats follow only after this slice is integrated.

Numeric semantics: bounded decimal strings with an explicit DECIMAL format, period or comma decimal separator, no thousands separators, expressions, fractions, exponents or units. Compare exact canonical decimal strings; never floating-point approximation. Keep raw confirmed responses for persistence/idempotency; keys remain private. UI labels explain the accepted syntax and inputs bypass global shortcuts.

## Ownership and phases

1. Controller: versioned lifecycle schemas, identity/Bank/HTTP/allocation/persistence/worker integration, UI, SQL029 and documentation.
2. Numeric worker: only numeric-response.ts and its focused contract tests.
3. Independent reviewer: read-only compatibility seam review before schema changes; final integrated review after tests.
4. Controller: integration and PostgreSQL/browser/regression evidence, backed-up fresh/populated migrations before any execution.

Current allocation: Archimedes completed the numeric primitive and Bank integration (focused Bank test passes), and now owns staff.js, Bank HTTP/review-context and additive staff-v2 contract/test files. Euclid owns main.js, persistent-api.js, styles.css and focused client tests. Controller owns SQL029, runtime/server, lifecycle/upgrade/browser tests and integration. Writers have disjoint file sets. Independent review follows integration; no final review is claimed yet.

## Acceptance

V1 public schemas remain unchanged and their generated artifacts/tests pass. Q2 is excluded from v1 stock. Approved q2 numeric questions allocate through the existing engine; candidates type/save/revisit/refresh/retry and explicitly submit; SQL and worker agree on grading and release only the owned result. Invalid input never silently succeeds, input typing does not trigger shortcuts, missing inventory is explicit, rights/holds remain authoritative. Real PostgreSQL and both browsers plus independent review are required before calling the slice complete.

## Evidence

[Prior compatibility map](../reports/compatibility-261107-0756-question-interactions-and-combined-exam.md). Numeric primitive worker owns disjoint new files. The reviewer is mapping exact v1 rejection points while controller implements shared foundations. Existing uncommitted media/topic/recovery work is preserved.

Executed after numeric integration: build, typecheck and v1 generated contract drift checks pass. Numeric primitive/versioning contract files pass. Two real PostgreSQL lifecycle tests pass (service and v2 HTTP, raw-response replay/conflict, invalid syntax, v1 read/mutation/history/catalog exclusion, SQL/JS canonicalization equivalence, exact grading and authorized release). Populated 028→029 upgrade test passes with private backup before both the deliberate failing migration and successful migration; existing data, function/relation security, policies, clocks and answers are preserved, rollback and replay are inert. Logs currently under /tmp/tsa-numeric-*. Broader affected regression run is in progress. Browser and staff integration remain in progress. No retained database has been migrated.

Diagnosed and corrected: SET TRANSACTION REPEATABLE READ must precede any snapshot-taking SELECT; the numeric context uses SET LOCAL instead of SELECT set_config. Bank v2 idempotency scopes need an additive actor-bound RLS policy. The migration's assembly manifest CASE expression requires parentheses. These fixes preserve the v1 defaults rather than weakening their tests.
