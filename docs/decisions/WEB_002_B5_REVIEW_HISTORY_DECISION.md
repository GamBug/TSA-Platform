# WEB-002 B5.1 — manager-only recorded review history

2026-10-24 Asia/Bangkok, basefec7467. AUTHORIZED_IN_SCOPE / root-selected under
[owner engineering-choice delegation](OPEN_DECISIONS.md#track-b-engineering-choice-delegation--2026-10-24).
This records root's technical choice, not a fabricated owner whole-proposal quote.
Recommended root Codex Sol6.1/High for authorization/snapshot integration, available
native Luna/XHigh bounded contracts/UI with direct fallback, separate Sol6.1/Medium
read-only reviewer; existing subscriptions, no paid model API.

## Problem, decision and alternatives

REJECT removes queued reviewer B1/B2 access; receipts are historical and omit rubric/
reason. Managers currently cannot inspect recorded decisions through the website.
Add a private explicit manager-only bounded read and inert-text UI. Preserve that
reviewer access loss; do not broaden B1/B2 or infer current state from old decisions.
Alternative: retain receipts only. A full reviewer assignment/history/publication
workflow is outside this bounded increment. Fixed-run assembly diagnostics require
an actual fixed-run service/adapter (not currently implemented); personal runs may
not be exposed through that future endpoint.

## Exact additive contract and policy

Private `StaffReviewHistorySchema` and type, operation `staffReviewHistory`,
GET `/api/v1/question-versions/{versionId}/review-history`. Existing staff UUID path,
no query/body/request headers required. Explicit local handler opt-in
`enableReviewHistory=false` by default; local synthetic Track B enables it.
Current authenticated BANK_MANAGER with existing `bank.diagnostics.read` only;
AUTHOR/REVIEWER/EXAM_MANAGER/candidate denied403 even if they authored/imported the
target. Unknown/malformed version404 after role check. Wrong method404, foreign
Origin403, malformed query/body framing422; existing safe error union401/403/404/
422/503, empty error details/requestId contract and no-store/nosniff/Vary preserved.
This is a new administrative projection, not a grant to ordinary question readers.

Strict response:

```typescript
{
  schemaVersion: "staff-review-history/1";
  environment: "LOCAL_SYNTHETIC_ONLY";
  accessBasis: "BANK_MANAGER";
  observedAt: UTCDateTime;
  version: { versionId: UUID; contentHash: Hash; workflowRevision: PositiveSafeInteger };
  workflowState: WorkflowState;
  qualification: "NOT_ATTESTED_BY_PLATFORM";
  publicationEligibility: "NOT_EVALUATED";
  limit: 20;
  truncated: boolean;
  reviews: Array<{ // max20, latest first
    reviewId: UUID;
    recordedAt: UTCDateTime;
    decision: "APPROVE" | "REJECT";
    rubric: { correctness: boolean; unambiguous: boolean; relevant: boolean;
      language: boolean; explanation: boolean; rights: boolean };
    reason: string; // nonblank, max4096, inert untrusted text
  }>;
}
```

One REPEATABLE READ, READ ONLY snapshot reads exact version/workflow and at most21
immutable review rows ordered created_at DESC,id DESC. Return first20 and a truthful
truncated indicator; no cursor/full-history promise. Every returned review must
match the immutable version hash; malformed/oversized/inconsistent data fails
closed503. Total response <=1MiB. No additional structured question content/key/explanation,
source raw material, reviewer/author/operator identity, audit dump, fixture scope or
personal exam data is projected. Root explicitly selects disclosure of the stored
reason verbatim to the current manager as administrative evidence. Arbitrary reason
text may itself contain pasted content, keys, identities or URLs; no redaction or
absence-of-secrets assurance applies to that untrusted text. Keep it inert, private,
not logged, and never expose this projection to students/authors/reviewers.
A recorded APPROVE is historical database evidence, not platform qualification,
lawful rights proof or present eligibility. Rights/held state does not erase
administrative decisions; no content preview is returned. No read audit mutation,
new DB grants/migration, schema rewrite or historical update. Existing manager
restricted SELECT is sufficient; verify rather than assume.

## UI and acceptance

Only current BANK_MANAGER metadata rows get explicit **Xem lịch sử rà soát**;
no prefetch. Exact requested version/hash/revision/server observation/current state,
clear no-qualification/no-publication warning, recorded decision/rubric/reason,
empty and latest20/truncation states. Text/markup/URLs inert; no external requests.
Close/Escape restores focus. Return/logout/target/identity/new request generation
clears private history and fences delayed responses, including return→reopen.
Never merge history observation into B1 or mutation receipts. Reads only; no APPROVE
command or role impersonation. New private artifact only; frozen B1–B4/root/student/
released/public shapes remain stable. No migration path needed for additive opt-in.

Required verification: strict schema/artifact/built/export/student-import boundary;
real current-role/Origin/framing/unknown/auth/opt-in HTTP tests; zero writes across
all application tables; empty/recorded/held snapshot, stable latest20/ties/truncation,
corrupt data fail-closed; actual manager browser empty/REJECT history, inert hostile
text, exact identity, race/private cleanup, desktop/mobile/keyboard and candidate/
reviewer denial; existing suites where affected. Record automated versus independent
versus human acceptance separately. No real content or formal accessibility claim.

## Implementation disposition

IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED within local scope;
[actual commands, separate review and limitations](../reviews/WEB_002_B5_RUNTIME_VERIFICATION.md).
Independent P2 disclosure ambiguity repaired explicitly above: no redaction or
absence-of-pasted-secrets guarantee for the verbatim private administrative reason.
Historical frozen B1–B4 contracts remain unchanged. Clean reproduction follows
implementation commit; no human/rights/accessibility/production acceptance inferred.
