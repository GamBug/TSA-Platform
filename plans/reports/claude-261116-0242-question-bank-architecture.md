# Question-bank repair, portable format and image library

Status: DONE_WITH_CONCERNS. Single Claude Code session on `feat/track-b-data-auth`, 2026-11-16 (Asia/Bangkok), no subagents. Source attribution, licensing and `DEMO_UNI_SOURCE_CREDIT` were out of scope and untouched. This report holds no answer keys; the key evidence is in the private, gitignored `data/corpus-ingest/audit-2026-11-16/` (`review-table.md`, `corrections.json`, `corrections-verification.json`, `verify/`).

## A. The five flagged Math questions (Priority 1)

Each was solved independently from the stored statement, then compared with the stored key; the 2026-11-15 audit had already confirmed the transcriptions against the source images. Backup before the change: a byte-identical copy of the stopped cluster at `.local/track-b-backups/pre-correction-2026-11-16-physical` plus the runtime's own dump. Applied with `npm run bank:correct`: new versions of the same question, approved on the owner connection with every publication check; originals stay as history.

| Corpus id | Original version | Defect | Action | New / state | Served now |
|---|---|---|---|---|---|
| HinhHoc/000089 | `c51d4e20-f440-450c-a097-8826531a25b7` | Incorrect stored answer key | Key corrected; stem and options unchanged; explanation added | `1465c265-3310-446b-a9bb-2d0e8fe33159`, APPROVED | Yes, corrected |
| HinhHoc/000015 | `7a7cb9fa-67de-48d8-b730-d23a6ca2d5c7` | Incorrect transcription of the plane constant (only one value makes any option valid, and the sibling prints it) | Constant corrected; options and key unchanged; explanation added | `3fab1e14-8a84-4e6c-96f4-a6dbcacbe24b`, APPROVED | Yes, corrected |
| HinhHoc/000003 | `a86a3b55-45f9-47d6-a8d9-4225bf8c7417` | Mathematically invalid as printed: no option matches and the intended data cannot be rebuilt | Quarantined `NEEDS_MANUAL_REVIEW` | none | No |
| HinhHoc/000066 | `aba42616-4061-40cd-ac85-043499737d8f` | Same: no option matches | Quarantined `NEEDS_MANUAL_REVIEW` | none | No |
| XacxuatThongke/000028 | `045652d5-85a8-441b-ace6-b0863b323d50` | Same: no option matches | Quarantined `NEEDS_MANUAL_REVIEW` | none | No |

The exact original answer, corrected answer, mathematical explanation and verification status of each are in the private `review-table.md`. Public searches for the original statements of the three withheld items found nothing usable, so no answer was invented. Duplicate pair (Priority 5): `XacxuatThongke/000007` and `000045` are the same numeric problem with the same, correct key. The version printing a blank (`22b00db1-80c5-45a5-bd5a-43d24ae9242b`) is withheld; its twin `3123bcdf-7484-4ac1-a46a-832f37a30c54` stays served; both source records are kept. Note: corrected `000015` now differs from its sibling only in one distractor, which the owner may want to merge or withhold.

Result in the retained Bank: 277 Math and 100 Reading items served (was 281 and 100): two new approved versions, four versions quarantined, nothing deleted. The first correction batch needed a one-line extension of `ownerConfirmSingleton` (a new version of an already confirmed question needs its own confirmation event).

## B. Question architecture (Priority 2)

- Contract: `tsa-question/1` inside a `tsa-question-set/1` envelope, defined once in `packages/contracts/src/question-exchange.ts` (Zod). The JSON Schema `docs/question-bank/question-set.schema.json` is generated from it and a test fails if it drifts. Spec: `docs/question-bank/QUESTION_FORMAT.md`.
- Types: single choice, multiple choice, true/false group, numeric, cloze, matching; content blocks (text with inline `$…$`, display math, table, image by asset id, `image_request`); passages. Each type maps to the existing `question/1`, `/2` or `/3` interaction and answer-key contracts, proven by a test that parses every example through the real internal schemas. Scoring (all-or-nothing) and student delivery are untouched.
- Validation: the validator reports every problem with a location and a stable code (listed in the guide), never throws, checks answer/option consistency, image references against the library, ids, duplicate prompts, safe text and the Bank's own LaTeX allowlist (shared, not copied). Offline: `node tools/question-bank/validate.mjs set.json [--assets assets.json]`.
- Compatibility: additive only. Existing questions, scoring and rendering are unchanged.

