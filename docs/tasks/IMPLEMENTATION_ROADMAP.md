# Implementation roadmap

Status: **PROPOSED** Phase 02.75 sequencing, not implementation authorization. [Backlog](TASK_BACKLOG.md) owns task status; [decisions](../decisions/OPEN_DECISIONS.md) owns approval records. The three product stages below are independently demonstrable and may advance in parallel. Exit evidence is future evidence to be recorded by the accountable task owner, not work completed by this roadmap.

## Shared planning prerequisites and gates

| Gate | Dependency ordering | Verifiable exit evidence |
|---|---|---|
| G0 — Owner disposition | FOUND-006 → FOUND-004 → G0. FOUND-003 source verification and RESEARCH-002 research planning may be assigned early, but implementation starts only after G0. | Human owner records scoped implementation authority while unresolved ADR/provider/budget/rights/retention/reviewer-capacity limits remain explicit. |
| G1 — Shared schema and controlled bridge | G0 → FOUND-002 → G1. FOUND-002 starts after G0 and establishes G1; it never requires G1. | Versioned canonical question/stimulus schema, version/provenance, rights, equivalence and workflow terms; `factory-package/1` package/receipt semantics; draft-only import boundary; jobs/job-kind and safe DTO/API fixtures. Fixtures demonstrate independently executable factory and web/bank consumers without a live provider. |
| G2 — Bank publication boundary | G1 plus DATA-001/AUTH-001 permit BANK-001 ingestion and BANK-002 independent review/publication. Verified BANK-001 ingestion **and** BANK-002 publication evidence → G2. | Exact-version rights, immutable versions, validation/review/equivalence records, human-only approval and eligible-bank publication are demonstrably separate from draft creation. G2 does not gate either producer; factory credentials cannot approve or publish. |
| G3 — Integration readiness | FACTORY-001 (including FACTORY-002/003), AI-002, G2, technical-MVP assembly/attempt/scoring evidence, and INT-002 controlled-import proof → G3 → INT-001. | Before G3 passes, INT-002 accepts the same package twice as one durable receipt, rejects changed content under the same identity, and imports no partial stimulus bundle. A human-approved subset becomes eligible bank stock without changing the factory, assembly or exam contracts. |

G1 defines interfaces, not a second production store or a requirement to deploy the website. G2 is the sole path from any manual or factory draft to selectable stock. G3 is an evidence gate, not a prerequisite of INT-002 or any other task that supplies its evidence. No gate converts a PROPOSED ADR into approval. No gate is currently passed.

## Lifecycle dependency validation model

Validation direction is prerequisite or accepted completion evidence → dependent task, milestone, or gate. A parent/child completion edge means the parent cannot be marked complete until the child acceptance exists; it does **not** mean the child must wait for parent completion. This is the rule that permits BANK-002 and INT-002 to produce their parent/gate evidence without circular gating.

The 2026-10-17 ad hoc DAG traversal included these 40 nodes: all 36 task IDs (`FOUND-006`, `FOUND-005`, `FOUND-001`, `FOUND-004`, `FOUND-003`, `FOUND-002`, `DATA-001`, `AUTH-001`, `DATA-002`, `BANK-001`, `ASSEMBLY-001`, `EXAM-001`, `EXAM-002`, `SCORE-001`, `WEB-001`, `WEB-002`, `TEST-001`, `OPS-001`, `CONTENT-001`, `AI-001`, `AI-002`, `RESEARCH-001`, `RESEARCH-002`, `FACTORY-001`, `INT-001`, `FOUND-007`, `DATA-003`, `AI-003`, `FACTORY-002`, `FACTORY-003`, `BANK-002`, `ASSEMBLY-002`, `WEB-003`, `WEB-004`, `TEST-002`, `INT-002`) and `G0`, `G1`, `G2`, `G3`.

It traversed 102 directed edges: 69 task-to-task (including 11 parent/child completion contributions), 20 gate-to-task, 12 task-to-gate, and one gate-to-gate (`G2 → G3`). Every edge endpoint resolved to a listed node; no self-edge or directed cycle was found. Gate-producing inputs in the model are:

| Gate | Accepted producing inputs represented by task-to-gate edges |
|---|---|
| G0 | FOUND-004 |
| G1 | FOUND-002 |
| G2 | DATA-001, AUTH-001, BANK-001, BANK-002 |
| G3 | FACTORY-001, AI-002, G2, ASSEMBLY-001, EXAM-002, SCORE-001, INT-002 |

The model intentionally excludes conditions that cannot be truthfully reduced to a task/gate completion node: human owner approval/assignment; ADR dispositions; named independent reviewers/authors/labelers; rights, privacy, budget, provider, retention, traffic, age and jurisdiction approvals; actual production OIDC configuration; and local-stub scope approval. It also excludes the two partial internal handoffs—BANK-001 accepted ingestion evidence to BANK-002 and ASSEMBLY-001's accepted manifest-candidate interface to ASSEMBLY-002—because neither is a parent-milestone completion state. Those remain explicit acceptance requirements in the backlog. The no-cycle result applies only to the stated 40-node/102-edge model and does not claim automated validation of these excluded human or prose-only conditions.

## Coordinated delivery stages

