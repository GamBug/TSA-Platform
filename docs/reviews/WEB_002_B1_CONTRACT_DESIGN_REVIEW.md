# WEB-002 B1 private inspection — design review

2026-10-23, branch `feat/track-b-data-auth`, starting `0e9b4fa`. Accountable
designer/integrator: Codex root. This continuation prepares the next exact private
staff contract; it implements no endpoint, permission, migration or validator.
Owner AGENTS.md/research changes remain preserved and excluded.

Proposal: [B1.2](../decisions/WEB_002_REVIEW_CONTEXT_V1_PROPOSED.md).
Status: **INDEPENDENTLY_REVIEWED DESIGN / HUMAN_APPROVAL_REQUIRED**.
Reviewed proposal SHA-256:
`94d81d1c574dff0b9d8c9338a3559d1c88aa9629f17743a1171bdc2c9b074392`.

## Design outcome

One private staff GET, exact immutable version identity, rights-gated question/
answer/explanation/stimulus preview, current source-rights metadata, strict errors
and bounded read-only behavior. Raw rights documents, private reviewer notes,
review/publication commands, assembly diagnostics and image-byte serving remain
outside the increment. Student/released contracts remain stable.

Access recommendation is explicit: current BANK_MANAGER; current AUTHOR with
trusted local creation evidence; or current independent REVIEWER for IN_REVIEW
versions. An imported creator UUID cannot establish author ownership. The design
includes a narrow migration019 Boolean authorship predicate so Bank need not gain
raw audit SELECT access. Rights UNKNOWN or adverse/held states yield metadata
without private preview content. No normal source is promoted for demonstration.

## Actual independent review

Separate native agent `/root/lifecycle_review`, Codex Sol6.1/Medium, read-only.
Initial B1.1 review found two P2 issues:

1. AUTHOR_OWN required creation-audit evidence but tsa_bank has only INSERT on
   audit_events. No suitable current read predicate existed. A migration/grant
   impact was necessary before a single approval could authorize implementation.
2. AUTHOR_OWN needed an explicit current AUTHOR role, rather than leaving historic
   authorship as an independently sufficient basis after role removal.

Root repaired both in B1.2: narrow STABLE/SECURITY DEFINER fixed-search-path Boolean
function, PUBLIC execution revoked/Bank-only execution, no raw-audit grant,
explicit current-role predicates, role-removal/function/grant/upgrade tests and
bounded rollback. Additive private staff export is permitted while preserving
all existing export entries and student semantics.

The reviewer reread the complete revised proposal and companion decision diff.
Final outcome: both findings resolved; no concrete blocking findings. It explicitly
confirmed that one owner approval of B1.2 as a whole is sufficiently specific to
begin this bounded implementation, including migration019/private staff subpath.
That engineering opinion is not owner approval or runtime/security-test evidence.

Actual independent checks used `cat`, `git diff`, `git status --short`, `rg`, `sed`
and numbered-line inspection against Bank auth/import/publication/graph helpers
and migration grants; scoped whitespace passed. No runtime tests executed, no
files written by reviewer, no dependency/database/Git mutations or external calls.

## Coordinator verification and handoff

`npm run docs:check`: PASS, zero errors, existing historical whitespace warning.
Scoped `git diff --check`: PASS. Runtime/application tests **NOT_EXECUTED** because
this is a documentation-only proposal; prior passing application evidence is not
attributed to this design task. Source inspection, not live permission tests,
establishes the described existing grant gap. Runtime acceptance commands and
negative tests are specified for execution only after owner authorization.

The owner continuation `NEXT` did not select a route/access matrix or approve
new private fields. An explicit approval question for B1.2 as a whole was sent;
no answer is recorded in this review. Do not treat default UI selection, elapsed
time, engineering review or a proposal as approval. Record the actual owner
identity/date/exact revision/scope and durable evidence in OPEN_DECISIONS before
implementation if approval arrives.

Recommended next implementer: Codex Sol6.1/High for authorization/private DTO
integration; available Luna/XHigh for bounded frontend, otherwise Sol directly;
separate Sol6.1/Medium independent runtime/security review. Existing subscriptions
only, no paid APIs/Astra. Full WEB-002, real30-item stock, qualified human review,
manual accessibility and production readiness remain separate.
