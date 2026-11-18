# Active task backlog

This compact index contains the current demo checkpoint cards. Earlier task records remain in the [2026-11-08 archive](../archive/2026-11-08/TASK_BACKLOG.md); open that copy only when a task needs historical context. The [checkpoint plan](../../plans/261108-1553-codex-autonomous-demo/plan.md) is the current status authority.

CP0 and CP1 are complete; see the [baseline report](../../plans/reports/codex-261108-1708-cp0.md) and [navigation report](../../plans/reports/codex-261108-2051-cp1.md).

| CP | Task | Status | Dependency / next step |
|---|---|---|---|
| [Public demo launch](../../plans/261118-1305-public-demo-launch/plan.md) | Live URL on 2026-11-24 with one complete real 40/20/40 test | CP0 IN PROGRESS | [Owner decisions 2026-11-18](../decisions/OPEN_DECISIONS.md#public-demo-launch-and-real-full-simulation--2026-11-18); open: domain, Science files, review slot, source credit |
| [CP2 Full simulation](../../plans/261108-1553-codex-autonomous-demo/cp2-full-simulation.md) | Build the 100-question timed simulation | TODO | Depends on CP1 |
| [CP3 Corpus ingestion](../../plans/261108-1553-codex-autonomous-demo/cp3-corpus-ingestion.md) | Prepare permitted-corpus DRAFT ingestion | TODO | Depends on CP1; no publication before rights evidence and owner approval |
| [CP4 Cloze and matching](../../plans/261108-1553-codex-autonomous-demo/cp4-cloze-matching.md) | Add cloze and matching interactions | DONE (committed) | [Report](../../plans/reports/claude-261110-1215-cp4.md); commits and retained import await the owner |
| [CP5 Science ingestion](../../plans/261108-1553-codex-autonomous-demo/cp5-science-ingestion.md) | Prepare Science ingestion | TODO | Depends on CP3 and owner-supplied Science files |
| [CP6 Demo-ready](../../plans/261108-1553-codex-autonomous-demo/cp6-demo-ready.md) | Verify the integrated local demo | DONE (committed `55adbb6`) | [Report](../../plans/reports/claude-261110-2301-cp6.md); owner approval and publication still gate real content |

Only the owner can approve question publication or record corpus permission evidence. Do not infer those gates from implementation or test results.

## Program audit and repair loop

Status: ACTIVE, updated 2026-11-12. Owner requested a full-program audit and repair loop with
one agent and resumed with full execution permissions. Current Codex session owns
implementation and inline review; no delegation. Preserve the existing Math work
and publication gates. [Plan](../../plans/2026-11-11-program-audit/plan.md);
[current evidence](../../plans/reports/codex-261111-2256-program-audit.md).
Confirmed fixes cover versioned image routing, disabled/unknown route responses,
registered local route forwarding, stale simulation polling and publication source
selection. Startup role/capability drift and rights timestamp validation are also
repaired. The recorded baseline has 605 passing integration checks; the latest
backend run passes 543 checks, with separate final timestamp and application
regressions and Chromium/Firefox simulation journeys. Staff numeric discovery and
unsaved author navigation are repaired, with 101 app tests and three Chromium
staff journeys passing at that revision. The deadline-read race is also repaired;
latest evidence adds 109 app passes, expiry/topic browser journeys and 33
topic/attempt backend passes. A subsequent reserved-attempt label repair and 19
additional browser journeys pass, including recovery/rate-limit and disposable
launcher paths. Final coverage reconciliation remains outstanding.

## Math cloze/matching follow-up

Status: DONE_WITH_CONCERNS, uncommitted, 2026-11-11. Accountable implementer: current Codex session,
single agent at the owner's request; no delegation or independent review. Starting HEAD `61a35ab`;
the preceding untracked investigation report was preserved. Scope and reserved surfaces are in the
[task plan](../../plans/261111-2045-math-cloze-matching/plan.md).

Imported 22 explicitly keyed Math question/3 DRAFTs after backups; three of the original 25 captures
still lack required source information. Owner publication and the published-only university demo
support the new profile. Retained Math is 281 questions: 259 previously published, 22 new drafts.
Checks and content limitations: [delivery report](../../plans/reports/codex-261111-2045-math-cloze-matching.md).
Next owner action: review the adaptations and run the dry-run-confirmed publication command in that
report, then restart the demo. No retained approvals or commits were made by this task.
