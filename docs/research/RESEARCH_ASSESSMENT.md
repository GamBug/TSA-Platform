# Research assessment and evidence register

Assessment date: 2026-10-15. Status: DRAFT evidence assessment, not architectural approval. Original: [TSA_DEEP_RESEARCH.md](TSA_DEEP_RESEARCH.md), read in full (1,643 lines). Its conversation citation tokens cannot be resolved independently; direct URLs below replace that dependency for selected claims. Original SHA-256: `97a5bbe5844626043a5aa92bef7813a1fdbe1ba7d0d65e2bce3970f4c0dd2284`.

## Evidence vocabulary

VERIFIED means directly checked against the named source in this phase, with the stated limits. SUPPORTED_BY_RESEARCH means the original report supports it but its underlying evidence was not independently checked here. ASSUMPTION means a project design/planning choice. REQUIRES_VERIFICATION means insufficient evidence or an unresolved applicability question. Verification of a publication does not approve its reuse or establish current completeness.

## Source register

All access outcomes below are from 2026-10-15; no question corpus was acquired.

| ID | Source and access | What was checked |
|---|---|---|
| S1 | [HUST scheme PDF](https://hust-dev.hust.edu.vn/uploads/sys/tuyen-sinh/2023_01/de-an-tsa-2025.pdf), retrieved; text read | Decision dated 2024-10-23; §§2.3–2.4, printed pp.3–7. Page 4 structure image was not readable in extracted text; screenshot calls did not provide inspectable pixels in this session. |
| S2 | [HUST 2026 handbook announcement](https://ts.hust.edu.vn/index.php/tin-tuc/cam-nang-thi-danh-gia-tu-duy-tsa-2026-xuat-ban-lan-thu-2), search result included page text dated 2025-11-28 | Existence of second edition and preparation subject areas; original URL without `index.php` returned an error. Handbook contents not inspected. |
| S3 | [UIT datasets](https://nlp.uit.edu.vn/datasets), retrieved | ViQuAD description and requirement to contact UIT and sign a corpus user agreement. |
| S4 | [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), retrieved | HTTP handlers within the App Router; supports considering one web/API deployment. |
| S5 | [FastAPI features](https://fastapi.tiangolo.com/features/), retrieved | Typed validation and OpenAPI support; a viable alternative, not a benchmark comparison. |
| S6 | [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), retrieved | Transactional row locking and concurrency mechanisms. |
| S7 | [Drizzle transactions](https://orm.drizzle.team/docs/transactions), retrieved | Transaction support; no selected package version or compatibility matrix tested. |
| S8 | [OWASP API Security 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/), retrieved | Object/property/function authorization and resource-consumption risks. Initial project URL failed; edition URL succeeded. |
| S9 | [WCAG 2.2](https://www.w3.org/TR/WCAG22/), retrieved | Accessibility reference; project AA target is an assumption, not certified compliance. |
| S10 | [Law 91/2025/QH15 record](https://vanban.chinhphu.vn/?docid=214590&pageid=27160), retrieved | Official metadata: effective 2026-01-01. |
| S11 | [Decree 356/2025/NĐ-CP](https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=187276), official search result | Official metadata states effective 2026-01-01; detailed obligations not assessed. |
| S12 | [Government IP-law explanation](https://xaydungchinhsach.chinhphu.vn/nhung-noi-dung-chu-yeu-trong-luat-sua-doi-bo-sung-mot-so-dieu-cua-luat-so-huu-tri-tue-119260127143503456.htm), official search result with article text | Law 131/2025/QH15 effective 2026-04-01. No legal opinion on proposed uses. |

## Claims and consequences

| Claim | Classification | Evidence / limit / consequence |
|---|---|---|
| TSA computer delivery; 100 questions, 150 minutes; section times 60/30/60 | VERIFIED | S1 pp.3,6. A dated public reference, not a guarantee about all future administrations. |
| Section counts 40/20/40 and M1:M2:M3 ratio 4:3:3 | SUPPORTED_BY_RESEARCH | Original report references the page-4 image. Independent visual confirmation still required before publishing a full TSA reference profile. |
| Five interaction families and all required subparts correct | VERIFIED | S1 §2.3.2 p.5. MVP deliberately implements a subset. |
| HUST uses IRT and bridge questions | VERIFIED | S1 §2.3.3 pp.5–6. It does not provide an implementable scoring formula or parameter set. |
| Reproducing official scores from public material | REQUIRES_VERIFICATION | No reproducible algorithm found; never claim equivalence. |
| Section navigation, reconnect policy, type proportions, protected UI | REQUIRES_VERIFICATION | Not established by inspected sources. Define independent practice behavior. |
| 2026 handbook exists | VERIFIED | S2 announcement only; existence does not grant content rights. |
| Reading passages approximately 800–1,000 Vietnamese words | VERIFIED | S1 §2.3.1; not enforced for the small independent MVP profile. |
| ViQuAD is an unrestricted production corpus | REQUIRES_VERIFICATION | S3 requires agreement; no agreement obtained. Keep excluded. |
| SQuAD/GSM8K are available and suitably licensed for each intended use | SUPPORTED_BY_RESEARCH | Report links upstream projects; versions, underlying rights and intended uses not audited. Not imported. |
| QA datasets establish TSA difficulty/IRT parameters | ASSUMPTION rejected | QA correctness benchmarks do not supply this platform's response calibration evidence. |
| LLM critics and difficulty estimates are reliable enough to approve questions | ASSUMPTION rejected | Use heuristics for triage; human answer review remains mandatory. |
| Next.js-only transactional MVP is viable | ASSUMPTION | S4/S6/S7 establish relevant mechanisms; implementation still needs concurrency and deployment tests. |
| Vietnamese privacy/IP statutes listed by research exist with these dates | VERIFIED (metadata only) | S10–S12. Applicability, minors, rights transfers and overseas processing require qualified review before public launch. |
| Research staffing, 14–18-week MVP, 99.9% availability and recovery targets | ASSUMPTION | No team/budget/load evidence; not commitments. |

## Findings across the research

The report is strong on provenance, frozen versions, independent review and separating official IRT from practice scores. It is over-scoped for a first slice: multiple runtimes, Redis, optimization workers, calibration and broad authoring interfaces increase integration work before a reliable attempt exists. [System architecture](../architecture/SYSTEM_ARCHITECTURE.md) evaluates a smaller baseline.

M1/M2/M3 cognitive labels, author difficulty estimates and empirical difficulty must be separate fields. A source's informal description of item difficulty does not justify replacing a cognitive taxonomy with raw percentage-correct. Raw scores are useful feedback but do not imply equal difficulty across forms.

The research mixes pilot/calibration eligibility with the initial practice bank. Requiring calibration before every practice question would block the MVP. The proposed bank permits human-approved, explicitly uncalibrated practice content; future psychometric eligibility is separate. Its proposed secure-bank categories are out of MVP scope because explanations deliberately disclose public-practice content.

Assembly's greedy fallback can fail on a feasible pool; solver timeout is not proof of infeasibility. A relaxed preview must never be issued as a valid exam. Determinism requires frozen candidate inventory, algorithm and ordering, not only a seed. Expiry, submission and save races need explicit database transactions; the report's response sequence example alone does not prevent cross-tab overwrites.

Question generation methods (templates, grounded reading, synthetic science data), independent solvers, distractor evaluation, and evaluation partitions are SUPPORTED_BY_RESEARCH. They inform the [pipeline](../specifications/AI_QUESTION_PIPELINE.md) but no generation accuracy has been measured. Heuristic similarities must produce review candidates, not automatic duplicate deletion.

Open-source candidates: OR-Tools, py-irt, lmqg, QTI adapters, Moodle and Open edX remain reference options. Reported licenses/language support are SUPPORTED_BY_RESEARCH, not re-audited here. Check exact upstream versions, transitive licenses, content rights and Vietnamese suitability before adoption. Do not copy GPL/AGPL code into the project based on the report. QTI is future interchange; internal representation remains independent.

Security priorities are answer leakage, cross-user attempt access, unsafe content, privileged publication, prompt injection, and submit/save races. Operational cost priorities are database/backup, hosting, identity, media egress and human review before AI tokens. No provider prices or capacity estimates were verified. The owner must set budget and traffic before selecting hosting.

AI-assisted coding requires small assigned tasks, frozen contracts, review evidence and reproducible checks. Conversation-only plans and simulated agent approvals are not acceptable collaboration records; see [handoff protocol](../agents/HANDOFF_PROTOCOL.md).

## Outstanding evidence work

FOUND-003 owns visual verification of the official blueprint table, checking for newer official changes, and a source/date trail before a full reference profile is enabled. DATA-002 owns original/authorized question provenance and independent subject review. OPS-001 owns deployment capacity/cost and privacy decisions. No automatic corpus scraping, protected material uploads, or official branding is authorized by this assessment.
