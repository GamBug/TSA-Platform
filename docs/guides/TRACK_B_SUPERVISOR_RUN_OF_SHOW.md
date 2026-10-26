# Supervisor demonstration: TSA Practice Website

Present an unofficial practice website with real local PostgreSQL persistence and
original synthetic questions. The local accounts, rights records and review
approvals are development fixtures. This is not official TSA scoring, accepted
real question stock, qualified human accessibility acceptance or production.

## Start once

Use the installed Linux prerequisites: Node24.18.0, npm11.16.0, PostgreSQL18.6
binaries. See [setup details](TRACK_B_SUPERVISOR_DEMO.md#prepare-and-start) if needed.
From the repository root:

```sh
npm ci --ignore-scripts
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:student:short
```

Open the exact printed loopback URL, including `?student=postgres`, in a fresh
private browser window. Keep the terminal running. No password, API key, database
patch or manual API request is needed. This launcher includes the three full
profiles plus optional short Math/Science choices; it automatically creates a
fresh isolated synthetic database.

## Present the student journey

| Step | Browser action | Point to demonstrate |
|---|---|---|
| 1 | Choose synthetic candidate A. Open **Trang đầu**, then **Bài luyện tập**. | Explicit development login, unofficial/synthetic labeling and three independent domains. |
| 2 | Choose the full Mathematics card:4questions/6minutes. | The selected server-defined profile controls count and timing; short choices are separate. |
| 3 | Answer questions and navigate. Respect the minimum selection count for multiple choice; answer each true/false statement. Wait for **Đã lưu**. | Actual acknowledged saves, supported interaction types, readable math/tables. An arbitrary answer receives its actual practice score. |
| 4 | Reload before submitting. | Same attempt, acknowledged answers and original server deadline return; no new allocation or clock reset. |
| 5 | Choose **Nộp bài**, inspect the confirmation, then confirm. | Genuine submission and background grading. Pending may be brief; network failure is not success. |
| 6 | Open the unofficial result and released review; expand an explanation. Return to the catalog. | Actual score and explanations released only after grading. |
| 7 | Complete the full Reading2/3minute and Science4/6minute profiles explicitly. Show the three completed history entries. | Independent attempts/clocks/results, with no automatic domain chaining or official combined score. |

The deadline continues while disconnected. Do not pause or change a sealed clock
while explaining the interface. If a save fails, use its explicit retry/reload and
wait for acknowledgement before continuing.

## Show truthful shortage and a shorter choice

Request full Mathematics again. Only two unseen questions remain in this small
fixture, so another four-question attempt cannot be supplied. Show that the
shortage itself creates no replacement attempt.

Choose the proposed two-question profile, inspect its native confirmation, then
cancel/Escape once. Reopen, confirm the reservation and explicitly choose
**Bắt đầu bài luyện tập**. Complete/save/reload/submit/review this3minute attempt.
It still excludes earlier assignments; it is not repeat-consented review mode.
A shorter choice can also exhaust or become unavailable, and is never guaranteed.
Science has the same optional path. Reading is not split into a one-item profile.

If a reservation is reloaded before Start and its exact metadata cannot be proven,
the screen says duration/profile unavailable; it never borrows the full profile.
Explicit Start supplies the actual server clock. A lost creation response uses the
same-request retry; after acknowledgement, recovery only reads the owned attempt.

## Optional staff view

Stop the student launcher and close its private window before opening a fresh one:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STAFF_REVIEW_FIXTURE_DEMO=true npm run demo:staff:review
```

Follow the printed URL. Show synthetic author draft/version inspection, safe preview,
recorded source/rights evidence and the separate review queue. These records are
fixture demonstrations, not actual qualified review or rights attestation. For
negative decisions and safe rehearsal/sealing, use the
[detailed staff walkthrough](TRACK_B_SUPERVISOR_DEMO.md#optional-staff-demonstration).

## Finish and evidence

Press Ctrl+C once and wait for teardown. The owned HTTP service, worker and database
stop; this disposable run's data is deleted. Restart for a fresh demonstration.
Reloading within the same running launcher preserves progress.

[Executed B11 checks and independent review](../reviews/WEB_003_B11_SHORTER_PROFILE_VERIFICATION.md)
cover both short domains, lost responses, account changes, active-attempt recovery,
rights/roles/H1/history and upgrade preservation. Qualified human accessibility and
lawful independently reviewed12/6/12 content remain separate outstanding inputs.
