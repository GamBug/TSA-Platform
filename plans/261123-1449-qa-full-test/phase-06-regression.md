# Phase 6 — Regression, Firefox and contracts

Purpose: run the remaining suites once, including Firefox, so the summary covers the whole platform. Report:
`reports/phase-06-regression.md`. These are long; one command at a time, timeout at least 15 minutes each.

## A. Contracts and build outputs

```bash
npm run contracts:check
npm run test:built
npm run test:consumers
npm run contracts:consumer-check
```

## B. Platform suites

```bash
npm run test:assembly
npm run test:attempts
npm run test:grading
npm run test:results
npm run test:directory
npm run test:simulation
npm run test:numeric
npm run test:media
npm run test:demo:uni
npm run test:local
```

## C. Browsers

```bash
npm run test:student:browser
npm run test:student:simulation
npm run test:student:simulation:firefox
npm run test:student:firefox
npm run test:student:keyboard
npm run test:student:images
npm run test:student:numeric
npm run test:student:cloze-matching
```

Topic practice is paused on purpose: `test:topics*` may be run but a failure there is reported as LOW with that note.

## Report focus

A table of every command with PASS/FAIL counts and duration. For each failure: the first failing assertion (copy it),
whether it also failed in phase 1, and whether it looks like a product bug or an environment problem (missing browser,
port busy, timeout). Do not re-run a failing suite more than twice.
