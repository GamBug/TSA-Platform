# WEB-002 B7.2 — audited fixed reference diagnostics and staff UI

2026-10-25 Asia/Bangkok, base7ba60a5. AUTHORIZED_IN_SCOPE / root-selected under
recorded owner engineering-choice delegation. Additive design/privilege disposition,
not content/rights/human publication approval. Root Sol6.1/High recommendation for
integration/security; native Luna/XHigh bounded private contracts/UI with direct
fallback; separate Sol6.1/Medium read-only review. Existing subscriptions only.

## Product increment and limits

Managers explicitly browse captured fixed reference runs and inspect replay-verified
aggregate diagnostics. Add an automatically seeded disposable synthetic reference
problem with SUCCESS, proven-infeasible and SEARCH_EXHAUSTED outcomes. These are
real stored solver runs, NOT sealed forms, Bank eligibility capture, student fixed
exam delivery or publication. Synthetic candidate IDs need not refer to published
Bank questions; they never enter forms/history or browser DTOs. No fake solver
result, qualified reviewer or rights claim. Retained mode truthfully shows empty
until supported runs exist. Existing placeholder rows are not rewritten/rebranded.

## Narrow additive DB boundary — migration020

One `tsa.bank_fixed_reference_snapshot(actor_id uuid,run_id uuid)` SECURITY DEFINER
function, owner migration role, search_path pg_catalog,tsa, PUBLIC revoked, EXECUTE
only tsa_bank. No assembly_runs table SELECT grant. Require actual enabled user
and current BANK_MANAGER role in SQL as well as HTTP/service identity checks.

Filter every list/detail query to user_id IS NULL, history_revision IS NULL,
form_mode=PUBLISHED_FIXED, reuse_mode=FIXED_AS_PUBLISHED, algorithm_version=assembly/1,
manifest schema fixed-assembly-manifest/1 and matching literal form/reuse modes,
with no historyQuestionIds/historyGroupIds/userId/historyRevision top-level keys.
Null run ID lists latest21, returning20 metadata plus truthful truncation, ordered
created_at DESC,id DESC; exact run ID reads only that supported row. Unknown/
personal/legacy placeholder IDs return null, indistinguishable404. Wrong SQL actor
raises42501; service failure is safe503 if authorization changed after HTTP check.

Internal detail snapshot contains only stored replay inputs/metadata, never question
keys/explanations or other tables' content. It may contain candidate/source IDs in
fixed manifest, restricted to trusted Bank service; no raw manifest crosses HTTP.
One immutable audit event per successful list/detail, actor exact current principal,
action BANK_FIXED_REFERENCE_LIST_READ/BANK_FIXED_REFERENCE_READ, entity_type
assembly_run_list/assembly_run, entity_id fixed-reference/id text. No request body/
manifest/report/private data in reason or logs. Service uses REPEATABLE READ write
transaction for this audit; parsing/replay/projection failure rolls back audit.
Unknown/unauthorized/failed reads append no success audit. Existing rows immutable.
No new role, table or general discovery of personal runs. Migration adds only this
function/EXECUTE grant; historical migrations unchanged. Upgrade tests pin019→020
and preserve application rows/security except the explicit new function privilege.
Earlier pinned historical rehearsals must stay bounded to their own versions.

## Opt-in private HTTP/DTOs

`enableFixedDiagnostics=false` by default; local synthetic app/demo enables it.
Current BANK_MANAGER plus existing bank.diagnostics.read only. Existing trusted
Origin/session/read framing, no query/body/headers. Role before object; safe fixed
401/403/404/422/503 envelopes/details{}/requestId/no-store/nosniff/Vary. Wrong method404.

