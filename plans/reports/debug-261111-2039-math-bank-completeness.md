# Math bank completeness investigation

Date: 2026-11-11. Scope: read-only diagnosis requested by the owner; no subagents, imports, publication, database changes, or code changes.

## Finding

VERIFIED from hash-bound scan records and retained import summaries: 259 distinct Math captures have retained import records (199 choice/true-false and 60 numeric). The other 141 captures are classified below. Together they account for all 400 Math sources without duplication. Current live database and publication counts were not queried.

| Remaining classification | Count | Cause and next work |
|---|---:|---|
| Diagram, graph, table, or photo | 88 | Math package builders accept text blocks only. Prepare answer-free assets or faithful structured tables and connect the existing inspected-image path to corpus import and demo delivery. Reassess decorative photos individually. |
| Cloze | 20 | Math import profiles do not accept cloze. The existing interaction importer is Reading-specific. Add Math question/3 intake, publication, and demo offerings. |
| Matching | 5 | Same integration gap as cloze; inspect source target pools and keys before mapping. |
| Fraction key | 2 | Numeric input and keys accept decimals only. Source keys are 481/64 and 31/12. The former has an exact decimal equivalent; the latter repeats. Preserving fraction input needs additional answer handling. |
| No visible source key | 13 | Obtain source key evidence or follow an explicitly approved alternative authoring/review process. |
| Clipped or unreadable | 13 | Eight clipped-option captures, one unreadable option, one missing variation table, two missing questions, and one unreadable text capture need source recovery or clarification. |
| Total | 141 | 115 classified under unsupported asset/interaction/fraction paths; 26 under missing-key or damaged-source paths. |

The 115/26 split follows the existing classifications. It is not a fresh visual certification that every capture in the first group is otherwise complete.

## Source evidence

- Choice Math accepts text-only prompts and option/statement blocks: [math-package.mjs](../../tools/corpus-ingest/math-package.mjs).
- Numeric Math accepts a text prompt and decimal key: [math-numeric-package.mjs](../../tools/corpus-ingest/math-numeric-package.mjs), [numeric contract](../../packages/contracts/src/numeric-response.ts).
- Existing cloze/matching package construction requires Reading taxonomy and passage groups: [reading-interactions-package.mjs](../../tools/corpus-ingest/reading-interactions-package.mjs).
- Owner publication currently skips schemas other than question/1 and question/2: [owner-publish.mjs](../../scripts/owner-publish.mjs).
- University demo offerings cover question/1 choice types and a separate question/2 numeric practice: [uni-demo-seed.mjs](../../src/local/uni-demo-seed.mjs). Simply importing question/3 would not make those items available there.
- Inspected images already exist behind a separate, default-off path: [topic practice guide](../../docs/guides/TRACK_B_TOPIC_PRACTICE.md). The gap is corpus integration, not the complete absence of image delivery.
- Historical retained results: [full choice import](claude-261111-2010-math-full-bank-import.md), [numeric import and delivery](claude-261111-2130-numeric-math-import-and-delivery.md).

Private evidence is under `data/corpus-ingest/{cp3b-2026-11-09,cp3b-ext-2026-11-11,cp3b-num-2026-11-11}/`: batch logs, scan files, and retained summaries. Older deferred lists must be reconciled by source path against later accepted items; adding their raw counts double-counts resolved items.

## Verification performed

- Ran a read-only Python reconciliation over the three batch logs and their referenced scans. Every recorded batch hash matched. Accepted source paths were unique. Their union with unresolved source paths equaled exactly the 400 Math entries in the original source manifest: PASS.
- Rehashed all 600 original corpus files against that manifest: PASS, unchanged.
- Ran `canonicalNumericKey` from the existing package builder in Node: `481/64` and `31/12` returned null; `7.515625` was accepted.
- Visually inspected the two fraction captures, GiaiTich/000013.png and GiaiTich/000067.png, confirming the source keys and the first question's explicit fraction-input instruction.
- Initial and final repository status were clean before adding this report. No application tests were run because application behavior was not changed. No live database counts or current student-visible inventory were verified.

## Recommended sequence

Integrate asset/table intake first (88 classified captures), then Math cloze/matching intake plus question/3 publication and demo delivery (25). Address the two fraction questions through supported fraction answers or an explicitly accepted content adaptation. Recover source evidence for the remaining 26. Publication remains a separate owner action after valid intake and review.
