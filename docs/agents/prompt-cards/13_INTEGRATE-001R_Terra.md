# TASK INTEGRATE-001R — Consolidate plan-stage state after independent audit

**Objective:** Consolidate plan-stage state after independent audit
**Recommended agent:** Codex Terra (Medium)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** QA-001R
**Allowed output:** `docs/agents/PROJECT_STATE.md`, `docs/agents/LAST_HANDOFF.md`, `docs/decisions/OPEN_DECISIONS.md`

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
- `docs/reviews/LOW_COST_REVIEW_001.md`
- `docs/tasks/TASK_BACKLOG.md`
- `docs/agents/PROJECT_STATE.md`
- `docs/agents/LAST_HANDOFF.md`
- `docs/decisions/OPEN_DECISIONS.md`

### Task requirements
Act as sole documentation integrator. Summarize executed planning tasks, actual artifacts and unresolved reviewer findings. Log new high-impact architecture proposals as PROPOSED and preserve ADR revision/approval integrity. Update the compact project state and latest handoff without duplicating backlog. Do not approve any decision or claim a test ran. If a critical conflict remains, flag it for architect review without fabricating a solution.

### Acceptance and verification
Project state accurately reflects only confirmed file changes and test evidence, open owner decisions are explicit, and the next agent can reconstruct the plan without conversation history.
