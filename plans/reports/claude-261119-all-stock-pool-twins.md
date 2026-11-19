# CP2 report — all usable questions in one combined taxonomy, twins keep one

Date: 2026-11-19 (Asia/Bangkok). Implementer: Claude Code (Sonnet 5.5), single agent, no subagents, no independent reviewer.
Owner decision: [OPEN_DECISIONS 2026-11-19](../../docs/decisions/OPEN_DECISIONS.md) ("solve Math&Reading twin also, just keep 1. analyze all questions, could add all to the bank").
Earlier work: [Science captures report](claude-261119-science-captures-pool.md), [pool selection report](claude-261119-simulation-pool-selection.md).

## Outcome

The twin blocker is solved and the pool now holds all usable stock, not a 40/20/40 subset. On a fresh copy of the pre-pool backup, the replay imported
465 questions into one combined taxonomy, confirmed all 270 Math and Reading twins as one equivalence group each, and published everything.
The demo launcher on that copy reports **"Full simulation: offered"**, with **at least 4 full simulations without repeats per student**.
The retained Bank and its image store are unchanged (1,410 files match the backup manifest; 14 image files). Nothing was pushed.

| | Math | Reading | Science |
|---|---|---|---|
| Deliverable in the combined taxonomy | 170 | 100 (10 passages) | 195 (47 passages and 21 standalone) |
| One full simulation needs | 40 | 20 | 40 |
| Open duplicate relations after publication | 0 | 0 | 0 |

The 276 original Math and 100 original Reading questions are still published (published 446 = 276 + 170; 200 = 100 + 100), so section, numeric and
cloze/matching practice are unaffected.

## What "keep one" means in the Bank

Versions are immutable, so a twin is never deleted. A twin pair (a served original and its copy in the combined taxonomy) is confirmed as one
equivalence group: the exact-duplicate relation becomes `CONFIRMED`, both questions join one canonical group, and every selection gate and the form
assembler treat them as one question, so no test attempt can contain both. Before this, an open relation hid the served original and blocked the copy.

## Code change (tracked, tested)

- `src/local/owner-publication.mjs`: `listOpenTwins`, `ownerConfirmTwin` (owner connection, as `ownerApprove` and `ownerConfirmSingleton` already work;
  requires both versions IN_REVIEW or APPROVED and a confirming account that is neither author nor import operator).
- `scripts/owner-publish.mjs`: opt-in `--keep-one-of-twins`. The dry run prints the twin count; without the option publication still stops at the first twin.
- `src/local/exchange-passage.mjs`: fixed a latent bug found by the replay. Adding a question to a passage that a *previous* import had already stored
  failed with `REFERENCE_ID_CONFLICT` because the rebuilt reference list was not ordered like the stored one. It now sorts by kind and id.
- Tests: new `tests/integration/local/owner-twins.test.mjs` (`npm run test:owner-twins`); a later-batch case added to `exchange-import.test.mjs`
  (it fails without the fix, passes with it). Docs: [`QUESTION_FORMAT.md`](../../docs/question-bank/QUESTION_FORMAT.md) section 8.

## What was added and what was held back (private selection: `data/corpus-ingest/simulation-pool/selection-all.json`)

- **Math 170** of 196 served choice-type questions. Held back: 4 excluded by an audit or correction record, 5 whose early blind solve disagrees with the
  key, 4 flagged for human review, 13 whose TeX (`\overrightarrow`, `\lt`) the exchange format cannot represent (the Bank can; content was not edited).
  Images: none of the Math questions has one.
- **Reading 100**: every served passage bundle, keys copied unchanged.
- **Science 195** from the three capture folders: passages needing at most two distinct images, every keyed and figure-independent choice question,
  plus 21 standalone image-free Biology questions. 51 images were registered (`IMG-SCI-000011`–`000061`), each viewed and given a Vietnamese alt
  text in `science-captures-2026-11-19/alt-part*.py`; tables and graphs carry their values in the alt text. About 44 more Science questions in
  passages with three or more images, and all numeric, drag-drop and unkeyed pages, are not in the pool.
- Twin check among the new Science content: none. Keys are the pages' own; explanations do not exist, so the placeholder is used (also for Math and Reading copies).

## Verification (all observed)

| Check | Result |
|---|---|
| `npm run test:owner-twins` | 1 test passed |
| `npm run test:exchange-import` | 8 passed (6 passed, 2 failed with the fix removed) |
| `test:question-bank`, `test:demo:uni`, owner-publication-plan and register-taxonomy tests, `test:docs` | 53, 17, 7, 13 passed; 0 failed |
| Replay `replay-all-pool.sh fresh` on `.local/all-pool-rehearsal` | taxonomy, 3 sources, 51 images, 35 imports; 270 open relations; dry run "PUBLISH 465 ALL"; confirmed run: 270 twins confirmed (270 groups merged), 57 bundles, 465 published; relations all `CONFIRMED` |
| Launcher on the copy (`demo:uni`, temporary source-credit text) | Full simulation offered; without repeats per student: at least 4 |
| Retained Bank | `sha256sum -c` of 1,410 files passes; image store unchanged |

The launch process and its disposable cluster were stopped; port 4290 is free.

## Owner steps on the retained Bank

Only the owner runs confirmed publication. Each step is a dry run until `--confirm`, and each takes its own backup. The script below performs them in order
(taxonomy, three sources, 51 images, all imports, then the dry run and the confirmed publication):

```
BANK=$PWD/.local/track-b STORE=$PWD/.local/track-b-images bash data/corpus-ingest/simulation-pool/replay-all-pool.sh
```

Run it once on the retained Bank after you have read it; it does not repeat steps safely if interrupted midway (re-running a completed import is a no-op, but
re-registering the taxonomy creates a second one). Then restart `demo:uni` with the real source credit and confirm "Full simulation: offered".

## Not done

- Chromium 100-question journey on the combined pool, mobile check of the 51 figures, owner review of the new questions (no explanations exist).
- Rebuilding `.local/sim-pool-rehearsal` is not needed: `.local/all-pool-rehearsal` replaces it. Old rehearsal and probe copies under `.local/` (about 77 MB each)
  can be deleted by the owner.

## Unresolved questions

1. Should the 13 Math items with `\overrightarrow` be added later by extending the exchange format's TeX subset (a contract change needing an ADR)?
2. Should Science passages with three or more images (about 44 more questions) be added, which needs about 44 more image descriptions?
3. The Math items held back for a key disagreement or review flag (9) await your decision.
