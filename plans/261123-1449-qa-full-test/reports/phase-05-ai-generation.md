# Phase 05 report — AI generation and the ChatGPT Project files

- Date and time (Asia/Bangkok): 2026-11-23, about 21:27 to 21:57
- Tester: Claude Code, Haiku 5.5
- Worktree commit (`git log --oneline -1`): c2846a3 (`docs(plans): count NOT RUN items as finished and give each test phase at most two sessions`)
- Phase status: DONE (session 1). No checklist item was left for a second session. The real OpenAI call (5.1) and the ChatGPT output tests are NOT RUN for reasons outside this session's control (no key, no ChatGPT access).

## Results by checklist item

| Item | Result | Evidence |
|---|---|---|
| A.1 `npm run test:admin` | PASS (5 of 5, exit 0) | `reports/run-logs/5A-admin-s1.log`: "AI generation needs a key, sends the Project instructions and saves the reply into the inbox" passed (fake OpenAI). |
| A.2 `npm run test:generation` | PASS (22 of 22, exit 0) | `reports/run-logs/5A-generation-s1.log` |
| A.3 `npm run test:factory:generic` | PASS (11 of 11, exit 0) | `reports/run-logs/5A-factory-generic-s1.log` |
| A.4 `npm run test:factory:manual` | PASS (26 of 26, exit 0) | `reports/run-logs/5A-factory-manual-s1.log` |
| A.5 `npm run test:factory:reading` | PASS (21 of 21, exit 0) | `reports/run-logs/5A-factory-reading-s1.log` |
| 5.1 Admin AI tab and generate route without a key | PASS for the no-key path; the real OpenAI call is NOT RUN | Demo on 4180 reported `generation: {"configured":false,"model":"gpt-5-mini"}`. Probe `scratch/5-generate-probe.mjs` (output `scratch/5-generate-probe.out.txt`): no session → 403 FORBIDDEN; session without CSRF → 403 FORBIDDEN; CSRF with foreign Origin → 403 FORBIDDEN; session + CSRF + own Origin → 400 `{"ok":false,"code":"NO_API_KEY"}`; invalid section → 400 `NO_API_KEY`. Browser probe `scratch/5-ai-tab-check.mjs` (output `scratch/5-ai-tab-check.out.txt`): the AI questions tab shows "No API key: use a ChatGPT Project in the browser" and no Generate form; page errors 0 (screenshot `reports/screens/phase-05/s1-ai-tab-desktop.png`, saved by the probe; not viewed by the tester). Code read of `src/local/admin/admin-generate.mjs`: the key is read from the environment and sent only in the `authorization` header to `api.openai.com`; saved files hold only the reply JSON; the overview exposes only `configured` and `model`. Default model `gpt-5-mini` (`admin-generate.mjs:16`, marked REQUIRES_VERIFICATION in the code). |
| 5.2 Validator on `docs/question-bank/examples/valid/` and `invalid/` | PASS | All 9 valid files exit 0 (`reports/run-logs/5C-validate-valid-s1.log`). The 16 invalid files are all listed in `invalid/expected.json`; 15 give exactly the expected code with exit 1; `unknown-asset.json` needs an asset catalog: with `scratch/5-assets-without-geo.json` it exits 1 with `ASSET_NOT_FOUND`, and with `scratch/5-assets-with-geo.json` it exits 0 (`reports/run-logs/5C-validate-invalid-s1.log`). Probe `scratch/5-latex-probe.mjs` shows the validator rejects `\overrightarrow` and `\boxed` with `UNSUPPORTED_TEX`. |
| 5.3 Imported and rejected ChatGPT files in `question-inbox/math/` | PASS for validation; the message comparison is recorded as F-05-07 | The 6 imported and 6 rejected files all validate with exit 0 (`reports/run-logs/5C-inbox-validate-s1.log`). The rejected files carry `image_request` blocks, so the validator reports `NEEDS_NEW_IMAGE_ASSET` warnings (`ok: true`), while the inbox blocks them with `ASSET_REQUIRED` (`src/local/exchange-import.mjs:82`). The `reading/` and `science/` inbox folders are empty. Dry run of one rejected file in a scratch inbox (`reports/run-logs/5C-inbox-rejected-P3-dryrun-s1.log`): REJECT with 6 problems and a `FIGURES ·` request naming the same six question ids that the stored `.errors.txt` lists. |
| 5.4 Instruction files under 8,000 characters | PASS | `wc -m`: `INSTRUCTIONS_MATH.txt` 4,043; `INSTRUCTIONS_READING.txt` 3,879; `INSTRUCTIONS_SCIENCE.txt` 3,899 characters (`wc -c` bytes: 4,053 / 3,891 / 3,917). The README's "about 3,200 characters" is wrong (F-05-01). |
| 5.5 IDs, batch ids and figure file names against the inbox code | PASS, with the prefix note in F-05-05 | `READABLE_ID` in `packages/contracts/src/question-exchange.ts:24` accepts `MATH-S261122A-000031`, `MATH-G261123A-000002`, `SCIE-SP261122B-000001` and similar ids. The batch-id regex (`question-exchange.ts:213`) accepts `GPT-MATH-261123-A` and `SRC-MATH-261122-A-P1`. The figure-name rule `src/local/inbox-figures.mjs:11` accepts `<id>_NEW-IMG-NNN.png` (and jpg/webp). Real check: the sample file's figure named `MATH-G261123A-000002_NEW-IMG-001.png` was matched by the inbox ("1 figure(s) attached", `reports/run-logs/5H-sample-inbox-dryrun-2-s1.log`). |
| 5.6 LaTeX commands the files ask ChatGPT to use against the supported list | PASS | Extracted every `\command` in `docs/guides/chatgpt-projects/*` and `AI_QUESTION_GENERATION_PROMPT.md` and compared with the 174-command supported list (`tex-commands` block). The only commands not in the list are `\overrightarrow`, `\rightleftharpoons`, `\lt`, `\gt`, `\displaystyle`, `\boxed`, `\tag`, `\label`, `\color`, plus `\newcommand` and `\def`. The guides name the first nine as unsupported; the prompt forbids `\newcommand` and `\def`. The commands the files tell ChatGPT to use (`\widehat`, `\vec`, `\angle`, `\circ`, `\perp`, `\parallel`, `\triangle`, `\prime`, `\leq`, `\infty`, `\mathrm`, `\rightarrow`, `\leftrightarrow`) are all supported. |
| 5.7 Contradictions and wrong facts between the files | PASS as a review; findings F-05-01 to F-05-07 | See Findings. The phrase "no figures in CREATE" named in the plan does not appear in the current files; AGENT.md section 3.6 and the three INSTRUCTIONS files all allow a drawn figure in CREATE. |
| 5.8 Hand-written sample set and temporary-inbox dry run | PASS for the rules; NOT RUN for ChatGPT output | I wrote `scratch/5-sample-questions.json` (batch `GPT-MATH-261123-A`, 2 SINGLE_CHOICE questions, the second with `image_request` NEW-IMG-001). Validator: exit 0, `VALID: 2 question(s)`, one `NEEDS_NEW_IMAGE_ASSET` warning (`reports/run-logs/5H-sample-validate-s1.log`). Dry run, no figure: `REJECT math/GPT-MATH-261123-A.json: 1 problem(s)` with a `FIGURES ·` request for `MATH-G261123A-000002_NEW-IMG-001.png`, and "Nothing is importable" (`5H-sample-inbox-dryrun-s1.log`). Dry run with a placeholder PNG of that exact name: `OK math/GPT-MATH-261123-A.json: 2 question(s), 2 new, original, 1 figure(s) attached` (`5H-sample-inbox-dryrun-2-s1.log`). The file was not moved and no `--confirm` was run. The placeholder is a labelled 200×150 PNG made with Pillow ("QA placeholder"), not a real figure. |

