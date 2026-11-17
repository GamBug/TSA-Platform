# Retained Math import

Status: DONE_WITH_CONCERNS — 80 Math DRAFTs are in the retained Bank; none is approved or published.
Date: 2026-11-11 (Asia/Bangkok). Authority: [owner attestation and CP7 authorization](../../docs/decisions/OPEN_DECISIONS.md#corpus-permission-attestation-and-owner-publication--2026-11-11) (item 2 allows importing the verified Math DRAFTs after a backup).

## Result
- Four batches of 20 went through the existing corpus coordinator into `.local/track-b`; every batch replayed exactly.
- Before: 100 versions (all Reading, 100 reviews, 100 eligible, 11 rights, migration 031). After: 180 versions, 80 of them Math DRAFT. Reviews, rights, eligible and Reading are unchanged.
- All 80 stored answer keys match the source keys; 0 are selectable; all 80 staff contexts report RIGHTS_BLOCKED; all 600 source files are unchanged.
- A new provisional taxonomy version (MATH, MATH_REASONING) was registered, as in the disposable verification.
- Backup taken first: `data/corpus-ingest/cp3b-2026-11-09/retained-2026-11-11/backup/before-start-ZbTmeA/` (the dump's table of contents lists 1,044 entries; no restore trial). No process or lock remains.
- The import script is private and not committed (`data/` is git-ignored): `data/corpus-ingest/cp3b-2026-11-09/import-retained.mjs` (`--inspect` is read-only, `--import` refuses a second run).

## Checks run
- Inspect, then import: PASS (summary in the private `retained-2026-11-11/summary.json`).
- `npm run bank:owner-publish` dry run on the real Bank: "MATH 80, READING 0, SCIENCE 0", phrase `PUBLISH 80 ALL`.
- The confirmed publish on a scratchpad copy of the Bank: 4 rights recorded, 80 approved. `demo:uni` on that copy: Math 80 published, section practice for Math offered (80 items, 4 per practice). The copy was deleted; the real Bank was not published.
- Not run: browser check of Math items (KaTeX rendering) and the repository test suites (no repository code changed).

## Concerns
- **A full simulation cannot combine today's stock.** A simulation blueprint binds one taxonomy version, but Reading (published) and Math (imported now) sit in separate taxonomy versions, and Science will be a third. The demo's startup table only counts the best single taxonomy, which is why it shows Math as 0 deliverable beside Reading 100. Fixing it means putting all three sections under one taxonomy, which for the already-published Reading items means a re-import. That is an owner decision; nothing was changed.
- Math section practice works independently of that; Reading stays topic-practice only (passages of 10 against a 2-question card).
- The 80 items are text-only transcriptions (the package schema allows only text blocks), so no image delivery is needed. Deferred and diagram-dependent captures from the [Math checkpoint](codex-261109-1721-cp3b.md) are not among them.

## Next owner action
`npm run bank:owner-publish -- --confirm "PUBLISH 80 ALL"` publishes the Math items, then restart `demo:uni`.
