# TASK ASM-001R — Align exam assembly with per-student no-repeat practice

**Objective:** Align exam assembly with per-student no-repeat practice
**Recommended agent:** Codex Sol (High)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** REUSE-001
**Allowed output:** `docs/specifications/EXAM_ASSEMBLY_SPEC.md`

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
- `docs/specifications/QUESTION_REUSE_POLICY.md`
- `docs/specifications/EXAM_ASSEMBLY_SPEC.md`
- `docs/specifications/EXAM_ENGINE_SPEC.md`

### Task requirements
Update assembly specification for a personalized form assembled from already approved questions. Define database-level candidate filtering, blueprint quotas, deterministic shuffle/reproducibility, stable identity exclusion, stimulus grouping, near-duplicate policy, inventory shortage response, atomic reservation/snapshot creation and concurrency guard. Preserve existing seeded PRNG reference behavior unless an explicitly approved change is necessary. Identify how `PUBLISHED_FIXED` differs. Keep time/scoring policy untouched.

### Acceptance and verification
Document scenarios: different students can share questions; same student cannot receive past assigned question in strict mode; concurrent allocations do not overlap; insufficient inventory fails transparently; exam snapshots remain immutable.
