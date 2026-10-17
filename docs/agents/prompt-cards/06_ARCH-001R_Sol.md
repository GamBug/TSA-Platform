# TASK ARCH-001R — Clarify independent runtime boundaries in system architecture

**Objective:** Clarify independent runtime boundaries in system architecture
**Recommended agent:** Codex Sol (Medium)
**Working directory:** `~/Documents/Projects/TSA-Platform`
**Depends on:** FACT-001; REUSE-001
**Allowed output:** `docs/architecture/SYSTEM_ARCHITECTURE.md`

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

### Task requirements
Make minimal architecture edits defining three logical components: scheduled Question Factory; review/publication Bank; on-demand exam Website. They may share a monorepo and physical Postgres initially, but must have explicit permissions and separate request paths. Note Factory outage must not block exam starts and web traffic never triggers question generation. Keep ADR-001 proposed stack and modular-monolith approach; do not introduce unnecessary Redis/microservices.

### Acceptance and verification
Document process boundaries and data flow in one clear text diagram. Identify existing modules to reuse and avoid an unneeded second database.
