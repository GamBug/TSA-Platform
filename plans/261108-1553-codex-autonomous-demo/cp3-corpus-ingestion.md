# CP3: Corpus ingestion (Reading, then Math) into DRAFTs

Goal: turn the permitted corpus into structured DRAFT questions that the owner can approve
quickly. Codex never approves or publishes questions.
Leader reasoning: medium. Reading builder: `tsa_light_builder`. Math builder: `tsa_builder`.

## Read first (only these)
`plans/reports/research-261106-1827-tsa-example-questions.md`, `docs/guides/MANUAL_DRAFT_TRANSPORT.md`,
`docs/decisions/OPEN_DECISIONS.md` (top two entries), and `src/modules/bank/manual-import-*.mjs`.

## Allowed files
New tools under `tools/corpus-ingest/`, their tests under `tests/ai/`, a generated private output
under `data/` (gitignored), and the manual-import mapping/config only if the card step requires it.
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
- AI checks are triage only: one independent blind solve per item, compared with the extracted
  key. A mismatch, ambiguity or cropped figure sets the item to `needs_owner_attention`; such items
  are never silently fixed.

## Steps
1. **Reading** (text, deterministic): parse the 200 captures, dedupe the 20 passages, emit v3
   manual-transport packages for the choice and true/false items, defer the rest. Add unit tests
   for answer stripping and for passage dedupe.
2. Import the Reading packages as DRAFT into a disposable local database through the existing
   coordinator. Verify that DRAFTs appear in the staff review queue with correct passage grouping.
3. **Math** (images): transcribe the PNGs into structured text with LaTeX. Use vision through the
   owner's subscription UI or an allowed local capability; do not call a paid API. Run the blind
   solve and key comparison. Crop diagrams without answer marks into the private inspected-image
   path. Flag clipped figures.
4. Write the queue summary into the report: counts per domain, type and topic; the
   `needs_owner_attention` list; and a sample of 10 items rendered for the owner to spot-check.

## Exit criteria
- At least 150 Reading DRAFTs and at least 80 Math DRAFTs import cleanly. Their public fields pass
  the existing content-safety and leakage checks (`npm run test:critical:privacy`, plus a new test
  that asserts no extracted key text appears in a public field).
- The corpus is unchanged (hash manifest before and after matches) and nothing from it is
  committed.
- STOP for owner: approve items in the staff UI. Publishing waits for the permission evidence
  record.
