# Exam assembly specification

Status: PROPOSED, ADR-003/004/007, except owner-approved ADR-004 H1 global active-attempt limit, H2 admission semantics, H3 one-domain MVP tests and the separately scoped mandatory 600-second MVP Start TTL. Authority for blueprint selection, reproducibility and form sealing. [Engine](EXAM_ENGINE_SPEC.md) owns delivery and scoring. ADR-004 remains PROPOSED as a whole.

## Blueprint contract

An immutable blueprint version contains UUID identity/version/hash, name, profileKind INDEPENDENT_PRACTICE or PUBLIC_REFERENCE, source-evidence IDs where relevant, supported schema/types, ordered sections `{id, section, count, durationSeconds}`, skill minimum/maximum quotas, optional editor difficulty/cognitive quotas, maximum per source, excluded question identities, bundle policy and practice scoring/release policy versions. Total count equals section sum; durations are positive integer seconds. Each question counts once per slot and can satisfy multiple skill minima when tagged with several skills; this overlap is deliberate and must be explained in quota validation.

For an MVP offering, validation requires exactly one section entry whose `section` is MATH, READING or SCIENCE. It seals one domain test with its own form, attempt and duration; no assembler may concatenate the three MVP profiles into one attempt. The generic blueprint array remains capable of expressing multiple entries for a future separately approved profile. The entry's opaque `id` stays distinct from its domain `section` enum.

Validate quota ranges, per-section totals, supported renderer/scorer types, maximum 200 questions and 6 hours per form (engineering limits, not official TSA rules). Contradictory quotas fail at configuration time where provable. Both quota minima and maxima are hard constraints, including overlapping skill tags; evaluate each dimension against the completed section, not by assuming disjoint buckets. A null difficulty label never satisfies a difficulty quota. The independent starter profile is defined only in [MVP](MVP_SCOPE.md). A public reference profile requires verified evidence; never silently substitute an independent profile.

Shared stimulus bundles are immutable ordered lists of question version IDs under one stimulus version and one section. MVP permits standalone questions or ALL_OR_NONE bundles; any question with a stimulus must belong to exactly one eligible bundle in a given bank revision. Bundle size contributes its question count to quotas. Select and order the bundle as a unit; maintain internal order. Mixed-section bundles are invalid. All members must pass eligibility.

## Eligibility and hard invariants

At sealing, every selected version is APPROVED, not quarantined/retired, current for that question's eligible selection pointer, rights-valid for display for at least the form availability window plus maximum attempt duration, validated, compatible with the blueprint and supported by the renderer/scorer. Approval does not imply calibration; MVP permits explicitly uncalibrated public practice content.

Hard constraints: exact section counts, mandatory skill/difficulty quotas, no repeated identity, no confirmed duplicate/enemy pairs, complete bundles, source limits and the selected reuse policy. Soft preferences: lower prior exposure, diverse topics and closer target difficulty when not a hard quota. Do not relax hard constraints without a new blueprint version and explicit owner/assessment-manager action. NEW_ONLY per-student exclusions are mandatory in the MVP, as defined in [reuse policy](QUESTION_REUSE_POLICY.md). Only explicit REVIEW_ALLOWED or FIXED_AS_PUBLISHED may repeat prior assignments. Global sealed-form usage is never a hard stock/exposure cap in these practice modes.

### Database candidate read and conflict graph

The candidate read is scoped to the pinned blueprint version and its `taxonomyVersionId`. At the database boundary, select only the current eligible version pointer for each stable `questionId` whose approval, validation, quarantine/retirement, rights interval, content type, section, taxonomy and blueprint exclusion checks all pass. Read the rights decision and publication revision with the candidate record; an earlier catalog count is not eligibility evidence. Apply `NOT EXISTS` against that student's first-assignment history for NEW_ONLY by mapping each historical `questionId` and candidate `questionId` through the **current canonical** reuse-equivalence group (following retired-group aliases). This must also exclude a corrected version sharing a historical stable ID. The authenticated user ID is server derived. REVIEW_ALLOWED does not apply this historical predicate, but retains every other eligibility and within-form check. A fixed published form selects no new candidates when a student creates an attempt; admission and rights are checked against its frozen slots.

