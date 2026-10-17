# Quality and verification strategy

Status: PROPOSED test requirements; no application tests exist or have passed. Task owners implement tests with their features. [Backlog](../tasks/TASK_BACKLOG.md) defines completion criteria; [latest handoff](../agents/LAST_HANDOFF.md) records actual checks. Use synthetic or explicitly authorized data, never protected exam dumps or production PII.

## Layers and release policy

Unit tests cover pure scoring, response normalization, blueprint validators and policy transitions. Property tests are useful for answer-set permutations, randomized state sequences and assembly invariants; a large random sample is evidence, not mathematical proof. Integration tests use real PostgreSQL and exercise transaction ordering, uniqueness, triggers, queue leases and rollback. SQLite/mocked repositories cannot establish these properties.

Contract tests validate runtime schemas and examples, private/student DTO boundaries and generated client compatibility. Database migration tests apply to fresh and populated previous versions, compare immutable history and exercise rejected writes. Browser E2E covers candidate and staff vertical slices on Chromium plus one other target engine before pilot; responsive/keyboard/screen-reader checks complement automation. Choose exact tools after stack approval; suggested TypeScript unit/property/browser tools are not installed or assumed available.

CI should run static/type/build/schema checks, unit tests and isolated DB integration on each change. Relevant E2E/security fixtures run before integration of critical modules; broader restore/load/accessibility checks gate release. Do not defer state-machine or privacy tests to a last hardening task. Freeze random test seeds on failure and retain minimal reproductions without sensitive inputs. Record actual runtime/browser/DB versions and commands when introduced by FOUND-002.

## Critical invariant matrix

| ID / invariant | Required verification and expected outcome | Owning tasks |
|---|---|---|
| Q-01 No unapproved question in a new form | Integration attempts DRAFT/REJECTED/QUARANTINED and revoked rights; only approved eligible versions seal. Concurrent approval/revocation/seal has one valid serialized order. | BANK-001, ASSEMBLY-001 |
| Q-02 Independent review of exact content | Author/self-approval, stale hash, new-version approval reuse all rejected; append-only evidence remains | BANK-001 |
| Q-03 No unintended repeats | Property fixtures enforce identity, confirmed duplicate/enemy pairs and full bundles; two versions of same question cannot co-occur | ASSEMBLY-001 |
| Q-04 Historical content immutable | New bank version/blueprint does not alter form, score or explanation hashes; direct update/delete rejected; invalidation hides content without rewriting it | DATA-001, SCORE-001 |
| Q-05 Correct practice scoring | Golden cases for all MVP types, unanswered/partial, all correct/incorrect, set permutations, 1/3 decimal rounding; corrupt input fails job | SCORE-001 |
| Q-06 Reliable save/resume | Real-DB ack survives web restart; lost ack retry repeats revision; stale tab returns conflict; resume returns server value | EXAM-001, WEB-001 |
| Q-07 Idempotent closure | Parallel submit requests/keys and submit-expiry-save races yield one terminal reason/job; duplicate key+different body rejected | EXAM-002 |
| Q-08 No premature keys/explanations | Scan active HTTP responses, errors, SSR/hydration, JS bundle fixtures and asset routes; pre-grade/private access denied; post-grade owner-only result | AUTH-001, WEB-001, SCORE-001 |
| Q-09 Server timing authoritative | Client-clock manipulation irrelevant; exact boundary after lock rejects write; offline time counts; repeat start cannot reset; sweeper delayed does not extend time | EXAM-001/002 |
| Q-10 Deterministic assembly | Same frozen manifest/seed/algorithm yields identical slot hashes; pool changes require new manifest; bounded exhaustion never claims proof of infeasibility | ASSEMBLY-001 |
| Q-11 Cross-user/form access impossible | Candidate A cannot read/write B; slot from another form fails composite FK and API validation; role escalation/property injection rejected | AUTH-001, DATA-001 |
| Q-12 Recoverable grading | Kill worker after claim, after score transaction, before acknowledgement; lease recovery and repeat processing produce one immutable score and release | EXAM-002, SCORE-001 |
| Q-13 Safe rendering and sources | Script/HTML/TeX abuse, foreign URLs, wrong MIME, oversized bodies blocked; image permissions match question/explanation gate | BANK-001, WEB-001 |
| Q-14 Revocation immediately stops access | Rights/quarantine commit precedes next delivery; fan-out delay cannot leak content; starts blocked, active/results invalidated via guard | BANK-001, EXAM-002 |
| Q-15 Assignment allocation atomic | A successful create atomically seals/assigns all slots at CREATED; allocation rollback writes no form, attempt, history or receipt; cross-user reuse succeeds | ASSEMBLY-001 |
| Q-16 AI cannot publish | Service identity denied approval and private student access; malformed/injected output and forbidden source blocked; approved draft requires independent human evidence | AI-001/002 |

