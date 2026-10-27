# WEB-004 — Saved-attempt loading and read recovery

2026-10-27 Asia/Bangkok; branch `feat/track-b-data-auth`, base `73114bd`.
**IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED** in the scopes below.

## Scope and implementation

Root selected the observed history/current-attempt GET feedback gap under standing
engineering-choice authority after owner “next”. Read-only native Luna/XHigh
discovery confirmed absent pending feedback and catalog reconstruction/top jump
on a recoverable history read failure. Root/current Codex owns main/styles,
integration and records; recommended Sol6.1/High for async integration, current
Codex implements. Native `saved_read_checks` Luna/XHigh wrote only existing browser/
state tests; `saved_read_review` Sol6.1/Medium independently reviewed read-only.
Actual normal tools executed; no recommendation is substituted for execution.
Owner AGENTS.md/untracked research preserved/excluded. No API/SDK/SQL/role/reuse/
scoring/clock/startup/dependency change.

History and the current-attempt card share an exact-target read with local loading,
cancel-wait and retry. Native focused actions remain focusable while aria-disabled;
errors show adjacent alerts. Only local regions update, retaining all cached rows
and focus. Existing SDK target/mode/release validation is unchanged. Retry reads
the selected owned attempt without creation, Start, submit or other mutation.

Object/identity fences reject late responses after navigation, cancel, logout or
replacement identity. Cancel releases only its pending busy state; an old response
cannot unlock a newer operation. It stops UI waiting, not an already-dispatched
server GET. Nearest local scrolling keeps a focused action/feedback visible when
the row grows at the viewport edge, respecting a deliberate scroll away. The
current-attempt panel remains bounded and consistent with the red design.

## Executed checks

Node24.18.0/npm11.16.0, Chromium156.0.8078.47/Firefox156.0, existing disposable
PostgreSQL fixtures, original synthetic content and automatic owned teardown.

| Actor / command | Observed result |
|---|---|
| Root: `STUDENT_ARTIFACT_DIR=/tmp/tsa-saved-read-visible-final-chrome npm run test:student:short` | Final PASS10groups/37captures/213 validated API responses. |
| Root: `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-saved-read-visible-final-firefox npm run test:student:short:firefox` | Final PASS10/37. |
| Root: `STUDENT_ARTIFACT_DIR=/tmp/tsa-saved-read-domains npm run test:student:domains` | Three full domains/78 responses PASS before final local visible-focus refinement; final full/short journeys above supplement it. |
| Root: `B0_BROWSER=/snap/bin/chromium B0_ARTIFACT_DIR=/tmp/tsa-saved-read-b0 npm run test:b0:browser` | Demo/header regression11/26 PASS before final local refinement. |
| Builder/root: `node --test apps/practice-prototype/test/persistent-state.test.mjs` | PASS18/18, including cancel/identity/newer-read busy ownership and local errors. |
| Root/reviewer: `npm run test:b0` | PASS38/38. |
| Root: `npm run build`; `npm run contracts:consumer-check`; syntax; `git diff --check`; `npm run docs:check` | PASS; only existing historical-review whitespace warning. |
| Independent: `STUDENT_ARTIFACT_DIR=/tmp/tsa-saved-read-independent-chrome-visible npm run test:student:short` | Final PASS10/37/213 responses. |
| Independent: `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-saved-read-independent-firefox-visible npm run test:student:short:firefox` | Final PASS10/37. |
| Independent: B038, syntax, boundaries, whitespace and actual screenshots | PASS, no files edited/no unresolved findings. |

Shared journeys retain16 genuine owned graded attempts and unchanged first history.
Held targeted GETs exercise pending feedback, injected503, exact GET-only retry,
zero non-GET `/api/v1/` requests, focused row/current-card recovery, explicit cancel
and real successful completion after home navigation. That late success neither
redirects nor locks subsequent actions. Actual parent A→B rotation clears cached
rows; deferred tests cover late identity/new-operation responses. Status and action
must both be inside the actual desktop/narrow viewport, allowing only bounded
nearest scroll. Existing save/reload/submit/grade/release checks still pass.

## Independent finding and repair

Sol6.1/Medium found P2 offscreen feedback in actual Firefox: at viewport height814,
status was y894–915 and focused retry y801–842. Focus identity and unchanged scroll
alone missed it. Root repaired nearest local scrolling; final viewport assertions
and inspected screenshots confirm visible controls. Root/reviewer inspected Firefox
desktop pending/error and Chrome375px error captures. Header refresh identities/
maxdelta0 remain; intentional selected-row scrolling is not mislabeled as fixed
viewport coordinates. Final review covers cancellation, busy ownership, identity/
navigation fences, exact-target retry and unchanged release checks: no findings.

Earlier preliminary passes are superseded for visible-focus acceptance. Helper
score/route assumptions, collection-only mutation coverage and status-container
selector were repaired as test-oracle issues; failed probes are not final passes.

Reviewed application SHA256:

```text
93e21653040cce20cbce49b57c365aa58041c3cfb3e27f4caa9d0c5677ef52f6  public/app/main.js
fe0b7c4c1455a28807cfa24b0a7be06ff0b2b9e004705832fa8f0fe27026b7da  public/styles.css
```

Qualified manual accessibility/AT/usability is **MANUAL_CHECK_PENDING**; lawful
reviewed real stock is **HUMAN_APPROVAL_REQUIRED**. Safari/new clean checkout/staff
browser/full backend-wide reruns are **NOT_EXECUTED** for this bounded change.
Prior [clean reproduction](WEB_004_HISTORY_VERIFICATION.md#clean-checkout-reproduction--e7b9e5d)
remains historical, not new-source evidence. No performance/production acceptance,
new privilege, real-content publication or paid/live model dependency. All writer
reservations released; private browser evidence remains local/uncommitted.
