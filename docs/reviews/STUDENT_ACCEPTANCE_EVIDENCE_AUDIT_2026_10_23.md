# Student acceptance evidence audit and failed-grading journey

2026-10-23, branch `feat/track-b-data-auth`, base `6f7e980`. Accountable implementer
Codex Sol6.1; last isolated Luna implementation attempt hit its usage limit, so
Sol executes directly. Separate actual read-only Sol6.1/Medium reviewer:
`/root/directory_review`. This is a scoped engineering audit, not formal acceptance.

## Requirements versus current evidence

| Requirement | Evidence and disposition |
|---|---|
| Controlled eligible stock, exact hash/rights/equivalence, immutable allocation | VERIFIED synthetic engineering: Bank94/assembly50 and [populated upgrade](OPS_001_POPULATED_018_UPGRADE_VERIFICATION.md). Lawful question-specific inventory and independent qualified human decisions remain separate prerequisites. |
| Owned delivery, revisioned saves, no timer reset, exact replay/privacy | VERIFIED scoped real HTTP/PG and browser evidence in [persistent integration](WEB_004_PERSISTENT_STUDENT_VERIFICATION.md), [reservation recovery](WEB_004_RESERVATION_RECOVERY_VERIFICATION.md) and [two-tab race](WEB_004_ALLOCATION_RACE_VERIFICATION.md). Not an all-platform/manual accessibility claim. |
| One-domain results/shared reading/NEW_ONLY exhaustion | VERIFIED synthetic [three-domain](WEB_001_THREE_DOMAIN_VERIFICATION.md), [shared-reading](WEB_001_SHARED_READING_VERIFICATION.md) and [successive NEW_ONLY](WEB_004_NEW_ONLY_SUCCESSION_VERIFICATION.md) journeys. No official score equivalence or real-inventory claim. |
| Save/submit/deadline races, unacknowledged saves, offline timing disclosure | VERIFIED bounded PostgreSQL races and [pending429 expiry](WEB_004_PENDING_SAVE_EXPIRY_VERIFICATION.md)/[pre-start disclosure](WEB_004_PRESTART_TIMING_VERIFICATION.md). Not every network/disk failure or timed accommodation. |
| Worker lease/reclaim/fencing, crash/restore/current rights | VERIFIED bounded [OS process](EXAM_OS_PROCESS_RECOVERY_VERIFICATION.md), [rights outage](EXAM_OUTAGE_RIGHTS_VERIFICATION.md), [logical restore](OPS_001_LOGICAL_RESTORE_VERIFICATION.md), [immediate recovery](EXAM_IMMEDIATE_POSTGRES_RECOVERY_VERIFICATION.md) and [live downtime](EXAM_LIVE_POSTMASTER_OUTAGE_VERIFICATION.md). Hardware/PITR/RPO/RTO/approved load remain unverified. |
| Failed grading exposes no invented score/release and can be revisited | Backend coverage existed; independent audit found real student HTTP/browser coverage missing. Implemented and verified below. |
| Operator retry using frozen grading input | REQUIRES_DECISION: engine spec mentions operator retry; current frozen API/capability set does not establish an operator-regrade command or role authority. Student status checking is a read, not authorization to regrade. No new route/role invented. |
| Generated legal/illegal lifecycle sequences and critical release harness | REQUIRES_VERIFICATION: existing named transactional/race scenarios are not evidence of the generated state-machine suite required by TEST_STRATEGY/TEST-002. Next bounded engineering task can add reproducible action sequences without changing contracts or publication controls. |
| Qualified accessibility, retained lawful inventory and production/pilot operations | Outstanding human/owner evidence: [manual accessibility packet](../quality/STUDENT_MANUAL_ACCESSIBILITY_CHECK.md), lawful content/rights decisions and approved operational envelope. Automated checks and owner G2/G3 acceptance do not fabricate these. Track A remains separate/incomplete. |

This audit inspected current task/spec criteria and implementation/tests; it did
not rerun every historical check. Existing evidence retains its original scope.
Full EXAM/SCORE/WEB/OPS/pilot completion is not established by absence of another
static defect. G1 accepted and G2/G3 OWNER_ACCEPTED remain unchanged.

