# Phase 4 — Data (Bank, inbox, figures, publication, question changes)

Purpose: check the question data is consistent and the owner's data commands do what they say, on the **copied** Bank.
Confirmed (writing) commands are allowed here because the Bank is a copy; reset it afterwards. Report:
`reports/phase-04-data.md`.

## A. Suites

```bash
npm run test:bank
npm run test:question-inbox
npm run test:question-change
npm run test:exchange-import
npm run test:owner-twins
npm run test:image-library
npm run test:verification
npm run test:question-bank
npm run test:db:preflight
npm run test:recovery
```

## B. Read-only inventory of the copied Bank

Write `scratch/inventory.mjs` that opens the copy and runs SELECT queries only:
```js
import { startPersistentPostgres } from '../../../src/local/postgres.mjs'
const db = await startPersistentPostgres(new URL('../../../.local/track-b', import.meta.url).pathname)
try { console.log((await db.ownerPool.query(`SELECT 1`)).rows) } finally { await db.stop() }
```
Run it with no demo running (the demo opens the same cluster). Record:
- 4.1 Versions per section and workflow state; served (eligible) questions per section and taxonomy.
- 4.2 Served questions per section compared with what tests need (40 Math, 20 Reading, 40 Science per test).
- 4.3 Served versions without an answer key (`tsa_private.question_secrets`), and without an explanation.
- 4.4 Open exact twins: `tsa.duplicate_relations` with `kind='EXACT' AND resolution='OPEN'`; and served questions in the
  same section with the same `normalized_fingerprint` (duplicates students could get twice).
- 4.5 Any stored content still holding an `image_request` block, or an image block whose asset is missing.
- 4.6 `npm run images -- list` (image library on the copy).

## C. Inbox and figures on the copy

- 4.7 `npm run questions:inbox` (dry run). The 6 rejected Math files are in `question-inbox/math/rejected/`; move one
  back (`mv` within `question-inbox/math/`, dropping the first `YYYYMMDD-HHMMSS-` prefix) and dry-run again: it must ask
  for figures with exact file names.
- 4.8 Make a placeholder PNG for each requested name of that file (e.g. with `sharp` in a scratch script, 200x150
  white image), save them in `question-inbox/math/`, dry-run: the file must now be OK with "N figure(s) attached".
  Then confirm with the printed phrase and check: questions are DRAFT, images registered (`npm run images -- list`),
  the PNGs moved to `imported/`.
- 4.9 Publish on the copy: `npm run bank:owner-publish -- --taxonomy-version <pool id printed by the inbox>` (dry run,
  then confirm). Record counts and any twin warning.

## D. Single-question changes on the copy

Use version ids from the inventory. For each, run the dry run, then confirm, then re-run the inventory query for it:
- 4.10 `npm run bank:question -- --version <draft id> --publish`
- 4.11 `--withhold --reason "QA check"` on a served question, then `--restore` on it.
- 4.12 `--section SCIENCE` on a served Math practice-pool question; and on a served Math corpus question (the dry run
  names the target taxonomy). Check only one version of each question is served afterwards.
- 4.13 A move onto an identical question in the target section must be refused (find a pair with the same fingerprint
  in 4.4, if any; otherwise mark NOT RUN with the reason).
- 4.14 Wrong confirmation phrase → refused, nothing changed. A backup appears in `.local/track-b-backups/` after a
  confirmed change.

## E. Reset

Stop every demo, then `rm -rf .local/track-b && cp -a .local/track-b.pristine .local/track-b`, and restore the inbox:
record in the report which inbox files you moved; move them back to `rejected/` if needed.

## Report focus

Numbers before and after each confirmed command. Anything that changed more than the command said is HIGH.
