# React student app

The student practice experience rebuilt in React from the owner's Figma Make design ("notebook and
red pen"): paper surfaces, a grid-paper question canvas, one teacher-red accent, Fraunces headings and
JetBrains Mono for clocks and counts. It lives in `apps/candidate-web` and talks only to the existing
local APIs; grading, clocks, saving and release rules stay on the server. The original student screens are
retired from the university demo: its old `?student=` links redirect to the matching mode here, and
topic practice is paused until it is rebuilt in this app. Their code stays only as the harness for the
existing student browser suites (reservations, rate limits, expiry, admission, images and others) and
the synthetic fixtures, until those checks are moved to this app.

## Run it

```sh
npm run setup:student     # once: installs the app's pinned dependencies
npm run build:student     # builds apps/candidate-web into its dist/ folder
npm run demo:uni          # or demo:uni:rehearsal; the summary prints the new app's link
```

Open `http://127.0.0.1:4180/student/`. The demo server serves the build at `/student/` from a flat
allowlist (index plus `assets/` files with known types); without a build it answers with a plain
"not built" message. Rebuilding does not need a server restart.

| Link | Mode | API |
|------|------|-----|
| `/student/` | Section practice (Math, Reading, Science) | v1 |
| `/student/?mode=numeric` | Numeric answers | v2 |
| `/student/?mode=interactions` | Cloze and matching | v4 |
| `/student/?mode=simulation` | Full simulation, 100 questions, three section clocks | v3 |

## Public mode

Behind `DEMO_PUBLIC=true` the server answers only `/student/` and the candidate APIs, and the
synthetic students A and B are not offered: each browser starts as its own guest through
`POST /local-auth/guest` (see the [run of show](TRACK_B_SUPERVISOR_RUN_OF_SHOW.md#public-mode)).
The app reads `publicDemo` from `/local/demo-notice` (`src/api/public.ts`). In public mode the landing
card explains the site in three lines and offers one button, "Bắt đầu luyện tập", which calls the guest
endpoint (a returning browser skips it and lands on the catalog). The 503 "pool used up" and 429
"per-address limit" answers appear as messages on that card. There is no logout. The catalog leads with the
"Thi thử đầy đủ — 100 câu, 150 phút" card when the server offers the full test, or a "opens when Science is
complete" notice when it does not. The footer links to the About page (`/student/?page=about`: unofficial, no
HUST affiliation, no official score, temporary guest data). Local mode is unchanged. The app routes by query
only, so unknown `/student/...` paths stay 404 and unknown `mode`/`page` values open the section catalog.
`npm run test:student-web:public` drives this through a throwaway TLS proxy at 1280, 768 and 360 px
(screenshots in `.local/public-launch-qa/cp3/`).

## Behavior

- Demo accounts are chosen explicitly (synthetic A or B); an unfinished attempt is resumed first.
- Single-choice and true/false answers save on selection. Numeric, cloze and matching answers save with
  "Lưu câu trả lời"; leaving a question with unsaved changes asks for a second click, and the submit
  dialog warns about them.
- Matching rows accept a dragged card, a tapped card followed by a tapped row, or the row's list. All
  three save the same answer, and each card's remaining uses are enforced. Cloze answers are typed: the
  question format has no word list, so there is nothing to drag.
- Keyboard: A–D chooses a single-choice option, N/P move between questions, F flags a question.
  Flags stay in the browser tab only.
- Results show server-graded correct counts (per section in the simulation) and never an official
  score. Keys and explanations appear only in the released review.
- The unofficial, non-profit and content-source notices come from the same server notice as the old app
  and appear on the login, catalog and result pages.

## Verify

```sh
npm run test:student-web           # build output: no third-party origins, /student/ base path
npm run test:student-web:browser   # disposable rehearsal demo; desktop and mobile journeys
```

The browser check starts its own rehearsal demo on port 4182 (`STUDENT_WEB_VERIFY_PORT`), uses
`/snap/bin/chromium` unless `STUDENT_BROWSER` is set, and stops the demo afterwards. It covers section
practice with review, numeric practice and the full simulation (6/100 with 3/40, 2/20, 1/40) at
desktop width, and section practice and the simulation again at phone width. It then starts the synthetic cloze/matching fixture and answers all six questions correctly, matching one row
by drag, one by tap and one from the list, and checks the unsaved-change warning.

## Design reference

`design/figma-make/` holds the source of the owner's Figma Make export "Define TSA Practice Visual
System" (2026-11-17): the "notebook and red pen" tokens and grid-paper styles (`src/data/tokens.ts`,
`src/index.css`) and the five mock screens. It is a standalone mock-up with invented sample data and is
not built, served or tested. The original archive (80,245 bytes, SHA-256
`63d43b02327bdf145653529a21356164eda3afbf914159020047608ce4c3f4da`) is not committed because the
repository does not track archives; Figma Make's run and deploy scripts, lockfile, favicon and its
`vite.config.ts` (Figma hosting plugins and an analytics loader) were left out.
