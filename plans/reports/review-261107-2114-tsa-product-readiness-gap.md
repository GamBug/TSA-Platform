# TSA-Platform readiness review: gaps, checkpoints, resources, agent strategy

Date: 2026-11-07 (Asia/Bangkok). Revision 3, which incorporates the owner's answers given the same
evening. The decisions are recorded at the top of `docs/decisions/OPEN_DECISIONS.md`. Branch `feat/track-b-data-auth` at `a70861a`, with 187 uncommitted paths. Read-only
review: no code changed, no tests run. Labels: VERIFIED (read from the repo), ASSUMPTION,
OWNER DECISION.

## 1. Owner decisions (2026-11-07) and what they change

| # | Decision | Consequence |
|---|---|---|
| D1 | Target is a **university demo**, with an architecture that can grow into a full product | Hosting and real auth are optional for the demo. Keep current boundaries (versioned contracts, Bank as the only content source, no live AI at exam time) so nothing has to be thrown away later |
| D2 | Corpus source **granted permission for non-profit use** | The 600 files become real input stock, not just style reference. This removes the biggest content blocker for Math and Reading. The permission must be recorded (see §5) and the site must stay non-profit (no ads, no paid tier) and credit the source |
| D3 | Reviewers are **the owner plus AI agents**; student helpers are a bonus | Must fit the existing rule "an author cannot approve their own version" (QUESTION_SCHEMA.md:62). It does, if items are authored by a source-import or AI-drafter account and the owner is the single human approver. MVP_SCOPE's "two different humans" line needs a short ADR amendment. The owner must never be the author of an item they approve |
| D4 | Score = **number of correct answers** (per section and total) | Matches the existing binary practice scoring. Only the presentation is needed: "Math 28/40 · Reading 15/20 · Science 30/40 · Total 73/100". A better scoring model can come later as a new scoring version |
| D5 | **Each section has its own timer** (60/30/60), and students **may go back** to earlier sections | Reconciled as a server-side per-section time budget that runs only while that section is open ("chess clock"). Going back resumes that section's remaining time; an exhausted section becomes read-only; the attempt ends when all budgets are used or the student submits. This is more complex than one clock: the server must record section enter and leave events and sweep expiry per section. It is a product choice, not an official HUST rule |

## 2. Where the system stands (VERIFIED)

Strong already: Bank and review workflow, allocation without repeats, sealed attempts, server
clock, save/resume, grading, release, private images, numeric entry (q2), topic practice, and both
browser engines tested. That is 29 migrations and about 39k lines of source.

| Gap | Status |
|---|---|
| Uncommitted work | Migrations 026–029 and the topic, image, numeric and manual-transport modules and tests are untracked |
| Approved real content | 0 published items |
| Full simulation | Not built. Profiles are one section only (4/2/4 questions). SQL011/SQL015 select one section `INTO STRICT` |
| Corpus | Math: 400 PNG screenshots with answers visible, UI chrome, and some cropped graphs. Reading: 200 text captures over 20 passages, with answers embedded. **No Science section source** |
| Question types | Choice, true/false and numeric. Cloze/text and matching are missing (≥ 13 drag-drop and about 15 entry items in Reading) |
| Agent context cost | Onboarding loads about 475 KB of state, handoff and backlog before work starts |

## 3. Demo content budget

A full simulation needs 40 Math, 20 Reading and 40 Science questions.

| Domain | Raw stock | Full exams possible (NEW_ONLY) | Main work |
|---|---|---|---|
| Math | 400 screenshots | up to about 10 | Transcribe the image into structured text with LaTeX; separate the answer key; recrop or redraw diagrams without answer marks; re-source cropped items; fix topic labels |
| Reading | 200 items / 20 passages | about 10 (2 passages × 10 questions each) | Text parsing; split the passage from its questions; strip answers. About 170 are choice/true-false and import today; about 30 cloze/matching items wait for CP4 |
| Science | **0, the owner will add or crop items** | depends on supply | Same pipeline as Math (vision transcription, blind solve, owner approval). The new files need the same rights record |

Demo target (ASSUMPTION, adjust as needed): **2 full simulations without repeats per student**,
which means about 80 Math, 40 Reading (4 passages) and 80 Science items, plus the rest of the
Math and Reading stock for topic practice.

## 4. Checkpoints

Order: CP0 → CP1, then CP2 and CP3 in parallel (their files are disjoint), then CP4–CP6.