## Findings

### F-05-01 README gives a wrong instruction size

- Severity: LOW
- Status: REPRODUCED (twice: `wc -c` and `wc -m`)
- Where: `docs/guides/chatgpt-projects/README.md`, paragraph "File limits depend on the plan…" (states "each instruction file here is about 3,200 characters").
- Steps to reproduce:
  1. Run `wc -m docs/guides/chatgpt-projects/INSTRUCTIONS_*.txt`.
- Expected: about 3,200 characters per file, as the README says.
- Actual: 4,043 (MATH), 3,879 (READING), 3,899 (SCIENCE) characters (`wc -c`: 4,053 / 3,891 / 3,917 bytes).
- Notes: all three are still under the 8,000-character limit in 5.4, so nothing breaks. The owner's estimate is just stale.

### F-05-02 README gives the wrong number of Project files

- Severity: LOW
- Status: REPRODUCED (count of the README list)
- Where: `docs/guides/chatgpt-projects/README.md`, "One-time setup" and "How ChatGPT Projects behave" ("This setup needs 9 files per Project").
- Steps to reproduce:
  1. Count the files the README lists for each Project.
- Expected: 9 files per Project, as stated.
- Actual: MATH needs 9 files (AGENT, SUBJECT, prompt, schema, and the 5 named examples), or 10 with `image-needed.json` for figures. READING and SCIENCE need 10 (`reading-passage.json` added), or 11 with `image-needed.json`. The README does not list `multiple-choice.json`, which the admin AI path sends for MATH (`src/local/admin/admin-generate.mjs:20`).
- Notes: a Project may hit an upload limit or be set up incompletely if the owner follows the "9 files" count.

