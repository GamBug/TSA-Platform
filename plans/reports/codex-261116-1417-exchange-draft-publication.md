# Exchange drafts can use the owner publication workflow

The two implementation blockers are repaired without a migration, question/API contract change, answer change or retained
publication. A physical-copy rehearsal approved nine Reading passage drafts and image-bearing `SCIE-T26SC-000101`, made
them selectable, and created two ordered passage bundles. The real Bank remains unchanged: 276 Math + 100 Reading served,
141 exchange DRAFTs, and none of those drafts selectable.

Codex implemented and reviewed this work as one agent on `feat/track-b-data-auth`, starting clean at `527c54b` on
2026-11-16 (Asia/Bangkok). No delegation or independent review occurred. The owner authorized implementation, copy-only
publication rehearsals and local commits; no push, merge or retained approval was authorized.

## Cause and change

The acceptance boundary was to let registered, inspected images pass the existing checks and let corpus exchange drafts
use owner publication with ordered passage bundles. Answers, private corpus, retained workflow state, schema and public
contracts were excluded. Diagnosis preceded regression tests, implementation, copy rehearsal, suites, review and docs.

- `src/http/bank.mjs` omitted `imageStore` from all three publication-service constructors. `validateWorkflowTarget` in
  `publication-gates.mjs` consequently passed `inspectedImages: false` to content safety; owner approval also passed `null`.
  Migration 028 already provides immutable asset inspections and delivery checks. The existing `checkReferencedImages`
  verifies registered metadata, private bytes, decoder receipts and pinned inspection. Those checks are unchanged.
- `listOwnerCandidates` required origin `IMPORTED`, while exchange receipts identify `MANUAL` versions.
  `createPassageBundles` joined only factory receipts, excluding exchange passage questions.

The fix injects the store through the local runtime and all three HTTP publication services. The owner command constructs
the existing guarded local store only when candidates reference images, and supplies it again for approval. Text-only
publication needs no image directory. Default embedded runtimes reject images without an explicitly supplied store.
Candidate selection admits receipt-backed `MANUAL` exchange versions while preserving the corpus-source filter. Bundles
include exchange receipts ordered by exchange question id; factory ordering, complete receipt checks and existing-bundle
guards remain. Dry-run defaults, exact confirmation, rights handling, independent review, duplicates, delivery and final
selectability checks remain. Approval audit text no longer claims agent-derived keys are authoritative.

The added exchange integration regression exercises ten image-bearing drafts across all six types, images in questions,
options, passages and explanations, disabled/missing-byte stores, owner reinspection, mixed DRAFT/IN_REVIEW candidates,
confirmation, bundle order/replay, inspected profiles and unchanged keys. Existing tests reject unregistered asset codes.

## Physical-copy evidence

The stopped retained cluster had no postmaster PID or startup lock. `cp -a` copied `.local/track-b` into
`.local/publication-rehearsal-261116-1417/baseline`, `rehearsal` and `successful-rehearsal`; images were copied to `images`.
No retained cluster was started. The baseline showed all 141 exchange versions DRAFT and unselectable, with 276 Math +
100 Reading served while numeric and cloze/matching selection were enabled.

`node /tmp/tsa-publication-rehearsal.mjs` completed on `successful-rehearsal`. The owner command's programmatic entry
point printed `PUBLISH 141 ALL` in a dry run, found zero missing rights, and published nine Reading drafts with exact
confirmation `PUBLISH 9 READING`. It printed `Passage bundles created: 1` and `Approved and published: 9`. The same HTTP
submit, owner singleton, bundle and owner-approval paths then published only `SCIE-T26SC-000101` with the copied store.
Final assertions printed:

```json
{"before":[{"section":"MATH","n":276},{"section":"READING","n":100}],"after":[{"section":"MATH","n":276},{"section":"READING","n":109},{"section":"SCIENCE","n":1}],"published":10,"bundles":2,"immutableUnchanged":true,"allMathWorkflowUnchanged":true}
```

The ten questions were APPROVED, selectable and bundled in exchange-id order. All version content and private
answers/explanations had identical aggregate digests before and after. Every Math workflow row and eligible pointer had
the same aggregate digest. None of the five disputed Math drafts or held duplicate was submitted, approved or changed.
Rehearsal data and backups were preserved locally and not staged.

