# CP2 step 4 report — Science supply from the owner's HTML captures

Date: 2026-11-19 (Asia/Bangkok). Implementer: Claude Code (Sonnet 5.5), single agent, no subagents, no independent reviewer.
Task card: [CP2 step 4.1](../261118-1305-public-demo-launch/cp2-content-enrichment.md) (owner files first).

## Outcome

The owner's three new folders (`TSA_Example_Questions/TSA_KhoaHoc_HoaHoc`, `_SinhHoc`, `_VatLy`: 400 saved practice pages) now supply **all 40 Science
pool questions**, with no AI-written question and no PDF-derived copy. This follows the owner's decision of 2026-11-19: fill every Science slot from the
captures and keep only one of any twin. The 40 (12 Chemistry, 15 Physics, 13 Biology; ids `SIM-SCIE-000901`–`000940`) were validated, imported and
**published end to end on a throwaway copy** of the pre-pool backup. They create no duplicate relation at all. The 16 PDF-derived Science items
(`science-1-1439239e.json`) are dropped from `selection.json`. The retained Bank and its image store are unchanged (all 1,410 files match the backup
manifest; 14 image files). No push, no commit of private content.

## What the captures contain

| Folder | Pages | Single choice | Multiple choice | True/false | Text answer | Drag-drop | Other |
|---|---|---|---|---|---|---|---|
| Chemistry | 127 | 50 | 7 | 36 | 22 | 7 | 5 |
| Biology | 135 | 74 | 11 | 30 | 11 | 9 | 0 |
| Physics | 138 | 92 | 4 | 11 | 22 | 9 | 0 |

- A page shows its key only when "Ẩn đáp án" was on: 284 of 315 choice-type pages reveal it (31 hide it; those are excluded, never guessed).
- Passages group the pages: 61 passages carry 243 keyed choice questions (plus 41 standalone Biology questions), so the passage-based supply is about six times the 40 Science slots.
- Pages are shared-passage items with real tables, inline figures and some hard-wrapped lines. Text-answer pages (55, numeric and fill-in),
  drag-drop (25), five unclassified pages and unkeyed pages stay out of the test pool.

## Method (private tooling in `data/corpus-ingest/science-captures-2026-11-19/`, gitignored)

1. `parse-captures.py` reads each page into blocks, options and the key marked green by the page itself. Defects found and fixed while
   parsing: inline images inside paragraphs, one-cell table titles that made tables ragged (tables had vanished), mid-sentence line wraps,
   and six 4×4 placeholder images that stand in for missing figures (skipped; passages that mention a figure that is absent are flagged).
2. `convert-captures.py` builds staged choice questions per passage; `validate-staged.mjs` runs the real exchange validator on every passage.
   56 of 62 sets validate; the six failures are repeated generic prompts ("Đúng hay sai?") or one duplicate option, so those passages were not used.
3. `candidates.py` flags figure-dependent questions ("hình bên" without an image), passage-level missing figures and exam numbering leftovers.
4. Selection: whole passages with every keyed, figure-independent choice member: Chemistry (fertilisers, glucose, soil samples), Physics (heat
   transfer, lightning, nuclear models, railway expansion), Biology (Lamarck, Robertson translocation, r/K strategies); 10 passages, 2 to 5 members each.
   Five raster images are needed; all were viewed and given descriptive Vietnamese alt text (the nuclear-shell table image carries its values in the alt text).
   Passages seen to contain source typos or ambiguous keys (e.g. a multiple-choice item with one key, a "1000%" option) were passed over.
5. `build-pool-files.py` writes `simulation-pool/exchange/science-{2,3,4}-<source8>.json` (ids `SIM-SCIE-000901`–`000940`, passages
   `SIM-SCIE-PASS-000009`–`000018`), tags `sim-pool-2026-11`, `corpus-capture`, `page-key`, difficulty MEDIUM (placeholder, as for Math) and the
   Math placeholder explanation, because captures carry none. `selection.json` lists the files, hashes and every member's source page hash.
