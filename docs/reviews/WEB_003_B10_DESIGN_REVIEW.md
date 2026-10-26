# WEB-003 B10.1 source mapping and independent design review

2026-10-26, source5b37a30 / records3d41eb3. Root authored selected decision and
repairs; no B10 implementation or runtime evidence at this record's creation.
[Exact decision](../decisions/WEB_003_B10_FIXED_STUDENT_DECISION.md).

Actual read-only Codex explorer `/root/b10_fixed_student_scout` mapped dependencies,
no files changed/tests executed. Model not reported by tool; recommended Codex
Sol6.1/High when available, inherited explorer session used. Confirmed frozen fixed
catalog/create/receipt/view/history support, personal-only StudentShortage, missing
runtime catalog/parser/SDK/assignment, mode-neutral owned lifecycle and actual fixed
trigger timing. B9 approval is staff-only; standing engineering delegation supports
a separate bounded technical selection without claiming new human approval.

Actual independent native Sol6.1/Medium `/root/b9_design_review`, read-only, inspected
decision/authority/handoff/backlog, frozen schemas, directory/allocation/attempt/
HTTP/identity source, migrations002/008/009/010/011/012/017/022 and relevant engine/
assembly/API/database specifications. Targeted reads/searches and git diff --check
PASS. No runtime tests or file edits, no content/rights/production attestation.

Two P2 compatibility/policy findings repaired and independently rechecked:

1. Original design classified all outside-admission requests409. Existing engine
   requires before-open409 FORM_NOT_OPEN and at/after-close410 FORM_UNAVAILABLE.
   The selected design now preserves that split, including exact close equality.
2. Original design introduced rights coverage through latest possible reservation
   Start+duration. Existing lifecycle checks current rights at creation and covers
   the actual started deadline at Start. Root removed the unneeded stricter admission
   prerequisite; no personal/helper timing/rights policy is changed.

One precision recommendation implemented: exact internally versioned v2 fixed-phase
cursor with afterFormId:null unconsumed sentinel, canonical key order, exhaustion
null and flag-off422. This preserves exact-limit personal→fixed transition and old
v1 cursors without changing opaque external cursor schema. Runtime tests remain
required; no code failure is claimed by a design recommendation.

Reviewer found separate standing-delegation selection correctly distinguished from
B9, no frozen public DTO changes needed, and narrow new candidate EXECUTE remains
a security boundary requiring current candidate checks, owner receipts/H1/history
and zero raw grants. B9's frozen false literal remains historical seal-operation
scope, not live student access. No other design finding in inspected scope.
Final exact cursor/null-sentinel and rights/admission wording independently rechecked satisfactory. Implementation/runtime evidence is tracked separately; design review alone is not runtime acceptance.
