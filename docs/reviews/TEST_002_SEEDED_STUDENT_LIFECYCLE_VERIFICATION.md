# Seeded student lifecycle model — TEST-002 groundwork

2026-10-23, `feat/track-b-data-auth`, base `dd5afd1`. Accountable implementer:
Codex Sol6.1; last isolated Luna attempt hit its usage limit, current capacity
not freshly verified. Separate read-only reviewer: `/root/directory_review`,
Sol6.1/Medium. No application, schema, frozen contract or authorization changed.

## Implemented scope

`npm run test:critical:student` runs four pinned seeded PostgreSQL model cases and
one pure failure-diagnostics test. Existing original mixed-content fixture and
postmaster-bound synthetic publication gates remain unchanged. Each started case
successfully saves all three MVP response types in seeded order; response choices,
subsequent action ordering and target slots are generated reproducibly.

| Action seed | Fixed progression family | Executed actions | Final state |
|---|---|---|---|
| 79225 | CREATED → running → explicit submit → grade | 80 | GRADED |
| 149120 | CREATED → running → actual10sec expiry → grade | 80 | GRADED |
| 201749 | CREATED → running → current source-rights revocation | 65 | INVALIDATED |
| 160130 | CREATED → current source-rights revocation | 32 | CANCELLED |

The257 actions compose ordinary reads, result access, active-create conflicts/
post-closure NEW_ONLY shortage, valid saves, clearing, stale revisions, old ACK
replay, changed-body key conflicts, foreign reads/saves, early submit rejection,
start replay and idle worker checks. Impossible replay/stale actions are filtered
until their prerequisites exist; unknown actions fail rather than count as no-ops.
Progress transitions are deliberately phase-bounded to guarantee coverage, not
arbitrarily generated across every possible transition or concurrent schedule.

The independent in-memory model tracks expected state and latest answer values,
revisions and correctness category. Correct/wrong/clear response semantics derive
from the explicit fixture specification, not the product scorer. Expected score
counts and percentages are computed independently for the four-slot fixture.
After every generated action, PostgreSQL must match modeled state/answers and
active/job/score/release counts; exact sealed form/manifest/private key graph and
assignment history remain unchanged. Closed writes cannot mutate answers; replay
cannot rewind a later revision. Source revocation uses the real Bank command and
access reconciliation rather than direct attempt-state edits.

Raw PostgreSQL text timestamps preserve creation/start-before/start/deadline and
closure precision across actions. Independent SQL checks require600sec creation
TTL, exact configured10/600sec running duration, expiry closed_at=deadline_at and
explicit submission closure within the observed database command-time bounds.
Public receipt comparisons remain separate. No persisted clocks are backdated
or rewritten; expiry waits for actual PostgreSQL time.

Generated writes call real service methods/transactions. Reads/results traverse
the frozen Request/Response boundary and strict response schemas, with private
field scans. Active delivered slot IDs and answer values/revisions must match
sealed order/model; other successful states deliver no slots/answers. Foreign
requests fail safely. These cases do not exercise mutation HTTP/cookie/CSRF
transport or replace the separately verified HTTP/browser suites.

## Corrections and independent review

First execution passed three cases and failed the never-started revocation
oracle. Existing frozen policy permits safe CANCELLED metadata200/result409;
active INVALIDATED content returns410. The model was corrected from that policy
and existing integration evidence, preserving zero-content assertions. No product
behavior was weakened to satisfy the test.

Reviewer identified two evidence weaknesses: public timestamp formatting did not
prove exact microsecond preservation/independent expiry closure, and rethrown
assertion diffs could print synthetic private values despite a sanitized trace.
Raw timestamp/SQL policy checks now replace those weak claims. Failure output
allowlists action/state/logical slot, classification/SQLSTATE and source-line
coordinates; it throws a fresh error without original actual/expected/cause data.
A sentinel test checks unexpected trace fields, private assertion values and
causes are omitted. Cleanup attempts both stages and aggregates fixed stage-only
errors rather than exposing original exceptions. Reviewer also requested an
explicit EXPIRED response-state assertion, which is included.

The action seed reproduces logical action/value-category generation; fixture UUIDs
and solver selection seeds remain independently generated. This is not a claim
of byte-identical fixture identities or exhaustive/concurrent model checking.

## Actual verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux. Coordinator results:

| Command | Observed result |
|---|---|
| `npm run test:critical:student` | Final PASS5: four real-PG cases/257 actions plus one pure diagnostic test |
| `npm run test:attempts` / `npm run test:grading` | PASS28 / PASS23 |
| `npm run test:recovery` / `npm run test:results` | PASS16 / PASS6 |
| `npm run test:assembly` | PASS50 |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| Typecheck/build/emitted smoke/contract drift/consumer import boundaries | PASS |
| `npm run docs:check` / scoped whitespace | PASS |

Final counted suites had zero failures/cancellations/skips. First3pass/1fail model
run is retained as a corrected oracle failure, not counted as passing evidence.

Logs: `/tmp/tsa-critical-student-*.log`, `/tmp/tsa-critical-{attempts,grading,recovery,results,assembly,contracts,consumers,static}.log`.
Commands and observations here are durable evidence; temporary logs may disappear.
Bank/foundation/student-runtime/local/directory/browser suites were not rerun for
this test-only addition; their previous evidence remains separate. Hosted CI and
qualified manual accessibility not executed. Existing non-failing warnings remain.

Separate reviewer independently ran the pure diagnostics test1/1 and syntax/
whitespace checks; inspected the model, oracle/corrections and delivery checks.
Final review reported no unresolved findings after the clock, failure-output and
explicit-expiry-response corrections.
No independent PostgreSQL model execution or file edits claimed. Engineering
review does not constitute qualified human content, rights or accessibility review.

## Status and next work

This establishes bounded TEST-002 model groundwork, not complete TEST-002 or
EXAM/SCORE/WEB/OPS/pilot acceptance. G1 accepted/G2/G3 OWNER_ACCEPTED unchanged.
Lawful inventory, qualified human review/accessibility, operational targets and
Track A remain outstanding. Operator regrading still requires a frozen route/
authorization decision; no capability or public contract is invented here.

Next executable integration task: carry the generated mutation sequences through
the existing loopback HTTP/auth/CSRF adapters, retaining the independent model and
failure privacy, without duplicating solver/publication logic or adding routes.
Recommended Sol6.1/High for integration/oracle work, isolated Luna/XHigh if available
with Sol fallback, separate Sol6.1/Medium read-only engineering review.

Owner AGENTS.md/unrelated research preserved and unstaged; no push/merge/deploy,
Astra/paid model APIs/live student inference/unauthorized publication. Broad goal
remains active; this is one required verification layer, not final completion.
