# Cloze and matching practice

This optional local Track B capability adds text-entry (cloze) and matching items through the existing
Bank, allocation, attempt, grading and released-review services. It is unofficial practice and is off by
default in the retained development runtime. The university demo enables it for published Math
offerings. Design: [CP4 interaction design](../../plans/261108-1553-codex-autonomous-demo/cp4-design.md).

## Run a disposable demonstration

```sh
npm ci --ignore-scripts
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:cloze-matching
```

The launcher builds the contracts, creates its own temporary database with six original synthetic
questions (one per interaction type), and prints a loopback URL ending in `?student=postgres-v4`.

## Answer behavior

- **Cloze.** Each field is a labelled native text input. Comparison applies Unicode NFC and an outer trim
  only; it is case-sensitive and keeps Vietnamese diacritics and internal spaces. Other spellings count
  only when the private key lists them as accepted variants. The saved response keeps the raw string.
- **Matching.** Each row is a labelled native select with an empty option. A target at its reuse limit is
  disabled for the other rows. No drag interaction exists.
- Both types score one point only when every field or row is correct. A partly filled item saves but
  stays incomplete in the progress count. Save and Clear are explicit, and Clear persists typed nulls.
- Typing in a field or operating a select bypasses the global exam shortcuts.

## Version boundaries

`question/1`, `question/2`, `/api/v1`, `/api/v2` and `/api/v3` stay closed to these types. The additive path
uses `question/3`, `blueprint/4`, `practice-binary-v3` and `/api/v4` (catalog, attempts and the Bank
question routes). Migration `031_cloze_matching.sql` is additive. Safe contract subpaths are
`@tsa/contracts/student-v4`, `@tsa/contracts/released-review-v4` and `@tsa/contracts/staff-v3`. Accepted
variants and matching keys stay private until the established release boundary.

## Staff and retained local runtime

A retained local runtime needs both flags:

```sh
NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true LOCAL_STUDENT_ENABLED=true LOCAL_CLOZE_MATCHING_ENABLED=true npm run dev:track-b
```

Startup takes a private backup before migrations. The `/api/v4` Bank route lists and reviews only
`question/3` versions, so the staff workspace shows a "Nhóm loại câu hỏi" selector that switches the
question list between the existing types and cloze/matching. Reviewers get the selector whenever the
route is enabled. Authors get two extra interaction types in the draft form:

- Cloze: one field per line as `label | accepted answer | further accepted answer`, plus a maximum
  input length (1–256).
- Matching: one row per line as `row label | correct target label`, optional distractor targets one per
  line, and a per-target reuse limit. Targets are shown ordered by label, never by row order.

Creation stays DRAFT. Source rights remain authoritative, and approval and publication remain owner
actions.

## Corpus import

`node tools/corpus-ingest/verify-reading-interactions.mjs` checks the keyed Reading cloze and matching
captures through a disposable Bank database only. It never approves, publishes, or writes to a
retained database, and it leaves keyless true/false captures in a deferred report.

Math uses the separate private `corpus-math-interactions-draft/1` profile and
`tsa.corpus.math-interactions.v1` namespace. Its factory/4 batches contain 1–20 standalone
question/3 drafts, with capture hashes, source-key evidence, private raw artifacts and strict replay.
Reading's passage grouping and seven/eight-candidate rules remain unchanged. The
[Math package builder](../../tools/corpus-ingest/math-interactions-package.mjs) validates the typed
projection before writing private artifacts. The [intake command](../../tools/corpus-ingest/import-math-interactions.mjs)
checks a pinned transcription and the complete original source manifest before opening the Bank:

```sh
node tools/corpus-ingest/import-math-interactions.mjs \
  --source-root TSA_Example_Questions --transcription /private/transcription.json \
  --manifest /private/source-manifest.json --output /private/new-import-run \
  --data-directory .local/track-b
```

This is inspection only. Explicit `--import` takes a database backup before any data writes and
imports unpublished drafts in bounded batches. A separate append run requires a new output folder,
new batch numbers (`--batch-start`) and an explicit receipt baseline (`--expected-existing-receipts`);
previously imported capture paths are rejected. A stopped run retains its package, mapping,
activation/admission journals and completed receipts: inspect those before recovery, rather than
generating new identities for a committed batch.

Visible matching pools are preserved. Missing pools are derived only from captured correct texts
and flagged as adaptations requiring owner review. A target's reuse bound is the row count, an
explicit adaptation rather than a claim about the source interaction. Symbolic cloze questions state
their keyboard notation; comparison remains exact text after the existing normalization, with no
algebraic equivalence or unrecorded accepted variants.

After owner publication, `npm run demo:uni` offers a separate four-question, six-minute Math practice
at `?student=postgres-v4` when one taxonomy version contains enough published standalone items.
Choice and numeric offerings remain separate. See the [run of show](TRACK_B_SUPERVISOR_RUN_OF_SHOW.md).

## Verification

```sh
npm run build && npm run typecheck && npm test
node --test tests/integration/local/cloze-matching-migration.test.mjs tests/integration/bank/cloze-matching-*.test.mjs
node --test tests/integration/student-runtime/cloze-matching-practice.test.mjs tests/scoring/cloze-matching.test.mjs
npm run test:b0
npm run test:student:cloze-matching
npm run test:student:cloze-matching:firefox
npm run test:staff:cloze-matching
node --test tests/ai/corpus-math-interactions.test.mjs tests/integration/bank/math-interactions-import.test.mjs
MATH_INTERACTIONS_BROWSER=true node --test tests/integration/bank/math-interactions-import.test.mjs
```

Browser scripts need the existing local Chromium and geckodriver setup. Chromium checks a 375px
layout and Firefox a 500px one. Executed evidence:
[CP4 completion report](../../plans/reports/claude-261110-1215-cp4.md).
