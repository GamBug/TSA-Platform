# WEB-B0.3 — Direct-observation reconstruction evidence

**Final status: IMPLEMENTED / VERIFIED for the compatible local demo UI.**
Catalog/detail evidence gate is resolved. Final browser PASS26 captures/17 layouts;
actual independent review has no unresolved findings. Production student services
remain BLOCKED; unobserved utilities and section-lock behavior NOT IMPLEMENTED.
Current fresh preview: `http://localhost:4176` (task-owned session14194); existing
4173/4175 servers preserved. Earlier checkpoints below record actual progression.


2026-10-20, Asia/Bangkok. Accountable integrator: Codex Sol6.1 / Medium.
Bounded implementer: native gpt-6-luna / XHigh (`reference_exam_builder`).
Independent reviewer: native gpt-6.1-sol / Medium (`reference_ui_review`),
font/static/core/result/review and final error-state reviews complete; no unresolved findings.
Branch `feat/track-b-data-auth`, HEAD `f72f6a8`, uncommitted. Owner's existing
AGENTS.md SHA-256 remains
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
B0.2 and unrelated dirty changes were retained; no commit/push/merge occurred.

## Evidence and authorization

Owner explicitly required direct authenticated research before reconstruction.
Owner manually logged in, entered one reference attempt and supplied the taking
image plus DONE. Owner then chose manual submission, replied SUBMITTED and
supplied result/review/expanded-solution screenshots plus DONE. Agents performed
no reference attempt creation/submission, credential inspection or account edits.
The approval scope is recorded in [decisions](../decisions/OPEN_DECISIONS.md).

Fresh authenticated catalog/detail/taking/result/review observations and safe
computed CSS are recorded in [research](../research/VN_EXAMS_UI_GAP_ANALYSIS.md).
Private evidence is ignored at `tmp/vn-exams-ui-20261020/`; required taking,
mobile-taking, result and review PNG files exist and their dimensions/bytes/SHA
were verified. `verified-screenshot-manifest.json` and
`owner-results-provenance.json` identify exact artifacts. These include protected
on-screen material and must remain local/ignored. No question text, answer key,
explanation, source or proprietary asset was copied into application fixtures.

Catalog capture is native1441x901. Taking captures include exact1440x900 and
768x1024; requested390x844 PNG has reference CSS391x845 due native fractional
scaling. Owner result/review images are1855x1039 with browser chrome; their
content bounds differ from exact viewport captures. Review live CSS was
measured at all three target widths; result CSS at1440x900. Owner detail PNG is now available1920x1080; exact matching reference result/review
viewport screenshots remain UNAVAILABLE. Viewport/native/screencast capture failures
are preserved in research; owner images satisfy visual evidence, not a claim of
complete capture coverage or pixel-perfect reconstruction.

## Gap assessment and implementation

| Reference-confirmed finding | Impact / complexity / risk | Compatible reuse and resolution |
|---|---|---|
| Full viewport exam, fixed header/footer, centered question column | High / medium / medium | Existing attempt UI;60px header,65px footer, independent middle scroll,688px desktop/tablet content |
| Compact question toolbar and row answer controls | High / medium / medium | Native radios, existing save/rollback; red selected state, review mark and save feedback |
| Bottom counter opens upward navigator | High / medium / medium | Existing filters/bookmarks/current state; nonmodal drawer, counter toggle, Escape/focus return |
| Confirmation counts and vertical actions | High / low / medium | Existing submit lifecycle; live completed/unfinished/marked counts, explicit continue/final submit |
| Result ticket and explicit review action | Medium / medium / medium | Existing raw mock score and released review;160px circle, red ticket edge, hero review action and preserved statistics |
| Focused review with optional warm solution pane | High / medium / medium | Existing released original explanation;57/54/65px focused shell, desktop split/mobile stack, fixed solution heading and independent scroll |
| Typography and measured breakpoints | Medium / low / low | Independently sourced OFL1.1 Be Vietnam Pro, exact static font allowlist; local1440/768/390 layouts |

