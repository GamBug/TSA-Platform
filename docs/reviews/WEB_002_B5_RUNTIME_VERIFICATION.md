# WEB-002 B5.1 recorded review history — runtime verification

2026-10-24 Asia/Bangkok, branch `feat/track-b-data-auth`, basefec7467.
Root accountable for backend/HTTP-PG/browser/Firefox/launcher/shared records.
Actual configured native Luna/XHigh writers owned disjoint private contracts and
UI/CSS, completed/released. Routing metadata was not observable inside workers.
Owner AGENTS.md/untracked research preserved/excluded. No paid API/dependency.

Authority is root selection under owner engineering-choice delegation, not invented
whole-B5 human approval: [exact decision/impact](../decisions/WEB_002_B5_REVIEW_HISTORY_DECISION.md).
Existing B1–B4/root/student/released/public shapes remain stable. Additive private
StaffReviewHistorySchema/type/operation and opt-in GET for current BANK_MANAGER
with existing bank.diagnostics.read; default handler opt-in false, enabled in local
synthetic app/disposable fixture. No grants/migration/APPROVE/publication action.

## Implemented behavior

One REPEATABLE READ, READ ONLY restricted Bank transaction reads version/workflow
and at most21 immutable review rows, returns latest20 ordered timestamp/id descending
and explicit truncation. Exact hash/schema/order/size checks fail closed503 for
corrupt data. No application writes/read-audit mutation. No extra structured
question/key/explanation or author/reviewer/operator identity fields. Managers see
stored reasons verbatim; arbitrary reasons may contain pasted private content or
identities. No redaction/no-embedded-secrets guarantee; keep text inert and private.
Historical APPROVE/REJECT does not attest qualification, rights or present eligibility.

Explicit manager-only metadata action, no prefetch, separate exact observation/
current workflow versus historical decisions, six findings/reason, empty/latest20
messages. Shared private host clears on new target/close/Escape/return/logout/
identity/workspace generation; late responses cannot reopen it. Wrong-version/hash
or malformed response shows error with explicit read retry, never stale history.
No mutation/automatic handoff or private persistent storage. Close/Escape restores
focus. [Supervisor journey](../guides/TRACK_B_SUPERVISOR_DEMO.md#optional-staff-demonstration)
now includes actual author→reviewer rejection→manager history without manual SQL/API.

## Executed root checks

Linux, Node24.18.0/npm11.16.0, PostgreSQL, Chrome156.0.8078.47/Firefox156. Passing
counts have zero failures/cancellations/skips. Ignored logs/captures under
`.local/verification-b5/`; no DBs/tokens/profiles/private evidence committed.

| Command | Observed result |
| --- | --- |
| `npm run build` / `npm run typecheck` | PASS |
| `npm run test:staff:review` | PASS37, four new B5 HTTP/PG cases plus existing integration/migration/CLI |
| `npm run test:bank` | PASS131 |
| `npm test` / `npm run test:consumers` | PASS133 / PASS11 |
| `npm run test:local` / `npm run test:b0` | PASS15 / PASS32 |
| `npm run test:built` / `npm run contracts:check` / `npm run contracts:consumer-check` | PASS emitted/private artifacts and app/student boundary |
| `TRACK_B_ARTIFACT_DIR=.local/verification-b5/chrome npm run test:track-b:browser` | PASS37 checks/18 captures,375/document375/scale1 |
| `STUDENT_FIREFOX_ARTIFACT_DIR=.local/verification-b5/firefox npm run test:staff:firefox` | PASS11 checks/21 captures; student+B1–B4/editor+B5,1280/actual500 narrow |
| `STUDENT_ARTIFACT_DIR=.local/verification-b5/domains npm run test:student:domains` | PASS78 actual independent-domain responses |
| `node --test tests/integration/bank/review-demo.test.mjs` after history assertions/instructions | PASS2 |

HTTP/PG proves actual rejection history and held empty workflow, unchanged counts/
hashes across all application tables, current role revocation, role-before-object,
unauth/author/reviewer/candidate/exam-manager denial, default-off/malformed opt-in,
unknown/malformed ID, Origin/method/query/GET body/request-ID/header contracts,
stable latest20 on exact timestamp ties, truthful truncation, malformed/oversized
stored rows and controlled wrong-hash safe503. Trusted synthetic ordering/history
rows do not represent actual qualified review or change workflow/eligible pointers.
Existing restricted SELECT privileges suffice; no new grant assumed/created.

Chrome adds exact empty and genuine UI REJECT history, hostile reason inert text,
mobile/desktop, Escape/close focus/privacy, wrong-version error/explicit retry,
held response across target, return→reopen and logout→candidate, direct candidate/
reviewer403 and all bodyless GETs. Trusted administrative display rows exercise
actual20-entry/truncation UI and historical APPROVE labels; they do not synthesize
qualified reviewers or publish content. All other accepted mutations are actual
PostgreSQL commands; interceptions model delay or wrong response only. Firefox
actually checks manager empty/REJECT exact history, hostile reason inert, desktop/
narrow, Escape focus and close/logout cleanup alongside student and existing flows.
Root inspected actual375px wrapped reason capture. Firefox clamps375/450 to actual500.

Observed failures/repairs: initial Chrome assertion used the old exact banner
phrase; assertion now checks its unchanged explicit-selection meaning. Next run
failed because return→reopen resets the list to DRAFT; the test now explicitly
selects all states before reopening REJECTED history. No product change for either
setup failure. Contract initial absent-export red and test-helper typing errors
were fixed before final PASS. No failed/preparatory outcome counted as PASS.

## Actual independent review

Separate read-only `/root/lifecycle_review`, configured Sol6.1/Medium, final no
unresolved findings againstfec7467. P2 decision ambiguity repaired: structured
projection exclusions do not promise arbitrary reason text is redacted; root
explicitly selects manager disclosure of that untrusted text. No access expansion
to students/authors/reviewers. Independently focused B5PG/HTTP4, history/artifact/
built/export contracts9, private drift, typecheck/consumer boundaries, six syntax
and scoped whitespace PASS. Final actual Chrome37/18captures at
`/tmp/tsa-review-b5-final`,375/document375/scale1; mobile reason capture inspected.
One attempted nonexistent boundary npm alias did not execute a test; actual scripts
subsequently PASS. Firefox source/syntax only, not independent execution. No reviewer
writes/commits/installs/paid services. Latest launcher assertion expansion is root
PASS2, distinct from independent earlier CLI coverage.

Reviewed service SHA-256:
`30110d66c3e19257f640c7d4723124ae852f87953d39e64f65257035182981d6`.
Reviewed staff.js:
`a5b70b7432ddd72e37ce6b9943b3d482cf3d597a4a65f07aad6ec05fd20e9584`.

## Remaining

AUTOMATED_PASS / INDEPENDENTLY_REVIEWED within scope; MANUAL_CHECK_PENDING for
qualified AT/native zoom/accessibility. No performance/load/real content/rights/
human reviewer/production acceptance. Full WEB-002/Technical MVP is incomplete:
publication eligibility remains NOT_EVALUATED, no approval/rights-edit UI or actual
fixed-run assembly diagnostics service yet. Personal run manifests/history must
remain inaccessible to general staff. Lawful accepted12/6/12 inventory and named
attestor/qualified reviewer remain external inputs. No push/merge/deploy/Astra/
paid API/live student inference. Clean reproduction follows implementation commit;
append only observed outcomes.
