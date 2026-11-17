# First ten current-session LLM questions —2026-10-27

Scope: INT-003 continuation, root/current Codex; recommendations current Codex
session for bounded authoring/tooling, separate reused Codex agent for blinded
content critique. No paid API, model download, website expansion, full regression,
commit, push, merge or deployment. Starting uncommitted INT-003 and owner
AGENTS/research changes preserved. [Authority/proposal](../decisions/INT_003_MANUAL_LLM_STAGING.md).

## Actual content outcomes (not software-test metrics)

| Dimension | Observation |
|---|---|
| Provider/model status | VERIFIED: project .env/.env.local and known factory config locations absent; existing adapter is explicit command bridge. Ollama0.30.10 listed installed `richardyoung/qwen2.5-7b-instruct-abliterated:Q4_K_M` (4.7GB); owner chose manual-only, no inference dispatched |
| Actual authoring | Current Codex session authored an original passage and10 distinct questions; one question revised after first critique. Not fixtureOutput or provider API output; exact session model/revision unknown |
| Source | AI_AUTHORED_EXPERIMENTAL, project-original URI/version and source hash retained;985 whitespace segments,10 paragraphs. This is an approximation of Vietnamese length, not985 verified linguistic words. Illustrative33/35-degree figures and revised-question scenario are explicitly hypothetical |
| Intended profile | M1=4,M2=3,M3=3;8 single-choice,1 multiple-choice,1 true/false group; intended cognition is not calibrated difficulty |
| Deterministic checks |10/10 qualify as a complete bundle: schema/type/key, exact evidence offsets, unique IDs/exact duplicates, registered-code structure and intended quota checks. No correctness conclusion follows from quote matching |
| First blinded critic | Separate `/root/reading_discovery` read only exported critic prompt (no supplied keys/explanations). Agreed with all10 keys, flagged heat-08 cognition; its heat-06 quote inserted ellipses and failed exact-substring check. Both raw response and this defect retained |
| Revision and second critic | Root revised heat-08 to evaluate equal hypothetical before/after changes against a comparison site. Critic independently chose revised key B and accepted its M3 intention. All10 keys agreed; no ambiguity/entailment/key-disagreement flags. Critic now flagged heat-05 as M1-like rather than intended M2; first pass had accepted it, so judgment instability is explicit |
| Remaining quality flags |1 substantive cognition flag (heat-05);9 distinct weak-distractor cautions (heat-01–04,06–10). Thus10 questions have some critique flag/caution. These are fallible AI assessments, not human adjudication |
| Human review |0 human-approved. All output is DRAFT in private staging, not Bank-eligible stock |
| Canonical import |0 imported. BLOCKED_CONTRACT: unknown token usage and internal-only source permission do not fit v2. Staging identity/taxonomy mapping also needs registration. [Minimal proposal](../decisions/INT_003_MANUAL_LLM_STAGING.md) remains unapproved |

Model provenance: generator and critic are actual Codex sessions. Their exact model
identifiers are not exposed. Critic reported16:35/16:37 UTC with minute precision;
the `:00` declaration formatting does not claim verified seconds. Usage remains
null and UNVERIFIED. No provider reference, billing metadata or independent human
labels have been fabricated.

## Private artifacts

All material is under `.local/question-factory/heat-island-session/` (ignored local
data, private directories0700/files0600). Current owner view:

- `review-owner/review.html`: source, readable questions/options, private keys,
  explanations, exact evidence/rationale, critic decisions and per-item flags.
- `request/prompt.md`, `request/schema.json`, `request/source.txt`: complete reusable
  manual-chat generation prompt and strict output schema with exact evidence spans.
- `generation.json` / `generation-v2.json`: original and revised actual authored
  response; `declaration*.json`: declared model/interface/time and null usage.
- `critic-v1.json`, `critic-v2.json`, `critic-message-notes.md`: faithful semantic
  transcriptions of actual agent messages, not purported provider stdout bytes.
- `review-first-critic/`, `review-v2-pre-critic/`, `review-final/`, `review-owner/`:
  preserved staging checkpoints. First failed JSON-schema canonicalization left
  an empty `request-failed-schema/`; fixed by converting exported schema to plain
  JSON, without inventing any model result.

Revised generation raw hash:
`sha256:d4982e560926a087733221869f62f5e20199c54476433122350a3136d6382bd9`.
Generation prompt hash:
`sha256:400abb164aee5b26eaec1f81f5aae79420cbf6637ba015a09e0cf9a12f7429f4`.
Second blinded critic prompt hash:
`sha256:30b228efc40ed4e0e0f6e9facd9587b62c27d2508a10459aebb2b10016877692`.

## Directly related engineering verification

- `npm run test:factory:manual`: PASS26/26 (new manual9 + existing offline17),
  including schema/source export, explicit single-passage opt-in, null usage,
  internal permission without OWNED/publication promotion, raw-byte preservation,
  false evidence/quota/key/ID rejection, declaration hashes, blinded fields,
  critic/caution flags and escaped HTML/private public-root denial.
- Actual public `factory:reading:manual intake` command completed for the real
  revised response/critic, reporting10 checks passed,1 substantive flag,9 cautions,
  human0 and BLOCKED_CONTRACT. It performs no canonical Bank write.
- `node --check tools/question-factory/manual.mjs`, `git diff --check`: PASS.
- Local headless Chromium rendered the private file with no external resources;
  root visually inspected the resulting preview. Snap's private `/tmp` namespace
  made the first screenshot inaccessible from this process; using the authorized
  project-local screenshot target worked. No hosted/private-preview server started.

Only these related checks were run. No full PostgreSQL/website/contract regression,
production load test, scientific review, copyright certification or independent
code review is claimed for this continuation. The actual content critique is
separate from software verification and remains pending human disposition.