- GET `/api/v1/assembly-runs`: `StaffFixedAssemblyRunListSchema`, operation
  `staffFixedAssemblyRuns`, strict schemaVersion staff-fixed-assembly-runs/1,
  environment LOCAL_SYNTHETIC_ONLY, accessBasis BANK_MANAGER, observedAt UTC6,
  scope CAPTURED_FIXED_REFERENCE_RUNS_ONLY, limit20, truncated boolean, runs max20
  `{assemblyRunId:UUID,blueprintVersionId:UUID,outcome:SUCCESS|FAILURE,createdAt:UTC6}`,
  unique IDs, newest timestamp/id first; truncated implies20.
- GET `/api/v1/assembly-runs/{assemblyRunId}/diagnostics`:
  `StaffFixedAssemblyDiagnosticSchema`, operation `staffFixedAssemblyDiagnostic`.
  Strict schemaVersion staff-fixed-assembly-diagnostic/1, environment/basis/time
  above, scope CAPTURED_FIXED_REFERENCE_RUN_ONLY, run same exact metadata,
  algorithmVersion assembly/1, replayVerified true, createsForm false,
  qualification NOT_ATTESTED_BY_PLATFORM, publicationEligibility NOT_EVALUATED,
  outcome SUCCESS|FAILURE, failureCode null or one of CONSTRAINT_CONFLICT /
  INSUFFICIENT_ELIGIBLE_INVENTORY / SEARCH_EXHAUSTED, visitedNodes0..50000,
  nodeLimit0..50000, capturedUnitCount0..10000, unitLimit0..2000,
  capturedCandidateCount0..2000000, selectedCount0..200,
  sections max3 unique `{section:MATH|READING|SCIENCE,requiredCount:1..200,
  selectedCount:0..200}` aggregated by domain in fixed enum order. At least1 section;
  required total<=200, selected total=selectedCount; success selects exactly all
  required with null failureCode; failure selects0 with nonnull failureCode.
  visitedNodes<=nodeLimit; run.outcome matches outcome. No shortfall field: zero
  selections after SEARCH_EXHAUSTED do not prove shortage. Response max1MiB.

Service parses strict fixed manifest, requires stored row mode/seed/blueprint ID/
bank revision/algorithm/limits/canonical manifestHash match, replays reference and
compares stored diagnostics `{schemaVersion:"fixed-reference-result/1",result}`
exactly including slots/hash/node counts/outcome. Corrupt/noncanonical/mismatched
records safe503, no auto repair, no stale/fabricated result. Only aggregates above
cross HTTP; no seed, raw hashes, candidate/exclusion/opaque section/skill/source/
rights/actor/history identifiers. Supported stored manifests are already canonical.
Existing B1–B7.1/root/student/released/public contracts remain stable.

## UI/demo and acceptance

Manager-only explicit **Kết quả lắp đề cố định** opens bounded metadata list in shared
private host, no prefetch. Explicit exact-row detail GET, exact run identity/server
observation, captured-count/limits/results and no-sealed-form/qualification/rights/
current eligibility warning. SEARCH_EXHAUSTED says feasibility unknown, never raw
shortage; proven infeasible says captured constraints have no solution, not current
stock or item-count shortage. Empty/truncated/loading/error/retry/back states.
Close/Escape/target/metadata/return/logout/new identity clears and fences private
responses; focus restoration remains logical. No POST/publication/fixed creation
UI, no local/private persistent storage or analytics. Inert text only.

Disposable launcher seeds valid canonical fixed manifests and actual reference
results automatically through trusted owned fixture SQL. No manual API/DB action
for presentation, no forms/attempts/score/history writes or eligible pointers.
SQL setup is test-only and distinctly labelled; no claimed production allocation.
Required strict DTO/artifact/built/boundary tests; actual restricted-PG actor/grants/
fixed vs personal/placeholder/unknown exclusion, audit-only successful deltas,
rollback/corruption/error/header/framing, ordering/truncation/upgrade, deterministic
fixture replay; actual Chromium/Firefox desktop/mobile/keyboard/empty/list/three
outcomes/cleanup/held-response identities and direct candidate/reviewer denial;
relevant old assembly/student/Bank regressions. Reuse harnesses, independent read-only
review and clean reproduction. Qualified AT/content/rights/production remain separate.
