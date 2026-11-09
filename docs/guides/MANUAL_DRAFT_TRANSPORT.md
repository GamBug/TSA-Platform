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
November 5 had the synthetic author but no registered Reading taxonomy. The
[November 9 retained corpus import authority](../decisions/OPEN_DECISIONS.md#cp3a-retained-import--2026-11-09)
authorizes additive Reading registration for the local corpus DRAFT queue only.

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

## Corpus Reading DRAFTs

The additive private `corpus-reading-draft/1` profile uses the same v3 coordinator with
`CORPUS_IMPORTED` source evidence, `DETERMINISTIC_CORPUS_EXTRACTION` run metadata and
`IMPORTED` question/provenance origin. The manual AI profile retains its existing semantics.
Source-relative capture paths and SHA256 hashes remain bound in private raw evidence.
Rights are recorded as “corpus, non-profit permission (REQUIRES_VERIFICATION)”.
No corpus-derived content becomes eligible or approved through this path.

The [capture parser](../../tools/corpus-ingest/reading-captures.mjs) owns extraction and
whole-passage deferral. Only complete ten-question passages with explicit choice keys qualify.
It never infers missing true/false keys or converts cloze/matching into choices. Deferred
indexes retain source paths/hashes; original captures remain read-only. Reading genre is a
proposed classification, not an exam domain or validated reasoning skill.
Corpus cognition is provisionally M1 and marked for owner classification; missing source
explanations and distractor reasoning are not fabricated. The AI profile's 4/3/3 quota stays strict.

After `npm run build`, create an owner-only `data/corpus-ingest/` parent and run:

```sh
node tools/corpus-ingest/extract-reading.mjs TSA_Example_Questions data/corpus-ingest/reading-run
```

Give only the generated `blind.json` to one independent subscription-based solver, with no
source captures, extracted keys or explanations. Save its 100 checks as private
`blind-solve.json` beside that file. The exact checked shape and flag rules are owned by
[compareBlindAnswers](../../tools/corpus-ingest/verify-reading.mjs); missing/duplicate answers fail.
This tool does not invoke a provider or record an unperformed solve as complete. Its original
verification output records blind-solve flags as historical evidence. Under the owner
[authoritative source-key policy](../decisions/OPEN_DECISIONS.md#university-demo-product-direction--2026-11-07),
blind-solve answers, disagreements, ambiguity and evidence flags are omitted from the retained
import review context. Extracted keys are preserved; provisional classification and missing
source explanations remain explicit.

```sh
node tools/corpus-ingest/verify-reading.mjs TSA_Example_Questions data/corpus-ingest/reading-run data/corpus-ingest/reading-run/verified
```

Verification creates a backed-up disposable PostgreSQL cluster, registers local fixture identities
and Reading taxonomy, prepares/imports each bundle through the coordinator, checks exact replay,
the staff DRAFT queue, ten-question stimulus groups, zero approvals/rights/eligibility, public
answer stripping and unchanged source hashes. Per-bundle activation pins are trusted local test
configuration for this disposable invocation only. All coordinators retire and the cluster is
removed at exit. This does not activate a retained Bank or bypass its separate registration and
owner-pinned configuration requirements.

Private packages, receipts, deferral/attention lists, backup archives, queue summary and ten
HTML/JSON spot-check samples remain in the ignored owner-only output directory. Open
`samples.html` locally; it contains private answers inside disclosure controls. The staff preview
continues to report `RIGHTS_BLOCKED`. Retained-bank import and human approval/publication are
separate authorized operations.

Focused checks: `node --test tests/ai/corpus-reading.test.mjs` and
`node --test tests/ai/corpus-reading-import.test.mjs`. The latter needs local PostgreSQL sockets.
Run the existing manual transport and critical privacy suites for shared-boundary regression checks.

## Retained CP3a review queue

The [retained import report](../../plans/reports/codex-261109-1615-cp3a-import.md) records
the November 9 operation, pre-import backup, private activation pins and verification.
Operational artifacts remain owner-only under
`data/corpus-ingest/cp3a-2026-11-09/retained-2026-11-09/`; the prior disposable packages
and verification evidence remain unchanged. Each newly prepared package is bound to the
registered retained-bank author and Reading taxonomy, with no blind-solve review context.
Exact replay uses those saved packages; rebuilding the same namespace/batch with new IDs
is a conflict, not a safe reimport.

Start `NODE_ENV=development LOCAL_SYNTHETIC_ONLY=true npm run dev:track-b` and open
`http://127.0.0.1:4174`. Choose the staff workspace and a reviewer or bank-manager profile,
then filter for Reading DRAFTs. This is the retained `.local/track-b` database.
The import grants no rights and creates no reviews or approvals; private preview remains
`RIGHTS_BLOCKED` until the separate owner-controlled rights gate is satisfied.