## C. Image asset library (Priority 3)

- Architecture: migration `032_image_library.sql` adds `tsa.image_assets` (code, SHA-256 unique, type, size, width, height, title, alt text, status), `tsa.image_asset_versions` (one asset version per purpose) and per-area counters over the existing content-addressed `tsa.asset_versions`. Code format `IMG-<AREA>-<6 digits>`.
- Behaviour: register (real decode, 2 MiB / 4096 px / PNG-JPEG-WebP only), byte-identical deduplication (similar images are never merged), retrieval by code with a hash check, many-to-many reuse, several images per question at any position, missing-reference detection (`images check`, validator, importer), guarded retirement (a trigger refuses while a draft, in-review or approved question shows the image) and a trigger that rejects every delete. Question and explanation images stay separate asset versions of the same file.
- Existing images: the migration registers every existing asset version without changing a row (legacy area `LEG`). The retained Bank has no images, so its backfill is empty. Migration was run on copies of the real Bank only; the retained Bank is not yet migrated (it migrates when the owner runs a workspace command, after the automatic backup).
- Delivery: students keep the existing inspected-image routes, still behind their default-off flag; the library adds no route and no path exposure. Not built: a staff upload screen.

## D. External AI generation (Priority 4)

| Item | Path |
|---|---|
| Standalone prompt | `docs/question-bank/AI_QUESTION_GENERATION_PROMPT.md` |
| Canonical schema | `docs/question-bank/question-set.schema.json` (generated) |
| Examples | `docs/question-bank/examples/valid/` (9 sets, every type, shared and multiple images, a passage, an image request) and `examples/invalid/` (16 sets, one defect each, expected codes in `expected.json`) |
| Validation / import | `tools/question-bank/validate.mjs`, `npm run questions:import`, `src/local/exchange-import.mjs` |
| Portable package | `npm run questions:package -- --out <new dir>` (schema, guide, prompt, examples, manifest with hashes) |

A test exports the package, takes the JSON example from the packaged prompt (what an unrelated AI would return), copies it outside the repository and validates it with the command line: the prompt names no repository path or command. The prompt forbids inventing asset ids and tells the model to use an `image_request` block instead. Import creates DRAFTs only through the author route, reuses an operator-named source version's recorded rights, is all-or-nothing and idempotent (receipts, migration 033), and turns a higher `content_version` into the next version of the same Bank question. Passage-based questions validate but cannot be imported here (they need the manual Reading transport's stimulus records); the importer says so.

## E. Quality verification (Priority 5)

Workflow: `npm run questions:verify -- export | compare` (read-only). A solver gets prompts and choices only (no keys, explanations, version ids or source names; ids salted per export); only a HIGH-confidence, unambiguous agreement is `VERIFIED` and only a HIGH-confidence disagreement is `DISPUTED`; everything else is `NEEDS_HUMAN_REVIEW`.

I solved the 197 published Math items that had no independent solve (the first 80 had one in an earlier checkpoint) blind, with exact arithmetic or brute force for every numeric and counting item, then compared:

| Verdict | Items |
|---|---|
| VERIFIED | 182 |
| DISPUTED | 7 |
| NEEDS_HUMAN_REVIEW | 8 |

Limit: the solver is the same single session that wrote the tool, not an independent reviewer; agreement is evidence, not proof.