Materialize the filtered rows, their version/content hashes and all hard-constraint edges into the private manifest. A bundle is a candidate unit only if every member survives the database filter, belongs to one section and one stimulus version, has an immutable internal order and is not internally conflicting; an ineligible member removes the whole unit. A standalone question is one unit. Reject duplicate stable IDs or canonical groups within a form and confirmed EXACT, NEAR_DUPLICATE or ENEMY pairs across chosen units. Confirmed equivalence is also a cross-attempt NEW_ONLY exclusion; ENEMY is a within-form conflict, not automatically a cross-attempt equivalence. RELATED or shared stimulus alone does not exclude future questions. Unresolved duplicate flags block publication under the bank review gate; assembly cannot treat them as cleared. Recheck these predicates at sealing under the publication guard because the search-time read can become stale.

For each selected unit, add its entire member count and all applicable tags to its section's quota vector. A partial branch is pruned when any maximum or source cap is exceeded, or when the remaining compatible units cannot reach a required minimum or section count. The final validator independently recomputes exact section counts, every minimum and maximum, source caps, group/conflict edges and complete bundles from selected slots. Soft ranking never makes an otherwise eligible identity unavailable.

MVP exposure means number of sealed forms containing a question identity, not student views. Increment at sealing once for analytics, never as a reservation of global stock; no automatic decrement on withdrawal. Actual starts are recorded separately for future usage analytics. This definition avoids pretending to provide high-stakes exposure control.

## Algorithm and reproducibility

1. Validate request, authenticated student (for personalized), mode, offering/blueprint and seed (unsigned 32-bit integer; generate server-side for student requests; authorized staff may specify one for fixed assembly). Student cannot supply another user ID or manipulate candidate exclusions.
2. Capture a versioned manifest: sorted eligible version IDs/hashes, bundle membership and internal order, taxonomy/quota attributes, rights decision versions, duplicate/enemy edges, current reuse-group mapping, bank eligibility revision, global usage counter snapshot, and for personalized creation the student's allocation revision plus retained historical exclusion identity/group set. Include the pinned blueprint hash, selected mode, canonical ordering rules, search limits and algorithm version. Retain the manifest itself, not only its hash. This is a protected administrative artifact, never a student response.
3. Use a specified seeded PRNG and stable ordering, with versioned tie-breaking. Proposed `assembly-v1`: ascending lowercase UUID input, `xorshift32-v1` below, seeded Fisher–Yates unit shuffle, constrained selection with bounded backtracking. Prefer most constrained unmet quota first; stable ties then seed order. Every search decision, branch order, soft-rank tie, node-count rule and final section/slot ordering must be a pure function of the stored tuple; no database row order, wall clock, process-local random state or live counter read may influence a replay. FOUND-002 must freeze the remaining search tie-breaking/canonicalization and complete manifest-to-slot golden fixtures before independent consumers implement the algorithm; PRNG vectors alone do not establish full assembly reproducibility. A run lacking that versioned full contract cannot claim bit-for-bit replay.
4. Proposed search limits: 50,000 visited nodes and 2,000 candidate bundles. Node count, not wall time, determines deterministic search exhaustion; infrastructure timeout is a distinct operational error. A complete solution is accepted only after the final validator passes. No valid complete solution → return diagnostic, no form.
5. Commit using the attempt-creation transaction below: after global active-attempt reconciliation, recheck exact current history/rights/group/publication state, then atomically persist the sealed form when applicable, CREATED attempt, first-assignment history, manifest when applicable and success receipt. New fixed forms use the same snapshot-sealing path without a student; fixed assignments record history later at attempt creation. No global quota is consumed. Replan only for a stale manifest or other allocation contention while no valid active attempt exists; never use it to bypass H1.

Stored tuple `(blueprint version/hash, manifest, algorithm version, seed, limits)` must replay identical section/slot ordering and content hashes, or report a replay mismatch; preserve the original manifest and result for audit. A seed alone against a changing bank is not reproducible. A replan after a revision conflict is a new run and manifest under the original request idempotency key, not a replay of the superseded search. Historical replay verifies the historical decision and never authorizes new delivery of revoked content.

Bank eligibility/rights/equivalence publication changes take the exclusive bank-publication transaction advisory lock; allocation/sealing takes its shared counterpart only for short final validation/commit. This replaces exclusive serialization of all seals and allows different users to allocate concurrently. Heavy search and factory calls never hold it. Publication cannot change the graph during final validation. Lock namespace/encoding is a frozen FOUND-002 contract. Bounded replan (3 attempts) returns CONCURRENT_MODIFICATION on persistent contention; no fallback to repeated items.

