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
- Prerequisites: FOUND-001 and independent review artifact under FOUND-004; no architecture approval required for this documentation assignment.
- Files: docs/reviews/REVIEW_RESOLUTION_001.md; relevant architecture/engine/assembly/quality/backlog/decision documents; PROJECT_STATE and LAST_HANDOFF. Original review and research read-only. Codex owns these shared-file updates for this task.
- Deliverables: finding-to-disposition traceability, proposed corrected contracts, aligned acceptance/tests and approval queue. Acceptance: all 15 numbered findings and unnumbered actionable comments addressed; immutable input hashes preserved; no false approval/runtime claims.
- Required verification: documentation checker, finding coverage, PRNG reference-vector calculations, manual API/DB/state/pipeline consistency review, protected-input hash audit and patch/Git file-scope inspection.
- Priority P0; complexity M; risks: accepting incorrect premises, policy changes mistaken for approval.
- Status: COMPLETED (documentation reconciliation, 2026-10-16). Evidence: [resolution](../reviews/REVIEW_RESOLUTION_001.md) (historical handoff: 23 Markdown files, 152 valid local links, 21 task IDs, no application tests); 15/15 findings mapped, 15 PRNG outputs and 4 rounding cases checked, static checker passes with preserved-input whitespace warning, review/research hashes unchanged. Accountable implementer: Codex; ownership released. Independent re-review of revisions not performed; owner approval remains FOUND-004 and all ADRs remain PROPOSED.

Authoritative task statuses as of 2026-10-16. Status vocabulary: DRAFT (unassigned/not authorized), PROPOSED (ready for review), APPROVED (authorized/ready), IN_PROGRESS (one named accountable implementer), BLOCKED (named unmet dependency), COMPLETED (acceptance and required evidence recorded), SUPERSEDED (replacement linked). Roles are suggestions, never actual assignments or review claims. Complexity S/M/L is relative.

All future paths below are proposed ownership scopes, not existing files. Before claiming a task, read [onboarding](../agents/AGENT_ONBOARDING.md), check prerequisite completion/ADR approval, name implementing agent, reserve files and record starting Git state. Task completion requires its listed tests and acceptance evidence; if code/tests do not exist, record NOT RUN, never PASS. Independent review is required for critical bank/attempt/score contracts before integration. Global gates G1=current ADR-001–004 and ADR-007 approved; G2=ADR-006 approved for production; G3=current ADR-005/008 approved. Local-only identity stub requires explicit scoped approval per ADR-006.

## FOUND-001 — Phase 01 documentation

- Objective/scope: establish architecture, evidence classification, domain/API/DB drafts, roadmap, collaboration and quality procedures; documentation only.
- Prerequisites: owner mission; research present. Files: README.md, AGENTS.md and all documentation linked by README, excluding unchanged original research.
- Deliverables: required 19 documents plus research assessment. Acceptance: all required files substantive; navigable onboarding; no approved architecture falsely recorded; consistent domain/API/state semantics; no app code or research alteration.
- Required verification: inspect complete research, local link/nonempty/fence checks, task/decision consistency review, unchanged research hash, final Git scope inspection. Historical evidence preserved in [resolution record](../reviews/REVIEW_RESOLUTION_001.md) under Phase 01 evidence; LAST_HANDOFF now describes reconciliation.
- Priority P0; complexity L; risks: research uncertainty, internal contradictions.
- Status: COMPLETED. Evidence (2026-10-15): embedded documentation checker exit 0, 19 required documents, 91 local links, 20 unique task IDs, six proposed/unapproved ADRs, unchanged research SHA-256; manual contract walkthrough and Git scope inspection recorded in [handoff](../agents/LAST_HANDOFF.md). Accountable implementer: Codex, lead architect in this session; ownership released at handoff. Suggested independent reviewer: architecture reviewer (any capable environment); review/approval remains FOUND-004, not claimed completed here.

## FOUND-004 — Independent review and human baseline approval