### F-05-03 Topic codes are not checked, and one example uses a code outside the list

- Severity: LOW
- Status: REPRODUCED
- Where: `docs/question-bank/examples/valid/image-needed.json` (`"topic": "GEOMETRY"`); `docs/guides/chatgpt-projects/SUBJECT_MATH.md` topic table (only `GEOMETRY_PLANE` and `GEOMETRY_SPACE`); `docs/question-bank/question-set.schema.json` topic pattern `^[A-Z][A-Z0-9_]{1,63}$`.
- Steps to reproduce:
  1. Copy `scratch/5-sample-questions.json` with the first question's topic set to `GEOMETRY` (`scratch/5-topic-probe.json`).
  2. Run `node tools/question-bank/validate.mjs scratch/5-topic-probe.json`.
- Expected: a topic outside the SUBJECT list is refused or warned.
- Actual: `VALID: 2 question(s)`, exit 0; the only warnings are the asset ones.
- Notes: the subject-file table is guidance only, and the valid example itself uses a code the table does not list. ChatGPT may copy the example's code.

### F-05-04 Backslash convention differs between the subject files

- Severity: LOW
- Status: SUSPECTED (documentation inconsistency; no rejection reproduced)
- Where: `docs/guides/chatgpt-projects/SUBJECT_SCIENCE.md` lines 41–44 (`$\\mathrm{H_2SO_4}$`, `$\\rightarrow$`, `$\\leftrightarrow$`, `\\rightleftharpoons`); `SUBJECT_MATH.md` notation table and `AGENT.md` section 6 show single-backslash LaTeX (`$\widehat{SAB}$`).
- Steps to reproduce: compare the two files' notation tables.
- Expected: one convention for LaTeX in prose, with JSON escaping stated once.
- Actual: the Science file doubles the backslashes in running prose, the Math file does not. AGENT.md doubles them only inside JSON.
- Notes: doubled backslashes are the correct form inside a JSON string, so the Science text is not wrong for JSON. The risk is that ChatGPT copies one form into the other context. Not tested with real ChatGPT output.

### F-05-05 Rights record depends only on the batch-id prefix

