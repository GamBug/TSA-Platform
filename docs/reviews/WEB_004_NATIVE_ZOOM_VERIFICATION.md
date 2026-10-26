# WEB-004 actual Firefox native200% zoom verification

2026-10-26 Asia/Bangkok, feat/track-b-data-auth, base1432c71. Root/current Codex
sole implementer/integrator. AUTOMATED_PASS / INDEPENDENTLY_REVIEWED in the
actual native Luna/XHigh fallback scope recorded below. This is automated
engineering evidence, not qualified human accessibility, screen-reader/native-zoom
acceptance or WCAG conformance. Existing manual outcome cells remain NOT TESTED.

## Acceptance gap and bounded implementation

Previous Chromium keyboard/reflow checks reduced the CSS viewport; they did not
execute native browser200% zoom. This increment reuses the existing actual Firefox
student journey with an explicit STUDENT_NATIVE_ZOOM_FIREFOX opt-in and package
alias `npm run test:student:zoom:firefox`. No additional harness, dependency,
application/SQL/DTO/scoring/clock change, accepted inventory or new privileged
student/staff operation. Default and fixed/review/staff scenarios keep their old
browser arguments; native zoom runs separately and rejects mixed flags.

The owned temporary Firefox profile alone receives geckodriver's explicit
`--allow-system-access` option. A short chrome-context command invokes Firefox's
actual FullZoom.setZoom(2) browser controller and reads ZoomManager's factor2,
then restores WebDriver content context in finally. No CSS zoom, transform, pinch
or device emulation substitutes for native zoom. BrowserZoom resets to1 at completion;
normal fixture/session/driver/profile cleanup applies. No owner browser/profile or
system database is used.

The installed Firefox156 browser-fullZoom.js implementation was inspected locally:
FullZoom.setZoom calls ZoomManager.setZoomForBrowser and persists the site zoom.
Geckodriver0.37.1 help confirms the explicit parent-process option. This is an
opt-in local automation capability, not a change to the application or real-user
browser permissions. Frozen profile policy and all content/rights gates remain.

## Executed evidence

Environment: Linux, Node24.18.0/npm11.16.0, PostgreSQL18.6 disposable fixture,
Firefox156.0/geckodriver0.37.1. Commands from the repository root after normal build:

| Command | Observed outcome |
|---|---|
| `npm run test:student:zoom:firefox` | PASS6 checks/8 captures, actual PostgreSQL mixed-question journey at native200%, exit0 and normal teardown. |
| `npm run test:student:firefox` | PASS4 checks/4 captures, old ordinary scenario unchanged. |
| `npm run test:student:fixed:firefox` | PASS6 checks/19 captures, B10.2 three-domain/save/conflict/recovery scenario unchanged. |
| Malformed native flag and native+fixed flag child-process probes | Both exit1 with the expected validation message before starting any fixture/profile. |
| `node --check scripts/verify-student-firefox.mjs`, `git diff --check` | PASS. |
| `npm run contracts:consumer-check`, `npm run docs:check` | PASS; existing historical-input-whitespace warning retained, no documentation errors. |

Native zoom starts on login and remains2 through catalog, mixed SC/MC/TF saves,
reload, submission dialog, released result/review/explanation and return to catalog.
The same four answers and exact PostgreSQL started_at/deadline_at survive reload;
controlled worker outage remains genuinely pending, then grade100/release succeeds.
Pre-release response privacy and same-origin asset checks remain in the old journey.

Observed geometry at200%: WebDriver physical window1280×900 remains unchanged;
content innerWidth640, innerHeight407, devicePixelRatio2, visualViewport.scale1.
At100%, the original innerWidth1280/devicePixelRatio1 return. Each stage checks
no document horizontal overflow. Firefox reports content outerWidth in zoomed CSS
units; WebDriver /window/rect supplies the physical-window observation. WebDriver
PNG captures are normalized to640 CSS pixels, not1280 physical pixels. Native
controller factor, physical window and content geometry jointly establish zoom;
a screenshot alone is not the zoom oracle.

Submission initial SUMMARY focus is visible at200%; actual Escape restores visible
submit-open BUTTON focus. Released explanation SUMMARY remains visible and toggles
closed/open with actual WebDriver Space actions. These are bounded focus/key probes,
not a full keyboard/assistive-technology audit. Root visually inspected native zoom
saved-exam, submission-dialog and expanded-explanation captures: no observed layout
failure in these states. The test therefore required no application styling repair.

Evidence: `/tmp/tsa-student-native-zoom-evidence/report.json` and8 PNGs; ignored root
logs `.local/native-zoom-*`. Images/reports/profiles/databases are not committed.
The synthetic questions/rights/review approvals remain fixture machinery, not named
qualified human acceptance or lawful real question inventory.

## Failed probes and measurement repairs