A Python before/after SHA-256 comparison printed `Retained Bank unchanged: all 1410 file paths and SHA-256 digests match.`
This establishes unchanged real stock, approvals, rights and drafts. Evidence files `retained-manifest-before.json`,
`retained-manifest-after.json`, `successful-result.json` and `science-validation.json` are in the rehearsal directory.
Ephemeral rehearsal scripts remain under `/tmp/tsa-publication-*.mjs`.

## Commands and results

Linux, Node 24.18.0, PostgreSQL 18.6. Every command below exited 0 on its final run, with no skipped tests. Full suite
outputs and `results.json` are under `/tmp/tsa-publication-verification-261116/`.

| Executed command | Printed result |
|---|---|
| `node --test tests/integration/local/owner-publication-plan.test.mjs tests/integration/local/bank-correction.test.mjs` | 6 tests, 6 passed, 0 failed. |
| `npm test` | 237 tests, 237 passed, 0 failed. |
| `npm run test:exchange-import` | 8 tests, 8 passed, 0 failed; rerun after final assertions with the same result. |
| `npm run test:image-library` | 6 tests, 6 passed, 0 failed. |
| `npm run test:verification` | 6 tests, 6 passed, 0 failed. |
| `npm run test:question-bank` | 53 tests, 53 passed, 0 failed. |
| `npm run test:bank` | 190 tests, 190 passed, 0 failed. |
| `npm run test:docs` | 13 tests, 13 passed, 0 failed. |

Embedded builds passed. No browser test or independent review is claimed. Inline review used the code-review skill on
the full task diff and gate implementation and found no remaining implementation issue.

`npm run docs:check` passed with `errors: []`; its six warnings are existing pinned research/review whitespace and historical
image-link warnings. `npm run test:docs` passed again after documentation edits (13 passed, 0 failed). `git diff --check`
and the staged credential-pattern/scope scan passed. New report links were checked against existing files before staging;
the final docs check also includes the staged report. The implementation and regression are committed locally as
`f529b55` (`fix(bank): support inspected exchange draft publication`); the companion documentation commit contains this
report and the three updated owning docs. No private data, images, answer files or backups are staged, and nothing is
pushed or merged. All task-started PostgreSQL/HTTP runtimes were closed; rehearsal directories and backups remain intact.

## Observed failures and limits

The first regression tried renaming an immutable synthetic source and failed with `23514`; the fixture now creates its
correct source title. The next run reproduced the candidate bug (`0 !== 4` candidates). After implementation it passed.
Expanded tests initially omitted their PROBABILITY topic map (`0 !== 10` imported); the existing mapping fixed the fixture.
None of these failures involved the retained Bank.

The first broad Science rehearsal stopped during submit-review with `422 VALIDATION_ERROR` for `SCIE-T26SC-000404`.
`node /tmp/tsa-publication-diagnose.mjs` traced the unchanged TeX allowlist check. `node /tmp/tsa-publication-scan.mjs`
checked all 26 Science versions in rolled-back transactions: 22 passed, including all eight image drafts; `000401`–`000404`
failed on their shared passage. `node /tmp/tsa-publication-tex.mjs` printed `Unsupported passage commands: [ 'rightleftharpoons' ]`.
The failed-copy state was preserved; no gate was weakened.

Publication remains incremental. A whole Science batch currently stops on that content issue and can leave preceding
submissions IN_REVIEW. The dry run reports counts and rights, not complete content readiness. The successful rehearsal
therefore used the full Reading command and targeted existing owner functions for one Science image question.

## Unresolved owner decisions

1. Authorize new immutable content versions for the passage shared by `SCIE-T26SC-000401`–`000404`, using supported
   notation, or separately consider an ADR proposal to extend the TeX contract. This task changes neither.
2. Resolve five Math key disagreements (`MATH-T26K1-000020`, `000026`, `000037`, `MATH-T26K2-000030`, `MATH-T26K3-000033`),
   nine `key-uncertain` drafts, and held duplicate `22b00db1`. Their answers and status remain unchanged. Do not confirm a
   blanket batch while those decisions remain open.
3. Review and authorize any real publication. Copy rehearsals establish engineering behavior, not content correctness
   or approval of agent-derived keys.
