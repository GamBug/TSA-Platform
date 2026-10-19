# FOUND-002 Stage 4A — dependency evidence

Date: 2026-10-19 (Asia/Bangkok). Local inventory: native `tsa_scout`, Luna / XHigh.
Independent comparison and online checks: coordinator Codex Sol 6.1 / Medium.
Scope: current seven locked external packages, not a full supply-chain/security
audit. No installation, lockfile or dependency change. All findings below are
VERIFIED observations unless explicitly limited.

## Installed versus locked inventory and licenses

`npm ls --all --json` exited 0. Every external lockfile-v3 entry is installed at
its locked version; installed and locked license identifiers agree. No optional,
OS-specific or CPU-specific external entry exists. `@tsa/contracts` is a local
workspace link and is not counted among the seven external packages.

Both scout and coordinator independently compared metadata and hashed the actual
installed license files. Paths below are relative to `node_modules/<package>/`.

| Package | Locked/installed | License | File / SHA-256 |
|---|---|---|---|
| `@asteasolutions/zod-to-openapi` | 8.5.0 | MIT | `LICENSE` / `e215b8ee537ef050760949b601b691775cc19010ba1ae5f11771f4c074e6d865` |
| `@types/node` | 24.10.1 | MIT | `LICENSE` / `c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383` |
| `openapi3-ts` | 4.6.2 | MIT | `LICENSE` / `f11551089b4081a337b1871e335424ffa1c819a03c52ffe73f7b7032015508f7` |
| `typescript` | 5.9.3 | Apache-2.0 | `LICENSE.txt` / `a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47` |
| `undici-types` | 7.16.0 | MIT | `LICENSE` / `a6db8096b2707bc0102d256917d4d33f298ba36d8c3f25de067a2b5bb379db27` |
| `yaml` | 2.9.1 | ISC | `LICENSE` / `5bba27375d93e9119f76c1015f7672cf9ad5f70952296e0842fb2243d6376869` |
| `zod` | 4.1.12 | MIT | `LICENSE` / `3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8` |

Only Zod is a declared runtime package dependency. Others are development/type
dependencies or their transitives. License identifiers/texts are engineering
inventory evidence, not a redistribution/legal clearance; preserve required
license/notice files if artifacts are redistributed. No incompatible-license
identifier was observed in this scoped inventory.

## Runtime and support compatibility

Observed local versions match root pins: Node `v24.18.0`, npm `11.16.0`, installed
TypeScript `5.9.3`. TypeScript requires Node `>=14.17`; YAML `>=14.6`; other inventory members declare no Node engine constraint. zod-to-openapi's Zod
peer range is `^4.0.0`, satisfied by locked 4.1.12; `npm ls` reports no peer errors.

