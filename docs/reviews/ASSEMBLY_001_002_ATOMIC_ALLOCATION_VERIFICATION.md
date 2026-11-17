# ASSEMBLY-001/002 atomic allocation verification — 2026-10-21

**IMPLEMENTED / VERIFIED: bounded standalone PERSONALIZED_PRACTICE + NEW_ONLY
backend allocation.** Start `feat/track-b-data-auth` / `c0b42b5`, with existing
owner AGENTS/UI/research/shared-record modifications. Accountable engineer: Codex
Sol. [Owner authorization](../decisions/OPEN_DECISIONS.md#atomic-allocation-engineering-authorization--2026-10-21)
permits isolated synthetic implementation and actual PostgreSQL verification.
No frozen G1 contracts, dependencies, Bank functionality, UI or research changed.
No push, merge, deployment, Astra, paid model API or real publication occurred.

## Implementation

[Allocation service](../../src/modules/assembly/allocation.mjs) provides the
internal `createAllocationService({examPool,identityService,limits?}).create(principal,key,input)`.
It validates the existing strict CreateAttempt schema and Idempotency-Key, obtains
identity from the trusted candidate principal, and hashes the parsed wire body
before applying omitted defaults. A student cannot supply a seed, user ID, pool,
quota relaxation or history override. Seeds are generated server-side. Search and
validation reuse the unchanged frozen assembly/1 solver.

[SQL010](../../db/migrations/010_atomic_allocation.sql) adds restricted commands,
not raw allocation-table grants. Candidate authorization is repeated in SQL;
Factory, Bank, web and identity roles cannot invoke creation/sealing. Existing
uniqueness, immutable-row, snapshot/source and lifecycle-retention guards remain.
[Snapshot builder](../../src/modules/assembly/snapshot-builder.mjs) constructs
separate canonical public/private bytes and hashes. The complete form digest binds
mode, owner, blueprint, policies, sections, ordered version identities and both
public/private snapshot hashes. SQL independently checks that projection, current
stock, exact version/hash, canonical groups/conflicts, quotas/source caps, history,
rights and snapshot consistency before sealing.

One commit contains the validated immutable manifest, assembly run, personal sealed
form/sections/public and private slots, availability, owned CREATED attempt,
first-assignment identities/history, incremented allocation revision, immutable
success receipt and audit. The existing insert trigger calculates the exact
`min(created_at + 600 seconds, admission_end)` deadline using fresh database time;
the receipt uses its RETURNING value. Publication permissions are never inferred
from a successful allocation. The ordinary publication path remains disabled;
positive eligibility fixtures require the existing explicitly initialized isolated
DB/postmaster-bound fixture scope.

Lock order is persistent student allocation row → shared advisory publication
lock `(1414742321,1)` and Bank revision row → active attempt → availability/offering.
Different students share the publication guard and do not reserve global stock.
Search holds neither allocation nor publication locks. Final commit rechecks
receipt first, then global H1, revisions, offering and the complete current stock
(including time-based rights expiry). Exposure changes from another student's
sealing remain captured ranking inputs, not allocation conflicts or stock caps.
Stale plans are discarded before classifying shortage. Three total attempts bound
replanning; exhaustion returns existing 409 CONCURRENT_MODIFICATION.

A matching retained key/body replays the original 201 receipt even after closure;
changed valid bodies, including changed modes or omitted versus explicit defaults,
conflict before allocation. Global H1 precedes unavailable implementation paths:
valid active attempts yield 409 CONCURRENT_ATTEMPT_EXISTS across domains/modes.
REVIEW_ALLOWED/PUBLISHED_FIXED allocation itself remains unavailable with 503,
never a fallback. Simple proven count/group deficits are projected safely; coupled
shortages may have empty deficits. Eligible/unseen proof failures retain 422;
unknown bounded-search exhaustion retains 503. Before-open offering is 409
FORM_NOT_OPEN; disabled/closed is 410 FORM_UNAVAILABLE; unknown is 404 NOT_FOUND.
Raw PostgreSQL diagnostics are replaced by documented safe errors. Receipts contain
no keys, correct answers, reviewer notes, manifests, source metadata or histories.

Stale active reconciliation commits separately before attempting new allocation.
Elapsed CREATED is cancelled with START_TTL_EXPIRED; unavailable content uses the
existing rights/security guard; elapsed IN_PROGRESS becomes EXPIRED with one
transactional grading job. The internal ordered `grading-input/sql-jsonb-1` digest
uses frozen slot/key/policy/answer inputs; future grading must reuse
`tsa.exam_grading_input_hash`, preserving the existing
`attemptId:policyVersion:inputHash` job dedup convention. No grader or score release
is claimed. Ordinary offering edits never recalculate an existing start deadline.

## Actual PostgreSQL evidence

Node **24.18.0**, npm **11.16.0**, disposable PostgreSQL **18.6**. Synthetic fixtures
exercise mechanics; they are not qualified human review or production inventory.

| Requirement | Executed evidence |
|---|---|
| A successful allocation; I history | 201 receipt; all run/form/slot/secret/attempt/history/revision/receipt/audit writes; four assigned stable identities |
| B eligible shortage | Three current eligible identities for MATH4 → 422, safe deficit1, no allocation |
| C unseen shortage | Cancelled four-question assignment remains historical → 422 unseen shortage, no replacement writes |
| D search exhaustion | Zero node budget → 503 SEARCH_EXHAUSTED, no infeasibility claim or allocation |
| E same student | Both winner orders, actual observed PostgreSQL lock wait; one success/one owned active conflict; same-key two callers replay one receipt |
| F different students | Both successful allocation SQL commands reach a barrier before either transaction commits; identical four-question stock can serve both |
| G/H/O rollback | Faults at run, form, section, slot, private secret, availability, attempt, history, revision, receipt, audit and deferred COMMIT; no partial run/form/attempt/history/receipt or revision advance |
| J cancellation | Committed first history stays retained; subsequent NEW_ONLY allocation is disjoint |
| K equivalence/correction | Corrected stable identity stays excluded; late group merge excludes its newly equivalent identity; original snapshots unchanged |
| L restrictions | Rights/quarantine before final commit discard stale plans; quarantine blocks behind an uncommitted allocation then withdraws/cancels it, retaining snapshots/history |
| M immutability | Stored manifest hash and frozen solver slot-order replay; snapshot/form digest checks; run/form/slot UPDATEs rejected; tampered form projection rejected |
| N authorization | Trusted candidate only; strict unknown fields rejected; role/context SQL denials; foreign receipt hidden; public outputs contain no private allocation data |
| Lifecycle and admission | TTL cleanup commits before unavailable outcome; cross-mode active precedence and stale cleanup; elapsed attempt queues exactly one job before unseen shortage; capture/attempt-insert clock races map correctly and roll back |

| Executed command | Observed final result |
|---|---|
| `npm run test:assembly` | PASS **23/23**, zero failures/skips |
| `npm run test:bank` | PASS **94/94**, zero failures/skips |
| `npm run test:db:foundation` | PASS **34/34** |
| `npm run test:auth` | PASS **5/5** |
| `npm run test:local` | PASS **13/13** |
| `npm run test:b0` | PASS **16/16**, preserved owner UI |
| `npm test` | PASS **106/106** |
| `npm run test:consumers` | PASS **11/11** |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS generated artifact drift and student/import boundaries |
| `npm run docs:check`, scoped/staged `git diff --check` | PASS 54 Markdown files/303 links, no errors; preserved historical input-whitespace warning |

Focused allocation/clock tests also ran before full regression. Fault injection
uses temporary owner-created triggers in disposable databases, including deferred
commit failure; connection wrappers coordinate barriers around real SQL, not fake
transaction results. Coordination rows with revision0 may persist after failed
allocation preflight; they assign no questions. Separately committed lifecycle
cleanup is intentionally retained when the subsequent new request fails.

Initial SQL CASE parsing, stale fixture assertions, a test receipt count that
included staff receipts and a transient parallel fixture-login failure were
repaired. Fixture logins are sequential; allocation races remain genuinely
concurrent. Earlier separate review caught hash binding, stale admission/error
mapping, shortage projection and cross-mode H1 precedence issues; final repairs
were rerun. Restricted Node test wrappers failed startup in one independent run;
permitted actual PostgreSQL runs are the passing evidence. Missing tests are not
counted as passes. Browser NOT RUN (no UI changes); hosted CI NOT OBSERVED.

## Independent engineering review and preservation

Actual native Luna/XHigh implemented the allocation service, primary PG tests and
fixtures with disjoint ownership. Sol integrated SQL010, snapshot builder, stock
boundary fixes, lifecycle/admission tests and records. A genuinely separate native
Sol6.1/Medium read-only final reviewer inspected all changed implementation/test
files and independently ran **assembly23/23 and Bank94/94**. It reproduced the
cross-mode H1 precedence defect, then verified its repair and final 23-test rerun.
No unresolved concrete P1/P2 findings; reviewer edited no files. This is engineering
review only, not qualified human question review.

Owner AGENTS.md remains SHA256
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Resumed preservation comparison PASS: 16 unrelated owner tracked diffs and all
19 original owner untracked file contents unchanged. Owner UI, README, research
and prior shared-record work remain untouched and unstaged. Shared task/state/decision/handoff updates are coordinated additions,
excluded from the narrow code/evidence checkpoint. Original transient preservation
copies disappeared across session continuation; refreshed recovery copies are in
`/tmp/tsa-allocation-preserve/` and are not durable backups. No destructive
reset/clean/overwrite occurred. Implementing file reservations are released.

## Limits, gates and next exact task

Bounded atomic standalone NEW_ONLY engineering and synthetic evidence are complete.
Full ASSEMBLY-001/002 acceptance remains IN_PROGRESS: applicable shared-stimulus
bundles are rejected explicitly, and repeat/fixed creation paths are unavailable.
Authorized shorter-profile activation, persistent failed-search staff diagnostics,
public/student HTTP wiring and creation-rate enforcement are not implemented by
this internal command. These limits cannot be represented as a full accepted
student-delivery service. Existing one-domain MATH4/READING2/SCIENCE4 rules apply
at commit; this is unofficial practice, not official scoring or affiliation.

Lawful question inventory, real current-rights attestation, distinct qualified
human exact-hash content/equivalence review and publication authorization remain
outstanding. G1 ACCEPTED; BANK-002 formal acceptance and G2/G3 remain unaccepted.
Track A dataset/model research is separate and has not been completed here.

**Next executable integration card — EXAM-001 persisted start and safe delivery:**
connect this allocation command to the existing creation transport and implement
owned first-start plus GET attempt view from sealed snapshots through frozen
student DTOs. Enforce stored start TTL, shared Bank → attempt lock order, current
holds/rights, one-domain clock, no content before start/after closure, and no
keys/explanations. Reuse the existing Request/Response boundary for safe delivery;
prove BOLA, exact deadline, repeated-start replay, restart persistence and rights
revocation races with synthetic PG fixtures. Configure/test the separate creation
rate budget before exposing the create route. Then add revisioned saved answers,
closure/submission, grading and released result retrieval in their existing cards.

Recommended implementer: Codex Sol6.1/High for the coupled database/time/authorization
adapter, with isolated Luna/XHigh fixtures when available and direct Sol fallback.
Independent reviewer: separate Sol6.1/Medium security context. This recommendation
is not another dispatch. No UI redesign or live LLM calls belong in this path.
Real PostgreSQL allocation is now demonstrable by tests; a complete student exam
remains mock-only until delivery, saves, submission and scoring are connected.
