# Blind answer verification

Source answer keys can be wrong (the 2026-11 audit found five published Math items whose keys did not hold up). This
workflow checks keys the way a second examiner would: a solver answers each question **without seeing the key**, and
only then are the answers compared. It never writes to the Bank and never changes a key; a human decides what follows.

## Steps

1. **Export a blind batch** from a copy of the Bank (or the Bank itself; the command is read-only):

   ```
   TRACK_B_DATA_DIRECTORY=<copy> npm run questions:verify -- export --section MATH --out-dir <private dir> \
     --label math-b01 [--types SINGLE_CHOICE,NUMERIC_RESPONSE] [--exclude-batches math-batch-001,...] [--limit 20] [--offset 0]
   ```

   It writes `math-b01.blind.json` for the solver (prompts, choices, labels, statements, targets: no keys, no
   explanations, no version ids, no source names, ids salted per export) and `math-b01.private.json` (owner-only; holds
   the keys and the join to version ids). Keep both outside Git.

2. **Solve** the blind file independently, preferably with exact arithmetic for numeric work. For each item write a
   solution to `math-b01.solutions.json`:

   ```json
   { "format": "tsa-blind-solutions/1", "exportHash": "<copy from the blind file>", "solver": "who or what solved it",
     "solutions": [ { "itemId": "Q-1a2b3c4d5e", "answer": { "optionId": "C" }, "confidence": "HIGH", "ambiguous": false,
                      "reasoning": "short derivation" } ] }
   ```

   Answer shapes: `{optionId}`, `{optionIds:[...]}`, `{values:{statementId:true}}`, `{value:"0.46"}`,
   `{values:{fieldId:"text"}}` for cloze and `{answers:{rowId:"targetId"}}` for matching. Use `confidence: "HIGH"` only
   when the result was checked a second way; use `ambiguous: true` when the problem statement admits no single answer.

3. **Compare**:

   ```
   npm run questions:verify -- compare --private math-b01.private.json --solutions math-b01.solutions.json --out-dir <dir>
   ```

   The comparison refuses solutions written against a different export (the `exportHash` must match). It writes a private
   report naming each version and a summary with counts only.

## Verdicts

| Verdict | Means |
|---|---|
| `VERIFIED` | The solver answered, was `HIGH` confidence, flagged no ambiguity, and agrees with the stored key. |
| `DISPUTED` | `HIGH` confidence, no ambiguity flag, and a different answer. Re-solve it before doing anything; then repair or withhold it with `npm run bank:correct`. |
| `NEEDS_HUMAN_REVIEW` | Everything else: no answer, a malformed answer, `MEDIUM` or `LOW` confidence (even when it agrees), an ambiguity flag. |

Uncertain results are never promoted to `VERIFIED`, and `DISPUTED` is never acted on automatically. Answers are
compared by value (decimal equality for numbers, Unicode NFC and trimmed outer spaces for cloze text, sets for multiple
choice), not by spelling.

## What it does not prove

Agreement between two solvers is evidence, not proof: both can share a misreading, and a question can have a defective
statement that both solve "correctly". Verification also cannot judge whether a question is good, whether the source
rights allow it, or whether its figure matches its text.
