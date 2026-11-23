# Correcting or withholding a published question

A published question version is immutable. A defect is repaired by adding a new version of the same question, or the
question is withheld; nothing is edited or deleted. `npm run bank:correct` does both through the existing workflow and is
meant for the project owner. The specification it reads carries answer keys, so it stays outside Git.

## Specification

```json
{ "reason": "Why this batch exists (at least 10 characters).",
  "items": [
    { "versionId": "<uuid of the served version>", "action": "REVISE", "classification": "INCORRECT_ANSWER_KEY",
      "note": "What was wrong and how it was established (10-1500 characters).",
      "changes": { "answerKey": { "type": "SINGLE_CHOICE", "optionId": "B" }, "explanation": [ { "type": "text", "text": "…" } ] } },
    { "versionId": "<uuid>", "action": "WITHHOLD", "classification": "INVALID_PROBLEM", "note": "…" } ] }
```

- `REVISE` may change `answerKey`, `content`, `interaction` and `explanation`; everything else is copied from the parent
  version. Classifications: `INCORRECT_ANSWER_KEY`, `INCORRECT_OPTIONS`, `INCORRECT_EXPRESSION`, `INCORRECT_TRANSCRIPTION`,
  `AMBIGUOUS_QUESTION`, `INVALID_PROBLEM`, `DUPLICATE_OF_SERVED_QUESTION`.
- `WITHHOLD` quarantines the version with the reason `NEEDS_MANUAL_REVIEW (<classification>): <note>`.

## Run

```
npm run bank:correct -- --spec <private-spec.json>                     dry run: one line per item, no answers printed
npm run bank:correct -- --spec <private-spec.json> --confirm "CORRECT 6"
```

Take a byte-for-byte copy of `.local/track-b` while the cluster is stopped first; the command also backs up through the
workspace runtime. Each revision is created by the author account, submitted for review, then approved by the owner
reviewer account on the maintenance connection, which repeats every publication check (rights, delivery checks,
equivalence, author is not the approver). Only the question's eligible pointer moves; the old version stays as history
and students are served the new one. Requests carry deterministic idempotency keys, so a repeat after a failure does not
create a second version.

## Limits to know

- A run that stops after creating revisions but before approving them leaves those versions IN_REVIEW while the originals keep serving. The error names them. Approve them with the owner path or ask for the run to be repaired; running the same specification again is refused, because the original is no longer the latest version.
- A quarantined version blocks every later version derived from it, so a withheld question cannot be repaired by
  revising it. Repair it by importing a corrected question under a new id, or do not quarantine until the repair exists.
- Passage questions (shared stimulus) cannot be revised this way.
- The student renderer displays balanced legacy `\italic{…}` markers in passage text as emphasis. The stored
  passage and its content hash stay intact.
- If a corrected version becomes an exact duplicate of another published question, the Bank holds an open duplicate
  relation and neither is served until it is resolved. Check for siblings before correcting.
- To undo a batch, restore the physical copy while the cluster is stopped.
