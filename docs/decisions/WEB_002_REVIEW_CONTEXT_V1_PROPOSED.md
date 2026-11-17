# WEB-002 B1 — exact private inspection contract proposal

2026-10-23. Revision **B1.2**. Status **PROPOSED / HUMAN_APPROVAL_REQUIRED**.
Accountable designer: Codex root. This specification is reviewable design only;
no route, permission, runtime validator, public export or approval is added.
The owner's `NEXT` continues authorized preparation and does not resolve the
previous decision packet's private-access choices.

Recommended implementer: Codex Sol6.1 / High for the authorization/read projection;
available Luna / XHigh may implement an isolated frontend after the contract is
approved. Separate Sol6.1 / Medium is recommended for independent engineering
review. Use existing subscriptions only; no paid model API or assumed capacity.

## Scope and explicit decision

Approve one local, synthetic-only staff inspection GET and the complete policy
below. It enables exact version inspection and a rights-gated question preview.
It does not enable review decisions, publication, rights editing, quarantine,
assembly diagnostics, evidence-document access or media-byte serving.

This is the smallest useful first increment of option B in the
[staff decision packet](WEB_002_STAFF_READ_PROPOSAL.md). Full private evidence and
review workflow are subsequent increments. The precise access recommendation is
**all independently reviewable IN_REVIEW versions**, without a new assignment
system. The owner can instead retain metadata-only access; assignment-only review
would need a separately designed assignment contract/storage.

## Operation and authorization

`GET /api/v1/question-versions/{versionId}/review-context`

- Existing explicitly enabled local synthetic staff runtime only. Same trusted
  loopback origin/session mechanism as the Bank handler. Never compose this route
  into the ordinary student runtime or expose it through public static files.
- No body, query parameters, idempotency key, caller-supplied identity or workflow
  mutation. GET does not require a CSRF mutation token. Supplied untrusted Origin
  or host fails using the existing Bank boundary precedence.
- Authenticate current server-issued principal/roles for every request. Having a
  role label or an imported creator string is not sufficient authentication.
- Choose the first permitted basis in this order: BANK_MANAGER, AUTHOR_OWN,
  REVIEW_QUEUE. Combined staff roles use the same explicit predicates; a student
  role alone grants no access.

| Principal/basis | Version visibility |
| --- | --- |
| BANK_MANAGER | Current BANK_MANAGER role and trusted Bank-read permission required. Any existing version for metadata; preview remains subject to the same current-rights/content guards as every other basis. |
| AUTHOR_OWN | Current AUTHOR role and trusted Bank-read permission required. Exact version created by this principal through the existing local question-draft command, in any workflow state. Require matching trusted `question_versions.created_by` **and** its matching server-written `QUESTION_DRAFT_CREATED` or `QUESTION_DRAFT_VERSION_CREATED` audit event, actor and entity. Imported author/provenance claims alone never establish ownership. |
| REVIEW_QUEUE | Current REVIEWER role and trusted Bank-read permission required. State is currently IN_REVIEW and the current principal passes the existing independent-reviewer author/import-operator exclusions. All such queued versions are in scope; no implicit reviewer assignment or perpetual access after leaving the queue. |
| CANDIDATE alone / EXAM_MANAGER alone / other role | 403 FORBIDDEN before private target lookup. |
| No authenticated session | 401 UNAUTHENTICATED before target lookup. |
| Eligible staff role but foreign/not-in-scope/missing/malformed version ID | 404 NOT_FOUND, identical envelope and no target details. |

A server-written local authorship audit is required, not inferred from an externally
supplied canonical creator UUID. If trusted attribution is absent or ambiguous,
AUTHOR_OWN fails closed; a BANK_MANAGER may still inspect safe metadata. A removed AUTHOR role removes AUTHOR_OWN access on the next request even if historic authorship evidence remains. A former author who retains REVIEWER must independently satisfy REVIEW_QUEUE and cannot review their own version. Imported
operator status does not independently grant AUTHOR_OWN access. REVIEW_QUEUE
must not use submitted/cached principal or version ownership supplied by a client.

## Complete successful response

HTTP200 with this strict object; all listed fields are required, nested objects
reject additional keys. `UUID`, `Instant`, `Section`, `Interaction`, `AnswerKey`
and `Block` retain existing formats/semantics; no original contract is modified.
`Hash` is exactly `sha256:` plus64 lowercase hexadecimal digits. Positive integer
fields must be safe JavaScript integers. This DTO belongs to a new **private staff
namespace**, never a student/released-result/root compatibility export.

