# WEB-002 B9.1 — fixed-form sealing and staff metadata proposal

Current update2026-10-26: the owner's immediate “next.” response to the explicit
whole-B9 local-implementation question is recorded as
[scoped go-ahead](OPEN_DECISIONS.md#web-002-b91--scoped-owner-go-ahead2026-10-26).
The proposal at752516f was implemented without student fixed delivery; actual
[verification/review](../reviews/WEB_002_B9_FIXED_SEALING_VERIFICATION.md) is separate.
The original reviewed proposal/status below is preserved as historical scope,
not a current missing-authorization claim or human-content acceptance.

2026-10-26, source basecb09027. PROPOSED / HUMAN_APPROVAL_REQUIRED for the new
privileged contract; NOT_IMPLEMENTED / NOT_EXECUTED. Root authored this concrete
next-scope proposal under the standing engineering mission. The mission explicitly
requires a decision proposal for new privileged operations; B8 grants rehearsal
only and the broad API table is still proposed. Owner engineering-choice delegation
is not recorded as approval of this new sealing/metadata contract. No routine
confirmation question or human content attestation is requested by this document.

Recommended implementer: Codex Sol6.1/High or the available current Codex root for
cross-module SQL/identity/immutable-snapshot integration; native Luna/XHigh for a
bounded private DTO or staff UI after disjoint ownership. Separate available Codex
Sol/Medium read-only review is required before acceptance of this security-sensitive
increment. These are recommendations, not executed delegation or model availability.
Independent Sol6.1/Medium source review actually executed2026-10-26; see the
[design review record](../reviews/WEB_002_B9_DESIGN_REVIEW.md). Existing subscriptions only.

## Product outcome and scope

EXAM_MANAGER can deliberately seal one new common fixed form from CURRENT eligible
synthetic Bank stock, then discover and inspect its safe metadata after reload.
This is a real immutable form, unlike B8's historical rehearsal. It creates zero
student attempts, histories, scores or releases. Candidate fixed selection/delivery
remains unsupported and needs a separately scoped follow-up; do not offer a form
through the student catalog merely because it was sealed.

No rights edit, human APPROVE, question publication, provider call, offering editor,
withdrawal/undo control or real-content acceptance. B1–B8 and personal NEW_ONLY /
REVIEW_ALLOWED remain unchanged. Never convert a B8 receipt, B7 reference run or
old placeholder into a sealed form; recapture current stock and create a new run.

## Proposed private API

Add strict schemas only under @tsa/contracts/staff and its separate route artifact.
Do not change root/student/released exports, frozen personal DTOs or golden vectors.
Local synthetic runtime opt-in defaultsfalse; only the disposable staff demo enables
it explicitly. Roles are current/enabled EXAM_MANAGER plus existing exam.assembly.write
for both command and metadata reads; other single-role
AUTHOR/REVIEWER/BANK_MANAGER/student callers receive403. Mixed roles gain only their
explicit supported operations. This new access requires approval of this proposal.

| Operation | Exact proposed behavior |
|---|---|
| POST /api/v1/assemblies | Session, same-origin Origin, CSRF, idempotency key and JSON<=1MiB; strict body below;201 immutable historical sealed receipt only on committed success. |
| GET /api/v1/fixed-forms | Explicit bodyless/queryless read; latest20 supported B9 seals ordered sealedAt descending then formId descending, limit20 and truncated flag. No auto-fetch by hover. |
| GET /api/v1/fixed-forms/{formId} | Explicit bodyless/queryless exact-ID safe metadata; unknown, personal, B7-only, B8-only and unsupported legacy placeholders404. No keys, slots, candidate/source IDs, raw manifest or private reviewer material. |

Command body:
`{mode:"PUBLISHED_FIXED",blueprintVersionId:UUID,blueprintHash:Hash,windowMinutes:integer1..1440,seed?:uint32}`.
Seed omission uses42, consistently with B8. Pin the exact supported one-domain
MVP blueprint (MATH4/READING2/SCIENCE4); no shorter/multi-domain substitution.
No arbitrary client timestamps: like B8, database capturedAt sets availableFrom,
availableUntil=capturedAt+windowMinutes and
requiredThrough=availableUntil+600seconds+domainDuration. This deliberately narrows
the unapproved API table's arbitrary availableFrom/availableUntil sketch. A future
scheduled-admission editor is excluded. Never adjust existing admission/TTL rules.

Success receipt fields only:
`{schemaVersion:"staff-fixed-seal-receipt/1",assemblyRunId,formId,blueprintVersionId,blueprintHash,mode:"PUBLISHED_FIXED",reuseMode:"FIXED_AS_PUBLISHED",seed,manifestHash,formHash,state:"SEALED",capturedAt,sealedAt,availableFrom,availableUntil,requiredThrough,currentEligibility:"NOT_REVALIDATED",studentDeliverySupported:false}`.
Times are canonical server instants; require exact window/horizon equations and
capturedAt<=sealedAt<availableUntil. SEALED is historical, not current delivery or
publication eligibility. No synthetic account is labelled a qualified reviewer.

List/detail metadata use their own strict versioned envelopes with
`environment:"LOCAL_SYNTHETIC_ONLY",accessBasis:"EXAM_MANAGER",observedAt`.
Each item contains receipt pins/times and domain/count/duration from the immutable
blueprint; detail additionally reports the freshly observed stored availability
revision/withdrawnAt, separately from historical receipt. Never claim current
rights or student delivery from this metadata. No raw actor ID is returned.
Do not expose generic /forms or change B7/B8 list/detail responses in this scope.

Use existing no-store/nosniff/Vary:Origin headers and a fresh X-Request-Id on every
HTTP response. Matching body/header request IDs apply to error envelopes only.
Strict success receipts contain no requestId; same-key success replay preserves the
exact historical receipt body while its HTTP header identifies the current request.
Command auth/Origin/CSRF precede JSON parsing. Recheck current role before successful
idempotent replay; same actor/route/key/body replays the exact historical receipt,
changed body409, actors isolated. Errors reuse existing strict private envelopes
and empty details:401 unauthenticated,403 CSRF/role,404 unknown blueprint,
409 pin/idempotency/concurrent modification,422 validation or solver
INSUFFICIENT_ELIGIBLE_INVENTORY/CONSTRAINT_CONFLICT/SEARCH_EXHAUSTED,
503 TEMPORARILY_UNAVAILABLE. SEARCH_EXHAUSTED means unknown feasibility; never
translate it into a proven shortage. Wall-time/size/transport failure is503, not a
new solver failure code. No raw pool counts in these command/read projections.

## Persistence, privilege and compatibility impact

New forward-only migration after022; never edit applied migrations. Reuse the
existing fixed-assembly-manifest/1 parser/reference unchanged, no personal-mode
alias. Use a separate canonical fixed-sealed-form/1 hash recipe (ownerUserId:null,
fixed mode, immutable blueprint/policies/ordered slots/public and private hashes),
leaving personal sealed-form/1 bytes and hash meaning unchanged.

Add immutable private fixed_form_seals sidecar linking new form/run/actor and capture
pins/horizon; no raw application table grant. New narrow SECURITY DEFINER functions
owned by the migration owner, qualified relations, pinned pg_catalog/tsa/tsa_private
search_path, PUBLIC revoked, EXECUTE only for the established restricted Bank pool
role. Every entry checks the current enabled EXAM_MANAGER. Trusted service may
receive private sealing inputs, but no command/read response may serialize them.
No candidate impersonation or tsa.local_user_id identity substitution.

Capture current complete bundles, sources/rights decisions, version pointers,
canonical groups/conflicts, quotas and bank revision under the existing publication
guard/bank-state lock order. Rights must cover the conservative whole horizon.
Use an additive actor-scoped snapshot path; assembly_snapshot_inputs is candidate-
scoped and must not be loosened for staff. Final SQL independently validates
selection, current eligibility/pins, complete bundles, snapshots/canonical hashes,
policy versions and exact form projection before all writes. Recheck database time
after lock waits. Bound solver work with existing50000nodes/2000units; bounded stale
replan or409, no automatic alternate profile/reuse. Preserve the existing treatment
of lifetime analytics advances without ignoring security-sensitive pin changes.

One transaction commits SUCCESS assembly_runs (user/history revision null, fixed
mode), forms (owner null), form_sections, form_slots, private form_slot_secrets,
form_availability, sidecar, receipt and minimal actor/action/resource audit.
Existing integrity/immutable/creation-transaction triggers must all pass. Persist
no attempts, allocation state/history, jobs/scores/releases or eligible pointers.
A rejected/failed command writes none of these objects or successful receipts.
Existing personal rollback, rights fanout and sealed immutability remain mandatory.

Important observed compatibility gap:020 bank_fixed_reference_snapshot selects all
matching fixed manifests without excluding runs attached to forms. New B9 runs
would otherwise enter the B7 reference-only UI with its no-form wording. The new
migration must preserve that reference boundary explicitly: both existing B7 list
and exact-detail queries exclude any run referenced by tsa.forms. Preserve function
signature/owner/ACL/search_path and all original standalone B7 rows/outputs; B9
creates its own metadata read path. Do not merely relabel a real seal as reference
or widen the frozen B7 response. Populated upgrade evidence must verify this.
B8 private rehearsals remain separate and immutable; their APIs remain untouched.

Rollback: disable new seal command/advertising; retain compatible stored-receipt and
metadata readers. Never drop/rewrite sealed rows, keys/history or canonical hashes.
No production migration/deployment authorization is supplied by this proposal.

## Staff experience

Separate **Seal a fixed form** from **Rehearse stock**. Reuse authorized blueprint
metadata, but pin a fresh explicit selection/window/seed. Native confirmation shows
exact pins, independent domain/count/duration, database-window rule, real-form
creation and no student delivery/human publication approval. Cancel/Escape0POST;
confirm once under a new immutable intent/key. Bind intent to the original session
nonce as in WEB-003. Lost acknowledgement stays uncertain; explicit retry uses the
same body/key. After acknowledgement, list/detail failure offers GET-only recovery.
Reload/navigation/logout never posts. List/detail have clear empty/latest20/loading/
error states; labels distinguish historical seal from freshly observed metadata.
Keyboard/focus restoration/mobile wrapping and identity response fencing apply.

## Required acceptance before implementation can be accepted

1. Independent contract/privilege review and durable applicable owner disposition.
   Additive DTO negatives, initial success/replayed success/error request-ID framing
   (fresh headers, unchanged replay body, matching error body/header) and unchanged old
   artifacts/vectors; no implementation against an assumed grant.
2. Real PG success for standalone and complete shared bundles; exact canonical
   form/run/private hashes and triggered integrity. Failed/short stock creates no
   partial graph. No history or attempt is allocated by sealing.
3. Actual Origin/CSRF/role/BOLA/personal-ID/disabled-user cases, raw-table denial,
   actor-isolated replay/collision, current-role replay checks and privacy scans.
4. Two-connection rights/quarantine/version/pool races, exact snapshot freshness,
   immutable originals and rights fanout; no mutation of old personal/review forms.
5. Populated022 upgrade preserves old rows/grants/function ACLs and B7/B8 output.
   New sealed runs404 through B7 list/detail, visible only in new authorized view.
6. Chromium/Firefox actual seal/uncertain same-key retry/reload discovery/GET-only
   recovery, cancellation/keyboard/focus/desktop/narrow/privacy/no external request.
   Default three-domain and explicit review journeys still pass.
7. Disposable synthetic launcher provisions fixtures automatically; no manual SQL/API
   setup. Clean no-hardlink reproduction and guide/records/checkpoint required.

Only source inspection/documentation was executed for this proposal. All B9 runtime,
contracts, migration and browser checks remain NOT_EXECUTED. Independent source
review executed in the linked record; it is not implementation or owner approval.
Qualified human accessibility, real lawful12/6/12 review/publication and production
acceptance remain independent external requirements.
