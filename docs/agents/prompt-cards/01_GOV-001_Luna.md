# TASK GOV-001 — Establish economical English-only agent communication rules

**Objective:** Establish economical English-only agent communication rules  
**Recommended agent:** Codex Luna  
**Working directory:** `~/Documents/Projects/TSA-Platform`  
**Depends on:** None (documentation only)  
**Allowed output:** `AGENTS.md`  

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
- `AGENTS.md`
- `docs/agents/AGENT_ONBOARDING.md`

### Task requirements
- Add a compact **Language and context budget** paragraph to `AGENTS.md` (aim for 4-6 lines).
- Require English for agent output and engineering artifacts; exempt Vietnamese TSA question text, student-facing content, and source quotations.
- Instruct agents to load task-specific documents rather than the entire research corpus.
- Do not rewrite other existing instructions.

### Acceptance and verification
Verify the diff affects only `AGENTS.md`, remains concise, has no conflict with existing guidance, and does not translate research. Report exact diff summary.
