# Implementation roadmap

Owner disposition, 2026-10-19: **G1 ACCEPTED; FOUND-002 COMPLETED** against
implementation `0e67485` and audit baseline `81ef8aa`. Mandatory evidence in the
[final audit](../reviews/G1_ACCEPTANCE_AUDIT.md) is satisfied. Scoped owner record:
[OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md#g1--owner-acceptance-and-bounded-track-b-execution-2026-10-19).
G2/G3 and unresolved downstream decisions remain pending. Earlier pending-G1
statements below describe historical checkpoints, superseded by this disposition.


Status: **PROPOSED** Phase 02.75 sequencing. Scoped G0 implementation authorization is recorded in [decisions](../decisions/OPEN_DECISIONS.md) on 2026-10-17; this roadmap is not an ADR approval or production-readiness record. [Backlog](TASK_BACKLOG.md) owns task status; decisions owns approval records. The three product stages below are independently demonstrable and may advance in parallel. Exit evidence is future evidence to be recorded by the accountable task owner, not work completed by this roadmap.

## Active priority — Track B first, 2026-10-19

Owner directive prioritizes visible Track B product progress (~85%) and lightweight
Track A preparation (~15%); these are priorities, not effort/token quotas.
G1 ACCEPTED by owner, disposition commit `27350b3`; FOUND-002 COMPLETED. Existing
B0 finalization and same-app B0.1 polish are explicitly authorized; integrated work
retains its remaining prerequisites and unresolved decision boundaries.

| Milestone | Dependency / executable scope | Demonstrable exit |
|---|---|---|
| B0 now | No G1 dependency for isolated mock UI; no approved-content or real-backend claim | Vietnamese local landing/catalog, MATH fixture navigation/selection, countdown, confirmation and demo result; startup + automated and browser evidence. Repeat synthetic content visibly labeled. |
| B0.1 verified | Same app and existing synthetic fixture; no fresh content needed | Clear/count/focus, resume same in-memory deadline/answers, submit summary and separate post-grade review. Eleven Node tests and actual desktop/mobile browser verification pass. Distinct lawful content and other renderers remain follow-on work. |
| B2 foundations enabling B1 | Owner G1 acceptance → DATA-001 → explicitly scoped local AUTH-001 → BANK-001 ingestion → BANK-002 human review/publication evidence → owner G2 disposition | Minimal controlled staff import/review/publication supplies approved stock; do not defer this dependency until after claiming a real exam. |
| B1 integrated mini exam | Above gates + ASSEMBLY-001/002, EXAM-001/002 and SCORE-001 acceptance | Immutable allocation, server timing, persisted answers, closure/scoring and authorized result. Reconcile owner's ten-question target with existing separate 4/2/4 domain profiles before integration; no combined attempt assumed. |
| B3 offline Factory bridge | Working bank/publication boundaries plus Factory/INT prerequisites and own approvals | Draft-only import through human review; no live generation on student paths. |

Recommended implementation: Codex Luna / XHigh for bounded frontend/mock and later
frozen adapter/test slices (low relative cost); Sol 6.1 / Medium coordination and
independent verification. Terra only for demonstrated complex DB/security segments.
No Astra. Maximum one writing worker and two child agents; no downstream work
started by this roadmap.

Lightweight Track A preparation (no benchmarking, scraping or provider calls):

| Candidate source inventory | Usage basis / current disposition |
|---|---|
| Existing repository synthetic contract fixtures | Technical test/demo material only, attributed to exact file; not approved seed stock, Vietnamese subject review or a legal-clearance claim. |
| Future owner/human-authored original practice items | Require named author, rights attestation, evidence and a different human subject reviewer before publication. |
| Existing research inventory S1 HUST scheme PDF / S2 HUST handbook announcement | Reference/source-verification only, as recorded in RESEARCH_ASSESSMENT; no sample-question reuse/training permission established. No new retrieval or scraping in B0. |
| Existing research inventory S3 UIT / ViQuAD | Research assessment records contact/user-agreement conditions; no agreement or corpus usage authorized here. No download, ingestion or training. |
| Explicitly licensed/open/public-domain inputs | No specific collection approved here; verify exact license, allowed use, attribution, territory/dates and immutable version before ingestion. |

Quality/rubric preparation reuses existing contracts: identify MATH/READING/SCIENCE;
SINGLE_CHOICE/MULTIPLE_CHOICE/TRUE_FALSE_GROUP; taxonomy version and shared-stimulus
bundles. Assess correctness, unique/complete answer, ambiguity, Vietnamese clarity,
explanation evidence, curriculum relevance, rights/provenance and duplicate/equivalence
flags separately. Record PASS/FAIL/INCONCLUSIVE against exact hashes; no model score
substitutes for independent human approval. Dataset evaluation additionally needs
frozen held-out labels, no leakage and an owner-accepted protocol before benchmarking.

## Active Stage 4B contract batch — 2026-10-19

Owner [scoped D1–D6 approval](../decisions/OPEN_DECISIONS.md#d1d6-scoped-contract-approval--stage-4b--2026-10-19)
supersedes the historical Stage 4 proposals below only within its recorded scope.
No whole ADR, missing evidence, production readiness or G1 advancement is implied.

| Increment | Dependencies and evidence | State |
|---|---|---|
| D1 shortage reconciliation | Existing 422 eligible/unseen versus 503 unknown semantics; bounded FOUND-007 acceptance | Verified in `07ced30`; allocation implementation is later work |
| D2 identity and fingerprint | Exact versioned bytes, immutable reference closure, independent hash goldens | Accepted `07ced30` |
| D4 Factory v2 | D2; full source/rights/assets/ancestry, atomic DRAFT-only receipts, v1 compatibility | Accepted `d65e08b` |
| D3 assembly/replay | D2; manifest/slot goldens, exhaustive oracle, measured caps and replay failures | Accepted `8a09b92`, repair `3af1b34` |
| D5/D6 routes and boundaries | Existing approved DTOs; separate consumer entries, generated route types/OpenAPI, actual owner/release HTTP egress | Accepted `a6ec4ad` |
| Integration evidence | All above; full required suite, generated drift and consumer restriction checks | Local suite PASS; G1 ACCEPTED by owner 2026-10-19 |

Luna / XHigh implemented the batch; Sol / Medium owns technical specification,
independent review, integration and shared records. Coordinator completed bounded
integration repairs after worker capacity errors; all reservations are released.
A read-only Luna scout supplied narrow evidence. No Terra/Astra, dependency change,
push, merge, deployment or paid API occurred. Later DATA/AUTH/BANK/ASSEMBLY services retain their own gates.

## Active integrated Track B batch — owner approval, 2026-10-19

[Scoped DATA/AUTH approval](../decisions/OPEN_DECISIONS.md#data-001--auth-001--scoped-local-track-b-approval-2026-10-19)
authorizes PostgreSQL, reviewed SQL and server-only access, immutable versions and
snapshots, private-data separation and transaction safety. It also authorizes the
synthetic-only local identity adapter after DATA-001; production activation must
fail closed. Existing frontend/contracts remain stable; no ORM expansion.

| Order | Executable dependency and evidence |
|---|---|
| DATA-001 | Bank-core migration/adapter first, then form/attempt/history/jobs schema. Independently verify fresh install, populated upgrade, FK/immutability/role negatives, atomic rollback and real two-connection barriers. Partial schema tests do not complete the task. |
| AUTH-001 local | Accepted DATA-001; server-side fixed synthetic identities, sessions, role/object checks, invalidation and CSRF/origin negatives. Current B0 mock cookie is not acceptance. Production OIDC/MFA/provider configuration remains later. |
| BANK-001 ingestion | Accepted DATA/AUTH and frozen G1 contracts; register evidence, validate/import immutable drafts and keep keys server-only. Existing frontend may consume the resulting local staff adapter. No automatic publication. |
| BANK-002 / DATA-002 | Accepted ingestion plus named independent human review process, lawful exact-version rights and reviewed stock. Synthetic integration fixtures cannot substitute for these prerequisites. |
| B1 | Published stock/G2 and accepted allocation/attempt/closure/scoring components; preserve separate 4/2/4 domain profiles. No gate advancement by passing fixtures alone. |

Codex Luna / XHigh implements bounded slices; Sol / Medium independently reviews
and verifies. Terra only for demonstrated complexity. One writing worker; no
Astra, push, merge, deployment or paid APIs. Historical proposals below are
superseded only within the current recorded approval scope.

## Proposed post-G1 prerequisite batch — 2026-10-19

The [final audit](../reviews/G1_ACCEPTANCE_AUDIT.md) recommends owner acceptance
of G1 at `0e67485`; G1 is NOT ESTABLISHED until explicit owner disposition. This
is a proposed assignment sequence, not downstream implementation authorization.
Existing gate/card criteria below remain unchanged.

| Order / task | Actual prerequisites and required decision | Bounded deliverable and acceptance evidence | Recommended agent/platform / reason / relative cost |
|---|---|---|---|
| First: DATA-001 relational foundation | Owner G1/FOUND-002 acceptance and task assignment; disposition of affected proposed database/ADR mechanisms before choosing them. Scoped H1/H2/H3, 600-second deadline and non-retroactive ordinary admission edits are already approved. | Freeze a table/constraint/migration matrix against approved contracts, then implement in bounded increments. Real PostgreSQL fresh install/populated upgrade, FK/check/unique failures, immutable links, cross-form rejection, history preservation, rollback compatibility and two-connection barrier/lock-order tests. No contract tests substituted for DB evidence. | Codex Luna / XHigh for bounded migration fixtures/increments after specification freeze; low–medium. Terra / Medium only for a specifically assigned complex multi-table migration/locking segment beyond that scope; medium, justified by irreversible integrity/concurrency risk. Sol / Medium independently reviews migrations and evidence. |
| Next: AUTH-001 local development | DATA-001, FOUND-002, G0 and explicit owner approval of the synthetic-data-only identity stub. No durable approval of that stub is currently recorded. Production OIDC provider/data-flow choices are separate later work. | Server-enforced roles/own-object checks, factory/job-kind isolation, session invalidation, BOLA/CSRF/property negatives; local stub impossible to enable in production. Accepted local evidence can supply G2; requiring G2 first would create a cycle. | Codex Luna / XHigh for bounded adapters and negative fixtures; low–medium. Sol / Medium necessary independent security review; no production identity implementation implied. |
| Then: BANK-001 ingestion | G1, DATA-001, AUTH-001 and affected rights/versioning mechanisms approved. | Validate/dry-run exact hashes, provenance/rights, stimulus/assets and atomic idempotent draft-only receipts in real persistence; stale/altered payload and rights failures reject without partial writes. | Codex Luna / XHigh for frozen parser/adapter slices; low–medium, with Sol / Medium integrity review. |
| Then: BANK-002 human publication | DATA-001/AUTH-001/G1, accepted BANK-001 ingestion evidence and a named independent human review process. It does not wait for the complete BANK-001 milestone or G2. | Human-only exact-hash approval, no self-approval/inherited approval; duplicate resolution, canonical equivalence audit, quarantine/revocation. Real DB concurrent approve/withdraw and authorization tests. BANK-001 plus BANK-002 evidence establishes G2 only by owner disposition. | Codex Luna / XHigh for bounded commands/tests, Sol / Medium independent integrity/security review. Named human reviewer performs content approval. |
| Independent preparation: DATA-003 → DATA-002 | G0 lawful scope and named distinct author/reviewer; DATA-002 additionally needs affected ADR-002/003 scope approved. Manifest preparation does not require Bank implementation; canonical import awaits BANK-001. | Original/lawfully cleared 12/6/12 mini-bank manifest, source/rights attestations, three interactions and reading bundle. Hash/count/schema preflight plus independent Vietnamese clarity, answer, rights and duplicate review. Test two NEW_ONLY attempts under constraints; counts alone do not prove feasibility. | Human author and independent content reviewer; Codex Luna / XHigh only for manifest tooling/schema/feasibility checks, low cost. Agent output cannot grant rights or human approval. |
| Independent research: FOUND-003 / RESEARCH-002 | Scoped research assignment under G0, provenance/rights boundaries and research-review scope. No website, Bank, G2 or live paid model dependency. | Dated primary-source applicability evidence; dataset/source/taxonomy gap matrix, lawful input policy and reproducible two-adapter evaluation protocol. Distinguish official profile verification from reuse permission and unofficial scoring. | Codex Luna / XHigh for bounded evidence organization and fixtures; Sol / Medium for protocol/source interpretation; low–medium. No paid API or presumed model availability. |
| Follow-on: AI-003 / AI-001 | AI-003: rights-cleared sources, named independent labelers and owner-accepted RESEARCH-002 plan. AI-001: G1, FOUND-002, lawful fixtures and explicit task assignment. | Frozen held-out hashes/partitions and leakage audit; standalone fixture/fake-provider adapter with deterministic canonical draft output and negative validation. AI-002 quality claims await lawful independent held-out labels and AI-001. Live adapters retain provider/input/privacy/cost approvals. | Codex Luna / XHigh for deterministic fixtures/fake adapters, low–medium; human labelers and Sol protocol review where required. |

Independent tracks: source research and lawful human seed preparation can proceed
beside DATA-001 once their own approvals/assignments exist; a G1-approved fake
adapter can also proceed independently of DB/auth. Keep at most one writing agent
and two child agents; serialize overlapping schemas/migrations and shared tracking
files. Read-only verification and human content review may run concurrently.

Consolidated next owner scope: accept or reject G1; separately assign DATA-001 and
dispose only its affected proposed mechanisms; explicitly scope AUTH-001's local
synthetic stub; nominate lawful-source scope and independent authors/reviewers/
labelers; assign the early research protocol. These are later-task decisions,
not outstanding G1 acceptance gaps. No production provider or paid spend is needed
for the first database/synthetic-fixture/research-planning batch.

## Current owner-approved MVP boundary

The MVP has independent one-domain practice tests: MATH has 4 questions, READING has 2, and SCIENCE has 4. Each is separately selected, created, started, timed, submitted, scored and reviewed only when authorized; no automatic chaining or combined official TSA score exists. The vetted seed-bank target remains 12 MATH, 6 READING and 12 SCIENCE questions. `PERSONALIZED_PRACTICE` + `NEW_ONLY` remains the default, with assignment at the atomic CREATED commit, immutable per-student history and canonical equivalence exclusions. At most one `CREATED` or `IN_PROGRESS` attempt exists per student across modes. Admission is `[available_from, available_until)` for create and first start; an admitted attempt may finish after closing. Creation persists the immutable 600-second bound `start_before_at = min(created_at + 600 seconds, admission_until_at_creation)`. Ordinary admission-schedule edits are non-retroactive for already CREATED attempts; withdrawal, rights and security guards remain independent. These scoped approvals do not approve ADR-004 as a whole. The separate G0 authorization permits development within its recorded conditions but does not by itself establish downstream readiness.

## Shared planning prerequisites and gates

| Gate | Dependency ordering | Verifiable exit evidence |
|---|---|---|
| G0 — Scoped architecture authorization | FOUND-006 → FOUND-004 → G0. FOUND-003 source verification and RESEARCH-002 research planning may be assigned early. | Scoped human-owner implementation authority is recorded in [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md) on 2026-10-17. Accountable task ownership and unresolved ADR/provider/budget/rights/retention/reviewer-capacity limits remain explicit. H1/H2/H3 and Start TTL approvals remain separate and do not approve ADR-004 as a whole. |
| G1 — Shared schema and controlled bridge | G0 → FOUND-002 → G1. FOUND-002 starts after G0 and establishes G1; it never requires G1. | Versioned canonical question/stimulus schema, version/provenance, rights, equivalence and workflow terms; `factory-package/1` package/receipt semantics; draft-only import boundary; jobs/job-kind and safe DTO/API fixtures. Fixtures demonstrate independently executable factory and web/bank consumers without a live provider. |
| G2 — Bank publication boundary | G1 plus DATA-001/AUTH-001 permit BANK-001 ingestion and BANK-002 independent review/publication. Verified BANK-001 ingestion **and** BANK-002 publication evidence → G2. | Exact-version rights, immutable versions, validation/review/equivalence records, human-only approval and eligible-bank publication are demonstrably separate from draft creation. G2 does not gate either producer; factory credentials cannot approve or publish. |
| G3 — Integration readiness | FACTORY-001 (including FACTORY-002/003), AI-002, G2, technical-MVP assembly/attempt/scoring evidence, and INT-002 controlled-import proof → G3 → INT-001. | Before G3 passes, INT-002 accepts the same package twice as one durable receipt, rejects changed content under the same identity, and imports no partial stimulus bundle. A human-approved subset becomes eligible bank stock without changing the factory, assembly or exam contracts. |

G1 defines interfaces, not a second production store or a requirement to deploy the website. G2 is the sole path from any manual or factory draft to selectable stock. G3 is an evidence gate, not a prerequisite of INT-002 or any other task that supplies its evidence. No gate converts a PROPOSED ADR into approval. G1 is owner-accepted; G2/G3 remain unestablished; the G0 authorization is an owner scope record, not implementation or release evidence.

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

The model intentionally excludes conditions that cannot be truthfully reduced to a task/gate completion node: human owner approval/assignment; ADR dispositions; the unresolved ordinary availability-edit effect on CREATED attempts; named independent reviewers/authors/labelers; rights, privacy, budget, provider, retention, traffic, age and jurisdiction approvals; actual production OIDC configuration; and local-stub scope approval. It also excludes the two partial internal handoffs—BANK-001 accepted ingestion evidence to BANK-002 and ASSEMBLY-001's accepted manifest-candidate interface to ASSEMBLY-002—because neither is a parent-milestone completion state. Those remain explicit acceptance requirements in the backlog. The no-cycle result applies only to the stated 40-node/102-edge model and does not claim automated validation of these excluded human or prose-only conditions.

## Coordinated delivery stages

| Product stage / milestones | Dependencies and work | Verifiable exit evidence |
|---|---|---|
| **Stage 1 — Technical MVP** | **B1 — Safe bank:** DATA-001 + the authorized AUTH-001 local-development path + G1 → BANK-001 ingestion; BANK-002 independently supplies review/publication evidence; together they establish G2. DATA-002 human-authored inventory can run in parallel after G0. **B2 — Personalized web slice:** ASSEMBLY-001 → EXAM-001; EXAM-002 + SCORE-001 → WEB-001, using G2-published manual seed items. | A vetted, shared approved bank supports independent MATH-4, READING-2 and SCIENCE-4 personalized NEW_ONLY tests. Browser-backed evidence covers save/resume, submit/expiry, results/history and explicit shortage handling across two unseen attempts. Staff can use the controlled manual import/authoring, review, approval and quarantine path. Factory/provider is stopped or unavailable throughout; no exam path needs live generation or claims to reproduce the official TSA examination. |
| **Stage 2 — AI Research Demonstrator** | **A1 — Early AI feasibility:** RESEARCH-002 runs from G0; AI-001 starts after G1; AI-002 uses lawful held-out human labels. **A2 — Batch prototype:** FACTORY-001 follows AI-001 plus explicit budget, schedule and review-capacity authorization. | Factory runs independently of Next.js, OIDC and deployed student web services, first with fixture/fake adapters and then evaluated interchangeable adapters as authorized. It produces measured source/quality/cost evidence, bounded manual/weekly plans, recovery records and idempotent draft-only package export. It has no publication privilege and does not require completion of B1/B2. |
| **Stage 3 — Final Integrated University Deliverable** | **I1 — Research/platform integration:** INT-002 supplies the controlled-import proof before G3; INT-001 starts after G3. **B3 — Pilot readiness:** WEB-002 + TEST-001 + OPS-001 follows the integrated evidence where the owner scopes a pilot. | Import the same factory package twice; independently review and approve a subset through G2; assemble a student's NEW_ONLY exam from that subset; then disable factory/provider and complete scoring and results. Required acceptance scenarios A–J, including factory isolation, rights/review controls and recovery, have recorded results. Release/pilot still requires its separately authorized operational, privacy and owner scope. |
| **Later breadth / research** | CONTENT-001 follows verified profile/inventory; RESEARCH-001 follows adequate data and explicit scope. | Versioned richer interactions or an evidence-backed calibration/solver proposal; neither is implied by the three deliverable stages. |

## Track ordering and integration boundaries

Track A (AI research) starts at G0 and proceeds through A1/A2 independently. It may use isolated fixtures, rights-cleared sources and a staging/export path before BANK-001 exists. Its only shared dependency is G1 once it needs portable canonical packages; it does not wait for a student website, student authentication, web deployment or B2 acceptance.

Track B (bank/web engineering) starts from G0 with rights-cleared, manually verified seed work and reaches the Technical MVP through G2 and B1/B2. Its first coding sequence is FOUND-002 to establish G1, then DATA-001 and the authorized AUTH-001 local path, followed by BANK-001/BANK-002, ASSEMBLY-001 and EXAM-001. The recorded non-retroactive ordinary-admission-edit decision governs an existing CREATED attempt; implementation still requires synchronized contract review and its listed tests. Production identity configuration and real-user deployment additionally require G2, ADR-006's completed data-flow/provider review, and separate owner authorization. Track B does not wait for AI quality, provider availability, live generation or A2 completion. The intentionally small 12/6/12 bank target can exhaust; shortage UX is a required first-slice behavior, not a trigger for an LLM call or silent item reuse.

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

No calendar or throughput commitment is made. Next action: assign an accountable owner for the first implementation task, then establish G1 through FOUND-002 under the recorded authorization and unresolved-decision limits. No paid LLM API request is authorized by this roadmap.


## Proposed Stage 4 bounded autopilot — 2026-10-19

Status: Stage 4A COMPLETED under the owner's 2026-10-19 "STAGE 4A — BOUNDED
AUTOPILOT ACTIVATION"; Stage 4B remains NOT STARTED. These are bounded subtasks
of FOUND-002/FOUND-007, not new tasks or changed dependencies. Engineering
checkpoint `dadd60e`; [handoff](../agents/LAST_HANDOFF.md) records independent
checks. The [single decision packet](../reviews/G1_STAGE4A_DECISIONS.md) owns
current READY/BLOCKED/DEPENDENT classification; recommendations remain unapproved.

### Verified gaps and first batch

Stage 3 supplies local JS/declaration build and emitted-runtime smoke evidence.
Existing schemas, source package exports and components-only OpenAPI are unchanged.
The [historical G1 gap assessment](../agents/ORCHESTRATOR_HANDOFF.md#g1-acceptance-001-audit-actual-remaining-criteriagaps)
still requires: FOUND-007 owner acceptance; exact content/hash/fingerprint rules;
complete assembly/replay and publication-lock encoding; Factory stimulus/assets
and source/rights transport; released-result wire alignment; accepted route/client
contracts; strict independent consumer/private-boundary evidence; and recorded
version/support/license/advisory review. Hosted CI remains unobserved; no push is
authorized. Broader database/browser/provider enforcement is later runtime work,
not an invented G1 prerequisite. Stage 4A now supplies the scoped dependency
review and emitted consumer/type evidence; the remaining semantic, artifact and
import-boundary gaps are classified in the linked decision packet.

Stage 4A batch below was executed; its criteria remain the scope boundary:

| Subtask | Dependency and reserved scope | Acceptance | Agent / complexity / relative cost |
|---|---|---|---|
| A: dependency evidence | No unresolved product decision; installed manifests/lockfile read-only; one review record under `docs/reviews/` | Exact installed/locked versions, licenses/support and dated primary advisory sources, commands/results and unresolved findings recorded; no installs/upgrades or claim that an unavailable advisory check passed | `tsa_builder`, Luna / XHigh; S–M / low; bounded evidence gathering |
| B: decision packet | Existing task-specific specs/tests only; one proposal under `docs/reviews/`; no authoritative spec/source changes | One field-level gap matrix with options, recommended choices, consumer impact/migration, golden-example expectations and precise owner sign-off scopes for FOUND-007, identity, assembly, transport and result/routes | `tsa_builder`, Luna / XHigh; M / medium; structured reconciliation without implementation |
| C: existing-contract consumer evidence | Current immutable semantics; only new synthetic fixtures/tests in separately reserved paths under `packages/contracts/test/` | Independent producer/consumer serialization against emitted modules; malformed/unknown fields rejected; safe projections exclude private fields; changed-response and optional-field cases distinguish current strict-schema behavior from future approved evolution | `tsa_builder`, Luna / XHigh; M / medium; focused fixtures using established contracts |
| D: integration review | A–C complete; coordinator alone updates shared package scripts, CI and tracking records if needed | Review actual diffs; build/smoke/typecheck/tests/drift/docs/whitespace pass; no schema/export/dependency drift; explicit gap dispositions; unresolved G1 criteria stay open | Sol 6.1 / Medium; S–M / low–medium; necessary integration review |

The configured model/effort recommendations use existing subscription clients;
future availability/quota is not verified. If a recommended role is unavailable,
pause its dispatch and report that limitation; no paid or automatic model fallback.
Independent review is proposed, not performed for Stage 4. No Astra.

### Ordering, concurrency and batch boundary

Run A and B concurrently only as separately owned records (or read-only outputs),
with at most two child threads. Default to one writer: otherwise serialize them
unless the owner explicitly authorizes two isolated worktrees. C follows B's scope
check and runs while the coordinator reads A/B; serialize its shared script/CI
integration through D. Record exact file reservations in dispatch prompts before
starting. Never let workers concurrently edit `src/index.ts`, generated artifacts,
package scripts, decisions, backlog/state or handoffs.

Batch ended after A–D and a concise owner decision packet. It did not attempt to
close every G1 gap, install a bundler/framework, start DATA-001 or advance G1.
Bundle isolation remains unproven by shared-schema consumer fixtures alone.
No push, merge, deployment, paid API or new architecture is implied. Stage 4A
local commits were explicitly authorized by its activation directive;
Stage 4B and its commit scope still require an explicit assignment.

### Follow-on work conditional on owner decisions

| Work | Prerequisite | Independently verifiable exit | Suggested worker / complexity / relative cost |
|---|---|---|---|
| Computed identity/fingerprint vectors | Approved immutable fields, encoding/normalization, self-reference and versioning rules | Exact byte/hash goldens plus tamper, Unicode and equivalent-input negatives | Luna / XHigh; M / medium; Terra / Medium only for demonstrated algorithmic complexity |
| Full assembly replay references | Approved tie/order/search-count/lock encoding rules; identity vectors if replay uses their hashes | Frozen manifest-to-slot goldens, tie/boundary/search-exhaustion cases; no database transaction claim | Luna / XHigh initially; L / medium–high; Terra / Medium only if complexity justifies escalation |
| Complete Factory transport | Approved stimulus/assets and rights/provenance fields | Strict positive/negative complete-bundle producer/consumer fixtures; draft-only receipt invariant | Luna / XHigh; M / medium |
| Released result and route/client artifacts | Approved release wire shape, route operations and client target/tool scope | Generated artifacts reproduce exactly; mutation drift fails; strict consumer evolution cases; public/released/private boundary checks | Luna / XHigh; M–L / medium–high; Sol / Medium independent boundary review |
| G1 acceptance assessment | All accepted FOUND-002/FOUND-007 evidence, dependency review and boundary gaps disposed | Criterion-by-criterion evidence, no missing check labelled PASS; owner gate disposition, no automatic advancement | Sol / Medium read-only; M / medium |

The owner must approve the field-level semantic choices above, FOUND-007's exact
scope/closure, the next batch assignment and any dependency/tool/export changes
needed later. Existing H1/H2/H3/Start TTL/admission-edit approvals remain intact;
no whole ADR is approved by this plan. Lawful sources and provider/privacy/spend
choices are separate gates for later real-data/live-provider work.
