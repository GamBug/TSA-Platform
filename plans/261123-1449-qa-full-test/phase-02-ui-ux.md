# Phase 2 — UI/UX (student app and admin page)

Purpose: use the product like a student and like the owner, on desktop and on a phone, and record what is broken,
confusing or ugly. Report: `reports/phase-02-ui-ux.md`. Screenshots: `reports/screens/phase-02/`.

## A. Automated browser checks first

Run each and record PASS/FAIL and the screenshot folder they print (no demo of yours may be running; they start their own):
```bash
npm run test:student-web:browser
npm run test:demo:uni:browser
npm run test:real-pool:browser
```

## B. Exploratory testing on the copied real Bank

Start the demo in the background (check port 4180 first, record the PID in `STATUS.md`):
```bash
DEMO_ADMIN_PASSWORD='QaOnly-261123' npm start
```
Wait until `http://127.0.0.1:4180/student/` answers. Admin page: `http://127.0.0.1:4180/student/?page=admin`, user
`AdminBao`, password `QaOnly-261123` (valid for this run only).

Drive the browser with a script in `scratch/` (Chromium at `/snap/bin/chromium`). Starter:
```js
// scratch/browse.mjs — node plans/261123-1449-qa-full-test/scratch/browse.mjs
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../apps/candidate-web/package.json', import.meta.url))
const { chromium } = require('playwright-core')
const browser = await chromium.launch({ executablePath: '/snap/bin/chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })   // phone: { width: 390, height: 844 }, isMobile: true
await page.goto('http://127.0.0.1:4180/student/')
await page.screenshot({ path: 'plans/261123-1449-qa-full-test/reports/screens/phase-02/start-desktop.png', fullPage: true })
await browser.close()
```
Look at every screenshot you take (open the PNG) before you judge it. Do each check at **1440x900** and **390x844**.

### Student app
- 2.1 Start screen: guest start with "Bắt đầu luyện tập", wording, links, no English left in student text.
- 2.2 Section practice (Math, Reading, Science) and the three section tests and the full test (40/20/40, 60/30/60 min):
  start, answer several questions of each type shown (single, multiple, Đúng/Sai, numeric, cloze, matching), mark a
  question, jump with the question grid, go back and forward, reload the page mid-test (is the answer kept?).
- 2.3 Submit: confirmation dialog, result page, score as correct count, review page; explanations only after submit.
- 2.4 **Math display**: find questions with primes, angles and vectors (in the admin list search `\prime`, `widehat`,
  `vec`, `A'`). Check `A′`, `f′(x)`, the hat over all three letters of an angle, the arrow over both letters of a
  vector, fractions, limits, and that nothing shows raw `$` or `\` commands. Screenshot each kind.
- 2.5 Figures: a question with an image (Science has some): the image loads, "Phóng to" zooms, alt text if broken.
- 2.6 Layout: no horizontal page scroll on the phone, long formulas scroll inside their own box, tables readable,
  buttons at least 44 px tall, sticky timer and submit visible, Vietnamese diacritics render correctly.
- 2.7 Keyboard and accessibility: Tab through a question (focus visible, order sensible), choose an answer with the
  keyboard, Escape closes the zoom dialog, images have alt text, form fields have labels.

### Admin page
- 2.8 Sign-in: wrong password message, right password, sign-out.
- 2.9 All questions: counts table, filters (section, state, type), search, paging, question panel with answer key and
  explanation, math and images in the panel.
- 2.10 Change status or section: press each check button (Publish, Withhold with a reason, Restore, Move) on suitable
  questions and read the dry-run output. **Do not press Confirm in this phase** (phase 4 tests confirmed changes).
- 2.11 Import & publish: the rejected Math files show "x/y figures added", the figure slots, "Back to the inbox";
  "Check the inbox" output is readable. Do not import or publish in this phase.
- 2.12 AI questions tab without a key: the ChatGPT Project steps are shown and correct.

Stop the demo (`kill -INT <pid>`) and confirm port 4180 is free before finishing.

## Report focus

For every problem: what a student or the owner would experience, at which size, with a screenshot path. Also list
things that work well (short), so the owner knows what was covered.
