# Implementation roadmap

Status: PROPOSED Phase 02.75 sequencing, not implementation authorization. [Backlog](TASK_BACKLOG.md) owns statuses; [decisions](../decisions/OPEN_DECISIONS.md) owns approval gates.

| Milestone / track | Dependencies and work | Exit evidence |
|---|---|---|
| M0 — Refined foundation | FOUND-006 → FOUND-004; FOUND-003 source verification and RESEARCH-002 research planning can be assigned early | Revised contract/ADR owner dispositions; no inferred approval |
| Shared contract foundation | FOUND-002 after owner implementation authorization | Canonical question/factory-package/API fixtures and jobs contract; compatible independently executable consumers |
| A1 — Early AI feasibility | RESEARCH-002; AI-001 after shared contracts/G3; AI-002 with lawful held-out human labels | Fake and provider adapters run independently of web/OIDC; measured model comparison, source/quality/cost evidence |
| A2 — Batch prototype | FACTORY-001 after AI-001 and budget/schedule/review-capacity approval | Manual/weekly bounded plans, recovery, idempotent export, cost/acceptance reports; no publication privilege |
| B1 — Safe bank | DATA-001 + AUTH-001 → BANK-001; DATA-002 human-authored inventory in parallel after scope approval | DB integrity, rights, immutable versions, equivalence review and human-only approval |
| B2 — Personalized web slice | ASSEMBLY-001 → EXAM-001; EXAM-002 + SCORE-001 → WEB-001 | Two unseen attempts, explicit shortage, save/submit/results/history; factory disabled |
| I1 — Research/platform integration | INT-001 after A2, AI-002, bank and attempt/scoring slice | Same package twice → one draft set → human-approved subset → completed exam; scenarios A–J |
| B3 — Pilot readiness | WEB-002 + TEST-001 + OPS-001 | Independent review, security/recovery/load evidence, approved operational/privacy policy |
| Later breadth / research | CONTENT-001 after verified profile/inventory; RESEARCH-001 after adequate data and explicit scope | Versioned richer interactions or evidence-backed calibration/solver proposal |

Track A must not wait for B2. Its fixture store/export path uses the same canonical contracts but does not require deployed bank/auth/web. Shared production integration uses BANK-001, never a second publishing store. A1 can expose infeasible quality/cost assumptions while Track B develops its manually verified slice.

Track B does not wait for AI quality or availability. Thirty starter questions are intentionally small: per-user disjoint inventory will run out, and shortage UX is part of the first slice. The research integration milestone is separate from web-MVP acceptance; public release requires its own authorized release scope.

Parallel assignments require disjoint files or worktrees and explicit owners. DATA-001 owns core relational migrations; FACTORY-001 reserves factory migrations; BANK-001 owns import receipts; EXAM-002 owns grading worker integration. FOUND-002 freezes shared job/contract interfaces before consumers diverge. A coordinated integrator resolves shared migration ordering and state files; role/provider names do not imply assignment. Follow [handoff protocol](../agents/HANDOFF_PROTOCOL.md).

No calendar or throughput commitment is made. Next action: owner review of current ADR revisions and explicit assignment of research or implementation after the corresponding gates. No code starts in this documentation phase.