```typescript
type WorkflowState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "QUARANTINED" | "RETIRED";
type RightsStatus = "OWNED" | "LICENSED" | "OPEN_LICENSE" | "PUBLIC_DOMAIN" | "REFERENCE_ONLY" | "UNKNOWN" | "REVOKED";
type RightsUse = "DISPLAY" | "ADAPT" | "GENERATE" | "TRAIN";
type StaffReviewContext = {
  schemaVersion: "staff-review-context/1";
  observedAt: Instant;
  accessBasis: "BANK_MANAGER" | "AUTHOR_OWN" | "REVIEW_QUEUE";
  environment: "LOCAL_SYNTHETIC_ONLY";
  version: {
    questionId: UUID;
    versionId: UUID;
    versionNo: number;
    parentVersionId: UUID | null;
    section: Section;
    contentHash: Hash;
  };
  workflow: { state: WorkflowState; revision: number };
  sources: {
    sourceVersionId: UUID;
    contentHash: Hash;
    origin: "OWNED" | "EXTERNAL" | null;
    currentRights: null | {
      decisionId: UUID;
      revision: number;
      status: RightsStatus;
      allowedUses: RightsUse[];
      territory: string[];
      validFrom: Instant | null;
      validTo: Instant | null;
    };
  }[];
  preview:
    | {
        status: "AVAILABLE";
        question: {
          language: "vi-VN";
          content: Block[];
          interaction: Interaction;
          answerKey: AnswerKey;
          explanation: Block[];
          scoringPolicyVersion: string;
          stimulus: null | { versionId: UUID; contentHash: Hash; content: Block[] };
        };
      }
    | { status: "BLOCKED"; reason: "RIGHTS_BLOCKED" | "CONTENT_UNSUPPORTED" | "WORKFLOW_HELD" };
  rightsEvidenceIncluded: false;
  publicationEligibility: "NOT_EVALUATED";
};
```

`versionNo` and `workflow.revision` are independently positive integers, never
interchanged. `contentHash` identifies the immutable authored question/reference
graph; it is not a hash of this minimized DTO or an updated workflow snapshot.
`observedAt` is the server observation time, not an approval/review timestamp.
No author/reviewer user IDs or names, raw provenance, generation/operator IDs,
reference namespace, fingerprints, duplicate-group IDs, private notes, rights
text/documents, source URLs, paths, asset object keys or provider data are returned.
The source row's origin is recorded metadata, not lawful-use approval.

`Block` keeps existing safe text/math/table semantics. Image blocks and any other
unsupported/unsafe content anywhere in question, options/statements, explanation
or stimulus select CONTENT_UNSUPPORTED with **no** question object. This increment
supplies no image fetch route. Every AVAILABLE answer key must validate against
its exact interaction using existing semantic validators.

## Source closure and preview gate

The source set is the entire verified immutable reference closure, including
question, stimulus, referenced parent/ancestor content and assets. Resolve imported
opaque IDs through exact namespace/hash mappings; return only local source UUIDs.
Do not approximate the closure with question_provenance alone or require a prior
publication command to have populated delivery-dependency caches. Verify immutable
graph/hash and normalized storage consistency through read-only mechanisms before
returning private content. Corruption/inconsistent/missing dependency mapping is a
safe503 TEMPORARILY_UNAVAILABLE, not a partial preview or a source omission.

Return sources uniquely sorted by sourceVersionId. Missing current rights is
`currentRights:null`, never a fabricated UNKNOWN decision. Read only the currently
pointed decision; do not substitute an authored historic grant after revocation.
A missing/unknown origin remains null. No evidence-text object is copied out.

Preview reason precedence is WORKFLOW_HELD, RIGHTS_BLOCKED, CONTENT_UNSUPPORTED:

1. QUARANTINED or RETIRED: preview BLOCKED/WORKFLOW_HELD, metadata only.
2. Any source lacks an effective current permission under the existing publication
   rights predicate: preview BLOCKED/RIGHTS_BLOCKED, metadata only. Require status
   OWNED/LICENSED/OPEN_LICENSE/PUBLIC_DOMAIN; DISPLAY, plus GENERATE for generated/
   augmented content and ADAPT for augmented content; VN or WORLDWIDE territory;
   non-null validFrom <= current server observation time and exclusive validTo;
   existing nonblank rights evidence and enabled attestor. Do not expose the
   evidence or attestor. These checks do not establish qualified legal review.
3. Unsupported/unsafe content: preview BLOCKED/CONTENT_UNSUPPORTED, metadata only.
4. Otherwise preview AVAILABLE with the exact immutable question and stimulus.

Preview is permitted staff inspection of a version, not student release or proof
of publication eligibility. It must never set an eligible pointer, produce a
validation/review row, register delivery checks, invoke assembly or return an
"approved" UI badge beyond the recorded workflow state. Synthetic fixture grants
stay confined to owner-initialized disposable fixture scopes; normal retained
source rights UNKNOWN are not promoted merely to make the preview work.

## Read isolation, bounds and error transport

Use one consistent READ ONLY transaction/snapshot through the existing restricted
Bank connection for authorization target, workflow, immutable graph and current
rights. Do not call `validateWorkflowTarget` or `assertPublicationGates` directly:
current implementations can write delivery checks/validation/publication scope.
A read must perform zero application writes, including receipts/audit/history/jobs.
Transaction-local role/settings are permitted; no SELECT FOR UPDATE/lock-based
workflow mutation is required. Use a single fresh server observation time for
validity calculations. Reads begun before a concurrent revocation may observe the
old snapshot; the next read must apply the revocation. No browser cache/prefetch
or claim of retroactively erasing an already returned authorized response.

