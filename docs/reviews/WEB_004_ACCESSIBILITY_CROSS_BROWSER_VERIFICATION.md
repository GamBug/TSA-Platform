# Student keyboard, reflow and second-engine verification

Current supplement2026-10-26: [actual Firefox native200% automated evidence](WEB_004_NATIVE_ZOOM_VERIFICATION.md)
now passes6checks/8captures; fixed physical window, native factor2/DPR2 and CSS640,
including reload, submit/Escape and released explanation/Space. This is distinct
from the historical reflow-equivalent Chromium setup below. Qualified human/AT
nativezoom outcome cells remain NOT TESTED. Actual separate native Luna/XHigh
fallback source/browser review completed without findings; no Sol/Medium claim.

2026-10-22, branch `feat/track-b-data-auth`, base `e136627`. Accountable Sol owns
second-engine verification, narrow integration fixes and shared records. Native
Luna/XHigh owns the isolated Chromium accessibility mode in the existing browser
harness. Separate read-only native Sol6.1/Medium provides engineering review.
This continuation implements documented WEB-004 checks; no G1/API/schema change.

## Verified Firefox journey

`node scripts/verify-student-firefox.mjs`: PASS on Firefox156.0/geckodriver0.37.1,
Node24.18.0/npm11.16.0/PostgreSQL18.6, Linux. Actual WebDriver interactions against
the composed student HTTP runtime and disposable original synthetic mixed fixtures.
No new dependency, production inventory, human review or publication authorization.

Candidate login, catalog and immutable mixed-type allocation/delivery, all three
native interaction types and acknowledged saves, below-minimum MC guard, four
persisted answers, fresh-document reload, exact persisted clock text, worker outage
with pending submission, recovered100% release and explicit owner review PASS.
Four screenshots/report under `/tmp/tsa-student-firefox-evidence`; coordinator
inspected saved-exam output. Native WebDriver clicks associated visible labels for
styled inputs, rather than JavaScript click or hidden-input pointer targeting.

Privacy scope: at least seven actual API responses captured in the initial exam
document before reload are inspected for private fields. Resource-origin inspection
covers Resource Timing entries in the final document only. This is not a complete
all-document network capture or uncaught-exception audit. Actual Chromium coverage
of those paths is separately recorded in the persistent integration evidence.

Separate Sol6.1/Medium actually reviewed final script/claims/cleanup and ran syntax
checks: no open findings. It read the Firefox report but did not execute Firefox.
The first actual run failed on WebDriver scrolling a deliberately hidden TF radio;
using its visible associated label fixed that harness-targeting error. Final journey
was rerun successfully after removal of unsupported zoom probes.

## Verified keyboard and reflow journey

`STUDENT_ACCESSIBILITY_TEST=true node scripts/verify-student-browser.mjs`: PASS
on Chromium155.0.8059.79 with real PostgreSQL18.6. The final actual report contains
76 focus entries, zero focus failures, 18 passing AX checks, 22 inspected API
responses and six screenshots. Coordinator inspected the 640 CSS-pixel review
screenshot. Artifacts: `/tmp/tsa-student-browser-evidence/accessibility`.

All user interactions use dispatched Tab/Shift+Tab/Enter/Space/ArrowDown/Escape;
no test `.focus()` or JavaScript click substitutes for keyboard reachability.
The actual returned slot order drives the walk. SC, minimum-staged MC and TF
responses are checked against real PostgreSQL values/revisions; incomplete MC
choices stay unpersisted and visibly unsaved. Forward/reverse native modal cycles,
Escape restoration, explicit confirmation, pending grading, released100% result,
review explanation disclosure and return to result PASS. Every intended asynchronous
heading/control assertion fails the run if focus is misplaced.

Concrete client fixes, implemented by Sol after Luna hit an actual usage limit:
persistent route transitions focus existing headings; same-screen redraws preserve
owned focus by stable id/testid, with a heading fallback only when the previously
owned target disappears. The pending heading has a stable id. Persistent submit
dialogs cycle visible enabled focusables in both directions, including their native
SUMMARY disclosure. Default mock behavior and accepted contracts remain unchanged.
No CSS/layout reconstruction was performed.

