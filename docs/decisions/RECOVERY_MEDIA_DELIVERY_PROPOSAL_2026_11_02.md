# Proposed local image delivery for student attempts — 2026-11-02

**Status: PROPOSED / OWNER ARCHITECTURE DECISION REQUIRED.** This document is
engineering preparation, not an ADR approval, implementation authorization,
content-rights decision, or production decision. No reviewer or approver is
recorded here.

## Decision requested

Permit a bounded, default-off local synthetic implementation of the already
specified student image request:

`GET /api/v1/attempts/{id}/assets/{assetVersionId}?purpose=question|explanation`

The route contract remains the existing frozen contract. This proposal adds no
route, wire field, query value, purpose, role, or public asset identifier. It
defines an optional inspected-image profile and private local content-addressed
byte adapter needed to fulfill existing image references safely. It does not
approve any reference-site asset, permit captured research use, or make an image
eligible for publication.

The two inspection profiles are versioned independently:

- `text-math-table/1` keeps its existing exact-hash checks and rejection of image
  blocks.
- Proposed `text-math-table-inspected-image/2` accepts the supported image block
  only after inspecting every immutable referenced byte object and validating its
  provenance, current display rights, safe MIME/header, dimensions, size, and
  accessible text. Existing rows are never upgraded or relabeled. New image use
  remains disabled by default until owner scope and the acceptance tests below
  pass.

## Existing contract and evidence

The frozen [student API contract](../architecture/API_CONTRACTS.md) specifies the
GET response as authorized image bytes, with attempt ownership, asset membership,
section/release and no-arbitrary-URL checks. `question` and `explanation` are the
only purposes. It requires `no-store` for student/private responses and current
withdrawal checks. It does not grant access by knowing a UUID.

The [question schema](../specifications/QUESTION_SCHEMA.md) models immutable image
references with `assetVersionId`, alt text, and optional caption. Its general
content contract forbids executable HTML, JavaScript, CSS, and user-supplied SVG;
images must be immutable and inspected. The actual Bank delivery profile stored
by [migration 008](../../db/migrations/008_bank_delivery_safety.sql) is constrained
to `text-math-table/1`. That profile rejects unsupported media. Its
`tsa.bank_form_delivery_allowed(form)` currently requires that `form_assets` have
no rows, so current approved forms cannot contain image assets. This hold remains
in force until a reviewed migration explicitly adds the supported profile path.

The [database design](../architecture/DATABASE_DESIGN.md) already has immutable
asset versions, question/stimulus links and a `form_assets` snapshot of exact
references. The [system architecture](../architecture/SYSTEM_ARCHITECTURE.md)
allows a local development adapter and specifies private object storage for
production; production storage must not depend on ephemeral web-server disk.

## Authorization model

Resolve authorization from the authenticated caller and the sealed form. Never
accept a source URI, path, object key, storage bucket, MIME type, or role from the
request. Resolve `(attempt, asset version, purpose)` against the immutable
question/stimulus/explanation snapshot and `form_assets` membership. A bare
`assetVersionId` or a match in the mutable Bank alone is insufficient.

For `purpose=question`, require all of the following at request time:

1. The attempt belongs to the authenticated student and is either `IN_PROGRESS` or
   `GRADED` with released-result permission. For `IN_PROGRESS`, the asset must
   belong to a slot in the active section. For released `GRADED` review, it may
   belong to any question slot that the existing released-review view authorizes,
   so question diagrams remain available while reviewing an explanation.
2. The asset is in that attempt's sealed form with purpose QUESTION and appears in
   the public question/stimulus content for the permitted slot, and its immutable
   `asset_versions.security_class` is QUESTION. Assets from a future section,
   another form, another student's attempt, or a private explanation are denied.
3. Current form availability and delivery guards pass: no withdrawal, rights hold,
   quarantine, invalidation, or other existing content-delivery block.
4. Current source rights allow DISPLAY in the applicable territory and time window,
   and match the pinned asset/source versions. UNKNOWN, REFERENCE_ONLY, revoked,
   expired, or non-display rights fail closed.

For `purpose=explanation`, require an owned attempt in `GRADED` state, the existing
released-result permission, exact private explanation membership in the sealed
form, purpose EXPLANATION, and the same current rights/hold checks. `CREATED`,
`IN_PROGRESS`, `SUBMITTED`, `EXPIRED`, `CANCELLED`, `INVALIDATED`, and every other
non-released attempt state deny explanation bytes. Grading jobs have a separate
state machine: a queued, running, or failed job while the attempt is `SUBMITTED`
has not released a result and grants no explanation access. Only the owned
`GRADED` attempt with released-result permission does. A question-purpose
membership cannot authorize explanation access and vice versa; the asset
`security_class` must be EXPLANATION as well as the sealed purpose being
EXPLANATION.

