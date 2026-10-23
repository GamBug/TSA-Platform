# WEB-002 B3.1 — explicit author draft handoff to the review queue

2026-10-24. **PROPOSED / HUMAN_APPROVAL_REQUIRED**; approval identity/date: none.
B1/B2 private reads and the existing-route queue shortcut are implemented. This
proposal adds no runtime code or authority. It is the next bounded privileged
frontend operation, not a review decision or publication screen.

Accountable designer: Codex root. Recommended Codex Sol6.1/High for mutation/
idempotency integration; available Luna/XHigh for bounded UI with Sol fallback;
separate Sol6.1/Medium independent read-only review. Existing subscriptions only.

## Problem and choice

Authors can create a draft and inspect it; reviewers can browse queued metadata
and inspect independent IN_REVIEW versions. The UI cannot currently hand a draft
to that queue. Recommend one explicit author handoff action over the existing
Bank command; alternatives are to retain read-only staff inspection or separately
design a broader review/rights/publication batch. Approval of B3.1 as a whole
would authorize only the exact bounded operation/UI/contract additions below.

## Existing server behavior retained

`POST /api/v1/question-versions/{versionId}/submit-review` already exists in
`src/http/bank.mjs` / `src/modules/bank/publication.mjs`. This proposal introduces
no new route, grant, role, migration, assignment, ownership policy or service.
Current trusted AUTHOR and target.created_by equal to authenticated userId are
required by that command; missing version404, foreign creator403. No BANK_MANAGER
or REVIEWER-only override. The existing API may process imported creator identities
under that existing policy; B3 does not establish trusted imported authorship or
widen that policy. The new UI explicitly excludes imported/ambiguous ownership by
requiring a fresh B1 AUTHOR_OWN read with trusted local creation-audit evidence.
Combined-role principals whose B1 basis is BANK_MANAGER get no B3.1 UI action.
No new backend ownership tightening is silently included in this increment.

The command requires the current workflow revision; backend accepts DRAFT or
QUARANTINED, but **B3.1 UI offers only DRAFT**. It checks canonical immutable graph,
normalized content/hash/fingerprint, previous validation outcomes and safe content.
It may materialize existing delivery/source dependency checks, append its existing
BANK_IMMUTABLE validation, update workflow to IN_REVIEW/revision+1, clear old review/
hold pointers, and append audit/idempotency records atomically. These automated
checks are not correctness/rights attestation or qualified human review. Question/
secret/reference/history bytes remain immutable. No eligible/published inventory,
human review decision, score, rights grant or new exam is created.

UNKNOWN source rights do not become approved by queue handoff. The existing command
does not require current display rights; a queued version may remain content-blocked
under B1, while B2 lets only independent queued reviewers/managers investigate
recorded claims. Existing validation failures remain failures; no forced submit,
policy fallback or automatic content repair.

## Exact private operation contract

Add StaffSubmitReviewRequestSchema/StaffSubmitReviewResponseSchema and corresponding
types to the existing private `@tsa/contracts/staff` subpath, plus
`staffSubmitReview` in the private operation registry/artifact. Preserve B1/B2 and
all existing root/student/released exports/schemas/artifacts. Extend private
StaffOperationMap's currently GET-only body/header typing to infer the new POST
schemas without changing old operation types.

- Method/path: POST `/api/v1/question-versions/{versionId}/submit-review`.
- Path: existing lowercase UUID format; malformed version404, no query.
- Headers: application/json; trusted Origin and current same-origin session/CSRF
  cookie/token, X-CSRF-Token; mandatory Idempotency-Key1..128 visible ASCII (0x21–0x7e) as
  existing Bank validation. No caller role/actor/contentHash/approval timestamp.
- Strict body: `{expectedRevision: PositiveSafeInteger}`.
- Strict200 receipt: `{versionId: UUID, state: "IN_REVIEW", revision: PositiveSafeInteger}`.
  This is an operation receipt, not a later observation of current workflow state.
- Existing transport ordering: Origin/session/CSRF before JSON parsing, then command
  role/ownership/revision/validation. Do not claim role denial precedes all malformed
  bodies as in private GETs. Wrong methods keep existing404 behavior.
