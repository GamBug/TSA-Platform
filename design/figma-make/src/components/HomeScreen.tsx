import React from 'react'
import type { SectionId } from '../types/tsa'
import { IconArrowRight, IconLayers } from './Icons'

interface HomeScreenProps {
  onOpenCatalog: (initialFilter?: SectionId | 'all') => void
  onStartFullSimulation: () => void
  onOpenSectionSwitcher: () => void
}

export function HomeScreen({
  onOpenCatalog,
  onStartFullSimulation,
  onOpenSectionSwitcher,
}: HomeScreenProps) {
  return (
    <div className="bg-paper">
      {/* Tiêu đề trang chủ căn trái kiểu trang bìa vở tập & đề luyện */}
      <div className="grid grid-cols-1 lg:grid-cols-[176px_1fr]">
        <div className="px-5 py-5 lg:py-10 border-b lg:border-b-0 border-rule notebook-margin-lg flex lg:flex-col justify-between lg:justify-start gap-2">
          <span className="text-xs font-semibold text-ink-secondary">Trang 01 · Chọn chế độ</span>
        </div>

        <div className="px-5 py-8 sm:px-10 sm:py-12">
          <div className="max-w-[760px]">
            <p className="text-xs font-semibold text-ink-secondary mb-3">
              Vở luyện tập đánh giá tư duy bậc THPT
            </p>
            <h1 className="font-display text-[28px] sm:text-[48px] leading-[1.1] font-semibold text-ink tracking-[-0.02em]">
              TSA Practice — Rèn tư duy Toán, Đọc hiểu &amp; Khoa học
            </h1>
            <p className="mt-4 text-[16px] leading-[1.68] text-ink-secondary max-w-[60ch]">
              Chọn luyện tập chuyên sâu theo từng chủ đề trên giấy ô ly hoặc bước vào phòng thi
              giả lập đủ 3 phần với đồng hồ độc lập cho từng phần.
            </p>
            <p className="mt-3 text-xs text-ink-muted border-l-2 border-rule-strong pl-3">
              Bản luyện tập không chính thức — không trực thuộc cơ sở giáo dục đại học và không
              hiển thị điểm quy đổi chính thức.
            </p>
          </div>

          {/* HAI KHỐI CHẾ ĐỘ KHÔNG ĐỀU NHAU (Unequal blocks, not symmetric icon cards) */}
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6 items-start">
            {/* KHỐI 1 (LỚN, CHÍNH): LUYỆN THEO CHỦ ĐỀ */}
            <section
              aria-labelledby="mode-topic-title"
              className="bg-paper-sheet border border-ink rounded-[4px] overflow-hidden"
            >
              <div className="flex">
                <div className="w-10 sm:w-12 shrink-0 notebook-margin-double bg-paper-sheet flex flex-col items-center pt-6 select-none">
                  <span className="tabular-figures text-[11px] font-bold text-ink-muted">
                    01
                  </span>
                </div>

                <div className="flex-1 p-5 sm:p-8">
                  <p className="text-xs text-ink-secondary mb-3">
                    Không giới hạn giờ · Xem lời giải ngay sau khi nộp
                  </p>

                  <h2
                    id="mode-topic-title"
                    className="font-display text-[28px] leading-[1.2] font-semibold text-ink tracking-[-0.01em]"
                  >
                    Luyện theo chủ đề
                  </h2>

                  <p className="mt-3 text-[15px] leading-[1.68] text-ink-secondary max-w-[54ch]">
                    Làm từng nhóm câu hỏi phân loại theo chuyên đề: trắc nghiệm bốn lựa chọn, điền
                    đáp án số, điền khuyết đoạn văn, nối hai cột và đọc đồ thị thực nghiệm. Thích
                    hợp để vá lỗ hổng kiến thức trước khi bấm giờ tổng hợp.
                  </p>

                  {/* Lối tắt nhanh theo 3 phân môn */}
                  <div className="mt-5 pt-4 border-t border-rule flex flex-wrap items-center gap-2">
                    <span className="text-xs text-ink-muted mr-1">Vào nhanh mục lục:</span>
                    {(
                      [
                        { id: 'math', label: 'Toán học (3 chủ đề)' },
                        { id: 'reading', label: 'Đọc hiểu (2 chủ đề)' },
                        { id: 'science', label: 'Khoa học (3 chủ đề)' },
                      ] as const
                    ).map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => onOpenCatalog(sec.id)}
                        className="px-3 min-h-[44px] text-xs font-medium text-ink bg-paper-sheet border border-rule-strong hover:border-pen-red hover:text-pen-red rounded-[3px] cursor-pointer transition-colors"
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenCatalog('all')}
                      className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] text-sm font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer transition-colors"
                    >
                      <span>Mở mục lục chủ đề</span>
                      <IconArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* KHỐI 2 (NHỎ HƠN, GỌN, PHỤ TRỢ): THI THỬ ĐẦY ĐỦ */}
            <section
              aria-labelledby="mode-sim-title"
              className="bg-paper-sheet border border-rule-strong rounded-[4px] p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-rule">
                <span className="text-xs font-semibold text-ink-secondary">Giả lập đủ thời lượng</span>
                <span className="tabular-figures text-xs font-semibold text-ink">
                  100 câu · 150 phút
                </span>
              </div>

              <h2
                id="mode-sim-title"
                className="mt-4 font-display text-[20px] leading-[1.35] font-semibold text-ink"
              >
                Thi thử đầy đủ
              </h2>

              <p className="mt-2 text-xs leading-[1.6] text-ink-secondary">
                Cấu trúc mô phỏng trọn vẹn 3 phần thi độc lập. Thí sinh được quay lại phần thi bất
                kỳ khi đồng hồ phần đó vẫn còn thời gian; hết giờ sẽ tự động khoá chỉ đọc.
              </p>

              {/* Bảng phân bổ 100 câu: Toán 40 / Đọc hiểu 20 / Khoa học 40; 60/30/60 phút */}
              <dl className="mt-4 border-t border-b border-rule divide-y divide-rule text-xs">
                <div className="py-2 flex items-center justify-between gap-2">
                  <dt className="font-medium text-ink">1. Tư duy Toán học</dt>
                  <dd className="tabular-figures text-ink-secondary">40 câu · 60 phút</dd>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <dt className="font-medium text-ink">2. Tư duy Đọc hiểu</dt>
                  <dd className="tabular-figures text-ink-secondary">20 câu · 30 phút</dd>
                </div>
                <div className="py-2 flex items-center justify-between gap-2">
                  <dt className="font-medium text-ink">3. Tư duy Khoa học</dt>
                  <dd className="tabular-figures text-ink-secondary">40 câu · 60 phút</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-col sm:flex-row lg:flex-col gap-2.5">
                <button
                  type="button"
                  onClick={onStartFullSimulation}
                  className="inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-xs font-semibold bg-ink text-paper-sheet border border-ink hover:bg-ink-secondary rounded-[3px] cursor-pointer transition-colors"
                >
                  <span>Bắt đầu bài thi thử (100 câu)</span>
                  <IconArrowRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={onOpenSectionSwitcher}
                  className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] text-xs font-semibold text-ink bg-paper border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer transition-colors"
                >
                  <IconLayers size={14} />
                  <span>Xem bảng chuyển 3 phần thi</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
