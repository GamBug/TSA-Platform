# TASK PIPE-001 — Align existing AI pipeline with the independent Factory spec

**Objective:** Align existing AI pipeline with the independent Factory spec
**Recommended agent:** Codex Terra (Medium)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** FACT-001
**Allowed output:** `docs/specifications/AI_QUESTION_PIPELINE.md`

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
- `docs/specifications/AI_QUESTION_PIPELINE.md`

### Task requirements
Make minimal edits to the existing AI pipeline specification to clarify scheduled pre-generation, machine verification, review queue, controlled publication, no direct student-request dependency, and provider-neutral model adapters. Reference `QUESTION_FACTORY_SPEC.md` rather than copying its text. Preserve security and source-licensing rules. If a substantive conflict is found, document it in the final handoff rather than silently deciding.

### Acceptance and verification
The pipeline and Factory spec have no conflicting lifecycle, and only the allowlisted file is modified.
