# WEB-004 actual save-rate-limit browser evidence — 2026-10-23

Bounded engineering coverage IMPLEMENTED / VERIFIED from `d6eaee0` on
`feat/track-b-data-auth`. Accountable implementer: Codex Sol6.1. Existing local
student-integration authority applies. Starting owner changes were AGENTS.md and
untracked reference research; both remain byte-preserved and excluded. Luna was
previously usage-limited, so Sol implemented directly with separate Sol6.1/Medium
read-only engineering review. No product defect reproduced or product code changed.

## Implemented scope

New [browser journey](../../scripts/student-rate-limit-journey.mjs) reuses the
existing shared-reading fixture, real restricted runtime, grader and Chromium
runner. Two explicit commands independently exhaust USER_SAVE or ATTEMPT_SAVE;
the other bucket remains ample. Each uses capacity1 and refill0.1 tokens/second
in an isolated original synthetic fixture. No mocked429, clock substitution,
bucket timestamp/token mutation, production stock or publication bypass is used.
The fetch wrapper only observes actual responses and returns them unchanged.

Each journey verifies:

- First answer receives200 and consumes the selected budget. Second answer gets
  actual429 with positive integer Retry-After matching error.details.retryAfterSeconds.
- Pending choice remains selected and visibly unsaved. Previous/next/navigator,
  catalog and submit stay disabled. A deliberate early explicit retry gets429.
- Both denials leave answers, the second-slot receipt and both persisted budget
  rows unchanged. No background retry occurs while waiting for actual DB refill.
- Explicit retry after real refill uses the same idempotency key and exact body,
  succeeds once, clears pending feedback and persists revision1. Both answers and
  the original start/deadline remain intact; exactly one second-slot receipt exists.
- Submission returns200 and grading returns2/2,100.00%, one job. Both save-bucket
  rows remain identical across submission/grading, and the selected budget remains
  unavailable even after the result. Submission does not consume save capacity.

Observed save statuses for each independent scope: `[200,429,429,200]`;
both Retry-After values were10 seconds. Four screenshots and20 inspected API
responses per scope; existing response scanning rejects private pre-release fields.
Coordinator visually inspected ATTEMPT_SAVE pending screenshot: selected C,
unsaved status, wait/retry message and disabled navigation/submit were visible.

## Actual verification

Node24.18.0, npm11.16.0, pinned PostgreSQL18.6, Chromium155.0.8059.79, Linux.
All commands below executed successfully, zero failures/skips in counted suites.

| Command | Observed result |
|---|---|
| `npm run test:student:rate-limit` | PASS, USER_SAVE,20 responses/four screenshots |
| `npm run test:student:rate-limit:attempt` | PASS, ATTEMPT_SAVE,20 responses/four screenshots |
| `npm run test:student:browser` | PASS, existing mixed-question journey/six screenshots |
| `npm run test:student:reading` | PASS, existing shared-passage journey/32 responses/seven screenshots |
| `npm run test:attempts` | 28/28 PASS, including independent-handler429/no mutation and submit budget isolation |
| `npm run test:student` | 31/31 PASS, including process/restart/restore/security regressions |
| `npm test` | 106/106 PASS |
| `npm run test:consumers` | 11/11 PASS |
| `npm run build`, `npm run typecheck`, `npm run test:built` | PASS |
| `npm run contracts:check`, `npm run contracts:consumer-check` | PASS |
| `npm run docs:check`, `git diff --check` | PASS; existing historical whitespace warning only |
| `node --check` on both changed browser scripts | PASS |

Transient reports/screenshots are under
`/tmp/tsa-student-browser-evidence/rate-limit-user_save` and
`/tmp/tsa-student-browser-evidence/rate-limit-attempt_save`; commands regenerate them.
Initial USER_SAVE run passed; separate review requested stronger submission-budget
assertions. Final USER_SAVE rerun and ATTEMPT_SAVE run both passed those assertions.
No product failure was hidden. Existing module-type auto-detection warning remains.
Bank/assembly/foundation full suites and Firefox were not rerun for these test-only
runner changes; prior results are historical, not fresh verification here.

## Independent review and continuation

Separate native Sol6.1/Medium context `directory_review` reviewed scenario, runner
and command wiring read-only. It identified the missing before/after save-budget
comparison around submission; implementer added it and an after-result depletion
assertion. Final reviewer reported no remaining concrete findings and independently
passed syntax/whitespace checks. Reviewer did not execute PostgreSQL or browser
checks; actual runtime evidence above belongs to the coordinator. This engineering
review is not qualified human content, rights or accessibility acceptance.

No frozen G1 API/schema, product renderer/transport, rights/review/publication
control, dependency or lockfile changed. No push, merge, deployment, Astra, paid
model API, live student inference or unauthorized publication. G1 accepted and
G2/G3 OWNER_ACCEPTED remain unchanged. WEB-004 full acceptance, lawful inventory,
named qualified human reviews, manual AT/native zoom and Track A remain distinct.

Next bounded WEB-004/EXAM-002 card: deadline expiry while a real429 answer is
pending. Use existing isolated original fixture and real save budget, preserve
acknowledged answers, reject the unsaved pending answer, reconcile authoritative
expiry, and verify immutable clocks/history with one original-input score/release.
Existing expiry and rate-limit journeys test these boundaries separately; the
combined browser path has not been verified. Reuse existing contracts and change
product only for a reproduced defect. Recommended Sol6.1/High while Luna remains
usage-limited, separate Sol6.1/Medium read-only review. No new policy is required.
