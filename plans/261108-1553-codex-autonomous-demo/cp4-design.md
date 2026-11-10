# CP4 interaction design

Status: implemented and verified; see the [completion report](../reports/claude-261110-1215-cp4.md).
Baseline: `df6fdfd356e7d11b09e7d2391fee90e73bab9d55`.
Owner authorized task-relevant implementation/test reads in this session on 2026-11-09.
Owner cleared the missing-target blocker by approving derived private DRAFTs on 2026-11-09;
see [decision evidence](../../docs/decisions/OPEN_DECISIONS.md#cp4-derived-matching-drafts--2026-11-09).

Outcome: carry Reading cloze and matching items through DRAFT authoring/import,
allocation, save/retry/clear/expiry, binary grading and released review.
Keep question/1, question/2, their hashes, existing routes and applied migrations unchanged.
No approval, publication, network access, paid APIs or remote Git operations.

Introduce question/3 with separate interaction/key/response unions and
practice-binary-v3 dispatch following question/2. Add explicit version-aware delivery,
blueprint, snapshot and route support wherever the numeric pattern requires it;
never widen a frozen v1/v2 consumer to accept v3 data implicitly.
Use blueprint/4 and /api/v4 for independent practice; CP2 owns blueprint/3 and /api/v3.

CLOZE has ordered fields with unique stable IDs, plain-text labels and a bounded
maximum input length. Responses map only known field IDs to strings or null;
missing/null/blank fields are incomplete. Keys privately map every field ID to
one or more accepted variants. Pin normalization to Unicode NFC, outer trim and
an explicit case-sensitive policy; preserve internal whitespace and Vietnamese
diacritics. Apply the same policy in contracts, worker and trusted SQL scoring.
Casing alternatives require explicit private variants; no locale-dependent lowercase step.

MATCHING has ordered rows and targets with unique stable IDs and plain-text labels.
Each row chooses exactly one target. An explicit bounded per-target reuse limit
controls cardinality; partial maps are valid saves but incomplete, and unknown IDs
or excess reuse are invalid. Private keys cover every row and obey the same limits.
Render labeled native selects with a clear option and complete keyboard operation.

Both types score one point only when every field/row is correct. Preserve exact
saved response strings for idempotent retries, and keep accepted variants and keys
private until the established release boundary. Native input/select events bypass
global shortcuts; progress uses completeness rather than response presence.

Migration 031 is additive and tested against populated pre-upgrade data. Use only
disposable local database harnesses; back up any retained database before changes.
Import supported deferred Reading entries as DRAFTs with source provenance and
review flags; never guess clipped text, unresolved mappings or answer variants.
For matching captures missing choices, derive unique targets from captured correct texts,
order them independently of row order, and mark the pool and reuse rule as an adaptation.
Owner approved 78 explicitly keyed DRAFTs across ten shared passages; retain 22 keyless
true/false captures in a deferred report rather than fabricating keys or dropping passage text.
Acceptance: focused lifecycle/privacy and populated-upgrade tests, Chromium and
Firefox journeys, all card exit commands, and no open P0/P1 review findings.

Design review: tsa_reviewer reported no concrete P0/P1/P2 findings on 2026-11-09.
Its allowed reads excluded current integration consumers and tests; configured
model routing was not verified. Those limits prevent treating this as exit review.
