# Populated017 to018 migration rehearsal — OPS-001

2026-10-23, `feat/track-b-data-auth`, base `baa8952`. Accountable implementer:
Codex Sol6.1/High while Luna/XHigh remains usage-limited. Separate read-only
reviewer: `/root/directory_review`, Sol6.1/Medium. No production migrations,
application code, frozen contracts or authorization changed.

## Bounded implementation and observed behavior

Bank/allocation test fixtures accept an optional migration directory, retaining
the normal full-directory default. A new actual PostgreSQL integration test
copies the repository's immutable001–017 migration files into an owned temporary
directory, migrates a private cluster and asserts17 ledger entries and absence of
018's guard function. Synthetic stock passes the existing review/rights/equivalence
fixture workflow, without real human publication claims.

Preparation creates a graded attempt and a queued submitted attempt for studentA,
then an in-progress answered attempt for studentB. Actual services, SQL eligibility,
authorization, solver, final sealing and grading execute against schema017.
The first test failed because current adapters expect018 stock/snapshot fields.
Fixture-only projections now reproduce the two historical adapter behaviors from
commit`8db27a1`: standalone candidates become one-member units; standalone stimulus
is null. Both assert that the018 fields are absent. They transform actual SQL
results rather than fabricating rows or bypassing database checks. After upgrade,
all commands use the unwrapped current pool and service. This is not execution
of a complete historical application binary or a mixed-version deployment claim.

Before applying018, the test snapshots every application base table in `tsa`,
`tsa_private` and `tsa_meta` except the separately tracked migration ledger. Exact
JSON projections include forms/slots/private keys/manifests/answers/history/jobs/
scores/items/releases/receipts/rights/audits and existing identity/Bank records.
Existing roles/memberships/schema and relation ownership/ACLs/RLS policies and
function security metadata are captured independently from PostgreSQL catalogs.

Two actual migration paths then execute:

- A temporary copy of018 with a final failing SELECT returns SQLSTATE42P01. All
  application rows, security metadata and ledger entries remain exact; the three
  replaced function definitions revert, and the new guard function is absent.
- The unchanged repository018 applies alone. All application rows and existing
  privilege metadata remain exact; the previous17 ledger entries are unchanged.
  Replacement definitions actually change and the new guard is not executable
  by exam/Factory roles. Exact migration replay applies nothing.

Current components then replay old create/start/submit keys with identical status
and receipt bodies and the truthful internal replay flag. The original released
review is identical. Queued pre-upgrade work grades100%; the active attempt stays
in progress. A new allocation succeeds with four identities outside all eight
previous studentA assignments, preserving NEW_ONLY. Another worker claim is idle.
This proves populated upgrade compatibility under quiescent command traffic, not
zero-downtime migration under concurrent application load or successful downgrade.

## Corrections and separate review

Initial/intermediate failing runs remain failures: current-adapter/pre018 schema
mismatch, an incorrect expectation that replay flags remain false, and use of a
nonexistent `.result` property on internal service views. Final assertions check
exact receipt bodies plus `replayed:true`, and actual released-review score data;
the vacuous undefined comparison was removed. No passing assertion relies on it.

The independent reviewer found one P2: a worker shutdown failure could skip fixture
shutdown. Cleanup now attempts worker closure, fixture closure and temporary-file
removal independently, then aggregates failures. Final re-review reported no
unresolved findings. Historical source/projection equivalence, rollback/security
evidence and corrected assertions were independently inspected; three-file syntax
and scoped whitespace passed. No independent PostgreSQL execution or file edits
claimed. Engineering review is not qualified human content/rights review.

## Verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux. Coordinator execution:

| Command | Observed result |
|---|---|
| `node --test tests/integration/assembly/populated-upgrade.test.mjs` | Final PASS1 after all corrections |
| `npm run test:bank` / `npm run test:assembly` | PASS94 / PASS50 |
| `npm run test:db:foundation` / `npm run test:student` | PASS37 / PASS34 |
| `npm run test:grading` / `npm run test:results` | PASS23 / PASS6 |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| Typecheck/build/emitted smoke/contract drift/consumer import boundaries | PASS |
| `npm run docs:check` / scoped whitespace | PASS |

Final suites had zero failures/cancellations/skips. Full attempt/recovery/local/
directory/browser suites were not rerun for this test-only fixture change; earlier
evidence remains separate. Hosted CI and qualified manual accessibility not
executed. Existing non-failing module-detection/historical whitespace warnings remain.

Transient logs: `/tmp/tsa-populated-upgrade-focused*.log` and
`/tmp/tsa-upgrade-*.log`. Commands and outcomes here are the durable evidence.

## Continuation and boundaries

G1 accepted, G2/G3 OWNER_ACCEPTED unchanged. Owner AGENTS.md/unrelated research
preserved; no push/merge/deployment/Astra/paid model API/live inference or real
publication. Lawful inventory, qualified human content/rights/accessibility and
owner operational targets remain outstanding. Full OPS/pilot acceptance and
Track A are not established by this rehearsal.

Next concrete integration audit: reconcile remaining student/exam acceptance
requirements against executed evidence and identify an uncovered behavior or
actual defect before adding further synthetic scenarios. Current operational
evidence does not cover hardware/disk failure, capacity at an approved traffic
envelope or qualified human accessibility. Recommended Sol6.1/High while Luna is
unavailable; separate Sol6.1/Medium engineering review for resulting changes.
