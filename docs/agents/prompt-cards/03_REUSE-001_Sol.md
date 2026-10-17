# TASK REUSE-001 — Specify per-student question reuse and shortage policy

**Objective:** Specify per-student question reuse and shortage policy
**Recommended agent:** Codex Sol (High)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** None (documentation only)
**Allowed output:** `docs/specifications/QUESTION_REUSE_POLICY.md`

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
- `docs/specifications/EXAM_ASSEMBLY_SPEC.md`
- `docs/specifications/EXAM_ENGINE_SPEC.md`
- `docs/architecture/DATABASE_DESIGN.md`

### Task requirements
Write a proposed policy for default `PERSONALIZED_PRACTICE` and optional `PUBLISHED_FIXED` forms. Clearly define: seen vs assigned vs rendered vs answered; which earlier attempts reserve question identity; handling abandoned, cancelled and withdrawn forms; retakes and explicit review mode; stable question identity across versions; near-duplicate groups; cross-student reuse; exhaustion and shortage errors; atomicity when same user starts parallel exams. Avoid a false promise that unseen inventory is always available. State the two or three policy choices the owner must approve. Include a table of edge cases and testable invariants.

### Acceptance and verification
Covers two students sharing Q1, one student receiving no repeated assigned question in strict practice, concurrent starts, amended version, insufficient unseen inventory, and fixed-form behavior. No policy is marked approved.
