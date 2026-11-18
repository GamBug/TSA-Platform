# CP2 — Content enrichment for one real 40/20/40 test (Wed 18 – Sun 22 Nov)

Recommended implementer (Agent B): Claude Code, Opus 5.5, high reasoning. It already holds the Bank
workflow history (exchange import, corrections, publication repair, image library) and the plan context.
Fallback: Codex, strongest listed model, high. Science writing (step 4) may use Codex or Antigravity
through the standalone prompt package; the writer must not be the same session that blind-verifies (step 5).
The owner runs every confirming command on the retained Bank and approves every AI-written question.

## Constraints found 2026-11-18

- The full test delivers only `SINGLE_CHOICE`, `MULTIPLE_CHOICE` and `TRUE_FALSE_GROUP` (question/1)
  (`src/local/uni-demo-seed.mjs:12`). Numeric, matching and cloze items cannot count toward the 40/20/40.
- A passage bundle is delivered whole and its size must fit the exact section count; all members must be
  published and in the same taxonomy version.
- The importer already supports `--taxonomy-version` and `--topic-map`
  (`npm run questions:import -- --file set.json --source-version <uuid> [--topic-map map.json] [--taxonomy-version <uuid>]`).

### Science supply today (reviewed package `data/corpus-ingest/pdf-2026-dot1/review-2026-11-16-r3/final-sc.json`)

| Passage | Choice-type items usable in the test |
|---------|--------------------------------------|
| SCIE-PASS-000001 | 2 |
| SCIE-PASS-000002 | 1 |
| SCIE-PASS-000003 | 1 |
| SCIE-PASS-000004 | 2 (plus starch replacements `SCIE-T26REV-000401`–`000404`, check their types) |
| SCIE-PASS-000005 | 4 |
| SCIE-PASS-000006 | 3 |
| SCIE-PASS-000007 | 1 |
| SCIE-PASS-000008 | 2 |
| **Total** | **16** (up to ~20 with the replacements) |

**Gap: about 20–24 Science choice-type questions**, i.e. 4–5 new passages of 4–6 questions each, from the
owner's files first and AI-written originals for the rest.

## Steps

### 1. Backup and copy (Wed 18)
Back up `.local/track-b` to `.local/track-b-backups/pre-simulation-pool-261118/`, then `cp -a` it to
`.local/sim-pool-rehearsal/`. All steps 2–6 run on the copy first.

### 2. Combined taxonomy (Wed 18 – Thu 19)
- Register taxonomy version "TSA simulation taxonomy v1" with domains/skills for MATH, READING and SCIENCE
  using `npm run bank:register-taxonomy` (read `--help` first). Reuse the existing Math and Reading topic
  codes and the provisional Science topic, so topic maps are one-to-one.
- Write topic maps `data/corpus-ingest/simulation-pool/topic-map-{math,reading,science}.json`.

### 3. Simulation pool selection (Thu 19)
Export or rebuild exchange files (`tsa-question/1`) for:
- **Math: 40 choice-type items**, standalone, spread across the four Math topic folders; exclude withheld,
  `NEEDS_MANUAL_REVIEW`, the held duplicate and any item with a recorded key disagreement.
- **Reading: whole passages summing exactly to 20 choice-type items.**
- **Science: the 16–20 PDF choice items.** Re-bundle each passage with only its choice-type members (a
  documented subset; the numeric/matching/cloze siblings stay out of the test pool). Exclude the
  `SCIE-T26SC-000401`–`000404` originals.
Record the selection with ids, hashes and source paths in `data/corpus-ingest/simulation-pool/selection.json`.
Validate every file with `npm run questions:validate`.

### 4. Science enrichment (owner files Thu 19 by 20:00; writing Fri 20)
1. **Owner files first.** Import each owner-supplied Science source as exchange files with source keys,
   following the existing PDF/capture intake. Count the choice-type items gained.
2. **AI-written originals for the remainder.** Generate the package with `npm run questions:package` and
   the prompt from `npm run questions:prompt`. Each new passage must have:
   - an original Vietnamese scientific text (physics, chemistry, biology or earth science; 250–450 words),
     with a table or chart described in text or drawn as an SVG/PNG registered in the image library;
   - 4–6 choice-type questions (mix single choice, multiple choice and true/false groups, like the real
     paper), each with a key, a short Vietnamese explanation and a difficulty tag;
   - tags `ai-original` and `sim-pool-2026-11`; source = a registered "AI original" source, never the PDF.
   No copying of real exam passages. No paid API.
3. Validate (`npm run questions:validate`) and keep the bundle sizes so Science sums to exactly 40.

### 5. Independent check (Fri 20 – Sat 21 morning)
- Blind-solve every AI-written question with a different agent than the writer (`npm run questions:verify`
  workflow). Any disagreement → fix the question, not the key, or drop it.
- Agent prepares an owner review sheet `.local/sim-pool-rehearsal/owner-review.html` (passage, question,
  options, key, explanation, blind result) with an approve/reject column.

### 6. Rehearsal on the copy (Sat 21)
On `.local/sim-pool-rehearsal/`: import all pool files with `--taxonomy-version <combined id>` (dry run, then
the confirm phrase), `bank:owner-publish` dry run and confirmed run, then start
`TRACK_B_DATA_DIRECTORY=.local/sim-pool-rehearsal npm run demo:uni` and confirm the summary says
**"Full simulation: offered — 1 without repeats"**. Complete one 100-question Chromium journey with correct
counts per section.

### 7. Owner review and real publication (Sat 21 afternoon, latest Sun 22 12:00)
- Owner reviews the sheet (about 2–3 hours for ~25 AI questions) and marks approvals.
- Agent records the approval list (ids, date) in OPEN_DECISIONS.
- Owner runs the same import and publication commands on the retained Bank; agent verifies the launcher
  summary and records final counts per section in PROJECT_STATE.
- Bank is frozen afterwards until launch.

## Fallback (decided by the owner at Sun 22 12:00 if Science < 40)

Recommended: launch the full test only when it is complete. If Science is short, offer the Math and Reading
sections at full length plus Science section practice, and say on the catalog that the full test opens
when Science is complete. Never fill the gap with synthetic rehearsal items.

## Expected output

- Combined taxonomy id; `selection.json`; validated exchange files; AI Science passages and figures;
  blind-verification results; owner review sheet and recorded approvals.
- Retained Bank: one complete published 40/20/40 pool; launcher reports the full test as offered.
- Report `plans/reports/<agent>-26112x-simulation-pool.md` with every command, count and backup path.
- Commits: tools or tests only (private content stays in ignored folders), e.g.
  `feat(bank): register a combined simulation taxonomy and pool selection`.
