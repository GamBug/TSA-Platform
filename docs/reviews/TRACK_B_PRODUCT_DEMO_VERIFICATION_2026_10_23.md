# Track B product demonstration checkpoint — 2026-10-23

Accountable implementer: Codex root. Branch `feat/track-b-data-auth`, initial
`b4a8097`; lifecycle-review closure/mission claim `1d6bf4d`. Owner-modified
AGENTS.md and untracked research note preserved and excluded from commits.
Authority: [owner mission](../decisions/OPEN_DECISIONS.md#track-b-product-completion-execution--2026-10-23).

## Implemented

Actual browser screenshots exposed raw TeX and unstyled tables. The student
renderer now lazily loads exact local KaTeX0.19.0 and renders native MathML, with
fresh bounded untrusted parser settings and escaped authored-text fallback.
Only that asset/license is added to the static allowlist. No public node_modules,
CDN, external image or inference dependency exists. Tables retain captions/column
semantics with readable cells and keyboard-accessible horizontal scrolling.
Mobile save status wraps visibly instead of truncating. Student history and grading
status use Vietnamese labels while retaining raw machine status in DOM data.

The launcher prints the URL, synthetic login instructions, independent-domain
scope and teardown guidance. [Supervisor guide](../guides/TRACK_B_SUPERVISOR_DEMO.md)
provides pinned prerequisites, exact command, browser-only journey and limitations.
No frozen DTO, service, schema, score, clock, role or NEW_ONLY rule changed.
Dependency license/advisory evidence is in the
[existing review increment](FOUND002_STAGE4A_DEPENDENCIES.md#local-mathematical-rendering-increment--2026-10-23).

## Executed verification

Environment: Linux, Node24.18.0/npm11.16.0/PostgreSQL18.6,
Chromium155.0.8059.79, Firefox156.0. All counted passing suites have zero skips,
failures or cancellations. Initial restricted pre-change domains run failed at
Unix socket EPERM; permitted execution resolved the environmental restriction.
That failed setup is not passing evidence.

| Actual command/check | Observed result and scope |
| --- | --- |
| `npm run test:student:domains` | PASS, 78 inspected API responses, actual MATH4/READING2/SCIENCE4; saves/reloads, original clocks, H1, lost-submit acknowledgment retry, separate100% grades/reviews/history |
| `npm run test:student:browser` | PASS, actual PostgreSQL desktop1280/mobile375, save/conflict/offline/submit/pending/result/released-review/revocation journey |
| `npm run test:student:keyboard` | PASS, native MathML, hostile TeX/remote links/images/HTML, recursion and macro-isolation checks, keyboard/AX/reflow journey |
| `npm run test:student:firefox` | PASS, actual second engine including MathML, typed save/reload, grading/review and desktop/mobile |
| `npm run test:student:grade-failure` | PASS29 inspected responses; Vietnamese retryable/final states, stopped polling, read-only check, zero invented score/release |
| `npm run test:student` | PASS34; actual auth, pools, transport, launcher guards/cleanup and existing student-runtime regressions |
| `npm run test:b0` | PASS32, includes fixed math asset/license allowlist and unrelated-path denials |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| `npm run typecheck` / `npm run build` / `npm run test:built` | PASS |
| `npm run contracts:check` / `npm run contracts:consumer-check` | PASS, generated contract drift and import separation preserved |
| `npm audit --json` | PASS, zero registry advisories at query time |
| `npm run docs:check` / scoped `git diff --check` | PASS; existing historical whitespace warning retained |
| Exact `NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:domains` | Started real ephemeral loopback URL; page/auth-session/math asset/license returned200. Terminal Ctrl+C teardown observed separately below. |

Coordinator visually inspected Firefox saved exam and Chromium640 equation/table
screenshots. Runtime artifacts are under `/tmp/tsa-student-browser-evidence`,
`/tmp/tsa-student-firefox-evidence`; independent keyboard artifacts under
`/tmp/tsa-review-math-keyboard-final`. Do not treat transient files as human
acceptance evidence or commit private production evidence.

## Independent review

Actual separate native `/root/lifecycle_review`, Sol6.1/Medium, read-only, reviewed
student diff from `1d6bf4d` including escaping/fallback, fixed asset allowlist,
macro state, async behavior, table semantics/reflow and final mobile status CSS.
No concrete findings. Independently syntax/scoped whitespace/server4/B032 PASS;
actual final Chromium keyboard PASS22 API responses/18 AX checks/84 focus trace
entries/zero focus failures. Math probes: fractions render, zero active URL/HTML
elements, recursive and isolated macro failures retain fallback.

Reviewed math.js SHA256:
`c7c0a119f6319e57d17acf4d6268af4b98d7d811844e07402f29b073a5f25e58`.
Reviewed styles.css SHA256:
`bfe4489c6e2e92a3617ddca5f7344d7457be59572329279b99abde55928c20ea`.
Supplemental reviewer inspection/syntax/whitespace of Vietnamese labels,
retry-state assertion and launcher instructions: no concrete findings. Actual
Firefox and grade-failure runs belong to the coordinator, not the reviewer.
Missing-dependency fallback was structurally reviewed, not simulated by reviewer.

## Acceptance boundaries and continuation

| Acceptance area | Disposition |
| --- | --- |
| Three-domain persistent student journey | AUTOMATED_PASS |
| Math/table/mobile status fixes | AUTOMATED_PASS / INDEPENDENTLY_REVIEWED |
| Final TEST-002 HTTP extension | INDEPENDENTLY_REVIEWED; full TEST-002 remains IN_PROGRESS |
| Clean-checkout final demo | Pending final checkpoint reproduction; results appended when executed |
| Staff metadata subset | Implementation assigned separately; full review UI requires decision |
| Qualified screen reader/native zoom/formal accessibility | MANUAL_CHECK_PENDING; no conformance assertion |
| Real30-item inventory, rights and independent content review | HUMAN_APPROVAL_REQUIRED |
| Private staff preview/evidence/diagnostics routes | HUMAN_APPROVAL_REQUIRED; [proposal](../decisions/WEB_002_STAFF_READ_PROPOSAL.md) |
| Production identity/deployment/load targets | NOT_EXECUTED; outside local demo acceptance |

Full Bank/assembly/foundation/recovery/attempt/grading/result suites were not
rerun for this frontend-only change; earlier bounded evidence remains distinct.
No hosted CI, real-content qualification, full Technical MVP or production claim.
Next finish clean-checkout reproduction and integrate the existing-route staff
metadata slice; do not invent privileged read routes or human evidence.