VERIFIED means directly observed in this session or owner-supplied PNGs, as
specified above. INFERRED original decisions include retaining existing local
filters, four slots, accessible native controls, error/retry behavior and short
mock deadline. They are not assertions of reference backend behavior.
UNAVAILABLE evidence includes reference time-expiry, server retry policy and
unobserved tool behavior. No inferred mechanism is labeled reference-confirmed.

Frozen G1 APIs, database, production authentication, attempt/reuse/allocation and
scoring contracts remain unchanged by this slice. Student delivery remains
DEMO ONLY: three repeated single-choice slots and one original synthetic
true/false group. Complete-group counting and exact-match mock scoring stay
stable. No official100-point TSA score, full100-question exam, future section
lock, live generation, copied branding, fake sharing or production delivery is
introduced. Existing real PostgreSQL integration belongs to separate synthetic
staff identity/Bank workflows and does not supply student attempts.

## Executed checks

Node24.18.0/npm11.16.0; actual permitted local processes, no dependency install.

| Command | Observed result |
|---|---|
| `B0_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/local-before npm run test:b0:browser` | PASS, Chromium155,17 baseline captures |
| `node --test --test-isolation=none apps/practice-prototype/test/server.test.mjs` | PASS3, font/static boundary |
| `npm run test:b0` | PASS16, no skips |
| `npm run typecheck && npm run build && npm run test:built` | PASS, emitted smoke PASS |
| `npm run test:consumers` | PASS11, no skips |
| `npm test` | PASS106, no skips |
| `npm run contracts:check && npm run contracts:consumer-check` | PASS, generated drift and public import boundaries |
| `npm run docs:check` | PASS, Git-backed49 Markdown files, no errors; historical preserved whitespace warning |
| `npm run test:local` | PASS13, actual PostgreSQL/HTTP persistence and authorization |
| `TRACK_B_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/staff-regression npm run test:track-b:browser` | PASS Chromium155,4 captures, author persistence/retry/candidate denial/mock unavailable |
| `B0_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/local-after npm run test:b0:browser` | Initial active-exam PASS17; final `local-final` rerun PASS22 captures/11 layouts/10 check groups, including result/review and mobile save errors |

Restricted fallback docs discovery reports pre-existing untracked research
trailing spaces; it is not a passing clean-CI check. The Git-backed checker
excludes untracked Markdown. New research/evidence documents require separate
link/whitespace checks before acceptance. No browser WCAG audit is claimed.

## Independent review and continuation

Actual read-only Sol reviewer found no unresolved issues after full code/artifact
review. Independently ran prototype16/16 and static3/3 tests, verified all12 font
signatures/sizes/SHA/CSS/license hashes (189,656bytes), and inspected final
22-capture/11-layout report plus desktop/mobile exam/result/review/error PNGs.
Reviewer did not rerun the artifact-writing browser harness. Reviewer identified
one P3 unresolved disclosure IDREF; root assigned the pane ID and summary controls
relationship and added a browser assertion; reviewer confirmed closure.

Final browser also exposed a real deferred native close event race on rapid
navigator reopen; root ignores stale close events while the drawer is open,
preserving focus/expanded state. The existing rapid-toggle/Escape test now passes.
Intermediate harness failures were corrected: wait for deferred details toggle
state, and supply the complete Enter character event to Chromium. These are
recorded failures, not successful runs. Latest acceptance run is PASS22.

Root additionally made mobile save failures readable beneath the toolbar while
preserving rollback/announcements, and centered the review counter. Reviewer
inspected that delta and final error capture with no finding. Last staff rerun
`TRACK_B_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/staff-final npm run test:track-b:browser`
PASS4 captures after final screen-mode changes.

