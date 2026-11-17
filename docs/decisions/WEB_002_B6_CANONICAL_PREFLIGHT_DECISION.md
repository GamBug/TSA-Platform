# WEB-002 B6.1 — manager canonical dataset preflight

2026-10-24 Asia/Bangkok, base3251362. Root selected AUTHORIZED_IN_SCOPE under
[owner engineering-choice delegation](OPEN_DECISIONS.md#track-b-engineering-choice-delegation--2026-10-24).
Recommended root Codex Sol6.1/High integration/security, existing native Luna/XHigh
bounded contracts/UI with direct fallback, separate Sol6.1/Medium read-only review;
existing subscriptions only, no paid model APIs.

## Gap and chosen increment

The existing internal dataset preflight validates canonical graphs and reports
starter12/6/12 target shortfalls, but the website cannot use it. Add a current
BANK_MANAGER-only read-only diagnostic POST and explicit selection/report UI over
that existing service. This is canonical validation, NOT assembly feasibility,
eligible/accepted inventory, current rights or human review. Required blockers
remain even when counts meet targets. No automatic publication/generation/fallback.

Read-only discovery by actual native Luna/XHigh worker found that fixed diagnostics
need a separate contract reconciliation: assembly_runs PUBLISHED_FIXED requires
FIXED_AS_PUBLISHED, but frozen AssemblyManifestSchema accepts NEW_ONLY/REVIEW_ALLOWED;
current capture is NEW_ONLY and fixed fixtures are incomplete placeholders. Source:
packages/contracts/src/assembly-reference.ts, db/migrations/002_exam_integrity.sql,
src/modules/assembly/candidate-stock.mjs, tests/integration/database/foundation/
exam-fixtures.mjs. No genuine fixed solver-run fixture found. The broader staff
API diagnostics table is proposed, not approved wholesale. Do not expose personal
manifests/history, map modes silently, or call this dataset report fixed-run
assembly diagnostics. Preserve those contracts; prepare separate impact/migration/
replay semantics before that future work.

## Additive private contract

`StaffDatasetPreflightRequestSchema`/type and `StaffDatasetPreflightSchema`/type;
`staffDatasetPreflight`, POST `/api/v1/datasets/preflight`, no path/query,
existing required CSRF header, NO idempotency header required (pure read; repeated
explicit runs are allowed). Handler opt-in `enableDatasetPreflight=false` by
default; local synthetic app/fixture enables it. Authenticated current BANK_MANAGER
with existing bank.diagnostics.read; non-manager403 before body/object reads.
Foreign Origin403, unauth401, CSRF403, wrong method404, query/body/schema/missing
pin graph422, hash conflict409, oversized transport413, unexpected/corrupt503;
existing safe error union/empty details/request IDs/no-store/nosniff/Vary.

Strict request `{versions:Array<{versionId:UUID,contentHash:Hash}>}`1..100, unique
version IDs. Existing preflight rejects multiple versions of the same question
identity and conflicting graph definitions with safe422, not a partial report.

Strict response:

```typescript
{
  schemaVersion: "staff-dataset-preflight/1";
  environment: "LOCAL_SYNTHETIC_ONLY";
  accessBasis: "BANK_MANAGER";
  scope: "CANONICAL_GRAPH_ONLY_NOT_PUBLICATION_AUTHORIZATION";
  generatedAt: UTCInstant; // server report creation time, not an exam deadline
  qualification: "NOT_ATTESTED_BY_PLATFORM";
  publicationEligibility: "NOT_EVALUATED";
  publishing: false;
  eligibilityRevision: string; // nonnegative decimal, no JS bigint coercion
  targets: { MATH: 12; READING: 6; SCIENCE: 12 };
  counts: { total: number; bySection: {MATH:number;READING:number;SCIENCE:number};
    byInteractionType: {SINGLE_CHOICE:number;MULTIPLE_CHOICE:number;TRUE_FALSE_GROUP:number} };
  shortfalls: {MATH:number;READING:number;SCIENCE:number};
  duplicateFingerprintGroupCount: number;
  blockerCodes: string[]; // exact existing preflight literals below
  versions: Array<{ versionId:UUID;contentHash:Hash;workflowRevision:PositiveSafeInteger;state:WorkflowState }>;
}
```

Counts0..100, total1..100 equals versions length and each dimension sum; shortfalls
max(0,target-count), targets fixed above. Versions unique/sorted UUID ascending,
exact request pins; no extra structured question/key/explanation/source/actor/
manifest/review-packet/reference/fingerprint/history fields. Diagnostic aggregate
is not current eligibility proof. `generatedAt` is server creation time after the
existing read-only snapshot completes, explicitly not snapshot/start/expiry time.

Blockers are sorted unique from existing helper: CURRENT_RIGHTS_UNVERIFIED,
HUMAN_EQUIVALENCE_REVIEW_REQUIRED, LAWFUL_INVENTORY_UNVERIFIED,
NAMED_HUMAN_AUTHOR_REQUIRED, NAMED_INDEPENDENT_REVIEWER_REQUIRED, plus
STARTER_TARGET_SHORTFALL when any shortfall, DUPLICATE_FINGERPRINTS_REQUIRE_REVIEW
when duplicateFingerprintGroupCount>0. First five always required. All outputs
<=1MiB; schema/known integrity exceptions safe errors, no raw message/SQL/IDs in
error details. Unexpected internal failures503. Existing canonical computation and
READ ONLY REPEATABLE READ service unchanged; no new grants/migrations/audit writes.
No B1–B5/root/student/released/public schema change.

## UI and verification

Manager-only labeled metadata checkboxes, initially none, at most100 explicit
version/hash selections. Selections clear on metadata filter/refresh/page change,
logout/return/identity; no silent selection of unseen pages. Show count, clear
selection, and explicit **Kiểm tra tập phiên bản**. Capture pins before POST;
disable duplicate activation while pending. Clear old private view/report first.
Changing selection/target/navigation/identity fences pending report. No automatic
POST/retry or inferred publication. Actual report scope, selected hashes/revisions,
canonical counts/target shortfalls, duplicate-group count and all human/rights
blockers readable desktop/mobile/keyboard. Errors truthful, never stale PASS;
reload requires a new explicit check. No report/private selection storage/logging.

Required actual tests: strict schemas/artifact/built/export/import boundary;
HTTP/PG roles/CSRF/Origin/opt-in/schema/hash/multiple-version/errors, exact agreement
with existing service projection and zero writes across all application tables;
actual browser selection0/1/multiple, counts/shortfalls/blockers, no automatic
checks, changes clear/fence delayed report, lost response/error recovery, identity
privacy and direct candidate/reviewer denial; Firefox/desktop375/mobile checks
where supported. Reuse existing harnesses. Record independent versus automated
versus MANUAL_CHECK_PENDING/human approval separately. No production/accepted
stock/official exam/qualified review or formal accessibility claim.