Perform membership, ownership, active-section/release and current-rights checks in
one database authorization operation serialized consistently with Bank withdrawal
and quarantine commits. The local implementation acquires the Bank shared
publication guard, establishes attempt/asset authorization, reads and buffers the
bounded local object while the guard transaction is open, verifies size/hash/MIME,
then rechecks current rights and either the active-section deadline or released
review permission against `clock_timestamp()` before committing authorization.
The final successful guarded
recheck is the request linearization point. A withdrawal/quarantine committed
before it denies the request; a later commit does not retroactively revoke bytes
already authorized at that point. Bound local-object I/O to at most 500 ms and the
guard transaction to at most 2 seconds; on timeout abort and send no asset body.
Do not make network/object-store calls while holding the DB guard. These are
proposed local limits requiring measurement. Define exact lock ordering in
implementation; never hold an attempt lock while acquiring an exclusive Bank
publication lock if that reverses existing Bank/attempt ordering. Read current
rights rather than trusting the state captured at form creation. If authorization
input is missing or ambiguous, return the contract's safe denied response without
revealing which check failed. A successful body is bytes only with fixed headers;
identifiers and internal storage details are not echoed.

## Inspection and immutable local storage

The local adapter is private development storage under the ignored `.local/`
workspace or an injected temporary root in tests. Map bytes by
`sha256/<first-two-hex>/<full-lowercase-sha256>`; the caller never supplies this
path. Never store public assets under `apps/practice-prototype/public/`, serve them
through a static-file handler, or place raw bytes in `factory_asset_bytes`.

For this proposed image profile, cap each asset at **2 MiB** before inspection and
on read. Accept only PNG, JPEG, and WebP. Reject SVG, HTML, XML, GIF/animated
formats, remote URLs, mismatched declared MIME, mismatched magic/header, truncated
or malformed files, unsupported color/decode features, and images above a pinned
dimension/pixel limit. Decode with a pinned local library/version and record that
validator version with the exact content hash; header sniffing alone is not a full
image inspection. No decoder/library has been selected or approved by this
proposal. Never execute or inline bytes as HTML. Validate that alt text is
nonempty, bounded, plain text, and attached to the exact immutable reference.

On ingestion, compute SHA-256 from exact input bytes, compare it with the immutable
asset metadata, inspect the bytes, and write atomically with create-if-absent
semantics. If an object already exists, verify its hash instead of overwriting it.
Make stored objects read-only to ordinary app flows. On retrieval, reopen only
the hash-derived path without following symlinks, enforce the 2 MiB cap, recompute
the digest, and compare both the pinned hash and inspected MIME before returning
bytes. Missing, replaced, truncated, or corrupt bytes fail closed and produce no
partial body. Do not fetch external URLs.

Preserve existing PostgreSQL grants, owners, and RLS policies on asset-related
tables; current `tsa_exam` access may already exist and must be inspected rather
than presumed absent or removed. Do not broaden direct access to
`factory_asset_bytes`, add unrestricted grants, or expose additional private
asset/provenance fields. If the runtime needs a new authorization operation, add
only a narrow security-definer function owned by the migration role, pinned
`search_path`, fixed inputs
`(attempt id, asset-version id, purpose)`, current actor from existing transaction
context, and output limited to authorized hash/MIME/size metadata. Preserve
existing service-role boundaries; the Factory service must not read student
attempts or private released assets. The actual function and role should be
reviewed before implementation.

