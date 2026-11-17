# WEB-002 B4.1 negative dispositions — independent design review

2026-10-24, branch `feat/track-b-data-auth`, implementation base bd45327.
Root designer/sole documentation writer; owner AGENTS/research preserved/excluded.
[Exact B4.1 proposal](../decisions/WEB_002_B4_NEGATIVE_DISPOSITIONS_PROPOSAL.md).
Status **INDEPENDENTLY_REVIEWED DESIGN / HUMAN_APPROVAL_REQUIRED**.
Final SHA-256:
`65b81b18c6d700e0858d0c214d8cc1944e48876e0beb289d7b0a6edf14eb9e21`.
No B4 runtime/UI/DTO/authorization repair is implemented by this checkpoint.

## Concrete finding and resolution

Separate `/root/lifecycle_review`, configured native Codex Sol6.1/Medium, read-only,
found one P2 in the initial proposal: it overstated unchanged server import-operator
exclusion. Existing publication-gates.loadWorkflowTarget obtains operator_id via
candidate receipt→manifest. Imported reference ancestors may lack receipts, leaving
null operator attribution in the mutation independence check. B1's private-read
helper independently resolves original namespace/manifest attribution and protects
the proposed fresh REVIEW_QUEUE UI gate. This source evidence is not a reproduced
runtime exploit or a claim that existing mutation enforcement is complete.

Root revised B4.1 to explicitly include a bounded original-attribution repair in
the new approval request: reviewer independence preflight/locked/replay/singleton
paths reuse B1's original immutable namespace/manifest evidence; missing/ambiguous
attribution fails closed. No new roles/grants/publication permission, no change to
manager quarantine authority, no historical review/audit rewrite. UI rollback
retains that security repair. Candidate/receipt-less ancestor/operator and genuine
independent reviewer HTTP/PG regressions are required after approval. None of this
repair was applied under the read/handoff-only B1/B2/B3 approvals.

Reviewer reread the complete revised proposal and confirmed the P2 resolved, final
no remaining concrete blockers. One explicit whole-revised-B4.1 owner approval was
judged sufficiently specific for this bounded implementation. That design opinion
is not owner authorization, qualified human content review or runtime evidence.

## Exact review scope and checks

Source inspection covered proposed negative-only rejection/rubric/reason and
consequential manager quarantine, current handler/service/gates, Factory import
persistence, idempotency, transport and delivery-hold SQL. Quarantine's post-commit
drain failure may yield503 after a committed receipt; same-key retry remains
necessary. Rejection removes queued B1/B2 private access, so404/queue disappearance
must not be shown as an exact current state. No APPROVE/publication/rights UI or
synthetic qualified-human claim. Historical data remains immutable.

Actual checks: `cat`, `sed`, `rg`, numbered-line inspection; supplemental full
proposal reread, Git status and empty publication service/gates diff confirmation.
Tests **NOT_EXECUTED**, documentation-only proposal. No reviewer file writes,
installs/commits/external services or paid model API. Root docs/scoped staged
whitespace checks PASS: zero docs errors, one preserved historical whitespace
warning, no scoped staged whitespace errors. No approval is inferred
from `continue` or whole-B3 handoff approval.

Recommended next implementation Codex Sol6.1/High for authorization/mutation,
available Luna/XHigh for bounded UI with Sol fallback; separate Sol6.1/Medium
read-only runtime review, existing subscriptions only.
