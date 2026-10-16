# Đánh giá kiến trúc độc lập — FOUND-004

Ngày đánh giá: 2026-10-16. Người đánh giá: Antigravity, Principal Software Architect & Technical Quality Reviewer (độc lập). Phạm vi: toàn bộ kiến trúc đề xuất trong Phase 01 — ADR-001 đến ADR-006, tất cả specification, database design, API contracts và quy trình vận hành.

Trạng thái: Đây là bản đánh giá độc lập (independent review), KHÔNG phải phê duyệt kiến trúc của owner. Mọi đề xuất sửa đổi cần được human owner xem xét và phê duyệt trước khi triển khai.

Tài liệu đã đọc: 21 file Markdown + .gitignore; xác nhận repository state: branch main, unborn HEAD, tất cả untracked, không có application code.

---

## 1. Tóm tắt tổng quan (Executive Summary)

Kiến trúc đề xuất bởi agent trước (Codex) có chất lượng **cao hơn mức trung bình đáng kể** cho một phase documentation. Các quyết định cốt lõi — immutable versioning, frozen form snapshots, transactional attempt locking, separated secrets, idempotent submission, và provider-neutral AI pipeline — đều là những lựa chọn hợp lý và phòng thủ tốt.

Tuy nhiên, qua phân tích adversarial, tôi phát hiện **3 lỗi thiết kế cần sửa** (CRITICAL/HIGH), **7 rủi ro có khả năng xảy ra** cần giải quyết trước khi triển khai, và **8 điểm cải thiện** nên xem xét. Không có vấn đề nào đòi hỏi thiết kế lại toàn bộ kiến trúc.