## State-machine and concurrency scenarios

Generate legal and illegal sequences over create/start/save/read/submit/expire/grade/invalidate with a controlled server clock; assert allowed transitions and frozen answer sets after closure. Test clock just before, at and after each section/overall deadline. Include a request waiting on the lock across deadline (transaction-start time must not grant access), repeated starts, unstarted withdrawal, early whole-exam submit, no-pause resume and no future-section payload.

Use two real database connections and barriers to force race order; test both possible winners rather than probabilistic sleeps. Exercise same idempotency key concurrency, distinct keys on same answer revision, multiple workers, source revocation versus sealing and rights change versus result access. Assert commit/rollback side effects including assignment history, receipts, jobs and audit events. Avoid tests that merely mirror internal implementation functions.

### Global active-attempt creation suite (H1, NOT RUN)

| Separate test | Required setup and expected outcome | Owning tasks |
|---|---|---|
| Same-key retry | Lose the first successful creation response, then repeat the identical key and fingerprint. Replay the original form/attempt/receipt exactly; do not allocate another form, history row or manifest. A changed fingerprint under that key is an idempotency conflict. | ASSEMBLY-001, EXAM-001 |
| Different-key simultaneous requests | Use real PostgreSQL barriers for two same-student creation requests with distinct keys. One request may commit an active attempt; the other returns `409 CONCURRENT_ATTEMPT_EXISTS` and creates no form, attempt, history, manifest or success receipt. Run both winner orders. | DATA-001, ASSEMBLY-001, EXAM-001 |
| Cross-mode active conflict | With a valid CREATED or IN_PROGRESS personalized attempt, request fixed/review creation; repeat in the reverse direction. Each distinct-key request returns `409 CONCURRENT_ATTEMPT_EXISTS` for its owner and cannot bypass the global constraint. | DATA-001, ASSEMBLY-001, EXAM-001 |
| Stale-attempt expiration | In both modes, exercise stale CREATED cancellation by the applicable start-TTL/availability guard and elapsed IN_PROGRESS expiry through the request path and worker path. Their system finalization is idempotent, retains CREATED assignment history, and remains committed when a fault injected after finalization makes the subsequent allocation fail. | DATA-001, EXAM-001, EXAM-002 |
| Sequential attempt after closure | After the prior attempt leaves CREATED/IN_PROGRESS, including SUBMITTED/EXPIRED pending grading and terminal closures, a new request may pass H1 subject to current admission. A later personalized NEW_ONLY success receives a new form, while a later fixed/review creation follows its explicit repeat policy. | ASSEMBLY-001, EXAM-001 |
| NEW_ONLY after completed attempt | Complete a personalized NEW_ONLY attempt, then create another after closure. The later manifest excludes every prior stable identity and current canonical equivalent, including assignments made at CREATED before the prior attempt was viewed or completed. | ASSEMBLY-001, WEB-001 |

### Independent domain and start-deadline contract suite (NOT RUN)

Run these as future browser/API and real-PostgreSQL tests with a controlled server clock; record exact commands, database/runtime versions and observed rows. The owner-approved MVP start TTL is exactly 600 seconds; ordinary availability-edit retroactivity for already CREATED attempts remains an owner decision, so distinguish that proposed behavior from approved behavior.

