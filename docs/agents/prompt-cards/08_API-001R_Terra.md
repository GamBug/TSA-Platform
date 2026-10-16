# TASK API-001R — Align HTTP contracts with the proposed architecture

**Objective:** Align HTTP contracts with the proposed architecture  
**Recommended agent:** Codex Terra (Medium)  
**Working directory:** `~/Documents/Projects/TSA-Platform`  
**Depends on:** DATA-001R  
**Allowed output:** `docs/architecture/API_CONTRACTS.md`  

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
- `docs/architecture/API_CONTRACTS.md`
- `docs/architecture/DATABASE_DESIGN.md`
- `docs/specifications/EXAM_ASSEMBLY_SPEC.md`
- `docs/specifications/QUESTION_FACTORY_SPEC.md`

### Task requirements
Make surgical API contract amendments for personalized exam creation, explicit `INSUFFICIENT_UNSEEN_INVENTORY` error and authorized review/admin publication flow if required. Ensure student endpoints cannot call generation providers and never expose answer keys before release. Clarify request idempotency, auth scope and example typed DTOs. Preserve existing API semantics unless documented as proposal, and do not assume the owner has approved the revisions.

### Acceptance and verification
Sample success + shortage + auth failure are consistent with DB/assembly policy. No unapproved interface rework or unrelated endpoints added.
