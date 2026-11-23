# Phase 5 — AI question generation and the ChatGPT Project files

Purpose: check the AI paths without spending money: the admin's OpenAI generation (with the test's fake OpenAI), the
question factories, the validator, and whether the ChatGPT Project files agree with what the platform accepts.
Report: `reports/phase-05-ai-generation.md`. **Never set `OPENAI_API_KEY`.** A real call is NOT RUN unless the owner
gives a key and approval in the chat.

## A. Suites

```bash
npm run test:admin                  # includes "AI generation needs a key ..." with a fake OpenAI
npm run test:generation
npm run test:factory:generic
npm run test:factory:manual
npm run test:factory:reading
```

## B. Admin AI tab without a key

- 5.1 On the demo (copied Bank, `DEMO_ADMIN_PASSWORD='QaOnly-261123' npm start`): the AI questions tab shows the
  ChatGPT steps; `POST /local/admin/generate` with session and CSRF answers a clear "no key" result. Read
  `src/local/admin/admin-generate.mjs` (do not change it): which model is used by default, what is sent, and confirm the
  key is never written to a file or sent to the browser.

## C. Validator and examples

- 5.2 `node tools/question-bank/validate.mjs <file>` for every file in `docs/question-bank/examples/valid/` (expect
  valid) and `docs/question-bank/examples/invalid/` if it exists (expect invalid with a clear message).
- 5.3 Validate the imported ChatGPT files in `question-inbox/*/imported/` and the rejected ones; compare with the
  `.errors.txt` messages.

## D. ChatGPT Project files (read-only review)

Files: `docs/guides/chatgpt-projects/` (`AGENT.md`, `INSTRUCTIONS_*.txt`, `SUBJECT_*.md`, `README.md`) and
`docs/question-bank/AI_QUESTION_GENERATION_PROMPT.md`.
- 5.4 Each `INSTRUCTIONS_*.txt` is under 8,000 characters (`wc -c`).
- 5.5 Ids and batch ids in AGENT.md section 4 match what the inbox accepts (`GPT-` / `SRC-` prefixes, figure file name
  `<question_id>_<request_id>.png` as in `src/local/inbox-figures.mjs`).
- 5.6 Every LaTeX command the files tell ChatGPT to use is in the supported list of
  `AI_QUESTION_GENERATION_PROMPT.md` (for example `\widehat`, `\vec`, `\angle`, `\circ`, `\perp`, `\parallel`).
- 5.7 Contradictions between files (for example "no figures in CREATE" left in one file), wrong facts, or steps the
  owner cannot follow. Quote the lines.
- 5.8 Write one sample question set by hand in `scratch/` following AGENT.md exactly (2 questions, one with an
  `image_request`), validate it, and dry-run it through a temporary inbox:
  `TSA_QUESTION_INBOX=$PWD/plans/261123-1449-qa-full-test/scratch/inbox npm run questions:inbox` (create
  `scratch/inbox/math/` first). Record whether the instructions alone are enough to produce an accepted file.

## Report focus

What would make ChatGPT output get rejected, and what in the files would mislead ChatGPT or the owner.
