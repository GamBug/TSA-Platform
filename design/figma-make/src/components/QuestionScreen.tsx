import React, { useEffect, useState } from 'react'
import {
  formatCorrectAnswerSummary,
  isQuestionAnswered,
  isQuestionCorrect,
} from '../data/tsaContent'
import type {
  QuestionItem,
  ReadingPassage,
  SectionId,
  UserAnswer,
} from '../types/tsa'
import {
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconCheck,
  IconCross,
  IconFlag,
  IconGrid,
  IconLayers,
  IconLock,
} from './Icons'
import { FigurePlate } from './ScientificFigure'
import { TimerChip } from './TimerChip'

interface QuestionScreenProps {
  mode: 'topic' | 'simulation'
  headerLabel: string
  sectionId: SectionId
  questions: QuestionItem[]
  currentIndex: number
  onSelectIndex: (index: number) => void
  passages: Record<string, ReadingPassage>
  answers: Record<string, UserAnswer>
  onChangeAnswer: (questionId: string, answer: UserAnswer) => void
  flagged: Record<string, boolean>
  onToggleFlag: (questionId: string) => void
  remainingSeconds: number
  isLocked: boolean
  isGradedReview: boolean
  savedTimestamp: string | null
  isSavingNow: boolean
  onBackToCatalogOrSections: () => void
  onFinishOrSubmit: () => void
  onSetDemoTimerState?: (state: 'normal' | 'under5' | 'expired') => void
}

function typeLabelVi(q: QuestionItem): string {
  if (q.type === 'mcq') return 'Trắc nghiệm 4 lựa chọn'
  if (q.type === 'numeric') return 'Điền đáp án số'
  if (q.type === 'cloze') return 'Điền khuyết đoạn văn'
  return 'Nối hai cột'
}

