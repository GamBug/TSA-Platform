# EXAM-002 atomic submission and durable dispatch

Completed verification 2026-10-22, Asia/Bangkok; started2026-10-21 from `cda1235`
on `feat/track-b-data-auth`. Accountable integrator Codex Sol implemented SQL013,
race/fault tests, migration expectations and records. Actual native Luna/XHigh
implemented the isolated submit service/HTTP adapter and service/HTTP tests.
[Owner acceptance and continuation](../decisions/G2_G3_OWNER_ACCEPTANCE_2026_10_21.md).

## Implemented

- Frozen POST submit route with empty body, trusted candidate/ownership checks,
  CSRF/origin enforcement, bounded JSON and strict Closure/error responses.
  Submit does not consume creation or save budgets; exhausted save limits cannot
  prevent closure. No answer payload or private snapshot enters the response.
- SQL013 exposes one restricted command to `tsa_exam`, with PUBLIC execution
  revoked. It reuses the shared Bank guard, owned attempt/availability locks and
  current hold/reconciliation behavior. No table, G1 schema, error code, solver,
  raw data grant or public contract changed.
- A first timely submission atomically persists SUBMITTED, trigger-selected
  closed_at/EXPLICIT_SUBMIT, one durable exam_grade_attempt job, exact receipt and
  metadata-only audit. Dispatch uses existing SQL ordered grading-input digest,
  attemptId:policyVersion:inputHash dedup key and attempt payload reference.
- If waiting or the state trigger crosses the deadline, the explicit update
  rolls back at a savepoint; expiry and one job then commit with a200 EXPIRED
  closure. No backdating, deadline extension or partial explicit closure.
- Owned exact actor/route/key/hash replay returns the original safe closure.
  A fresh key on an ordinarily closed attempt returns current closure without
  a second job. Current rights/holds suppress old receipts with410. An unstarted
  usable CREATED attempt returns409; cancelled safe terminal closure remains
  visible under the existing contract. Snapshots, assignments and answers stay
  immutable after closure.

The endpoint is exercised over real loopback HTTP. The prototype student server/UI
remains mock-based. Queueing work does not implement a grader, lease/retry runner,
sweep, score or released result. Full EXAM-002 remains IN_PROGRESS.

## Actual verification

Pinned Node24.18.0, npm11.16.0, PostgreSQL18.6. Disposable synthetic databases with
the existing isolated Bank fixture scope; publication controls remain unchanged.
PostgreSQL transactions/lock waits/rollback use real database behavior. Socket and
fixture subprocess commands used permitted execution. No production publication.

| Command | Observed result |
|---|---|
| `npm run test:attempts` | 28/28 PASS, no failures/skips/cancellations |
| Submission race/fault file within that suite | 11/11 PASS |
| `npm run test:assembly` | 23/23 PASS |
| `npm run test:bank` | 94/94 PASS |
| `npm run test:db:foundation` | 34/34 PASS |
| `npm run test:auth` | 5/5 PASS |
| `npm run test:local` | 13/13 PASS |
| `npm run test:b0` | 16/16 PASS |
| `npm test` with permitted fixture subprocesses | 106/106 PASS |
| `npm run test:consumers` | 11/11 PASS |
| Build/typecheck/emitted smoke/contract drift/consumer boundaries | PASS |
| Documentation check | Preserved owner research failures detailed below |

Coverage: saved/unanswered submissions, same-key and distinct-key concurrent
commands, exact replay across service reconstruction and grading-metadata changes,
current closure for a new key, job digest verification, safe closed views,
authorization/BOLA/CSRF/unknown-body/query/JSON boundaries and exhausted save buckets.
The inherited HTTP regression now expects a held submit410 instead of the old
unimplemented-route404. No unsupported route is falsely reported as successful.

Real PostgreSQL race/fault evidence:

- Both save/submit orders observe an actual attempt lock waiter. Save-first is
  included in the grade digest; submit-first rejects the waiting save409.
- Both rights/submit orders observe actual Bank lock waiters. Submit-first
  commits then invalidates under the hold; rights-first denies closure410 with
  no dispatch/receipt. Subsequent receipt replay remains blocked.
- Trigger and lock delays cross real deadlines; both return EXPIRED, preserve
  effective deadline closure and persist exactly one job despite repeated calls.
- Job, audit, receipt and deferred-COMMIT faults roll back all required closure
  records. The attempt stays open; the unchanged key can succeed after repair.
- A direct changed-hash probe returns IDEMPOTENCY_CONFLICT without mutation;
  Factory database role execution is denied42501.

## Separate engineering review

Final fresh separate read-only Sol6.1/Medium review independently ran attempts28/28
and Bank94/94 PASS, no skips, with scoped diff-check PASS. It reviewed SQL013,
service/HTTP, all new submission tests and inherited HTTP expectation update; no
concrete P1/P2 findings remained. Reviewer edited no files. An earlier separate
context observed submission races10/10 and Bank94/94 before the continuation.
Engineering review never supplies qualified human question review or rights evidence.

## Failed/unavailable execution and preservation

An earlier restricted worker contract run reported generic factory-package-v2 and
HTTP-boundary file failures. Coordinator permitted full runs passed106/106 without
contract changes. Documentation checking still fails on the untouched owner
research file's trailing whitespace and four missing temporary screenshot links.
Browser tests NOT RUN (no UI change); hosted CI NOT OBSERVED.

Environment continuation cleared earlier `/tmp` logs/recovery snapshots and live
review contexts. The coordinator reran final suites and requested a fresh separate
review rather than assuming a pending review had finished. Recovery was refreshed
at `/tmp/tsa-submit-continuation-preserve/`; it is transient, not a durable artifact.
Owner UI/README/research and AGENTS.md are excluded from staging. AGENTS SHA256 is
unchanged: `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
Final continuation comparison verified sixteen unrelated tracked diffs and nineteen
owner untracked files byte-identical to the refreshed continuation snapshot.
Shared records containing earlier owner changes remain unstaged. No push/merge,
deployment, Astra, paid model API, live student LLM or frozen G1 changes.

## Gate disposition and next card

**G1 accepted; G2/G3 OWNER_ACCEPTED** by the explicit owner instruction linked above.
Earlier unaccepted statements are historical. Remaining implementation/evidence is
reported independently: real lawful inventory, named qualified human exact-hash
content/equivalence reviews and question-specific publication evidence remain
unsupplied. Existing rights/publication authorization checks still apply. Track A
remains separate and incomplete.

The PostgreSQL path now demonstrates create → start → safe read → acknowledged
answers → submit/expiry → one durable grading job. Next bounded EXAM-002/SCORE-001
card: trusted exam-job claim/reclaim and fencing, frozen digest validation,
practice-binary-v1 exact scoring and atomic immutable score/release. Reuse existing
DB lease-context/consistency constraints; test crashes, stale leases, duplicate
delivery, current holds and exact percentage rounding before result transport or
prototype integration. No speculative Bank or UI work.
Recommended Codex Sol6.1/High for coupled lease/score/rights transactions, isolated
Luna/XHigh when available (Sol fallback), separate Sol6.1/Medium read-only review.
