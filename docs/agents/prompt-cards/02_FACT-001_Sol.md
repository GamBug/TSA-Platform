# TASK FACT-001 — Specify the standalone scheduled AI Question Factory

**Objective:** Specify the standalone scheduled AI Question Factory  
**Recommended agent:** Codex Sol (Medium/High)  
**Working directory:** `~/Documents/Projects/TSA-Platform`  
**Depends on:** GOV-001 (optional, independent)  
**Allowed output:** `docs/specifications/QUESTION_FACTORY_SPEC.md`  

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
- `docs/specifications/AI_QUESTION_PIPELINE.md`
- `docs/specifications/QUESTION_SCHEMA.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`

### Task requirements
Create a **proposed**, implementation-ready specification for a batch CLI-driven AI Question Factory independent from student requests. Cover: provider-neutral model interface; weekly/manual triggers; inventory-gap quotas; generation batch/run/job IDs; draft -> machine validation -> human review -> publish; deterministic/replay identifiers; retry and idempotency; versioned schemas and provenance; reporting, rate limits, budget caps, and failure recovery. Distinguish internal factory store/staging from approved bank. Include 6-8 acceptance scenarios. No infrastructure assumptions that require a new service by default. Do not invent official TSA content rights.

### Acceptance and verification
A new engineer can identify Factory inputs, outputs, states, failure paths and publication permissions without additional conversation context. File should explicitly say web exams never call the LLM.
