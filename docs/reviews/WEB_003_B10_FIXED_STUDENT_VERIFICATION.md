# WEB-003 B10.1 fixed student practice verification

2026-10-26 Asia/Bangkok; branch feat/track-b-data-auth, base3d41eb3/B9 source5b37a30.
Root accountable implementer/integrator under the recorded standing engineering
choice delegation. This is separately selected student scope, not an extension of
B9's staff-only go-ahead or an invented human approval.
[Decision](../decisions/WEB_003_B10_FIXED_STUDENT_DECISION.md),
[design review](WEB_003_B10_DESIGN_REVIEW.md),
[walkthrough](../guides/TRACK_B_SUPERVISOR_DEMO.md).

## Implemented

Migration024 is additive: a private owner-only eligibility helper and two narrow
candidate EXECUTE functions provide safe fixed catalog pagination and atomic owned
assignment. Only supported real B9 seals participate; legacy/reference/personal
forms are excluded. Current admission/rights/withdrawal apply. No student request
creates forms/runs/slots/keys or selects/generates questions. Frozen public schemas,
solver/goldens, scoring and timing policies are unchanged. Shared enableFixedPractice
is false; only the explicitly opted-in disposable three-domain demo enables it.

Existing personal v1 cursors remain accepted. Internally versioned v2 fixed-phase
cursors use a null unconsumed sentinel at an exact personal-page boundary; no item
is skipped or duplicated. Flag-off rejects v2 but preserves old personal catalog.
Receipt replay precedes new-admission/H1 checks, including when creation is disabled.
Separate committed H1 preflight preserves stale cleanup even if later assignment
rolls back; in-commit read-only reconciliation closes the intervening-attempt race.
Global H1 covers fixed, NEW_ONLY and REVIEW_ALLOWED. First stable assignment history
is preserved on explicit fixed repeats and still constrains later NEW_ONLY.

Student cards distinguish shared fixed forms from personal practice and display a
safe form reference even for identical titles. Native unchecked repeat consent pins
session/key/body at dialog opening. Cancel/Escape sends no assignment. Uncertain
acknowledgement retries the same intent; post-receipt read failure recovers through
GET only. Reservation requires explicit Start. Fixed labels persist through exam,
result/review/history; reload reads existing state. Before Start, missing catalog
metadata shows unknown duration rather than guessing a personal profile. Existing
owned delivery continues after new fixed creation/catalog is disabled.

SDK validates exact returned attempt ID before cache/display/result loading. API
responses are fenced across session cookie rotation; old identity responses cannot
clear a newer identity's cache. Actual CSRF403 classification remains intact.
B9's immutable studentDeliverySupported:false receipt now has operation-local copy;
it does not assess live access under the separate student capability.

## Executed verification

All data is original synthetic fixture machinery, including automated review/rights
records. No real content, qualified human review or publication permission is implied.
Commands run from the repository root with installed pinned prerequisites:

| Command | Observed result |
|---|---|
| `node --test tests/integration/assembly/fixed-allocation.test.mjs tests/integration/assembly/fixed-upgrade.test.mjs` | PASS2: cursor boundaries, shared-form assignments, receipt/retake/history, flag-off replay; populated023→024 preserves every existing table row, old function owner/ACL/definition and table grant. Migration is repeatable. |
| `node --test tests/integration/assembly/fixed-boundary.test.mjs` | Native Luna PASS9: exact SQL consent/invalid IDs/raw privilege denial; real fixed/personal NEW_ONLY and REVIEW_ALLOWED locks in both winner orders; stale TTL cleanup survives injected later INSERT rollback; DB admission; rights withdrawal/replay; current candidate-role revocation. |
| `node --test tests/integration/student-runtime/fixed-practice.test.mjs` | Root PASS1: actual HTTP/SDK all3 fixed domains, save/reload/grade100/released review, original sealed key after corrected Bank publication, owned lifecycle after flag-off runtime restart, foreign fixed view/result404, CSRF/Origin403, owned history. No replacement forms. |
| `node --test tests/critical/persistent-api-fixed-attempt.test.mjs` | PASS4: wrong retake rejected before result/cache; valid target; held read rejected after cookie rotation; stale response preserves newer identity's cached save. |
| `node --test tests/integration/student-runtime/fixture-demo.test.mjs` | PASS10: all existing profiles plus opt-in fixed three-domain automatic setup/listener/real catalog/SIGINT teardown; malformed/missing profile opt-ins rejected. |
| `npm run test:student:fixed` | PASS5 checks/17 captures, Chrome156, desktop1280 and mobile375. Four catalog seals include identical-title MATH forms with distinct visible references. All3 domain flows, native consent/Escape/focus, real committed lost ACK/exact replay, failed GET/read-only recovery, explicit Start, saved reload, grade100/review/history and held real fixed GET across external A→B rotation. |
| `npm run test:student:fixed:firefox` | PASS5 checks/17 captures, actual Firefox desktop1280/narrow500, same three-domain helper and session fence. |
| `npm run test:assembly` | Final PASS74, including the final9 boundary cases. |
| `npm run test:student` | PASS40 after SDK403 compatibility repair. |
| `npm run test:bank` | PASS161 with migration024 included in existing latest-upgrade assertions. |
| `npm test` | PASS161; no public artifact/schema change. |
| `npm run test:b0` | PASS32. |
| `npm run test:critical:student` | PASS9 generated actual HTTP state-machine/security cases. |
| `npm run test:student:domains` | PASS4 checks/8 captures/78 API responses, existing default NEW_ONLY three-domain flow. |
| `npm run test:student:review` | PASS7 checks/11 captures/65 API responses, existing explicit personal-review flow. |
| `npm run test:track-b:browser` | PASS50 checks/34 captures, existing staff B1–B9 including current seal-operation copy. |
| `npm run test:staff:firefox` | PASS18 checks/42 captures, existing student/staff Firefox regression including B9. |
| `npm run build`, `npm run typecheck`, `npm run contracts:check`, `npm run contracts:consumer-check`, `npm run test:built`, `npm run docs:check` | PASS. Existing preserved-input-whitespace documentation warning only; no documentation errors. |

