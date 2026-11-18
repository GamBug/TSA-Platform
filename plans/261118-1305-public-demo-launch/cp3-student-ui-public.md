# CP3 — Student app ready for strangers (Fri 20 Nov)

Recommended implementer: Antigravity PRO, the strongest Gemini Pro model listed, high reasoning — UI
work in the owner's Figma design with its built-in browser for visual checks on desktop and phone
widths. Fallback: Claude Code, Opus 5.5, high (with the frontend-design skill). Stay inside
`apps/candidate-web` and `scripts/verify-student-web-browser.mjs`; no API changes.

## Requirements

1. **Login → guest start** (`screens/LoginScreen.tsx`): in public mode (the server tells the app, e.g.
   a flag in the existing notice/config response added in CP1) show one primary button
   "Bắt đầu luyện tập" that calls the guest endpoint; hide students A/B. Local mode keeps A/B.
   Show the 503 "đủ lượt truy cập" message and the rate-limit message nicely.
2. **First-visit explanation**: two or three short lines on the landing card: what the site is
   (unofficial, non-profit TSA practice), what you can do, that answers are not stored beyond the demo.
3. **About page** (`/student/?page=about` or a modal): source credit, no HUST affiliation, no official
   score, contact line chosen by the owner. Linked in the footer of every page.
4. **Catalog**: the full 40/20/40 test is the headline card ("Thi thử đầy đủ — 100 câu, 150 phút"), with a
   short explanation of the three section clocks and return navigation; section practice follows. Hide or
   relabel any section with 0 items; show item counts. If CP2 falls back (Science short), show the
   "opens when Science is complete" notice instead of the card.
5. **Polish pass** at 360 px, 768 px and 1280 px: no horizontal scroll, tap targets ≥ 44 px, images
   enlarge on tap, timers readable, Vietnamese copy reviewed for typos. Add `<title>`, meta
   description, favicon and Open Graph tags so a shared link previews well (Zalo/Facebook).
6. **Error states**: network loss while saving shows a retry message (check existing behaviour first;
   fix only if missing); unknown route inside `/student/` falls back to the catalog.

## Tests

- Extend `scripts/verify-student-web-browser.mjs` with a public-mode journey: guest start, section
  attempt, submit, results; second browser context gets a different guest; the full test starts, switches sections and returns.
- `npm run test:student-web` (no third-party origins in the build) still passes.

## Exit gate

`npm run test:student-web`, `npm run test:student-web:browser` (desktop + phone), `npm run test:demo:public`.
Screenshots at three widths saved under `.local/public-launch-qa/cp3/` and listed in the report.

## Expected output

Commit `feat(student-web): add guest start, about page and public catalog`; guide
`docs/guides/STUDENT_WEB_APP.md` updated; report and handoff.
