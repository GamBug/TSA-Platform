# Project state

Updated 2026-10-19. This is current navigation; task status lives in
[backlog](../tasks/TASK_BACKLOG.md), authority in
[decisions](../decisions/OPEN_DECISIONS.md), executed evidence in
[latest handoff](LAST_HANDOFF.md). Earlier snapshots remain in Git.

| Topic | Verified current position |
|---|---|
| Immediate priority | Track B first. Scoped owner PostgreSQL/reviewed-SQL and synthetic-only local AUTH approval recorded 2026-10-19. DATA-001 bank-core migration independently verified (17 reported real-PG tests PASS); remaining schema and AUTH implementation continue on `feat/track-b-data-auth`, base `446277f`. B0.1 remains the runnable mock frontend. |
| Engineering checkpoint | G1 disposition `27350b3`; B0 `237da9c`; B0.1 `06849d0`. Same local frontend serves loopback 4173. Eleven B0.1 tests and expanded Chromium journey pass. DATA-001 disposable approved-invariant preflight: 11 named real PostgreSQL checks PASS; full production migrations remain incomplete. |
| Gates | FOUND-002 COMPLETED; G1 ACCEPTED by owner 2026-10-19 (`0e67485` / audit `81ef8aa`). DATA-001 foundation gate satisfied; scoped local DB mechanisms now have owner disposition; full DATA-001 implementation remains incomplete. Bounded FOUND-007 taxonomy reconciliation is accepted; database allocation remains later work. |
| Architecture | Independent draft-only Question Factory → human-controlled Question Bank → Practice Website. Student requests never require LLM inference. Human review/publication is distinct from validated draft transport. |
| MVP | Independent MATH-4, READING-2 and SCIENCE-4 practice tests; no automatic domain chaining or official aggregate score. Seed target remains 12/6/12 vetted items. |
| Owner approvals | Scoped G0, H1 global one-active attempt, H2 admission-only, H3 one-domain MVP, immutable 600-second Start TTL, non-retroactive ordinary schedule edits, and scoped D1–D6 behaviors. Whole unrelated ADRs remain PROPOSED. |
| New contracts | Versioned immutable identity/fingerprint and complete bounded reference closure; self-contained Factory v2 with atomic DRAFT receipts; deterministic bounded assembly/replay; separate student/internal/released-review entries; generated request/response types and OpenAPI; actual owner/release GET response boundary. Root v1 compatibility is retained. Final audit adds internal job-dispatch/1 for existing Factory/Exam kinds; no DB grant/auth claim. |
| Verification | Final G1 audit at `0e67485`: fresh Git clone / pinned npm ci, typecheck/build/smoke; 106 contract tests and 11 emitted-consumer tests; four-artifact drift, import boundary, docs and clean diff PASS. Seven-package installed/license hashes reverified; dated npm audit reports zero advisories. See [audit](../reviews/G1_ACCEPTANCE_AUDIT.md). |
| Current batch verification | Node24.18/npm11.16: typecheck/build/smoke, 106 contract + 11 emitted + 11 B0.1 tests, drift/import checks PASS. Chromium155 desktop/mobile clear/resume/released review PASS. PostgreSQL18.6 probe 11 checks and cleanup/missing-tools negative PASS. No accepted-contract or dependency change. |
| Limits | No hosted CI observation, production bundle/contract-client integration, complete application DB concurrency, deployed auth, durable import/publication or live-provider evidence. Local B0.1 browser behavior is verified separately. These later runtime tasks are not invented G1 prerequisites. Source import policy currently covers the designated synthetic consumer tree; new app consumers must be registered. |
| Ownership | B0: one reused Luna / XHigh writer; Sol / Medium independent code/browser/regression review and shared-record integration. No new exploratory agent. All worker reservations released. Owner AGENTS.md bytes preserved and excluded. No Terra/Astra, push, merge or deployment. |
| Next | Finish reviewed form/attempt/history/jobs schema and concurrency evidence, then local synthetic-only authorization and eligible BANK ingestion. Named independent human review and lawful stock remain prerequisites for publication; no G2/G3 advancement. |

Historical architecture/QA review evidence remains in
[LOW_COST_REVIEW_001](../reviews/LOW_COST_REVIEW_001.md),
[QA_REGRESSION_001](../reviews/QA_REGRESSION_001.md) and Git. Approved historical
content, exams and research remain immutable; no affiliation or official scoring
claim follows from these local tests.
