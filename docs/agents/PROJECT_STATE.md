# Project state

Snapshot: 2026-10-17, Phase 02.75 architecture/specification documentation is complete for final human architecture review. This page is navigation only; [backlog](../tasks/TASK_BACKLOG.md) owns task status, [decisions](../decisions/OPEN_DECISIONS.md) owns approvals, and [latest handoff](LAST_HANDOFF.md) records this integration evidence.

| Topic | Current position |
|---|---|
| Repository | VERIFIED before this integration: `main` at `6f00343c94a8511840936b1f3b5b4501b02e17e7` (`docs: resolve remaining architecture QA discrepancies`), with a clean worktree. This documentation integration leaves only its authorized coordination-file edits uncommitted; no application files, dependencies, migrations, or runtime assets exist. |
| Documentation baseline | VERIFIED: architecture, database, API, MVP, factory, reuse, roadmap, 36-task backlog, and G0–G3 lifecycle gates are documented and internally reviewed. This is not owner baseline approval or runtime readiness. |
| Three logical components | Independent scheduled Question Factory; human-controlled Question Bank; student-facing Practice Website. Factory outputs are drafts only and cannot publish; only approved bank content may enter student-facing assembly. Student requests never invoke or wait for LLMs. |
| Default practice policy | `PERSONALIZED_PRACTICE` + `NEW_ONLY`; the 10-question `practice-mini-v1` is independent practice, not an official HUST TSA simulation or score equivalent. |
| Owner decisions | ADR-004 H1 alone is APPROVED BY HUMAN OWNER: at most one active (`CREATED` or `IN_PROGRESS`) attempt per student across all modes. H2 and H3 remain unresolved. ADR-004 as a whole and all other ADRs remain PROPOSED. |
| QA evidence | VERIFIED documentation evidence: initial independent audit [LOW_COST_REVIEW_001](../reviews/LOW_COST_REVIEW_001.md), independent regression audit [QA_REGRESSION_001](../reviews/QA_REGRESSION_001.md), and subsequent residual-documentation repairs at `6f00343`. The regression audit records all eight original findings as resolved. Historical review reports remain immutable evidence. |
| Delivery structure | 36 implementation task IDs; G0 owner disposition, G1 shared contracts, G2 controlled publication, and G3 integration readiness. Track A (AI research/Factory) and Track B (bank/web engineering) may progress in parallel only under their gates and assigned ownership. |
| Implementation and verification | REQUIRES_VERIFICATION: no application implementation, PostgreSQL runtime verification, migrations, provider calls, browser tests, security tests, concurrency tests, load tests, or live AI evaluation. Static documentation verification is not runtime evidence. |
| Critical review risks | Owner disposition of proposed ADRs; H2/H3; lawful rights-cleared seed/evaluation inputs and independent reviewers; provider/data/budget/schedule/retention choices; small unseen inventory; equivalence/retention policy; shared PostgreSQL operational behavior. |
| Recommended next action | Final human architecture review at G0: disposition the proposed ADR scopes and unresolved H2/H3, then explicitly assign only gate-eligible work. Do not initialize implementation merely from this documentation completion. |

Authoritative entry path: [AGENTS](../../AGENTS.md) → [onboarding](AGENT_ONBOARDING.md) → this state → [latest handoff](LAST_HANDOFF.md) → assigned [backlog record](../tasks/TASK_BACKLOG.md) → relevant contracts and [decisions](../decisions/OPEN_DECISIONS.md).
