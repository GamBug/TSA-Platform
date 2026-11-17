# WEB-002 B8.1 — eligible Bank stock rehearsal

2026-10-25, base70cdd6c. AUTHORIZED_IN_SCOPE / root-selected under recorded owner
engineering-choice delegation. Technical diagnostic scope, not rights/human review,
publication, form sealing or fixed delivery authorization. Recommended root Codex
Sol6.1/High SQL/security/integration; native Luna/XHigh private DTO/UI writers with
direct fallback; separate Sol6.1/Medium read-only review. Existing subscriptions only.

## Decision and compatibility

Add a real eligible-Bank rehearsal before sealing. Current synthetic reference
problems demonstrate the solver but do not capture Bank eligibility. Preserve that
B7 dataset/API and frozen personal manifests/functions. A separate immutable private
rehearsal table stores actual captured fixed manifests/results/window metadata;
no assembly_runs/forms/attempts/history/eligible pointer/exposure writes. Existing
B7 reference discovery never sees these separate records, avoiding false provenance.

EXAM_MANAGER initiates the check under existing exam.assembly.write; BANK_MANAGER
reads richer diagnostics under bank.diagnostics.read. Neither role gains the other's
operation. EXAM receipts contain no direct eligible pool count fields or candidate
IDs, including mixed-role callers. Numeric sectionDeficits are an explicitly
authorized bounded disclosure: with a known target they can permit inference of
small eligible capacity counts. No statistical inference-resistance is promised. New EXAM actor is explicitly synthetic in UI, never a qualified reviewer.
No candidate impersonation or tsa.local_user_id. No offering/admission/history
filtering in fixed stock capture; one immutable independent-practice MVP blueprint
(MATH4/READING2/SCIENCE4, one domain) is explicit. Unknown pins404, hash conflict409,
unsupported profile/dimension422; never silently substitute another blueprint.

The request selects blueprintVersionId, blueprintHash, windowMinutes1..1440 and
optional uint32 seed (server default42). No client timestamp governs eligibility.
SQL captures server clock once; availableUntil=capturedAt+windowMinutes;
requiredThrough=availableUntil+600-second Start TTL+domain duration. This conservative
rehearsal horizon includes the existing start delay; it changes no personal timing
or existing offering rules and is not a sealing/admission promise. Current display
rights must cover the entire proposed interval; NULL valid_to is unbounded.

## Additive migration021 and trusted data path

Private immutable table tsa_private.fixed_stock_rehearsals: UUID id, actor_id FK,
blueprint_version_id FK, captured_at/available_until/required_through finite times,
window_minutes, canonical fixed manifest JSONB/hash, exact fixed result JSONB. Byte/
size/interval constraints; reject UPDATE/DELETE via existing immutable-row trigger.
No application raw SELECT/INSERT/UPDATE/DELETE grant. Only narrow definer functions
EXECUTE tsa_bank, PUBLIC revoked, pinned search_path/qualified relations:

1. Blueprint summary reader, current enabled EXAM_MANAGER, latest20 supported
   immutable independent MVP blueprint versions, no offering or candidate data.
2. Stock reader, current enabled EXAM_MANAGER; shared advisory(1414742321,1), then
   bank_state FOR SHARE. Adapt018's complete bundle/rights/conflict/group/taxonomy/
   renderer/current eligible pointer checks into a new owner-only private helper.
   Do not alter the frozen personal stock function. Omit every history field.
   Rights valid_from<=capturedAt and valid_to>=requiredThrough; current selection
   eligibility is also required. Capture complete ordered bundles, source/rights
   pins/exposure analytics/bank revision. Raw10001 sentinel/byte overflow produces
   safe503 without a partial report/shortage claim.
3. Store function validates enabled EXAM_MANAGER, exact fixed schema/modes, blueprint
   pin/window equations/time inside current transaction, canonical bytes/hash and
   current pool units/conflicts/rights source+decision pins/revision against the
   same private helper. Stored capture contains no raw rights evidence or question
   keys/explanations. SQL result is bounded; trusted service computes fixed reference
   result, and read service independently replays exact stored inputs/result.
4. BANK_MANAGER list/detail reader, enabled/current SQL role check; latest20 metadata
   or exact record (unknown404), one success audit per read in same transaction.
   Audit contains actor/action/record reference, never raw payload. Parse/replay/
   projection failure rolls back success audit. No source/candidate/history IDs in
   browser DTO, no private report to EXAM alone.

Use existing withIdempotency for the command: current role validation before replay,
actor/route/key body binding, existing key lock→exclusive Bank guard→bank_state order.
The guard is intentionally stronger than the read helper's shared lock; it keeps
capture/store consistent during bounded solver execution. No eligibility revision
advance. One private record+capture audit+idempotency receipt on first commit;
same-body/key returns historical receipt, changed-body409, other actors isolated.
Add one actor-bound tsa_bank idempotency RLS policy for exactly
POST /api/v1/fixed-rehearsals, related_attempt_id IS NULL, current enabled
EXAM_MANAGER, actor_id matching tsa.bank_actor_id. Preserve existing policies and
grants; foreign actor/student route access remains denied. No old SQL/migration
edits. Narrow020/API stays unchanged. Historical migration
rehearsals remain bounded; latest-upgrade lists explicitly include021. New020→021
upgrade proves old rows/grants/history preserved, only documented objects added.

## Exact additive private operations/DTOs

Default-off enableFixedStockRehearsal; local synthetic app/demo enables it. Existing
Origin/session/CSRF/idempotency/1MiB body/safe error envelope/requestId/no-store/
nosniff/Vary. Private staff artifact only; root/student/released unchanged.

