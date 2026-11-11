# Numeric Math importer

Status: DONE_WITH_CONCERNS — the importer works end to end against a real database and is committed (`b3fbfea`). No numeric items are in your Bank yet, and nothing can deliver them to students yet.
Date: 2026-11-11 (Asia/Bangkok). Authority: [owner attestation and CP7 authorization](../../docs/decisions/OPEN_DECISIONS.md#corpus-permission-attestation-and-owner-publication--2026-11-11); you asked for this importer after the [full Math import](claude-261111-2010-math-full-bank-import.md).

## What it does
- A new private profile, `corpus-math-numeric-draft/1`, rides on the existing manual transport: same parser, mapping, activation pins, admission journal and coordinator.
- Each captured numeric item becomes a `question/2` DRAFT with a numeric interaction, the `practice-binary-v2` policy and a private canonical decimal key (a period, optional minus sign, no leading zeros; source keys written with a comma are converted first).
- It has its own producer namespace, `tsa.corpus.math-numeric.v1`, because the Bank allows only one profile per namespace.
- Items keep imported provenance, per-capture hashes and the same answer-leak check as the choice profile. Imported rows stay DRAFT, rights-blocked and unselectable.
- Builder: `tools/corpus-ingest/math-numeric-package.mjs`. Wiring: contract schemas, the package builder and validator, and four bank modules (mapping, activation, coordinator, import). The question/2 reader and content-safety check apply to this profile only.

## Checks run
- New: `tests/ai/corpus-math-numeric.test.mjs` (4 tests: build and parse, rejected keys and tampering, decimal canonicalisation, activation journal) and `tests/integration/bank/numeric-math-import.test.mjs` (a real database: import, exact replay, stored rows, staff queue, rights block).
- Existing suites still pass: transport 28, corpus 26, bank 183, local 33, privacy 2, numeric 19, cloze and matching API 21, contract artifacts, typecheck and docs check.
- The docs check had been failing since the demo launcher commit tracked seven rehearsal screenshots. They are now untracked (files kept) in `48b1d58`.

## What it does not do yet
- **No numeric items imported.** 99 numeric captures remain deferred (63 from the full import, 36 from the first). I would have to transcribe them again, and many show a figure or table, so a text-only importer will take perhaps half.
- **Publishing:** `bank:owner-publish` skips anything that is not `question/1`. It needs a numeric mode (the numeric runtime flag and the numeric publication checks).
- **Delivery:** the demo plans only `question/1` offerings. A numeric practice must be its own offering made only of `question/2` items (numeric forms require every slot to use `question/2`), served at the `?student=postgres-v2` mode, and the numeric opt-in cannot run together with the cloze and matching opt-in.

## Unresolved questions
- Should I now transcribe and import the numeric items that are text only?
- Should I also build the numeric publish mode and a numeric practice offering in the demo, so students can actually answer them?

## Next owner action
None until you answer the questions above.