## Outcomes and operational recovery

Success returns SEALED form with immutable order and scoring inputs. Form availability metadata (availableFrom/availableUntil, withdrawnAt) is separate from content and audited. Sealed content never becomes editable. Assembly failure creates a diagnostic record, not a partial deliverable.

Errors: `INSUFFICIENT_ELIGIBLE_INVENTORY` (provable bank-level eligible constraint), `INSUFFICIENT_UNSEEN_INVENTORY` (provable student-specific NEW_ONLY constraint after the eligible baseline is sufficient), CONSTRAINT_CONFLICT (proven blueprint/constraint incompatibility), SEARCH_EXHAUSTED (no proof of infeasibility), UNSUPPORTED_TYPE, RIGHTS_BLOCKED, CONCURRENT_MODIFICATION and TIMEOUT. “Inventory shortage” is a generic concept, never an API error code. A bank-level shortage is proven when filtered compatible units cannot supply a section count or required quota even before search, or when exhaustive search of the captured finite eligible pool proves infeasibility within its bounds. A student-specific unseen shortage additionally requires proof that the same captured eligible baseline is sufficient without that student's exclusions and insufficient after applying their stable-identity/current-canonical-group exclusions. A contradiction inherent in the blueprint is CONSTRAINT_CONFLICT. A node/bundle cap or timeout without proof returns SEARCH_EXHAUSTED or TIMEOUT, never either insufficiency code. A stale manifest is replanned before classifying the current bank as short. Staff diagnostics follow role limits; students receive an explicit safe shortage result with requested blueprint version/reuse mode, safe section deficits where proven and opt-in alternatives from the reuse policy, never candidate IDs, group IDs, private source data, other users' history or automatic generation. Alternatives require a new explicit request and policy validation; the failed request has no form, attempt, first-history rows or success receipt. Remediation is more eligible content, corrected blueprint, or later better solver, never publishing invalid forms. Retrying a committed idempotency key returns the original form without exposure increments.

## Alternatives

Constrained random + bounded backtracking is small, inspectable and sufficient to exercise a modest bank. Pure greedy can dead-end and must not claim the inventory impossible. CP-SAT/MILP can handle intersecting quotas and quality objectives more effectively but adds runtime/dependency and reproducibility considerations; adopt only after measured v1 failure cases, licensing and deterministic configuration review. Solver timeout has the same non-proof semantics; any fallback must revalidate every hard invariant. Adaptive testing is a separate future product, not an inferred HUST feature.

Verification: assembly invariant/property, golden replay, shortage/bundle/enemy fixtures and concurrent approval/rights/allocation tests in [test strategy](../quality/TEST_STRATEGY.md).

## Reconciliation clarifications (PROPOSED, 2026-10-16)

Blueprints pin one `taxonomyVersionId`; eligible questions must use that taxonomy version. Each `BlueprintConfig.sections[]` entry has an opaque, blueprint-local `id` and a domain `section` enum: the `id` identifies the entry in quotas, form sections, section deficits and slot projections; the enum selects the question section. `Quota.sectionId` must exactly equal one entry `id`; it is never a `Section` enum value. Quota SKILL values reference a node of kind SKILL in that version, COGNITIVE_LEVEL values are M1/M2/M3, DIFFICULTY values are EASY/MEDIUM/HARD and match editor `difficulty.target` only (never AI prediction). Quotas use the discriminated API shape. Entry IDs must exist and be unique; integer `0 <= min <= max <= referenced section.count`; repeated `(sectionId,dimension,value)` quotas are rejected. Invalid/foreign taxonomy nodes or invalid entry references fail creation with 422 VALIDATION_ERROR, not inventory shortage. No implicit taxonomy migration.

Owner-approved H3 requires exactly one entry for each MVP blueprint, with one opaque entry ID and one domain enum. The entry ID remains the quota/form/DTO reference. Do not impose this MVP product rule as a permanent generic database prohibition on multi-section blueprints. The MVP exactly-one-section rule is enforced at offering activation and form sealing against the pinned immutable blueprint. Do not add generic `UNIQUE(form_id,section)`: future approved multi-section profiles may use distinct entry IDs for the same domain. Domain labels for MVP attempts, results and history derive from the one-section immutable form; no redundant attempt domain column is needed.

