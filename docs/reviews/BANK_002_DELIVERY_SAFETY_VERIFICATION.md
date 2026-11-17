# Bank delivery safety and assembly stock verification — 2026-10-21

Accountable engineer: Codex Sol, starting `feat/track-b-data-auth` at `d9812b3`.
[Owner scope](../decisions/OPEN_DECISIONS.md#minimum-bank-safety-and-student-backend-transition--2026-10-21)
authorizes bounded Bank safety and synthetic student-backend groundwork. No
production publication, gate acceptance, protected inventory, live model calls,
frozen G1 change, dependency installation, push, merge or deployment occurred.

## Implemented and supported

SQL008 records immutable exact-question/hash/profile checks and complete source
reference dependencies. Current DISPLAY rights and ancestor quarantine are checked
at delivery; current approval/pointer/equivalence and origin-specific uses are
checked for selection. A historical approval alone cannot bypass restrictions.
Missing safety evidence on legacy versions fails closed; no automatic backfill
pretends those versions were validated.

Manager rights withdrawal or version quarantine commits immutable form holds,
withdraws affected availability, clears affected eligible pointers and audits the
command. Parent quarantine also removes descendant selection. Old form slots,
keys, explanations, manifests, answers, scores and assignment history are retained.
Restoration never unwithdraws old forms, restores releases or restores cleared
pointers. Renewal checks the prior decision before replacement, preserving a
previous expiry as a durable hold.

Publication uses frozen advisory guard `(1414742321,1)` plus the existing Bank
revision row. Attempts are not locked under the exclusive publication guard.
Postcommit retryable fanout locks pending hold rows and attempts in stable order:
CREATED becomes CANCELLED (RIGHTS_BLOCKED/FORM_WITHDRAWN); IN_PROGRESS, SUBMITTED,
EXPIRED and GRADED become INVALIDATED; releases are revoked. Completion evidence
is append-only. Pending holds immediately deny access even when fanout fails.
`drainDeliveryHolds` retries pending work in a separate authorized Bank transaction,
including on command receipt replay; it is also an internal recovery entry point.
A scheduled background runner is not implemented. Pending work survives process
restart and cannot authorize disclosure while waiting for replay/recovery.

The owned-attempt SQL guard takes shared publication guard before the attempt
lock, hides foreign IDs, and lazily cancels/invalidates inaccessible attempts and
revokes releases, including natural rights expiry. This is a restriction guard,
not an implemented student content/result endpoint or release authorization.
Future start/read/save/submit/result consumers must invoke it and their own
operation, clock, release and ownership checks in the same guarded transaction.

The nonmutating `text-math-table/1` validator covers all three interaction types,
rendered options/statements/explanations and parent/stimulus closures. It rejects
markup, executable TeX/loaders, malformed references, control characters and
unsupported external resources. Normal Vietnamese, inequalities and supported
TeX remain intact. Technical limits include 256 KiB canonical questions, 2,000
reference nodes, 8 MiB reference closure and bounded nesting/work. All images and
asset-bearing graphs are unsupported and rejected before review/publication;
no media decoder, remote fetching or asset-serving grant was introduced. Private
raw provenance/source evidence is retained rather than interpreted as markup.

## Student-backend groundwork

SQL009 and the internal `captureStandaloneManifest` adapter now read approved
current standalone stock from real PostgreSQL and feed the frozen `assembly/1`
solver. They capture exact hashes, current canonical groups, current source rights
versions, confirmed conflicts, exposure analytics and the authenticated student's
retained history/revision. Taxonomy codes are projected to SKILL UUIDs for the
frozen manifest without modifying question content. NEW_ONLY excludes prior
stable identities/current groups; another student's history does not consume stock.

The reader requires an enabled, open one-domain offering and covers the entire
inherited offering availability window plus test duration with rights, following
the assembly specification's conservative sealing rule. Applicable shared-stimulus
stock raises unsupported-feature rather than yielding a false partial-pool shortage.
No public endpoint exposes pools/manifests/rights details. Ordinary web/Bank/Factory/
identity roles cannot execute the private stock function. The adapter creates no
form, attempt, history, receipt or publication; its captured revisions are inputs
for future final revalidation, never an allocation authorization.

## Executed evidence

Pinned Node 24.18.0, npm 11.16.0, local disposable PostgreSQL 18.6. Test inventory
and fixtures are synthetic and isolated; normal runtime/production publication
remains disabled and positive fixture approval requires the existing explicit
DB/postmaster-bound scope.

| Command | Observed result |
|---|---|
| `npm run test:bank` | PASS 94/94, zero failures/skips, final state-matrix version |
| `npm run test:assembly` | PASS 1/1 real-PG integration scenario |
| `npm run test:db:foundation` | PASS 34/34 |
| `npm run test:auth` | PASS 5/5 |
| `npm run test:local` | PASS 13/13 |
| `npm run test:b0` | PASS 16/16; owner UI untouched |
| `npm test` | PASS 106/106 frozen contract tests |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run test:consumers` | PASS 11/11 |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS generated drift and import boundaries |
| `npm run docs:check`, scoped/staged `git diff --check` | PASS 53 Markdown files/292 links, no errors; preserved historical input-whitespace warning |

Bank evidence includes source-only/ancestor dependencies, rejection before
publication, all required attempt states, retained answers/history/scores/snapshots,
release revocation, expiry/restoration, pending-hold recovery, role denials and
both observed PostgreSQL lock winner orders for review/revocation and delivery.
Assembly evidence includes draft/pending exclusion, positive frozen solver input,
UUID skill quota, deterministic capture, NEW_ONLY shortage versus another student,
rights-horizon exclusion, no allocation writes and SQL role/context denials.

Initial root assembly runs found SQL parameter ambiguity and code/UUID mismatch;
these were repaired and rerun. Early Bank runs exposed obsolete rights/image/
migration expectations and advisory-wait probes; those were corrected. Luna's
initial test fixtures also had join/revision/wait-observer errors; final scoped
5/5 and full 94/94 replace those failures. Restricted Node wrappers failed emitted
consumers and sometimes reported whole files instead of test cases; permitted
runs above are the actual evidence. No failed or unavailable run is counted PASS.
Browser NOT RUN (no UI changes); hosted CI, deployed auth, real content review,
production publication and complete PostgreSQL student exam NOT VERIFIED.

Independent engineering review: actual separate native Sol6.1/Medium read-only
review PASS 38/38, zero failures/skips, exit 0, PostgreSQL 18.6, about 15.3 seconds:
`node --test tests/integration/bank/content-safety.test.mjs tests/integration/bank/delivery-safety.test.mjs tests/integration/assembly/candidate-stock.test.mjs tests/integration/bank/publication.test.mjs tests/integration/bank/publication-boundary.test.mjs`.
The reviewer changed no files, independently checked syntax/diff and reported no
unresolved concrete P1/P2 findings.
Actual native Luna/XHigh implemented the content validator and Bank safety tests;
Sol reviewed/integrated them, implemented SQL/services/assembly adapter and owned
shared records. The separate native Sol6.1/Medium read-only review identified the
expiry-restoration, taxonomy projection and lazy cancellation attribution repairs.
Engineering agent review never constitutes qualified human content review.

Preservation check PASS: 16 original unrelated tracked diffs and all 19 original
untracked file contents unchanged. AGENTS SHA256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Recovery patch/archive/status: transient `/tmp/tsa-bank-final-preserve/`.
Shared owner-modified records stay unstaged; the checkpoint includes only named
engineering/test/evidence files. All writer reservations are released at handoff.

## Gate assessment and next execution

1. Bounded BANK-002 engineering requirements for the supported text/math/table
   profile are implemented; unsupported media remains rejected. No additional
   nonessential Bank feature is authorized by this completion.
2. Synthetic regression evidence is complete for this bounded change, subject to
   the separately recorded final independent review above (PASS).
3. Named lawful source/asset inventory, real rights attestation and distinct
   qualified human exact-hash content/clarity/alternate-answer/equivalence review
   remain outstanding. Fixture identities supply none of that evidence.
4. Formal BANK-002 and G2 acceptance remain outstanding; G1 accepted, G2/G3
   unaccepted. Student examination delivery remains mock-only.

Next executable card: **ASSEMBLY-001/002 — atomic personalized allocation for
standalone NEW_ONLY stock**. Implement the persistent user allocation lock and H1
reconciliation; retained creation receipt replay; final shared advisory/Bank-row
revision, offering, rights and history revalidation; and atomic manifest + personal
form/public/private snapshots + CREATED attempt + first-history/revision + receipt.
Use the frozen solver and 600-second start deadline. Prove two-connection winner
orders, no-repeat after corrected versions/current equivalence, both shortage
classes versus search exhaustion, rollback injection, stale manifest replan and
rights withdrawal at commit. Shared-stimulus capture/bundle completeness is still
required before claiming full ASSEMBLY-001 acceptance; do not silently discard it.

Recommended implementer: Codex Sol6.1/High for the coupled allocation transaction;
Luna/XHigh may take isolated fixtures if available, with Sol fallback. Independent
reviewer: separate Sol6.1/Medium security/concurrency context. This recommendation
is not a new delegation or approval. Synthetic-only engineering is authorized;
real production stock/publication remains separately gated. After allocation,
connect EXAM-001 persisted start/read/save, EXAM-002 submit/expiry and SCORE-001
binary scoring/release through the existing student-safe contracts. No live LLM
belongs in that path. Real PostgreSQL-backed student delivery is closer through
executable Bank safety and stock-to-solver integration, but is not yet demonstrable.
