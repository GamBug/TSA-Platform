# EXAM-001 persisted revisioned answer saves

2026-10-21, Asia/Bangkok. Base `b55afb1`, branch `feat/track-b-data-auth`.
[Owner continuation](../decisions/OPEN_DECISIONS.md#persisted-answer-save-continuation--2026-10-21).
Codex Sol owns SQL012, transaction/race tests and integration. Actual native
Luna/XHigh owns the isolated service/HTTP changes and save/save-HTTP tests.
Separate Sol6.1/Medium reviews read-only. This is engineering evidence using
disposable synthetic fixtures, not qualified human content/rights approval.

## Implemented

- Frozen PUT answer route, strict typed request and safe ACK/conflict response.
  Existing create/start/GET behavior is retained. No G1 schema/API/solver change,
  new table, answer-edit history or student LLM path.
- Owned attempt/slot membership precedes bucket access. Unknown/foreign slots,
  unauthorized roles and forged principals cannot save or touch save buckets.
- Explicit local `saveRate` configuration supplies USER_SAVE and ATTEMPT_SAVE
  capacities/refills; no production defaults are assumed. Integer capacities
  1–1000 and finite refills 0.000001–1000 match persisted precision. Both budgets
  charge atomically before the answer lock in a separately committed transaction.
  Authorized parsed invalid answers and exact replays charge both. Denial consumes
  neither bucket and creates no answer/receipt, with429 and integer Retry-After.
  Create/start remain independent. No submit endpoint exists yet.
- SQL012 exposes only owned command functions to `tsa_exam`; raw answer/private
  snapshot grants are not added. Shared Bank guard precedes attempt/availability
  locks, keeping current rights and dependency holds consistent with writes.
- Validate against the sealed interaction: known single choice or explicit null;
  unique known multiple choices within min/max, with empty clear allowed; exact
  true/false statement keys, each boolean/null. Unknown/extra fields fail closed.
- Untouched revision0 inserts revision1; updates/clears increment monotonically.
  Competing stale revisions return409 with only currentRevision/currentAnswer.
  The latest acknowledged row is retained, without an edit history table.
- Answer, exact actor/route/key/hash receipt and metadata-only audit commit
  together. Acknowledgements use trigger-returned saved_at and revision. Replays
  return the original ACK after ordinary closure without incrementing revision;
  current holds suppress even old answer receipts with410 CONTENT_WITHDRAWN.
- Deadline is checked after locks and again against actual saved_at. A savepoint
  rolls back late answer work before committing EXPIRED and one durable grade
  job. Fresh late writes return409 ATTEMPT_CLOSED; existing acknowledgements remain
  frozen. No deadline extension/backdating or snapshot/history rewrite.

The adapter is demonstrated over loopback HTTP and actual PostgreSQL. It remains
unwired to the prototype server/UI, which still uses mock student examinations.
Positive fixture eligibility uses the existing disposable database/postmaster
scope; no real publication authorization or production approval gate is changed.

## Actual verification

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6. Commands ran locally against disposable
real clusters; network/socket/fixture subprocess execution used the permitted
wrapper. No mocked database substitution for concurrency or rollback evidence.

| Command | Observed result |
|---|---|
| `npm run test:attempts` | 15/15 PASS, no failed/skipped/cancelled tests |
| `node --test tests/integration/attempts/save-races.test.mjs` | 5/5 PASS; repeated within final suite |
| `npm run test:assembly` | Final23/23 PASS with SQL012 |
| `npm run test:bank` | Final94/94 PASS with SQL012 |
| `npm run test:db:foundation` | 34/34 PASS |
| `npm run test:auth` | 5/5 PASS |
| `npm run test:local` | 13/13 PASS |
| `npm run test:b0` | 16/16 PASS |
| `npm test` | 106/106 PASS |
| `npm run test:consumers` | 11/11 PASS |
| Build/typecheck/emitted smoke/contract drift/import boundaries | PASS |
| Documentation check | Preserved owner research issues recorded below |

Save coverage includes same-key concurrent ACKs, distinct-key same-revision
conflict, clear/resume/new service instance, changed-body conflict, MAX_SAFE_INTEGER
revision conflict, all three interaction types and invalid choice/key/count cases,
ownership/CSRF/origin/query/JSON/size boundaries, two independent HTTP handlers and
both limiting buckets with unchanged paired balances on429. Tests use legitimate
fixture ingestion/exact-hash review/singleton workflow, not immutable form edits.

Real transaction fault/race tests demonstrate:

- Delayed answer trigger crosses deadline: no answer/receipt/audit survives,
  EXPIRED plus exactly one grade job commits, both budget charges survive.
- Deferred receipt COMMIT fault: answer/receipt/audit all roll back; budget charge
  remains and the same logical request can succeed on retry.
- Save-first and rights-first orders both observe real PostgreSQL lock waiters.
  Save-first commits its ACK then revocation invalidates delivery; rights-first
  denies the waiting save410 with no persisted answer/receipt.
- Save waiting on the attempt row observes elapsed database time; it cannot use
  transaction-start time or acknowledge after the deadline. Prior exact ACK replays
  after ordinary expiry without changing the frozen answer or duplicating jobs.

## Independent engineering review and repairs

Separate read-only Sol6.1/Medium independently passed complete attempts15/15 and
Bank94/94, and probed update/conflict/clear and MAX_SAFE_INTEGER handling with real
PostgreSQL. No unresolved concrete P1/P2 findings; reviewer edited no files.
After all adversarial additions the reviewer independently reran the save/HTTP
subset5/5 PASS, resolving any fixture-load timing uncertainty.
This review does not supply qualified human question or rights evidence.

Observed failures were repaired before final runs: ambiguous SQL validator parameter
`value` conflicted with JSON expansion output; renamed it. UPSERT fired the existing
revision-one INSERT trigger before conflict resolution, rejecting ordinary updates;
use explicit INSERT or UPDATE under the attempt lock. Review identified a schema-
valid maximum revision incorrectly rejected422; it now returns the appropriate
conflict, with actual overflow failing closed. Typed fixtures initially violated
the frozen MATH-4 profile and used an incorrect replay key; corrected without
changing contracts or immutable snapshots. Initial failing runs are not passes.
An earlier worker contract run under restricted execution reported generic failures
in factory-package-v2 and HTTP-boundary test files; the coordinator's complete
permitted `npm test` run passed106/106. No contract files were changed.

`npm run docs:check` has existing failures in the untouched owner research file:
trailing whitespace plus four links to absent temporary screenshots. Browser tests
NOT RUN (no UI change); hosted CI NOT OBSERVED. Documentation failure is not hidden
by changing unrelated owner research.

## Preservation, gate assessment and next card

Sixteen unrelated tracked diffs and nineteen original untracked files compared
identically with the starting recovery snapshot. AGENTS.md SHA256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Only named implementation/tests/evidence enter the local checkpoint. Coordinated
shared owner records remain unstaged. No push/merge/deploy/Astra/paid API/G1 change.

Bounded EXAM-001 saves engineering and synthetic regression evidence are complete.
Formal integrated EXAM-001/G2/G3 acceptance remains outstanding. G1 accepted;
BANK-002 formal acceptance still requires lawful inventory/current rights, named
distinct qualified human exact-hash content/equivalence reviews and authorized
publication. Track A remains separate and incomplete.

Next executable card: EXAM-002 explicit submission and recovery. Reuse the frozen
empty-body submit/closure contract and SQL grading digest; lock/reconcile the owned
attempt with current holds, atomically freeze closure and enqueue one job, retain
exact receipts and natural terminal replay. Prove real save/submit/expiry/rights
winner orders, failed commit and restart recovery, without implementing an answer
payload on submit. Then add the bounded grading worker/SCORE-001 and result release,
followed by app server/UI integration. No speculative Bank or UI work.
Recommended Codex Sol6.1/High for closure/locking integration, isolated Luna/XHigh
if available (Sol fallback), separate Sol6.1/Medium read-only engineering review.
