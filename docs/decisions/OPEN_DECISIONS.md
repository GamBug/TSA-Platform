# Architectural decisions and open questions

Status as of 2026-10-17: all eight ADRs below remain PROPOSED as whole decisions; ADR-004 H1, H2, H3, the MVP Start TTL and non-retroactive ordinary admission-schedule edits have separate, scoped HUMAN OWNER approvals. Independent review by Antigravity is documented in [ARCHITECTURE_REVIEW_001](../reviews/ARCHITECTURE_REVIEW_001.md); Codex's disposition and changes are in [REVIEW_RESOLUTION_001](../reviews/REVIEW_RESOLUTION_001.md). Neither review is owner approval. Phase 02.75 remains documentation-only by default; the scoped G0 implementation authorization below is the explicit owner authorization for development work and does not authorize paid LLM API calls, production readiness or unresolved ADR changes.

## Lightweight process

Keep significant decisions here until size warrants individual `ADR-NNN-title.md` files in this directory. Each ADR records problem, alternatives, tradeoffs, choice, consequences, migration/rollback and status. Trivial internal naming does not require an ADR. Human approval must record approver, date, exact ADR revision/content scope, conditions and a durable reference or a faithfully recorded owner instruction. If the instruction originated in chat, copy its actionable approval wording into this record; do not depend on chat accessibility. An independent agent review is advice, never owner approval.

States: DRAFT → PROPOSED → APPROVED → SUPERSEDED. A rejected proposal remains DRAFT with rejection reason or is superseded by a new proposal. Reopening an approved contract requires impact analysis listing affected modules, database/data migration, consumers, tests, rollout and rollback. Do not silently edit approved semantics. Approval applies only to named revision/scope, not later edits. No new infrastructure merely because it appears in research.

## G0 — Scoped implementation authorization

- Status: AUTHORIZED SCOPE ONLY; this is not approval of any ADR, production readiness, deployment, real-user collection or a downstream gate.
- Approval identity: human project owner.
- Date: 2026-10-17 (Asia/Bangkok).
- Durable evidence: the owner's TASK FOUND-004 instruction in this session, recorded here so the authorization does not depend on chat availability.
- Exact owner authorization:

  > The human project owner explicitly authorizes development and implementation of TSA-Platform.
  >
  > Paid LLM API calls are prohibited until separately authorized by the owner.

- Permitted scope: frontend, backend and database development; automated tests and local development; local LLM inference; free-tier LLM API usage only when it causes no charges; Question Factory development and evaluation; TSA dataset research and preparation; and preparation for real-user testing and deployment.
- AI-provider spending condition: no paid LLM API request, billable retry, overage or other chargeable LLM API use is authorized by this record. A separate owner authorization is required before any paid LLM API call.
- Conditions preserved: copyright and content licensing, personal-data protection and consent, security and release-readiness checks, human question-publication approval, AI validation and human approval, and all existing unresolved ADR technical decisions remain in force.
- Gate effect: this records the owner-authorized G0 implementation scope. Task-specific accountable ownership, approved contract boundaries and G1–G3 evidence remain required; no production-readiness or release claim follows from this record.

### Owner-trust execution policy — 2026-10-18

- Human project owner approval, 2026-10-18: "OWNER DIRECTIVE — FULL ACCESS TRUST
  POLICY"; "Full Access is NOT a permission mismatch. It is an intentional
  execution authorization."
