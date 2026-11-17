# Program audit and repair loop

Status: active. Accountable implementer: current Codex session; single agent.

## Outcome and constraints

Audit the full program for reproducible errors, bugs and usability problems, repair confirmed causes, and verify affected behavior. Preserve the existing uncommitted Math intake work and approved versioned contracts. Do not publish retained content, change source captures, call paid APIs, or delegate. The owner's current request explicitly authorizes code fixes; historical documentation-only phase restrictions do not prohibit this work.

## Acceptance and loop

1. Inventory application, service, contract, import and operational surfaces and existing checks.
2. Run available baseline checks, inspect failures and uncovered boundary paths.
3. For each confirmed issue: reproduce, fix the cause, run focused checks, then broaden for shared behavior.
4. Review changes inline and record commands, outcomes, remaining gaps and next audit targets.
5. Repeat until coverage of the requested program scope and resolved findings supports completion. Passing a subset does not establish completion.

## Current evidence

Starting HEAD: `61a35ab`, branch `feat/track-b-data-auth`. Existing modified/untracked Math intake implementation and documentation are preserved. Results and live verification handles are in the [audit report](../reports/codex-261111-2256-program-audit.md). No independent review is claimed.

## Coverage tracking

| Surface | Current evidence | Next action |
|---|---|---|
| Versioned contracts and consumers | Build/typecheck, generated artifacts, 192 contract tests and emitted consumers pass | Preserve contract boundaries during fixes |
| AI/import and scoring/authentication | 121 tests pass; source/admission and scoring code inspected | Review additional failure boundaries as findings arise |
| Student and staff clients | Protocol mismatch, stale simulation/deadline reads, numeric staff discovery, unsaved author navigation and reserved-attempt labels repaired; 109 app tests plus staff, simulation and 19 additional browser journeys pass | Reconcile final surface coverage and remaining verification gaps |
| Database and lifecycle | Foundation/invariant baseline and 543-check backend run pass; final rights timestamp checks preserve microsecond intervals; 33 topic/attempt checks pass | Continue inspection of uncovered boundaries |
| Operational scripts and publication | Route/publication and startup role/capability repairs verified; 38 focused security checks, broad backend run and real university/Reading Factory launch-cleanup journeys pass; private import/backup/coordinator paths inspected | Consolidate final revision evidence and operational coverage |
| Documentation/dependencies | Documentation checks pass; dependency audit reports no vulnerabilities | Keep audit/handoff evidence current |
