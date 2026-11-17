# CP2 simulation design

The accepted outcome is one 100-slot attempt with MATH 40/3600 seconds, READING
20/1800 seconds and SCIENCE 40/3600 seconds. Navigation can resume any section with
time remaining. Existing independent practice stays compatible; corpus ingestion,
question approval, publication and new interaction types are outside this checkpoint.

- Add an explicit `blueprint/3` simulation profile and v3 student offering, attempt,
  switch receipt and result DTOs/routes. Require exactly the three section counts and
  budgets above, NEW_ONLY allocation and the existing binary scoring policy. Keep
  question versions and frozen v1/v2 contracts unchanged. Admit v3 attempts by their
  sealed blueprint protocol, independently of scoring policy; legacy routes reject
  them. Explicitly accept existing question/1 with practice-binary-v1 for this profile.
  Allocation seals one form
  atomically using the existing stock, source-rights and exposure protections.
- Migration `030_full_simulation.sql` adds section clock state keyed by attempt and
  section: budget, accumulated elapsed time, first-opened time and current opened-at
  time. A partial unique index permits at most one running section per attempt.
  Restricted security-definer functions own updates; students get no raw table access.
  V3 keeps an infinite internal attempt deadline for compatibility with the existing
  persisted lifecycle; its public DTO exposes section clocks instead. Only exhausted
  section budgets or explicit submission end the simulation.
  The attempt row serializes start, switch, save, submit and sweep. Every operation
  reconciles fresh database time under the established Bank/attempt lock order.
- Start opens MATH. Switching charges the current section up to its remaining budget,
  closes it, then opens the requested non-exhausted section at a fresh server instant.
  Reject unopened and inactive-section saves; allow reads of previously opened,
  exhausted sections as read-only. Never disclose unopened slots, answers or asset
  references. Asset authorization must enforce the same first-opened boundary.
  Exact save retries return their committed receipts after switches without mutating
  answers; changed bodies conflict. Switch retries must not reopen or charge twice.
- Each section's remaining time is budget minus stored elapsed minus current open
  interval, clamped to zero. An exhausted running section closes without automatically
  opening another. Closed budgets do not run offline. Expire the attempt only when all
  budgets are exhausted; explicit submit closes all clocks and submits all answers.
  At start/resume require rights through server-now plus all remaining section budgets.
  With no clock running, retain the attempt without a new overall timeout; recheck
  current rights on reads, resume and sweep, invalidating when rights have expired.
  Test exhausting MATH, waiting beyond rights expiry, then trying to open READING.
  Existing single-section deadline behavior must remain on its current dispatch path.
- Extend the bounded expiry sweep to reconcile due simulation sections while retaining
  withdrawal, rights and start-TTL handling. Grading uses sealed section IDs and existing
  binary item scores; worker validation and SQL trusted totals must accept and validate
  three sections. Release retains owner/rights checks and returns section correct counts
  summing to the total, labeled unofficial practice; no keys precede release.
- Student DTOs expose server time, active section and each section's budget, remaining
  time, opened/locked state and counts. Tabs show all clocks, fetch authorized content
  after a switch and keep exhausted sections readable. Submit-all confirms closure;
  native text inputs continue bypassing shortcuts and pending saves block navigation.
- Before migration tests mutate a populated 029 database, make a local backup. Prove
  injected-failure rollback, upgrade preservation of legacy rows/ACLs/clocks/receipts,
  and inert reruns. Add focused timing, isolation, retry, privacy, sweep and scoring
  tests (including v3 creation and legacy-route rejection) plus a synthetic 100-item
  Chromium/Firefox desktop/narrow journey. Run all card
  exit suites and an independent checkpoint diff review before a local commit.
