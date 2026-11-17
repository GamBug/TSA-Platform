# WEB-004 — Red accents and stable product navigation

Date: 2026-10-27, Asia/Bangkok. Base `8657598`, branch `feat/track-b-data-auth`.
Status: **IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED** in the scopes below.

The owner explicitly requested red as the main color, fewer gradients, and fixes
to header/navbar movement during route navigation, preserving the design and
responsive behavior. This is local frontend authority, with no frozen API, SQL,
scoring, timing, authentication, content-rights or release-policy change.

Root/current Codex owns application integration and coordinated records. Native
`/root/ui_stability_checks`, `tsa_builder` Luna/XHigh, wrote only the shared browser
measurement helper and existing B0 runner additions. Native
`/root/ui_stability_review`, `tsa_reviewer` Sol6.1/Medium, independently reviewed
read-only. Recommendations matched those bounded implementation/review tasks;
actual normal tool execution occurred. No paid API or unavailable-model fallback.
Owner `AGENTS.md` edits and untracked research were preserved and excluded.

## Root causes and repairs

- Browse routes previously rebuilt the complete navbar with their content and
  inherited different container widths, top padding and fonts. A dedicated
  product-header host now owns consistent geometry outside the main route column.
  State reconciliation retains the actual logo, navigation, menu and destination
  nodes/listeners, updating disabled/active state and conditional destinations.
  Exam/review retain their dedicated controls, and staff/auth screens hide the
  browse host where appropriate. Main content widths and renderer behavior stay
  bounded as before; there is still exactly one main landmark.
- The document had no reserved scrollbar space. Root `scrollbar-gutter: stable`
  preserves usable header width as content becomes scrollable. Body/main flex
  layout fills the viewport without assuming a fixed responsive header height.
- A system-to-local font change occurred between browse surfaces. The shell now
  consistently uses the bundled Be Vietnam Pro family, preloads its primary bold
  subsets, and resolves the header faces before the first header paint. Failed
  font loads permit the system fallback. No external font service or route delay.
- Actual PostgreSQL catalog overflow was independently reproduced at 768/681px:
  the long synthetic/unofficial disclosure and destinations exceeded flex
  min-content width. That authenticated header uses the existing accessible menu
  before overflow; the disclosure stays visible. Small screens give it a separate
  row. Explicit first-row geometry anchors the logo during menu expansion. Both
  translated menu labels share enough width to avoid moving their neighbors.
- Red primary/hover/soft accents replace purple branding. The logo and hero use
  solid backgrounds; ambient blobs, the rotated hero card and hover lifts were
  removed. Existing cards, whitespace, domain grids, exam/review layout and
  semantic green/amber feedback remain. No overflow clipping or blanket transition
  suppression is used to hide the defects; remaining transitions affect colors,
  shadows and the existing progress indicator.

## Executed verification

Environment: Node24.18.0/npm11.16.0, Chromium156.0.8078.47 and Firefox156.0;
existing isolated local PostgreSQL fixtures, no manual database patching.

| Actor / command | Observed result |
|---|---|
| Builder: `B0_BROWSER=/snap/bin/chromium B0_ARTIFACT_DIR=/tmp/tsa-ui-stability-final5 npm run test:b0:browser` | PASS11 check groups/26 captures. Live RAF samples at1440/768/390px retain nodes, checked geometry max delta0px; first graded destination insertion and result/catalog return stable. |
| Root: `STUDENT_ARTIFACT_DIR=/tmp/tsa-ui-short-final npm run test:student:short` | PASS8 groups/26 captures/110 validated API responses. Eight fresh/graded header route scenarios at1280/1024/768/375px have all retained identities and max delta0px. Existing full/short save/reload/submit/grade/release/session recovery still passes. |
| Root: `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-ui-short-firefox-final npm run test:student:short:firefox` | PASS8 groups/26 captures. Eight fresh/graded scenarios at1280/1024/768/actual500px have all retained identities and max delta0px. Same persistent short workflow passes. |
| Root: `STUDENT_ARTIFACT_DIR=/tmp/tsa-ui-student-domains npm run test:student:domains` | PASS three real full-domain lifecycles and78 validated API responses; executed before final responsive grid refinement, supplemented by final two-engine short/full journeys above. |
| Root: `STUDENT_ARTIFACT_DIR=/tmp/tsa-ui-keyboard npm run test:student:keyboard` | PASS6 groups/6 captures/22 responses/18 AX checks/83 recorded focus steps, zero focus failures. |
| Root: `TRACK_B_ARTIFACT_DIR=/tmp/tsa-ui-staff npm run test:track-b:browser` | PASS50 groups/34 captures, including375px staff evidence/preview; existing privileged workflow unaffected. |
| Root: `npm run test:b0` | PASS32 tests. |
| Root: `npm run build`; `npm run contracts:consumer-check`; `npm run docs:check` | PASS; docs retain the existing historical-review whitespace warning, no errors. |
| Root: `node --check apps/practice-prototype/public/app/main.js`; `node --check scripts/student-short-practice-journey.mjs`; `git diff --check` | PASS. |

