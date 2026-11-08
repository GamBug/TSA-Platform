# Generic provider-free Factory fixture

RECOVERY-011, 2026-11-04. This internal tool composes the existing fake adapter,
response inspector, content/reference checks and canonical Factory v2 contract.
It supports MATH, READING and SCIENCE with SINGLE_CHOICE, MULTIPLE_CHOICE and
TRUE_FALSE_GROUP, including shared-stimulus units. The existing text/math profile
rejects assets. This is synthetic DRAFT transport, not real question generation
or qualified content, answer, rights or publication approval.

## In-memory interface

`exportGenericFixturePackage({calls, context})` is exported from
[generic-fixture.mjs](../../tools/question-factory/generic-fixture.mjs).
It returns `{package, packageBytes, report}` without filesystem or provider calls.
Build shared contracts first with `npm run build` if their emitted files are absent.

| Field | Required content |
| --- | --- |
| `context` | Exact keys: `fixture: true`, `namespace`, `batch`, `at`, `operatorId`, `references`, `rightsEvidence`. References and rights records use existing v2 schemas. |
| Each `calls` entry | Exact keys: `request`, `approvedSourcePayload`, `fixtureResult`, `bindings`. Request/result use existing generation contracts. |
| `approvedSourcePayload` | Private tooling wrapper `{schemaVersion: 'generic-approved-source/1', sources: [{sourceVersionId, title, content}]}`. Source order and trusted hashed source-reference payload must match the request. The name does not assert actual rights approval. |
| Each binding | Exact keys: `itemKey`, `candidateOrdinal`, `questionVersionId`, `questionId`, `versionNo`, `parentVersionId`, `domainId`, `subskillIds`, `difficulty`, `stimulusVersionId`, `provenanceIds`, `evidenceRefs`. |

Inputs must be bounded plain JSON; proxies, accessors, cycles and unexpected
fields are rejected. Bounds include 16 MiB canonical input, depth32,100000 nodes
and the existing Factory limit of100 candidates. Supplied reference hashes are
verified, not repaired. Dependencies must close without cycles. Candidate content
hashes and duplicate fingerprints are recomputed; repeated identities, transport
keys and exact package duplicates fail the entire export. Context binds author,
time and generated origin; no durable generation-run record is invented.

Machine evidence is limited to `GENERIC_SCHEMA`, `CONTENT_SAFETY` and
`PACKAGE_EXACT_DUPLICATE`. It does not establish answer correctness, semantic
uniqueness, global Bank deduplication, lawful rights or human review. Fixture usage
is zero because no model is called. Raw response/request/source hashes remain
private. This wrapper is not a new public, planner or reservation schema.

## Private CLI

```sh
npm run factory:fixture -- /private/input.json /private/new-package.json
```

The input must be a private regular file (recommended mode0600), with no group or
other permissions, valid UTF-8 JSON and at most16 MiB. The existing output parent
must be private (recommended mode0700). Input symlinks, existing output targets
and website public-tree output, including resolved directory aliases, are rejected.
The tool validates everything before writing. It writes and syncs a private
same-directory temporary file, then atomically links the complete file to the
new target without replacement and syncs the parent directory.

A process killed before publication can leave a private orphan temporary file;
the final path remains absent. An error after publication can leave a complete
final file with an uncertain acknowledgement. Inspect that file before retrying;
the tool never removes an existing final target. Power-loss durability was not
tested. Stdout reports only fixture/count/no-review/no-publication metadata;
diagnostics do not echo private payloads.

The reusable [fixture builder](../../tests/ai/fixtures/generic-generation.mjs) is
test-only; runtime code does not import it. It constructs synthetic reference and
rights transport data without granting rights or publication status.

## Verification and limits

```sh
npm run test:factory:generic
node --test tests/ai/*.test.mjs
npm run contracts:consumer-check
```

The focused suite includes real disposable PostgreSQL imports through the existing
Bank service, durable receipt replay, changed-content conflicts, late whole-unit
rollback and exclusion of unapproved stock. Receipt-shaped export data alone is
not treated as persistence evidence. See [executed results and independent review](../reviews/RECOVERY_GENERIC_EXPORT_2026_11_04.md).

There is no live/paid provider, scheduled executor, new database schema, grant,
human publication, media activation or production deployment in this slice.
