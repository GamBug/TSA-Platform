# CP6: Demo-ready

Goal: a one-command local demo built from owner-approved, published items, which the owner can
present at the university. Leader reasoning: medium. Builder: `tsa_light_builder`.

## Preconditions
CP2 and CP3 are DONE. The owner has approved items. The permission evidence is recorded (required
before corpus items are published). If enough approved items for a full simulation (40/20/40) do
not exist yet, the demo offers topic and section practice and reports the shortage honestly. It
must never fall back to synthetic items silently.

## Steps
1. A seed or export step that builds the demo database only from PUBLISHED versions, with a backup
   before any data change.
2. Add visible notices in the student UI: "Unofficial practice, not affiliated with HUST", a
   source credit for the corpus, "Non-profit".
3. One command, for example `npm run demo:uni`, that starts the database, the server and the staff
   and student URLs, and cleans up on Ctrl+C. Document it in
   `docs/guides/TRACK_B_SUPERVISOR_RUN_OF_SHOW.md`.
4. Rehearse the run of show in Chromium: student full simulation, topic practice, results, staff
   review queue. Save screenshots in the report.

## Exit criteria
- `npm run demo:uni` starts from a clean checkout plus the private data, and stops cleanly with no
  orphan processes.
- The rehearsal journey passes. Notices are visible on the catalog and results pages.
- The final report lists approved counts per domain and how many full simulations without repeats
  a student can take.
