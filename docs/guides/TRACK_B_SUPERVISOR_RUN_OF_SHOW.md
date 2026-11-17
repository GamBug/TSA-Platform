# Run of show: university demo

One command starts an unofficial, non-profit TSA practice site from the local Bank.
Students only receive questions the owner has approved and published. The site
does not claim HUST affiliation or official scoring. Setup details and the older
synthetic launchers are in the [supervisor demo guide](TRACK_B_SUPERVISOR_DEMO.md).

## Prerequisites

Linux, Node 24.18.0, npm 11.16.0 and PostgreSQL 18.6 binaries (`PG_BIN` may name
their directory). Run `npm ci --ignore-scripts` once from a clean checkout.
The private Bank lives in the ignored `.local/track-b` folder (override with
`TRACK_B_DATA_DIRECTORY`); it is not in Git.

## Publish items (owner only, once)

Imported corpus items start as DRAFTs. Only the owner publishes them, with one
command, under the [2026-11-11 owner attestation](../decisions/OPEN_DECISIONS.md#corpus-permission-attestation-and-owner-publication--2026-11-11):

```sh
npm run bank:owner-publish                                   # dry run: counts and the exact phrase
npm run bank:owner-publish -- --confirm "PUBLISH 100 ALL"    # use the phrase the dry run printed
```

The confirmed run backs up the Bank, records the attested display rights on the
corpus sources required by the selected candidates, sends the drafts to review, groups each Reading passage into one
bundle, and approves each item only if every Bank publication check passes.
Reading passages are delivered whole, through topic practice. Numeric-answer
Math items (`question/2`) are published by the same command, through the numeric
routes. Math cloze/matching drafts (`question/3`) use the same command through
`/api/v4`; the command enables each required protocol separately and repeats
the existing publication checks.
Skipped candidates do not grant rights to their exclusive sources. A confirmed
run with no supported candidates makes no rights or workflow changes.

## Start

| Command | Content | Use it for |
|---|---|---|
| `npm run demo:uni` | Published items from the private Bank only | The real presentation |
| `npm run demo:uni:rehearsal` | Original synthetic items, labelled **REHEARSAL** on every student page | Practising the run of show before items are published |

Students use the React student app ([guide](STUDENT_WEB_APP.md)). Build it once after
checkout or after an update with `npm run setup:student && npm run build:student`; the
launcher serves it at `/student/`. The original student screens are retired from the
demo: their old `?student=` links redirect to the matching mode of the new app. Topic
practice is paused until it is rebuilt in the new app.

`npm run demo:uni` first backs up the private Bank to `.local/track-b-backups/`,
then restores that backup into a temporary demo database. The private Bank is
never migrated or written. If any item is published, set the visible source
credit first, for example:

```sh
DEMO_UNI_SOURCE_CREDIT="Nguồn câu hỏi: <tên nguồn>, dùng với sự cho phép phi lợi nhuận" npm run demo:uni
```

The launcher refuses to start without that credit when published items exist.
The default port is 4180 (`DEMO_UNI_PORT` changes it). If the port is busy, stop
the process that owns it (`lsof -i :4180`) instead of choosing another port.

When ready, the terminal prints:

- the approved, published and deliverable counts per section;
- how many full simulations a student can take without repeated questions;
- any shortage, for example "Full simulation: NOT offered — short by Mathematics 40";
- whether the separate numeric-answer practice is offered (four questions, one
  taxonomy version, published `question/2` items only);
- whether Math cloze/matching practice is offered (four standalone published
  `question/3` items from one taxonomy version, six minutes);
- the student, numeric practice, cloze/matching, full-simulation and staff URLs
  (student links open `/student/` with `?mode=numeric`, `?mode=interactions` or
  `?mode=simulation`).

Synthetic items are never substituted for missing published items. With too few
published items the catalog shows only what exists, and the simulation is not
offered.

## Present (about 10 minutes)

Use a fresh private browser window. No password is needed.

| Step | Browser action | Point to make |
|---|---|---|
| 1 | Open the student URL and choose **Đăng nhập · Hồ sơ tổng hợp A**. | The notice block: unofficial practice, not affiliated with HUST, non-profit, content source. |
| 2 | In **Mục lục bài luyện tập**, choose **Bắt đầu** on a section. | Practice draws only published, unseen questions; the clock is the server's. |
| 3 | Answer (options save at once and show **Đã lưu**), flag one with **Đánh dấu**, then **Nộp bài** and confirm. | Server-graded correct count; **Xem lại đáp án và lời giải** opens the released review; notices repeat on the result page. |
| 4 | Choose **Thi thử đầy đủ** in the top bar, then **Giữ chỗ bài thi thử** and **Bắt đầu bài thi thử**. | 100 questions, Mathematics 40/60 min, Reading 20/30, Science 40/60. Only the open section's clock runs. |
| 5 | Answer a few questions, switch to Reading, then go back to Mathematics. | Returning resumes that section's remaining time; an expired section is read-only. |
| 6 | **Nộp cả bài** and confirm. | Correct answers per section and out of 100, labelled unofficial practice. |
| 6a | Optional: **Điền đáp án số** in the top bar. | Short answers typed as decimals, saved with **Lưu câu trả lời**. |
| 6b | Optional: **Điền khuyết & ghép nối** in the top bar. | Cloze answers are typed; matching cards can be dragged, tapped or chosen from a list. Each question scores only when every field or row is correct. |
| 7 | Choose **Đăng xuất**, open the staff URL, choose the staff workspace, select **REVIEWER**, then **Hàng chờ rà soát**. | Unpublished items wait for the owner here; students never see them. |

If the simulation is not offered, say so and show section practice instead. The
terminal summary states the exact shortage.

## Stop

Press **Ctrl+C once** and wait for the prompt. The server, the worker and the
demo database stop, and the temporary demo copy is deleted. The private Bank and
its backups remain. Attempts made during the demo are discarded with the copy.

## Verify

```sh
npm run test:demo:uni            # stock planning, backup, isolation and notice rules
npm run test:student-web:browser # React student app journeys, desktop and mobile
npm run test:demo:uni:browser    # Chromium rehearsal of this run of show
```

The browser check writes screenshots and `report.json` to
`/tmp/tsa-uni-demo-evidence/` (override with `UNI_DEMO_ARTIFACT_DIR`) and fails if
any process, port or demo folder remains after Ctrl+C.
