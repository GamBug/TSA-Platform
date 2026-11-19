# CP2 step 4 report — Science supply from the owner's HTML captures

Date: 2026-11-19 (Asia/Bangkok). Implementer: Claude Code (Sonnet 5.5), single agent, no subagents, no independent reviewer.
Task card: [CP2 step 4.1](../261118-1305-public-demo-launch/cp2-content-enrichment.md) (owner files first).

## Outcome

The owner's three new folders (`TSA_Example_Questions/TSA_KhoaHoc_HoaHoc`, `_SinhHoc`, `_VatLy`: 400 saved practice pages) close the
Science gap of 24 without any AI-written question. Twenty-four whole-passage questions (8 Chemistry, 8 Physics, 8 Biology) are
selected, converted to `tsa-question/1`, validated, imported as DRAFTs on the rehearsal copy and then **published end to end on a
throwaway copy** of the pre-pool backup. The Science pool is now 16 (PDF-derived) + 24 = 40 in `selection.json`.
The retained Bank and its image store are unchanged (all 1,410 files match the backup manifest; 14 image files). No push, no commit of private content.

## What the captures contain

| Folder | Pages | Single choice | Multiple choice | True/false | Text answer | Drag-drop | Other |
|---|---|---|---|---|---|---|---|
| Chemistry | 127 | 50 | 7 | 36 | 22 | 7 | 5 |
| Biology | 135 | 74 | 11 | 30 | 11 | 9 | 0 |
| Physics | 138 | 92 | 4 | 11 | 22 | 9 | 0 |

- A page shows its key only when "Ẩn đáp án" was on: 284 of 315 choice-type pages reveal it (31 hide it; those are excluded, never guessed).
- Passages group the pages: 61 passages carry 243 keyed choice questions (plus 41 standalone Biology questions), so the passage-based supply is about ten times the gap.
- Pages are shared-passage items with real tables, inline figures and some hard-wrapped lines. Text-answer pages (55, numeric and fill-in),
  drag-drop (25), five unclassified pages and unkeyed pages stay out of the test pool.

## Method (private tooling in `data/corpus-ingest/science-captures-2026-11-19/`, gitignored)

1. `parse-captures.py` reads each page into blocks, options and the key marked green by the page itself. Defects found and fixed while
   parsing: inline images inside paragraphs, one-cell table titles that made tables ragged (tables had vanished), mid-sentence line wraps,
   and six 4×4 placeholder images that stand in for missing figures (skipped; passages that mention a figure that is absent are flagged).
2. `convert-captures.py` builds staged choice questions per passage; `validate-staged.mjs` runs the real exchange validator on every passage.
   56 of 62 sets validate; the six failures are repeated generic prompts ("Đúng hay sai?") or one duplicate option, so those passages were not used.
3. `candidates.py` flags figure-dependent questions ("hình bên" without an image), passage-level missing figures and exam numbering leftovers.
4. Selection: two whole passages per subject with three to five keyed choice members (Chemistry PHÂN BÓN + Glucose, Physics heat transfer +
   lightning, Biology Lamarck + Robertson translocation), preferring text-only passages. Only two raster images are needed; both were viewed
   and given descriptive Vietnamese alt text.
5. `build-pool-files.py` writes `simulation-pool/exchange/science-{2,3,4}-<source8>.json` (ids `SIM-SCIE-000901`–`000924`, passages
   `SIM-SCIE-PASS-000009`–`000014`), tags `sim-pool-2026-11`, `corpus-capture`, `page-key`, difficulty MEDIUM (placeholder, as for Math) and the
   Math placeholder explanation, because captures carry none. `selection.json` lists the files, hashes and every member's source page hash.

Keys: copied from the pages' own markers. Spot checks against subject knowledge (Glucose, lightning current, heat transfer, Robertson
chromosomes, Lamarck) agreed. Per the owner's rule, corpus keys are authoritative; no AI blind solve was run on the text-only items.

## Verification (all observed)

| Check | Result |
|---|---|
| `node tools/question-bank/validate.mjs` on each file, with the copy's asset catalog | 8 + 8 + 8 valid (SC 15, MC 2, TF 7) |
| Import dry run, then `--confirm "IMPORT 8"` ×3 on `.local/sim-pool-rehearsal` | 24 created; open exact-duplicate relations unchanged at 65 (new content creates none) |
| Re-run of `run-import.sh` on the copy | all 24 SKIP (idempotent) |
| Throwaway copy `.local/sim-pool-science-probe` of the pre-pool backup: taxonomy, 3 sources, 2 images, import, `bank:owner-publish --section SCIENCE --taxonomy-version …` | "Approved and published: 24", 6 passage bundles; image codes reproduced as `IMG-SCI-000011/12` |
| `verify-probe.mjs` on the probe | 24 selectable, 0 key mismatches against the exchange files, bundle sizes 3,3,3,5,5,5 |
| Retained Bank | `sha256sum -c` of 1,410 files passes; retained image store still 14 files |

Not run: Chromium student journey, mobile layout of the two figures, second reviewer, owner review of the 24 items, any write on the retained Bank.
No tracked source file changed, so no application suite was needed.

## Owner steps on the retained Bank (each is a dry run until `--confirm`)

The three new source versions and two images get new ids there; the image codes will be `IMG-SCI-000011/12` if no image is registered first.
`probe-science-publish.sh` is the exact replay. After the twin decision and the combined taxonomy registration:

```
npm run bank:register-source -- --file data/corpus-ingest/science-captures-2026-11-19/source-manifest-TSA_KhoaHoc_<HoaHoc|SinhHoc|VatLy>.json \
  --title "Corpus TSA_KhoaHoc_<…> HTML captures 2026-11-19" --confirm "REGISTER SOURCE"        # prints each source id
npm run images -- register --file …/images/<sha>.webp --area SCI --alt "<see asset-ids.json>" --title … --source-version <Vật lý|Sinh học id> --apply
SOURCE_VERSION_OVERRIDES=<json {"exchange/science-2-b0a92271.json":"<id>",…}> TAXONOMY_VERSION=<id> bash data/corpus-ingest/simulation-pool/run-import.sh confirm
```

## Decisions and open items for the owner

1. **Science twins.** The 16 PDF-derived Science pool items still carry 5 open exact-duplicate relations on the copy (the exact-twin blocker
   recorded on 2026-11-18). The captures give an alternative: fill all 40 Science slots from captures (243 keyed passage-based items are available), which
   removes every Science twin and the need to adjudicate them. This changes the earlier "PDF items first" selection, so it needs the owner's go.
2. **Explanations.** None exist in the captures; students would see the English placeholder after results, as with the Math pool.
3. **Key trust.** 31 pages with hidden keys were skipped. The 24 selected items use page-revealed keys only; owner review should still read them.
4. **Review sheet** (`owner-review.html`, plan step 5) and the **Chromium 100-question journey** (step 6) are not done.
5. Question wording is the corpus's own, including source quirks ("Iớn", fullwidth punctuation exist in unselected passages only; none were found in the 24).

## Evidence locations (private, ignored by Git)

`data/corpus-ingest/science-captures-2026-11-19/` (parsed/staged JSON, validation and candidate reports, source manifests, extracted images,
`pool-build.json`, probe and verify scripts), `data/corpus-ingest/simulation-pool/exchange/science-{2,3,4}-*.json`, `selection.json`,
`count-open-relations.mjs`, `.local/sim-pool-rehearsal*` (24 drafts, sources, images), `.local/sim-pool-science-probe*` (published probe).
