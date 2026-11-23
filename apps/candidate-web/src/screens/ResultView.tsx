import React, { useState } from 'react'
import type { AnswerValue, Attempt, ReviewSlot, Slot } from '@/api/types'
import { ContentBlocks } from '@/content/ContentBlocks'
import { KIND_LABELS } from '@/attempt/Interactions'
import { buttonClass, DemoNoticePanel, Notice } from '@/ui/Shell'
import { IconArrowLeft, IconCheck, IconCross } from '@/components/Icons'

const DOMAIN_NAMES: Record<string, string> = { MATH: 'Tư duy Toán học', READING: 'Tư duy Đọc hiểu', SCIENCE: 'Tư duy Khoa học' }

function describeResponse(slot: Slot, answer: AnswerValue | undefined): string {
  if (!answer) return 'Bỏ trống'
  switch (answer.type) {
    case 'SINGLE_CHOICE': return answer.optionId ? `Chọn ${answer.optionId.toUpperCase()}` : 'Bỏ trống'
    case 'MULTIPLE_CHOICE': return answer.optionIds.length ? `Chọn ${answer.optionIds.map((id) => id.toUpperCase()).join(', ')}` : 'Bỏ trống'
    case 'NUMERIC_RESPONSE': return answer.value ?? 'Bỏ trống'
    case 'TRUE_FALSE_GROUP': return answer.statementValues.map((item, index) => `${index + 1}: ${item.value ? 'Đúng' : 'Sai'}`).join(' · ') || 'Bỏ trống'
    case 'CLOZE': return Object.values(answer.values).map((value) => value ?? '—').join(' · ')
    case 'MATCHING': {
      const labels = slot.interaction.type === 'MATCHING' ? new Map(slot.interaction.targets.map((target) => [target.id, target.label])) : new Map()
      return Object.values(answer.assignments).map((value) => value ? labels.get(value) ?? value : '—').join(' · ')
    }
  }
}

function describeKey(slot: Slot, item: ReviewSlot): string {
  if (item.correctOptionId) return `Đáp án ${item.correctOptionId.toUpperCase()}`
  if (item.correctOptionIds) return `Đáp án ${item.correctOptionIds.map((id) => id.toUpperCase()).join(', ')}`
  if (item.correctNumericValue !== undefined) return item.correctNumericValue
  if (item.correctStatementValues) return item.correctStatementValues.map((entry, index) => `${index + 1}: ${entry.value ? 'Đúng' : 'Sai'}`).join(' · ')
  if (item.clozeAcceptedValues) return Object.values(item.clozeAcceptedValues).map((values) => values.join(' / ')).join(' · ')
  if (item.correctMatchingAnswers) {
    const labels = slot.interaction.type === 'MATCHING' ? new Map(slot.interaction.targets.map((target) => [target.id, target.label])) : new Map()
    return Object.values(item.correctMatchingAnswers).map((value) => labels.get(value) ?? value).join(' · ')
  }
  return ''
}

