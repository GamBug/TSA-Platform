# Latest handoff — FOUND-002 Stage 4A evidence

Date: 2026-10-19, Asia/Bangkok. Coordinator/integration reviewer: Codex Sol 6.1 /
Medium. Owner authority: "STAGE 4A — BOUNDED AUTOPILOT ACTIVATION", recorded in
[decisions](../decisions/OPEN_DECISIONS.md#stage-4a-bounded-autopilot-authorization--2026-10-19).
Stage 4A COMPLETED; FOUND-002 IN_PROGRESS; G1 NOT ESTABLISHED; DATA-001 BLOCKED.
Stage 4B NOT STARTED. No public contract or semantic choice was implemented.

## Git, ownership and delegated execution

- Branch: `feat/found-002-stage4a-evidence`; starting HEAD `84ddff384fb6ab4f03012e14b4000b0744dcefec`.
  Engineering checkpoint `dadd60e`: emitted consumer runtime/type tests, root command,
  CI and README. The following evidence/coordination commit contains this handoff;
  use Git history for its hash. Prior Stage 3 history/evidence is preserved at
  `84ddff3:docs/agents/LAST_HANDOFF.md`; no Stage 2 audit was repeated.
- Initial dirty file: owner `AGENTS.md`, SHA-256
  `308046c611091dfc06b283e756c035a7fbd203f91553a0b36c083dbc37217b8b`.
  Bytes preserved, excluded from staging/commits. No other initial modifications.
- Exactly two subagents, one writing worker. Reused native `tsa_builder`
  `/root/found_002_stage3_builder` wrote the five engineering paths; native
  `tsa_scout` `/root/stage4a_dependency_evidence` inspected dependencies read-only.
  Runtime metadata independently confirms both `gpt-6-luna` / `xhigh`.
- Builder session `01a14faa-f16b-7030-a5f4-2624dbe81f48`; scout session
  `01a151ca-3ca8-7b53-81ea-77f00e91aea5`, parent
  `01a14fa8-ca00-70c3-bb57-e78c5e9bc64d`. Local rollout metadata under
  `~/.codex/sessions/2026/10/18/` and `2026/10/19/` is routing evidence, not a
  model self-report. Scout could not call external services under its role;
  coordinator performed the online checks and independently matched its inventory.
- Coordinator alone wrote review/decision/tracking records and reviewed actual new
  files/diffs. Worker claims were independently tested. No additional reviewer
  agent, Terra or Astra. Relative agent cost: low–medium for bounded inventory,
  medium for test implementation; actual plan-credit charges are not available.

## Completed evidence and scope limits

`test:consumers` adds five checks against emitted JS/declarations: independent
synthetic producer/consumer process JSON handoff; malformed/APPROVED/unknown-field
rejection; strict changed-response/hypothetical optional-field rejection; safe
student projection; and strict TypeScript declaration consumption with expected
errors for private fields and wrong interaction shapes. CI runs it after build.
No source fallback, real service, database transaction, generated HTTP client,
physical private-export isolation or browser-bundle security is claimed.

[Dependency review](../reviews/FOUND002_STAGE4A_DEPENDENCIES.md) records seven exact
locked/installed versions, independently hashed license texts, declared engine/peer
compatibility and dated primary support sources. Registry audit returned zero
reported advisories, not a vulnerability-free guarantee. No installation/upgrade.
The [single decision packet](../reviews/G1_STAGE4A_DECISIONS.md) classifies all
remaining work and gives options, recommendations, consequences and dependencies.
No authoritative product/architecture contract was changed by those proposals.

## Independently executed verification

Environment: Node `v24.18.0`, npm `11.16.0`, TypeScript `5.9.3`, 2026-10-19.

| Command/check | Observed result |
|---|---|
| `npm run build` | PASS, exit 0 |
| `npm run test:built` | PASS, exit 0 |
| `npm run test:consumers` | PASS in scoped approved execution: five tests, one suite, zero failures/skips |
| `npm run typecheck` | PASS, exit 0 |
| `npm test` | PASS, eight existing test files, zero failures/skips |
| `npm run contracts:check` | PASS, committed OpenAPI unchanged |
| `npm run docs:check` | PASS, zero errors; historical whitespace warning only |
| `git diff --check` and staged diff integrity | PASS |
| `npm ls --all --json` | PASS, installed/locked graph and peers match |
| `npm audit --json --ignore-scripts --cache /tmp/tsa-stage4a-npm-cache` | PASS in scoped approved execution, report v2: zero registry-reported vulnerabilities |
| Protected-path/owner-hash comparison | PASS: schemas, exports, dependencies/lockfile, OpenAPI/config and owner bytes unchanged |

The restricted consumer invocation failed at child-process execution; the worker
observed EPERM and coordinator independently observed the restricted failure.
Scoped approved rerun passed; subprocesses have 10-second timeouts and synthetic
arguments. The worker first replaced a blocking stdin harness with argv transport.
Audit first failed with sandbox DNS EAI_AGAIN; approved network rerun succeeded.
These are recorded failed attempts, not passing results. No sandbox policy changed.
Managed Git writes used the authorized approval mechanism; no push/merge/deploy.

NOT RUN: fresh locked install (prior Slice 7 evidence retained), hosted CI (no
push), service/database/browser/provider/release tests (outside scope). No paid
external API calls. Diff review result: no blocking implementation findings.

## Continuation

All worker reservations released; owner `AGENTS.md` remains reserved. Shared
backlog/state/roadmap were updated serially by coordinator. Approve/revise/defer
D1–D6 in the consolidated packet: shortage acceptance, exact identity/fingerprint,
complete assembly/replay, Factory transport, released-result wire shape, and safe
exports/client target. Direction-only approvals do not freeze missing field-level
addenda. Those approved contracts unlock bounded Stage 4B implementation; no
Stage 4B task was dispatched. G1 requires accepted completion evidence and explicit
owner disposition, not merely this passing local suite. Recovery: verify Git and
owner bytes, build, then run smoke/consumer tests under permitted runtime controls.
