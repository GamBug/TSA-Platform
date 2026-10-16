# Architecture review resolution 001

Date: 2026-10-16. Task: FOUND-005. Author: Codex, lead architect/documentation integrator. Input: [ARCHITECTURE_REVIEW_001](ARCHITECTURE_REVIEW_001.md), authored by Antigravity as an independent review under FOUND-004. Status: PROPOSED architectural amendments, documentation reconciliation only. Neither the review's APPROVE_WITH_CHANGES recommendation nor this resolution is human approval. No independent re-review of these corrections has been recorded.

The input contains **15 numbered findings** (2 CR, 5 HI, 5 MD, 3 LO). Its executive summary's “3 defects / 7 risks / 8 improvements” does not match that enumeration. This resolution covers the enumerated findings, all 13 adversarial scenarios and the additional actionable scoring comment in §7.10; the input is preserved without editing its counts.

Dispositions: **7 ACCEPT, 4 PARTIALLY_ACCEPT, 2 REJECT, 2 NEEDS_HUMAN_DECISION**. ACCEPT means the technical correction is justified, not that it is approved for implementation. Where behavior is a product choice, a concrete proposed contract is documented for owner review rather than silently chosen as approved policy.

## Finding disposition matrix

| Finding | Disposition | Technical reasoning | Resulting documents and verification requirements |
|---|---|---|---|
| CR-01 | PARTIALLY_ACCEPT | Different keys can create concurrent attempts: a real missing policy/constraint. However public practice already allows learning answers from previous attempts, so concurrency is not itself a demonstrated critical security defect. Attempts do **not** increment the sealed-form exposure metric, contrary to the review's exposure argument. | Propose H1: one CREATED/IN_PROGRESS per user/form, partial unique index, 409 CONCURRENT_ATTEMPT_EXISTS, lazy stale-state reconciliation and retake after closure. Engine, DB, API, ADR-003/004; DATA-001/EXAM-001 test distinct-key races, same-key replay and pending-grade retakes. Owner H1 remains required. |
| CR-02 | ACCEPT | An unnamed zero-seed constant and unspecified bit operations allow divergent implementations. Pinning the complete PRNG behavior is justified. This is a specification gap, not evidence of an existing production failure. | Assembly pins constant 2463534242, shifts 13/17/5, uint32 semantics, three five-output vectors and exact shuffle index calculation. FOUND-002/ASSEMBLY-001 require vectors plus full-manifest fixtures; calculations executed here are documented below, not application tests. No unsupported historical attribution is adopted. |
| HI-01 | ACCEPT | CANCELLED needs a responsible actor, trigger and safe API behavior. A request that throws after a DB update must not accidentally roll back cancellation. | Engine/DB/API define lazy GET/start/list reconciliation, existing worker sweep, reasons, null start/deadline, committed transition followed by 410 start response, 200 safe GET, and withdrawal/start lock ordering. Before-opening wait is not cancellation. EXAM-001/002 require lazy/sweep/race/outage tests. |
| HI-02 | ACCEPT | A generic string obscures per-dimension validation; SKILL also lacked a blueprint taxonomy-version reference. UUID syntax cannot establish membership. Difficulty must select a specific stored field. | API Quota union + blueprint taxonomyVersionId; DB FK; assembly validates kind/version, section IDs, integer bounds and duplicate tuples. Difficulty selects editor target, not AI prediction. ASSEMBLY-001/FOUND-002 require negative fixtures. Question/AI schemas already pin taxonomy and need no rewrite. |
| HI-03 | NEEDS_HUMAN_DECISION | Both admission-window and full-duration-fit semantics are legitimate product policies. Existing rights coverage beyond availableUntil supports admission-only, but does not constitute approval. | H2 proposes finite `[from,until)` at create and first start; admitted attempt may complete later; rights still cover deadline and access holds. Engine/API/DB/catalog now express this proposal and exact boundaries. EXAM-001 tests before/open/close, create-before-close then start-after-close, admitted late completion and rights holds. Owner selects H2 before coding. |
| HI-04 | PARTIALLY_ACCEPT | FOUND-002 already required generated contract drift checks, and API compatibility already required coordinated strict clients. The gap is concrete enforcement, not absence of any requirement. Optional additive fields are not automatically compatible with strict readers. | API/system/backlog specify deterministic regeneration comparison, committed artifacts and producer/consumer positive/negative fixtures. CI must fail stale artifacts or mismatched responses; additive fields pass only after synchronized generation and consumer checks. No new service/tool installation. |
| HI-05 | PARTIALLY_ACCEPT | Diagnostics were already staff-only and role-separated in principle. Exact inventory inference is not automatically a high-severity confidentiality breach for this public-practice MVP; trust levels still need precision. | EXAM_MANAGER errors expose only section deficits/run ID; BANK_MANAGER gets a separate audited diagnostics read with counts/candidate references but never keys. Existing selected-form references remain intentionally visible to EXAM_MANAGER. API/assembly/backlog require role projection tests including combined roles. No implied BANK_MANAGER right to assemble. |
| MD-01 | REJECT | Counting only non-withdrawn forms would redefine lifetime sealed-form count as active-form count. A withdrawn form may already have been delivered; decrementing hides real history and can bypass caps. | Preserve metric. Assembly/DB clarify audited corruption repair from **all** sealed forms, including withdrawn forms. Legitimate shortage requires content or a new authorized blueprint cap; starter cap may be null. ASSEMBLY-001 checks withdrawal/replay do not decrement/increment again. No active-only recount command is added. |
| MD-02 | ACCEPT | Blueprint validation does not prove persisted slots/sections match during sealing. A second transaction assertion catches mapping bugs without extra infrastructure. | Assembly/DB require exact blueprint section match, actual per-section slot counts, <=200 slots and <=21600 seconds; mismatch rolls back form/slots/exposure. DATA-001/ASSEMBLY-001 test bypassing outer validation. Do not assume ordinary SQL CHECK can enforce cross-row aggregates. |
| MD-03 | NEEDS_HUMAN_DECISION | Repeated section enums are technically supportable via sectionId but not required by current MVP. Uniqueness is a product restriction, not an objectively necessary fix. | H3 proposes one to three unique section enums/IDs, retaining section practice. API/assembly validation and proposed DB uniqueness align. Owner decides; future repeated sections require versioned contracts and tests, not ad hoc agent interpretation. |
| MD-04 | PARTIALLY_ACCEPT | Original retention already said “through attempt lifecycle”; exact cleanup semantics were missing. Tying expiry only to original availability is brittle when windows change or grading is delayed. | DB pins related-attempt receipts while CREATED/IN_PROGRESS/SUBMITTED/EXPIRED, including failed grading; expires no earlier than max(receipt completion, finalization)+7 days after GRADED/CANCELLED/INVALIDATED. Cleanup rechecks under lock. API retains post-expiry current-admission/active-attempt behavior. EXAM-001/002 test delayed start/grade and eventual retry; ADR-006 still governs lawful deletion. |
| MD-05 | ACCEPT | Browser debounce is not protection against deliberate save floods. A testable server budget is warranted; benchmark claims or extra services are not. | API proposes per-attempt 10/s burst20 and per-user 20/s burst40, shared PG buckets, authorization before buckets, 429/Retry-After without save mutation and preserved pending client edits. DB lock/cleanup semantics, AUTH/EXAM/WEB/OPS tests specified. Defaults remain proposed, not measured; no Redis introduced. |
| LO-01 | ACCEPT | Transition feedback is needed to make fixed section windows understandable and avoid false “saved” UI. | Engine/WEB-001 require section/overall countdown, one accessible <=60-second warning per section including resume, locked/future indicators and visible rejected saves. No grace period or timing authority moves to client. |
| LO-02 | REJECT | `answers` PK(attempt_id,slot_id) stores latest value; revision is a concurrency counter, not a retained version row. Full answer-edit history would add storage, privacy and retention scope for a forensic feature outside MVP. | Engine/DB explicitly state latest acknowledged value frozen on closure; audit excludes answer content. Receipts/backups are not a supported forensic history. No new answer-history table. Any future forensic feature requires separate scope/retention approval; OPS records limitation. |
| LO-03 | ACCEPT | A fixed labeled display timezone avoids ambiguous absolute timestamps without affecting server clocks. | Engine/WEB-001 specify Asia/Ho_Chi_Minh, ICT (UTC+7); countdown uses server time deltas. Browser timezone changes must not change deadline behavior. |