The [official Node release entry](https://nodejs.org/en/blog/release/v24.18.0)
labels 24.18.0 LTS. The [Node release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)
lists v24 maintenance start 2026-10-20 and end 2028-04-30; as of this review date
the line is in Active LTS. This is line-level support, not proof this pinned patch
contains every current security fix. [npm 11.16.0 metadata](https://raw.githubusercontent.com/npm/cli/v11.16.0/package.json)
requires Node `^20.17.0 || >=22.9.0`, satisfied locally. Package-version support
guarantees beyond these declared constraints were not established. Functional
compatibility is supported by the local required suite, not vendor certification.

## Dated advisory check

Coordinator executed `npm audit --json --ignore-scripts --cache
/tmp/tsa-stage4a-npm-cache`. First sandbox attempt exited 1 with registry DNS
`EAI_AGAIN`; authorized network escalation rerun exited 0. Observed response:
`auditReportVersion: 2`, `vulnerabilities: {}`, counts info/low/moderate/high/critical
all zero. Registry summary reports nine total dependency entries (includes workspace
accounting), not nine distinct external locked packages; seven-package inventory
above is from the lockfile itself. No `audit fix`, install or update occurred.

This establishes zero registry-reported advisories for that graph at query time,
not absence of vulnerabilities. It excludes Node binary/npm bundled-tool security,
unpublished/unindexed advisories, malicious packages and application misuse. The
[upstream Zod advisory page](https://github.com/colinhacks/zod/security/advisories)
was also inspected; an empty upstream advisory view is not an additional safety
guarantee. No automatic upgrade is recommended from this limited evidence.

## Reproduction and remaining limits

- Executed: version commands; `npm ls --all --json`; Python read-only lock/installed
  metadata comparison and SHA-256 of license texts; npm audit as above; official
  primary-source lookups. All successful results were independently checked.
- Scout role forbids external-service calls, so online checks were performed by
  the coordinator, not attributed to the scout. Its initial inventory-report
  variable typo was corrected; no repository write occurred.
- No clean install or artifact tarball-integrity reproduction in this review;
  previous Slice 7 clean-lockfile evidence is retained. Refresh advisories before
  release or any dependency change. No production authorization follows.

## Track B PostgreSQL driver increment — 2026-10-19

Owner-approved DATA-001 adds exact `pg@8.23.1`, without an ORM. The seven
previously locked external package versions remain unchanged. The following
14 additions were checked against installed metadata and license text; Node
24.18.0 satisfies every declared engine range. README hashes cover the whole
file containing the complete license where no standalone license is shipped.

| Package | Version | License | Installed license evidence (SHA-256) |
| --- | --- | --- | --- |
| pg | 8.23.1 | MIT | `LICENSE`: `192b8f5c96900f04a1271dec39688655d7416c1c6ea84a508e18b50d2b6751f3` |
| pg-cloudflare | 1.4.1 | MIT | `LICENSE`: `192b8f5c96900f04a1271dec39688655d7416c1c6ea84a508e18b50d2b6751f3` |
| pg-connection-string | 2.14.1 | MIT | `LICENSE`: `2244b5486c4427001b6756a87b9a297d427c111dcc3ba64a097492a8979c23d0` |
| pg-int8 | 1.0.1 | ISC | `LICENSE`: `4e8e87ccdfc7e4b47fd89015f78468aa53b6bf43ab6e6e12d43e8f55294911de` |
| pg-pool | 3.14.0 | MIT | `LICENSE`: `4f15ee7fc2a72082859d7e0d12dfa4bcdd70b1c744ad3850d07780730ac08557` |
| pg-protocol | 1.16.1 | MIT | `LICENSE`: `192b8f5c96900f04a1271dec39688655d7416c1c6ea84a508e18b50d2b6751f3` |
| pg-types | 2.2.0 | MIT | `README.md (includes full MIT license)`: `ecda9bca71d3f0cee4e600d1dd2bef336213f39ef2e8fca6a1a1c1c8723f643a` |
| pgpass | 1.0.5 | MIT | `README.md (includes full MIT license)`: `62549909404b5a0dcb2b4b74c9a930baf8095dbcfa1543c4ffc79378acd22b57` |
| postgres-array | 2.0.0 | MIT | `license`: `f057f36739d53d228a746de4440c1e0c644ecde06d6beab45337d39c9d12a393` |
| postgres-bytea | 1.0.1 | MIT | `license`: `f057f36739d53d228a746de4440c1e0c644ecde06d6beab45337d39c9d12a393` |
| postgres-date | 1.0.7 | MIT | `license`: `f057f36739d53d228a746de4440c1e0c644ecde06d6beab45337d39c9d12a393` |
| postgres-interval | 1.2.0 | MIT | `license`: `f057f36739d53d228a746de4440c1e0c644ecde06d6beab45337d39c9d12a393` |
| split2 | 4.2.0 | ISC | `LICENSE`: `c372ef2fa1dfcb124ed807609751e75e3a009f108c5724916b489288fcb88a0c` |
| xtend | 4.0.2 | MIT | `LICENSE`: `82e67379203d5794e7c44549847d8d64ae6904591381682360470898bd306821` |

Coordinator executed `npm install --save-exact --ignore-scripts pg@8.23.1
--cache /tmp/tsa-track-b-pg-npm-cache`, then `npm ls --all --json` and
`npm audit --json --ignore-scripts --cache /tmp/tsa-track-b-pg-npm-cache`.
All exited zero; the audit reported zero vulnerabilities across 24 dependency
entries. These are registry findings at query time, not a security guarantee.
Lockfile integrity records pin the installed graph. `pg` declares Node >=16.
No paid API was used. Runtime transaction and parameterized-query behavior is
verified separately by DATA-001 tests; installation alone is not acceptance.

Clean-install reproduction: coordinator archived committed `7885331` to an
isolated temporary directory, then ran `npm ci --ignore-scripts --cache
/tmp/tsa-track-b-pg-npm-cache`, `npm run build`, `npm run test:built`, and
`npm ls --all --depth=1` with pinned Node24.18.0/npm11.16.0. All exited zero;
22 installed entries, 24 audited entries, zero registry advisories. The optional
`pg-native` peer is absent; this implementation uses the tested JavaScript driver.
No toolchain upgrade was applied. This verifies the dependency/build increment,
not subsequent uncommitted application behavior or hosted CI.
