# ChatGPT question inbox

Write original practice questions in ChatGPT (web, no API cost), paste each answer into a folder, and import them with
one command. They go into a **separate practice pool**: students see them as extra practice cards whose names end in
"— câu hỏi luyện thêm". The real 40/20/40 full test and the standard practice never use them.
Decision: [OPEN_DECISIONS 2026-11-20](../decisions/OPEN_DECISIONS.md#chatgpt-practice-pool-and-question-inbox--2026-11-20).
The same steps (add files, check, import, publish) are also buttons on the local [admin page](ADMIN_PAGE.md).

```text
ChatGPT Project ──paste──▶ question-inbox/<subject>/ ──npm run questions:inbox──▶ DRAFTs in the pool
   ▲                                                    │ rejected file + .errors.txt
   └──────────── paste the error message back ◀─────────┘
DRAFTs ──owner review──▶ npm run bank:owner-publish -- --taxonomy-version <pool> ──▶ restart demo / upload Bank
```

## One-time setup

1. Register the pool (a new taxonomy version; a backup is taken first):
   `npm run questions:inbox -- --setup --confirm "REGISTER TAXONOMY"`. Without `--confirm` it is a dry run.
2. Create three ChatGPT Projects ("TSA Math", "TSA Reading", "TSA Science") and set each one up as described in
   [ChatGPT Projects for TSA questions](chatgpt-projects/README.md): paste `INSTRUCTIONS_<SUBJECT>.txt` into the Project
   instructions and upload `AGENT.md`, `SUBJECT_<SUBJECT>.md`, `AI_QUESTION_GENERATION_PROMPT.md`,
   `question-set.schema.json` and the listed examples.

Both modes go through this inbox and into the same separate pool. The inbox tells them apart by the batch id:
**CREATE** files (`GPT-…`) are registered as original work (`OWNED`); **TRANSCRIBE** files (`SRC-…`, questions copied
from your pictures or PDFs) are registered as corpus material under your attested permission (`LICENSED`, title
"Corpus transcription …"). The dry run prints `original` or `transcription` for every good file.

### Each chat: send only the request

```text
CREATE · topic PROBABILITY · 10 questions · default 4/3/3 mix · batch letter A
```

ChatGPT builds the ids from the date and the letter, for example batch `GPT-MATH-261122-A` and questions
`MATH-G261122A-000001` upward.

Give every batch new ids. ChatGPT cannot see which ids the Bank already holds; a reused id with different content
rejects the whole file. Putting the date and a letter in the id (`G261120A`, `G261120B`, …) avoids this.

## Daily loop

1. Copy ChatGPT's code block (use its Copy button) into a new file in `question-inbox/math/`, `reading/` or `science/`.
   `.json`, `.txt` and `.md` all work; text around the code block is ignored. The folder is git-ignored because the
   files contain answer keys.
2. `npm run questions:inbox` checks every file and writes nothing. For each rejected file it prints a message to paste
   back into that ChatGPT chat; replace the file with the corrected answer.
3. Run the printed command, for example `npm run questions:inbox -- --confirm "IMPORT 20"`. Each good file is
   registered as its own source (rights `OWNED`), imported as DRAFTs and moved to `<subject>/imported/`. Each bad file
   moves to `<subject>/rejected/` with a `.errors.txt` holding the message for ChatGPT. A file is imported whole or not
   at all; re-pasting an imported file is a no-op.
4. Review the drafts (staff workspace, local only). Then publish the pool:
   `npm run bank:owner-publish -- --taxonomy-version <pool id printed by the inbox>` (dry run), and run it again with the
   printed `--confirm "PUBLISH N ALL"`. Only the owner publishes; ChatGPT can be confidently wrong, so check every key.
5. Restart the local demo (`npm start`) or upload the Bank to the live server (`bash infra/server/upload-bank.sh`, see the
   [runbook](PUBLIC_DEMO_RUNBOOK.md)). Offerings are rebuilt from published content at every start.

## What students get

| Pool content | Offered as |
|---|---|
| Single choice, multiple choice, true/false | A real-length section test: 40 Math, 20 Reading or 40 Science questions |
| Numeric answers (Math, Science, no passage) | Numeric practice, 4 per attempt (created, not linked in the student app) |
| Cloze and matching (Math, no passage) | Cloze/matching practice, 4 per attempt (created, not linked in the student app) |

An offering appears once the pool has enough published questions to fill one attempt
([OPEN_DECISIONS 2026-11-21](../decisions/OPEN_DECISIONS.md#real-length-section-tests-three-tests-plus-the-full-test--2026-11-21)).
A passage and its questions are delivered together and a test takes passages whole, so 2-question passages always add up
exactly to 20 or 40.

## When something goes wrong

- **`WRONG_FOLDER`**: a question's subject does not match its folder. Move the file or fix the subject.
- **`DUPLICATE_ACROSS_FILES`** or **`CONTENT_VERSION_CONFLICT`**: an id is reused. Ask ChatGPT to renumber from a new prefix.
- **Exact twin warning** after import: a question is identical to one already in the Bank, and neither is served until
  resolved. Publish with `--keep-one-of-twins` to keep one of each pair.
- Every confirmed run backs up the Bank to `.local/track-b-backups/` before writing.
- `TRACK_B_DATA_DIRECTORY` and `TSA_QUESTION_INBOX` override the Bank and inbox locations.

Code: `scripts/questions-inbox.mjs`, `src/local/practice-pool.mjs`; tests: `npm run test:question-inbox`.
