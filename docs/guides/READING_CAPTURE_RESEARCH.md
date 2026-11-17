# Offline Reading capture research

This is an unofficial, private structural research tool under INT-003-R. It derives
an authoring specification, not a copy of a question bank or training dataset.
No network, provider, shell adapter, database or student runtime is called. No
paid API, model download, Bank import or publication is involved.

## Run the original synthetic pilot

Use the existing Node24.18 installation; no installation or build is required:

```sh
node --test tests/ai/reading-research.test.mjs
node tools/reading-research/cli.mjs tools/reading-research/synthetic-manifest.json .local/reading-research/my-synthetic-pilot
```

Output directories must be new. The supplied fixtures are original engineering
examples, deliberately including missing answers and unsupported text entry.
They do not establish real TSA patterns. A generated example is already available
locally at `.local/reading-research/synthetic-pilot-2026-10-28/`.

## Supply a representative operator pilot

Manually save browser Ctrl+A text into UTF-8 `.txt` files. The tool reads only paths
listed explicitly in the manifest; it never enumerates a directory or downloads a
URL. A source URL is inert provenance. Keep files and the manifest in ignored
`.local/reading-research/intake/` or another private operator location. Do not place
third-party text in tracked fixtures, research documents or public assets.

Create a JSON manifest with one to three representative captures. Select different
page layouts, repeated/shared passages, interaction formats and visible-answer
states where available. A convenience sample:

```json
{
  "schemaVersion": "reading-capture-manifest/1",
  "operator": "actual operator identity",
  "files": [{
    "path": "capture-01.txt",
    "kind": "OPERATOR_CAPTURE",
    "source": "actual page URL or source description; manually captured date",
    "rightsStatus": "UNKNOWN",
    "rightsNotes": "Record actual evidence and limitations. No redistribution, publication, training or external LLM upload permission assumed."
  }]
}
```

Paths resolve relative to the manifest. Every file requires `kind`, `source`,
`rightsStatus` and `rightsNotes`. Rights states are UNKNOWN, REFERENCE_ONLY or
OPERATOR_DECLARED_PERMISSION; the last is not independently verified legal
permission. No capture content is executed or interpreted as instructions.
Files are limited to5MiB each and1,000 per batch (engineering bounds).

```sh
node tools/reading-research/cli.mjs .local/reading-research/intake/manifest.json .local/reading-research/pilot-01
```

## Review extraction before a batch

Compare every pilot question against its raw file: passage boundaries, exact
passage completeness, question association, option continuations and labels,
explicit answer markers and all omitted/unassigned lines. Record expected versus
observed passage/question/option counts, false boundaries, missing fields and
whether each format is supported in the review notes. A clean command exit proves
artifact creation, not extraction correctness. Resolve parsing problems before
approving the pilot; retain raw files and use a new output directory after changes.

Copy `pilot-review-template.json` to a new private review file. Enter the actual
reviewer and detailed notes; set `approved` to true only after this comparison.
This acknowledges extraction quality only, never rights, content correctness or
Bank approval. A batch of more than three files requires this review and must
include the exact reviewed pilot files (matching raw hashes):

```sh
node tools/reading-research/cli.mjs .local/reading-research/intake/batch-manifest.json .local/reading-research/batch-01 .local/reading-research/pilot-review.json
```

This is operator attestation, not independently authenticated review. Keep the
pilot to one-to-three files even when the later batch is larger. Use a fresh pilot
when layouts change. No real operator capture was provided in the implementation
session; actual-source quality remains REQUIRES_VERIFICATION.

## Artifacts and privacy

- `raw/N.txt`: exact input bytes, including CRLF/BOM; SHA-256 and byte length are
  recorded. Invalid UTF-8 stays preserved with an explicit rejection flag.
- `manifest.json`: exact parsed declarations, not verified source rights.
- `extraction.json`: private original passages, questions/options, explicit answer
  observations, raw line spans, removed/unassigned lines and analytical proposals.
- `summary.json`, `report.md`, `taxonomy.json`, `generation-guide.md`: derived
  structural analysis without captured text/excerpts, keys or source addresses.
- `pilot-review-template.json` and optional `pilot-review-used.json`: review evidence.

Runs live exclusively under `.local/reading-research/`, already Git-ignored.
New directories use0700 and files0600; symlinked output components and overwrite
are refused. Runs are local private files, not an encrypted vault. Use appropriate
local account storage. Inspect `git status --ignored` before sharing artifacts.
Delete a run directory manually when its retention purpose ends. Never upload
source text to an external model without separate explicit authorization; this
CLI has no upload operation. Derived reports also need disclosure review.

## Parsing rules and limits

