# Architectural decisions and open questions

Status as of 2026-10-16: all eight ADRs below remain PROPOSED. Independent review by Antigravity is documented in [ARCHITECTURE_REVIEW_001](../reviews/ARCHITECTURE_REVIEW_001.md); Codex's disposition and changes are in [REVIEW_RESOLUTION_001](../reviews/REVIEW_RESOLUTION_001.md). Neither is owner approval. Phase 02.75 authorizes documentation refinement only.

## Lightweight process

Keep significant decisions here until size warrants individual `ADR-NNN-title.md` files in this directory. Each ADR records problem, alternatives, tradeoffs, choice, consequences, migration/rollback and status. Trivial internal naming does not require an ADR. Human approval must record approver, date, exact ADR revision/content scope, conditions and a durable reference or a faithfully recorded owner instruction. If the instruction originated in chat, copy its actionable approval wording into this record; do not depend on chat accessibility. An independent agent review is advice, never owner approval.

States: DRAFT → PROPOSED → APPROVED → SUPERSEDED. A rejected proposal remains DRAFT with rejection reason or is superseded by a new proposal. Reopening an approved contract requires impact analysis listing affected modules, database/data migration, consumers, tests, rollout and rollback. Do not silently edit approved semantics. Approval applies only to named revision/scope, not later edits. No new infrastructure merely because it appears in research.

## ADR-001 — Transactional application stack

- Status: PROPOSED; approval: none; revision: 2.
- Problem: deliver a correct small-team vertical slice with transferable contracts and minimal runtime overhead.
- Options: Next.js/TypeScript modular monolith; Next.js + FastAPI; Django-based application; microservices.
- Proposed choice: Next.js server HTTP adapters + isolated TypeScript modules + PostgreSQL; Drizzle with reviewed SQL migrations. Same codebase worker handles durable grading. [Architecture](../architecture/SYSTEM_ARCHITECTURE.md) owns boundaries.
- Tradeoffs: one language/deployment family reduces integration burden; Python libraries would be easier for later symbolic/psychometric tasks. Next.js requires disciplined server-only DTO and cache boundaries.
- Consequences: no separate Python API, Redis or optimizer required for first slice. Runtime/package versions selected and tested in FOUND-002, not assumed current from research.
- Migration/rollback: contracts and frozen artifacts permit later Python worker; introducing a second transactional backend requires migration ownership and concurrency review. Before implementation, changing proposal costs documents only; after implementation, no wholesale rewrite without impact plan.
- Blocks: FOUND-002 and dependent application tasks.

## ADR-002 — Scope and practice content

- Status: PROPOSED; approval: none; revision: 2.
- Problem: first complete exam must not depend on large data acquisition or AI quality.
- Options: full reference exam plus five types at launch; short human-authored practice profile; AI-first content.
- Proposed choice: [MVP scope](../specifications/MVP_SCOPE.md), three interaction types, 30 independently authored/reviewed questions and short personalized practice form; independent AI research begins early, while the full reference profile remains later.
- Tradeoffs: smaller verified slice can ship sooner; does not reproduce full official format. Content work still needs independent human expertise.
- Consequences: label profile explicitly as independent; no official similarity score/branding. Human content reviewer distinct from author is mandatory.
- Migration/rollback: add schemas/renderers/profiles without modifying sealed forms. Changing starting profile creates a new blueprint version.
- Blocks: DATA-002, BANK-001, WEB-001 and initial product acceptance.

## ADR-003 — Versioning, relational model and contracts

- Status: PROPOSED; approval: none; revision: 3.
- Problem: prevent mutable bank edits, approval changes and integration drift from corrupting exams.
- Options: editable question rows and dynamic forms; immutable versions with references only; immutable versions plus frozen delivery/private snapshots.
- Proposed choice: final option; typed JSONB content with relational identity/provenance links, physically separate secrets, append-only reviews, explicit HTTP v1 contracts, current workflow projections, transaction-enforced idempotency. Canonical definitions in [question schema](../specifications/QUESTION_SCHEMA.md), [database](../architecture/DATABASE_DESIGN.md) and [API](../architecture/API_CONTRACTS.md).
- Tradeoffs: more snapshot storage and migration care; simple reproducible scoring and safe DTO boundaries. Database/private table separation supports discipline but does not by itself guarantee leak prevention.
- Consequences: each saved edit creates a version; no approval inheritance. Cross-module parallel implementation waits for contract fixture approval.
- Migration/rollback: version readers remain available for historical snapshots. Expand/backfill/contract migrations; never rollback by mutating exam history. Erasure is a separate audited retention process.
- Blocks: DATA-001 and all independently implemented contract consumers.

