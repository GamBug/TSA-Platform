# WEB-002 staff session binding verification

2026-10-26, feat/track-b-data-auth, based4929a0. Root Codex accountable implementer;
IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED in exact scopes below.
Existing B1–B8 APIs only; no B9 runtime or new privilege. Owner AGENTS.md and
untracked research preserved/excluded. No paid API/Astra/deploy/push/real-content
approval. Recommended existing Codex root/Sol6.1 High integration, separate native
Sol6.1 Medium read-only security review; the latter actually executed this session.

## Reproduced defect and repair

Actual Chromium kept an EXAM_MANAGER confirmation open while real local-auth
logout/bootstrap/login rotated the same synthetic actor's session without notifying
the workspace (models another tab). The old client read the replacement nonce at
POST time: another actual rehearsal was stored. Regression failed with capture
count3 rather than2; this is executed defect evidence, not a hypothetical assertion.

The workspace now binds an authenticated session read to its observed CSRF nonce.
Every subsequent workspace request captures that binding and identity epoch. Writes
send its original nonce, reads and writes check current binding before/after the
response and JSON parsing. A changed session before dispatch sends no command;
a switch at dispatch fails existing server CSRF validation with403. Local cleanup
removes private views/dialogs/list/template/draft key/confirmations and fences old
responses. It does not log out the replacement session. The visible recovery action
explicitly reads the current session; it never repeats an old command or consent.
Ordinary logout is also bound, so a stale tab cannot revoke the replacement session.

Initial bootstrap/login/session are intentional existing auth transitions. Session
refresh requests have sequence/epoch/binding guards: delayed success or error from
an older read cannot clear or replace a newer recovered workspace. Stale request
errors normalize to a local client error; no server error/schema was added. Draft
submission and logout completion also fence their UI side effects by epoch. A prior
command may already have committed; the recovery notice does not claim rollback.
Normal same-session uncertain retries retain original body/key and nonce.

No cookie/token/key is added to request bodies, logs, receipts or DOM. The nonce
stays in closure state and the existing CSRF header. Backend role checks, existing
routes, immutable records, replay policy, scoring/timing and student modules remain
unchanged. Source scope: staff.js and existing Chrome/Firefox staff runner assertions.

## Executed root verification

Node24.18.0/npm11.16.0/PostgreSQL18.6/Chrome156/Firefox156/Linux. Commands:

```sh
node --input-type=module --check < apps/practice-prototype/public/app/staff.js
node --check scripts/verify-track-b-browser.mjs
node --check scripts/verify-student-firefox.mjs
npm run test:track-b:browser
npm run test:staff:firefox
npm run test:b0
npm run test:local
npm run contracts:consumer-check
npm run docs:check
git diff --check
```

All final commands exit0. Chromium48checks/29captures includes original B1–B8 flows,
real pre-dispatch rotation0POST and dispatch-time403 with zero extra capture,
replacement still authenticated, GET-only explicit recovery, older real successful
session response held across recovery and controlled late503. Neither older result
can wipe newer workspace or create another command. The503 is a controlled response
fault after a real successful HTTP read, not an observed PostgreSQL outage.

Firefox17checks/37captures covers the existing student/staff flow plus real session
rotation while confirmation is open, no capture/POST, private/intent DOM cleanup,
heading focus, explicit read-only recovery and desktop1280/actual narrow500px.
Requested450 remains clamped by Firefox. No horizontal overflow or external page
resources. Root inspected the narrow recovery screenshot: notice/action fit and no
private content remained. B032/local15 pass; syntax/import/docs/whitespace pass.
An initial added Firefox harness line had incorrect string quoting; syntax caught
it before a browser launched, repaired without changing product assertions.

## Independent attribution

Actual native read-only `/root/b9_design_review`, Codex Sol6.1/Medium. No file writes.
Inspected request/session/B3/B4/B8 flows and existing server nonce validation. Found
P2 delayed-refresh and stale-error paths in the first patch; root added sequencing/
normalization and guards, final source review reports no unresolved finding.

Independent final `TRACK_B_ARTIFACT_DIR=/tmp/tsa-review-staff-session-final-20261026 npm run test:track-b:browser`:
exit0, Chrome156,48checks/29captures. Same source hashes at launch and completion:

- staff.js: ea9006b157ca9f3aa42dfda500526a60ea45695b10dc3578906b5a745237e138
- verify-track-b-browser.mjs: f94f685ba9abab9af44b82c0bf43d80b52f59d10372e42bba4d18a14805cd6a1

Independent B032/syntax/whitespace PASS. Earlier intermediate47-check run passed
while files were changing; it is not the final-byte evidence above. Firefox
supplement NOT_REVIEWED / NOT_EXECUTED independently. Reviewer had no capacity
error this session. Separate B9 source-only design finding/disposition is in
[the design record](WEB_002_B9_DESIGN_REVIEW.md), not runtime approval.

## Limits and continuation

Clean checkpoint reproduction pending. No qualified accessibility/native zoom,
lawful12/6/12 inventory, qualified human review, fixed student delivery, performance
or production acceptance. Existing manual review packet remains pending. B9's new
privileged contract remains PROPOSED / HUMAN_APPROVAL_REQUIRED; this repair uses
existing authorized routes and supplies no sealing authority.
