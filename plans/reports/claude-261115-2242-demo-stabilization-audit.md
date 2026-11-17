# University demo stabilization audit

Status: DONE_WITH_CONCERNS. Single session on `feat/track-b-data-auth`, 2026-11-15 (Asia/Bangkok), no subagents. CI is repaired locally and awaits a push; the demo works end to end on real published content; five published Math items have answer keys that do not hold up and need an owner decision.

## 1. CI failure (fixed, committed locally, not pushed)

- **Cause:** three suites, `tests/ai/corpus-reading-interactions{,-import,-package}.test.mjs`, scanned the gitignored `TSA_Example_Questions` directory. GitHub run `43727345212` failed with `ENOENT` in six tests. I reproduced exactly those six failures in a clean clone of `6299bc9` without the corpus.
- **A second hidden failure:** two historical reports (`codex-261109-1435-cp3a.md`, `codex-261110-0921-cp4.md`) linked to gitignored `data/corpus-ingest/` files, so `docs:check` and seven `test:docs` tests fail on any clean checkout. CI never reached them because it stops at the first failing step. Those four links are now plain code-span paths marked private.
- **Fix (`ee6b7f0`):** `tests/ai/fixtures/synthetic-reading-corpus.mjs` writes a synthetic capture corpus in the real capture format with the exact shape the readers enforce (20 passages; 36/10/19/13/22 interaction counts; one flagged matching capture). The three suites use it by default and keep their assertions unchanged. `npm run test:corpus:private` runs the same nine tests against the real corpus.
- **Evidence:** every step of `.github/workflows/contracts.yml` passes in a clean clone of the new commit with no corpus (typecheck, build, built 2, consumers 12, contracts 192, b0 109, AI and client boundaries 116, docs checker 13, OpenAPI, consumer boundary, docs check, `git diff --check`). The nine interaction tests also pass on the real corpus (9/9).

## 2. Demo readiness on the PostgreSQL-backed demo

Real-Bank run: `npm run demo:uni` on a fresh backup and temporary copy, driven in Chromium by a scratch script (not committed). The temporary copy, port and processes were removed afterwards; the retained Bank has identical counts and states before and after.

| Stage | Result on real content |
|---|---|
| Student login, notices, content-source credit | Works; no rehearsal label; credit shown (placeholder text used for the audit). |
| Topic practice (Math, 5 questions) | Works: created, started, answered, saved, survived a page reload, submitted, graded 2/5, result released. |
| Grading correctness | Released keys equal the source keys for all five items; score is consistent. |
| Topic practice (Reading passages, 10 questions) | Works with whole passages: 10/10 answered, graded, released. |
| Numeric practice (`?student=postgres-v2`) | Works (4/4 answered, graded, released). |
| Cloze and matching (`?student=postgres-v4`) | Works (4/4 answered, graded, released). |
| Rendering | No raw LaTeX, no KaTeX errors, no horizontal overflow, 0 console or log errors. |

Test runs (actual results): `test:demo:uni` 16/16; `test:demo:uni:browser` PASS (rehearsal, exit 0, no leftovers); attempts 28, scoring 11, grading 24, results 7, topics 6, student 85, bank 185, numeric 19, critical student 9, privacy 2, auth 5, app suite 110 (one test added). All passed. Not run: Firefox journeys, `test:db:preflight`, the staff browser journeys. Two root-owned or system processes (a `node dist/server.js` and the system PostgreSQL) were present and were not touched.

Stock in the real demo: Math 281 published (199 deliverable as section practice, 60 numeric, 22 cloze/matching), Reading 100 published (topic practice only), Science 0. The full simulation is not offered, which the owner already accepted on 2026-11-11.

## 3. Math publication audit

**The publication is not pending.** The Bank audit trail shows all 381 imported items (281 Math, 100 Reading) were approved on 2026-11-11 by the owner publication command, with the recorded `OWNER_ATTESTED` reason. This includes the 22 `question/3` items. `docs/agents/PROJECT_STATE.md` was stale on this and has been corrected. Nothing was approved, published or changed during this audit.

