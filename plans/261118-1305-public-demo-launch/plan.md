# Public demo launch — 24 November 2026

Status: APPROVED IN PART (owner decisions recorded 2026-11-18 in
[OPEN_DECISIONS](../../docs/decisions/OPEN_DECISIONS.md#public-demo-launch-and-real-full-simulation--2026-11-18));
domain, Science files and the owner review slot are still open (see [CP0](cp0-owner-decisions.md)).
Created 2026-11-18 (Wednesday), Asia/Bangkok. Branch `feat/track-b-data-auth`.

## Outcome

On Tuesday 2026-11-24, anyone with the link opens an HTTPS URL on a phone or laptop and can:
sign in as a guest with one click; take **one complete real 40/20/40 test** (Math 60 min, Reading 30 min,
Science 60 min, return-to-section navigation, per-section and total correct counts); practise Math,
Reading and Science by section, plus numeric and cloze/matching questions; and see the released review.
Notices (unofficial, non-profit, source credit, no HUST affiliation) appear on every student page.
Nobody on the public URL can reach staff screens, drafts, keys before release, or another visitor's attempts.

## Starting facts (verified 2026-11-18 from the repo)

- Students use the React app `apps/candidate-web` at `/student/`, served by `npm run demo:uni`. Topic
  practice is paused by owner decision and stays out of scope.
- Served stock: 276 Math + 100 Reading, 0 Science. The TSA 2026 đợt 1 PDF gives 26 Science drafts plus 4
  reviewed replacements (`SCIE-T26REV-000401`–`000404`); 11 more were skipped as defective. That is at most
  ~30 Science items, short of the 40 one test needs.
- A test form binds one taxonomy version and the database rejects questions from another
  (`db/migrations/002_exam_integrity.sql:1016`). Math, Reading and Science sit in three separate taxonomy
  versions today, so no real test can be assembled. The simulation planner (`src/local/uni-demo-seed.mjs`)
  needs bundles whose sizes add up exactly to 40/20/40 inside one taxonomy version.
- Identity is the local synthetic stub: fixed passwordless students A/B plus staff roles. The server listens
  on `127.0.0.1` and checks origin/host against `http://127.0.0.1:<port>` (`src/local/track-b.mjs:279`).
- Every attempt lives in a disposable database rebuilt at each start.

## Checkpoints

| CP | Day (2026) | Work owner | Deliverable | Exit gate |
|----|------------|------------|-------------|-----------|
| [CP0](cp0-owner-decisions.md) | Wed 18 | Owner | Decisions recorded | Domain, Science files and review slot answered |
| [CP1](cp1-public-mode.md) | Wed 18 – Thu 19 | Agent A | `DEMO_PUBLIC` mode: guests, staff off, public origin | New tests and existing suites pass |
| [CP2](cp2-content-enrichment.md) | Wed 18 – Sun 22 | Agent B + owner | Combined taxonomy, Science to ≥ 40, published simulation pool | Launcher reports "Full simulation: offered (1)" on the real Bank |
| [CP3](cp3-student-ui-public.md) | Fri 20 | Agent C | Guest landing, about page, simulation entry, mobile polish | Browser checks pass desktop + phone |
| [CP4](cp4-packaging.md) | Thu 19 – Sat 21 | Agent A | Install script, service, proxy config, runbook | Clean install works on the VPS |
| [CP5](cp5-staging-deploy.md) | Sat 21 | Agent A + owner | Live HTTPS URL, hardened | Smoke, security and load checks pass |
| [CP6](cp6-qa-bugfix.md) | Sun 22 | QA agent + fixer | Cross-device QA incl. full test | No open P0/P1 defect |
| [CP7](cp7-freeze-launch.md) | Mon 23 – Tue 24 | Agent A + owner | Freeze Mon 18:00, rehearsal, launch | Launch checklist all green |

Critical path: **CP2 content**. Science files by Thu 19 20:00 → AI Science passages written Fri 20 →
owner review Sat 21 → simulation pool published Sat 21 evening (latest Sun 22 12:00). If Science is still
short at Sun 22 12:00, the fallback is decided by the owner then (see CP2 "Fallback").
CP1/CP3/CP4 run in parallel with CP2 because they touch different files (code vs. Bank content).

## Acceptance criteria (launch day)

- [ ] `https://<domain>/student/` loads over valid TLS on Android Chrome, iOS Safari, desktop Chrome and Firefox.
- [ ] One complete 40/20/40 real-content test runs end to end on the live URL: three section clocks, return
      navigation, submit, per-section and total correct counts; no synthetic item appears.
- [ ] Every AI-written question in the live pool has a recorded individual owner approval.
- [ ] Two different browsers get two different guests; neither can see the other's attempts.
- [ ] `https://<domain>/` and every staff API path return 404 on the public server.
- [ ] Section practice (Math, Reading, Science), numeric and cloze/matching work with correct grading.
- [ ] Notices appear on login, catalog, test and result pages.
- [ ] Leakage check against the live URL: no keys before release, no drafts, no staff fields.
- [ ] 50 concurrent guests complete a section attempt with no 5xx; 10 concurrent guests start the full test.
- [ ] The service restarts after a crash or reboot; the runbook covers deploy, restart, rollback and logs;
      the relative's other services on the VPS still work.

## Non-goals

Production OIDC/MFA, real student accounts or personal data, persistent attempt history across restarts,
topic practice, a second non-repeating full test, database rule changes for cross-taxonomy tests, paid LLM
calls, pushing or merging unless the owner asks.

## Rules that carry through every CP

- One accountable implementer per CP; reviewers are read-only and claimed only when recorded.
- Never write the retained Bank (`.local/track-b`) without a fresh backup; rehearse every Bank command on a
  `cp -a` copy first. Only the owner runs confirming publication commands on the retained Bank.
- Commit each finished CP locally (standing owner OK). No push.
- Each CP ends with: commands run and results, `docs/agents/LAST_HANDOFF.md`, `PROJECT_STATE.md` current
  checkpoint, and a report in `plans/reports/`.
