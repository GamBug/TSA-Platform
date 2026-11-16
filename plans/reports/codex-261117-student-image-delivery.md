# Student image delivery verification

The local university demo now delivers registered, inspected library figures to students. Copy-only Chromium tests
passed for real Math and Science images, mobile enlargement, saved answers, reload and correct grading. The retained
Bank is unchanged and no new questions have been published there.

## Scope and cause

The owner requested connecting and browser-testing image delivery. Codex worked alone on `feat/track-b-data-auth`,
starting clean at `60cc4a0`. Existing public contracts, publication authority, immutable content and answer keys were
reserved. Acceptance required visible images in real student journeys and preserved private delivery checks.

Code inspection proved two disconnected dependencies: `createTrackBRuntime` supplied `imageStore` to Bank handlers but
omitted it from `prepareStudentComponents`; `startUniDemo` supplied no store at all. Existing student asset routes and
renderers already supported images. A new integration test first failed with HTTP 404 where the owning student needed
HTTP 200, reproducing the missing connection.

`src/local/track-b.mjs` now forwards the store to student components. `src/local/uni-demo.mjs` opens an existing private
library in PUBLISHED mode, and `scripts/start-uni-demo.mjs` resolves the configured/default directory. A missing directory
stays absent and fails closed. REHEARSAL mode defaults to no private library. Existing local-only, permissions, symlink,
content-hash, inspection, purpose, rights and attempt-membership checks remain in force. No migration or public contract
changed. The regression test verifies exact PNG bytes, private no-store caching, other-student denial, explanation denial
before release, explanation delivery after grading and a missing store on a real owned attempt.

## Copy-only rehearsal and browser evidence

Private evidence is under `.local/student-image-delivery-261117/`. `source-before` physically preserves the prior reviewed
rehearsal Bank. `source` and `images` are physical copies; database backups preceded copy-only approvals and selection.
The source copy deliberately exposes ten questions for deterministic testing. The retained Bank was never started or
written by this task. Before/after SHA-256 manifests match all 1,410 retained files, preserving the verified stock of
276 Math + 100 Reading and 141 unpublished exchange drafts.

The private preparation harness was run as `node /tmp/tsa-prepare-image-browser.mjs`. The browser command was
`node /tmp/tsa-uni-images-browser.mjs`. Both scripts and suite logs are preserved under the private evidence directory.
The browser harness exercised `startUniDemoFromEnvironment` against the copy, including export and disposable restore.

Chromium produced `browser/report.json` with `status: PASS`, 16 successful image responses, zero JavaScript exceptions
and 17 screenshots. The following journeys passed:

- A generated inspected-image fixture verified question delivery, desktop/tablet/mobile enlargement, Escape focus
  restoration, saved-answer reload and a released explanation image.
- Three Science velocity questions showed seven passage/option figures and graded 3/3.
- The corrected Math graph question showed its figure and graded 1/1.
- Two Science mussel passage questions showed their figures and graded 2/2.
- Four Math cloze/matching questions included circle and exponential figures and graded 4/4.

Real question codes were Math shift 2 questions 12, 20 and 30; Math shift 1 questions 16 and 34; and Science questions
603, 604, 605, 803 and 805. This used the already reviewed higher version of Math shift 2 question 30 on the copy;
no original question or key was edited. Every journey saved answers, reloaded, submitted and opened released review.
Active student payloads were checked for absence of private keys/accepted values. Mobile image dialogs loaded at
375 px without horizontal overflow. Representative Math graph and cloze/matching screenshots were visually inspected.

Initial browser harness failures were diagnosed and corrected: this host required a test-only Chromium `--no-sandbox`
launch; topic controls needed asynchronous loading; clicking a graph-bearing option label opened enlargement, so answer
selection clicked its actual answer marker; returning from a graded result required the existing catalog navigation;
and cloze inputs use sibling labels. These were harness corrections, with private failure reports preserved. No student
UI shortcut or weakened check was added. The initial preparation request also needed numeric conversion of a PostgreSQL
bigint revision. The first green-path test assertion was corrected to the existing `private, no-store` cache contract.
All final runs passed. Owned browsers, servers and copied database processes were closed afterward.

## Commands and observed results

| Command | Final output |
|---|---|
| `npm run test:demo:uni` | 17 passed; exit 0; no skips |
| `node --test tests/integration/local/track-b.test.mjs tests/integration/local/student-workspace.test.mjs` | 16 passed; exit 0; no skips |
| `npm run test:media` | 56 passed; exit 0; no skips |
| `npm run test:student` | 85 passed; exit 0; no skips |
| `npm test` | 237 passed; exit 0; no skips |
| `npm run test:exchange-import` | 8 passed; exit 0; no skips |
| `npm run test:image-library` | 6 passed; exit 0; no skips |
| `npm run test:verification` | 6 passed; exit 0; no skips |
| `npm run test:question-bank` | 53 passed; exit 0; no skips |
| `npm run test:bank` | 190 passed; exit 0; no skips |
| `npm run test:docs` | 13 passed; exit 0; no skips |

`npm run docs:check` exited 0 with no errors and six preserved historical warnings; anchor validation reports
`NOT_CHECKED`. The final `npm run test:docs` rerun printed 13 passed, zero failed and zero skipped.
`git diff --check` exited 0. Logs in `suite-results/00.log` through `10.log` correspond to the table. Counts overlap across suites and are not unique tests.

Inline review using the code-review skill checked store configuration, cleanup, local-only guards, missing-store behavior
and private asset tests. No remaining implementation finding was identified. No independent review is claimed.

## Try the image test copy

From the repository root, run:

```sh
TRACK_B_DATA_DIRECTORY="$PWD/.local/student-image-delivery-261117/source" \
TSA_IMAGE_STORE_DIRECTORY="$PWD/.local/student-image-delivery-261117/images" \
DEMO_UNI_SOURCE_CREDIT="Disposable image delivery test copy" npm run demo:uni
```

Open `http://127.0.0.1:4180/?student=postgres`. Science topic practice with three questions shows passage and option
figures; Math topic practice with one question shows the graph. Open `?student=postgres-v4` for cloze/matching practice.
This is a ten-question test copy, not the complete retained Bank. Stop the launcher with Ctrl+C when finished.

Implementation is committed locally as `4b77835` (`fix(local): deliver library images in student demos`);
the companion documentation commit records this report. Nothing was pushed.

## Remaining decisions and limits

Firefox was not run for this change. Browser tests do not establish full corpus completeness or content rights.
The reviewed package still requires a separately authorized backed-up retained import and owner publication. No further
per-question decision was introduced by this delivery task. The held duplicate remains an owner decision and stays withheld.