- Permanent execution policy is owned by the existing
  [orchestration protocol](../agents/ORCHESTRATION_PROTOCOL.md#owner-trust-execution-policy--2026-10-18).
  This supersedes the restricted-session-only writing-pilot precondition;
  task scope and explicit prohibitions remain binding. No product/ADR approval.

### Stage 3 pilot and local finalization — 2026-10-19

- Human project owner: "RESUME APPROVED STAGE 3 — FOUND-002 PILOT" (2026-10-18)
  assigned one Luna / XHigh builder for executable contract build/emitted-JS smoke.
  "STAGE 3 FINALIZATION AND STAGE 4 READINESS" (2026-10-19) additionally authorizes
  scope cleanup, validation, two logical local commits and Stage 4 planning only.
- Preserve owner `AGENTS.md` edits; no schemas, public exports, dependencies,
  pushes, merges, deployment, paid APIs, unapproved architecture or G1 advancement.
  Stage 4 implementation remains unauthorized. Evidence: [latest handoff](../agents/LAST_HANDOFF.md).

### Stage 4A bounded autopilot authorization — 2026-10-19

- Human project owner, "STAGE 4A — BOUNDED AUTOPILOT ACTIVATION": execute READY
  G1-preparation work, necessary tests/evidence, bounded repairs and local commits;
  consolidate unresolved choices into one decision packet. At most two subagents
  and one writing worker. No Stage 4B before owner approval of required semantics.
- No public-contract/product-semantic/dependency changes, owner `AGENTS.md` edits,
  push/merge to main, deployment, paid APIs, Astra or automatic G1 advancement.
- Approval is execution scope only; pending ADRs/decisions remain unapproved.

### D1–D6 scoped contract approval / Stage 4B — 2026-10-19

Approval identity: human project owner. Durable evidence: "OWNER APPROVAL —
ACTIVATE STAGE 4B BOUNDED AUTOPILOT". D1–D6 architectural behaviors in the
consolidated brief are APPROVED IN SCOPE; unrelated ADRs remain PROPOSED.

- D1: preserve eligible/unseen shortage and SEARCH_EXHAUSTED distinctions; accept
  bounded FOUND-007 reconciliation only with its required evidence.
- D2: versioned immutable identity plus separate fingerprint; freeze exact field
  projection, immutable reference handling, missing/conflicting/cyclic behavior
  and byte goldens before dependent implementation; exclude operational state,
  preserve authored text and never automatically merge equivalence groups.
- D3: deterministic bounded backtracking with hard constraints/replay/immutable
  snapshots. Search/contention limits remain initial engineering parameters until
  behavior/performance evidence supports frozen versioned values; exhaustion is
  never an infeasibility proof.
- D4: new self-contained versioned Factory transport, v1 compatibility, complete
  bounded manifests/reference/provenance/rights validation and atomic rejection;
  successful import confers no human approval/publication.
- D5: existing owner-only released-result route, separate score/review contracts,
  no unreleased private data disclosure.
- D6: student/internal/released consumer separation and explicit compatibility,
  generated route types/drift checks and minimization at runtime API boundaries.
- Execute newly unblocked contracts/tests/integration, bounded repairs and local
  commits; Luna / XHigh normal implementation, Sol / Medium integration/review.
  Maximum two subagents and one writing worker. No push, merge to main, deployment,
  paid external API, Astra, owner AGENTS edits or automatic G1 advancement.
- These approvals do not assert missing verification, complete task acceptance,
  production readiness or approval of any whole unrelated ADR.

### Final G1 acceptance audit authorization — 2026-10-19

Human project owner, "FINAL G1 ACCEPTANCE AUDIT — TSA-PLATFORM": audit the existing
G1/FOUND-002 criteria against committed reproducible evidence; verify clean install,
build/tests, boundaries and dependency evidence; repair small technical gaps within
already approved semantics using Luna / XHigh, review/test and commit locally.
Prepare the actual downstream prerequisite batch without implementing it. This
records execution scope only, not owner G1 acceptance, whole-ADR approval or missing
evidence approval. Preserve owner AGENTS.md; no push/merge, deployment, paid external
API, automatic gate advancement or unnecessary orchestration restructuring.

### Track B priority and isolated B0 authorization — 2026-10-19

Human project owner, "OWNER DIRECTIVE — PRIORITIZE TRACK B: TSA WEBSITE":
"PRIMARY PRIORITY: Track B — Working TSA Practice Website"; secondary Track A,
approximately 85/15 effort as priorities, not quotas. Explicitly authorizes a
runnable Vietnamese B0 landing/catalog/exam/navigation/answer/countdown/submit/
demonstration-result prototype using clearly labeled isolated mock adapters while
G1 is pending. No official structure/scoring/content invented; reuse existing
synthetic fixtures, never represent mocks as approved/integrated content. Minimal
frontend, local startup, automated and actual behavior verification required.

G1 audit remains READY FOR OWNER ACCEPTANCE, not accepted; no gate transition or
DATA/AUTH/BANK/EXAM implementation is authorized by B0. Existing separate one-domain
MATH-4/READING-2/SCIENCE-4 policies remain authoritative. The future ten-approved-
question integrated target does not silently authorize a combined three-domain
attempt; reconcile its profile before B1 integration. Track A limited to lawful
source inventory/quality/taxonomy/rubric preparation; no expensive benchmarking,
paid APIs or unauthorized scraping. Preserve owner AGENTS.md; no push/merge,
deployment or automatic gate advancement. This directive assigns B0 only within
these boundaries; existing blocked WEB integration cards remain blocked.

## G1 — Owner acceptance and bounded Track B execution, 2026-10-19

- Disposition: ACCEPTED by the human project owner, conditional on the mandatory
  final-audit evidence; that condition is satisfied. FOUND-002 is COMPLETED.
- Durable instruction: "OWNER DECISION — G1 ACCEPTANCE AND TRACK B EXECUTION":
  "I approve G1 acceptance, subject to the mandatory acceptance evidence established
  by the final G1 audit." Authorizes recording/committing this disposition locally.
- Accepted implementation: `0e67485ab7bd5e4873dbe74cdb903b995193e40b`; audit/evidence
  baseline `81ef8aa96ae53a63186c44eae8ccb6cb1c9b173b`,
  [final audit](../reviews/G1_ACCEPTANCE_AUDIT.md). Existing mandatory criteria PASS:
  fresh pinned install/build, 106 contract/11 emitted tests, schema/drift/private
  boundaries, deterministic vectors and dated dependency/license/advisory evidence.
  Current accepted contract tree and lockfile remain unchanged from audited code.
- Scope: existing G1 shared contracts and bounded FOUND-007 reconciliation only.
  Hosted CI remains unobserved; DB/auth/publication/provider/production evidence
  remains outside G1. No unrelated whole ADR or later gate is approved.
- Next batch additionally authorized: finalize existing B0, improve the same app
  to B0.1, prepare/execute eligible G2 prerequisites, and progress toward B1 within
  existing dependencies. Local logical commits permitted; one Luna / XHigh writer,
  Sol / Medium coordination/review; Terra only if justified, no Astra. After B0.1
  verification prioritize the earliest eligible database/backend slice. Existing
  unresolved architecture/local-stub/content-review approvals are not invented.
- Preserve owner AGENTS.md and uncommitted B0; keep gate recording separate from
  B0 implementation. No push, merge to main, deployment, paid external API or
  unauthorized semantic change. G2/G3 remain NOT ESTABLISHED.

## DATA-001 / AUTH-001 — Scoped local Track B approval, 2026-10-19

Human project owner, "OWNER APPROVAL — DATA-001 AND AUTH-001": explicitly approves
PostgreSQL with reviewed SQL migrations and server-only data access; applicable
ADR-001/003 boundaries for local Track B include relational integrity, immutable
versions/snapshots, private-data separation, transactional idempotency/concurrency.
Preserve existing frontend and G1 contracts; defer unnecessary ORM/frameworks.
Authorize local synthetic-only identity/role adapter, impossible to activate in
production, with server-side ownership/roles/session invalidation/CSRF tests.

Execution: autonomously implement/review/test/repair/commit DATA-001, AUTH-001 and
subsequently eligible Bank/exam work; Luna / XHigh default, Sol / Medium integration
and independent verification, Terra only for demonstrated complexity. This scoped
approval supersedes prior blocks on these database choices/local stub; it does not
approve whole unrelated ADRs, human content approval, missing evidence or G2/G3.
Synthetic integration fixtures remain distinct from rights-cleared inventory.
No owner AGENTS edits, push/merge, deployment, paid external API or Astra.

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
- Options: independent one-domain attempts vs a continuous multi-domain attempt; raw vs inferred IRT; greedy vs bounded backtracking vs solver.
- Proposed choice beyond scoped H1/H2/H3 approval: one configured server-timed section per MVP domain attempt, revisioned saves, durable idempotent submission, exact binary practice scoring and after-grade release; constrained seeded selection with bounded backtracking and stored inventory manifest. Future multi-section navigation needs separate approval. See [engine](../specifications/EXAM_ENGINE_SPEC.md) and [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md).
- Tradeoffs: explicit deadlines can reject late network writes; simple scoring lacks official/cross-form equivalence; bounded search can fail on feasible inventories. Coarse bank publication lock sacrifices editorial concurrency for simple integrity.
- Consequences: UI must show acknowledged saves and explain timing/score rules. No silent constraint relaxation, grace period or inferred official score.
- Migration/rollback: policies/algorithms are version-pinned per form. Future timing/scoring/solver versions apply to new forms; old attempts retain original policies.
- Blocks: ASSEMBLY-001, EXAM-001/002, SCORE-001, WEB-001.

Scoped approval (H1 only): APPROVED BY HUMAN OWNER on 2026-10-17, recorded from the owner's TASK REPAIR-H1-001 instruction in this session. Approval identity: human project owner. Exact approved decision: “Each student may have at most ONE active examination attempt across ALL practice modes.” Active states are CREATED and IN_PROGRESS; modes are PERSONALIZED_PRACTICE and PUBLISHED_FIXED. A student with an existing active attempt cannot create another active attempt, may resume that attempt when its state permits, and may create a new attempt after the previous attempt reaches a terminal state. The owner explicitly stated, “This approval covers H1 only. Do NOT approve H2, H3, or the entire ADR-004.” No additional conditions were stated. The global database uniqueness and create-conflict contract below implement this scoped approval; timing, scoring, H2, H3 and the remaining ADR-004 proposal were not approved by that H1 instruction. Later separate H2/H3 approvals follow.

Scoped approval (H2): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-FIX-03A instruction, section 2: “Use admission-only windows. An attempt must be created and started during the applicable admission interval: [available_from, available_until). After a valid start, normal exam duration may extend beyond admission closing. Rights withdrawal and security invalidation remain independently enforceable.” This applies to each independently created domain test in either practice mode. It approves admission semantics only; the separate approved start-TTL scope is recorded below, and the rest of ADR-004 remains unapproved.

Scoped approval (H3): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-FIX-03A instruction, sections 2–4: “Each practice test contains exactly ONE TSA domain section”; the valid domains are MATH, READING and SCIENCE; “Each domain is a separate test with its own attempt, clock, submission, scoring result, and history. Do not automatically chain domain tests.” MVP profiles are 4 MATH, 2 READING and 4 SCIENCE questions per independent test. One section entry per MVP blueprint retains its opaque ID distinct from the domain enum. This is an MVP product constraint, not a permanent prohibition of generic multi-section blueprints. The overall ADR-004 remains PROPOSED; no unrelated ADR is approved.

Scoped approval (MVP Start TTL): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-TTL-001 instruction. Exact approved decision: new MVP attempts transitioning from CREATED to IN_PROGRESS have a mandatory 10-minute start TTL (600 seconds); unlimited start TTL is not approved. At creation, persist `start_before_at = min(created_at + 600 seconds, admission_until_at_creation)` as `TIMESTAMPTZ NOT NULL`. First start requires `now < start_before_at`; equality rejects. The stored deadline is immutable, `CreationReceipt.startBefore` uses it, `AttemptView.startBefore` returns it only while CREATED, and idempotent replay returns the original committed value. Missing or invalid required TTL configuration rejects creation or offering activation; it never falls back to unlimited time. Ordinary availability edits affecting already CREATED attempts are covered by the separate scoped approval below; withdrawal, rights and security guards remain independently enforceable. This scoped approval does not approve the remainder of ADR-004 or any unrelated ADR.

Scoped approval (non-retroactive ordinary admission-schedule edits): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-DECISION-001 instruction. Exact approved decision: ordinary edits to a form's admission schedule apply only to newly created attempts. An existing CREATED attempt preserves its originally committed start eligibility and immutable `start_before_at`; a later ordinary extension or shortening must not recalculate, invalidate, or otherwise change that deadline. An existing CREATED attempt may start strictly before its committed deadline if it remains CREATED, belongs to the authenticated student, and has no withdrawal, content-rights, or security-invalidation restriction. Do not recheck mutable current admission windows as an additional start-time restriction for that existing attempt. Explicit withdrawal, rights revocation, and security invalidation remain independent overriding restrictions. This approval is limited to ordinary admission-schedule edits and does not approve the remainder of ADR-004 or any unrelated ADR.

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
| Record scoped G0 implementation authorization? | RECORDED 2026-10-17: development and implementation are authorized within the scope and conditions above; paid LLM API calls remain prohibited until separately authorized. This is not approval of any ADR or production readiness. | Human owner / FOUND-004 |
| Approve initial technical/scope baseline? | ADR-001–004 plus ADR-007 as a coherent website bundle; ADR-005/008 for factory; document changes before dependent coding | Human owner / FOUND-004 |
| Who writes and independently reviews Vietnamese content? | Two distinct human actors; availability unknown | Human owner / DATA-002 |
| Enable a full TSA reference profile later? | Verify original structure image and newer official guidance; sufficient approved inventory | Human owner / FOUND-003, CONTENT-001 |
| Public or private pilot, ages, jurisdiction, identity provider and region? | No real-user launch until data-flow review and provider choice | Human owner / AUTH-001, OPS-001 |
| Budget, concurrent users, availability/RPO/RTO? | Measure against owner-specified traffic; research values are not commitments | Human owner / OPS-001 |
| Approve retention and incident invalidation policy? | Review proposed windows, withdrawal and erasure consequences | Human owner / OPS-001 |
| Which AI provider/model, input permissions and quality targets? | Evaluate early in independent Track A; no vendor preference approved | Human owner / AI-001/002 |

FOUND-004 has an independent review artifact and now has a scoped G0 implementation authorization record. Its broader owner disposition remains incomplete for unresolved ADR mechanisms, provider/data/budget/retention/rights/reviewer inputs and any other listed conditions. FOUND-005 owns reconciliation, not architectural approval. No approval is inferred from the reviewer's APPROVE_WITH_CHANGES recommendation.

## Phase 02.5 history and continuing owner choices

Historical reconciliation (superseded where Phase 02.75 amendments below conflict): ADR-003 revision 2 clarifies typed quota/taxonomy validation, shared contract CI enforcement, aggregate sealing assertions, role-filtered diagnostics, proposed active-attempt uniqueness and latest-only answer storage. ADR-004 revision 2 pins PRNG/shuffle behavior, exact score rounding, cancellation/admission/retake semantics, section uniqueness and preserves lifetime exposure. ADR-006 revision 2 adds lifecycle-pinned idempotency retention and shared database save throttling. ADR-001/002/005 remain revision 1; scope, stack and AI separation are unchanged. These revisions supersede draft text only, not an approved baseline.

| Choice | Alternatives and tradeoffs | Proposed selection / approval status |
|---|---|---|
| H1 Active attempts across modes | Parallel personal/fixed attempts add confusing sessions and simultaneous question-set allocation; one active attempt constrains UX without preventing answer sharing or sequential inventory exhaustion | APPROVED BY HUMAN OWNER on 2026-10-17 for one CREATED/IN_PROGRESS attempt per user globally across PERSONALIZED_PRACTICE and PUBLISHED_FIXED; a conflicting creation reports the existing attempt for permitted resume, and a new attempt is allowed after closure, including pending grading. Evidence: owner TASK REPAIR-H1-001 instruction quoted in ADR-004 scoped approval above. |
| H2 Availability meaning | Strict full-duration fit inside window closes admission early; admission-only window allows full duration after end and needs rights coverage beyond end | APPROVED BY HUMAN OWNER on 2026-10-17: `[from,until)` checked at create and first start; admitted clocks continue. Evidence: TASK FINAL-FIX-03A scoped approval above. |
| H3 MVP test composition | A combined 4/2/4 attempt forces three domains into one lifecycle; independent domain tests provide separate selection, timing and results | APPROVED BY HUMAN OWNER on 2026-10-17: exactly one MATH, READING or SCIENCE entry per MVP test/blueprint; separate attempt and result, no automatic chaining. Evidence: TASK FINAL-FIX-03A scoped approval above. Generic future multi-section modeling remains open. |
| MVP Start TTL | An unstarted reservation needs a bounded, durable start deadline without changing H2 admission-only semantics | APPROVED BY HUMAN OWNER on 2026-10-17: mandatory 600-second TTL; persist `min(created_at + 600 seconds, admission_until_at_creation)`, reject equality at first start, and do not fall back to unlimited time. Evidence: TASK FINAL-TTL-001 scoped approval above. |
| Ordinary admission edits after CREATED | Retroactive edits can invalidate a reservation after allocation; non-retroactive edits preserve a committed reservation while withdrawal, rights, and security remain able to block delivery | APPROVED BY HUMAN OWNER on 2026-10-17: ordinary admission schedule extensions/shortenings affect only future creation requests. Existing CREATED attempts retain their committed immutable `start_before_at` and may start strictly before it without a mutable-current-window check, subject to state, ownership, withdrawal, rights, and security guards. Evidence: TASK FINAL-DECISION-001 scoped approval above. |

ADR-004 remains PROPOSED as a whole. H1, H2, MVP H3, the separate MVP Start TTL, and non-retroactive ordinary admission-schedule edits are scoped approvals; their dependent contracts still require synchronized implementation review. Additional owner review: ADR-003 role trust/disclosure and no full answer-edit history; ADR-006 retention floors, rate defaults and operational budget. No claim that rate numbers are load-tested or retention is legally approved.

Impact/migration: H1 changes attempts uniqueness and create-conflict API; H2 changes catalog metadata, start guard and cancellation reasons; H3 replaces the combined MVP fixture with three independently offered one-section profiles, affecting blueprint validation, form sections, student selection, timing, results and history. Quota typing adds a required taxonomyVersionId; diagnostics add a restricted read endpoint; rate limits add one small ephemeral DB table; retention adds a nullable related-attempt link/expiry semantics. Affected tasks: FOUND-002, DATA-001, AUTH-001, ASSEMBLY-001, EXAM-001/002, SCORE-001, WEB-001/002 and OPS-001. There is no deployed data/code to migrate. Future persisted combined forms would require versioned compatibility, never mutation of historical snapshots. Coordinate strict-client contract regeneration and one-domain fixture tests. If a future bundle is approved, add a separate grouping contract without rewriting domain attempts or manufacturing an official aggregate score. No new service, secure-exam feature, forensic store or full-TSA scope is introduced.

## Phase 02.75 owner requirements and revision impact

Recorded 2026-10-16 from the owner's Phase 02.75 assignment: “The website must NEVER require live LLM inference to create or complete a student exam”; “PERSONALIZED_PRACTICE is the default mode”; prior assignments exclude stable question identity for that student, concurrent requests must not bypass this rule, different students may reuse questions, shortage must be explicit, and both research and website tracks begin early. These are authoritative product requirements, **not approval of the implementation choices below**. At that time no architectural approval identity/evidence existed; the later, narrowly scoped H1 approval is recorded above.

Phase 02.75 proposed revisions: ADR-001 r2 adds a separately executable factory runtime in the same repository; ADR-002 r2 places strict personalized no-repeat in MVP and starts independent AI research early; ADR-003 r3 adds ownership, compact assignment history, equivalence groups and factory import contracts; ADR-004 r3 replaces global exposure caps with per-user eligibility. Its earlier fixed-form H1 proposal is superseded by the scoped global H1 approval above. ADR-005 r2 is early draft-only research/production, not deferred until the website; ADR-006 r3 adds factory credentials/resource limits, create throttling and active-account compact history retention. Other timing/scoring/immutability/approval safeguards remain valid. Previous review reports describe their historical baseline and are preserved verbatim.

Migration impact: proposed create/catalog/result DTOs, forms/attempt constraints, assembly manifests, allocation transactions, bank eligibility revision, retention and task dependencies change together. There is no implemented schema to migrate. A future upgrade must backfill stable-ID assignments from every retained form/attempt before NEW_ONLY is enabled; missing historical evidence must be disclosed, never presented as complete no-repeat. Backfill singleton/confirmed equivalence groups and mode/ownership from proven records, not guesses. Rollback must disable new admissions if readers are incompatible, preserve history/snapshots and keep supported old readers; never discard history to restore availability. No mandatory quota or no-repeat fallback is authorized.

## ADR-007 — Personalized allocation and question reuse

- Status: PROPOSED; approval: none; revision: 1.
- Problem: reusable global stock must provide strictly unseen assignments per student, including corrected versions, equivalent variants and concurrent creation.
- Options: global consumption; version-only history; stable-ID history checked without locking; stable-ID history plus canonical equivalence and per-user transactional allocation.
- Proposed choice: final option, [reuse policy](../specifications/QUESTION_REUSE_POLICY.md) and [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md). One snapshot schema supports owned personal forms and shared fixed forms. Assignment occurs at CREATED commit; conservative monotonic equivalence merges; explicit opt-in review/fixed modes.
- Tradeoffs: compact active-account history, personal snapshots and protected replay manifests cost storage. Abandoned allocations exhaust small banks sooner. Per-user serialization limits races without globally serializing different students; shared/exclusive bank revision guard coordinates publication. Late-discovered equivalence cannot retroactively prevent past assignments.
- Consequences: shortage is a normal explicit outcome, never silent repetition or a live AI request. The owner-approved 600-second MVP start TTL bounds first-start admission, not assignment retention; equivalence adjudication, retention/erasure and explicit-repeat UX remain owner decisions. Different students share inventory; global usage is analytics only.
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
