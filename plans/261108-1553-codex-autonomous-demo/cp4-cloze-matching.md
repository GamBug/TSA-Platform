# CP4: Cloze/text entry and matching interactions

Goal: support the remaining Reading item types (about 15 entry and at least 13 matching items in
the corpus) end to end. Leader reasoning: **high** for design, medium afterwards. Builder:
`tsa_builder`. Reviewer: `tsa_reviewer`.

## Read first (only these)
`plans/reports/compatibility-261107-0756-question-interactions-and-combined-exam.md`; the numeric
pattern in `packages/contracts/src/question-v2.ts`, `numeric-response.ts` and
`db/migrations/029_numeric_practice.sql`; `src/modules/scoring/versioned-binary.mjs`.

## Rules
- Add new versioned interaction, key and response types following the q2 pattern. Existing q1/q2
  data, hashes and consumers stay unchanged.
- Cloze: stable field IDs, bounded input length, an explicit normalization policy (trim, case, and
  Vietnamese diacritics kept unless the key lists variants), and accepted variants kept private.
- Matching: stable row and target IDs, cardinality and reuse limits, native select or click
  controls with full keyboard operation. Drag-only is not allowed (WCAG 2.5.7).
- Binary scoring per item (all fields correct), consistent with the correct-count score.
- Native inputs bypass global shortcuts. Partially answered items show as incomplete.

## Steps
1. Design note (≤ 1 page) and one reviewer pass.
2. Contracts and migration 031 with a populated upgrade test.
3. Bank authoring and import mapping; import the deferred CP3 items as DRAFTs.
4. Delivery, save, grading, released review and UI. Browser journeys in Chromium and Firefox.

## Exit criteria
- Focused lifecycle tests (save, retry, clear, expiry, grade, review, privacy) pass.
- Legacy suites `test:attempts test:grading test:student test:topics test:local` pass, plus
  `build`, `typecheck` and `test`.
- One reviewer pass with no open P0/P1 findings.
