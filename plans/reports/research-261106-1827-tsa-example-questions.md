# TSA example question inspection

Inspected2026-11-06, Asia/Bangkok. Source: `TSA_Example_Questions/`, newly added and untracked. No source files changed, no import/publication and no database mutation. [Machine inventory](research-261106-1827-tsa-example-inventory.json).

## Verified inventory

| Folder | Files | Format |
| --- | ---: | --- |
| TSA_DocHieu_BaoChi | 50 | Text |
| TSA_DocHieu_KhoaHoc | 120 | Text |
| TSA_DocHieu_VanHoc | 30 | Text |
| TSA_ToanHoc_DaiSo&SoHoc | 69 | PNG |
| TSA_ToanHoc_GiaiTich | 131 | PNG |
| TSA_ToanHoc_HinhHoc | 137 | PNG |
| TSA_ToanHoc_XacxuatThongke | 63 | PNG |

Total600files/32,712,238bytes, zero exact-byte duplicate files. All400PNGs have931×800headers; four representative images were visually inspected, one per Mathematics folder. No full-image OCR or claim that all400questions were transcribed/validated.

The200Reading captures contain20distinct normalized shared passages, each repeated across10question captures. These are200question records, not200independent passages. UTF-8 decoding succeeded without replacement characters.

## Findings affecting Track B

1. Revealed answers are embedded in text and in screenshot pixels. These files cannot be delivered as public question assets. Source capture, public prompt/options, private grading keys and explanations must be separated and validated. `Ẩn đáp án`/`Lời giải` interface text is not evidence that a complete explanation or correct true/false selection was retained.
2. Additional interactions are evidenced: numeric entry, textual/cloze entry and drag/drop-style matching. Current question/1 delivery/scoring supports only single choice, multiple choice and true/false groups. Do not flatten entry or matching into fake choice questions; a versioned compatibility decision and scoring/persistence tests are needed before implementing those additional types.
3. Mathematics files are viewport screenshots containing toolbar/footer and sometimes cropped content. The first Geometry screenshot cuts off its graph below the viewport. Recover complete source content before extracting a standalone diagram; simply displaying the whole capture would also expose answers and interface chrome.
4. Folder labels need question-level validation. The first Algebra/Arithmetic example is a limit question; the first Geometry example uses a lifting-work/variable-water-weight problem. Folder membership alone does not prove mathematical topic or reasoning-family classification. No reclassification was applied.
5. Reading genre is separate from reasoning skill. Scientific Reading passages remain in READING; `TSA_DocHieu_KhoaHoc` must not become the SCIENCE/problem-solving exam section. No standalone Science-section collection was found.
6. Filenames repeat between folders; retain source-relative namespace, not basename-only IDs. Preserve shared passage IDs and ordering while separating question records.
7. No top-level provenance/license manifest was present. Existing publication/rights/human validation gates remain applicable; merely supplying examples does not establish approved bank inventory.

## Heuristic format scan, not accepted classification

The200text captures show136explicit labeled correct-choice records,22with true/false controls,13with explicit drag/drop wording,15entry/cloze prompts without recognized choice labels and14requiring manual classification. The last group includes matching/placeholder captures that omit an explicit drag/drop instruction. Thus13is a lower bound for explicitly recognizable drag/drop wording, not a complete matching count. Prompt wording alone can mention blanks while still presenting choice options; choice labels were prioritized in this scan.

## Implementation implication

Use the collection as private reference evidence and extraction input. First preserve full-source provenance and capture completeness, then recover shared passages and structured per-question public/private fields, validate interaction and taxonomy per item, and stage private DRAFT records through the existing review workflow. Do not seed these600files as600eligible published questions or assume OCR can reconstruct clipped material.

Recommended next agent: existing Codex/current available model with high reasoning if available for schema/scoring compatibility; bounded extraction can use the installed multimodal capability only after checking local support. Separate read-only review should verify resulting public/private boundaries. No paid API calls or delegation were used for this inspection.
