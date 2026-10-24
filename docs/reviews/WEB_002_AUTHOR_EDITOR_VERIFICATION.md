# WEB-002 existing-contract author interaction editor

2026-10-24 Asia/Bangkok, branch `feat/track-b-data-auth`, base83eebd2.
[Root selection under owner delegation](../decisions/OPEN_DECISIONS.md#web-002-author-interaction-editor--selected-2026-10-24).
Existing create contracts support three types; the UI previously always submitted
SINGLE_CHOICE. Root accountable; actual configured native Luna/XHigh writer owned
staff.js/scoped CSS and released both. Root owns browser/Firefox/shared records.
Owner AGENTS.md/untracked research preserved/excluded. No paid model API/dependency.

## Implemented

Compact two-option/two-statement MATH synthetic author editor with labeled type
selector. Default SC template selection remains usable. MC requires at least one
explicit key and stores minSelections1/maxSelections2; TF requires explicit values
for both `a`/`b` statements and stores exact booleans. Switching type clears key
choices, including returning to SC, without creating or submitting anything.
Prompt/explanation stay in place. Required empty/whitespace text and incomplete
keys prevent POST; removed controls cannot retain invalid hidden state. Fieldsets,
legends, labeled controls, checkbox keyboard focus and scoped responsive styles.
Existing body-signature/idempotency retry and workspace generation fences preserved.
No private persistent storage. No backend/route/role/grant/migration/schema/artifact
changes or publication/rights/human-review authority. Draft handoff stays explicit.

## Actual checks

Linux Node24.18.0/npm11.16.0, PostgreSQL synthetic fixtures, Chrome156/Firefox156.
Logs/captures ignored under `.local/verification-author-editor/`; no private files
committed. Passing counted suites have zero skips/failures/cancellations.

| Command | Observed result |
| --- | --- |
| `TRACK_B_ARTIFACT_DIR=.local/verification-author-editor/chrome npm run test:track-b:browser` | PASS33 checks/16 screenshots;375/document375/scale1 |
| `STUDENT_FIREFOX_ARTIFACT_DIR=.local/verification-author-editor/firefox npm run test:staff:firefox` | PASS10 checks/19 screenshots; student+B1–B4+author MC/TF; actual1280/500 narrow |
| `npm run test:b0` | PASS32, root and UI writer separately |
| `npm run test:local` | PASS15 |
| `npm run contracts:consumer-check` | PASS |
| `node --check` staff.js and both browser scripts | PASS |
| Scoped whitespace | PASS |

Actual UI commands create MC/TF drafts, then page reload→landing→reopen staff→
exact private inspection verifies persisted interaction/key/text and DRAFT state.
Chrome checks reload never creates another draft, keyboard Space selects MC keys,
zero POST for unset MC/TF, partial TF, whitespace-only entry, returned unset SC,
and type switches clear answers. Valid SC after prior invalid MC/TF has no stale
validity blocker. Firefox independently exercises UI MC/TF creation, incomplete/
partial TF zero POST and keyboard checkbox selection, then real private reload
inspection. Neither test fabricates accepted success. Existing default SC/lost-
response same-key creation and explicit handoff/rejection/quarantine cases remain
in those same browser runs. No redundant new harness.

First new Chrome and Firefox runs assumed reload stayed in the staff workspace.
Both failed: existing application returns to landing. Harnesses were corrected to
reopen the workspace, matching the established B3 reload journey. No product fix
was required for those failures. Final runs pass; failed outcomes are not PASS.
Root inspected the actual375px TF screenshot; Firefox's requested375/450 is clamped
to actual500. No375px Firefox/native zoom/qualified AT/accessibility claim.

## Actual independent review

Separate read-only `/root/lifecycle_review`, configured Sol6.1/Medium, reviewed
against83eebd2: no findings. Independently ran final Chrome33checks/16screenshots
at `/tmp/tsa-review-author-editor-final-validation`,375/document375/scale1;
UI+both harness syntax and scoped whitespace PASS. Inspected readable mobile TF
capture, explicit/partial/whitespace validation and preserved SC/retry/privacy/
role/explicit handoff behavior. First independent run encountered the same old
reload assumption; corrected final run passed. Firefox source/syntax only, not
independent execution. No reviewer writes/commits/installs/paid services.

Reviewed staff.js SHA-256:
`04014cb463bca7199e9e6298ebf6ff5141456d818a301b441375a0f3086f3ef0`.
Broad Bank/contract suites were not rerun for this UI-only increment; B4 evidence
retains those exact results. AUTOMATED_PASS/INDEPENDENTLY_REVIEWED are bounded
engineering outcomes, not full WEB-002/Technical MVP, real accepted12/6/12 stock,
qualified human content/rights/accessibility, load or production acceptance.
