# Inherited acceptance matrix

Evidence reconciled November 5, 2026; original audit November 2.

This is a navigation map from the required [Q-01–Q-16 invariants and A–J
scenarios](../quality/TEST_STRATEGY.md) to present test files and predecessor
evidence. It is not a fresh test run or release acceptance. “Historical subset”
means the linked record reports execution for that bounded scope; it does not mean
the current dirty working tree was reproduced or the entire invariant passed.
Human rights/content approval, qualified accessibility and production/operations
acceptance remain outside these automated records.

Fresh execution supplement: [baseline](RECOVERY_BASELINE_2026_11_02.md),
[populated026 upgrade](RECOVERY_READING_UPGRADE_2026_11_02.md),
[portable reproduction](RECOVERY_PORTABLE_REPRODUCTION_2026_11_02.md) and
[remaining service suites](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) and
[second-engine/keyboard/actual-zoom automation](RECOVERY_BROWSER_ACCEPTANCE_2026_11_02.md) now contain
dated working-tree results. Rows below distinguish those recovery executions from
predecessor evidence; neither supplies full acceptance merely because a suite passed.

The November 4 [integrated privacy scan](RECOVERY_STUDENT_PRIVACY_2026_11_04.md)
and [Factory credential isolation](RECOVERY_FACTORY_ISOLATION_2026_11_04.md), and
November 5 [student-operation repair](RECOVERY_OPERATION_IDENTITY_2026_11_05.md),
replace earlier missing-evidence statements in the affected rows. The
[manual draft revision](RECOVERY_MANUAL_DRAFT_REVISION_2026_11_04.md) supersedes
quality observations about older draft versions; human approval remains absent.
This reconciliation executes no application tests and grants no acceptance.

November 5 RECOVERY028 adds [implemented private manual v3 transport](../../plans/reports/implementation-261105-2205-manual-draft-transport.md):
root command28/combinedPG74 and actual independent contract7/config5 review.
The real pilot remains unimported pending the exact registration/snapshot decision.
The owner's [current local engineering authority](../decisions/OPEN_DECISIONS.md)
also covers the reviewed media/planner designs; their implementation is still
future work. Historical PROPOSED labels on immutable design documents are dated
records, not the current authority. Human/production acceptance remains absent.

November 5 [staff browser execution](RECOVERY_STAFF_BROWSER_2026_11_05.md) supplies
RP-02's previously missing fresh staff results in Chromium and Firefox. The
report distinguishes grouped checks, mixed Firefox student/staff scope and its
actual 500px minimum narrow window. No unresolved engineering defect was found
in these two runs. Earlier concrete recovery failures and their repairs remain
in [baseline](RECOVERY_BASELINE_2026_11_02.md),
[cache ordering](RECOVERY_CLIENT_CACHE_ORDERING_2026_11_04.md),
[denial fencing](RECOVERY_AUTH_DENIAL_FENCE_2026_11_04.md) and
[operation identity](RECOVERY_OPERATION_IDENTITY_2026_11_05.md). Remaining gaps
below are acceptance dependencies, not invented code defects or all-code safety
claims; no human or release approval follows from the absence of new findings.

## Critical invariants

