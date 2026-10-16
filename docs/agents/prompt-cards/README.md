# TSA-Platform: economical multi-agent prompt cards

Run all agents **inside** `~/Documents/Projects/TSA-Platform`. Each card states the objective, suggested model, dependencies, allowed files, tests and ready-to-paste English prompt. All proposed changes are documentation-only until owner approves architecture/ADR gates. The existing repository backlog remains authoritative; task cards are short-lived assignments and are not automatic approvals.

## Sequence

1. `01_GOV-001_Luna.md` — add English language rule.
2. `02_FACT-001_Sol.md` and `03_REUSE-001_Sol.md` — independent base specifications; run sequentially in one local checkout or in isolated Git worktrees.
3. `04_PIPE-001_Terra.md`, `05_ASM-001R_Sol.md`, `06_ARCH-001R_Sol.md` — depend on completed base specs.
4. `07_DATA-001R_Sol.md` — database proposal after assembly and architecture.
5. `08_API-001R_Terra.md` — HTTP contracts after DB.
6. `09_SCOPE-001R_Terra.md` -> `10_ROADMAP-001R_Terra.md` -> `11_BACKLOG-001R_Terra.md` — milestones and task dependencies.
7. `12_QA-001R_Gemini.md` -> `13_INTEGRATE-001R_Terra.md` — independent review, then sole shared-state integrator.
8. `14_REVIEW-001R_Astra.md` — optional premium architect gate, one scarce invocation only; project owner still approves ADRs.

## Execution discipline

- Run **one card per chat / agent assignment**. Do not paste the entire pack into Codex.
- Before each card, check `git status --short`; preserve unrelated changes. Save checkpoints in Git only when the owner decides to commit.
- Two agents may only write simultaneously with separate worktrees or strictly disjoint scopes and an integrator.
- If any card needs a decision outside its scope, stop that decision and report it as a blocker; avoid escalating the entire task to Astra.
- Never feed the full Deep Research report by default; use `AGENTS.md` and only the listed task-relevant files.
- English is for agent output and engineering artifacts; Vietnamese is retained for TSA content and student-facing text.

## Later implementation slicing, AFTER approval (illustrative backlog, not authorized)

| Slice | Output | Suggested agent | Proof |
|---|---|---|---|
| IMP-01 | runtime/framework bootstrap with pinned versions | Terra | lint/typecheck/build |
| IMP-02 | shared question JSON schemas and fixtures | Sol | valid/invalid schema tests |
| IMP-03 | Postgres migrations for identity/version/approval | Sol | fresh + rollback/forward migration tests |
| IMP-04 | bank import and human publication transaction | Sol | integration auth/provenance tests |
| IMP-05 | 10-question fixture assembly algorithm | Sol | blueprint constraint property tests |
| IMP-06 | per-student seen-question exclusion + shortage | Sol | concurrent allocations/shortage tests |
| IMP-07 | exam start/save/submit state machine | Sol | DB integration and idempotency tests |
| IMP-08 | student timed exam UI | Gemini Flash | Playwright flows |
| IMP-09 | factory CLI generate/validate/report on test fixture | Terra then Sol review | mocked-provider reproducibility tests |
| IMP-10 | weekly scheduling adapter and batch idempotency | Terra | rerun + failure-recovery tests |
| IMP-11 | question benchmark and human rating workflow | Sol + domain reviewer | measured pass/reject stats |
| IMP-12 | end-to-end import approved factory question into web | Gemini/Sol | browser + data consistency tests |

Do not use the implementation suggestions to bypass the existing approved-ADR gates or the more precise task backlog.
