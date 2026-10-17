# Latest handoff — FINAL-SYNC-001

Date: 2026-10-17 (Asia/Bangkok). Accountable implementer: Codex, Technical Project Integration Engineer. Status: COMPLETED planning synchronization; no owner architecture approval, G0 passage or implementation authorization is implied.

## Scope and repository state

Authorized scope: [TASK_BACKLOG](../tasks/TASK_BACKLOG.md), [IMPLEMENTATION_ROADMAP](../tasks/IMPLEMENTATION_ROADMAP.md), [PROJECT_STATE](PROJECT_STATE.md), and this handoff. The decisions register and all architecture/specification contracts were inspected and intentionally not edited because their latest committed owner-approval evidence was already accurate. QA reports, research, and all application assets remained read-only.

Starting repository evidence: `main`, clean worktree, HEAD `19a392e3798d427f80919654cb18cee8b21d850c` (`docs(exam): approve ten-minute start TTL`). Recent committed changes approved H2/H3, moved the MVP to independent domain tests, repaired lifecycle gate cycles, and persisted the immutable ten-minute start deadline. This handoff leaves only its four authorized coordination-file edits uncommitted, as commits were not authorized.

## Integrated outcome

- Documentation architecture/specification work and final planning synchronization are complete to the extent evidenced for final human review; they are not an approved or runtime-ready baseline.
- The final independent architecture-review findings and regression findings remain immutable evidence; their documented repairs are in the committed documentation series. No new independent review is claimed by this synchronization.
- The backlog retains exactly 36 stable implementation task IDs with non-cyclic G0–G3 gates: G0 scoped architecture authorization, G1 shared runtime contracts, G2 controlled publication, and G3 integration readiness. Track A (independent AI research/Question Factory) and Track B (Question Bank/Practice Website) are parallel only within their stated gates and separate ownership.
- Logical boundaries are unchanged: the scheduled Question Factory creates/validates drafts but cannot publish; human-controlled Bank approval creates the only eligible stock; the Practice Website assembles only approved bank content. No student request calls or waits for an LLM.
- The default is `PERSONALIZED_PRACTICE` + `NEW_ONLY`. The MVP comprises independently created MATH-4, READING-2 and SCIENCE-4 tests with separate lifecycle, timing, scoring and authorized review. The vetted seed target is 12/6/12. It is independent practice, not an official HUST TSA simulation, official-experience reproduction or combined official score.

## Decisions preserved

ADR-004 H1, H2, H3 and MVP Start TTL are scoped APPROVED BY HUMAN OWNER: one active `CREATED` or `IN_PROGRESS` attempt per student across modes; admission-only `[available_from, available_until)` with validly started tests allowed to finish; one MATH, READING or SCIENCE domain per independent MVP test; and immutable `start_before_at = min(created_at + 600 seconds, admission_until_at_creation)` with strict-before first start. ADR-004 remains PROPOSED as a whole; all other ADRs retain their existing PROPOSED statuses. Ordinary availability-schedule edits after CREATED are explicitly OPEN: do not assume retroactive or non-retroactive behavior. This task approved, revised or inferred no decision.

## Verification evidence

| Executed check | Environment / result | Limit |
|---|---|---|
| `git status --short`; `git log -5 --oneline`; branch/HEAD inspection | Linux/bash, 2026-10-17; starting state clean on `main` at `19a392e` | Git evidence, not runtime verification |
| Required contract/review inspection | Decisions; MVP, assembly, engine and reuse specifications; database/API/test strategy; backlog/roadmap; project state/handoff; historical QA evidence | Documentation analysis only |
| `git diff --check`; `git diff --stat`; `git status --short`; authorized-file/stale-term/task-heading checks; static documentation verifier from [TEST_STRATEGY](../quality/TEST_STRATEGY.md) | Linux/bash, 2026-10-17: diff check exit 0; four modified authorized paths; 36 task headings; no obsolete combined-test or TTL-default normative wording in the four changed records; checker exit 0 with 21 required files, 42 Markdown files, 194 local links, 36 task IDs, unchanged research hash and `errors: []` | The preserved immutable review whitespace warning remains; static checks do not test application behavior, PostgreSQL or a runtime graph engine |

Not run: PostgreSQL DDL/migrations, application unit/integration/contract/API/browser/security/concurrency/load tests, provider calls, scheduled factory runs, AI evaluation, or deployment/recovery testing. No application implementation exists. Static documentation verification must not be read as runtime or PostgreSQL readiness.

Independent QA evidence: [LOW_COST_REVIEW_001](../reviews/LOW_COST_REVIEW_001.md) (initial audit) and [QA_REGRESSION_001](../reviews/QA_REGRESSION_001.md) (regression audit). This integrator did not rewrite either historical report or claim a new independent review.

## Next architecture reviewer

Start with [PROJECT_STATE](PROJECT_STATE.md), this handoff, [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md), [MVP_SCOPE](../specifications/MVP_SCOPE.md), [SYSTEM_ARCHITECTURE](../architecture/SYSTEM_ARCHITECTURE.md), [IMPLEMENTATION_ROADMAP](../tasks/IMPLEMENTATION_ROADMAP.md), [TASK_BACKLOG](../tasks/TASK_BACKLOG.md), and the two QA reports.

First resolve and record the OPEN product decision for ordinary admission-schedule edits after an attempt is CREATED; retain the immutable committed start deadline and independent withdrawal, rights and security restrictions regardless. Then the owner must record G0 scoped architecture authorization and assign an accountable implementer. The recommended first implementation task is FOUND-002, which establishes G1; DATA-001 and the authorized AUTH-001 local path then follow, with Track A fixture work only at its stated G1 boundary. Remaining owner inputs cover proposed ADR mechanisms, rights/reviewers, provider/data handling, budget, schedule, retention, deployment and privacy. Critical risks remain small unseen inventory, equivalence/retention semantics, publication isolation and unverified shared-PostgreSQL concurrency/capacity. Do not begin code, migrations or live providers from this synchronization alone.

Ownership transfer: FINAL-SYNC-001 releases the four authorized coordination files. No next implementer is assigned. On resume, inspect current Git status before editing and preserve these uncommitted handoff changes or commit them only with explicit authorization.
