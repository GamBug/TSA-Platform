# CP3a retained Reading import — DONE

Date: 2026-11-09, Asia/Bangkok. Starting HEAD: `0dc1f118dfb122ab87082a83ca109e2f2190b473`.
Scope: owner-authorized retained `.local/track-b` import; pending card/decision edits included.
All ten bundles imported through the existing coordinator and replayed exactly; 100 Reading DRAFTs in ten groups.
Source keys retained; imported provenance uses empty triage, omitting all blind-solve doubts.
Registered an additive READING / READING_REASONING taxonomy and used the existing author, separate from reviewers.
Prior private verification artifacts and source captures remain unchanged; no corpus content is staged.

## Backups and private evidence

- Initial retained backup: `.local/track-b-backups/before-start-2iIGzp/database.dump` (plus `roles.sql`).
- Immediately before import: `data/corpus-ingest/cp3a-2026-11-09/retained-2026-11-09/backup/before-start-gOHGJx/database.dump` (plus `roles.sql`).
- Before existing runtime migrations: same private backup root, `before-start-Jjgsap/database.dump` (plus `roles.sql`).
- Fresh activation/mapping hashes and canonical-path pins: private `retained-2026-11-09/activation-{1..10}/trusted-pins.json`.
- Packages and activation admission/retirement journals remain beside the backup; no disposable pins were reused.

## Commands and observed results

- Import script syntax and import-only checks — PASS; controller reran both checks.
- `npm run test:factory:manual:transport` — PASS, 28 tests; includes contract build.
- `node --test tests/ai/corpus-reading.test.mjs tests/ai/corpus-reading-import.test.mjs` — PASS, five tests.
- `npm run test:critical:privacy` — PASS, two tests, 159 HTTP responses.
- Private `import-retained.mjs` — ten imports/replays and 100-item staff queue/grouping PASS; final selection check failed on absent runtime function.
- Existing `migrate(ownerPool)` after backup — PASS, migrations 006–030 applied; retained database previously had only 001–005.
- Private `verify-retained.mjs` — PASS: 100 DRAFTs/100 receipts, ten groups, exact source keys, zero blind context, all 600 sources unchanged.
- All 100 staff contexts — RIGHTS_BLOCKED; zero reviews/eligible/selectable items; existing synthetic rights count remains one.
- `pg_restore --list` on the pre-import archive — PASS; archive table of contents readable (no restore trial).
- Independent `tsa_reviewer` review — DONE, no P0/P1 findings in final diff/scripts/private evidence; no independent DB execution or restore trial.
- `npm run docs:check`; `git diff --check` — PASS; private corpus/artifacts excluded from Git.

The first sandbox launch could not bind a local socket; approved local execution resolved that restriction.
The missing-function check occurred after durable imports; existing runtime migrations resolve the schema gap.
Private verification summary/receipts: `data/corpus-ingest/cp3a-2026-11-09/retained-2026-11-09/verification-summary.json` and `import-receipts.json`.
No new migration or application behavior was authored. Approval, publication and rights grants remain excluded.
Owner requested startup after the local commit; the final chat will provide the observed staff URL.
Next checkpoint: CP3b Math; recommend Codex Plus Sol 6.1 medium if available, otherwise the current subscription model.
