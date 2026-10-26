# WEB-003 explicit review practice verification

2026-10-25, feat/track-b-data-auth, base0c2ba65. IMPLEMENTED / AUTOMATED_PASS in
executed scope through2026-10-26; clean reproduction pending.
[Exact selected decision](../decisions/WEB_003_EXPLICIT_REVIEW_PRACTICE_DECISION.md).
Root accountable SQL/backend/browser/integration/shared records; actual native
Luna/XHigh student UI and separate bounded PG-test writers, disjoint ownership.
Separate Sol6.1/Medium source/code review hit model capacity at follow-up; one
native Codex Sol6/Medium read-only fallback actually executed the final PG review
and final UI-polish browser review before the SDK nonce supplement. No paid API/Astra/push/merge/deployment. Owner AGENTS.md
and untracked research preserved/excluded.

## Implemented behavior

Existing frozen explicit PERSONALIZED_PRACTICE/REVIEW_ALLOWED/Boolean true consent
request, new intent/key, current eligible inventory and a NEW owned sealed form.
NEW_ONLY remains strict/default; only proved unseen shortage advertises the same
blueprint REVIEW_MODE alternative when enabled. Review runs the unchanged eligible
baseline reference search; no minimum-repeat or all-repeated promise. Current
rights/versions/bundles/conflicts/quotas, per-user/global H1, revisions, ordinary
admission and600-second TTL remain mandatory. Preserve old first-history rows;
newly assigned identities still enter history and exclude later NEW_ONLY.

Migration022 replaces only the latest018 bundle-aware assembly_commit_personal
function, same signature/owner/search_path/EXECUTE ACL. Exact JSONBoolean consent,
mode-pinned run/attempt/receipt writes, REVIEW-only history conflict preservation;
all NEW_ONLY protections remain. No applied migration/public schema/artifact/solver
change or new raw-table grant. Migrate022 before enabling the capability.
`enableReviewPractice` defaultsfalse in shared services/HTTP/runtime; the existing
isolated synthetic student launcher explicitly opts in. Disabled creation/catalog
advertising does not brick stored review receipt replay/start/read/grade.

Student offer/native unchecked consent, zero-POST cancel/Escape, immutable review
intent and explicit same-key uncertain retry. Acknowledged receipt and GET view
are separate; failed reads retry GET only. Matching mode/domain required before
opening a reservation. Explicit Start uses original server clocks; labels survive
resume/result/released review/history. Unknown/mismatched response remains
unverified; explicit server-read recovery never creates another attempt. Current
operation status scrolls into view on mobile, and unrelated old result cards do
not appear as the current pending operation. No automatic fallback/generation.

## Observed checks

Node24.18/npm11.16/PostgreSQL18.6/Zod4.6.7; ignored `.local/web003-review-*` logs.

- Native test writer `node --experimental-strip-types --test tests/integration/assembly/review-allocation.test.mjs`: PASS9. Root final same file PASS9 after bounded gate repair.
  Covers disabled/default/strict consent, omitted NEW_ONLY unseen alternative,
  fresh form/current pins, preserved and new first-history, revision/replay/body
  conflict/active precedence, current rights/quarantine/whole bundles, release and
  grading, later strict shortage, direct SQL missing/null/false/string-true consent
  and both same-user NEW_ONLY/REVIEW winner orders.
- Root `node --test tests/integration/assembly/review-upgrade.test.mjs`: PASS1.
  Populated021→022 application rows/old receipts/sealed snapshots preserved; only
  declared function definition changes, all function owner/ACL/search_path and
  other definitions/table grants preserved. Explicit review then keeps old history.
- Root `node --test tests/integration/student-runtime/domains.test.mjs`: PASS3.
  Original default three-domain case preserved; actual HTTP+SDK review case creates/
  starts/saves/grades/releases separate MATH/READING/SCIENCE review attempts. Six
  independently timed attempts grade100%, ten first-history identities stay intact,
  and subsequent NEW_ONLY requests still return genuine unseen shortage. A third
  real-session test checks both account-switch timings described below.
- `npm run test:assembly`: PASS63. `npm run test:bank`: PASS149.
- `npm run test:student`: PASS36. `npm run test:critical:student`: PASS9.
- `npm run typecheck`, `npm run contracts:check`, `npm run contracts:consumer-check`,
  `npm run test:built`: PASS. Frozen contract source/artifact/fixture diff empty.
- UI writer and root `npm run test:b0`: PASS32; both browser ESM syntax checks and
  scoped whitespace PASS. These static/unit checks alone are not browser evidence.
- Root `STUDENT_REVIEW_PRACTICE_TEST=true STUDENT_ARTIFACT_DIR=.local/verification-web003-review/chromium npm run test:student:browser`:
  final actual Chrome156 PASS65 checked API responses,7 journey checks/11captures.
  Reuses unchanged NEW_ONLY reading exhaustion assertions with an opt-in offer
  selector; defaults retain the old generic shortage check. Actual lost committed
  response replays identical body/key/receipt once; controlled GET503 recovers
  without a POST; reserved explicit Start/save/reload/100% grade/released review,
  exact history and later strict shortage. A mismatched receipt stays unverified;
  explicit GET-only recovery reads the actual owned reservation. Desktop1280 and
  mobile375/document375, no horizontal overflow. Status visibility is asserted.