Sealing must independently assert exact section count/duration equality to the pinned blueprint, positive integer durations, total duration <=21600 seconds, total slots <=200 and per-section slot counts. Abort the entire transaction on mismatch even if blueprint validation previously passed. This is a cross-row transaction assertion, not a normal SQL CHECK over other rows. DATA-001 and ASSEMBLY-001 own rejection/rollback fixtures; no new trigger framework is required.

Exposure remains lifetime sealed-form count, including withdrawn forms, now analytics only. Withdrawal never proves nobody saw a form. If the projection is corrupt, an audited consistent-snapshot/watermark repair with idempotent catch-up recomputes from ALL sealed form_slots; record before/after/reason. Remove exposureCap from practice blueprint contracts: another student's allocations cannot make a question ineligible. Unseen-inventory shortage is addressed by the explicit alternatives in the reuse policy, never global-counter resets.

Diagnostic disclosure is authoritative in [API contracts](../architecture/API_CONTRACTS.md): EXAM_MANAGER sees section-level deficits, not eligible pools/IDs, source details or manifests. Detailed diagnostics require BANK_MANAGER; neither role alone gains the other's commands. Counts are advisory for a captured manifest, never a promise about current stock.

### xorshift32-v1 reference

Initial unsigned 32-bit state = requested seed except seed 0 maps to **2463534242**. This is a project-chosen constant; no claim about historical attribution. Each output applies, in order: `x = uint32(x XOR (x << 13))`; `x = uint32(x XOR (x >>> 17))` (logical right shift); `x = uint32(x XOR (x << 5))`. Return updated x as unsigned decimal. No warm-up/discard. This is deterministic selection randomness, not cryptography or a fairness/calibration guarantee.

| Seed | First five unsigned outputs |
|---|---|
| 0 | 723471715, 2497366906, 2064144800, 2008045182, 3532304609 |
| 1 | 270369, 67634689, 2647435461, 307599695, 2398689233 |
| 4294967295 | 253983, 4228382207, 1958451267, 4056713434, 2049502865 |

Fisher–Yates visits i=n−1 down to 1; consume exactly one output u per i, choose `j=floor(u*(i+1)/4294967296)` using exact integer multiplication/division, swap positions i/j; n<=1 consumes no outputs. Canonical unit ordering uses bundle UUID for bundles, question-version UUID for singletons, then unit kind to break any collision. Do not use platform default random/sort. Vectors were cross-calculated with JS uint32 and BigInt arithmetic during reconciliation; application tests do not yet exist.

## Attempt-creation transaction and form modes

PERSONALIZED_PRACTICE is default: one new form and one attempt, owner fixed to authenticated student. PUBLISHED_FIXED is a staff-assembled shared form, explicitly chosen by students. Both use the same forms/sections/slots/private snapshots, scoring and delivery engine. Form mode/owner are immutable and included in the form hash; attempts persist reuseMode/policyVersion. A personalized form is never reused for a later attempt or made public.

A visible blueprint_offering authorizes a pinned one-domain MVP blueprint and admission interval `[availableFrom,availableUntil)` for new creation. A personal form inherits the applicable offering admission close; a fixed form uses its published admission interval. Every created attempt stores immutable `start_before_at TIMESTAMPTZ NOT NULL`, calculated with server time and committed in the same transaction as the attempt, history and receipt. The owner-approved MVP Start TTL is mandatory 600 seconds: `start_before_at = min(created_at + 600 seconds, admission_until_at_creation)`. The committed deadline and admission eligibility are never recomputed from mutable availability, and missing or invalid required TTL configuration rejects creation rather than permitting unlimited start time. An existing CREATED attempt may first start strictly before this stored deadline without a current-admission-window recheck, provided it remains CREATED, is owned by the authenticated student, and has no withdrawal, rights, or security restriction. Rights must cover an admitted start through its configured domain-test duration; recheck at start. Cancelling an expired unstarted reservation retains assignment history. The duration need not fit before admission closes. Shorter alternatives reference other authorized offering versions, not mutations of this blueprint.