## Executed missing failure-state journey

New explicit `npm run test:student:grade-failure` preserves ordinary runner modes
and uses original isolated READING2 stock, real PostgreSQL, existing HTTP/client
and Chromium. Both answers are acknowledged before submit; normal local poller
is temporarily isolated while a trusted worker drives real failure commands:

1. `TEMPORARILY_UNAVAILABLE` commits FAILED_RETRYABLE. An immediate claim is idle
   under the real retry delay; browser polling shows the actual retryable state.
2. After actual eligibility, the same job is reclaimed with a higher fence.
   An explicitly synthetic `INVALID_GRADING_INPUT` report commits FAILED_FINAL.
   Correct fixture inputs are never corrupted or claimed to be actually invalid.
3. Normal polling is enabled again. The terminal browser screen truthfully says
   no score exists. Automatic student status polling stops during the observed
   2.2-second interval. Explicit status checking completes one GET and no mutation;
   job/attempt remain identical. This does not implement operator regrading.
4. Actual owner GET is closed/FAILED_FINAL with no slots/answers; result409,
   fresh-document terminal reload and foreign GET/result404 pass. Exact sealed
   manifest/form/keys/answers/history/clocks/digest remain unchanged.

There are zero score runs/items/releases/grading-success audits, one terminal job
with two attempts and no additional claim. Existing response scanner inspects29
actual API bodies, checks private fields and forbids mock/external requests.
Four screenshots captured; coordinator visually inspected the terminal screen.
No product, schema, frozen contract or authorization change was needed.

## Verification and independent review

Node24.18.0/npm11.16.0/PostgreSQL18.6, Chromium155.0.8059.79, Linux.

| Command | Observed coordinator result |
|---|---|
| `npm run test:student:grade-failure` | PASS29 inspected responses/four screenshots |
| `npm run test:student:browser` | PASS existing ordinary PostgreSQL browser journey |
| `npm run test:student` / `npm run test:grading` / `npm run test:results` | PASS34 / PASS23 / PASS6 |
| `npm test` / `npm run test:consumers` / `npm run test:b0` | PASS106 / PASS11 / PASS31 |
| Typecheck/build/emitted smoke/contract drift/consumer import boundaries | PASS |
| `npm run docs:check` / scoped whitespace | PASS |

Final counted test suites had zero failures/cancellations/skips. Full Bank,
assembly, foundation, attempts, recovery, local, directory and Firefox suites
were not rerun for this browser-test-only change; previous evidence remains
separate. Hosted CI/manual accessibility not executed. Existing non-failing
module-detection/historical whitespace warnings remain.

Transient evidence: `/tmp/tsa-student-browser-evidence/grading-failure/report.json`
and screenshots; command logs `/tmp/tsa-grade-failure-*.log`. Commands/outcomes
here are the durable record. No failing run of this added journey was observed.

Separate Sol6.1/Medium independently reviewed actual worker-command semantics,
snapshot/zero-release evidence, runner/default isolation and read-only status
checks: no concrete P1/P2. Independently executed journey/runner syntax and
scoped/direct whitespace checks; inspected coordinator report29/four screenshots.
No independent PostgreSQL/browser execution or file edits claimed. This is not
qualified human accessibility, content or rights review.

## Next executable card

TEST-002 groundwork: reproducible generated legal/illegal student lifecycle
sequences against genuine PostgreSQL, with an independent expected-state model,
privacy/integrity assertions and sanitized action trace/seed on failure. Reuse
frozen services/roles and isolated approved-fixture mechanism; cover action
composition rather than duplicate existing one-off races. Preserve separate
formal acceptance and unresolved operator authorization. Recommended implementer:
Sol6.1/High while Luna availability remains unverified after its earlier limit;
separate Sol6.1/Medium engineering reviewer.

Owner AGENTS.md and unrelated research stay preserved and unstaged. No push,
merge, deployment, Astra, paid model APIs, live student inference or unauthorized
publication. Broad goal remains active; this closes one concrete verification
gap without claiming the entire requested end state complete.
