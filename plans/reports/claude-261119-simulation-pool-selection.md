# Simulation pool selection (CP2 steps 1–3)

Status: DONE_WITH_CONCERNS. Claude Code (Sonnet 5.5), single agent, 2026-11-18, Asia/Bangkok, branch
`feat/track-b-data-auth`. No subagents, no push, no paid API, no write to the retained Bank `.local/track-b`.

## Outcome

- The backup, the combined taxonomy, the pool selection, eleven validated exchange files and the dry runs are done.
- **Math 40 and Reading 20 are selected exactly; Science has only 16 usable choice-type items, so the gap is exactly 24.**
- **A blocker was found that changes the plan.** Importing an exact copy of a served question creates an OPEN
  exact-duplicate relation. While it is open, the served original disappears from delivery and the copy cannot be
  approved. On the rehearsal copy the 76 imported drafts created 65 open relations (40 Math, 20 Reading, 5 Science); the
  launcher then showed Math deliverable 196 → 156 and Reading published 100 → 80. **Do not import the pool into the
  retained Bank until the owner decides how to resolve this** (options below).

## Evidence

| Item | Result |
|---|---|
| Backup | `.local/track-b-backups/pre-simulation-pool-261118/` made with `cp -a` while the cluster was stopped (no `postmaster.pid`). 1,410 files; the SHA-256 manifest `.local/track-b-backups/pre-simulation-pool-261118.sha256` (manifest digest `c00ca92f…`) is identical for the source, the backup and the working copy. |
| Rehearsal copy | `.local/sim-pool-rehearsal/` (+ `.local/sim-pool-rehearsal-images/` copy of the image store). Every database write went here. |
| Retained Bank after all work | Recomputed: 1,410 files, byte-identical to the manifest, no `postmaster.pid`. |
| Combined taxonomy | "TSA simulation taxonomy v1", id `2c19fb91-d125-4003-b122-2d9ab1fa5220` **on the copy only** (registering on the retained Bank creates a different id). Domains MATH/READING/SCIENCE with the existing skills `MATH_REASONING`, `READING_REASONING`, `SCIENCE_REASONING`. |
| Topic maps | `data/corpus-ingest/simulation-pool/topic-map-{math,reading,science}.json` (Math: four folder topics → `MATH_REASONING`; Reading: `PRESS`, `SCIENCE_TEXT`, `LITERATURE` → `READING_REASONING`; Science: identity). |
| Selection | `data/corpus-ingest/simulation-pool/selection.json` (ids, Bank question and version ids, content and exchange hashes, source paths, bundles, evidence per item). Private, ignored by Git. |
| Exchange files | 11 files in `data/corpus-ingest/simulation-pool/exchange/`; SHA-256 of each is in `selection.json`. All pass `npm run questions:validate` (exit 0). |

## Selection

- **Math 40** (36 single choice, 4 true/false groups; no images). The Bank holds 196 served choice-type Math versions;
  after exclusions 183 were usable. Ten per topic folder (Algebra/Arithmetic, Calculus, Geometry, Probability/Statistics),
  strongest evidence first: 33 items are `VERIFIED` (HIGH confidence, exact-arithmetic) in the 2026-11-16 blind audit;
  7 Algebra items rely on the earlier blind solve whose key agrees (Algebra has only 3 audit-verified items usable).
  Excluded: the 13 questions in any correction, withhold or five-item audit record, the near-duplicate HinhHoc/000043,
  five items whose earlier blind solve disagrees with the key, and two items whose TeX the exchange validator rejects
  (`GiaiTich/000101`, `HinhHoc/000055`; content was not edited, the next candidate was taken). Keys are copied
  unchanged from the Bank.
- **Reading 20**: two whole served passages (10 questions each, both science-text passages), chosen because all ten keys
  match an independent unambiguous solve. Only three of the ten served passages have that property; the third
  (original bundle 8) is the reserve.
