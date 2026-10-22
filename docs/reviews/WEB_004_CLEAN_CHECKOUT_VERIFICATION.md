# Clean-checkout student integration

2026-10-22, branch `feat/track-b-data-auth`, base `13c56ad`.
[Owner authority](../decisions/LOCAL_STUDENT_INTEGRATION_AUTHORITY_2026_10_22.md).
Accountable Sol; Luna actually usage-limited. Separate read-only Sol6.1/Medium
reviewer is a genuinely separate engineering context, not human content review.

## Preserved and integrated

`02f2b61` preserves the necessary existing UI/demo/font baseline separately from
persistent integration. The index used `/tmp/tsa-client-owner-baseline/main.js`;
the working-tree integrated main file was never overwritten. Existing local
reference research and AGENTS.md are not staged. Original snapshots remain under
`/tmp/tsa-clean-integration-preserve` and `/tmp/tsa-client-owner-baseline`.

The following integration checkpoint contains the already verified persistent
main client and its stale-identity regression. It includes coordinated project
records, runnable npm aliases and a deliberately disposable interactive demo.
Historical review links to owner-local research are now explicit local-only paths;
no protected screenshots or unverified lawful inventory enter the checkpoint.
The portable README no longer claims a preview is currently running.

The launcher requires actual test mode plus both explicit synthetic/demo flags.
It reuses existing original mixed fixtures and their postmaster-bound disposable
review scope, a restricted worker login and loopback port0 runtime. It is not a
persistent/production stock seed and grants no new publication capability.
Readiness prints only a local URL/disposable notice. SIGINT/SIGTERM trigger ordered
idempotent cleanup; initial startup signals are remembered until resources can be
closed. Production or missing opt-in refuses before creating a fixture.

## Executed pre-checkpoint evidence

Pinned Node24.18.0/npm11.16.0/PostgreSQL18.6. Actual launcher tests2 PASS; full
student-runtime suite8 PASS. Separate Sol independently ran launcher2 PASS and
reviewed scope/cleanup/authorization, no P1/P2 findings. It also independently
verified12 font hashes/sizes plus license hash and legacy client/mock/static16.
All five prototype test file wrappers passed in that independent run; nested21
were verified in the preceding keyboard continuation, not fabricated from wrappers.

The persistent main/focus changes retain the prior actual separate engineering
reviews and Chromium/Firefox evidence linked in the preceding verification records.
No backend SQL, schema, frozen G1, real publication or provider call changed.

## Actual clean verification

Fresh local clone `/tmp/tsa-student-cf193e4-clean` at `cf193e4` passed actual
`npm ci --ignore-scripts --cache /tmp/tsa-track-b-pg-npm-cache` and build. No owner
files or installed node_modules were copied. Locked public dependencies were
installed successfully; no paid model API or browser download was used.
The clone was subsequently updated by local fetch and detached checkout to
`53b2c86` and `0cb49a2`, without merge. Dependencies/frozen contracts/backend source
are unchanged across those fixes; final clone tracked status/diff are clean.

| Executed clean-checkout command | Observed result |
|---|---|
| `npm ci --ignore-scripts`, `npm run build`, `typecheck`, `test:built` | PASS |
| `npm test`, `test:consumers`, `contracts:check`, `contracts:consumer-check` | 106/11 PASS; drift/import checks PASS |
| `test:db:foundation`, `test:auth`, `test:bank`, `test:assembly`, `test:attempts` | 34/5/94/23/28 PASS |
| `test:grading`, `test:recovery`, `test:results`, `test:directory` | 21/16/6/9 PASS |
| `test:student`, `test:scoring`, `test:local`, `test:b0` | 8/5/13/21 PASS |
| `test:student:browser`, `test:student:expiry` | Actual Chromium/PostgreSQL PASS |
| `test:student:keyboard` | Coordinator PASS74 focus entries, zero mismatches,18 AX checks; separate independent PASS below |
| `test:student:firefox`, `test:b0:browser` | Actual Firefox156 and default Chromium mock PASS |
| `docs:check` | Final clean clone PASS, zero errors; one preserved historical whitespace warning |

