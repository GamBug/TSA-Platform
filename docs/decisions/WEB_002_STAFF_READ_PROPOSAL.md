# WEB-002 — staff inspection contract proposal

2026-10-23. Status: **PROPOSED — HUMAN_APPROVAL_REQUIRED**. This document grants
no routes, roles, private-data access, content rights or publication permission.
Accountable proposal author: Codex root. Recommended implementing platform/agent:
Codex Sol6.1 / High for private DTO/authorization integration; bounded frontend
work may use available Luna / XHigh, otherwise Sol directly. Proposed independent
review: separate Sol6.1 / Medium. Existing subscriptions only, no paid model API.

## Current B1.2 owner disposition — 2026-10-23

The human owner explicitly approved B1.2 as a whole. [Exact authority/hash](OPEN_DECISIONS.md#web-002-b12--owner-approved-private-inspection-2026-10-23).
The first bounded inspection increment is implemented; [runtime evidence](../reviews/WEB_002_B1_RUNTIME_VERIFICATION.md).
The original options below are historical design context. Broader private evidence,
review decisions, rights/diagnostics and publication privileges remain unapproved
by B1.2. Do not interpret approval of this increment as approval of option C.

## Previous metadata-only capability

The existing local staff app creates AUTHOR drafts and reads metadata using
`GET /api/v1/questions` with state/section/cursor/limit. The endpoint independently
authorizes AUTHOR, REVIEWER and BANK_MANAGER and returns question/version IDs,
section, interaction type, workflow state and content hash. Current mission scope
permits improving this existing interface without changing route permissions.
Metadata state is not a complete publication-eligibility decision.

A read-only inventory by actual native agent `/root/staff_scope`, Luna/XHigh,
confirmed `src/http/bank.mjs` dispatches no version/private-evidence GET or assembly
diagnostics GET. `src/modules/bank/questions.mjs` owns paginated summaries.
Existing POST review/rights/quarantine commands do not supply the private read
context needed for a responsible human review screen. The API specification's
staff table is PROPOSED; the frozen shared registry covers student/released routes.
A normal synthetic reviewer cannot substitute for a qualified named human.

## Exact bounded contract now available

The [B1.2 private inspection proposal](WEB_002_REVIEW_CONTEXT_V1_PROPOSED.md)
turns the first useful option-B increment into an exact DTO, role/ownership matrix,
rights-gated preview, error/bounds policy and implementation acceptance checklist.
It recommends all independently reviewable IN_REVIEW versions without inventing
assignments. AUTHOR_OWN requires trusted local creation evidence; imported creator
claims do not grant access. Raw private evidence/review decisions remain later work.
This remains PROPOSED; no runtime access or owner approval follows from preparing it.

## Decision requested

Choose the next approved private staff contract before implementing new routes.

| Option | Scope and effect |
| --- | --- |
| A — retain metadata only | No new contract; useful filtering/version identity, but preview, review evidence and safe decisions remain unavailable. |
| B — bounded review-context read (recommended) | Approve a dedicated private version-inspection DTO/GET and its exact role/ownership matrix first; then implement preview and evidence without enabling publication controls. |
| C — complete staff read/write batch | Approve private version/rights/review queue/eligibility/assembly diagnostics DTOs plus required privileged command routes together; larger review and implementation surface. |

For B, proposed new operation is
`GET /api/v1/question-versions/{versionId}/review-context`. Freeze the exact schema,
error envelope and fields before implementation. It should identify immutable
question/version/hash, current workflow revision, safe renderable question and
stimulus, private answer/explanation for authorized inspection, review history,
rights decisions with immutable evidence references, open duplicate/equivalence
flags and separate machine-validation versus human-review dispositions. Do not
include provider secrets, filesystem paths, session data, opaque raw uploads or
another person's private notes by default. Render evidence as escaped text; do
not fetch arbitrary URLs or execute embedded HTML.

Proposed matrix: a creating AUTHOR may inspect their exact authored version;
REVIEWER/BANK_MANAGER inspection needs explicit owner-approved scope. Ordinary
students, EXAM_MANAGER alone and unauthenticated callers must fail at the endpoint.
Owner must resolve whether reviewers may inspect all queued versions or only
assigned versions; do not infer a new assignment mechanism. Scope current-rights
restrictions and ownership-negative 403/404 behavior explicitly. A denied role
must receive neither content nor existence-sensitive private details.

## Impact, migration and verification

- Add a private contract namespace and server read projection; preserve every
  frozen student/released DTO and current question/version immutability rule.
- Reuse existing version/workflow/evidence storage where it supplies the approved
  read. If assignments or additional grants require storage changes, propose the
  migration separately before implementation. No data mutation is needed merely
  to display an approved existing graph.
- Introduce frontend inspection only after the API independently enforces the
  approved matrix. Do not place private fixtures, keys or evidence in shared
  browser source, cache or prefetch bundles. Use no-store responses.
- Required tests: real-auth denied-role/foreign-author/BOLA, exact immutable
  version/hash and stale workflow revision, rights withdrawal, text/math/table
  preview with XSS and hostile evidence, no student/private bundle leakage,
  keyboard/mobile behavior. Record actual independent review.
- Rollout is opt-in local staff mode; rollback removes the new handler/view while
  preserving immutable versions and audit history. No production rollout follows.

Review decisions, rejection/quarantine controls and assembly diagnostics remain
subsequent scoped work. Approval of B alone would not authorize a synthetic human
approval, real publication, EXAM_MANAGER private deficits, rights attestation or
production deployment. The full real starter inventory still needs named author/
rights attestor and a different qualified reviewer for 12/6/12 accepted items.

Approval record: **none**. Record owner identity/date/exact scope in
[open decisions](OPEN_DECISIONS.md) if a choice is approved.
