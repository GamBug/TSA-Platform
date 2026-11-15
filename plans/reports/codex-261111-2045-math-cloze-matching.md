# Math cloze and matching intake and delivery

Status: DONE_WITH_CONCERNS. Implementer: current Codex session, single agent, 2026-11-11 (Asia/Bangkok). No subagents or independent review. Changes are uncommitted on `feat/track-b-data-auth`, starting at `61a35ab`; the preceding investigation report was preserved.

## Result

Inspected all 25 deferred captures and imported 22 unpublished question/3 DRAFTs: 10 cloze and 12 matching. Math now has 281 versions: 259 previously published and 22 new drafts. The Bank has 381 total versions, including the unchanged 100 Reading versions. Reviews, rights and eligible-version counts remain 359, 24 and 359. All 600 original corpus files and all pre-existing question content hashes are unchanged. New drafts remain unselectable. Across Math, 119 captures still lack retained imports.

The first import added 21 questions in batches of 20 and 1. Final review recovered HinhHoc/000087 as a text-only question: its written description fully defines the cube and inscribed cylinder, so the illustration adds no mathematical data. A second backup preceded its separate one-question batch. The supplemental record supersedes that capture's initial deferral; original records were retained.

| Unresolved capture | Source blocker |
|---|---|
| GiaiTich/000007 | The question depends on its graph. |
| HinhHoc/000007 | The question is unfinished and its keys are missing. |
| XacxuatThongke/000034 | The captured answer fields have no visible keys. |

## Implementation

- Separate private `corpus-math-interactions-draft/1` factory/4 profile, namespace `tsa.corpus.math-interactions.v1`, 1–20 standalone candidates per batch. Source hashes, private keys/provenance, raw projection, provisional classification, activation/admission pins and exact replay are enforced. Reading's profile, seven/eight-candidate bounds and shared passages remain unchanged.
- Owner publication supports question/3 through `/api/v4`, with the protocol's publication/selection gates and existing author/approver separation.
- `demo:uni` offers separate four-question, six-minute Math practice at `?student=postgres-v4` when one taxonomy has enough published standalone cloze/matching stock. Choice/numeric offerings stay separate; drafts never fill them.
- Six matching pools preserve visible choices. Six missing pools derive only from captured correct texts and are flagged for owner review. Row-count reuse bounds are explicit adaptations, not claimed source rules.
- Symbolic cloze answers use declared keyboard notation and existing exact-text comparison. There is no algebraic-equivalence grading or invented accepted variant set.

