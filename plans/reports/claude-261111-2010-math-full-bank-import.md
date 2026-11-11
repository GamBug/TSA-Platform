# Full Math bank import

Status: DONE_WITH_CONCERNS — every Math capture was inspected and every transcribable item is in the retained Bank. 119 new DRAFTs await your publication.
Date: 2026-11-11 (Asia/Bangkok). Authority: [owner attestation and CP7 authorization](../../docs/decisions/OPEN_DECISIONS.md#corpus-permission-attestation-and-owner-publication--2026-11-11). Continues the [first Math import](claude-261111-1930-math-retained-import.md).

## Result
- All 400 Math images are classified: 199 items imported (80 already published, 119 new DRAFTs), 189 deferred, 12 flagged.
- Deferred (189): 99 numeric-answer items, 52 with a diagram, graph or table, 25 cloze or matching, 13 with no visible source key. Flagged for clipped or unreadable content (12): 10 from the first run and 2 new, `GiaiTich/000125` and `XacxuatThongke/000035`.
- The 10 GiaiTich items the first run left "pending" (85–100) were transcribed in this run; the first run's records were not touched.
- Import: six batches (20, 20, 20, 20, 20, 19), each replayed exactly. Bank: 180 to 299 versions, Math 80 to 199. Reviews, rights, eligible and Reading are unchanged; 0 of the new items are selectable; all stored answer keys equal the source keys; all 600 source files are unchanged.
- Backup taken first: `data/corpus-ingest/cp3b-ext-2026-11-11/retained-2026-11-11/backup/` (1,044-entry table of contents). One earlier attempt stopped before writing anything because the package validator mistook `$a<b$` for an HTML tag; it now reads `$a\lt b$`, and that attempt's backup is kept beside it.
- Private records and scripts are in the git-ignored `data/corpus-ingest/cp3b-ext-2026-11-11/`.

## Checks run
- Hash-bound scans, the package schema, answer-leak check and all 916 formulas through KaTeX with the app's strict settings: PASS.
- The confirmed `bank:owner-publish` on a scratch copy of the Bank: 6 rights recorded, 119 approved. `demo:uni` on that copy: Math 199 published and deliverable, section practice offered. The copy was deleted.
- Not run: a browser look at the new items, and the repository test suites (no repository code changed).

## Concerns
- **No independent blind solve.** The first 80 items had one; you asked for no subagents, and one session cannot blind-solve its own transcription. The new items rely on the deterministic checks above and on the source keys, which stay authoritative.
- **Some source keys cannot be right for the stated problem.** I noticed these while transcribing and kept them, as the key policy says; there may be others I did not work through: `HinhHoc/000003` (distance larger than the edge it is measured from), `HinhHoc/000015` (its sibling `000043` differs by a constant and has a consistent key), `HinhHoc/000066`, `HinhHoc/000089` (the keyed line is not perpendicular to Δ; option B is), `XacxuatThongke/000028`.
- Two garbled source texts were reconstructed from context: `XacxuatThongke/000016` (event labels A and B) and the spacing of `XacxuatThongke/000023`.

## Unresolved questions
- Do you want a numeric-answer importer? 99 of the 189 deferred items are numeric; the runtime can grade numeric answers, but the Math importer and the demo's deliverable types do not cover them.
- Should the 25 cloze and matching Math items and the diagram and table items wait for CP4 delivery and image delivery?

## Next owner action
`npm run bank:owner-publish -- --confirm "PUBLISH 119 ALL"`, then restart `demo:uni`.