Initial WebDriver Control+Plus injection left factor/DPR at1; that run failed and
is not counted as native zoom. Root used the installed browser's FullZoom controller
instead. Two subsequent measurement assumptions failed: content outerWidth scales
with native zoom, and Firefox screenshots are in CSS pixels. Root corrected the
oracles to WebDriver physical window geometry and CSS-normalized PNG size. These
were test measurement errors, not application defects. Final complete journey,
additional explanation/Escape probes and regression runs passed without clock or
assertion relaxation. Both failed and passing logs are retained locally.

## Review, limits and continuation

At source checkpoint7b2457a, independent review was pending because the preferred
Sol6.1/Medium reviewer had reached its actual usage limit. Root subsequently used
the existing normally available native Luna/XHigh delegate for a distinct read-only
review task; none of its previously authored files were the reviewed target scripts.
No account/provider/model restriction was bypassed, no paid fallback or repeated
Sol retry occurred. Actual review/commands/hashes are in the closure below. This
is not a Sol6.1/Medium review. Earlier B10 product source review/clean reproduction
remain valid, and no qualified human acceptance is inferred.

MANUAL_CHECK_PENDING remains for qualified screen-reader/usability/native200%zoom
and the human-recorded browser displayed value. Automated browser-controller/focus
observations cannot fill those cells. Native Chromium zoom, full contrast/occlusion
or timing accommodation acceptance are NOT_EXECUTED here. No performance/production
readiness. B11 shorter-profile implementation remains gated on frozen count-policy
disposition; only its malformed Markdown table was repaired in this increment.


## Clean-checkout reproduction —7b2457a

Root created a no-hardlink clone of exact source7b2457a at
`/tmp/tsa-native-zoom-clean-zwsgaz97`. No owner AGENTS/research edits, existing
node_modules or fixture data were copied. These commands executed sequentially:

```sh
npm ci --ignore-scripts
npm run build
STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-native-zoom-clean-evidence/native npm run test:student:zoom:firefox
STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-native-zoom-clean-evidence/default npm run test:student:firefox
npm run contracts:consumer-check
npm run docs:check
git status --porcelain=v1
```

Every command exit0: locked install observed audit0, build, native6checks/8captures,
ordinary4checks/4captures, consumer/documentation checks. Native report has actual
browser factor2 then reset1; all eight200% stages retain fixed1280x900 window and
CSS640/DPR2. Normal teardown, no manual database/API setup, no retry or checkout
patch required. Final clone Git output empty. Root logs `.local/native-zoom-clean-*`;
private aggregate report/captures use the paths above and are not committed.
This is root execution evidence; no independent clean execution is claimed.


## Independent review closure —2026-10-26

Actual separate `/root/b9_contracts`, assigned native Luna/XHigh through its normal
available entitlement, read-only. Runtime did not expose a more specific model
identifier; no Sol6.1/Medium execution is claimed. It authored none of the target
browser scripts. Inspected B10.2 three-script diff3f3ebe8..1432c71 and native runner/
package diff1432c71..7b2457a, source flags/FullZoom/geometry/focus/privacy/cleanup,
plus actual narrow conflict and native dialog/explanation captures. No actionable
defect or unresolved finding in that scope. No repository edits; root-owned doc
changes during review were left untouched.

Independent commands all exited0:

```sh
STUDENT_ARTIFACT_DIR=/tmp/tsa-b10-2-independent-luna-chrome npm run test:student:fixed
STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-b10-2-independent-luna-firefox npm run test:student:fixed:firefox
STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-native-independent-luna npm run test:student:zoom:firefox
```

Observed Chrome6checks/19captures/86validated API responses; Firefox fixed6/19;
native Firefox6/8 with browser2×, WebDriver1280x900, CSS640/DPR2, no overflow,
Escape focus/Space disclosure and reset1. All3 script syntax and both scoped diff
whitespace checks PASS. Independent ordinary default, clean clone, broader backend
suites and qualified accessibility checks NOT_EXECUTED. Root's corresponding
ordinary/clean execution remains separately attributed above.

Source script SHA256 at the reviewed checkpoint:

```text
Firefox runner a030593c62c02604fe3cbd1ca5cd74a2961f5339fbc2449c27a75df5d8a2571a
Fixed helper   bf6a6af91bbc4e67c124ecbf9dd39d98bc6888252739bf0913153d848e206ca4
```

Reviewer-provided report SHA256 (private local reports, not committed):

```text
Chrome fixed cc2d2c544aa88e16333b3eeeb53a8bbd139e2600e45dd3a9cea96554837f9ad4
Firefox fixed d4aa75a091f0037de786ce1289f12a4ca75c732221858e1d38253a430b01d91b
Firefox native cb109946958a73f9e419b53d6d81aaa2221b8ab9e71b99d62ab700f3931b3b2a
```

This closes the bounded native automation review; manual qualified outcomes and
B11 policy authorization remain distinct. No new source repair was needed after
review, so the exact clean-reproduced checkpoint remains applicable.
