# BANK-002 equivalence merge verification — 2026-10-21

IMPLEMENTED / VERIFIED bounded engineering under the owner's “Next” continuation
of [workflow authorization](../decisions/OPEN_DECISIONS.md#bank-002-equivalence-continuation--2026-10-21).
BANK-002 remains IN_PROGRESS; G1 ACCEPTED, G2/G3 unaccepted. Synthetic engineering
and agent review are not qualified human content review or lawful inventory.

## Ownership and preservation

Started `feat/track-b-data-auth` / `416b621` with existing owner/UI/shared-record
changes. Accountable coordinator: Codex Sol. Actual native `tsa_builder` fixed
Luna/XHigh implemented only the new equivalence service and direct test; coordinator
owned migration007, private incident helper, preservation/upgrade tests and records.
Actual separate native `tsa_reviewer` fixed Sol6.1/Medium reviewed read-only and
independently ran42 scoped PostgreSQL tests. All implementation reservations released.
No Astra, paid API, dependency install, push/merge/deploy, UI/research/frozen G1
contract changes or real publication.

Recovery copy: transient `/tmp/tsa-equivalence-preserve/` contains the starting
binary patch, untracked tar and status. Comparison verified16 original unrelated
tracked diffs and all19 original untracked file contents unchanged. AGENTS SHA:
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Shared records receive coordinated task updates and remain separate from the
narrow code/evidence checkpoint; no unrelated owner modifications are staged.

## Implemented behavior

[Equivalence service](../../src/modules/bank/equivalence.mjs) provides internal
`createEquivalenceService({bankPool,identityService}).adjudicate(principal,key,input)`.
Input pins left/right `{versionId,contentHash,expectedRevision}`, exact canonical
bigint-string `expectedBankRevision`, kind EXACT/NEAR_DUPLICATE, decision
CONFIRMED/DISMISSED and reason. This is an internal command, not a new frozen
HTTP/API/DTO contract. No public route or Factory export was added.

Trusted REVIEWER authorization precedes private target lookup and receipt replay,
then repeats inside the existing exclusive Bank transaction. Reviewer must be
independent of both authors and retained Factory operators. Both immutable graphs,
normalized SQL payloads, hashes and workflow revisions are checked. Targets must
be IN_REVIEW/APPROVED and different stable identities; unsupported/stale/forged
inputs fail without new evidence or receipts. Idempotency replays the historical
receipt, not an assertion that a formerly canonical group remains canonical now.

Detector evidence/version remain unchanged. An OPEN relationship becomes a final
CONFIRMED/DISMISSED independent exact-hash decision with separate reason/actor
metadata. New relationships start OPEN first. Final decisions cannot be flipped;
dismissal does not create or merge groups or satisfy equivalence publication
review. Other OPEN flags remain unresolved and continue blocking publication.

Confirmation creates missing singleton groups, chooses the smaller canonical UUID,
records any prior impact, retires the other root with an alias, and moves **all**
members in one transaction. No split/unmerge/reset command exists. Existing aliases
remain immutable and can form a retained chain when a later merge retires the old
root; current membership always moves to the active root. One adjudication advances
Bank eligibility revision exactly once and both target workflow revisions once,
appending exact-version audits. It changes no question content, approval review or
eligible pointer; already-approved targets retain their existing pointer.

[Migration007](../../db/migrations/007_bank_equivalence.sql) restricts updates to
merge/resolution columns, enforces one-way aliases/canonical memberships/final
resolution evidence, and defers the source-empty check until commit so partial
member moves roll back. A second actor-scoped receipt policy covers only this
private command. Publication recognizes exact-version CONFIRMED audits, including
post-quarantine freshness; singleton evidence cannot transfer between versions.
Existing fixture-scope-only approval remains unchanged.

[Incident helper](../../src/modules/bank/equivalence-incidents.mjs) captures
aggregate impact **before** membership moves. Immutable private incidents contain
actor/group references and counts of affected sealed forms, forms containing both
prior groups, and students with prior history in both groups. No student, attempt,
form or answer identifiers leave the command response. A narrow SQL probe exposes
only counts to Bank, with no broad Bank grant on student history/form content.
A deferred constraint binds incident insertion to its exact atomic merge. If no
prior form/history is affected, no incident is fabricated. Counts describe late
classification impact, not a claim that prior unknown equivalence was prevented.

## Executed verification

2026-10-21; pinned Node24.18.0/npm11.16.0, installed PostgreSQL18.6. Permitted runs
use disposable private Unix sockets and loopback HTTP; no external service.

| Command | Observed result |
|---|---|
| `npm run test:bank` | PASS80/80, zero failures/skips (previous61 + equivalence13 + preservation6) |
| `npm run test:db:foundation` | PASS34/34 |
| `npm run test:auth` | PASS5/5 |
| `npm run test:local` | PASS13/13 |
| `npm run test:b0` | PASS16/16 |
| `npm run typecheck`, `npm run build`, `npm run test:built` | PASS |
| `npm test`, `npm run test:consumers` | PASS106 and11 nested tests |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS; frozen artifacts, dependency graph and public import boundary unchanged |
| `git diff --check`, explicit new-file syntax checks | PASS |
| `npm run docs:check`, `git diff --cached --check` | PASS52 Markdown files/279 links; staged whitespace PASS |

Actual independent read-only Sol command:
`node --test tests/integration/bank/equivalence.test.mjs tests/integration/bank/equivalence-history.test.mjs tests/integration/bank/publication.test.mjs tests/integration/bank/publication-boundary.test.mjs`
→ **PASS42/42**, zero failures/skips, exit0; syntax/scoped diff PASS. Reviewer touched
no files and reported no unresolved P1/P2 findings. Reviewer concerns repaired:
trusted-role check before private lookup, new duplicate findings starting OPEN,
and meaningful exclusion-expansion/collision/late-rollback verification.

Key observed evidence:

- Two-student history fixture: one student's left+right prior assignments produce
  incident overlap1; another student with only left assignment (including a
  never-started CREATED attempt) excludes left before merge and both after it.
  Cancelled assignments remain preserved. This proves current-membership join
  behavior, not an implemented NEW_ONLY allocation service.
- Stored question versions, assembly manifests, sealed forms/public/private
  snapshots, attempts and first-assignment histories compare unchanged after
  merge. One pre-existing two-item form produces collision count1 without rewrite.
- Actual PostgreSQL Lock waits prove both CONFIRMED/DISMISSED contender winner
  orders; stale losers cannot resolve or advance revision. New-version/self/
  operator/forged/role-revoked/unknown-target negatives, unrelated OPEN flags and
  alias chains pass.
- Fault injection after relation/group/member writes rolls back all state. A
  separate late failure observes the incident inside the losing transaction,
  then verifies incident, groups, relation, workflow, bank revision, audit,
  receipt and historical rows all return to the prior committed snapshot.
- SQL rejects alias reset/cycles, member deletion/split, retired source members,
  detector evidence rewrites, finalized decision changes and direct finalized
  INSERT. Other service roles cannot read incidents or call the impact probe;
  Bank still cannot SELECT student history or form slots.
- Populated006→007 preserves groups/evidence and creates no synthetic incident;
  earlier upgrade assertions now include the additive migration filename.

Intermediate root test failures were fixture setup errors: cancellation used an
unsupported reason; the second blueprint reused a unique name; a first unique-name
repair mixed UUID/text parameter inference (42P08). Fixtures now use actual form
withdrawal + allowed FORM_WITHDRAWN cancellation and distinct bound UUID/name
parameters. None required changing the existing lifecycle contract. Worker broad
restricted checks encountered known subprocess/socket wrappers and untracked owner
research whitespace; permitted coordinator runs above passed actual nested tests.
Git-backed docs/new-record links are checked separately. Browser NOT RUN (no UI
change); hosted CI NOT OBSERVED; no clean restricted-CI or production evidence.

The independent reviewer additionally clarified that the prior workflow's final
38/38 run completed before007 existed, using the three-file command recorded in
[workflow evidence](BANK_002_WORKFLOW_VERIFICATION.md), exit0 (3608ms). That late
report closes the earlier quota-limited verification gap; it does not erase the
historical failure or create qualified human content review.

## Remaining work and next executable task

Next: durable selected-form rights/quarantine holds and audited fan-out, with
real-PostgreSQL races and preserved snapshots/history; then asset sanitization.
Use synthetic isolated fixtures now. Existing hold-required/image cases still
fail closed. Production assembly/delivery consumers must later honor effective
holds; none is claimed by metadata persistence or this merge mechanism.
Recommended implementer: Codex Luna/XHigh for bounded work if available, otherwise
direct Sol; separate Sol/Medium for critical engineering review. This recommendation
does not dispatch another worker. No paid API/Astra or real publication authorized.

Named human author/rights attestor, distinct qualified reviewer, lawful stock,
exact-hash content review and explicit real-publication authorization remain
required for acceptance. BANK-002/G2/G3 are not declared accepted. Student delivery
remains mock-only. The MVP is closer through executable, audited equivalence
controls and real history/snapshot preservation evidence.
