# WEB-001/ASSEMBLY-001 shared-reading integration — 2026-10-22

**Bounded engineering journey IMPLEMENTED / VERIFIED.** Accountable implementer:
Codex Sol6.1, `feat/track-b-data-auth`, base `7cee125`. Starting worktree contained
only owner-modified AGENTS.md and untracked reference research. Explicit continued
local engineering authority applies; no frozen G1 contract/schema/publication
capability, Bank workflow or student application renderer was changed. Existing
transport, renderer, allocation, answers, closure, worker and result components
already supported the immutable stimulus projection. No Astra, paid model API,
live inference, push, merge, deployment or real publication.

## Implementation and observed behavior

[Bundle fixture](../../tests/integration/assembly/bundle-fixtures.mjs) now supports
an isolated READING taxonomy/profile without changing the default MATH fixture.
The new immutable taxonomy has a READING domain and its own reasoning skill; the
new immutable blueprint selects two questions in one ALL_OR_NONE ordered bundle
with a180-second independent practice clock. The old MATH offering is disabled
for this fixture, not rewritten. Original Vietnamese library/book-exchange passage,
two different questions/options/keys and separate explanations use existing
registered sources, immutable stimulus/provenance graph and real separated
review workflow inside the existing disposable postmaster-bound fixture scope.
Agent fixture approvals are not qualified human content review or real rights
attestations. No retained workspace is seeded.

[HTTP/client tests](../../tests/integration/student-runtime/shared-reading.test.mjs)
prove exact same passage on both ordered slots; safe active projections; premature
result denial; foreign attempt/result404; acknowledged independent answers;
reload with unchanged clocks; one correct/one incorrect gives1/2 =50.00%; exact
released question passages/explanations and per-item earned points; owned history;
whole-unit unseen shortage; one attempt/job/release and two historical identities.
Final snapshots and hashes remain exact after failed subsequent allocation.

Three further actual HTTP cases revoke **only the passage source**, leaving the
question source separate. Existing policy is preserved: CREATED becomes CANCELLED
with RIGHTS_BLOCKED, safe GET200 metadata and empty slots/answers, denied start410
and unavailable result409. IN_PROGRESS and GRADED become INVALIDATED, with GET/
result410. Future allocation fails422 INSUFFICIENT_ELIGIBLE_INVENTORY. None of these
operations rewrite sealed questions, hashes, private snapshots or assignment history.

[Chromium scenario](../../scripts/student-reading-journey.mjs) uses real pointer
input through the existing runner and student runtime. Both ordered slots visibly
render the exact full passage, save distinct correct answers, reload with original
PostgreSQL clocks, submit and grade100%. Both released explanations and the exact
passage are visibly rendered. Owned history identifies READING. Unseen allocation
is rejected; passage-only revocation clears released passage/question content.
Foreign result access and future rights-blocked selection fail closed. Sealed
snapshots and history remain identical. Existing runner inspects actual API bodies
for private leakage and rejects external/mock requests and browser exceptions.

