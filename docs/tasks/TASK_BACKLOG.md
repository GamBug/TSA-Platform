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

Owner disposition, 2026-10-19: **G1 ACCEPTED; FOUND-002 COMPLETED** against
implementation `0e67485` and audit baseline `81ef8aa`. Mandatory evidence in the
[final audit](../reviews/G1_ACCEPTANCE_AUDIT.md) is satisfied. Scoped owner record:
[OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md#g1--owner-acceptance-and-bounded-track-b-execution-2026-10-19).
G2/G3 and unresolved downstream decisions remain pending. Earlier pending-G1
statements below describe historical checkpoints, superseded by this disposition.


Final G1 acceptance audit COMPLETED, 2026-10-19; recommendation READY FOR OWNER
ACCEPTANCE, not gate approval. Audited code `0e67485`: Luna / XHigh repaired the
missing shared job-kind contract; Sol / Medium independently reviewed the actual
diff and reproduced the full pinned-toolchain sequence in a fresh clean Git clone.
106 contract tests and 11 emitted-consumer tests pass; four-artifact drift,
import boundary, docs, clean diff and refreshed dependency/license/advisory checks
pass. Hosted CI remains unobserved, not a G1 blocker under existing criteria.
See the [criterion/evidence audit](../reviews/G1_ACCEPTANCE_AUDIT.md) and
[proposed prerequisite batch](IMPLEMENTATION_ROADMAP.md#proposed-post-g1-prerequisite-batch--2026-10-19).
FOUND-002 remains IN_PROGRESS pending explicit owner acceptance; G1 NOT ESTABLISHED;
DATA-001 BLOCKED. All worker reservations released; owner AGENTS.md preserved.
No downstream implementation or automatic gate advancement.

Stage 4B authorized engineering batch COMPLETED, 2026-10-19; FOUND-002 remains
IN_PROGRESS pending owner acceptance/G1 disposition. No automatic G1 advancement.
Branch `feat/found-002-stage4b-contracts`, base `8beb0ff`:

- `07ced30`: D2 identity/fingerprint; scoped D1/FOUND-007 acceptance record.
- `d65e08b`: D4 complete bounded Factory v2 transport and DRAFT receipts.
- `8a09b92`, `3af1b34`: D3 assembly/replay, stress/goldens and stale-shortage repair.
- `a6ec4ad`: D5/D6 consumer entries, generated routes and actual GET egress.

One native Luna / XHigh builder implemented the contracts; Sol / Medium reviewed
and integrated. After worker usage/capacity errors, coordinator completed bounded
import-fence/emitted-test/CI/README repairs; no model fallback. All reservations
released. Full local build/smoke/typecheck, 102 contract tests, 10 emitted-consumer
tests, four-artifact drift, import boundary, docs and diff checks pass. See
[handoff](../agents/LAST_HANDOFF.md) for failures, evidence limits and criteria map.
Root v1 schemas, 18 legacy public schemas, dependencies/lockfile and owner AGENTS.md
bytes are preserved. New consumer subpaths are approved D6 additions. No push,
merge, deploy, paid API, Astra or G1 advancement. No READY D1–D6 engineering work
remains; owner gate disposition is next. Later database/auth/bank work stays gated.

Stage 4A completed, 2026-10-19: owner "STAGE 4A — BOUNDED AUTOPILOT ACTIVATION"
authorized READY G1-preparation evidence and local commits. Branch
`feat/found-002-stage4a-evidence`, base `84ddff3`; engineering checkpoint `dadd60e`.
Native `tsa_builder` Luna / XHigh implemented five emitted-consumer runtime/type
checks plus CI/README command; native `tsa_scout` Luna / XHigh collected read-only
dependency inventory. Coordinator Sol 6.1 / Medium independently reviewed the diff,
reran required checks and completed online advisory/license evidence. Ownership
released; owner `AGENTS.md` preserved. See [handoff](../agents/LAST_HANDOFF.md),
[dependency review](../reviews/FOUND002_STAGE4A_DEPENDENCIES.md) and the single
[decision packet](../reviews/G1_STAGE4A_DECISIONS.md) for READY/BLOCKED/DEPENDENT
classification and remaining owner choices. No contracts/semantics/dependencies,
push/merge/deploy or G1 change. At that historical checkpoint Stage 4B was NOT STARTED.

Stage 3 pilot finalized, 2026-10-19: `tsa_builder` (verified Luna / XHigh)
implemented source JS/declaration build, emitted-JavaScript smoke, CI and README
commands from accepted setup `0be1384`. Coordinator Sol 6.1 / Medium independently
reviewed the diff and passed all required local checks; ownership released.
The owner authorized two local commits in "STAGE 3 FINALIZATION AND STAGE 4
READINESS"; no push/merge. See [evidence](../agents/LAST_HANDOFF.md) and the
[proposed Stage 4 batch](IMPLEMENTATION_ROADMAP.md#proposed-stage-4-bounded-autopilot--2026-10-19).
FOUND-002 remains IN_PROGRESS; G1 NOT ESTABLISHED; DATA-001 BLOCKED.

Reconciliation acceptance (HI-04/CR-02): starts only after G0, whose owner disposition reviews the completed FOUND-005/006 evidence. FOUND-002's accepted deliverables establish G1; G1 is not a prerequisite of FOUND-002. One runtime schema source; CI regenerates committed OpenAPI/client artifacts and fails on content drift; producer/consumer positive and negative fixtures are required. A changed response or stale generated file must fail; an optional field passes only after coordinated regeneration and strict-consumer checks. Pin the documented PRNG vectors plus complete search/canonicalization fixtures before parallel consumers.

- Objective/scope: initialize approved stack, schemas/client artifacts, CI and development run instructions; freeze renderer/PRNG/canonicalization behavior with fixtures.
- Prerequisites: G0 and owner implementation assignment. Files: package manifests, src/contracts/**, src/app skeleton, tests/contract/**, CI config, approved development docs; no bank/attempt features yet.
- Deliverables: pinned supported versions, runtime validators/OpenAPI/student-safe types, reproducible local/CI entry points. Acceptance: a fresh checkout installs/builds from lockfile; question/blueprint/API examples validate; private types cannot import into student bundle; all commands documented.
- Required tests: typecheck/build, strict schema fixtures, unknown-field/type rejection, generated contract drift checks. Required version/license/advisory review recorded.
- Priority P0; complexity M; risks: contract drift and confusing reference evidence with deployed enforcement. Status: COMPLETED under explicit owner G1 acceptance, 2026-10-19; accepted implementation `0e67485`, final audit `81ef8aa`; existing contract acceptance only. Earlier Slices 1–7 and Stage 3/4A evidence remain in Git (`84ddff3`/`8beb0ff` handoffs). Current executable scope, tests and remaining evidence limits are in the latest handoff. Implementer: native tsa_builder Luna / XHigh; accountable coordinator/reviewer and bounded integration repairer: Sol 6.1 / Medium. No production application, database migration, provider or publication implementation is claimed.

## DATA-001 — Relational integrity foundation

Local relational foundation COMPLETED, 2026-10-19, under scoped owner DATA/AUTH
approval `7364882`; bank core `7885331`, followed by migration002. Branch
`feat/track-b-data-auth`, base `446277f`. One reused native tsa_builder,
Codex Luna/XHigh implemented the reserved SQL/fixtures; Sol/Medium independently
reviewed code, required bounded repairs and reran actual PostgreSQL tests.
`npm run test:db:foundation`: 34 reported tests PASS, zero failures/skips on
PostgreSQL18.6. Fresh/reapply/checksum/order/failure rollback, populated001→002,
immutable versions/snapshots/child links, JSON/relational consistency, private
role/RLS boundaries, composite ownership/form/score FKs and unique score/job
writes verified. Real two-client lock barriers cover both cross-mode H1 winners,
distinct users, rollback, cancel/start and strict history serialization; corrected
versions remain excluded by stable identity. DB-clock600/capped start bounds,
non-retroactive schedule edits, pending-grading pin and expired-reservation
cleanup preserve history/receipt/deadline. Missing tools fail explicitly.

Application allocation/start/save/cleanup APIs, rights fan-out, worker lease
claim/finalization and end-to-end scoring remain their ASSEMBLY/EXAM/SCORE tasks;
fixture SQL transactions do not establish those services. No production-data
migration or deployment is claimed. Historical001 synthetic rows retain NULL
original timestamp/xid where evidence was absent; no identity bytes fabricated.
Both worker reservations released. Owner AGENTS.md hash remains unchanged and
excluded. Accepted contract tree remains identical to `0e67485`. Root pg8.23.1
and all14 additions have license/advisory and clean-install evidence in the
existing dependency review; no ORM/framework. AUTH local path is now READY.

Bounded approved-invariant preflight COMPLETED (partial prerequisite evidence only),
2026-10-19, under the owner
Track B batch after B0.1 verification/commit `06849d0`. One reused native
`tsa_builder`, Codex Luna / XHigh owns only
`tests/integration/database/approved-invariants/**`; Sol / Medium owns root npm
entrypoint and shared records/review. Disposable local PostgreSQL 18.6 fixture
probes only: approved H1 global active-attempt uniqueness and immutable TTL600/
creation-window-capped deadline. No production migration, framework/driver install,
application adapter, general DB/ADR adoption, auth or publication. Required evidence:
both same-user mode winner orders with real lock barriers, distinct-user success,
terminal/rollback behavior, capped/immutable deadline and exact exclusive boundary.
Independent Sol / Medium review repaired spawn-error cleanup handling and replaced
sequential distinct-user assertions with actual separate-connection commits while
the winner remained uncommitted. Coordinator independently ran the final probe:
11 named checks PASS on PostgreSQL 18.6, both Lock barriers/23505 losers, real
concurrent distinct-user success, terminal/rollback/deadline/immutability boundaries;
private cluster/socket/process cleanup verified. Missing-binary negative exits
nonzero with a clear diagnostic, never a skipped PASS. Worker ownership released.
At this historical preflight checkpoint, full migration scope was blocked. The
scoped owner DATA/AUTH approval above now authorizes local implementation; this
preflight alone still proves no application start/auth/migration acceptance.


Phase 02.75 acceptance: stable question history PK(user,question), allocation revision row, canonical singleton/merged equivalence groups, bank eligibility revision, offering windows, personal owner/one-attempt constraints and fixed-mode compatibility. Two-connection strict allocations cannot overlap; corrected versions stay excluded. Factory migration files are separately reserved by FACTORY-001.

Reconciliation acceptance (CR-01/HI-01/MD-02/04/05): implement owner-approved global H1 uniqueness, H2 admission-only bounds, H3 one-domain MVP form support and the immutable 600-second start-deadline field, alongside cancellation constraints, blueprint taxonomy FK, lifecycle-pinned idempotency records and shared save buckets. Ordinary availability edits are owner-approved as non-retroactive: existing CREATED deadlines remain captured, while future admission uses the current window. Tests require two-connection create races, stale-active cleanup, cancellation/start ordering, immutable deadline replay, cleanup after pending grading and transaction rollback on invalid sealed aggregates. These are requirements, not tests executed in Phase 02.5.

- Objective/scope: implement MVP tables, constraints, immutable triggers, reviewed migrations and test fixtures; include per-user history/equivalence/offerings; coordinate factory migrations with FACTORY-001 rather than duplicate ownership.
- Prerequisites: FOUND-002, G1. Files: db/**, src/modules database adapters, tests/integration/database/**.
- Deliverables: schema/migrations and seeded synthetic fixtures. Acceptance: cross-form answers, mismatched version links, immutable edits and duplicate score/job writes rejected; schema upgrade preserves history.
- Required tests: fresh migration and populated upgrade, FK/check/unique failures, rollback compatibility, real PostgreSQL concurrency/lock ordering and transaction rollback.
- Priority P0; complexity L; risks: JSON/relational drift, irreversible migrations. Status: COMPLETED for the approved local relational foundation; acceptance evidence and runtime scope limits above. Suggested implementer: database engineer; review: backend/data-integrity reviewer. Actual assignee: none.

## AUTH-001 — Identity and authorization

Local development sub-acceptance COMPLETED, 2026-10-19, after DATA-001
`37c9f6a` and scoped owner approval `7364882`. Luna/XHigh implemented migration003,
the activation-checked local identity service and HTTP adapter; Sol/Medium independently
reviewed the diff and reran `npm run test:auth` (5/5) and
`npm run test:db:foundation` (34/34) on real disposable PostgreSQL18.6.
Production process/configuration, non-loopback origin, privileged connection and
foreign identity realm refuse activation. HTTP origin/Host/CSRF, rotated/revoked/
expired sessions, current roles/disabled users, role isolation and own-object/no
foreign-save-side-effect negatives pass. Ownership routes are test-harness routes,
not implemented exam APIs. Real OIDC issuer/audience/redirect and MFA verification
remain production sub-acceptance requirements. Owner AGENTS.md is excluded.

Phase 02.75 acceptance: factory service cannot read student histories/attempts or approve/publish; website has no model credentials. Personal form/manifest ownership must fail closed; test factory/web/job-kind credential boundaries.

Reconciliation acceptance (HI-05/MD-05): role-test diagnostic projections and new BANK_MANAGER diagnostics read; EXAM_MANAGER alone cannot enumerate manifest/candidate pools. Own-object authorization occurs before save-bucket creation; unauthorized IDs create no buckets. Coordinate shared throttling contract with EXAM-001 and DB schema from DATA-001.

- Objective/scope: OIDC/session adapter, role policies and own-object checks; local synthetic-data stub only if explicitly approved.
- Development prerequisites: G0, FOUND-002, DATA-001 and explicit owner-scoped approval for a local synthetic-data stub. G2 and production provider configuration are not prerequisites for this authorized local development path. Files: src/modules/identity/**, auth HTTP adapters, tests/security/auth/**.
- Production configuration prerequisites: G2, the completed ADR-006 data-flow/provider review, and separate owner authorization for real-user deployment. These do not authorize production deployment merely because local development acceptance exists.
- Deliverables: secure sessions, CSRF/origin checks, roles, staff MFA integration and negative fixtures. Development acceptance: users cannot inspect others' attempts; authors cannot self-approve; disabled sessions/roles enforced server-side. Production acceptance additionally requires the approved production issuer, audience, redirects, data flow and deployment controls.
- Lifecycle interpretation: G2 consumes the accepted local AUTH-001 security/authorization evidence. The post-G2 production-configuration sub-acceptance is not a prerequisite to complete AUTH-001 in the task/gate graph and cannot create a G2 cycle.
- Required tests: cookie/session invalidation, issuer/audience/redirect validation, CSRF, role escalation, BOLA and object-property access. Stub must be impossible to enable in production.
- Priority P0; complexity M; risks: provider/data policy unknown. Status: COMPLETED for the approved local synthetic-only development adapter; production configuration remains separately blocked. Suggested implementer: backend/security engineer; review: independent security reviewer. Actual assignee: none.

## DATA-002 — Lawful starter dataset

Phase 02.75 acceptance: demonstrate two disjoint mini-profile attempts for one student and reuse across two students; report actual quota/bundle-limited capacity, not 30/10 as guaranteed capacity.

- Objective/scope: author the 30-question starter inventory and taxonomy described in MVP; prepare independent reviewer evidence.
- Prerequisites: ADR-002/003 approved, named human author/reviewer; import validation depends on BANK-001. Files: data/original/**, data/taxonomy/**, provenance manifests; do not copy protected research examples.
- Deliverables: source/rights attestations, three interaction types, shared reading bundle, keys/explanations and review records. Acceptance: correct per-section count, lawful assets, no unresolved ambiguity/duplicate flags, two-person content review.
- Required tests: schema/import dry run, deterministic answer checks where applicable, manual alternate-answer and Vietnamese clarity review, rights completeness and inventory feasibility.
- Priority P0; complexity L; risks: SME availability, unrecognized adaptation rights. Status: BLOCKED (scope approval and reviewers). Suggested implementer: content engineer + human author; review: independent subject expert. Actual assignee: none.

## BANK-001 — Import, versioning and approval commands

Manual ingestion sub-acceptance VERIFIED, 2026-10-19, after AUTH `6f73272`.
Luna/XHigh implemented migration004, source/rights registration, immutable MANUAL/
IMPORTED drafts/revisions and metadata-only `/api/v1/questions` listing. Sol/Medium
reviewed code/diff and independently ran Bank10/10, DATA34/34 and AUTH5/5 tests.
Evidence includes observed SQL-lock barriers, target-scoped replay/conflicts,
exact microsecond dates/cursors, all three interactions, private graph storage,
legacy003→004 preservation, role/BOLA/CSRF and missing-reference rollback.
New versions stay DRAFT; fingerprints create OPEN flags without confirmation or
merges. Rights edits affecting selected content fail closed until hold/fan-out
exists. No review/publication, eligible pointer, canonical Factory import receipt,
arbitrary stimulus import or approved inventory acceptance follows from this slice.
Manual checkpoint committed as `679c380`. Same-app staff integration VERIFIED:
Luna/XHigh implemented the existing frontend workspace and private persistent local
runtime; Sol independently verified 13 PostgreSQL/HTTP tests, both Chromium
journeys, 11 B0 tests and the actual localhost startup command. Author login,
private template editing, DRAFT creation and metadata reload/restart persistence
are real; lost-response retries reuse their request identity. Candidate access is
denied. Rights remain UNKNOWN, and the exam remains explicitly mock. No schema,
dependency or contract change in this slice. Worker reservation released.
At the staff checkpoint, bounded canonical transport mapping was next (verified below),
with Terra/Medium justified by immutable identity/graph normalization and atomic
receipt/asset persistence. Sol owns shared records and independent verification.
One writing worker at a time.

Canonical Factory v2 ingestion sub-acceptance VERIFIED, 2026-10-20, `d376791`.
Terra/Medium implemented the bounded normalization/receipt checkpoint; Luna/XHigh
completed replay integrity and missing acceptance fixtures; Sol independently
reviewed the final diff and verified Bank21/21, DATA34/34, AUTH5/5 and local13/13.
Whole declared packages commit atomically as DRAFT, with private immutable
manifests/graphs/bytes and exact candidate receipts. Changed manifests conflict;
replay verifies stored graphs/mappings/byte digests, preserves original receipt
order, and permits later workflow changes. Original authored timestamps, ancestry,
origin, external generation identity and hashes survive SQL normalization.
Cross-batch exact ancestor reuse, actual HTTP correction, observed two-worker
lock waits, late second-candidate rollback, corruption negatives and populated
004→005 preservation pass. Private import tables deny web/Factory/exam/identity
roles. Receipt FKs bind matching question/version/hash. Package rights remain
unverified private claims, not human decisions/current rights/publication.

This is a trusted internal AUTHOR/operator command with a separate in-process
capability and restricted Bank connection, not deployed Factory authentication or
a public generation route. No public asset delivery/sanitization, producer/export
completeness, BANK-002/INT-002 acceptance or production stock is claimed. Manual
`679c380`, staff `021dec0`, transport `d376791` are local checkpoints. No writing
reservation remains. Named independent human review and lawful stock block the
next publication/inventory tasks; parent BANK-001 outcome remains IN_PROGRESS.

Phase 02.75 acceptance: singleton/confirmed equivalence adjudication before publication, current-group joins preserve prior history after merge; late-equivalence incident recorded without rewriting snapshots. Canonical factory imports verify hash/receipt atomically, reject changed content under same key and never inherit APPROVED from a package.

- Objective/scope: source/rights registration, validated question/stimulus/bundle import, versions, workflow and exact/flagged duplicate checks.
- Prerequisites: DATA-001, AUTH-001 and G1 frozen contracts. Files: src/modules/sources/**, src/modules/bank/**, staff bank HTTP adapters, tests/integration/bank/**.
- Deliverables: import dry-run/report, author/review commands, approval/quarantine audit and eligibility pointer. Acceptance: edits create versions; no approval carryover/self-approval; rights/validator failures block publication; holds immediately affect delivery checks.
- Required tests: workflow transitions, duplicate fingerprints, stale revision/approval hash, source revocation, concurrent approve/withdraw and asset sanitization.
- Priority P0; complexity L; risks: approval bypass, unsafe content, rights race. Status: IN_PROGRESS; manual ingestion verified, remaining transport/workflow scope and BANK-002 publication evidence outstanding. Suggested implementer: bank/backend engineer; review: domain/security reviewer. Actual assignee: none.

## ASSEMBLY-001 — Reproducible starter exam assembly

2026-10-22 shared-reading integration **IMPLEMENTED / VERIFIED** from `7cee125`:
original correct-taxonomy READING2 ALL_OR_NONE passage fixture now runs through
existing HTTP/client/browser, saved answers/reload, per-question50%/100% scoring,
owned result/review/history and passage-only rights cancellation/invalidation.
Exact sealed snapshots/history remain unchanged. Added explicit disposable reading
demo with production/opt-in/profile guards; no schema/public contract/publication
capability or retained stock changes. Actual focused4/student19/assembly49/B031/
contracts106/consumers11/build/typecheck/drift/import and Chromium reading32/default/
domains78 PASS. Separate read-only Sol6.1/Medium no P1/P2; independently syntax/
whitespace PASS, no PG/browser execution claim. Accountable implementer Sol6.1;
[commands, failures/fixes and limits](../reviews/WEB_001_SHARED_READING_VERIFICATION.md).
All reservations released; AGENTS/research preserved. Full milestone, lawful
inventory, named human review and manual accessibility remain distinct. Next
EXAM-002/OPS-001: test-only separate app/worker OS-process crash/restart against
live isolated PostgreSQL, original clocks/answers and exactly-one graded release.
Recommended Sol6.1/High while Luna is usage-limited, separate Sol6.1/Medium review.

2026-10-22 bundle-aware NEW_ONLY backend **IMPLEMENTED / VERIFIED** from
`8db27a1`; accountable Sol6.1. Additive SQL018 reuses existing immutable stimulus/
bundle tables and frozen solver; internal capture emits complete ordered units,
final SQL rechecks full membership/history/equivalence/rights/conflicts, counts
member quotas/source caps, persists bundle IDs and exact stimulus snapshots.
Metadata writes use existing publication guard/revision. No applied migration,
public contract, grant, publication or UI redesign changes. Actual focused26 and
fullassembly49 PASS; [full verification and separate engineering review](../reviews/ASSEMBLY_BUNDLE_ALLOCATION_VERIFICATION.md).
All implementing reservations released. Owner AGENTS/research preserved.
Full ASSEMBLY-001/002 acceptance remains open; historical singleton-only statements
below describe prior checkpoints and are superseded for NEW_ONLY bundle allocation.
Next: correct-taxonomy original READING2 shared-passage HTTP/client/browser journey,
then lawful human-reviewed inventory and qualified manual accessibility evidence.
Recommended Sol6.1/High while Luna is usage-limited; separate Sol6.1/Medium integration
review. Synthetic workflow and agent engineering review are not human approval.

2026-10-21 bounded atomic allocation **IMPLEMENTED / VERIFIED**, local checkpoint
**`6fc219e`** from `c0b42b5`; full ASSEMBLY-001/002 remain IN_PROGRESS for broader scope
and acceptance. [Owner scope](../decisions/OPEN_DECISIONS.md#atomic-allocation-engineering-authorization--2026-10-21).
Sol owns integrated SQL010, exact public/private/form hashes and lifecycle/admission
boundaries; actual Luna/XHigh authored the service/main PG fixtures/tests. Separate
actual Sol6.1/Medium read-only review PASS23 assembly +94 Bank, reproduced/repaired
cross-mode H1 precedence, no unresolved P1/P2. Final coordinator assembly23, Bank94,
DATA34, AUTH5, local13, B0 16, contracts106, emitted11 and build/typecheck/drift/import
PASS. [Complete commands, A–O evidence and limits](../reviews/ASSEMBLY_001_002_ATOMIC_ALLOCATION_VERIFICATION.md).

Standalone NEW_ONLY now atomically commits manifest/sealed form+private snapshots,
CREATED attempt, history/revision, receipt and audit under a persistent user lock
and shared Bank guard. Exact receipt replay precedes global H1; stale plans replan
at most three total attempts. Actual PG waiter barriers, separate-user concurrent
uncommitted success, twelve persistence/commit faults, correction/equivalence,
rights/quarantine races and committed stale-attempt cleanup pass. Immutable rows,
no history consumption on rollback, safe errors and exact stored deadlines hold.
No Bank feature expansion, frozen contract/dependency/UI/research changes.

Applicable bundles still explicitly reject; review/fixed allocation remains503
(after correct global H1/replay precedence). No student HTTP/rate integration or
full delivery/grader is claimed. Full milestones/G2/G3 remain unaccepted; lawful
inventory/qualified human publication evidence remains separate from engineering.
All implementing reservations released; shared records remain with coordinator.
**Next:** EXAM-001 owned persisted start and safe GET delivery from sealed snapshots,
with creation transport/rate wiring, exact timing/BOLA/hold/restart tests; then saved
answers, closure and grading/results. Recommended Codex Sol6.1/High for coupled SQL/
authorization timing, isolated Luna/XHigh fixtures if available (Sol fallback),
separate Sol6.1/Medium independent security review; no dispatch implied.
Historical allocation-next/blocked engineering statements below are superseded.

2026-10-21 authorized synthetic backend groundwork **IN_PROGRESS**: SQL009 and
`src/modules/assembly/candidate-stock.mjs` capture real-PG current approved stock,
exact hashes/current rights, canonical groups/conflicts and authenticated NEW_ONLY
history into frozen assembly/1. Positive solver, skill-code→UUID quota, history,
rights-window and role negatives PASS1 integration scenario; independent review
included in PASS38. No allocation writes/public stock disclosure. Applicable
stimulus bundles explicitly unsupported; no partial-pool shortage claim.
Acceptance and real inventory remain outstanding; this owner authorization
supersedes the historical engineering-blocked status below for this bounded work.

**Next executable card — ASSEMBLY-001/002 standalone NEW_ONLY allocation:** Sol
owns `src/modules/assembly/**`, additive DB adapters and isolated PG transaction
fixtures. Implement persistent per-user lock/H1 reconciliation, retained receipt
replay, final shared advisory+Bank-row revision/rights/history/offering recheck,
and atomic manifest + sealed personal snapshots + CREATED attempt + first-history
+ revision + receipt. Preserve 600-second deadline, no-repeat and no partial writes.
Prove two-connection same-user/different-user/key races, correction/equivalence
history, stale-manifest replan, rollback and revocation-at-seal. Full acceptance
still requires bundle capture/completeness. Use only isolated synthetic stock;
no real publication/G2 acceptance follows. Recommended Codex Sol6.1/High for the
coupled transaction, isolated Luna/XHigh fixtures if available (Sol fallback),
separate Sol6.1/Medium independent security/concurrency review; no new dispatch
implied. Then integrate EXAM-001/002 and SCORE-001, without live model calls.

Phase 02.75 acceptance: atomic personal form+attempt+history+receipt; allocation user lock then shared bank guard, revision recheck and bounded replans; review/fixed assignments also write history. Tests C–H include same-user different-blueprint races, corrected versions, equivalence merges, rollback, shortage versus unknown search exhaustion, TTL abandonment and explicit alternatives.

Reconciliation acceptance (CR-02/HI-02/05/MD-01/02/03): test all three unsigned PRNG vectors and shuffle order; enforce the approved MVP one-domain profiles (MATH 4, READING 2, SCIENCE 4), reject wrong-dimension values, foreign taxonomy and repeated MVP sections/quotas, while preserving generic future multi-section storage. Inject sealing mismatch after valid blueprint validation and assert rollback. Global usage is analytics only; withdrawal never resets assignments and replay never assigns twice. Role diagnostics tests exclude private candidate pools from EXAM_MANAGER errors.

- Objective/scope: blueprint validation, manifest capture, bounded selection, personalized snapshot sealing and assignment history.
- Prerequisites: BANK-001, DATA-002 accepted inventory, G1. Files: src/modules/assembly/**, assembly HTTP adapters, tests/assembly/**.
- Deliverables: mini-profile assembler with diagnostics and replay. Acceptance: every hard constraint holds; correct bundle ordering; no duplicate identities; stored manifest+seed replays; same-user concurrent allocations disjoint; different users may reuse stock; no partial forms.
- Required tests: golden seed replay, invariant/property fixtures, feasible/infeasible/search-exhausted distinctions, revocation/approval race and idempotent sealing.
- Priority P0; complexity M; risks: bounded search false infeasibility claims, moving pool. Status: BLOCKED (bank/inventory). Suggested implementer: algorithm/backend engineer; review: independent algorithm/data reviewer. Actual assignee: none.

## EXAM-001 — Attempt start, delivery and persisted answers

2026-10-21 bounded revisioned-save engineering **`cda1235` IMPLEMENTED / VERIFIED** from
`b55afb1`. [Owner authority](../decisions/OPEN_DECISIONS.md#persisted-answer-save-continuation--2026-10-21).
SQL012 and safe PUT now persist typed answers/revisions, exact receipts and audit;
owned slot preauthorization and shared dual budgets precede locked writes. Actual
PostgreSQL attempts15/assembly23/Bank94/DATA34/AUTH5/local13/B0 16/contracts106/
emitted11 PASS; build/typecheck/drift/import PASS. Separate read-only Sol6.1/Medium
review independently passed attempts15/Bank94/final save subset5, no open P1/P2.
[Executed evidence and limitations](../reviews/EXAM_001_ANSWER_SAVE_VERIFICATION.md).
Actual Luna/XHigh service/HTTP/tests, Sol SQL/races/integration; all reservations
released. EXAM-001 remains IN_PROGRESS for integrated acceptance; no prototype
server/UI wiring. Next EXAM-002 owned submit/closure plus atomic grade-job enqueue,
then scoring/released results. No submission/grade completion or G2/G3 acceptance.

2026-10-21 persisted start/safe GET slice **IN_PROGRESS** from `6fc219e` under
[owner continuation](../decisions/OPEN_DECISIONS.md#persisted-attempt-start-and-safe-delivery-continuation--2026-10-21).
Sol owns SQL011, integration and authoritative records. Actual native Luna/XHigh
owns new attempt service, HTTP adapter and isolated attempt tests only; separate
Sol6.1/Medium reviews read-only. Preserve all unrelated owner files. Reuse frozen
GET boundary in one guarded transaction; strict create/start transport, supplied
local USER_CREATE budget, exact persisted deadlines, current rights/holds, no keys
or explanations. No saves/submit/grade/result/UI completion in this slice.
Bounded start/read implementation is complete in local `b55afb1`; actual PostgreSQL/HTTP evidence and
independent review are recorded in [verification](../reviews/EXAM_001_START_DELIVERY_VERIFICATION.md).
Full EXAM-001 remains IN_PROGRESS for revisioned answer saves. Next implement
owned active-slot saves with exact-key replay, stale revisions and independent
USER_SAVE limits; then submission/scoring. App server/UI still uses mock exams.
No qualified human content review or G2/G3 acceptance is implied.

Phase 02.75 acceptance: owner-approved H1 applies globally across all modes, with at most one active CREATED/IN_PROGRESS attempt per student; personal forms have one owner/attempt. No reselection at start; all assigned slots persist in history after cancellation/expiry/invalidation. Test USER_CREATE throttling independently of saves/submission and retry after receipt expiry without repetition.

Reconciliation acceptance (CR-01/HI-01/03/MD-04/05): implement the scoped H1/H2/H3 approvals and mandatory 600-second start TTL: one global active attempt, admission-only `[available_from, available_until)`, one independently timed/scored domain test, and immutable `start_before_at = min(created_at + 600 seconds, admission_until_at_creation)`. Test distinct-key concurrent create, same-key replay, closed-attempt retake, not-open/exact-close admission, first start just before/equal to the stored deadline, late admitted completion, CREATED lazy cancellation, and long-lived receipt replay. The recorded non-retroactive ordinary admission-schedule decision preserves the committed deadline for an already CREATED attempt; independently enforce withdrawal, rights and security guards, and verify both ordinary shortening and extension cases. Exercise both rate buckets across two server instances; 429 has Retry-After, no save/receipt mutation, preserves client pending edits, and does not throttle submit via the save bucket.

- Objective/scope: create/start attempt, fixed section clocks, safe delivery, revisioned autosave/resume.
- Prerequisites: ASSEMBLY-001, AUTH-001. Files: src/modules/attempts/** (start/read/save), student HTTP adapters, tests/integration/attempts/**.
- Deliverables: candidate-safe endpoints with acknowledged save revisions. Acceptance: no timer reset, no future/previous section content, own-form slot integrity, safe cross-tab conflict response.
- Required tests: boundary timestamps using controlled server clock, BOLA, serialization leakage, lost acknowledgement replay, stale revision and restart persistence.
- Priority P0; complexity L; risks: clock/caching leaks and overwrite races. Status: IN_PROGRESS (bounded start/read/save complete; integrated acceptance outstanding). Actual accountable implementer: Codex Sol, isolated Luna/XHigh service/HTTP/tests; separate read-only Sol6.1/Medium engineering review. All current writer reservations released at handoff.

## EXAM-002 — Submission, expiry and recovery

2026-10-22 rights-during-outage **IMPLEMENTED / VERIFIED** from `ebb25f2`:
actual SIGKILL downtime followed by passage-only REVOKED command and normal new-PID
runtime recovery. Owner GET/result/matching-submit-key410, foreign404, futurestock422;
QUEUED/RUNNING work cancels under current rights, with zero scores/items/releases/
grade audits and exact sealed inputs/history retained. Child/product/schema/public
contracts unchanged. Focused2/student24/grading22/results6/contracts106/consumers11/
build/typecheck/drift/import PASS. Separate read-only Sol6.1/Medium no P1/P2,
independent syntax/whitespace only; coordinator owns PG evidence.
[Commands and limits](../reviews/EXAM_OUTAGE_RIGHTS_VERIFICATION.md).
Sol accountable; reservations released, owner AGENTS/research preserved. Next
OPS-001 original-synthetic private backup/restore drill; dump/restore tools18.6
available, actual restoration not yet verified. Recommended Sol6.1/High while Luna
is usage-limited, separate Sol6.1/Medium security/recovery review.

2026-10-22 separate OS-process recovery **IMPLEMENTED / VERIFIED** from `ab3ab18`:
actual SIGKILL/new-PID restart preserves acknowledged shared-reading saves, session,
clocks and exact sealed manifest/form/keys/history. QUEUED, RUNNING and after-grade-
COMMIT worker-ack interruption recover exactly one score/release/audit; live lease
cannot be stolen and old tokens are fenced after real PG expiry. PostgreSQL stays
alive and fixture scope unchanged. Test-only files, no runtime/schema/contracts/
publication changes. Focused3/student22/grading22/recovery16/results6/scoring5/
contracts106/consumers11/build/typecheck/drift/import PASS. Separate Sol6.1/Medium
read-only review no P1/P2; independent syntax/whitespace only, PG coordinator-owned.
[Executed evidence and limits](../reviews/EXAM_OS_PROCESS_RECOVERY_VERIFICATION.md).
Accountable Sol6.1; reservations released, owner AGENTS/research preserved. No host/
DB-crash or production-service claim. Next current-rights-during-outage recovery
negatives with existing Bank holds, immutable snapshots and no unauthorized release.
Recommended Sol6.1/High while Luna is usage-limited, separate Sol6.1/Medium review.

2026-10-22 bounded RUNNING-lease restart evidence IMPLEMENTED/VERIFIED from
`04bff31`: exact job/lease persists through actual postmaster restart, live lease
cannot be stolen, actual PG expiry permits higher-token reclaim, stale load/finish
fenced, zero premature scores and exactly one score/release. Stale synthetic
publication scope remains inactive. Actual focused1/grading22/scoring5 PASS;
separate read-only Sol6.1/Medium no P1/P2. [Evidence](../reviews/EXAM_RUNNING_LEASE_RESTART_VERIFICATION.md).
Sol accountable; owner work preserved, reservations released. No product/schema/
contract/publication changes. Next acceptance work: qualified manual AT packet,
then concrete fixes with Sol6.1/High and separate Sol6.1/Medium review; lawful
reviewed inventory remains prerequisite for a real retained demonstration.

2026-10-22 bounded trusted expiry recovery **IMPLEMENTED / VERIFIED** from `bc3ed0a`.
Recommended/actual accountable Codex Sol owns SQL016 and real-PG race/fault tests,
package/migration expectations/shared records. Native Luna/XHigh owns isolated
sweeper adapter/tests and explicit local-loop integration only; separate
Sol6.1/Medium read-only review required. Reuse documented cancellation/rights/
deadline policy, immutable clocks/forms/history and exact grade-job digest;
bounded SKIP LOCKED attempt batches, worker capability only, service audit and
atomic rollback. No new public endpoint/contract or production process claim.
Preserve all owner UI/AGENTS work; no live LLM/publication.
[Executed evidence](../reviews/EXAM_002_EXPIRY_RECOVERY_VERIFICATION.md).
Actual recovery16 (15 PG+1 adapter)/student5/attempts28/grading21/results6/Bank94/
assembly23/DATA34/auth5/local13/B0 16/contracts106/emitted11 PASS; build/typecheck/
drift/import PASS. Separate Sol independently recovery16/student5 PASS, no open
P1/P2. All reservations released. Full EXAM-002 remains IN_PROGRESS for production
worker/operational recovery and integrated acceptance; next catalog/history GETs.

2026-10-22 bounded explicit submit/closure/job slice **`b094a6e` IMPLEMENTED / VERIFIED**
from `cda1235`. [Owner G2/G3 acceptance](../decisions/G2_G3_OWNER_ACCEPTANCE_2026_10_21.md).
SQL013 + protected POST atomically persist closure, one existing-digest grade job,
exact receipt and metadata audit. Actual attempts28/assembly23/Bank94/DATA34/AUTH5/
local13/B0 16/contracts106/emitted11 PASS; build/typecheck/drift/import PASS. Fresh
separate Sol6.1/Medium independently passed attempts28/Bank94, no open P1/P2.
[Evidence, races/faults and limits](../reviews/EXAM_002_SUBMISSION_VERIFICATION.md).
Actual Luna/XHigh service/HTTP/tests; Sol SQL/races/integration. Reservations released.
Full EXAM-002 remains IN_PROGRESS for worker lease/reclaim/fencing, retries/sweep;
SCORE-001 grading/release and prototype integration remain outstanding. Next bounded
EXAM-002/SCORE-001 trusted leased grader with exact digest/scoring and atomic release.

Reconciliation acceptance (HI-01/MD-04): existing sweep also cancels unavailable CREATED attempts; test sweep outage/lazy access, cancellation/start race without deadlock, committed cancellation despite HTTP 410, and idempotent repeated cancellation. Failed grading retains attempt-linked receipts until finalization plus minimum replay period; cancellation carries reason and no fabricated start/deadline.

- Objective/scope: closure transaction, durable grade jobs, lease/retry recovery, incident invalidation and expiry sweep.
- Prerequisites: EXAM-001. Files: src/modules/attempts/** (closure/holds), src/modules/jobs/**, worker entry, tests/integration/recovery/**.
- Coordination: agree the score job contract with SCORE-001 before parallel work.
- Deliverables: single closure semantics and recoverable queue. Acceptance: no late writes, duplicate submits produce one job, crash cannot lose acknowledged submissions, held content inaccessible immediately.
- Required tests: simultaneous save/submit/expire, kill/reclaim worker lease, duplicate delivery/fencing, outage near deadline, revoke during active/released attempt.
- Priority P0; complexity L; risks: lost work, race windows. Status: IN_PROGRESS (bounded submission/closure/job verified); worker/sweep recovery acceptance outstanding. Accountable implementer: Codex Sol, isolated Luna/XHigh adapter/tests, separate Sol6.1/Medium read-only review.

## SCORE-001 — Practice scoring and released results

2026-10-22 catalog/caller-history integration **IMPLEMENTED / VERIFIED** from
`71613e1`, resumed by owner `continue` after the actual quota stop. Accountable
Sol SQL/races/final fixes/integration; initial native Luna/XHigh service/HTTP/tests;
fresh separate Sol6.1/Medium independently passed final directory9, no open P1/P2.
[Final evidence](../reviews/EXAM_STUDENT_DIRECTORY_VERIFICATION.md). Existing frozen
GETs, strict opaque microsecond pagination, owned lazy reconciliation/current
rights and latest exact active-release score; supported NEW_ONLY catalog metadata
with no inventory promise. Actual directory9 (6 PG+3 adapter)/Bank94/assembly23/
DATA34/attempts28/grading21/results6/recovery16/student5/auth5/local13/B0 16/
contracts106/emitted11/build/typecheck/drift/import PASS. Docs retain owner research
failures; no browser/UI change or human review claim. All reservations released.
SCORE-001 remains IN_PROGRESS for existing-client integration/overall acceptance.
Next frozen-API student client with acknowledged revisions and honest queued grade.

2026-10-22 local student API composition **IMPLEMENTED / VERIFIED** from `f551f8d` under
sustained owner continuation. Accountable Sol owns restricted-pool attestation,
security tests, verification and shared records. Native Luna/XHigh exclusively
owns new `src/local/student.mjs` and `tests/integration/student-runtime/**`;
separate read-only Sol6.1/Medium independently passed final student5, no open P1/P2.
[Executed evidence](../reviews/EXAM_LOCAL_STUDENT_RUNTIME_VERIFICATION.md). Compose existing
local auth, frozen attempt/result adapters and a nonoverlapping local worker loop;
explicit configuration and externally provisioned separate pools, no seed or
publication. Preserve all owner frontend/AGENTS changes. No new public contract,
production worker-process claim or student UI integration. Catalog/history and
expiry sweep remain subsequent executable work. Actual student5/attempts28/grading21/
results6/auth5/local13/B0 16/contracts106/emitted11 and build/typecheck/drift/import
PASS. Reservations released; first implement bounded trusted expiry sweep.

2026-10-22 owner-only released-result transport **`f551f8d` IMPLEMENTED / VERIFIED** from
`86edda7`. SQL015 and existing frozen HTTP boundary now expose an exact owned active
score/release, with current rights and fresh final guard; pre-grade keys withheld.
[Evidence](../reviews/SCORE_001_RELEASED_RESULTS_VERIFICATION.md). Actual results6/
grading21/attempts28/Bank94/assembly23/DATA34/AUTH5/local13/B0 16/contracts106/
emitted11/build/typecheck/drift/import PASS; separate Sol review results6 PASS,
no open P1/P2. Actual Luna/XHigh service/tests and Sol SQL/races/integration;
reservations released. SCORE-001 remains IN_PROGRESS for catalog/history/local
student runtime integration; prototype UI remains mock. G2/G3 owner accepted.

2026-10-22 bounded leased grading/release **`86edda7` IMPLEMENTED / VERIFIED** from `b094a6e`.
[Evidence](../reviews/SCORE_001_LEASED_GRADING_VERIFICATION.md). SQL014 adds narrow
trusted worker capability, current rights/lease/fencing, deterministic SQL/JS score
validation and atomic immutable score/release. Actual grading21 (19 PG+2 adapter),
scorer5, assembly23/DATA34/AUTH5/local13/B0 16/contracts106/emitted11 PASS; separate
Sol review grading21/scorer5 and earlier attempts28/Bank94 PASS, no open P1/P2.
Actual Luna/XHigh scorer/worker/tests and Sol SQL/transactions/integration. Current
reservations released. Full SCORE-001 remains IN_PROGRESS for owner result/history
transport and integrated acceptance; next safe released GET boundary. EXAM-002
sweep/operational recovery remains separate. No real human-review evidence implied.

Reconciliation acceptance (§7.10): integer quotient/remainder rounding must produce 1/3="33.33", 1/32="3.13", 0/n="0.00", n/n="100.00"; no floating-point rounding dependence. Existing latest-answer storage is sufficient; no answer-revision history feature is added.

- Objective/scope: pure binary scoring, immutable score records, atomic release and owner history.
- Prerequisites: EXAM-001 plus frozen closure/job contract. Files: src/modules/scoring/**, result/history HTTP adapters, tests/scoring/**.
- Integration acceptance: requires EXAM-002.
- Deliverables: practice-binary-v1 and after-grade-v1 with explicit unofficial labeling. Acceptance: golden scores for all types, exact rounding, missing answers zero, deterministic idempotent grading, no early keys/explanations.
- Required tests: set-order property tests, incomplete true/false, empty/all-correct fixtures, 1/3 rounding, repeat job, immutable historical score, pre/post-release leakage checks.
- Priority P0; complexity M; risks: accidental partial credit or official score implications. Status: IN_PROGRESS for bounded leased grading engineering; integrated acceptance remains outstanding. Suggested implementer: Codex Sol6.1/High, isolated Luna/XHigh when available; separate engineering review plus qualified human domain validation. Actual assignee: none.

## WEB-B0.3 — Direct authenticated UI evidence and reconstruction

- Status: COMPLETED for compatible local demo UI; production student integration
  remains BLOCKED. Actual owner screenshot gates resolved for catalog/detail,
  exam/result/review; no full production or pixel-perfect claim.
- Accountable integrator: Codex Sol6.1 / Medium, recommended for evidence,
  dependency-sensitive integration and acceptance. Actual implementer:
  native gpt-6-luna/XHigh `reference_exam_builder` (main/styles only), selected
  for bounded DOM/CSS work. Actual read-only reviewer: native gpt-6.1-sol/Medium
  `reference_ui_review`, no unresolved findings. All file reservations released.
- Start/end branch `feat/track-b-data-auth`, HEAD `f72f6a8`; original owner/B0.2
  dirty edits preserved, owner AGENTS hash unchanged. No commit/push/merge/Astra.
- Evidence: owner manually authenticated/entered one attempt and supplied taking
  image/DONE; manually SUBMITTED and supplied result/review/solution images;
  later supplied actual catalog/cards and detail images. PNG bytes/dimensions/SHA
  verified privately. Fresh content-free DOM/CSS/state measurements and comparison
  under ignored `tmp/vn-exams-ui-20261020/`. No automatic reference attempt/submit.
- Implemented: measured exam header/timer/footer/688px question column, native
  row answers/save/error feedback, upward navigator and confirmation; raw result
  ticket, focused split/stacked released review; grouped1024px catalog tickets,
  actual availability counts/disabled states/3-2-1 grid; detail breadcrumbs/focus,
  max768px outer column, real4-slot6-minute/3SC+1TF metadata and start/resume.
  Original fixtures, complete-group scoring, lifecycle and release gates retained.
- Final acceptance: Chromium155 PASS26 captures/17 layouts/11 check groups; actual
  independent code/artifact review closed. Prototype16, contracts106, emitted11,
  PG/HTTP staff13 passed; final staff Chromium4 captures, syntax/drift/import/diff
  checks PASS. Git-backed docs check PASS; restricted fallback flags preserved
  research whitespace. [Commands/failures/repairs](../reviews/WEB_B0_3_VERIFICATION.md).
- Preview running `http://localhost:4176`, task-owned tool session14194;
  `PORT=4176 npm run dev:b0` startup/current asset SHA/HTTP200 verified. Existing
  4173/4175 listeners preserved;4175 launch conflict recorded, not overwritten.
- Remaining BLOCKED/NOT IMPLEMENTED: real student persistence/assembly/closure/
  grading needs existing service/inventory/publication gates; no fabricated exam
  bank/history/official score or section locks. Unobserved tools/formats require
  legitimately accessible interaction evidence. No further reference attempt is
  authorized. Frozen contracts/auth/DB/reuse/scoring unchanged by this UI phase.
- `docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md` (owner local research, not checkpointed).

## WEB-B0.2 — Research-informed examination UX

- Status: COMPLETED for compatible local demo UX; real integration remains BLOCKED.
  Assigned by owner on 2026-10-20 in “Autonomous Engineering
  Orchestrator”; local frontend implementation/testing authorized, no commits.
- Accountable integrator: Codex Sol 6.1. Recommended model/reasoning: Sol 6.1 /
  Medium for contract integration; available Codex Luna / XHigh for bounded DOM
  work (actual native builder), separate Sol reviewer for read-only acceptance.
- Start: `feat/track-b-data-auth`, HEAD `f72f6a8`; pre-existing modified AGENTS.md,
  public/app/main.js and public/styles.css, untracked VN_EXAMS_UI_GAP_ANALYSIS.md.
  Preserve those changes. Research remains input, not architecture authority.
- Ownership: sequential/disjoint Luna app/mock/test work and coordinator
  catalog/results/header/styles/harness/docs integration. All reservations released.
- Scope: synthetic one-domain mock; original arithmetic true/false demo in cycle2,
  review bookmarks, filtered navigator,
  submission counts, result statistics, released explanation toggles and responsive
  browser verification at 1440/768/390. Existing backend/API/DB/scoring/reuse and
  immutable snapshot contracts remain unchanged. No external reference access.
- Acceptance: existing B0 and contract checks, actual browser save/resume/offline,
  bookmarks/navigation/submit/review and responsive evidence; independent review.
- Both cycles IMPLEMENTED/VERIFIED; independent read-only Sol review has no
  outstanding findings. B0 PASS15, browser1440/768/390+expiry PASS; staff browser
  and local13 regressions PASS. Frozen contracts and owner changes preserved.
  Evidence: [WEB-B0.2 verification](../reviews/WEB_B0_2_VERIFICATION.md).
- Blockers outside this scope: real student services and approved stock/publication;
  combined sequential sections require separately approved product contracts.

## WEB-B0.1 — Polish the existing demonstration

- COMPLETED for B0.1, independently verified 2026-10-19. Base `237da9c`; G1 accepted
  separately in `27350b3`. One reused native tsa_builder, Codex Luna / XHigh owns
  only `apps/practice-prototype/**`. Sol / Medium owns browser harness/shared records
  and independent review. Owner AGENTS.md unchanged/reserved.
- Same frontend and repeated existing synthetic content: clear a saved answer,
  keyboard/focus polish, explicit in-memory reload/resume feedback, submission
  summary, and separately requested post-closure synthetic answer/explanation review.
  Score-only response remains separate; private data withheld until owned GRADED
  session; no public fixture secrets or claims of production auth/approved stock.
- Acceptance: positive/negative unit tests and actual browser clear/reload/timer,
  keyboard, submit/review/release denial, cross-session and mobile evidence. No
  dependencies/contracts/product semantics changed. Local commits authorized.
- Verified: 11 nested tests; actual Chromium desktop/mobile clear/reload/resume,
  active review denial, post-grade explanation/back-score, delayed/offline saves,
  no external page requests or pre-release private response fields. Worker ownership
  released. Eight screenshots/report regenerate with `npm run test:b0:browser`.

## WEB-B0 — Isolated interactive visual prototype

- Status: COMPLETED for the assigned B0 slice, 2026-10-19; separate from blocked
  WEB-001 integration. G1 disposition unchanged. Implementation uncommitted on the
  isolated feature branch; no commit/push/merge/gate transition was performed.
- Implementer: existing native tsa_builder, Codex gpt-6-luna / XHigh; normal bounded
  frontend/test work. Coordinator/reviewer: Sol 6.1 / Medium. Base `81ef8aa`, branch
  `feat/track-b-b0-prototype`; owner AGENTS.md dirty/reserved and excluded.
- Worker owns only `apps/practice-prototype/**`; coordinator owns root npm scripts,
  README, browser acceptance harness and shared records. No overlapping writers.
- Scope: dependency-free modular frontend plus isolated local mock adapter;
  Vietnamese landing/catalog, one MATH fixture demo, navigation/answer selection,
  countdown, submit confirmation and demo results. Existing synthetic test content
  only, with provenance and visible repeat/unapproved labels. No real NEW_ONLY,
  student sessions, DB persistence, approved seed stock or official score claims.
- Acceptance: runnable local command; responsive/keyboard-usable journey; keys
  absent from public assets/pre-submit responses; mock save/closure/result behavior
  and countdown tested; relevant regression and actual browser verification.
- Executed evidence: nine nested Node tests, real Chromium 155 browser journey
  at desktop/mobile widths, delayed save guard, offline failure/retry, confirmation
  and 25.00% demo result, explicit new demo, private-response/public-file exclusion
  and no external page requests PASS. Existing 106 contract/11 emitted tests,
  typecheck/build/smoke/drift/import/docs/diff checks PASS; no runtime/DB claim.
- Exclusions: schema/dependency changes, blocked runtime task implementation,
  public deployment, paid APIs and gate advancement. All worker reservations released;
  coordinator completed independent verification and shared-record integration. Documentation-only defaults are overridden only for this assigned B0.

## WEB-001 — Student vertical slice

2026-10-22 update from `7cee125`: shared-reading HTTP/browser journey and explicit
disposable demonstration VERIFIED; [evidence](../reviews/WEB_001_SHARED_READING_VERIFICATION.md).
Correct READING taxonomy, ordered immutable bundle and exact passage on both slots,
per-question score, saves/reload/released review and passage-only rights restrictions
verified. Student19/assembly49 + reading32-response/default/domains Chromium and
static/contract checks PASS; separate engineering review no P1/P2. Full pilot,
manual accessibility and lawful human-approved inventory remain outstanding.

2026-10-22 independent three-domain slice IMPLEMENTED/VERIFIED from `55bd3b4`:
original isolated MATH4/READING2/SCIENCE4 fixtures, frozen transport/browser
selection, own clocks/forms, H1 cross-domain blocking without history consumption,
reload, exact lost-submit-key replay, separate100% results/visible explanations/
history and no chaining. Repaired actual missing persistent result-domain label.
Explicit disposable domains demo plus actual terminal/catalog/shutdown verified;
retained inventory untouched. Actual student12/local15/B031/contracts106/consumer11/
build/typecheck/drift/import/docs PASS; Chrome domains78 responses/eight captures,
default/keyboard/expiry/closed and Firefox PASS. Separate read-only Sol6.1/Medium
no open P1/P2; hidden-explanation assertion strengthened before final PASS.
[Evidence and next shared-reading card](../reviews/WEB_001_THREE_DOMAIN_VERIFICATION.md).
Sol accountable, owner work preserved, reservations released. Overall IN_PROGRESS:
standalone reading is not shared-stimulus/bundle, lawful human inventory or full
accessibility acceptance. Next bounded ASSEMBLY-001/002: existing immutable bundle/
stimulus tables through internal stock capture and atomic sealing, preserve frozen
solver/contracts/authorization; isolated order/rights/history/rollback evidence.
Recommended Sol6.1/High while Luna is usage-limited; separate Sol6.1/Medium SQL review.

2026-10-22 closed-save reconciliation IMPLEMENTED/VERIFIED from `f5ec6cf`:
ATTEMPT_CLOSED offers an authoritative read; read failures preserve pending edits,
terminal reads explain server-recorded scoring, delayed reads cannot replace a
new identity/attempt. Separate audit caught uncertain-ACK message ambiguity;
neutral notice and regression fixed it before acceptance. Actual callback12/B031/
student9/attempt28/results6/contracts106/consumers11/build/typecheck/drift/import/
docs PASS; Chromium two-tab45 inspected responses/default/keyboard/expiry and
Firefox PASS. Separate read-only Sol6.1/Medium actual callback12 PASS, no open P1/P2.
[Evidence](../reviews/WEB_001_CLOSED_SAVE_RECONCILIATION_VERIFICATION.md). Sol accountable,
owner files preserved, reservations released. WEB-001 remains IN_PROGRESS.
Next engineering card: original isolated three-domain MATH4/READING2/SCIENCE4
browser journey using frozen APIs, separate clocks, cross-domain H1, save/reload/
submit/results/history and no chaining. Shared reading stimulus/bundle and lawful
human inventory remain distinct gaps; standalone fixtures must not imply full
acceptance. Recommended Sol6.1/High while Luna is usage-limited, separate
Sol6.1/Medium engineering reviewer; qualified manual AT remains pending.

2026-10-22 restart evidence IMPLEMENTED/VERIFIED from `e5dafee`: actual disposable
postmaster restart preserves queued job ID/dedup, manifest/sealed snapshots/keys,
answers/digest, history/clocks; old fixture scope inactive; previous session,
foreign-owner denial, submit replay and exactly one score/release PASS. Actual
student9/foundation34/Bank94/assembly23/attempt28/grading21/recovery16/results6/
directory9/auth5 PASS. Separate read-only Sol6.1/Medium no open P1/P2; two initial
test defects corrected before final pass; no independent PG execution claim.
[Evidence](../reviews/EXAM_POSTMASTER_RESTART_VERIFICATION.md). Sol accountable;
reservations released; owner work preserved. No product code/publication change.
Next bounded EXAM-002 card: persisted RUNNING lease/fencing across actual disposable
postmaster restart. Recommended Sol6.1/High, separate Sol6.1/Medium review.

2026-10-22 bounded retained local composition IMPLEMENTED/VERIFIED from `ed953aa`:
explicit opt-in, separate restricted exam/worker credentials, owner closed before
attestation/serving, frozen route/worker reuse, terminal-safe retained lifecycle.
Actual local15/student8/attempt28/grading21/recovery16/results6/directory9/Bank94/
assembly23/foundation34/auth5/B021/contracts106/consumers11/build/typecheck/drift/
import/docs and actual Chromium synthetic journey PASS. Separate read-only
Sol6.1/Medium no P1/P2; its PG run blocked at Unix socket permission, no passing
independent PG claim. [Evidence](../reviews/WEB_001_RETAINED_WORKSPACE_VERIFICATION.md).
Sol accountable; Luna/XHigh usage-limited. No eligible seed/publication or frozen
contract changes. Owner AGENTS/research preserved. Reservations released.
Recommended next implementer Sol6.1/High for isolated retained queued-job restart
recovery tests, separate Sol6.1/Medium review; qualified content/AT reviewers remain
distinct. Actual retained positive exam/grading journey is not yet demonstrated.

Phase 02.75 acceptance: default personal NEW_ONLY catalog/create flow; display mode, start TTL, explicit shortage and separately confirmed review/fixed alternatives. Browser test two attempts with no repeats, exhausted inventory, no automatic fallback or AI call.

Reconciliation acceptance (LO-01/03, HI-01/03, MD-05): show the independent domain-test countdown, persisted 600-second start deadline while CREATED, accessible <=60-second warning once per test, locked/future labels and ICT (UTC+7) absolute times. Browser tests cover resume inside warning window, denied late saves, 429 retry without false saved state, CANCELLED reason, existing-attempt conflict recovery and admission-window disclosure before start. The UI must not imply a rule for ordinary schedule edits after creation until the owner resolves it. Changing browser timezone must not change countdown or authoritative deadlines.

- Objective/scope: login/catalog, attempt renderer, clock, autosave/conflict/error UX, submit/result/history.
- Prerequisites: frozen contracts, EXAM-001 for integration; EXAM-002 and SCORE-001 for completion. Files: src/app student routes, student components/styles, tests/e2e/student/**.
- Deliverables: accessible Vietnamese practice flow for three types; no duplicated business clock/scorer. Acceptance: student completes the starter exam, resumes after disconnect, sees save failures, can submit persisted answers knowingly and read results.
- Required tests: browser full journey, keyboard-only flow, math/table readability, multi-tab conflict, offline/reconnect and expiry; inspect network/hydration for answer leaks.
- Priority P0; complexity M; risks: optimistic UI concealing failed save, inaccessible interactions. Status: IN_PROGRESS (bounded backend/client/local composition verified; remaining acceptance gaps in evidence). Suggested implementer: Sol6.1/High while Luna is usage-limited; independent Sol6.1/Medium engineering reviewer plus qualified accessibility reviewer. Accountable implementer: Sol; reservations released.

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

2026-10-23 live backend connection loss **IMPLEMENTED / VERIFIED** from `3d05769`:
actual childexit1 reproduced; pool-only fix insufficient (student32pass/1fail),
corrected live stderr proves checked-out client error. Minimal pool/client event
handlers prevent fatal disconnects while SQL/COMMIT still fail, with no retries.
Real held-transaction termination rolls back; same student PID reconnects, retains
exact acknowledged inputs/clocks, saves/submits/grades once. Live output-getter
evidence bug repaired. Final focused1+1/foundation36/student33/local15/auth5/Bank94/
assembly49/attempt28/grading23/recovery16/results6/contracts106/consumer11/B031/
scoring5/build/typecheck/drift/import/docs PASS. Separate Sol6.1/Medium no P1/P2,
independent syntax/whitespace only. [Commands and limits](../reviews/EXAM_DATABASE_CONNECTION_RECOVERY_VERIFICATION.md).
Sol accountable, reservations released, owner files preserved. Backend session
loss, not full DB outage/production acceptance. Next live bounded postmaster
downtime with safe503/same-process HTTP and poller recovery. Recommended Sol6.1/
High while Luna is usage-limited; separate Sol6.1/Medium engineering review.

2026-10-23 abrupt PG recovery **IMPLEMENTED / VERIFIED** from `c74cc6d`:
owned immediate SIGQUIT/restart with actual interruption/redo markers, durability
settings on; confirmed commit retained and separate open transaction rolled back.
QUEUED/RUNNING modes preserve exact inputs/history/clocks/jobs, live leases and
fencing after actual expiry, one score/release and inactive old fixture scope.
Default fast restart preserved. Focused1+2/foundation35/grading23/student32/
recovery16/results6/contracts106/consumers11/build/typecheck/drift/import/docs PASS.
Separate Sol6.1/Medium final no P1/P2, independent syntax/whitespace only.
[Commands, scope and review](../reviews/EXAM_IMMEDIATE_POSTGRES_RECOVERY_VERIFICATION.md).
Sol accountable; reservations released, owner files preserved. No product/schema/
API/host-power-loss/RPO/RTO/full OPS acceptance claim. Next inspect untested live
database-unavailability behavior against frozen failure contracts. Recommended
Sol6.1/High while Luna is usage-limited, separate Sol6.1/Medium read-only review.

2026-10-23 isolated logical restore **IMPLEMENTED / VERIFIED** from `4369cb5`:
private18.6 roles/data archive restored into a genuinely independent fresh cluster;
all65 application tables plus role/grantor/owner/ACL/89-function/17-RLS-policy
metadata preserved. QUEUED/RUNNING eligible jobs recover once; revoked jobs cancel;
old exact fixture-scope approval403, private reads/worker spoof denied, source
unchanged, successful/corrupt-archive/shutdown-error cleanup verified. Test-only
helper/tests, no production/foundation/schema/contracts/publication changes.
Actual focused7/student31/foundations34/grading22/results6/contracts106/consumers11/
build/typecheck/drift/import PASS. Separate Sol6.1/Medium found cleanup P2, repaired
and fault-tested; final no remaining P1/P2, independent syntax/whitespace only.
[Executed commands, bootstrap handling and limits](../reviews/OPS_001_LOGICAL_RESTORE_VERIFICATION.md).
Sol accountable; all reservations released, owner AGENTS/research preserved.
Production backups/RPO/RTO/PITR/full OPS remain unaccepted by this drill. Next
WEB-004 real429 save/retry browser evidence (documented acceptance gap). Recommended
Sol6.1/High, isolated Luna/XHigh if available with Sol fallback, separate
Sol6.1/Medium engineering review; lawful inventory/manual AT/Track A remain distinct.

2026-10-22 current-rights outage recovery VERIFIED from `ebb25f2`: normal new-PID
recovery cancels revoked-passage work and denies content/old-receipt access with
zero scores/releases. [Evidence](../reviews/EXAM_OUTAGE_RIGHTS_VERIFICATION.md).
Next executable card: isolated original-synthetic backup/restore integrity drill;
pinned pg_dump/pg_restore18.6 available, no actual restore or production claim yet.

2026-10-22 bounded app-process recovery evidence from `ab3ab18` is VERIFIED:
actual SIGKILL/new-PID restart with live PostgreSQL, acknowledged saves and
QUEUED/RUNNING/committed-grade recovery. [Commands and limits](../reviews/EXAM_OS_PROCESS_RECOVERY_VERIFICATION.md).
This is not production supervision, host/database-crash, backup/restore or full
OPS acceptance. Next test current rights restrictions during a crashed worker outage.

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
| Historical shortage naming/shape conflict: RESOLVED within bounded FOUND-007 reconciliation under owner D1 approval, 2026-10-19; API/reuse/assembly references and runtime fixtures agree. | FOUND-007 records an owner-approved, single error taxonomy and compatible response projection before FOUND-002 freezes schemas. | All `POST /attempts` consumers: ASSEMBLY-001/002, EXAM-001, WEB-003, contract fixtures. |
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
- Suggested agent capability: MEDIUM (Terra). Risk: High — contract drift/security disclosure. Status: COMPLETED for bounded contract reconciliation, 2026-10-19, under explicit D1 approval. Static API/reuse/assembly reference comparison and existing error-response tests passed; supplemental CONCURRENT_MODIFICATION/CONSTRAINT_CONFLICT/VALIDATION_ERROR positive/negative fixtures and 409/422 mapping checks passed. No allocation/database implementation or whole-ADR acceptance is claimed. See OPEN_DECISIONS and the current handoff.

## DATA-003 — Starter dataset manifest and publication preflight

2026-10-20 scoped engineering subtask IMPLEMENTED / VERIFIED in local checkpoint
`c1b4fa7` under the owner
[preflight directive](../decisions/OPEN_DECISIONS.md#dataset-preflight-engineering-scope--2026-10-20).
Accountable coordinator: Codex Sol; actual native Luna/XHigh implemented pure
manifest/review helper and six tests; coordinator implemented restricted read-only
PostgreSQL adapter, seven tests and Factory round-trip regression. Actual native
Sol6.1/Medium independent read-only review completed: 25/25 scoped tests PASS,
one aggregate-budget P2 repaired/retested, no unresolved P1/P2 findings.
Full Bank35, DATA34, AUTH5, local13, B0 16, contracts106 and emitted11 PASS under
pinned Node24.18/npm11.16/PG18.6; build/typecheck/drift/import/docs checks PASS.
[Detailed audit and execution evidence](../reviews/G2_DATASET_PREFLIGHT_VERIFICATION.md).
Outputs remain non-publishing: immutable exact-hash manifests, reference validation,
coverage/shortfalls/duplicate flags and human-review packets; missing current
rights/lawful stock/named independent humans/equivalence remain explicit blockers.
No review decision, workflow approval or eligible pointer is created. BANK-002's
named human/publication prerequisite is unchanged; DATA-003/002 parent acceptance
remains blocked. No approved inventory, capacity, G2/G3 or student integration claim.
Start `feat/track-b-data-auth` / `f72f6a8`; owner AGENTS/UI/research changes preserved.
Implementation reservations released; coordinator retains shared-record integration.

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

2026-10-21 bounded safety engineering **IMPLEMENTED / VERIFIED**, local checkpoint
**`c0b42b5`** from `d9812b3`. Sol coordinated/integrated; actual Luna/XHigh wrote
the content validator and isolated PG regressions. Separate actual read-only Sol
review PASS38 with no unresolved P1/P2; final Bank94, assembly1, DATA34, AUTH5,
local13, B0 16, contracts106, emitted11 and build/drift/import PASS.
[Executed evidence and limitations](../reviews/BANK_002_DELIVERY_SAFETY_VERIFICATION.md).
Exact-hash content/source ledger, durable permanent rights/quarantine holds,
postcommit retryable attempt/release fanout, current delivery/selection guards,
expiry/restoration and ancestor restrictions are verified with immutable history.
Text/math/table supports all three interactions; unsupported media is rejected.
No new public API or frozen G1 contract. Owner work preserved; no deployment.

BANK-002 remains IN_PROGRESS for formal acceptance: supported-profile engineering
and synthetic evidence are complete; real lawful rights/inventory, named distinct
qualified human reviewers and real-publication authorization remain outstanding.
G2/G3 unaccepted. Stop nonessential Bank expansion. Next execute the ASSEMBLY
allocation card below; missing human stock does not block synthetic engineering.
Historical next-hold/asset statements below are superseded by this entry.


2026-10-21 equivalence engineering **`d9812b3` IMPLEMENTED / VERIFIED**.
Accountable coordinator Sol; actual native Luna/XHigh implemented the internal
adjudication service/direct tests; Sol integrated monotonic SQL007, compact
private incident capture and history/snapshot preservation tests. Separate actual
Sol6.1/Medium independent read-only review PASS42/42, no unresolved P1/P2 findings.
Final Bank80/DATA34/AUTH5/local13/B0 16/contracts106/emitted11; build/typecheck/
smoke/drift/import/docs PASS. Exact-hash independent CONFIRMED/DISMISSED decisions
preserve detector evidence; one-way aliases/all-member moves and source-empty
commit checks prohibit split/reset. Late incidents are private aggregate evidence;
versions/forms/manifests/keys/attempts/history remain unchanged. Current exclusion
join expansion, both lock-winner orders and post-incident failure rollback pass.
[Detailed executed evidence](../reviews/BANK_002_EQUIVALENCE_VERIFICATION.md).
No approval/pointer/publication promotion occurs. Existing fixture-only approval
and G1 contracts remain stable. Owner AGENTS/UI/research preserved; reservations
released. The earlier workflow final38 independent run was subsequently reported
PASS before007; current independent42 adds complete current scoped evidence.

BANK-002 remains IN_PROGRESS: **next executable engineering is durable selected-
form rights/quarantine holds and audited fan-out, then asset sanitization** using
synthetic fixtures. The merge/late-equivalence gap below is now resolved by this
checkpoint; real humans/lawful stock still gate real publication and G2 acceptance.
Start was `feat/track-b-data-auth` / `416b621`; coordinator owns shared records.

2026-10-21 engineering checkpoint **`416b621` IMPLEMENTED / VERIFIED** under
[owner workflow authorization](../decisions/OPEN_DECISIONS.md#bank-002-workflow-engineering-authorization--2026-10-20).
Accountable coordinator Sol; actual native Luna/XHigh implemented service/direct
tests; Sol integrated gates/migration006/HTTP/current-rights/import regressions.
Exact-version/hash/revision submission, independent approval/rejection, immutable
correction workflow, singleton adjudication, quarantine/revalidation, audit and
actor-scoped receipts now execute on real PostgreSQL. Default runtime approval
is disabled; positive eligibility simulation needs an owner-initialized disposable
scope bound to DB/postmaster and explicit internal option. Production refuses.
No real-human/rights/inventory/publication acceptance follows from fixture roles.

Final Bank61/DATA34/AUTH5/local13/B0 16/contracts106/emitted11, build/typecheck/
smoke/drift/import/docs checks PASS. Actual independent Sol code review found and
verified two repairs; independent37 and authorization23 PASS. Final rights rerun
passed37/38 before unsupported AUGMENTED fixture correction; reviewer's usage
limit prevented independent rerun after that test-only correction. Coordinator
final61 passed; do not claim final independent38 PASS. Full
[evidence and limitations](../reviews/BANK_002_WORKFLOW_VERIFICATION.md).
All implementation reservations released; no owner AGENTS/UI/research changes.

Status remains IN_PROGRESS, not accepted: monotonic equivalence merges/late-
equivalence incidents, image sanitization and durable selected-form rights/
quarantine holds remain executable engineering gaps and fail closed. **Next:**
implement exact-version equivalence adjudication/monotonic merge with history/
snapshot preservation tests, then selected-form hold/fan-out. Synthetic fixtures
can exercise these now; missing named humans/lawful inventory block real
publication and G2 acceptance, not implementation. Human owner must later name
independent qualified content reviewers/rights attestors and authorize lawful
stock. Prior blocked engineering wording below is historical and superseded.

2026-10-20 preparation only: DATA-003 preflight checkpoint `c1b4fa7` supplies
exact-hash review packets and a read-only workflow/revision snapshot, independently
code-reviewed and real-PG verified. No review/approval/publication command or
human-content acceptance was supplied by that earlier checkpoint; its engineering
block is superseded above, while real publication/acceptance remains gated. The new owner
scope authorizes synthetic preparation without supplying missing people/rights.


- Objective: split the human publication boundary from BANK-001 ingestion so a bounded implementation owns only workflow authorization and eligibility transitions.
- Prerequisites: DATA-001, AUTH-001, G1 and BANK-001's accepted ingestion evidence (validated immutable drafts/import receipt), engineering may use isolated synthetic reviewers; real publication and full acceptance additionally require a named independent human review process. This is not a prerequisite on BANK-001 milestone completion, and BANK-002 does not require G2: BANK-001 ingestion and BANK-002 publication evidence jointly establish G2.
- Input specifications: QUESTION_FACTORY_SPEC controlled-publication section, QUESTION_REUSE_POLICY equivalence rules, API staff review contract, ADR-003/007.
- Files/modules: `src/modules/bank/publication.ts`, `src/http/staff/reviews.ts`, `tests/integration/bank-publication.test.ts`.
- Expected deliverables: exact-hash independent review decision, equivalence adjudication/audit, approval eligibility pointer and quarantine/revocation guard.
- Acceptance criteria: author/factory operator self-approval fails; stale hash/new version cannot inherit approval; unresolved duplicate flags block approval; quarantine/revocation stops future eligibility; a canonical import receipt never asserts APPROVED.
- Required verification: real-DB concurrent approve/withdraw serialization, workflow transition matrix, authorization/BOLA fixtures, equivalence merge/history preservation and safe error projection tests. Suggested agent capability: HIGH (Sol). Risk: High — rights and publication integrity. Status: IN_PROGRESS; workflow/equivalence engineering verified in416b621/d9812b3, remaining asset/hold and real-publication acceptance outstanding. Named independent humans and lawful inventory gate real publication/G2, not engineering.

## ASSEMBLY-002 — Per-student NEW_ONLY allocation transaction

2026-10-22 update: complete ordered shared-stimulus units now use the same atomic
NEW_ONLY commit, current restrictions and retained history. Focused26/fullassembly49
real-PG PASS; [SQL018 evidence and scope](../reviews/ASSEMBLY_BUNDLE_ALLOCATION_VERIFICATION.md).
Full acceptance remains open; next shared-READING2 HTTP/browser demonstration.
This supersedes historical bundle-unsupported limitations for the current backend.

2026-10-21 standalone NEW_ONLY atomic transaction **IMPLEMENTED / VERIFIED** with
ASSEMBLY-001 above (checkpoint **`6fc219e`** from `c0b42b5`). User-row/shared publication
locks, H1 reconciliation, receipt precedence, exact fresh final validation and all
required persistence commit atomically. Actual PG assembly23/Bank94 plus separate
Sol review23/94 PASS. Broader bundle/review/fixed/HTTP/rate scope and formal human/
rights acceptance remain outstanding; task remains IN_PROGRESS, G2/G3 unaccepted.
Proceed to the bounded EXAM-001 persisted start/safe-delivery card, not Bank/UI work.

2026-10-21 owner transition authorizes isolated synthetic allocation engineering
before human stock/G2 acceptance. The validated standalone candidate interface
now exists under ASSEMBLY-001; allocation/receipts/attempt creation are not yet
implemented. Execute the concrete ASSEMBLY-001/002 card above, keeping real stock,
publication and formal acceptance separately gated.

- Objective: isolate the concurrency-critical commit path from ASSEMBLY-001 selection/search.
- Prerequisites: G2, DATA-001 allocation schema, BANK-002 eligible-bank guard, ADR-004/007 owner decisions, ASSEMBLY-001 validated manifest candidate interface.
- Input specifications: QUESTION_REUSE_POLICY concurrency/history/shortage rules, EXAM_ASSEMBLY_SPEC sealing rules, API creation contract after FOUND-007, ADR-003/004/007.
- Files/modules: `src/modules/assembly/allocation.ts`, `src/modules/assembly/creation-receipt.ts`, `tests/assembly/allocation-concurrency.test.ts`.
- Expected deliverables: per-user lock/revision protocol, revalidation/replan boundary, atomic form+CREATED attempt+history+receipt commit and no-allocation typed outcomes.
- Acceptance criteria: two same-user different-key NEW_ONLY successes have disjoint current identity/equivalence groups; same-key replay returns one receipt; rollback writes no history/form/attempt; different users may reuse stock; proven shortage and unknown search exhaustion remain distinct.
- Required verification: two real PostgreSQL connections with barriers for winner orders, corrected-version/equivalence-merge fixtures, rollback injection, withdrawal/publication race and receipt retention replay. Suggested agent capability: HIGH (Sol). Risk: High — concurrency/data integrity. Status: PROPOSED, blocked on G2 and remaining ADR-007 mechanisms; bounded FOUND-007 taxonomy reconciliation is accepted.

## WEB-003 — Catalog, creation and explicit shortage UX

- Objective: implement the bounded pre-attempt student flow without timers, answer persistence, scoring or duplicated assembly rules.
- Prerequisites: FOUND-002 contract artifacts, ASSEMBLY-002 API acceptance, AUTH-001 candidate session, resolved FOUND-007 taxonomy.
- Input specifications: API catalog/create/StudentShortage DTOs, QUESTION_REUSE_POLICY modes/shortage rules, MVP scope, accessibility requirements.
- Files/modules: `src/app/(student)/catalog/page.tsx`, `src/components/student/attempt-create.tsx`, `tests/e2e/student-create.spec.ts`.
- Expected deliverables: personalized default, explicit review/fixed consent, authenticated create/replay handling and safe shortage alternatives.
- Acceptance criteria: omission selects PERSONALIZED_PRACTICE + NEW_ONLY; no automatic review/fixed/shorter fallback; shortage shows only safe contract fields; retry preserves the logical request semantics; network inspection contains no candidate IDs, keys, histories or provider call.
- Required verification: browser fixtures for success, both shortage codes, search exhaustion, conflict/retry and keyboard/screen-reader flow; contract-negative parsing test. Suggested agent capability: MEDIUM (Terra). Risk: Medium — unsafe UX could bypass policy. Status: PROPOSED, blocked on ASSEMBLY-002.

## WEB-004 — Attempt delivery, save state and released-result UX

2026-10-23 pre-start timing disclosure **IMPLEMENTED / VERIFIED** from `94b9c17`:
actual baseline lacked required notice. Shared persistent notice before catalog/
CREATED/details start explains offline/reload/no-grace and truthful uncertain-save
state; aria-describedby links controls. No new gate/timer/auth/API change; mock
unchanged. Fresh post-host-restart Chrome default/reserved24/admission40/keyboard
76focus/18AX/22responses, B031/contracts106/consumers11/build/typecheck/drift/import/
docs PASS. Interrupted handles/logs not counted as passes. Separate Sol6.1/Medium
no P1/P2; state12/syntax/whitespace independent. [Evidence](../reviews/WEB_004_PRESTART_TIMING_VERIFICATION.md).
Sol accountable; reservations released, owner files preserved. Manual packet
updated, qualified-human outcomes still NOT TESTED; owner reviewer/platform input
requested. Bounded student audit found no further concrete product gap, not full
acceptance. Independent next EXAM-002/OPS-001 card: owned isolated abrupt PG
shutdown/recovery, durability/immutable inputs/leases/scope checks; no deployment/
capacity/power-loss claim. Recommended Sol6.1/High, separate Sol6.1/Medium review.

2026-10-23 successive NEW_ONLY **IMPLEMENTED / VERIFIED** from `88a09ea`: second
original synthetic reading passage preserves default sample, isolated two-bundle
fixture. Two browser forms use disjoint stableIDs/versions/current canonical groups
and complete ordered units, save/grade100%, then actual422 unseen shortage leaves
committed graph and both exact graded snapshots unchanged. No reuse/generation
fallback or human-inventory claim. Initial/final Chrome36 responses/four screenshots,
assembly49/student31/defaultreading32/contracts106/consumers11/build/typecheck/
drift/import/docs PASS. Separate Sol6.1/Medium found detailed-grade snapshot gap,
repaired and rerun; final no findings, syntax/whitespace only. [Evidence](../reviews/WEB_004_NEW_ONLY_SUCCESSION_VERIFICATION.md).
Sol accountable, reservations released, owner files preserved. Next independent
static P2: required offline/no-grace notice before direct/reserved start; reproduce
and add shared notice without new confirmation gate. Recommended Sol6.1/High,
separate Sol6.1/Medium review. Full WEB/human/AT/Track A remain distinct.

2026-10-23 two-tab allocation recovery **IMPLEMENTED / VERIFIED** from `61314b4`:
both clients hold genuine empty-history responses, then actual distinct-key201/409
recover same owned attempt/form/clocks. One form/manifest/creation receipt/history
assignment; first-tab save reloads in second, second submits and first reloads100%.
Final onejob/score/release, two revision1answers/history rows. Test-only changes;
no product defect. Final Chrome36 responses/three screenshots, default/closed45
browser, student31/contracts106/consumers11/build/typecheck/drift/import/docs PASS.
Two initial background-capture CDP timeouts repaired with foreground selection,
no timeout increase; failures recorded. Separate Sol6.1/Medium no P1/P2, independent
syntax/whitespace only. [Evidence and scope](../reviews/WEB_004_ALLOCATION_RACE_VERIFICATION.md).
Sol accountable; reservations released, owner files preserved. Next two successive
NEW_ONLY browser forms/results then shortage without fallback. Recommended
Sol6.1/High, separate Sol6.1/Medium review. Full WEB/human/AT/Track A remain distinct.

2026-10-23 catalog ordinary admission/owned resume **IMPLEMENTED / VERIFIED** from
`76af373`: actual future-window reservation card defect reproduced and fixed.
Valid owned start/resume survives ordinary offering edits in card/details/filter;
new candidate controls disabled, future label/ICT facts accurate. Elapsed entries
remain omitted by SQL017; existing owned callout resumes same attempt. Explicit
new409/410 probes, one committed attempt/one start, unchanged inputs/clocks,
100% result. Final Chrome40 responses/four screenshots; student31/attempt28/
directory9/B031/contracts106/consumers11/build/typecheck/drift/import/docs and
Chrome default/keyboard/domains PASS. Initial harness/CDP failures and student
30-pass/one-cancel batch recorded; separate unchanged reruns passed. Separate
Sol6.1/Medium no P1/P2; state12/syntax/whitespace independent, no PG/browser run.
[Evidence and discovery correction](../reviews/WEB_004_ADMISSION_RESUME_VERIFICATION.md).
Sol accountable, reservations released, owner files preserved. Next two-tab
same-candidate allocation conflict/recovery browser card; recommended Sol6.1/High,
separate Sol6.1/Medium review. Full WEB/human/AT/Track A remain distinct.

2026-10-23 warning-window resume **IMPLEMENTED / VERIFIED** from `97694ba`:
actual45sec reading fixture, observed polite/atomic status warning once per loaded
document including resume as explicitly required by engine spec, no repeats on
ticks/save/navigation. Real Honolulu/ICT offsets and reload preserve countdown/
saved answer/exact clocks/immutable inputs;100% result. Chrome23 responses/three
screenshots, default reading32/student31/contracts106/consumers11/build/typecheck/
drift/import/docs PASS. No product defect/change. Separate Sol6.1/Medium no P1/P2,
syntax/whitespace PASS; PG/browser coordinator-owned. [Evidence and limits](../reviews/WEB_004_WARNING_RESUME_VERIFICATION.md).
Sol accountable; reservations released, owner files preserved. Next bounded card
from independent static discovery: reproduce/fix catalog gating valid owned
start/resume on mutable future/elapsed offering, accurate admission labels/ICT
times, blocked new allocation. Static P2 not yet runtime-reproduced; existing
non-retroactive schedule policy applies. Recommended Sol6.1/High, separate
Sol6.1/Medium review. Full WEB/human/AT/Track A remain distinct.

2026-10-23 CREATED reservation recovery **IMPLEMENTED / VERIFIED** from `6982af2`:
actual late browser reproduced unwanted second allocation request and misleading
content-lock notice. Internal client method now starts/reads the original ID,
preserves cancellationReason and shows START_TTL_EXPIRED explicitly. Real600sec
reservation reloads twice unstarted; explicit start grades100%. Real12sec admission
cap remains after ordinary extension, late start cancels without replacement,
questions/answers/jobs/scores; immutable inputs/history retained. Actual happy24/
late17 browser responses, lost-start-ACK+foreign-start focused1/student31/attempt28/
B031/contracts106/consumers11/build/typecheck/drift/import/docs and default/keyboard/
Firefox PASS. Separate Sol6.1/Medium no findings; independent API3/state12/syntax/
whitespace PASS, PG/browser coordinator-owned. [Evidence and baseline failures](../reviews/WEB_004_RESERVATION_RECOVERY_VERIFICATION.md).
Sol accountable; reservations released, owner files preserved. Next bounded card:
warning-window resume/timezone browser evidence. Recommended Sol6.1/High, separate
Sol6.1/Medium review. Full WEB/human inventory/manual AT/Track A remain distinct.

2026-10-23 pending429/deadline browser boundary **IMPLEMENTED / VERIFIED** from
`f75f704`: both real USER_SAVE/ATTEMPT_SAVE modes retain an unsaved correct choice,
then existing timer reconciles actual eight-second expiry without retries/submit.
Exact deadline/form/manifest/private+public snapshots/history and one acknowledged
answer preserved; one original-input job/score/release50%, unchanged budgets and
reload result. No product defect/change. Both Chrome24 responses/four screenshots,
existing refill/reading/expiry journeys, assembly49/student31/contracts106/consumer11/
build/typecheck/drift/import/docs PASS. Separate Sol6.1/Medium requested late-request
assertions, repaired and both modes rerun; final no findings, syntax/whitespace
only. [Executed evidence](../reviews/WEB_004_PENDING_SAVE_EXPIRY_VERIFICATION.md).
Sol accountable; reservations released, owner files preserved. Next bounded card:
CREATED browser reservation/reload, explicit start and late-start cancellation.
Recommended Sol6.1/High, separate Sol6.1/Medium review. Full acceptance/human
inventory/manual AT/Track A remain outstanding.

2026-10-23 real save-rate-limit browser coverage **IMPLEMENTED / VERIFIED** from
`d6eaee0`: isolated USER_SAVE and ATTEMPT_SAVE each produce actual200/429/429/200,
retain pending draft/navigation guards, same-key explicit retry after real refill,
revision1, unchanged clocks and unthrottled100% submit/result with both save
buckets unchanged. Existing production workflow needed no change. Actual both
Chrome modes20 responses/four screenshots each, default/reading browser,
attempt28/student31/contracts106/consumers11/build/typecheck/drift/import/docs PASS.
Separate Sol6.1/Medium review requested stronger submit-budget assertion, repaired;
final no concrete findings, independent syntax/whitespace only. Sol accountable;
reservations released, owner AGENTS/research preserved. [Evidence and commands](../reviews/WEB_004_RATE_LIMIT_VERIFICATION.md).
Next bounded card: actual deadline expiry during429 pending save; existing paths
are verified separately. Recommended Sol6.1/High while Luna is usage-limited,
separate Sol6.1/Medium read-only review. Manual AT/lawful inventory/Track A remain
outstanding; full WEB-004 acceptance is unchanged.

2026-10-22 clean-checkout continuation IMPLEMENTED/VERIFIED under
[autonomous authority](../decisions/LOCAL_STUDENT_INTEGRATION_AUTHORITY_2026_10_22.md).
Baseline `02f2b61`, integration/demo `cf193e4`, portability `53b2c86`, terminal
shutdown `0cb49a2`; [actual evidence](../reviews/WEB_004_CLEAN_CHECKOUT_VERIFICATION.md).
Fresh pinned install/build, full PG/static/contract/browser and docs PASS; separate
clean keyboard actual PASS75 focus/18 AX/22responses. Terminal SIGINT issue found
by real npm command, fixed via isolated worker and stronger2-test whole-group
regression; coordinator student8 PASS. Final reviewer runtime context failed,
static review no P1/P2; do not claim final independent supervisor2PASS. All writers
released. Only AGENTS/local research remain unstaged, byte-preserved. Manual AT/
native zoom/full accessibility NOT EXECUTED; packet prepared, WEB-004 IN_PROGRESS.
No G1/schema change, production stock, push/merge/deploy/Astra/paid model API.

2026-10-22 bounded existing-client PostgreSQL integration **IN_PROGRESS** from
`ccc14e0`; transport checkpoint `e8a5f5b` (six task files, only two server lines).
Actual Sol transport/integration/PG/browser verification, native Luna/XHigh client,
separate read-only Sol6.1/Medium review; no open P1/P2. Real Chromium/PG mixed-type
allocation → acknowledged revisions → queued submission → released score/review,
reload/restart, account-race/privacy/rights and clock/timezone checks PASS.
Student6/local13/B0 21/contracts106/consumers11/build/typecheck/drift PASS; existing
mock browser PASS. [Evidence](../reviews/WEB_004_PERSISTENT_STUDENT_VERIFICATION.md).
Owner-overlapped main/server and dependent browser/state tests remain unstaged;
clean checkpoint must not be represented as containing the integrated UI.
Root completed integration; Luna added actual offline/reconnect and second-tab
revision-conflict browser tests. Luna and Sol each executed the final PG/Chromium
journey successfully; separate Sol review has no open findings. All reservations
released. Full accessibility/expiry acceptance remains outstanding. No new
API, publication, mock fallback, G1 change or UI reconstruction.

Deadline continuation verified: optional fixture duration before immutable blueprint
allocation, explicit8-second real-PG/browser expiry mode. Actual Luna+Sol runs PASS;
original clocks/seals/history/answer/digest unchanged, owned reload EXPIRED/PENDING,
one job, no submit POST, recovered25% release. Default browser and student6 PASS;
separate Sol final two-file review no open P1/P2. All reservations released.
2026-10-22 keyboard/reflow + second-engine continuation IMPLEMENTED/VERIFIED in
preserved worktree; opt-in test/evidence checkpoint `13c56ad`. [Evidence](../reviews/WEB_004_ACCESSIBILITY_CROSS_BROWSER_VERIFICATION.md).
Luna/XHigh wrote initial accessibility mode and reproduced errors, then hit actual
usage limit; accountable Sol finished tests and persistent-only focus/modal fixes.
Actual Chromium keyboard/PG journey PASS:76 focus entries/zero mismatches,18 AX
checks,22 response inspections,640px half-width reflow equivalence. Actual Firefox156
mixed-type saved-answer/reload/pending/grade/review PASS. Separate Sol6.1/Medium
review no open P1/P2; it reviewed evidence, did not run browsers. Final B0 21/student6/
local13/contracts106/consumers11/build/typecheck/import and Chrome default/expiry/
mock plus Firefox PASS. Docs retains five owner errors. No G1/API/schema changes.

Owner-overlapped main/server and UI-dependent state test stay unstaged; new opt-in
browser script checkpoints require that preserved working-tree UI, not a clean
checkout alone. All reservations released. WEB-004 still IN_PROGRESS for qualified
manual screen-reader/native200% zoom and full accessibility acceptance. Automated
Firefox zoom shortcuts did not change measured DPR/viewport; no zoom pass inferred.
No official conformance/content/human review/publication claim. Next bounded card:
manual assistive-technology/zoom review packet, then fixes for actual findings and
safe integration of the preserved owner UI baseline. Recommended Sol6.1/High while
Luna is usage-limited, separate Sol6.1/Medium review when available.

- Objective: implement the remaining student rendering journey against completed backend DTOs, with no business clock or scorer in the client.
- Prerequisites: EXAM-001, EXAM-002, SCORE-001 and frozen student contracts; G3 for the integrated browser evidence.
- Input specifications: API AttemptView/AnswerAck/Closure/Result, EXAM_ENGINE_SPEC, QUESTION_SCHEMA renderers, test strategy Q-06/Q-08/Q-09.
- Files/modules: `src/app/(student)/attempt/[id]/page.tsx`, `src/components/student/attempt-session.tsx`, `tests/e2e/student-attempt.spec.ts`.
- Expected deliverables: active-section renderer, server-time countdown, acknowledged autosave/conflict/retry UI, closure state and released-only result/history view.
- Acceptance criteria: changing client clock/timezone cannot extend a deadline; an unacknowledged save is never shown as saved; future/private slots and keys/explanations are absent before release; results are labelled unofficial practice.
- Required verification: browser multi-tab/offline/reconnect/expiry journeys, keyboard/zoom/screen-reader checks, response/hydration/bundle leakage scan and controlled-clock boundary tests. Suggested agent capability: MEDIUM (Terra). Risk: High — timing/key leakage. Status: IN_PROGRESS for the bounded local integration above; full EXAM/SCORE/WEB acceptance remains outstanding.

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