Backend/static/Chromium checks ran on `cf193e4`; docs/Firefox/mock were rerun after
`53b2c86`. Student8/docs were rerun after final launcher fix `0cb49a2`. There is no
backend/schema/contract change in these two fixes. Hosted CI was not observed.

Initial clean-clone failures were real and corrected: two historical references
still linked untracked owner-local research, and Snap Firefox could not use a
profile beneath the host /tmp checkout. References are explicit local-only text;
Firefox now creates a random owned child under its supported user common directory
(or an explicit profile-parent override) and removes only that child. It never
loads an existing user profile or changes browser security settings. Separate
Sol read-only review of `53b2c86`: no findings.

Independent clean-source keyboard execution at `cf193e4` actually PASS in separate
Sol6.1/Medium context:75 focus entries, zero mismatches,18 AX checks,22 inspected
API responses and six screenshots. The coordinator's different slot ordering
required74 focus entries; counts are observed, not a fixed acceptance target.
The reviewer's initial restricted run failed PostgreSQL Unix-socket binding;
its already accepted tool-approved elevated run passed without security-setting
changes. No screen-reader or conformance claim follows. Independent artifact:
`/tmp/tsa-cf-independent-keyboard/report.json`; coordinator: `/tmp/tsa-cf-keyboard`.

## Actual interactive shutdown defect and repair

The exact documented npm demo command served HTTP200/persistent client,
unauthenticated initial session and private fixture404. Actual terminal Ctrl+C
then exposed a defect missing from the earlier PID-only test: the fixture
postmaster shared the terminal process group and received SIGINT before pool
cleanup, producing an unhandled PostgreSQL connection error.

`0cb49a2` isolates the demo worker in its own process group. The supervisor forwards
one signal to the worker PID; existing ordered fixture cleanup owns PostgreSQL
shutdown. IPC disconnection schedules cleanup if the parent disappears. Worker
startup failure and completed cleanup disconnect IPC. An initial IPC version hung
because its channel remained referenced; this was fixed before the final pass,
and only identified owned hung test workers were terminated (no PG server active).
No shared PostgreSQL helper, runtime, schema or authorization control changed.

Final real-PG launcher2 PASS includes production/missing-opt-in denial and SIGINT
sent to the entire supervisor terminal process group, followed by clean exit0 and
closed listener. Tests have bounded failure cleanup. Separate Sol static review:
no P1/P2 findings. Its final runtime attempt failed under the restricted reviewer
execution context (2/2 failed before readiness/with empty child diagnostics), not
an independent pass; earlier pre-supervisor launcher2 was independently verified.
Early-startup signal and parent-death branches are reviewed but not explicitly
fault-injected. Do not claim complete crash/failure coverage.

The exact npm demo command was rerun in the final clean `0cb49a2` checkout: ready
URL, HTTP200 and Ctrl+C cleanup verified, with no unhandled database error. npm's
terminal cancellation returned status1; this is not represented as exit0. A direct
process-group launcher regression separately returns0. After shutdown the listener
was closed and /proc inspection found no owned demo worker or fixture postmaster.

The [manual accessibility packet](../quality/STUDENT_MANUAL_ACCESSIBILITY_CHECK.md)
is ready to execute against the disposable demo but remains NOT EXECUTED.
AGENTS.md and unrelated owner research remain byte-preserved and unstaged. The
existing baseline and integrated student implementation are now committed; the
prior working-tree-only limitation is superseded by this actual clean verification.

G1 accepted; G2/G3 owner accepted. WEB-004 remains IN_PROGRESS for qualified human
screen-reader/native zoom/full accessibility evidence. Track A incomplete; lawful
inventory and qualified rights/content reviews remain separate publication inputs.
No push/merge/deploy/Astra/paid model API/live student LLM/publication occurred.
