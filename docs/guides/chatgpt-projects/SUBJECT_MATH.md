# Subject file: MATH — Tư duy Toán học (upload to the "TSA Math" Project only)

`subject` is always `MATH`. Id prefix `MATH`. Read AGENT.md first; this file adds the subject details.

## What the section looks like

- The real section has 40 questions in 60 minutes, about 90 seconds per question, on a computer. Cognitive levels
  M1:M2:M3 are 4:3:3. (Source: HUST's published exam organization, as recorded in the project's research; public sample
  questions are the style reference.)
- Content follows the Vietnamese upper-secondary curriculum (lớp 10-12). Questions test reasoning and quick
  calculation, not long proofs: a short situation, one clear question, numbers chosen so a student can finish without a
  calculator in reasonable time.
- Interaction forms: single choice, multiple choice, Đúng/Sai statement groups, answer entry (numeric), drag-and-drop.

## Topic codes (use exactly one per question)

| Code | Covers |
|---|---|
| `ALGEBRA` | Equations, inequalities, systems, polynomials, absolute value |
| `FUNCTIONS` | Function properties, graphs read from a description or table, monotonicity, extrema, asymptotes |
| `CALCULUS` | Derivatives, applications of derivatives, antiderivatives, integrals, area and volume |
| `EXP_LOG` | Exponents, logarithms, exponential and logarithmic equations, growth and interest models |
| `SEQUENCES` | Arithmetic and geometric sequences, sums, recurrences |
| `TRIGONOMETRY` | Trigonometric values, identities, equations |
| `GEOMETRY_PLANE` | Plane geometry, coordinates in the plane, vectors, lines, circles, conics |
| `GEOMETRY_SPACE` | Solid geometry, distances, angles, volumes, coordinates in space |
| `COMBINATORICS` | Counting, permutations, combinations, binomial theorem |
| `PROBABILITY` | Classical and conditional probability, expected value |
| `STATISTICS` | Mean, median, mode, variance, grouped data, reading tables |
| `COMPLEX_NUMBERS` | Complex numbers (only when the source uses them) |
| `APPLIED_MATH` | Word problems: money, motion, optimisation, rates, real-life modelling |
| `LOGIC_NUMBER` | Number sense, divisibility, parity, logical reasoning with numbers |

## Writing good Math items (CREATE mode)

- One idea per question. State every assumption ("cân đối, đồng chất", "làm tròn đến hàng phần trăm").
- Distractors come from real mistakes: a sign error, forgetting a case, a wrong formula, an off-by-one count.
  Every distractor must be a value a student could actually reach.
- `NUMERIC` answers should be integers or short decimals. Say how to round when the result is not exact.
- `TRUE_FALSE_GROUP`: 4 statements (a-d) about one function, figure-free situation or data set; mix true and false.
- `CLOZE` for "điền vào chỗ trống" with 2-3 short numeric blanks; `MATCHING` for pairing expressions with values.
- In CREATE mode a geometry or graph question must be fully solvable from the text: give coordinates or a table of
  values instead of a drawing.
- Prefer `SINGLE_CHOICE` (about 60% of a batch), then `TRUE_FALSE_GROUP`, `NUMERIC`, `MULTIPLE_CHOICE`, and an occasional
  `CLOZE` or `MATCHING`.

## Example request lines the owner sends

```text
CREATE · topic CALCULUS · 10 questions · default 4/3/3 mix · batch letter A
CREATE · topic PROBABILITY · 8 questions · only SINGLE_CHOICE and NUMERIC · all MEDIUM · batch letter B
TRANSCRIBE · batch letter C · (PDF attached) · the answer table is on the last page
```