Authoritative changed contracts: [database](../architecture/DATABASE_DESIGN.md), [API](../architecture/API_CONTRACTS.md), [engine](../specifications/EXAM_ENGINE_SPEC.md), [assembly](../specifications/EXAM_ASSEMBLY_SPEC.md). Decisions/impact/rollback are in [OPEN_DECISIONS](../decisions/OPEN_DECISIONS.md); task acceptance is in [TASK_BACKLOG](../tasks/TASK_BACKLOG.md); regression requirements are in [TEST_STRATEGY](../quality/TEST_STRATEGY.md).

## Additional review comments and adversarial coverage

§7.10 integer rounding: ACCEPT. Engine pins quotient/remainder half-up arithmetic, including an actual tie (1/32 → 3.13) rather than relying solely on 1/3. SCORE-001 owns runtime tests. Exact arithmetic calculations below are documentation verification only.

| Review scenarios | Disposition / check against proposed design |
|---|---|
| AS-01 / AS-09 historical edits/migrations | ACCEPT existing safeguards; immutable public/private snapshots and populated migration tests remain unchanged (Q-04). No correction needed. |
| AS-02 simultaneous submit | ACCEPT existing row-lock/idempotent closure design (Q-07). Additional creation concurrency is CR-01, not a replacement of submission rules. |
| AS-03 duplicate exam questions | ACCEPT existing identity/enemy/bundle invariants (Q-03); lifetime exposure clarification does not weaken these. |
| AS-04 ambiguous AI output | ACCEPT residual human-review risk; Q-02/Q-16 and held-out evaluations remain necessary, never a correctness guarantee. |
| AS-05 provider outage | ACCEPT existing isolation/retry design; no AI dependency added to exam path. |
| AS-06 contract changes | PARTIALLY_ACCEPT as HI-04; specify CI enforcement, not reliance solely on process. |
| AS-07 / AS-08 stale context/provider transfer | ACCEPT repository onboarding; update state/handoff to point at this resolution so a new agent sees amendments and unapproved choices. |
| AS-10 insufficient inventory | ACCEPT fail-without-partial-form; HI-05 restricts diagnostic projection, preserving staff remediation. |
| AS-11 answer leakage | ACCEPT high implementation risk and Q-08 requirements; no claim security is proven by documents. No amendment exposes private answers through diagnostics. |
| AS-12 disconnect | ACCEPT explicit server-time/no-grace policy remains proposed; LO-01 adds pre-start disclosure/feedback, not deadline extension. |
| AS-13 overlapping agents | ACCEPT coordinated file ownership as proportionate; do not add an orchestration server or CODEOWNERS infrastructure in this documentation task. |

