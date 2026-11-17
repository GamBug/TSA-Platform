# INT-003-R offline capture research scope

- Approval identity/date: human project owner,2026-10-28 Asia/Bangkok.
- Durable evidence: current owner task “Continue TSA-Platform from the current
  INT-003 handoff”, objective “Build an offline research tool that analyzes
  operator-supplied TSA Reading question captures saved as .txt files.” Its scope
  expressly requires parser, analysis, private provenance, reports, taxonomy,
  generation specification, focused tests and separate dev:b0/Reading20 diagnosis.
- This is scoped implementation authorization, not approval of ADR-005/008,
  rights, source correctness, human review, model training, external source upload,
  production Bank import or publication. No commit/push/merge/deploy authorized.
- Accountable implementer: root/current Codex. No delegation or independent review
  performed. Existing owner and previous INT-003 edits preserved.
- Isolation/impact: new dependency-free Node research executable and synthetic
  tests. Private raw content and extraction under ignored `.local/reading-research`;
  separate structural reports omit excerpts. No runtime, schema, DB, package,
  validator or public-asset changes. Existing contracts remain stable; no migration.
- Source handling: explicit manifest paths only, original bytes and hashes retained,
  unknown rights honest, no automatic acquisition, network or provider dispatch.
  Generated guide instructs authors to use separately authorized original passages.
- Acceptance boundary: automated synthetic engineering checks can pass while
  actual-source extraction and dataset representativeness remain unverified.
  One-to-three-file operator pilot must be reviewed before a larger batch.
- Rollback: stop invoking this separate executable; manually retain/delete private
  run directories according to operator needs. Existing Factory/Bank/student paths
  are unaffected.