The B0 scrollbar probe genuinely changes from a900px non-scrolling document to a
1724px scrolling one at a900px viewport. Header x92.5px and width1240px remain
identical. Chromium's root `clientWidth` changes1440→1425 despite the stable usable
gutter; testing equality of that raw value was an incorrect oracle and was repaired.
Warm route navigation adds no font requests. Mobile menu expansion intentionally
changes disclosure/nav-region height; those measurements are excluded only for
that action, while logo/mark/menu/disclosure-chip coordinates and identities remain
checked. Programmatic navigation in the shared PostgreSQL checks invokes actual
UI handlers without incidental scrolling from deep catalog buttons; the ordinary
existing journeys continue exercising real pointer/keyboard controls.

Earlier failed runs exposed actual11px mobile logo movement and16px menu-label
width movement; explicit grid rows and the reserved menu width repaired both.
Helper id/class selector and reload-observer assumptions were corrected. Failed
or superseded runs are not counted as final passes. Root inspected actual desktop
and mobile red landing plus375/768px PostgreSQL captures.

## Independent review

Read-only Sol6.1/Medium reviewed the final application/test diff against8657598,
including header reconciliation, listener freshness, session/busy guards, focus,
fonts, scrollbar behavior and exam/review/staff separation. The measured P2 tablet
overflow was repaired and rechecked. No unresolved actionable finding remains.

- Independently ran an ephemeral actual PostgreSQL fixture: explicit synthetic-A
  login, Reading attempt, empty submit, genuine worker-graded result. At widths
  1280/1101/1100/1024/900/768/681/680/375/320 there was no overflow; persistent
  node identities and coordinates stayed fixed after the result destination was
  added. Five disclosure/navigation checks retained the logo and restored H1 focus.
- `B0_BROWSER=/snap/bin/chromium B0_ARTIFACT_DIR=/tmp/tsa-ui-independent-b0 npm run test:b0:browser`:
  PASS11/26, stable scrollbar/first-result geometry, no new warm-route font request.
- `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-ui-independent-firefox npm run test:student:short:firefox`:
  PASS8/26, all eight header scenarios max delta0px and retained identities.
- Independently ran syntax checks for main/helper/B0/short scripts, consumer
  boundaries and whitespace checks: PASS; inspected desktop/tablet/narrow captures.
  No files edited; owned temporary browser/database resources cleaned up.

Reviewed application hashes (SHA256):

```text
2b25b13652048f27b5ea993f1a77126ab77ba74bd7ec5ec58f0975cb83a8d4a2  public/app/main.js
4ca5b3209341c3467a50e44978db76d1482b7351c9978009374987db9051e5c7  public/styles.css
e37702854de898e6fcb23c88ea5afaffa47eeb7e2b7357257c077f5a1c9cdb41  public/index.html
```

## Limits and continuation

Local synthetic evidence only. Formal accessibility/manual screen-reader and
contrast/usability acceptance remains **MANUAL_CHECK_PENDING**; lawful real starter
inventory remains **HUMAN_APPROVAL_REQUIRED**. Safari and a new clean-checkout run
were **NOT_EXECUTED** for this visual change. No performance/production acceptance,
new privilege, content publication or new examination rule is claimed. Existing
automatic student/staff launchers and supervisor presentation guide remain valid.
All task writer reservations are released at the local checkpoint.