- Existing strict Bank errors `{error:{code,message,requestId,details:{}}}` and
  no-store/nosniff/Vary Origin/X-Request-Id. Private artifact documents actual outcomes:
  400 MALFORMED_JSON;401 UNAUTHENTICATED;403 FORBIDDEN or CSRF_FAILED;
  404 NOT_FOUND;409 IDEMPOTENCY_CONFLICT/REVISION_CONFLICT/CONCURRENT_MODIFICATION;
  413 PAYLOAD_TOO_LARGE;422 VALIDATION_ERROR/RIGHTS_BLOCKED/CONSTRAINT_CONFLICT;
  503 TEMPORARILY_UNAVAILABLE. Fixed safe messages, no graph/SQL/private evidence.
  Some codes are shared Bank validation outcomes; tests must pin actual reachable
  submit outcomes without inventing a new server result. Unexpected query/body
  fields fail according to the existing handler/strict command. Body limit1MiB.

## Explicit UI and error recovery

Only show the handoff control after an explicit fresh B1 AUTHOR_OWN inspection
with DRAFT state, current AUTHOR role and exact selected version. No hover prefetch
or automatic POST. A keyboard-accessible confirmation names version/hash/revision
and states that this sends a draft to a queue without approving content/rights.
Cancel/Escape restores focus; confirmation is explicit. Do not imply a human or
platform has reviewed the content. Blocked B1 metadata may still supply the exact
identity/state needed for handoff; no blocked question/key content is displayed.

One pending intent captures versionId/expectedRevision/body and a random key before
the POST. Disable duplicate activation. On an uncertain/lost response, never claim
success or automatically create a new key; explicit retry reuses the same captured
key/body. Changed target/revision requires a new explicit confirmation/intent.
Known409 or validation failure shows a meaningful error and offers authoritative
reload; do not silently overwrite a newer workflow revision or resubmit it.

A matching200 confirms the operation receipt, then invalidate private panels and
refresh metadata/B1 by GET. Display current IN_REVIEW only when freshly observed;
if refresh fails, say handoff acknowledged/current status unavailable. Replay may
return the original receipt after the workflow has subsequently changed. Do not
pretend that receipt is the present state. No optimistic queue/publish indicator.

On navigation/logout/identity/target change, discard stale UI completions/private
content; accepted commands may still finish on the server and are not cancelled by
closing the UI. Reload performs reads, never a silent new handoff. Keep pending
intent in memory, no private local/session storage, telemetry or payload logging.
Use separate synthetic AUTHOR and independent REVIEWER identities to demonstrate
create→inspect→explicit handoff→queue→B1/B2 read. No review/approval/rights/quarantine
commands are added to the demo. Retained UNKNOWN remains unchanged.

## Impact, acceptance and rollback after approval

No SQL/dependency changes anticipated. Reuse existing command/idempotency and
read helpers; if a genuine grant/schema/authorization gap is found, stop that
expansion and propose its impact rather than widening scope. Do not rewrite
approved B1/B2 or historical data. Automated validation side effects are expected
command writes, unlike the zero-write private read acceptance.

Required real-PostgreSQL/HTTP checks: fresh AUTHOR_OWN DRAFT handoff and immutable
bytes, exact allowed write delta; current auth/CSRF/Origin/role/foreign scope;
missing/malformed/no-query/body/key errors; stale revision/state; duplicate/replayed
and changed-body keys; rollback on validation failure; no hidden rights/publication
changes; replay receipt versus newer current state. Browser confirm/cancel/focus/
keyboard/mobile, lost-response same-key retry, reload reads, errors, identity/late
responses, full synthetic author→independent reviewer queue with B1/B2 release/
rights restrictions preserved. Reuse existing suites; independent read-only review.
No synthetic actor is a qualified human reviewer. No paid API/live inference.

Local-only rollout uses existing guarded staff runtime. Rollback removes the new
UI/typed operation while retaining existing backend command/data/audit/receipts.
No production/remote changes. B3 runtime **NOT_EXECUTED** until explicit approval.
