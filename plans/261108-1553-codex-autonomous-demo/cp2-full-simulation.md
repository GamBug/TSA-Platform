# CP2: Full simulation with per-section chess clock

Goal: one attempt with 3 sections (MATH 40 / READING 20 / SCIENCE 40), per-section budgets of
60/30/60 minutes, and free navigation back to sections that still have time. Results show correct
counts per section and in total. This is the hardest checkpoint.
Leader reasoning: **high** for the design step and medium afterwards. Builder: `tsa_builder`
(Luna xhigh). Reviewer: `tsa_reviewer`.

## Rules being implemented (from OPEN_DECISIONS 2026-11-07, D5)
- Each section has a server-side budget. It runs only while that section is the open one.
- Exactly one section is open at a time. Switching closes the current section (its elapsed time is
  stored) and opens the target section.
- Re-entering a section resumes its remaining budget. A section with 0 remaining is read-only: its
  saves are rejected and its answers stay as they are.
- The attempt ends when every budget is exhausted or the student submits. The expiry sweeper
  handles a section running out while the student is offline (the open section keeps running
  until it expires; closed sections do not run).
- No questions, assets or keys from a section that has never been opened are sent before it opens.
  Grading keys are never sent before release.
- Score = correct count per section plus the total, through the existing binary scoring. Label it
  "unofficial practice".

## Read first (only these)
`plans/reports/compatibility-261107-0756-question-interactions-and-combined-exam.md` (combined
simulation row); the migrations `db/migrations/011_attempt_delivery.sql`, `013`, `015`, `016`,
`029`; the modules `src/modules/attempts/service.mjs`, `src/modules/assembly/allocation.mjs`,
`src/modules/jobs/exam-worker.mjs`; and `packages/contracts/src/*-v2.ts` as the versioning pattern.

## Steps
1. **Design note** (leader, ≤ 1 page, at `plans/261108-1553-codex-autonomous-demo/cp2-design.md`).
   It must cover:
   - a new versioned offering and blueprint (v3, or v2 extended additively)
   - a section-state table with the time accounting, as a migration `030_*` with a backup and
     rollback test
   - the switch-section API and the read/save checks
   - the sweeper changes
   - DTOs for the student
   - which existing single-section paths stay untouched

   Send it to `tsa_reviewer` once and fix concrete findings.
2. Contracts and migration 030, with an upgrade test from 029 on a populated database (follow
   `tests/integration/local/numeric-migration.test.mjs`).
3. Service layer: allocate a 3-section form, switch section, budget accounting, read-only on
   exhaustion, per-section sweeper, grading with section counts.
4. HTTP routes and student UI: section tabs with the remaining time per section, a locked state,
   the submit-all flow, results by section. Text inputs keep bypassing shortcuts.
5. Synthetic 100-item fixture (no corpus) and a browser journey script, following
   `scripts/student-numeric-journey.mjs`.

## Exit criteria
- New tests cover: the budget runs only in the open section; the switch stores elapsed time; an
  exhausted section rejects saves; offline expiry through the sweeper; no leakage from unopened
  sections; owner isolation; idempotent saves after a switch; grading counts per section.
- Existing suites unchanged and passing: `npm run test:attempts test:grading test:results
  test:student test:topics test:local`, plus `npm run build && npm run typecheck && npm test`.
- A Chromium and Firefox journey of the full simulation passes (desktop and narrow width).
- One `tsa_reviewer` pass with no open P0/P1 findings.
