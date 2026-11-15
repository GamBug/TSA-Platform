# Standalone prompt: generate TSA practice questions

Copy everything below the line into any AI conversation. It needs no other file and no access to any repository.
Before sending it, replace the five items in **YOUR REQUEST** (or send them in a follow-up message). If you have
images, list their asset ids in `AVAILABLE IMAGE ASSETS`; otherwise leave that list empty.

Check the answer with `node tools/question-bank/validate.mjs output.json` before importing anything.

---

You write practice questions for an unofficial Vietnamese thinking-skills test preparation platform, in the **TSA
question format `tsa-question/1`**. A program will validate your output automatically and a human will review every
question, so precision matters more than volume. Write the questions' student-facing text in **Vietnamese**.

## YOUR REQUEST

- Subject: `MATH`            (one of MATH, READING, SCIENCE)
- Topic code: `PROBABILITY`    (UPPER_SNAKE_CASE; use exactly this code in every question)
- Number of questions: 20
- Difficulty: `MEDIUM`        (EASY, MEDIUM or HARD; use exactly this value)
- Question types: any mix of the types below, or restrict to: SINGLE_CHOICE
- Batch id: `GEN-2026-11-16-A`  (use exactly this)
- First question number: 1      (ids count up from here)

AVAILABLE IMAGE ASSETS (the only image ids you may use; empty means you may use none):

```
(none)
```

## OUTPUT RULES (read twice)

1. Output **one JSON document and nothing else**: no explanation before or after, no Markdown code fence, no
   comments. It must parse with a standard JSON parser (double quotes, no trailing commas).
2. Never invent an image asset id. Use an `image` block only with an id from AVAILABLE IMAGE ASSETS. If a question
   truly needs a figure and no suitable asset is listed, put an `image_request` block where the figure belongs (see
   Blocks) and still write the rest of the question. Never describe a missing figure only in prose.
3. **Solve every problem yourself before you write the answer.** Recompute the answer a second time by a different
   route. If a problem is ambiguous, has no correct option, has more than one correct option, or you are not sure of
   the answer, **do not include it**; write a different question instead. It is better to return fewer questions
   than one wrong one. Never write an answer you have not verified.
4. Use only the fields listed here. Unknown fields make the whole file invalid. Every required field must be present.
5. Do not copy text from textbooks, past exams or websites. Write original problems.
6. All questions in the file get status `"DRAFT"`, `content_version` 1 and the same timestamp (current date-time in
   UTC, ISO 8601, for example `2026-11-16T09:00:00Z`) for `created_at` and `updated_at`.

## DOCUMENT SHAPE

```json
{
  "format": "tsa-question-set/1",
  "batch_id": "<the batch id>",
  "passages": [],
  "questions": [ <question>, <question>, ... ]
}
```

`passages` is only needed for reading questions that share a passage (see Passages); otherwise leave it `[]`.

## QUESTION FIELDS (all required unless marked optional)

```
"schema_version": "tsa-question/1"
"question_id":   MATH-PROB-000001   uppercase segments joined by '-', last segment 3-8 digits, unique in the file.
                 Pattern: <SUBJECT>-<AREA>-<number>, for example MATH-PROB-000001, MATH-GEO-000014.
"question_type": SINGLE_CHOICE | MULTIPLE_CHOICE | TRUE_FALSE_GROUP | NUMERIC | CLOZE | MATCHING
"subject":       MATH | READING | SCIENCE
"topic":         the topic code you were given
"subtopic":      (optional) short free text, at most 120 characters
"difficulty":    EASY | MEDIUM | HARD
"tags":          list of up to 10 lowercase words with '-' or '_', may be []
"content_blocks": the question prompt, a list of blocks (see Blocks)
"options":       (only SINGLE_CHOICE and MULTIPLE_CHOICE) see below
"response_config": depends on the type (see Types)
"passage_ref":  (optional) the passage_id of a passage in this file
"asset_refs":    list of EVERY image asset id used anywhere in this question; [] if none. It must match the
                 image blocks exactly: no id missing, none extra.
"explanation":   list of blocks explaining the solution in Vietnamese (at least one block)
"answer":        depends on the type (see Types)
"answer_validation": depends on the type (see Types)
"scoring_config": {"policy": "BINARY_ALL_OR_NOTHING", "points": 1}
"metadata":      {"created_at": "...", "updated_at": "...", "status": "DRAFT", "content_version": 1}
```

## BLOCKS

A list of blocks is ordered; the student sees them in that order. Use these block types:

```
{"type":"text","content":"Vietnamese text. Inline formulas go between single dollar signs: $\\frac{1}{2}$"}
{"type":"math","format":"latex","content":"x^2-5x+6=0","display":true,"accessible_text":"how to read the formula aloud, in Vietnamese"}
{"type":"image","asset_id":"IMG-GEO-000123","alt":"description of the figure","caption":"Hình 1"}
{"type":"table","caption":"title","headers":["x","y"],"rows":[["1","2"],["2","4"]]}
{"type":"image_request","request_id":"NEW-IMG-001","description":"what the missing figure must show, in detail","alt":"short alt text"}
```

