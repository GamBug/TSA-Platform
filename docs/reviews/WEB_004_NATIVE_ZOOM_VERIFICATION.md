# WEB-004 actual Firefox native200% zoom verification

2026-10-26 Asia/Bangkok, feat/track-b-data-auth, base1432c71. Root/current Codex
sole implementer/integrator. AUTOMATED_PASS / PENDING_REVIEW. This is automated
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

No independent review of this increment has executed. The actual separate
Sol6.1/Medium reviewer remains at its recorded usage limit; root did not retry or
bypass restrictions. PENDING_REVIEW is retained. The earlier B10 application source
review and clean reproduction remain valid because application source is unchanged.
Review this runner diff/flag isolation/geometry/focus/privacy assertions and execute
the native and default aliases when review capacity returns. No self-review is
presented as independent. Recommended separate Sol6.1/Medium for that bounded task;
current Codex/Sol6.1 High owns integration, native Luna/XHigh only if available for
an isolated observed UI defect. Existing entitlements only, no assumed quotas.

MANUAL_CHECK_PENDING remains for qualified screen-reader/usability/native200%zoom
and the human-recorded browser displayed value. Automated browser-controller/focus
observations cannot fill those cells. Native Chromium zoom, full contrast/occlusion
or timing accommodation acceptance are NOT_EXECUTED here. No performance/production
readiness. B11 shorter-profile implementation remains gated on frozen count-policy
disposition; only its malformed Markdown table was repaired in this increment.
