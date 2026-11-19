# TSA question exchange format (`tsa-question/1`)

This is the one contract for writing practice questions outside the Bank, by a person or an AI model, and bringing
them in as **DRAFTs**. It is deliberately independent of Bank internals: questions have readable ids, images are
referenced by library asset ids, and nothing in a file can publish, approve or change rights. A reviewer still
approves every question after import.

- Machine-readable schema: [`question-set.schema.json`](question-set.schema.json) (generated from the same Zod
  definitions the validator uses, so the two cannot drift).
- Copy-paste instructions for an outside AI: [`AI_QUESTION_GENERATION_PROMPT.md`](AI_QUESTION_GENERATION_PROMPT.md).
- Worked files for every supported type: [`examples/valid/`](examples/valid/). Files that must be rejected, one defect
  each: [`examples/invalid/`](examples/invalid/), with the expected error codes in `expected.json`.
- Validate offline: `node tools/question-bank/validate.mjs questions.json [--assets asset-ids.json]`.

## 1. Document structure

A file is one JSON object, a **question set**.

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Exactly `"tsa-question-set/1"`. |
| `batch_id` | yes | 3-64 characters of letters, digits, `.`, `_`, `-`. Names this delivery; kept in provenance. |
| `passages` | no | Reading passages shared by several questions (see section 6). |
| `questions` | yes | 1-200 questions. |

Unknown fields are errors everywhere. This keeps a typo from silently dropping a requirement.

## 2. Question fields