6. Twin check (owner rule: keep only one): all 40 compared pairwise on normalised stem plus options or statements: no identical pair and no pair with
   token overlap above 0.8. Importing them next to the Bank's other content opens no relation (see below).

Keys: copied from the pages' own markers. Spot checks against subject knowledge (Glucose, lightning current, heat transfer, Robertson
chromosomes, Lamarck) agreed. Per the owner's rule, corpus keys are authoritative; no AI blind solve was run on the text-only items.

## Verification (all observed)

| Check | Result |
|---|---|
| `node tools/question-bank/validate.mjs` on each file | 12 + 15 + 13 valid (single choice 28, multiple choice 2, true/false 10) |
| Throwaway copy `.local/sim-pool-science-probe` of the pre-pool backup: taxonomy, 3 sources, 5 images, 3 imports, `bank:owner-publish --section SCIENCE --taxonomy-version …` | "Approved and published: 40", 10 passage bundles; images registered as `IMG-SCI-000011`–`000015` |
| Duplicate relations on the probe after import | none (empty list) |
| `verify-probe.mjs` on the probe | 40 selectable, 0 key mismatches against the exchange files, bundle sizes 2,3,3,3,4,5,5,5,5,5 (sum 40) |
| Retained Bank | `sha256sum -c` of 1,410 files passes; retained image store still 14 files |

An earlier 24-question variant was also published on a probe before the decision; it is superseded. `.local/sim-pool-rehearsal*` still holds that
variant and the 16 PDF-derived drafts, so rebuild a rehearsal copy from the backup before CP2 step 6.

Not run: Chromium student journey, mobile layout of the five figures, second reviewer, owner review of the 40 items, any write on the retained Bank.
No tracked source file changed, so no application suite was needed.

## Owner steps on the retained Bank (each is a dry run until `--confirm`)

The three new source versions get new ids there; the image codes will be `IMG-SCI-000011`–`000015` if no image is registered first (the script reads `asset-ids.json`).
`probe-science-publish.sh` is the exact replay. After the twin decision and the combined taxonomy registration:

```
npm run bank:register-source -- --file data/corpus-ingest/science-captures-2026-11-19/source-manifest-TSA_KhoaHoc_<HoaHoc|SinhHoc|VatLy>.json \
  --title "Corpus TSA_KhoaHoc_<…> HTML captures 2026-11-19" --confirm "REGISTER SOURCE"        # prints each source id
npm run images -- register --file …/images/<sha>.webp --area SCI --alt "<alt, title and source folder: asset-ids.json>" --title … --source-version <id of that folder's source> --apply   # in file order
SOURCE_VERSION_OVERRIDES=<json {"exchange/science-2-b0a92271.json":"<id>",…}> TAXONOMY_VERSION=<id> bash data/corpus-ingest/simulation-pool/run-import.sh confirm
```

## Decisions and open items for the owner

1. **Math and Reading twins** are unchanged: the 60 relations from copying served questions still block the full 40/20/40 test (recommended
   resolution recorded on 2026-11-18). Science no longer depends on that decision.
2. **Explanations.** None exist in the captures; students would see the English placeholder after results, as with the Math pool.
3. **Key trust.** 31 pages with hidden keys were skipped. The 40 selected items use page-revealed keys only; owner review should still read them.
4. **Review sheet** (`owner-review.html`, plan step 5) and the **Chromium 100-question journey** (step 6) are not done.
5. Question wording is the corpus's own, including source quirks in unselected passages; none were found in the 40.

## Evidence locations (private, ignored by Git)

`data/corpus-ingest/science-captures-2026-11-19/` (parsed/staged JSON, validation and candidate reports, source manifests, extracted images,
`pool-build.json`, probe and verify scripts), `data/corpus-ingest/simulation-pool/exchange/science-{2,3,4}-*.json`, `selection.json`,
`count-open-relations.mjs`, `.local/sim-pool-rehearsal*` (stale: PDF-derived drafts and the earlier 24-question variant), `.local/sim-pool-science-probe*` (published probe).
