# TSA 2026 đợt 1 PDF: Reading and Science import

Status: DONE_WITH_CONCERNS. Single Claude Code session, 2026-11-16. Continues the [Math import](claude-261116-1014-tsa-2026-dot1-math-import.md).

The owner asked for the Reading and Science sections of `TSA_Example_Questions/tsa-2026-dot-1-tong-hop-cac-phan-thi.pdf` to be applied as well. Same terms as Math: DRAFT only, agent-derived keys (the owner's answer file `TSA_2026_Dot1_Giai_Day_Du_168_Cau.md` was read as a second opinion), under the existing OWNER_ATTESTED corpus rights.

## Result (retained Bank, backup `.local/track-b-backups/pre-reading-science-import-2026-11-16-physical`)

- 35 questions imported as DRAFT, none selectable: 9 Reading (one passage) and 26 Science (eight passages). The served stock is unchanged (276 Math and 100 Reading).
- Passage import is new. The importer stores each passage once as a stimulus and links its questions to it (see [question format](../../docs/question-bank/QUESTION_FORMAT.md), section 6). The stimulus id is derived from the passage id and content, so a rerun reuses it. A real stimulus, including passage images, passed submission and owner approval in rehearsal on a copy.
- A Science taxonomy version now exists ("Private corpus Science provisional taxonomy": domain `SCIENCE`, skill `SCIENCE_REASONING`), added with the new `npm run bank:register-taxonomy`. Reading uses the existing Reading taxonomy.
- 10 Science figures are in the image library (`IMG-SCI-000001` to `000010`): the coil, the bacteria photos and the H2 chart (passage 1), the four apoptosis stages, the velocity line chart and four option graphs (passage 6), and the mussel chart (passage 8).
- Each draft is tagged `agent-derived-key` and `tsa-2026-dot-1`; 9 also carry `key-uncertain` (Reading 2, 4, 8; Science 102, 403, 503, 704, 803, 805) because the wording or the passage leaves the answer open.
- Rehearsal on a copy first, including submit and owner approval of text-only drafts of every interaction type (single, numeric, cloze, matching) and of a passage question. They all became approved and selectable there; nothing was approved in the retained Bank.

## Not imported (18 questions)

| Section | Question | Reason |
|---|---|---|
| Reading | Văn bản 2, Câu 1 | The PDF does not print the second reading text, so the question cannot be answered or keyed. |
| Reading | Văn bản 2, Câu 2 | The PDF does not print the second reading text, so the question cannot be answered or keyed. |
| Reading | Văn bản 2, Câu 3 | The PDF does not print the second reading text, so the question cannot be answered or keyed. |
| Reading | Văn bản 2, Câu 4 | The PDF does not print the second reading text, so the question cannot be answered or keyed. |
| Reading | Văn bản 2, Câu 5 | The PDF does not print the second reading text, so the question cannot be answered or keyed. |
| Reading | Văn bản 2, Câu 6 | The PDF does not print the second reading text, so the question cannot be answered or keyed. |
| Reading | Văn bản 2, Câu 7 | The PDF does not print the second reading text, so the question cannot be answered or keyed. |
| Science | văn bản 1, câu 3 | The chart has four unlabelled curves for six species, so no species can be identified from it. |
| Science | văn bản 1, câu 4 | The two coil figures do not show the current direction or winding clearly enough to decide which is correct. |
| Science | văn bản 1, câu 5 | The coil has an outer diameter of 235 mm and an inner diameter of 205 mm and the question does not say which one is D, so two of the four options are defensible. |
| Science | văn bản 2, câu 1 | The answer (cancer) does not appear in the passage and the number of blanks is not clear in the PDF. |
| Science | văn bản 3, câu 4 | The figure the question refers to (curves A and B and point C) is not in the PDF. |
| Science | văn bản 6, câu 1 | From the table the acceleration between 5 s and 10 s is 1 m/s², which is not among the four options. |
| Science | văn bản 6, câu 2 | The question is cut off: it never says which time interval the average speed is taken over. |
| Science | văn bản 7, câu 3 | The sentence to complete is cut off after "có chu kỳ bán rã", so the blanks cannot be placed. |
| Science | văn bản 8, câu 1 | It asks for chlorophyll a values, but the printed graph shows mussel densities, so the numbers cannot be read from it. |
| Science | văn bản 8, câu 2 | The last statement (a predator-prey relation between zebra mussels and zooplankton) has no clear answer: the passage says the mussels filter plankton in general. |
| Science | văn bản 8, câu 4 | No option controls the mussels without also harming native species, so no option satisfies the question. |

## Concerns

- **Drafts that show an image cannot be submitted yet.** 8 of the 26 Science drafts (101, 102, 203, 603, 604, 605, 803, 805) and the 4 Math Kíp 2 figure questions fail submission with `VALIDATION_ERROR`, because the Bank's publication service is built without an image store, so inspected images are never allowed. This is not caused by the import; it blocks publishing any figure question until image delivery is wired in.
- **No owner publication route covers exchange drafts.** `npm run bank:owner-publish` lists only versions with origin `IMPORTED`, and these drafts are origin `MANUAL`; it also bundles passage questions only from factory receipts. Publishing the 141 drafts needs a decision (see unresolved questions).
- The converted sets stay in the gitignored `data/corpus-ingest/pdf-2026-dot1/`; no keys are tracked.

## Unresolved questions

1. How should these drafts be published: extend `bank:owner-publish` to cover exchange drafts (and bundle their passages), or approve them individually like corrections?
2. Should the image gate be fixed now so the 12 figure drafts can be published, or left until figure questions are needed?
3. The five Math differences with the owner's answer file are still unresolved (see the Math report).
