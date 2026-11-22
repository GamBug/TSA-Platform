# Architectural decisions and open questions

## Transcribed questions in the practice pool — 2026-11-22

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-22.
Evidence: the owner asked for ChatGPT Projects with a mode that turns their pictures and PDFs into question files; when
asked whether transcribed questions should join the real 40/20/40 test or stay separate, answered "keep them separate,
change the inbox."

1. **Same separate pool.** Transcriptions go through `npm run questions:inbox` into the practice pool of 2026-11-20 and
   never feed the full simulation or the standard section tests.
2. **Truthful provenance.** The inbox treats a file whose `batch_id` starts with `SRC-` as a transcription: its source is
   titled "Corpus transcription <folder>/<file>", origin `EXTERNAL`, with a `LICENSED` display rights record citing the
   owner's 2026-11-11 corpus attestation. The "original work" `OWNED` record of 2026-11-20 is never applied to it. Other
   files keep the 2026-11-20 behaviour. The owner attests that transcribed material is covered by the corpus permission.
3. **Keys.** Source keys are authoritative (2026-11-09). Keys ChatGPT solved are tagged and reviewed by the owner before
   publication, as for every AI-written key. Guide: [ChatGPT Projects](../guides/chatgpt-projects/README.md).

## Real-length section tests; three tests plus the full test — 2026-11-21

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-21.
Evidence: "just 3 test seperate test gate Math, Reading and Science and can choose Full test 40/20/40; students have more
space to reading questions"; answers "Real exams length" and "remove, just only 3 gate"; after being told this changes the
approved 4/2/4 catalog rule in the database, chose "Do the migration now".

1. **Section tests at the real length.** The single-section practice of the demo becomes Math 40 questions in 60 minutes,
   Reading 20 in 30 and Science 40 in 60, the same counts and times as the sections of the full test
   (`FULL_SIMULATION_SECTIONS`). The short 4/2/4 sets are no longer offered by the demo launcher.
2. **Contract change.** The frozen MVP rule (catalog and personal allocation accept only 4/2/4) stays as it is. Migration
   `034_section_tests.sql` adds a separate profile, recognised by `tsa.section_test_config`: one section with the real
   count and time, section id `<section>-section-test`, no quotas. The student catalog pages and
   `tsa.assembly_commit_personal` accept it in addition to the frozen rule. The server mirror is `parseSectionTestConfig`
   (`src/modules/assembly/practice-profiles.mjs`); a Reading section test is not treated as a Reading experiment request.
3. **Migration impact.** The demo applies the migration to its disposable copy at every start, so the public server needs
   only a code release. The private Bank (`.local/track-b`) receives it at the next owner command that migrates, after
   that command's backup. The migration only replaces three function bodies and adds one function; no table or row changes.
4. **Student app.** The page offers only the three section tests and the full test. Numeric and cloze/matching practice are
   not linked any more (the server still creates them; their old links open the section tests). The ChatGPT practice pool
   of 2026-11-20 is unchanged: a pool section with 40 (Reading 20) published questions would add its own "luyện thêm" test.
5. **Reading space.** During a test the question grid can be hidden on wide screens, the question area is wider, and a
   passage sits beside its question from 1024 px when the grid is hidden.

## ChatGPT practice pool and question inbox — 2026-11-20

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-20.
Evidence: the owner asked how to generate questions in three ChatGPT web Projects (Math, Reading, Science) and "just copy
paste into true folder and this web program could auto update the question", then answered "yes build the inbox command,
separate practice pool."

