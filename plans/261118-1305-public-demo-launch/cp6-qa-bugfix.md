# CP6 — Cross-device QA and fixes (Sun 22 Nov)

Recommended split (one accountable implementer for fixes):
- QA runner: Antigravity PRO, strongest listed Gemini Pro model, high — its browser agent can walk the
  live site at several viewports and capture evidence. Fallback: Claude Code with browser automation.
- Fix implementer: Codex, strongest listed model, high (or whoever did CP1/CP3, for continuity).
- Human pass: the owner plus one or two friends on real phones (Android Chrome, iOS Safari).

## Test matrix (on the live URL, real published content)

| Journey | Desktop Chrome | Desktop Firefox | Android Chrome | iOS Safari |
|---------|----------------|-----------------|----------------|------------|
| Guest start, resume after closing the tab | | | | |
| Full 40/20/40 test: all three clocks, return to a section, submit, counts | | | | |
| Math section: answer all, submit, results, review | | | | |
| Reading section with a passage | | | | |
| Science section with an image (if published) | | | | |
| Numeric practice | | | | |
| Cloze/matching: drag, tap and list | | | | |
| Timer expiry (shortest section) | | | | |
| Notices and about page visible | | | | |
| Shared link preview in Zalo/Messenger | | | | |

## Defect rules

- P0: wrong grading, data of another visitor visible, staff reachable, key leak, site down → fix now.
- P1: a journey cannot be completed on one browser, broken layout on phone → fix today.
- P2: cosmetic → fix only if under 30 minutes, otherwise list as known issue.
- Every fix: regression test where practical, suites from CP1/CP3 re-run, redeploy tag `rc2`, `rc3`…

## Expected output

Filled matrix with evidence links in `plans/reports/<agent>-261122-public-qa.md`; zero open P0/P1;
known-issues list (P2) for the owner.
