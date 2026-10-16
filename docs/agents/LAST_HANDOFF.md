# Latest handoff — FOUND-006

Date: 2026-10-16. Agent: Codex, lead architect/documentation integrator. Phase 02.75 documentation refinement only; status COMPLETED after static checks and manual scenario review. No code, dependencies, migrations, framework initialization or commit.

## Starting and current repository state

Started on main, unborn HEAD, all existing files untracked. Existing owner/reviewer documents were preserved and integrated, not reset. No concurrent writer/next implementing agent was assigned. Current reference remains uncommitted main, no commit ID. A session-local pre-edit SHA-256 map supports the file-scope audit because Git has no tracked baseline.

Scope: independent factory, personalized reusable-bank allocation, supporting schema/API/specification/backlog/ADR updates. Original research and both review reports are read-only. Previous FOUND-005 completion evidence remains in its backlog record and preserved resolution; this handoff does not claim its historical review applies to these new proposals.

## Files changed

Created:
- docs/specifications/QUESTION_FACTORY_SPEC.md
- docs/specifications/QUESTION_REUSE_POLICY.md

Modified:
- README.md; AGENTS.md
- docs/architecture/SYSTEM_ARCHITECTURE.md; DATABASE_DESIGN.md; API_CONTRACTS.md
- docs/specifications/QUESTION_SCHEMA.md; MVP_SCOPE.md; AI_QUESTION_PIPELINE.md; EXAM_ASSEMBLY_SPEC.md; EXAM_ENGINE_SPEC.md
- docs/tasks/IMPLEMENTATION_ROADMAP.md; TASK_BACKLOG.md
- docs/decisions/OPEN_DECISIONS.md
- docs/quality/TEST_STRATEGY.md
- docs/agents/AGENT_ONBOARDING.md; PROJECT_STATE.md; LAST_HANDOFF.md

Research, both review reports, HANDOFF_PROTOCOL/TEMPLATE and .gitignore remain unchanged.

## Decisions and outcomes

Owner product requirements are recorded durably in decisions, not mistaken for architecture approval. Eight ADRs remain PROPOSED: 001/002/005 r2, 003/004/006 r3, 007/008 r1.

Separate factory executable/credentials/pools/job-kind permissions; manual/weekly deficit-driven batches bounded by budget and validator/reviewer capacity; reusable jobs and idempotent canonical draft import; independent human approval is publication. Website never calls or waits for LLM generation.

Personal form + CREATED attempt + stable-ID history + success receipt commit atomically under per-user allocation locking and shared bank guard. Current equivalence membership excludes variants; corrected versions remain seen. Cross-student reuse allowed; global usage is analytics only. Explicit shortage/review/fixed alternatives; cancellation does not reset history. Existing server timing, frozen snapshots, safe DTOs and practice scoring remain intact.

Early Track A: RESEARCH-002 → AI-001/002 + FACTORY-001; Track B: lawful bank → personalized engine → web. INT-001 joins evaluated factory drafts through human approval into an exam with factory stopped. Dependencies/ownership/tests updated; no independent agent approval claimed.

## Actual verification

Environment: Linux/bash; Node v24.18.0. Commands below executed from repository root; no checker writes files.

| Executed check | Observed result | Limit |
|---|---|---|
| Embedded TEST_STRATEGY JavaScript, extracted with sed and piped to node | Exit 0; 21 required documents, 25 Markdown documents, 176 valid local links, 25 unique task IDs, eight PROPOSED ADRs; fences valid | Static documentation only; original review whitespace warning deliberately preserved |
| Embedded REVIEW_RESOLUTION_001 JavaScript, same extraction | Exit 0; all 15 historical findings mapped; disposition counts 7 ACCEPT / 4 PARTIALLY_ACCEPT / 2 REJECT / 2 NEEDS_HUMAN_DECISION; 15 PRNG outputs and 4 rounding cases agree | Historical traceability/reference arithmetic, not application tests |
| Before/after SHA-256 comparison against session baseline | Original research, both reviews and unrelated files unchanged; changed paths limited to scope above | Untracked-file comparison, not Git history |
| git diff --check and git status --short | Diff check exit 0; only existing untracked documentation tree/.gitignore/entry documents | Git diff does not inspect untracked content; static checker does |
| git branch --show-current; git rev-parse --verify HEAD | main; HEAD command exit 128 “Needed a single revision” | Unborn repository, not application failure |
| Targeted rg contradiction search and manual A–J cross-document walkthrough | Active specs agree on no-repeat, modes, lock order, shortage, factory recovery/isolation and early tracks; historical reports remain unchanged | Author self-review, not independent review or proof of runtime concurrency |
| Ephemeral read-only Node assertions over quality/decisions/backlog | Exit 0; scenario labels exactly A–J, eight unique ADR IDs, FOUND-006 COMPLETED | Coverage/status check only, not execution of scenarios |

Reproduce static checks:
- sed -n '/^```javascript$/,/^```$/p' docs/quality/TEST_STRATEGY.md | sed '1d;$d' | node
- sed -n '/^```javascript$/,/^```$/p' docs/reviews/REVIEW_RESOLUTION_001.md | sed '1d;$d' | node

NOT RUN: unit/database/migration/API/browser/security/concurrency/load tests, real scheduling/provider calls, AI benchmarks and month-long outage experiment; application code does not exist. A–J are mapped future acceptance tests, not passing results. No external official-source or legal verification was repeated.

## Remaining work, risks and transfer

Human review required for current ADR revisions, TTL/assignment retention/equivalence merge policy, fixed-mode H1 and admission/section choices, research budget/providers/schedule, human review capacity and deployment/privacy envelope. Small seed inventory can exhaust quickly; unknown equivalence and shared PostgreSQL resource failure remain explicit risks. Runtime correctness/performance and live AI quality are unverified.

Recommended next action: FOUND-004 human review of current decisions, with focused independent re-review if assigned. Research planning can be separately assigned as RESEARCH-002/FOUND-003; implementation requires its approved gates and explicit assignment. No next agent is assigned. Codex releases FOUND-006/shared-document ownership after this handoff.

Transfer without chat: AGENTS.md → AGENT_ONBOARDING → PROJECT_STATE → this handoff → assigned backlog task → its relevant factory/reuse/domain/API/DB specs, ADR revisions and quality rows. Inspect current Git status before editing; do not overwrite unrelated changes or treat preserved historical review as approval of Phase 02.75. Stop at documentation; wait for owner review.
