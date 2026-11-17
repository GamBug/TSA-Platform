import React, { useState } from 'react'
import {
  formatCorrectAnswerSummary,
  formatUserAnswerSummary,
  isQuestionAnswered,
  isQuestionCorrect,
} from '../data/tsaContent'
import type { QuestionItem, SectionId, UserAnswer } from '../types/tsa'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCross,
  IconFlag,
} from './Icons'

interface ResultScreenProps {
  title: string
  subtitle: string
  questions: QuestionItem[]
  answers: Record<string, UserAnswer>
  flagged: Record<string, boolean>
  onReviewQuestion: (question: QuestionItem) => void
  onBackHome: () => void
}

type ReviewFilter = 'all' | 'incorrect' | 'unanswered' | 'flagged'

function sectionNameShort(section: SectionId): string {
  if (section === 'math') return 'Toán'
  if (section === 'reading') return 'Đọc hiểu'
  return 'Khoa học'
}

export function ResultScreen({
  title,
  subtitle,
  questions,
  answers,
  flagged,
  onReviewQuestion,
  onBackHome,
}: ResultScreenProps) {
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('incorrect')

  const sectionIds: SectionId[] = (['math', 'reading', 'science'] as const).filter((sid) =>
    questions.some((q) => q.section === sid),
  )

  const totalCorrect = questions.filter((q) => isQuestionCorrect(q, answers[q.id])).length
  const totalAnswered = questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length

  const incorrectList = questions.filter(
    (q) => isQuestionAnswered(q, answers[q.id]) && !isQuestionCorrect(q, answers[q.id]),
  )
  const unansweredList = questions.filter((q) => !isQuestionAnswered(q, answers[q.id]))
  const flaggedList = questions.filter((q) => Boolean(flagged[q.id]))

  const filteredReview = questions.filter((q) => {
    const answered = isQuestionAnswered(q, answers[q.id])
    const correct = isQuestionCorrect(q, answers[q.id])
    if (reviewFilter === 'incorrect') return answered && !correct
    if (reviewFilter === 'unanswered') return !answered
    if (reviewFilter === 'flagged') return Boolean(flagged[q.id])
    return true
  })

  return (
    <div className="bg-paper">
      <div className="grid grid-cols-1 lg:grid-cols-[248px_1fr]">
        {/* CỘT LỀ TRÁI: PHÊ BÚT ĐỎ GIÁO VIÊN TRONG LỀ VỞ (TEACHER'S RED-PEN TALLY IN THE MARGIN) */}
        <aside
          aria-label="Phiếu ghi nhận số câu đúng bằng bút đỏ"
          className="px-5 py-6 lg:py-10 border-b lg:border-b-0 border-rule notebook-margin-lg bg-paper-sheet"
        >
          <div className="flex items-center justify-between lg:block">
            <span className="text-xs font-semibold text-pen-red">Phần chấm của bút đỏ</span>
            <span className="text-[11px] text-ink-muted lg:block lg:mt-1">
              Bản luyện tập không chính thức
            </span>
          </div>

          {/* Tổng số câu đúng ghi bằng mực đỏ ngay trên lề giấy, không đóng khung */}
          <div className="mt-5 pt-3 border-t-2 border-pen-red">
            <div className="text-xs font-semibold text-pen-red">
              Tổng số câu đúng
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 border-b-2 border-pen-red pb-2">
              <span className="tabular-figures text-[48px] leading-none font-bold text-pen-red">
                {totalCorrect}
              </span>
              <span className="tabular-figures text-xl font-semibold text-pen-red">
                /{questions.length}
              </span>
            </div>

            {/* Ghi từng phần theo đúng mẫu "Toán 31/40" */}
            <dl className="mt-3 space-y-2 text-sm">
              {sectionIds.map((sid) => {
                const secQs = questions.filter((q) => q.section === sid)
                const secCorrect = secQs.filter((q) =>
                  isQuestionCorrect(q, answers[q.id]),
                ).length
                return (
                  <div
                    key={sid}
                    className="flex items-baseline justify-between gap-2 border-b border-dotted border-pen-red pb-1"
                  >
                    <dt className="font-medium text-ink">{sectionNameShort(sid)}</dt>
                    <dd className="tabular-figures font-bold text-pen-red">
                      {secCorrect}/{secQs.length}
                    </dd>
                  </div>
                )
              })}
            </dl>

            <div className="mt-3 pt-2 text-[11px] leading-[1.5] text-ink-secondary">
              Đã làm {totalAnswered}/{questions.length} câu · Chưa làm {unansweredList.length} câu.
            </div>
          </div>

          <button
            type="button"
            onClick={onBackHome}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer"
          >
            <IconArrowLeft size={14} />
            <span>Về trang chọn chế độ</span>
          </button>
        </aside>

        {/* CỘT PHẢI: TỜ TỔNG HỢP & DANH SÁCH CÂU CẦN XEM LẠI */}
        <div className="p-5 sm:p-8 lg:p-10">
          <div className="pb-5 border-b border-rule">
            <p className="text-xs font-semibold text-ink-secondary mb-1.5">
              Trang 05 · Kết quả tự luyện
            </p>
            <h1 className="font-display text-[28px] leading-[1.2] font-semibold text-ink">
              {title}
            </h1>
            <p className="mt-2 text-sm text-ink-secondary max-w-[62ch]">{subtitle}</p>
          </div>

          {/* Một dòng kẻ tóm tắt thay cho ba thẻ số liệu ngang hàng */}
          <dl className="mt-6 py-3 border-y border-rule flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-secondary">Đúng</dt>
              <dd className="tabular-figures font-bold text-ink-green">{totalCorrect}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-secondary">Chưa đúng</dt>
              <dd className="tabular-figures font-bold text-pen-red">{incorrectList.length}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-secondary">Bỏ trống</dt>
              <dd className="tabular-figures font-bold text-ink">{unansweredList.length}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-ink-secondary">Đánh dấu</dt>
              <dd className="tabular-figures font-bold text-ink">{flaggedList.length}</dd>
            </div>
          </dl>

          {/* Bộ lọc danh sách câu hỏi cần xem lại */}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rule">
            <h2 className="font-display text-[20px] leading-[1.35] font-semibold text-ink">
              Danh sách câu hỏi cần rà soát
            </h2>

            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lọc câu cần xem lại">
              {(
                [
                  { id: 'incorrect', label: `Làm sai (${incorrectList.length})` },
                  { id: 'unanswered', label: `Bỏ trống (${unansweredList.length})` },
                  { id: 'flagged', label: `Đánh dấu (${flaggedList.length})` },
                  { id: 'all', label: `Tất cả (${questions.length})` },
                ] as const
              ).map((tab) => {
                const active = reviewFilter === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setReviewFilter(tab.id)}
                    className={`px-3 min-h-[44px] text-xs font-semibold border rounded-[3px] cursor-pointer transition-colors ${
                      active
                        ? 'bg-ink text-paper-sheet border-ink'
                        : 'bg-paper-sheet text-ink-secondary border-rule-strong hover:border-ink hover:text-ink'
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bảng danh sách câu hỏi */}
          {filteredReview.length === 0 ? (
            <div className="mt-5 p-6 border border-rule bg-paper-sheet rounded-[3px] text-sm text-ink-secondary">
              Không có câu hỏi nào thuộc nhóm lọc này. Hãy chuyển sang thẻ «Tất cả» để xem lại toàn
              bộ lời giải.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-rule border border-rule bg-paper-sheet rounded-[4px]">
              {filteredReview.map((q) => {
                const userAns = answers[q.id]
                const answered = isQuestionAnswered(q, userAns)
                const correct = isQuestionCorrect(q, userAns)
                const isFlagged = Boolean(flagged[q.id])

                return (
                  <li
                    key={q.id}
                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-paper transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="tabular-figures text-xs font-bold px-2 py-0.5 bg-paper border border-rule rounded-[2px] text-ink">
                          {sectionNameShort(q.section)} · Câu {String(q.numberInSection).padStart(2, '0')}
                        </span>

                        {!answered ? (
                          <span className="text-xs font-medium text-ink-muted bg-paper-recessed border border-rule px-2 py-0.5 rounded-[2px]">
                            Bỏ trống
                          </span>
                        ) : correct ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-green bg-ink-green-wash border border-ink-green px-2 py-0.5 rounded-[2px]">
                            <IconCheck size={12} />
                            <span>Đúng</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-pen-red bg-pen-red-wash border border-pen-red px-2 py-0.5 rounded-[2px]">
                            <IconCross size={12} />
                            <span>Chưa đúng</span>
                          </span>
                        )}

                        {isFlagged && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink bg-ochre-wash border border-ochre px-2 py-0.5 rounded-[2px]">
                            <IconFlag size={11} />
                            <span>Đã đánh dấu</span>
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-ink font-medium line-clamp-2 leading-[1.55]">
                        {q.prompt}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 tabular-figures text-xs">
                        <span className="text-ink-secondary">
                          Bài làm:{' '}
                          <strong className={correct ? 'text-ink-green' : 'text-pen-red'}>
                            {formatUserAnswerSummary(q, userAns)}
                          </strong>
                        </span>
                        <span className="text-ink-secondary">
                          Đáp án chuẩn:{' '}
                          <strong className="text-ink-green">
                            {formatCorrectAnswerSummary(q)}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onReviewQuestion(q)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] text-xs font-semibold text-ink bg-paper border border-rule-strong hover:border-pen-red hover:text-pen-red rounded-[3px] cursor-pointer shrink-0"
                    >
                      <span>Xem lời giải</span>
                      <IconArrowRight size={13} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