1. Check authorization/rate limits and resolve a retained idempotency receipt before active-attempt admission. The same key and request fingerprint replay the original committed creation result. The same key with a different fingerprint is an idempotency conflict. Neither outcome starts a new allocation.
2. For a request without a replayable receipt, run global active-attempt reconciliation in its own transaction. Ensure and lock the persistent `student_allocation_state` row `FOR UPDATE`; acquire the shared bank-publication guard and then lock any active attempt for that student, using the global `CREATED`/`IN_PROGRESS` state predicate across PERSONALIZED_PRACTICE and PUBLISHED_FIXED. Finalize a stale IN_PROGRESS attempt through the existing expiry/grade-job path, or cancel a stale/unusable CREATED attempt through the existing audited system command. Commit that finalization before any candidate allocation, even if the later allocation fails. Recheck after finalization. If a valid active attempt remains, return `409 CONCURRENT_ATTEMPT_EXISTS` with that attempt ID to its owner; create no form, attempt, history, manifest or success receipt.
3. Only after the reconciliation transaction finds no valid active attempt, capture bank inputs and the user's history/revision in a short consistent read snapshot, then release reads before bounded search. Persist the actual historical exclusion set in a personalized manifest, not only a revision number. Candidates whose current group intersects prior identities are removed; remove any bundle with an excluded member. Fixed-form creation does not select candidates.
4. Begin the creation commit transaction and lock `student_allocation_state` again. Recheck the idempotency receipt and request fingerprint before every other outcome. Then acquire the shared bank-publication guard and recheck the global active-attempt predicate. If a newly observed active attempt is stale, roll back this otherwise read-only admission check, finalize it in a separate reconciliation transaction, and restart from step 2. If a valid active attempt remains, return `409 CONCURRENT_ATTEMPT_EXISTS` with no allocation side effects. Otherwise read current history/group/rights/eligible pointer and offering, and compare their revision/hash inputs with the captured manifest. A bank/history revision change requires a fresh manifest/replan, not a claim that the original seed still selects identically. Do not hold the user or publication lock during search; release on rollback before replanning.
5. Revalidate every hard constraint plus NEW_ONLY identity/group exclusions from database state under both guards. For personalized creation, seal immutable form/section/slot public and private snapshots and insert the personal form/availability plus its owned CREATED attempt. For fixed/review creation, verify the frozen snapshot's availability/rights and insert the CREATED attempt without reselection. In either mode, insert first-history rows for every newly assigned stable identity, increment allocation revision, and persist the success idempotency receipt carrying the stored `start_before_at` in this same transaction. Only explicit fixed/review modes may preserve an existing first-history row. Strict duplicate conflicts abort/replan; they must not be hidden by `ON CONFLICT DO NOTHING`. The final sealing assertions also run in this transaction. Any allocation failure rolls back its form, attempt, snapshots, history, revision and receipt together; no abandoned global reservation or partial student allocation.
6. Return the safe receipt only after commit. No model call/job is enqueued by any creation branch. A distinct-key request cannot obtain a second active attempt, even if its snapshot search started earlier; it receives `409 CONCURRENT_ATTEMPT_EXISTS` while the first remains valid. Different students use different locks and can obtain identical items.

Lock order when combined: student allocation row → shared bank-publication lock → existing active attempt row → relevant availability row. The active-attempt reconciliation path uses this order for both modes; new attempts have no existing row to lock. Start/access guards requiring publication consistency take shared bank lock before attempt then availability. Save/submit/expiry remain serialized on attempt; they do not mutate allocation history or acquire the user lock afterward. Publication takes exclusive bank lock, writes holds/revision, commits, and only then fans out attempt cancellations; never acquire user/attempt locks while holding exclusive publication lock. No process may reverse this order.

Global usage projections must not serialize every user's creation behind a popular question row: compute counts from sealed forms or an asynchronous idempotent projection; store the ranking snapshot used by a run. The form/attempt/history transaction is authoritative, not availability of an analytics worker. A full replay uses captured bank/history/group/counter inputs, policy/algorithm versions and seed; replay is an administrative verification, not a new assignment of revoked/seen questions.

### Required allocation scenarios

