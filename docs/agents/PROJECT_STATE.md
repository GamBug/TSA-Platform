# Project state

Snapshot: 2026-10-16, Phase 02.75 core product architecture refinement. This is navigation; [backlog](../tasks/TASK_BACKLOG.md) owns task status and evidence.

| Topic | Current position |
|---|---|
| Phase / repository | Documentation only; main with unborn HEAD and untracked documentation; no application/framework/dependencies/migrations/commits |
| Owner product requirements | Independent scheduled factory and website; shared bank; default personalized NEW_ONLY by stable identity/equivalence, including concurrent allocation; early coordinated research/web tracks |
| Approved architecture | None. Requirements are authoritative, but proposed implementation mechanisms are not approved |
| Proposed baseline | Existing TypeScript/Next.js modular monolith + PostgreSQL, separate exam worker and independently executable factory; no new microservice/broker |
| Pending decisions | [ADRs](../decisions/OPEN_DECISIONS.md): 001/002/005 r2, 003/004/006 r3, new 007/008 r1; all PROPOSED |
| Active task IDs | None after this handoff; no next implementer assigned |
| Most recently completed | FOUND-006; preceding FOUND-005 reconciliation and FOUND-001 foundation |
| Blockers | FOUND-004 human disposition/implementation assignment; content reviewers and lawful evaluation inputs; provider/budget/retention/deployment choices |
| Critical risks | Small unseen inventory, conservative equivalence false positives, unknown equivalents, assignment/storage growth, untested concurrent allocation and shared DB load, AI correctness/cost and human review capacity |
| Verification | Static document/link/task/ADR checks, preserved review/research hashes and existing PRNG/rounding reference checks; scenario A–J walkthrough only. Runtime tests NOT RUN; [handoff](LAST_HANDOFF.md) |
| Next actions | Owner review current ADR scopes, especially 007/008 and retention/start TTL; assign early RESEARCH-002/FOUND-003 or implementation only after their corresponding approval gates |

Preserved [original review](../reviews/ARCHITECTURE_REVIEW_001.md) and [resolution](../reviews/REVIEW_RESOLUTION_001.md) describe the earlier baseline. Phase 02.75 intentionally supersedes its global exposure capacity/fixed-default/AI-later assumptions, not timing/scoring/immutability/security safeguards. No new independent review or approval is claimed.

New agent: [onboarding](AGENT_ONBOARDING.md) → latest handoff → assigned backlog record → relevant specs/ADRs/tests. Essential new policy lives in [factory](../specifications/QUESTION_FACTORY_SPEC.md) and [reuse](../specifications/QUESTION_REUSE_POLICY.md), not conversation history. Stop here for owner review.
