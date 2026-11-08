# Private manual Reading DRAFT transport

The internal `factory-package/3` profile `manual-reading-draft/1` transports one
complete ten-question manual Reading bundle into private Bank DRAFT storage.
Usage stays null/UNVERIFIED, source permission stays internal-only, and actual AI
authoring remains immutable evidence. Imported sources use the approved EXTERNAL
transport classification. None of this establishes lawful publication, qualified
human review, calibrated difficulty or selectable inventory.

The feature is disabled by default. It has no public HTTP route, upload UI,
scheduler, provider call or production mode. Existing v1/v2 and student/released
review contracts remain unchanged. The [reviewed design](../decisions/RECOVERY_MANUAL_TRANSPORT_PROPOSAL_2026_11_04.md)
and [current authority](../decisions/OPEN_DECISIONS.md) define the scope; historical
staging compatibility reports are preserved records, not current activation flags.

## Preparation

Back up the target database before any schema/data operation. Use an existing
registered author and exact registered Reading domain/skill closure. Preparation
and import both recheck registrations; neither creates taxonomy or users. Missing,
foreign, ambiguous or stale mappings fail. The retained local Bank inspected on
November 5 has the synthetic author but no registered Reading taxonomy, so actual
pilot activation remains pending the separate scoped registration decision.

Use [prepareManualDraftTransport](../../tools/question-factory/manual-transport.mjs)
from a trusted local host with the existing restricted Bank pool, local identity
service, freshly authenticated Request and unforgeable internal capability. Supply
an explicit mapping, full registered taxonomy, exact private artifact paths and a
new output directory. It writes a private package, mapping and preparation receipt
without application DB mutations. Files must be owner-only regular files outside
public assets, with no symlink components; output never overwrites existing data.

The internal [schemas](../../packages/contracts/src/manual-factory-schemas.ts),
[raw validator](../../packages/contracts/src/manual-factory-validation.ts) and
[parser/builder](../../packages/contracts/src/factory-package-v3.ts) own the exact
wire and mapping shapes. The parser reconstructs canonical questions and the typed
reference graph from bound raw evidence. Self-consistent edited answers, spans,
declarations, edges or hashes cannot substitute for the saved output. All original
input/source/prompt/response/declaration/optional critic bytes remain preserved.

## Activation and current authorization

The operator must pin the exact activation snapshot and its canonical configuration
location in an owner decision before enabling intake. `approvedActivationHash`
binds the immutable activation object; `approvedConfigurationScopeHash` binds
`{activationHash, configurationDirectory}`. Neither pin comes from package input.
A historical directory copy cannot reuse the original location approval. Trusted
operator restoration of the control directory is an operational action, not a
cryptographic anti-administrator guarantee.

The [configuration module](../../src/modules/bank/manual-import-configuration.mjs)
exports the file layout and helpers for the activation/state hashes. Keep the
directory and files private, with no symlinks. Do not delete, truncate or restore
old retirement/admission journals to bypass a gate. Journals are bounded; the
importer reserves space for a resolution before writing a pending admission.
Capacity exhaustion stops admission and requires operator maintenance; it never
discards history automatically.

Create [createManualFactoryImportService](../../src/modules/bank/manual-import-coordinator.mjs)
only with explicit enablement, development/test configuration and
LOCAL_SYNTHETIC_ONLY. Defined staging/production process environments are denied.
One coordinator per database holds a dedicated session advisory lock; every
serialized import/replay transaction runs on that same connection. It checks
current identity, mapping and DB-clock activation/permission intervals under the
Bank guard before durable intake. Expiry is an admission deadline, not a COMMIT
deadline or a student delivery permission.

An exact manifest replay verifies immutable receipts, graph and materialized
storage. Changed same-key evidence conflicts. A manual producer cannot reuse a
namespace already bound to a different transport profile. New imports remain a
single atomic DRAFT unit with zero current rights, reviews, approvals or eligible
pointers.

## Stop and recovery

Await `stop()`: it rejects queued requests, drains admitted work, durably retires
the active configuration, unlocks and releases the connection. Only STOPPED
acknowledges effective retirement. Filesystem failures and backend loss produce
unsafe/reconciliation-required outcomes and permanently stop that coordinator;
there is no transparent reconnect or hot reload.

Pending admissions are recorded before application writes. A known rollback is
recorded as ROLLED_BACK; an uncertain commit remains unresolved. Use the constrained
`reconcileManualFactoryImportAdmission` entry with fresh authorization and an
owner-pinned reconciliation digest. It checks real immutable receipts/graphs for
COMMITTED, or all relevant candidate/namespace absence for ABSENT, without
resubmitting. Reconfiguration requires trusted current state and authorization.

Disable the capability to roll back operationally; retain immutable DRAFTs,
evidence and receipts. Older readers cannot safely relabel v3 rows as v2.

## Verification

```sh
npm run test:factory:manual:transport
```

This builds contracts and runs adversarial parser, private configuration and real
disposable PostgreSQL tests, including stop/drain, backend termination, a committed
transaction with lost acknowledgment, journal/retirement failures, source reuse,
ancestor review and student/static HTTP privacy. Disposable database setup backs
up its empty baseline before migrations. The harness retires its servers/clusters.

[Implementation evidence](../../plans/reports/implementation-261105-2205-manual-draft-transport.md)
records commands, actual review, failures repaired and activation limits.