| Capture | Version id | Finding |
|---|---|---|
| HinhHoc/000089 | `c51d4e20-f440-450c-a097-8826531a25b7` | Stored key is wrong; a different option is the only valid one. |
| HinhHoc/000003 | `a86a3b55-45f9-47d6-a8d9-4225bf8c7417` | No option matches the problem as printed. |
| HinhHoc/000066 | `aba42616-4061-40cd-ac85-043499737d8f` | No option matches the problem as printed. |
| HinhHoc/000015 | `7a7cb9fa-67de-48d8-b730-d23a6ca2d5c7` | No option matches as printed; its key only fits sibling 000043. |
| XacxuatThongke/000028 | `045652d5-85a8-441b-ace6-b0863b323d50` | Printed data give about 10 minutes; no option matches. |

- The source images confirm that all of these were transcribed faithfully, so the defects are in the source captures. The full item-level evidence, including option letters, is in the private `data/corpus-ingest/audit-2026-11-15/math-key-audit.md`.
- **Near duplicates:** exactly two pairs above 0.6 similarity and no exact duplicates. `XacxuatThongke/000007` and `000045` are the same numeric problem with the same correct key (published twice). `HinhHoc/000015` and `000043` are siblings that differ by one constant. No duplicate group records either pair.
- **Unverified answers:** only the first 80 Math items had an independent blind solve. The other 201 (119 single/true-false, 60 numeric, 22 cloze/matching) rest on source keys alone. Earlier reports also flag reconstructed text in `XacxuatThongke/000016` and `000023`, an unparenthesized `fb` in `GiaiTich/000127`, and a restriction-dependent third answer in `XacxuatThongke/000054`.
- **Remaining human approvals:** the owner decides whether to quarantine or correct the five items, merge or withdraw the duplicate, and whether to accept the unverified 201 or schedule a blind-solve pass. Rights remain the owner's attestation; this audit did not verify copyright.

## 4. UX and defect findings

Fixed (committed locally):

- `MATH_REASONING` appeared as a raw code in the topic list for the main Math topic. It now reads "Toán học và suy luận" (`a2650fe`, with a regression test that fails without the fix).
- On the result card the content notice was wider than the stat tiles and touched them. Fixed in CSS (`5e5ec52`), checked visually in the rehearsal.

Required before presenting (owner decisions, not engineering): the five Math items above; the real `DEMO_UNI_SOURCE_CREDIT` source name (the launcher refuses to start without it); a rehearsal on the real Bank with that credit.

Optional improvements, none blocking:

- "Đã tiếp tục bài đã được giữ" ("Resumed the held attempt") shows on every freshly started topic attempt and stays on the result page, because `startReservedAttempt` in `persistent-api.js` always returns `resumed: true`.
- Login for a student with an earlier attempt opens that restored result instead of the catalog, which conflicts with step 1 of the run of show on a second pass. Use the other student account or restart the demo.
- The topic list shows an empty duplicate "Tư duy Toán học" group with "Đại số 0 câu khả dụng" (the legacy synthetic taxonomy in the retained Bank), and a "Chọn toàn bộ" row for single-topic groups. Hiding groups on the client is unsafe because availability changes with the chosen duration; filter taxonomies with no published item on the server instead.
- Reading topic practice defaults to 2 questions although passages carry 10; I verified 10 only.
- Reading questions place the whole passage above the options, so students scroll past it for each question.
- The full-simulation pages are English while topic practice is Vietnamese (the simulation is not offered on the real Bank today).

## 5. Remaining blockers and next task

No engineering blocker remains for a Math-and-Reading demo. Open items: push the three local commits so CI turns green (not done: you did not ask for a push); the five Math items; the source-credit string; Science content (CP5) if a full simulation is wanted.

**Recommended next task:** a pre-demo Math content gate. Quarantine or correct the five items through the existing manager quarantine action, resolve the duplicate pair, then blind-solve the 201 unverified items in batches, starting with geometry and probability. Suggested implementer: the owner-operated Codex Plus session for the blind solves (strong at long exact arithmetic), with an independent reviewer; verify current model availability first and fall back to the Claude Code session if unavailable. This recommendation does not authorize delegation.

## Unresolved questions

- Should the five flagged Math items be quarantined before the demo, or left live with the risk accepted?
- What is the exact source name for `DEMO_UNI_SOURCE_CREDIT`?
- Is the "resumed" wording intended for reserved attempts, or should fresh starts show nothing?
