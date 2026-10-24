# WEB-002 B4.1 — explicit local rejection and quarantine

2026-10-24. **PROPOSED / HUMAN_APPROVAL_REQUIRED**; approval identity/date: none.
B3 author handoff is implemented/reviewed. This is the next bounded staff command
proposal, not runtime implementation or qualified human content review.

Root designer. Recommended Codex Sol6.1/High for authorization/mutation/recovery;
available Luna/XHigh bounded UI with Sol fallback; separate Sol6.1/Medium read-only
review. Existing subscriptions only; no paid model API/live student inference.

## Decision and boundaries

Recommend two explicit negative actions over existing local Bank commands:
independent reviewer rejection of a previewable queued synthetic version, and
Bank Manager quarantine. Alternatives: retain B1/B2/B3, or separately design a
full qualified-review/rights/publication batch. One whole-B4.1 approval would
cover the exact operation schemas/UI/recovery below; no APPROVE/publication,
rights editing, release, real-content rights, qualified-human identity, new review
history read, raw audit read, assignment system, media or diagnostics authority.

Synthetic roles must be labelled simulation throughout, never qualified reviewers.
Every new UI command reason is stored as `Local synthetic disposition: ` followed
by the operator's explicit nonblank reason, maximum4096 characters including that
prefix (matching current service trimming/length validation). No automated default
reason or rubric finding. This records a synthetic action, not human acceptance.
Retained UNKNOWN rights stay UNKNOWN and no new real content is introduced.

Existing routes and intended role policies remain unchanged; the narrow original-
operator attribution repair below is explicitly included. New private DTO/artifact/
UI models only REJECT; it does not remove the pre-existing backend APPROVE handler
or weaken its fixture/publication guard. No UI bypass or new API permissions.
No SQL migration/grant/dependency change proposed. If inspection finds a genuine
gap requiring one, propose its impact before expanding implementation.

## Exact private operations and eligible UI

Reuse B3's CSRF/idempotency request-header schema, current session/Origin and Bank
transport ordering, no query,1MiB body limit, safe fixed error envelope/details{},
no-store/nosniff/Vary Origin/request IDs. Positive safe revisions, existing lowercase
UUID/hash formats, strict request/receipt schemas, no additional fields.
Keep B1/B2/B3 and student/root/released/public contracts unchanged.

**Rejection:** existing POST `/api/v1/question-versions/{versionId}/reviews`.
Add StaffRejectReviewRequestSchema/ResponseSchema/type and `staffRejectReview`.
Body:

```typescript
{
  expectedRevision: PositiveSafeInteger;
  contentHash: Hash;
  decision: "REJECT";
  rubric: {
    correctness: boolean; unambiguous: boolean; relevant: boolean;
    language: boolean; explanation: boolean; rights: boolean;
  };
  reason: string;
}
```

Receipt201: `{reviewId: UUID, state: "REJECTED", revision: PositiveSafeInteger}`.
The intended server policy remains independent REVIEWER excluding original
author/import operator. Current implementation has a receipt-less imported-ancestor
operator-attribution limitation, addressed explicitly below; do not claim it is
already enforced for every imported reference. Only current IN_REVIEW/revision/
hash matches can commit a new review. Same-key replay is the original receipt, subject to current authorization.
Missing/foreign/role outcomes retain the existing handler/service policy, including
403 for an independent-review denial; do not promise B1's private-read404 ordering.

New UI is stricter: current REVIEWER, explicit fresh B1 REVIEW_QUEUE/IN_REVIEW and
AVAILABLE preview for exact version/hash/revision. BANK_MANAGER-basis reads get no
rejection action, even in mixed roles. Blocked preview gets no rejection form:
boolean rubric fields cannot represent an assessment that has not been performed.
Six required pass/fail choices start unset and must each be selected explicitly;
there is no automatic score/rubric. Require an explicit reason and confirmation
showing exact identity/revision, selections and no-qualified-review warning.

**Quarantine:** existing POST `/api/v1/question-versions/{versionId}/quarantine`.
Add StaffQuarantineRequestSchema/ResponseSchema/type and `staffQuarantine`.
Body `{expectedRevision: PositiveSafeInteger, reason: string}`.
Receipt200: `{state: "QUARANTINED", revision: PositiveSafeInteger}`.
Current server BANK_MANAGER scope/state rules retained. New UI requires current
BANK_MANAGER, fresh explicit B1 BANK_MANAGER inspection and DRAFT/IN_REVIEW/APPROVED
state. Rights-blocked/unsupported previews may still be held based on their exact
metadata. No state/hash/role guessing from list data. Reason explicit as above.

Both receipts omit version identity under the existing wire contract. Bind them
to the immutable captured request path/intent, verify exact literal state, revision
expected+1 and reviewId where present. Never add invented response fields or treat
receipt as current state. Standard Bank failure codes/statuses must describe actual
reachable outcomes (400/401/403/404/409/413/422/503), with current CSRF/idempotency
semantics; do not invent an error status to simplify UI behavior.

## Narrow server authorization repair included in this decision

Independent source review found that publication-gates.loadWorkflowTarget derives
operator_id through candidate receipts. Imported reference ancestors can lack a
candidate receipt, so the old mutation path may pass operatorId=null to its
independence check. This is a static evidence gap, not a reproduced exploit claim.
B1's original namespace/manifest resolution already excludes that operator from
REVIEW_QUEUE inspection, so B4's stricter fresh-read UI gate is protective but is
not a substitute for server enforcement on direct commands.

