import React from 'react'
import { getQuestionsForSection, isQuestionAnswered } from '../data/tsaContent'
import type {
  SectionClockState,
  SectionConfig,
  SectionId,
  UserAnswer,
} from '../types/tsa'
import { IconArrowLeft, IconArrowRight, IconLock } from './Icons'
import { TimerChip } from './TimerChip'

interface SectionSwitcherScreenProps {
  sections: SectionConfig[]
  sectionClocks: Record<SectionId, SectionClockState>
  activeSection: SectionId
  answers: Record<string, UserAnswer>
  flagged: Record<string, boolean>
  onEnterSection: (sectionId: SectionId) => void
  onLockSection: (sectionId: SectionId) => void
  onReopenDemoSection: (sectionId: SectionId) => void
  onSubmitFullSimulation: () => void
  onBackHome: () => void
}

export function SectionSwitcherScreen({
  sections,
  sectionClocks,
  activeSection,
  answers,
  flagged,
  onEnterSection,
  onLockSection,
  onReopenDemoSection,
  onSubmitFullSimulation,
  onBackHome,
}: SectionSwitcherScreenProps) {
  return (
    <div className="bg-paper">
      <div className="grid grid-cols-1 lg:grid-cols-[176px_1fr]">
        {/* Cột lề trái kiểu phiếu điều phối phòng thi */}
        <div className="px-5 py-5 lg:py-8 border-b lg:border-b-0 border-rule notebook-margin-lg flex lg:flex-col justify-between lg:justify-start gap-3">
          <div>
            <span className="text-xs font-semibold text-ink-secondary block">Trang 04 · Chuyển phần</span>
            <span className="text-xs text-ink-secondary mt-1 block">
              Thi thử đầy đủ · 100 câu
            </span>
          </div>

          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer self-start lg:mt-4"
          >
            <IconArrowLeft size={13} />
            <span>Về trang chủ</span>
          </button>
        </div>

        <div className="p-5 sm:p-8 lg:p-10">
          <div className="pb-5 border-b border-rule flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-ink-secondary mb-1.5">
                Quản lý 3 phần thi độc lập
              </p>
              <h1 className="font-display text-[28px] leading-[1.2] font-semibold text-ink">
                Bảng chuyển phần thi giả lập
              </h1>
            </div>
            <p className="text-xs leading-[1.55] text-ink-secondary max-w-[46ch]">
              Bạn có thể quay lại bất kỳ phần thi nào miễn đồng hồ phần đó vẫn còn thời gian. Phần
              đã nộp hoặc hết giờ sẽ bị gạch ngang và khoá chỉ đọc.
            </p>
          </div>

          {/* Danh sách 3 phần thi */}
          <div className="mt-6 space-y-4">
            {sections.map((sec, idx) => {
              const clock = sectionClocks[sec.id]
              const secQuestions = getQuestionsForSection(sec.id)
              const answeredCount = secQuestions.filter((q) =>
                isQuestionAnswered(q, answers[q.id]),
              ).length
              const flaggedCount = secQuestions.filter((q) => Boolean(flagged[q.id])).length
              const isClosed =
                clock.status === 'finished' ||
                clock.status === 'expired' ||
                clock.remainingSeconds <= 0
              const isCurrent = sec.id === activeSection

              return (
                <article
                  key={sec.id}
                  className={`border rounded-[4px] transition-colors ${
                    isClosed
                      ? 'bg-paper-recessed border-rule'
                      : isCurrent
                        ? 'bg-paper-sheet border-pen-red border-l-4'
                        : 'bg-paper-sheet border-rule-strong'
                  }`}
                >
                  <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Thông tin phần thi */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="tabular-figures text-xs font-bold px-2 py-0.5 border border-rule bg-paper rounded-[2px] text-ink">
                          PHẦN 0{idx + 1}
                        </span>

                        {isClosed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted bg-paper border border-rule px-2 py-0.5 rounded-[2px]">
                            <IconLock size={12} />
                            <span>
                              {clock.status === 'expired'
                                ? 'Đã hết giờ · Chỉ đọc'
                                : 'Đã kết thúc · Chỉ đọc'}
                            </span>
                          </span>
                        ) : isCurrent ? (
                          <span className="text-xs font-semibold text-pen-red bg-pen-red-wash border border-pen-red px-2 py-0.5 rounded-[2px]">
                            Đang mở làm bài
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-ink bg-paper border border-rule-strong px-2 py-0.5 rounded-[2px]">
                            Còn thời gian · Có thể quay lại
                          </span>
                        )}
                      </div>

                      {/* Khi đã kết thúc/hết giờ: hiệu ứng gạch ngang (ruled-through look) */}
                      <h2
                        className={`font-display text-[20px] leading-[1.35] font-semibold ${
                          isClosed
                            ? 'text-ink-muted line-through decoration-ink-secondary decoration-[1.5px]'
                            : 'text-ink'
                        }`}
                      >
                        {sec.title}
                      </h2>

                      <p
                        className={`mt-1.5 text-xs sm:text-[13px] leading-[1.55] ${
                          isClosed ? 'text-ink-muted line-through' : 'text-ink-secondary'
                        }`}
                      >
                        {sec.description}
                      </p>

                      {/* Thống kê tiến độ từng phần */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 tabular-figures text-xs">
                        <span className={isClosed ? 'text-ink-muted' : 'text-ink font-medium'}>
                          Đã trả lời: {answeredCount}/{sec.totalQuestions} câu
                        </span>
                        <span className="text-ink-secondary">
                          Đánh dấu xem lại: {flaggedCount} câu
                        </span>
                      </div>
                    </div>

                    {/* Cột đồng hồ + Nút hành động */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-rule">
                      <TimerChip
                        remainingSeconds={clock.remainingSeconds}
                        expired={isClosed}
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEnterSection(sec.id)}
                          className={`inline-flex items-center gap-2 px-4 min-h-[44px] text-xs font-semibold border rounded-[3px] cursor-pointer transition-colors ${
                            isClosed
                              ? 'bg-paper text-ink border-rule-strong hover:border-ink'
                              : 'bg-pen-red text-paper-sheet border-pen-red hover:bg-pen-red-hover'
                          }`}
                        >
                          {isClosed ? (
                            <>
                              <IconLock size={13} />
                              <span>Xem lại bài đã khoá</span>
                            </>
                          ) : (
                            <>
                              <span>
                                {isCurrent ? 'Tiếp tục làm phần này' : 'Quay lại phần này'}
                              </span>
                              <IconArrowRight size={13} />
                            </>
                          )}
                        </button>

                        {!isClosed ? (
                          <button
                            type="button"
                            onClick={() => onLockSection(sec.id)}
                            className="px-3 min-h-[44px] text-xs font-medium text-ink-secondary bg-paper border border-rule-strong hover:border-pen-red hover:text-pen-red rounded-[3px] cursor-pointer"
                          >
                            Khoá phần này
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onReopenDemoSection(sec.id)}
                            className="px-2 min-h-[44px] text-xs text-ink-muted underline underline-offset-2 hover:text-ink cursor-pointer"
                          >
                            Mở lại (trạng thái mẫu)
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {/* Khối nộp toàn bài */}
          <div className="mt-8 p-5 bg-paper-sheet border border-ink rounded-[4px] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                Hoàn tất bài thi thử &amp; Chấm số câu đúng
              </h2>
              <p className="text-xs text-ink-secondary mt-1">
                Hệ thống sẽ chấm số câu đúng theo từng phần (Toán / Đọc hiểu / Khoa học) như sổ
                điểm bút đỏ, không tính điểm quy đổi chính thức.
              </p>
            </div>

            <button
              type="button"
              onClick={onSubmitFullSimulation}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] text-xs font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer shrink-0"
            >
              <span>Nộp toàn bộ bài &amp; Xem kết quả</span>
              <IconArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
