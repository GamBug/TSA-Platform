# Offline Reading Factory experiment

Current owner packet2026-11-04: the same ten internally authorized urban-heat
drafts now have an append-only revision at
`.local/question-factory/heat-island-revision-2026-11-04/review-owner/review.html`.
[Actual revision/critique evidence](../reviews/RECOVERY_MANUAL_DRAFT_REVISION_2026_11_04.md).
Original source/history remain unchanged. Two actual fresh blinded AI critics
were used; the final critic agreed with10keys/intended cognition and returned no
flags/cautions. This is provisional AI feedback, not human approval/calibration.
DRAFT/human0/Bank0/API0 and unknown usage/internal-only permission remain. The
[private manual v3 transport](MANUAL_DRAFT_TRANSPORT.md) is now implemented and
reviewed; the real pilot still needs registered taxonomy and its exact approved
activation snapshot. Historical packets and their earlier contract-block reports
remain unchanged.

Current ten-question manual-chat continuation: [actual content outcomes and private
review paths](../reviews/INT_003_FIRST_MANUAL_LLM_BATCH.md). This is genuine current
Codex-session authoring, with no provider API call, unknown usage and pending human
approval. See the manual workflow below; earlier fixtures remain labelled fixtures.

## Single-passage manual chat workflow

The current pilot files are private under
`.local/question-factory/heat-island-session/`. Open `review-owner/review.html` in
your local browser for source, all10 questions/options/keys/explanations/evidence
and critic cautions. It is a static escaped file, with no scripts/external assets
or approval controls. Keep it outside the student website/public assets.

Actual source permission is INTERNAL_EXPERIMENT_AUTHORIZED. It is neither an
OWNED copyright claim nor scientific/publication approval. Exact model revision
and tokens are unavailable, so source/question declarations retain unknown values.

Export a new request (all output directories must be new):

```sh
npm run factory:reading:manual -- prepare .local/question-factory/heat-island-session/input.json .local/question-factory/heat-island-session/source-provenance.json .local/question-factory/heat-island-session/request-next
```

`request-next/prompt.md` contains the entire passage, exact evidence span inventory,
instructions and complete JSON schema. Copy it into the chosen chat interface and
save its JSON-only response. Copy `declaration-template.json` to a new declaration
file and enter the actual operator-declared model/interface/time. Keep unknown
revision null and usage null/UNVERIFIED. Do not reuse the current Codex declaration
for output from another chat/model or invent token counts. The staging operator
and taxonomy UUIDs must be mapped to real registered Bank identities before any
later canonical import; this tool does not claim they are registered.

Intake and deterministic validation of a supplied response:

```sh
npm run factory:reading:manual -- intake REQUEST_DIR OUTPUT_JSON DECLARATION_JSON NEW_PRIVATE_REVIEW_DIR
```

This saves exact input bytes before parsing, verifies declaration/prompt binding,
reuses `validateDraftOutput` for the ten-question4:3:3 bundle, and creates a private
review plus a blinded `critic-prompt.md`. Invalid output is retained with flags;
zero questions then qualify as a completely validated bundle, without claiming
every individual question failed. Quote matching never proves correctness.

For a separate critic, copy its prompt into a fresh conversation and preserve the
returned JSON and actual declaration using `critic-declaration-template.json`.
Then intake the same generation into another new review directory, adding
`CRITIC_JSON CRITIC_DECLARATION_JSON`. Optional final `CRITIC_NOTES_JSON` retains
faithfully transcribed weak-distractor cautions, separately from hard key/ambiguity/
entailment/cognition flags. Both outcomes remain DRAFT and human-approved count0.

The actual pilot's validated intake command is:

```sh
npm run factory:reading:manual -- intake .local/question-factory/heat-island-session/request .local/question-factory/heat-island-session/generation-v2.json .local/question-factory/heat-island-session/declaration-v2.json .local/question-factory/heat-island-session/review-owner-next .local/question-factory/heat-island-session/critic-v2.json .local/question-factory/heat-island-session/critic-declaration-v2.json .local/question-factory/heat-island-session/critic-quality-notes.json
```

