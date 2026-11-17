# RECOVERY-029 — Inspected local student image delivery

Sequencing update2026-11-06: Track B modernization takes next SQL027 for topic practice. This media migration has not been written/applied; use the next available migration number at implementation. The runner prohibits inserting an older migration after a newer one. Historical027 references below describe the original reservation, not an applied artifact.

Status: IN_PROGRESS. Root accountable implementer/integrator.
Started 2026-11-05, Asia/Bangkok; feat/track-b-data-auth at a70861a, inherited
dirty workspace preserved. No original commit/push/merge/deploy or paid API.

## Outcome and authority

Implement the [reviewed media design](../../docs/decisions/RECOVERY_MEDIA_DELIVERY_PROPOSAL_2026_11_02.md)
under the owner's [local engineering authorization](../../docs/decisions/OPEN_DECISIONS.md).
The frozen attempt asset GET returns authorized immutable PNG/JPEG/WebP bytes only
for the owned active question section or released graded review, with purpose,
rights/hold, sealed membership, integrity and deadline checks. Default remains off.

Constraints/non-goals: retain text-math-table/1 bytes/rows; add the separate
text-math-table-inspected-image/2 profile and a private hash-addressed local store.
Preserve route/DTO shapes, question/1, assembly algorithm/order/history/transaction,
existing role boundaries and ACL/RLS. No public image store, URL fetching, SVG,
Factory byte-table expansion, rights/human approval or production enablement.
No legacy relabeling, backfill or automatic migration of the retained DB.

## Phases and deadlines

Engineering targets in UTC+7; human and production acceptance remain separate.

| Phase | Status | Target | Exit |
| --- | --- | --- | --- |
| Source/interface map | COMPLETE | November 6, 10:00 | Actual route/service gap, Bank profile writer and guard order identified by read-only scout. |
| Decoder/private byte store | COMPLETE | November 6, 18:00 | Pinned complete decode/container inspection, atomic private store, corruption/timeout/permissions tests. |
| Reviewed SQL/Bank profile | COMPLETE | November 8, 18:00 | Narrow authorization/inspection metadata reviewed; additive027, fresh/populated/rollback/security snapshots. |
| Existing GET implementation | COMPLETE | November 10, 18:00 | Guarded membership/release/clock checks and bounded bytes-only HTTP response; no DTO drift. |
| Races/privacy/regression review | IN_PROGRESS | November 12, 18:00 | Full required matrix, both commit orders, existing text-only runs, actual independent review. |

## Concrete implementation choices

Keep Node/PostgreSQL. Select exact Sharp0.35.5 after official npm metadata and
[release](https://sharp.pixelplumbing.com/changelog/v0.35.5/) verification.
The [constructor](https://sharp.pixelplumbing.com/api-constructor/) documents
warning-sensitive failure and input pixel limits; [metadata](https://sharp.pixelplumbing.com/api-input/)
does not decode compressed pixels. Require full bounded pixel decode as well as
container validation. Use pinned native packages from the lockfile; missing or
mismatched decoder fails closed. No Python runtime dependency.

Initial bounds:2MiB encoded bytes,4096per dimension,4,194,304pixels,8-bit grayscale/
sRGB with at most4channels, one frame only. Reject animated/container ambiguity,
SVG/HTML/XML/GIF, unsupported color/depth, truncated data, MIME mismatch and trailing
container data. Inspection occurs outside student authorization. GET re-verifies
the exact object's size/hash/allowed MIME while holding the Bank guard. Local
object read500ms, complete guard transaction2s; no network inside the guard.

Root owns package/lock, container/store integration, SQL027 sequencing, Bank and
attempt/HTTP integration, shared records and evidence. Delegates receive disjoint
exact files. SQL function body/role and metadata grants need an actual read-only
engineering review before execution. Back up every database before changes,
including empty disposable baseline before migration.

Recommendation: existing Codex/current available model/high if selectable for
guard/SQL integration; bounded native decoder builder and independent reviewer.
No assumed quota or paid fallback.

## Acceptance and verification

Every row of the reviewed design's acceptance table remains required. Start with
real decoder/container/store tests, then PostgreSQL profile/snapshot and HTTP
authorization matrix, barrier-controlled races, timeouts/integrity, security/
upgrade/rollback snapshots and existing text-only consumers. Record versions,
commands/results and actual review; absent tests are NOT RUN.

Scout found frozen attemptAsset exists but HTTP/service have no implementation.
The unknown-asset404 is a denial control. SQL008 still rejects image profiles and
form assets; migrations end026. No media code/dependency change at assignment.

Rollback: default-disable the feature and retain immutable objects/evidence;
preserve legacy profiles/forms; never relabel stored image checks as text-only.

## Verified continuation2026-11-07

SQL028, Bank admission and guarded GET are implemented; defaults remain off. Populated upgrade/replay/failure rollback and unchanged legacy/security snapshots passed. Current synthetic Chromium156/Firefox156 evidence covers large diagram layout/enlargement, focus, persistence and released explanations. Rights/hold/submit/quarantine/state/deadline/timeout and grading-release/natural-rights-expiry tests passed; final combined suite and independent disposition are being reconciled. [Current execution evidence](../reports/implementation-261107-0756-inspected-images-and-keyboard.md). No retained/production migration or general activation. Historical references to the absent route and reserved027 describe the initial scout only.
