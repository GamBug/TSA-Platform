# Project state

Updated 2026-10-19. This is current navigation; task status lives in
[backlog](../tasks/TASK_BACKLOG.md), authority in
[decisions](../decisions/OPEN_DECISIONS.md), executed evidence in
[latest handoff](LAST_HANDOFF.md). Earlier snapshots remain in Git.

| Topic | Verified current position |
|---|---|
| Immediate priority | Owner Track B-first directive (~85% website / ~15% lightweight research). WEB-B0 isolated Vietnamese mock prototype COMPLETED for the first slice on `feat/track-b-b0-prototype`, base `81ef8aa`; G1 is accepted; real integrated website tasks retain their remaining prerequisites. |
| Engineering checkpoint | Runnable B0 on `feat/track-b-b0-prototype`, uncommitted base `81ef8aa`, gate disposition `27350b3`; `npm run dev:b0` serves loopback 4173. Nine B0 Node tests + actual Chromium desktop/mobile journey pass. Contract checkpoints and final G1 audit remain in Git/audit records. |
| Gates | FOUND-002 COMPLETED; G1 ACCEPTED by owner 2026-10-19 (`0e67485` / audit `81ef8aa`). DATA-001 foundation gate satisfied; affected proposed DB mechanisms still require disposition. Bounded FOUND-007 taxonomy reconciliation is accepted; database allocation remains later work. |
| Architecture | Independent draft-only Question Factory → human-controlled Question Bank → Practice Website. Student requests never require LLM inference. Human review/publication is distinct from validated draft transport. |
| MVP | Independent MATH-4, READING-2 and SCIENCE-4 practice tests; no automatic domain chaining or official aggregate score. Seed target remains 12/6/12 vetted items. |
| Owner approvals | Scoped G0, H1 global one-active attempt, H2 admission-only, H3 one-domain MVP, immutable 600-second Start TTL, non-retroactive ordinary schedule edits, and scoped D1–D6 behaviors. Whole unrelated ADRs remain PROPOSED. |
| New contracts | Versioned immutable identity/fingerprint and complete bounded reference closure; self-contained Factory v2 with atomic DRAFT receipts; deterministic bounded assembly/replay; separate student/internal/released-review entries; generated request/response types and OpenAPI; actual owner/release GET response boundary. Root v1 compatibility is retained. Final audit adds internal job-dispatch/1 for existing Factory/Exam kinds; no DB grant/auth claim. |
| Verification | Final G1 audit at `0e67485`: fresh Git clone / pinned npm ci, typecheck/build/smoke; 106 contract tests and 11 emitted-consumer tests; four-artifact drift, import boundary, docs and clean diff PASS. Seven-package installed/license hashes reverified; dated npm audit reports zero advisories. See [audit](../reviews/G1_ACCEPTANCE_AUDIT.md). |
| Limits | No hosted CI observation, application/browser bundle, database concurrency, deployed auth, durable import/publication or live-provider evidence. These later runtime tasks are not invented G1 prerequisites. Source import policy currently covers the designated synthetic consumer tree; new app consumers must be registered. |
| Ownership | B0: one reused Luna / XHigh writer; Sol / Medium independent code/browser/regression review and shared-record integration. No new exploratory agent. All worker reservations released. Owner AGENTS.md bytes preserved and excluded. No Terra/Astra, push, merge or deployment. |
| Next | Demonstrate B0; prepare distinct lawful content and remaining interaction renderers as the next visible slice. Explicit owner G1 is now owner-accepted; each remaining downstream prerequisite still applies. Proposed DATA/AUTH/Bank, lawful seed and early research batch is recorded in the roadmap; no downstream implementation started. No remaining D1–D6 semantic choice is requested. Later rights-cleared data, reviewers, provider/privacy/budget/retention and operational decisions retain their own gates. |

Historical architecture/QA review evidence remains in
[LOW_COST_REVIEW_001](../reviews/LOW_COST_REVIEW_001.md),
[QA_REGRESSION_001](../reviews/QA_REGRESSION_001.md) and Git. Approved historical
content, exams and research remain immutable; no affiliation or official scoring
claim follows from these local tests.