Measured comparison: exam header60px vs reference59.74; footer65px vs64.74;
question toolbar688px at x376/y100 desktop and x40/y100 tablet; mobile342px at
x24/y84. Review header57/toolbar54/footer65 vs56.74/54.23/64.74. Desktop uses an
8px divider and two panes; mobile stacks panes with independent scrolling.
Temporary synthetic long paragraphs were injected only by the harness and
removed, verifying scrolling without fixture changes. Result circle160px and
960px maximum ticket match structural measurements. Original product shell,
fixture text/count/duration, display-heading font and some decorative spacing
still differ. This is structural reconstruction, not pixel-perfect equivalence.
Private `comparison.html` pairs reference/local images; final layouts/report are
under `local-final/`.
All bounded builder files released. Root owns integration and shared records.

Accepted: evidenced compatible exam/result/review slice IMPLEMENTED/VERIFIED.
Owner subsequently requested continuation after usage reset. Next: complete fresh
catalog/detail visual evidence before additional reconstruction; screenshot gate
still applies to newly targeted surfaces. No pending code findings in accepted slice.
Production student integration remains BLOCKED on approved inventory/publication
and assembly/attempt/closure/grading services; this work does not advance G2/G3.

Run from root: `npm run dev:b0`, then open `http://127.0.0.1:4173`.
Alternate: `PORT=4175 npm run dev:b0`. Existing owner4173 listener is preserved.
Mock resume lasts while the server process runs; restarting it clears attempts.

Exact alternate launch command `PORT=4175 npm run dev:b0` served HTTP200 and the
task-owned process was stopped; existing4173 listener preserved. Main/harness
syntax and scoped/full `git diff --check` PASS. Targeted new evidence/research
Markdown link checks PASS; new verification-file whitespace PASS.

## Continuation blocked by visual evidence

After owner requested continuation, fresh read-only catalog/detail research was
attempted. Existing Chromium was minimized; restoring it made visibility visible,
but surface capture still timed out. Alternate native detail capture succeeded
(819x729; `exam_details_native_partial.png`), with async resize mismatch explicitly
recorded; this is not the required matched desktop detail image. Native catalog
capture timed out too after separate normal-state/size setting and foregrounding.
No further capture retries or frontend changes are authorized past the owner's
mandatory manual-screenshot checkpoint. Need owner catalog/cards and detail/
introduction screenshots; no new reference attempt is needed or authorized.
Current auth browser is preserved on TSA catalog. Broader visual parity remains
BLOCKED; accepted core remains IMPLEMENTED/VERIFIED.

## Catalog/detail continuation evidence gate passed

Owner supplied actual VN Exams catalog/cards and detail PNGs, each1920x1080,
following the previous checkpoint. `owner-catalog-details-provenance.json`
records byte-for-byte copies and SHA; reviewer independently verified them.
Local-app screenshots supplied earlier were correctly excluded from reference
evidence. This supersedes the screenshot blocker above; no new reference
attempt was started or submitted. Fresh responsive content-free CSS and loaded
card/group anatomy were measured. Owner images include the browser banner,
so no exact1440x900 reference-viewport claim is made. Private history values
visible in owner detail image are neither transcribed nor implemented.

Implementation assigned to reused native Luna/XHigh for main/styles only;
root owns harness/docs. Scope is compatible grouped3/2/1 catalog tickets and
max768px detail/intro, real availability counts, true4-slot/6-minute metadata and
3SC+1TF structure. ExistingAPI/lifecycle/release gates and accepted exam/result/
review remain. No invented10 exams, personal history, official counts/scoring,
logos/proprietary assets or unavailable controls.

Actual read-only Sol reviewer approved evidence/plan consistency and found a
P3 weak structure-count assertion. Root replaced digit matches with semantic
row/type checks and exact count assertions; final implementation review pending.

## Final catalog/detail acceptance

IMPLEMENTED: scoped catalog/intro modes, original grouped pale ticket cards with
red accent, real availability filters/live counts, disabled unavailable domains,
measured3/2/1 responsive grid, breadcrumb/back navigation with heading focus,
red start action and genuine4-slot6-minute/3SC+1TF metadata. Removed the confusing
reference40/20/40 banner from student catalog; no fake10-entry inventory or history.
Landing remains original. Existing exam/result/review semantics are preserved.