1. **Separate pool.** ChatGPT-written originals go into their own taxonomy version ("TSA practice pool - ChatGPT originals
   v1"). The demo offers them only as extra section, numeric and cloze/matching practice named "— câu hỏi luyện thêm".
   They never feed the full simulation or the standard practice ("Synthetic items are never substituted" of 2026-11-18 stays).
2. **Rights.** Each pasted file is registered as its own source version, origin `OWNED`, with an `OWNED` display rights
   record stating that it is an original written for the owner with ChatGPT. The 2026-11-11 corpus attestation is never
   applied to these sources. `bank:owner-publish` accepts "Practice original" sources alongside corpus sources.
3. **Review stays manual.** The inbox imports DRAFTs only. Publication remains the owner's confirmed action after review
   of every key, as required for AI-written questions on 2026-11-18. Guide: [ChatGPT question inbox](../guides/CHATGPT_QUESTION_INBOX.md).

## Source credit and one local start command — 2026-11-19

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-19.
Evidence: the owner first proposed "from online questions, questions don't have copyright", then, after being
told that line asserts a legal claim, chose "switch to safer non-profit wording".

1. **Source credit.** The student-visible `DEMO_UNI_SOURCE_CREDIT` is "Questions collected from public online
   sources, used non-profit." It makes no copyright or permission claim beyond the 2026-11-11 non-profit
   corpus attestation. It closes the credit exclusion recorded on 2026-11-16.
2. **One local start command.** `npm start` builds the React student app and runs `demo:uni` with this credit
   as its default; an exported `DEMO_UNI_SOURCE_CREDIT` overrides it. `demo:uni` itself still refuses to start
   without the variable, and the public server keeps its own value in `/etc/tsa/demo.env`, which this entry
   does not change.

## Science from captures, twins keep one, all usable questions — 2026-11-19

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-19.
Evidence: "fill all Science from the captures. if it's twin, keep only 1."; "solve Math&Reading twin also, just keep 1.
analyze all questions, could add all to the bank, 40/20/40 test gonna work as I remember >100 questions of each field."

1. **Science** is filled wholly from the owner's three HTML capture folders; the 16 PDF-derived Science pool items are dropped.
2. **Twins keep one.** Where two questions have identical content, the pair is confirmed as one equivalence group
   (`bank:owner-publish --keep-one-of-twins`): both immutable versions stay in the Bank, but no attempt can contain both.
   This applies to the Math and Reading copies made for the combined taxonomy and to any capture twin.
3. **All usable questions** are added to the combined taxonomy, not a 40/20/40 subset, so more than one test can be assembled
   without repeats. Held back, with reasons in the private selection record: Math items excluded by an audit or correction,
   with a key disagreement or a human-review flag, with TeX the exchange format cannot represent, or with images; Science
   passages that need more than two distinct images, depend on a figure that the capture lacks, or have unkeyed pages.
4. Keys of captured Science questions are the page's own revealed keys (corpus keys remain authoritative, 2026-11-09); no explanations exist,
   so the placeholder explanation is used until the owner supplies better.

## Public demo launch and real full simulation — 2026-11-18

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-18.
Evidence: "Wanna completed demo and ready to public on live url in 24th November 26"; "we gonna need
enrich our ques bank. an complete 40/20/40 test is esential."; selected answers "Guests, staff off",
"Both" (Science source), "New combined taxonomy", "1 complete test"; "my cousin has VPS … He tell this
evening he gonna give me access." Plan: [public demo launch](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261118-1305-public-demo-launch/plan.md).

1. **Public visitors** sign in as one-click synthetic guests (one guest per browser, no personal data).
   The staff workspace is not reachable on the public URL; staff work stays on the owner's machine.
2. **Real full simulation is required** (supersedes [no full simulation — 2026-11-11](#university-demo-scope-no-full-simulation--2026-11-11)):
   at least one complete 40 Math / 20 Reading / 40 Science test without repeated questions, from
   published real content only. Synthetic items are never substituted.
3. **Combined taxonomy.** Register one new taxonomy version covering Math, Reading and Science and import
   the simulation pool into it as new DRAFT questions. Existing questions, versions and taxonomy versions
   stay unchanged. No database rule change is authorized.
4. **Science enrichment.** Owner-supplied Science files are imported first; any remaining gap is filled
   with original AI-written Science passages and questions produced through existing subscriptions (no
   paid API). Every AI-written question needs validation and the owner's individual approval before
   publication. Publication of any question remains the owner's action.
5. **Hosting.** A VPS provided by the owner's relative (access expected 2026-11-18 evening). Deployment
   to that server of the student-only public mode, with published items only, is authorized for the demo
   period. Existing services on that server must not be disturbed. Pushing to the Git remote is not
   authorized by this entry; the domain is still open.

## Question correction, portable format and image library — 2026-11-16

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-16.
Evidence: the owner's brief to act as lead architect and engineer for the question bank, asking to
repair the five Math questions flagged by the 2026-11-15 audit "rather than automatically
quarantine them", to define one versioned question format, to build a reusable image library, a
portable AI-generation package and a blind answer-verification workflow, and to fix the misleading
"resumed" notice. Source attribution, licensing and `DEMO_UNI_SOURCE_CREDIT` were explicitly excluded.

1. **Corrections of published questions.** Corrections never edit a version. A corrected version is
   created through the author route and approved on the owner connection with every publication check
   (`npm run bank:correct`); a version that cannot be repaired confidently is quarantined with the
   reason `NEEDS_MANUAL_REVIEW`. This authorizes the five named items and the one duplicate pair only.
2. **Verification-derived corrections are not authorized.** The owner asked that answers not be changed
   silently from model output. Items disputed by the blind verification pass are recorded in the private
   audit artifacts and need an explicit owner confirmation before they are applied.
3. **Exchange format and importer.** `tsa-question/1` maps onto question/1, /2 and /3. Imports create
   DRAFTs only; they never submit, review, approve or publish, and never create or change sources or rights.
4. **Image library.** Additive registry over the existing asset versions; assets are never deleted.

Details and evidence: [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/claude-261116-0242-question-bank-architecture.md).

## Math cloze and matching intake — 2026-11-11

Approval identity: human project owner in this Codex conversation, Asia/Bangkok, 2026-11-11.
Evidence: “Ok start with Cloze/matching ques. no need subagents, I am currently test usage
single-agent vs lead-subagents.” This accepts implementation of the previously proposed Math
intake, owner publication support and university demo practice for the 25 deferred captures.

The current Codex session is the sole implementer. Reuse question/3, blueprint/4, practice-binary-v3
and /api/v4; add a separate private Math factory/4 profile while preserving the Reading profile.
Inspect all 25 captures, import only complete explicitly keyed questions as unpublished DRAFTs after
a backup, and record overlapping source or image blockers. Preserve visible matching choices; when
choices are missing, apply the [captured-correct-text adaptation policy](#cp4-derived-matching-drafts--2026-11-09), with explicit
bounded reuse and owner review. Symbolic cloze keys are transcribed into declared keyboard notation;
the existing exact-text comparison remains unchanged and makes no algebraic-equivalence claim.
No retained question approval, publication, commit, delegation or paid provider call is authorized.
Implementation and actual verification are tracked in the [Math plan](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261111-2045-math-cloze-matching/plan.md).

## University demo scope: no full simulation — 2026-11-11

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-11.
Evidence: “Section and topic practice enough...”, answering the question whether to unify the Reading,
Math and Science taxonomy versions so a full 100-question simulation could be offered.

For the university demo, section practice and topic practice are sufficient. The full simulation is not
required, and no shared taxonomy or re-import of the published Reading items is authorized. The
full-simulation code stays in place and still runs against synthetic rehearsal stock. Revisit only if the
owner later asks for a real full simulation.

## Corpus permission attestation and owner publication — 2026-11-11

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-11.
Evidence: “I don't wanna show my personal email, that's my right, right? I will take responsibility
of this. Just keep in mind that it is allowed, then process.” This followed the CP6 finding that no
item can reach students because the retained workspace has no approval path and the corpus sources
have no rights record.

1. **Corpus rights: owner attestation.** The owner attests that the source of `TSA_Example_Questions/`
   permits non-profit use, and accepts responsibility for that statement. The owner keeps the written
   evidence privately and declines to disclose the grantor's contact details; agents must not ask for
   them or store them. This replaces item 2's REQUIRES_VERIFICATION status with
   **OWNER_ATTESTED** for this demo. Rights records cite this entry, not a document. The conditions of
   item 2 below (non-profit, source credit, no HUST affiliation claim) still apply.
2. **Owner publication path (CP7).** The owner authorizes building an owner-only approve-and-publish
   path for the retained Bank, recording the attested rights on corpus source versions, and importing
   the verified Math and cloze/matching DRAFTs into the retained Bank after a backup. Agents build and
   test the tools on disposable databases. Agents never approve items: approval stays an explicit owner
   action. Existing gates (content validation, delivery checks, rights, equivalence, author ≠ approver)
   are unchanged.

## CP4 derived matching DRAFTs — 2026-11-09

Approval identity: human project owner in this Codex conversation, Asia/Bangkok.
Evidence: “ok approve. resume cp4”, followed by the explicit policy selection:
“Derive targets from explicitly captured correct texts; retain as DRAFTs for owner review”.
Scope: resume the [CP4 card](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261108-1553-codex-autonomous-demo/cp4-cloze-matching.md),
using only explicitly captured correct texts to derive missing matching target choices.
Mark the derived pool as an adaptation requiring owner review; do not claim fidelity to the
uncaptured original pool or invent distractors, answers or accepted variants. Use an explicit
bounded reuse rule that allows the captured key, without asserting an original source rule.
All imports remain private DRAFTs. Approval, publication and rights gates remain unchanged.
The owner subsequently selected “Import the 78 keyed DRAFTs; keep 22 deferred”. This
authorizes partially keyed passage groups: preserve the ten shared passages, import only
explicitly keyed captures, and report the 22 true/false captures without inferred keys.
The owner also approved the previously proposed four-file documentation commit; subsequent
implementation commits still require a concrete grouping plan and the owner's `ok`.
Initial blocker evidence: [report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1958-cp4.md).

## CP3b revised Math ingestion authority — 2026-11-09

Approval identity: human project owner in this Codex conversation, Asia/Bangkok.
Evidence: “I approve the 2026-11-09 revision in cp3-corpus-ingestion.md, including the additive Math import path.”
The owner also requires 20-item resumable batches, a clean quota stop/report, and reuse of
CP3a corpus profile/verifier patterns. Scope is the revised CP3 card under the leader prompt;
source keys, private DRAFT state and existing approval/publication gates remain unchanged.
The initial [blocker report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1636-cp3b.md) identified the shared
v3 parser/builder outside the earlier allowlist. The owner subsequently replied “Yes, approved”,
expanded the card to the existing import pipeline and added the leader prompt's unlisted-files rule.
The owner expressly directed committing those two edits with the implementation and continuing
CP3b to its exit criteria. This authorizes additive shared parser/builder, namespace, admission,
preparation, verification and regression changes while preserving Reading behavior and tests.
The eighty-item selection is verified in a backed-up disposable database; this is not retained-bank
activation or permission to approve/publish content.

## CP3a retained import — 2026-11-09

Approval identity: human project owner in this Codex conversation, Asia/Bangkok.
Evidence: the owner requested import of the 100 verified CP3a Reading DRAFTs into the
retained database used by `npm run dev:track-b`, a backup before changes, a local commit
including the pending card/decision edits, and startup of the staff workspace.
Scope: `.local/track-b`; private operational artifacts and fresh, per-bundle activation
configurations under `data/corpus-ingest/cp3a-2026-11-09/retained-2026-11-09/`.
The operator pins each exact activation and canonical configuration path there before
coordinator admission; disposable verification pins are not reused. Register the additive
Reading taxonomy as needed and use the registered author account, separate from reviewers.
Source keys remain authoritative under the 2026-11-07 direction, item 6. Omit all blind-solve
answers, disagreements, ambiguity and evidence flags from the retained import review context.
Keep source captures and the prior verification evidence unchanged. All 100 items stay DRAFT;
no approval, publication or rights grant is authorized. The requested dev server remains
running for owner review at session end. No network, paid API or remote Git operation.
Execution, backup path and retained activation evidence: [import report](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1615-cp3a-import.md).

## CP3a corpus transport compatibility — 2026-11-09

Approval identity: human project owner in this Codex conversation, Asia/Bangkok.
Evidence: after the [provenance blocker](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/codex-261109-1342-cp3a.md),
the owner directed: “BRO! I gave u full permission. finish CP3a at any cost!”
This authorizes the additive corpus Reading transport, parser/builder/coordinator compatibility,
focused tests and disposable local verification needed for the approved 100-DRAFT target.
Existing manual AI transport remains compatible. Source captures remain read-only; no missing
keys are inferred. Publication, content approval, network, paid APIs and remote Git remain excluded.
Implementation design: separate `corpus-reading-draft/1` within private `factory-package/3`,
with `CORPUS_IMPORTED` source authorship, `DETERMINISTIC_CORPUS_EXTRACTION` run kind and
`IMPORTED` question/provenance origin. The raw evidence remains bound and reconstructed.
Corpus cognition is provisional M1, explicitly flagged for owner classification; no fabricated
4/3/3 quota, distractor rationales or source explanation is asserted. Existing AI quota stays strict.
Verification requires 100 DRAFTs in ten stimulus groups, no reviews/rights/eligibility, exact
replay, blind triage, privacy/content checks, unchanged source hashes and ten private samples.
The database is disposable and removed after verification; retained private packages and receipts
allow a later separately authorized import. Owner approval/publication remains a later gate.

## University-demo product direction — 2026-11-07

Approval identity: human project owner in a Claude Code conversation, Asia/Bangkok, 2026-11-07.
The owner directed AI agents to record these decisions. Planning context:
[readiness review](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/reports/review-261107-2114-tsa-product-readiness-gap.md).
These decisions set direction only. They do not implement anything, and the frozen contracts stay
as they are until versioned additions are reviewed.

1. **Target.** The target is a university project demo. The architecture must stay able to grow
   into a full product, so the existing boundaries remain: versioned contracts, the Bank as the
   only content source, and no live AI during exam creation, delivery or grading. Hosting and
   production auth are optional for the demo.
2. **Corpus rights (owner-asserted).** The owner states that the source of `TSA_Example_Questions/`
   allows use for non-profit purposes. Status: **REQUIRES_VERIFICATION**. The grantor identity,
   date, channel and written evidence have not yet been recorded. Before any corpus-derived item is
   published, private evidence must be stored and referenced here. Conditions: the site stays
   non-profit (no ads, no paid tier), it credits the source, and it makes no HUST affiliation
   claim. The owner will also supply cropped Science-section items. Those items need the same
   rights record.
3. **Review capacity.** The owner is the single human approver, assisted by AI agents. Student
   helpers are optional. The existing invariant stays: an author never approves their own version
   (QUESTION_SCHEMA workflow). Corpus items are authored by a source-import account and AI drafts
   by an AI-drafter account, and the owner approves both. This amends the MVP_SCOPE requirement for
   "two different humans" for this demo only. AI checks such as an independent blind solve are
   triage evidence and are never approval.
4. **Score display.** Show the number of correct answers per section and in total, using the
   existing binary practice scoring. It is labelled unofficial practice. A different scoring model
   may come later as a new versioned scoring policy.
5. **Full simulation timing.** Each section has its own timer (60/30/60 minutes, 40/20/40
   questions), and students may go back to earlier sections. Selected reconciliation: a
   server-authoritative per-section time budget that runs only while that section is open
   ("chess clock"). Returning to a section resumes its remaining budget. A section whose budget is
   exhausted becomes read-only, and the attempt ends when every budget is exhausted or the student
   submits. This is a product choice, not a claim about official HUST rules. It needs a versioned
   multi-section attempt design with review before implementation.

6. **Corpus keys are authoritative (2026-11-09).** The owner states that the source keys are
   correct and that some item formats are simply hard for AI to read. AI blind-solve disagreements
   do not create doubt, flags or exclusions for corpus items. Keep the source key. For image items,
   blind solves serve only to detect transcription misreads against the image. The owner's
   approval remains the human gate.

## Track B modernization local execution authority — 2026-11-06

Approval identity: human project owner in this Codex conversation, Asia/Bangkok. Durable evidence: the owner supplied the full Track B Development & UX/UI Modernization mission and then replied “full permission. work non-stop.” Scope covers local compatible backend/frontend implementation, dependency use, disposable database verification and bounded supported delegation. It excludes force-push, merge, publication/deployment, production databases, unrelated deletion, history rewrites, paid external services and silent breaking contracts. [Execution contract](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261106-1019-track-b-modernization/plan.md).

This authorizes additive topic-practice interfaces alongside existing APIs; existing attempt ownership, eligibility, grading, disclosure and immutable taxonomy/history remain stable. It does not grant content rights, qualified human approval or official HUST affiliation. Existing independent-section architecture remains authoritative; entry cards must describe actual configured offerings rather than imply a combined official examination.

## RECOVERY-028 owner authorization to resume local engineering — 2026-11-05

Approval identity: human project owner in this Codex conversation. Evidence: the
owner replied **“full permission. work non-stop.”** directly after the blocked
recovery report identified the three concrete reviewed engineering proposals.
Recorded November 5, 2026, Asia/Bangkok. This changes the earlier unanswered
engineering disposition; historical PROPOSED/pending records below describe their
earlier state, not the current local implementation authority.

Scope: autonomous zero-cost local implementation and verification of the reviewed
manual DRAFT transport, media delivery and Factory planner proposals. Root selects
manual transport first and the proposal's storage-compatible Bank EXTERNAL import
classification: it records transport across the Factory/Bank boundary, while
immutable evidence records actual AI authorship and unverified rights. It is not
an assertion of third-party authorship, ownership or publication permission.

The approved design revisions are:

- [Manual transport](RECOVERY_MANUAL_TRANSPORT_PROPOSAL_2026_11_04.md),
  SHA256 `e3568eaaa881fb96d147672a4807db82cb3bc68476d09ca97f64f69407cd5f0a`.
- [Media delivery](RECOVERY_MEDIA_DELIVERY_PROPOSAL_2026_11_02.md),
  SHA256 `c5037fe2fa535364ef16e5edf4a4358bbc7d9a196c0fb07f4a2ae9126b3e6d9b`.
- [Factory planner](RECOVERY_FACTORY_PLANNER_PROPOSAL_2026_11_02.md),
  SHA256 `926dad0105c8618ec9cc09ac6f94fb100d10d941e416a9fc6f4cbf29c43e7f55`.

Do not edit those reviewed proposal bytes to manufacture a new approved revision.
Implementation records and follow-up decisions belong in the current task/plan.
Manual intake is private DRAFT only, disabled by default, using one explicit
registered mapping and a separately pinned immutable activation snapshot. Snapshot
hash/scope must be recorded before actual activation; general permission alone is
not a supplied activation file or a human content decision.

Human scientific/content/rights/accessibility review, lawful publication,
production deployment, paid LLM API use, and original-repository commit/push/merge
are outside this local engineering authorization. Their actual evidence and gates
remain required. [Execution plan](https://github.com/GamBug/TSA-Platform/blob/3e24c92/plans/261105-2120-recovery028-manual-draft-transport/plan.md).

## RECOVERY-028 private activation proposal — 2026-11-05

Status: PROPOSED, not activated. Local engineering is authorized and implemented;
this entry requests the concrete target registration and snapshot required by the
accepted design. A backed-up read-only inspection of the retained local Bank found
one Math taxonomy, zero Reading taxonomies, and the existing synthetic AUTHOR.
No taxonomy/user or original draft was changed by inspection.

The [exact proposed taxonomy](reading-manual-taxonomy-proposal-2026-11-05.json)
registers one Reading domain and its READING_REASONING skill, with fresh registered
IDs and no users. Its definition hash is
`sha256:ea797c6a47598412c9b3dfc5da0da1cbdb5244dfad60274d803a05b117d05616`,
computed over the canonical definition excluding the definitionHash field.
Version ID: `12cb164d-ca9d-47cc-b881-0cbf450bffad`.

The exact private proposed package/mapping/activation receipt lives under
`.local/question-factory/heat-island-transport-proposal-2026-11-05/` (owner-only).
It contains the existing ten final drafts and original bound critic/source
evidence. This is a truthful unregistered proposal, not a successful Bank import.

- Manifest hash: `sha256:c8df8d2ef03594e2b5f107283d3bd89e3f3f56f781e9a807f67fc567ca9d4cfb`.
- Mapping hash: `sha256:a4a4e37e5f1f61185940a1c7d4a6066b431b708a65a7bdfbb16600e0a36576ff`.
- Activation hash: `sha256:e339008d472787c578d9d36f3cb29c539bdc830e61103b4d70ee0c6658a11b49`.
- Configuration scope hash: `sha256:e17710c8847ffc54bfceeda4d6b78866d167faebbc558783828002e62c9ea9e7`.
- Fixed configuration location:
  `.local/manual-import/reading-v4-2026-11-05/`; no active configuration installed.
- Activation expires November 9, 2026, 18:00 UTC+7. Expiry needs a newly approved
  snapshot, never an automatic time extension.

Requested local action: after a fresh backup, register only this exact taxonomy,
install the exact approved mapping/snapshot at the pinned private location,
authenticate the existing synthetic author and import the ten-question unit as
DRAFT; verify exact replay/zero eligibility and then stop/retire the coordinator.
No new users, human rights/content approval, publication or paid API is included.
Approval identity/date/evidence for this specific snapshot: ABSENT. Its pending
state does not revoke authorization to continue other reviewed local engineering.

## RECOVERY-019 concrete manual-only DRAFT transport — 2026-11-04

[Reviewed proposal](RECOVERY_MANUAL_TRANSPORT_PROPOSAL_2026_11_04.md), final
SHAe3568eaaa881fb96d147672a4807db82cb3bc68476d09ca97f64f69407cd5f0a,
[four actual design findings/corrections](../reviews/RECOVERY_MANUAL_TRANSPORT_DESIGN_2026_11_04.md).
Preparation complete, PROPOSED only. Strict manual v3/private DRAFT/mapping/raw
evidence and local activation/stopdrain semantics require owner disposition,
including the explicit Bank EXTERNAL import-classification interpretation.
No parser/runtime/DB/grant implementation, actualimport or newapproval inferred.
Separate media/planner and human/production gates remain independent.

Root requested a specific asynchronous owner disposition of this final reviewed
manual-only local design on2026-11-04. No answer is recorded; a preselected UI
option or elapsed time is not approval. Earlier media/planner questions are not
resent. Pending implementation must not start from general continuation alone.

## RECOVERY-018 existing internal draft revision — 2026-11-04

Current automatic continuation selects revision of the same ten drafts under the
recorded INT003 internal AI-authored source/manual-chat authority. Source and
historical evidence remain unchanged; no new source/capture/provider/publication
scope. [Actual revision, two fresh blind AI critiques and metadata checks](../reviews/RECOVERY_MANUAL_DRAFT_REVISION_2026_11_04.md)
do not provide human approval, calibrated cognition, scientific/rights verification
or adoption of the manual transport proposal. DRAFT/human0/Bank0/API0, null usage,
internal-only permission and BLOCKED_CONTRACT remain. No architecture change.

## RECOVERY-015–017 continued existing-contract repairs — 2026-11-04

Owner requests automatic continuous work. Root repairs reproduced SDK ordering/
confirmed-denial cache races and wires existing offline tests into the existing
workflow. Actual independent reviews and scoped evidence are in current backlog
cards; no server/schema/grant/auth-policy or new architecture choice. Final client
20/B049/student45/Chrome78 and offline77/checker6 local results do not supply
qualified human content/AT, hosted CI/production acceptance or disposition of
pending media/planner proposals. No paid API, commit, push or deployment.

## RECOVERY-012/013 existing-boundary verification — 2026-11-04

Owner reports “the usage already reset” and requests “continue.” Root implements
test-only private-value HTTP coverage and dedicated Factory LOGIN/live-grading-
lease isolation under existing autonomous local security scope. Actual independent
reviews and [privacy](../reviews/RECOVERY_STUDENT_PRIVACY_2026_11_04.md)/
[Factory capability](../reviews/RECOVERY_FACTORY_ISOLATION_2026_11_04.md) evidence
are recorded. No application contracts, database grants or proposed media/planner
architecture approved or changed. Normal subscription work resumed; historical
usageLimited telemetry does not imply a newly observed quota exhaustion.

## RECOVERY-011 accepted-contract continuation — 2026-11-04

Owner resumed the autonomous recovery goal and said “continue.” Root composed
generic provider-free export and actual DRAFT import verification under existing
generation/Factory2/Bank contracts. [Implementation and actual independent review](../reviews/RECOVERY_GENERIC_EXPORT_2026_11_04.md)
record focused11/combinedAI73PASS. No new DB schema, grant, provider or architecture
choice. Media/planner proposals and human content/accessibility/production gates
remain pending; continuation is not their specific disposition. A worker reached
subscription usage limit; root took over without a paid or alternate-provider
workaround. Goal controller later reports usageLimited, not objective complete.

## RECOVERY-010 accepted-contract continuation — 2026-11-02

Owner said “next” after the blocked checkpoint. Root selected an additional
existing-contract task: generic bounded generation-response validation using
unchanged G1 schemas, with actual independent review and focused22/combinedAI63
PASS. [Evidence](../reviews/RECOVERY_GENERATION_RESPONSE_2026_11_02.md).
No architecture/storage/grant/provider choice is made. This continuation is not
recorded as literal approval of either pending media or Factory proposal; those
specific dispositions and human/production inputs remain absent.

## RECOVERY-009 Factory planner/reservation design — 2026-11-02

[Concrete proposal](RECOVERY_FACTORY_PLANNER_PROPOSAL_2026_11_02.md), final hash
926dad0105c8618ec9cc09ac6f94fb100d10d941e416a9fc6f4cbf29c43e7f55, independently
reviewed by actual planner_final_review with no final material finding;
[finding dispositions](../reviews/RECOVERY_FACTORY_DESIGN_REVIEW_2026_11_02.md).
PROPOSED only: config/inventory/plan shapes, new durable Factory rows, checked
commands and explicit privilege cutover need owner architecture disposition.
Existing job kinds/grants were inspected, not invented or changed. No architecture,
operating budget/capacity, source rights, live provider or production approval
recorded. Media proposal disposition remains separately pending. No runtime
implementation may infer approval from this document or review.

Root has now requested a specific asynchronous owner disposition for zero-cost
local fixture implementation only. No response is recorded. This request does
not include live providers, paid calls, real-content approval or deployment.

## RECOVERY-008 provider-free fixture prerequisite selection — 2026-11-02

Root selects a generic deterministic fake-generation adapter under the owner's
recorded autonomous local engineering authority. Existing G1 GenerationRequest,
ProviderResult and ProviderError contracts plus the specified adapter operations
are unchanged. The adapter uses explicit in-memory fixture cases, no external
provider/process/network/persistence and no publication authority. This is an
implementation prerequisite, not a new Factory wire/schema/storage decision or
approval of ADR-005/008. It does not supersede INT-003 manual-only authoring.
Root owns coordination and test script; navigation owns the module/tests;
baseline_scout independently reviews after release. No human/content acceptance,
paid API, real-provider comparison or full AI-001/FACTORY-002 completion inferred.

## RECOVERY-005 inspected-image delivery proposal — 2026-11-02

[Reviewed proposed scope](RECOVERY_MEDIA_DELIVERY_PROPOSAL_2026_11_02.md) preserves
the existing frozen media GET but requires a new inspection profile/private local
store/guard migration. Root requested explicit owner architecture disposition via
an asynchronous question; no answer/approval is recorded yet. Independent
baseline_scout review of final c5037fe2fa535364ef16e5edf4a4358bbc7d9a196c0fb07f4a2ae9126b3e6d9
found no blocking mismatch after root/reviewer corrections. This is document
review, not runtime security acceptance. Pin immutable asset/decoder inspection
metadata in any authorized implementation card. Existing text-only profile and
blanket asset guard remain; other independent recovery work may continue.

## Autonomous recovery execution authority — 2026-11-02

- Approval identity: human repository owner; date 2026-11-02 Asia/Bangkok.
- Durable evidence: owner instruction following AUDIT-001: “full permission. Now
  work automatic, do the things you think is the best for the project” and
  “remember use subagents wisely. This just Codex Plus plan, work wisely.”
- Root selects recovery-plan RP-01 baseline reproduction and status reconciliation
  first, then concrete actionable engineering gaps. Focused subagents authorized.
  Subscription usage exhaustion is not measurable by this agent; no quota claim.
- Existing private-content/human-review/production gates and no paid LLM API calls
  remain. No captured-source extraction, publication or deployment inferred.

INT-003 continuation2026-10-27: [manual-only choice, AI-authored source/internal-use
authorization and PROPOSED transport delta](INT_003_MANUAL_LLM_STAGING.md).
Ten actual current-Codex questions are DRAFT in private staging; no provider API
call, fabricated usage, OWNED rights promotion or human/publication approval.

Scoped owner assignment2026-10-27: [offline Reading Factory experiment](READING_FACTORY_EXPERIMENT_2026_10_27.md).
Root accountable; additive default-false local20/1800 profile and existing canonical
draft/review/Bank/student boundaries. No frozen contract change, paid API, human
content approval, push, merge or deployment authorization.

Status as of 2026-10-17: all eight ADRs below remain PROPOSED as whole decisions; ADR-004 H1, H2, H3, the MVP Start TTL and non-retroactive ordinary admission-schedule edits have separate, scoped HUMAN OWNER approvals. Independent review by Antigravity is documented in [ARCHITECTURE_REVIEW_001](../reviews/ARCHITECTURE_REVIEW_001.md); Codex's disposition and changes are in [REVIEW_RESOLUTION_001](../reviews/REVIEW_RESOLUTION_001.md). Neither review is owner approval. Phase 02.75 remains documentation-only by default; the scoped G0 implementation authorization below is the explicit owner authorization for development work and does not authorize paid LLM API calls, production readiness or unresolved ADR changes.

## Track B product-completion execution — 2026-10-23

Current UI supplement,2026-10-27: human owner explicitly requested “main color is
red, less gradient” and “Fix header/navbar layout shifts and UI jitter during route
navigation”, investigating scrollbar width, container sizes, transitions, fonts
and remounts while preserving the existing design and responsiveness. The owner
also explicitly renewed subagent use. Root selected a bounded frontend shell/theme
repair and existing-browser verification under that authority; no frozen backend,
scoring, timing, rights or role change. Implemented and independently reviewed in
[recorded scopes](../reviews/WEB_004_HEADER_STABILITY_VERIFICATION.md); this is not
human accessibility/content/production acceptance. Existing prohibitions remain.

- Approval identity: human repository owner; date 2026-10-23, Asia/Bangkok.
- Durable evidence: current owner mission, “AUTONOMOUS TRACK B PRODUCT COMPLETION”:
  “The human owner has authorized autonomous engineering execution within the
  established Track B development scope”; “Execute the plan.”
- Scope: local code, dependencies, PostgreSQL, browser verification, synthetic
  fixtures, bounded refactoring, documentation, independent agents and local
  commits; prioritize complete student demo, then authorized staff functionality.
- Prohibitions retained: push/remote merge/deploy, unapproved frozen-contract
  changes, unauthorized real content/publication, fabricated rights/human review,
  Astra/paid model APIs, live student LLM requests and unrelated destructive work.
- This is engineering execution authority, not qualified accessibility/content
  acceptance, production readiness or approval of new staff routes/privileges.

## Track B engineering-choice delegation — 2026-10-24

Current selection2026-10-27 after owner “next” following73114bd: root selected
observed saved-attempt pending/error recovery gaps. History and current-card GET
now use local loading/retry/cancel with navigation/identity fences, retaining the
unchanged owned-target/release validation. No new route, privilege, clock, score,
reuse or server policy. [Implemented verification/review/limits](../reviews/WEB_004_SAVED_READ_RECOVERY_VERIFICATION.md).
This remains a delegated engineering choice, not qualified human acceptance.

Current selection2026-10-27: after owner “next.” following7211ef3, root selected
the observed student-history reachability gap (silently hidden rows after10) and
read-failure recovery. Existing owned paginated GET already supplies every row;
only frontend state/layout and focused existing-runner verification change. No
new API/privilege/reuse/scoring/timing policy. Implemented and independently
reviewed in [recorded scopes](../reviews/WEB_004_HISTORY_VERIFICATION.md). This is
root's delegated engineering choice, not a new human acceptance attestation.

- Delegating identity: human repository owner. Exact latest instruction:
  “next. now any choice is yours! no need to ask me anymore.”
- Disposition: root may select and execute the next bounded Track B engineering
  increments without repeated routine approval questions, including documented
  technical contract choices within the product-completion mission. Record each
  material choice, impact and verification; preserve frozen historical baselines.
- This is not a human content/rights/accessibility attestation, authorization to
  invent reviewer qualifications, paid model APIs/Astra/live student inference,
  push/remote merge/production deployment or unrelated destructive operations.
  These existing prohibitions are retained. Do not label AI decisions human review.

## Renewed Track B choice authority and B11 selection —2026-10-26

- Delegating identity: human repository owner. Exact latest instruction, after the
  final report identified B11's frozen-count policy gate: “full permission. all
  choice is your. do things you think is the best for this project.”
- Root treats this as renewed authority to make the presented bounded technical
  choice, not as a fabricated literal “Approve B11” utterance. Root selects the
  reviewed [B11 proposal](WEB_003_B11_SHORTER_PROFILE_PROPOSAL.md): optional local
  personal NEW_ONLY MATH2/180seconds and SCIENCE2/180seconds, separate explicit
  choices/shortage alternatives, preserving original4/2/4 guard/profiles and all
  B8/B9/B10 fixed/rehearsal support/privileges. No one-item Reading split.
- AUTHORIZED_IN_SCOPE_UNDER_RENEWED_DELEGATION / IMPLEMENTED / AUTOMATED_PASS /
  INDEPENDENTLY_REVIEWED in recorded scopes. [Executed evidence/review/limits](../reviews/WEB_003_B11_SHORTER_PROFILE_VERIFICATION.md).
  This resolves B11's local expanded-profile selection gate only. Preserve original
  public contracts/root exports/solver/goldens, first-history/H1/rights/clock/release
  invariants and default-off shared capability. New exact private profile pins and
  narrowly scoped internal compatibility are permitted as documented engineering
  choices; no real content, qualified review/accessibility or production acceptance.
- Earlier PROPOSED/HUMAN_APPROVAL_REQUIRED entries remain historical preparation
  records, superseded only by this scoped selection. No wholeADR007 or unrelated
  policy approval. Existing no push/remote merge/deploy/paidAPI/Astra/live student
  inference/unauthorized content/unrelated destructive-operation limits persist.

## WEB-003 B10.1 — selected under standing delegation,2026-10-26

- Selection actor: root engineering orchestrator under the owner's standing
  engineering-choice/product-completion delegation, after B9 clean acceptance.
  This is separate from B9's expressly staff-only go-ahead, not an inferred new
  human utterance or wholeADR007/content/accessibility/production approval.
- [Exact bounded decision/compatibility](WEB_003_B10_FIXED_STUDENT_DECISION.md):
  implement existing frozen student fixed catalog/create modes using supported B9
  seals, fresh session-bound consent, owned attempts/history and unchanged lifecycle.
  No new public route/field/role or solver, no personal commit relaxation/raw grant.
  New narrow tsa_exam EXECUTE supports the existing student operation only.
- AUTHORIZED_IN_SCOPE_UNDER_DELEGATION / IMPLEMENTED / AUTOMATED_PASS /
  INDEPENDENTLY_REVIEWED in exact recorded scopes. Source d903ae4 and clean no-hardlink
  reproduction passed; initial Firefox session-cleanup failure and unchanged-source
  passing retry disclosed. [Design review](../reviews/WEB_003_B10_DESIGN_REVIEW.md),
  [executed evidence/limits](../reviews/WEB_003_B10_FIXED_STUDENT_VERIFICATION.md).
  No new human approval claimed. Shared flags defaultfalse; disposable synthetic opt-in only.

## WEB-003 B11.1 — shorter-profile proposal,2026-10-26

- Root prepared the [bounded proposal](WEB_003_B11_SHORTER_PROFILE_PROPOSAL.md)
  under standing engineering-choice authority after B10. PROPOSED /
  HUMAN_APPROVAL_REQUIRED for expanding frozen MVP count-policy support; not an
  owner disposition or implementation authorization. Original guard4/2/4 stays.
- Proposed local MATH2/SCIENCE2, explicit independent selection and strict NEW_ONLY;
  no one-question Reading split, silent fallback or altered historical profiles.
  Actual separate native Luna/XHigh read-only source/wording review completed;
  metadata identity, unchanged fixed/rehearsal4/2/4 and active-profile/explicit Start
  boundaries clarified/rechecked. No new policy contradiction; this is design review,
  not owner approval. No application changes, migration/offering activation or
  runtime tests executed. Complete current demo remains available; lawful inventory/manual accessibility
  remain separately dependent on qualified humans.

## WEB-002 B9.1 — scoped owner go-ahead,2026-10-26

- Authorizing identity: human repository owner,2026-10-26 Asia/Bangkok.
- Durable conversational evidence: root explicitly asked, “Approve B9.1 as a whole
  for local implementation?” and linked the independently reviewed proposal. The
  owner's immediate reply was “next.” Root treats this direct response as an
  instruction to proceed with that specific proposal, consistent with the standing
  engineering-choice delegation. It is not a claim that the owner used the word
  “approve”, whole-ADR approval, real-content attestation or production authorization.
- Scope is exactly the proposal at752516f (Git blob
  f38b88baf023503b85c779938ac5707ef3aad6fc): new local privileged fixed seal and safe
  EXAM_MANAGER metadata list/detail, bounded current eligible synthetic stock,
  private immutable snapshots, B7 reference-only separation and B8 compatibility.
  Student fixed delivery, rights edits/qualified human approval/publication remain
  excluded. Public/student and existing personal contracts remain frozen.
- Root accountable for SQL/services/HTTP/fixtures/browser/integration/records;
  disjoint native Luna/XHigh private DTO/UI writers may implement their reserved
  scopes, separate available Sol6.1/Medium read-only final review. Existing subscriptions
  only. B9 IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED in its exact scope;
  [runtime/upgrade/browser evidence](../reviews/WEB_002_B9_FIXED_SEALING_VERIFICATION.md). Prior proposal
  status below is historical and superseded only within this recorded scope.

## WEB-002 B9.1 — proposed fixed sealing contract,2026-10-26

- PROPOSED / HUMAN_APPROVAL_REQUIRED for the new privileged API and SQL operations;
  no B9 implementation or runtime acceptance. Root prepared the
  [specific contract/privilege/migration/consumer/acceptance proposal](WEB_002_B9_FIXED_SEALING_PROPOSAL.md)
  under the mission's new-operation decision-proposal rule. Existing B8 rehearsal
  and proposed broad staff table do not authorize sealing or fixed student delivery.
- Scope: deliberate fixed seal plus EXAM_MANAGER safe list/detail; current stock,
  immutable new fixed snapshots, no student attempt/history/delivery/publication.
  Preserve B7 reference-only API boundary, B8 rehearsal and all personal contracts.
- No owner approval identity/date/evidence is recorded for B9. Separate native
  Sol6.1/Medium source-only review executed2026-10-26; response-ID framing P2
  repaired/rechecked with no further finding. [Exact review](../reviews/WEB_002_B9_DESIGN_REVIEW.md).
  Runtime/contract/migration/browser acceptance NOT_EXECUTED. Do not infer approval
  from design review, this proposal or synthetic workflow states.

## WEB-003 explicit review practice — selected2026-10-25

- Root-selected under2026-10-24 owner engineering-choice delegation,
  AUTHORIZED_IN_SCOPE / IMPLEMENTED2026-10-26. [Exact bounded decision/compatibility](WEB_003_EXPLICIT_REVIEW_PRACTICE_DECISION.md).
- Existing frozen explicit PERSONALIZED_PRACTICE/REVIEW_ALLOWED/true-consent request,
  catalog signal/shortage alternative and reference solver; no new public field or
  automatic fallback. NEW_ONLY default/strictness, immutable history/clock, roles,
  eligibility and PUBLISHED_FIXED separation remain unchanged.
- Actual read-only scout/source and separate Sol6.1/Medium policy precheck found no
  specific prohibition; record this selected increment, not whole-ADR-007 approval.
  Root transaction/SQL integration, bounded native LunaXHigh UI/tests after ownership
  reservation, separate read-only design/code/security review. Actual PG/HTTP/Chrome/
  Firefox PASS; [executed evidence and review limits](../reviews/WEB_003_REVIEW_PRACTICE_VERIFICATION.md).

## SEC-001 — bounded validator repair selected 2026-10-25

- Root-selected under recorded owner engineering-choice delegation,
  AUTHORIZED_IN_SCOPE / IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED.
  [Exact impact/acceptance](SEC_001_ZOD_VALIDATION_LIMIT_REMEDIATION.md),
  [compatibility/review evidence](../reviews/SEC_001_ZOD_REMEDIATION_VERIFICATION.md).
  Clean no-hardlink3cd49be locked install/build/contracts156/focused12/domains78/
  Chrome46/Firefox16/emitted/boundaries/audit0 PASS; final clone Git empty.
- Actual fresh B8 npm audit reports high Zod4.1.12 resource-consumption advisory;
  controlled frozen student schema produces20,002 issues for10,000 invalid options.
- Select exact patched4.6.7, preserve other package pins and all frozen schema/
  artifact/replay outputs. Root writer, separate Sol6.1/Medium read-only review.
  No rights/publication/production claim or new paid dependency.

## WEB-002 B8.1 — eligible Bank stock rehearsal selected 2026-10-25

- Root-selected under owner engineering-choice delegation; AUTHORIZED_IN_SCOPE /
  IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED in recorded scope.
  [Exact scope/privilege/compatibility/acceptance](WEB_002_B8_BANK_STOCK_REHEARSAL_DECISION.md),
  [executed evidence/limits](../reviews/WEB_002_B8_BANK_STOCK_REHEARSAL_VERIFICATION.md).
  Clean no-hardlink b886737 install/build/focused12/Chrome46/Firefox16/built/drift/import/docs PASS; final clone Git empty. Old-pin Zod advisory subsequently fixed in SEC-001.
- EXAM_MANAGER initiates fixed diagnostic stock capture, BANK_MANAGER views aggregate
  history. New immutable private records, no forms/student history/assembly run writes.
  Existing B7 synthetic reference APIs/data remain separate and unchanged.
- Root021 SQL/backend/fixtures/browser/shared records; bounded native Luna/XHigh
  private DTO/UI writers, separate Sol6.1/Medium read-only final review, no findings.

## WEB-002 B7.2 — stored fixed reference diagnostics selected 2026-10-25

- Root-selected under owner engineering-choice delegation, AUTHORIZED_IN_SCOPE /
  IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED. [Exact scope/privilege/migration/DTO/UI/acceptance](WEB_002_B7_STORED_DIAGNOSTICS_DECISION.md).
- Narrow fixed-only audited function/EXECUTE grant, no table SELECT or personal
  runs; explicit manager list/detail aggregate UI and genuine stored synthetic
  solver reference fixtures. No forms/student fixed delivery/publication authority.
- Root SQL/backend/integration/records; disjoint native Luna/XHigh private DTO/UI
  writers; separate Sol6.1/Medium read-only review.
  [Actual evidence/limits](../reviews/WEB_002_B7_STORED_DIAGNOSTICS_VERIFICATION.md).

## WEB-002 B7.1 — additive fixed reference selected 2026-10-24

- Root selected under owner delegated engineering choices; AUTHORIZED_IN_SCOPE /
  IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED. [Exact contract/impact/migration/acceptance](WEB_002_B7_FIXED_REFERENCE_DECISION.md).
- Separate internal fixed manifest/parser/reference/replay, no history fields or
  REVIEW_ALLOWED mapping. Preserve frozen personal inputs/results and old tests.
- Shared private mode-neutral helper factoring only; no DB migration/grant/HTTP/UI/
  live service/publication/human authorization. Root integration/docs, bounded
  native Luna/XHigh writer, separate Sol6.1/Medium read-only review.
  [Executed evidence and limits](../reviews/WEB_002_B7_FIXED_REFERENCE_VERIFICATION.md).

## WEB-002 B6.1 — canonical preflight selected 2026-10-24

- Root-selected under owner engineering-choice delegation; AUTHORIZED_IN_SCOPE /
  IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED. [Exact scope/impact/acceptance](WEB_002_B6_CANONICAL_PREFLIGHT_DECISION.md).
- Manager-only explicit pinned canonical dataset report over existing internal
  service, not accepted inventory or assembly feasibility. No fixed/personal
  manifest contract changes, grants/migrations, publication/rights/human approval.
- Actual read-only discovery found fixed manifest reuse-mode mismatch and no
  genuine fixed solver-run fixture; preserve frozen contracts and personal data.
  Root integration/backend/tests/docs; native Luna/XHigh contracts/UI writers,
  separate Sol6.1/Medium read-only review. [Executed evidence/limits](../reviews/WEB_002_B6_RUNTIME_VERIFICATION.md).

## WEB-002 B5.1 — recorded review history selected 2026-10-24

- Root-selected under owner engineering-choice delegation; AUTHORIZED_IN_SCOPE /
  IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED. [Exact additive decision/impact/policy](WEB_002_B5_REVIEW_HISTORY_DECISION.md).
- Current BANK_MANAGER-only bounded private GET/DTO/UI for immutable recorded
  review decisions, no added structured reviewer identity/question content fields.
  Stored reason is explicitly verbatim private text and may contain pasted sensitive
  material; no redaction guarantee. Old approval differs from current workflow and
  qualification; latest20/truncation is explicit.
- No B1–B4/root/student/released change, new grant/migration, mutation/APPROVE,
  real-content/human/publication authority. Root backend/HTTP/browser/docs;
  bounded configured Luna/XHigh contract/UI writers, separate Sol6.1/Medium
  read-only independent review. [Executed evidence/limits](../reviews/WEB_002_B5_RUNTIME_VERIFICATION.md).

## WEB-002 author interaction editor — selected 2026-10-24

- Actor: root under the recorded owner engineering-choice delegation. Existing
  authorized AUTHOR create route/question schema only; no frozen contract changes.
- Acceptance gap: author UI always creates SINGLE_CHOICE even though current
  contracts, Bank creation and private preview support MULTIPLE_CHOICE and
  TRUE_FALSE_GROUP. Select a compact two-option/two-statement editor for all three.
- Preserve default single-choice selectors/flow. Multi-choice requires at least
  one explicitly chosen key; true/false requires explicit values for both
  statements. Selection bounds1..2 are disclosed and stored for multi-choice.
  Private synthetic template remains AUTHOR-only; section/profile stays MATH.
- No new endpoint/role/permission/publication/review/rights authority or dependency;
  no database migration or historical rewrite. Switching type clears type-specific
  key selection and must not silently post. Existing idempotent create behavior,
  late-response fences and private storage boundaries remain stable.
- Root owns browser/Firefox/integration/shared docs, bounded native Luna/XHigh UI
  writer may own staff.js/scoped CSS, separate Sol6.1/Medium read-only review.
  Required evidence: actual UI creates each shape, validation0POST for incomplete
  keys, exact persisted/private-preview values after reload, handoff remains
  explicit, mobile/keyboard checks and existing regression suites.
- IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED: [actual evidence](../reviews/WEB_002_AUTHOR_EDITOR_VERIFICATION.md). No frozen contract change.

## WEB-002 B4.1 — engineering scope selected under owner delegation, 2026-10-24

- Status **IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED (scoped)**. Selection actor:
  Codex root using the owner delegation above, not a fabricated whole-B4 quote.
- Selected reviewed [exact B4.1](WEB_002_B4_NEGATIVE_DISPOSITIONS_PROPOSAL.md) at743a197,
  SHA-256 `65b81b18c6d700e0858d0c214d8cc1944e48876e0beb289d7b0a6edf14eb9e21`.
  Historical approval-pending footer is superseded by this scoped disposition;
  preserve specification bytes. Separate design review found/resolved P2;
  [runtime evidence and limits](../reviews/WEB_002_B4_RUNTIME_VERIFICATION.md) record actual execution.
- Implement local synthetic REJECT-only/manager quarantine DTO/UI/recovery and
  original import-operator attribution repair for fresh/replayed reviewer and
  singleton independence. Preserve manager hold authority and publication guards.
- Implementation choice under delegation: apply the same original-attribution
  helper to existing equivalence-pair reviewer guards as well as review/singleton
  guards, because they call the same independence policy. No new equivalence UI,
  route or policy; preserve manager hold authority.
- No APPROVE/publication/rights-edit UI, new grants/migration, human qualification
  or historical review/audit rewrite. Quarantine consequences/current-access loss
  and post-commit failure recovery remain exactly as disclosed in the specification.

## WEB-002 B4.1 — historical proposed negative dispositions, 2026-10-24

Superseded by the selected/implemented disposition above; retained as history.

- Status **PROPOSED / HUMAN_APPROVAL_REQUIRED**; approval identity/date: none.
- [Exact revised B4.1](WEB_002_B4_NEGATIVE_DISPOSITIONS_PROPOSAL.md), SHA-256
  `65b81b18c6d700e0858d0c214d8cc1944e48876e0beb289d7b0a6edf14eb9e21`.
  [Independent design review](../reviews/WEB_002_B4_CONTRACT_DESIGN_REVIEW.md):
  one server-attribution claim P2 resolved by explicitly including a bounded
  original-import-operator enforcement repair; final no design blockers.
- New approval would cover local synthetic REJECT-only and manager quarantine
  DTO/confirmation/recovery UI over existing commands, plus that specific server
  repair for receipt-less ancestors/fresh/replay reviewer independence. Current
  backend gap is source evidence, not a reproduced exploit. No B4 implementation.
- Quarantine may affect related descendants/forms/attempts/results and may return
  503 after commit/drain failure. Rejection removes queued private-read access;
  receipts and current state remain distinct. These effects are in the decision.
- No APPROVE, rights edit, publication, qualified human or real-content authority;
  no new grants/migration or historical rewrite. Privileged actions/repair need
  explicit whole-B4.1 owner disposition, not an inference from B3 handoff approval.

## WEB-002 B3.1 — owner-approved author draft handoff, 2026-10-24

- Status: **APPROVED IN SCOPE** by human repository owner,2026-10-24 Asia/Bangkok.
  Exact instruction: “continue. Approve B3.1 author draft handoff
  (docs/decisions/WEB_002_B3_DRAFT_HANDOFF_PROPOSAL.md) as a whole”.
- Immutable approved scope: [B3.1](WEB_002_B3_DRAFT_HANDOFF_PROPOSAL.md) at5c1bded,
  SHA-256 `2c8d8531fdcbf18a1e7c25d8f0be48a260ae80b93bdf0a90ece1c30d3e003980`.
  This disposition supersedes historical approval-none statements in the frozen
  proposal/design record; preserve approved specification bytes.
- Authorizes explicit fresh AUTHOR_OWN/DRAFT UI handoff/confirmation, strict private
  command DTO/artifact using the existing submit-review route/service, captured
  idempotent intent and truthful receipt-versus-current-state recovery.
- Existing backend AUTHOR/created_by policy, B1/B2/student contracts and grants
  remain stable. No new route, SQL migration, imported authorship, human review
  decision, rights mutation, quarantine or publication UI is approved.
- Root accountable for implementation/integration and actual verification/review;
  no production/content/qualified-human acceptance follows from this approval.

## WEB-002 B3.1 — proposed author draft handoff, 2026-10-24

- Status: **PROPOSED / HUMAN_APPROVAL_REQUIRED**; approval identity/date: none.
- [Exact B3.1](WEB_002_B3_DRAFT_HANDOFF_PROPOSAL.md), SHA-256
  `2c8d8531fdcbf18a1e7c25d8f0be48a260ae80b93bdf0a90ece1c30d3e003980`.
  [Separate actual design review](../reviews/WEB_002_B3_CONTRACT_DESIGN_REVIEW.md)
  no concrete findings; runtime NOT_EXECUTED/no implementation.
- Recommends explicit AUTHOR_OWN/DRAFT UI handoff using existing submit-review
  command, strict additive private command DTO/artifact, confirmation and truthful
  idempotent recovery/current observation. Existing server authorization retained.
  No grant/migration/new route, imported authorship, human review decision, rights
  mutation, quarantine command or publication UI authority.
- New privileged workflow UI/command artifact lies outside B1/B2 read approvals.
  Explicit owner approval of B3.1 as a whole is required before implementation.

## WEB-002 B2.1 — owner-approved recorded-evidence read, 2026-10-23

- Status: **APPROVED IN SCOPE** by the human repository owner on2026-10-23,
  Asia/Bangkok. Exact current instruction: “Approve B2.1
  (docs/decisions/WEB_002_B2_RIGHTS_EVIDENCE_PROPOSAL.md) as a whole”.
- Exact immutable scope: [B2.1](WEB_002_B2_RIGHTS_EVIDENCE_PROPOSAL.md) at79fb487,
  SHA-256 `62f714f3f1c5621d9c866163352c285cb16db4e6d6d7553a44606bede8b4d923`.
  Historical proposal approval-none status below/in the frozen document is
  superseded by this disposition; preserve its bytes.
- Authorizes its local-only GET/strict private DTO/explicit evidence action and
  synthetic BANK_MANAGER fixture. Verbatim current evidence text, including any
  pasted identifiers/question/key text, is limited to BANK_MANAGER or independent
  IN_REVIEW REVIEWER; no redaction guarantee. AUTHOR alone/students denied.
- Preserves B1/student/released contracts and grants; no review decisions, rights
  edits, publication/quarantine, media retrieval, new SQL grant/migration or real
  human/legal qualification. Root accountable for runtime verification and review.

## WEB-002 B2.1 — proposed recorded-evidence read, 2026-10-23

- Status: **PROPOSED / HUMAN_APPROVAL_REQUIRED**; approval identity/date: none.
- Exact [B2.1 scope](WEB_002_B2_RIGHTS_EVIDENCE_PROPOSAL.md), SHA-256
  `62f714f3f1c5621d9c866163352c285cb16db4e6d6d7553a44606bede8b4d923`.
  Separate [design review](../reviews/WEB_002_B2_CONTRACT_DESIGN_REVIEW.md): one
  privacy/disclosure P2 repaired, final no concrete blockers. This is no approval.
- Recommends a separate local-only GET for current recorded rights-evidence text,
  only BANK_MANAGER or independent IN_REVIEW REVIEWER. Approval would explicitly
  permit verbatim arbitrary text (potential pasted identifiers/question/key text),
  with no redaction guarantee. AUTHOR alone/students denied; no additional private
  storage fields, mutation, file/media retrieval, qualified-human or legal claim.
- No B2 runtime operation, DTO, UI or grants implemented. B1 approval/frozen
  contract is unchanged and grants no evidence access. New operation/private
  disclosure needs explicit owner authorization before implementation.

## WEB-002 B1.2 — owner-approved private inspection, 2026-10-23

- Status: **APPROVED IN SCOPE** by the human repository owner, 2026-10-23,
  Asia/Bangkok. Durable evidence is the exact current instruction:
  “next. Approve B1.2 as a whole to begin implementation”.
- Approved immutable scope: [B1.2 contract](WEB_002_REVIEW_CONTEXT_V1_PROPOSED.md),
  as committed in `5f916af`, SHA-256
  `94d81d1c574dff0b9d8c9338a3559d1c88aa9629f17743a1171bdc2c9b074392`.
  Its historical PROPOSED/approval-none footer is superseded by this owner record;
  keep approved specification bytes stable for exact scope comparison.
- Authorizes the local synthetic-only private GET/strict staff DTO, current
  BANK_MANAGER/AUTHOR_OWN/independent-IN_REVIEW access matrix, rights-gated preview,
  read-only graph/rights snapshot, additive private staff subpath/artifact and
  migration019 Boolean authorship predicate exactly as specified.
- Existing metadata/student/released contracts, scoring/timing/reuse rules, raw
  audit restrictions and non-staff database grants remain stable. No review,
  publication, rights-edit, quarantine, media or diagnostics capability is granted.
- No real-content rights, qualified human review, accessibility acceptance,
  production readiness, push/merge/deployment, paid API or Astra authority follows.
- Accountable integrator: Codex root. Implement and independently review actual
  runtime behavior before recording verified B1 completion. Design review alone
  remains design evidence, not runtime acceptance.

## WEB-002 private staff inspection — pending 2026-10-23

Historical pending-B1 account below is superseded by the explicit B1.2 owner
approval above. [B1 implementation/runtime evidence](../reviews/WEB_002_B1_RUNTIME_VERIFICATION.md)
is separate from approval. Broader private evidence/review/rights/diagnostics
remain future scoped decisions; no whole-ADR/publication acceptance is inferred.


**PROPOSED / HUMAN_APPROVAL_REQUIRED**:
[staff read-contract decision packet](WEB_002_STAFF_READ_PROPOSAL.md).
Exact first increment: [B1.2 DTO/access/rights/read-only proposal](WEB_002_REVIEW_CONTEXT_V1_PROPOSED.md).
The owner's subsequent `NEXT` authorized continued preparation; it did not specify
option B, reviewer scope or private-field approval. Approval identity/date/scope
for this proposed contract remains absent.
Separate engineering design review is complete, with two concrete issues repaired;
[record and proposal hash](../reviews/WEB_002_B1_CONTRACT_DESIGN_REVIEW.md).
B1.2 explicitly includes the narrow proposed migration019 authorship predicate.
An approval question was sent for this whole revision; no owner answer is recorded.

Existing metadata filtering/pagination uses current route/roles under the product
mission. Private preview/evidence/eligibility/diagnostics need an explicit bounded
contract/authorization choice. No approval or reviewer identity is inferred.
This decision does not block student polish, reproducible demos or existing staff
metadata improvements.

## Lightweight process

Keep significant decisions here until size warrants individual `ADR-NNN-title.md` files in this directory. Each ADR records problem, alternatives, tradeoffs, choice, consequences, migration/rollback and status. Trivial internal naming does not require an ADR. Human approval must record approver, date, exact ADR revision/content scope, conditions and a durable reference or a faithfully recorded owner instruction. If the instruction originated in chat, copy its actionable approval wording into this record; do not depend on chat accessibility. An independent agent review is advice, never owner approval.

States: DRAFT → PROPOSED → APPROVED → SUPERSEDED. A rejected proposal remains DRAFT with rejection reason or is superseded by a new proposal. Reopening an approved contract requires impact analysis listing affected modules, database/data migration, consumers, tests, rollout and rollback. Do not silently edit approved semantics. Approval applies only to named revision/scope, not later edits. No new infrastructure merely because it appears in research.

## G0 — Scoped implementation authorization

- Status: AUTHORIZED SCOPE ONLY; this is not approval of any ADR, production readiness, deployment, real-user collection or a downstream gate.
- Approval identity: human project owner.
- Date: 2026-10-17 (Asia/Bangkok).
- Durable evidence: the owner's TASK FOUND-004 instruction in this session, recorded here so the authorization does not depend on chat availability.
- Exact owner authorization:

  > The human project owner explicitly authorizes development and implementation of TSA-Platform.
  >
  > Paid LLM API calls are prohibited until separately authorized by the owner.

- Permitted scope: frontend, backend and database development; automated tests and local development; local LLM inference; free-tier LLM API usage only when it causes no charges; Question Factory development and evaluation; TSA dataset research and preparation; and preparation for real-user testing and deployment.
- AI-provider spending condition: no paid LLM API request, billable retry, overage or other chargeable LLM API use is authorized by this record. A separate owner authorization is required before any paid LLM API call.
- Conditions preserved: copyright and content licensing, personal-data protection and consent, security and release-readiness checks, human question-publication approval, AI validation and human approval, and all existing unresolved ADR technical decisions remain in force.
- Gate effect: this records the owner-authorized G0 implementation scope. Task-specific accountable ownership, approved contract boundaries and G1–G3 evidence remain required; no production-readiness or release claim follows from this record.

### Owner-trust execution policy — 2026-10-18

- Human project owner approval, 2026-10-18: "OWNER DIRECTIVE — FULL ACCESS TRUST
  POLICY"; "Full Access is NOT a permission mismatch. It is an intentional
  execution authorization."
- Permanent execution policy is owned by the existing
  [orchestration protocol](../agents/ORCHESTRATION_PROTOCOL.md#owner-trust-execution-policy--2026-10-18).
  This supersedes the restricted-session-only writing-pilot precondition;
  task scope and explicit prohibitions remain binding. No product/ADR approval.

### Stage 3 pilot and local finalization — 2026-10-19

- Human project owner: "RESUME APPROVED STAGE 3 — FOUND-002 PILOT" (2026-10-18)
  assigned one Luna / XHigh builder for executable contract build/emitted-JS smoke.
  "STAGE 3 FINALIZATION AND STAGE 4 READINESS" (2026-10-19) additionally authorizes
  scope cleanup, validation, two logical local commits and Stage 4 planning only.
- Preserve owner `AGENTS.md` edits; no schemas, public exports, dependencies,
  pushes, merges, deployment, paid APIs, unapproved architecture or G1 advancement.
  Stage 4 implementation remains unauthorized. Evidence: [latest handoff](../agents/LAST_HANDOFF.md).

### Stage 4A bounded autopilot authorization — 2026-10-19

- Human project owner, "STAGE 4A — BOUNDED AUTOPILOT ACTIVATION": execute READY
  G1-preparation work, necessary tests/evidence, bounded repairs and local commits;
  consolidate unresolved choices into one decision packet. At most two subagents
  and one writing worker. No Stage 4B before owner approval of required semantics.
- No public-contract/product-semantic/dependency changes, owner `AGENTS.md` edits,
  push/merge to main, deployment, paid APIs, Astra or automatic G1 advancement.
- Approval is execution scope only; pending ADRs/decisions remain unapproved.

### D1–D6 scoped contract approval / Stage 4B — 2026-10-19

Approval identity: human project owner. Durable evidence: "OWNER APPROVAL —
ACTIVATE STAGE 4B BOUNDED AUTOPILOT". D1–D6 architectural behaviors in the
consolidated brief are APPROVED IN SCOPE; unrelated ADRs remain PROPOSED.

- D1: preserve eligible/unseen shortage and SEARCH_EXHAUSTED distinctions; accept
  bounded FOUND-007 reconciliation only with its required evidence.
- D2: versioned immutable identity plus separate fingerprint; freeze exact field
  projection, immutable reference handling, missing/conflicting/cyclic behavior
  and byte goldens before dependent implementation; exclude operational state,
  preserve authored text and never automatically merge equivalence groups.
- D3: deterministic bounded backtracking with hard constraints/replay/immutable
  snapshots. Search/contention limits remain initial engineering parameters until
  behavior/performance evidence supports frozen versioned values; exhaustion is
  never an infeasibility proof.
- D4: new self-contained versioned Factory transport, v1 compatibility, complete
  bounded manifests/reference/provenance/rights validation and atomic rejection;
  successful import confers no human approval/publication.
- D5: existing owner-only released-result route, separate score/review contracts,
  no unreleased private data disclosure.
- D6: student/internal/released consumer separation and explicit compatibility,
  generated route types/drift checks and minimization at runtime API boundaries.
- Execute newly unblocked contracts/tests/integration, bounded repairs and local
  commits; Luna / XHigh normal implementation, Sol / Medium integration/review.
  Maximum two subagents and one writing worker. No push, merge to main, deployment,
  paid external API, Astra, owner AGENTS edits or automatic G1 advancement.
- These approvals do not assert missing verification, complete task acceptance,
  production readiness or approval of any whole unrelated ADR.

### Final G1 acceptance audit authorization — 2026-10-19

Human project owner, "FINAL G1 ACCEPTANCE AUDIT — TSA-PLATFORM": audit the existing
G1/FOUND-002 criteria against committed reproducible evidence; verify clean install,
build/tests, boundaries and dependency evidence; repair small technical gaps within
already approved semantics using Luna / XHigh, review/test and commit locally.
Prepare the actual downstream prerequisite batch without implementing it. This
records execution scope only, not owner G1 acceptance, whole-ADR approval or missing
evidence approval. Preserve owner AGENTS.md; no push/merge, deployment, paid external
API, automatic gate advancement or unnecessary orchestration restructuring.

### Track B priority and isolated B0 authorization — 2026-10-19

Human project owner, "OWNER DIRECTIVE — PRIORITIZE TRACK B: TSA WEBSITE":
"PRIMARY PRIORITY: Track B — Working TSA Practice Website"; secondary Track A,
approximately 85/15 effort as priorities, not quotas. Explicitly authorizes a
runnable Vietnamese B0 landing/catalog/exam/navigation/answer/countdown/submit/
demonstration-result prototype using clearly labeled isolated mock adapters while
G1 is pending. No official structure/scoring/content invented; reuse existing
synthetic fixtures, never represent mocks as approved/integrated content. Minimal
frontend, local startup, automated and actual behavior verification required.

G1 audit remains READY FOR OWNER ACCEPTANCE, not accepted; no gate transition or
DATA/AUTH/BANK/EXAM implementation is authorized by B0. Existing separate one-domain
MATH-4/READING-2/SCIENCE-4 policies remain authoritative. The future ten-approved-
question integrated target does not silently authorize a combined three-domain
attempt; reconcile its profile before B1 integration. Track A limited to lawful
source inventory/quality/taxonomy/rubric preparation; no expensive benchmarking,
paid APIs or unauthorized scraping. Preserve owner AGENTS.md; no push/merge,
deployment or automatic gate advancement. This directive assigns B0 only within
these boundaries; existing blocked WEB integration cards remain blocked.

## G1 — Owner acceptance and bounded Track B execution, 2026-10-19

- Disposition: ACCEPTED by the human project owner, conditional on the mandatory
  final-audit evidence; that condition is satisfied. FOUND-002 is COMPLETED.
- Durable instruction: "OWNER DECISION — G1 ACCEPTANCE AND TRACK B EXECUTION":
  "I approve G1 acceptance, subject to the mandatory acceptance evidence established
  by the final G1 audit." Authorizes recording/committing this disposition locally.
- Accepted implementation: `0e67485ab7bd5e4873dbe74cdb903b995193e40b`; audit/evidence
  baseline `81ef8aa96ae53a63186c44eae8ccb6cb1c9b173b`,
  [final audit](../reviews/G1_ACCEPTANCE_AUDIT.md). Existing mandatory criteria PASS:
  fresh pinned install/build, 106 contract/11 emitted tests, schema/drift/private
  boundaries, deterministic vectors and dated dependency/license/advisory evidence.
  Current accepted contract tree and lockfile remain unchanged from audited code.
- Scope: existing G1 shared contracts and bounded FOUND-007 reconciliation only.
  Hosted CI remains unobserved; DB/auth/publication/provider/production evidence
  remains outside G1. No unrelated whole ADR or later gate is approved.
- Next batch additionally authorized: finalize existing B0, improve the same app
  to B0.1, prepare/execute eligible G2 prerequisites, and progress toward B1 within
  existing dependencies. Local logical commits permitted; one Luna / XHigh writer,
  Sol / Medium coordination/review; Terra only if justified, no Astra. After B0.1
  verification prioritize the earliest eligible database/backend slice. Existing
  unresolved architecture/local-stub/content-review approvals are not invented.
- Preserve owner AGENTS.md and uncommitted B0; keep gate recording separate from
  B0 implementation. No push, merge to main, deployment, paid external API or
  unauthorized semantic change. G2/G3 remain NOT ESTABLISHED.

## DATA-001 / AUTH-001 — Scoped local Track B approval, 2026-10-19

Human project owner, "OWNER APPROVAL — DATA-001 AND AUTH-001": explicitly approves
PostgreSQL with reviewed SQL migrations and server-only data access; applicable
ADR-001/003 boundaries for local Track B include relational integrity, immutable
versions/snapshots, private-data separation, transactional idempotency/concurrency.
Preserve existing frontend and G1 contracts; defer unnecessary ORM/frameworks.
Authorize local synthetic-only identity/role adapter, impossible to activate in
production, with server-side ownership/roles/session invalidation/CSRF tests.

Execution: autonomously implement/review/test/repair/commit DATA-001, AUTH-001 and
subsequently eligible Bank/exam work; Luna / XHigh default, Sol / Medium integration
and independent verification, Terra only for demonstrated complexity. This scoped
approval supersedes prior blocks on these database choices/local stub; it does not
approve whole unrelated ADRs, human content approval, missing evidence or G2/G3.
Synthetic integration fixtures remain distinct from rights-cleared inventory.
No owner AGENTS edits, push/merge, deployment, paid external API or Astra.

## Frontend UX execution scope — 2026-10-20

- Approver: human project owner, current “Autonomous Engineering Orchestrator”
  directive, sections 4, 8, 9 and 14: “authorizes autonomous local development,
  including implementation, testing, and routine technical decisions”.
- Scope: continue existing frontend from actual working tree using verified
  VN Exams research; original components, synthetic demo where integration is
  unavailable, delegated bounded work and real browser verification.
- Limits: frozen G1/API/DB/lifecycle/reuse/scoring/publication contracts preserved;
  no external attempts, protected content reuse, paid APIs, commits, push or merge.
  This is scoped execution authorization, not approval of a whole ADR or G2/G3.
- Task/evidence: WEB-B0.2 in [backlog](../tasks/TASK_BACKLOG.md); final executed
  evidence belongs in [latest handoff](../agents/LAST_HANDOFF.md).

## Autonomous local integration — 2026-10-22

Owner authorizes autonomous continued engineering in the current session. The
coordinator applies this to separate preservation/integration checkpoints and
clean-checkout PostgreSQL student verification. [Exact authority and scope](LOCAL_STUDENT_INTEGRATION_AUTHORITY_2026_10_22.md).
No question-specific rights, human review, new frozen contract or publication
approval is inferred. Owner AGENTS/unrelated research remain preserved.

## Dataset preflight engineering scope — 2026-10-20

- APPROVED scoped execution by the human project owner, 2026-10-20, current
  “accountable engineering orchestrator” directive, Phases 1–5: stop reference-UI
  reconstruction; preserve current work; audit DATA-002/003 and BANK-001/002;
  implement unblocked synthetic dataset/provenance validation and independent-review
  foundations; require actual independent code review and pinned-toolchain checks.
- Local narrowly scoped checkpoints are authorized. No push, merge, deployment,
  protected question copying, paid model API or Astra use is authorized.
- This authorizes non-publishing preflight engineering before named human review
  and lawful inventory are supplied. It does not name human reviewers, clear
  rights, approve synthetic content, accept G2/G3, change frozen G1 contracts or
  approve unrelated ADR mechanisms. Actual publication remains separately gated.
- Durable evidence: owner directive in this session, recorded here by the
  accountable Codex coordinator; implementation/evidence links follow in backlog.

## BANK-002 workflow engineering authorization — 2026-10-20

Human project owner, current “Continue TSA-Platform engineering from commit
c1b4fa7” directive: missing named humans/lawful inventory block real publication
and G2 acceptance, not implementing/testing the review system. Authorizes exact-
version/hash submission, independent approval/rejection/revision controls,
rights/equivalence/authorization guards, immutable evidence and isolated synthetic
concurrency tests, with separate engineering review. No G1 contract changes,
real publication, push/merge/deployment, Astra or paid model APIs authorized.
Use existing roles/contracts/tables; minimal additive reviewed SQL only for
necessary fixture isolation/guard and command-receipt authorization. Approval
simulation is confined to owner-initialized disposable test scope and must not
activate publication in the normal staff runtime. No named human approval, rights
attestation, production authorization, whole ADR approval or G2 acceptance follows.

## BANK-002 equivalence continuation — 2026-10-21

Human project owner “Next” continues authorized workflow engineering from416b621:
implement the recorded next monotonic equivalence adjudication/merge and late-
equivalence incident evidence using isolated synthetic fixtures. Follow existing
reuse-policy semantics: immutable versions/snapshots/history, canonical aliases,
no split/unmerge, exact-version independent review, atomic Bank revision and audit.
Minimal additive SQL may enforce those existing invariants and keep incident
probes private; no frozen G1 contract, publication authorization or whole-ADR
change follows. Real human content/rights/inventory and G2 acceptance remain gated.

## Minimum Bank safety and student-backend transition — 2026-10-21

Human project owner directive “Continue TSA-Platform from commit d9812b3” authorizes
minimum durable rights/quarantine enforcement, documented attempt cancellation/
invalidation, safe supported-MVP content validation, synthetic PostgreSQL tests
and separate review. Then audit ASSEMBLY-001/002 and begin fixture-tested student
backend groundwork. Do not wait for named humans/inventory to engineer mechanisms;
they remain real-publication/G2 acceptance gates. Follow documented withdrawal
policy without inventing new rules; retain immutable snapshots/history and frozen
G1 contracts. Reject unsupported media instead of adding speculative infrastructure.
No mock-UI polish, live student LLM, Astra, paid API, push/merge/deploy or unauthorized
publication. Existing local checkpoint authorization remains bounded to task files.

## Atomic allocation engineering authorization — 2026-10-21

- Approval identity: human project owner; durable evidence is the current instruction
  “Continue TSA-Platform engineering from commit c0b42b5” and “Implement
  ASSEMBLY-001/002 atomic allocation.”
- Scope: reuse the frozen solver/current Bank eligibility, atomically persist the
  manifest, sealed form, CREATED attempt, assignment history/revision and receipt;
  enforce H1/NEW_ONLY, receipt/error precedence and publication guards; verify
  actual PostgreSQL concurrency/rollback/security and obtain separate engineering
  review. Synthetic isolated fixtures are authorized without real publication.
- Accountable implementer Codex Sol; isolated Luna/XHigh implementation and separate
  Sol review are explicitly requested when available. Preserve owner AGENTS/UI work.
- No new frozen contracts, Bank expansion except allocation-blocking defects,
  speculative UI work, Astra/paid APIs, push/merge/deploy or real publication.
  Formal G2/G3, lawful inventory, qualified human review and Track A remain pending.

## Sustained grading and student-integration continuation — 2026-10-22

Owner instruction in the current session: “next. working until reach usage limit.”
Continues the `b094a6e` handoff: leased grading, exact scoring/release, then safe
results and application integration as executable and verified. G2/G3 acceptance
remains the recorded owner disposition; publication/content-review controls stay.
Sol owns SQL014, race/fault tests and records; actual native Luna/XHigh owns new
pure scorer/worker adapter and scoped tests; separate native Sol6.1/Medium reviews.
Recommendation reason: isolate typed arithmetic/adapter work while Sol integrates
lease/rights/score transactions; independent review audits security and concurrency.
Dedicated NOLOGIN `tsa_exam_worker` is an internal least-privilege capability for
the already-specified trusted EXAM executor. Only narrow command execution is
granted; existing student/Bank/Factory roles gain no worker or private-data access.
Runtime worker credentials require explicit operator provisioning, never HTTP roles.
No public/frozen contract change, production deployment/publication, paid LLM API,
Astra, push/merge or owner-file overwrite is authorized. All operational rate/lease
and retry choices stay explicit test/local configuration, without production claims.

## G2/G3 owner acceptance and submit continuation — 2026-10-21

**G2 and G3 OWNER_ACCEPTED** by the human repository owner in the current session:
“next. G2/G3 accepted.” [Durable disposition and scope](G2_G3_OWNER_ACCEPTANCE_2026_10_21.md).
This supersedes earlier unaccepted gate status. Actual human/question evidence
and remaining implementation limits are explicitly retained in that record.
EXAM-002 bounded submit/closure/one-job work continues from `cda1235` with Sol
SQL/integration, isolated Luna/XHigh adapters/tests and separate read-only Sol
review. No operational publication/deployment or frozen-contract changes.

## Persisted answer save continuation — 2026-10-21

- Owner identity/evidence: repository owner, current session `next.` immediately
  after local `b55afb1` start/read handoff naming persisted revisioned saves next.
- Scope: EXAM-001 answer saves using frozen contracts and existing PostgreSQL
  tables; exact-key receipts, revisions, ownership, active clock/rights guards,
  shared USER_SAVE/ATTEMPT_SAVE budgets, isolated synthetic tests and independent
  engineering review. Explicit test/local rate config; proposed operational defaults
  remain unapproved. No submit/grading/results/UI or production-publication scope.
- Integrator Codex Sol owns SQL012/shared records/race tests; actual native
  Luna/XHigh owns bounded service/HTTP/save tests; separate Sol6.1/Medium is read-only.
  Recommendation reason: isolated adapter work for Luna, coupled authorization/time
  integration for Sol, independent security/concurrency review. Sol fallback if
  Luna unavailable; existing subscriptions only, no paid model APIs.

## Persisted attempt start and safe delivery continuation — 2026-10-21

- Approval identity: human project owner; actionable instruction “Next” continues
  the latest EXAM-001 persisted start/safe GET task after local `6fc219e`.
- Authorized bounded scope: reuse frozen student DTO/HTTP boundaries and committed
  allocation; add owned first-start and lazy lifecycle reconciliation, safe sealed
  question delivery, creation transport with explicit local creation-rate config,
  actual PostgreSQL timing/ownership/concurrency/restart/security tests and separate
  engineering review. No answer-save/submission/score/result completion implied.
- Accountable engineer Sol; continuing explicit session strategy authorizes isolated
  Luna/XHigh implementation and separate Sol review where available. No production
  rate defaults are approved; test/development budgets must be supplied explicitly.
- Preserve owner AGENTS/UI/shared work, frozen G1 and all publication gates. No
  Bank expansion, UI redesign, paid model calls/Astra, push/merge/deploy or real
  publication. Human inventory/content review, full milestone and G2/G3 acceptance
  remain outstanding.

## ADR-001 — Transactional application stack

- Status: PROPOSED; approval: none; revision: 2.
- Problem: deliver a correct small-team vertical slice with transferable contracts and minimal runtime overhead.
- Options: Next.js/TypeScript modular monolith; Next.js + FastAPI; Django-based application; microservices.
- Proposed choice: Next.js server HTTP adapters + isolated TypeScript modules + PostgreSQL; Drizzle with reviewed SQL migrations. Same codebase worker handles durable grading. [Architecture](../architecture/SYSTEM_ARCHITECTURE.md) owns boundaries.
- Tradeoffs: one language/deployment family reduces integration burden; Python libraries would be easier for later symbolic/psychometric tasks. Next.js requires disciplined server-only DTO and cache boundaries.
- Consequences: no separate Python API, Redis or optimizer required for first slice. Runtime/package versions selected and tested in FOUND-002, not assumed current from research.
- Migration/rollback: contracts and frozen artifacts permit later Python worker; introducing a second transactional backend requires migration ownership and concurrency review. Before implementation, changing proposal costs documents only; after implementation, no wholesale rewrite without impact plan.
- Blocks: FOUND-002 and dependent application tasks.

## ADR-002 — Scope and practice content

- Status: PROPOSED; approval: none; revision: 2.
- Problem: first complete exam must not depend on large data acquisition or AI quality.
- Options: full reference exam plus five types at launch; short human-authored practice profile; AI-first content.
- Proposed choice: [MVP scope](../specifications/MVP_SCOPE.md), three interaction types, 30 independently authored/reviewed questions and short personalized practice form; independent AI research begins early, while the full reference profile remains later.
- Tradeoffs: smaller verified slice can ship sooner; does not reproduce full official format. Content work still needs independent human expertise.
- Consequences: label profile explicitly as independent; no official similarity score/branding. Human content reviewer distinct from author is mandatory.
- Migration/rollback: add schemas/renderers/profiles without modifying sealed forms. Changing starting profile creates a new blueprint version.
- Blocks: DATA-002, BANK-001, WEB-001 and initial product acceptance.

## ADR-003 — Versioning, relational model and contracts

- Status: PROPOSED; approval: none; revision: 3.
- Problem: prevent mutable bank edits, approval changes and integration drift from corrupting exams.
- Options: editable question rows and dynamic forms; immutable versions with references only; immutable versions plus frozen delivery/private snapshots.
- Proposed choice: final option; typed JSONB content with relational identity/provenance links, physically separate secrets, append-only reviews, explicit HTTP v1 contracts, current workflow projections, transaction-enforced idempotency. Canonical definitions in [question schema](../specifications/QUESTION_SCHEMA.md), [database](../architecture/DATABASE_DESIGN.md) and [API](../architecture/API_CONTRACTS.md).
- Tradeoffs: more snapshot storage and migration care; simple reproducible scoring and safe DTO boundaries. Database/private table separation supports discipline but does not by itself guarantee leak prevention.
- Consequences: each saved edit creates a version; no approval inheritance. Cross-module parallel implementation waits for contract fixture approval.
- Migration/rollback: version readers remain available for historical snapshots. Expand/backfill/contract migrations; never rollback by mutating exam history. Erasure is a separate audited retention process.
- Blocks: DATA-001 and all independently implemented contract consumers.

## ADR-004 — Assembly, timing and scoring policy

- Status: PROPOSED; approval: none; revision: 3.
- Problem: define correct behavior where official navigation/scoring details are not reproducible.
- Options: independent one-domain attempts vs a continuous multi-domain attempt; raw vs inferred IRT; greedy vs bounded backtracking vs solver.
- Proposed choice beyond scoped H1/H2/H3 approval: one configured server-timed section per MVP domain attempt, revisioned saves, durable idempotent submission, exact binary practice scoring and after-grade release; constrained seeded selection with bounded backtracking and stored inventory manifest. Future multi-section navigation needs separate approval. See [engine](../specifications/EXAM_ENGINE_SPEC.md) and [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md).
- Tradeoffs: explicit deadlines can reject late network writes; simple scoring lacks official/cross-form equivalence; bounded search can fail on feasible inventories. Coarse bank publication lock sacrifices editorial concurrency for simple integrity.
- Consequences: UI must show acknowledged saves and explain timing/score rules. No silent constraint relaxation, grace period or inferred official score.
- Migration/rollback: policies/algorithms are version-pinned per form. Future timing/scoring/solver versions apply to new forms; old attempts retain original policies.
- Blocks: ASSEMBLY-001, EXAM-001/002, SCORE-001, WEB-001.

Scoped approval (H1 only): APPROVED BY HUMAN OWNER on 2026-10-17, recorded from the owner's TASK REPAIR-H1-001 instruction in this session. Approval identity: human project owner. Exact approved decision: “Each student may have at most ONE active examination attempt across ALL practice modes.” Active states are CREATED and IN_PROGRESS; modes are PERSONALIZED_PRACTICE and PUBLISHED_FIXED. A student with an existing active attempt cannot create another active attempt, may resume that attempt when its state permits, and may create a new attempt after the previous attempt reaches a terminal state. The owner explicitly stated, “This approval covers H1 only. Do NOT approve H2, H3, or the entire ADR-004.” No additional conditions were stated. The global database uniqueness and create-conflict contract below implement this scoped approval; timing, scoring, H2, H3 and the remaining ADR-004 proposal were not approved by that H1 instruction. Later separate H2/H3 approvals follow.

Scoped approval (H2): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-FIX-03A instruction, section 2: “Use admission-only windows. An attempt must be created and started during the applicable admission interval: [available_from, available_until). After a valid start, normal exam duration may extend beyond admission closing. Rights withdrawal and security invalidation remain independently enforceable.” This applies to each independently created domain test in either practice mode. It approves admission semantics only; the separate approved start-TTL scope is recorded below, and the rest of ADR-004 remains unapproved.

Scoped approval (H3): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-FIX-03A instruction, sections 2–4: “Each practice test contains exactly ONE TSA domain section”; the valid domains are MATH, READING and SCIENCE; “Each domain is a separate test with its own attempt, clock, submission, scoring result, and history. Do not automatically chain domain tests.” MVP profiles are 4 MATH, 2 READING and 4 SCIENCE questions per independent test. One section entry per MVP blueprint retains its opaque ID distinct from the domain enum. This is an MVP product constraint, not a permanent prohibition of generic multi-section blueprints. The overall ADR-004 remains PROPOSED; no unrelated ADR is approved.

Scoped approval (MVP Start TTL): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-TTL-001 instruction. Exact approved decision: new MVP attempts transitioning from CREATED to IN_PROGRESS have a mandatory 10-minute start TTL (600 seconds); unlimited start TTL is not approved. At creation, persist `start_before_at = min(created_at + 600 seconds, admission_until_at_creation)` as `TIMESTAMPTZ NOT NULL`. First start requires `now < start_before_at`; equality rejects. The stored deadline is immutable, `CreationReceipt.startBefore` uses it, `AttemptView.startBefore` returns it only while CREATED, and idempotent replay returns the original committed value. Missing or invalid required TTL configuration rejects creation or offering activation; it never falls back to unlimited time. Ordinary availability edits affecting already CREATED attempts are covered by the separate scoped approval below; withdrawal, rights and security guards remain independently enforceable. This scoped approval does not approve the remainder of ADR-004 or any unrelated ADR.

Scoped approval (non-retroactive ordinary admission-schedule edits): APPROVED BY HUMAN OWNER on 2026-10-17. Approval identity: human project owner; durable evidence: the owner's TASK FINAL-DECISION-001 instruction. Exact approved decision: ordinary edits to a form's admission schedule apply only to newly created attempts. An existing CREATED attempt preserves its originally committed start eligibility and immutable `start_before_at`; a later ordinary extension or shortening must not recalculate, invalidate, or otherwise change that deadline. An existing CREATED attempt may start strictly before its committed deadline if it remains CREATED, belongs to the authenticated student, and has no withdrawal, content-rights, or security-invalidation restriction. Do not recheck mutable current admission windows as an additional start-time restriction for that existing attempt. Explicit withdrawal, rights revocation, and security invalidation remain independent overriding restrictions. This approval is limited to ordinary admission-schedule edits and does not approve the remainder of ADR-004 or any unrelated ADR.

## ADR-005 — Independent AI authoring pipeline

- Status: PROPOSED; approval: none; revision: 2; early independent Track A, not a website runtime prerequisite.
- Problem: reduce authoring effort without binding bank schema to a vendor or trusting generated answers.
- Options: synchronous generation/publish, provider-specific direct DB writes, asynchronous provider-neutral draft pipeline.
- Proposed choice: [AI pipeline](../specifications/AI_QUESTION_PIPELINE.md), source-rights gate, provider adapters, typed output, independent verification, human approval and persistent runs/cost evidence.
- Tradeoffs: human review/cost limits slow throughput; provider-neutral contracts need adapter maintenance. Independent LLM judgments remain heuristic.
- Consequences: no generator publication privilege, no student PII/provider uploads by default, no need for AI to take an exam.
- Migration/rollback: disable dispatch or change adapter after evaluation; existing approved versions remain valid unless incident review requires quarantine. Raw output schema stays outside canonical domain.
- Blocks: AI-001/002 only; not the core exam slice.

## ADR-006 — Identity, deployment, retention and operational envelope

- Status: PROPOSED; approval: none; revision: 3; provider/region/budget unresolved.
- Problem: select deployable infrastructure and data policy without inventing audience size or legal permission.
- Options: managed OIDC vs self-hosted identity; managed Node/PostgreSQL vs self-managed VPS; long-lived worker vs platform jobs; various regions and retention windows.
- Proposed choice: maintained OIDC integration with server session and staff MFA; managed Node/PostgreSQL plus worker, private media as needed; minimal identity collection. Retention proposal in [database](../architecture/DATABASE_DESIGN.md), cost/operations in [architecture](../architecture/SYSTEM_ARCHITECTURE.md).
- Tradeoffs: managed services cost money but reduce operational burden; overseas processing/minor users and retention require specific review. No vendor/pricing commitment is made.
- Consequences: local synthetic-data work may proceed after ADR-001–004 and an explicitly approved development identity stub; public deployment, real user collection and production identity configuration wait for this decision's completed data-flow/provider review.
- Migration/rollback: portable OIDC issuer/subject mapping, storage adapter and PostgreSQL backups. IdP migration must preserve local subject IDs and require account linking proof. Export/erase according to approved policy; no casual user-ID remapping.
- Blocks: AUTH-001 production adapter and OPS-001/public launch; owner may explicitly approve local-only stub scope earlier.

## Owner review queue

| Question | Proposed direction / missing input | Owner / task |
|---|---|---|
| Record scoped G0 implementation authorization? | RECORDED 2026-10-17: development and implementation are authorized within the scope and conditions above; paid LLM API calls remain prohibited until separately authorized. This is not approval of any ADR or production readiness. | Human owner / FOUND-004 |
| Approve initial technical/scope baseline? | ADR-001–004 plus ADR-007 as a coherent website bundle; ADR-005/008 for factory; document changes before dependent coding | Human owner / FOUND-004 |
| Who writes and independently reviews Vietnamese content? | Two distinct human actors; availability unknown | Human owner / DATA-002 |
| Enable a full TSA reference profile later? | Verify original structure image and newer official guidance; sufficient approved inventory | Human owner / FOUND-003, CONTENT-001 |
| Public or private pilot, ages, jurisdiction, identity provider and region? | No real-user launch until data-flow review and provider choice | Human owner / AUTH-001, OPS-001 |
| Budget, concurrent users, availability/RPO/RTO? | Measure against owner-specified traffic; research values are not commitments | Human owner / OPS-001 |
| Approve retention and incident invalidation policy? | Review proposed windows, withdrawal and erasure consequences | Human owner / OPS-001 |
| Which AI provider/model, input permissions and quality targets? | Evaluate early in independent Track A; no vendor preference approved | Human owner / AI-001/002 |

FOUND-004 has an independent review artifact and now has a scoped G0 implementation authorization record. Its broader owner disposition remains incomplete for unresolved ADR mechanisms, provider/data/budget/retention/rights/reviewer inputs and any other listed conditions. FOUND-005 owns reconciliation, not architectural approval. No approval is inferred from the reviewer's APPROVE_WITH_CHANGES recommendation.

## Phase 02.5 history and continuing owner choices

Historical reconciliation (superseded where Phase 02.75 amendments below conflict): ADR-003 revision 2 clarifies typed quota/taxonomy validation, shared contract CI enforcement, aggregate sealing assertions, role-filtered diagnostics, proposed active-attempt uniqueness and latest-only answer storage. ADR-004 revision 2 pins PRNG/shuffle behavior, exact score rounding, cancellation/admission/retake semantics, section uniqueness and preserves lifetime exposure. ADR-006 revision 2 adds lifecycle-pinned idempotency retention and shared database save throttling. ADR-001/002/005 remain revision 1; scope, stack and AI separation are unchanged. These revisions supersede draft text only, not an approved baseline.

| Choice | Alternatives and tradeoffs | Proposed selection / approval status |
|---|---|---|
| H1 Active attempts across modes | Parallel personal/fixed attempts add confusing sessions and simultaneous question-set allocation; one active attempt constrains UX without preventing answer sharing or sequential inventory exhaustion | APPROVED BY HUMAN OWNER on 2026-10-17 for one CREATED/IN_PROGRESS attempt per user globally across PERSONALIZED_PRACTICE and PUBLISHED_FIXED; a conflicting creation reports the existing attempt for permitted resume, and a new attempt is allowed after closure, including pending grading. Evidence: owner TASK REPAIR-H1-001 instruction quoted in ADR-004 scoped approval above. |
| H2 Availability meaning | Strict full-duration fit inside window closes admission early; admission-only window allows full duration after end and needs rights coverage beyond end | APPROVED BY HUMAN OWNER on 2026-10-17: `[from,until)` checked at create and first start; admitted clocks continue. Evidence: TASK FINAL-FIX-03A scoped approval above. |
| H3 MVP test composition | A combined 4/2/4 attempt forces three domains into one lifecycle; independent domain tests provide separate selection, timing and results | APPROVED BY HUMAN OWNER on 2026-10-17: exactly one MATH, READING or SCIENCE entry per MVP test/blueprint; separate attempt and result, no automatic chaining. Evidence: TASK FINAL-FIX-03A scoped approval above. Generic future multi-section modeling remains open. |
| MVP Start TTL | An unstarted reservation needs a bounded, durable start deadline without changing H2 admission-only semantics | APPROVED BY HUMAN OWNER on 2026-10-17: mandatory 600-second TTL; persist `min(created_at + 600 seconds, admission_until_at_creation)`, reject equality at first start, and do not fall back to unlimited time. Evidence: TASK FINAL-TTL-001 scoped approval above. |
| Ordinary admission edits after CREATED | Retroactive edits can invalidate a reservation after allocation; non-retroactive edits preserve a committed reservation while withdrawal, rights, and security remain able to block delivery | APPROVED BY HUMAN OWNER on 2026-10-17: ordinary admission schedule extensions/shortenings affect only future creation requests. Existing CREATED attempts retain their committed immutable `start_before_at` and may start strictly before it without a mutable-current-window check, subject to state, ownership, withdrawal, rights, and security guards. Evidence: TASK FINAL-DECISION-001 scoped approval above. |

ADR-004 remains PROPOSED as a whole. H1, H2, MVP H3, the separate MVP Start TTL, and non-retroactive ordinary admission-schedule edits are scoped approvals; their dependent contracts still require synchronized implementation review. Additional owner review: ADR-003 role trust/disclosure and no full answer-edit history; ADR-006 retention floors, rate defaults and operational budget. No claim that rate numbers are load-tested or retention is legally approved.

Impact/migration: H1 changes attempts uniqueness and create-conflict API; H2 changes catalog metadata, start guard and cancellation reasons; H3 replaces the combined MVP fixture with three independently offered one-section profiles, affecting blueprint validation, form sections, student selection, timing, results and history. Quota typing adds a required taxonomyVersionId; diagnostics add a restricted read endpoint; rate limits add one small ephemeral DB table; retention adds a nullable related-attempt link/expiry semantics. Affected tasks: FOUND-002, DATA-001, AUTH-001, ASSEMBLY-001, EXAM-001/002, SCORE-001, WEB-001/002 and OPS-001. There is no deployed data/code to migrate. Future persisted combined forms would require versioned compatibility, never mutation of historical snapshots. Coordinate strict-client contract regeneration and one-domain fixture tests. If a future bundle is approved, add a separate grouping contract without rewriting domain attempts or manufacturing an official aggregate score. No new service, secure-exam feature, forensic store or full-TSA scope is introduced.

## Phase 02.75 owner requirements and revision impact

Recorded 2026-10-16 from the owner's Phase 02.75 assignment: “The website must NEVER require live LLM inference to create or complete a student exam”; “PERSONALIZED_PRACTICE is the default mode”; prior assignments exclude stable question identity for that student, concurrent requests must not bypass this rule, different students may reuse questions, shortage must be explicit, and both research and website tracks begin early. These are authoritative product requirements, **not approval of the implementation choices below**. At that time no architectural approval identity/evidence existed; the later, narrowly scoped H1 approval is recorded above.

Phase 02.75 proposed revisions: ADR-001 r2 adds a separately executable factory runtime in the same repository; ADR-002 r2 places strict personalized no-repeat in MVP and starts independent AI research early; ADR-003 r3 adds ownership, compact assignment history, equivalence groups and factory import contracts; ADR-004 r3 replaces global exposure caps with per-user eligibility. Its earlier fixed-form H1 proposal is superseded by the scoped global H1 approval above. ADR-005 r2 is early draft-only research/production, not deferred until the website; ADR-006 r3 adds factory credentials/resource limits, create throttling and active-account compact history retention. Other timing/scoring/immutability/approval safeguards remain valid. Previous review reports describe their historical baseline and are preserved verbatim.

Migration impact: proposed create/catalog/result DTOs, forms/attempt constraints, assembly manifests, allocation transactions, bank eligibility revision, retention and task dependencies change together. There is no implemented schema to migrate. A future upgrade must backfill stable-ID assignments from every retained form/attempt before NEW_ONLY is enabled; missing historical evidence must be disclosed, never presented as complete no-repeat. Backfill singleton/confirmed equivalence groups and mode/ownership from proven records, not guesses. Rollback must disable new admissions if readers are incompatible, preserve history/snapshots and keep supported old readers; never discard history to restore availability. No mandatory quota or no-repeat fallback is authorized.

## ADR-007 — Personalized allocation and question reuse

- Status: PROPOSED; approval: none; revision: 1.
- Problem: reusable global stock must provide strictly unseen assignments per student, including corrected versions, equivalent variants and concurrent creation.
- Options: global consumption; version-only history; stable-ID history checked without locking; stable-ID history plus canonical equivalence and per-user transactional allocation.
- Proposed choice: final option, [reuse policy](../specifications/QUESTION_REUSE_POLICY.md) and [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md). One snapshot schema supports owned personal forms and shared fixed forms. Assignment occurs at CREATED commit; conservative monotonic equivalence merges; explicit opt-in review/fixed modes.
- Tradeoffs: compact active-account history, personal snapshots and protected replay manifests cost storage. Abandoned allocations exhaust small banks sooner. Per-user serialization limits races without globally serializing different students; shared/exclusive bank revision guard coordinates publication. Late-discovered equivalence cannot retroactively prevent past assignments.
- Consequences: shortage is a normal explicit outcome, never silent repetition or a live AI request. The owner-approved 600-second MVP start TTL bounds first-start admission, not assignment retention; equivalence adjudication, retention/erasure and explicit-repeat UX remain owner decisions. Different students share inventory; global usage is analytics only.
- Migration/rollback: coordinated changes described above; no schema duplication for modes. Do not reset assignment history or mutate historical forms on rollback.
- Blocks: DATA-001, BANK-001, ASSEMBLY-001, EXAM-001, WEB-001 and strict-new practice acceptance.

## ADR-008 — Independently scheduled question factory and early research

- Status: PROPOSED; approval: none; revision: 1.
- Problem: explore AI feasibility early and replenish shortages without student-path inference or factory failures interrupting exams.
- Options: synchronous student generation; new microservice/broker infrastructure; separate executable with shared contracts and existing PostgreSQL job infrastructure.
- Proposed choice: separate TypeScript/Node entry point, manual/weekly scheduler, bounded inventory-driven batches and distinct credentials/pools; [factory specification](../specifications/QUESTION_FACTORY_SPEC.md). Reuse jobs and canonical draft/review/publication, add only batch/item/run/import identity records. Independent fixtures and fake/provider adapters permit research without web deployment.
- Tradeoffs: shared DB remains a common failure/resource domain; budgets, concurrency, small transactions and workload tests are essential. No claim of hard availability isolation from total DB failure. Separating DB/service later needs measured contention or security evidence, not speculation.
- Consequences: owner approves schedule/timezone, live-provider data terms/budget, review capacity, acceptance thresholds and resource envelope. Factory cannot approve content or read students; web has no provider credentials. INT-001 proves approved AI content enters the ordinary bank and exams work with factory disabled.
- Migration/rollback: versioned factory-package/1 imports are idempotent; scheduler can be disabled or adapter replaced while durable drafts remain recoverable and existing published questions remain usable. Expand shared job kinds with executor allowlists; never let factory workers claim grading jobs.
- Blocks: AI-001/002, FACTORY-001 and INT-001; not the manually seeded website milestone.

Owner approval queue additionally covers ADR-007/008 and all revised scopes above. Fundamentals in the owner's requirement are not reopened as optional features; the proposed mechanisms and parameter values still need approval.

### Direct authenticated frontend research scope — 2026-10-20

Approval identity: human project owner. Evidence: current “Human-in-the-Loop
UI Reverse Engineering Orchestrator” directive, manual login DONE, manual attempt
entry screenshot/DONE, explicit manual-submission choice then SUBMITTED, and
three manual result/review/solution screenshots followed by DONE.

Scope: local browser preparation, content-free authenticated UI measurements,
private ignored screenshot evidence and original compatible frontend
reconstruction after the evidence gate. Owner alone performed authentication,
reference attempt entry and submission. No additional external attempt, automated
submission, credential access/export, protected content reuse, commit/push/merge,
frozen-contract/schema/security or production-service change is approved.
Manual evidence now satisfies the taking/result/review visual gate; exact matching
result viewports and detail PNG remain unavailable and must be labeled as such.

Catalog/detail evidence continuation: on2026-10-20 the owner supplied actual
reference catalog/card and detail PNGs after local images were excluded.
`owner-catalog-details-provenance.json` records verified1920x1080 files and SHA
in ignored research storage. This resolves the visual checkpoint for compatible
catalog/detail changes; it does not authorize new reference attempts, copied
history/branding/assets, fabricated inventory or any contract change.

## INT-003-R — scoped offline capture research,2026-10-28

Human owner explicitly authorized the current offline parser/analysis task and
separate Reading20 diagnosis. [Scope/evidence/impact](INT_003_CAPTURE_RESEARCH_SCOPE.md).
This does not approve broader ADR-005/008, source rights, external upload, Bank
import, publication or training. No shared contracts or student runtime changed.
