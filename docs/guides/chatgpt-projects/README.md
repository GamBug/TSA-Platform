# ChatGPT Projects for TSA questions

Three ChatGPT Projects, one per section, turn material into `tsa-question-set/1` JSON with no API cost. Each Project
works in two modes:

- **TRANSCRIBE**: you attach pictures or a PDF (with or without an answer key); ChatGPT converts **every** question in
  its true form (same wording, interaction and figures), crops each figure from your pages with Python, and solves the
  questions without a key.
- **CREATE**: ChatGPT studies the public TSA style through web search and writes original questions; when one really
  needs a graph or diagram it draws it with Python.

Figures come back as PNG downloads named after their question (`MATH-S261122A-000031_NEW-IMG-001.png`). Saved next to
the answer in the inbox, they are registered and attached automatically on import.

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
- Figures need ChatGPT's Python tool (code execution / data analysis), which can read the pictures and PDFs you attach
  and offer the files it makes as downloads. REQUIRES_VERIFICATION on your plan: if ChatGPT says it cannot run code,
  turn the tool on in the Project or chat settings. Download links expire with the chat session, so save the PNGs
  right away.
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
FIGURES · (paste the list from a rejected file's message)
```

Batch letters must be new for every batch on the same day (A, B, C, ...), across both modes, because ids are built
from the date and the letter. A reused id with different content rejects the whole file.

Read the report above the code block before saving anything: in TRANSCRIBE mode check the inventory count against the
source and look at every question tagged `key-uncertain`, `key-disagreement`, `unclear-text` or `figure-low-quality`,
and look at every crop ChatGPT shows: it must be the whole figure with its labels and nothing else.

## Where the output goes: the inbox, for both modes

Save each reply (one part per file) in `question-inbox/<subject>/` and run `npm run questions:inbox`, as in the
[question inbox guide](../CHATGPT_QUESTION_INBOX.md). Both modes land in the same separate practice pool, never in the
real full test. The inbox reads the batch id to record where the questions came from:

| Batch id | Recorded as | Rights record |
|---|---|---|
| `GPT-…` (CREATE) | Source "Practice original …", origin `OWNED` | `OWNED`: an original written for you with ChatGPT |
| `SRC-…` (TRANSCRIBE) | Source "Corpus transcription …", origin `EXTERNAL` | `LICENSED`: copied from material you supplied, under your attested non-profit corpus permission of 2026-11-11 |

Only transcribe material that permission covers. The decision is recorded in
[OPEN_DECISIONS 2026-11-22](../../decisions/OPEN_DECISIONS.md#transcribed-questions-in-the-practice-pool--2026-11-22).

**Figures.** Save every PNG ChatGPT gives you in the same folder as the answer (`question-inbox/<subject>/`) without
renaming it, or add them on the admin page (**Import & publish → Upload figures**, or **add image** next to each figure
an answer needs). The inbox matches a file to its `image_request` block by name
(`<question or passage id>_<request id>.png`, `.jpg` or `.webp`; at most 2 MB and 4096 px a side). On import it
registers the figure in the image library under the answer's own source (so a transcription's figures carry the same
corpus rights), replaces the block with the image, and moves the PNG to `imported/` with its answer.

A figure that is still missing rejects only its answer. The `.errors.txt` message then holds a `FIGURES · ...` request:
paste it into the same ChatGPT chat, save the PNGs it gives, and move the answer back into the inbox (on the admin page:
**Back to the inbox**). You can also crop a figure yourself with any screenshot tool and add it under the listed name.

**Do not transcribe questions that are already in the Bank.** An exact copy of a served question opens an
exact-duplicate relation that hides the served original until it is resolved (`--keep-one-of-twins`).

## Limits to keep in mind

- ChatGPT can be confidently wrong, especially on keys it solved itself and on OCR of formulas. The validator checks
  structure, not correctness; the owner checks every key before publication.
- The TSA facts in the subject files (40/20/40 questions, 60/30/60 minutes, M1:M2:M3 = 4:3:3, five interaction forms,
  800-1,000-word reading texts) come from HUST's public exam organization as recorded in
  [the TSA research](../../research/TSA_DEEP_RESEARCH.md); HUST may change them for later years.
- The questions are unofficial practice material. Nothing here claims HUST affiliation or score equivalence.
