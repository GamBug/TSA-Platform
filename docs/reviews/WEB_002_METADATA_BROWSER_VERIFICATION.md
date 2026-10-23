# WEB-002 existing-route metadata dashboard

2026-10-23. Accountable integrator: Codex root; actual implementation delegate:
native `/root/staff_metadata`, Luna/XHigh. Starting review/mission checkpoint
`1d6bf4d`; student implementation advanced independently to `be4705d`. Delegate
owned only staff.js and the existing staff browser harness. Root added the final
role-appropriate title and version-list wording and owns coordinated records.
Status: bounded subset **AUTOMATED_PASS / INDEPENDENTLY_REVIEWED**; full WEB-002
remains blocked on the [private read contract](../decisions/WEB_002_STAFF_READ_PROPOSAL.md).

## Implemented subset

Existing `GET /api/v1/questions` now powers state and section filters, 20-row
cursor pages and a load-more action. Exact question/version/hash metadata is
visible with loading/empty/error/count feedback. No private preview, reviewer
answer/evidence read, approval, rights edit, quarantine or diagnostics action was
added. Current server authorization remains AUTHOR/REVIEWER/BANK_MANAGER; direct
student access is denied by the API. The synthetic reviewer disclosure explicitly
does not establish a qualified human review. Workflow state alone is not a
publication-eligibility promise.

Successful draft POST clears its idempotency key before list refresh; a failed
refresh is a separate list error and does not relabel the committed creation as
failed. Filters, logout/identity and workspace-lifetime guards discard stale
responses instead of updating the wrong screen or identity.

## Independent finding and repair

Separate actual native `/root/lifecycle_review`, Sol6.1/Medium, found P2: a held
list response from a closed staff workspace could overwrite a newly reopened
workspace in the same DOM container. Its independent inline Node DOM/fetch
reproduction confirmed stale rows replacing newer rows. That initial review did
not pass and was not treated as acceptance.

Delegate repaired it using a per-container workspace generation, invalidated on
every return path. Session/template/list/login/logout/create/render/message
completions check the active generation. Added regression holds an actual GET
response, leaves/reopens staff, releases the old response and checks successor
rows/status/cursor remain intact. Final independent reproduction and browser
recheck PASS; no unresolved findings.

Final reviewed SHA256:

- staff.js: `349a56afe841448df04eb79538cfcc7bc508ce0cfc1215a6b6dfcc59e93543f1`.
- verify-track-b-browser.mjs: `d7f028d3c0de221b8f54223ec92cca6ac68af67f477fc7b77c932410246ad620`.

## Actual verification

Linux, Node24.18.0/npm11.16.0/PostgreSQL18.6/Chromium155.0.8059.79.

| Executor / exact command | Observed result |
| --- | --- |
| Delegate `npm run test:track-b:browser` | Initial subset and final repaired runs PASS |
| Delegate `npm run test:local` | PASS15 before generation-only repair |
| Delegate `npm test` / `npm run typecheck` / `npm run contracts:check` | PASS106 / PASS / PASS; no route/schema change |
| Delegate syntax/scoped whitespace / `npm run docs:check` | PASS; docs zero errors/one historical warning |
| Reviewer inline `node --input-type=module` reproduction | Initial P2 reproduced; repaired regression PASS |
| Reviewer `TRACK_B_ARTIFACT_DIR=/tmp/tsa-review-staff-final npm run test:track-b:browser` | PASS, exit0, actual PostgreSQL and Chromium |
| Reviewer `node --check apps/practice-prototype/public/app/staff.js` and `node --check scripts/verify-track-b-browser.mjs` | PASS; final wording inspected after browser run |
| Reviewer scoped `git diff --check` | PASS |
| Coordinator `npm run test:track-b:browser` | Final wording/generation bytes PASS |

Browser evidence covers actual21-draft cursor paging, labels and Enter activation,
state/section filtering, exact version/hash, loading/empty/error recovery, out-of-
order filter and identity responses, return/reopen, idempotent lost-acknowledgment
create, actual student403 FORBIDDEN, metadata minimization and no reviewer creation
controls. Delayed responses and injected503s are browser interceptions around real
requests; they do not prove a real database outage. Native keyboard focus is set
programmatically before Enter for load-more; this is not full keyboard traversal
or qualified accessibility acceptance. Mobile375 width has no page overflow.
Coordinator visually inspected mobile workspace and desktop metadata screenshots.

Artifacts: `/tmp/tsa-track-b-browser-evidence` and reviewer
`/tmp/tsa-review-staff-final`; no uncaught page errors or external requests in the
observed journey. No fixture keys/evidence bundled in public assets, new routes,
roles, contracts, paid APIs or publication authority added. Existing author-only
private template remains authorized runtime data, not a public fixture.

Full author→qualified reviewer→publication→assembly, stale real review,
quarantine/withdrawal UI and private preview XSS acceptance are **NOT_EXECUTED**:
these controls were not added. Separate current backend evidence is not relabeled
as UI acceptance. Human rights/content review, lawful30-item inventory and
production identity remain outstanding. Next is the owner-scoped private read
contract decision; available metadata work does not grant that approval.
