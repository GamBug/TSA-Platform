# CP4 checkpoint review: cloze and matching (uncommitted working tree)

Scope: read-only review against `plans/261108-1553-codex-autonomous-demo/cp4-design.md` and `cp4-cloze-matching.md`. No tests, npm scripts, DB or browser runs. `node --check` passed for all 17 modified JS files listed under Areas reviewed (including the post-resume `main.js`).

## Findings (by severity)

### P0
None found.

### P1

**P1-1. Corpus DRAFT answer key is clipped when the captured answer ends with a parenthesis.**
- File: `tools/corpus-ingest/reading-interactions.mjs:125` and `:131`.
- `findInlineClozeKeys` strips a trailing `)` twice. Line 125 strips it once from `marker[1]`, and line 131 strips it again on the same value.
- Verified by running the same regex sequence: a captured line `(đúng: f(x))` yields `"f(x)"` after the first strip and `"f(x"` after the second. The position-block path (line 106) strips only once and returns `"f(x)"`, so the two paths disagree.
- Failure scenario: a Reading cloze answer such as `at the end (of the day)` is imported as `at the end (of the day` in a DRAFT. A reviewer who approves it publishes a wrong key, or correct student answers are graded wrong. The design explicitly forbids guessed or clipped keys.
- Fix: strip the closing parenthesis exactly once per source line (for example, only in the branch that reads the marker text, not again after the next-line fallback). Add a fixture with a trailing-parenthesis answer to the corpus import test, and check that the position-block and inline paths return identical values for the same answer.

### P2

**P2-1. Relaxed markdown-image check applies to every question/3 rendered string, outside the design.**
- File: `src/modules/bank/content-safety.mjs:150-154` (`hasMarkdownImage`), with `allowInertBracketText` set at `:286`, `:300` and `:439`.
- For `question/3` only, the scanner replaces `/!\s*\[/` with `/!\[|!\s+\[[^\]]*\]\s*(?:\(|\[)/`. The relaxation covers content text, explanations, and cloze/matching labels. The design does not mention it.
- Practical impact is low: `![` is still rejected and `! [x](y)` is not a CommonMark image, but a security scanner loosened for a whole new schema without a design decision is scope drift. I found no test that exercises the relaxed rule. `tests/integration/bank/content-safety.test.mjs:207` covers a plain URL only.
- Fix: remove the relaxation, or confine it to a documented need with a dedicated test and an owner decision recorded in `docs/decisions/OPEN_DECISIONS.md`.

### P3

**P3-1. Unknown `policyVersion` now falls through to the v3 scorer.** `src/modules/scoring/versioned-binary.mjs:8-17`. Previously any non-v1 value went to the v2 path. The worker SQL (`policy NOT IN (...)` checks) and `exam-worker.mjs:139` currently restrict inputs, so this is latent. Fix: explicit `if (policyVersion === 'practice-binary-v3')` branch that throws on anything else.

**P3-2. Shared identity parser widened.** `packages/contracts/src/identity.ts:4` and `:237` now parse `SupportedQuestionVersionSchema` from `question-v3.ts`, so every identity caller accepts question/3. The q1/q2 canonicalization branches are unchanged (checked at identity.ts:355 and :436), so existing hashes should be stable. Informational; ensure a hash-stability test for q1/q2 exists.

**P3-3. Shared factory helpers moved out of a frozen contract file.** `packages/contracts/src/factory-package-v3.ts` (-109 lines) now imports helpers from `manual-factory-core.ts`. I read the reachability and artifact-decoding logic and it preserves the missing-root and leaf checks. Scope drift for a CP4 diff; keep it only if the v3 hash tests were run.

**P3-4. Publication gates disagree on question/1 in cloze mode.** `src/modules/bank/publication-gates.mjs:41-43` accepts q1 when cloze is enabled, while `publication.mjs` `assertQuestionSchemaEnabled` rejects anything but q3. The stricter gate wins at runtime, so this is an inconsistency, not a defect.

**P3-5. Control-character parity between SQL and TypeScript is unverified.** TypeScript label check: `[\u0000-\u001f\u007f-\u009f]`. SQL: `[[:cntrl:]<>]`. Depending on DB locale, PostgreSQL may also reject U+2028/U+2029, which TypeScript accepts. A staff-authored label with those characters would pass the draft UI and fail at insert. Not verified (no DB run).

**P3-6. Header clear path.** `apps/practice-prototype/public/app/main.js:33` calls `current.querySelector("nav")` and then `navigation.querySelectorAll`. If a rendered header has no `nav`, this throws. Likely always present; add a null guard.

## Unresolved questions

1. Duplicate fingerprints ignore answer keys (`identity.ts` `fingerprintInteraction` drops keys, and CLOZE/MATCHING labels are `Vị trí N`). If two captured items share a prompt and label set, `computeDuplicateFingerprint` will reject the second one as a duplicate even when its key differs. Count fingerprint collisions against the 78 approved DRAFTs before import.
2. Whether the 22 deferred keyless captures are excluded from every import path (only the report was checked, not the import coordinator).

## Verified (no defect found)

