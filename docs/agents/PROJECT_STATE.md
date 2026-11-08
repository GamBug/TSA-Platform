# Project state

Updated 2026-11-08. This is current navigation; historical state is in the [dated archive](../archive/2026-11-08/PROJECT_STATE.md).

## Product goal and owner decisions

Build an unofficial local practice demo that can grow into a full product. The target simulation is 100 questions (40/20/40), with section timers (60/30/60 minutes) and return-to-section navigation; topic practice and correct-answer counts per section and total are also in scope. No live AI runs during exam creation, delivery, or grading.

The owner's [2026-11-07 direction](../decisions/OPEN_DECISIONS.md#university-demo-product-direction--2026-11-07) keeps versioned contracts, the Bank as the content source, and human approval before publication. Corpus rights are REQUIRES_VERIFICATION until evidence is recorded. The demo remains non-profit and makes no HUST affiliation or official-score claim.

## What works today

- Topic catalog and owner-bound topic practice are integrated with the student experience.
- Versioned numeric practice and binary per-section/total scoring are implemented.
- Private inspected-image delivery is implemented behind a default-off feature flag.
- Keyboard shortcuts support per-page opt-out and modal focus restoration.
- Reading research/factory and manual draft transport support validated, unpublished DRAFT intake.
- Local staff and student demo flows use the existing PostgreSQL-backed practice prototype.

## Current checkpoint

[CP1 Lean docs](../../plans/261108-1553-codex-autonomous-demo/cp1-lean-docs.md) is complete after [CP0 baseline completion](../../plans/reports/codex-261108-1708-cp0.md). The [checkpoint plan](../../plans/261108-1553-codex-autonomous-demo/plan.md) tracks CP2–CP6; CP2 and CP3 are next.

- 2026-11-08: CP1 navigation and archives verified; docs validator repaired under owner resumption authorization. See the [CP1 completion report](../../plans/reports/codex-261108-2051-cp1.md).

## Known gaps and gates

- The full timed 100-question simulation and its versioned multi-section attempt design are not implemented.
- Cloze and matching interactions remain unsupported; their compatibility needs resolution before claiming full corpus coverage.
- Corpus-derived items require recorded rights evidence and owner approval before publication; neither is implied by local engineering.
- CP5 waits for owner-supplied Science files. Hosting and production authentication are optional for this demo.

## Run the local demo

Follow the [supervisor demo guide](../guides/TRACK_B_SUPERVISOR_DEMO.md) for prerequisites and commands.
