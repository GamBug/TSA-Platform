# Task backlog

## FOUND-006 — Phase 02.75 product architecture refinement

- Objective/scope: independent scheduled factory, shared reusable bank and strict personalized assembly; reconcile affected docs without implementation.
- Prerequisites: owner's Phase 02.75 requirements; FOUND-005 and preserved review evidence.
- Files: requested architecture/specifications/tasks/decisions/state/handoff files; new QUESTION_FACTORY_SPEC and QUESTION_REUSE_POLICY; affected question/quality/onboarding references. Original research and review reports read-only.
- Deliverables/acceptance: concrete proposed contracts, A–J scenario mapping, two early tracks, explicit integration gate, no live AI on student paths and no-repeat in MVP.
- Verification: document/link/ID checks, contradiction search, manual transaction/recovery walkthrough and before/after file hashes. No application tests claimed.
- Priority P0; complexity L; risks: policy drift, allocation races, duplicated persistence, batch overload.
- Status: COMPLETED (documentation refinement, 2026-10-16). Evidence: [latest handoff](../agents/LAST_HANDOFF.md); static checker exit 0, 21 required documents / 25 Markdown files / 25 task IDs / eight proposed ADRs; historical 15-finding and PRNG/rounding checker passes; pre/post hashes preserve research and both reviews; A–J manually traced. Application tests NOT RUN. Accountable implementer: Codex, lead architect; shared-document ownership released. Independent re-review not assigned; owner approves architecture, not this task completion.

Historical Phase 02.5 update: 2026-10-16. FOUND-005 is assigned to Codex by the owner's reconciliation request. Earlier completion evidence remains historical, not current approval.

## FOUND-005 — Architecture review reconciliation

- Objective/scope: disposition every finding in ARCHITECTURE_REVIEW_001; reconcile justified contract changes without application code or scope expansion.
- Prerequisites: FOUND-001 and an independent review artifact. The artifact informs FOUND-004 but does not require FOUND-004 milestone completion or owner disposition; no architecture approval was required for this historical documentation assignment.
- Files: docs/reviews/REVIEW_RESOLUTION_001.md; relevant architecture/engine/assembly/quality/backlog/decision documents; PROJECT_STATE and LAST_HANDOFF. Original review and research read-only. Codex owns these shared-file updates for this task.
- Deliverables: finding-to-disposition traceability, proposed corrected contracts, aligned acceptance/tests and approval queue. Acceptance: all 15 numbered findings and unnumbered actionable comments addressed; immutable input hashes preserved; no false approval/runtime claims.
- Required verification: documentation checker, finding coverage, PRNG reference-vector calculations, manual API/DB/state/pipeline consistency review, protected-input hash audit and patch/Git file-scope inspection.
- Priority P0; complexity M; risks: accepting incorrect premises, policy changes mistaken for approval.
- Status: COMPLETED (documentation reconciliation, 2026-10-16). Evidence: [resolution](../reviews/REVIEW_RESOLUTION_001.md) (historical handoff: 23 Markdown files, 152 valid local links, 21 task IDs, no application tests); 15/15 findings mapped, 15 PRNG outputs and 4 rounding cases checked, static checker passes with preserved-input whitespace warning, review/research hashes unchanged. Accountable implementer: Codex; ownership released. Independent re-review of revisions not performed; owner approval remains FOUND-004 and all ADRs remain PROPOSED.

Authoritative task statuses as of 2026-10-16. Status vocabulary: DRAFT (unassigned/not authorized), PROPOSED (ready for review), APPROVED (authorized/ready), IN_PROGRESS (one named accountable implementer), BLOCKED (named unmet dependency), COMPLETED (acceptance and required evidence recorded), SUPERSEDED (replacement linked). Roles are suggestions, never actual assignments or review claims. Complexity S/M/L is relative.

All future paths below are proposed ownership scopes, not existing files. Before claiming a task, read [onboarding](../agents/AGENT_ONBOARDING.md), check prerequisite completion/ADR approval, name implementing agent, reserve files and record starting Git state. Task completion requires its listed tests and acceptance evidence; if code/tests do not exist, record NOT RUN, never PASS. Independent review is required for critical bank/attempt/score contracts before integration. Legacy ADR approval groups are distinct from lifecycle gates: **ADR-CORE** = ADR-001–004 and ADR-007 approved; **ADR-OPS** = ADR-006 approved for production; **ADR-FACTORY** = ADR-005 and ADR-008 approved. These groups do not change the PROPOSED status of any ADR or authorize implementation. Local-only identity stub requires explicit scoped approval per ADR-OPS (ADR-006).

## FOUND-001 — Phase 01 documentation

- Objective/scope: establish architecture, evidence classification, domain/API/DB drafts, roadmap, collaboration and quality procedures; documentation only.
- Prerequisites: owner mission; research present. Files: README.md, AGENTS.md and all documentation linked by README, excluding unchanged original research.
- Deliverables: required 19 documents plus research assessment. Acceptance: all required files substantive; navigable onboarding; no approved architecture falsely recorded; consistent domain/API/state semantics; no app code or research alteration.
- Required verification: inspect complete research, local link/nonempty/fence checks, task/decision consistency review, unchanged research hash, final Git scope inspection. Historical evidence preserved in [resolution record](../reviews/REVIEW_RESOLUTION_001.md) under Phase 01 evidence; LAST_HANDOFF now describes reconciliation.
- Priority P0; complexity L; risks: research uncertainty, internal contradictions.
- Status: COMPLETED. Evidence (2026-10-15): embedded documentation checker exit 0, 19 required documents, 91 local links, 20 unique task IDs, six proposed/unapproved ADRs, unchanged research SHA-256; manual contract walkthrough and Git scope inspection recorded in [handoff](../agents/LAST_HANDOFF.md). Accountable implementer: Codex, lead architect in this session; ownership released at handoff. Suggested independent reviewer: architecture reviewer (any capable environment); review/approval remains FOUND-004, not claimed completed here.

## FOUND-004 — Independent review and human baseline approval

- Objective/scope: review ADR-001–008, identify conflicts and record owner's approval/conditions; do not implement.
- Prerequisites: FOUND-001 and the current refinement evidence from FOUND-006. Files: read all architecture/spec contracts; assigned reviewer writes review findings in docs/decisions/OPEN_DECISIONS.md through coordinated integrator, or provides read-only review for integrator.
- Deliverables: actionable findings with severity, affected files and resolution; durable human decision evidence. Acceptance: each blocking finding resolved or explicitly deferred with impact; current ADR-001–008 have owner disposition; implementation gate unambiguous.
- Required tests: document consistency/links, scenario walkthrough for submit/save/expiry, snapshot mutation and rights withdrawal; no runtime claims.
- Priority P0; complexity M; risks: reviewer approval mistaken for owner authorization. Status: BLOCKED on remaining owner decisions and accountable implementation assignment. Scoped G0 implementation authorization was recorded by the human project owner on 2026-10-17 in [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md); it permits the explicitly listed development, testing, local/free-tier AI and preparation work, but does not approve any ADR, paid LLM API use or production readiness. Independent review portion: Antigravity's [review](../reviews/ARCHITECTURE_REVIEW_001.md), dated 2026-10-16, received; its documented findings were repaired in the subsequent committed documentation series. Reconciliation tracked in FOUND-005. Remaining accountable decision role: human owner; no implementation task owner is assigned by the authorization record. H1, H2, H3, the 600-second MVP start TTL and non-retroactive ordinary admission-schedule edits are scoped owner approvals, but ADR-004 remains PROPOSED as a whole. Acceptance still requires owner disposition of the remaining ADR-004 scope, ADR-007/008 and affected revised scopes, plus the required rights, privacy, provider, budget, retention and reviewer-capacity evidence.

## FOUND-003 — Official evidence/profile validation