Version `reading-capture/1` recognizes explicit English/Vietnamese passage headings
such as `Passage 1`, `Bài đọc 1`, `Văn bản`, `Đọc văn bản sau:`; questions such as
`Câu 1:`, `Câu 1` or `Question 1.`; A–H/a–h option labels inline or on separate
lines; `Đáp án đúng:`/`Correct answer:` letter lists or full labelled true/false
maps. Continuation lines stay with their active block. Inline heading content is
preserved and flagged. Source explanation lines stay as raw spans; no explanation
or evidence is generated. Every passage association requires review because a
lost heading in Ctrl+A text can silently hide a new passage.

Exact navigation lines are removed before content blocks; recognized timers and
progress counters are removed with rule IDs and original spans. UI-like lines
inside content are conservatively retained and flagged rather than silently
deleting possible passage/answer text. Arbitrary site-specific navigation,
question grids, columns, images, hidden CSS correctness, OCR and unsupported
boundaries require manual review or a future tested parser rule. Do not edit raw
captures to conceal a parser failure. Text selected by the student, checkmarks,
answer colours or multiple conflicting correct-answer markers are not inferred
keys. Missing fields remain unknown. Formatting and answer semantics need manual
verification; even explicit correct-answer text is an unverified observation.

Offsets are zero-based UTF-16 `[start,end)` into the decoded original text, with
one-based line numbers. Raw bytes have a separate hash. Passage duplicate grouping
uses NFC plus collapsed whitespace, with exact hashes also retained. It detects
repeated text, not semantic similarity or equivalent questions. Counts include
capture occurrences; repeated pages do not establish independent observations.
Vietnamese whitespace segments are not linguistic words or model token counts.

Interaction, skill and cognition proposals use deterministic lexical cues, with
low/unknown confidence and explicit alternatives. No calibrated probabilities,
entailment, difficulty or distractor intent is claimed. The tool measures lexical
overlap, absolute/negation cues and option/stem lengths; semantic distractor
construction remains unknown. Generic taxonomy patterns are ASSUMPTION, not
SUPPORTED_BY_RESEARCH or representative dataset findings. No minimum file count
alone establishes representativeness; document sampling coverage and stabilize
manual extraction quality before assessing frequencies.

## Relationship to existing Factory and Bank

The tool uses the existing SINGLE_CHOICE/MULTIPLE_CHOICE/TRUE_FALSE_GROUP names,
M1/M2/M3 vocabulary and Unicode whitespace/UTF-16 conventions. Research output is
intentionally separate from `question/1` and Factory v2: missing keys, uncertain
labels and unknown rights cannot satisfy those contracts. Reusing canonical import
validators here would either reject research observations or invite fabricated
fields. No contracts or validators are weakened. For separately authorized new
original content, the generated guide points to existing DraftOutputSchema,
exact-evidence validation and independent human Bank/publication gates. It is not
a generation command and does not import captures into Bank.

## Why dev:b0 does not show Reading20

VERIFIED by source inspection and direct normal-handler probes:

| Entry point | Runtime/data | Reading20 availability |
|---|---|---|
| `npm run dev:b0` | `apps/practice-prototype/server.mjs`, default `createMockApiService`, port4173 | No fixture DB/profile registration or persistent student API |
| `npm run dev:track-b` with documented local flags | Retained local PostgreSQL services | Does not seed eligible Reading20 stock or enable it by default |
| Guarded `npm run demo:factory:reading` | Disposable fixture database,20 original synthetic questions, two10-question bundles,1800 seconds | Exact registered profile and `enableReadingExperiment: true` |

`main.js` uses persistent transport only for `?student=postgres`. Appending this
query to B0 does not create PostgreSQL services, eligible stock or the experiment
profile; persistent API requests still return404. Reading20 also requires the
exact private profile registration, complete eligible bundles and the explicit
runtime flag. A visible frontend card alone cannot satisfy those conditions.

The smallest safe exposure is the **existing separate labelled launcher**, with
no modification to the normal server, catalog defaults or real publication:

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:factory:reading
```

It requires the existing installed dependencies/build and local PostgreSQL test
harness prerequisites in the [Factory guide](READING_FACTORY_EXPERIMENT.md).
Open its printed disposable URL ending `/?student=postgres` (not port4173 unless
that is actually printed), select synthetic candidate A and the20-question
Reading profile. The launcher prints `DISPOSABLE_SYNTHETIC_ONLY`, no live LLM or
human approval, and synthetic publication scope. Ctrl+C tears down its database.
Its synthetic review/publication path is isolated test machinery, never permission
to publish operator captures or the prior manual LLM drafts. No demo/runtime code
change is needed for this diagnosis. This session did not rerun the20-question
browser journey; prior [verification](../reviews/READING_FACTORY_EXPERIMENT_VERIFICATION.md)
remains separately attributed.