- **Science 16** from the reviewed package `review-2026-11-16-r3/final-sc.json`: the single, multiple and true/false items
  only, in eight passages of sizes 2, 1, 1, 2, 4, 3, 1, 2 (the four `T26REV` replacements are used; the original
  `T26SC-000401`–`000404` are not in that package). Numeric, matching and cloze siblings stay out. Question and passage
  ids are new (`SIM-SCIE-…`).
- Pool question ids are new (`SIM-MATH-…`, `SIM-READ-…`, `SIM-SCIE-…`) because an exchange id may be imported only once.

### Exact Science gap

Required 40, available 16, **missing 24 choice-type items**. Because bundles are delivered whole, new passages of 4–6
questions fit: for example 4 × 6, 5 + 5 + 5 + 5 + 4, or 4 + 4 + 4 + 6 + 6. Owner-supplied files will reduce this.

## Commands and results (all on the copy unless stated)

| Command | Result |
|---|---|
| `cp -a .local/track-b …/pre-simulation-pool-261118`; `cp -a .local/track-b .local/sim-pool-rehearsal`; `sha256sum` of all files | 1,410 / 1,410 / 1,410 files; manifests identical |
| `node --test tests/integration/local/register-taxonomy.test.mjs tests/integration/local/owner-publication-plan.test.mjs` | 7 passed, 0 failed (new: 3 + 1) |
| `npm run test:exchange-import` / `test:question-bank` / `test:docs` | 8 / 53 / 13 passed, 0 failed, 0 skipped |
| `node scripts/register-taxonomy.mjs --name "TSA simulation taxonomy v1" --domains "MATH=…;READING=…;SCIENCE=…"` | dry run, then `--confirm "REGISTER TAXONOMY"`: registered `2c19fb91-…` |
| `npm run questions:validate -- <file> --assets …/assets.json` × 11 | all `VALID` (Math 5+7+4+3+4+5+4+8 = 40, Reading 10+10, Science 16). Two earlier Math files failed on unsupported TeX; fixed by choosing other candidates, not by editing. |
| `bash data/corpus-ingest/simulation-pool/run-import.sh dry` (11× `npm run questions:import`) | 76 × CREATE, no problems |
| `npm run bank:owner-publish` before import | `PUBLISH 141 ALL` (MATH 106, READING 9, SCIENCE 26 old PDF drafts) |
| same, `--taxonomy-version 2c19fb91-…` after import | `PUBLISH 76 ALL`; `--section MATH` → `PUBLISH 40 MATH`; `READING` → `PUBLISH 20 READING`; `SCIENCE` → `PUBLISH 16 SCIENCE` |
| same without the filter after import | `PUBLISH 217 ALL` (MATH 146, READING 29, SCIENCE 42) — shows why the filter was needed |
| `run-import.sh confirm` **on the copy** | 76 drafts imported (Math 40, Reading 20, Science 16), all DRAFT |
| Duplicate check on the copy | 65 OPEN `EXACT` relations: Math 40 (16+24 with the served original), Reading 20, Science 5 |
| `node scripts/start-uni-demo.mjs` on the copy (SIGTERM after start; no orphan process) | `Approved in the Bank: Math 284, Reading 100, Science 0 · Published 236 / 80 / 0 · Deliverable 156 / 0 / 0`; **`Full simulation: NOT offered — short by Reading 20, Science 40`** (the pool is still DRAFT, and its twins block the originals). Cloze/matching and numeric practice unaffected. |
| `bank:owner-publish --section MATH --taxonomy-version … --confirm "PUBLISH 40 MATH"` on a throwaway copy `.local/sim-pool-publish-probe/` | stopped with `CONSTRAINT_CONFLICT`: the copies cannot be published while the relations are open |

The launcher needed `DEMO_UNI_SOURCE_CREDIT`; a placeholder was used for the rehearsal only.

## Tooling changes (committed locally)

- `scripts/register-taxonomy.mjs`: `--domains "A=S1,S2;B=S3"` registers one taxonomy version with several domains
  (the old `--domain/--skills` form is unchanged); the multi-domain check rejects repeated domains or skills.