Review §7.1–7.6: module boundaries, relational integrity, question schema, AI validation, human review and provenance were rechecked; relevant changes are CR-01/HI-02, with no additional services or schema expansion for AI. §7.7–7.12: assembly, state transitions, autosave, scoring, API and frontend boundaries map to CR-02/HI-01–05/MD-01–05/LO-01/03 and the rounding clarification. §7.13–7.18: authorization, tests, small-team complexity, transfer, handoff and provider independence remain appropriate proposals. Do not interpret a documentation DAG or review praise as compiled dependency verification. Legal metadata is not legal clearance; original evidence gaps remain assigned to FOUND-003/OPS-001. The review's §8 owner questions are H1–H3 plus the ADR bundle; its §9 enumeration, not inconsistent executive counts, defines numbered coverage here.

## Cross-document consistency and implementation impact

- Database/API/engine agree on active uniqueness, distinct-key conflict, nullable cancellation reason, unstarted cancellation versus started invalidation, finite admission windows and persistent deadlines. Retake after SUBMITTED/EXPIRED does not wait for grading; no claim this prevents answer sharing.
- Blueprint/API/DB agree on pinned taxonomy, discriminated quota values, target difficulty, section IDs/enums and aggregate sealing assertions. Question schema and AI generation already carry taxonomyVersionId; their content/review semantics are unchanged. Cross-taxonomy input is rejected instead of silently mapped.
- Assembly exposure remains lifetime sealed forms. No count is charged by attempt creation. Frozen manifests/private snapshots and bank publication locking remain unchanged.
- Latest-only answers still provide the frozen scoring input. Cancellation/closed-attempt metadata is not an answer-history feature. Save budgets do not reset clocks, change revisions on rejection or throttle submit through the save bucket.
- API schema enforcement and producer/consumer checks precede independent UI/backend implementation. FOUND-002 now also depends on FOUND-005 completion; foundational approval still comes from FOUND-004/G1. No cyclic task dependency introduced.
- AI pipeline remains POST_MVP; no changes to provider schema, publication gates, secure content sharing or rights assumptions. Full TSA reference profile remains deferred. Original research and review are immutable inputs.

ADR-003/004/006 are revision 2; ADR-001/002/005 remain revision 1, all PROPOSED. No deployed schema/data exists, so these are prospective contract changes, not performed migrations. Owner H1/H2/H3 choices can change the proposals before implementation; matching DB/API/tests must then be updated together. Remaining algorithm search/canonicalization fixtures are an explicit FOUND-002 deliverable before independent consumers, not claimed delivered by PRNG vectors.

## Preserved Phase 01 evidence

The prior uncommitted LAST_HANDOFF for FOUND-001 is replaced by the reconciliation handoff; its essential evidence is retained here and in that task record. On 2026-10-15 Codex read the complete 1,643-line research via sed ranges 1–560, 561–1120, 1121–1700, inspected all initial Markdown, ran `rg --files`, `wc -l`, `git status --short`, and SHA-256. Branch main was unborn; `git log -1 --oneline` returned exit 128 for no commits. Ten preexisting required Markdown files were empty; .gitignore/research were preserved.