**This is staging intake, not canonical Bank import.** Factory v2 cannot encode
unknown token counts or internal-only rights honestly. No package with synthetic
zeros/OWNED status is emitted. [Exact mismatch/minimal versioned proposal](../decisions/INT_003_MANUAL_LLM_STAGING.md)
is historical. The separately authorized [manual v3 route](MANUAL_DRAFT_TRANSPORT.md)
can admit internal-only private DRAFTs after registered mapping and exact activation
approval. Lawful rights and independent human review remain required for later
eligibility/publication. Do not treat private DRAFT intake or the HTML report as
human approval.

This is unofficial practice. The project chose 20 questions in 1,800 seconds,
two whole ten-question reading bundles, with intended cognition M1:M2:M3 = 4:3:3
per bundle (8:6:6 overall). Neither the layout nor the fixture cognition labels
establish HUST rules, calibrated difficulty or educational quality.

## Offline dry-run

Use the installed Node24.18 environment and existing dependencies. From the root:

```sh
npm run build
npm run factory:reading -- fixture-input /tmp/reading-input.json
npm run factory:reading -- dry-run /tmp/reading-input.json /tmp/reading-run
```

Both paths must be new. The second command creates clearly labelled original
engineering passages; it does not generate a model response. For operator content,
replace the `sources` in the input with exact Vietnamese text, immutable source
version UUIDs, source URI, attribution, registered skill codes and explicit rights
evidence allowing DISPLAY and GENERATE in VN or WORLDWIDE. `operatorId` and the
full immutable taxonomy payload must match the target Bank. Unknown fields, rights,
expired rights, unknown skills, unsupported interactions and incomplete quotas
fail closed. No credential is needed for dry-run. The deterministic template needs
at least ten sentence spans per passage; shorter passages fail explicitly. This is
a fixture-template limitation, not a TSA passage-length rule or live-provider limit.

The private run directory (0700, files0600) contains input, plan, canonical
`factory-package/2` draft export and report. Provider runs additionally preserve
each request/reservation, exact raw response bytes (base64 with byte length and
SHA-256), parsed usage and blinded critic result. Exports into the website public
asset directory are rejected, including through a symlinked parent. The same input
and configuration with the same completed directory replay exact persisted bytes;
changed input/configuration conflicts. An incomplete/uncertain run refuses automatic
redispatch so a timeout cannot silently consume another call. Operators must
reconcile that evidence before deliberately starting a new run directory/key.
This bounded executable does not implement weekly scheduling, multiworker leases,
automatic partial-run resume or production capacity accounting.

Vietnamese length uses `unicode-whitespace-segments/1`: count maximal non-whitespace
segments of the original unnormalized text, plus Unicode code points and UTF-16
code units. Segments roughly resemble syllables, not linguistic words or model
tokens; punctuation remains attached. Evidence uses exact zero-based UTF-16
`[start,end)` offsets and must equal the original substring. Matching evidence
does not prove entailment or eliminate ambiguity.

Near-match signals use an uncalibrated token-Jaccard heuristic. They are retained
in each affected question's private evidence as well as the run report, so the
canonical Bank import preserves the review flag. They never establish equivalence
or grant approval; existing independent equivalence review remains required.

Dry-run templates mark their model as `NO_LLM_FIXTURE`, use no generation-run UUID
or provider reference, and report zero provider tokens/cost because no provider
ran. Their assigned cognitive labels test quota plumbing; they are not validated
pedagogical classifications. All three existing interactions are exercised:
SINGLE_CHOICE, MULTIPLE_CHOICE and TRUE_FALSE_GROUP. Text-entry, matching and other
unsupported types are rejected rather than converted.

## Operator provider adapter

Discovery found provider-neutral generation/result contracts, but no configured
vendor API, model or credential in application source. Consequently this slice
does not guess a vendor endpoint or use credentials from another application.
`providers.mjs` supplies an explicit command bridge for an operator's configured
local/free provider. It launches only the configured absolute executable and
arguments, without a shell, with a minimal environment and only the explicitly
named credential variable. No model executable is discovered or invoked implicitly.

Run `npm run factory:reading -- run INPUT_JSON NEW_PRIVATE_DIR CONFIG_JSON` only
after configuring an adapter compatible with this protocol. Configuration is strict:

