# WEB-002 publication-status clarity

2026-10-26, base5650e25, root Codex accountable UI/docs implementer. IMPLEMENTED /
AUTOMATED_PASS in executed scope. Existing B1 private inspection authorization and
frozen staff-review-context/1 response already expose publicationEligibility as
NOT_EVALUATED. This change renders that fact clearly; no new evaluation is made.

## Scope and outcome

The existing staff inspection now contains a named Publication eligibility section
before exact-version metadata. It says the inspection has not evaluated publication
and distinguishes APPROVED workflow/AVAILABLE preview from qualified human review,
content rights and permission to publish. The same section remains visible for
rights-blocked, unsupported or quarantined metadata-only inspections. Unknown/missing
status cannot become a positive assessment. There is no action, link or input in
this section. Existing private-view close/logout/identity fences apply unchanged.

Only staff.js and assertions in the existing Chrome/Firefox runners changed in
application/test code. No backend, migration, permission, API/schema/artifact,
student workflow, qualified reviewer or approval/publication command changed.
Owner AGENTS.md and research modifications remain excluded.

## Executed verification

Root Linux/Node24.18.0/npm11.16.0/PostgreSQL18.6/Chrome156/Firefox156:

```sh
node --input-type=module --check < apps/practice-prototype/public/app/staff.js
node --check scripts/verify-track-b-browser.mjs
node --check scripts/verify-student-firefox.mjs
npm run test:track-b:browser
npm run test:staff:firefox
npm run test:b0
npm run contracts:consumer-check
npm run docs:check
git diff --check
```

All exit0. Existing Chromium staff journey PASS46checks/29captures with explicit status assertions
for actual rights-blocked, AVAILABLE and QUARANTINED inspections; preview permission
cannot become an eligibility claim, and the section exposes no operation. Existing
Firefox staff journey PASS16checks/35captures with server-status/understandable-text/no-action checks.
B0 tests32 PASS; source/syntax/import boundaries/docs/whitespace pass. Desktop1280,
Chrome375 and actual Firefox500 (requested450 clamped) remain usable with no
horizontal overflow. Root inspected the actual narrow Firefox screenshot: the new
section wraps and stays separate from metadata, without covering controls. Captures
and logs are ignored local artifacts, not committed private evidence.

## Review and limits

INDEPENDENT_REVIEW_NOT_PERFORMED for this low-impact display change. The available
reviewer exhausted its usage quota; no retry or independent review is fabricated.
Earlier B1/B8 and WEB-003 reviews do not cover this later edit. Automated keyboard/
responsive checks are not qualified AT/native zoom or formal accessibility approval.
No real-content, publication, production or whole-MVP acceptance is implied.

## Clean-checkout reproduction —cb09027

Root2026-10-26 fresh `git clone --no-hardlinks`, detached exactcb09027 at
`/tmp/tsa-staff-status-clean-sXnxTf`; locked `npm ci --ignore-scripts` (zero audit
vulnerabilities), `npm run build`, `npm run test:track-b:browser`,
`npm run test:staff:firefox`, `npm run docs:check`: all exit0. Actual Chrome46checks/
29captures and Firefox16checks/35captures pass. Final `git status --short` empty.
No source patches, manual SQL/API setup or copied dependencies; this is root clean
reproduction, not independent review. Owned fixture teardown remains automatic.
