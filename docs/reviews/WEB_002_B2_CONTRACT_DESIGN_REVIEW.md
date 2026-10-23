# WEB-002 B2.1 recorded evidence — independent design review

2026-10-23, branch `feat/track-b-data-auth`, implementation base `147dd71`.
Root is accountable designer and sole documentation writer. Existing owner
AGENTS.md/untracked research remain preserved and excluded. No B2 runtime code,
DTO, UI, migration or privilege was implemented in this design checkpoint.

Proposal: [exact B2.1](../decisions/WEB_002_B2_RIGHTS_EVIDENCE_PROPOSAL.md).
Status: **INDEPENDENTLY_REVIEWED DESIGN / HUMAN_APPROVAL_REQUIRED**.
Reviewed SHA-256:
`62f714f3f1c5621d9c866163352c285cb16db4e6d6d7553a44606bede8b4d923`.

Current disposition (2026-10-24): the explicit owner approval is now recorded in
[decisions](../decisions/OPEN_DECISIONS.md#web-002-b21--owner-approved-recorded-evidence-read-2026-10-23),
and [runtime verification](WEB_002_B2_RUNTIME_VERIFICATION.md) is separate. The
approval-pending/no-implementation statements below describe this earlier design
checkpoint; they are not the current engineering state.

## Actual review and repair

Separate native `/root/lifecycle_review`, configured Codex Sol6.1/Medium, read-only,
inspected B2, frozen B1, actual rights command/storage and Bank grants. It found
one P2: the initial draft promised exact evidence text while appearing to prohibit
names/IDs/URLs/paths which arbitrary valid stored text can contain. That made the
proposed private disclosure scope contradictory before owner approval.

Root repaired the proposal by explicitly limiting exclusions to additional
structured fields, and making **verbatim current evidence text** part of the new
owner decision. It may contain pasted sensitive identifiers or question/key text;
no redaction or absence guarantee is claimed. Only BANK_MANAGER or an independent
current REVIEWER for IN_REVIEW versions may access it, with the exact B1 author/
operator exclusions. AUTHOR alone and students remain forbidden. B1 has no new
field, no preview gate bypass and no changed frozen bytes. URI text is inert and
provides no file/media retrieval authority. Synthetic staff are not human reviewers.

Reviewer reread the complete revised proposal and confirmed the P2 resolved,
with no remaining concrete blockers. It judged an explicit whole-B2.1 owner
approval sufficiently specific to begin this bounded implementation. That is
engineering design review, not owner approval, runtime verification or legal
acceptance. No answer is inferred from B1 approval or standing `NEXT` instructions.

Actual independent checks: `cat`, `git diff/status`, `rg`, numbered-line inspection
of the proposal, frozen B1, rights command/storage and grants; supplemental full
proposal reread and unchanged inspected student schemas/B1 service confirmation.
No runtime tests executed, files touched, dependencies, commits or external calls.

## Handoff

Coordinator `npm run docs:check`: PASS/zero errors, one preserved historical
whitespace warning. Scoped staged `git diff --cached --check`: PASS.
B2 runtime tests **NOT_EXECUTED**: there is no implementation. The previous B1
passing suites above this checkpoint remain B1 evidence only. One new read with a
strict private DTO/UI action, rollback/impact and real auth/security/browser
acceptance are specified in the proposal for execution after explicit approval.

Recommended implementation: Codex Sol6.1/High for private authorization/projection;
available Luna/XHigh for bounded UI with Sol fallback; separate Sol6.1/Medium
independent runtime review. Existing subscriptions only, no paid LLM API/Astra.
B1 is complete within its approved engineering increment; full WEB-002, lawful
inventory, qualified content/accessibility evidence and production remain distinct.