```json
{
  "schemaVersion": "reading-command-provider/1",
  "executable": "/absolute/path/to/operator-owned-provider-bridge",
  "args": [],
  "modelRevision": "operator-pinned-actual-revision",
  "adapterRevision": "operator-bridge/1",
  "execution": "FREE_NO_OVERAGE",
  "provenance": "LLM_PROVIDER",
  "credentialEnv": "TSA_READING_OPERATOR_CREDENTIAL",
  "operatorNoChargeAttestation": "Operator must replace this with their actual no-charge authorization and data-handling evidence.",
  "budget": {
    "maxCalls": 4,
    "maxInputTokensPerCall": 12000,
    "maxOutputTokensPerCall": 12000,
    "maxCostMicros": 0
  },
  "timeoutMilliseconds": 30000
}
```

This example is not an actual model configuration or permission to dispatch.
LOCAL_NO_CHARGE permits an explicitly configured local adapter without a credential;
FREE_NO_OVERAGE requires the named environment credential. Paid calls remain
prohibited; maxCostMicros must be zero. The operator must establish provider terms,
data permission and enforced free/local limits before use. Returned null cost is
retained as unknown, never represented as verified zero spend. Reported nonzero
cost or excess token usage fails the run and keeps its evidence.

The child receives one JSON `reading-command-request/1` on stdin and returns one
existing `ProviderResult` JSON object on stdout: `candidates`, nullable actual
`providerRunRef`, actual `modelRevision`, `usage` (inputTokens/outputTokens and
nullable costMicros), and COMPLETE/TRUNCATED/REFUSED `finishReason`. Generation
candidates match `DraftOutputSchema` in the tool. Each contains content,
interaction/key, explanation, registered skill, intended cognition, exact evidence
quote/offsets/rationale and a reason for every distractor (every statement for
true/false). Raw output is checkpointed before parsing. Source and model strings
are data, never shell commands or executable HTML/code. Invalid UTF-8 is rejected
after preserving the original bytes. Run `responseHash` identifies canonical parsed
JSON; the raw checkpoint separately hashes the exact stdout bytes.

The frozen transport requires actual input/output token counts. A provider that
does not supply these cannot be represented by inventing zeros: its bridge must
fail and retain evidence. Only cost has an explicit nullable unknown value.

The second, separately invoked call per passage is a blinded critic: it sees the
source, question content and interactions, without supplied keys/explanations.
It returns ten `{id,answerKey,unambiguous,reason,evidenceQuote}` candidates; a key
disagreement, ambiguity flag or quote absent from source blocks export. Same-model
agreement is fallible and still requires independent human review. No configured
provider means no critic call; that fact is explicit in fixture evidence.

## Bank review and website

The export has no approval field and uses the existing internal
`createFactoryImportService(...).importFactoryPackageV2(...)` capability. There is
no new web generation/import authority or review store. Import creates immutable
DRAFT versions. Reimport returns canonical receipts; changed package under the
same producer/batch conflicts. Imported rights evidence does not grant current
Bank rights. A manager must record current rights through the existing source
service, followed by exact-version validation, independent equivalence review,
author submission and independent reviewer action through the current Bank flow.

Normal runtime publication remains gated. This experiment does not unlock real
publication. The disposable demo may simulate separate synthetic staff identities
within the existing test-only publication scope, which is neither human review nor
a grant of rights for real material. It imports and exercises only labelled
fixtures and discards its private PostgreSQL database on shutdown.

The experimental catalog/admission is separately default-off. Enabling
`enableReadingExperiment` and registering an immutable exact-hash profile admits
only the20/1800 NEW_ONLY profile. It uses existing seeded assembly, rights,
duplicate/equivalence exclusions, immutable bundle/version snapshots and permanent
per-student assignment history. Shortage never triggers inference, reuse or quota
relaxation. Existing READING2/fixed/review/default behavior stays under its own
guards. Credentials, keys, explanations, model evidence and run artifacts remain
server-side; released explanations use the existing result boundary.

```sh
NODE_ENV=test LOCAL_SYNTHETIC_ONLY=true STUDENT_FIXTURE_DEMO=true npm run demo:factory:reading
npm run test:factory:reading
npm run test:factory:reading:browser
```

Use only the printed disposable URL and the existing synthetic candidate selector.
The full20-question journey is a technical test, not qualified human acceptance.
See the [dated verification record](../reviews/READING_FACTORY_EXPERIMENT_VERIFICATION.md)
for executed commands, actual outcomes, independent review and remaining gaps.
