# Subject file: SCIENCE — Tư duy Khoa học / Giải quyết vấn đề (upload to the "TSA Science" Project only)

`subject` is always `SCIENCE`. Id prefix `SCIE`. Read AGENT.md first; this file adds the subject details.

## What the section looks like

- The real section has 40 questions in 60 minutes. Cognitive levels M1:M2:M3 are 4:3:3. (Source: HUST's published exam
  organization, as recorded in the project's research.)
- It tests scientific thinking and problem solving, not memorised facts: a short scenario (an experiment, a
  measurement table, a described graph, a real-world problem in physics, chemistry, biology or everyday technology)
  followed by questions that require reading the data, reasoning about cause and effect, choosing a valid conclusion or
  calculating a value. Upper-secondary knowledge is enough; the scenario supplies anything beyond it.
- Interaction forms: single choice, multiple choice, Đúng/Sai statement groups, answer entry, drag-and-drop.

## Topic codes (use exactly one per question)

| Code | Covers |
|---|---|
| `PHYSICS` | Motion, forces, energy, electricity, waves, heat, optics, modern physics in context |
| `CHEMISTRY` | Reactions, stoichiometry, solutions, rates, equilibrium, organic basics, materials |
| `BIOLOGY` | Cells, genetics, physiology, ecology, evolution, health |
| `EARTH_ENV` | Earth science, climate, environment, energy resources |
| `DATA_ANALYSIS` | Reading tables and described graphs, trends, interpolation, units |
| `EXPERIMENT_DESIGN` | Variables, controls, hypotheses, validity of a conclusion, sources of error |
| `PROBLEM_SOLVING` | Logic and planning problems: schedules, rules, optimisation, puzzles with conditions |

## Writing good Science items (CREATE mode)

- **Scenario first, several questions each, as in the real test** (HUST 2026, Đợt 1: 8 texts with about 5 questions
  each). Put the scenario in `passages` (an introduction of several paragraphs: the phenomenon, the experiment or
  model, the method, plus `table` blocks of data) and write **5 questions per passage** by default (the owner may
  ask for 4 or 6). Never 2-question passages, and no standalone Science questions unless the owner asks.
- The questions of one scenario build on each other: read the data, explain a mechanism, predict a value, judge a
  conclusion or an experimental design, with the 4:3:3 EASY:MEDIUM:HARD mix.
- **Data is synthetic and consistent.** Invent the measurements, then check that every number obeys the physics or
  chemistry you describe (units, conservation, plausible magnitudes). Use web search to check constants and facts
  (for example a specific heat, a reaction product, a biological mechanism) and keep the constants in the scenario so
  the question does not depend on memory.
- Prefer a table of values or words for data. When a graph or apparatus drawing is really needed, draw it with Python
  (AGENT.md section 3.6): labelled axes with units, the exact values used in the question.
- Good question shapes: which conclusion the data supports; which change would test the hypothesis; predict a value
  between or beyond the measured points; which variable was held constant; compute a quantity from the table.
- Distractors: a conclusion the data does not support, a reversed relation, correlation taken as causation, a unit
  error, a misread row.
- `NUMERIC` answers come with units stated in the stem and a rounding rule ("làm tròn đến hàng phần mười").
- Chemistry: write formulas with LaTeX, for example `$\\mathrm{H_2SO_4}$` and arrows `$\\rightarrow$`. Reversible
  reactions use `$\\leftrightarrow$`; `\\rightleftharpoons` is not supported and blocks publication.
- `PROBLEM_SOLVING` items state every rule explicitly and have one provable answer; check it by listing cases.

## TRANSCRIBE notes

- A scenario shared by several questions is one passage; keep all its questions with it.
- Graphs and diagrams become `image_request` blocks (AGENT.md section 2.5). Data tables become `table` blocks.

## Example request lines the owner sends

```text
CREATE · 2 scenarios (10 questions) · PHYSICS, BIOLOGY
CREATE · 1 scenario · 5 questions · CHEMISTRY · equilibrium with a data table · HARD
TRANSCRIBE · batch letter C · (PDF attached) · key is printed after each question
```