Manual adjudication of the 15:
- 5 DISPUTED were confirmed wrong keys (a probability count, two cloze items, two numeric items); each was re-checked by brute force or a second derivation.
- 2 DISPUTED were equivalent expressions written differently (`e578522d…`, `31d54d12…` question text): the keys are right but accept only one spelling, a usability risk for typed expressions; left for the owner.
- Of the 8 needing review, 2 are real defects (a matching option mislabelled as the square of the correct value, and a statement without a figure that has no rational answer) and 6 agree with the stored key but are ambiguous (wording, definitions or intent).
- Prepared, verified on a copy, **not applied**: `corrections-verification.json` (6 revisions and 1 withhold). The agent's attempt to apply it to the retained Bank was refused by the permission layer, correctly: the brief forbids changing answers from model output without the owner. Run `npm run bank:correct -- --spec data/corpus-ingest/audit-2026-11-16/corrections-verification.json --confirm "CORRECT 7"` to apply it after reviewing the private artifacts.

Version ids still serving a wrong or unusable item until then: `bf65d54b-0065-4627-91b8-06bf5c1cc4a1`, `0e2f8fa2-93b8-4b74-862b-89c692388dbe`, `77db1214-adc1-45fa-8808-d9dfa2171691`, `11edd11a-a270-4532-972f-eb9b5899006d`, `3151c056-7751-4afd-8c79-450f9782c29e`, `30d6dc0a-01c4-4a74-b6f0-049695ef9086`, `ebf23ac7-e7c3-4dce-848a-75757397502e`. Ambiguous-but-agreeing, for owner reading: `5d50632c…`, `7f476675…`, `9c6cce59…`, `b918f027…`, `5b7da843…`, `b8515385…`.

## F. UX (Priority 6)

- Fixed: the "resumed the held attempt" notice appeared on every freshly started topic attempt because the API client reported every reserved start as a resume. It now tracks the attempts the view allocated and reports a resume only for a held attempt or one reopened from saved state. Four regression tests fail without the fix.
- Not fixed, by design: the empty duplicate topic group from the legacy local taxonomy. Hiding taxonomies with eligible 0 and attempted 0 is unsafe (a topic a student has used up looks the same, and a test showed it vanishing mid-attempt). The right fix is a published-stock signal in the catalog function (a migration); the group is cosmetic and was left.

## G. Tests

Local run on Linux, Node 24.18.0, PostgreSQL 18.6, Chromium, 2026-11-16. All passed; nothing failed.

| Suite | Tests |
|---|---|
| Contracts (`npm test`, includes 44 new exchange-format tests) | 236 |
| Offline AI and client boundaries (`tests/ai`, critical persistent-api) | 134 |
| App suite (`test:b0`) | 110 |
| Bank (includes 5 image-library tests) | 190 |
| Student runtime / attempts / grading / results / topics / scoring | 85 / 28 / 24 / 7 / 6 / 11 |
| Numeric / media / critical student / privacy / auth | 19 / 56 / 9 / 2 / 5 |
| Local workspace (includes correction, migration and import tests) | 85 |
| Image library / exchange import / verification | 6 / 6 / 6 |
| Database foundation / assembly | 37 / 85 |
| University demo suite / Chromium rehearsal | 16 / PASS |
| Documentation checker and regression tests | clean / 13 |

New regression coverage: correction flow (3), exchange validator and mapping onto question/1-3, package self-containment, image migration backfill, importer replay/versioning/rejections, verification classification matrix, and four resume-notice tests that fail without the fix. A self-review (code-review, medium) of the new commits found nine issues; the six that mattered were fixed (backup before explanation asset versions, parent version after a correction, guarded comparison, source check before storing bytes, asset race lock, overstated atomicity) and the rest (duplicated helpers, sequential queries) are noted. Not run: Firefox journeys, staff browser journeys, `test:db:preflight`. No independent human or second-model review took place.


## H. Remaining work

Critical (before presenting): apply or reject the 7 prepared corrections; owner review of the 3 withheld and 1 duplicate-withheld items.
Important: decide the near-duplicate pair `000015` / its sibling; a staff screen for image upload and for `bank:correct`; passage support in the exchange importer; accepted-spelling variants for typed math expressions; the published-stock signal for the topic list; an independent reviewer for the verification pass.
Optional: Firefox and staff browser journeys were not run; the remaining 2026-11-15 optional UX items (login lands on a restored result, Reading default count, passage layout) are unchanged.

## Unresolved questions

- Apply the 7 prepared corrections to the retained Bank?
- Keep corrected `000015` alongside its near-duplicate sibling, or withhold one?