| Contract | Required experiment and invariant | Owning tasks |
|---|---|---|
| Independent domains | Create MATH 4, READING 2 and SCIENCE 4 as separate one-section forms/attempts; assert distinct clocks, submissions, scores, authorized reviews and history entries, with no automatic next-domain transition or official aggregate. Seed targets remain 12/6/12. Generic storage accepts a future multi-section fixture without activating it as an MVP offering. | DATA-001, ASSEMBLY-001, EXAM-001, SCORE-001, WEB-001 |
| Global H1 and sequential history | Across domains and both modes, a second distinct-key create conflicts while the first is CREATED/IN_PROGRESS; after SUBMITTED/EXPIRED/GRADED/CANCELLED/INVALIDATED, a new create passes H1 subject to admission and NEW_ONLY exclusions. Assert all prior CREATED assignments, stable IDs and current canonical equivalents remain excluded, including never-started forms. | DATA-001, ASSEMBLY-001, EXAM-001 |
| Admission and first start | At lower admission bound creation/start is allowed; just before upper bound it may proceed if all other guards pass; exactly at upper bound reject. Create with the required 600-second TTL and test first start just before, exactly at and after `created_at + 600 seconds`: only the just-before start succeeds. Independently test an admission end earlier than 600 seconds: persisted `start_before_at` equals that admission end and equality rejects. Check rights, form status and authorization on every new start using server time after locks. | EXAM-001, AUTH-001 |
| Separate running timer | Start a domain test just before admission close; assert its own immutable duration establishes `deadline_at`, completion after admission closes is accepted until that deadline, and close alone does not truncate or invalidate it. Starting another domain requires a new attempt after H1 closure. | EXAM-001, EXAM-002, WEB-001 |
| Availability edit | Create an attempt, store `start_before_at`, then extend and shorten availability in separate fixtures. Assert the stored field and prior creation receipt never change. Exercise current-admission behavior only after owner approval of ordinary-edit retroactivity; always retain explicit withdrawal, rights-revocation and security-invalidation guards. | DATA-001, EXAM-001, AUTH-001 |
| Restart and idempotency | Restart web/worker and reload a CREATED attempt: view uses stored deadline; same-key replay returns identical deadline even after availability edit, restart or closure. For non-CREATED views `startBefore` is null while the database retains its value. Fault-inject partial creation to prove attempt, deadline, history and receipt commit/roll back together. | DATA-001, ASSEMBLY-001, EXAM-001 |
| Stale finalization and DB integrity | Request-path and worker reconciliation cancel a CREATED attempt at its committed deadline and expire IN_PROGRESS at its own exam deadline; transitions and grading job are idempotent. Use two PostgreSQL connections to race create/start/withdrawal, verify H1 unique index, immutable deadline update rejection, form/section/slot and score-item composite FKs, and rollback on invalid sealed aggregates. | DATA-001, EXAM-001, EXAM-002, SCORE-001 |

## Bank/assembly fixtures and AI evaluation

Maintain small original fixtures: one valid set for all types; wrong key; ambiguous alternatives; incompatible type; incomplete/oversized bundle; same identity multiple versions; confirmed paraphrases; revoked/expired rights; a feasible greedy dead-end; provably short quota; search-budget exhaustion. Fixtures are versioned with rights metadata. Assembly must distinguish invalid configuration, count shortage and unknown feasibility.

AI evaluation requirements and metrics live in [pipeline](../specifications/AI_QUESTION_PIPELINE.md). Keep held-out ground truth separate from prompts; pin input/prompt/model/detector versions. Mock provider contract tests are mandatory in ordinary CI; paid/live calls are explicit evaluation runs with budget and observed usage. No unexecuted benchmark or LLM opinion counts as measured correctness. Model changes rerun golden, ambiguity, injection and leakage regressions plus human review.

## Security, accessibility and operations

Map relevant controls to [OWASP API Security 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/) (object/function/property access and resource limits). Check CSRF, stored XSS, SQL injection at query boundaries, session fixation/logout/role revocation, weak redirect checks, unsafe imports/SSRF, rate limits, log redaction and staff export restrictions. Use least privilege database/service identities and test that migrations/AI cannot run under candidate privileges. No unsupported claim of full ASVS certification.

Target [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) as a project goal: keyboard interactions, focus/error announcements, zoom, contrast, screen-reader math/table alternatives and future drag alternatives. Timed-practice accommodations and legal applicability need owner review; do not claim AA conformance before a complete audit, including timing criteria. Automated accessibility scans are insufficient by themselves.

Capacity targets are unresolved; OPS-001 must obtain concurrent candidate forecast and region, then test normal traffic plus synchronized start/save/submit bursts at the approved envelope (proposed 2× forecast). Measure latency percentiles, error rate, DB locks, worker backlog and recovery. No throughput number is currently verified.

Restore a database and matching assets into an isolated environment; verify form hashes, attempts, score records and deletion/hold policies. Rehearse migration with realistic populated fixtures and compatibility rollback. Practice web/worker crash, provider timeout and storage outage. Document measured RPO/RTO rather than inheriting the research's aspirational numbers.

## Phase 01 documentation verification