| Scenario | Committed outcome |
|---|---|
| Students A and B request the same eligible identity | Both may receive it; neither student's history or global usage excludes it for the other. |
| A creates NEW_ONLY, then requests NEW_ONLY again before the first closes | The distinct-key second request returns `409 CONCURRENT_ATTEMPT_EXISTS`; it does not allocate a second form or history. After the first closes, a new NEW_ONLY request excludes every first-form stable ID and its currently confirmed equivalence group; a corrected version cannot re-enter. |
| Two distinct-key A requests race, including a personalized request versus fixed/review request | The per-user commit lock orders them. One may create the active attempt; the other returns `409 CONCURRENT_ATTEMPT_EXISTS` with no form, history, manifest or success receipt. |
| A same-key retry follows a committed create or lost response | Return the original receipt, including its committed `startBefore`, and exact form/attempt; no second history insertion, deadline calculation or snapshot. |
| A search or sealing assertion fails, or the unseen pool is provably insufficient | No partial form, CREATED attempt, history, revision advance or success receipt; shortage is explicit only with proof. |
| A form is sealed, then bank content is corrected, retired or equivalence groups merge | Its ordered public/private snapshots stay unchanged; future NEW_ONLY filtering uses current bank/group state, while access/rights guards can block delivery. |

These are specification outcomes, not executed concurrency evidence. Real PostgreSQL barrier tests, replay fixtures and protected DTO checks remain required by the [test strategy](../quality/TEST_STRATEGY.md).

## Stage 4B executable replay contract — assembly/1

Scoped D3 approval, 2026-10-19, permits a dependency-free reference, not database
allocation or G1 advancement. Input `assembly-manifest/1` stores complete
BlueprintConfig plus blueprintVersionId and its JCS SHA-256 hash, seed uint32,
reuseMode NEW_ONLY/REVIEW_ALLOWED, bankRevision, immutable rights-version records,
historyQuestionIds/historyGroupIds, units and conflicts. No live inputs are read.
Each unit has lowercase UUID id, sectionId and ordered members; each member has
questionId/versionId/contentHash, canonical groupId, section/taxonomyVersionId,
interactionType, skillIds, cognitiveLevel, editor difficulty, sourceIds and captured
nonnegative exposureCount. IDs/groups/source IDs and version IDs are distinct
where required. Units must be internally compatible; sourceIds are nonempty and
unique. Reject malformed manifests, unsupported types/taxonomy and invalid edges.
Canonical manifest bytes include all inputs; order units by ID and normalize sets
(history, rights versions, edges and member tag/source arrays), retaining blueprint
section order and member order. Compute manifestHash from JCS, never locale order.

Hard checks: exact section counts; all blueprint quota minima/maxima; maxPerSource
counts each member once for each distinct source; no repeated stable question or
canonical group; conflicts forbid co-selection; bundles stay whole. Excluded
question IDs remove the entire unit. NEW_ONLY additionally removes a unit if any
member's stable ID or canonical group is historical. A final validator independently
recomputes all constraints from selected units before success.

Reference search: canonical ID order -> existing seeded Fisher–Yates -> stable
usage rank (sum of captured member exposures, then seeded position). At each state
choose the unmet quota with minimum remaining compatible contribution / deficit
using integer cross-products; ties are section index, dimension and value by code
unit order. If no quota is unmet, use the first incomplete section. Branch on the
first ranked remaining unit contributing to that quota/section: take then skip.
Prune exceeded maxima/conflicts/counts/source caps and branches whose remaining
upper-bound capacity cannot reach a count/minimum. Do not use underestimates to
prove shortage. Count root and every entered child, including pruned states; check
budget before entering. Emit selected units by seeded position within blueprint
section order, then frozen member order. Return immutable references/snapshots,
not mutable bank rows. Replay compares both manifest and selected slot hashes.

For NEW_ONLY establish eligible-baseline feasibility first, then student-filtered
feasibility under a shared node budget. Exhausted baseline => SEARCH_EXHAUSTED;
proved failed baseline => INSUFFICIENT_ELIGIBLE_INVENTORY; feasible baseline plus
proved failed personal search => INSUFFICIENT_UNSEEN_INVENTORY. Any cap without
proof => SEARCH_EXHAUSTED. REVIEW_ALLOWED needs baseline search only. Invalid
blueprints/manifests are validation errors, not stock shortage. All failures return
no selected slots. Freeze a version only with literal manifest-to-slot goldens,
small exhaustive oracle comparisons, boundary tests and measured stress evidence.

