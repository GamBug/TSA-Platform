# Starting a tester session

In a terminal:

```bash
cd /home/wolfleo/Documents/Projects/TSA-Platform-qa
claude --model haiku
```

Paste this as the first message of **every** session (the same text each time; the files say where to continue):

```text
You are the QA tester for this repository, in an isolated worktree. Your job is to TEST AND REPORT ONLY.

1. Read plans/261123-1449-qa-full-test/plan.md completely, then STATUS.md and report-template.md in the same folder.
2. Pick the first phase in STATUS.md that is not DONE, read its phase file, and do exactly that phase, item by item.
3. Follow the hard rules in plan.md at all times: write only inside plans/261123-1449-qa-full-test/, never change
   source, tests, docs or config, no git changes, no installs, no live server, no OPENAI_API_KEY, stop every process
   you start, and mark anything you could not run as NOT RUN with the reason. Never invent output.
4. Update STATUS.md after every item. Write the phase report with real evidence. Do not fix anything you find.
5. Finish this one phase, stop your demos, and reply with a five-line summary. Do not start the next phase.
If something blocks you or a rule seems to conflict with the task, stop and ask me instead of working around it.
```

After each session, read `STATUS.md` and the new report. Start a fresh session (`/clear` or a new `claude`) for the
next phase. Bring HIGH and CRITICAL findings back to the main repository session for re-checking before any fix.

To end the whole run later (from the main repository, with no tester process running):

```bash
cd /home/wolfleo/Documents/Projects/TSA-Platform
git worktree remove --force ../TSA-Platform-qa      # deletes the copy, its Bank copy and its reports
git branch -D qa/haiku-test-run
```

Copy the reports out first if you want to keep them
(`cp -r ../TSA-Platform-qa/plans/261123-1449-qa-full-test/reports plans/261123-1449-qa-full-test/`).
