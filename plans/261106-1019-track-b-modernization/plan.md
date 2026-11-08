# Track B modernization

Status: IN_PROGRESS. Accountable implementer: current Codex controller. Source: a70861a412e0a1c88566f25cc42232c9f7987283, feat/track-b-data-auth. Owner explicitly authorized local implementation and delegation on 2026-11-06; no commit, deployment, production database or paid API authority.

## Outcome and boundaries

Deliver real taxonomy-backed topic practice, connected entry screens, responsive exam navigation and safe discoverable shortcuts. Preserve existing frozen student DTOs, question eligibility, ownership, sealed grading, disclosure and acknowledged-save invariants. Preserve all pre-existing dirty files. No Track A rewrite or framework migration. Synthetic fixtures remain explicitly labeled.

## Phases and ownership

1. Controller: reconnaissance, baseline, entry/topic frontend, staff classification, integration and documentation.
2. Backend delegate: new topic-practice service/handler/tests, minimal allocation/profile hooks, SQL027 and student runtime integration; reuse allocation lifecycle. Controller reviews SQL before execution.
3. Exam delegate: exam-only main.js functions, exam-specific styles and shortcut helper/tests. Controller owns catalog/entry functions in the same file; patch only bounded regions.
4. Controller: integrated tests/browser evidence and separate read-only review after implementers finish.

## Acceptance

AC-01–12 from owner mission: real hierarchical catalog; multi-topic selection; eligible allocation; responsive exam; safe shortcuts; persistence; taxonomy staff compatibility; privacy/security; executed tests and independent review; existing-app integration; reproducible local demo. Inventory shortage and absent taxonomies must be honest empty states.

## Baseline and environment

Node24.18.0/npm11.16.0 match package engines. Git origin fetch succeeded; HEAD and origin branch are equal (0 ahead/0 behind). Existing tree contains extensive unrelated recovery work, preserved. AgentKit3.0.0 installed; Engineer CLI list returned no agents, while runtime exposes kit tools. Kit Explore failed because gpt-5.4-mini is unsupported by this account; supported native workers used without configuration changes or paid API calls.

## Design brief

Register: Product. Scene: students practicing with focused desktop and touch interfaces. Direction: calm educational workspace based on existing product and supplied references. Color: restrained existing neutral surfaces, dark text, red accent. Type: existing Be Vietnam Pro. Signature: numbered question rail and clear topic hierarchy. Dials: variance3, motion1, density6.

## Verification and rollback

Run narrow new service/helper tests, existing build/type/contracts and affected student/bank/assembly/browser tests using disposable PostgreSQL fixtures. Back up before any schema/data change; no production mutation. Record actual commands/results in final report. Rollback is scoped reversal of this mission's patches only; never reset dirty work.

Migration coordination: the runner rejects applying a lower number after a higher number. No SQL027 exists yet; topic practice takes the next027 slot. The inherited media plan must use the next available number when it implements its still-unwritten migration, rather than inserting027 after topic practice. No applied migration is renamed.

## Execution checkpoint2026-11-06

Core implemented and verified locally; full mission remains IN_PROGRESS. [Final scoped evidence](../reports/implementation-261106-1827-track-b-modernization.md) and [new corpus inspection](../reports/research-261106-1827-tsa-example-questions.md) preserve remaining input/media/combined-flow gaps. Actual independent final finding about canonical counts was fixed and source-verified; real PostgreSQL regression passed.

## Continuation2026-11-07

Inspected image delivery now has additive SQL028, private Bank admission, frozen asset GET implementation and runtime wiring. Existing text-only profile rows are unchanged. Real PNG/released explanation delivery, integrity, rights/hold/submit ordering, state/deadline/timeout and populated upgrade/rollback checks passed. Chromium156/Firefox156 verify large1200×800 synthetic diagrams at desktop/tablet/narrow widths. Full media acceptance remains under verification; no general demo or production activation. Original corpus remains private and unmodified.

Online W3C guidance led to a visible per-open-session character-shortcut opt-out. Chromium exposed a modal restoring an earlier help control; explicit per-modal opener capture/restore repaired it. Both browser keyboard journeys passed after the repair. Independent image review's stimulus-edge finding was covered by a failing regression and fixed with per-stimulus asset sets. An authorization-test delegate hit a subscription usage limit; the controller completed that work locally. No paid fallback. [Continuation evidence](../reports/implementation-261107-0756-inspected-images-and-keyboard.md).
