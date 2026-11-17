# WEB-003 — explicit review practice within existing personal contracts

2026-10-25, base0c2ba65. AUTHORIZED_IN_SCOPE / IMPLEMENTED; verification completed2026-10-26. Root selects this
bounded student-facing increment under the recorded2026-10-24 engineering-choice
delegation. This is not whole-ADR-007 approval, a content/rights/accessibility
attestation or fixed delivery authorization. Recommended root Codex Sol6.1/High for
transaction/history integration; available native Luna/XHigh bounded UI/tests;
separate Sol6.1/Medium read-only design/code review. Existing subscriptions only.

## Problem and compatibility boundary

Current persistent NEW_ONLY practice truthfully reports unseen-inventory exhaustion,
but never offers the frozen REVIEW_MODE alternative. REVIEW_ALLOWED already exists
in CreateAttemptSchema, CatalogEntry.reviewAllowed, StudentShortage, AttemptView,
history/result DTOs and assembly-manifest/1/reference replay. Add no route, public
field/schema/version or generated artifact. Existing defaults/golden vectors remain
unchanged. No shorter unsupported MVP profile, automatic fallback or fixed alias.

Explicit request stays:
`{mode:"PERSONALIZED_PRACTICE",blueprintVersionId,reuseMode:"REVIEW_ALLOWED",acknowledgeRepeats:true}`.
Use reuse/1: its frozen meaning already includes explicit personal review. The
existing reference algorithm performs one eligible-baseline search without personal
history exclusions for REVIEW_ALLOWED; it does not minimize repeats or promise
that every question repeats. Preserve that algorithm and canonical manifest bytes.

## Selected behavior

- NEW_ONLY remains default and strict. Only a fresh NEW_ONLY
  INSUFFICIENT_UNSEEN_INVENTORY outcome may offer the same-blueprint REVIEW_MODE
  alternative with requiresRepeatConsent:true. Eligible shortage/search exhaustion
  never promise that review fixes inventory. Catalog.reviewAllowed is only a
  truthful implementation/permission signal, never feasibility evidence.
- Native explicit confirmation describes possible previously assigned questions,
  retains the same domain/count/duration and requires fresh affirmative repeat
  consent. Cancel/Escape makes no POST. Confirmation creates a new logical intent/
  key/body, distinct from the rejected NEW_ONLY request. Uncertain retry preserves
  exact review body/key; reload/logout/target change never automatically posts or
  carries consent into another intent. A lost response never claims creation.
- Each accepted review creates a NEW owned personal form/attempt from CURRENT
  eligible Bank stock/version/rights/complete bundles/conflicts and the exact
  immutable blueprint. Never reuse an old personal form or historical question
  snapshot as inventory. Current source, renderer, quarantine/revocation and
  lifetime analytics rules remain unchanged; no AI/provider call.
- Preserve existing first-history rows; insert every previously absent assigned
  stable identity so later NEW_ONLY excludes it. Retain history revision capture/
  freshness, current canonical group membership, per-user allocation lock, shared
  publication guard and global H1 across personal reuse/fixed modes. Do not erase,
  recycle, split groups or weaken within-form constraints.
- Same admission/600-second Start TTL/server clocks, answer/submit/grade/release
  rules and unofficial binary scoring. Review mode is labeled through reserved/
  active/resume/result/released-review/history views; explanations still require
  release. An old NEW_ONLY attempt never changes mode.
- PUBLISHED_FIXED remains unsupported by this path. B8 diagnostic captures remain
  separate and create no form. No new role, raw-table grant or staff publication
  privilege; existing candidate exam role only.

## Implemented rollout and compatibility

Root backend/SQL owns exact final paths after source mapping. Add a strict trusted
constructor flag `enableReviewPractice` defaultfalse to preserve existing callers;
explicit local demonstration opt-in enables it. Persisted review receipts and active
attempt delivery remain valid when new review creation is disabled. Catalog and
safe shortage alternatives advertise support only when enabled. The shared runtime/services defaultfalse; the explicitly synthetic student demo
launcher passes true. No client control can enable a server flag; session/CSRF/idempotency checks stay unchanged.

The smallest SQL extension is a new022 migration replacing only the existing
assembly_commit_personal definition, preserving its signature/owner/search_path/
EXECUTE ACL and all NEW_ONLY guards. Add validated REVIEW_ALLOWED branch requiring
exact JSON Boolean acknowledged plan metadata (reject missing/null/false/string
"true"; `plan->'acknowledgeRepeats' IS DISTINCT FROM 'true'::jsonb`),
reuse-mode-pinned writes, and repeat-safe
first-history preservation only in that branch. Do not edit applied migrations.
Mode must be validated before history behavior; ordinary NEW_ONLY remains strict.
Captured manifest history/bank/offering/rights/pool pins and all sealing assertions
remain mandatory in both modes. Migration preservation/rollback analysis and exact
SQL diff must be reviewed before runtime acceptance; old rows are never backfilled
or rewritten. If source inspection requires a materially different choice, record
that refinement before implementation.

Frontend owns only the existing persistent adapter/controller/scoped styles after
explicit reservation; no redesign of the completed student journey. Tests reuse
existing allocation/attempt/grading/results/browser fixtures, without a new generic
harness. No contract writer/artifact regeneration is expected.

Rollback: disable NEW review creation/advertising while retaining persisted review
receipt replay and generic delivery/grade/read support. Never downgrade by deleting
history/forms or changing mode; retain compatible reader code for existing attempts.
No production/deployment claim. Exact local opt-in/launcher defaults will be recorded.

## Acceptance and review

Required real PG/HTTP cases: default NEW_ONLY unchanged; no-consent/false consent
422; disabled capability truthful; seen-only shortage offers explicit option without
allocation side effects; new review repeats allowed but creates fresh immutable form;
first-history rows preserved/new identities recorded/revision monotonic; subsequent
NEW_ONLY still excludes assigned IDs/groups; whole bundles/current versions/rights/
quarantine/conflicts; original replay/collision/active-attempt precedence; same-user
NEW_ONLY vsREVIEW_ALLOWED barrier; private projections/release/grade invariants.
Verify supported domain journeys with actual persistent services.

Browser Chromium/Firefox: fresh same-domain consent0POST cancel/invalid, explicit
body/new key, uncertain same-key retry, reload/resume/mode labels, real save/submit/
grade/released review and subsequent strict shortage, keyboard/focus/375Chrome/
actual narrowFirefox, no private ID/key leak. Existing NEW_ONLY/three-domain/B1–B8
checks and deterministic vectors/artifacts must pass unchanged. Independent review,
clean reproduction and current guide/records/checkpoint required.

Source discovery by actual read-only scout and separate Sol6.1/Medium precheck/design review:
existing DTO/reference support confirmed; no specific owner prohibition blocks the
bounded explicit increment. This is source inspection, not runtime verification or
whole-policy approval. Final design review found no blocker; exact Boolean consent/direct SQL negative
tests required. Implementation and actual PG/HTTP/Chromium/Firefox verification are complete in the
[scoped evidence record](../reviews/WEB_003_REVIEW_PRACTICE_VERIFICATION.md).
Independent final source/PG/security reviews passed; the last requested browser
rerun hit the reviewer usage limit before execution. No review is fabricated.
