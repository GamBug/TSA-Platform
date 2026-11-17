# Numeric Math import and delivery

Status: DONE_WITH_CONCERNS — 60 numeric-answer Math items are in the retained Bank as DRAFTs, and the publish command and the demo can now deliver them. Nothing is published yet.
Date: 2026-11-11 (Asia/Bangkok). Authority: [owner attestation and CP7 authorization](../../docs/decisions/OPEN_DECISIONS.md#corpus-permission-attestation-and-owner-publication--2026-11-11). Builds on the [numeric importer](claude-261111-2040-numeric-math-importer.md).

## Result
- **Data:** all 99 numeric captures were classified again. 60 were transcribed and imported, 38 stay deferred (36 show a figure or table, 2 have a fraction key such as `481/64` that the decimal-only answer format cannot grade), and 1 (`GiaiTich/000108`) has an unreadable glyph in its question text.
- **Import:** three batches (20, 20, 20), each replayed exactly, after a backup. The Bank went from 299 to 359 versions; Math is now 259 versions. Reviews, rights, approved items and Reading are unchanged, all stored keys equal the source keys, and all 600 source files are unchanged. None of the new items is selectable.
- **Publishing:** `bank:owner-publish` now publishes `question/2` versions as well, through the numeric routes and the numeric publication checks.
- **Delivery:** `demo:uni` plans a separate numeric practice (four questions, from published `question/2` items in one taxonomy version; Mathematics and Science) and serves it at `?student=postgres-v2`, beside the choice practice and the full simulation.
- **Root cause worth knowing:** the Bank's selection gate admits `question/2` only while the numeric-practice setting is on. The demo's stock read and the owner approval check did not set it, so numeric items were invisible. Both now set it.

## Checks run
- Hash-bound scans, the package schema, the answer-leak check and all 267 formulas through KaTeX with the app's strict settings: PASS.
- On a copy of your Bank, the confirmed publish approved all 179 pending Math items (119 choice and 60 numeric). `demo:uni` on that copy showed Math 259 published, and a real Chromium session opened the numeric practice: formulas rendered, the decimal input and its rules appeared, and the practice had four questions. The copy was deleted.
- Tests: new planning and delivery tests (a full numeric attempt through delivery and grading in the demo), plus the existing suites: demo 15, local 36, numeric 19, Bank 183, student app 86, cloze and matching API 21, docs check.
- The full Chromium rehearsal journey (student, topic, simulation, staff) also passes with the new numeric default stock. Not run: Firefox.

## Concerns
- **No independent blind solve** for these items either; about twenty keys I could check by hand all agreed with the stated problem.
- **Figures are still deferred**, including some that are only decorative photos. Delivering images is a separate feature.
- The two numeric items about the same seed experiment (`XacxuatThongke/000007` and `000045`) are near duplicates in the source; both were imported.

## Unresolved questions
- Do you want fraction answers (`481/64`) supported, or should those two items stay deferred?

## Next owner action
`npm run bank:owner-publish`, then the confirm command it prints (it should say `PUBLISH 179 ALL` if you have not published the 119 choice items yet), then restart `demo:uni` and open the **Numeric practice** URL it prints.
