# WEB-002 B7.1 — additive fixed assembly reference

2026-10-24 Asia/Bangkok, base7571a36. Root selection under recorded owner
engineering-choice delegation: AUTHORIZED_IN_SCOPE / IMPLEMENTATION_IN_PROGRESS.
This is an additive technical disposition, not human content/publication approval.
Recommended root Codex Sol6.1/High integration/design, native Luna/XHigh bounded
TypeScript implementation with direct fallback, separate Sol6.1/Medium read-only
review; existing subscriptions only, no paid API.

## Decision, alternatives and impact

Resolve the observed fixed reuse-mode gap with a separate strict internal
`fixed-assembly-manifest/1` parser/reference/replay entry. Preserve accepted
`assembly-manifest/1` and its existing parsers/results/canonical bytes/goldens.
Reuse private mode-neutral candidate validation and deterministic selection helpers
in the existing module; do not copy the algorithm, map fixed to REVIEW_ALLOWED,
change the old reuse enum, or pass fixed inputs through the personal parser.
A read-only explorer actually identified this smallest allowlist and private-helper
boundary; no tests were executed by the scout.

Alternative rejected: edit old manifest enum/history semantics, or disguise a fixed
run as personal review mode. Separate source duplication would risk algorithm drift.
Shared private helper factoring is permitted only with unchanged old external
behavior, fixed original tests and additional literal compatibility pins. No old
manifest/result persistence migration or public consumer migration is needed.

## Exact fixed contract

Strict keys, reusing existing primitive/candidate/blueprint/limits validators:

- schemaVersion: `fixed-assembly-manifest/1`
- algorithmVersion: `assembly/1` (same deterministic selection mechanics)
- formMode: `PUBLISHED_FIXED`; reuseMode: `FIXED_AS_PUBLISHED`
- blueprintVersionId, blueprintHash, blueprint, seed, bankRevision,
  rightsVersions, units, conflicts, limits: same common snapshot meanings and
  bounds as existing assembly/1, including16MiB,10000 raw units,200 members/unit,
  maxNodes0..50000/maxUnits0..2000 and opaque revision preserved verbatim.
- NO historyQuestionIds/historyGroupIds/userId/historyRevision, even empty. No
  other additional keys. Exact common reference/taxonomy/source/duplicate/conflict
  validation and blueprint canonical-hash verification remain mandatory.

Normalize documented common sets/units without changing blueprint/member order.
Compute fixed manifest hash from its own canonical bytes including literal fixed
schema/modes. Distinct types and exports in the trusted internal surface only:
FixedAssemblyManifest, ParsedFixedAssemblyManifest, FixedAssemblyResult,
parseFixedAssemblyManifest, runFixedAssemblyReference, replayFixedAssemblyReference.
Do not export to root/student/released/staff DTOs or alter OpenAPI. No live inputs.

Fixed selection has one baseline search over captured compatible units after
whole-unit blueprint exclusions. No student-specific exclusions/history or unseen
inventory classification. Preserve seeded shuffle, exact exposure ranking, quotas,
source/group/identity/conflict/bundle hard checks, independent final validation,
node accounting and section/seeded-unit/member slot order. Private common helpers
receive explicit optional exclusion context, never a legacy mode alias; old
NEW_ONLY baseline+personal budgets and REVIEW_ALLOWED one-pass behavior stay exact.

Fixed result has the existing reference shape with its fixed manifestHash and
slotsHash; failures only CONSTRAINT_CONFLICT, SEARCH_EXHAUSTED or
INSUFFICIENT_ELIGIBLE_INVENTORY. All failures empty slots. Intrinsic quota
contradiction precedes search; unit/node cap is exhaustion, never a shortage proof.
Exhaustively infeasible eligible constraints may include conflicts/quotas/source
caps, so do not describe it as raw item-count shortage. Replay compares both hashes
without changing stored data. No new contention helper required in this increment.

## Persistence and visible product sequence

This bounded prerequisite adds no DB migration/grants/table writes/HTTP/UI and
claims no fixed delivery/sealing/publication. Existing DB fixed rows already allow
algorithmVersion assembly/1 and FIXED_AS_PUBLISHED; later adapters must explicitly
validate new schema/hash/modes and exclude user/history data. Historical placeholder
fixed rows are not rewritten/rebranded as valid runs. Old personal rows/replays are
untouched. No scoring/timing/reuse changes in student delivery.

Next ready increment is a separately documented narrow fixed-only audited stored
run projection plus an authorized discovery/demo path and staff UI. It must use
genuine solver-generated synthetic fixed fixtures, not personal runs or incomplete
placeholders. Approval/real inventory/current rights and human qualification remain
separate; existing synthetic publication restrictions stay binding.

## Acceptance and ownership

One writer owns packages/contracts/src/assembly-reference.ts and new fixed test/
fixture files; root owns shared records and integration evidence. Original assembly
fixture/test bytes remain unchanged. Reuse tests; no extra backend failure harness.
Required: literal fixed canonical-byte/hash/slot goldens and replay mismatches;
strict foreign-mode/history/extra-key rejection; normalization, bundles/quotas/
source/conflict/exclusion/ranking/order boundaries; infeasible vs exhausted no
partial slots; independent small exhaustive oracle; unchanged old goldens/tests;
emitted JS/internal-only/private import-boundary checks; full contracts/build/type/
drift and existing real-PG assembly/student regressions. Independent review must
check mode isolation and frozen compatibility. Record actual commands/limits; no
load/production/qualified human acceptance inferred.
