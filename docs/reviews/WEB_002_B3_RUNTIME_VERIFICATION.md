# WEB-002 B3.1 explicit author draft handoff — runtime verification

2026-10-24 Asia/Bangkok, branch `feat/track-b-data-auth`, base5c1bded.
Root accountable for integration/HTTP-DB acceptance/Chromium/Firefox/launcher/docs.
Two actual native tsa_builder delegates, dispatch configured Luna/XHigh, owned
disjoint private contracts and UI/CSS. Their reservations are released. Model
routing metadata was not independently observable inside workers. Owner AGENTS.md
and untracked research remain preserved/excluded. No paid model API or new dependency.

Authority: [explicit whole-B3.1 owner approval](../decisions/OPEN_DECISIONS.md#web-002-b31--owner-approved-author-draft-handoff-2026-10-24).
Frozen proposal SHA-256 unchanged:
`2c8d8531fdcbf18a1e7c25d8f0be48a260ae80b93bdf0a90ece1c30d3e003980`.
Historical proposed/approval-none footer is superseded by the recorded owner
disposition, not rewritten. B1/B2 frozen specifications and semantics remain stable.

## Delivered product behavior

After explicit fresh AUTHOR_OWN DRAFT inspection with current AUTHOR role, the UI
offers a native modal confirmation identifying exact version/hash/revision. Cancel
is initially focused; Cancel/Escape restores focus without POST. Manager-basis,
foreign/imported/untrusted ownership and non-DRAFT reads get no new action. The
existing backend AUTHOR/target.created_by policy is unchanged; UI eligibility is
intentionally stricter. Blocked B1 rights metadata can still initiate handoff;
unsafe content fails the existing validator. No rights or correctness approval.

One immutable in-memory intent captures version/revision/body/random key. Duplicate
activation is disabled while pending. Lost/uncertain responses offer explicit same-
body/key retry; known conflict/validation failure offers authoritative reads rather
than silent resubmission. Only exact version/state/expectedRevision+1 receipt is
acknowledged. Metadata and B1 are read again; current state remains separate from
the past receipt. A failed read reports status unavailable, and a replayed IN_REVIEW
receipt can correctly coexist with freshly observed QUARANTINED. Reload issues no
new POST. Logout/navigation/target/identity changes invalidate stale UI completions;
accepted server commands may still finish and are not claimed cancelled by closing.
No private persistent storage, analytics or payload logging added.

Strict additive StaffSubmitReviewRequestSchema/ResponseSchema/types/private staff
operation and generated artifact. The private operation map now infers POST body/
headers while preserving undefined B1/B2 GET inputs. Existing response errors and
actual handler/body/CSRF/key behavior are documented; no new server operation or
ownership policy, SQL grant/migration, root/student/released DTO/export or public
artifact change. Existing submit-review command remains the sole implementation.

[Supervisor walkthrough](../guides/TRACK_B_SUPERVISOR_DEMO.md#optional-staff-demonstration)
and guarded disposable launcher now guide author create→inspect→confirm handoff→
sign out→independent synthetic reviewer queue/B1/B2 inspection. No manual SQL/API
calls, human review decision, rights edit, rejection/quarantine or publication UI.
The synthetic actor is not a qualified reviewer; retained UNKNOWN remains UNKNOWN.

## Executed coordinator checks

Linux, Node24.18.0/npm11.16.0, Chrome156.0.8078.47 and Firefox156.0. Counted passing
suites have zero failures/cancellations/skips. Logs under ignored
`.local/verification-b3/` are local evidence, not committed private product data.

| Command | Observed result |
| --- | --- |
| `npm run test:staff:review` | PASS27, existing B1/B2 and5 new real HTTP/PG B3 cases plus019 migration/CLI2 |
| `npm run test:bank` | PASS121 |
| `npm run test:local` / `npm run test:b0` | PASS15 / PASS32 |
| `npm test` / `npm run test:consumers` | PASS125 / PASS11 |
| `npm run typecheck` / `npm run build` / `npm run test:built` | PASS, including emitted/private subpath DTO checks |
| `npm run contracts:check` / `npm run contracts:consumer-check` | PASS public/private drift and student/app import boundaries |
| `TRACK_B_ARTIFACT_DIR=.local/verification-b3/chrome npm run test:track-b:browser` | PASS28 check descriptions/12 screenshots, baseline B1/B2 plus4 B3 scenarios, actual375/document375/scale1 |
| `STUDENT_FIREFOX_ARTIFACT_DIR=.local/verification-b3/firefox npm run test:staff:firefox` | PASS student+B1/B2/B3 actual native confirmation/Escape/focus/POST/current read→independent reviewer queue/evidence; desktop1280 and actual narrow500 (375/450 clamped) |
| `STUDENT_BROWSER_ARTIFACT_DIR=.local/verification-b3/domains npm run test:student:domains` | PASS78 responses, independent MATH4/READING2/SCIENCE4 persistence/reload/submit/grade/released review/history; that unsupported artifact variable was ignored, domain captures used the script's default `/tmp/tsa-student-browser-evidence/domains` |
| `node --test tests/integration/bank/review-demo.test.mjs` after CLI expansion | PASS2: guarded CLI, actual author handoff/reviewer queue+evidence, privacy and terminal-group SIGINT exit0/listener gone |

B3 HTTP/PG verifies the exact six-table write delta: one workflow revision change,
new immutable validation/audit/idempotency/delivery-check/source-dependency rows.
Every other application table count+hash is unchanged. Concurrent same-key commands
return one exact receipt and one write set; changed-body key fails without writes.
Replay after newer quarantine adds nothing and retains the old receipt while GET
returns the current revision/state. Real auth/Origin/CSRF/current-role/foreign
creator boundaries, malformed/missing version/query/body/keys, stale revisions/
state, rollback on unsafe-content validation and UNKNOWN-rights queue entry are
covered. Existing rights, eligible pointers, reviews and immutable content remain
unchanged unless an explicitly expected command/setup writes them.

Chrome actually accepts PostgreSQL commands and intercepts only response loss/
delay/follow-up GET failures. It covers native Cancel/Escape0POST, same-key retry,
acknowledged receipt plus unavailable/fresh newer state, real stale409, actual
form-created draft handoff/current read, reload without POST and held accepted
command logout/identity fences. Fixture-only quarantine/submit setup exercises
conflict/replay states; those commands are not UI capabilities. Normal queue entry
is now created through the real author UI. No fabricated200 accepted command.

First focused run had26PASS/1 fixture failure: creating a draft after a rights
change still supplied the superseded decision ID. Reordering creation before the
UNKNOWN transition repaired setup; final27PASS. Contract preimplementation test
was intentionally red for absent exports, then green. Independent P3 found missing
native dialog ID referenced by aria-controls; matching ID repaired/rechecked. Root
also tightened exact receipt revision matching. None of those failing/preparatory
outcomes is counted as a passing check.

Root inspected actual mobile confirmation and Firefox acknowledged/current-state
captures. Geometry/native dialog/keyboard probes do not establish qualified AT,
native page zoom or WCAG acceptance. No375px Firefox claim. No load/performance,
hosted CI, real rights/qualified content/production acceptance. Broader student34/
assembly/attempt/grading/recovery unit/integration suites were not rerun for this
UI/private-contract increment; actual student Firefox and domains were executed.

## Actual independent review

Separate native `/root/lifecycle_review`, configured Codex Sol6.1/Medium, read-only,
reviewed final B3 against5c1bded. No unresolved findings; the dialog-ID P3 is fixed.
Actually executed: focused27, seven scoped staff contract files21, private drift,
typecheck/public-app boundary, UI/Chrome/Firefox syntax and scoped whitespace.
Final actual independent Chrome PASS28/12screenshots with
`TRACK_B_ARTIFACT_DIR=/tmp/tsa-review-b3-final npm run test:track-b:browser`;
375/document375/scale1, confirmation screenshot inspected. No fake200 acceptance
found. Server/HTTP/common diff empty; existing policy preserved. Reviewer wrote no
repository files/installs/commits/external services. Firefox slice received code/
syntax inspection only, not independent execution; broad regressions are root.
Latest CLI assertion expansion is coordinator evidence unless later supplemented.

Reviewed UI SHA-256:
`7f6ca5156d85ac9dfc09e02060e78c0876a23a764b9e87d61036ce45eef3cbc9`.
Private staff schema:
`9138c79284ebc80bb49d8425ee7d2a66e4c3dfadb00c34e32b69760dc74f7059`.
Private route registry:
`8b99dd60896be6209eebdbc7698a0a0339610e97dc35656b5236d61cc5605820`.

## Remaining and next checkpoint

The author-to-independent-reviewer local synthetic handoff is implemented and
verified, not human content approval or full WEB-002/Technical MVP. Qualified
lawful12/6/12 content, named attestor/reviewer, manual AT/native zoom, real identity,
operational/load targets and production remain separate dependencies. B3 grants
no review decision/rights edit/quarantine/publication UI. No paid API/Astra/live
student inference/push/merge/deploy. Clean-checkout reproduction and final doc
checks follow the implementation checkpoint and are appended only when executed.
Coordinator docs/scoped staged whitespace PASS, zero docs errors/one preserved
historical whitespace warning.


## Clean-checkout reproduction —bd45327

Coordinator cloned committed bd45327 with
`git clone --no-hardlinks --quiet <repository> .local/verification-b3/clean-cs02_68o`.
The clone is owned/ignored, not part of retained app state. Actual commands in order:

```sh
npm ci --ignore-scripts
npm run build
npm run test:staff:review
TRACK_B_ARTIFACT_DIR=../clean-chrome npm run test:track-b:browser
STUDENT_FIREFOX_ARTIFACT_DIR=../clean-firefox npm run test:staff:firefox
npm run test:built
npm run contracts:check
npm run docs:check
git status --short
```

All completed exit0 with no code patches, manual API setup or SQL edits. Install
added24/audited26 with zero reported advisories; build PASS; focused27 PASS/zero
failures/skips/cancellations. Actual Chrome156 PASS28/12screenshots,375/document375/
scale1; Firefox156 PASS student+B1/B2/B3,1280/actual500 (375/450 clamped),8 check
descriptions/15screenshots. Built private smoke2 and public/private drift PASS.
Docs zero errors/one preserved historical whitespace warning. Final clone Git
status empty and HEAD remained bd45327. Logs/captures under ignored
`.local/verification-b3/clean-*` are retained locally, not committed.

This closes local reproducibility for the approved B3 author handoff increment.
The next [B4.1 negative-disposition proposal](../decisions/WEB_002_B4_NEGATIVE_DISPOSITIONS_PROPOSAL.md)
is documentation only/HUMAN_APPROVAL_REQUIRED; no B4 action/DTO/permission is added.