Initial tests exposed harness assumptions before the final pass: Enter needed the
existing verified CR key event, native radio groups have one Tab stop, slot types
are not ordered by fixture creation, native modal initial focus can legitimately
be SUMMARY, CDP role names differ from guessed spellings, and raw TF values use
the frozen values map. Those assumptions were corrected rather than changing
production contracts. Reproduced BODY focus after route changes and modal cycling
was repaired and retested. The pending-result fallback and explicit pending-focus
assertion were required by separate review.

Separate Sol6.1/Medium actually reviewed final main/test changes and actual evidence,
ran syntax/scoped whitespace checks, and reported no open P1/P2. It did not execute
Chromium. Luna implemented the initial test mode and reproduced failures before
its usage stop; it did not complete the final passing run. Sol finished the mode,
fixed the client, executed all final journeys and owns this handoff.

Reflow scope: a 1280 CSS-pixel baseline is resized to640 CSS pixels at device scale1.
Document/app overflow and focused-control geometry are checked across catalog,
exam, pending/result and released review. AX checks cover named controls/headings,
table caption/column header, math alternate text and score label. Focus rings are
recorded on inputs/labels, not a complete contrast, occlusion or visibility audit.
These are supplementary AX smoke checks and half-width reflow equivalence, not
native200% page zoom, screen-reader execution or WCAG conformance.

## Final regressions

| Executed command | Observed result |
|---|---|
| `npm run test:b0` | 21/21 PASS on permitted actual nested run; restricted run only showed five file wrappers |
| `npm run test:student`, `npm run test:local` | 6/13 PASS, actual PostgreSQL |
| `npm test`, `npm run test:consumers` | 106/11 PASS |
| `npm run build`, `typecheck`, `contracts:consumer-check` | PASS |
| `node scripts/verify-student-firefox.mjs` | PASS after final client focus fixes |
| Default `node scripts/verify-student-browser.mjs` | PASS after final changes |
| `STUDENT_EXPIRY_TEST=true node scripts/verify-student-browser.mjs` | PASS, actual original deadline/recovery |
| `npm run test:b0:browser` | PASS, existing mock regression |
| `npm run docs:check` | FAIL: preserved owner research whitespace/four missing temporary screenshot links |

Bank/assembly/database migration suites were not rerun: no backend/schema change
in this slice. Their prior evidence remains in the persistent student verification
record. Hosted CI and a clean-checkout integrated UI are not verified here.

## Zoom and assistive technology limitations

Two actual Firefox Ctrl-plus/Ctrl-equals WebDriver probes failed to achieve measured
200% page zoom. The paced probe retained DPR1,innerWidth1280,outerWidth1280.
Neither device scaling nor an unchanged shortcut is counted as page zoom. The
probe was removed from the final functional journey; native200% browser zoom
remains NOT VERIFIED, with no conclusion about product zoom support. Transient
probe/logs: `/tmp/tsa-web004-accessibility-preserve/firefox-zoom-probe.mjs`,
`/tmp/tsa-student-firefox-zoom.log`, `/tmp/tsa-student-firefox-zoom-retry.log`.

Firefox/geckodriver/Orca/speech-dispatcher are installed; availability alone is not
executed screen-reader evidence. No qualified manual screen-reader or complete
WCAG audit has occurred. AX-tree checks supplement, never replace, that work.

## Preservation and status

Owner AGENTS/UI/research changes remain preserved. Current-owner snapshot:
`/tmp/tsa-web004-accessibility-preserve`. Owner-overlapped main/server integration
remain unstaged. Task-owned opt-in browser scripts can be checkpointed separately;
the UI-dependent state test also stays unstaged. No clean-checkout integrated UI
claim: these browser commands require the preserved working-tree client until its
owner baseline is integrated. A script checkpoint is not a standalone UI release.
No push/merge/deploy, paid model API, Astra, live student LLM or publication.
G1 accepted; G2/G3 owner accepted. Lawful content and qualified independent human
rights/content review remain distinct. Track A remains incomplete.

WEB-004 remains IN_PROGRESS for qualified manual screen-reader/native zoom and
full accessibility acceptance. Next executable work: a bounded assistive-technology
review packet and manual native200% zoom verification against this existing client,
then resolve any observed defects and safely integrate the preserved UI baseline.
Recommended Sol6.1/High implementation while Luna is usage-limited; separate
Sol6.1/Medium engineering review when available. Qualified human usability testing
is distinct from those agent roles. No new Bank features or UI reconstruction.