- Inline math: between single `$`, with no space after the opening `$` or before the closing `$`, inside a `text`
  block. Because the document is JSON, every backslash must be doubled: write `\\frac`, not `\frac`.
- A formula that stands alone on its own line is a `math` block; `accessible_text` is required.
- `text` must be plain text: **no HTML, no `<` or `>` tags, no Markdown images, no links, no scripts**.
- A `caption` is optional on images. `alt` is required on images and image requests.
- Every table row has exactly as many cells as `headers`.
- `request_id` values are `NEW-IMG-001`, `NEW-IMG-002`, … and must differ within one question.
- Blocks may be mixed freely: text, image, text, formula, image, and so on.

### Supported LaTeX

Only these LaTeX commands work. A formula with any other command makes the question invalid. Do not use `\newcommand`,
`\def`, `%` comments, `\text{...}` with markup, or packages.

<!-- tex-commands:start -->
\frac \dfrac \tfrac \sqrt \text \mathrm \mathbf \mathit \mathbb \mathcal \operatorname \overline \underline \hat \widehat \bar \vec \dot \ddot \left \right \big \Big \bigl \bigr \Bigl \Bigr \bigg \Bigg \quad \qquad \enspace \thinspace \cdot \times \div \pm \mp \le \leq \ge \geq \neq \ne \approx \equiv \sim \simeq \cong \propto \ll \gg \mid \nmid \parallel \perp \in \notin \ni \subset \supset \subseteq \supseteq \cup \cap \setminus \emptyset \varnothing \infty \forall \exists \nexists \therefore \because \sum \prod \coprod \int \iint \lim \max \min \sup \inf \log \ln \exp \sin \cos \tan \cot \sec \csc \arcsin \arccos \arctan \gcd \det \dim \rank \mod \bmod \pmod \partial \nabla \ell \hbar \Re \Im \angle \triangle \degree \circ \prime \ldots \cdots \vdots \ddots \to \rightarrow \leftarrow \leftrightarrow \mapsto \Rightarrow \Leftarrow \Leftrightarrow \iff \implies \gets \xrightarrow \xleftarrow \alpha \beta \gamma \delta \epsilon \varepsilon \zeta \eta \theta \vartheta \iota \kappa \lambda \mu \nu \xi \omicron \pi \varpi \rho \varrho \sigma \varsigma \tau \upsilon \phi \varphi \chi \psi \omega \Gamma \Delta \Theta \Lambda \Xi \Pi \Sigma \Upsilon \Phi \Psi \Omega \begin \end
<!-- tex-commands:end -->

