# TASK SCOPE-001R — Separate technical MVP, AI research demonstrator and final deliverable

**Objective:** Separate technical MVP, AI research demonstrator and final deliverable  
**Recommended agent:** Codex Terra (Medium)  
**Working directory:** `~/Documents/Projects/TSA-Platform`  
**Depends on:** FACT-001; REUSE-001  
**Allowed output:** `docs/specifications/MVP_SCOPE.md`  

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
- `docs/specifications/MVP_SCOPE.md`
- `docs/specifications/QUESTION_FACTORY_SPEC.md`
- `docs/specifications/QUESTION_REUSE_POLICY.md`

### Task requirements
Clarify three milestones: (1) 10-question engineering mini-exam with vetted seed content; (2) standalone AI Factory experiment with measured generation, validation and reviewer throughput; (3) final integrated university demo consuming approved generated items. Make personal no-repeat a core practice requirement (where enabled) rather than a vaguely deferred feature. Avoid claiming full official TSA equivalence. Preserve the existing small-slice approach while prioritizing AI research early.

### Acceptance and verification
Milestones are independently demonstrable and have observable acceptance evidence, not calendar-date promises.