| Product stage / milestones | Dependencies and work | Verifiable exit evidence |
|---|---|---|
| **Stage 1 — Technical MVP** | **B1 — Safe bank:** DATA-001 + the authorized AUTH-001 local-development path + G1 → BANK-001 ingestion; BANK-002 independently supplies review/publication evidence; together they establish G2. DATA-002 human-authored inventory can run in parallel after G0. **B2 — Personalized web slice:** ASSEMBLY-001 → EXAM-001; EXAM-002 + SCORE-001 → WEB-001, using G2-published manual seed items. | A vetted, shared approved bank supports a `practice-mini-v1` personalized NEW_ONLY form. Browser-backed evidence covers save/resume, submit/expiry, results/history and explicit shortage handling across two unseen attempts. Staff can use the controlled manual import/authoring, review, approval and quarantine path. Factory/provider is stopped or unavailable throughout; no exam path needs live generation. |
| **Stage 2 — AI Research Demonstrator** | **A1 — Early AI feasibility:** RESEARCH-002 runs from G0; AI-001 starts after G1; AI-002 uses lawful held-out human labels. **A2 — Batch prototype:** FACTORY-001 follows AI-001 plus explicit budget, schedule and review-capacity authorization. | Factory runs independently of Next.js, OIDC and deployed student web services, first with fixture/fake adapters and then evaluated interchangeable adapters as authorized. It produces measured source/quality/cost evidence, bounded manual/weekly plans, recovery records and idempotent draft-only package export. It has no publication privilege and does not require completion of B1/B2. |
| **Stage 3 — Final Integrated University Deliverable** | **I1 — Research/platform integration:** INT-002 supplies the controlled-import proof before G3; INT-001 starts after G3. **B3 — Pilot readiness:** WEB-002 + TEST-001 + OPS-001 follows the integrated evidence where the owner scopes a pilot. | Import the same factory package twice; independently review and approve a subset through G2; assemble a student's NEW_ONLY exam from that subset; then disable factory/provider and complete scoring and results. Required acceptance scenarios A–J, including factory isolation, rights/review controls and recovery, have recorded results. Release/pilot still requires its separately authorized operational, privacy and owner scope. |
| **Later breadth / research** | CONTENT-001 follows verified profile/inventory; RESEARCH-001 follows adequate data and explicit scope. | Versioned richer interactions or an evidence-backed calibration/solver proposal; neither is implied by the three deliverable stages. |

## Track ordering and integration boundaries

Track A (AI research) starts at G0 and proceeds through A1/A2 independently. It may use isolated fixtures, rights-cleared sources and a staging/export path before BANK-001 exists. Its only shared dependency is G1 once it needs portable canonical packages; it does not wait for a student website, student authentication, web deployment or B2 acceptance.

Track B (bank/web engineering) starts from G0 with rights-cleared, manually verified seed work and reaches the Technical MVP through G2 and B1/B2. AUTH-001 may implement its explicitly approved local synthetic-data stub after G0, FOUND-002 and DATA-001; production identity configuration and real-user deployment additionally require G2, ADR-006's completed data-flow/provider review, and separate owner authorization. Track B does not wait for AI quality, provider availability, live generation or A2 completion. The intentionally small thirty-question inventory can exhaust; shortage UX is a required first-slice behavior, not a trigger for an LLM call or silent item reuse.

The bridge is deliberately narrow:

1. Factory creates restricted, untrusted draft packages plus provenance through G1; it cannot mark them approved.
2. BANK-001 validates/imports them through the same controlled bank path used for manual intake and records an idempotent receipt. BANK-002 then applies independent review, equivalence adjudication and human-only publication; their verified ingestion and publication evidence establishes G2.
3. Practice Web and assembly see only eligible, approved bank versions. They never read factory staging or call a model. I1 proves the bridge while the factory is disabled after publication.

## Parallel work and ownership boundaries

The following assignments may run concurrently after their stated gates when they use separate worktrees/files and one accountable owner per task:

| Parallel group | May proceed together | Coordination boundary / conflict to avoid |
|---|---|---|
| Early planning | FOUND-003, RESEARCH-002, DATA-002 seed-content preparation | Source/rights findings feed G0/G2; do not edit shared contracts or claim approval. |
| Contract consumers | AI-001 fixture/fake adapter work, DATA-001 and authorized AUTH-001 local-stub preparation | FOUND-002 owns G1 contract fixtures; DATA-001 owns core relational migrations and AUTH-001 identity/access changes. Production identity configuration is outside this local-stub path and awaits its separate prerequisites. Integrate only after the interface is frozen. |
| Independent demonstrations | A1/A2 research prototype and B1/B2 web slice | Factory reserves factory migrations/job kinds; BANK-001 owns import receipts and publication; EXAM-002 owns grading-worker integration. Use fixtures or isolated stores until the controlled G2/G3 integration. |
| Evidence hardening | AI-002 evaluation, WEB-002, TEST-001, OPS-001 | TEST/OPS evidence must target the exact frozen contracts and integrated scenario, without concurrent edits to shared migrations, state files or decisions. |

A coordinated integrator sequences shared migrations, G1 fixtures and state-file updates. Role/provider names do not imply assignment. Follow the [handoff protocol](../agents/HANDOFF_PROTOCOL.md); preserve all unresolved architecture decisions and obtain the required owner approval before implementation or live provider use.

No calendar or throughput commitment is made. Next action: owner review of current ADR revisions and explicit assignment of research or implementation after the corresponding gate.