export function QuestionScreen({
  mode,
  headerLabel,
  questions,
  currentIndex,
  onSelectIndex,
  passages,
  answers,
  onChangeAnswer,
  flagged,
  onToggleFlag,
  remainingSeconds,
  isLocked,
  isGradedReview,
  savedTimestamp,
  isSavingNow,
  onBackToCatalogOrSections,
  onFinishOrSubmit,
  onSetDemoTimerState,
}: QuestionScreenProps) {
  const [mobilePassageOpen, setMobilePassageOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeMatchLeftId, setActiveMatchLeftId] = useState<string | null>(null)

  const question = questions[currentIndex] ?? questions[0]
  const passage = question?.passageId ? passages[question.passageId] : undefined
  const currentAnswer = question ? answers[question.id] : undefined
  const isFlagged = question ? Boolean(flagged[question.id]) : false

  // Reset trạng thái chọn cột nối khi đổi câu
  useEffect(() => {
    if (question?.type === 'matching' && question.matchingLeft?.[0]) {
      setActiveMatchLeftId(question.matchingLeft[0].id)
    } else {
      setActiveMatchLeftId(null)
    }
  }, [question?.id])

  // Phím tắt bàn phím: A–D chọn phương án, N chuyển câu kế tiếp, F đánh dấu xem lại
  useEffect(() => {
    if (!question) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const key = event.key.toLowerCase()
      if (key === 'n') {
        event.preventDefault()
        if (currentIndex < questions.length - 1) {
          onSelectIndex(currentIndex + 1)
        }
      } else if (key === 'f') {
        event.preventDefault()
        if (!isLocked) {
          onToggleFlag(question.id)
        }
      } else if (
        !isLocked &&
        !isGradedReview &&
        question.type === 'mcq' &&
        (key === 'a' || key === 'b' || key === 'c' || key === 'd')
      ) {
        event.preventDefault()
        onChangeAnswer(question.id, {
          type: 'mcq',
          value: key.toUpperCase() as 'A' | 'B' | 'C' | 'D',
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    question,
    currentIndex,
    questions.length,
    isLocked,
    isGradedReview,
    onSelectIndex,
    onToggleFlag,
    onChangeAnswer,
  ])

  if (!question) return null

  const answeredCount = questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length
  const flaggedCount = questions.filter((q) => Boolean(flagged[q.id])).length

  const numericValue =
    currentAnswer?.type === 'numeric' ? currentAnswer.value : ''
  const isNumericSyntaxValid = /^-?\d*(,\d*)?$/.test(numericValue.trim())

  const clozeValues =
    currentAnswer?.type === 'cloze' ? currentAnswer.values : {}

  const matchingPairs =
    currentAnswer?.type === 'matching' ? currentAnswer.pairs : {}

  const renderNavigatorGrid = (compactMobile = false) => (
    <div>
      <div className="flex items-center justify-between text-xs mb-2.5">
        <span className="font-semibold text-ink">Bảng câu hỏi</span>
        <span className="tabular-figures text-ink-secondary">
          Đã làm {answeredCount}/{questions.length}
        </span>
      </div>

      <div
        className={`grid ${compactMobile ? 'grid-cols-6' : 'grid-cols-5'} gap-1.5`}
        role="navigation"
        aria-label="Danh sách số thứ tự câu hỏi"
      >
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex
          const qAnswered = isQuestionAnswered(q, answers[q.id])
          const qFlagged = Boolean(flagged[q.id])
          const qCorrect = isGradedReview ? isQuestionCorrect(q, answers[q.id]) : false

          let squareClass =
            'bg-paper-sheet border border-rule text-ink hover:border-ink'

          if (isGradedReview) {
            if (!qAnswered) {
              squareClass = 'bg-paper-recessed border border-rule text-ink-muted'
            } else if (qCorrect) {
              squareClass = 'bg-ink-green-wash border border-ink-green text-ink-green font-bold'
            } else {
              squareClass = 'bg-pen-red-wash border border-pen-red text-pen-red font-bold'
            }
          } else if (isLocked) {
            squareClass = qAnswered
              ? 'bg-ink-secondary text-paper-sheet border border-ink-secondary'
              : 'bg-paper-recessed border border-rule text-ink-muted'
          } else if (qAnswered) {
            squareClass = 'bg-ink text-paper-sheet border border-ink font-semibold'
          } else if (qFlagged) {
            squareClass = 'bg-ochre-wash border border-ochre text-ink font-semibold'
          }

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                onSelectIndex(idx)
                if (compactMobile) setMobileNavOpen(false)
              }}
              aria-label={`Câu ${q.numberInSection}${qAnswered ? ', đã trả lời' : ', chưa trả lời'}${qFlagged ? ', đã đánh dấu' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={`relative min-h-[44px] min-w-[44px] w-full tabular-figures text-xs rounded-[3px] flex items-center justify-center cursor-pointer transition-colors ${squareClass} ${
                isCurrent ? 'ring-2 ring-pen-red ring-offset-1 ring-offset-paper' : ''
              }`}
            >
              <span>{String(q.numberInSection).padStart(2, '0')}</span>
              {qFlagged && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 w-2 h-2 bg-ochre rounded-[1px]"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Chú giải trạng thái ô câu hỏi */}
      <div className="mt-3 pt-3 border-t border-rule grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] text-ink-secondary">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border border-rule bg-paper-sheet rounded-[2px] inline-block" />
          <span>Chưa làm</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border border-ink bg-ink rounded-[2px] inline-block" />
          <span>Đã làm</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative w-3.5 h-3.5 border border-ochre bg-ochre-wash rounded-[2px] inline-block">
            <span className="absolute top-0.5 right-0.5 w-1 h-1 bg-ochre" />
          </span>
          <span>Đánh dấu ({flaggedCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 border border-pen-red ring-1 ring-pen-red bg-paper-sheet rounded-[2px] inline-block" />
          <span>Đang xem</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-paper">
      {/* THANH ĐIỀU HÀNH TRÊN CÙNG (Chế độ Thi thử / Chủ đề & Chỉ báo lưu đáp án) */}
      <div className="border-b border-rule bg-paper px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackToCatalogOrSections}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer shrink-0"
          >
            {mode === 'simulation' ? <IconLayers size={14} /> : <IconArrowLeft size={14} />}
            <span>{mode === 'simulation' ? 'Chuyển phần thi' : 'Mục lục chủ đề'}</span>
          </button>

          <div className="min-w-0 hidden sm:block">
            <p className="text-xs font-semibold text-ink truncate">{headerLabel}</p>
            <p className="text-[11px] text-ink-secondary truncate">{question.topicTitle}</p>
          </div>
        </div>

        {/* Chỉ báo lưu bài tự động + nút kiểm thử đồng hồ ở chế độ Thi thử */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-rule bg-paper-sheet rounded-[3px]"
          >
            {isSavingNow ? (
              <span className="text-ink font-medium">Đang lưu bài...</span>
            ) : savedTimestamp ? (
              <>
                <IconCheck size={12} className="text-ink-green" />
                <span className="tabular-figures text-ink-secondary">
                  Đã lưu lúc {savedTimestamp}
                </span>
              </>
            ) : (
              <span className="text-ink-muted">Tự động lưu khi chọn đáp án</span>
            )}
          </div>

          {mode === 'simulation' && onSetDemoTimerState && !isGradedReview && (
            <div className="hidden xl:flex items-center text-[11px] text-ink-muted">
              <span className="mr-1">Xem trạng thái đồng hồ:</span>
              <button
                type="button"
                onClick={() => onSetDemoTimerState('normal')}
                className="px-1.5 min-h-[44px] underline underline-offset-2 hover:text-ink cursor-pointer"
              >
                bình thường
              </button>
              <button
                type="button"
                onClick={() => onSetDemoTimerState('under5')}
                className="px-1.5 min-h-[44px] underline underline-offset-2 hover:text-ink cursor-pointer"
              >
                dưới 5 phút
              </button>
              <button
                type="button"
                onClick={() => onSetDemoTimerState('expired')}
                className="px-1.5 min-h-[44px] underline underline-offset-2 hover:text-ink cursor-pointer"
              >
                hết giờ
              </button>
            </div>
          )}
        </div>
      </div>

      {/* THANH DÍNH TRÊN DI ĐỘNG 390PX: ĐỒNG HỒ + MỞ BẢNG CÂU HỎI + «XEM ĐOẠN VĂN» */}
      <div className="lg:hidden sticky top-0 z-20 bg-paper border-b border-rule px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {mode === 'simulation' ? (
            <TimerChip remainingSeconds={remainingSeconds} expired={isLocked} compact />
          ) : (
            <span className="tabular-figures text-xs font-bold text-ink px-2.5 py-1.5 bg-paper-sheet border border-rule rounded-[3px]">
              Câu {String(question.numberInSection).padStart(2, '0')}/{questions.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {passage && (
            <button
              type="button"
              onClick={() => setMobilePassageOpen((prev) => !prev)}
              aria-expanded={mobilePassageOpen}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold border rounded-[3px] cursor-pointer transition-colors ${
                mobilePassageOpen
                  ? 'bg-ink text-paper-sheet border-ink'
                  : 'bg-paper-sheet text-ink border-rule-strong hover:border-ink'
              }`}
            >
              <IconBook size={14} />
              <span>{mobilePassageOpen ? 'Ẩn đoạn văn' : 'Xem đoạn văn'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-expanded={mobileNavOpen}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer"
          >
            <IconGrid size={14} />
            <span className="tabular-figures">
              Câu ({answeredCount}/{questions.length})
            </span>
          </button>
        </div>
      </div>

      {/* NGĂN BẢNG CÂU HỎI TRÊN DI ĐỘNG */}
      {mobileNavOpen && (
        <div className="lg:hidden border-b border-ink bg-paper p-4">
          {renderNavigatorGrid(true)}
          <div className="mt-4 pt-3 border-t border-rule flex justify-end">
            <button
              type="button"
              onClick={onFinishOrSubmit}
              className="px-4 min-h-[44px] text-xs font-semibold bg-pen-red text-paper-sheet border border-pen-red rounded-[3px] cursor-pointer"
            >
              {isGradedReview
                ? 'Xem bảng tổng kết'
                : mode === 'simulation'
                  ? 'Nộp phần thi / Xem kết quả'
                  : 'Chấm bài chủ đề'}
            </button>
          </div>
        </div>
      )}

      {/* ĐOẠN VĂN TRÊN DI ĐỘNG KHI BẬT «XEM ĐOẠN VĂN» */}
      {passage && mobilePassageOpen && (
        <div className="lg:hidden border-b border-ink bg-paper-sheet p-4">
          <div className="flex items-center justify-between gap-2 pb-2 mb-3 border-b border-rule">
            <span className="text-[11px] font-semibold text-ink-secondary">
              {passage.code}
            </span>
            <button
              type="button"
              onClick={() => setMobilePassageOpen(false)}
              className="px-3 min-h-[44px] text-xs font-semibold text-ink border border-rule-strong rounded-[3px] bg-paper cursor-pointer"
            >
              Thu gọn đoạn văn
            </button>
          </div>
          <h2 className="font-display text-[20px] leading-[1.3] font-semibold text-ink mb-3">
            {passage.title}
          </h2>
          <div className="space-y-3 text-[16px] leading-[1.75] text-ink">
            {passage.paragraphs.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">{passage.sourceNote}</p>
        </div>
      )}

      {/* BỐ CỤC CHÍNH DESKTOP 1440PX:
          - Đọc hiểu: Ngữ liệu trái + Giấy câu hỏi ô ly giữa + Cột lề phải (bảng câu hỏi & đồng hồ)
          - Toán / Khoa học: Giấy câu hỏi ô ly trái + Cột lề phải (bảng câu hỏi & đồng hồ) */}
      <div
        className={`grid grid-cols-1 ${
          passage
            ? 'lg:grid-cols-[minmax(360px,430px)_1fr_296px]'
            : 'lg:grid-cols-[1fr_312px]'
        }`}
      >
        {/* CỘT TRÁI (CHỈ HIỆN TRÊN DESKTOP KHI LÀ BÀI ĐỌC HIỂU) */}
        {passage && (
          <aside
            aria-label="Ngữ liệu đọc hiểu"
            className="hidden lg:block border-r border-rule bg-paper-sheet p-6 xl:p-7 lg:max-h-[calc(100vh-110px)] lg:overflow-y-auto"
          >
            <div className="pb-3 mb-4 border-b border-rule">
              <span className="text-[11px] font-semibold text-ink-secondary">
                {passage.code}
              </span>
              <h2 className="mt-1.5 font-display text-[20px] leading-[1.35] font-semibold text-ink">
                {passage.title}
              </h2>
              <p className="mt-1.5 text-xs text-ink-muted">{passage.sourceNote}</p>
            </div>

            <div className="space-y-4 text-[16.5px] leading-[1.78] text-ink">
              {passage.paragraphs.map((para, idx) => (
                <p key={idx}>{para}</p>
              ))}
            </div>
          </aside>
        )}

        {/* VÙNG GIẤY ĐỀ KẺ Ô LY 4MM (QUESTION CANVAS ON GRID PAPER) */}
        <div className="question-oly-surface border-b lg:border-b-0 lg:border-r border-rule min-w-0">
          {/* Cảnh báo khoá khi hết giờ hoặc ở chế độ xem lại */}
          {(isLocked || isGradedReview) && (
            <div
              className={`px-4 sm:px-6 py-2.5 border-b text-xs font-medium flex flex-wrap items-center justify-between gap-2 ${
                isGradedReview
                  ? 'bg-paper border-rule text-ink'
                  : 'bg-pen-red-wash border-pen-red text-pen-red'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <IconLock size={14} />
                <span>
                  {isGradedReview
                    ? 'Chế độ chấm & xem lại bài làm — Đáp án chuẩn đã được đánh dấu bên dưới.'
                    : 'Phần thi này đã hết giờ hoặc đã kết thúc — Toàn bộ đáp án đã khoá chỉ đọc.'}
                </span>
              </span>
            </div>
          )}

          <div className="flex">
            {/* Lề vở kẻ đôi bút đỏ bên trái */}
            <div className="w-11 sm:w-14 shrink-0 notebook-margin-double bg-paper-sheet flex flex-col items-center pt-6 pb-4 select-none">
              <span className="tabular-figures text-xs font-bold text-ink">
                C.{String(question.numberInSection).padStart(2, '0')}
              </span>
              {isFlagged && (
                <span className="mt-2.5 text-ink" title="Đã đánh dấu xem lại">
                  <IconFlag size={14} />
                </span>
              )}
            </div>

            {/* Nội dung câu hỏi chính */}
            <div className="flex-1 p-4 sm:p-7 min-w-0">
              {/* Đầu câu hỏi: dạng câu + nút đánh dấu */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-rule">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular-figures text-xs text-ink-secondary">
                    {question.numberInSection}/{questions.length}
                  </span>
                  <span className="text-xs font-medium text-ink">
                    {typeLabelVi(question)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onToggleFlag(question.id)}
                  aria-pressed={isFlagged}
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold border rounded-[3px] transition-colors ${
                    isLocked
                      ? 'bg-paper-recessed border-rule text-ink-muted cursor-not-allowed'
                      : isFlagged
                        ? 'bg-ochre-wash border-ochre text-ink cursor-pointer'
                        : 'bg-paper-sheet border-rule-strong text-ink hover:border-ink cursor-pointer'
                  }`}
                >
                  <IconFlag size={13} />
                  <span>{isFlagged ? 'Đã đánh dấu (F)' : 'Đánh dấu xem lại (F)'}</span>
                </button>
              </div>

              {/* Dẫn đề */}
              <div className="text-[16px] sm:text-[17px] leading-[1.68] font-medium text-ink max-w-[68ch]">
                {question.prompt}
              </div>

              {/* Hình vẽ / Đồ thị khoa học (nếu có) — Phóng to toàn màn hình trên di động */}
              {question.figure && <FigurePlate figure={question.figure} />}

              {/* =================================================================
                  DẠNG 1: TRẮC NGHIỆM 4 LỰA CHỌN (MCQ)
                 ================================================================= */}
              {question.type === 'mcq' && question.options && (
                <div className="mt-5 space-y-2.5" role="radiogroup" aria-label="Các phương án chọn">
                  {question.options.map((opt) => {
                    const isSelected =
                      currentAnswer?.type === 'mcq' && currentAnswer.value === opt.key
                    const isCorrectOpt = opt.key === question.correctOption

                    let boxClass =
                      'bg-paper-sheet border border-rule hover:border-ink hover:bg-paper cursor-pointer'
                    let letterClass = 'border-rule-strong bg-paper text-ink'
                    let statusBadge: React.ReactNode = null

                    if (isGradedReview) {
                      if (isCorrectOpt) {
                        boxClass = 'bg-ink-green-wash border border-ink-green border-l-4'
                        letterClass = 'border-ink-green bg-ink-green text-paper-sheet font-bold'
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-green shrink-0">
                            <IconCheck size={13} />
                            <span>Đáp án đúng</span>
                          </span>
                        )
                      } else if (isSelected && !isCorrectOpt) {
                        boxClass = 'bg-pen-red-wash border border-pen-red border-l-4'
                        letterClass = 'border-pen-red bg-paper-sheet text-pen-red font-bold'
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-pen-red shrink-0">
                            <IconCross size={13} />
                            <span>Bạn chọn</span>
                          </span>
                        )
                      } else {
                        boxClass = 'bg-paper-sheet border border-rule text-ink-secondary'
                      }
                    } else if (isLocked) {
                      boxClass = isSelected
                        ? 'bg-paper-recessed border border-rule-strong border-l-4 cursor-not-allowed'
                        : 'bg-paper-recessed border border-rule text-ink-muted cursor-not-allowed'
                      letterClass = isSelected
                        ? 'border-ink-secondary bg-ink-secondary text-paper-sheet'
                        : 'border-rule bg-paper text-ink-muted'
                    } else if (isSelected) {
                      boxClass =
                        'bg-pen-red-wash border border-pen-red border-l-4 cursor-pointer'
                      letterClass = 'border-pen-red bg-pen-red text-paper-sheet font-bold'
                    }

                    return (
                      <button
                        key={opt.key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={isLocked || isGradedReview}
                        onClick={() =>
                          onChangeAnswer(question.id, { type: 'mcq', value: opt.key })
                        }
                        className={`w-full text-left min-h-[52px] px-3.5 py-3 rounded-[3px] flex items-center justify-between gap-3 transition-colors ${boxClass}`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`tabular-figures w-7 h-7 shrink-0 border text-xs font-semibold flex items-center justify-center rounded-[2px] ${letterClass}`}
                          >
                            {opt.key}
                          </span>
                          <span
                            className={`text-[15px] leading-[1.55] ${
                              isGradedReview && isSelected && !isCorrectOpt
                                ? 'line-through decoration-pen-red'
                                : ''
                            }`}
                          >
                            {opt.text}
                          </span>
                        </div>
                        {statusBadge}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* =================================================================
                  DẠNG 2: ĐIỀN ĐÁP ÁN SỐ (NUMERIC INPUT)
                 ================================================================= */}
              {question.type === 'numeric' && (
                <div className="mt-5 bg-paper-sheet border border-rule rounded-[3px] p-4 sm:p-5">
                  <label
                    htmlFor={`num-${question.id}`}
                    className="block text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-2"
                  >
                    Nhập kết quả tính toán
                  </label>
                  <div className="flex items-stretch max-w-xs">
                    <input
                      id={`num-${question.id}`}
                      type="text"
                      inputMode="decimal"
                      disabled={isLocked || isGradedReview}
                      value={numericValue}
                      onChange={(e) =>
                        onChangeAnswer(question.id, {
                          type: 'numeric',
                          value: e.target.value,
                        })
                      }
                      placeholder="Nhập số (vd: 15)"
                      className={`tabular-figures flex-1 min-w-0 min-h-[44px] px-3 py-2 text-base font-semibold border rounded-l-[3px] focus:outline-none ${
                        isLocked || isGradedReview
                          ? 'bg-paper-recessed border-rule text-ink-secondary cursor-not-allowed'
                          : !isNumericSyntaxValid
                            ? 'bg-ochre-wash border-ochre text-ink'
                            : 'bg-paper-sheet border-rule-strong text-ink focus:border-pen-red'
                      }`}
                    />
                    {question.unit && (
                      <span className="tabular-figures px-3 min-h-[44px] text-xs font-semibold text-ink-secondary bg-paper border border-l-0 border-rule-strong rounded-r-[3px] flex items-center">
                        {question.unit}
                      </span>
                    )}
                  </div>

                  {!isNumericSyntaxValid ? (
                    <p className="mt-2 text-xs text-ink font-medium flex items-center gap-1.5">
                      <IconAlert size={13} />
                      <span>Chỉ dùng chữ số, dấu trừ (−) đầu số và dấu phẩy thập phân (,).</span>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-ink-muted">
                      {question.numericHint
                        ? `Gợi ý quy ước: ${question.numericHint}`
                        : 'Dùng dấu phẩy (,) cho số thập phân theo chuẩn phổ thông.'}
                    </p>
                  )}
                </div>
              )}

              {/* =================================================================
                  DẠNG 3: ĐIỀN KHUYẾT TRONG ĐOẠN VĂN (CLOZE)
                 ================================================================= */}
              {question.type === 'cloze' &&
                question.clozeSegments &&
                question.clozeBlanks && (
                  <div className="mt-5 space-y-4">
                    <div className="bg-paper-sheet border border-rule rounded-[3px] p-4 sm:p-5 text-[16px] leading-[2.1] text-ink">
                      {question.clozeSegments.map((seg, idx) => {
                        if (!seg.blankId) {
                          return <span key={idx}>{seg.text}</span>
                        }
                        const blank = question.clozeBlanks?.find((b) => b.id === seg.blankId)
                        if (!blank) return null
                        const chosen = clozeValues[blank.id] ?? ''
                        const isBlankCorrect = chosen === blank.correctChoice

                        return (
                          <span key={blank.id} className="inline-block align-baseline mx-1 my-0.5">
                            <select
                              aria-label={blank.label}
                              disabled={isLocked || isGradedReview}
                              value={chosen}
                              onChange={(e) =>
                                onChangeAnswer(question.id, {
                                  type: 'cloze',
                                  values: { ...clozeValues, [blank.id]: e.target.value },
                                })
                              }
                              className={`min-h-[44px] px-2.5 py-1 text-sm font-semibold border rounded-[3px] cursor-pointer ${
                                isGradedReview
                                  ? isBlankCorrect
                                    ? 'bg-ink-green-wash border-ink-green text-ink-green'
                                    : 'bg-pen-red-wash border-pen-red text-pen-red'
                                  : isLocked
                                    ? 'bg-paper-recessed border-rule text-ink-muted cursor-not-allowed'
                                    : chosen
                                      ? 'bg-pen-red-wash border-pen-red text-ink'
                                      : 'bg-paper border-rule-strong text-ink-secondary'
                              }`}
                            >
                              <option value="">[{blank.label}]</option>
                              {blank.choices.map((ch) => (
                                <option key={ch} value={ch}>
                                  {ch}
                                </option>
                              ))}
                            </select>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

              {/* =================================================================
                  DẠNG 4: NỐI HAI CỘT (MATCHING — TWO COLUMNS)
                 ================================================================= */}
              {question.type === 'matching' &&
                question.matchingLeft &&
                question.matchingRight && (
                  <div className="mt-5 bg-paper-sheet border border-rule rounded-[3px] p-4 sm:p-5">
                    <p className="text-xs text-ink-secondary mb-3">
                      Chọn một mục ở Cột A, rồi chạm mục ghép đôi ở Cột B.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Cột A */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-ink-secondary pb-1 border-b border-rule">
                          Cột A (Khái niệm / Đại lượng)
                        </div>
                        {question.matchingLeft.map((item) => {
                          const pairedRightId = matchingPairs[item.id]
                          const pairedRight = question.matchingRight?.find(
                            (r) => r.id === pairedRightId,
                          )
                          const isActive = activeMatchLeftId === item.id
                          const isPairCorrect = pairedRightId === item.correctRightId

                          return (
                            <div
                              key={item.id}
                              className={`border rounded-[3px] p-3 transition-colors ${
                                isGradedReview
                                  ? isPairCorrect
                                    ? 'bg-ink-green-wash border-ink-green'
                                    : 'bg-pen-red-wash border-pen-red'
                                  : isActive
                                    ? 'bg-pen-red-wash border-pen-red'
                                    : 'bg-paper border-rule'
                              }`}
                            >
                              <button
                                type="button"
                                disabled={isLocked || isGradedReview}
                                onClick={() => setActiveMatchLeftId(item.id)}
                                className="w-full text-left flex items-start justify-between gap-2 min-h-[44px] cursor-pointer"
                              >
                                <div className="flex items-start gap-2.5">
                                  <span className="tabular-figures w-6 h-6 shrink-0 bg-ink text-paper-sheet text-xs font-bold flex items-center justify-center rounded-[2px]">
                                    {item.leftLabel}
                                  </span>
                                  <span className="text-sm text-ink font-medium leading-[1.45]">
                                    {item.leftText}
                                  </span>
                                </div>
                                <span className="tabular-figures px-2 py-0.5 text-xs font-bold border border-rule-strong bg-paper-sheet rounded-[2px] shrink-0">
                                  {pairedRight ? `↔ ${pairedRight.label}` : 'Chưa nối'}
                                </span>
                              </button>

                              <div className="mt-2 pt-2 border-t border-rule flex items-center justify-between gap-2">
                                <label
                                  htmlFor={`match-${item.id}`}
                                  className="text-[11px] text-ink-secondary"
                                >
                                  Ghép với Cột B:
                                </label>
                                <select
                                  id={`match-${item.id}`}
                                  disabled={isLocked || isGradedReview}
                                  value={pairedRightId ?? ''}
                                  onChange={(e) =>
                                    onChangeAnswer(question.id, {
                                      type: 'matching',
                                      pairs: { ...matchingPairs, [item.id]: e.target.value },
                                    })
                                  }
                                  className="min-h-[44px] px-2.5 text-xs font-semibold bg-paper-sheet border border-rule-strong rounded-[3px]"
                                >
                                  <option value="">-- Chọn --</option>
                                  {question.matchingRight?.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.label}. {opt.text.slice(0, 38)}
                                      {opt.text.length > 38 ? '…' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Cột B */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-ink-secondary pb-1 border-b border-rule">
                          Cột B (Tính chất / Biểu thức)
                        </div>
                        {question.matchingRight.map((right) => {
                          const matchedBy = question.matchingLeft?.find(
                            (l) => matchingPairs[l.id] === right.id,
                          )
                          return (
                            <button
                              key={right.id}
                              type="button"
                              disabled={isLocked || isGradedReview || !activeMatchLeftId}
                              onClick={() => {
                                if (!activeMatchLeftId) return
                                onChangeAnswer(question.id, {
                                  type: 'matching',
                                  pairs: { ...matchingPairs, [activeMatchLeftId]: right.id },
                                })
                              }}
                              className={`w-full text-left min-h-[52px] p-3 border rounded-[3px] flex items-start justify-between gap-2 transition-colors ${
                                matchedBy
                                  ? 'bg-paper border-ink'
                                  : 'bg-paper-sheet border-rule hover:border-pen-red'
                              } ${isLocked || isGradedReview ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <span className="tabular-figures w-6 h-6 shrink-0 border border-rule-strong bg-paper text-ink text-xs font-bold flex items-center justify-center rounded-[2px]">
                                  {right.label}
                                </span>
                                <span className="text-sm text-ink leading-[1.45]">
                                  {right.text}
                                </span>
                              </div>
                              {matchedBy && (
                                <span className="tabular-figures text-[11px] font-bold text-ink border border-ink px-1.5 py-0.5 rounded-[2px] shrink-0">
                                  Cặp {matchedBy.leftLabel}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

              {/* KHỐI CHẤM ĐÁP ÁN & GIẢI THÍCH (CHỈ HIỆN KHI XEM LẠI HOẶC ĐÃ CHẤM) */}
              {isGradedReview && (
                <div
                  className={`mt-5 p-4 border rounded-[3px] ${
                    isQuestionCorrect(question, currentAnswer)
                      ? 'bg-ink-green-wash border-ink-green'
                      : 'bg-pen-red-wash border-pen-red'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink">
                      Ghi chú chấm bài: {formatCorrectAnswerSummary(question)}
                    </span>
                    <span
                      className={`tabular-figures text-xs font-bold ${
                        isQuestionCorrect(question, currentAnswer)
                          ? 'text-ink-green'
                          : 'text-pen-red'
                      }`}
                    >
                      {isQuestionCorrect(question, currentAnswer) ? 'Đúng (+1)' : 'Chưa đúng (0)'}
                    </span>
                  </div>
                  <p className="text-sm leading-[1.6] text-ink">{question.explanation}</p>
                </div>
              )}

              {/* THANH CHUYỂN CÂU TRƯỚC / SAU */}
              <div className="mt-7 pt-5 border-t border-rule flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => onSelectIndex(currentIndex - 1)}
                  className="inline-flex items-center gap-2 px-4 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-ink disabled:bg-paper-recessed disabled:text-ink-muted disabled:border-rule disabled:cursor-not-allowed rounded-[3px] cursor-pointer"
                >
                  <IconArrowLeft size={14} />
                  <span>Câu trước</span>
                </button>

                <div className="flex items-center gap-2.5">
                  {currentIndex < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => onSelectIndex(currentIndex + 1)}
                      className="inline-flex items-center gap-2 px-5 min-h-[44px] text-xs font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer"
                    >
                      <span>Câu tiếp theo (N)</span>
                      <IconArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onFinishOrSubmit}
                      className="inline-flex items-center gap-2 px-5 min-h-[44px] text-xs font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer"
                    >
                      <span>
                        {isGradedReview
                          ? 'Về bảng kết quả'
                          : mode === 'simulation'
                            ? 'Xem tổng hợp / Nộp phần thi'
                            : 'Nộp & chấm bài chủ đề'}
                      </span>
                      <IconArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CỘT LỀ PHẢI TRÊN DESKTOP 1440PX: ĐỒNG HỒ + BẢNG CÂU HỎI + PHÍM TẮT */}
        <aside
          aria-label="Cột điều hướng câu hỏi và đồng hồ"
          className="hidden lg:flex flex-col justify-between bg-paper p-5 gap-5"
        >
          <div className="space-y-5">
            {/* Đồng hồ phần thi bằng chữ số đẳng rộng */}
            <div className="pb-4 border-b border-rule">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-2">
                {mode === 'simulation' ? 'Đồng hồ phần thi' : 'Chế độ tự luyện'}
              </span>
              {mode === 'simulation' ? (
                <TimerChip remainingSeconds={remainingSeconds} expired={isLocked} />
              ) : (
                <div className="px-3 py-2 bg-paper-sheet border border-rule rounded-[3px] text-xs text-ink-secondary">
                  Không tính giờ · Tập trung rà soát cách giải
                </div>
              )}
            </div>

            {/* Lưới ô số câu hỏi */}
            {renderNavigatorGrid(false)}
          </div>

          <div className="space-y-4 pt-4 border-t border-rule">
            {/* Gợi ý phím tắt */}
            <div className="bg-paper-sheet border border-rule rounded-[3px] p-3 text-xs">
              <div className="font-semibold text-ink mb-1.5">Phím tắt bàn phím</div>
              <ul className="space-y-1 text-ink-secondary tabular-figures text-[11px]">
                <li>
                  <strong className="text-ink">[A–D]</strong> Chọn nhanh phương án
                </li>
                <li>
                  <strong className="text-ink">[N]</strong> Chuyển sang câu kế tiếp
                </li>
                <li>
                  <strong className="text-ink">[F]</strong> Đánh dấu câu cần xem lại
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={onFinishOrSubmit}
              className="w-full min-h-[44px] px-4 text-xs font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer transition-colors"
            >
              {isGradedReview
                ? 'Quay lại bảng tổng kết'
                : mode === 'simulation'
                  ? 'Chuyển phần / Nộp bài thi'
                  : 'Nộp & xem đáp án'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
