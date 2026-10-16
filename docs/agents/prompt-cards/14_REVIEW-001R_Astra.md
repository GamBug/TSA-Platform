# TASK REVIEW-001R — Audit the final delta and issue focused next task cards

**Objective:** Audit the final delta and issue focused next task cards  
**Recommended agent:** Codex Astra (High, optional and scarce)  
**Working directory:** `~/Documents/Projects/TSA-Platform`  
**Depends on:** INTEGRATE-001R  
**Allowed output:**   

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
- `docs/agents/PROJECT_STATE.md`
- `docs/decisions/OPEN_DECISIONS.md`
- `docs/tasks/IMPLEMENTATION_ROADMAP.md`

### Task requirements
**Read-only architecture gate.** First inspect `git diff --stat` and the recorded review findings; read only documents implicated in critical/high findings. Check: Factory isolation; no-repeat consistency; DB/API alignment; human approval gates; research prioritization. Output no more than 10 prioritized observations and up to 5 ready-to-run microtask prompts for cheaper agents. Explicitly state which choices require human approval. Do NOT edit files, regenerate all documents or start implementation.

### Acceptance and verification
Produce an actionable, concise audit grounded in file evidence; do not ask Astra to perform the downstream implementation.