Maintain existing graph limits (2,000 nodes,8 MiB reference bytes), at most100
unique source rows, and at most1 MiB serialized UTF-8 response. Exhausted bounds
or invalid stored projection returns503 TEMPORARILY_UNAVAILABLE with no partial
question/keys/source graph; never truncate dependencies. A future larger contract
requires an explicit revision. Content blocks retain existing question bounds.

Responses use JSON UTF-8, no-store, nosniff, Vary Origin, and X-Request-Id matching
the error body requestId. Error envelope remains the existing Bank envelope:
`{error:{code,message,requestId,details:{}}}` with fixed safe messages. Allowed
errors:401 UNAUTHENTICATED,403 FORBIDDEN,404 NOT_FOUND,422 VALIDATION_ERROR for
unexpected query/body,503 TEMPORARILY_UNAVAILABLE. Origin/auth/role checks precede
query/body/target validation. Wrong methods remain404. No ETag, public cache,
redirect, CORS relaxation or raw SQL/parse/rights/content error details.

## UI and verification acceptance after approval

- Existing metadata rows may explicitly request this exact version; no hover
  prefetch. Show version/hash, current workflow revision and rights metadata.
- AVAILABLE preview reuses safe local math/table rendering with accessible labels;
  author-created HTML is text. BLOCKED contains no keys, explanations or content,
  and the UI explains the block truthfully without implying a human decision.
- Clear private view before logout/identity/navigation; preserve workspace-generation
  guards so a late response cannot reinsert content into a successor screen.
- Real-auth PostgreSQL/HTTP tests: anonymous/student/EXAM_MANAGER403/401, foreign
  author and unknown404, forged imported creator UUID cannot grant AUTHOR_OWN,
  queued independent reviewer allowed and queue/role change revoked on next GET (including former AUTHOR retaining REVIEWER),
  BANK_MANAGER metadata plus identical preview gates, combined-role precedence.
- Test all three interactions, shared stimulus/opaque mappings and graph/hash
  integrity. Unknown/revoked/expired/disabled-attestor rights and held workflows
  omit **all** content/keys/explanations. Observe zero DB writes and unchanged
  immutable rows/eligibility/audits/jobs before/after GET/error/replay.
- XSS/hostile TeX/source URL/path/private-field probes; bounds fail closed; no
  private namespace in student imports/public bundles; no network resource loads.
- Browser keyboard, focus, mobile preview/block/error/logout/reopen lifecycle with
  an explicitly disposable synthetic rights-valid fixture. No qualified human
  content, rights or formal accessibility acceptance is inferred from automation.

## Implementation impact and rollback

After explicit owner approval, freeze private runtime validators and a dedicated
staff operation artifact/consumer checks; preserve existing export entries,
student schemas and generated student artifacts. A new private staff subpath may
be added without changing existing entry semantics. The existing Bank role can
read question/secret/reference/rights rows for trusted commands but has no SELECT
on audit_events. The known authorship gap is explicitly covered by the following
narrow additive migration; broad audit access is not approved by this proposal.

Proposed migration019 adds only
`tsa.bank_local_version_authored_by(version_id uuid, actor_id uuid) RETURNS boolean`:

- STABLE, SECURITY DEFINER, fixed `search_path = pg_catalog, tsa`, migration-owner
  ownership, no dynamic SQL, no writes and no external calls.
- Return false for null arguments, missing/ambiguous matching creation evidence;
  otherwise return whether a server-written audit with entity_type question_version,
  entity_id version_id, actor_id trusted actor_id, and action QUESTION_DRAFT_CREATED
  or QUESTION_DRAFT_VERSION_CREATED exists. Do not return audit rows/identities.
- Caller supplies actor_id only from freshly authenticated trusted principal;
  it is never a path/query/body input. Service separately checks current AUTHOR
  membership and stored question creator as specified above.
- Revoke all function execution from PUBLIC; grant EXECUTE only to tsa_bank.
  Do not grant tsa_bank SELECT on audit_events or change student/worker/Factory/
  identity permissions. Existing narrow audit probes in migrations006/007 provide
  the repository pattern; verify ownership and grants on fresh/populated upgrade.
- No backfill, historical audit rewrite, new table or assignment system. Legacy
  absent evidence remains absent and yields no AUTHOR_OWN access.

This migration and the HTTP access predicate are both part of the B1.2 approval
request. Any other grant/storage requirement needs a further impact proposal.
Required verification adds real-PG function positive/negative/ambiguity/null cases,
PUBLIC/student/worker/identity denial, unchanged raw-audit SELECT denial to Bank,
and fresh/populated upgrade preservation. No migration is implemented by this draft.

Local opt-in rollout only. Rollback first removes the new private GET and preview UI, then revokes/drops only the new function in migration019 when no dependent caller remains;
existing metadata listing, immutable questions, history and student delivery remain
unchanged. Do not modify historical rows or approved student contracts to roll back.

## Approval

Approval identity/date/evidence: **none**. The requested approval is B1.2 as a whole,
including the all-independent-IN_REVIEW policy, trusted local authorship rule,
rights-gated content and exact private response. Engineering review is advice;
only a recorded human owner disposition permits implementation.
