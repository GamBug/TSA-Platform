# WEB-002 remaining fixed-run diagnostics dependencies

2026-10-24, source review at3251362 and B6 implementation c158d57.
Updated2026-10-25: the additive fixed manifest/reference/replay prerequisite is
implemented and independently reviewed in [B7.1](WEB_002_B7_FIXED_REFERENCE_DECISION.md),
[actual evidence](../reviews/WEB_002_B7_FIXED_REFERENCE_VERIFICATION.md). Personal
schema stays frozen. Stored fixed reference projection/discovery/UI are now
implemented in [B7.2](WEB_002_B7_STORED_DIAGNOSTICS_DECISION.md),
[actual evidence](../reviews/WEB_002_B7_STORED_DIAGNOSTICS_VERIFICATION.md); this
does not implement sealed forms/fixed student delivery. Actual eligible Bank capture
is now implemented separately in [B8.1](WEB_002_B8_BANK_STOCK_REHEARSAL_DECISION.md),
[executed evidence](../reviews/WEB_002_B8_BANK_STOCK_REHEARSAL_VERIFICATION.md); it
creates immutable historical diagnostic captures only, not sealed forms.
The source gap and initial design below are historical discovery, not current
absence of the new fixed parser. Root accountable; native Luna/XHigh read-only
worker actually mapped these dependencies. This is a concrete technical handoff,
not approval of a new manifest or permission to expose personal runs. No tests were
executed for this discovery; existing fixed fixtures are not runtime evidence.
Recommended root Codex Sol6.1/High for contract/replay/privilege design, available
Luna/XHigh bounded implementation after scope selection, separate Sol6.1/Medium
read-only review; existing subscriptions only, no paid model API.

## Source-supported gap

- `packages/contracts/src/assembly-reference.ts`: frozen AssemblyManifestSchema
  accepts NEW_ONLY/REVIEW_ALLOWED. No FIXED_AS_PUBLISHED replay contract.
- `db/migrations/002_exam_integrity.sql`: fixed rows require PUBLISHED_FIXED /
  FIXED_AS_PUBLISHED. Bank has no table SELECT on assembly_runs; do not broaden it.
- `src/modules/assembly/candidate-stock.mjs` captures NEW_ONLY; current allocation
  implements personal practice. Fixed request is unsupported in the current path.
- Fixed rows in database foundation/delivery/equivalence fixtures are manually
  seeded placeholders with incomplete/wrong-schema manifests and empty diagnostics.
  They are not genuine fixed solver-run fixtures.
- Successful personal rows retain slotsHash, not a complete diagnostic report;
  manifest contains private history/source/rights/question identifiers. Existing
  proposed staff API table is not wholesale approval for disclosure or new routes.

## Historical reference design deliverable — implemented in B7.1; stored/UI steps remain

Prepare an additive fixed-manifest contract and replay algorithm with explicit
mode/history semantics, immutable identity/hash/seed/limits/error behavior and
compatibility analysis. Prefer a separate version/entry over editing accepted
personal manifests. Do not silently treat FIXED_AS_PUBLISHED as REVIEW_ALLOWED or
use personal manifests as fixed fixtures. Determine whether existing deterministic
selection can be reused without changing old serialized inputs/results; verify the
old golden vectors and new fixed vectors before claiming compatibility.

Then specify a fixed-only audited aggregate diagnostic projection. Required boundary:
unknown/personal IDs404, current BANK_MANAGER only, no question keys/explanations/
source raw material/actor or personal-history IDs. Counts describe a captured run,
not current stock; SEARCH_EXHAUSTED/TIMEOUT never proves shortage. Prefer aggregate
section/quota counts over raw candidate/exclusion IDs. A narrow security-definer
function restricted to fixed rows and exact output is preferable to table-level
SELECT; document ownership/search_path/EXECUTE/audit/transaction and upgrade impact.
This new migration/projection remains unimplemented and unverified.

Decide exact-ID access versus separately scoped fixed-run listing/discovery before
building UI. A demo must create a valid solver-generated fixed synthetic fixture
and expose only its authorized run reference, with no manual database/API setup.
Do not claim the current student demo or canonical dataset preflight is this feature.
Require actual role/BOLA/personal-run exclusion/audit/privacy/replay/browser evidence
and separate independent review. Preserve accepted contracts while designing it;
record applicable architecture disposition before implementation.

Qualified real inventory/review/rights/accessibility remain independent human
inputs; see [handoff requirements](../guides/TRACK_B_CONTENT_HANDOFF.md). No routine
owner engineering approval question is requested by this record. User delegation
continues for bounded Track B work; this gap must be resolved explicitly, not hidden.
