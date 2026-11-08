# RECOVERY-016 confirmed authentication-denial response fence

Date2026-11-04 Asia/Bangkok. Root Codex accountable implementer; response_review
actual independent read-only reviewer. Basea70861a/feat/track-b-data-auth with
inherited changes preserved. Sequential SDK ownership after RECOVERY015; no
server, database, grant, transport-schema or production identity changes.

## Defect and repair

Reviewer reproduced a preexisting SDK race: an authenticated attempt GET was held,
a catalog request returned401 while the cookie stayed unchanged, then the old
GET succeeded and restored the client cache. A subsequent save dispatched a PUT.
Server authorization still applied; this was client state resurrection, not a
server authorization bypass. The new regression failed before the repair with
“Missing expected rejection” (`/tmp/tsa-recovery016-negative.log`).

The [SDK](../../apps/practice-prototype/public/app/persistent-api.js) now advances
the identity generation and clears principal/attempt/profile/pending state after
confirmed UNAUTHENTICATED/FORBIDDEN responses. Its existing stale-generation
check runs first, so an older denial cannot invalidate a newer identity. Explicit
200 session observations of unauthenticated/noncandidate status also invalidate
state; session's own await is fenced before acting on that observation. An
unchanged cookie is no longer the only signal fencing pending responses.

## Verified behavior

[Unit regressions](../../apps/practice-prototype/test/persistent-api.test.mjs)
cover401,403, unauthenticated200session and noncandidate200session while an earlier
GET is held. A held save acknowledgement is also rejected after denial, with no
additional stale PUT. An old401 arriving after a newer login/read cannot clear
the newer cache. RECOVERY015 monotonic state/revision and acknowledgement cases
remain part of the same suite.

The [real HTTP/PostgreSQL regression](../../tests/integration/student-runtime/transport.test.mjs)
revokes an actual session using a separate HTTP logout request. It deliberately
ignores the logout Set-Cookie headers and retains the original client's cookie
values. A real subsequent catalog401 fences the captured authenticated GET; no
extra save is dispatched. Re-login recovers the stored rev3 answer, original
started/deadline instants and later one-job submission. No owner SQL simulates
revocation or successful save.

## Executed verification

Environment Node24.18.0/npm11.16.0/PostgreSQL18.6, local synthetic fixtures.

| Executed check | Observed final result | Evidence / scope |
| --- | --- | --- |
| Root focused unit+transport+fixedidentity command |20PASS,0fail/skip | `/tmp/tsa-recovery016-focused-final.log`. |
| Independent same command |20PASS,0fail/skip | Actual response_review, no concrete findings. |
| Root/reviewer SDK syntax/scoped whitespace |PASS | No application acceptance inferred from syntax. |

Focused command:
`node --test apps/practice-prototype/test/persistent-api.test.mjs tests/integration/student-runtime/transport.test.mjs tests/critical/persistent-api-fixed-attempt.test.mjs`.

Final combined RECOVERY015/016 root checks: B049PASS
(`/tmp/tsa-recovery016-b0.log`), student45PASS
(`/tmp/tsa-recovery016-student.log`), consumer boundariesPASS
(`/tmp/tsa-recovery016-boundaries.log`). Actual Chrome149.0.7827.55 three-domain
journey PASS with78 validated API responses/8captures, independent4/2/4 saves,
reloads, same-key lost-submit-ack retries,100% scores and owned history
(`/tmp/tsa-recovery016-browser/report.json`, command log
`/tmp/tsa-recovery016-browser.log`). Browser command used existing explicit
STUDENT_BROWSER path, test-only STUDENT_BROWSER_NO_SANDBOX=true and private
STUDENT_ARTIFACT_DIR=/tmp/tsa-recovery016-browser; no application sandbox policy
change. No fresh Firefox/manual AT run for this SDK-only repair.

VERIFIED complete in bounded SDK identity-fencing scope; actual independent
review reports no concrete findings. Final checks cover both consecutive client
repairs, superseding RECOVERY015's intermediate broader-source limitation.
Reviewed SDK SHA-256
`407dd2453df2d855e355fc3336071dd1e00535cb2b364e7eded3b0acb465c0e3`;
unit `8b1eb71376762032c9a1346f1fa94c8784013b6f33aa23c5d7c2719a037a6445`;
transport `2dfd39b7103e8a8eece7685fda4d78db483f168c69a6259a62745f159408473a`.

## Limits

Bounded client identity/state ordering only; no claim of a demonstrated user
gesture, production session security or new server authorization behavior.
Qualified human content/AT, separate pending architecture dispositions, full
critical matrix and production acceptance remain outstanding. No dependency,
commit, push, merge, deployment or paid-provider changes.