- `scripts/owner-publish.mjs`: `--taxonomy-version <uuid>` limits publication candidates to one taxonomy version, so a
  confirmed run no longer has to include the 141 unreviewed PDF drafts.
- Tests: `tests/integration/local/register-taxonomy.test.mjs` (new), one case added to `owner-publication-plan.test.mjs`.
- Docs: `docs/question-bank/QUESTION_FORMAT.md` section 8 (both flags and the exact-copy rule).
- Private helpers (not tracked): `data/corpus-ingest/simulation-pool/{dump-served,analyze-math,analyze-reading,excluded-questions,build-pool}.mjs`, `run-import.sh`.

## Decision needed from the owner: exact copies of served questions

The Bank flags a new question with the same normalised content as any existing question in the same section (any
taxonomy). Because the pool has to be new questions in the combined taxonomy, every pool item taken from served stock is an
exact twin. Options:

1. **Adjudicate the twins as equivalent (recommended).** Resolve each relation as `CONFIRMED` through the existing
   equivalence service, so the copy and its original share one equivalence group; both can then be published, the full test
   uses only the copies, and the original keeps serving section practice. Needs a small owner step added to the
   publication flow (the service is internal and not exposed by an HTTP route) and a rehearsal on the copy. No key,
   content, schema or database rule changes. Side effect: the Bank treats a pool question and its original as one question
   for "new questions only" selection.
2. Replace the twins with content not yet in the Bank. For Math this means the 106 unreviewed PDF drafts (agent-derived
   keys, some with images); Reading has only 9 such drafts, so a 20-question Reading section would need new passages.
3. A database rule change so a form may mix taxonomies. Not authorized.

I did not build option 1 because it is CP2 step 6 and needs your decision first.

## Known limits

- All 40 Math items carry the placeholder explanation "No explanation retained in the source capture. Owner review required."
  (the served Math items have none); students will see it after release. The exchange format needs a difficulty, so
  `MEDIUM` is a placeholder; the Bank records none.
- The Science keys are agent-derived (tag `agent-derived-key`); none has an independent blind solve in this report.
- No Chromium journey, no second reviewer, no AI-written Science content (step 4) and no owner approval exist yet.
- The rehearsal copy now holds the 76 drafts and open relations on purpose; start from the backup to repeat the rehearsal.
  Disposable folders created: `.local/sim-pool-publish-probe/` (can be deleted) and 25 launcher/import backups in
  `.local/sim-pool-rehearsal-backups/`.

## Owner's next action

**Run nothing on the retained Bank yet.** Decide the options above (and the open items: Science files by Thursday 19 20:00,
source credit, domain). When option 1 is built and rehearsed, the retained sequence will be, after stopping every process
and taking a fresh `cp -a` backup of `.local/track-b`:

```
npm run bank:register-taxonomy -- --name "TSA simulation taxonomy v1" --domains "MATH=MATH_REASONING;READING=READING_REASONING;SCIENCE=SCIENCE_REASONING" --confirm "REGISTER TAXONOMY"   # prints the new id
TRACK_B_DATA_DIRECTORY=.local/track-b TAXONOMY_VERSION=<that id> bash data/corpus-ingest/simulation-pool/run-import.sh          # dry run
TRACK_B_DATA_DIRECTORY=.local/track-b TAXONOMY_VERSION=<that id> bash data/corpus-ingest/simulation-pool/run-import.sh confirm  # only after the duplicate decision
npm run bank:owner-publish -- --taxonomy-version <that id> --section MATH      # dry run; confirm only with the printed phrase
```

## Unresolved questions

- Which option resolves the exact twins, and may the equivalence step be added to the owner publication flow?
- Accept placeholder Math explanations for the public demo, or add worked explanations first?
- Are the Science files arriving by Thursday 19 20:00, or does the AI-written route cover all 24 missing items?
