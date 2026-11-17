# BANK-002 controlled workflow engineering — 2026-10-20–21

Status: IMPLEMENTED / VERIFIED bounded synthetic engineering. BANK-002 full
acceptance and G2/G3 are NOT ACCEPTED. Human content review and lawful production
inventory are not established. The owner explicitly authorized engineering before
those human prerequisites in the
[workflow decision](../decisions/OPEN_DECISIONS.md#bank-002-workflow-engineering-authorization--2026-10-20).

## Scope, ownership and preservation

Started on `feat/track-b-data-auth` / `c1b4fa7`. Existing owner AGENTS.md, UI,
research and prior shared-record edits remain outside implementation ownership.
A pre-edit binary patch, untracked tar and status inventory are in transient
`/tmp/tsa-bank002-preserve/`; these are recovery copies, not clean-clone evidence.
AGENTS SHA-256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.

Accountable coordinator: Codex Sol. Actual native `tsa_builder` dispatch fixes
Luna/XHigh and implemented only the new publication service and its direct test.
The coordinator owns migration006, gate helpers, HTTP/source integration,
additional boundary/import tests and shared records. Actual separate native
`tsa_reviewer` fixes Sol6.1/Medium and reviewed the diff read-only, running scoped
PostgreSQL tests. No review is attributed to a human subject expert.
No Astra, paid API, dependency install, protected-content copying, push, merge,
deployment, reference-UI reconstruction or frozen G1 contract change.

## Implemented behavior

The existing schema already had immutable question versions, review/validation
rows, workflow revisions, duplicate groups, eligible pointers and append-only
audit events. The existing staff API defined submission, review and quarantine.
The implementation reuses them:

- [publication service](../../src/modules/bank/publication.mjs): AUTHOR submits
  its exact immutable version for review after deterministic validation. REVIEWER
  appends APPROVE or REJECT against the exact content hash and expected workflow
  revision; responsible author and imported-package operator cannot review it.
  Approval atomically appends review/audit, changes workflow/eligible pointer and
  increments Bank revision. Rejection preserves evidence and never selects the
  rejected version. Revision uses the existing new-DRAFT-version command; approval
  and equivalence evidence cannot transfer to that version.
- Internal independent singleton confirmation records exact-version adjudication
  and canonical singleton membership. Existing multi-identity or retired groups,
  OPEN flags, and confirmed duplicate families that have not been merged block
  approval. New versions and post-quarantine review require fresh exact-version
  evidence; no automated equivalence confirmation occurs.
- BANK_MANAGER quarantine clears the selected target pointer and records reason,
  revision and audit. Reapproval requires a new submission/validation and fresh
  equivalence review. Rejected/retired versions do not return to review; content
  correction creates a new immutable version.
- [publication gates](../../src/modules/bank/publication-gates.mjs) verify frozen
  question schema, canonical DAG/hash/fingerprint and normalized SQL agreement;
  FAIL/INCONCLUSIVE validator evidence does not silently pass. Approval requires
  deterministic PASS since quarantine, complete current dependency rights,
  source/attestor evidence, validity dates, configured synthetic VN coverage,
  required DISPLAY/GENERATE/ADAPT uses, resolved flags and canonical membership.
  Parent/stimulus/source dependencies are included; unresolved mappings fail closed.
- [HTTP adapter](../../src/http/bank.mjs) implements only existing documented
  submit-review/reviews/quarantine routes and request/response shapes, preserving
  CSRF/origin enforcement, no-store responses and safe error projection. Private
  singleton adjudication and fixture configuration have no public route. No new
  DTO/OpenAPI/export/dependency or student path was introduced.
- [source service](../../src/modules/sources/service.mjs) now permits an explicit
  manager rights attestation for an imported SQL source container: if needed, it
  snapshots the actual immutable SQL source/version separately in the local
  reference namespace. It never rewrites the original Factory graph or promotes
  package rights assertions into current decisions. Existing receipt/revision,
  rights dependency hold and authorization checks still apply.

All commands use the existing Bank state lock and actor-scoped idempotency.
Current reviewer authorization is checked before receipt lookup and again before
mutation; failed operations leave no success receipt, review, pointer or audit.
Audit events/reviews remain append-only. Replaying a formerly successful command
returns its historical receipt, not a fresh approval or current-eligibility claim.

## Test-only eligibility boundary and minimal SQL

[Migration006](../../db/migrations/006_bank_review_workflow.sql) adds no duplicate
review bank or parallel workflow. One empty private fixture-scope table is needed
to distinguish an explicitly initialized disposable test lifecycle from the
persistent local staff database. Only the migration owner can initialize it;
application identities cannot. The UUID is bound to database OID and postmaster
startup and must match an explicit internal service option. No environment flag,
HTTP field or package claim initializes it. Runtime SQL guards additionally deny
APPROVED/eligible-pointer writes outside an active fixture scope and demand an
exact independent approval. Production process construction is refused.

The migration adds actor-bound receipt scopes for existing commands and narrow
metadata probes for quarantine/equivalence/selected-form dependency checks. Those
probes avoid granting Bank access to student form content/history or unrelated
audits. Populated005→006 preservation is tested. Existing owner maintenance access
is retained; owner credentials must never serve requests. The test marker is not
real-publication authorization and becomes invalid across a database restart.

The normal same-app runtime constructs this service with no fixture scope, so it
can submit/reject/quarantine drafts but cannot approve/publish synthetic stock,
even if all declared rubric/rights fields say yes. Positive eligibility tests run
only against disposable PostgreSQL data and cannot seed the persistent staff Bank.
A future real-publication identity/authorization path requires separate approved
work; no production switch is implemented here.

## Executed verification

2026-10-20–21, Node24.18.0/npm11.16.0/PostgreSQL18.6. Disposable private Unix sockets
and loopback HTTP used permitted execution; no external service contacted.

| Command | Observed result |
|---|---|
| `npm run test:bank` | PASS61/61, zero failures/skips: existing/manual10, Factory15, preflight13, publication15, HTTP/guard/upgrade/rights-race8 |
| `npm run test:db:foundation` | PASS34/34 |
| `npm run test:auth` | PASS5/5 |
| `npm run test:local` | PASS13/13 |
| `npm run test:b0` | PASS16/16 |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm test`, `npm run test:consumers` | PASS106 and11 nested tests |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS; G1 artifacts and public import boundary unchanged |
| `npm run docs:check`, `git diff --cached --check` | PASS51 Markdown files/268 links; staged whitespace PASS |
| Prior-work preservation comparison | PASS16 original unrelated tracked diffs and19 original untracked file contents unchanged; AGENTS hash unchanged |

Actual independent Sol review ran
`node --test tests/integration/bank/publication.test.mjs tests/integration/bank/publication-boundary.test.mjs tests/integration/bank/factory-import.test.mjs`:
PASS37/37, zero failures/skips. Syntax and scoped whitespace checks PASS.
Two initial P2 findings were fixed: HTTP invalid-state conflicts had incorrectly
become422, and receipt replay had skipped current reviewer authorization. Tests
cover both, including role-revoked replay. Coordinator additionally tightened
unsupported-role rejection before private-version lookup, with known/unknown
candidate targets tested. Independent re-review of that hardening passed23/23.
The later independent38-test attempt passed37 and failed the unsupported AUGMENTED
fixture before rights gates. Reviewer independently identified the frozen
GENERATED-only constraint and inspected the independent-rights policy change with
no code finding. Coordinator corrected the test to assert transport rejection;
final full Bank61/61 passed. The final independent rerun was UNAVAILABLE because
the reviewer hit its subscription usage limit; it was not substituted with a paid
API or another model. Do not claim a final independent38/38 pass. This limitation
concerns the final test-fixture correction; actual critical code review and the
prior passing independent runs remain recorded evidence.

Observed concurrency uses real PostgreSQL Lock waits, both winner orders:
review versus quarantine cannot both commit under the same expected revision;
approval first makes rights withdrawal fail with RIGHTS_CHANGE_REQUIRES_HOLD,
while withdrawal first causes approval RIGHTS_BLOCKED. Atomic rollback preserves
consistent workflow, rights, review and eligible-pointer state. No durable rights
revocation/selected-form fan-out is claimed by that fail-closed response.

Negatives include self/operator approval, stale hashes/revisions, forged and
unauthorized principals, client-supplied approver fields, missing CSRF, false
rubrics, rejected/retired transitions, missing/unknown/expired/empty rights evidence,
wrong territory/missing uses, missing validation/equivalence, multi-identity groups,
image-bearing closure, and normalized content differing from the retained graph.
Actual Factory imports preserve original graphs/opaque IDs while separate current
rights are registered and exact transport replay still succeeds after review.

Intermediate test failures were fixture expectations, repaired without weakening
gates: an audit assertion initially counted the existing draft audit; migration
results include the `.sql` filename; a retained migration list needed additive006;
a repeated image fixture encountered duplicate flags before its intended earlier
asset gate, so the asset-denial test no longer requests unrelated singleton
adjudication. A proposed AUGMENTED fixture was rejected by the frozen Factory
contract, which accepts GENERATED only; it is retained as a rejection regression,
without changing that contract or claiming an augmented runtime path. Independent
rights uses remain separate: GENERATED requires DISPLAY/GENERATE; the defensive
AUGMENTED branch additionally requires ADAPT but has no supported transport here.
Final passing tests do not hide those earlier results.
Browser tests NOT RUN: no UI change. Hosted CI NOT OBSERVED. No clean restricted
socket-runner or production/human-publication verification is claimed.

## Remaining criteria and next executable engineering

Image sanitization, monotonic equivalence merge/late-equivalence incident workflow,
and durable rights/quarantine holds for sealed forms remain unimplemented. Asset
approval is refused; quarantine with sealed-form dependencies is refused pending
holds; current rights edits with delivery dependencies retain their existing
fail-closed behavior. There is no real student-service integration yet to honor
such holds. These are explicit engineering gaps, not missing-human excuses.

Next executable task: extend BANK-002 with monotonic equivalence adjudication/
merge and immutable-history incident evidence, then durable selected-form holds
and rights/quarantine fan-out with real-PG races. Synthetic isolated fixtures can
exercise both now; do not wait for real inventory. Recommend Codex Luna/XHigh for
bounded implementation if available, otherwise direct Sol, with separate Sol
critical engineering review. Recommendation alone does not dispatch a new worker.

Real human author/rights attestor and a distinct qualified reviewer must later
supply lawful inventory/rights evidence and exact-version content judgments,
including Vietnamese clarity/alternate-answer review. Agent review and synthetic
role assertions cannot satisfy them. BANK-002 acceptance still requires all
original criteria, rights/equivalence/hold evidence and human process; G2/G3 and
student delivery remain unchanged. The project is closer to an integrated MVP:
persisted drafts now have executable transactional review commands and protected
eligibility simulation, with normal-runtime publication explicitly disabled.