Phase 02.5 additions: [resolution](../reviews/REVIEW_RESOLUTION_001.md) maps each finding to regression requirements. Q-17 is the owner-approved H1 global active-attempt suite above: same-key replay, distinct-key conflict, cross-mode conflict, durable stale finalization, closure retake and NEW_ONLY history exclusion. Q-18 verifies owner-approved H2 admission boundaries, lazy/swept CREATED cancellation and no running-clock truncation; Q-19 verifies owner-approved MVP H3 one-domain form validation, typed quotas/taxonomy and aggregate sealing rollback while preserving future generic multi-section storage; Q-20 verifies lifecycle-pinned idempotency cleanup; Q-21 verifies shared save rate limits, retry behavior and authorization order; Q-22 verifies role-specific diagnostics and CI contract-drift failure. These augment Q-01–Q-16 and are NOT RUN. WEB-001 adds section-warning/timezone cases; SCORE-001 adds exact tie rounding. No full forensic answer history is expected; global usage is analytics, not a capacity gate.

Check all 21 required foundation/refinement documents are present and nonempty, all local Markdown file links resolve, code fences balance, IDs are unique, task references/ADR prerequisites resolve, no decision is falsely approved, and research hash is unchanged. Manually trace question→approval→manifest→snapshot→attempt→score→release for matching field/state semantics. Inspect Git/untracked file scope; no application code, dependency or commit should be introduced. Record exact results in LAST_HANDOFF; these checks do not demonstrate runtime correctness.

Reproduce the Phase 01 static check from repository root with `sed -n '/^```javascript$/,/^```$/p' docs/quality/TEST_STRATEGY.md | sed '1d;$d' | node`. This embedded checker is documentation verification only; it creates no files. Its fixed counts/hash describe this handoff, not permanent limits for later phases.

