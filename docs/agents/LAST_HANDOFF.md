# Latest handoff — G1 accepted / Track B bounded batch verified

2026-10-19, Asia/Bangkok. Owner: G1 ACCEPTANCE AND TRACK B EXECUTION;
[authority](../decisions/OPEN_DECISIONS.md#g1--owner-acceptance-and-bounded-track-b-execution-2026-10-19).
G1 ACCEPTED in `27350b3`; FOUND-002 COMPLETED against implementation `0e67485`
and audit `81ef8aa`. G2/G3 remain unestablished; no unrelated whole ADR approved.

## Checkpoints and ownership

Branch `feat/track-b-b0-prototype`. `27350b3` records G1 only; `237da9c` preserves
the existing B0 separately. B0.1 is `06849d0`; the following local prerequisite
checkpoint contains its tests/readiness records (find hash in Git log). Owner
AGENTS.md is unchanged/excluded, SHA-256
`308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.

One reused native tsa_builder, Codex Luna / XHigh, implemented B0/B0.1 inside
`apps/practice-prototype`; Sol 6.1 / Medium independently inspected code/diffs,
ran actual Node/browser verification and owns root scripts/shared records.
The same worker then implemented the three disposable PostgreSQL probe files;
Sol independently reviewed and required cleanup/concurrency evidence repairs. All
reservations released. No extra explorer, Terra/Astra, dependency/lockfile/
accepted-contract change, push, merge, deployment or paid API.

## Runnable result

Same dependency-free Vietnamese frontend: landing/catalog, MATH fixture navigation,
answer selection/clearing and count, monotonic demonstration countdown, save/error
feedback, submission summary/confirmation and score. Reload visibly resumes the
same in-memory attempt, original deadline and acknowledged answers. Explicit
post-grade review displays the original fixture answer/explanation on a separate
screen; active/cancelled/foreign sessions cannot read that review. Ordinary result
responses remain score-only. Focus restoration and a semantic main landmark added.

All four slots repeat the original English synthetic fixture, visibly disclosed;
Reading/science unavailable. Cookie/session, attempts, saves, score and released
review are local mock services, not production auth, durable DB, approved content,
NEW_ONLY allocation or integrated backend acceptance. No fresh content invented.

## Independent evidence

Node v24.18.0/npm 11.16.0; Chromium 155.0.8059.79, Linux.

- `npm run test:b0`: 11 actual nested tests / 2 suites, zero failures/skips.
- `npm run test:b0:browser`: PASS, clear/re-answer, reload same attempt/deadline,
  active review 409, post-grade original explanation and back-score; pointer/radio
  keyboard, navigation retention, ticking clock, held-save guards, offline failure/
  retry, confirmation, result 25.00%, explicit new demo. No uncaught exceptions,
  external page requests or private pre-submit response fields.
- Desktop 1280x900/mobile 375x812 no horizontal overflow; eight screenshots in
  `/tmp/tsa-b0-browser-evidence`, review-mobile visually inspected by coordinator.
- Final batch independently reran typecheck/build/emitted smoke, 106 contract and
  11 emitted-consumer tests, 11 B0.1 tests, drift/import checks: all PASS. Contract
  tree/lockfile still identical to audited `0e67485`. Local transcript:
  `/tmp/tsa-track-b-final-verification.log` (transient; commands/results are durable here).
- Final docs/new-file whitespace/diff checks pass; historical whitespace and non-failing browser-ESM
  Node auto-detection warnings retained. Hosted CI not observed.

## Run and continue

From repository root: `npm run dev:b0` → http://127.0.0.1:4173.
No installation/build needed for B0; `PORT=4174 npm run dev:b0` for another port.
Browser check needs existing Chromium; B0_BROWSER selects its executable. Start
catalog → answer/clear/navigate → reload/resume → confirm submission → review
explanation → return to score/catalog/new demo. Original test text remains English;
navigation and notices are Vietnamese.

## Database prerequisite outcome and next scope

`npm run test:db:preflight` independently PASS on installed PostgreSQL 18.6:
11 named invariant checks in a new private cluster, Unix socket only. Both inverse
cross-mode same-user races observed actual Lock waits before winner commit and
loser SQLSTATE23505; separate distinct-user connections committed while the winner
remained uncommitted. Terminal replacement, rollback, full600/capped300 deadlines,
NULL/bad interval/TTL rejection, immutable creation fields and strict < boundary
PASS. Owned cluster/socket removal and no leftover task-owned server verified;
missing binaries explicitly fail rather than skip/pass. Worker’s initial restricted
socket failure was not accepted evidence; permitted run exposed/repaired a helper
default-argument bug, then coordinator independently verified final behavior.

Probe files under `tests/integration/database/approved-invariants` are fixtures,
not production migrations. No real application DB integration, start transaction,
mutable availability-edit transaction, complete FK/history/upgrade schema or auth
is accepted from them. Full DATA-001 remains incomplete.

All currently authorized READY tasks in this bounded batch are complete.
DATA-001 full schema/adapter still
requires affected ADR-001/003 disposition; AUTH-001 requires explicit local
synthetic-only stub approval. Bank stock needs rights evidence and named independent
human review/publication; assembly/attempt/scoring follow their gates. Ten-question
B1 target does not authorize a combined 4/2/4 domain attempt.

Track B remains ~85% priority; lightweight source/quality/taxonomy/rubric preparation
is in the roadmap without downloads or benchmarking. Prior handoff checkpoints:
`237da9c` B0; `81ef8aa` final audit; `0fc75d8` Stage 4B; `8beb0ff` Stage 4A;
`84ddff3` Stage 3. Consult decisions, not historical pending-G1 phrases, for current
approval. Full deployed security/DB/publication/WCAG evidence remains later work.
