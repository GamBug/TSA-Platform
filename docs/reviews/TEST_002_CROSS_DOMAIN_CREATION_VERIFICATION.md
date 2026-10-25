# TEST-002 H.1 — same-user creation across current domain profiles

2026-10-25, base4dd3fca, feat/track-b-data-auth. AUTOMATED_PASS /
INDEPENDENTLY_REVIEWED in this bounded scope, clean reproduction pending. Root
accountable integration/shared records; actual native Luna/XHigh one-file writer;
actual separate Sol6.1/Medium read-only reviewer. Owner AGENTS.md/untracked research
preserved/excluded. No runtime/schema/role/API/UI changes, no new test harness,
paid API/push/merge/deployment. Full H cross-mode acceptance remains incomplete.

## Gap and test

Original actual barriers covered same-user/same-profile distinct-key requests and
separate same-key replay. Sequential active-attempt checks rejected other modes,
but did not prove simultaneous distinct current domain profiles. H.1 adds one
top-level test with two subcases to existing assembly/allocation.test.mjs, preserving
all original test cases and the separate same-key case.

Use existing original Reading bundle fixture, four original synthetic Math questions
and a pinned Math blueprint. Within each subcase, one principal concurrently creates
MATH and READING under different keys. First force MATH to win for studentA, then
READING for studentB; each race independently uses the same authenticated user.
Both requests reach the existing commit barrier; a real advisory-lock wait proves
contention before winner release. No sleep-only scheduling or mocked success.

Assert winner201/current domain/pins and loser409CONCURRENT_ATTEMPT_EXISTS with the
same owned attempt ID. Exactly one user form/attempt/run (including failure rows)/
receipt and the domain's exact stable-question history. Compare blueprint/hash/
manifest/slot-version pins, section count/duration, PERSONALIZED_PRACTICE/NEW_ONLY,
no started clock/deadline before start, exact microsecond startBefore, and no losing
receipt/history/form/run. Synthetic publication is fixture machinery, not qualified
human review. Current student modes and timing rules do not change.

## Verification and repairs

Node24.18/npm11.16/PostgreSQL18.6/Zod4.6.7, ignored `.local/test002-h1-*` logs.

- Writer targeted new parent/subcases: PASS3; full allocation file: PASS18;
  syntax/whitespace PASS at its initial source snapshot.
- Root initial full `npm run test:assembly`: PASS53 before harness review repairs.
- Independent initial actual target PASS3, but review found two P2s: unbounded
  barrier failure could hang verification/cleanup; existing count helper omitted
  failed runs, so a stray losing failure row could evade the assertion.
- Root added explicit total user run count1 (all outcomes), exact UTC6 receipt
  comparison, and abortable existing helper. Abort releases all JS gates, requests
  settle before teardown; new H.1 barrier timeout7.5seconds and SQL statement timeout
  10seconds are opt-in, original helper callers retain their default behavior.
- Intermediate root/reviewer actual target failed at the bounded barrier: injecting
  `SELECT set_config` immediately after BEGIN prevents later isolation setup.
  Controlled disposable PG probe reproduced SQLSTATE25001; utility
  `SET LOCAL statement_timeout=10000` preserves isolation setup and passes.
  Root corrected utility setup and includes safe settled request status/codes in
  failures. This was a test-only repair, not an observed application defect.
- Root final targeted command: PASS3; final
  `node --test tests/integration/assembly/allocation.test.mjs`: PASS18.
  Final `npm run test:assembly`: PASS53 after all helper/oracle repairs.
- Independent final actual targeted command PASS3, syntax/whitespace PASS, no
  remaining findings. Controlled read-only in-memory helper probes PASS2: missing
  second arrival and rejected winner SQL both settle rejected after abort. Probe
  method: extract interceptPool/lockedCommitPool, supply fake clients, start one
  commit request or two with winner SQL throwing, abort(Error), require all request
  promises settle rejected within100ms and winnerQuery resolves. No files written.

Final reviewed SHA256:
`617fa384449d57e93f68427ccb4028953ce4193241334a5abdd54ce72e4ff5a3`.
Configured SQL timeout source is reviewed; no live slow-SQL timeout/failure injection
claim. Independent full allocation/broader assembly suite NOT_EXECUTED. No browser
rerun required for a test-only change; existing current browser evidence remains
scoped to the unchanged application at3cd49be.

This proves current independent MATH/READING one-active-attempt isolation. It does
not implement fixed/review allocation or prove their simultaneous cross-mode path;
full TEST-002 and Technical MVP remain distinct. Clean checkpoint reproduction next.

Final separate documentation review: no findings in the current acceptance map,
H.1/G evidence, TEST_STRATEGY navigation and guide pointer. Linked counts/attribution/
limits checked, scoped whitespace PASS. This was source/evidence review only;
clean reproductions were not independently repeated.
