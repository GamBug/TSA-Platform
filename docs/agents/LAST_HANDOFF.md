# Current handoff — CP1 lean docs

- Date/time and agent identity/role: 2026-11-08, Asia/Bangkok; Codex coordinator, `tsa_light_builder` implementer.
- Task ID / status / accountable implementer: CP1 Lean docs; DONE; coordinator owns final integration.
- Scope: compact navigation, verbatim archives, startup read-lists, and the docs validator/tests authorized by the owner's “complete CP1” resumption.
- Starting repository state: `feat/track-b-data-auth` at `dd30bc9`, with the prior partial CP1 changes preserved.
- Current Git reference: baseline `dd30bc9`; this handoff accompanies the local checkpoint commit with subject `docs: compact agent navigation and preserve history`.
- Files changed: three archive/current record pairs; onboarding and orchestration §1; three historical backlog links; docs checker/tests; checkpoint card/plan/reports.
- Decisions: the [2026-11-07 owner direction](../decisions/OPEN_DECISIONS.md#university-demo-product-direction--2026-11-07) remains unchanged. No application, contract, research or AGENTS rule edits.
- Outcome: compact navigation and byte-identical history pass CP1's exit checks; the validator resolves historical links from their original source directories and reads both task registries.

## Verification evidence

| Executed command/check | Environment and date | Observed result | Limitations |
|---|---|---|---|
| `git show dd30bc9:<original-path>` versus each archive | Local Linux, 2026-11-08 | All three byte-identical | Preserve archives verbatim |
| `wc -lc` for AGENTS plus three compact records | Local Linux, 2026-11-08 | Under 20 KB; card line limits pass | Exact final values in report |
| `npm run docs:check` | Local Linux, 2026-11-08 | PASS; zero errors, 68 historical task IDs | Heading anchors NOT_CHECKED; pinned historical warnings remain |
| `npm run test:docs` | Approved local Git subprocess access, 2026-11-08 | PASS; 13 tests, zero failures/skips | Documentation tooling only |

Tests not executed: application/runtime suites, because no runtime behavior changed. Independent checkpoint review and final Git results are recorded in the [completion report](../../plans/reports/codex-261108-2051-cp1.md).

## Continuation

- Known issues: four historical temporary screenshot references are not current evidence; exact pinned inputs preserve them with warnings. No CP1 acceptance gap remains.
- Remaining work: CP2 full simulation; CP3 corpus DRAFT ingestion is also eligible. Question publication still requires owner approval and rights evidence.
- Recommended next action: run the [CP2 card](../../plans/261108-1553-codex-autonomous-demo/cp2-full-simulation.md) through the leader prompt.
- Ownership transfer: builder released checker/tests; coordinator owns checkpoint commit; no background processes started.
- State updates: plan, active backlog and project state link the completion report; earlier blocker reports remain historical.
- Recovery notes: archives must remain byte-identical to `dd30bc9` originals. Read them on demand; their relative links retain the original source context.
