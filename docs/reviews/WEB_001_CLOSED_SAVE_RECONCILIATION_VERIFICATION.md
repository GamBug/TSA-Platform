# WEB-001 closed-save reconciliation — executed evidence

2026-10-22, branch `feat/track-b-data-auth`, base `f5ec6cf`. Accountable implementer
Sol6.1; Luna/XHigh remains usage-limited. Scope: repair a concrete stale-tab
student-state defect found by separate read-only engineering audit. No Bank,
schema, frozen contract, solver, rights/publication or UI reconstruction changes.

## Defect and repair

If another tab submitted an attempt, a subsequent save in the stale tab received
409 ATTEMPT_CLOSED but retained the cached active exam and offered write retry.
The existing backend correctly rejected the write. The UI now offers an explicit
authoritative state read. Failed reads preserve pending choices and offer another
read; they do not claim a save or silently discard the draft. Successful terminal
reads pass pending state to the existing terminal renderer, which clears it after
showing the authoritative submitted/result state. Late success or error cannot
replace a changed identity or a newer attempt object.

The independent reviewer found an important adjacent ambiguity before acceptance:
a save may commit while its acknowledgement is lost. A terminal read cannot prove
that unacknowledged change was excluded. The final notice therefore states that
this tab did not receive acknowledgement and scoring uses answers recorded by the
server before closure. It does not falsely claim an uncertain write was excluded.
No new save retry semantics or public error codes were introduced.

## Actual browser and PostgreSQL evidence

`npm run test:student:closed-save` actually ran Chromium155/PostgreSQL18.6 with
original isolated postmaster-scoped synthetic fixtures and two real browser tabs.

1. Candidate A saves one correct answer, another tab submits, and the first tab
   tries a different answer. Actual409 is observed; SQL answer/revision remains
   unchanged. The UI offers state refresh. An offline refresh fails and preserves
   the visible pending choice; reconnect/read reaches submitted/pending state.
   The frozen original answer grades25.00%, excluding the rejected new write.
2. Candidate B's correct save actually commits, but browser transport discards its
   acknowledgement. Another tab submits; explicit reconciliation reads terminal
   state without falsely labelling the saved answer excluded. The committed answer
   also grades25.00%. This is allowed cross-student reuse, not same-student reuse.

Final run PASS:45 API responses inspected, four screenshots, no uncaught browser
exceptions, no mock or external requests. Browser test privacy inspection excludes
only successful authorized result responses from the pre-release private-field
ban. Temporary artifacts: `/tmp/tsa-student-browser-evidence/closed-save/report.json`
and four PNGs. Final disposable attempt IDs: A
`f67ed242-bdae-40bc-b316-40a76f2cc66d`, B
`f72318a4-2c48-4f21-ab00-44f521d1e4b4`. Fixture database is discarded after the run.

The first browser attempt failed at capture Runtime.evaluate because the first
page was backgrounded after opening tab two. Explicit Page.bringToFront fixed the
animation-frame capture wait. No passing result is claimed for that initial run.
The first implementation's misleading exclusion notice was corrected following
actual independent review before final verification.

## Executed checks

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6, Chrome155.0.8059.79, Firefox156.0,
Linux,2026-10-22. All rows executed; no mocked transactional integration claim.

| Command | Actual outcome |
|---|---|
| `node --test apps/practice-prototype/test/persistent-state.test.mjs` | PASS12, actual private callbacks extracted without production exports/DOM dependency |
| `npm run test:b0` | PASS31 |
| `npm run test:student` | PASS9 |
| `npm run test:attempts` | PASS28 |
| `npm run test:results` | PASS6 |
| `npm run test:student:closed-save` | PASS two-tab rejected-write and committed-lost-ACK cases |
| `npm run test:student:browser` | PASS ordinary PostgreSQL mixed-type journey |
| `npm run test:student:keyboard` | PASS actual keyboard/reflow/AX smoke journey |
| `npm run test:student:expiry` | PASS actual configured8-second expiry/recovery |
| `npm run test:student:firefox` | PASS actual mixed-type Firefox journey |
| `npm run build` / `npm run typecheck` | PASS |
| `npm test` / `npm run test:consumers` | PASS106 / PASS11 |
| `npm run contracts:check` / `npm run contracts:consumer-check` | PASS |
| `npm run docs:check` / scoped `git diff --check` | PASS; one preserved historical whitespace warning |

Callback cases cover SUBMITTED/EXPIRED/GRADED terminal reads, single/multiple draft
preservation on failed reads, late success and401 after identity/attempt changes,
and a committed save whose ACK was lost. Existing ordinary revision-conflict
browser reconciliation still passes. No new Bank/schema changes warrant rerunning
unrelated Bank/foundation suites here; their prior evidence remains separate.
Hosted CI, qualified screen reader/native200% zoom and lawful real inventory remain
unverified; AX/reflow smoke is not accessibility conformance evidence.
Temporary logs `/tmp/tsa-closed-save-*.log`; captures are not committed artifacts.

## Independent engineering review

Actual separate `/root/directory_review`, read-only Sol6.1/Medium: reproduced the
original issue, found the uncertain-ACK notice defect, independently executed final
callback12/12 PASS, and reviewed final code/browser harness with no open P1/P2.
Syntax/scoped whitespace PASS, no files changed. Actual PG/browser executions above
are coordinator evidence; no independent PG/browser execution is claimed.
This is engineering review, not qualified human content/accessibility review.

## Continuation

G1 accepted; G2/G3 OWNER_ACCEPTED unchanged. WEB-001 remains IN_PROGRESS overall.
The audit of [MVP scope](../specifications/MVP_SCOPE.md) also identified missing
browser-backed evidence for all three independently selected profiles; existing
full journeys use MATH4. Next executable card: original isolated READING2/SCIENCE4
fixtures plus MATH4, actual catalog selection, separate clocks, H1 cross-domain
blocking, save/reload/submit/result/history and no automatic chaining. Reuse frozen
APIs and current supported content types; do not seed retained/production inventory
or claim the required shared reading stimulus/full bundle acceptance from standalone
fixtures. No Bank expansion or reference-UI work is authorized by that test card.
Qualified manual accessibility and lawful independent human review remain distinct.
Recommended Sol6.1/High for integration while Luna is usage-limited; separate
Sol6.1/Medium engineering review. No paid model API or live student inference.

Owner AGENTS.md SHA256 `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`
and owner-local research SHA256 `6dbab1f88148251cf3cd86e24492e35a9166e64bdfe21ab862a0cbe2666592ba`
remain preserved and unstaged. No push/merge/deploy/unauthorized publication.
All reservations released at checkpoint.
