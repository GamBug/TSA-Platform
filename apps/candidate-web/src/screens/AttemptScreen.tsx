import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ApiError, Attempt, ReviewSlot, StudentApi } from '@/api/types'
import { ContentBlocks } from '@/content/ContentBlocks'
import { AnswerControl, KIND_LABELS } from '@/attempt/Interactions'
import { TimerChip, formatClockMMSS } from '@/components/TimerChip'
import { IconFlag, IconArrowLeft, IconArrowRight } from '@/components/Icons'
import { buttonClass, Notice, PanelToggle, testLayout } from '@/ui/Shell'
import { ResultView } from '@/screens/ResultView'
import { isAnswered, useFlags, useQuestionPanel } from '@/attempt/progress'

const DOMAIN_NAMES: Record<string, string> = { MATH: 'Tư duy Toán học', READING: 'Tư duy Đọc hiểu', SCIENCE: 'Tư duy Khoa học' }

export function AttemptScreen({ api, apiVersion, initial, onExit, onSessionLost }: {
  api: StudentApi
  apiVersion: string
  initial: Attempt
  onExit: (message?: string) => void
  onSessionLost: (message: string) => void
}) {
  const [attempt, setAttempt] = useState(initial)
  const [index, setIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [review, setReview] = useState<ReviewSlot[] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [leaveWarned, setLeaveWarned] = useState(false)
  const [offset, setOffset] = useState(() => Date.parse(initial.serverNow) - Date.now())
  const [now, setNow] = useState(() => Date.now())
  const { flags, toggle } = useFlags(attempt.attemptId)
  const panel = useQuestionPanel()
  const submitDialog = useRef<HTMLDialogElement>(null)

  // The catalog may have been scrolled to reach a section card.
  useLayoutEffect(() => {
    if (attempt.state === 'IN_PROGRESS') window.scrollTo(0, 0)
  }, [attempt.attemptId, attempt.state])

  const adopt = useCallback((next: Attempt) => {
    setAttempt(next)
    if (next.serverNow) setOffset(Date.parse(next.serverNow) - Date.now())
  }, [])

  const handleError = useCallback(async (error: unknown) => {
    const failure = error as ApiError
    if (failure?.code === 'UNAUTHENTICATED' || failure?.code === 'FORBIDDEN') return onSessionLost(failure.message)
    setMessage({ tone: 'error', text: failure?.message || 'Yêu cầu chưa hoàn tất. Hãy thử lại.' })
    if (['ATTEMPT_CLOSED', 'REVISION_CONFLICT', 'DEADLINE_PASSED'].includes(failure?.code ?? '')) {
      try { adopt((await api.readAttempt(attempt.attemptId)).attempt) } catch { /* keep the message */ }
    }
  }, [adopt, api, attempt.attemptId, onSessionLost])

  // Server clock: remaining time is derived from the server's deadline and its reported time.
  useEffect(() => {
    if (attempt.state !== 'IN_PROGRESS') return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [attempt.state])
  const remaining = attempt.deadlineAt ? Math.max(0, Math.floor((Date.parse(attempt.deadlineAt) - (now + offset)) / 1000)) : 0

  // At the deadline, or while grading, ask the server for the authoritative state.
  useEffect(() => {
    const waiting = attempt.state === 'SUBMITTED' || attempt.state === 'EXPIRED' || (attempt.state === 'IN_PROGRESS' && attempt.deadlineAt && remaining <= 0)
    if (!waiting) return
    const timer = window.setTimeout(async () => {
      try { adopt((await api.readAttempt(attempt.attemptId)).attempt) } catch (error) { void handleError(error) }
    }, attempt.state === 'IN_PROGRESS' ? 300 : 1500)
    return () => window.clearTimeout(timer)
  }, [adopt, api, attempt, handleError, remaining])

  const answers = useMemo(() => new Map(attempt.answers.map((answer) => [answer.slotId, answer])), [attempt.answers])
  const slots = attempt.slots
  const slot = slots[Math.min(index, Math.max(0, slots.length - 1))]
  const answeredCount = slots.filter((item) => isAnswered(item, answers.get(item.slotId))).length

  const save = async (input: unknown): Promise<boolean> => {
    if (!slot) return false
    setSaving(true); setMessage(null)
    try {
      const result = await api.saveAnswer(attempt.attemptId, slot.slotId, input)
      adopt(result.attempt)
      setSavedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))
      return true
    } catch (error) { await handleError(error); return false } finally { setSaving(false) }
  }

  // Typed, numeric and matching answers save explicitly; warn once before leaving unsaved changes.
  const go = (next: number) => {
    const target = Math.max(0, Math.min(slots.length - 1, next))
    if (target === index) return
    if (dirty && !leaveWarned) {
      setLeaveWarned(true)
      setMessage({ tone: 'info', text: 'Câu này có thay đổi chưa lưu. Bấm “Lưu câu trả lời”, hoặc chuyển câu lần nữa để bỏ thay đổi.' })
      return
    }
    setLeaveWarned(false); setDirty(false); setMessage(null)
    setIndex(target)
  }
  const onDirtyChange = useCallback((value: boolean) => { setDirty(value); if (!value) setLeaveWarned(false) }, [])

  // Keyboard: A–D choose (single choice), N/P next/previous, F flag. Ignored while typing.
  useEffect(() => {
    if (attempt.state !== 'IN_PROGRESS') return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.ctrlKey || event.metaKey || event.altKey || target.closest('input[type="text"], textarea, select, dialog')) return
      const key = event.key.toLowerCase()
      if (key === 'n') go(index + 1)
      else if (key === 'p') go(index - 1)
      else if (key === 'f' && slot) toggle(slot.slotId)
      else if (slot?.interaction.type === 'SINGLE_CHOICE' && !saving) {
        const option = slot.interaction.options.find((item) => item.id.toLowerCase() === key)
        if (option) void save({ optionId: option.id })
      } else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const start = async () => {
    setSaving(true)
    try { adopt((await api.startReservedAttempt(attempt.attemptId)).attempt) } catch (error) { await handleError(error) } finally { setSaving(false) }
  }

  const submit = async () => {
    setSaving(true)
    try { adopt((await api.submitAttempt(attempt.attemptId)).attempt); submitDialog.current?.close(); setConfirming(false) }
    catch (error) { await handleError(error) } finally { setSaving(false) }
  }

  const openReview = async () => {
    try { setReview((await api.readReview(attempt.attemptId)).review.slots) } catch (error) { await handleError(error) }
  }

  const title = attempt.practiceProfile?.name || DOMAIN_NAMES[attempt.domain] || 'Bài luyện tập'

  if (attempt.state === 'CREATED') {
    return (
      <main className="flex-1 px-5 py-10 sm:px-10 max-w-[760px]" data-testid="attempt-created">
        <p className="text-xs font-semibold text-pen-red uppercase tracking-wide">Bài đã được giữ</p>
        <h1 tabIndex={-1} className="mt-2 font-display text-[32px] sm:text-[40px] font-semibold leading-tight">{title}</h1>
        <p className="mt-3 tabular-figures text-sm text-ink-secondary">{attempt.questionCount} câu · đồng hồ bắt đầu khi bạn bấm “Bắt đầu làm bài”</p>
        {message && <div className="mt-5"><Notice tone={message.tone}>{message.text}</Notice></div>}
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" className={buttonClass.primary} disabled={saving} onClick={start} data-testid="attempt-start">Bắt đầu làm bài</button>
          <button type="button" className={buttonClass.secondary} onClick={() => onExit()}>Về mục lục</button>
        </div>
      </main>
    )
  }

  if (attempt.state === 'GRADED') {
    return <ResultView attempt={attempt} apiVersion={apiVersion} review={review} onOpenReview={openReview} onExit={() => onExit()} message={message} />
  }

  if (attempt.state !== 'IN_PROGRESS') {
    const closed = attempt.state === 'CANCELLED' || attempt.state === 'INVALIDATED'
    return (
      <main className="flex-1 px-5 py-16 sm:px-10 max-w-[760px]" data-testid="attempt-grading">
        <h1 tabIndex={-1} className="font-display text-[30px] font-semibold">{closed ? 'Bài luyện tập đã khép lại' : 'Đang chấm bài…'}</h1>
        <p className="mt-3 text-sm text-ink-secondary" role="status">
          {closed ? 'Bài này không còn được tiếp tục.' : attempt.state === 'EXPIRED' ? 'Hết giờ. Máy chủ đang chấm các câu trả lời đã được ghi nhận.' : 'Bài đã được nộp. Kết quả sẽ hiện khi máy chủ phát hành.'}
        </p>
        {message && <div className="mt-5"><Notice tone={message.tone}>{message.text}</Notice></div>}
        <button type="button" className={`${buttonClass.secondary} mt-8`} onClick={() => onExit()}>Về mục lục</button>
      </main>
    )
  }

  if (!slot) return <main className="flex-1 p-10"><Notice tone="error">Bài luyện tập không có câu hỏi.</Notice></main>
  const saved = answers.get(slot.slotId)
  const position = slots.indexOf(slot)
  const passage = slot.stimulus?.content?.length ? slot.stimulus.content : null
  const lowTime = remaining <= 5 * 60
  const layout = testLayout(panel.open, Boolean(passage))

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="attempt-workspace">
      <header className="sticky top-0 z-30 bg-paper border-b border-ink">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5">
          <div className="min-w-0">
            <p className="font-display text-base sm:text-lg font-semibold truncate">{title}</p>
            <p className="text-xs text-ink-secondary tabular-figures">{attempt.questionCount} câu · Luyện tập không chính thức</p>
          </div>
          <div className="flex items-center gap-2">
            <PanelToggle open={panel.open} onToggle={panel.toggle} />
            <span data-testid="timer"><TimerChip remainingSeconds={remaining} compact /></span>
            <button type="button" className={`${buttonClass.primary} shrink-0 whitespace-nowrap`} disabled={saving}
              onClick={() => { setConfirming(true); submitDialog.current?.showModal() }} data-testid="submit-open">Nộp bài</button>
          </div>
        </div>
      </header>

      <div className={layout.body}>
        <main className="question-oly-surface min-w-0">
          <div className={`mx-auto px-4 sm:px-8 py-5 sm:py-6 ${layout.width}`}>
            {message && <div className="mb-4"><Notice tone={message.tone} testId="screen-message">{message.text}</Notice></div>}
            <div className={passage ? layout.split : ''}>
              {passage && (
                <section aria-label="Đoạn văn" className={`bg-paper-sheet border border-rule-strong rounded-[3px] p-5 ${panel.open
                  ? 'xl:sticky xl:top-20 xl:max-h-[calc(100dvh-140px)] xl:overflow-y-auto'
                  : 'lg:sticky lg:top-20 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto'}`}>
                  <p className="text-xs font-bold text-ink-secondary uppercase tracking-wide mb-3">Đoạn văn</p>
                  <ContentBlocks blocks={passage} attemptId={attempt.attemptId} apiVersion={apiVersion} className="text-[15px] leading-[1.75]" />
                </section>
              )}
              <article className="flex min-w-0">
                <div className="w-10 sm:w-12 shrink-0 notebook-margin-double flex flex-col items-center pt-1 gap-3 select-none">
                  <span className="tabular-figures text-xs font-bold text-ink">C.{String(position + 1).padStart(2, '0')}</span>
                  {flags.has(slot.slotId) && <IconFlag size={14} className="text-ochre" />}
                </div>
                <div className="flex-1 min-w-0 pl-4 sm:pl-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rule">
                    <p className="text-sm text-ink-secondary"><span className="tabular-figures font-semibold text-ink">{position + 1}/{slots.length}</span> · {KIND_LABELS[slot.interaction.type] ?? ''}</p>
                    <button type="button" aria-pressed={flags.has(slot.slotId)} onClick={() => toggle(slot.slotId)} data-testid="flag-toggle"
                      className={`inline-flex items-center gap-2 px-3 min-h-[44px] text-xs font-semibold border rounded-[3px] cursor-pointer ${
                        flags.has(slot.slotId) ? 'border-ochre bg-ochre-wash text-ink' : 'border-rule-strong bg-paper-sheet text-ink-secondary hover:border-ink'}`}>
                      <IconFlag size={13} /> {flags.has(slot.slotId) ? 'Đã đánh dấu' : 'Đánh dấu'} (F)
                    </button>
                  </div>
                  <section id="question-title" tabIndex={-1} aria-label={`Câu ${position + 1}`} className="mt-5 text-[17px] sm:text-[18px] font-semibold leading-[1.6]">
                    <ContentBlocks blocks={slot.content} attemptId={attempt.attemptId} apiVersion={apiVersion} />
                  </section>
                  <div className="mt-5">
                    <AnswerControl key={slot.slotId} slot={slot} saved={saved} disabled={saving} attemptId={attempt.attemptId} apiVersion={apiVersion} onSave={save} onDirtyChange={onDirtyChange} />
                  </div>
                  <p className="mt-4 tabular-figures text-xs text-ink-secondary" role="status" data-testid="save-status">
                    {saving ? 'Đang lưu…' : isAnswered(slot, saved) ? `Đã lưu${savedAt ? ` lúc ${savedAt}` : ''}` : 'Chưa có câu trả lời được lưu'}
                  </p>
                </div>
              </article>
            </div>
          </div>
        </main>

        <aside className={`border-t lg:border-t-0 lg:border-l border-ink bg-paper px-4 py-5 lg:overflow-y-auto ${layout.aside}`} aria-label="Bảng câu hỏi">
          <div className="hidden lg:block mb-5">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Đồng hồ</p>
            <p className={`mt-1 tabular-figures text-3xl font-bold ${lowTime ? 'text-pen-red' : 'text-ink'}`} aria-live="off">{formatClockMMSS(remaining)}</p>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">Bảng câu hỏi</p>
            <p className="tabular-figures text-xs text-ink-secondary" data-testid="answered-count">Đã làm {answeredCount}/{slots.length}</p>
          </div>
          <ol className="mt-3 grid grid-cols-5 gap-1.5" data-testid="question-grid">
            {slots.map((item, itemIndex) => {
              const done = isAnswered(item, answers.get(item.slotId))
              const current = itemIndex === position
              return (
                <li key={item.slotId}>
                  <button type="button" onClick={() => go(itemIndex)} aria-current={current ? 'step' : undefined}
                    aria-label={`Câu ${itemIndex + 1}${done ? ', đã làm' : ', chưa làm'}${flags.has(item.slotId) ? ', đã đánh dấu' : ''}`}
                    data-testid={`question-jump-${itemIndex + 1}`}
                    className={`relative w-full aspect-square min-h-[44px] tabular-figures text-xs font-bold border rounded-[2px] cursor-pointer ${
                      done ? 'bg-ink text-paper-sheet border-ink' : 'bg-paper-sheet text-ink border-rule-strong hover:border-ink'} ${current ? 'outline-2 outline-pen-red outline-offset-1' : ''}`}>
                    {String(itemIndex + 1).padStart(2, '0')}
                    {flags.has(item.slotId) && <span aria-hidden="true" className="absolute top-1 right-1 w-1.5 h-1.5 bg-ochre" />}
                  </button>
                </li>
              )
            })}
          </ol>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-ink-secondary">
            <li className="flex items-center gap-1.5"><span className="w-3 h-3 border border-rule-strong bg-paper-sheet" />Chưa làm</li>
            <li className="flex items-center gap-1.5"><span className="w-3 h-3 bg-ink" />Đã làm</li>
            <li className="flex items-center gap-1.5"><span className="w-3 h-3 border border-rule-strong relative"><span className="absolute top-0 right-0 w-1.5 h-1.5 bg-ochre" /></span>Đánh dấu</li>
            <li className="flex items-center gap-1.5"><span className="w-3 h-3 border-2 border-pen-red" />Đang xem</li>
          </ul>
        </aside>
      </div>

      <footer className="sticky bottom-0 z-20 bg-paper border-t border-ink">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-2.5">
          <button type="button" className={buttonClass.secondary} disabled={position === 0} onClick={() => go(position - 1)} data-testid="question-previous"><IconArrowLeft /> Câu trước</button>
          <span className="tabular-figures text-sm font-semibold">Câu {position + 1} / {slots.length}</span>
          <button type="button" className={buttonClass.secondary} disabled={position >= slots.length - 1} onClick={() => go(position + 1)} data-testid="question-next">Câu sau <IconArrowRight /></button>
        </div>
      </footer>

      <dialog ref={submitDialog} onClose={() => setConfirming(false)} aria-labelledby="submit-title"
        className="m-auto w-[min(420px,calc(100%-32px))] p-6 bg-paper-sheet border border-ink rounded-[4px] backdrop:bg-ink/45">
        {confirming && (
          <>
            <h2 id="submit-title" className="font-display text-2xl font-semibold">Nộp bài luyện tập?</h2>
            <p className="mt-2 text-sm text-ink-secondary">Câu chưa làm sẽ được tính là chưa đúng. Sau khi nộp, bạn không sửa được câu trả lời.</p>
            {dirty && <p className="mt-2 text-sm font-semibold text-pen-red" data-testid="submit-unsaved">Câu đang xem có thay đổi chưa lưu và sẽ không được tính.</p>}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[[answeredCount, 'Đã làm'], [slots.length - answeredCount, 'Chưa làm'], [flags.size, 'Đánh dấu']].map(([value, label]) => (
                <div key={label as string} className="border border-rule bg-paper px-2 py-2 rounded-[3px]">
                  <dt className="text-[11px] text-ink-secondary">{label}</dt><dd className="tabular-figures text-lg font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 grid gap-2">
              <button type="button" className={buttonClass.primary} disabled={saving} onClick={submit} data-testid="submit-confirm">Xác nhận nộp</button>
              <button type="button" className={buttonClass.secondary} onClick={() => submitDialog.current?.close()} data-testid="submit-cancel">Tiếp tục làm</button>
            </div>
          </>
        )}
      </dialog>
    </div>
  )
}
