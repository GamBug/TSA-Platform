# CP6 checkpoint review

Reviewer: Claude Haiku 5.5 `code-reviewer` subagent, read-only, independent of the implementer.
Date: 2026-11-10 (Asia/Bangkok). Scope: the uncommitted CP6 diff (demo runtime, stock planner,
launcher, rehearsal source, browser check, notice UI, tests). Method: static reading, `node --check`,
the seed unit tests, and brute-force checks of the exact-subset helper. No servers or browsers run.
The reviewer returned its findings in chat; the implementer recorded them here with dispositions.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | P1 | An empty folder at the private Bank path would be initialized as a new cluster. | Fixed: the ownership marker is required; test added. |
| 2 | P1 | `demo:uni` exposes the staff workspace (unpublished items, keys, rights records) to anyone at the keyboard. | Open: owner decision. The card asks for the staff review queue in the run of show. |
| 3 | P2 | "Full simulations without repeats" is a lower bound when bundle sizes are mixed. | Labelled "at least N"; exact for standalone items and equal 10-question bundles. |
| 4 | P2 | A bundle whose members span taxonomy versions was counted in one taxonomy. | Fixed: treated as not deliverable; test added. |
| 5 | P2 | If the notice request fails, the content-source line is silently missing. | Changed with #6: the whole block stays hidden without a valid server notice. |
| 6 | P2 | `dev:track-b` student pages showed the new notice without a source line. | Fixed: the block is hidden unless the server supplies a notice. |
| 7 | P2 | The demo copy under `os.tmpdir()` would fail the symlink checks on macOS. | Open: only Linux is a verified platform. |
| 8 | P2 | A failed database stop led to deleting the directory of a possibly live postmaster. | Fixed: the copy is kept when cleanup reported an error. A SIGKILLed worker still leaves its copy. |
| 9 | P2 | Ctrl+C during startup is honored only after startup finishes. | Open: startup takes a few seconds; not changed. |
| 10 | P3 | "No ads, no fees" is a factual claim. | Open: owner to confirm; it restates the 2026-11-07 non-profit condition. |
| 11 | P3 | One source-credit string serves both languages and all sources. | Open: acceptable for one corpus. |
| 12 | P3 | "Private Bank is unchanged" overstated (WAL, pid file). | Reworded to "no schema or data change". |
| 13 | P3 | Each published run keeps a full backup with no retention. | Open. |
| 14 | P3 | Browser check text overstated; artifacts default to `/tmp`. | Reworded; artifacts directory is configurable. |
| 15 | P3 | `/api/v3` 503 body during startup changed without flags. | Accepted: it now matches the other versioned routes. |
| 16 | P3 | Test gaps (non-empty PUBLISHED stock, dev:track-b notice). | Partly covered by #1, #4 and the hidden-notice unit test. |

No P0 findings. Verified by the reviewer: unpublished, synthetic or UNKNOWN-rights items cannot be
delivered in PUBLISHED mode; inherited offerings are disabled; notice text uses `textContent` only.