The launcher adds explicit `STUDENT_FIXTURE_READING=true`, mutually exclusive with
three-domain mode and validated before fixture creation. Existing production and
mandatory synthetic opt-ins remain. The same real fixture can be demonstrated:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:reading
```

Open the printed loopback URL, select candidate A and reading practice. Ctrl+C
removes the owned listener and disposable data. No background demo was intentionally
left running. Actual npm TTY command served200, printed SHARED_READING and closed
its listener after Ctrl+C (follow-up request could not connect). npm cancellation
exit1 is distinct from direct supervisor process-group integration tests, which
returned0 for all three profiles without PostgreSQL shutdown errors.

## Executed verification

Node24.18.0, npm11.16.0, actual private PostgreSQL18.6; Chrome155.0.8059.79.
No mocked database substitutes for persistence or rights enforcement.

| Executed command | Observed result |
|---|---|
| `node --test tests/integration/student-runtime/shared-reading.test.mjs` | PASS4/4, including final tightened privacy/history assertions |
| `npm run test:student` | PASS19/19, zero failures/skips; includes prior transport/security and all three demo lifecycles/profile guards |
| `npm run test:assembly` | PASS49/49, zero failures/skips; unchanged default-MATH and critical bundle regressions |
| `npm run test:student:reading` | PASS,32 inspected API responses,7 screenshots, original shared passage100% browser journey |
| `npm run test:student:browser`, `npm run test:student:domains` | PASS existing standard and three-domain Chromium journeys; latter78 inspected responses |
| `npm run test:b0` | PASS31/31 |
| `npm test`, `npm run test:consumers`, `npm run test:built` | PASS106/106,11/11 and emitted smoke |
| `npm run build`, `npm run typecheck` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS generated drift and public consumer/import boundaries |
| `npm run docs:check`, staged `git diff --check` | PASS; no documentation errors, preserved historical whitespace warning |

Coordinator inspected the actual mobile slot2 screenshot: exact Vietnamese passage
and correct option visible, no document horizontal overflow. Reproducible browser
artifacts are `/tmp/tsa-student-browser-evidence/reading/report.json` and seven PNGs
beside it. Existing mixed/default and three-domain artifacts remain separately scoped.
Screenshots/AX checks are not manual screen-reader or native zoom acceptance.

Initial failures were fixture/test defects, not counted as passes: missing explicit
sweepBatchSize; reassignment of a const API while simulating reload; incorrect
assumptions that every rights denial returns410 and that started/graded attempts
become CANCELLED/stay GRADED; wrong result item field name. Assertions were corrected
to existing frozen contracts and documented state policy, without changing runtime
behavior. Final focused4, fullstudent19 and browser runs above passed after those
corrections. Existing harmless module-type warning remains; no root module-type
change was introduced for this task.

Not rerun in this bounded slice: Bank94, full foundations/auth/attempt/grading/
recovery/result/directory/local suites (last verified at `7cee125`; their production
code/schema unchanged). Actual student HTTP/worker/result/rights paths run in the
new tests. Shared-reading Firefox, qualified manual screen reader/native zoom,
retained approved inventory and hosted CI were NOT VERIFIED here.

## Independent engineering review and preservation

Actual separate native `/root/directory_review`, Sol6.1/Medium, read-only: reviewed
taxonomy, complete unit ordering, safe HTTP projections, per-question scoring,
passage-only restrictions, immutable snapshots/history, browser assertions,
launcher guards/profile isolation and package commands. No concrete P1/P2 findings.
Independently executed syntax checks on seven scoped .mjs files and scoped whitespace
checks: PASS. Inspected coordinator report; did not independently execute PostgreSQL
or Chromium. No files edited; this is engineering review, not qualified human
question/content/rights approval. Sol implemented because Luna previously reached
its actual usage limit.

Owner files remain byte-preserved and excluded from the checkpoint:

- AGENTS.md: `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
- Reference research: `6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba`.

## Continuation

The existing PostgreSQL student MVP now demonstrates shared-reading delivery,
answers, score and released review under current publication/rights controls.
Full ASSEMBLY/WEB/pilot acceptance remains distinct. G1 accepted; G2/G3 retain
OWNER_ACCEPTED disposition. Real lawful inventory, named qualified reviewers,
manual accessibility and Track A remain outstanding.

Next bounded EXAM-002/OPS-001 execution card: a test-only **separate OS process**
student runtime/worker crash and restart against a still-running isolated PostgreSQL
fixture. Preserve acknowledged answers and original clocks; kill the owned app/worker
without graceful drain after durable submission, restart with restricted credentials,
prove pending/leased recovery and exactly one immutable score/release. Keep the
postmaster alive and publication fixture scope unchanged; do not present prior
same-process object recreation or postmaster restart as this OS-crash evidence.
Reuse existing lease fencing and runtime, no new public API or production service.
Recommended implementer Codex Sol6.1/High for process/persistence boundaries while
Luna is usage-limited; proposed separate Sol6.1/Medium read-only reviewer. Proposed
next assignment is not evidence of execution or review.
