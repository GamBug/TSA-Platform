# Phase 1 — Environment and baseline

Purpose: prove the worktree is isolated and healthy, and record which suites pass before deeper testing, so later
failures can be told apart from the starting state. Report: `reports/phase-01-baseline.md`.

## Checklist

1.1 **Isolation.** Run and record:
```bash
pwd                                   # must be /home/wolfleo/Documents/Projects/TSA-Platform-qa
git branch --show-current             # must be qa/haiku-test-run
git status --short                    # expected: only plans/261123-1449-qa-full-test/ and .claude/ entries
git log --oneline -3
ls -d .local/track-b .local/track-b.pristine .local/track-b-images question-inbox
du -sh .local/track-b .local/track-b-images
```
If `pwd` or the branch is different, stop and write BLOCKED.

1.2 **Tools.** `node -v`, `npm -v`, `ls /snap/bin/chromium /usr/bin/firefox`, `ss -ltnp | grep 4180 || echo free`.

1.3 **Build.** `npm run build` then `npm run build:student` (record the time and any warning line). The "chunks are
larger than 500 kB" warning of the student build is known.

1.4 **Fast suites** (each separately; record pass/fail counts from the `ℹ pass` / `ℹ fail` lines):
```bash
npm test
npm run typecheck
npm run test:student-web
npm run test:scoring
npm run test:generation
npm run test:b0
```

1.5 **Known failures, confirm only**: `npm run docs:check` (expect the `INSTRUCTIONS_*.txt` error) and
`npm run test:docs` (expect 6 pass, 7 fail). Report "unchanged" or what differs.

1.6 **Database suites** (slower):
```bash
npm run test:db:foundation
npm run test:auth
npm run test:critical:privacy
npm run test:critical:student
```

## Done when

Every item has PASS, FAIL (with a finding) or NOT RUN (with a reason), and `STATUS.md` shows phase 1 DONE.