| Field | Required | Meaning |
|---|---|---|
| `schema_version` | yes | Exactly `"tsa-question/1"`. |
| `question_id` | yes | Stable readable id, for example `MATH-GEO-000089`: uppercase segments, last segment 3-8 digits. Unique in the set and, once imported, in the Bank. |
| `question_type` | yes | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE_GROUP`, `NUMERIC`, `CLOZE` or `MATCHING`. |
| `subject` | yes | `MATH`, `READING` or `SCIENCE`. |
| `topic` | yes | An `UPPER_SNAKE_CASE` topic code such as `PROBABILITY`. The importer maps topics to registered taxonomy codes; an unmapped topic is reported, never guessed. |
| `subtopic` | no | Free text, 1-120 characters. |
| `difficulty` | yes | `EASY`, `MEDIUM` or `HARD`. A target set by the author, not a measured value. |
| `tags` | no | Up to 10 lowercase words (`a-z`, `0-9`, `-`, `_`). |
| `content_blocks` | yes | The prompt, as an ordered list of blocks (section 3). This is the question's stem. |
| `options` | choice types only | 2-10 `{option_id, content_blocks}`. |
| `response_config` | yes | What the student fills in; shape depends on the type (section 4). |
| `passage_ref` | no | The `passage_id` of a passage in the same set. |
| `asset_refs` | yes | Every image asset id used anywhere in this question (may be `[]`). Must equal the images actually used. |
| `explanation` | yes | Blocks shown after results are released. At least one block. |
| `answer` | yes | The correct answer; shape depends on the type. Never shown to students before release. |
| `answer_validation` | yes | How a response is compared with the answer; fixed per type. |
| `scoring_config` | yes | Exactly `{"policy":"BINARY_ALL_OR_NOTHING","points":1}`: a question is fully right or earns nothing. |
| `metadata` | yes | `created_at`, `updated_at` (ISO 8601 date-time, `updated_at` not earlier), `status` (must be `"DRAFT"`), `content_version` (integer from 1). |

## 3. Content blocks

Every list of content (`content_blocks`, `explanation`, option and statement content) is an ordered list of blocks.
Order is preserved, so text, an image, more text, a formula and a second image can follow one another.

```json
{ "type": "text", "content": "Cho tam giác $ABC$ vuông tại $A$..." }
{ "type": "math", "format": "latex", "content": "x^2+2x+1=0", "display": true, "accessible_text": "x bình phương cộng hai x cộng một bằng không" }
{ "type": "image", "asset_id": "IMG-GEO-000123", "alt": "Hình lập phương ABCD.A'B'C'D'", "caption": "Hình 1" }
{ "type": "table", "caption": "Bảng số liệu", "headers": ["x", "y"], "rows": [["1", "2"], ["2", "4"]] }
{ "type": "image_request", "request_id": "NEW-IMG-001", "description": "What the missing figure must show", "alt": "Short alt text" }
```

- **Inline formulas** go inside `text` blocks between single dollar signs, `$\frac{1}{2}$`, with no space after the
  opening or before the closing dollar. Use a separate `math` block for a formula that stands on its own line.
  `accessible_text` is how the formula is read aloud and is required.
- **LaTeX** is limited to the Bank's supported subset (listed in the generation prompt). Anything else is rejected
  with `UNSUPPORTED_TEX` and the offending formula is quoted.
- **Text is plain.** HTML tags, `<script>`, `javascript:` and `data:` URLs, and Markdown images are rejected
  (`UNSAFE_TEXT`). Nothing in a question can run code or load a remote resource.
- **Images** are never embedded. An `image` block names a library asset by id; the same asset may appear in many
  questions and several images may appear in one question, at any position. Every `image` needs alt text.
- **`image_request`** says "a new image is needed here". The question validates, but it cannot be imported until the
  image has been registered in the library and the block replaced by an `image` block. Authors must never invent an
  asset id: an id that is not in the library is an error (`ASSET_NOT_FOUND`) when a catalog is supplied.
- Tables have the same number of cells in every row as there are headers.

## 4. The six question types

For each type the files in `examples/valid/` are complete, validated samples.

| Type | `response_config` | `answer` | `answer_validation` | Internal contract |
|---|---|---|---|---|
| `SINGLE_CHOICE` | `{"selection":"SINGLE"}` | `{"option_id":"C"}` | `{"match":"EXACT_SELECTION"}` | `question/1` |
| `MULTIPLE_CHOICE` | `{"selection":"MULTIPLE","min_selections":1,"max_selections":4}` | `{"option_ids":["B","C"]}` | `{"match":"EXACT_SELECTION"}` | `question/1` |
| `TRUE_FALSE_GROUP` | `{"statements":[{"statement_id":"a","content_blocks":[…]}, …]}` | `{"values":{"a":true,"b":false}}` | `{"match":"ALL_STATEMENTS_CORRECT"}` | `question/1` |
| `NUMERIC` | `{"label":"Đáp số","format":"DECIMAL"}` | `{"value":"0.46"}` | `{"match":"EXACT_DECIMAL"}` | `question/2` |
| `CLOZE` | `{"fields":[{"field_id":"u5","label":"(1) …"}],"max_length":8}` | `{"accepted_values":{"u5":["14"]}}` | `{"match":"EXACT_AFTER_NFC_TRIM","case_sensitive":true,"diacritics":"PRESERVE"}` | `question/3` |
| `MATCHING` | `{"rows":[{"row_id":"r1","label":"…"}],"targets":[{"target_id":"t1","label":"…","max_uses":1}]}` | `{"assignments":{"r1":"t1"}}` | `{"match":"EXACT_ASSIGNMENT"}` | `question/3` |

Rules the validator enforces per type:

- **Single choice**: 2-10 options with unique `option_id`s (letters, digits, `_`, `-`, up to 16 characters); no two
  options with identical content; `answer.option_id` is one of the options, so exactly one option is correct.
- **Multiple choice**: as above; `min_selections <= max_selections <= number of options`; the answer lists distinct
  existing option ids and its size lies within the allowed range.
- **True/false group**: 1-10 statements with unique ids; `answer.values` has exactly one boolean per statement.
- **Numeric**: `answer.value` is a *canonical decimal string*: optional `-`, digits, optional `.` and digits, no
  `+`, no thousands separator, no trailing zeros, no exponent (`"0.46"`, `"-12"`, `"3"`). Comparison is exact decimal
  equality, so say in the prompt how to round, as in the example. Students may type `,` or `.`.
- **Cloze**: fields have lowercase stable ids (`^[a-z][a-z0-9_-]{0,39}$`); `accepted_values` covers exactly those
  fields, each with 1-16 variants that differ after trimming, none longer than `max_length`. Matching is exact after
  Unicode NFC normalisation and trimming outer spaces; case and Vietnamese accents are significant. Refer to the
  blanks in the prompt as `(1)`, `(2)`, … and use the same markers in the field labels. Labels are plain text.
- **Matching**: rows and targets have unique stable ids; every row is assigned exactly one existing target; no
  target is used more often than its `max_uses`; total capacity covers all rows. A target with `max_uses > 1` may be
  reused. Labels are plain text.

All six types are scored all-or-nothing by the existing scoring engine; there is no partial credit.

## 5. Identity, versions and re-import

`question_id` is the author's stable identity for a question. `metadata.content_version` starts at 1.

- Importing a new `question_id` creates a new Bank question with one DRAFT version.
- Importing the same `question_id` with a **higher** `content_version` creates the next version of that Bank
  question. Earlier versions are never edited.
- The same `question_id` and `content_version` with identical content is skipped as already imported; with different
  content it is an error (`CONTENT_VERSION_CONFLICT`). A lower version is an error (`CONTENT_VERSION_REGRESSION`).
  A new version of a quarantined question is refused (`PARENT_QUARANTINED`): the Bank blocks every descendant of a
  quarantined version, so it could never be served.
- Publication validates the full immutable reference chain. If an ancestor contains unsupported rendered content, simply
  changing the passage on a descendant does not make that chain valid. Prepare a corrected replacement under a new
  question id and keep the defective original out of publication; never weaken validation or edit the old record.
- Within one set, repeating a `question_id` is `DUPLICATE_QUESTION_ID`, and two questions with identical prompts are
  `DUPLICATE_QUESTION_CONTENT`.

## 6. Reading passages

A passage is stored once and referenced by any number of questions.

```json
"passages": [{ "passage_id": "READ-PASSAGE-000001", "title": "…", "content_blocks": [ … ] }],
"questions": [{ "question_id": "READ-COMP-000001", "passage_ref": "READ-PASSAGE-000001", … }]
```

Each question keeps its own id, options and answer. The importer stores a passage once as a Bank stimulus and links every
question that references it. The stimulus gets a stable id derived from the passage id and its content, so importing again
reuses it, and a changed passage is a new stimulus (a question whose passage changed needs a higher `content_version`).
A passage may contain `image` blocks; the images must already be in the [image library](../guides/IMAGE_LIBRARY.md).
Passages are not limited to Reading: Science questions use them as well. A passage that no question references is not imported.

The owner publication workflow supplies the private local image store to submission and approval for all three internal
question versions. It re-reads and decodes referenced image bytes and verifies registered asset metadata, pinned inspection
and display rights. Missing, mismatched or undecodable bytes remain blocked. Embedded Bank runtimes must explicitly supply
an enabled image store; image submission remains disabled without one.

## 7. What makes a question invalid

Each problem is reported with a location and a code, for example
`questions[2].answer.option_id  [ANSWER_NOT_AN_OPTION]  Answer E is not one of the option ids (A, B, C, D)`.

| Code | Meaning |
|---|---|
| `NOT_AN_OBJECT`, `UNSUPPORTED_FORMAT`, `INVALID_ENVELOPE` | The file or envelope is not a valid question set. |
| `UNSUPPORTED_QUESTION_TYPE`, `UNKNOWN_FIELD`, `MISSING_FIELD`, `INVALID_FIELD`, `INVALID_KEY` | Structure: wrong type, missing, extra or malformed field. |
| `UNSAFE_TEXT`, `UNSUPPORTED_TEX`, `TABLE_WIDTH` | Content that cannot be rendered safely or in the supported subset. |
| `ASSET_REF_MISSING`, `ASSET_REF_UNUSED`, `DUPLICATE_ASSET_REF`, `ASSET_NOT_FOUND`, `DUPLICATE_IMAGE_REQUEST` | Image references that do not match the content or the library. |
| `DUPLICATE_OPTION_ID`, `DUPLICATE_OPTION_CONTENT`, `ANSWER_NOT_AN_OPTION`, `SELECTION_RANGE`, `ANSWER_COUNT`, `DUPLICATE_ANSWER` | Choice questions whose answer is ambiguous or inconsistent. |
| `DUPLICATE_STATEMENT_ID`, `DUPLICATE_FIELD_ID`, `DUPLICATE_ROW_ID`, `DUPLICATE_TARGET_ID`, `ANSWER_COVERAGE` | True/false, cloze and matching ids, and answers that do not cover exactly the statements, fields or rows. |
| `NUMERIC_FORMAT`, `BLANK_ANSWER`, `ANSWER_TOO_LONG`, `ANSWER_NOT_A_TARGET`, `TARGET_OVERUSED`, `TARGET_CAPACITY` | Answer values that cannot be scored. |
| `DUPLICATE_QUESTION_ID`, `DUPLICATE_QUESTION_CONTENT`, `PASSAGE_NOT_FOUND`, `TIMESTAMP_ORDER` | Set-level inconsistencies. |

A warning does not block validity: `ASSETS_NOT_CHECKED` (no catalog supplied) and `NEEDS_NEW_IMAGE_ASSET`
(an `image_request` is present; the question cannot be imported yet).

Validation proves structure and internal consistency. It does **not** prove that the mathematics is right or that the
question is good: a separate reviewer checks that, and the answer-verification workflow
(`npm run questions:verify`) exists to catch confidently wrong keys.

## 8. From file to Bank

1. **Validate**: `node tools/question-bank/validate.mjs set.json --assets assets.json`. Nothing touches a database.
   `npm run images -- catalog --out assets.json` writes the active asset ids of the library.
2. **Import as DRAFT**: `npm run questions:import -- --file set.json --source-version <uuid> [--topic-map map.json]
   [--taxonomy-version <uuid>]` prints a plan and writes nothing. Add `--confirm "IMPORT N"` (the plan prints the exact
   phrase) to write. A backup is taken first. The operator names an existing source version; the importer reuses its
   recorded rights and never creates or edits sources or rights. Questions are created as DRAFT through the author
   route; nothing is submitted for review, approved or published.
   - `topic` must be a registered skill of the subject's domain, or be mapped by `--topic-map` (a JSON object such as
     `{"PROBABILITY":"MATH_REASONING"}`). An unmapped topic is reported with the registered skills, never guessed.
   - Image ids are resolved through the [image library](../guides/IMAGE_LIBRARY.md) to stored asset versions.
   - Two owner commands prepare what the importer needs, both dry runs unless confirmed: `npm run bank:register-source --
     --file <path> --title "Corpus <name>"` records a corpus document (hash only) as a source version under the owner's
     attested rights, and `npm run bank:register-taxonomy -- --name "<name>" --domain SCIENCE --skills SCIENCE_REASONING`
     adds a provisional taxonomy version for a subject that has none; `--domains "MATH=MATH_REASONING;READING=READING_REASONING;SCIENCE=SCIENCE_REASONING"`
     registers one version with several domains, which is what a single test form that mixes subjects needs. Neither changes an existing record.
3. **Review** as for any other draft. `npm run bank:owner-publish -- [--section MATH|READING|SCIENCE]` now includes
   the latest receipt-backed exchange DRAFTs and IN_REVIEW versions alongside factory imports, provided every source is
   a corpus source. Superseded parent versions and ordinary manual drafts without an exchange receipt remain excluded.
   The command defaults to a dry run;
   writing still requires the exact printed `PUBLISH N SECTION` phrase (`ALL` when no section is selected).
   `--taxonomy-version <uuid>` limits the candidates to drafts authored in that taxonomy version, so a reviewed pool can be
   published without the other unpublished drafts.
   - The owner must review the stored keys, including agent-derived and uncertain keys, before confirming. Publication
     never changes answers. Rights, independent review, duplicate, delivery and selectability checks still apply.
   - Shared exchange passages receive bundles ordered by exchange question id. Factory passage ordering is preserved;
     existing bundles and passages whose questions lack import receipts are left untouched.
   - Images use the operator-configured private store (`TSA_IMAGE_STORE_DIRECTORY`), with the existing local-store guards.
   - A dry run lists candidates and required rights changes; it does not prove that all content will pass review.
     Publication is incremental and can stop after earlier submissions or approvals. Correct blocked content through new
     immutable versions under owner authorization before retrying. For example, the current Science passage shared by
     `SCIE-T26SC-000401`–`000404` uses unsupported `\rightleftharpoons`; those drafts remain blocked.

The [publication rehearsal report](../../plans/reports/codex-261116-1417-exchange-draft-publication.md) records copy-only verification and remaining owner decisions.

**Exact copies of published questions.** A draft whose normalised content equals any other question in the same section
(any taxonomy, any state) is recorded with an OPEN exact-duplicate relation when it is created. While a relation is open,
neither question is selectable and the new one cannot be approved, so importing a copy of a served question hides the served
one until the relation is resolved through equivalence adjudication. Import only content that is not already in the Bank,
or resolve the twin on purpose: `npm run bank:owner-publish -- --taxonomy-version <uuid> --keep-one-of-twins` submits the drafts, confirms
each OPEN exact twin as one equivalence group on the owner connection (both immutable versions are retained; no attempt can contain both),
and then approves. The dry run prints how many twins it would confirm; without the option publication stops at the first twin.
Both versions must be IN_REVIEW or APPROVED, so a twin of an unpublished DRAFT is not resolved this way.

Planning is all-or-nothing: the importer rejects the whole set, before writing anything, when it has any validation error, an unresolved
`image_request`, an unknown or retired asset (in a question or its passage), an unmapped or ambiguous topic, a missing source
version or rights record, or a `content_version` conflict. Writing is then per question and idempotent: if a run stops part-way,
running it again skips what was imported and completes the rest. Re-importing an identical question is a no-op.

## 9. Compatibility

The exchange format maps one-to-one onto the Bank's `question/1` (choice, true/false), `question/2` (numeric) and
`question/3` (cloze, matching) contracts, so scoring, delivery, review and result screens are unchanged and existing
published questions keep working. Changes to this format will use a new `tsa-question/N` version; version 1 files
remain valid.