## ADR-004 — Assembly, timing and scoring policy

- Status: PROPOSED; approval: none; revision: 3.
- Problem: define correct behavior where official navigation/scoring details are not reproducible.
- Options: unrestricted practice navigation vs sequential section windows; raw vs inferred IRT; greedy vs bounded backtracking vs solver.
- Proposed choice: sequential fixed windows, no pause/early advance, server DB clock, revisioned saves, durable idempotent submission, exact binary practice scoring and after-grade release; constrained seeded selection with bounded backtracking and stored inventory manifest. See [engine](../specifications/EXAM_ENGINE_SPEC.md) and [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md).
- Tradeoffs: explicit deadlines can reject late network writes; simple scoring lacks official/cross-form equivalence; bounded search can fail on feasible inventories. Coarse bank publication lock sacrifices editorial concurrency for simple integrity.
- Consequences: UI must show acknowledged saves and explain timing/score rules. No silent constraint relaxation, grace period or inferred official score.
- Migration/rollback: policies/algorithms are version-pinned per form. Future timing/scoring/solver versions apply to new forms; old attempts retain original policies.
- Blocks: ASSEMBLY-001, EXAM-001/002, SCORE-001, WEB-001.

## ADR-005 — Independent AI authoring pipeline

- Status: PROPOSED; approval: none; revision: 2; early independent Track A, not a website runtime prerequisite.
- Problem: reduce authoring effort without binding bank schema to a vendor or trusting generated answers.
- Options: synchronous generation/publish, provider-specific direct DB writes, asynchronous provider-neutral draft pipeline.
- Proposed choice: [AI pipeline](../specifications/AI_QUESTION_PIPELINE.md), source-rights gate, provider adapters, typed output, independent verification, human approval and persistent runs/cost evidence.
- Tradeoffs: human review/cost limits slow throughput; provider-neutral contracts need adapter maintenance. Independent LLM judgments remain heuristic.
- Consequences: no generator publication privilege, no student PII/provider uploads by default, no need for AI to take an exam.
- Migration/rollback: disable dispatch or change adapter after evaluation; existing approved versions remain valid unless incident review requires quarantine. Raw output schema stays outside canonical domain.
- Blocks: AI-001/002 only; not the core exam slice.

## ADR-006 — Identity, deployment, retention and operational envelope

- Status: PROPOSED; approval: none; revision: 3; provider/region/budget unresolved.
- Problem: select deployable infrastructure and data policy without inventing audience size or legal permission.
- Options: managed OIDC vs self-hosted identity; managed Node/PostgreSQL vs self-managed VPS; long-lived worker vs platform jobs; various regions and retention windows.
- Proposed choice: maintained OIDC integration with server session and staff MFA; managed Node/PostgreSQL plus worker, private media as needed; minimal identity collection. Retention proposal in [database](../architecture/DATABASE_DESIGN.md), cost/operations in [architecture](../architecture/SYSTEM_ARCHITECTURE.md).
- Tradeoffs: managed services cost money but reduce operational burden; overseas processing/minor users and retention require specific review. No vendor/pricing commitment is made.
- Consequences: local synthetic-data work may proceed after ADR-001–004 and an explicitly approved development identity stub; public deployment, real user collection and production identity configuration wait for this decision's completed data-flow/provider review.
- Migration/rollback: portable OIDC issuer/subject mapping, storage adapter and PostgreSQL backups. IdP migration must preserve local subject IDs and require account linking proof. Export/erase according to approved policy; no casual user-ID remapping.
- Blocks: AUTH-001 production adapter and OPS-001/public launch; owner may explicitly approve local-only stub scope earlier.

## Owner review queue

