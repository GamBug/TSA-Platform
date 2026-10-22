# Manual student accessibility check

Status: NOT EXECUTED. This is a bounded review packet, not acceptance evidence.
WEB-004 remains IN_PROGRESS. Automated keyboard, AX/reflow and Firefox evidence
is in [the verification record](../reviews/WEB_004_ACCESSIBILITY_CROSS_BROWSER_VERIFICATION.md).
Timing accommodations and a complete WCAG audit remain separate owner review work.

## Isolated setup

Use a dedicated private browser session/profile; local cookies are shared across
ports on the same hostname. Do not reuse an active staff browser session.
Start from the pinned clean-checkout run guide:

```sh
npm ci --ignore-scripts
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student
```

Open the printed loopback URL. These are original disposable synthetic fixtures,
not qualified human-reviewed production questions. Choose candidate A explicitly.
Ctrl+C removes this database; restart the command for a fresh independent run.
The default deadline is ten minutes and is not extended for the review. If more
review time is needed, restart a fresh fixture rather than modifying sealed clocks.

Record reviewer identity, date, OS, browser/version, assistive technology/version,
input method, zoom setting and evidence location. Leave actual/outcome fields blank
until tested. Human accessibility review is not question-content/rights approval.

## Checks to execute

| Check | Expected observable behavior | Actual / evidence / issue |
|---|---|---|
| Explicit login and catalog | Candidate controls have useful names; route change reaches catalog heading; start is reachable by keyboard | NOT TESTED |
| Start and question navigation | Question heading receives focus; previous/next and question drawer are reachable; focused controls remain perceivable | NOT TESTED |
| Single choice | Radio group/options are understandable; arrows/Space work and saved state is announced after acknowledgement | NOT TESTED |
| Multiple choice | Checkbox names and selection minimum are understandable; below-minimum draft is unsaved and blocks navigation/submission | NOT TESTED |
| True/false groups | Each statement and true/false choice is understandable independently; acknowledged state survives navigation | NOT TESTED |
| Mathematics | Vietnamese alternative and TeX content are understandable without relying only on visual layout; record duplicate/confusing reading | NOT TESTED |
| Table | Caption, column headers and cell relationships can be navigated and understood with assistive technology | NOT TESTED |
| Submission dialog | Dialog name/summary are understandable; Tab/Shift+Tab remain inside; Escape returns to trigger; confirmation is explicit | NOT TESTED |
| Pending/result transition | Pending status is understandable; released result focus reaches its heading; score is labelled unofficial practice | NOT TESTED |
| Released review | Review only follows release; filters, explanation disclosure and return action have names, state and usable keyboard focus | NOT TESTED |
| Native page zoom | Set actual browser zoom to200% using its own control and record displayed value; content/controls remain usable without lost information | NOT TESTED |
| Focus/contrast/occlusion | Inspect visible focus and contrast across states; sticky headers/footers and explanation panes do not obscure focused controls | NOT TESTED |

Record actual failures before proposing fixes. Include focused control, preceding
action, expected/actual behavior, browser/AT versions and a synthetic-only capture
or transcript. Retest a repaired finding in the same setup. An agent's AX-tree
snapshot or automated shortcut probe cannot fill the screen-reader or native-zoom
outcome cells. No conformance or formal acceptance is implied by this packet.

Recommended engineering follow-up: Sol6.1/High for observed UI defects while Luna
is usage-limited; separate Sol6.1/Medium read-only review when available. A qualified
human conducts and records the assistive-technology usability assessment.
