# CP3: Corpus ingestion (Reading, then Math) into DRAFTs

Goal: turn the permitted corpus into structured DRAFT questions that the owner can approve
quickly. Codex never approves or publishes questions.
Leader reasoning: medium. Reading builder: `tsa_light_builder`. Math builder: `tsa_builder`.

## Revision 2026-11-09 (takes effect when the owner's launch prompt approves it)
The first run stopped because the "150 Reading DRAFTs" minimum was an arbitrary planning number.
The corpus audit (`plans/reports/codex-261109-0913-cp3.md`) found 20 passages × 10 questions:
10 passages are fully keyed choice questions (100 items), 22 true/false items have no recoverable
key, and 42 items are other types. The revision has four parts:

- CP3 is split into **CP3a Reading** and **CP3b Math**. Each one is a separate Codex session and
  each has its own exit.
- **Reading target = the 10 fully keyed passages (100 DRAFTs).** The other 10 passages are deferred
  whole, so that ten-question bundles stay intact. True/false items without keys go to a
  `needs_owner_keys` list, and cloze and matching items go to CP4. Do not infer keys.
- **Math needs its own import path,** because the manual coordinator accepts only
  `manual-reading-draft/1`. Adding a Math draft schema, mapping and coordinator support, with
  tests, is in scope. It stays additive: the Reading path and the frozen contracts are unchanged.
- **Quota:** do small audits inline instead of spawning subagents and polling them. Pipe large
  outputs through `head` or counts. Math runs in batches of 20, and the session stops cleanly with a
  report when quota runs low; the next session resumes from the batch log.

## Resume authority 2026-11-09

After the provenance blocker, the owner explicitly directed: “BRO! I gave u full permission.
finish CP3a at any cost!” This extends CP3a to additive corpus provenance/schema/builder,
coordinator compatibility and necessary verification fixes, with the existing manual Reading
profile preserved. [Recorded scope and design](../../docs/decisions/OPEN_DECISIONS.md#cp3a-corpus-transport-compatibility--2026-11-09).
The requested 100-DRAFT outcome, no inferred keys and local/private/publication boundaries remain.
Audits are inline; at most one subagent performs the independent blind solve, without repeated polling.

## CP3a-import authority — 2026-11-09

The owner separately authorized loading the 100 verified Reading DRAFTs into the retained
`.local/track-b` database used by `npm run dev:track-b`, after a backup. Omit blind-solve
doubts from the retained review context, keep the source keys and DRAFT state, and grant no
rights or approvals. This includes the additive Reading taxonomy registration, fresh retained
activation pins, a local commit including the pending card/decision edits, and leaving the
requested staff server running. [Authority](../../docs/decisions/OPEN_DECISIONS.md#cp3a-retained-import--2026-11-09)
and [execution report](../reports/codex-261109-1615-cp3a-import.md).

## Read first (only these)
`plans/reports/research-261106-1827-tsa-example-questions.md`, `docs/guides/MANUAL_DRAFT_TRANSPORT.md`,
`docs/decisions/OPEN_DECISIONS.md` (top two entries), and `src/modules/bank/manual-import-*.mjs`.

## Allowed files
New tools under `tools/corpus-ingest/`, their tests under `tests/ai/`, a generated private output
under `data/corpus-ingest/` (add it to `.gitignore` first), the manual-import mapping/config, and,
for CP3b only, additive Math draft support anywhere in the existing import pipeline:
`packages/contracts/src/factory-package-v3.ts`, `packages/contracts/src/manual-factory-*.ts`,
`src/modules/bank/manual-import-*.mjs`, `src/modules/bank/factory-*.mjs`, and their tests. Reading
behavior and the existing tests must stay unchanged (owner extension, 2026-11-09).
The source files in `TSA_Example_Questions/` are read-only and never modified.

## Rules
- Separate each item into: public prompt and options, private key, private explanation (if
  present), source provenance (source-relative path plus hash), shared passage ID, interaction
  type, and proposed taxonomy.
- Strip all revealed answers and UI chrome. A public field must never contain the answer.
- Items authored by the import account carry provenance "corpus, non-profit permission
  (REQUIRES_VERIFICATION)". The owner is the approver, never the author.
- Types that are not yet supported (cloze, matching) are kept in a deferred output, not flattened
  into choice questions.
- **Source keys are authoritative** (owner policy 2026-11-09). An AI blind solve never casts doubt
  on a corpus key; a disagreement usually means the item's format is hard for the AI to read. Keep
  the source key and keep the item. Do not flag it for the owner and do not exclude it.
- For image domains (Math, Science), the blind solve is used only to catch **transcription**
  errors. On a mismatch, re-compare the transcription with the image. Fix a misread so it matches
  the image; otherwise keep the item unchanged. Only clipped or unreadable figures go to
  `needs_owner_attention`.

## Steps
1. **CP3a Reading** (text, deterministic): parse the 200 captures, dedupe the 20 passages, and emit
   v3 manual-transport packages for the 10 fully keyed passages. Write the deferred lists
   (`needs_owner_keys`, `cp4_types`). Add unit tests
   for answer stripping and for passage dedupe.
2. Import the Reading packages as DRAFT into a disposable local database through the existing
   coordinator. Verify that DRAFTs appear in the staff review queue with correct passage grouping.
3. **CP3b Math** (images): first add the additive Math import path and its tests. Then transcribe the PNGs into structured text with LaTeX. Use vision through the
   owner's subscription UI or an allowed local capability; do not call a paid API. Run the blind
   solve and key comparison. Crop diagrams without answer marks into the private inspected-image
   path. Flag clipped figures.
4. Write the queue summary into the report: counts per domain, type and topic; the
   `needs_owner_attention` list; and a sample of 10 items rendered for the owner to spot-check.

## Exit criteria
- CP3a: 100 Reading DRAFTs (10 passages) import cleanly. CP3b: at least 80 Math DRAFTs import
  cleanly. Their public fields pass
  the existing content-safety and leakage checks (`npm run test:critical:privacy`, plus a new test
  that asserts no extracted key text appears in a public field).
- The corpus is unchanged (hash manifest before and after matches) and nothing from it is
  committed.
- STOP for owner: approve items in the staff UI. Publishing waits for the permission evidence
  record.
