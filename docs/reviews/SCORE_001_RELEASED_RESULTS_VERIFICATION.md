# Owner-only released result transport

2026-10-22, base `86edda7`, branch `feat/track-b-data-auth`. Accountable Codex Sol
owns SQL015, result-access races and integration. Actual native Luna/XHigh owns
the attempt-service wiring and service/HTTP result tests. Separate native
Sol6.1/Medium reviewed read-only. Owner sustained continuation and G2/G3 acceptance
remain recorded in [decisions](../decisions/OPEN_DECISIONS.md).

## Implemented

SQL015 adds an owned access projection and released-review command, using existing
Bank/attempt locks and immutable score/release tables. A current candidate owns
the attempt; the entire attempt is GRADED; the active release references exactly
its latest score and policy; current source/rights/withdrawal guards still permit
delivery. Only then does the private join load frozen question/answer/explanation
snapshots. No raw-table grants or worker authority are added to student credentials.

The existing HTTP adapter already routes GET result through the frozen response
boundary, so no duplicate HTTP adapter or new public contract was added. The
service now supplies release-aware guards and the released loader in the same
transaction/client. A fresh final SQL guard includes latest score/release identity
and discards a loaded payload if access changes. Private data is not cached beyond
the active callback. Ordinary attempt views remain empty after closure/grading.

Results use exactly the frozen AuthorizedReleasedReviewSchema, including
UNOFFICIAL_PRACTICE, exact percentage/one-domain totals, immutable per-slot earned
values, persisted responses, correct answers and explanations. Confidential
provenance, review notes, Bank versions, manifests and allocation diagnostics are
excluded. Pre-grade409, foreign/missing404, unauthenticated401, unauthorized-role403
and invalidated/held410 withhold keys. Valid release revocation follows existing
invalidation/consistency rules; tests do not fabricate a GRADED-without-release
state or disable immutable constraints.

## Actual verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6. Real disposable synthetic fixtures,
existing Bank review scope, actual PostgreSQL transactions and loopback HTTP.
No human approval or lawful production inventory is fabricated.

| Command | Observed result |
|---|---|
| `npm run test:results` | 6/6 PASS; no failures/skips/cancellations |
| `npm run test:grading` | 21/21 PASS |
| `npm run test:attempts` | 28/28 PASS |
| `npm run test:bank` | 94/94 PASS |
| `npm run test:assembly` | 23/23 PASS |
| Foundation/auth/local/prototype regressions | 34/5/13/16 PASS |
| Build/typecheck/contract106/consumer11/drift/import checks | PASS |
| Documentation check | Existing owner research failures retained |

Service and HTTP tests execute create/start/save/submit → trusted leased grade
→ owned released GET; also CREATED/active/submitted/expired readiness, ordinary
view privacy, owner/staff/missing IDs, service reconstruction, unofficial frozen
result and current rights denial. Existing worker-role isolation remains covered.

Four focused access/race cases verify:

- A disposable owner session invalidates/revokes release after loading in the
  same SQL transaction; the fresh final guard drops the private payload503 and
  commits the valid restriction. Product runtime gains no mutation/role authority.
- Both rights/read winner orders observe actual PostgreSQL lock waiters. A read
  authorized before a later hold may complete; a prior hold blocks the private
  load. Subsequent reads return410, and immutable scores remain unchanged.
- Direct SQL commands return null for a foreign attempt even after its release.

## Independent review and initial failures

Separate read-only Sol6.1/Medium independently passed final results6/6 and scoped
diff-check, with no open concrete P1/P2 findings. Review covered owner/active score/
release binding, current rights, final guard and projection privacy; reviewer
edited no files. Grading/attempts were not repeated in that final review pass;
coordinator reran them separately. Engineering review is not human content review.

Initial test defects were fixed before final passing evidence: a service receipt
was read at the wrong object level and worker metadata was asserted incompletely;
HTTP command headers lacked Idempotency-Key; teardown closed PostgreSQL before an
open worker pool. Fixtures now close pools before the database. No G1/schema
relaxation or disabled immutability trigger was used. Initial failures are recorded
as failures, not passing evidence.

AGENTS.md retains SHA256
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Owner UI/README/research/shared records remain unstaged; transient recovery lives
at `/tmp/tsa-results-preserve/`. No push/merge/deploy/Astra/paid API/live student
LLM/production publication. Browser NOT RUN; hosted CI NOT OBSERVED. Documentation
check still reports untouched owner research whitespace/four missing temporary
screenshots.

## Next executable integration

The real PostgreSQL/HTTP engineering path now reaches an owner-only released
result. The existing prototype UI still uses mock routes. Next compose the trusted
student API/auth and separate grading worker into a loopback local runtime using
existing server integration hooks; preserve publication gates and explicit local
budgets. Add real catalog/history transport and bounded expiry reconciliation
where required by the frozen contracts, then connect the student journey without
UI reconstruction. Operator provisioning, sweep/operational recovery, lawful stock
and named qualified per-question reviewers remain explicit limits. G1/G2/G3 retain
owner acceptance; Track A remains separate and incomplete.