Phase 01 populated 19 requested documents plus RESEARCH_ASSESSMENT. The embedded Node checker (Node v24.18.0, Linux/bash) exited 0: 19 required files, 21 Markdown including research, 91 local links, 20 task IDs, no errors. `git diff --check` exited 0 but did not cover untracked files; the checker covered whitespace. Research hash was `97a5bbe5844626043a5aa92bef7813a1fdbe1ba7d0d65e2bce3970f4c0dd2284`. Manual walkthrough clarified start receipts and composite FK targets. External retrieval outcomes/limits remain in unchanged RESEARCH_ASSESSMENT, including the unverified PDF table. No application tests ran; no independent review existed at that earlier handoff. Antigravity's later review changes that historical status, not architecture approval.

## Phase 02.5 verification and remaining gates

Executed so far: input hash checks; full review/spec inspection; JS uint32 versus BigInt cross-calculation for all 15 PRNG outputs (match). Final static/coverage/rounding/scope checks and exact results are recorded in [LAST_HANDOFF](../agents/LAST_HANDOFF.md). These are documentation/reference calculations only. No DB migration, API, browser, concurrency, rate-limit, security or AI application test exists or has run. No new external factual verification is claimed.

Protected review SHA-256: `d78a114027d3441967a2a7756d1a44bf6c6e46a80d537c027a3265ce2669ee34`; protected research hash as above. All original findings remain visible, including rejected suggestions.

First static check detected existing trailing whitespace in the immutable review input. It was **not** reformatted. The checker now emits a specific warning for that file and enforces its exact SHA-256; new/changed document whitespace still fails. An initial attempted date-line patch did not match the longer existing line and made no change; the dated reconciliation entry was added explicitly instead. A tool-session restart interrupted work; persisted edits and protected hashes were rechecked before continuation. The ephemeral full-file baseline map was lost, so no claim of a surviving pre/post hash comparison for every unrelated file is made; protected-input hashes and the recorded patch target list establish the reported scope.

Reproduce finding/vector/rounding checks from repository root: `sed -n '/^```javascript$/,/^```$/p' docs/reviews/REVIEW_RESOLUTION_001.md | sed '1d;$d' | node`.

```javascript
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const review=read('docs/reviews/ARCHITECTURE_REVIEW_001.md');
const resolution=read('docs/reviews/REVIEW_RESOLUTION_001.md');
const ids=[...review.matchAll(/^### ((?:CR|HI|MD|LO)-\d{2}):/gm)].map(m=>m[1]);
const rows=[...resolution.matchAll(/^\| ((?:CR|HI|MD|LO)-\d{2}) \| (ACCEPT|PARTIALLY_ACCEPT|REJECT|NEEDS_HUMAN_DECISION) \|/gm)];
if(ids.length!==15||rows.length!==15||ids.some(id=>rows.filter(r=>r[1]===id).length!==1)) throw Error('Finding coverage mismatch');
const counts={}; for(const r of rows) counts[r[2]]=(counts[r[2]]||0)+1;
const assembly=read('docs/specifications/EXAM_ASSEMBLY_SPEC.md');
const vectors=[...assembly.matchAll(/^\| (0|1|4294967295) \| ([0-9, ]+) \|$/gm)];
if(vectors.length!==3) throw Error('Missing PRNG vectors');
for(const v of vectors) {
  let x=Number(v[1])||2463534242,b=BigInt(x);
  const expected=v[2].split(',').map(Number);
  if(expected.length!==5) throw Error('Vector length');
  for(const e of expected) {
    x^=x<<13; x^=x>>>17; x^=x<<5; x>>>=0;
    b=(b^(b<<13n))&0xffffffffn; b=(b^(b>>17n))&0xffffffffn; b=(b^(b<<5n))&0xffffffffn;
    if(x!==e||b!==BigInt(e)) throw Error('PRNG mismatch');
  }
}
for(const [c,t,expected] of [[1,3,'33.33'],[1,32,'3.13'],[0,10,'0.00'],[10,10,'100.00']]) {
  const n=10000*c,h=Math.floor(n/t)+(2*(n%t)>=t?1:0);
  const value=Math.floor(h/100)+'.'+String(h%100).padStart(2,'0');
  if(value!==expected) throw Error('Rounding mismatch');
}
console.log(JSON.stringify({findings:ids.length,dispositions:counts,PRNGOutputs:15,roundingCases:4,errors:[]},null,2));
```

Readiness: ready for owner review of a concrete reconciled proposal, **not authorized for implementation**. Remaining gates are owner disposition of ADR-001–004 including H1–H3, acceptance of ADR-003/006 amendments, explicit implementation assignment, and later content/identity/privacy/hosting prerequisites. Residual risks: human answer errors, serializer/asset leakage, real-DB race behavior, rights changes, inventory sufficiency, unmeasured rate/capacity limits and incomplete official reference evidence. Corrections reduce ambiguity but do not demonstrate runtime correctness. Stop after documentation reconciliation.