- Objective/scope: visually verify original blueprint table and check current official guidance; preserve research.
- Prerequisites: FOUND-001; no application architecture approval needed for read-only research. Files: docs/research/RESEARCH_ASSESSMENT.md, applicable profile decisions.
- Deliverables: dated URLs, page/section references, verified vs unresolved claims. Acceptance: counts/ratios and source applicability resolved or explicitly blocked; no claim of official score reproduction.
- Required tests: independent source retrieval/visual check and citation/link audit; record failed retrievals.
- Priority P1; complexity S; risks: stale official materials, unavailable sources. Status: PROPOSED. Suggested implementer: research analyst; review: domain reviewer. Actual assignee: none.

## FOUND-002 — Application and contract foundation

Reconciliation acceptance (HI-04/CR-02): starts only after G0, whose owner disposition reviews the completed FOUND-005/006 evidence. FOUND-002's accepted deliverables establish G1; G1 is not a prerequisite of FOUND-002. One runtime schema source; CI regenerates committed OpenAPI/client artifacts and fails on content drift; producer/consumer positive and negative fixtures are required. A changed response or stale generated file must fail; an optional field passes only after coordinated regeneration and strict-consumer checks. Pin the documented PRNG vectors plus complete search/canonicalization fixtures before parallel consumers.

