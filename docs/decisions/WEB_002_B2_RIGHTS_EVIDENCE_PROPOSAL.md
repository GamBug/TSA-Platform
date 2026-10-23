# WEB-002 B2.1 — bounded recorded-rights evidence read

2026-10-23. **PROPOSED / HUMAN_APPROVAL_REQUIRED**. No runtime implementation or
approval. B1.2 inspection is implemented and verified; its frozen response has
`rightsEvidenceIncluded:false`. This proposal preserves that contract unchanged.

Accountable designer: Codex root. Recommended implementer: Codex Sol6.1/High for
private authorization/projection; available Luna/XHigh for bounded UI, Sol fallback;
separate Sol6.1/Medium read-only review. Existing subscriptions only, no paid API.

## Problem and recommendation

Staff can now inspect a version and current rights status, but cannot read the
recorded evidence text underlying that status. That prevents a useful legal/source
review preparation screen. Add one separate local read; keep review decisions,
rights edits, approval/publication, quarantine, uploads, document/media retrieval
and assembly diagnostics outside this increment.

Options: retain B1 metadata/preview only; **approve B2.1 read-only evidence
(recommended)**; or separately design a larger evidence-plus-review-command batch.
B1 approval grants none of this additional private evidence access.

## Exact new operation and policy

`GET /api/v1/question-versions/{versionId}/review-evidence`, explicitly enabled
local synthetic staff runtime only. No query/body; same trusted-origin, fresh
session, fixed error/request-ID/no-store/nosniff/JSON rules as B1.

- Current BANK_MANAGER may read evidence for any existing version.
- Current independent REVIEWER may read only IN_REVIEW versions under B1's exact
  author/import-operator exclusions and verified original import attribution.
- AUTHOR alone, CANDIDATE alone and EXAM_MANAGER alone receive403 before lookup.
  Missing session401. Mixed roles use BANK_MANAGER then independent REVIEW_QUEUE;
  AUTHOR membership does not bypass either rule. Qualified-human status is never
  inferred from a synthetic role.
- Missing/malformed/out-of-scope version receives404 without private target data.
- Use B1's verified full canonical graph/namespace mappings/source closure, current
  source-rights pointers and READ ONLY consistent snapshot. No workflow/source/
  audit/receipt/job/eligibility writes. At most100 sources and1MiB UTF-8 response;
  invalid storage/bounds return safe503, never a truncated evidence set.
- Recorded evidence may be read when rights are UNKNOWN/REVOKED or the workflow
  is held, because this operation returns no structured question/stimulus/key/explanation
  projection and enables staff investigation of blocks. The raw-text disclosure
  below is explicitly broader than B1; B1 preview gates remain unchanged.

Strict response, no additional keys; existing UUID/Instant/Hash formats:

```typescript
type StaffReviewEvidence = {
  schemaVersion: "staff-review-evidence/1";
  observedAt: Instant;
  environment: "LOCAL_SYNTHETIC_ONLY";
  accessBasis: "BANK_MANAGER" | "REVIEW_QUEUE";
  version: { versionId: UUID; contentHash: Hash; workflowRevision: number };
  sources: {
    sourceVersionId: UUID;
    currentDecision: null | {
      decisionId: UUID;
      revision: number;
      status: RightsStatus;
      recordedEvidence:
        | { state: "TEXT_AVAILABLE"; text: string }
        | { state: "NOT_RECORDED" };
    };
  }[];
  qualification: "NOT_ATTESTED_BY_PLATFORM";
  publicationEligibility: "NOT_EVALUATED";
};
```

Sources unique and sorted by local sourceVersionId. Positive safe revisions.
TEXT_AVAILABLE is only the current `rights_decisions.evidence.text` string,
nonblank and at most64KiB serialized UTF-8 including its container; a missing or
non-string legacy text is NOT_RECORDED. No historic decision substitution after
revocation; absent current pointer is null. Exclusions apply to **additional
structured fields**: no generic evidence JSON, reviewer/attestor identity, notes,
producer/run metadata, source metadata/URLs, paths/object keys, uploaded documents,
download links or document/media bytes are projected from other storage fields.

Approval would explicitly permit the two B2 access bases to read the current
recorded evidence text **verbatim**. The existing command accepts arbitrary text,
so it may include pasted names, identifiers, URLs, paths, notes or question/key
material. No automated redaction or assurance that text lacks these values is
proposed. This potential disclosure is part of the new owner decision; AUTHOR or
student access is still forbidden, and B1 never gains this field. A URI inside
text remains inert escaped text, never auto-linked or fetched; it creates no
media/file retrieval authority. This text is an untrusted administrative claim,
not platform legal attestation or qualified review. It cannot approve real content.

The response represents its own observedAt/current decision IDs. The UI must label
that fresh observation and must not silently present it as the older B1 snapshot.
It provides no review/rights mutation controls, so reading a changed pointer does
not create an approval. Normal retained rights remain UNKNOWN unless separately
changed through an already authorized human process; demonstration uses only the
existing explicitly disposable synthetic fixture. Its B2 extension may provision
a clearly labelled synthetic BANK_MANAGER for evidence browsing; it may not
represent a qualified human or record an approval/review decision.

## Impact and acceptance after approval

- Add a new strict private staff DTO/operation/artifact and an explicit evidence
  action; do not change B1 or any student/released contract/export semantics.
- Existing Bank commands already SELECT rights_decisions.evidence for validity;
  no new SQL grant, function, migration, retention store or assignment system is
  proposed. If inspection finds otherwise, return a specific impact proposal.
- Clear private evidence on close/logout/identity/navigation and discard stale
  responses, reusing B1's workspace/identity/request guards. No hover prefetch,
  cache, local storage, analytics/logging of evidence or external requests.
- Verify actual auth/role/BOLA/operator/queue changes, held/revoked/missing current
  evidence, exact version/hash and decision/revision snapshot, hostile text/URIs,
  response bounds, no additional question/key/provenance fields, exact escaped
  verbatim text disclosure only to the two B2 access bases and zero application writes.
  Browser keyboard/mobile/error/late-response behavior and independent review.
- Opt-in local rollout. Rollback removes only the new handler/DTO/UI action while
  preserving B1, immutable data and student delivery. No data migration needed.

Approval identity/date/evidence: **none**. One explicit owner approval of B2.1 as a
whole would authorize this read-only increment and its exact new private fields.
It would not approve review/publication or real rights/content qualification.
