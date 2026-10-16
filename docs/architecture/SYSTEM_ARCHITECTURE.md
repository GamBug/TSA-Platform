# System architecture

Status: PROPOSED. Approval gates: ADR-001–ADR-008 in [open decisions](../decisions/OPEN_DECISIONS.md). Product authority: [MVP](../specifications/MVP_SCOPE.md). Evidence: [research assessment](../research/RESEARCH_ASSESSMENT.md). No application directories described below exist yet.

## Alternatives and proposed baseline

| Option | Benefits | Costs / decision |
|---|---|---|
| Next.js + TypeScript modular monolith + PostgreSQL | One language and transactional core; shared request types; fewer deployments | Must isolate server-only code and avoid cache leaks; proposed MVP baseline |
| Next.js + Python/FastAPI + PostgreSQL | Python optimization/AI ecosystem; OpenAPI contracts | Two runtimes, deployments and validation stacks; reconsider when Python workload is demonstrated |
| Django with templates or a separate web client | Integrated administration and mature backend conventions | Different UI/typing tradeoffs; viable if team expertise favors Python, not currently evidenced |
| Separate bank, exam, grading and AI microservices | Independent scaling | Distributed consistency and operational overhead without measured need; rejected for MVP |

Next.js HTTP handlers provide the transport; framework-independent TypeScript modules own the domain. PostgreSQL owns durable state. Drizzle is proposed for typed SQL and migrations; Prisma or direct SQL are viable alternatives, but complex locking/constraints must remain visible in reviewed SQL. No library versions are approved; FOUND-002 must select supported versions and lock dependencies after owner approval. Primary mechanism references are S4–S7 in the evidence register; no comparative performance claims are made.

## Boundaries and dependencies

| Module / proposed path | Owns | Allowed dependencies |
|---|---|---|
| `src/modules/identity` | Local subject IDs, roles, session authorization | Identity provider adapter |
| `src/modules/sources` | Rights grants, provenance, asset metadata | Identity, audit |
| `src/modules/bank` | Question/stimulus versions, taxonomy, validation, reviews, duplicate relationships | Sources, identity, audit |
| `src/modules/assembly` | Blueprint versions, per-student eligibility/allocation, selection, sealed forms, usage analytics | Bank read contract, sources rights checks, audit |
| `src/modules/attempts` | Start, deadlines, responses, submit/expire, history | Sealed form read contract, identity, audit |
| `src/modules/scoring` | Pure scoring rules, score runs and release policy | Frozen answers + private form keys; no UI dependency |
| `src/modules/jobs` | Durable job leases/retries and dispatch | Calls module commands; owns no question approval |
| `src/modules/generation` + `tools/question-factory` | Provider-neutral generation and evaluation orchestration | Sources, bank draft command, jobs; no approve permission |
| `src/modules/audit` | Append-only privileged and state-change events | Minimal actor references; never stores answer content in logs |
| `src/app` | Student/staff pages and `/api/v1` HTTP adapters | Public module services, explicit safe DTOs |
| `src/contracts`, `db/migrations`, `tests` | Validated schemas, schema evolution, verification | Contract changes follow ADR process |

Modules cannot write each other's tables arbitrarily. Cross-module transactions are explicit application services using one transaction context; e.g. submit freezes answers and inserts a grade job atomically. Scoring cannot mutate questions or submitted responses. UI imports only student-safe contracts. Staff access to private keys is separate and audited.

Browser → same-origin `/api/v1` → authentication/authorization → module command → PostgreSQL. HTTP contracts are authoritative even if a server-rendered page invokes the same service internally. Do not create a second server-action behavior. Generate machine-readable API/client artifacts from validated schemas in FOUND-002; this phase defines them in [API contracts](API_CONTRACTS.md).

FOUND-002 also enforces deterministic regeneration/diff of committed API artifacts and producer/consumer fixture checks in CI, as specified in API contracts. The same PostgreSQL deployment stores the proposed shared save-rate buckets; no new service is needed. Attempt admission/cancellation, section validation and privacy limits follow the reconciled engine/assembly contracts, pending the explicit owner choices in ADR-004.

## Three logical components and runtime boundaries

The owner's Phase 02.75 requirements replace the previous AI-later/shared-fixed-form default. These are three logical components in one modular monolith repository, not three microservices or three databases. They share canonical `question/1` contracts and may initially share one PostgreSQL deployment. The Bank is the shared domain and durable publication boundary; its staff HTTP adapters may run in the same Node deployment as the Website, but use separate staff routes and authorization. The Factory has its own executable and scheduled/manual entry point. The Website has student HTTP routes and a separately running exam worker for durable exam jobs.

| Component | Entry point and runtime | Permissions and dependency boundary |
|---|---|---|
| Scheduled Question Factory | OS scheduler or authorized operator invokes `tools/question-factory`; no student HTTP entry point | Scoped source and aggregate inventory reads; factory job kinds, generation runs, validation evidence and draft writes. Separate service identity, DB credentials/pool, provider credentials and resource limits. Cannot read student identity/history/answers or private exam snapshots, claim exam jobs, or approve/publish. Runs with fixture contracts without Website/OIDC. |
| Review/publication Bank | Staff-only HTTP commands in the modular monolith; canonical bank module and PostgreSQL records | Human staff identity and role checks govern source rights, draft import, validation, independent review, approval and publication. The Factory's output remains ineligible until human approval. Exposes approved eligible versions and rights status to assembly; does not need provider calls. |
| On-demand exam Website | Student HTTP request path plus independent exam worker process from the same codebase | Reads only approved eligible Bank content for allocation; writes sealed forms, attempts, assignment history and answers through domain commands. Exam worker claims only exam job kinds for expiry/grading/recovery. Student paths and worker have no provider credentials or draft-approval permission. |