- GET `/api/v1/fixed-rehearsal-blueprints`, EXAM_MANAGER only: strict
  StaffFixedRehearsalBlueprintListSchema {schemaVersion:"staff-fixed-rehearsal-blueprints/1",
  environment:"LOCAL_SYNTHETIC_ONLY",accessBasis:"EXAM_MANAGER",observedAt:UTC6,
  limit:20,truncated:boolean,items:max20[{blueprintVersionId:UUID,contentHash:Hash,
  name:nonblank<=4096,section:MATH|READING|SCIENCE,questionCount:4|2|4 matching domain,
  durationSeconds:1..21600}]}. Unique IDs, list order from SQL by created_at/id;
  times/order keys need not cross this summary projection.
- POST `/api/v1/fixed-rehearsals`, EXAM_MANAGER+CSRF+idempotency headers: strict
  StaffFixedRehearsalRequestSchema {blueprintVersionId:UUID,blueprintHash:Hash,
  windowMinutes:integer1..1440,seed?:uint32}. Response201
  StaffFixedRehearsalReceiptSchema {rehearsalId:UUID,blueprintVersionId:UUID,
  blueprintHash:Hash,windowMinutes:1..1440,capturedAt:UTC6,availableUntil:UTC6,
  requiredThrough:UTC6,outcome:SUCCESS|FAILURE,failureCode:null|fixed3,
  sectionDeficits:max1[{section,missingCount:1..4}],createsForm:false,
  currentEligibility:"NOT_REVALIDATED"}. SUCCESS=>null/empty deficits; FAILURE=>fixed
  nonnull code; deficits only for provable cardinality under INSUFFICIENT_ELIGIBLE_
  INVENTORY, else empty. No direct pool counts/candidate IDs or seed/manifest/result
  hashes; blueprintHash and bounded deficits above are explicit exceptions. No raw
  error data or manifest.
  Missing cardinality deficit does not turn a quota/conflict failure into raw shortage.
- GET `/api/v1/fixed-rehearsals`, BANK_MANAGER: strict StaffFixedRehearsalListSchema
  {schemaVersion:"staff-fixed-rehearsals/1",environment:LOCAL_SYNTHETIC_ONLY,
  accessBasis:BANK_MANAGER,observedAt:UTC6,limit:20,truncated:boolean,
  items:max20[{rehearsalId:UUID,blueprintVersionId:UUID,outcome,capturedAt:UTC6,
  windowMinutes:1..1440}]}. Unique, newest timestamp/id first, truncated=>20.
- GET `/api/v1/fixed-rehearsals/{rehearsalId}`, BANK_MANAGER: strict
  StaffFixedRehearsalDiagnosticSchema {schemaVersion:"staff-fixed-rehearsal-diagnostic/1",
  environment:LOCAL_SYNTHETIC_ONLY,accessBasis:BANK_MANAGER,observedAt:UTC6,
  captureOrigin:"BANK_ELIGIBLE_AT_CAPTURE",currentEligibility:"NOT_REVALIDATED",
  qualification:"NOT_ATTESTED_BY_PLATFORM",publicationEligibility:"NOT_EVALUATED",
  rehearsal:receipt above,replayVerified:true,createsForm:false,
  capturedUnitCount:0..10000,capturedCandidateCount:0..2000000,selectedCount:0..4,
  visitedNodes:0..50000,nodeLimit:0..50000,unitLimit:0..2000,
  section:{section,requiredCount:domain4/2/4,selectedCount:0..required}}.
  Selected sums/outcome/failure consistent, visits<=limit, no extra private fields.

All response caps1MiB, strict UTC6/hash/UUID/count/key checks. Success audit only
means server read succeeded, not client acknowledged or current eligibility. Errors
400 malformedJSON;401 unauth;403 role/CSRF;404 unknown;409 pin/idempotency/concurrent
conflict;413 transport;422 invalid/unsupported;503 unexpected/uncertain. Existing
Bank aliases retained. Lists are GET bodyless/no-query/no prefetch; wrong method404.

## Visible workflow and verification

EXAM_MANAGER-only explicit blueprint-load/form, no draft/private question access.
Choose exact blueprint and window minutes, native confirmation identifies pins and
no-form disclosure. Capture one immutable body/key; lost/503 response explicit same
intent retry, no automatic resubmission. Acknowledged receipt is historical, never
fresh eligibility. Target/role/logout/return/reload fences; reload never POSTs.
BANK_MANAGER-only explicit history/detail, source clearly eligible-at-capture and
NOT_REVALIDATED now. No raw candidates or human/rights acceptance. Empty/truncated/
loading/errors/retry/focus/keyboard/mobile. Existing B1–B7 views/roles remain valid.

Fixture default remains unchanged for old tests. Optional eligible-stock fixture
seeds4 real Bank questions through existing synthetic-only publication capability,
explicitly not qualified human review; default staff launcher enables that option.
Browser can seed at the late B8 phase without disrupting earlier acceptance cases.
Demonstrate actual SUCCESS, then quarantine one question and new check FAILURE while
old report stays historical. No manual SQL/API calls in owner presentation.

Required: exact DTO/artifact/built/import; PG full eligibility/bundles/rights horizon/
role/disabled/personal noninterference/idempotency/audit-only allowlist/immutability/
replay/stale/current flags/upgrade; actual Chromium+Firefox EXAM→BANK workflow,
validation0POST/lost receipt same-key retry/current role isolation/reload/privacy/
keyboard/mobile. Reuse harnesses, independent read-only review and clean reproduction.
No sealing/current acceptance/load/production claim; explicit sealing design follows.