| Invariant | Concrete test locations | Dated execution evidence and remaining boundary |
|---|---|---|
| Q-01 Eligible content only | [`tests/integration/bank/publication-boundary.test.mjs`](../../tests/integration/bank/publication-boundary.test.mjs), [`delivery-safety.test.mjs`](../../tests/integration/bank/delivery-safety.test.mjs), [`tests/integration/assembly/candidate-stock.test.mjs`](../../tests/integration/assembly/candidate-stock.test.mjs), [`allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs) | Bank safety/review evidence in [BANK-002 delivery safety](BANK_002_DELIVERY_SAFETY_VERIFICATION.md); allocation scope in [atomic allocation](ASSEMBLY_001_002_ATOMIC_ALLOCATION_VERIFICATION.md). Synthetic fixtures only; no lawful accepted production inventory or complete approval/revocation concurrency acceptance. |
| Q-02 Exact independent review | [`tests/integration/bank/bank.test.mjs`](../../tests/integration/bank/bank.test.mjs), [`publication.test.mjs`](../../tests/integration/bank/publication.test.mjs), [`review-context.test.mjs`](../../tests/integration/bank/review-context.test.mjs), [`review-evidence` coverage in bank suite](../../tests/integration/bank/) | [Bank workflow](BANK_002_WORKFLOW_VERIFICATION.md) and [delivery safety](BANK_002_DELIVERY_SAFETY_VERIFICATION.md) record synthetic workflow checks. Qualified human review of real content is **REQUIRES HUMAN INPUT**. |
| Q-03 No unintended repeats | [`tests/integration/assembly/bundles.test.mjs`](../../tests/integration/assembly/bundles.test.mjs), [`allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs), [`tests/integration/bank/equivalence.test.mjs`](../../tests/integration/bank/equivalence.test.mjs) | [Local C/D/F map](TRACK_B_LOCAL_ACCEPTANCE_2026_10_25.md#scenario-reconciliation) and [allocation evidence](ASSEMBLY_001_002_ATOMIC_ALLOCATION_VERIFICATION.md). Bounded synthetic identity/equivalence and bundle coverage; not a proof of all semantic duplicates. |
| Q-04 Historical content immutable | [`tests/integration/database/foundation/bank-core.test.mjs`](../../tests/integration/database/foundation/bank-core.test.mjs), [`tests/integration/grading/transactions.test.mjs`](../../tests/integration/grading/transactions.test.mjs), [`tests/integration/results/delivery.test.mjs`](../../tests/integration/results/delivery.test.mjs) | [Scenario G](TEST_002_PUBLICATION_DURING_ATTEMPT_VERIFICATION.md) supplies the sealed-original oracle; [November 2 services](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) reran its foundation/grading/results test owners. The [populated025→026 check](RECOVERY_READING_UPGRADE_2026_11_02.md) separately verifies existing rows/security and continued grading. Bounded local migration evidence, not a production release or rollback acceptance. |
| Q-05 Scoring | [`tests/scoring/binary.test.mjs`](../../tests/scoring/binary.test.mjs), [`tests/integration/grading/worker.test.mjs`](../../tests/integration/grading/worker.test.mjs), [`tests/integration/grading/transactions.test.mjs`](../../tests/integration/grading/transactions.test.mjs) | [November 2 services](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) executed the grading/results/recovery suites, supplementing the pure scoring check in the [original audit](../tasks/RECOVERY_PLAN_2026_11_02.md). [November 4 grading](RECOVERY_FACTORY_ISOLATION_2026_11_04.md) also reran worker/transaction cases. Synthetic binary-score evidence; no official scoring equivalence or empirical item calibration. |
| Q-06 Save/resume | [`save/race/HTTP tests`](../../tests/integration/attempts/), [`process-recovery.test.mjs`](../../tests/integration/student-runtime/process-recovery.test.mjs), [`transport.test.mjs`](../../tests/integration/student-runtime/transport.test.mjs), [`persistent-api-operation-fence.test.mjs`](../../tests/critical/persistent-api-operation-fence.test.mjs) | [November 2 attempts](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) and [November 5 student/transport/browser results](RECOVERY_OPERATION_IDENTITY_2026_11_05.md) rerun saves, reload, typed revisions and process recovery. [Cache ordering](RECOVERY_CLIENT_CACHE_ORDERING_2026_11_04.md), [confirmed denial](RECOVERY_AUTH_DENIAL_FENCE_2026_11_04.md) and whole-operation fencing repairs have actual independent reviews. No deployed-browser or human usability acceptance. |
| Q-07 Idempotent closure | [`tests/integration/attempts/submit-races.test.mjs`](../../tests/integration/attempts/submit-races.test.mjs), [`deadline-races.test.mjs`](../../tests/integration/attempts/deadline-races.test.mjs), [`tests/integration/results/races.test.mjs`](../../tests/integration/results/races.test.mjs) | [November 2 services](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) reran submit/deadline/result race owners; [November 5 transport/browser](RECOVERY_OPERATION_IDENTITY_2026_11_05.md) retains one-job and same-key lost-acknowledgement checks. [Seeded lifecycle](TEST_002_SEEDED_STUDENT_LIFECYCLE_VERIFICATION.md) and [HTTP lifecycle](TEST_002_HTTP_LIFECYCLE_VERIFICATION.md) define additional bounded oracles. The full cross-path matrix remains broader. |
| Q-08 No premature keys | [`student-leakage.test.mjs`](../../tests/critical/student-leakage.test.mjs), [`leakage-oracle.mjs`](../../tests/critical/leakage-oracle.mjs), [`public server tests`](../../apps/practice-prototype/test/server.test.mjs), [`result HTTP tests`](../../tests/integration/results/http.test.mjs) | [November 4 integrated scan](RECOVERY_STUDENT_PRIVACY_2026_11_04.md) covers real HTTP raw/private values, errors, mounted public code, owner releases and withdrawal; [public-asset regression](RECOVERY_PUBLIC_ASSET_PRIVACY_2026_11_02.md) supplies static-path controls. [November 5 identity fencing](RECOVERY_OPERATION_IDENTITY_2026_11_05.md) adds stale private-result rejection. Remaining gaps: supported media delivery, full profile/browser coverage and untested encodings/side channels. These are bounded scans, not an exhaustive Q-08 acceptance. |
| Q-09 Server timing | [`tests/integration/attempts/deadline-races.test.mjs`](../../tests/integration/attempts/deadline-races.test.mjs), [`start-delivery.test.mjs`](../../tests/integration/attempts/start-delivery.test.mjs), [`tests/integration/recovery/sweeper.test.mjs`](../../tests/integration/recovery/sweeper.test.mjs), [`tests/integration/student-runtime/domains.test.mjs`](../../tests/integration/student-runtime/domains.test.mjs) | [November 2 services](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) reran deadline/start/sweeper owners; [November 5 domain journeys](RECOVERY_OPERATION_IDENTITY_2026_11_05.md) retain server-clock/reload checks. [Prestart timing](WEB_004_PRESTART_TIMING_VERIFICATION.md), [admission resume](WEB_004_ADMISSION_RESUME_VERIFICATION.md) and [pending-save expiry](WEB_004_PENDING_SAVE_EXPIRY_VERIFICATION.md) describe their oracles. Full manual/system-time and all race combinations remain unverified. |
| Q-10 Deterministic assembly | [`tests/integration/assembly/allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs), [`bundles.test.mjs`](../../tests/integration/assembly/bundles.test.mjs), [`tests/integration/bank/fixed-reference-fixture.mjs`](../../tests/integration/bank/fixed-reference-fixture.mjs) | [Atomic allocation evidence](ASSEMBLY_001_002_ATOMIC_ALLOCATION_VERIFICATION.md) includes replay/manifest checks. Historical fixture tests do not establish proof of global infeasibility or every future algorithm/pool version. |
| Q-11 Cross-user/form access | [`attempt HTTP tests`](../../tests/integration/attempts/http.test.mjs), [`result HTTP tests`](../../tests/integration/results/http.test.mjs), [`pools.test.mjs`](../../tests/integration/student-security/pools.test.mjs), [`grading worker tests`](../../tests/integration/grading/worker.test.mjs), [`operation-fence.test.mjs`](../../tests/critical/persistent-api-operation-fence.test.mjs) | [November 2 auth/service](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) and [November 5 student](RECOVERY_OPERATION_IDENTITY_2026_11_05.md) runs include existing ownership/pool boundaries. [November 4 dedicated Factory LOGIN](RECOVERY_FACTORY_ISOLATION_2026_11_04.md) denies live worker-lease impersonation, student-secret reads and publication. Whole-operation cookie-swap rejection is a client-intent repair, not a server authorization bypass. Deployed identity and exhaustive property injection remain unverified. |
| Q-12 Grading recovery | [`tests/integration/grading/worker.test.mjs`](../../tests/integration/grading/worker.test.mjs), [`transactions.test.mjs`](../../tests/integration/grading/transactions.test.mjs), [`tests/integration/recovery/races.test.mjs`](../../tests/integration/recovery/races.test.mjs) | [November 2 services](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) reran grading/recovery; [November 5 student suite](RECOVERY_OPERATION_IDENTITY_2026_11_05.md) includes actual process termination, logical restore and rights-blocked recovery. [November 4 grading suite](RECOVERY_FACTORY_ISOLATION_2026_11_04.md) includes existing restart/WAL tests. These are local synthetic recovery proofs, not production RPO/RTO or backup operations acceptance. |
| Q-13 Safe content rendering/source/media | [`tests/integration/bank/content-safety.test.mjs`](../../tests/integration/bank/content-safety.test.mjs), [`tests/integration/bank/delivery-safety.test.mjs`](../../tests/integration/bank/delivery-safety.test.mjs), [`tests/ai/reading-factory.test.mjs`](../../tests/ai/reading-factory.test.mjs) | [Bank delivery safety](BANK_002_DELIVERY_SAFETY_VERIFICATION.md) and [Reading experiment](READING_FACTORY_EXPERIMENT_VERIFICATION.md) cover bounded validation/escaping. **Actionable gap:** current acceptance record does not establish a complete authorized media-serving/MIME/size/permission path; richer asset delivery remains unaccepted. |
| Q-14 Immediate rights/quarantine revocation | [`tests/integration/bank/delivery-safety.test.mjs`](../../tests/integration/bank/delivery-safety.test.mjs), [`tests/integration/bank/publication-boundary.test.mjs`](../../tests/integration/bank/publication-boundary.test.mjs), [`tests/integration/bank/fixed-form-races.test.mjs`](../../tests/integration/bank/fixed-form-races.test.mjs), [`tests/integration/attempts/start-delivery.test.mjs`](../../tests/integration/attempts/start-delivery.test.mjs) | [November 2 Bank/assembly](RECOVERY_BASELINE_2026_11_02.md) and [attempt/result services](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md) reran existing rights/quarantine tests. [November 4 integrated scan](RECOVERY_STUDENT_PRIVACY_2026_11_04.md) additionally denies all three previously released results after source withdrawal. Real legal rights, fan-out timing and supported media paths remain unverified. |
| Q-15 Atomic allocation | [`tests/integration/assembly/allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs), [`allocation-boundary.test.mjs`](../../tests/integration/assembly/allocation-boundary.test.mjs), [`tests/integration/assembly/fixed-allocation.test.mjs`](../../tests/integration/assembly/fixed-allocation.test.mjs) | [November 2 baseline](RECOVERY_BASELINE_2026_11_02.md) reran assembly, followed by the [populated-upgrade assembly rerun](RECOVERY_READING_UPGRADE_2026_11_02.md). [Atomic allocation evidence](ASSEMBLY_001_002_ATOMIC_ALLOCATION_VERIFICATION.md) owns the rollback/barrier oracles. [November 5 transport](RECOVERY_OPERATION_IDENTITY_2026_11_05.md) adds actual two-session no-allocation controls. Bounded working-tree reproduction; no clean release or universal planner correctness claim. |
| Q-16 AI cannot publish | [`grading worker tests`](../../tests/integration/grading/worker.test.mjs), [`manual-reading.test.mjs`](../../tests/ai/manual-reading.test.mjs), [`generic-fixture-import.test.mjs`](../../tests/integration/factory-bank-exam/generic-fixture-import.test.mjs), [`factory-import.test.mjs`](../../tests/integration/bank/factory-import.test.mjs), [`manual-factory-import.test.mjs`](../../tests/integration/bank/manual-factory-import.test.mjs) | [November 4 dedicated Factory LOGIN](RECOVERY_FACTORY_ISOLATION_2026_11_04.md) proves bounded existing-credential isolation. [Generic fixture import](RECOVERY_GENERIC_EXPORT_2026_11_04.md) and [November 5 manual v3](../../plans/reports/implementation-261105-2205-manual-draft-transport.md) verify private DRAFT/unselectable intake with no rights/review promotion. The real manual batch still has human0/Bank0 pending exact registration/activation disposition. Full executor, lawful rights and publication acceptance remain open. |

## A–J scenarios

| Scenario | Concrete tests and evidence position |
|---|---|
| A — 500 drafts alongside exams | No full workload/latency test is present in the dated acceptance map. `tests/ai/reading-factory.test.mjs` is bounded fixture behavior only. **NOT EXECUTED** at 500 candidates or owner-approved traffic; OPS-001/load scope outstanding. |
| B — Provider unavailable one month | No month-long controlled scheduler/production decoupling acceptance. Offline provider bridge tests are in `tests/ai/reading-factory.test.mjs`; no live/paid provider run. **NOT EXECUTED** as specified. |
| C — Cross-student reuse | [`allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs) cross-student commit case, rerun in the [November 2 baseline](RECOVERY_BASELINE_2026_11_02.md); the [C–H oracle map](TRACK_B_LOCAL_ACCEPTANCE_2026_10_25.md#scenario-reconciliation) defines the bounded scope. No accepted real-stock claim. |
| D — Same-student no repeat | [`allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs) and [`bundles.test.mjs`](../../tests/integration/assembly/bundles.test.mjs), rerun in the [November 2 baseline](RECOVERY_BASELINE_2026_11_02.md). [Local acceptance](TRACK_B_LOCAL_ACCEPTANCE_2026_10_25.md#scenario-reconciliation) defines stable-ID/equivalence and assigned/cancelled-history oracles. Bounded synthetic scope. |
| E — Exhaustion | `tests/integration/assembly/allocation-boundary.test.mjs`, `short-practice.test.mjs`, `review-allocation.test.mjs`; [review practice](WEB_003_REVIEW_PRACTICE_VERIFICATION.md) and [B11 short profiles](WEB_003_B11_SHORTER_PROFILE_VERIFICATION.md) record selected shortage/browser paths. No silent fallback; not all profiles or arbitrary inventory. |
| F — Corrected version | [`equivalence-history.test.mjs`](../../tests/integration/bank/equivalence-history.test.mjs) and [`allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs), rerun in the [November 2 Bank/assembly baseline](RECOVERY_BASELINE_2026_11_02.md). [Local acceptance](TRACK_B_LOCAL_ACCEPTANCE_2026_10_25.md#scenario-reconciliation) defines the corrected-version/merged-equivalence subset. |
| G — Publication during exam | [`delivery.test.mjs`](../../tests/integration/results/delivery.test.mjs) corrected-version case, rerun in the [November 2 services](RECOVERY_SERVICE_ACCEPTANCE_2026_11_02.md). [Scenario G evidence](TEST_002_PUBLICATION_DURING_ATTEMPT_VERIFICATION.md) owns the independently reviewed sealed-original oracle. No browser-publication claim. |
| H — Concurrent creation | [`allocation.test.mjs`](../../tests/integration/assembly/allocation.test.mjs), [`review-allocation.test.mjs`](../../tests/integration/assembly/review-allocation.test.mjs) and [`fixed-allocation.test.mjs`](../../tests/integration/assembly/fixed-allocation.test.mjs), rerun in the [November 2 baseline](RECOVERY_BASELINE_2026_11_02.md). [Cross-domain creation](TEST_002_CROSS_DOMAIN_CREATION_VERIFICATION.md), [B10](WEB_003_B10_FIXED_STUDENT_VERIFICATION.md) and [B11](WEB_003_B11_SHORTER_PROFILE_VERIFICATION.md) define actual barriers/winner orders. Not exhaustive for all profile/mode combinations. |
| I — Halfway batch failure | [Generic export/import evidence](RECOVERY_GENERIC_EXPORT_2026_11_04.md) includes actual prepublication SIGKILL, competing writers and late whole-unit import rollback. [Manual v3 evidence](../../plans/reports/implementation-261105-2205-manual-draft-transport.md) separately verifies private importer backend loss and unknown-COMMIT receipt reconciliation. These do not implement durable provider executor checkpoint/restart or full unknown-cost reconciliation. Full scenario **NOT EXECUTED**; reviewed planner engineering is now authorized but not implemented. |
| J — Provider replacement | [November 5 comparison](RECOVERY_PROVIDER_REPLACEMENT_2026_11_05.md) verifies direct deterministic and local command-test-double Reading paths through actual canonical DRAFT/publication/exam/released-result journeys, with equal semantic projections and no extra tracked generation calls during student operations. The command-path metadata and sampled coupling/fallback fault controls distinguish real path use. This verifies a bounded Reading fixture subcase, not two vendor adapters, generic G1 interchangeability or full Track A; no model-quality or human-approval claim. |

## Remaining dependencies and next actions

1. Q-08 has a reviewed integrated raw/private-value scan and static-path coverage.
   Extend it when a supported media path, an uncovered profile or a concrete
   exposure is identified; do not repeat unchanged scans as proof of progress.
2. Q-13/media and its Q-14 guards need implementation of the now-authorized
   [reviewed media design](../decisions/RECOVERY_MEDIA_DELIVERY_PROPOSAL_2026_11_02.md).
   The current media 404 is a denial control, not delivery support.
3. Scheduler/executor/reservation portions of A/B/I need implementation within the
   now-authorized reviewed [planner/reservation scope](../decisions/RECOVERY_FACTORY_PLANNER_PROPOSAL_2026_11_02.md).
   Current authority covers that local design, with backups before DB changes,
   while paid provider calls remain excluded. J has the bounded Reading comparison linked above;
   any further adapter evaluation must identify an actual untested accepted
   contract. It is not blocked solely by the planner proposal. The separate
   manual transport is now implemented; its exact real-batch registration and
   activation snapshot remain separately pending.
4. A [current engineering source reproduction](RECOVERY_CURRENT_SOURCE_REPRODUCTION_2026_11_05.md)
   now includes later client/Factory changes, with a frozen private archive and
   fresh isolated verification. It supersedes the earlier portable copy for that
   executed scope; an actual tracked-fixture checker defect was repaired without
   removing files from the index. A clean released ref, hosted CI and full critical-matrix
   acceptance remain distinct. No commit or publication is authorized here.
5. Human-approved lawful stock, qualified content and assistive-technology review,
   and production/load/privacy/identity inputs remain external gates in the
   [local acceptance map](TRACK_B_LOCAL_ACCEPTANCE_2026_10_25.md) and
   [dated recovery plan](../tasks/RECOVERY_PLAN_2026_11_02.md). In particular, the
   rights/source manifest is due November 6 at 18:00 UTC+7; this audit supplies no
   human signatures. All other deadlines retain the plan's conditional scope.

## Reconciliation verification

RECOVERY-021 is a documentation-only reconciliation of the linked executed
records and current test locations. No application/PG/browser tests were rerun.
Actual independent read-only reviewer operation_review_final compared the changed
claims with their source records and verified local targets/whitespace. It found
one P2: the draft incorrectly gated J on planner approval. That dependency is
removed; separately scoped comparative fixtures are a valid next investigation
within approved contracts. Final review reports no material findings. Anchors
and runtime behavior were not independently reverified. Root owns final
`npm run docs:check` and tracked/direct-file whitespace verification; their result
is recorded in the RECOVERY-021 backlog/handoff, not inferred from this review.
