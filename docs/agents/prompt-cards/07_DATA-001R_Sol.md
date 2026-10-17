# TASK DATA-001R — Propose minimal relational schema changes for Factory and no-repeat

**Objective:** Propose minimal relational schema changes for Factory and no-repeat
**Recommended agent:** Codex Sol (High)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** ASM-001R; ARCH-001R; PIPE-001
**Allowed output:** `docs/architecture/DATABASE_DESIGN.md`

## Prompt (paste into the indicated agent)

# Shared execution rules

- This repository is a multi-agent project. You have **one assigned task**; another agent may implement dependent work later.
- Read `AGENTS.md`, then only the specific files listed in this card. For these new proposed task IDs not yet present in the backlog, this card is the assignment; do not invent a completed backlog record.
- **Use English** in all agent messages, documentation changes, code, tests, comments, changelogs and commit messages. Preserve Vietnamese in actual TSA sample questions, student-facing question data, and Vietnamese quoted sources.
- Work only in the allowlisted files. Existing architecture and ADRs are **PROPOSED**, not approved.
- Never write application code or install dependencies in this documentation wave. Do not edit research or existing independent reviews.
- Do not update `TASK_BACKLOG.md`, `PROJECT_STATE.md`, `LAST_HANDOFF.md` or decision approvals unless this task explicitly owns them. The integration agent will consolidate changes.
- Do not commit. Never overwrite unrelated or concurrent edits. If blocked by a missing contract/decision, record the blocker rather than inventing a policy.
- In your final answer (English), provide files changed, 3-7 key changes, verification actually performed, unresolved decisions and a compact handoff for the next agent. No claims of passing unrun tests.

### Input documents
- `docs/architecture/DATABASE_DESIGN.md`
- `docs/specifications/QUESTION_FACTORY_SPEC.md`
- `docs/specifications/QUESTION_REUSE_POLICY.md`
- `docs/specifications/EXAM_ASSEMBLY_SPEC.md`

### Task requirements
Revise the PROPOSED schema only. Reuse existing generation job, attempt, form, and question-version tables whenever possible. Define only necessary new or altered entities/constraints for batch provenance, review publication, question identity history and atomic per-user allocation. Explain if an extra history table is redundant because attempts/form_slots can derive history; give candidate indexes and uniqueness constraints. Include concurrency transaction boundary, rollback behavior and migration implications. Do not generate actual migrations or alter approval status.

### Acceptance and verification
For each table delta, identify PK/FK/indexes, owner and invariant enforced. Ensure historical versions are immutable and use as few new tables as feasible.
