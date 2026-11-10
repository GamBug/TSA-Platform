# Project state

Updated 2026-11-10. This is current navigation; historical state is in the [dated archive](../archive/2026-11-08/PROJECT_STATE.md).

## Product goal and owner decisions

Build an unofficial local practice demo that can grow into a full product. The target simulation is 100 questions (40/20/40), with section timers (60/30/60 minutes) and return-to-section navigation; topic practice and correct-answer counts per section and total are also in scope. No live AI runs during exam creation, delivery, or grading.

The owner's [2026-11-07 direction](../decisions/OPEN_DECISIONS.md#university-demo-product-direction--2026-11-07) keeps versioned contracts, the Bank as the content source, and human approval before publication. Corpus rights are REQUIRES_VERIFICATION until evidence is recorded. The demo remains non-profit and makes no HUST affiliation or official-score claim.

## What works today

- Topic catalog and owner-bound topic practice are integrated with the student experience.
- The opt-in v3 full simulation delivers 100 questions with server-side section clocks, return navigation, read-only exhaustion, and per-section/total correct counts.
- Versioned numeric practice and binary per-section/total scoring are implemented.
- Opt-in cloze and matching practice (`question/3`, `/api/v4`) works end to end, including staff authoring and preview; see the [guide](../guides/TRACK_B_CLOZE_MATCHING.md).
- Private inspected-image delivery is implemented behind a default-off feature flag.
- Keyboard shortcuts support per-page opt-out and modal focus restoration.
- Reading research/factory and manual draft transport support validated, unpublished DRAFT intake.
- Local staff and student demo flows use the existing PostgreSQL-backed practice prototype.

## Current checkpoint

- 2026-11-10: CP4 completed, uncommitted: exit suites, Chromium/Firefox journeys and a recorded independent review passed. Commit grouping and a retained import of the 78 keyed Reading DRAFTs await the owner. See the [CP4 completion report](../../plans/reports/claude-261110-1215-cp4.md).

- 2026-11-09: CP3b completed: 80 private Math DRAFTs verified in four disposable batches of twenty, exit checks and independent review passed. See the [Math checkpoint report](../../plans/reports/codex-261109-1721-cp3b.md).

- 2026-11-09: Earlier CP3b allowlist blocker was resolved by the owner's extension; see the historical [blocker report](../../plans/reports/codex-261109-1636-cp3b.md).

[CP2 Full simulation](../../plans/261108-1553-codex-autonomous-demo/cp2-full-simulation.md), CP3a retained Reading import and CP3b disposable Math verification are complete. The [checkpoint plan](../../plans/261108-1553-codex-autonomous-demo/plan.md) tracks the remaining work; CP6 is next, and CP5 waits for owner-supplied Science files. Math retained-bank import remains a separate operation.

- 2026-11-08: CP1 navigation and archives verified; docs validator repaired under owner resumption authorization. See the [CP1 completion report](../../plans/reports/codex-261108-2051-cp1.md).
- 2026-11-08: CP2 completed under owner resumption authorization; migration preservation, required suites, and Chromium/Firefox 100-answer journeys passed. See the [CP2 completion report](../../plans/reports/codex-261108-2238-cp2.md).

- 2026-11-09: CP3a-import verified 100 retained Reading DRAFTs in ten passages, with authoritative source keys and no blind-solve doubts; no approvals or rights grants. See the [retained import report](../../plans/reports/codex-261109-1615-cp3a-import.md).

## Known gaps and gates

- The full simulation demo uses disposable original synthetic inventory; retained corpus Reading DRAFTs are separate inventory awaiting human approval and publication rights.
- Cloze and matching interactions remain unsupported; their compatibility needs resolution before claiming full corpus coverage.
- Corpus-derived items require recorded rights evidence and owner approval before publication; neither is implied by local engineering.
- CP5 waits for owner-supplied Science files. Hosting and production authentication are optional for this demo.

## Run the local demo

Follow the [supervisor demo guide](../guides/TRACK_B_SUPERVISOR_DEMO.md) for prerequisites and commands.

- 2026-11-09: CP3 BLOCKED before implementation: 136 explicit-key Reading choices fall short of 150; true/false keys need owner source evidence. [Report](../../plans/reports/codex-261109-0913-cp3.md).

- 2026-11-09: Owner approved CP3a’s 100-item target; CP3a BLOCKED on v3 AI-authorship literals outside its allowed contract scope. [Report](../../plans/reports/codex-261109-1342-cp3a.md).

- 2026-11-09: CP3a complete: 100 Reading DRAFTs in ten bundles verified through the disposable coordinator/staff queue; blind triage and private samples retained, corpus unchanged. CP3b next. [Report](../../plans/reports/codex-261109-1435-cp3a.md).

- 2026-11-09: CP4 BLOCKED before implementation pending an owner decision on missing matching target pools/reuse policy; [checkpoint report](../../plans/reports/codex-261109-1958-cp4.md). No commits made.