- Objective/scope: review ADR-001–008, identify conflicts and record owner's approval/conditions; do not implement.
- Prerequisites: FOUND-001. Files: read all architecture/spec contracts; assigned reviewer writes review findings in docs/decisions/OPEN_DECISIONS.md through coordinated integrator, or provides read-only review for integrator.
- Deliverables: actionable findings with severity, affected files and resolution; durable human decision evidence. Acceptance: each blocking finding resolved or explicitly deferred with impact; current ADR-001–008 have owner disposition; implementation gate unambiguous.
- Required tests: document consistency/links, scenario walkthrough for submit/save/expiry, snapshot mutation and rights withdrawal; no runtime claims.
- Priority P0; complexity M; risks: reviewer approval mistaken for owner authorization. Status: BLOCKED on owner decision. Independent review portion: Antigravity's [review](../reviews/ARCHITECTURE_REVIEW_001.md), dated 2026-10-16, received. Reconciliation tracked in FOUND-005. Remaining accountable decision role: human owner; no agent is assigned authority to approve. Acceptance additionally requires owner disposition of current ADR-004 H1–H3 (H1 fixed only), ADR-007/008 and affected revised scopes.

## FOUND-003 — Official evidence/profile validation

- Objective/scope: visually verify original blueprint table and check current official guidance; preserve research.
- Prerequisites: FOUND-001; no application architecture approval needed for read-only research. Files: docs/research/RESEARCH_ASSESSMENT.md, applicable profile decisions.
- Deliverables: dated URLs, page/section references, verified vs unresolved claims. Acceptance: counts/ratios and source applicability resolved or explicitly blocked; no claim of official score reproduction.
- Required tests: independent source retrieval/visual check and citation/link audit; record failed retrievals.
- Priority P1; complexity S; risks: stale official materials, unavailable sources. Status: PROPOSED. Suggested implementer: research analyst; review: domain reviewer. Actual assignee: none.

## FOUND-002 — Application and contract foundation

Reconciliation acceptance (HI-04/CR-02): requires FOUND-005/006 completion and FOUND-004 owner disposition in addition to G1. One runtime schema source; CI regenerates committed OpenAPI/client artifacts and fails on content drift; producer/consumer positive and negative fixtures are required. A changed response or stale generated file must fail; an optional field passes only after coordinated regeneration and strict-consumer checks. Pin the documented PRNG vectors plus complete search/canonicalization fixtures before parallel consumers.