Loaded reference panel measured1024px desktop,657.116px tablet,311.814px mobile.
Local panel1024px desktop and matching responsive insets; mobile326px reflects
overlay-scrollbar/native CSS viewport differences. Radius24px group/16px card,
gap20px, card padding24px/left28px are measured values. Body Be Vietnam Pro is
locally licensed; display font, original branding, inventory and some decorative
layout differ. No pixel-perfect or exact reference mobile screenshot claim.

Integration failures and repairs: first browser attempt failed catalog render
because the start button lookup preceded footer attachment (P1); query now uses
the actions container. Reviewer also found landing heading unfocusable on home
breadcrumb (P2) and nested main landmark (P3); tabindex/section repairs confirmed.
Previous weak digit-count test was replaced with semantic rows/exact counts. A
subsequent run exposed obsolete removed-dialog close callbacks resetting the new
counter aria state; disconnected-dialog guard repaired it without weakening the
rapid-navigation assertion. Normal browse screens now reset page scroll before
heading focus, keeping detail breadcrumbs visible; exam/review panes unaffected.

Final executed commands on Node24.18.0/npm11.16.0/Chromium155:

| Command | Actual final result |
|---|---|
| `B0_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/local-complete npm run test:b0:browser` | PASS26 verified PNGs,17 layout records,11 check groups;3/2/1 grid, counts, unavailable cards, exact3SC/1TF, one main, breadcrumb focus/scroll, back/start, catalog→staff unavailable/return mode cleanup and all prior exam/privacy/expiry/review checks |
| `npm run test:b0` | PASS16, no failures/skips |
| `TRACK_B_ARTIFACT_DIR=<repo>/tmp/vn-exams-ui-20261020/staff-complete npm run test:track-b:browser` | PASS4 captures, real PostgreSQL staff workflow/auth boundaries |
| `node --check apps/practice-prototype/public/app/main.js && node --check scripts/verify-b0-browser.mjs` | PASS |
| `npm run contracts:consumer-check && npm run contracts:check` | PASS, public import boundaries and frozen generated artifacts unchanged |
| `npm run docs:check` | Git-backed PASS; restricted fallback limitation documented above |
| `git diff --check` | PASS |

Earlier106 contract/11 consumer tests, typecheck/build/emitted smoke and13 PG/HTTP
staff tests remain valid for unchanged contract/service source. They were
executed in this task; not falsely reported as rerun after every CSS edit.
Actual Sol reviewer independently ran prototype16 and syntax/diff, inspected
code plus updated26-capture artifacts, verified all fixes and final width/scroll
delta, no unresolved findings. Artifact-writing browser execution was root-run.

Preview: attempted `PORT=4175 npm run dev:b0` failed EADDRINUSE; existing listener
was preserved. `PORT=4176 npm run dev:b0` then started successfully and remains
running (tool session14194). `http://localhost:4176` returned200; served main.js
and styles.css SHA matched current files. Existing servers/sessions were not
restarted. To launch after stopping that preview, use the same4176 command.

Changed groups: main.js/styles.css for UI; index/fonts.css/local OFL fonts and
exact server allowlist/server tests for typography; browser harness and font
artifact checker; coordinated research/decision/backlog/state/handoff/README
records. Pre-existing B0.2 API/engine/fixture/test edits retained. Frozen packages
and root service/schema source were not modified. Owner AGENTS hash unchanged.
No commits/push/merge, schema/auth/reuse/scoring change, paid API or new reference
attempt. All current file reservations released.

Remaining: real student delivery needs approved inventory/publication and actual
assembly/attempt/persistence/closure/grading services. Multi-section locks and
per-section timing cannot be invented from current demo metadata. Calculator,
notes/report tools and other unobserved question formats are NOT IMPLEMENTED;
additional reference interaction research would need a legitimately accessible
owner-controlled state. No further reference attempt is authorized. Highest-value
next engineering work is the existing approved student-service integration path,
with contract compatibility and human content gates retained.
