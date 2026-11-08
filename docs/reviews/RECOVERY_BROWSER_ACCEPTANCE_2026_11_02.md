# RECOVERY-007 — fresh second-engine and accessibility automation

Date: 2026-11-02 Asia/Bangkok. Root accountable; navigation worker executes
existing tests and owns only `/tmp/tsa-recovery-browser-007/` evidence. No source,
dependency or test change. Uses installed browsers; no download/provider call.

Environment: Node24.18.0/npm11.16.0, Firefox156.0, geckodriver0.37.1 and
Chromium156.0.8078.47. Installed harness defaults used, with no STUDENT_BROWSER,
STUDENT_BROWSER_NO_SANDBOX or STUDENT_GECKODRIVER override. Disposable synthetic
PostgreSQL18.6 fixtures; no system or production database/data.

## Exact commands and observed results

Each command used a distinct evidence directory, shown below. All exited0 with
empty stderr and saved stdout/exit-code metadata; commands ran sequentially.

| Command | Result |
| --- | --- |
| `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-recovery-browser-007/artifacts/firefox-default npm run test:student:firefox` | Firefox4checks/4capturesPASS: actual login/SC-MC-TF saves, pre-release privacy, reload/exact clocks, worker outage/recovered100%/released review |
| `STUDENT_FIREFOX_ARTIFACT_DIR=/tmp/tsa-recovery-browser-007/artifacts/firefox-native-zoom npm run test:student:zoom:firefox` | Firefox6checks/8capturesPASS; actual FullZoom2 at fixed1280×900 physical window gives640CSSpx/DPR2, eight journey stages; reset1280CSSpx/DPR1; Escape/Space focus behavior checked |
| `STUDENT_ARTIFACT_DIR=/tmp/tsa-recovery-browser-007/artifacts/chromium-keyboard npm run test:student:keyboard` | Chrome6checks/6capturesPASS,22checkedAPIresponses,83focus entries,18AXchecks,0focus failures; keyboard controls/modal/released review and640CSSpx reflow |

Logs and per-run environment/command metadata are under
`/tmp/tsa-recovery-browser-007/{firefox-default,firefox-native-zoom,chromium-keyboard}/`.
Root inspected `summary.json`, the reports and environments, extracted counts,
and viewed the native-zoom released-explanation capture. This is root evidence
inspection, not an independent full browser rerun or full visual acceptance.

Native zoom is actual Firefox browser zoom, not CSS/emulation/half-width inference:
report records fixed WebDriver physical rectangle, zoom factor2, CSS width640,
DPR2, then restored factor1/width1280/DPR1. The Chrome keyboard reflow check is
separately labelled640CSSpx half-width equivalence, not actual native zoom.

## Limits and continuation

No qualified screen-reader/assistive-technology/user usability test, WCAG
conformance, full site/browser matrix, media-delivery, load or production acceptance
is inferred. Fixtures are original synthetic questions, not accepted real stock.
No actual failure justified further repairs or repeated test expansion.

RECOVERY-007 complete in executed scope. All temporary evidence reservations
released. Media architecture disposition requested asynchronously under RECOVERY-005
remains pending, and real content/manual AT/operations inputs remain external.
Recommended implementing platform for a next authorized concrete gap: existing
Codex subscription/available model/high if selectable, separate read-only reviewer
for critical changes. No paid API/commit/push/merge/deploy.
