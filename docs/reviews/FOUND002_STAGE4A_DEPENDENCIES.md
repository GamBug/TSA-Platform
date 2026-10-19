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