| Question | Proposed direction / missing input | Owner / task |
|---|---|---|
| Approve initial technical/scope baseline? | ADR-001–004 plus ADR-007 as a coherent website bundle; ADR-005/008 for factory; document changes before dependent coding | Human owner / FOUND-004 |
| Who writes and independently reviews Vietnamese content? | Two distinct human actors; availability unknown | Human owner / DATA-002 |
| Enable a full TSA reference profile later? | Verify original structure image and newer official guidance; sufficient approved inventory | Human owner / FOUND-003, CONTENT-001 |
| Public or private pilot, ages, jurisdiction, identity provider and region? | No real-user launch until data-flow review and provider choice | Human owner / AUTH-001, OPS-001 |
| Budget, concurrent users, availability/RPO/RTO? | Measure against owner-specified traffic; research values are not commitments | Human owner / OPS-001 |
| Approve retention and incident invalidation policy? | Review proposed windows, withdrawal and erasure consequences | Human owner / OPS-001 |
| Which AI provider/model, input permissions and quality targets? | Evaluate early in independent Track A; no vendor preference approved | Human owner / AI-001/002 |

FOUND-004 has an independent review artifact but remains incomplete until the owner records a disposition. FOUND-005 owns reconciliation, not architectural approval. No approval is inferred from the reviewer's APPROVE_WITH_CHANGES recommendation.

## Phase 02.5 history and continuing owner choices

Historical reconciliation (superseded where Phase 02.75 amendments below conflict): ADR-003 revision 2 clarifies typed quota/taxonomy validation, shared contract CI enforcement, aggregate sealing assertions, role-filtered diagnostics, proposed active-attempt uniqueness and latest-only answer storage. ADR-004 revision 2 pins PRNG/shuffle behavior, exact score rounding, cancellation/admission/retake semantics, section uniqueness and preserves lifetime exposure. ADR-006 revision 2 adds lifecycle-pinned idempotency retention and shared database save throttling. ADR-001/002/005 remain revision 1; scope, stack and AI separation are unchanged. These revisions supersede draft text only, not an approved baseline.

| Choice | Alternatives and tradeoffs | Proposed selection / approval status |
|---|---|---|
| H1 Concurrent same-form attempts | Unlimited parallel attempts are possible in public practice but add confusing sessions/load; one active attempt constrains UX without preventing answer sharing | For PUBLISHED_FIXED, one CREATED/IN_PROGRESS per user/form; explicit fixed-mode retake after closure, including pending grading; PROPOSED, owner decision required |
| H2 Availability meaning | Strict full-duration fit inside window closes admission early; admission-only window allows full duration after end and needs rights coverage beyond end | `[from,until)` checked at create and first start; existing clocks continue; PROPOSED, owner decision required |
| H3 Repeated section types | Repeated MATH entries can work with sectionId quotas but add unneeded MVP scheduling cases; unique enum covers current mini/section practice | One to three entries, unique IDs and enum types; PROPOSED, owner decision required |

Approval of the current ADR-004 revision must explicitly cover H1–H3 or record selected alternatives and synchronize affected contracts before FOUND-002. Additional owner review: ADR-003 role trust/disclosure and no full answer-edit history; ADR-006 retention floors, rate defaults and operational budget. No claim that rate numbers are load-tested or retention is legally approved.

Impact/migration: H1 changes attempts uniqueness and create-conflict API; H2 changes catalog metadata, start guard and cancellation reasons; H3 changes blueprint validation/form_sections; quota typing adds a required taxonomyVersionId; diagnostics add a restricted read endpoint; rate limits add one small ephemeral DB table; retention adds a nullable related-attempt link/expiry semantics. Affected tasks: FOUND-002, DATA-001, AUTH-001, ASSEMBLY-001, EXAM-001/002, SCORE-001, WEB-001/002 and OPS-001. There is no deployed data/code to migrate. Before future production adoption, validate existing rows before adding uniqueness, backfill only from proven taxonomy/identity links, and coordinate strict-client contract regeneration. If the owner chooses alternatives now, revise the proposals and fixtures; never “rollback” by changing historical snapshots or counters. No new service, secure-exam feature, forensic store or full-TSA scope is introduced.

## Phase 02.75 owner requirements and revision impact

Recorded 2026-10-16 from the owner's Phase 02.75 assignment: “The website must NEVER require live LLM inference to create or complete a student exam”; “PERSONALIZED_PRACTICE is the default mode”; prior assignments exclude stable question identity for that student, concurrent requests must not bypass this rule, different students may reuse questions, shortage must be explicit, and both research and website tracks begin early. These are authoritative product requirements, **not approval of the implementation choices below**. No architectural approval identity/evidence exists.

