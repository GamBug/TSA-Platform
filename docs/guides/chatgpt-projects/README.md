# ChatGPT Projects for TSA questions

Three ChatGPT Projects, one per section, turn material into `tsa-question-set/1` JSON with no API cost. Each Project
works in two modes:

- **TRANSCRIBE**: you attach pictures or a PDF (with or without an answer key); ChatGPT converts **every** question,
  faithfully, and solves the ones without a key.
- **CREATE**: ChatGPT studies the public TSA style through web search and writes original questions.

| File | Where it goes |
|---|---|
| `INSTRUCTIONS_MATH.txt`, `INSTRUCTIONS_READING.txt`, `INSTRUCTIONS_SCIENCE.txt` | Pasted into that Project's **Instructions** field |
| [`AGENT.md`](AGENT.md) | Uploaded to all three Projects: the full playbook (modes, ids, reply shape, self-check) |
| [`SUBJECT_MATH.md`](SUBJECT_MATH.md), [`SUBJECT_READING.md`](SUBJECT_READING.md), [`SUBJECT_SCIENCE.md`](SUBJECT_SCIENCE.md) | Uploaded to that subject's Project only: topic codes and style |

Why the split: Project instructions are always applied to every chat, while uploaded files are retrieved when relevant
and may be read only in part. The instructions therefore repeat the rules that must never be missed (subject, modes,
ids, reply shape, common rejections), and the files carry the detail.

## How ChatGPT Projects behave (checked 2026-11-22)

- A Project groups chats with shared **instructions** and **files**. Project instructions apply only inside the Project
  and take precedence over your global custom instructions.
- File limits depend on the plan and OpenAI's own pages disagree; recent figures are about 25 files per Project on
  Plus. This setup needs 9 files per Project, which fits every paid plan. Third-party guides report an 8,000-character
  limit for instructions (not confirmed on OpenAI's pages); each instruction file here is about 3,200 characters.
- Web search must be available in the chat for CREATE mode. If ChatGPT answers without searching, say "search the web
  first".
- Files attached to a chat message (your pictures or PDF) are used for that chat only; they are not Project files.

## One-time setup (per subject)

1. In ChatGPT, create a Project: "TSA Math", "TSA Reading", "TSA Science".
2. Project settings → **Instructions**: paste the whole content of `INSTRUCTIONS_<SUBJECT>.txt`.
3. Project **files**: upload
   - `AGENT.md` and `SUBJECT_<SUBJECT>.md` from this folder;
   - from `docs/question-bank/`: `AI_QUESTION_GENERATION_PROMPT.md` and `question-set.schema.json`;
   - from `docs/question-bank/examples/valid/`: `single-choice.json`, `true-false-group.json`, `numeric.json`,
     `cloze.json`, `matching.json`; for Reading and Science also `reading-passage.json`; for TRANSCRIBE of figures also
     `image-needed.json`.
4. If the Project offers a memory option, choose **project-only** memory so the three subjects do not mix.

When any of these source files changes in the repository, upload the new version to every Project.

## Using it

Start a **new chat for each batch**. Long chats drift and the 10-question limit per reply keeps replies valid.

```text
CREATE · topic CALCULUS · 10 questions · default 4/3/3 mix · batch letter A
TRANSCRIBE · batch letter B · (attach the pictures in page order, or the PDF) · the key is on the last page
CONTINUE
```

Batch letters must be new for every batch on the same day (A, B, C, ...), because ids are built from the date and the
letter. A reused id with different content rejects the whole file.

Read the report above the code block before saving anything: in TRANSCRIBE mode check the inventory count against the
source and look at every question tagged `key-uncertain`, `key-disagreement` or `unclear-text`.

## Where the output goes: two different routes

The two modes carry different provenance, so they are imported differently. Do not mix them.

### CREATE output → the ChatGPT practice pool

Save each reply in `question-inbox/<subject>/` and run `npm run questions:inbox`, exactly as in the
[question inbox guide](../CHATGPT_QUESTION_INBOX.md). The inbox records each file as an original work (`OWNED`,
"not copied from an exam, textbook or website") and imports it into the separate practice pool.

### TRANSCRIBE output → the corpus route, never the inbox

A transcription is copied material, so the inbox's "original work" rights record would be false for it. Import it
the way corpus content is imported, under the owner-attested corpus rights
([QUESTION_FORMAT section 8](../../question-bank/QUESTION_FORMAT.md#8-from-file-to-bank)):

1. Save each part's reply as JSON outside `question-inbox/`, for example in `.local/transcribed/`.
2. Register the original PDF or picture as a source (dry run first):
   `npm run bank:register-source -- --file <original.pdf> --title "Corpus <name>"`, then add
   `--confirm "REGISTER SOURCE"`. Note the printed source version id.
3. For every `image_request`: crop the figure from the original, register it with
   `npm run images -- register --file fig.png --area <AREA> --alt "..." --source-version <id> --apply`
   ([image library](../IMAGE_LIBRARY.md)), then replace the block with an `image` block using the new `IMG-...` id
   and add that id to the question's `asset_refs`. A file with any `image_request` left cannot be imported.
4. Validate: `node tools/question-bank/validate.mjs part1.json --assets assets.json`
   (`npm run images -- catalog --out assets.json` writes the catalog).
5. Import: `npm run questions:import -- --file part1.json --source-version <id> --topic-map map.json
   --taxonomy-version <uuid>` (dry run; it prints the confirm phrase). `map.json` maps the topic codes used to
   registered skills, for example `{"CALCULUS":"MATH_REASONING","PROBABILITY":"MATH_REASONING"}`; the dry run lists
   unmapped topics and the registered skills.
6. Review every key, then publish with `npm run bank:owner-publish` as usual.

**Do not transcribe material that is already in the Bank.** An exact copy of a served question opens an
exact-duplicate relation that hides the served original until it is adjudicated.

## Limits to keep in mind

- ChatGPT can be confidently wrong, especially on keys it solved itself and on OCR of formulas. The validator checks
  structure, not correctness; the owner checks every key before publication.
- The TSA facts in the subject files (40/20/40 questions, 60/30/60 minutes, M1:M2:M3 = 4:3:3, five interaction forms,
  800-1,000-word reading texts) come from HUST's public exam organization as recorded in
  [the TSA research](../../research/TSA_DEEP_RESEARCH.md); HUST may change them for later years.
- The questions are unofficial practice material. Nothing here claims HUST affiliation or score equivalence.