```text
schedule/operator -> Factory process -> bounded generation/validation -> Bank drafts
                       | scoped aggregate inventory read       |
                       +------------------------------------> shared PostgreSQL
human reviewer -> staff Bank commands -> review/approval -> published eligible versions
student -> Website exam HTTP -> approved Bank read -> personal allocation + sealed form/attempt
                                -> save/submit -> exam job -> exam worker -> practice result
```

Factory production and publication are asynchronous with respect to student traffic. Catalog, create, start, save, submit, shortage, retry and grading paths never dispatch generation or wait for the Factory or provider. If the Factory or provider is unavailable for a month, students can still start and complete exams from previously approved eligible stock, subject to rights, blueprint feasibility and each student's unseen inventory. A shortage returns the defined error and explicit alternatives; it cannot trigger live generation. Fixed published mock exams remain an explicit alternate mode. Per-student first-assignment history excludes stable identities and confirmed equivalents; global usage never consumes stock. Details: [reuse policy](../specifications/QUESTION_REUSE_POLICY.md), [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md).

Reuse `src/modules/sources`, `bank`, `generation`, `jobs`, `assembly`, `attempts`, `scoring` and `audit` with their existing command boundaries. Reuse the Bank's canonical draft import, validation and review workflow and PostgreSQL job leases; do not add a second question bank, database, broker or Redis for this split. The planned Factory interface and resources are in [factory spec](../specifications/QUESTION_FACTORY_SPEC.md). Factory calls never hold examination, allocation or publication locks during provider work.

The shared database remains a common failure and contention domain: separate factory/exam pools and job-kind allowlists, bounded transactions and CPU/memory limits are required, with low-priority factory pause under measured contention. Scenario A requires concurrent load evidence, not an assumption that 500 drafts are free. A PostgreSQL outage can interrupt exams; process separation alone cannot prevent that. This operational isolation preserves ADR-001's proposed Next.js/TypeScript modular monolith and PostgreSQL baseline.

## Infrastructure by stage

Website MVP: one Node web process, PostgreSQL, an OIDC identity integration, and a lightweight exam worker running the same codebase for durable grading/recovery jobs. A separately executable Question Factory begins as an early research track; it is not an exam-worker job dependency. PostgreSQL is the queue; lease-based polling is enough at small scale. The worker is a process boundary, not a separate domain service. A process crash must not lose submitted work. No in-memory-only durable queue or browser timer authority.

Media: private S3-compatible object storage becomes required when original/authorized images are introduced. Text, formulas and tables can support the first slice without it. Development may use a local adapter; production must not rely on ephemeral web-server disk. Serve approved assets via an authorized media endpoint with immutable content hashes. Explanatory assets have a separate release gate.

Later only when justified: Python workers for symbolic checks/optimization, pgvector for measured near-duplicate retrieval needs, Redis for measured cache/rate-limit pressure, CP-SAT for difficult constraints, additional web replicas after load tests. Optional research: IRT, adaptive practice, QTI and warehouse analytics. Kubernetes and an agent orchestration server have no current justification.

## Environments and operations

- Development: local Node + isolated PostgreSQL (optional Compose after approval), synthetic fixtures, test identity adapter restricted to development. Never production data or secrets in Git.
- CI: pinned runtime/dependencies, fresh PostgreSQL, schema/contract/unit/integration checks and browser tests; no real paid AI calls by default.
- Staging: production-like Node web/worker, independent managed database and private media, identity test tenant, restore and concurrency exercises.
- Production: managed container or equivalent long-lived Node runtime plus managed PostgreSQL and durable worker; region/provider selected in ADR-006. Avoid a platform whose execution limits break worker leases or assembly budgets. Migrations run once under a deployment lock; backups precede destructive schema work.

Structured logs contain request ID, task/job ID, duration and error category; no tokens, student responses, private keys or full prompts. Track autosave latency/errors, submission conflicts, grading lag, expiry lag, queue age, rights blocks and assembly failure reasons. Alert thresholds and SLOs need measured workloads; research availability numbers are not accepted commitments. Keep UTC database time authoritative; monitor host/database clock health.

Backups and restore drills must cover database and referenced assets consistently. Propose daily backups plus PITR where supported; actual RPO/RTO, retention and provider cost await ADR-006. Migration strategy is expand → backfill → switch reads → contract; rollback application versions only while schema remains compatible. Never rewrite historical forms during migration.

## Security and cost boundaries

OIDC Authorization Code + PKCE through a maintained server-side session integration; Secure/HttpOnly/SameSite cookies, CSRF and Origin checks for mutations, staff MFA, deny-by-default role and object checks. No custom password store. Validate issuer, audience and redirect allowlist. Rate limits must survive multiple replicas before scaling. Staff roles: AUTHOR, REVIEWER, BANK_MANAGER, EXAM_MANAGER; student role CANDIDATE. Roles can be combined, but an author cannot be sole approver of their version. AI service identity creates drafts only.

Reject executable HTML, arbitrary JavaScript/SVG and remote asset URLs in question content; validate length, MIME and renderable blocks. Separate public question DTOs from keys/explanations at query/serialization boundaries. Use `no-store` for attempts/results/private APIs; never hydrate private metadata into React payloads or source maps. See security tests in [quality](../quality/TEST_STRATEGY.md).

Monthly cost model: hosting + DB/backup + identity + media/egress + monitoring + human review + optional AI attempts × provider usage. Track cost per approved question including rejected generations. No cost promise until budget, region, traffic, bank size and review availability are known. Provider switching must preserve domain contracts, not credentials or vendor SDK objects in canonical data.