- Objective/scope: initialize approved stack, schemas/client artifacts, CI and development run instructions; freeze renderer/PRNG/canonicalization behavior with fixtures.
- Prerequisites: G0 and owner implementation assignment. Files: package manifests, src/contracts/**, src/app skeleton, tests/contract/**, CI config, approved development docs; no bank/attempt features yet.
- Deliverables: pinned supported versions, runtime validators/OpenAPI/student-safe types, reproducible local/CI entry points. Acceptance: a fresh checkout installs/builds from lockfile; question/blueprint/API examples validate; private types cannot import into student bundle; all commands documented.
- Required tests: typecheck/build, strict schema fixtures, unknown-field/type rejection, generated contract drift checks. Required version/license/advisory review recorded.
- Priority P0; complexity M; risks: library/version compatibility, over-scaffolding. Status: IN_PROGRESS — Slices 1–5 completed on 2026-10-17; G1 is not established. Slice 1 implemented shared `question/1` runtime contracts; Slice 2 implemented strict documented API errors and verified the `INSUFFICIENT_ELIGIBLE_INVENTORY`/`INSUFFICIENT_UNSEEN_INVENTORY` taxonomy while keeping `SEARCH_EXHAUSTED` distinct. Slice 3 adds a pinned Zod 4-compatible OpenAPI 3.1 components-only artifact generated from explicit public DTO allowlists, deterministic generation, non-mutating artifact-drift validation, and synthetic artifact/security tests. Slice 4A adds strict generic/MVP blueprint validation plus student-safe creation, attempt-view and slot DTOs, including the immutable `startBefore` representation. Slice 4B reuses AnswerAck and adds strict answer-submission, ordinary practice ResultView and caller-owned attempt-history DTOs; the documented released key/explanation payload remains separate and excluded from OpenAPI. Slice 5 adds internal-only strict `generation/1` provider, batch/job status, validation evidence, `factory-package/1` draft export and Bank draft-receipt contracts with deterministic synthetic producer/consumer fixtures. No endpoints, client SDK, database transaction, provider call or lifecycle enforcement is invented. Remaining scope includes broader schema/API artifacts, client generation after endpoint contracts exist, CI and development-run documentation. Suggested implementer: full-stack foundation engineer; review: independent architecture/security reviewer. Actual assignee: Codex, TypeScript Contract Engineer.

## DATA-001 — Relational integrity foundation

Phase 02.75 acceptance: stable question history PK(user,question), allocation revision row, canonical singleton/merged equivalence groups, bank eligibility revision, offering windows, personal owner/one-attempt constraints and fixed-mode compatibility. Two-connection strict allocations cannot overlap; corrected versions stay excluded. Factory migration files are separately reserved by FACTORY-001.

Reconciliation acceptance (CR-01/HI-01/MD-02/04/05): implement owner-approved global H1 uniqueness, H2 admission-only bounds, H3 one-domain MVP form support and the immutable 600-second start-deadline field, alongside cancellation constraints, blueprint taxonomy FK, lifecycle-pinned idempotency records and shared save buckets. Do not choose the effect of ordinary availability edits on already CREATED attempts; that product decision blocks affected admission/start behavior. Tests require two-connection create races, stale-active cleanup, cancellation/start ordering, immutable deadline replay, cleanup after pending grading and transaction rollback on invalid sealed aggregates. These are requirements, not tests executed in Phase 02.5.

- Objective/scope: implement MVP tables, constraints, immutable triggers, reviewed migrations and test fixtures; include per-user history/equivalence/offerings; coordinate factory migrations with FACTORY-001 rather than duplicate ownership.
- Prerequisites: FOUND-002, G1. Files: db/**, src/modules database adapters, tests/integration/database/**.
- Deliverables: schema/migrations and seeded synthetic fixtures. Acceptance: cross-form answers, mismatched version links, immutable edits and duplicate score/job writes rejected; schema upgrade preserves history.
- Required tests: fresh migration and populated upgrade, FK/check/unique failures, rollback compatibility, real PostgreSQL concurrency/lock ordering and transaction rollback.
- Priority P0; complexity L; risks: JSON/relational drift, irreversible migrations. Status: BLOCKED (FOUND-002). Suggested implementer: database engineer; review: backend/data-integrity reviewer. Actual assignee: none.

## AUTH-001 — Identity and authorization

Phase 02.75 acceptance: factory service cannot read student histories/attempts or approve/publish; website has no model credentials. Personal form/manifest ownership must fail closed; test factory/web/job-kind credential boundaries.

Reconciliation acceptance (HI-05/MD-05): role-test diagnostic projections and new BANK_MANAGER diagnostics read; EXAM_MANAGER alone cannot enumerate manifest/candidate pools. Own-object authorization occurs before save-bucket creation; unauthorized IDs create no buckets. Coordinate shared throttling contract with EXAM-001 and DB schema from DATA-001.

- Objective/scope: OIDC/session adapter, role policies and own-object checks; local synthetic-data stub only if explicitly approved.
- Development prerequisites: G0, FOUND-002, DATA-001 and explicit owner-scoped approval for a local synthetic-data stub. G2 and production provider configuration are not prerequisites for this authorized local development path. Files: src/modules/identity/**, auth HTTP adapters, tests/security/auth/**.
- Production configuration prerequisites: G2, the completed ADR-006 data-flow/provider review, and separate owner authorization for real-user deployment. These do not authorize production deployment merely because local development acceptance exists.
- Deliverables: secure sessions, CSRF/origin checks, roles, staff MFA integration and negative fixtures. Development acceptance: users cannot inspect others' attempts; authors cannot self-approve; disabled sessions/roles enforced server-side. Production acceptance additionally requires the approved production issuer, audience, redirects, data flow and deployment controls.
- Lifecycle interpretation: G2 consumes the accepted local AUTH-001 security/authorization evidence. The post-G2 production-configuration sub-acceptance is not a prerequisite to complete AUTH-001 in the task/gate graph and cannot create a G2 cycle.
- Required tests: cookie/session invalidation, issuer/audience/redirect validation, CSRF, role escalation, BOLA and object-property access. Stub must be impossible to enable in production.
- Priority P0; complexity M; risks: provider/data policy unknown. Status: BLOCKED (foundation and identity decision). Suggested implementer: backend/security engineer; review: independent security reviewer. Actual assignee: none.

## DATA-002 — Lawful starter dataset

Phase 02.75 acceptance: demonstrate two disjoint mini-profile attempts for one student and reuse across two students; report actual quota/bundle-limited capacity, not 30/10 as guaranteed capacity.

- Objective/scope: author the 30-question starter inventory and taxonomy described in MVP; prepare independent reviewer evidence.
- Prerequisites: ADR-002/003 approved, named human author/reviewer; import validation depends on BANK-001. Files: data/original/**, data/taxonomy/**, provenance manifests; do not copy protected research examples.
- Deliverables: source/rights attestations, three interaction types, shared reading bundle, keys/explanations and review records. Acceptance: correct per-section count, lawful assets, no unresolved ambiguity/duplicate flags, two-person content review.
- Required tests: schema/import dry run, deterministic answer checks where applicable, manual alternate-answer and Vietnamese clarity review, rights completeness and inventory feasibility.
- Priority P0; complexity L; risks: SME availability, unrecognized adaptation rights. Status: BLOCKED (scope approval and reviewers). Suggested implementer: content engineer + human author; review: independent subject expert. Actual assignee: none.

## BANK-001 — Import, versioning and approval commands

Phase 02.75 acceptance: singleton/confirmed equivalence adjudication before publication, current-group joins preserve prior history after merge; late-equivalence incident recorded without rewriting snapshots. Canonical factory imports verify hash/receipt atomically, reject changed content under same key and never inherit APPROVED from a package.

- Objective/scope: source/rights registration, validated question/stimulus/bundle import, versions, workflow and exact/flagged duplicate checks.
- Prerequisites: DATA-001, AUTH-001 and G1 frozen contracts. Files: src/modules/sources/**, src/modules/bank/**, staff bank HTTP adapters, tests/integration/bank/**.
- Deliverables: import dry-run/report, author/review commands, approval/quarantine audit and eligibility pointer. Acceptance: edits create versions; no approval carryover/self-approval; rights/validator failures block publication; holds immediately affect delivery checks.
- Required tests: workflow transitions, duplicate fingerprints, stale revision/approval hash, source revocation, concurrent approve/withdraw and asset sanitization.
- Priority P0; complexity L; risks: approval bypass, unsafe content, rights race. Status: BLOCKED (DATA-001/AUTH-001). Suggested implementer: bank/backend engineer; review: domain/security reviewer. Actual assignee: none.

## ASSEMBLY-001 — Reproducible starter exam assembly

Phase 02.75 acceptance: atomic personal form+attempt+history+receipt; allocation user lock then shared bank guard, revision recheck and bounded replans; review/fixed assignments also write history. Tests C–H include same-user different-blueprint races, corrected versions, equivalence merges, rollback, shortage versus unknown search exhaustion, TTL abandonment and explicit alternatives.

Reconciliation acceptance (CR-02/HI-02/05/MD-01/02/03): test all three unsigned PRNG vectors and shuffle order; enforce the approved MVP one-domain profiles (MATH 4, READING 2, SCIENCE 4), reject wrong-dimension values, foreign taxonomy and repeated MVP sections/quotas, while preserving generic future multi-section storage. Inject sealing mismatch after valid blueprint validation and assert rollback. Global usage is analytics only; withdrawal never resets assignments and replay never assigns twice. Role diagnostics tests exclude private candidate pools from EXAM_MANAGER errors.

- Objective/scope: blueprint validation, manifest capture, bounded selection, personalized snapshot sealing and assignment history.
- Prerequisites: BANK-001, DATA-002 accepted inventory, G1. Files: src/modules/assembly/**, assembly HTTP adapters, tests/assembly/**.
- Deliverables: mini-profile assembler with diagnostics and replay. Acceptance: every hard constraint holds; correct bundle ordering; no duplicate identities; stored manifest+seed replays; same-user concurrent allocations disjoint; different users may reuse stock; no partial forms.
- Required tests: golden seed replay, invariant/property fixtures, feasible/infeasible/search-exhausted distinctions, revocation/approval race and idempotent sealing.
- Priority P0; complexity M; risks: bounded search false infeasibility claims, moving pool. Status: BLOCKED (bank/inventory). Suggested implementer: algorithm/backend engineer; review: independent algorithm/data reviewer. Actual assignee: none.

## EXAM-001 — Attempt start, delivery and persisted answers

Phase 02.75 acceptance: owner-approved H1 applies globally across all modes, with at most one active CREATED/IN_PROGRESS attempt per student; personal forms have one owner/attempt. No reselection at start; all assigned slots persist in history after cancellation/expiry/invalidation. Test USER_CREATE throttling independently of saves/submission and retry after receipt expiry without repetition.

Reconciliation acceptance (CR-01/HI-01/03/MD-04/05): implement the scoped H1/H2/H3 approvals and mandatory 600-second start TTL: one global active attempt, admission-only `[available_from, available_until)`, one independently timed/scored domain test, and immutable `start_before_at = min(created_at + 600 seconds, admission_until_at_creation)`. Test distinct-key concurrent create, same-key replay, closed-attempt retake, not-open/exact-close admission, first start just before/equal to the stored deadline, late admitted completion, CREATED lazy cancellation, and long-lived receipt replay. The recorded non-retroactive ordinary admission-schedule decision preserves the committed deadline for an already CREATED attempt; independently enforce withdrawal, rights and security guards, and verify both ordinary shortening and extension cases. Exercise both rate buckets across two server instances; 429 has Retry-After, no save/receipt mutation, preserves client pending edits, and does not throttle submit via the save bucket.

- Objective/scope: create/start attempt, fixed section clocks, safe delivery, revisioned autosave/resume.
- Prerequisites: ASSEMBLY-001, AUTH-001. Files: src/modules/attempts/** (start/read/save), student HTTP adapters, tests/integration/attempts/**.
- Deliverables: candidate-safe endpoints with acknowledged save revisions. Acceptance: no timer reset, no future/previous section content, own-form slot integrity, safe cross-tab conflict response.
- Required tests: boundary timestamps using controlled server clock, BOLA, serialization leakage, lost acknowledgement replay, stale revision and restart persistence.
- Priority P0; complexity L; risks: clock/caching leaks and overwrite races. Status: BLOCKED (assembly). Suggested implementer: examination backend engineer; review: security/state-machine reviewer. Actual assignee: none.

## EXAM-002 — Submission, expiry and recovery

Reconciliation acceptance (HI-01/MD-04): existing sweep also cancels unavailable CREATED attempts; test sweep outage/lazy access, cancellation/start race without deadlock, committed cancellation despite HTTP 410, and idempotent repeated cancellation. Failed grading retains attempt-linked receipts until finalization plus minimum replay period; cancellation carries reason and no fabricated start/deadline.

- Objective/scope: closure transaction, durable grade jobs, lease/retry recovery, incident invalidation and expiry sweep.
- Prerequisites: EXAM-001. Files: src/modules/attempts/** (closure/holds), src/modules/jobs/**, worker entry, tests/integration/recovery/**.
- Coordination: agree the score job contract with SCORE-001 before parallel work.
- Deliverables: single closure semantics and recoverable queue. Acceptance: no late writes, duplicate submits produce one job, crash cannot lose acknowledged submissions, held content inaccessible immediately.
- Required tests: simultaneous save/submit/expire, kill/reclaim worker lease, duplicate delivery/fencing, outage near deadline, revoke during active/released attempt.
- Priority P0; complexity L; risks: lost work, race windows. Status: BLOCKED (EXAM-001). Suggested implementer: backend/reliability engineer; review: independent concurrency reviewer. Actual assignee: none.

## SCORE-001 — Practice scoring and released results

Reconciliation acceptance (§7.10): integer quotient/remainder rounding must produce 1/3="33.33", 1/32="3.13", 0/n="0.00", n/n="100.00"; no floating-point rounding dependence. Existing latest-answer storage is sufficient; no answer-revision history feature is added.

- Objective/scope: pure binary scoring, immutable score records, atomic release and owner history.
- Prerequisites: EXAM-001 plus frozen closure/job contract. Files: src/modules/scoring/**, result/history HTTP adapters, tests/scoring/**.
- Integration acceptance: requires EXAM-002.
- Deliverables: practice-binary-v1 and after-grade-v1 with explicit unofficial labeling. Acceptance: golden scores for all types, exact rounding, missing answers zero, deterministic idempotent grading, no early keys/explanations.
- Required tests: set-order property tests, incomplete true/false, empty/all-correct fixtures, 1/3 rounding, repeat job, immutable historical score, pre/post-release leakage checks.
- Priority P0; complexity M; risks: accidental partial credit or official score implications. Status: BLOCKED (EXAM-001). Suggested implementer: scoring/backend engineer; review: independent mathematical/domain reviewer. Actual assignee: none.

## WEB-001 — Student vertical slice

Phase 02.75 acceptance: default personal NEW_ONLY catalog/create flow; display mode, start TTL, explicit shortage and separately confirmed review/fixed alternatives. Browser test two attempts with no repeats, exhausted inventory, no automatic fallback or AI call.

Reconciliation acceptance (LO-01/03, HI-01/03, MD-05): show the independent domain-test countdown, persisted 600-second start deadline while CREATED, accessible <=60-second warning once per test, locked/future labels and ICT (UTC+7) absolute times. Browser tests cover resume inside warning window, denied late saves, 429 retry without false saved state, CANCELLED reason, existing-attempt conflict recovery and admission-window disclosure before start. The UI must not imply a rule for ordinary schedule edits after creation until the owner resolves it. Changing browser timezone must not change countdown or authoritative deadlines.

- Objective/scope: login/catalog, attempt renderer, clock, autosave/conflict/error UX, submit/result/history.
- Prerequisites: frozen contracts, EXAM-001 for integration; EXAM-002 and SCORE-001 for completion. Files: src/app student routes, student components/styles, tests/e2e/student/**.
- Deliverables: accessible Vietnamese practice flow for three types; no duplicated business clock/scorer. Acceptance: student completes the starter exam, resumes after disconnect, sees save failures, can submit persisted answers knowingly and read results.
- Required tests: browser full journey, keyboard-only flow, math/table readability, multi-tab conflict, offline/reconnect and expiry; inspect network/hydration for answer leaks.
- Priority P0; complexity M; risks: optimistic UI concealing failed save, inaccessible interactions. Status: BLOCKED (contracts/backend). Suggested implementer: frontend engineer (e.g. Antigravity if assigned); review: independent browser/UX reviewer. Actual assignee: none.

## WEB-002 — Minimal staff review interface

Reconciliation acceptance (HI-05): render only server-authorized section deficits for EXAM_MANAGER; richer diagnostic UI requires BANK_MANAGER endpoint permission. Test direct unauthorized endpoint access, not only hidden UI elements.

- Objective/scope: browse drafts, show safe preview/private reviewer evidence, review/approve/quarantine and assembly diagnostics.
- Prerequisites: BANK-001, ASSEMBLY-001, AUTH-001; contract approval before separate frontend implementation. Files: src/app staff routes, staff components, tests/e2e/staff/**.
- Deliverables: functional review queue with version/hash and rights evidence. Acceptance: staff sees exact reviewed version; no silent revision approval; denied roles fail via API too.
- Required tests: author→independent reviewer→assembly journey, stale review, quarantine/withdrawal, keyboard navigation and XSS fixtures.
- Priority P1; complexity M; risks: privileged data leaking to shared client bundle. Status: BLOCKED (bank/auth). Suggested implementer: frontend engineer; review: independent security/content workflow reviewer. Actual assignee: none.

## TEST-001 — Integrated pilot release evidence

- Objective/scope: verify critical invariants across modules and regressions; do not substitute for per-task tests.
- Prerequisites: WEB-001/002, EXAM-002, SCORE-001; operational checks coordinate OPS-001. Files: tests/e2e/**, tests/security/**, tests/load/**, docs/quality/release evidence (future task-owned file).
- Deliverables: reproducible integration matrix and defects with severity. Acceptance: all critical invariants covered and passing on target versions; unresolved launch blockers explicit; independent review recorded.
- Required tests: full [test strategy](../quality/TEST_STRATEGY.md) MVP matrix, state-machine/property/concurrency tests, browser accessibility/security and load at owner-approved traffic.
- Priority P0 before pilot; complexity L; risks: mock-only confidence, insufficient load assumptions. Status: BLOCKED (integrated implementation). Suggested implementer: QA/integration engineer; review: independent security/architecture reviewer. Actual assignee: none.

## OPS-001 — Deployment and data-policy readiness

Phase 02.75 acceptance: test a bounded 500-draft batch beside exam traffic, resource limits/pools/job allowlists, factory killed/provider unavailable and month-long simulated outage. Obtain measured latency/resource acceptance envelope from owner; shared DB failure remains a common risk. Compact active-account history retention is separately approved.

Reconciliation acceptance (MD-04/05/LO-02): review replay retention floors together with lawful deletion policy; load-test the proposed save-bucket defaults and DB contention across replicas, tune with measured evidence. Document that latest answers/backups are not a full edit-history forensic service. No history reset or global inventory consumption is allowed as an operational shortcut.

- Objective/scope: approved hosting/identity/media/retention, backups, observability, migrations and cost/capacity limits.
- Prerequisites: G2, working slice, owner traffic/budget/age/jurisdiction inputs. Files: infra/**, deployment CI, operational docs and approved decision updates.
- Deliverables: staging deployment, restore/incident runbooks, data-flow/retention schedule and measured cost estimate. Acceptance: secrets segregated, backup restores full referenced content, migration rollback safe, operational budgets/SLOs owner-approved; public deployment requires separate authorized release task.
- Required tests: restore drill, migration rehearsal, killed web/worker, queue recovery, latency/burst load, secret/log scan, identity stub disabled, restricted asset access.
- Priority P0 before public use; complexity L; risks: privacy, cost, unspecified capacity. Status: BLOCKED (G2 and implementation). Suggested implementer: platform engineer; review: security/privacy owner. Actual assignee: none.

## CONTENT-001 — Full reference profile and richer interactions

- Objective/scope: add numeric/matching types and full public-reference profile only with sufficient lawful inventory.
- Prerequisites: FOUND-003, usable MVP, new schema/policy ADR and explicit owner scope approval. Files: question/contracts/renderers/scorers and data profiles; coordinate shared contract ownership.
- Deliverables: revised versioned contracts, independent scoring fixtures, verified profile and inventory coverage report. Acceptance: no silent fallback when stock short; old snapshots still render/score; published similarity claims match verified evidence.
- Required tests: numeric normalization/tolerance adversarial cases, keyboard matching, profile constraints, backward compatibility and full-length timing/browser journey.
- Priority P2; complexity L; risks: content volume, unsupported official assumptions. Status: DRAFT. Suggested implementer: domain/full-stack engineer; review: SME plus independent contract reviewer. Actual assignee: none.

## AI-001 — Provider-neutral draft generation

Phase 02.75 acceptance: standalone entry point runs with fixture contracts/fake provider without web/OIDC/bank deployment; exports versioned draft packages with reproducible source/model/prompt evidence. FACTORY-001 owns production schedule/batch tables; BANK-001 owns canonical import receipts. No duplicate generation_jobs queue.

- Objective/scope: durable budgeted generation jobs, provider adapters, run provenance and validated draft persistence.
- Prerequisites: FOUND-002 shared contracts and G1 for the standalone fixture/fake-provider entry point; lawful isolated fixtures. Live provider calls additionally require ADR-FACTORY approval, approved provider data handling, and provider/data-rights authorization. No website or canonical-bank runtime prerequisite. Files: src/modules/generation/**, generation job adapters/migrations, tests/ai/contracts/**.
- Deliverables: deterministic fake/template adapter plus two provider adapters for authorized comparative evaluation. Acceptance: no publication permission, strict schema rejection, bounded retry/cost and provider switch without question schema changes.
- Required tests: fake provider refusal/timeout/invalid JSON/injection, duplicate worker/cancellation, budget limits, persisted provenance and rights revocation before dispatch.
- Priority P0 for early research; complexity M; risks: vendor drift, billed retries, leakage. Status: BLOCKED (G1/shared contracts; live providers additionally require authorization). Suggested implementer: AI infrastructure engineer; review: independent backend/security reviewer. Actual assignee: none.

## AI-002 — Independent validation and evaluation

Phase 02.75 acceptance: work starts against isolated output/held-out labels without web dependency; compare at least two authorized model adapters with cost, acceptance and uncertainty. Automated checks remain distinct from heuristic judgments and human publication.

- Objective/scope: blinded answer verification, quality rubric, dedup evaluation and held-out regression harness.
- Prerequisites: AI-001, human-labeled rights-cleared evaluation set. Files: tests/ai/evals/**, data/evaluation/**, generation validators and evaluation reports.
- Deliverables: frozen evaluation manifest, metrics with uncertainty and reviewer adjudication. Acceptance: known critical failure regressions blocked; heuristic thresholds empirically justified; no automatic approval; upgrade procedure reproducible.
- Required tests: correctness, ambiguity, explanation, relevance, exact/near duplicates, adversarial prompt injection, leakage and provider/prompt upgrade comparison; record paid calls if executed.
- Priority P0 for early research; complexity L; risks: contaminated evaluation set, correlated AI errors. Status: BLOCKED (AI-001 and labels). Suggested implementer: evaluation engineer; review: independent SMEs/security reviewer. Actual assignee: none.

## RESEARCH-001 — Calibration/optimization feasibility

- Objective/scope: investigate CTT/IRT or solver adoption only after explicit assignment and real limitations/data; no production score migration.
- Prerequisites: stable core, approved research/data consent scope, adequate response sample defined with specialist. Files: research reports and isolated experiments assigned later; no core edits by default.
- Deliverables: assumptions, population limitations, simulation/held-out evaluation and go/no-go ADR proposal. Acceptance: no official-score equivalence claim; adoption evidence compared to simpler baseline.
- Required tests: known-parameter simulations for calibration or feasible/infeasible solver benchmarks; independent statistical review and exact library/license audit.
- Priority P3; complexity L; risks: insufficient sample, unfair estimates, overengineering. Status: DRAFT. Suggested implementer: psychometric/optimization researcher; review: independent specialist. Actual assignee: none.

## RESEARCH-002 — Early factory feasibility and dataset evaluation plan

- Objective/scope: Track A source verification, lawful dataset/provenance, taxonomy coverage, held-out rubric and model comparison plan; not official score reconstruction.
- Prerequisites: owner research assignment; FOUND-003 coordinates official evidence; live calls require ADR-FACTORY and ADR-OPS approval, provider/data-rights authorization, and budget approval; document-only planning does not.
- Files/modules: docs/research task-owned reports, data/evaluation manifests once implementation authorized; original research read-only.
- Deliverables/acceptance: source rights evidence, gaps by section/skill, independent human labeling plan, reproducible two-model comparison protocol and explicit unknowns; no unsupported benchmark claims.
- Required tests: source/citation audit, provenance completeness and dataset leakage/overlap audit; live evaluation only after authorization.
- Priority P0; complexity M; risks: licensing, weak labels, correlated model errors.
- Status: PROPOSED, unassigned. Suggested implementer: research/evaluation engineer; independent reviewer: domain expert.

## FACTORY-001 — Scheduled bounded batch production

- Objective/scope: manual/weekly planning, shortage priorities, budget/review caps, resumable batch execution and reports under QUESTION_FACTORY_SPEC.
- Prerequisites: AI-001 and G1 shared contracts; owner schedule/budget/review capacity. A standalone fixture DB and provider-free planning are allowed without web. Live provider dispatch additionally requires ADR-FACTORY and ADR-OPS approval, provider/data-rights authorization, and the approved operating inputs. Shared jobs contract from FOUND-002.
- Files/modules: tools/question-factory/**, generation planner/executor, explicitly reserved factory config/schedule/batch/item/run migrations, tests/factory/**. Coordinate migration ownership with DATA-001/EXAM-002. BANK-001 exclusively owns canonical bank/import receipt persistence.
- Deliverables/acceptance: one scheduled period identity, frozen plan, bounded cost reservation, per-unit checkpoints, independent credentials/queue kinds, export/re-import stable IDs, acceptance/cost reports; COMPLETED batch never implies approved questions.
- Required tests: crash halfway/resume, duplicate schedule/manual keys, stale leases, unknown provider billing, cap exhaustion, partial bundle rollback, provider switch, blocked approval credentials and no web/LLM coupling.
- Priority P0 for Track A; complexity L; risks: runaway cost, DB contention, duplicated drafts.
- Status: BLOCKED (AI-001/G1/operating inputs; live dispatch additionally requires authorization). Suggested implementer: AI/backend engineer; independent reviewer: reliability/security engineer. Actual assignee: none.

## INT-001 — Approved factory output to personalized examination

- Objective/scope: integrate early Track A and Track B through canonical draft import and controlled publication, without coupling runtimes.
- Prerequisites: G3 integration readiness, reached from the completed component milestones and INT-002 controlled-import evidence; FACTORY-001, AI-002 evaluated fixtures, BANK-001, ASSEMBLY-001, EXAM-002, SCORE-001 and independent human reviewer; UI journey additionally WEB-001. G3 does not gate any of those component milestones.
- Files/modules: tests/integration/factory-bank-exam/**, task-owned integration evidence; producer/consumer module fixes assigned to their owners, shared contracts require coordinated approval.
- Deliverables/acceptance: import one versioned batch twice without duplicate bank identities, reject altered same-key input, approve only reviewed subset, assemble/complete/score a personal exam from it with factory stopped; remaining drafts ineligible.
- Required tests: A–J matrix in TEST_STRATEGY, including 500-draft workload under approved envelope, month-long provider-outage simulation, same-user/cross-user allocation, corrected version, publication during attempt and halfway recovery.
- Priority P0 for research integration milestone, not a prerequisite for manually seeded web MVP; complexity M; risks: adapter drift, accidental publication, resource sharing.
- Status: BLOCKED (both tracks and approval). Suggested implementer: integration engineer; independent reviewer: QA/security plus domain reviewer. Actual assignee: none.

## Execution refinement — proposed agent-sized delivery cards

The stable IDs above, including their status and recorded historical evidence, are preserved. They remain the outcome-level milestones and their listed acceptance remains required. The cards below are **PROPOSED** execution units: they do not authorize implementation, alter a contract, or replace a milestone. An accountable implementer may claim exactly one card only after its stated gate, owner authorization, and prerequisite cards have recorded acceptance evidence. A milestone may be completed only when all of its applicable child cards and its existing acceptance are complete.

`LOW`, `MEDIUM`, and `HIGH` are suggested capability tiers, not assignments or approval. `LOW` is limited to isolated documentation, fixtures, configuration, or simple tests; `MEDIUM` covers bounded typed modules, APIs, and components; `HIGH` is reserved for transactions, concurrency, security, scoring, or cross-contract change. “Files” are future exclusive ownership reservations; one card must not edit another card's files without an explicit handoff.

### Shared gates, tracks, and unresolved planning blockers

| Lifecycle gate / track | Dependency ordering | Verifiable exit evidence or blocker |
|---|---|---|
| G0 — architecture readiness | FOUND-006 → FOUND-004 → G0. FOUND-003 source verification and RESEARCH-002 research planning may be assigned early. | Scoped human-owner implementation authorization is recorded in [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md) on 2026-10-17. Accountable task ownership and all unresolved ADR/provider/budget/rights/retention/reviewer-capacity limits remain explicit; no downstream gate is passed by this record. |
| G1 — shared contract readiness | G0 → FOUND-002 → G1. FOUND-007 is a completion contribution to FOUND-002, not a prerequisite for starting its scoped foundation work. | Accepted FOUND-002 evidence freezes the versioned canonical schema, provenance/rights/equivalence/workflow terms, `factory-package/1` semantics, draft-only import boundary, jobs/job-kind and safe DTO/API fixtures. G1 is established by FOUND-002; it never gates FOUND-002 itself. |
| G2 — controlled publication readiness | G1, DATA-001 and AUTH-001 permit BANK-001 ingestion and BANK-002 review/publication work. Verified BANK-001 ingestion **and** BANK-002 publication evidence establish G2. | Exact-version rights, immutable-version, validation, review/equivalence and human-only approval evidence proves that an eligible-bank publication is separate from draft creation. Factory credentials cannot approve or publish. G2 does not gate either producer. |
| G3 — integration readiness | FACTORY-001 (including FACTORY-002/003), AI-002, G2, the technical-MVP assembly/attempt/scoring evidence, and INT-002 controlled-import proof → G3 → INT-001. | INT-002 demonstrates idempotent same-package receipt, changed-identity rejection and all-or-none bundle import before G3 passes. A human-approved subset becomes eligible bank stock without changing factory, assembly or exam contracts. G3 does not gate any of its producers. |
| Track A — AI Question Factory Research | RESEARCH-002 → AI-003; G1 → AI-001 → AI-002 and FACTORY-001 (FACTORY-002 → FACTORY-003) → INT-002 controlled-import proof → G3 integration readiness → INT-001 | Never depends on a website runtime. Live calls require ADR-FACTORY and ADR-OPS approval plus budget, provider/data-rights, retention and review-capacity authorization. |
| Track B — TSA Practice Web Engineering | DATA-002/003 → DATA-001 + AUTH-001 → BANK-001/002 → ASSEMBLY-001/002 → EXAM-001/002 + SCORE-001 → WEB-003/004 | Never calls or waits for an LLM. Only G2-published content can enter an assembly; shortage never triggers generation or silent reuse. |

### Parent milestones and execution-card completion

The retained cards are outcome-level milestones; the later cards are bounded execution units. A child may start once its own stated prerequisites and authorization are satisfied. A child never waits for the parent milestone to be marked complete when that child supplies the parent's completion evidence. Conversely, a parent is not complete merely because a child begins: it requires the listed child acceptances **and** its own original acceptance criteria.

| Parent milestone | Completion-contributing execution cards | Start/completion boundary that prevents a cycle |
|---|---|---|
| FOUND-002 | FOUND-007 | FOUND-002 starts after G0; FOUND-007's accepted taxonomy reconciliation is required before FOUND-002 freezes the G1 contract. |
| DATA-002 | DATA-003 | DATA-003 prepares auditable manifest evidence; DATA-002 still requires its original authored-inventory and review acceptance. |
| AI-002 | AI-003 | AI-003 supplies the held-out partition/leakage evidence; it may run under its direct research prerequisites before AI-002 completes. |
| FACTORY-001 | FACTORY-002, FACTORY-003 | FACTORY-002/003 implement the planner/executor evidence; FACTORY-001 is not a prerequisite of either child. |
| BANK-001 | BANK-002 | BANK-001's accepted ingestion evidence may be handed to BANK-002 before the BANK-001 outcome milestone is complete. BANK-002's accepted independent review/publication evidence then completes the parent outcome and jointly establishes G2. |
| ASSEMBLY-001 | ASSEMBLY-002 | ASSEMBLY-002 may consume the accepted manifest-candidate interface, not full parent completion; its transaction acceptance completes the milestone. |
| WEB-001 | WEB-003, WEB-004 | Each child follows its direct backend/contract prerequisites; their accepted catalog and delivery evidence, plus WEB-001's original acceptance, completes the vertical slice. |
| TEST-001 | TEST-002 | TEST-002 supplies independent critical-invariant evidence after G3; TEST-001 retains its broader pilot matrix and does not block TEST-002. |
| INT-001 | INT-002 | INT-002 is the narrow bridge proof before G3. It contributes the evidence that permits G3; only then can INT-001 begin its full integration outcome. |

The phrases “accepted ingestion evidence” and “accepted manifest-candidate interface” are bounded internal deliverables, not parent-milestone completion states. They remain prose/acceptance requirements rather than additional lifecycle nodes; this distinction is included in the dependency-validation exclusions below.

| Unresolved item | Must be resolved by | Blocks |
|---|---|---|
| `QUESTION_REUSE_POLICY` names `INVENTORY_SHORTAGE`, while the API names `INSUFFICIENT_UNSEEN_INVENTORY` / `INSUFFICIENT_ELIGIBLE_INVENTORY`; the generic `ErrorResponse.details` does not model the normative `StudentShortage` alternatives/blueprint fields. | FOUND-007 records an owner-approved, single error taxonomy and compatible response projection before FOUND-002 freezes schemas. | All `POST /attempts` consumers: ASSEMBLY-001/002, EXAM-001, WEB-003, contract fixtures. |
| ADR-001–004, 007 and 008 mechanisms remain PROPOSED; ADR-004 remains PROPOSED as a whole, with H1 global active-attempt, H2 admission-only, H3 independent one-domain MVP tests, the 600-second start TTL and non-retroactive ordinary admission-schedule edits scoped APPROVED. ADR-006 retention/identity boundaries and other ADR scope remain undecided. The G0 authorization does not resolve these technical decisions. | Human owner through FOUND-004; contract changes need ADR impact analysis. | Affected implementation semantics and any work that would choose an unresolved contract; downstream gates remain subject to their listed acceptance evidence. |
| Rights-cleared starter items, independent Vietnamese content reviewers, lawful held-out labels, provider/input permissions, budget/schedule, thresholds and reviewer capacity are unverified. | Human owner plus FOUND-003, DATA-002/003, RESEARCH-002/AI-003. | G2 publication, live factory dispatch, AI evaluation claims, pilot. |

### Normalized assignment metadata for retained milestone cards

The existing cards supply objective, prerequisites, file scope, deliverables, measurable acceptance and verification. This table adds the mandatory gate/track, cost-aware tier and risk classification without changing their statuses or evidence.

| Task IDs | Gate / track | Suggested tier | Risk |
|---|---|---:|---|
| FOUND-003, RESEARCH-002 | G0 / Track A planning | LOW / MEDIUM | Medium — evidence, rights and label quality |
| FOUND-002 | G1 / shared | MEDIUM | High — contract drift across all consumers |
| DATA-001, AUTH-001 | G1–G2 / Track B | HIGH | High — integrity, authorization and migrations |
| DATA-002 | G0–G2 / Track B | MEDIUM | High — correctness, rights and human review |
| BANK-001 | G2 / Track B and bridge | HIGH | High — publication, provenance and withdrawal |
| ASSEMBLY-001 | G2 / Track B | HIGH | High — allocation transaction and no-repeat |
| EXAM-001, EXAM-002 | G2 / Track B | HIGH | High — timing, closure and recovery |
| SCORE-001 | G2 / Track B | HIGH | High — immutable scoring/release correctness |
| WEB-001, WEB-002 | G2–G3 / Track B | MEDIUM | Medium — safe DTO and accessible state UX |
| TEST-001 | G3 / shared | HIGH | High — independent cross-module evidence |
| OPS-001 | G3 / shared | HIGH | High — privacy, recovery and capacity |
| AI-001 | G1 / Track A | MEDIUM | High — provider isolation, costs and untrusted output |
| AI-002 | G1 / Track A evaluation; supplies G3 evidence | MEDIUM | High — correctness and evaluation validity |
| FACTORY-001 | G1 / Track A; supplies G3 evidence | HIGH | High — durable budgets, recovery and shared resources |
| INT-001 | G3 evidence / bridge | HIGH | High — publication boundary and integration drift |
| CONTENT-001, RESEARCH-001 | later / separate | MEDIUM / HIGH | Medium / High — scope and research validity |

### New proposed cards

## FOUND-007 — Resolve attempt shortage and error-response contract consistency

- Objective: reconcile the known shortage-code naming and `ErrorResponse`/`StudentShortage` shape conflict before any runtime schema or consumer is implemented; record the exact owner decision or remain blocked.
- Prerequisites: G0 owner disposition for ADR-003/007/004; read API contracts and reuse policy. No application work.
- Input specifications: `API_CONTRACTS.md` ErrorResponse, errors and creation-contract sections; `QUESTION_REUSE_POLICY.md` shortage semantics; `EXAM_ASSEMBLY_SPEC.md` diagnostics; ADR-003/004/007.
- Files/modules: `docs/architecture/API_CONTRACTS.md` only; this backlog card is the task definition.
- Expected deliverables: one consistent public error-code taxonomy, typed safe shortage details, HTTP status mapping, idempotency behavior for no-allocation retries, and a conflict/disposition note if the owner has not selected a policy.
- Acceptance criteria: every shortage/reference uses the same codes; generic and specialized error schemas are structurally compatible; `SEARCH_EXHAUSTED`, `CONCURRENT_MODIFICATION`, validation and shortage have distinct status/meaning; no details expose question, group, history, key or candidate identifiers.
- Required verification: static cross-document reference search; positive/negative JSON fixture design for all listed errors; owner decision evidence or an explicit BLOCKED record. Runtime tests are NOT RUN in this documentation task.
- Suggested agent capability: MEDIUM (Terra). Risk: High — contract drift/security disclosure. Status: PROPOSED, blocked on G0 owner decision.

## DATA-003 — Starter dataset manifest and publication preflight

- Objective: make the DATA-002 starter inventory independently reviewable without combining authorship, import, or approval implementation.
- Prerequisites: G0 lawful scope, named independent author and reviewer; no BANK-001 implementation required for manifest preparation.
- Input specifications: QUESTION_SCHEMA, QUESTION_FACTORY_SPEC source/provenance rules, MVP scope, ADR-002/003.
- Files/modules: `data/original/practice-mini-v1.manifest.json`, `data/taxonomy/practice-mini-v1.json`, `data/original/REVIEW_CHECKLIST.md`.
- Expected deliverables: synthetic/original item manifest, source/rights attestations, taxonomy/bundle map, expected answer evidence, and reviewer checklist with explicit unknowns.
- Acceptance criteria: every item has an origin/right/evidence reference; no protected research example is copied; all required mini-profile section/type counts are enumerable; reviewer and author identities are distinct; unverified claims are marked rather than inferred.
- Required verification: deterministic manifest count/hash check; schema dry-run fixture once FOUND-002 exists; manual Vietnamese clarity, alternate-answer, rights and duplicate/equivalence review. Suggested agent capability: MEDIUM (Terra plus human content reviewers). Risk: High — content correctness/rights. Status: PROPOSED, blocked on lawful scope and reviewers.

## AI-003 — Held-out evaluation dataset partition and leakage audit

- Objective: prepare the Track A evaluation inputs and reproducible partition protocol before provider generation or quality claims.
- Prerequisites: G0, rights-cleared sources and named independent labelers; RESEARCH-002 plan accepted by owner for its stated scope.
- Input specifications: AI_QUESTION_PIPELINE evaluation requirements, QUESTION_FACTORY_SPEC evaluation partition rules, QUESTION_SCHEMA, ADR-005/008.
- Files/modules: `data/evaluation/manifest.json`, `data/evaluation/labels.json`, `docs/research/AI_EVALUATION_PROTOCOL.md`.
- Expected deliverables: frozen train/prompt/held-out partitions, label rubric/provenance, prohibited overlap rules, two-adapter comparison procedure and cost-recording template.
- Acceptance criteria: held-out content cannot enter prompts or few-shot examples; each label has source/right/reviewer provenance; exact and semantic duplicate checks span partitions; protocol distinguishes measured results from assumptions and human publication from evaluation.
- Required verification: deterministic split hash, overlap/near-duplicate audit, independent label sample audit, citation/rights audit; paid/live evaluation NOT RUN until authorized. Suggested agent capability: MEDIUM (Terra). Risk: High — leakage/correlated labels. Status: PROPOSED, blocked on lawful labels.

## FACTORY-002 — Frozen batch planner and cost-cap persistence

- Objective: implement the bounded, provider-free planning half of FACTORY-001 as a separate Track A unit.
- Prerequisites: G1, AI-001 fixture contract, owner-approved synthetic/rights-cleared config; live schedule/budget remains separately authorized.
- Input specifications: QUESTION_FACTORY_SPEC planning/config/lifecycle sections, AI pipeline contract, FOUND-002 generated fixtures, ADR-005/008.
- Files/modules: `tools/question-factory/planner.ts`, `src/modules/generation/batch-plan.ts`, `tests/factory/planner.test.ts`.
- Expected deliverables: version-pinned config validation, aggregate inventory snapshot, deterministic ranked plan, empty-plan reasons and atomic draft budget reservation interface; no provider dispatch.
- Acceptance criteria: same config/snapshot/key yields one frozen plan; 500 requested candidates never exceeds candidate, validator, review or reserved-cost caps; pending work is not eligible stock; no per-student history enters planner inputs.
- Required verification: fixture tests for overlapping quotas, bundle limits, zero deficit, missing rights, capacity/budget cap and duplicate schedule/manual identity. Suggested agent capability: MEDIUM (Terra). Risk: High — cost and privacy. Status: PROPOSED, blocked on G1 and assigned fixture scope.

## FACTORY-003 — Resumable executor, restricted export and recovery

- Objective: implement the provider-dispatch/recovery half of FACTORY-001 against the frozen planner and canonical package contract.
- Prerequisites: FACTORY-002 accepted, AI-001 adapters accepted, G1; live dispatch additionally requires ADR-FACTORY and ADR-OPS approval plus budget/provider/review authorization.
- Input specifications: QUESTION_FACTORY_SPEC lifecycle/import/recovery scenarios, AI pipeline provider errors, FOUND-002 contracts, FACTORY-002 plan interface.
- Files/modules: `tools/question-factory/executor.ts`, `tools/question-factory/export.ts`, `tests/factory/recovery.test.ts`.
- Expected deliverables: fenced leases/checkpoints, durable reservation reconciliation, restricted `factory-package/1` export and typed pause/failure reports; no bank approval endpoint or student access.
- Acceptance criteria: a matching retry reuses checkpoints; stale workers cannot overwrite final state; changed content under one producer item identity is rejected at import boundary; one failed bundle leaves no partial exported/importable unit; factory credentials cannot approve/publish/read student data.
- Required verification: controlled fake-provider crash after response and before acknowledgement, timeout/uncertain-charge, cap exhaustion, stale lease, cancellation and provider replacement tests; independent security review before G3. Suggested agent capability: HIGH (Sol). Risk: High — money, recovery and privilege. Status: PROPOSED, blocked on FACTORY-002/AI-001/G1.

## BANK-002 — Independent review, equivalence and publication command

- Objective: split the human publication boundary from BANK-001 ingestion so a bounded implementation owns only workflow authorization and eligibility transitions.
- Prerequisites: DATA-001, AUTH-001, G1 and BANK-001's accepted ingestion evidence (validated immutable drafts/import receipt), plus a named independent human review process. This is not a prerequisite on BANK-001 milestone completion, and BANK-002 does not require G2: BANK-001 ingestion and BANK-002 publication evidence jointly establish G2.
- Input specifications: QUESTION_FACTORY_SPEC controlled-publication section, QUESTION_REUSE_POLICY equivalence rules, API staff review contract, ADR-003/007.
- Files/modules: `src/modules/bank/publication.ts`, `src/http/staff/reviews.ts`, `tests/integration/bank-publication.test.ts`.
- Expected deliverables: exact-hash independent review decision, equivalence adjudication/audit, approval eligibility pointer and quarantine/revocation guard.
- Acceptance criteria: author/factory operator self-approval fails; stale hash/new version cannot inherit approval; unresolved duplicate flags block approval; quarantine/revocation stops future eligibility; a canonical import receipt never asserts APPROVED.
- Required verification: real-DB concurrent approve/withdraw serialization, workflow transition matrix, authorization/BOLA fixtures, equivalence merge/history preservation and safe error projection tests. Suggested agent capability: HIGH (Sol). Risk: High — rights and publication integrity. Status: PROPOSED, blocked on DATA-001/AUTH-001, BANK-001 ingestion evidence and named review process.

## ASSEMBLY-002 — Per-student NEW_ONLY allocation transaction

- Objective: isolate the concurrency-critical commit path from ASSEMBLY-001 selection/search.
- Prerequisites: G2, DATA-001 allocation schema, BANK-002 eligible-bank guard, ADR-004/007 owner decisions, ASSEMBLY-001 validated manifest candidate interface.
- Input specifications: QUESTION_REUSE_POLICY concurrency/history/shortage rules, EXAM_ASSEMBLY_SPEC sealing rules, API creation contract after FOUND-007, ADR-003/004/007.
- Files/modules: `src/modules/assembly/allocation.ts`, `src/modules/assembly/creation-receipt.ts`, `tests/assembly/allocation-concurrency.test.ts`.
- Expected deliverables: per-user lock/revision protocol, revalidation/replan boundary, atomic form+CREATED attempt+history+receipt commit and no-allocation typed outcomes.
- Acceptance criteria: two same-user different-key NEW_ONLY successes have disjoint current identity/equivalence groups; same-key replay returns one receipt; rollback writes no history/form/attempt; different users may reuse stock; proven shortage and unknown search exhaustion remain distinct.
- Required verification: two real PostgreSQL connections with barriers for winner orders, corrected-version/equivalence-merge fixtures, rollback injection, withdrawal/publication race and receipt retention replay. Suggested agent capability: HIGH (Sol). Risk: High — concurrency/data integrity. Status: PROPOSED, blocked on G2 and unresolved FOUND-007/ADR-007.

## WEB-003 — Catalog, creation and explicit shortage UX

- Objective: implement the bounded pre-attempt student flow without timers, answer persistence, scoring or duplicated assembly rules.
- Prerequisites: FOUND-002 contract artifacts, ASSEMBLY-002 API acceptance, AUTH-001 candidate session, resolved FOUND-007 taxonomy.
- Input specifications: API catalog/create/StudentShortage DTOs, QUESTION_REUSE_POLICY modes/shortage rules, MVP scope, accessibility requirements.
- Files/modules: `src/app/(student)/catalog/page.tsx`, `src/components/student/attempt-create.tsx`, `tests/e2e/student-create.spec.ts`.
- Expected deliverables: personalized default, explicit review/fixed consent, authenticated create/replay handling and safe shortage alternatives.
- Acceptance criteria: omission selects PERSONALIZED_PRACTICE + NEW_ONLY; no automatic review/fixed/shorter fallback; shortage shows only safe contract fields; retry preserves the logical request semantics; network inspection contains no candidate IDs, keys, histories or provider call.
- Required verification: browser fixtures for success, both shortage codes, search exhaustion, conflict/retry and keyboard/screen-reader flow; contract-negative parsing test. Suggested agent capability: MEDIUM (Terra). Risk: Medium — unsafe UX could bypass policy. Status: PROPOSED, blocked on ASSEMBLY-002.

## WEB-004 — Attempt delivery, save state and released-result UX

- Objective: implement the remaining student rendering journey against completed backend DTOs, with no business clock or scorer in the client.
- Prerequisites: EXAM-001, EXAM-002, SCORE-001 and frozen student contracts; G3 for the integrated browser evidence.
- Input specifications: API AttemptView/AnswerAck/Closure/Result, EXAM_ENGINE_SPEC, QUESTION_SCHEMA renderers, test strategy Q-06/Q-08/Q-09.
- Files/modules: `src/app/(student)/attempt/[id]/page.tsx`, `src/components/student/attempt-session.tsx`, `tests/e2e/student-attempt.spec.ts`.
- Expected deliverables: active-section renderer, server-time countdown, acknowledged autosave/conflict/retry UI, closure state and released-only result/history view.
- Acceptance criteria: changing client clock/timezone cannot extend a deadline; an unacknowledged save is never shown as saved; future/private slots and keys/explanations are absent before release; results are labelled unofficial practice.
- Required verification: browser multi-tab/offline/reconnect/expiry journeys, keyboard/zoom/screen-reader checks, response/hydration/bundle leakage scan and controlled-clock boundary tests. Suggested agent capability: MEDIUM (Terra). Risk: High — timing/key leakage. Status: PROPOSED, blocked on EXAM-002/SCORE-001.

## TEST-002 — Independent critical-invariant and security regression harness

- Objective: provide the cross-module, independently runnable critical test layer before pilot evidence, without claiming that task-local tests are sufficient.
- Prerequisites: G3, stable module contracts and recorded unit/integration acceptance from DATA/BANK/ASSEMBLY/EXAM/SCORE/WEB cards.
- Input specifications: TEST_STRATEGY Q-01–Q-16 and scenarios A–J, API contracts, factory/reuse policies, task-local fixtures.
- Files/modules: `tests/critical/concurrency.spec.ts`, `tests/critical/security.spec.ts`, `tests/critical/scoring-and-integrity.spec.ts`.
- Expected deliverables: barrier-driven real-DB race harness, state-machine/property regression suite and release evidence output referencing exact fixture/contract revisions.
- Acceptance criteria: verifies allocation disjointness, idempotent closure, scoring goldens, immutable snapshots, publication/revocation guards, BOLA/key leakage and factory non-publication; failures retain a reproducible seed/trace.
- Required verification: two-connection barriers rather than sleeps; controlled clock; HTTP/bundle scans; independently reviewed test cases and observed command/runtime results. Suggested agent capability: HIGH (Sol). Risk: High — false confidence in critical controls. Status: PROPOSED, blocked on G3.

## INT-002 — Factory package import boundary proof

- Objective: verify the narrow bridge independently of full exam UI: factory package receipt semantics, all-or-none import and draft-only publication boundary.
- Prerequisites: FACTORY-003, BANK-001 ingestion evidence, BANK-002 acceptance, G2 controlled publication readiness, and a human reviewer for the publication subset. This proof supplies the controlled-import evidence required before G3 can pass; INT-001 starts only after G3.
- Input specifications: `factory-package/1` contract in QUESTION_FACTORY_SPEC, BANK-001 import rules, BANK-002 publication rules, TEST_STRATEGY Q-01/Q-02/Q-16.
- Files/modules: `tests/integration/factory-import.spec.ts`, `tests/fixtures/factory-package.json`, `docs/quality/factory-import-evidence.md`.
- Expected deliverables: repeated-import receipt proof, changed-key conflict proof, bundle rollback proof and independently reviewed subset evidence; factory remains stopped after export.
- Acceptance criteria: identical package twice maps to one durable receipt; altered same key fails; malformed/incomplete bundle imports nothing; only a separately reviewed exact version becomes eligible; no factory credential can approve or access student data.
- Required verification: real-DB transaction rollback, service-identity authorization negatives, receipt hash comparison and human-review evidence. Suggested agent capability: HIGH (Sol). Risk: High — bridge/publication corruption. Status: PROPOSED, blocked on FACTORY-003, BANK-001/BANK-002 and G2.

## Recommended dependency sequence after owner approval

1. G0 authorization is recorded, but an accountable implementation owner and task-specific prerequisites remain required. FOUND-003 and RESEARCH-002 may undertake their explicitly authorized planning/evidence work with separate owners. After the accountable assignment, FOUND-007, DATA-003, AI-003 and FOUND-002 may start; FOUND-007 must be accepted before FOUND-002 freezes the G1 contracts. The already recorded non-retroactive ordinary-admission-edit decision governs affected admission/start semantics; implementation still requires synchronized contract review and its listed tests.
2. G1: FOUND-002 establishes G1; then AI-001, DATA-001 and the authorized AUTH-001 local-development path may proceed. FACTORY-002 may use only the frozen fixture contracts.
3. G2 Track B: DATA-002 preparation and BANK-001 ingestion may proceed after their actual prerequisites. BANK-002 independently supplies the review/publication evidence; verified BANK-001 plus BANK-002 evidence establishes G2. ASSEMBLY-001 → ASSEMBLY-002; then EXAM-001, EXAM-002 and SCORE-001. WEB-003 can start after ASSEMBLY-002; WEB-004 follows attempt/score acceptance.
4. Track A remains independent: AI-001 → AI-002 and FACTORY-002 → FACTORY-003. It does not block the manually seeded Technical MVP.
5. G3: INT-002 supplies the narrow import proof, then INT-001 and TEST-002/TEST-001/OPS-001 produce integrated/pilot evidence. No pilot begins without recorded owner scope and critical verification results.