export function ResultView({ attempt, apiVersion, review, onOpenReview, onExit, message }: {
  attempt: Attempt
  apiVersion: string
  review: ReviewSlot[] | null
  onOpenReview: () => void
  onExit: () => void
  message: { tone: 'info' | 'error' | 'success'; text: string } | null
}) {
  const [filter, setFilter] = useState<'all' | 'wrong'>('wrong')
  const result = attempt.result
  const answers = new Map(attempt.answers.map((answer) => [answer.slotId, answer]))
  const slotById = new Map(attempt.slots.map((slot) => [slot.slotId, slot]))
  const title = attempt.practiceProfile?.name || DOMAIN_NAMES[attempt.domain] || 'Bài luyện tập'
  const wrong = review?.filter((item) => item.earned <= 0) ?? []
  const shown = (filter === 'wrong' ? wrong : review ?? []).slice().sort((a, b) => a.ordinal - b.ordinal)

  return (
    <main className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr]" data-testid="result">
      <aside className="notebook-margin-lg border-b lg:border-b-0 border-rule px-5 py-8">
        <p className="text-xs font-bold text-pen-red uppercase tracking-wide">Phần chấm của bút đỏ</p>
        <p className="mt-1 text-[11px] text-ink-secondary">Kết quả luyện tập không chính thức</p>
        <div className="mt-5 pt-4 border-t-2 border-pen-red">
          <p className="text-xs font-semibold text-pen-red">Số câu đúng</p>
          <p className="tabular-figures text-pen-red leading-none mt-1" data-testid="result-score">
            <span className="text-[56px] font-bold">{result?.correctCount ?? '—'}</span>
            <span className="text-xl font-semibold"> /{result?.totalCount ?? attempt.questionCount}</span>
          </p>
        </div>
        <dl className="mt-4 border-t border-rule divide-y divide-rule text-sm">
          <div className="flex justify-between py-2"><dt>Phần thi</dt><dd className="text-right">{DOMAIN_NAMES[attempt.domain]}</dd></div>
          <div className="flex justify-between py-2"><dt>Đã làm</dt><dd className="tabular-figures">{attempt.answeredCount}/{attempt.questionCount}</dd></div>
        </dl>
        <button type="button" className={`${buttonClass.secondary} mt-6 w-full`} onClick={onExit} data-testid="result-exit"><IconArrowLeft /> Về mục lục</button>
      </aside>

      <section className="px-5 py-8 sm:px-10 max-w-[980px] min-w-0">
        <p className="text-xs font-semibold text-ink-secondary">Kết quả tự luyện</p>
        <h1 tabIndex={-1} className="mt-1 font-display text-[30px] sm:text-[38px] font-semibold leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-ink-secondary max-w-[62ch]">Số câu đúng do máy chủ chấm cho bài luyện tập này. Đây không phải điểm TSA chính thức và không quy đổi sang thang điểm nào.</p>
        <div className="mt-5"><DemoNoticePanel /></div>
        {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}

        {!review ? (
          <button type="button" className={`${buttonClass.ink} mt-8`} onClick={onOpenReview} data-testid="review-open">Xem lại đáp án và lời giải</button>
        ) : (
          <div className="mt-8" data-testid="review">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-ink">
              <h2 className="font-display text-2xl font-semibold">Rà soát câu hỏi</h2>
              <div className="flex gap-1.5" role="group" aria-label="Lọc câu hỏi">
                {([['wrong', `Chưa đúng (${wrong.length})`], ['all', `Tất cả (${review.length})`]] as const).map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
                    className={`px-3 min-h-[44px] text-xs font-semibold border rounded-[3px] cursor-pointer ${filter === key ? 'bg-ink text-paper-sheet border-ink' : 'bg-paper-sheet border-rule-strong'}`}>{label}</button>
                ))}
              </div>
            </div>
            {shown.length === 0 && <p className="py-6 text-sm text-ink-secondary">Không có câu nào trong bộ lọc này.</p>}
            <ol className="divide-y divide-rule">
              {shown.map((item) => {
                const slot = slotById.get(item.slotId)
                if (!slot) return null
                const correct = item.earned > 0
                return (
                  <li key={item.slotId} className="py-5" data-testid={`review-item-${item.ordinal}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="tabular-figures text-xs font-bold border border-rule-strong px-2 py-0.5 rounded-[2px]">Câu {String(item.ordinal).padStart(2, '0')}</span>
                      <span className="text-xs text-ink-secondary">{KIND_LABELS[slot.interaction.type]}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 border rounded-[2px] ${correct ? 'text-ink-green border-ink-green bg-ink-green-wash' : 'text-pen-red border-pen-red bg-pen-red-wash'}`}>
                        {correct ? <IconCheck size={12} /> : <IconCross size={12} />}{correct ? 'Đúng' : 'Chưa đúng'}
                      </span>
                    </div>
                    {slot.stimulus?.content?.length ? (
                      <details className="mb-2 text-sm"><summary className="cursor-pointer text-ink-secondary">Xem đoạn văn</summary>
                        <ContentBlocks blocks={slot.stimulus.content} attemptId={attempt.attemptId} apiVersion={apiVersion} className="mt-2 p-3 border border-rule bg-paper-sheet" /></details>
                    ) : null}
                    <ContentBlocks blocks={slot.content} attemptId={attempt.attemptId} apiVersion={apiVersion} className="text-[15px] font-medium" />
                    {(slot.interaction.type === 'SINGLE_CHOICE' || slot.interaction.type === 'MULTIPLE_CHOICE') && (
                      <ul className="mt-3 grid gap-1.5">
                        {slot.interaction.options.map((option) => {
                          const key = item.correctOptionId === option.id || item.correctOptionIds?.includes(option.id)
                          return (
                            <li key={option.id} className={`flex gap-3 items-start px-3 py-2 border rounded-[3px] text-sm ${key ? 'border-ink-green bg-ink-green-wash' : 'border-rule bg-paper-sheet'}`}>
                              <span className="tabular-figures font-bold">{option.id.toUpperCase()}</span>
                              <ContentBlocks blocks={option.content} attemptId={attempt.attemptId} apiVersion={apiVersion} className="flex-1" />
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <p className="mt-3 tabular-figures text-xs">
                      <span className="text-ink-secondary">Bài làm: </span><span className={correct ? 'text-ink-green font-semibold' : 'text-pen-red font-semibold'}>{describeResponse(slot, answers.get(slot.slotId))}</span>
                      <span className="text-ink-secondary"> · Đáp án: </span><span className="text-ink-green font-semibold">{describeKey(slot, item)}</span>
                    </p>
                    {item.explanation?.length ? (
                      <details className="mt-3 border border-rule border-l-[3px] border-l-ochre bg-ochre-wash rounded-[3px]">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Lời giải</summary>
                        <ContentBlocks blocks={item.explanation} attemptId={attempt.attemptId} apiVersion={apiVersion} purpose="explanation" className="px-3 pb-3 text-sm leading-relaxed" />
                      </details>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </section>
    </main>
  )
}
