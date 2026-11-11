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
corpus sources, sends the drafts to review, groups each Reading passage into one
bundle, and approves each item only if every Bank publication check passes.
Reading passages are delivered whole, through topic practice.

## Start

| Command | Content | Use it for |
|---|---|---|
| `npm run demo:uni` | Published items from the private Bank only | The real presentation |
| `npm run demo:uni:rehearsal` | Original synthetic items, labelled **REHEARSAL** on every student page | Practising the run of show before items are published |

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
- the student, full-simulation and staff URLs.

Synthetic items are never substituted for missing published items. With too few
published items the catalog shows only what exists, and the simulation is not
offered.

## Present (about 10 minutes)

Use a fresh private browser window. No password is needed.

| Step | Browser action | Point to make |
|---|---|---|
| 1 | Open the student URL and choose **Đăng nhập hồ sơ tổng hợp A**. | The notice block: unofficial practice, not affiliated with HUST, non-profit, content source. |
| 2 | Choose **Chọn chủ đề**, tick one topic, set the question count, then **Tạo bài luyện tập** and **Bắt đầu bài luyện tập**. | Topic practice draws only published, unseen questions. |
| 3 | Answer, wait for **Đã lưu**, then **Nộp bài** and confirm. | Server-graded result and released explanations; notices repeat on the result page. |
| 4 | Open the full-simulation URL and choose **Start full simulation**. | 100 questions, Mathematics 40/60 min, Reading 20/30, Science 40/60. Only the open section's clock runs. |
| 5 | Answer a few questions, switch to Reading, then go back to Mathematics. | Returning resumes that section's remaining time. |
| 6 | **Submit all sections** and confirm. | Correct answers per section and out of 100, labelled unofficial practice. |
| 7 | Sign out, open the staff URL, choose the staff workspace, select **REVIEWER**, then **Hàng chờ rà soát**. | Unpublished items wait for the owner here; students never see them. |

If the simulation is not offered, say so and show section and topic practice
instead. The terminal summary states the exact shortage.

## Stop

Press **Ctrl+C once** and wait for the prompt. The server, the worker and the
demo database stop, and the temporary demo copy is deleted. The private Bank and
its backups remain. Attempts made during the demo are discarded with the copy.

## Verify

```sh
npm run test:demo:uni            # stock planning, backup, isolation and notice rules
npm run test:demo:uni:browser    # Chromium rehearsal of this run of show
```

The browser check writes screenshots and `report.json` to
`/tmp/tsa-uni-demo-evidence/` (override with `UNI_DEMO_ARTIFACT_DIR`) and fails if
any process, port or demo folder remains after Ctrl+C.
