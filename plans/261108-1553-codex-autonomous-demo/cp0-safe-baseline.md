# CP0: Safe baseline

Goal: commit all uncommitted work so it can no longer be lost. Mechanical work.
Leader reasoning: medium. Builder: `tsa_light_builder` (or `tsa_builder`).

## Allowed files
`.gitignore` and Git state (local commits only). No source edits, except to fix a broken test that
blocks the exit criteria, and then only after reporting it.

## Steps
1. Add `TSA_Example_Questions/` and any private or derived corpus data under `data/` (check with
   `ls data/*` first) to `.gitignore`. The corpus never enters Git. Tell the owner to keep a
   private backup.
2. Run a secret scan over the staged candidates, for example
   `git diff --cached | grep -nEi "(api[_-]?key|secret|password|token|BEGIN .*PRIVATE)"`, plus a
   look at any `.env`-like files. Unstage anything suspicious and report it.
3. Group the 187 paths into focused conventional commits by feature, roughly in this order:
   - contracts v2 and numeric
   - migrations 026–029, each with its module and tests:
     - reading experiment
     - topic practice
     - inspected images
     - numeric practice
   - manual factory transport and generation
   - client UI (shortcuts, media, topic screens)
   - browser journey scripts
   - docs, reviews and plans

   Each commit must build on its own where feasible. Do not split a migration from the code that
   needs it.
4. Show the commit plan in the report before committing if any group is ambiguous. Otherwise commit.
5. Each commit message ends with the attribution line used in this repo, if one exists. Use no AI
   plan IDs in the messages.

## Exit criteria
- `git status --short` shows nothing except ignored paths.
- `npm run build && npm run typecheck && npm test` pass.
- `npm run test:topics`, `npm run test:student` and `npm run test:local` pass (the PostgreSQL
  harnesses). Record any test that is skipped for environment reasons; a skipped test is not a pass.
- Report lists each commit hash and subject.
