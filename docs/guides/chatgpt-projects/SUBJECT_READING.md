# Subject file: READING — Tư duy Đọc hiểu (upload to the "TSA Reading" Project only)

`subject` is always `READING`. Id prefix `READ`. Read AGENT.md first; this file adds the subject details.

## What the section looks like

- The real section has 20 questions in 30 minutes. Cognitive levels M1:M2:M3 are 4:3:3. The public exam scheme
  describes Vietnamese texts of roughly 800-1,000 words on science, technology, economics, engineering, industry,
  agriculture, finance and banking, medicine and similar fields. (Source: HUST's published exam organization, as
  recorded in the project's research.)
- Every question is answered from the passage alone; outside knowledge must not be needed and must not change the
  answer.
- Interaction forms: single choice, multiple choice, Đúng/Sai statement groups, drag-and-drop (put words or ideas into
  blanks, order or match them), short answer entry.

## Topic codes (use exactly one per question)

| Code | Asks the student to |
|---|---|
| `MAIN_IDEA` | Find the main idea, the best title, the purpose of the text or a paragraph |
| `DETAIL` | Locate a stated fact, number or claim |
| `INFERENCE` | Draw a conclusion the text supports but does not state |
| `VOCABULARY` | Give the meaning of a word or phrase in context, or pick the word that fits a blank |
| `STRUCTURE` | Explain the role of a paragraph or sentence, the order of ideas, connectors |
| `AUTHOR_VIEW` | Identify the author's attitude, argument or evaluation |
| `EVALUATION` | Judge whether evidence supports a claim, find a weakness, compare two viewpoints |
| `DATA_IN_TEXT` | Read numbers or a table that belongs to the passage |

## Writing good Reading items (CREATE mode)

- **Write the passage yourself.** Use web search only to check facts for the topic (for example how a technology
  works or a real statistic with its source year); never copy or closely paraphrase an article. Invented figures are
  fine if the passage is clearly hypothetical; real-world figures must be correct.
- Passage length: 350-600 words for a two-question passage, unless the owner asks for the full 800-1,000 words.
  Use 4-6 paragraphs, a neutral academic register, correct Vietnamese spelling and punctuation, and paragraph breaks as separate `text` blocks.
- **Exactly 2 questions per passage**, testing different skills (for example one `DETAIL` or `MAIN_IDEA`, one
  `INFERENCE`, `AUTHOR_VIEW` or `EVALUATION`).
- The correct option is supported by a specific sentence; name that sentence or paragraph in the explanation
  ("Đoạn 3, câu 2 cho biết ..."). Each distractor is wrong for a reason you can point to in the text: too broad, too
  narrow, contradicts paragraph N, true in the world but not stated, reverses cause and effect.
- Avoid options that differ only in one word, and avoid "tất cả các đáp án trên".
- `TRUE_FALSE_GROUP`: 4 statements, each checkable against one place in the passage.
- `CLOZE` for a summary sentence with blanks the student fills with words from the passage: give every acceptable
  spelling in `accepted_values` and keep `max_length` small.
- Question ids differ from passage ids: `READ-G261122A-000001` for questions, `READ-GP261122A-000001` for passages.

## TRANSCRIBE notes

- Copy the passage exactly, paragraph by paragraph, one `text` block per paragraph. Keep line numbers or paragraph
  labels if the questions refer to them.
- Keep all of a passage's questions with it, however many there are.

## Example request lines the owner sends

```text
CREATE · 3 passages (6 questions) · topics: technology, medicine, agriculture · batch letter A
CREATE · 1 passage of 900 words · 2 questions: INFERENCE, EVALUATION · HARD · batch letter B
TRANSCRIBE · batch letter C · (pictures attached, in page order) · no answer key in the source
```
