# ASSEMBLY-001/002 shared-stimulus allocation — 2026-10-22

Accountable implementer: Codex Sol6.1, branch `feat/track-b-data-auth`, base
`8db27a1`. Owner authorized continued local engineering; frozen G1 contracts,
existing publication controls and immutable historical records remain binding.
Luna previously reached its actual usage limit; Sol implemented directly with a
separate Sol6.1/Medium read-only engineering reviewer. No Astra, paid model API,
live student inference, push, merge, deployment or real publication.

## Implemented scope

Additive [migration018](../../db/migrations/018_bundle_allocation.sql) replaces
existing private stock/snapshot/commit functions without editing applied migrations,
adding tables, public routes, contracts or runtime grants. Existing immutable
stimulus/bundle/member tables and the frozen assembly/1 multi-member solver are
reused. Historical internal `standalone` function names remain for compatibility.

Stock capture emits complete immutable ordered units. Unmaterialized, gapped,
mismatched-stimulus, partially ineligible, internally equivalent or conflicting
bundles contribute no partial members. Current exact-hash review, rights (including
passage provenance and validity horizon), quarantine and canonical-group rules
remain mandatory. Current question pointers cannot silently replace old bundle
members. Cross-unit conflicts map stable question relations to unit IDs; no
self-conflict edges are emitted. Pool overflow fails as SEARCH_EXHAUSTED rather
than reporting shortage from a truncated pool. Member exposure remains captured
ranking input, never a global reservation.

Final allocation compares complete captured/current unit identity, section and
ordered membership, not only the flattened candidates. SQL independently rejects
partial, reordered or interleaved chosen units and counts each question toward
quotas and source caps. It persists bundle IDs alongside unchanged public/private
snapshot hashes and the frozen form projection. Public snapshots contain the exact
immutable stimulus identity/content; existing form integrity guards reject forged
passages even when the caller recomputes snapshot and form hashes.

Bundle insertion uses the existing exclusive publication advisory lock and Bank
revision row. Allocations retain per-student locks and a shared publication guard;
independent students are not serialized by a new global allocation lock. Rights
and bundle metadata changes before commit invalidate capture/replan. A metadata
writer behind an allocation commits only after its immutable manifest is sealed.
A later passage-rights restriction cancels the CREATED attempt using existing
rights holds without changing snapshots or assignment history. Existing replay,
H1, authorization, error precedence and all-or-none persistence remain intact.

## Executed verification

Pinned Node24.18.0/npm11.16.0; private disposable actual PostgreSQL18.6 clusters.
No mocked database substitutes for transaction, rollback or lock evidence.

| Executed command | Observed result |
|---|---|
| `npm run test:assembly` | PASS 49/49, zero failures/skips |
| `npm run test:bank` | PASS 94/94, zero failures/skips |
| `npm run test:db:foundation` | PASS 34/34, zero failures/skips |
| `npm run test:auth` | PASS 5/5, zero failures/skips |
| `npm run test:attempts` | PASS 28/28, zero failures/skips |
| `npm run test:grading` | PASS 22/22, zero failures/skips |
| `npm run test:recovery` | PASS 16/16, zero failures/skips |
| `npm run test:results` | PASS 6/6, zero failures/skips |
| `npm run test:directory` | PASS 9/9, zero failures/skips |
| `npm run test:student` | PASS 12/12, zero failures/skips |
| `npm run test:local` | PASS 15/15, zero failures/skips |
| `npm run test:scoring` | PASS 5/5, zero failures/skips |
| `npm run test:b0` | PASS 31/31, zero failures/skips |
| `node --test tests/integration/assembly/bundles.test.mjs` | PASS26/26 focused actual PG |
| `npm test`, `npm run test:consumers`, `npm run test:built` | PASS106/106,11/11 and emitted smoke |
| `npm run build`, `npm run typecheck` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS generated drift and consumer/import boundaries |
| `npm run test:student:browser`, `npm run test:student:domains` | PASS actual Chrome155/PG; domains78 inspected responses |
| Four scoped `node --check` commands | PASS |
| `npm run docs:check`, staged `git diff --check` | PASS; documentation links have zero errors, preserved historical whitespace warning |

The new26 cases exercise exact ordered shared snapshots; missing/gapped/quarantined/
rights-blocked units; whole-unit history and current equivalence; internal/cross-unit
enemies; tampered unit identity/order; split/reordered/interleaved selection;
second-bundle persistence rollback; passage-rights and bundle-metadata changes
before commit and actual waiting writers after allocation SQL but before COMMIT;
wrong stimulus; correction without member replacement; duplicate canonical groups;
UNKNOWN passage rights; per-question source/skill caps; and rehashed forged passage
rollback. Existing23 assembly scenarios continue proving H1, different-student
concurrency, current restrictions, receipts, deterministic solver replay and
persistence-fault rollback. Existing student and browser journeys remain standalone
fixtures; this checkpoint does not claim shared-reading browser acceptance.

Initial failures were corrected rather than counted as passes: PL/pgSQL bundle alias
ambiguity; fixture pg-array versus JSON serialization; object key-order comparison;
unsupported ENEMY adjudication API use (replaced with explicitly isolated owner SQL
fixture, no API expansion); invalid empty allowedUses; Uint8Array rather than text
canonical bytes in forged-plan tests; and three migration-ledger expectations
missing018. Final commands above ran after the relevant corrections.

## Independent engineering review

Actual separate native `/root/directory_review`, Codex Sol6.1/Medium, read-only:
reviewed SQL018, both adapters, fixture and all bundle tests. Reported no concrete
P1/P2 findings. Independently executed four JavaScript syntax checks and scoped
whitespace checks: PASS. It did not execute PostgreSQL or browser tests; those are
coordinator evidence. Review is engineering review, never qualified human question,
rights or publication approval. Final migration-expectation follow-up: confirmed the three diffs only append018, preserve assertions, and the corrected negative-test fixtures remain valid; no P1/P2, syntax/whitespace PASS.

## Preservation and remaining work

Owner files remain unstaged and byte-preserved:

- `AGENTS.md`: `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
- `docs/research/VN_EXAMS_UI_GAP_ANALYSIS.md`: `6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba`.

Original fixtures use existing postmaster-bound synthetic publication scope and
real separated author/reviewer workflow. They create no retained eligible stock
and establish no real rights attestation or human review. Bundle hashes remain
opaque existing metadata; no new public hash convention is asserted.

Bounded bundle-aware NEW_ONLY backend engineering is implemented; full
ASSEMBLY-001/002 acceptance remains open. REVIEW_ALLOWED/fixed creation remains
unavailable; no fallback or publication authorization was added. G1 accepted and
G2/G3 OWNER_ACCEPTED unchanged. Lawful inventory, named qualified content/rights
reviewers, manual native zoom/screen-reader acceptance and Track A remain distinct
outstanding work. No retained approved shared-reading exam is demonstrated.

Next executable card: original isolated **READING2 shared-passage** fixture with
correct READING taxonomy and immutable ALL_OR_NONE bundle, exercised through frozen
HTTP/client transport and actual browser: create/start, exact same passage on both
ordered slots, save/reload, submit, leased grading, released result/review, history,
and passage-rights denial without rewriting sealed content. Reuse existing runtime,
worker and renderer; no UI reconstruction, new API or publication capability.
Recommended implementer Sol6.1/High while Luna is usage-limited; proposed separate
Sol6.1/Medium read-only reviewer for integration/security. Human content approval
and manual accessibility acceptance remain separate prerequisites.
