# SEC-001 Zod remediation verification

2026-10-25, base694df4d, feat/track-b-data-auth. IMPLEMENTED / AUTOMATED_PASS / INDEPENDENTLY_REVIEWED; clean reproduction pending.
[Selected dependency scope](../decisions/SEC_001_ZOD_VALIDATION_LIMIT_REMEDIATION.md).
Root sole writer, separate actual Sol6.1/Medium read-only reviewer. Owner AGENTS.md/
untracked research preserved/excluded. Existing subscriptions only; no paid API,
push/merge/deployment or new live service.

## Observed defect and patch

Fresh B8 install/audit discovered one high advisory in exact locked Zod4.1.12.
[GitHub-reviewed advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) identifies
resource consumption for affected versions<4.6.6. A controlled real public
StudentQuestionSchema probe with10,000 invalid options yielded20,002 issues at4.1.12
and one collection-limit issue at4.6.7. No OOM/crash/network exploitation induced or
claimed. Existing transport body caps/current-role checks remain independent.

Root `npm install --workspace @tsa/contracts --save-exact zod@4.6.7 --ignore-scripts`
exited0, changed one package only. Package/lock diff is exact Zod pin/resolved URL/
integrity plus workspace dependency value; no other dependency/engine/script change.
Registry tarball SHA512 matches selected decision. Installed MIT LICENSE SHA256
`3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8`, unchanged text.
`npm ls --all --json` exits0; existing zod-to-openapi^4.0.0 peer satisfied. No schema,
artifact, identity/solver/source/fixture/SQL/role/API/product implementation changed.

The focused real-schema regression tests100 and10,000 invalid option collections,
rejects both before accumulating per-member errors and asserts the collection-limit
path. It neither allocates unbounded input nor makes environment-sensitive timing/
memory claims. Original valid/invalid/golden vectors remain intact.

## Commands observed so far

Node24.18/npm11.16, ignored `.local/sec001-*` logs:

- `npm run contracts:check`: PASS, all four existing generated artifacts unchanged.
- `npm run typecheck`: PASS.
- `npm test`: PASS156, including original reference vectors and new regression.
- `npm run build`, `npm run test:built`: PASS.
- `npm run test:consumers`: PASS12.
- `npm audit --json`: exit0, zero advisories at this observation.
- `npm ls --all --json`: exit0, no peer/dependency errors.

- `npm run test:bank`: PASS149. `npm run test:assembly`: PASS50.
- `npm run test:critical:student`: PASS9, including real authenticated generated HTTP
  lifecycle, expiration, revocation and isolated independent state model.
- `npm run test:student`: PASS34.
- `STUDENT_ARTIFACT_DIR=.local/verification-sec001/student-domains npm run test:student:domains`:
  PASS78 API responses across persistent MATH/READING/SCIENCE journeys.
- `TRACK_B_ARTIFACT_DIR=.local/verification-sec001/chromium npm run test:track-b:browser`:
  actual Chrome156 PASS46 checks/29captures,375/document375/scale1.
- `npm run test:staff:firefox`: actual Firefox156 PASS16/35captures,1280/actual500.
- `npm run contracts:consumer-check`, `npm run docs:check`, `git diff --check`: PASS.
  Historical preserved-input whitespace warning only. No schema/artifact/fixture
  edits (`git diff --name-only` over protected paths empty).

## Independent review

Separate actual Sol6.1/Medium read-only reviewer: no findings. Independently verified
only intended package/lock entries, compatible peer/no runtime dependencies/license,
SHA512 of cached tarball against SRI and relevant installed ESM/CJS files byte-for-
byte against tarball. Regression1/valid2-and10/invalid10 probes, reference/replay31,
question/vector/answer/identity26, emitted consumers12, offline npm ls/type/drift/
consumer boundaries/whitespace PASS. No files touched. Live npm audit NOT_EXECUTED
by reviewer because its role prohibits external-service calls; the dated audit0
above was performed by root. No independent PG/browser rerun or security guarantee.

Clean-checkout reproduction remains pending.
Dated audit output is not a comprehensive supply-chain or production guarantee.
