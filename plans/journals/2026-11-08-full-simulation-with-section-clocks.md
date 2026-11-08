---
title: Full simulation with section clocks
date: 2026-11-08
summary: "Implemented and verified the 100-question simulation, authoritative section clocks, private delivery and section totals."
---

# Full simulation with section clocks

## What happened
Implemented an additive v3 full simulation with a 40/20/40 question split and 60/30/60-minute section budgets. Migration 030 preserves existing practice paths; populated upgrade, backup, injected rollback and rerun checks passed.

The initial draft stopped under the explicit dependency read list and contract typing repair limit. The owner explicitly authorized continued work. A later grading regression came from applying candidate validation before distinguishing legacy attempts; the helper now returns to the legacy path first.

## Verification
Required regression suites and contract checks passed. Chromium and Firefox completed 100 real UI saves, lost-ack retry, refresh, read-only exhaustion, final section totals and a delayed old-owner response across a second-tab identity change. Independent review found no open P0/P1 issues; targeted checks cover its remaining race and rights concerns.

## Next steps
Run CP3 for corpus DRAFT ingestion. Question approval and corpus publication remain owner gates; the simulation demo uses original disposable engineering fixtures.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