- **Normalization parity.** SQL `tsa.exam_normalize_cloze` (`db/migrations/031_cloze_matching.sql:24`) trims exactly the set that JavaScript `String.prototype.trim` removes, after NFC. TypeScript `normalizeClozeText`, staff `normalizeStaffClozeText` and the SQL scorer all match.
- **Scoring parity.** `clozeMatchingEarned` (TS) and `exam_binary_earned` (SQL) agree on: missing, null and blank cloze fields are incomplete; matching rows must all be non-null; reuse limits enforced in both `parse*` and SQL validators. The SQL `response->'values'->>id` NULL case is short-circuited by the preceding `='null'` disjunct, so it returns 0 as intended.
- **Migration validators** (`cloze_interaction_valid`, `matching_*_valid`, `cloze_answer_key_valid`) mirror the TypeScript schema constraints (ID regex, 1-20 fields, 1-40 rows/targets, maxUses 1-40, uniqueness, `uses >= rows`).
- **Release boundary.** Student slots are built with strict `StudentSlotV4Schema` (`snapshot-builder.mjs:31`); keys live only in `privateSnapshot`. `ClozeInteractionSchema` is `.strict()`, so an accidental `acceptedValues` would be rejected, not leaked. Released review is the only path returning `correctAnswer`.
- **Frozen routes.** `routes-v4.ts` overrides only `saveAnswer`, `getAttempt`, and `releasedResult`; v1/v2/v3 registries are untouched. `attempt_protocol_allowed` gates the history and access predicates widened to `practice-binary-v3` (`029` and `030` history functions already route through it). `practice_question_compatible` requires blueprint/4 for question/3.
- **Idempotent saves.** `exam_answer_save` is unchanged, and the TypeScript request schema does not normalize response strings, so the stored body is the exact client string.
- **Shortcut bypass.** `exam-shortcuts.js` (unchanged) already ignores `input`, `select` and `textarea` targets; the new cloze/matching controls are covered.
- **Progress.** `isQuestionAnswered` and `persistent-api.js` `answered()` use completeness; `hasAnySavedAnswer` only drives the partial/saved indicator.
- **Corpus safety.** The reading-interactions package hard-codes `copyrightVerification: 'UNVERIFIED'` and `publicationPermission: false`; no approve or publish transitions were found in the package or verifier.
- **Syntax.** `node --check` passed for: `versioned-binary.mjs`, `attempts.mjs`, `track-b.mjs`, `student.mjs`, `bank.mjs`, `questions.mjs`, `content-safety.mjs`, `allocation.mjs`, `directory.mjs`, `service.mjs`, `main.js`, `persistent-api.js`, `staff.js`, and the three corpus tools.

## Areas reviewed

- Contracts: `cloze-matching.ts`, `question-v3.ts`, `student-v4.ts`, `released-review-v4.ts`, `blueprint-v4.ts`, `routes-v4.ts`, `staff-v3.ts` (enum/literal check only), diffs of `identity.ts`, `internal.ts`, `assembly-reference.ts`, `factory-package-v3.ts`.
- Migration 031: full validator and scoring sections, catalog copy, delivery/selection gates, protocol guards, release/history predicates.
- Scoring: `versioned-binary.mjs`, worker policy filter (`exam-worker.mjs`).
- Runtime: `attempts.mjs`, `service.mjs`, `directory.mjs`, `asset-service.mjs`, `allocation.mjs`, `candidate-stock.mjs`, `snapshot-builder.mjs`, `versioned-contracts.mjs`, `pool.mjs`, `bank.mjs` (v4 allowlist), `questions.mjs`, `publication-gates.mjs`, `publication.mjs` (gate function), `review-context.mjs`, `review-snapshot.mjs`, `content-safety.mjs`, `manual-import-mapping.mjs`, `track-b.mjs`, `student.mjs`, `server.mjs` regex changes.
- UI: `main.js` diff (cloze/matching render, progress, save/clear, `updateProductHeader`), `persistent-api.js` diff (v4 validation, ack handling, `sameValue`), `staff.js` diff (`parseClozeDraft`, `parseMatchingDraft`, preview, key text, protocol scope), `exam-shortcuts.js` guard.
- Corpus: `reading-interactions.mjs` (matching and cloze derivation, key extraction), `reading-interactions-package.mjs` (verification flags, grep of state transitions), `verify-reading-interactions.mjs` (grep only).

## Areas not reviewed

- Test bodies: `tests/integration/bank/cloze-matching-*.test.mjs`, `tests/integration/local/cloze-matching-migration.test.mjs` (populated-upgrade coverage not checked), `tests/scoring/cloze-matching.test.mjs`, `packages/contracts/test/*`, Playwright journeys in `scripts/`. Not run, per constraints.
- Unread: `staff-v3.ts` body, `factory-package-v4.ts`, `manual-factory-schemas-v4.ts`, `manual-factory-core.ts` body beyond reachability, `manual-import-coordinator.mjs`, `manual-import-configuration.mjs`, `fixed-form-sealing.mjs`, `exam_answer_save` and `exam_attempt_view` SQL bodies (not in migration 031), rest of `persistent-api.js` and `staff.js` list rendering, `styles.css`, `docs/decisions/OPEN_DECISIONS.md`, `tests/ai/corpus-reading-interactions*.test.mjs`.
- No TypeScript typecheck, no build, no migration apply, no SQL execution. SQL parity is by reading only.

Status: DONE_WITH_CONCERNS
Summary: No P0 defects. One P1 (corpus DRAFT keys clipped by a double parenthesis strip, verified by execution) blocks owner review of the corpus import; the cloze/matching scoring, normalization and release boundary match the design on reading.
Concerns/Blockers: P1-1 must be fixed before any Reading DRAFT import is accepted. P2-1 needs an owner decision or removal. Test bodies, typecheck and DB-backed migration checks were not run per constraints.