Initial proposed parameters remain 50,000 visited nodes, 2,000 units and three
contention replans; measurements must accompany any frozen defaults. Callers pin
explicit limits in every manifest. Publication guard namespace `(1414742321,1)`
is a reserved two-int PostgreSQL transaction advisory lock: shared for final seal,
exclusive for eligibility mutation. This reference does not execute locks or
claim transactional correctness; existing lock order and short-transaction rules
remain binding for later adapters.
Conflict edges are strict `{leftUnitId,rightUnitId}` pairs, representing any confirmed
member conflict between those units; no self/missing/duplicate edge. Slots are
`{sectionId,ordinal,unitId,questionId,questionVersionId,contentHash}` references,
with zero-based ordinal within section; slot hashes cover these exact values.
Canonical group IDs in members/history are already resolved using the captured
bank snapshot, not historical aliases. Sum of minima for mutually exclusive
COGNITIVE_LEVEL or DIFFICULTY quotas exceeding a section count is
CONSTRAINT_CONFLICT before bank search; skill minima may deliberately overlap.
The reference records limits explicitly, permits zero budgets for boundary tests,
and rejects unsafe/unbounded input budgets. A bounded pure replan helper can
exercise three contention attempts and CONCURRENT_MODIFICATION without claiming
actual database locking. Never return partially selected slots on failure.
Exact manifest keys are schemaVersion:"assembly-manifest/1",
algorithmVersion:"assembly/1", blueprintVersionId, blueprintHash, blueprint, seed,
reuseMode, bankRevision, rightsVersions, historyQuestionIds, historyGroupIds, units,
conflicts and limits. rightsVersions entries are strict
`{sourceId,versionId,contentHash}` immutable decision references, unique by sourceId;
all member sourceIds must have an entry and no unreferenced entry is allowed.
Member keys are questionId, versionId, contentHash, groupId, section,
taxonomyVersionId, interactionType, skillIds, cognitiveLevel, difficulty, sourceIds
and exposureCount. Exposure counts are safe nonnegative integers. Canonical sets
are sorted by UTF-16 order; structural duplicates in source/tag lists fail, while
historical exclusions are normalized sets. Max raw units 10,000, members/unit 200,
canonical manifest 16 MiB; caller limits maxNodes 0..50,000/maxUnits 0..2,000.
The unit cap returns SEARCH_EXHAUSTED (not a claim of shortage). These parser/work
ceilings are technical safety limits, not official test rules. Success/failure
result includes manifestHash, visitedNodes, slots and slotsHash; failure slots are
empty. A replay helper compares stored manifestHash and slotsHash against a fresh
reference run and reports mismatch without altering stored data.

`bankRevision` is an opaque nonempty string, preserved verbatim (no trimming,
number coercion or floating-point revision arithmetic). This technical wire choice
can carry database bigint revisions without JavaScript precision loss; blank-only
or malformed Unicode tokens are rejected. No live database revision is inferred.

Member cognitiveLevel and difficulty are the existing nullable question/1 labels;
null contributes to no corresponding quota. Identity/source/version/group/skill
IDs use lowercase UUIDs; section entry IDs remain opaque. Repeated version IDs
across alternative units must carry identical normalized member projections, and
one stable question ID maps to one captured canonical group. Alternate versions
remain valid candidates; co-selection is forbidden by the stable identity/group
hard constraint. Sum captured usage with exact integer arithmetic for ranking.

The pure contention helper uses explicit `maxAttempts`: its initial reference
value 3 includes the first plan (at most two retries). Earlier "three replans"
wording was an unvalidated proposal, not a frozen retry count. Exhausting attempts
returns CONCURRENT_MODIFICATION with no accepted slots. Unit-cap rejection occurs
before search and may report zero visited nodes; a zero node budget enters none.

Each baseline/personal search first applies its whole-unit exclusions, then sorts
and shuffles its own remaining pool. Final selected-unit order uses that pool's
seeded positions, independently of exposure-based branch rank. Reference ceiling
behavior is verified by the committed boundary/oracle/stress fixtures; measured
local timing is in LAST_HANDOFF. These measurements do not establish production
SLOs or database contention performance. Future budget changes must be explicit
manifest/version decisions, never silently change a stored replay.