- Objective/scope: initialize approved stack, schemas/client artifacts, CI and development run instructions; freeze renderer/PRNG/canonicalization behavior with fixtures.
- Prerequisites: FOUND-004, G1, owner implementation assignment. Files: package manifests, src/contracts/**, src/app skeleton, tests/contract/**, CI config, approved development docs; no bank/attempt features yet.
- Deliverables: pinned supported versions, runtime validators/OpenAPI/student-safe types, reproducible local/CI entry points. Acceptance: a fresh checkout installs/builds from lockfile; question/blueprint/API examples validate; private types cannot import into student bundle; all commands documented.
- Required tests: typecheck/build, strict schema fixtures, unknown-field/type rejection, generated contract drift checks. Required version/license/advisory review recorded.
- Priority P0; complexity M; risks: library/version compatibility, over-scaffolding. Status: BLOCKED (G1). Suggested implementer: full-stack foundation engineer; review: independent architecture/security reviewer. Actual assignee: none.

## DATA-001 — Relational integrity foundation

Phase 02.75 acceptance: stable question history PK(user,question), allocation revision row, canonical singleton/merged equivalence groups, bank eligibility revision, offering windows, personal owner/one-attempt constraints and fixed-mode compatibility. Two-connection strict allocations cannot overlap; corrected versions stay excluded. Factory migration files are separately reserved by FACTORY-001.

Reconciliation acceptance (CR-01/HI-01/MD-02/04/05): implement owner-selected H1/H3 uniqueness, cancellation constraints, blueprint taxonomy FK, lifecycle-pinned idempotency records and shared save buckets. Tests require two-connection create races, stale-active cleanup, cancellation/start ordering, cleanup after pending grading and transaction rollback on invalid sealed aggregates. These are requirements, not tests executed in Phase 02.5.

- Objective/scope: implement MVP tables, constraints, immutable triggers, reviewed migrations and test fixtures; include per-user history/equivalence/offerings; coordinate factory migrations with FACTORY-001 rather than duplicate ownership.
- Prerequisites: FOUND-002, G1. Files: db/**, src/modules database adapters, tests/integration/database/**.
- Deliverables: schema/migrations and seeded synthetic fixtures. Acceptance: cross-form answers, mismatched version links, immutable edits and duplicate score/job writes rejected; schema upgrade preserves history.
- Required tests: fresh migration and populated upgrade, FK/check/unique failures, rollback compatibility, real PostgreSQL concurrency/lock ordering and transaction rollback.
- Priority P0; complexity L; risks: JSON/relational drift, irreversible migrations. Status: BLOCKED (FOUND-002). Suggested implementer: database engineer; review: backend/data-integrity reviewer. Actual assignee: none.

## AUTH-001 — Identity and authorization

Phase 02.75 acceptance: factory service cannot read student histories/attempts or approve/publish; website has no model credentials. Personal form/manifest ownership must fail closed; test factory/web/job-kind credential boundaries.

Reconciliation acceptance (HI-05/MD-05): role-test diagnostic projections and new BANK_MANAGER diagnostics read; EXAM_MANAGER alone cannot enumerate manifest/candidate pools. Own-object authorization occurs before save-bucket creation; unauthorized IDs create no buckets. Coordinate shared throttling contract with EXAM-001 and DB schema from DATA-001.

- Objective/scope: OIDC/session adapter, role policies and own-object checks; local stub only if explicitly approved.
- Prerequisites: FOUND-002, DATA-001, G2 for production configuration. Files: src/modules/identity/**, auth HTTP adapters, tests/security/auth/**.
- Deliverables: secure sessions, CSRF/origin checks, roles, staff MFA integration and negative fixtures. Acceptance: users cannot inspect others' attempts; authors cannot self-approve; disabled sessions/roles enforced server-side.
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
- Prerequisites: DATA-001, AUTH-001 and frozen contracts. Files: src/modules/sources/**, src/modules/bank/**, staff bank HTTP adapters, tests/integration/bank/**.
- Deliverables: import dry-run/report, author/review commands, approval/quarantine audit and eligibility pointer. Acceptance: edits create versions; no approval carryover/self-approval; rights/validator failures block publication; holds immediately affect delivery checks.
- Required tests: workflow transitions, duplicate fingerprints, stale revision/approval hash, source revocation, concurrent approve/withdraw and asset sanitization.
- Priority P0; complexity L; risks: approval bypass, unsafe content, rights race. Status: BLOCKED (DATA-001/AUTH-001). Suggested implementer: bank/backend engineer; review: domain/security reviewer. Actual assignee: none.

## ASSEMBLY-001 — Reproducible starter exam assembly

Phase 02.75 acceptance: atomic personal form+attempt+history+receipt; allocation user lock then shared bank guard, revision recheck and bounded replans; review/fixed assignments also write history. Tests C–H include same-user different-blueprint races, corrected versions, equivalence merges, rollback, shortage versus unknown search exhaustion, TTL abandonment and explicit alternatives.

Reconciliation acceptance (CR-02/HI-02/05/MD-01/02/03): test all three unsigned PRNG vectors and shuffle order; reject wrong-dimension values, foreign taxonomy, repeated sections/quotas under approved H3. Inject sealing mismatch after valid blueprint validation and assert rollback. Global usage is analytics only; withdrawal never resets assignments and replay never assigns twice. Role diagnostics tests exclude private candidate pools from EXAM_MANAGER errors. Owner H3 choice is a prerequisite, not an implementation assumption.

- Objective/scope: blueprint validation, manifest capture, bounded selection, personalized snapshot sealing and assignment history.
- Prerequisites: BANK-001, DATA-002 accepted inventory, G1. Files: src/modules/assembly/**, assembly HTTP adapters, tests/assembly/**.
- Deliverables: mini-profile assembler with diagnostics and replay. Acceptance: every hard constraint holds; correct bundle ordering; no duplicate identities; stored manifest+seed replays; same-user concurrent allocations disjoint; different users may reuse stock; no partial forms.
- Required tests: golden seed replay, invariant/property fixtures, feasible/infeasible/search-exhausted distinctions, revocation/approval race and idempotent sealing.
- Priority P0; complexity M; risks: bounded search false infeasibility claims, moving pool. Status: BLOCKED (bank/inventory). Suggested implementer: algorithm/backend engineer; review: independent algorithm/data reviewer. Actual assignee: none.

## EXAM-001 — Attempt start, delivery and persisted answers

Phase 02.75 acceptance: H1 applies to fixed forms only; personal form has one owner/attempt. No reselection at start; all assigned slots persist in history after cancellation/expiry/invalidation. Test USER_CREATE throttling independently of saves/submission and retry after receipt expiry without repetition.

Reconciliation acceptance (CR-01/HI-01/03/MD-04/05): owner H1/H2 choices must be recorded. Test distinct-key concurrent create, same-key replay, closed-attempt retake, not-open/exact-close admission, late admitted completion, CREATED lazy cancellation, long-lived creation receipt and post-retention retry. Exercise both rate buckets across two server instances; 429 has Retry-After, no save/receipt mutation, preserves client pending edits, and does not throttle submit via the save bucket.

- Objective/scope: create/start attempt, fixed section clocks, safe delivery, revisioned autosave/resume.
- Prerequisites: ASSEMBLY-001, AUTH-001. Files: src/modules/attempts/** (start/read/save), student HTTP adapters, tests/integration/attempts/**.
- Deliverables: candidate-safe endpoints with acknowledged save revisions. Acceptance: no timer reset, no future/previous section content, own-form slot integrity, safe cross-tab conflict response.
- Required tests: boundary timestamps using controlled server clock, BOLA, serialization leakage, lost acknowledgement replay, stale revision and restart persistence.
- Priority P0; complexity L; risks: clock/caching leaks and overwrite races. Status: BLOCKED (assembly). Suggested implementer: examination backend engineer; review: security/state-machine reviewer. Actual assignee: none.

## EXAM-002 — Submission, expiry and recovery

Reconciliation acceptance (HI-01/MD-04): existing sweep also cancels unavailable CREATED attempts; test sweep outage/lazy access, cancellation/start race without deadlock, committed cancellation despite HTTP 410, and idempotent repeated cancellation. Failed grading retains attempt-linked receipts until finalization plus minimum replay period; cancellation carries reason and no fabricated start/deadline.

- Objective/scope: closure transaction, durable grade jobs, lease/retry recovery, incident invalidation and expiry sweep.
- Prerequisites: EXAM-001; coordinate score job contract with SCORE-001 before parallel work. Files: src/modules/attempts/** (closure/holds), src/modules/jobs/**, worker entry, tests/integration/recovery/**.
- Deliverables: single closure semantics and recoverable queue. Acceptance: no late writes, duplicate submits produce one job, crash cannot lose acknowledged submissions, held content inaccessible immediately.
- Required tests: simultaneous save/submit/expire, kill/reclaim worker lease, duplicate delivery/fencing, outage near deadline, revoke during active/released attempt.
- Priority P0; complexity L; risks: lost work, race windows. Status: BLOCKED (EXAM-001). Suggested implementer: backend/reliability engineer; review: independent concurrency reviewer. Actual assignee: none.

## SCORE-001 — Practice scoring and released results

Reconciliation acceptance (§7.10): integer quotient/remainder rounding must produce 1/3="33.33", 1/32="3.13", 0/n="0.00", n/n="100.00"; no floating-point rounding dependence. Existing latest-answer storage is sufficient; no answer-revision history feature is added.

- Objective/scope: pure binary scoring, immutable score records, atomic release and owner history.
- Prerequisites: EXAM-001 plus frozen closure/job contract; integration acceptance requires EXAM-002. Files: src/modules/scoring/**, result/history HTTP adapters, tests/scoring/**.
- Deliverables: practice-binary-v1 and after-grade-v1 with explicit unofficial labeling. Acceptance: golden scores for all types, exact rounding, missing answers zero, deterministic idempotent grading, no early keys/explanations.
- Required tests: set-order property tests, incomplete true/false, empty/all-correct fixtures, 1/3 rounding, repeat job, immutable historical score, pre/post-release leakage checks.
- Priority P0; complexity M; risks: accidental partial credit or official score implications. Status: BLOCKED (EXAM-001). Suggested implementer: scoring/backend engineer; review: independent mathematical/domain reviewer. Actual assignee: none.

## WEB-001 — Student vertical slice

Phase 02.75 acceptance: default personal NEW_ONLY catalog/create flow; display mode, start TTL, explicit shortage and separately confirmed review/fixed alternatives. Browser test two attempts with no repeats, exhausted inventory, no automatic fallback or AI call.

Reconciliation acceptance (LO-01/03, HI-01/03, MD-05): show section/overall countdown, accessible <=60-second warning once per section, locked/future labels and ICT (UTC+7) absolute times. Browser tests cover resume inside warning window, denied late saves, 429 retry without false saved state, CANCELLED reason, existing-attempt conflict recovery and admission window disclosure before start. Changing browser timezone must not change countdown or authoritative deadlines.

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
- Prerequisites: FOUND-002 shared contracts, G3, approved provider data handling and lawful isolated fixtures; no website/BANK-001 runtime prerequisite. Files: src/modules/generation/**, generation job adapters/migrations, tests/ai/contracts/**.
- Deliverables: deterministic fake/template adapter plus two provider adapters for authorized comparative evaluation. Acceptance: no publication permission, strict schema rejection, bounded retry/cost and provider switch without question schema changes.
- Required tests: fake provider refusal/timeout/invalid JSON/injection, duplicate worker/cancellation, budget limits, persisted provenance and rights revocation before dispatch.
- Priority P0 for early research; complexity M; risks: vendor drift, billed retries, leakage. Status: BLOCKED (G3/provider/contracts). Suggested implementer: AI infrastructure engineer; review: independent backend/security reviewer. Actual assignee: none.

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
- Prerequisites: owner research assignment; FOUND-003 coordinates official evidence; live calls require G3 and budget approval, document-only planning does not.
- Files/modules: docs/research task-owned reports, data/evaluation manifests once implementation authorized; original research read-only.
- Deliverables/acceptance: source rights evidence, gaps by section/skill, independent human labeling plan, reproducible two-model comparison protocol and explicit unknowns; no unsupported benchmark claims.
- Required tests: source/citation audit, provenance completeness and dataset leakage/overlap audit; live evaluation only after authorization.
- Priority P0; complexity M; risks: licensing, weak labels, correlated model errors.
- Status: PROPOSED, unassigned. Suggested implementer: research/evaluation engineer; independent reviewer: domain expert.

## FACTORY-001 — Scheduled bounded batch production

- Objective/scope: manual/weekly planning, shortage priorities, budget/review caps, resumable batch execution and reports under QUESTION_FACTORY_SPEC.
- Prerequisites: AI-001, G3, owner schedule/budget/review capacity; standalone fixture DB allowed without web. Shared jobs contract from FOUND-002; coordinate migration ownership with DATA-001/EXAM-002.
- Files/modules: tools/question-factory/**, generation planner/executor, explicitly reserved factory config/schedule/batch/item/run migrations, tests/factory/**. BANK-001 exclusively owns canonical bank/import receipt persistence.
- Deliverables/acceptance: one scheduled period identity, frozen plan, bounded cost reservation, per-unit checkpoints, independent credentials/queue kinds, export/re-import stable IDs, acceptance/cost reports; COMPLETED batch never implies approved questions.
- Required tests: crash halfway/resume, duplicate schedule/manual keys, stale leases, unknown provider billing, cap exhaustion, partial bundle rollback, provider switch, blocked approval credentials and no web/LLM coupling.
- Priority P0 for Track A; complexity L; risks: runaway cost, DB contention, duplicated drafts.
- Status: BLOCKED (G3/AI-001/operating inputs). Suggested implementer: AI/backend engineer; independent reviewer: reliability/security engineer. Actual assignee: none.

## INT-001 — Approved factory output to personalized examination

- Objective/scope: integrate early Track A and Track B through canonical draft import and controlled publication, without coupling runtimes.
- Prerequisites: FACTORY-001, AI-002 evaluated fixtures, BANK-001, ASSEMBLY-001, EXAM-002, SCORE-001 and independent human reviewer; UI journey additionally WEB-001.
- Files/modules: tests/integration/factory-bank-exam/**, task-owned integration evidence; producer/consumer module fixes assigned to their owners, shared contracts require coordinated approval.
- Deliverables/acceptance: import one versioned batch twice without duplicate bank identities, reject altered same-key input, approve only reviewed subset, assemble/complete/score a personal exam from it with factory stopped; remaining drafts ineligible.
- Required tests: A–J matrix in TEST_STRATEGY, including 500-draft workload under approved envelope, month-long provider-outage simulation, same-user/cross-user allocation, corrected version, publication during attempt and halfway recovery.
- Priority P0 for research integration milestone, not a prerequisite for manually seeded web MVP; complexity M; risks: adapter drift, accidental publication, resource sharing.
- Status: BLOCKED (both tracks and approval). Suggested implementer: integration engineer; independent reviewer: QA/security plus domain reviewer. Actual assignee: none.
