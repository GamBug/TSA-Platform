---
title: Private manual DRAFT transport and durable intake
date: 2026-11-05
summary: Implemented and independently reviewed manual v3 transport; exact pilot activation remains separately pending.
---

# Private manual DRAFT transport and durable intake

## What happened

The owner authorized the reviewed local engineering proposals after the recovery goal had been blocked on disposition. Root implemented the manual v3 parser, private preparation, shared Bank persistence, format-aware readers and a single-connection activation coordinator. An initial delegated contract scaffold lacked required raw reconstruction and was rejected. A later worker hit the subscription usage limit; root completed the contract without a paid API fallback.

Independent review found authorization-before-journal, journal failure, retirement cleanup, stale configuration-copy and capacity defects. Repairs now fail closed, reserve resolution capacity, pin the canonical control location, preserve unknown usage and distinguish confirmed rollback from uncertain commit. The independent reviewer reran seven contract and five configuration tests and reported no unresolved findings. Root verified the real PostgreSQL, replay, rollback, stop/drain, backend loss, lost commit acknowledgment, ancestor review and HTTP privacy paths.

## Decision

The feature stays disabled by default and creates only private DRAFTs. Historical content and v1/v2 contracts remain immutable. A stopped physical backup preceded read-only inspection of the retained Bank. Its existing synthetic author is registered, but Reading taxonomy is absent. The exact proposed taxonomy, ten-draft package, mapping and activation/location pins are prepared and pending a separate owner disposition; no actual pilot import or human content approval occurred.

## Next steps

Record final verification in the owning implementation report and handoff. Continue other authorized local engineering while the exact registration/activation question is pending. If approved, take a fresh backup, register only the proposed taxonomy, consume the pinned snapshot, verify DRAFT replay and zero eligibility, then retire the coordinator. Never extend expiry or invent rights, tokens, human review or publication permission.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