```javascript
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const required = ['README.md','AGENTS.md',
  ...['SYSTEM_ARCHITECTURE','DATABASE_DESIGN','API_CONTRACTS'].map(x=>`docs/architecture/${x}.md`),
  ...['MVP_SCOPE','QUESTION_SCHEMA','EXAM_ENGINE_SPEC','EXAM_ASSEMBLY_SPEC','AI_QUESTION_PIPELINE','QUESTION_FACTORY_SPEC','QUESTION_REUSE_POLICY'].map(x=>`docs/specifications/${x}.md`),
  ...['IMPLEMENTATION_ROADMAP','TASK_BACKLOG'].map(x=>`docs/tasks/${x}.md`),
  'docs/decisions/OPEN_DECISIONS.md',
  ...['AGENT_ONBOARDING','PROJECT_STATE','HANDOFF_PROTOCOL','HANDOFF_TEMPLATE','LAST_HANDOFF'].map(x=>`docs/agents/${x}.md`),
  'docs/quality/TEST_STRATEGY.md'];
const files=[]; function walk(d) { for(const e of fs.readdirSync(d,{withFileTypes:true})) {
  if(e.name==='.git') continue; const p=path.join(d,e.name);
  if(e.isDirectory()) walk(p); else files.push(p);
}} walk('.');
const errors=[], warnings=[]; let links=0;
for(const p of required) if(!fs.existsSync(p)||!fs.readFileSync(p,'utf8').trim()) errors.push(`Missing/empty: ${p}`);
const backlog=fs.readFileSync('docs/tasks/TASK_BACKLOG.md','utf8');
const ids=[...backlog.matchAll(/^## ([A-Z]+-\d+) /gm)].map(m=>m[1]);
if(new Set(ids).size!==ids.length) errors.push('Duplicate task ID');
for(const p of files.filter(p=>p.endsWith('.md')&&!p.endsWith('TSA_DEEP_RESEARCH.md'))) {
  const text=fs.readFileSync(p,'utf8');
  if((text.match(/^```/gm)||[]).length%2) errors.push(`Unbalanced fence: ${p}`);
  if(/[\t ]+$/m.test(text)) {
    if(p==='docs/reviews/ARCHITECTURE_REVIEW_001.md') warnings.push(`Preserved input whitespace: ${p}`);
    else errors.push(`Trailing whitespace: ${p}`);
  }
  for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if(/^(https?:|mailto:|#)/.test(m[1])) continue; links++;
    if(!fs.existsSync(path.resolve(path.dirname(p),m[1].split('#')[0]))) errors.push(`Broken link: ${p} -> ${m[1]}`);
  }
  for(const m of text.matchAll(/\b(?:FOUND|DATA|BANK|AUTH|ASSEMBLY|EXAM|SCORE|WEB|TEST|OPS|CONTENT|AI|RESEARCH|FACTORY|INT)-\d{3}\b/g))
    if(!ids.includes(m[0])) errors.push(`Unknown task: ${m[0]} in ${p}`);
}
const hash=crypto.createHash('sha256').update(fs.readFileSync('docs/research/TSA_DEEP_RESEARCH.md')).digest('hex');
if(hash!=='97a5bbe5844626043a5aa92bef7813a1fdbe1ba7d0d65e2bce3970f4c0dd2284') errors.push('Research changed');
const reviewPath='docs/reviews/ARCHITECTURE_REVIEW_001.md';
if(!fs.existsSync(reviewPath)||crypto.createHash('sha256').update(fs.readFileSync(reviewPath)).digest('hex')!=='d78a114027d3441967a2a7756d1a44bf6c6e46a80d537c027a3265ce2669ee34') errors.push('Review input missing/changed');
const unexpected=files.filter(p=>!p.endsWith('.md')&&p!=='.gitignore');
if(unexpected.length) errors.push(`Unexpected phase files: ${unexpected.join(', ')}`);
const decisions=fs.readFileSync('docs/decisions/OPEN_DECISIONS.md','utf8');
if((decisions.match(/^- Status: PROPOSED; approval: none; revision: [1-9]\d*/gm)||[]).length!==8) errors.push('Review ADR status count');
console.log(JSON.stringify({required:required.length,markdown:files.filter(p=>p.endsWith('.md')).length,links,tasks:ids.length,hash,warnings,errors},null,2));
if(errors.length) process.exitCode=1;
```

## Phase 02.75 scenario acceptance — NOT RUN

These are future runtime tests, not evidence from documentation checks. [Factory](../specifications/QUESTION_FACTORY_SPEC.md) and [reuse](../specifications/QUESTION_REUSE_POLICY.md) define the policies.

| Owner scenario | Required experiment and invariant | Tasks |
|---|---|---|
| A — 500 drafts alongside exams | Bounded batch of 500 candidates under an approved budget/review envelope; simultaneous start/save/submit workload stays within owner-approved latency/error/DB limits; separate pools and executor allowlists enforced | FACTORY-001, OPS-001, INT-001 |
| B — Provider unavailable one month | Advance controlled scheduler clock through a month of failures, no live paid calls needed; approved-bank exams still complete, retries/cost bounded | FACTORY-001, INT-001 |
| C — Cross-student reuse | Two users can receive same eligible identity; global analytics cannot consume it | ASSEMBLY-001 |
| D — Same-student no repeat | After the first attempt closes, a later NEW_ONLY attempt has disjoint stable IDs/equivalence groups, including identities assigned to an unstarted first allocation | ASSEMBLY-001, WEB-001 |
| E — Exhaustion | Explicit inventory shortage; no side effects or silent fallback; shorter authorized profile/review opt-in revalidated; bounded unknown search returns distinct error | ASSEMBLY-001, WEB-001 |
| F — Corrected version | Approve v2 after student received v1; stable ID remains excluded; merged equivalent variants also excluded | BANK-001, ASSEMBLY-001 |
| G — Publication during exam | Publish while attempt active; snapshot/key/score hashes unchanged | BANK-001, EXAM-001, SCORE-001 |
| H — Concurrent creation | Real PostgreSQL barriers on same-user distinct-key/profile and cross-mode requests; one active attempt may commit and the loser returns `409 CONCURRENT_ATTEMPT_EXISTS` with no allocation side effects. Test same-key replay separately. | DATA-001, ASSEMBLY-001, EXAM-001 |
| I — Halfway batch failure | Kill after committed unit, raw response persistence, import commit and before acknowledgment; resume reuses checkpoint/receipt; altered same-key hash fails; bundle all-or-none; unknown provider cost stays reserved | FACTORY-001, BANK-001 |
| J — Provider replacement | Contract/evaluation fixtures through second adapter; same canonical publication and unchanged exam engine; no student request calls provider | AI-001/002, INT-001 |

Additional regressions: all modes write history; CANCELLED/EXPIRED/INVALIDATED retain assignments; history survives ordinary answer/result retention; authorized account erasure follows approved policy; monotonic equivalence merge excludes future variants without rewriting historical snapshots; candidate manifests remain private. Factory has no publication privilege, cannot claim grading jobs or read student data; website can run with provider credentials absent. A common PostgreSQL outage is not claimed to be isolated by separate processes.
