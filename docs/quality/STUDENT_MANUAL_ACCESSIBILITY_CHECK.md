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

For the separate shared-passage check, stop the first fixture and run:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:reading
```

This original two-question fixture lasts three minutes. Restart a fresh fixture
for additional review time; never extend a sealed clock. Current automated timing
notice/description evidence is recorded in
[pre-start verification](../reviews/WEB_004_PRESTART_TIMING_VERIFICATION.md).
These added checks remain NOT TESTED by a qualified human.

Record reviewer identity, date, OS, browser/version, assistive technology/version,
input method, zoom setting and evidence location. Leave actual/outcome fields blank
until tested. Human accessibility review is not question-content/rights approval.

## Checks to execute

| Check | Expected observable behavior | Actual / evidence / issue |
|---|---|---|
| Explicit login and catalog | Candidate controls have useful names; route change reaches catalog heading; start is reachable by keyboard | NOT TESTED |
| Pre-start timing disclosure | Catalog/direct start, reserved start and details convey continuous server time, offline/reload do not pause or extend it, no grace, and uncertainty of unconfirmed saves; linked button description is understandable without confusing duplication | NOT TESTED |
| Shared reading passage | In the reading fixture, passage context remains understandable for both questions, saved answers and released review | NOT TESTED |
| Start and question navigation | Question heading receives focus; previous/next and question drawer are reachable; focused controls remain perceivable | NOT TESTED |
| Single choice | Radio group/options are understandable; arrows/Space work and saved state is announced after acknowledgement | NOT TESTED |
| Multiple choice | Checkbox names and selection minimum are understandable; below-minimum draft is unsaved and blocks navigation/submission | NOT TESTED |
| True/false groups | Each statement and true/false choice is understandable independently; acknowledged state survives navigation | NOT TESTED |
| Mathematics | Native MathML formula and authored Vietnamese alternative are understandable; supplied alternatives should avoid duplicate reading. Missing/unsupported rendering retains escaped text. Record confusing reading in exam and released review | NOT TESTED |
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

## Separate private staff B1 check — NOT EXECUTED by a qualified human

Use the explicitly disposable `demo:staff:review` command from the
[supervisor guide](../guides/TRACK_B_SUPERVISOR_DEMO.md#optional-staff-demonstration).
Record the same reviewer/OS/browser/AT/zoom/input evidence above. Inspect exact
version/hash and source rights, keyboard open/close/focus restoration, announced
loading/errors and metadata-only blocks, math/table/key/explanation reading,
responsive metadata wrapping, and logout/private-content clearing. Actual outcomes
remain NOT TESTED; automated Chrome375 and Firefox1280/500 are engineering evidence
only. Do not enter human rights/content approvals during this inspection exercise.


## Separate private staff B2 check — MANUAL_CHECK_PENDING

Use the same disposable staff demo, sign out from AUTHOR and explicitly select
synthetic BANK_MANAGER. Open recorded evidence and assess metadata relationships,
long verbatim text/line breaks, inert URLs, announced loading/error/retry, keyboard
close/Escape/focus restoration and logout/navigation clearing. Record actual
browser/AT/native zoom and human findings as above. Automated375px Chromium and
actual500px Firefox are engineering evidence; human outcomes remain NOT TESTED.
No rights, review, publication or qualified-human decision should be entered.


## Separate private staff B3 handoff — MANUAL_CHECK_PENDING

From an explicit AUTHOR_OWN DRAFT inspection, assess handoff control naming,
native confirmation version/hash/revision, initial Cancel focus, Tab/Shift+Tab,
Escape/Cancel focus restoration and explicit confirmation. Assess announced pending/
uncertain/retry/conflict states and the distinction between receipt acknowledgement
and freshly observed current state/unavailable status. Check native zoom and mobile
content/controls. No qualified human outcomes are recorded yet; Chrome/Firefox
engineering checks do not fill these cells. Do not approve real content or rights.

## Separate B4 negative confirmations — MANUAL_CHECK_PENDING

In the disposable staff demo, verify six explicitly chosen rubric findings, reason,
warning association, scrolling confirmation, focus restoration and Cancel/Escape
cleanup. Check REJECT receipt versus unavailable current state, manager quarantine
impact disclosure and same-key uncertain retry with keyboard/qualified AT/native
zoom. Automated Chrome375/Firefox actual500 evidence is not formal acceptance.

## Separate B5 manager history — MANUAL_CHECK_PENDING

Verify explicit action/focus, empty/latest20/truncation messaging, exact current
observation versus historical decisions, six rubric fields and inert wrapped
verbatim reasons. Close/Escape/return/logout must remove private history. Check
with qualified AT/native zoom; automated375px Chrome/actual500px Firefox evidence
does not establish formal accessibility acceptance.

## Separate B6 canonical preflight — MANUAL_CHECK_PENDING

Verify labeled keyboard checkbox selection, none-selected/pending controls, exact
canonical count/shortfall/blocker warnings and versions. Focusable horizontal-scroll
pin tables need keyboard/AT/native zoom checks. Close/Escape clears selection/report
and focuses the stable selection summary because Run becomes disabled. Automated
Chrome375/Firefox actual500 checks are not formal accessibility acceptance.

## Separate B7 fixed reference diagnostics — MANUAL_CHECK_PENDING

Verify explicit manager list/detail, empty/latest20 notice, success/proven
infeasibility versus unknown feasibility, no-form/no-qualification warnings,
focusable narrow tables, cached back, Escape/close focus and logout privacy with
qualified AT/native zoom. Automated Chrome375/Firefox actual500 is not formal
accessibility acceptance.

## Separate B8 eligible-stock rehearsal — MANUAL_CHECK_PENDING

Use the disposable staff fixture and the supervisor guide's B8 walkthrough.
Assess EXAM_MANAGER blueprint/window labels, native confirmation, pending and
same-request retry, then BANK_MANAGER historical diagnostic tables and the
NOT_REVALIDATED warning. Check role changes, close/Escape, focus restoration,
qualified AT and native zoom. A captured SUCCESS creates no form or student
attempt; this distinction must be understandable. No human outcome is recorded.

## Explicit student review practice — MANUAL_CHECK_PENDING

Use the disposable student launcher and the guide's optional review walkthrough.
After real unseen-inventory exhaustion, assess the same-domain offer, initial
unchecked repeat-consent checkbox, native dialog naming, keyboard cancellation
and focus restoration. Check uncertainty versus acknowledged receipt/read failure,
GET-only recovery, reserved explicit Start and review labels through resumed
attempt, result, released explanations and history. Check mobile status visibility,
qualified AT and native zoom. Automated Chrome375/Firefox actual500 checks are
engineering evidence; all qualified human outcomes remain NOT TESTED.

## Staff session-change recovery — MANUAL_CHECK_PENDING

Assess the changed-session notice, removal of private content/pending confirmations,
heading focus and **Reload current session** action with qualified AT/native zoom.
The action reads current state and never resends a command; unacknowledged commands
remain unconfirmed. Check that the new account is clear after explicit recovery
and that a fresh confirmation is needed. Automated Chrome/Firefox checks do not
fill qualified-human outcome fields. No human outcome has been recorded.

## B9 fixed-form sealing — MANUAL_CHECK_PENDING

In the disposable staff demo assess blueprint/window labels, native exact pin and
real-form/no-delivery confirmation, initial Cancel focus and Escape restoration,
uncertain same-request retry, historical receipt versus explicit metadata discovery,
read-only error recovery, list/detail tables and current stored availability. Check
qualified AT/native zoom/mobile focus visibility and session clearing. Engineering
Chrome375/Firefox actual500 captures do not fill qualified human outcomes.
