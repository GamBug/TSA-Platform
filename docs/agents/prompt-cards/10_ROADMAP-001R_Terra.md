# TASK ROADMAP-001R — Resequence existing implementation roadmap into two early tracks

**Objective:** Resequence existing implementation roadmap into two early tracks  
**Recommended agent:** Codex Terra (Medium)  
**Working directory:** `~/Documents/Projects/TSA-Platform`  
**Depends on:** SCOPE-001R; API-001R  
**Allowed output:** `docs/tasks/IMPLEMENTATION_ROADMAP.md`  

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
- `docs/tasks/IMPLEMENTATION_ROADMAP.md`
- `docs/specifications/MVP_SCOPE.md`
- `docs/specifications/QUESTION_FACTORY_SPEC.md`

### Task requirements
Reorder milestones into two coordinated early tracks: AI Factory research and Web/Bank Engineering. Keep common schema and rights review as early gating dependencies, allow research prototypes to run independently of web deployment, and define integration gates for publish/import. Preserve legacy task IDs where possible; this is a PROPOSED roadmap only. Do not invent completed engineering work.

### Acceptance and verification
The roadmap lists dependencies and visible exit evidence for both tracks, and Factory is no longer unconditionally deferred until after the entire web MVP.