| CP | Goal | Exit criteria | Who |
|---|---|---|---|
| **CP0 Safe baseline** | Stop the risk of losing work | Tree split into reviewed conventional commits; corpus kept out of Git (gitignore it and keep a private backup); the existing offline and PG suites run once and recorded; branch pushed | Agent; owner approves the commit list |
| **CP1 Lean docs** | Cut agent token cost | PROJECT_STATE ≤ 1 page; LAST_HANDOFF holds only the latest handoff; backlog split into active and archive; history moved to `docs/archive/` (still in Git); onboarding reads under about 20 KB | Agent (docs only) |
| **CP2 Full simulation** | 100 questions, 150 minutes, one attempt | Blueprint v2 for 40/20/40 sections; a multi-section form inside one attempt with per-section chess-clock budgets (60/30/60) that the server enforces, with go-back allowed while time remains and an exhausted section read-only; no question content from other sections leaks before they open; per-section expiry handled by the sweeper; per-section and total correct count in results and history; existing single-domain and topic practice unchanged; Chrome and Firefox journeys pass on a synthetic 100-item stock | Implementer + reviewer |
| **CP3 Corpus ingestion** | First real items live | Permission and reviewer-policy ADRs recorded; Reading pipeline (parse, then manual-transport v3 import as DRAFT, then owner approval) publishes ≥ 40 items; Math pipeline (vision transcription, then an independent agent blind-solves and the key is compared, then the owner approves) publishes ≥ 80 items; disagreements are flagged and never auto-approved | Agents draft and check; owner approves |
| **CP4 Missing types** | Cover the remaining Reading items | Cloze/text and matching versions following the q2 pattern; non-drag alternative (WCAG 2.5.7); scoring, persistence and review tests; remaining Reading items imported | Implementer + reviewer |
| **CP5 Science section** | Complete the third section | Owner supplies cropped Science items; ≥ 80 approved through the CP3 Math pipeline (transcription, blind solve, owner approval) | Owner supplies; agents transcribe; owner approves |
| **CP6 Demo-ready** | Presentable and safe to show | Seeded demo database built from published items only; non-profit notice and source credit visible; "unofficial practice" disclaimer; one-command start; a rehearsed run of show. Optional: a free-tier host with simple auth. Real production auth waits for the full-product phase | Agent + owner |

**Later, toward the full product (not needed for the demo):** real auth and hosting with backups,
privacy notice, an improved scoring version, more Science stock, and student helper reviewers.

## 5. Resources to prepare

1. **Permission evidence (owner, do first):** the decision is recorded but marked
   REQUIRES_VERIFICATION. Save the written permission (email or message screenshot) in a private,
   gitignored folder and tell an agent who granted it and when. It gates publishing corpus items
   and protects you during the uni defense.
2. **Science items:** the owner adds or crops them. Use full, uncropped captures with answers
   visible on a separate capture if possible.
3. **Uncropped Math originals** for screenshots whose graphs are cut off (the first Geometry file is
   one example). Otherwise those items are dropped or their diagrams redrawn.
4. **Owner review time:** with an agent pre-check, assume about 1–2 minutes per item. 300 items is
   then about 5–10 hours (ASSUMPTION; measure on the first 40).
5. **Taxonomy sheet** per domain (topic × skill), so topic practice and blueprints have reliable
   labels.
6. **Subscriptions:** Codex Plus and Antigravity PRO for transcription and drafting. Keep the
   no-paid-API rule.

## 6. Using agents without burning tokens

**Principles**
- **One implementer, then one read-only reviewer**, sequentially. Run in parallel only for
  disjoint files: CP2 (engine) runs alongside CP3 (content tooling and data).
- **Give each agent a task card, not history:** goal, exact files, exit test, forbidden actions.
  CP1 makes this the default.
- **Use the cheap tier for mechanical work:** commit splitting, doc archiving, Reading text
  parsing, test reruns.
- **Use the strong tier for design and tricky correctness:** the multi-section attempt (CP2), new
  interaction versions (CP4), and Math transcription checks.
- **Content is batch work.** Transcribe or draft 10–20 items per prompt with a fixed JSON schema in
  the subscription UIs, then import in bulk. The useful AI check is **one independent blind solve
  per item** that is compared with the key. Repeated critique loops are not useful, and AI is never
  the approver.
- **Evidence = command + one result line.** Skip long prose receipts and stop re-hardening paths
  that already pass.

**Recommended agent per checkpoint** (model availability not verified; use the fallback if the
model is not listed)

| CP | Implementer | Model / reasoning | Reason | Reviewer |
|---|---|---|---|---|
| CP0 | Claude Code | Mid tier (Sonnet-class), low | Mechanical commit split with a secret scan | Owner checks the commit list |
| CP1 | Claude Code | Mid tier, low | Move and summarize docs, no logic | Owner |
| CP2 | Codex | Strongest available, high (fallback: Claude Code Opus-class, high) | Cross-module SQL, DTO and attempt-lifecycle change | Separate read-only Claude Code or Antigravity session, medium |
| CP3 Reading | Claude Code | Mid tier, medium | Deterministic text parsing into the v3 schema | Owner approval in the staff UI |
| CP3 Math | Antigravity (Gemini Pro-tier vision, if listed) for transcription; Codex for the blind solve | Pro tier, medium | Vision transcription plus an independent check from a different model family | Owner approval |
| CP4 | Codex | Strongest available, high | Extend the q2 versioning pattern | Read-only reviewer, medium |
| CP5 | Antigravity or Codex chat UI | Pro tier, medium | Batch drafting of Vietnamese items; blind solve by the other platform | Owner approval |
| CP6 | Claude Code | Mid tier, medium | Seeding, notices, run-of-show script | Owner rehearsal |

A recommendation is not a delegation, and no review is implied until it is recorded.

## Unresolved questions

1. Grantor identity, date and evidence for the corpus permission (it blocks publishing, not
   engineering).
2. Confirm the chess-clock reading of D5: can students re-enter a section only while its own time
   remains?
