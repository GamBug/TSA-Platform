# TSA 2026 đợt 1 PDF: Math import

Status: DONE_WITH_CONCERNS for Math; Reading and Science not yet done. Single Claude Code session, 2026-11-16.

The owner added `TSA_Example_Questions/tsa-2026-dot-1-tong-hop-cac-phan-thi.pdf` (57 pages: three shifts of Math, Reading and Science, compiled by AECK from candidates' memory) and asked for every question to be applied. Decisions recorded with the owner: questions go in as **DRAFT only with agent-derived keys** (the PDF has no answer keys), the PDF is covered by the existing OWNER_ATTESTED corpus rights, and Math goes first.

## Result (retained Bank, backup `.local/track-b-backups/pre-pdf-import-2026-11-16-physical`)

- Source version registered with `npm run bank:register-source` (title "Corpus TSA 2026 dot 1 (AECK compilation)", file hash only).
- 106 Math questions imported as DRAFT with `npm run questions:import` (batches `TSA2026D1-MATH-K1/K2/K3`: 39, 26 and 41): single choice, multiple choice, true/false groups, numeric, cloze and matching. 0 are selectable; 276 Math and 100 Reading items are still the only served stock.
- 4 figures registered in the image library (`IMG-TSA-000001` to `000004`): the globe model, a circle diagram, the exponential graphs and a rational-function graph. Tables, pie charts and variation tables were transcribed to text or table blocks.
- Every key was derived by solving the question from the page image, with exact arithmetic or brute force for numeric and counting items. Each draft carries the tags `agent-derived-key` and `tsa-2026-dot-1`; 18 also carry `key-uncertain` (ambiguous wording, answer format or a figure reading). Nothing is approved.

## Not imported (14 questions)

| Shift | Question | Reason |
|---|---|---|
| Kíp 1 | 14 | No valid option: removing the maximum 378 and minimum 310 from a sample with mean 344 leaves the mean unchanged, and none of the four options says so. |
| Kíp 2 | 14 | Underdetermined as transcribed: two conditions leave a free parameter, so the second and third statements cannot be decided. |
| Kíp 2 | 22 | Triangle count is not determined by the statement (depends on line positions); only the parallelogram count 678 is clear. |
| Kíp 2 | 23 | Exact duplicate of Kip 1 question 20 (class pie chart); not imported twice. |
| Kíp 2 | 25 | Two options (u19 and u20) both satisfy the condition, so a single answer is not defined. |
| Kíp 3 | 21 | Inconsistent as transcribed: AB = AC = 3 with a right angle at B is impossible (AC is the hypotenuse). |
| Kíp 3 | 22 | Graph of f'(x) is not reliably readable (the plotted reference points are ambiguous), so the number of extrema cannot be fixed. |
| Kíp 3 | 43 | Coefficient of x^4 in (x^(-1/3) - 3x^2)^10: no term has exponent 4 (7k=22), so the printed expression is probably mistranscribed. |
| Kíp 3 | 44 | Lantern folding problem depends on the dimensions of the inner square in the figure, which are not given. |

Also not imported: nothing from Reading (31 questions in passages) or Science (about 37 items in passages, figures and drag-drop sets). They need passage-based import and a Science taxonomy, which do not exist yet.

## Caveats

- The PDF itself warns of errors from reconstruction by memory; several skipped items are internally inconsistent as printed.
- Where a question accepts a typed expression or fraction, the accepted spellings are limited to the variants listed in the draft.
- Nothing from the PDF's text or figures is tracked in Git; the converted sets stay in the gitignored `data/corpus-ingest/pdf-2026-dot1/`.