**Đề xuất tổng thể: APPROVE_WITH_CHANGES** — Kiến trúc đủ vững để bắt đầu triển khai sau khi giải quyết các finding CRITICAL và HIGH. Xem chi tiết tại [§8](#8-đề-xuất-tổng-thể).

---

## 2. Các phát hiện CRITICAL

### CR-01: Thiếu ràng buộc giới hạn attempt đồng thời trên cùng form

- **Mức độ**: CRITICAL — Lỗi thiết kế đã xác nhận
- **Nguồn gốc**: [DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) bảng `attempts` — constraint `UNIQUE(id,form_id)` chỉ phục vụ composite FK, KHÔNG ngăn một student tạo nhiều attempt đồng thời trên cùng một form.
- **Bằng chứng**: Bảng `attempts` có `user_id FK, form_id FK` nhưng không có partial unique index như `UNIQUE(user_id, form_id) WHERE state IN ('CREATED','IN_PROGRESS')`. [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) endpoint `POST /attempts` chỉ ghi "one creation per key" (idempotency), nhưng idempotency key khác nhau sẽ tạo attempt khác nhau.
- **Tác động**: Student có thể tạo nhiều attempt song song trên cùng form, mở nhiều tab với các attempt khác nhau. Điều này:
  - Phá vỡ ý nghĩa thực hành (làm bài nhiều lần đồng thời, chọn kết quả tốt nhất)
  - Tăng tải database không cần thiết
  - Exposure count bị inflate vô nghĩa (mỗi attempt chiếm 1 slot nhưng form giống nhau)
- **Kịch bản tái hiện**: Student gửi `POST /attempts {formId: X}` với Idempotency-Key "A", nhận attempt-1. Gửi lại với key "B", nhận attempt-2. Cả hai đều IN_PROGRESS trên cùng form X.
- **Đề xuất sửa**: Thêm partial unique index:
  ```sql
  CREATE UNIQUE INDEX idx_one_active_attempt_per_form
  ON attempts (user_id, form_id)
  WHERE state IN ('CREATED', 'IN_PROGRESS');
  ```
  API trả 409 `CONCURRENT_ATTEMPT_EXISTS` nếu vi phạm. Policy về retake (cho phép attempt mới sau khi attempt cũ terminal) cần được document rõ.
- **Test hồi quy cần thiết**: Tạo attempt khi đã có attempt active trên cùng form → reject; tạo attempt mới sau khi attempt cũ đã SUBMITTED/EXPIRED → accept; race condition hai request tạo attempt đồng thời → chỉ một thành công.

### CR-02: Hằng số xorshift32 cho seed=0 chưa được pin cố định

- **Mức độ**: CRITICAL — Lỗi thiết kế đã xác nhận
- **Nguồn gốc**: [EXAM_ASSEMBLY_SPEC.md](../specifications/EXAM_ASSEMBLY_SPEC.md#L25) ghi "zero seed maps to fixed nonzero constant" nhưng không chỉ định giá trị cụ thể.
- **Bằng chứng**: Đoạn "xorshift32 (zero seed maps to fixed nonzero constant)" — không có giá trị nào được ghi nhận.
- **Tác động**: Hai implementation khác nhau (hoặc hai agent khác nhau) có thể chọn hằng số khác nhau, phá vỡ hoàn toàn tính reproducible của assembly. Golden fixture test sẽ fail khi chuyển đổi implementer. Đây là vi phạm trực tiếp invariant Q-10 trong [TEST_STRATEGY.md](../quality/TEST_STRATEGY.md).
- **Kịch bản tái hiện**: Agent A implement với constant = 2463534242. Agent B implement với constant = 1. Cùng manifest + seed 0 → slot ordering khác nhau hoàn toàn.
- **Đề xuất sửa**: Pin giá trị cụ thể trong spec, ví dụ: "zero seed maps to `2463534242` (Marsaglia's original xorshift32 example constant)". Bổ sung ít nhất 3 golden test vectors vào spec: `(seed, sequence_length) → expected_output_sequence`.
- **Test hồi quy cần thiết**: Golden vector test cho seed=0, seed=1, seed=MAX_UINT32; verify deterministic output across implementations.

---

## 3. Các phát hiện HIGH

### HI-01: Cơ chế kích hoạt trạng thái CANCELLED chưa được chỉ định

- **Mức độ**: HIGH — Lỗi specification đã xác nhận
- **Nguồn gốc**: [EXAM_ENGINE_SPEC.md](../specifications/EXAM_ENGINE_SPEC.md) bảng state transition ghi "CREATED → CANCELLED: Never-started attempt cancelled due to unavailable form" nhưng không chỉ định:
  - Ai kích hoạt transition này? (hệ thống tự động, staff action, hay student action?)
  - Khi nào? (form withdrawal trigger, hay lazy check khi student cố start?)
  - Có sweep job không? (tương tự expiry sweep cho IN_PROGRESS)
- **Bằng chứng**: So sánh với EXPIRED — có mô tả rõ "scheduled expiry is an optimization: any access also enforces expiry, and a worker sweep closes abandoned attempts". CANCELLED không có mô tả tương đương.
- **Tác động**: Nếu không có sweep, các attempt CREATED trên form bị withdrawn sẽ tồn tại vô thời hạn trong DB. Student có thể thấy attempt "chờ bắt đầu" nhưng không bao giờ start được mà cũng không được cleanup.
- **Đề xuất sửa**: Bổ sung vào engine spec:
  1. Start request trên form withdrawn/unavailable → transition CREATED→CANCELLED với reason
  2. Worker sweep định kỳ cancel các attempt CREATED trên form không còn available
  3. Student GET `/attempts/{id}` trên CANCELLED attempt trả thông tin hủy
- **Test hồi quy cần thiết**: Withdraw form → attempt CREATED tự động/lazy cancel; start attempt trên form withdrawn → 410; sweep cancel attempt CREATED quá hạn.

### HI-02: Blueprint quota `value` là string không có type discrimination

- **Mức độ**: HIGH — Rủi ro có khả năng xảy ra cao
- **Nguồn gốc**: [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) type `BlueprintConfig`:
  ```typescript
  quotas:{sectionId:string, dimension:"SKILL"|"COGNITIVE_LEVEL"|"DIFFICULTY",
    value:string, min:number, max:number}[]
  ```
  `value:string` có thể là UUID (skill ID), enum string ("M1"), hoặc difficulty label ("EASY") tùy theo `dimension`.
- **Bằng chứng**: Không có validation rule nào chỉ định value phải match format tương ứng với dimension. Ví dụ, `dimension:"SKILL"` thì `value` phải là UUID hợp lệ tham chiếu đến taxonomy node; `dimension:"COGNITIVE_LEVEL"` thì `value` phải là "M1"|"M2"|"M3".
- **Tác động**: Blueprint với quota `{dimension:"DIFFICULTY", value:"IMPOSSIBLE", min:5, max:10}` sẽ pass schema validation nhưng fail silently tại assembly time — không có question nào match. Lỗi xảy ra muộn và khó debug.
- **Đề xuất sửa**: Thêm validation rules per-dimension:
  - `SKILL` → value phải là valid taxonomy node UUID trong taxonomy version được tham chiếu
  - `COGNITIVE_LEVEL` → value ∈ {"M1","M2","M3"}
  - `DIFFICULTY` → value ∈ {"EASY","MEDIUM","HARD"}
  
  Hoặc sử dụng discriminated union cho quota type. Document validation rõ trong spec.
- **Test hồi quy cần thiết**: Invalid value per dimension type → reject tại blueprint creation; valid values → accept; null difficulty question never satisfies difficulty quota (đã ghi trong spec — tốt).

### HI-03: Thiếu specification rõ ràng cho availability check tại thời điểm tạo attempt

- **Mức độ**: HIGH — Rủi ro có khả năng xảy ra
- **Nguồn gốc**: [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) `POST /attempts` ghi "current availability/rights guard" nhưng [DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) bảng `form_availability` chỉ có `available_from/until, withdrawn_at`.
- **Bằng chứng**: Không có specification nào chỉ rõ:
  - Student có thể tạo attempt trước `available_from`?
  - Nếu form `available_until` là trong 2 phút nhưng bài thi cần 15 phút, cho phép tạo attempt không?
  - Kiểm tra `available_until >= NOW() + total_duration` hay chỉ `available_until > NOW()`?
- **Tác động**: Nếu chỉ check `NOW() BETWEEN available_from AND available_until`, student có thể tạo attempt 1 giây trước `available_until`, bắt đầu bài thi, và deadline sẽ vượt quá availability window. Hoặc ngược lại, nếu check quá chặt, form có thể bị "unusable" trong khoảng thời gian cuối cùng.
- **Đề xuất sửa**: Chỉ định rõ trong engine spec: attempt creation yêu cầu `NOW() >= available_from AND (available_until IS NULL OR NOW() + max_attempt_duration <= available_until)`. Hoặc đơn giản hơn cho MVP: chỉ check `NOW() BETWEEN available_from AND available_until` và chấp nhận attempt có thể chạy quá availability window (vì deadline là của attempt, không phải form).
- **Test hồi quy cần thiết**: Tạo attempt trước available_from → reject; tạo attempt sau available_until → reject; tạo attempt sát available_until → behavior cần specification rõ.

### HI-04: Thiếu cơ chế phát hiện contract drift tự động giữa các module

- **Mức độ**: HIGH — Rủi ro có khả năng xảy ra
- **Nguồn gốc**: [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) L34 ghi "Generate machine-readable API/client artifacts from validated schemas in FOUND-002" nhưng không có specification nào cho cơ chế tự động phát hiện khi một module thay đổi contract mà consumer chưa update.
- **Bằng chứng**: [HANDOFF_PROTOCOL.md](../agents/HANDOFF_PROTOCOL.md) dựa vào quy trình thủ công: "Architecture changes use ADR process." [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) L119 ghi "Breaking changes require... updated schemas and contract tests before merging consumers" nhưng không chỉ định tooling tự động.
- **Tác động**: Khi nhiều agent/developer làm việc song song (ví dụ WEB-001 và EXAM-001), một bên thay đổi response shape mà bên kia không biết → integration failure phát hiện muộn.
- **Đề xuất sửa**: FOUND-002 cần bao gồm:
  1. Runtime schema validation từ shared contract definitions (đã mention)
  2. CI job so sánh generated OpenAPI/types với committed version → fail nếu drift
  3. Contract test fixtures kiểm tra cả producer và consumer side
  Đây không phải yêu cầu thay đổi kiến trúc — chỉ cần chỉ định rõ trong FOUND-002 deliverables.
- **Test hồi quy cần thiết**: Thay đổi API response shape mà không update contract → CI fail; thêm optional field → CI pass (additive compatible).

### HI-05: Rủi ro rò rỉ thông tin qua error response trong assembly

- **Mức độ**: HIGH — Rủi ro có khả năng xảy ra
- **Nguồn gốc**: [EXAM_ASSEMBLY_SPEC.md](../specifications/EXAM_ASSEMBLY_SPEC.md) L37 ghi "Staff diagnostics may reveal inventory; students receive only availability messages." [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) L113 ghi "SEARCH_EXHAUSTED details must explicitly avoid claiming infeasibility."
- **Bằng chứng**: Tuy spec phân biệt staff/student error detail, endpoint assembly `POST /assemblies` là staff-only. Nhưng error codes 422 `INVENTORY_SHORTAGE` trả về "per-section/quota counts" — nếu diagnostic chi tiết đến mức reveal có bao nhiêu câu hỏi approved cho mỗi skill, thông tin này có thể nhạy cảm với integrity của bank.
- **Tác động**: Staff user với role EXAM_MANAGER (không phải BANK_MANAGER) có thể suy luận bank composition từ shortage diagnostics. Mức độ tác động phụ thuộc vào trust model giữa các role.
- **Đề xuất sửa**: Chỉ định rõ mức chi tiết của assembly diagnostics per role. EXAM_MANAGER nhận aggregate shortage ("section MATH thiếu 3 câu"), BANK_MANAGER nhận chi tiết hơn nếu cần. Document trong API spec.
- **Test hồi quy cần thiết**: EXAM_MANAGER request assembly → shortage error không reveal exact eligible question IDs; BANK_MANAGER → có thể thấy chi tiết hơn.

---

## 4. Các phát hiện MEDIUM

### MD-01: Exposure count inflation do withdrawal không có remediation path

- **Mức độ**: MEDIUM — Rủi ro được nhận biết nhưng thiếu giải pháp
- **Nguồn gốc**: [EXAM_ASSEMBLY_SPEC.md](../specifications/EXAM_ASSEMBLY_SPEC.md) L19: "Reserve/increment at sealing once, transactionally; no automatic decrement on withdrawal."
- **Bằng chứng**: Spec thừa nhận thiết kế này nhưng không đề cập remediation. Nếu nhiều form bị withdrawn (do rights revocation, content quarantine), các question liên quan sẽ có exposure count cao hơn thực tế sử dụng.
- **Tác động**: Với exposure cap nhỏ (ví dụ 5), một question có thể bị "hết quota" dù chỉ thực sự được sử dụng trong 2 form active. Điều này thu hẹp eligible pool và tăng risk INVENTORY_SHORTAGE.
- **Đề xuất sửa**: Thêm documented remediation: staff BANK_MANAGER có thể request exposure recount dựa trên actual active forms (not withdrawn). Đây là operational command, không phải automatic decrement. Bổ sung vào post-MVP nếu exposure cap được sử dụng thực tế.
- **Test hồi quy cần thiết**: Seal form → exposure++; withdraw form → exposure không giảm (current spec); manual recount → exposure = count of non-withdrawn forms containing question.

### MD-02: `form_sections.duration_seconds` cho phép tổng thời gian rất lớn mà không có aggregate check

- **Mức độ**: MEDIUM — Thiếu validation
- **Nguồn gốc**: [DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) bảng `form_sections` có "positive duration/count" nhưng không có aggregate constraint.
- **Bằng chứng**: [EXAM_ASSEMBLY_SPEC.md](../specifications/EXAM_ASSEMBLY_SPEC.md) L9 giới hạn "6 hours per form" nhưng đây là blueprint validation, không phải database constraint. Nếu sealing logic có bug, form với tổng 30 giờ có thể được tạo.
- **Tác động**: Student bắt đầu attempt với deadline 30 giờ sau → chiếm resource, idempotency records phải tồn tại lâu hơn expected.
- **Đề xuất sửa**: Thêm application-level assertion tại sealing: `SUM(duration_seconds) <= 21600` (6h). Cân nhắc database CHECK constraint nếu PostgreSQL hỗ trợ deferrable cross-row checks, hoặc trigger.
- **Test hồi quy cần thiết**: Blueprint với tổng > 6h → reject; sealed form tổng duration match blueprint.

### MD-03: Thiếu specification cho behavior khi multiple sections có cùng `section` enum value

- **Mức độ**: MEDIUM — Ambiguity trong specification
- **Nguồn gốc**: [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) `BlueprintConfig.sections` có `{id:string, section:Section, count:number, durationSeconds:number}[]` — không có constraint nào ngăn hai section entries có cùng `section:"MATH"`.
- **Bằng chứng**: Blueprint starter có 3 sections MATH/READING/SCIENCE, mỗi loại một lần. Nhưng spec không cấm blueprint có "MATH part 1" và "MATH part 2". Score sections trong `Result` cũng group by `sectionId`, không phải `section` enum.
- **Tác động**: Nếu cho phép: scoring per-section hoạt động vì dùng `sectionId`. Nhưng skill quotas tham chiếu `sectionId`, trong khi eligible questions filter theo `section` enum → có thể gây confusion. Nếu không cho phép: cần document rõ.
- **Đề xuất sửa**: Chỉ định rõ: MVP UNIQUE(section) trong blueprint config, hoặc document rõ rằng multiple section entries với cùng Section enum là valid và quota/eligibility hoạt động ra sao.
- **Test hồi quy cần thiết**: Blueprint với duplicate section enum → behavior theo spec decision; scoring aggregation chính xác cho cả hai trường hợp.

### MD-04: `idempotency_records.expires_at` không liên kết rõ với attempt lifecycle

- **Mức độ**: MEDIUM — Rủi ro có khả năng xảy ra
- **Nguồn gốc**: [DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) bảng `idempotency_records` có "expires_at" và [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) L117 ghi "after expiry creation keys may create a new resource".
- **Bằng chứng**: Nếu idempotency record cho `POST /attempts` expire trước khi attempt kết thúc (ví dụ 7 ngày nhưng attempt chưa start), student retry với cùng key sẽ tạo attempt MỚI thay vì trả kết quả cũ. Kết hợp với CR-01 (thiếu concurrent limit), điều này tạo duplicate attempts.
- **Tác động**: Trung bình thấp vì student ít khi retry sau 7 ngày. Nhưng nếu form availability kéo dài (ví dụ 30 ngày), rủi ro tăng.
- **Đề xuất sửa**: Idempotency record cho attempt creation nên có `expires_at >= form.available_until + max_attempt_duration`, hoặc ít nhất document mối quan hệ. CR-01 fix sẽ giảm thiểu vấn đề này đáng kể.
- **Test hồi quy cần thiết**: Retry sau idempotency expiry → behavior theo spec (tạo mới nếu CR-01 cho phép, reject nếu có active attempt).

### MD-05: Thiếu rate limiting specification chi tiết cho student save endpoint

- **Mức độ**: MEDIUM — Rủi ro vận hành
- **Nguồn gốc**: [API_CONTRACTS.md](../architecture/API_CONTRACTS.md) L7 mention "Rate limits must survive multiple replicas" và error 429 `RATE_LIMITED`, nhưng không chỉ định giới hạn cụ thể cho `PUT /attempts/{id}/answers/{slotId}`.
- **Bằng chứng**: [EXAM_ENGINE_SPEC.md](../specifications/EXAM_ENGINE_SPEC.md) gợi ý "debounce around 500ms" nhưng đây là client-side. Không có server-side rate limit cho answer saves.
- **Tác động**: Malicious client có thể flood save requests, tạo tải lớn trên database (mỗi save lock attempt row). Client debounce không phải security control.
- **Đề xuất sửa**: Chỉ định rate limit: ví dụ 10 saves/second/attempt. Document trong API spec. Cân nhắc per-slot rate limit nếu cần.
- **Test hồi quy cần thiết**: Exceed rate limit → 429 với Retry-After; normal save rate → accept.

---

## 5. Các phát hiện LOW

### LO-01: Section navigation "free within active section" chưa rõ UX implications

- **Mức độ**: LOW — Cải thiện tùy chọn
- **Nguồn gốc**: [EXAM_ENGINE_SPEC.md](../specifications/EXAM_ENGINE_SPEC.md) L23: "Navigation is free within the active section; previous sections are locked, future sections are not delivered."
- **Bằng chứng**: Spec rõ ràng về back-end behavior. Tuy nhiên, không có specification nào cho UX khi section transition xảy ra — student có nhận warning trước khi section lock không? Có countdown visual cho section time không?
- **Đề xuất sửa**: WEB-001 deliverables nên bao gồm: section countdown display, warning trước khi section hết giờ (ví dụ 60s), và clear indicator khi previous section locked. Đây là UX spec, không cần thay đổi architecture.

### LO-02: Audit event không log answer content — recovery limitation

- **Mức độ**: LOW — Thiết kế hợp lý nhưng cần awareness
- **Nguồn gốc**: [EXAM_ENGINE_SPEC.md](../specifications/EXAM_ENGINE_SPEC.md) L51: "Audit start, closure, invalidation and release decisions without logging answer contents." [DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) bảng `audit_events`: "restrict content/PII".
- **Bằng chứng**: Đây là quyết định đúng về privacy. Nhưng nó có nghĩa là nếu cần forensic analysis (ví dụ nghi ngờ cheating), audit log chỉ show state transitions, không phải actual answer changes over time.
- **Đề xuất sửa**: Document rõ rằng answer forensics dựa vào `answers.revision` history (mỗi revision là một row), không phải audit log. Verify rằng answer table giữ full revision history, không chỉ latest.

### LO-03: Thiếu explicit specification cho timezone display trong Vietnamese locale

- **Mức độ**: LOW — Cải thiện tùy chọn
- **Nguồn gốc**: [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) L51: "UTC database time authoritative". [EXAM_ENGINE_SPEC.md](../specifications/EXAM_ENGINE_SPEC.md) L25: "UTC timestamps and serverNow permit display countdown estimation only."
- **Đề xuất sửa**: WEB-001 spec nên chỉ rõ: hiển thị thời gian theo ICT (UTC+7) hoặc browser locale, với label rõ ràng. Countdown timer hiện remaining time (không phụ thuộc timezone). Đây là frontend concern, không ảnh hưởng architecture.

---

## 6. Phân tích kịch bản đối kháng (Adversarial Scenarios)

### AS-01: Câu hỏi bị chỉnh sửa sau khi đã sử dụng trong bài thi

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: Immutable question versions ([QUESTION_SCHEMA.md](../specifications/QUESTION_SCHEMA.md) L7), frozen form snapshots ([DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) bảng `form_slots` — immutable), edit tạo version mới không ảnh hưởng version cũ. Approval không kế thừa giữa versions.
- **Đánh giá**: Thiết kế đúng. Chỉ cần implementation đảm bảo `form_slot_secrets` cũng immutable (spec ghi rõ).

### AS-02: Hai request submit cùng một bài thi đồng thời

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: Attempt row lock ([EXAM_ENGINE_SPEC.md](../specifications/EXAM_ENGINE_SPEC.md) L35), idempotency key ([API_CONTRACTS.md](../architecture/API_CONTRACTS.md) L115), state machine prevents double transition.
- **Đánh giá**: Same key → replay original result. Different key trên attempt đã terminal → return existing closure. Thiết kế đúng.

### AS-03: Bài thi chứa câu hỏi trùng lặp

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: `UNIQUE(form_id, question_id)` trong `form_slots` ([DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) L55), duplicate/enemy pair check trong assembly ([EXAM_ASSEMBLY_SPEC.md](../specifications/EXAM_ASSEMBLY_SPEC.md) L17), same identity never selected twice across versions.
- **Đánh giá**: Thiết kế đúng. Cả identity-level và version-level uniqueness được bảo vệ.

### AS-04: AI sinh câu hỏi có hai đáp án đúng

- **Kết quả**: ĐÃ GIẢI QUYẾT ĐỦ CHO MVP
- **Cơ chế bảo vệ**: Independent verification ([AI_QUESTION_PIPELINE.md](../specifications/AI_QUESTION_PIPELINE.md) L15-17), human review mandatory ([QUESTION_SCHEMA.md](../specifications/QUESTION_SCHEMA.md) L62), AI không có publish permission.
- **Rủi ro còn lại**: Human reviewer cũng có thể miss ambiguity, đặc biệt với nội dung chuyên môn. Đây là inherent risk của content authoring, không phải architecture defect.

### AS-05: LLM provider không khả dụng

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: AI không trên critical path ([AI_QUESTION_PIPELINE.md](../specifications/AI_QUESTION_PIPELINE.md) L3: "AI is never required for an attempt to start or be graded"), job states include FAILED_RETRYABLE, provider-neutral contract.
- **Đánh giá**: Thiết kế đúng. Core exam flow hoàn toàn độc lập với AI.

### AS-06: Agent thay đổi API mà không cập nhật component phụ thuộc

- **Kết quả**: GIẢI QUYẾT MỘT PHẦN — xem HI-04
- **Cơ chế bảo vệ**: ADR process, contract tests requirement, handoff protocol.
- **Rủi ro còn lại**: Thiếu automated enforcement. CI contract drift detection cần được implement trong FOUND-002.

### AS-07: Agent tiếp tục dự án với documentation cũ

- **Kết quả**: GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: Deterministic onboarding sequence ([AGENT_ONBOARDING.md](../agents/AGENT_ONBOARDING.md)), git status inspection requirement, LAST_HANDOFF as entry point, repository as source of truth.
- **Rủi ro nhỏ**: Nếu LAST_HANDOFF không được cập nhật (violation of protocol), agent mới có thể miss context. Nhưng protocol coverage cho scenario này tốt.

### AS-08: Developer chuyển từ Codex sang môi trường coding khác

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: [HANDOFF_PROTOCOL.md](../agents/HANDOFF_PROTOCOL.md) L3: "No role is permanently tied to a provider." Repository-based state, no provider-specific dependencies. Onboarding không yêu cầu previous conversation.
- **Đánh giá**: Đây là điểm mạnh nổi bật của kiến trúc. Documentation self-contained và agent-agnostic.

### AS-09: Database migration phá vỡ historical results

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: Immutable records, ON DELETE RESTRICT, expand→backfill→switch→contract strategy ([DATABASE_DESIGN.md](../architecture/DATABASE_DESIGN.md) L88), "never rewrite historical forms during migration".
- **Đánh giá**: Thiết kế đúng. Migration tests on populated DB được yêu cầu rõ.

### AS-10: Không đủ câu hỏi approved cho blueprint

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT
- **Cơ chế bảo vệ**: Assembly trả INVENTORY_SHORTAGE với per-section counts ([EXAM_ASSEMBLY_SPEC.md](../specifications/EXAM_ASSEMBLY_SPEC.md) L37), không tạo partial form, diagnostic record cho staff.

### AS-11: Student truy cập đáp án trước khi được phép

- **Kết quả**: ĐÃ GIẢI QUYẾT TỐT VỀ THIẾT KẾ — rủi ro implementation cao
- **Cơ chế bảo vệ**: Separate `question_secrets`/`form_slot_secrets` tables, student DTO allowlist, `no-store` cache, asset access checks, invariant Q-08 trong test strategy.
- **Rủi ro implementation**: Đây là nơi bug dễ xảy ra nhất — một serialization oversight, một missing access check, hay một SSR hydration leak. Test Q-08 yêu cầu scan tất cả HTTP responses, là critical test.

### AS-12: Bài thi có thời gian mất kết nối

- **Kết quả**: ĐÃ GIẢI QUYẾT RÕ RÀNG
- **Cơ chế bảo vệ**: Server time authoritative, acknowledged answers preserved, resume returns server state, no grace period. "If the service is unavailable near deadline, already acknowledged answers remain authoritative."
- **Đánh giá**: Harsh nhưng consistent và fair. Document rõ cho student trước khi bắt đầu.

### AS-13: Hai coding agent sửa cùng module

- **Kết quả**: GIẢI QUYẾT QUA QUY TRÌNH — không có tooling enforcement
- **Cơ chế bảo vệ**: File ownership, disjoint worktrees/branches, one implementer per task.
- **Rủi ro**: Quy trình phụ thuộc vào discipline. Không có CODEOWNERS file hay automated check. Acceptable cho small team nhưng cần monitoring.

---

## 7. Phân tích theo tiêu chí đánh giá

### 7.1 Tính nhất quán kiến trúc tổng thể

**Đánh giá: TỐT**. Modular monolith với boundaries rõ ràng. Module dependencies có directed acyclic graph hợp lệ. Cross-module transaction policy explicit. Không có circular dependency nào được phát hiện.

**Điểm mạnh đáng chú ý**: Phân tách `src/modules/scoring` không phụ thuộc UI, scoring dùng frozen data — đây là quyết định thiết kế xuất sắc cho reproducibility.

### 7.2 Database design và referential integrity

**Đánh giá: TỐT VỚI RESERVATION**. Composite FK design chặt chẽ — đặc biệt `(attempt_id,form_id) → attempts` và `(form_id,slot_id) → form_slots` cho answers table ngăn chặn cross-form answer injection. Immutability enforced qua triggers và role restrictions.

**Reservation**: CR-01 (thiếu concurrent attempt constraint) là lỗ hổng cần fix.

### 7.3 Khả năng mở rộng question schema

**Đánh giá: TỐT**. Discriminated union cho Interaction/AnswerKey/ResponseValue cho phép thêm type mới mà không thay đổi existing types. `schemaVersion:"question/1"` cho phép migration. Future types (NUMERIC_ENTRY, MATCHING) được plan nhưng không over-engineer.

### 7.4 Độ tin cậy AI question generation

**Đánh giá: TỐT**. Provider-neutral contract, no publication permission cho AI, mandatory human review, bounded cost. Pipeline hoàn toàn tách rời khỏi core exam path. Evaluation methodology (held-out set, regression gates) là sound.

### 7.5 AI validation và human review workflow

**Đánh giá: TỐT**. Author ≠ reviewer enforced. Immutable review records. Validation runs append-only. Content hash matching trước approval. Quarantine pathway rõ ràng.

### 7.6 Question provenance và copyright risks

**Đánh giá: TỐT**. Rights decision model (OWNED/LICENSED/OPEN_LICENSE/...) chi tiết. Provenance required per version. No content reuse assumption. REFERENCE_ONLY và UNKNOWN blocked from publication. Territory và validity dates tracked.

**Điểm cần lưu ý**: Vietnamese IP law (Law 91/2025/QH15, Decree 356/2025/NĐ-CP, Law 131/2025/QH15) verified metadata only — cần legal review trước public launch ([RESEARCH_ASSESSMENT.md](../research/RESEARCH_ASSESSMENT.md) L46).

### 7.7 Exam assembly correctness

**Đánh giá: TỐT VỚI RESERVATION**. Frozen manifest, seeded PRNG, revalidation under lock, atomic sealing. Bounded backtracking with explicit search limits.

**Reservations**: CR-02 (xorshift32 constant), MD-01 (exposure inflation). Algorithm correctness phụ thuộc vào golden fixture tests (chưa tồn tại — đúng cho Phase 01).

### 7.8 Examination state transitions

**Đánh giá: TỐT VỚI RESERVATION**. State machine rõ ràng, transitions explicit, terminal states defined. GradingStatus tách biệt từ AttemptState — tốt.

**Reservation**: HI-01 (CANCELLED trigger mechanism). Ngoài ra state machine thiết kế sound.

### 7.9 Autosave, timing, concurrency và submission

**Đánh giá: XUẤT SẮC**. Đây là phần mạnh nhất của kiến trúc:
- `expectedRevision` prevents silent overwrites
- Attempt row lock serializes save/submit/expire
- Idempotency key per operation
- Server clock authoritative (`clock_timestamp()` after lock, not transaction start)
- No hidden grace period
- Submit carries no answer payload — avoids second write path
- Lost ack recovery via idempotent retry

Thiết kế này address hầu hết các race condition cổ điển trong exam systems.

### 7.10 Scoring correctness và reproducibility

**Đánh giá: TỐT**. Binary scoring simple và verifiable. Input hash ensures deterministic replay. Score runs immutable với supersedes pointer. Percentage rounding half-up to 2 decimal places specified. Section totals included.

**Lưu ý**: Spec ghi "100 × correctCount / totalCount" — cần verify implementation dùng integer arithmetic trước khi rounding, không phải floating point division. Document nên mention explicit: "use integer multiplication then integer division with remainder for rounding" hoặc tương đương.

### 7.11 API contract consistency

**Đánh giá: TỐT VỚI RESERVATION**. Types consistent giữa API và domain schema. Error codes comprehensive. Idempotency well-specified.

**Reservations**: HI-02 (quota value typing), HI-03 (availability check precision), MD-05 (rate limiting detail).

### 7.12 Frontend/backend integration boundaries

**Đánh giá: TỐT**. Clear separation: "UI imports only student-safe contracts." "HTTP contracts are authoritative even if a server-rendered page invokes the same service internally. Do not create a second server-action behavior." `no-store` cache policy. Safe DTO allowlist approach.

### 7.13 Security và authorization

**Đánh giá: TỐT**. OIDC + PKCE, server-side sessions, CSRF + Origin checks, deny-by-default roles, MFA for staff, no custom password store. OWASP API Security 2023 mapping. Content sanitization (reject executable HTML/JS/SVG).

**Điểm mạnh**: "an author cannot be sole approver of their version" — business rule embedded in architecture.

### 7.14 Testing completeness

**Đánh giá: TỐT**. 16 critical invariants defined (Q-01 through Q-16). State-machine scenarios specified. Concurrency testing with real DB connections and barriers (not probabilistic sleeps). Bank/assembly fixtures outlined.

**Lưu ý**: Phase 01 documentation-only — no tests exist or have passed. Appropriate for current phase.

### 7.15 Độ phức tạp phát triển cho team nhỏ

**Đánh giá: TỐT**. Modular monolith thay vì microservices. PostgreSQL-only (no Redis requirement). Same codebase worker. Single deployment family. TypeScript-only cho MVP.

**Concern nhỏ**: Database schema phức tạp (42+ tables described) cho MVP. Tuy nhiên, tables phân chia logic rõ, nhiều tables là join/audit tables đơn giản, và phần lớn complexity đến từ immutability requirements — justified.

### 7.16 Khả năng chuyển giao giữa AI agents

**Đánh giá: XUẤT SẮC**. Đây là điểm mạnh lớn nhất:
- Deterministic onboarding sequence
- Repository as sole source of truth
- No provider-specific dependencies
- Explicit task ownership and file scope
- Handoff template with verification evidence
- "No role is permanently tied to a provider"

### 7.17 Documentation và handoff reliability

**Đánh giá: TỐT**. 19 substantive documents, cross-referenced. Evidence vocabulary (VERIFIED/SUPPORTED_BY_RESEARCH/ASSUMPTION/REQUIRES_VERIFICATION). Embedded documentation checker reproducible. Research hash preserved.

**Concern nhỏ**: Single LAST_HANDOFF file — nếu nhiều task chạy parallel, chỉ có handoff gần nhất. Tuy nhiên, spec yêu cầu "preserve required task-specific evidence in the backlog" trước khi replace — acceptable.

### 7.18 Tương thích với future model providers

**Đánh giá: TỐT**. Provider-neutral generation contract. "Provider identifiers are opaque metadata, not domain enums." Adapter pattern. Model credentials in secret storage. No vendor SDK types in canonical data.

---

## 8. Đề xuất tổng thể

### Khuyến nghị: **APPROVE_WITH_CHANGES**

### Lý do

Kiến trúc đề xuất là **sound, defensive và well-reasoned** cho một educational practice platform. Các quyết định cốt lõi (immutable versioning, frozen snapshots, transactional locking, separated secrets, provider-neutral AI) đều đúng đắn và address đa số failure scenarios trong exam systems.

Tuy nhiên, cần giải quyết các vấn đề sau **TRƯỚC KHI bắt đầu implementation** (FOUND-002):

#### Phải sửa (MUST FIX)

| ID | Finding | Action cần thiết |
|---|---|---|
| CR-01 | Thiếu concurrent attempt constraint | Thêm partial unique index vào DB design spec |
| CR-02 | xorshift32 constant chưa pin | Pin giá trị cụ thể + golden test vectors vào assembly spec |
| HI-01 | CANCELLED trigger unspecified | Bổ sung lazy check + sweep mechanism vào engine spec |

#### Nên sửa trước khi bắt đầu task liên quan (SHOULD FIX)

| ID | Finding | Action cần thiết |
|---|---|---|
| HI-02 | Quota value typing | Thêm per-dimension validation vào blueprint spec |
| HI-03 | Availability check precision | Chỉ định rõ creation-time availability rule |
| HI-04 | Contract drift detection | Thêm CI drift check vào FOUND-002 deliverables |
| HI-05 | Assembly diagnostic detail per role | Document disclosure level per role |

#### Nên theo dõi (SHOULD TRACK)

| ID | Finding | Khi nào giải quyết |
|---|---|---|
| MD-01 | Exposure count inflation | Khi exposure caps được sử dụng thực tế |
| MD-02 | Form duration aggregate check | DATA-001/ASSEMBLY-001 |
| MD-03 | Multiple sections same enum | Blueprint validation — ASSEMBLY-001 |
| MD-04 | Idempotency expiry vs attempt lifecycle | EXAM-001 |
| MD-05 | Rate limiting detail | EXAM-001/AUTH-001 |

### Các quyết định cần human owner

1. **ADR-001–004 bundle**: Kiến trúc đề xuất coherent và review này không tìm thấy fundamental flaw. Recommend approval với CR-01, CR-02, HI-01 fixes integrated.
2. **Concurrent attempt policy**: Cho phép bao nhiêu attempt trên cùng form? (Đề xuất: một active attempt per form per student, unlimited retakes sau terminal state)
3. **Availability window check**: Strict (creation requires full duration available) hay lenient (creation requires form currently available)?
4. **Section uniqueness**: Cho phép multiple section entries với cùng Section enum trong blueprint?

---

## 9. Tổng kết phân loại findings

| Severity | Confirmed defects | Probable risks | Unverified assumptions | Optional improvements |
|---|---|---|---|---|
| CRITICAL | CR-01, CR-02 | — | — | — |
| HIGH | HI-01 | HI-02, HI-03, HI-04, HI-05 | — | — |
| MEDIUM | — | MD-01, MD-04, MD-05 | — | MD-02, MD-03 |
| LOW | — | — | — | LO-01, LO-02, LO-03 |

**Tổng: 2 CRITICAL, 5 HIGH, 5 MEDIUM, 3 LOW**

Không có finding nào đòi hỏi thiết kế lại kiến trúc. Tất cả corrections đều là bổ sung constraints, specification details hoặc validation rules vào documents hiện có.

---

*Review này là đánh giá độc lập của Antigravity agent, không phải phê duyệt kiến trúc. Human owner quyết định chấp nhận, yêu cầu sửa đổi hoặc từ chối các đề xuất trên. Không có approval nào được ghi nhận từ review này.*
