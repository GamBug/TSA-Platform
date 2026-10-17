# TASK BACKLOG-001R — Update task records into manageable agent-sized cards

**Objective:** Update task records into manageable agent-sized cards
**Recommended agent:** Codex Terra (Medium)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** ROADMAP-001R
**Allowed output:** `docs/tasks/TASK_BACKLOG.md`

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
- `docs/tasks/TASK_BACKLOG.md`
- `docs/tasks/IMPLEMENTATION_ROADMAP.md`
- `docs/specifications/QUESTION_FACTORY_SPEC.md`
- `docs/specifications/QUESTION_REUSE_POLICY.md`

### Task requirements
Preserve existing task statuses and verified historical evidence. Add new explicitly PROPOSED 1-3-file documentation, research and implementation tasks for scheduled generation and unseen-question assembly, splitting large tasks when necessary. Each new task must have exact dependencies, output ownership, acceptance tests and suggested cost-aware agent role (Luna/Terra/Sol; Astra review only). Keep approval gates explicit and do not mark any existing ADR approved. Avoid large monolithic tasks.

### Acceptance and verification
A cheap agent can select exactly one task without needing to invent file scope or acceptance criteria. Historical task claims remain unchanged.