Current revisions: ADR-001 r2 adds a separately executable factory runtime in the same repository; ADR-002 r2 places strict personalized no-repeat in MVP and starts independent AI research early; ADR-003 r3 adds ownership, compact assignment history, equivalence groups and factory import contracts; ADR-004 r3 replaces global exposure caps with per-user eligibility and scopes H1 to fixed forms; ADR-005 r2 is early draft-only research/production, not deferred until the website; ADR-006 r3 adds factory credentials/resource limits, create throttling and active-account compact history retention. Other timing/scoring/immutability/approval safeguards remain valid. Previous review reports describe their historical baseline and are preserved verbatim.

Migration impact: proposed create/catalog/result DTOs, forms/attempt constraints, assembly manifests, allocation transactions, bank eligibility revision, retention and task dependencies change together. There is no implemented schema to migrate. A future upgrade must backfill stable-ID assignments from every retained form/attempt before NEW_ONLY is enabled; missing historical evidence must be disclosed, never presented as complete no-repeat. Backfill singleton/confirmed equivalence groups and mode/ownership from proven records, not guesses. Rollback must disable new admissions if readers are incompatible, preserve history/snapshots and keep supported old readers; never discard history to restore availability. No mandatory quota or no-repeat fallback is authorized.

## ADR-007 — Personalized allocation and question reuse

- Status: PROPOSED; approval: none; revision: 1.
- Problem: reusable global stock must provide strictly unseen assignments per student, including corrected versions, equivalent variants and concurrent creation.
- Options: global consumption; version-only history; stable-ID history checked without locking; stable-ID history plus canonical equivalence and per-user transactional allocation.
- Proposed choice: final option, [reuse policy](../specifications/QUESTION_REUSE_POLICY.md) and [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md). One snapshot schema supports owned personal forms and shared fixed forms. Assignment occurs at CREATED commit; conservative monotonic equivalence merges; explicit opt-in review/fixed modes.
- Tradeoffs: compact active-account history, personal snapshots and protected replay manifests cost storage. Abandoned allocations exhaust small banks sooner. Per-user serialization limits races without globally serializing different students; shared/exclusive bank revision guard coordinates publication. Late-discovered equivalence cannot retroactively prevent past assignments.
- Consequences: shortage is a normal explicit outcome, never silent repetition or a live AI request. Proposed 15-minute personal start TTL bounds admission, not assignment retention; owner must confirm TTL, equivalence adjudication, retention/erasure and explicit-repeat UX. Different students share inventory; global usage is analytics only.
- Migration/rollback: coordinated changes described above; no schema duplication for modes. Do not reset assignment history or mutate historical forms on rollback.
- Blocks: DATA-001, BANK-001, ASSEMBLY-001, EXAM-001, WEB-001 and strict-new practice acceptance.

## ADR-008 — Independently scheduled question factory and early research

- Status: PROPOSED; approval: none; revision: 1.
- Problem: explore AI feasibility early and replenish shortages without student-path inference or factory failures interrupting exams.
- Options: synchronous student generation; new microservice/broker infrastructure; separate executable with shared contracts and existing PostgreSQL job infrastructure.
- Proposed choice: separate TypeScript/Node entry point, manual/weekly scheduler, bounded inventory-driven batches and distinct credentials/pools; [factory specification](../specifications/QUESTION_FACTORY_SPEC.md). Reuse jobs and canonical draft/review/publication, add only batch/item/run/import identity records. Independent fixtures and fake/provider adapters permit research without web deployment.
- Tradeoffs: shared DB remains a common failure/resource domain; budgets, concurrency, small transactions and workload tests are essential. No claim of hard availability isolation from total DB failure. Separating DB/service later needs measured contention or security evidence, not speculation.
- Consequences: owner approves schedule/timezone, live-provider data terms/budget, review capacity, acceptance thresholds and resource envelope. Factory cannot approve content or read students; web has no provider credentials. INT-001 proves approved AI content enters the ordinary bank and exams work with factory disabled.
- Migration/rollback: versioned factory-package/1 imports are idempotent; scheduler can be disabled or adapter replaced while durable drafts remain recoverable and existing published questions remain usable. Expand shared job kinds with executor allowlists; never let factory workers claim grading jobs.
- Blocks: AI-001/002, FACTORY-001 and INT-001; not the manually seeded website milestone.

Owner approval queue additionally covers ADR-007/008 and all revised scopes above. Fundamentals in the owner's requirement are not reopened as optional features; the proposed mechanisms and parameter values still need approval.