- Severity: MEDIUM
- Status: SUSPECTED (code read; behaviour depends on ChatGPT's labels and was not run)
- Where: `src/local/practice-pool.mjs:30` (`TRANSCRIPTION_BATCH_PREFIX = 'SRC-'`), `:41` (`isTranscription` checks the prefix only), `:17-35` (`ORIGINAL_RIGHTS` → OWNED, `TRANSCRIBED_RIGHTS` → LICENSED); `scripts/questions-inbox.mjs:190-192` (chooses the rights by that check); `packages/contracts/src/question-exchange.ts:213` (batch id only checked by regex).
- Steps to reproduce: not run. Reading the code path is enough to show that a file whose `batch_id` starts with `GPT-` is recorded as an original written for the owner (OWNED), whatever its content, and nothing compares the batch's mode with the material it contains.
- Expected: a transcription of supplied material is always recorded as transcribed (LICENSED), so the rights match what was copied.
- Actual: the only control is the instructions telling ChatGPT which prefix to use. If ChatGPT ever labels a TRANSCRIBE answer `GPT-…`, the file is recorded as OWNED.
- Notes: this is a provenance problem, not a scoring or publication error, so it is MEDIUM. For the owner to decide whether the prefix needs a check.

### F-05-06 Bank versions contain `\overrightarrow`, which the current rule refuses

- Severity: LOW
- Status: SUSPECTED (the stored items were counted in phase 2 only; their served status was not checked)
- Where: stored question versions in `.local/track-b` (Postgres files, not read directly); phase 2 log `reports/run-logs/2R-admin-angle-vector-s6.log` (`\overrightarrow` 15 of 1046 in the admin list, from phase 2 session 6).
- Steps to reproduce: validate a copy of a valid example with `$\overrightarrow{AB}$` in the stem (`scratch/5-latex-overrightarrow.json`) → exit 1 `UNSUPPORTED_TEX`.
- Expected: stored versions follow the same supported-LaTeX rule as new imports (AI_QUESTION_GENERATION_PROMPT.md: "A formula with any other command makes the question invalid").
- Actual: the rule rejects the command for new imports, but phase 2 found 15 stored versions with it (they render with an arrow in the admin panel).
- Notes: the stored rows probably predate the rule. Phase 4 or 6 should check whether any of them is served.

### F-05-07 Stored rejection notes use older wording than the current inbox

- Severity: LOW
- Status: REPRODUCED (for the dry run; the confirm run's wording was not checked)
- Where: `question-inbox/math/rejected/*.json.errors.txt` (first line "The platform rejected your JSON. Fix exactly these problems…" with `[ASSET_REQUIRED]` lines); current dry-run output `reports/run-logs/5C-inbox-rejected-P3-dryrun-s1.log`.
- Steps to reproduce: copy `…SRC-MATH-261122-A-P3.json` to a scratch inbox and run `npm run questions:inbox` (dry run).
- Expected: the owner gets the same message that the inbox writes now.
- Actual: the same six question ids, but the current dry run gives a `FIGURES · … Do not change the JSON for this.` request with a list of exact file names. The stored note uses `[ASSET_REQUIRED]` wording and asks for a corrected JSON.
- Notes: the owner may paste the older text back into ChatGPT, which then asks for a full corrected JSON that is not needed. Confirm the wording the confirm run writes before judging.

## Not run

| Item | Why |
|---|---|
| 5.1 real OpenAI generation call | No `OPENAI_API_KEY` and no owner approval in chat (plan rule 5). The check of the key was refused by the QA guard ("no paid API keys in this run") and was not retried. |
| 5.1 runtime secret scan of the generate path | The code was read and the probe shows only booleans in the overview, but no run with a key was possible. The key-never-written claim rests on code reading. |
| 5.3 confirm run wording for rejected files | Only a dry run was made, which does not write the `.errors.txt`. |
| 5.8 ChatGPT output for the sample set | ChatGPT is not available in this session. The sample was written by the tester, so it tests the rules, not the model's behaviour. |
| 5.8 real figure crop | The figure is a labelled placeholder made with Pillow. A real crop needs ChatGPT's Python tool on real pages. |

## Questions for the owner

1. The standalone validator returns `ok: true` (exit 0) for files that the inbox holds until an image exists (only a `NEEDS_NEW_IMAGE_ASSET` warning). Is that split intended?
2. In the 5.8 dry run one missing figure held the whole file, including a question that has no figure ("Nothing is importable"). The README says a missing figure "rejects only its answer", and the file is one answer. Is holding a whole batch for one figure intended?
3. Should the 15 stored `\overrightarrow` versions (F-05-06) be checked for served status in phase 4 or 6?
4. Should the validator enforce the topic lists in the subject files (F-05-03), and should the batch-id prefix be checked against the mode (F-05-05)?
5. Which wording does the confirm run write into `.errors.txt` for a missing figure (F-05-07)?