Whole-B4.1 approval would explicitly authorize a bounded repair of original import
attribution wherever reviewer independence is checked: existing review preflight/
locked command paths and singleton independence guards, including the pre-existing
APPROVE backend path without adding an APPROVE UI or relaxing publication gates.
Reuse/extract B1's verified factory/2 namespace→immutable original manifest match
and received_by attribution, not claimed creator UUID or a different child's
receipt. Candidate and receipt-less reference ancestors must both exclude their
original import operator under current roles. Missing/ambiguous attribution fails
closed with the existing safe503; never silently substitutes null as independent.
Manual-version behavior, original author exclusion and manager authority remain
unchanged. Do not make manager quarantine depend on canonical import attribution;
unsafe/corrupt imported content must remain holdable under its existing policy.

This is an implementation correction of intended independence, not a new reviewer
role, ownership system, grant or data migration. Exact helper/file choice is left
to implementation review; no unrelated Factory/refactor or normalized-content
policy expansion. Apply the same attribution before fresh commands and replay
authorization. Operator requests previously accepted because of missing attribution
will be denied; that tightening is part of this explicit approval request.
No old review/audit/eligibility/history is rewritten or retrospectively claimed
valid. If existing affected historical decisions are found, record them without
changing immutable records and propose their separate disposition.

Required actual HTTP/PG regression: genuine Factory import with candidate plus
receipt-less ancestor, original operator with REVIEWER role denied directly and
through fresh UI; independent non-author/non-operator remains permitted in queue;
manual/candidate behavior and immutable manifests/student/B1/B2/B3 boundaries
preserved. Do not simulate qualified review or expose manifest identities in errors.

## Effects requiring explicit acknowledgement

Rejection appends the immutable review/rubric/reason, updates workflow to REJECTED,
clears any matching eligible pointer and, where applicable, increments eligibility
revision, with audit/idempotency records. It never approves content or grants rights.
No raw reviewer notes/history are newly exposed.

Quarantine is consequential even on a DRAFT ancestor: it applies existing delivery
holds to related versions/forms/results, clears related eligibility, updates
workflow/quarantine reason, invalidates/cancels affected student access under the
existing rules, and drains persisted fan-out. Confirmation must disclose that
related published descendants and existing attempts/results may be affected;
not just the selected row. Do not promise an unaffected student journey or a
rollback that restores exposure/inventory. Existing sealed exam/question bytes,
scoring/timing rules and NEW_ONLY assignment history remain immutable.

The existing quarantine service commits its command/receipt before its final
delivery-hold drain. A later failure may return503 after commit. Treat it as
uncertain; retry the same path/body/key to reuse the receipt and retry the existing
drain. Never issue a new command key or claim no hold occurred merely from503.
Receipt/current workflow observation does not prove fan-out completion or give
an affected-count/operational-readiness guarantee absent a separate read contract.

## Recovery and post-command access

Reuse B3's native confirmation, keyboard Cancel/Escape/focus, immutable in-memory
intent and duplicate-submit guard. No automatic POST/prefetch. Network/unknown
outcome offers same-body/key explicit retry. Known conflict/validation failure
requires authoritative reload/new inspection/new confirmation before a changed
intent; no automatic revision replacement. Repeated/changed-key body, malformed
receipt, logout/navigation/target/identity and late-response behavior must remain
truthful. Accepted commands can finish after UI closes. No private persistent
storage/logging/analytics; clear reason/rubric/private DOM on leaving the view.

After REJECT, reviewer private B1/B2 access normally disappears because the version
is no longer IN_REVIEW. Do not broaden that scope or pretend a replayed receipt is
fresh REJECTED state. Show the acknowledged rejection receipt, refresh queue
metadata by GET, and explicitly state that current exact private workflow state
was not observed if the subsequent read is404/unavailable. Missing queue membership
alone is not proof of an exact state. Existing metadata filters may be used to
browse later states; no new exact-status/history endpoint is part of this proposal.

After quarantine, manager B1 may freshly show QUARANTINED/WORKFLOW_HELD metadata;
no private question/key/explanation survives a blocked current read. If the read
fails, say acknowledged receipt/current status unavailable. Replay remains a past
receipt even if later workflow changes. B2 still exposes only its approved current
recorded claim, not review qualification or human rights attestation.

## Verification, rollout and rollback after approval

Reuse existing real-PG/HTTP and browser suites; add only actual acceptance gaps:
current roles/CSRF/Origin/independence/import-operator, exact hash/revision/state,
required explicit rubric/reason/no APPROVE option, write/immutable-row oracles,
rollback on failure, same-key replay/changed-body conflicts, real quarantine
post-commit drain failure and retry, related parent/form/student holds while
NEW_ONLY history and sealed bytes persist. Verify rejection's loss of queued
private read, acknowledged versus current status, no secret/error leakage and
unchanged B1/B2/B3/student/public boundary. No synthetic qualified reviewer claim.

Actual Chromium and Firefox confirmation/cancel/focus/mobile, loss/retry/conflict/
reload/identity and author handoff→independent synthetic rejection plus manager
hold demonstration; no SQL/API calls needed for the visible journey. Formal AT,
load/performance/legal/content/production acceptance remain separate human inputs.
No publication or forced content approval is a demonstration step.

Local guarded synthetic-only rollout. UI/artifact rollback removes these actions
without deleting reviews/audit/receipts/holds/history. Retain the authorization
repair when rolling back UI; never automatically restore the known exclusion gap. Undoing a committed quarantine is not an automatic rollback here;
existing authorized workflow policy governs any later action. No remote operation.
B4 runtime **NOT_EXECUTED**; explicit owner approval is still required.
