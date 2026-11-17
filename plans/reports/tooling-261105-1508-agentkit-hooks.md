# Installed AgentKit inspection and operating route

November 5, 2026, Asia/Bangkok. Root Codex, read-only inspection requested by
the owner after adding AgentKit hooks. No configuration or installed code changed.

## Verified installation

- `ak --version` reports 3.0.0. `ak versions --local-only --json --no-interactive`
  reports Engineer source version 0.2.0 in global native Codex and Claude Code
  destinations, each with local health `ok`. Remote version/compatibility checks
  were not performed.
- `/home/wolfleo/.codex/hooks.json` declares 25 command bindings across eight
  event types, referencing 18 distinct CJS scripts. All 18 referenced files exist
  and pass `node --check`. Platform-specific command variants were counted once
  per binding. Syntax checks do not execute hooks or retrieve secrets.
- A selected offline Codex doctor check reports three `ok`, zero failures and
  two skips: kit integrity and sidecar hook registration. The direct global hook
  registration above exists, but those skipped checks cannot establish integrity
  or runtime execution. No automatic repair or reinstall was attempted.
- `ak agents list --json --no-interactive` returns an empty CLI agent inventory.
  This session's native delegation tool advertises agent roles independently.
  Use that live capability surface; do not infer missing native agents or claim
  that an agent ran from a recommendation or inventory listing.

## Workflow applied to this project

Read `ak-agentkit/SKILL.md`, its CLI-operation and subagent-timing references,
the installed cook workflow-routing map, and the development rules injected by
the hooks. The installation's available skill catalog is authoritative.

- Reuse the accepted [recovery plan](../../docs/tasks/RECOVERY_PLAN_2026_11_02.md)
  and current [project state](../../docs/agents/PROJECT_STATE.md). Hook metadata
  saying `Plan: none` does not erase that existing project plan or authorize a
  duplicate plan/migration. New plans/reports follow the current `plans/` route.
  The existing frozen source archive predates this new report; future source
  captures must account for newly linked authored plan/report files. Its saved
  capture recipe is historical evidence, not a promise of future-tree coverage.
- Select one primary owner: `ak-fix` for a concrete bug, `ak-cook` for accepted
  implementation scope, `ak-test` for verification, `ak-docs update` for impacted
  documentation, and `ak-codex-goal` for the existing durable goal. Read each
  selected skill before using its workflow; do not load unrelated skills.
- Prefer native tools and project test harnesses. Delegate only when a fresh
  context, independent review, specialization or disjoint work adds value. Every
  delegate gets exact files/ownership, acceptance, constraints, report route,
  `/home/wolfleo/Documents/Projects/TSA-Platform`, `Asia/Bangkok`, and English.
  Small inspections stay inline. Recommendations include the actual available
  platform/model/reasoning and do not establish quota or reviewer execution.
- For CLI operations, inspect `ak <command> --help` or `ak describe ... --json`
  first. Treat read-only, diagnostic and mutating effects separately. Use local,
  offline, JSON, noninteractive reads where supported; parse individual statuses
  and skips instead of treating exit 0 or `healthy` as complete proof.
- Existing subscriptions and the no-paid-LLM-API condition remain. Installing a
  paid pack does not authorize provider calls, semantic experiments, global model
  changes, remote dispatch, telemetry/content indexing, publication or deployment.
  `ak run`/update/repair/reset operations were not invoked for inspection.

## Actual commands and limits

Inspected live help for doctor, versions and agent inventory; read the offline
`ak describe doctor --json --no-interactive` contract. Executed:

```sh
ak versions --local-only --json --no-interactive
ak agents list --json --no-interactive
ak doctor --list --adapter codex --json --no-interactive
ak doctor --adapter codex --offline --check codex_binary_present,codex_hook_registration,codex_hook_windows_command,codex_install_provenance,codex_kit_integrity --json --no-interactive
```

Hook registration was parsed locally with only event names, script basenames and
counts emitted. No auth/provider configuration values, local transcripts or
private research were disclosed. No hook script failed syntax validation. The
doctor's Windows-command check is static command compatibility evidence, not a
Windows execution test. End-to-end validation of all hook events remains unproven.

No independent reviewer was assigned to this small read-only inspection. The
project's current recovery goal and pending human/architecture gates remain.