- Root `STUDENT_REVIEW_PRACTICE_FIREFOX=true npm run test:student:firefox`:
  actual Firefox156 PASS9 checks/21captures,1280x900 and requested450 clamped to
  actual500/scale1 with no horizontal overflow. UI-only exhaustion, native fresh
  consent/keyboard/cancel/Escape0POST, lost201/exact retry, save/reload/resume/
  grade/release/history/later strict shortage and actual committed response held
  across logout/candidate change. No uncaught errors/external page requests.
  Final root rerun after the SDK nonce repair also passed9checks/21captures.

## Defects and repairs

New backend initially read optional request.reuseMode as undefined when the valid
normal request omitted it. Manifest capture already defaulted correctly, but the
alternative branch failed to advertise review. Native PG acceptance caught it;
root normalizes only the effective mode to NEW_ONLY, leaving parsed request/hash
unchanged for legacy replay. Native test-only key containing a space and missing
slot_id in a grading query were repaired without weakening assertions.

Initial new race helper copied the unbounded pre-H.1 gates. Independent review
reported P2; root applied abort/release of all gates,7.5-second barrier bound,
utility SET LOCAL statement timeout10seconds and unconditional request settlement.
Root controlled in-memory missing-arrival/winner-SQL-rejection probes PASS2; source
and successful real-PG races also independently reviewed. No new general harness.

Firefox delegate stopped after two harness repairs (window observer lost on reload;
parenthesized evaluator required an IIFE). Root took over and the final command
passed. Chrome helper initially assumed the old generic shortage DOM, a manual
resume after reload, and catalog return directly from released review. It now uses
an opt-in selector, fresh-document automatic-resume fence and existing back-score
control; original assertions/default journey remain intact. No product error from
those harness failures.

Screenshot inspection found catalog scroll reset hid current review status below
the mobile fold. Root added focused status scrolling/visibility assertions, and
an explicit server-read recovery for failed/unverified outcomes; old unrelated
result card is hidden while the review operation is pending. Normal flows remain
unchanged. Final independent UI-polish browser recheck passed as recorded below.

## Session-bound consent security repair

Root added an actual two-candidate HTTP test and reproduced a defect: after the
session GET for candidate A, another tab could rotate cookies to B before the
review POST; the old adapter used B's fresh CSRF nonce with A's consent. The
regression initially failed with a missing expected rejection. No mocked success
or private-token diagnostic established this finding.

The private prepared intent now captures the original nonempty CSRF nonce. After
session verification the adapter checks the identity generation and current nonce,
then sends the captured nonce rather than reading a later replacement. A switch
after the session response is blocked before POST; a switch at dispatch receives
real server403. Both create zero attempts. The nonce stays outside the public
body/idempotency hash and is never logged. Existing401/403 handling clears identity,
attempt/history and returns to login. Root and independent actual domains tests
PASS3; final root full student suite PASS36, B0 PASS32, Chrome65 and Firefox9 pass.

## Independent attribution

Sol6.1/Medium design/source review: no product blocker; actual PG9, default-flag-off
stored review receipt/read/start probe, B032/type/drift/syntax/whitespace PASS. It
found the test helper liveness P2; model capacity interrupted final follow-up.

One Sol6/Medium native fallback was actually available. Independent actual PG10
(allocation9+upgrade1), syntax/whitespace and backend/UI source review PASS, no
findings after repair. Actual initial Chrome review PASS61 API responses/7checks/
11captures,375px consent inspected. Firefox source/syntax only. The same fallback then ran
`STUDENT_ARTIFACT_DIR=.local/verification-web003-review/independent-final-chromium npm run test:student:review`: PASS65responses/7checks/11captures, including mobile status
visibility and GET-only recovery, with no findings. This run predates the SDK nonce
repair. It independently inspected that repair and ran the real-session domains
file: PASS3, syntax/diff PASS, no findings or token diagnostic path.

A final requested post-nonce Chromium rerun did not execute: the reviewer hit its
usage limit. Root post-nonce Chrome65/7/11 and Firefox9/21 passed. No independent
Firefox execution or post-nonce independent browser pass is claimed.

## Limits and next

Clean reproduction pending. Independent review completed in the exact scopes above;
the additional post-nonce browser rerun was NOT_EXECUTED due to usage limits. No full Technical MVP,
qualified screen-reader/native zoom/accessibility, lawful12/6/12 content, whole-ADR
approval, production/load or fixed-form delivery acceptance. Shorter profiles stay
unsupported under current MVP counts. All fixture approval is synthetic machinery;
current rights/human qualification is not fabricated by this feature.