Responses set the validated allowlisted `Content-Type`, exact `Content-Length`,
`X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, and a
same-origin policy that prevents cross-origin use. Do not use redirects, signed
URLs, query-string secrets, permissive CORS, content sniffing, or cacheable shared
URLs. Error bodies remain the frozen safe API envelope and contain no object key,
source URI, private question text, answer, explanation, or rights evidence.

## Expand-only migration and rollout

Implementation requires an owner-approved scope and a separately assigned
engineering task. Proposed migration is additive and expand-only:

1. Extend the `question_delivery_checks.profile` constraint to admit the new
   version string while retaining every existing `text-math-table/1` row/hash and
   its immutable trigger. Do not rewrite legacy rows, silently recheck them, or
   imply that preexisting images are inspected.
2. Extend the Bank validation write path to create the new PASS profile only after
   byte inspection and exact-hash checks. Preserve existing candidate-stock and
   snapshot-builder semantics; inspect any call sites that currently invoke the
   text-only validator and add an explicit image-profile branch rather than
   weakening `text-math-table/1`.
3. Preserve existing `form_assets` membership and immutability. Update both
   `bank_question_delivery_allowed` and `bank_form_delivery_allowed` predicates
   only for content/forms whose exact content hash
   has a passing inspected-image profile and whose every referenced byte/version
   is pinned, authorized, and present. Forms with no assets continue to use their
   existing path unchanged. Any asset form without complete evidence remains
   blocked. Do not change the assembly solver, ordering, identity exclusion,
   history or allocation transaction; note that newly eligible image questions
   can change the candidate pool and resulting allocation choices.
4. Add only the narrowly reviewed function execution described above, if required.
   Preserve existing grants/RLS; add no broad table grant, role elevation,
   backfill, reference-site data import, shared contract regeneration, or route
   change.
5. Keep the validator/feature flag **off by default** for all existing modes.
   Enable it only for isolated local synthetic fixtures after the exact migration,
   security, MIME/decode, authorization-race, and byte-integrity tests pass. No
   production activation follows from local acceptance.

Migration acceptance compares every preexisting row, immutable form/attempt/score
snapshot, schema owner/ACL, relation ACL/RLS, policies, role membership, and
function owner/ACL/security settings before and after. Expected DDL differences are
limited to the new profile value constraint, Bank validation and both delivery
predicate extensions, a reviewed authorization function, and any private
inspection metadata explicitly approved in the task. Test fresh install and
populated pre-migration upgrade, apply once, replay, and failed-migration rollback.
Existing text-only form authorization and all Q-04 historical hashes remain
identical.

## Required acceptance tests before enabling the local flag

| Area | Required real checks |
|---|---|
| Profile compatibility | Existing text-only fixtures pass `text-math-table/1` byte-for-byte. Image references fail that profile. The new profile accepts only registered, inspected, hash-matching supported images; unsupported/bad MIME, SVG, malformed/truncated, over-2MiB, oversized dimensions, missing alt text, stale hash, UNKNOWN rights and absent bytes fail closed. A failed check writes no PASS record. |
| Form snapshot | Seal exact image references and distinguish public question/stimulus assets from private explanation assets. A changed Bank version, source link, storage object, or same asset ID attached under the other purpose cannot change authorization of an existing form. Pre-migration forms remain text-only eligible; asset forms are blocked until fully checked. |
| Authorization matrix | Real PostgreSQL/HTTP checks for owner versus second student; question purpose in active section and released GRADED review; explanation purpose only in released GRADED review; future section and purpose/security-class mismatch; attempt states CREATED/IN_PROGRESS/SUBMITTED/GRADED/CANCELLED/EXPIRED/INVALIDATED. Separately vary queued/running/failed grading jobs while the attempt is SUBMITTED and assert no release. Include held/revoked rights, quarantine, withdrawal, unknown UUID, wrong form, and unreferenced asset. No keys/explanations in question requests or denial responses. |
| Race ordering | Two-connection barrier tests for rights revocation/quarantine versus guarded GET, hold versus GET, section advance/deadline versus GET, submit/expiry versus GET, and release versus explanation GET. Test both commit orders. A guard commit before the final recheck denies; a commit after the authorization linearization point does not retroactively revoke buffered response bytes. No probabilistic sleeps. |
| Byte boundary | Use actual loopback HTTP. Verify exact bytes/digest/MIME/length/headers and no-store; tamper/truncate/delete the object after pinning; test path traversal, encoded traversal, symlink swap, oversized read, double extension, MIME confusion, arbitrary URL attempts, 500 ms local-read timeout, and 2 s guard-transaction timeout. No raw private metadata or storage path in response/logs. |
| Separation | Preserve and inspect existing `tsa_exam` asset-table grants/RLS. Add no broad `factory_asset_bytes` read grant or new direct private-table access. A Factory credential cannot call the student endpoint or inspect released attempt assets. Staff routes do not gain media access from this work. |
| Migration and regression | Fresh and populated pre-migration installs, exact row/security snapshots, migration replay/failure rollback, existing text-only assembly/attempt/review runs, current bank publication/revocation suite, full relevant Q-08/Q-13/Q-14 checks, built contract/drift/consumer checks. Record PostgreSQL, runtime, decoder/browser versions and exact commands. |

Until all tests pass and a separately assigned reviewer closes findings, do not
enable the flag even for a demo. Passing tests do not supply asset rights,
qualified content review, accessibility acceptance, or production readiness.

## Impact, authority, and owner decision

Impact is limited to safe display of authorized, immutable image assets through
the existing student contract. It touches the Bank delivery validator, immutable
form snapshot checks, student attempt authorization, a private local storage
adapter, HTTP byte headers, a narrow SQL authorization boundary, and migration
compatibility. It does not change question/1, student DTOs, route shape, grading,
timing, allocation algorithm/history/transaction, keys, published rights policy,
or Factory publication privileges. Its delivery predicate can make newly
inspected image questions eligible, changing the candidate pool and allocation
choices only when the separate local flag is enabled. Schema expansion is
backward-compatible only if existing profile rows, forms, ACLs and rights gates
remain unchanged as above.

Existing autonomous engineering delegation authorizes bounded implementation
preparation and synthetic verification within recorded task scope. Existing
decisions explicitly retain media retrieval, new SQL grants/migrations, and
unsupported media outside earlier B1/B2 and minimum Bank-safety approval. This
proposal records a possible design only; that delegation does not approve this
media architecture, profile version, migration, function privilege, local
activation, or production storage. Human owner architecture disposition is
required before implementation begins. Production activation additionally waits
for ADR-006/OPS-001 identity, hosting, backup, privacy and operational decisions.

Recommended implementing platform: existing Codex subscription, inherited
Codex model with high reasoning if selectable, for cross-layer authorization,
storage and migration invariants; use the closest available subscription model
as fallback. Availability/quota is unverified; no paid model API. A separately
assigned read-only reviewer should inspect SQL privilege/lock ordering and actual
HTTP leakage after implementation. This recommendation assigns no implementer or
reviewer and does not assert a review has happened.