Escaped symbols also allowed: `\!` `\#` `\$` `\%` `\&` `\,` `\:` `\;` `\_` `\{` `\}` `\|` `\\` and `\ `.
Environments, with `\begin{...}` and `\end{...}`: <!-- tex-environments:start -->`matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `smallmatrix`, `cases`, `aligned`, `array`<!-- tex-environments:end -->.
Braces must be balanced.

## TYPES

**SINGLE_CHOICE**: exactly one correct option, 2-10 options (use 4 unless the problem needs another number).

```
"options": [{"option_id":"A","content_blocks":[{"type":"text","content":"..."}]}, {"option_id":"B", ...}, ...]
"response_config": {"selection": "SINGLE"}
"answer": {"option_id": "C"}
"answer_validation": {"match": "EXACT_SELECTION"}
```

Option ids are `A`, `B`, `C`, `D`... Options must differ from each other. The answer must be one of the options.
Make distractors plausible, not absurd, and make sure **only one** option is mathematically correct.

**MULTIPLE_CHOICE**: more than one option may be correct.

```
"response_config": {"selection":"MULTIPLE","min_selections":1,"max_selections":4}
"answer": {"option_ids": ["B","C"]}
"answer_validation": {"match": "EXACT_SELECTION"}
```

`min_selections` <= `max_selections` <= number of options, and the number of correct options must lie in that range.

**TRUE_FALSE_GROUP**: a prompt followed by 1-10 statements, each true or false. No `options` field.

```
"response_config": {"statements": [{"statement_id":"a","content_blocks":[{"type":"text","content":"..."}]}, {"statement_id":"b", ...}]}
"answer": {"values": {"a": true, "b": false}}
"answer_validation": {"match": "ALL_STATEMENTS_CORRECT"}
```

Give a true/false value to **every** statement and to no other id.

**NUMERIC**: the student types a number. No `options` field.

```
"response_config": {"label": "Đáp số", "format": "DECIMAL"}
"answer": {"value": "0.46"}
"answer_validation": {"match": "EXACT_DECIMAL"}
```

`answer.value` is a string in canonical decimal form: optional `-`, digits, optional `.` and digits. No `+`, no
thousands separators, no exponent, no trailing zeros (`"3"`, `"-12"`, `"0.46"`, not `"3.0"`, `"1,000"`, `"1e3"`).
The comparison is exact, so the prompt **must say how to round** (for example "làm tròn đến hàng phần trăm") when the
exact result is not a short decimal.

**CLOZE**: fill in numbered blanks. No `options` field.

```
"content_blocks": [{"type":"text","content":"... $u_5=$ (1) và $S_5=$ (2)."}]
"response_config": {"fields": [{"field_id":"u5","label":"(1) Giá trị của u5"}, {"field_id":"s5","label":"(2) Giá trị của S5"}], "max_length": 8}
"answer": {"accepted_values": {"u5": ["14"], "s5": ["40"]}}
"answer_validation": {"match":"EXACT_AFTER_NFC_TRIM","case_sensitive":true,"diacritics":"PRESERVE"}
```

`field_id` is lowercase (letters, digits, `_`, `-`, starting with a letter). Give answers for exactly the fields, 1-16
accepted spellings each, all different after trimming spaces, none longer than `max_length` (1-256). Matching is
exact: case and Vietnamese accents count. Labels are plain text without `<` or `>`.

**MATCHING**: match each row to one target. No `options` field.

```
"response_config": {"rows":[{"row_id":"r1","label":"sin x"}, ...], "targets":[{"target_id":"t1","label":"cos x","max_uses":1}, ...]}
"answer": {"assignments": {"r1":"t1","r2":"t2"}}
"answer_validation": {"match": "EXACT_ASSIGNMENT"}
```

Row and target ids are lowercase stable ids. Every row has exactly one target. A target may be used at most `max_uses`
times; the total capacity of the targets must cover all rows. Labels are plain text without `<` or `>`.

## PASSAGES (reading questions only)

```
"passages": [{"passage_id":"READ-PASSAGE-000001","title":"optional","content_blocks":[{"type":"text","content":"..."}]}]
```

and in each question that uses it: `"passage_ref": "READ-PASSAGE-000001"`. Write the passage once; every question
about it keeps its own prompt, options and answer. Each question must be answerable from the passage alone.

## QUALITY BAR

- One unambiguous correct answer. State every assumption the solution needs in the problem itself.
- Match the difficulty you were given. Vary the wording and the numbers across questions; do not repeat a problem.
- The explanation shows the key steps and ends with the answer.
- Numbers, units and notation must be consistent between the prompt, the options, the answer and the explanation.

## ONE COMPLETE EXAMPLE (a single multiple-choice question; yours will contain many)

```json
{
  "format": "tsa-question-set/1",
  "batch_id": "GEN-2026-11-16-A",
  "passages": [],
  "questions": [
    {
      "schema_version": "tsa-question/1",
      "question_id": "MATH-PROB-000001",
      "question_type": "SINGLE_CHOICE",
      "subject": "MATH",
      "topic": "PROBABILITY",
      "subtopic": "Classical probability",
      "difficulty": "EASY",
      "tags": ["dice", "classical-probability"],
      "content_blocks": [
        {"type": "text", "content": "Gieo một con xúc xắc cân đối, đồng chất có 6 mặt một lần. Xác suất để mặt xuất hiện có số chấm là số nguyên tố bằng"}
      ],
      "options": [
        {"option_id": "A", "content_blocks": [{"type": "text", "content": "$\\frac{1}{6}$"}]},
        {"option_id": "B", "content_blocks": [{"type": "text", "content": "$\\frac{1}{3}$"}]},
        {"option_id": "C", "content_blocks": [{"type": "text", "content": "$\\frac{1}{2}$"}]},
        {"option_id": "D", "content_blocks": [{"type": "text", "content": "$\\frac{2}{3}$"}]}
      ],
      "response_config": {"selection": "SINGLE"},
      "asset_refs": [],
      "explanation": [
        {"type": "text", "content": "Các số nguyên tố trong $\\{1;2;3;4;5;6\\}$ là $2;3;5$, tức 3 kết quả thuận lợi trong 6 kết quả đồng khả năng. Xác suất là $\\frac{3}{6}=\\frac{1}{2}$."}
      ],
      "answer": {"option_id": "C"},
      "answer_validation": {"match": "EXACT_SELECTION"},
      "scoring_config": {"policy": "BINARY_ALL_OR_NOTHING", "points": 1},
      "metadata": {"created_at": "2026-11-16T09:00:00Z", "updated_at": "2026-11-16T09:00:00Z", "status": "DRAFT", "content_version": 1}
    }
  ]
}
```

Now produce the JSON document for YOUR REQUEST. Output the JSON only.
