# Agent onboarding

This reading sequence must work with an empty conversation. No provider account, agent server or previous chat is required. Start from the repository root; do not assume the current branch/task was assigned to you.

## Deterministic sequence

1. Read [AGENTS.md](../../AGENTS.md) and [README](../../README.md): project purpose, unofficial status and operating boundaries.
2. Read [PROJECT_STATE](PROJECT_STATE.md) and [LAST_HANDOFF](LAST_HANDOFF.md): current phase, approval status, completed checks, blockers and starting point. Inspect `git status --short`, current branch and HEAD if one exists. An unborn branch is valid; do not invent a commit reference.
3. Open the assigned ID in [TASK_BACKLOG](../tasks/TASK_BACKLOG.md). Confirm prerequisites, actual owner, status, file scope, deliverables and tests. If no assignment exists, propose the recommended next task to the owner; do not claim a blocked implementation task. The present next task is review, not application initialization.
4. Read only task-specific specifications using the map below. Follow referenced contracts necessary for your changes, not every research page.
5. Read the relevant ADR entries in [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md) and their approval evidence. PROPOSED is not APPROVED. Existing approved contracts must not change silently; unresolved assumptions are explicit task gates.
6. Read the relevant rows in [TEST_STRATEGY](../quality/TEST_STRATEGY.md), actual runtime commands introduced by the foundation task when they exist, and [HANDOFF_PROTOCOL](HANDOFF_PROTOCOL.md). Claim ownership with coordinated backlog update before implementation. There are no application test commands yet.

## Task-specific reading map

| Task family | Required technical reading | Relevant decisions |
|---|---|---|
| FOUND review/foundation | System architecture; MVP; API/DB for contract work; research assessment for evidence review | ADR-001–004/007/008; ADR-006 for identity/runtime boundaries |
| Official source validation | Research assessment plus original research sections/primary sources being checked | Profile/scope question in decisions |
| DATA / BANK | Question schema, database bank/provenance sections, API staff commands, pipeline acquisition/review gates, reuse policy | ADR-002/003/007 |
| AUTH / OPS | System security/deployment, API access rules, database retention, quality security/recovery | ADR-001/003/006 |
| ASSEMBLY | Assembly spec, question eligibility, database forms/locks, API assembly, reuse policy | ADR-003/004/007 |
| EXAM / SCORE | Engine, API student contracts, database attempts/jobs, question response/key types, reuse policy | ADR-003/004/007 |
| WEB | MVP, API contracts, relevant question renderers/engine behavior; no direct DB ownership | ADR-002/003/004 |
| AI / FACTORY / RESEARCH-002 | Factory spec, pipeline, question schema, provenance/jobs/batch/import database plan, evaluation strategy | ADR-003/005/006/008 |
| INT | Factory/reuse specs, canonical import/publication, assembly/engine contracts, A–J quality matrix | ADR-003/004/005/007/008 |
| TEST | Relevant authoritative spec plus invariant matrix and current implementation/task evidence | Decisions touching tested behavior |

## Before editing, answer these

State the task ID, accountable implementer, starting Git state, approved decisions versus open questions, reserved files, contracts that cannot change, acceptance/tests and remaining known issues. If those cannot be determined from the repository, record the missing fact and ask the owner only for that assignment/decision. Do not infer another agent's approval from suggested roles.

At handoff, update only coordinated shared files and record actual evidence. A new agent should be able to repeat your verification from the command, environment and result; a statement such as “works in my session” is insufficient.