Root logs are ignored `.local/b10-*`; screenshots/reports are private local `/tmp`
artifacts, not committed. Browser output prints aggregate scenario evidence, not
session tokens or private keys. Root inspected the real375px fixed catalog capture;
references wrap and controls remain readable without document overflow.

Initial failures were repaired, not counted as passes: null cursor dereference;
missing CREATED in fixed receipt (transaction had committed, then DTO validation
failed); test assumed nonexistent result.review; test supplied SC answers to mixed
MATH types; async test omitted await on the sealer; SDK nonce fence overwrote actual
CSRF403 with401. Existing read adapter supplies error-body requestId but does not
promise an X-Request-Id header; the supplementary GET test was corrected to its
existing contract. Mutation errors retain matching header/body IDs.

## Independent review

Actual separate native Sol6.1/Medium `/root/b9_design_review` stayed read-only.
Reviewed design/authority, SQL, allocation/catalog/attempt/HTTP integration, grants,
SDK/UI, tests and browser helper. Root repaired independently identified wrong-retake
cache acceptance, H1 cleanup transaction/race, indistinguishable same-title forms,
held read session rotation, and stale-response cache invalidation. No self-review
is labeled independent. Native Luna/XHigh SDK/UI and bounded test writers released
ownership; root wrote SQL/services/browser/launcher/integration/shared records.

Independent actual earlier corePG/upgrade/HTTP PASS3; final SDK4+fixedHTTP1+existing
domains3 PASS8 after403 compatibility fix. Independent Chrome PASS5/17captures/
77 inspected API responses at `/tmp/tsa-b10-independent-chrome`, including mobile375;
reviewer actually inspected its narrow screenshot. No independent Firefox or clean
clone execution is claimed. Final boundary9+corrected-version/flag-off HTTP1 independently PASS10. All final
source findings repaired/rechecked; no unresolved finding. Independent final SDK/
HTTP/domain command also validates preserved CSRF403; independent Chromium preceded
only that denial-classification tweak (successful held-GET logic unchanged).

Final independently recorded stable SHA256:

```text
024         c152fdfecbaf131a4fd4ca3282039ca3eed4372067b38badec7b54556187f2f3
allocation  ac3d3cbface8d25b61cacdd30d3f7a34bbf375d46ce197b973b6ca342f99225e
directory   5107de24d6c21029c451ef1123c0943ab886e0b897de9edb86cb211cf53e597a
SDK         986b468a5311c240a07c594fd43d1ff4f1889aa5c97821adaab9074acd5cd027
main        4a68aa9cd09589edc020a564aa8f236d73897dafe53c6c2e8167acc055482d29
boundary    f35e8cf7ba92e4e313da2fd814deb3ca767f08d844887d30680c507e7ad1d429
HTTP test   ae79ed235394c99e01706daa81add3ee66c36a933b496377ac5680766c733b2a
```

## Limits and continuation

AUTOMATED_PASS and INDEPENDENTLY_REVIEWED apply only to the executed scopes above.
MANUAL_CHECK_PENDING: qualified assistive-technology/native200%zoom/full
accessibility. HUMAN_APPROVAL_REQUIRED: lawful accepted12 MATH/6 READING/12 SCIENCE
stock and qualified independent content review. No performance target/load or
production readiness is established. B10-specific browser quarantine/race exhaustiveness
is not claimed; existing B9/Bank rights/quarantine regressions remain separate evidence.
Retained local workspace and production do not enable new fixed creation. No new
staff approval/publication/scheduling/withdrawal privileges were introduced.

Clean-checkout reproduction and final local checkpoint are recorded below after
source acceptance. Next ready engineering scope remains bounded integrated acceptance
and existing-contract student/staff usability; shorter profiles require a separate
specific selection and real eligible inventory, never silent fallback.