The [guide](../../docs/guides/TRACK_B_CLOZE_MATCHING.md) links the package builder and backed-up intake command. The [plan](../261111-2045-math-cloze-matching/plan.md) records scope; the [decision](../../docs/decisions/OPEN_DECISIONS.md#math-cloze-and-matching-intake--2026-11-11) records owner authorization.

## Verification

Environment: Linux, Node 24.18.0, PostgreSQL 18.6, local Chromium. Database/HTTP/browser runs used authorized execution outside the sandbox after socket, subprocess and loopback restrictions were observed. No dependencies were installed.

| Executed command/check | Observed result |
|---|---|
| `npm run build`; `npm run typecheck` | PASS. |
| `npm run contracts:check`; `npm run contracts:consumer-check` | PASS; HTTP artifacts and student import boundaries unchanged. |
| `node --test --test-isolation=none tests/integration/bank/*.test.mjs tests/ai/corpus-reading-interactions*.test.mjs tests/ai/corpus-math*.test.mjs tests/ai/manual-import-configuration.test.mjs tests/integration/local/*.test.mjs tests/integration/student-runtime/cloze-matching-practice.test.mjs tests/scoring/cloze-matching.test.mjs` | 251 passed; `/tmp/tsa-math-interactions-regressions.log`. |
| `npm test` | 192 passed after sandbox-restricted checks were rerun outside the sandbox; `/tmp/tsa-math-interactions-contracts.log`. |
| `npm run test:b0` | 86 passed; `/tmp/tsa-math-interactions-app.log`. |
| `MATH_INTERACTIONS_BROWSER=true node --test --test-isolation=none tests/integration/bank/math-interactions-import.test.mjs tests/ai/corpus-math-interactions.test.mjs tests/ai/corpus-reading-interactions-package.test.mjs tests/ai/corpus-reading-interactions-import.test.mjs tests/integration/local/uni-demo-seed.test.mjs` | Final focused run: 16 passed, including source/transcription pins, duplicate-capture guard, Math intake, actual Reading corpus regression and stock isolation. `/tmp/tsa-math-interactions-final-focused.log`. |
| Synthetic publication/demo journey | Missing-rights and self-approval rejection passed; four imported synthetic questions were approved only in a disposable test, allocated, saved, submitted and graded 4/4 through `/api/v4`. |
| Chromium journey in that demo | Both native types saved and graded 4/4; no console errors; no overflow at 375px. `/tmp/tsa-math-interactions-mobile.png` visually inspected. |
| Private intake preflight and two DRAFT runs | 127 strict KaTeX formulas; original corpus hashes and stored keys matched; exact replay; baseline counts/content hashes preserved. |
| `npm run bank:owner-publish -- --section MATH` | Dry run: 22 Math candidates; three sources lack display rights; phrase `PUBLISH 22 MATH`. |

Initial failures were resolved: a Reading-only namespace guard omitted the new profile; it now includes Math. A synthetic rights test used the external source UUID instead of the stored UUID; it now resolves actual owner-candidate sources. Two ad hoc preflight attempts had an unset taxonomy digest and a non-private temporary parent; corrected setup passed before retained intake. No failing check was weakened.

Inline review used the code-review skill. It added append-run duplicate-capture checks, guaranteed database cleanup after coordinator-stop failure, replaced an order-dependent schema lookup with a named schema, and preserved Reading acceptance. No independent review is claimed. Firefox and browser inspection of every real question were NOT RUN; browser content was synthetic. Final docs/link and diff checks are recorded in the handoff.

Final reconciliation confirmed 281 unique imported Math capture paths and 119 remaining paths; both new transcription pins and all 600 original hashes matched. `npm run docs:check`, new plan/report link checks and `git diff --check` passed. Process inspection found no remaining PostgreSQL or Chromium process from this task.

AgentKit plan finalization initially failed on its read-only user index, then on missing task-plan frontmatter. The index write was authorized, the task metadata corrected, and the CLI marked the plan completed. No skill code was changed. The local journal was created and validated; AgentWiki publish skipped.

## Private artifacts and recovery

Artifacts are under `data/corpus-ingest/cp3b-interactions-2026-11-11/` (git-ignored, owner-only). Initial `transcription.json` and supplemental `transcription-text-only.json` each have a SHA-256 pin. Both retained output directories contain raw artifacts, mappings, packages, activation/admission records, receipts and summaries.

- Before the first 21: `retained/backup/before-start-ovUMeA/database.dump`.
- Before the supplemental question: `retained-text-only/backup/before-start-svvjST/database.dump`.

Do not silently rerun intake with new identities. Receipt baselines and imported source-path guards reject duplicate intake; recovery uses the original committed batch package and admission records. No background process is retained by this task. No commits or paid provider calls were made.

## Owner next action and limitations

After reviewing the content/adaptations, the owner can run:

```sh
npm run bank:owner-publish -- --section MATH --confirm "PUBLISH 22 MATH"
```

Then restart `npm run demo:uni` with the existing source credit and open its cloze/matching URL. The retained command was run only in dry-run mode; actual publication helpers and delivery were tested on disposable synthetic data. No retained content was approved.

There was no independent blind solve. Source keys remain authoritative, including potentially questionable wording/keys: GiaiTich/000127 prints `fb` without parentheses, and XacxuatThongke/000054's third answer may depend on an unstated repetition restriction. Source wording and keyed values were preserved. Derived pools and exact symbolic forms also need owner review before publication.
