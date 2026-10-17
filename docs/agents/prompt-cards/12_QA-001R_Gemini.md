# TASK QA-001R — Perform an independent cross-document regression audit

**Objective:** Perform an independent cross-document regression audit
**Recommended agent:** Gemini Flash in Antigravity, or Codex Terra (read-only)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** BACKLOG-001R
**Allowed output:** `docs/reviews/LOW_COST_REVIEW_001.md`

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
- `docs/specifications/QUESTION_FACTORY_SPEC.md`
- `docs/specifications/QUESTION_REUSE_POLICY.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/DATABASE_DESIGN.md`
- `docs/architecture/API_CONTRACTS.md`
- `docs/tasks/TASK_BACKLOG.md`

### Task requirements
Review these specifications as an independent engineer, not an implementer. Identify confirmed contradictions and missing constraints, especially factory/web separation, double-allocation races, student-only reuse, immutable snapshots, reviewer-only publication and HTTP error semantics. Classify verified defect vs risk vs open product decision. Cite file sections/line numbers if possible. Do not modify any reviewed input file.

### Acceptance and verification
Write a concise findings table: ID, severity, evidence, failure scenario, smallest repair, regression test. Explicitly record if none found; never fabricate executed tests.
