import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { simulationApi, SimulationError, toAnswerValue, toRawValue, type SectionId, type SimulationOffer, type SimulationResult, type SimulationView, type SimulationHistoryItem } from '@/api/simulation'
import { ContentBlocks } from '@/content/ContentBlocks'
import { AnswerControl, KIND_LABELS } from '@/attempt/Interactions'
import { isAnswered, useFlags, useQuestionPanel } from '@/attempt/progress'
import { formatClockMMSS } from '@/components/TimerChip'
import { IconArrowLeft, IconArrowRight, IconFlag, IconLock } from '@/components/Icons'
import { buttonClass, DemoNoticePanel, Notice, PanelToggle, testLayout } from '@/ui/Shell'

const SECTION_NAMES: Record<SectionId, string> = { math: 'Tư duy Toán học', reading: 'Tư duy Đọc hiểu', science: 'Tư duy Khoa học' }
const SECTION_PLAN: [SectionId, number, number][] = [['math', 40, 60], ['reading', 20, 30], ['science', 40, 60]]

function FlagMark({ attemptId, slotId, render }: { attemptId: string; slotId: string; render: (flagged: boolean, toggle: () => void) => React.ReactNode }) {
  const { flags, toggle } = useFlags(attemptId)
  return <>{render(flags.has(slotId), () => toggle(slotId))}</>
}

export function SimulationScreen({ onSessionLost }: { onSessionLost: (message: string) => void }) {
  const [view, setView] = useState<SimulationView | null>(null)
  const [offers, setOffers] = useState<SimulationOffer[] | null>(null)
  const [history, setHistory] = useState<SimulationHistoryItem[]>([])
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [section, setSection] = useState<SectionId>('math')
  const panel = useQuestionPanel()
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null)
  const [syncedAt, setSyncedAt] = useState(() => performance.now())
  const [, setTick] = useState(0)
  const submitDialog = useRef<HTMLDialogElement>(null)

  const fail = useCallback((error: unknown) => {
    const failure = error as SimulationError
    if (failure?.status === 401 || failure?.code === 'UNAUTHENTICATED') return onSessionLost(failure.message)
    setMessage({ tone: 'error', text: failure?.message || 'Yêu cầu chưa hoàn tất. Hãy thử lại.' })
  }, [onSessionLost])

  const load = useCallback(async (attemptId: string) => {
    const next = await simulationApi.read(attemptId)
    setView(next)
    setSyncedAt(performance.now())
    setResult(next.state === 'GRADED' ? await simulationApi.result(attemptId) : null)
    if (next.state === 'IN_PROGRESS') {
      const open = next.activeSectionId ?? next.sections.find((item) => item.firstOpenedAt)?.sectionId ?? 'math'
      setSection((current) => next.sections.some((item) => item.sectionId === current && item.firstOpenedAt) ? current : open)
    }
  }, [])

  const home = useCallback(async () => {
    try {
      const [catalog, attempts] = await Promise.all([simulationApi.catalog(), simulationApi.history()])
      setOffers(catalog); setHistory(attempts)
      const active = attempts.find((item) => ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED'].includes(item.state))
      if (active) await load(active.attemptId); else setView(null)
    } catch (error) { fail(error) }
  }, [fail, load])

  useEffect(() => { void home() }, [home])

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setMessage(null)
    try { await action() } catch (error) {
      fail(error)
      if (view && (error as SimulationError).code !== 'NETWORK') { try { await load(view.attemptId) } catch { /* keep message */ } }
    } finally { setBusy(false) }
  }

  // Only the open section's clock runs; at zero, or while grading, read the authoritative state.
  const remaining = (clock: SimulationView['sections'][number]) =>
    Math.max(0, clock.remainingSeconds - (clock.isOpen ? (performance.now() - syncedAt) / 1000 : 0))
  useEffect(() => {
    if (!view || !['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'].includes(view.state)) return
    const timer = window.setInterval(() => {
      setTick((value) => value + 1)
      const due = view.state === 'IN_PROGRESS' && view.sections.some((clock) => clock.isOpen && remaining(clock) <= 0)
      if ((due || view.state !== 'IN_PROGRESS') && !busy) void load(view.attemptId).catch(fail)
    }, view.state === 'IN_PROGRESS' ? 1000 : 2000)
    return () => window.clearInterval(timer)
  })

  const slots = useMemo(() => view?.slots.filter((slot) => slot.sectionId === section) ?? [], [view, section])
  const answers = useMemo(() => new Map((view?.answers ?? []).map((item) => [item.slotId, toAnswerValue(item.slotId, item.value, item.revision)])), [view])

  if (offers === null && !view) return <main className="flex-1 px-8 py-16 text-sm text-ink-secondary" role="status">Đang tải bài thi thử…</main>

  if (!view) {
    return (
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[176px_1fr]">
        <div className="hidden lg:block notebook-margin-lg px-5 py-10 text-xs font-semibold text-ink-secondary">Trang 02 · Thi thử</div>
        <section className="px-5 py-8 sm:px-10 sm:py-12 max-w-[900px]" data-testid="simulation-home">
          <p className="text-xs font-semibold text-pen-red uppercase tracking-wide">Giả lập đủ thời lượng</p>
          <h1 tabIndex={-1} className="mt-2 font-display text-[32px] sm:text-[44px] leading-[1.1] font-semibold">Thi thử đầy đủ — 100 câu, 3 đồng hồ</h1>
          <p className="mt-3 text-[15px] leading-[1.68] text-ink-secondary max-w-[62ch]">Mỗi phần thi có đồng hồ riêng; chỉ phần đang mở mới tính giờ. Bạn được quay lại phần khác khi đồng hồ phần đó còn thời gian; hết giờ thì phần đó chỉ còn xem lại.</p>
          <div className="mt-6"><DemoNoticePanel /></div>
          {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
          <table className="mt-8 w-full text-sm border-t border-ink">
            <tbody className="divide-y divide-rule">
              {SECTION_PLAN.map(([id, count, minutes], position) => (
                <tr key={id}><td className="py-3 font-semibold">{position + 1}. {SECTION_NAMES[id]}</td>
                  <td className="py-3 text-right tabular-figures text-ink-secondary">{count} câu · {minutes} phút</td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 flex flex-wrap gap-3">
            {offers?.map((offer) => (
              <button key={offer.blueprintVersionId} type="button" className={buttonClass.ink} disabled={busy} data-testid="simulation-create"
                onClick={() => run(async () => { const receipt = await simulationApi.create(offer.blueprintVersionId); await load(receipt.attemptId) })}>
                Giữ chỗ bài thi thử (100 câu) <IconArrowRight />
              </button>
            ))}
            {offers?.length === 0 && <p className="text-sm text-ink-secondary" data-testid="simulation-empty">Hiện chưa có bài thi thử đầy đủ nào được mở.</p>}
          </div>
          {history.some((item) => item.state === 'GRADED') && (
            <div className="mt-10">
              <h2 className="font-display text-xl font-semibold">Bài đã làm</h2>
              <ul className="mt-2 divide-y divide-rule border-t border-rule">
                {history.filter((item) => item.state === 'GRADED').map((item) => (
                  <li key={item.attemptId} className="flex justify-between items-center py-2 text-sm">
                    <span className="tabular-figures">{item.score ? `${item.score.correctCount}/100 câu đúng` : 'Đã chấm'}</span>
                    <button type="button" className={buttonClass.secondary} onClick={() => run(() => load(item.attemptId))}>Xem kết quả</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    )
  }

  if (view.state === 'CREATED') {
    return (
      <main className="flex-1 px-5 py-10 sm:px-10 max-w-[760px]">
        <h1 tabIndex={-1} className="font-display text-[34px] font-semibold">Bài thi thử đã được giữ</h1>
        <p className="mt-3 text-sm text-ink-secondary">Đồng hồ phần Toán học bắt đầu khi bạn bấm “Bắt đầu”.</p>
        {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
        <button type="button" className={`${buttonClass.primary} mt-8`} disabled={busy} data-testid="demo-start"
          onClick={() => run(async () => { await simulationApi.start(view.attemptId); await load(view.attemptId) })}>Bắt đầu bài thi thử</button>
      </main>
    )
  }

  if (view.state === 'GRADED' && result) {
    return (
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr]" data-testid="result">
        <aside className="notebook-margin-lg px-5 py-8 border-b lg:border-b-0 border-rule">
          <p className="text-xs font-bold text-pen-red uppercase tracking-wide">Tổng số câu đúng</p>
          <p className="mt-2 tabular-figures text-pen-red leading-none" data-testid="result-score"><span className="text-[60px] font-bold">{result.correctCount}</span><span className="text-xl font-semibold"> /{result.totalCount}</span></p>
          <table className="mt-5 w-full text-sm border-t-2 border-pen-red">
            <tbody className="divide-y divide-rule">
              {result.sections.map((item) => (
                <tr key={item.sectionId} data-testid={`result-${item.sectionId}`}>
                  <td className="py-2">{SECTION_NAMES[item.sectionId]}</td>
                  <td className="py-2 text-right tabular-figures font-bold text-pen-red">{item.correctCount}/{item.totalCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className={`${buttonClass.secondary} mt-6 w-full`} data-testid="simulation-home-button"
            onClick={() => { setView(null); setResult(null); void home() }}><IconArrowLeft /> Về trang thi thử</button>
        </aside>
        <section className="px-5 py-8 sm:px-10 max-w-[900px]">
          <p className="text-xs font-semibold text-ink-secondary">Kết quả thi thử</p>
          <h1 tabIndex={-1} className="mt-1 font-display text-[32px] sm:text-[40px] font-semibold leading-tight">Phiếu chấm bút đỏ</h1>
          <p className="mt-2 text-sm text-ink-secondary max-w-[62ch]">Số câu đúng theo từng phần và tổng 100 câu, chấm đúng/sai từng câu. Đây là luyện tập không chính thức, không phải điểm TSA và không quy đổi sang thang điểm nào.</p>
          <div className="mt-5"><DemoNoticePanel /></div>
        </section>
      </main>
    )
  }

  if (view.state !== 'IN_PROGRESS') {
    return (
      <main className="flex-1 px-5 py-16 sm:px-10 max-w-[760px]" data-testid="attempt-grading">
        <h1 tabIndex={-1} className="font-display text-[30px] font-semibold">{['SUBMITTED', 'EXPIRED'].includes(view.state) ? 'Đang chấm bài thi thử…' : 'Bài thi thử đã khép lại'}</h1>
        <p className="mt-3 text-sm text-ink-secondary" role="status">Câu trả lời đã được máy chủ ghi nhận. Trang sẽ tự cập nhật khi có kết quả.</p>
        {message && <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
      </main>
    )
  }

  const clock = view.sections.find((item) => item.sectionId === section)!
  const locked = clock.isLocked || remaining(clock) <= 0
  const position = Math.min(index, Math.max(0, slots.length - 1))
  const slot = slots[position]
  const answeredTotal = view.slots.filter((item) => isAnswered(item, answers.get(item.slotId))).length
  const layout = testLayout(panel.open, Boolean(slot?.stimulus?.content?.length))

  const switchTo = (target: SectionId) => run(async () => {
    const targetClock = view.sections.find((item) => item.sectionId === target)!
    if (!targetClock.isLocked && !targetClock.isOpen) await simulationApi.switchSection(view.attemptId, target)
    setSection(target); setIndex(0)
    await load(view.attemptId)
  })

  const save = async (input: unknown) => {
    if (!slot) return false
    let ok = false
    await run(async () => {
      const prior = view.answers.find((item) => item.slotId === slot.slotId)
      await simulationApi.save(view.attemptId, slot.slotId, prior?.revision ?? 0, toRawValue(slot, input))
      await load(view.attemptId)
      ok = true
    })
    return ok
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="attempt-workspace">
      <div className="sticky top-0 z-30 bg-paper">
      <header className="border-b border-ink px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base sm:text-lg font-semibold">Thi thử đầy đủ</p>
          <p className="text-xs text-ink-secondary tabular-figures">Đã làm {answeredTotal}/100 · Luyện tập không chính thức</p>
        </div>
        <div className="flex items-center gap-2">
          <PanelToggle open={panel.open} onToggle={panel.toggle} />
          <button type="button" className={`${buttonClass.primary} min-h-[40px]`} disabled={busy} data-testid="submit-open"
            onClick={() => submitDialog.current?.showModal()}>Nộp cả bài</button>
        </div>
      </header>

      <nav role="tablist" aria-label="Các phần thi" className="grid grid-cols-3 gap-2 px-4 sm:px-6 py-2 sm:py-3 border-b border-rule bg-paper">
        {view.sections.map((item) => {
          const selected = item.sectionId === section
          const time = remaining(item)
          const status = item.isLocked || time <= 0 ? 'Hết giờ · chỉ xem' : item.isOpen ? 'Đang tính giờ' : item.firstOpenedAt ? 'Tạm dừng' : 'Chưa mở'
          return (
            <button key={item.sectionId} type="button" role="tab" aria-selected={selected} disabled={busy}
              data-testid={`section-${item.sectionId}`} onClick={() => !selected && switchTo(item.sectionId)}
              className={`text-left px-3 py-2 border border-t-[3px] rounded-[3px] cursor-pointer min-w-0 ${
                selected ? 'border-pen-red bg-pen-red-wash' : 'border-rule-strong border-t-rule-strong bg-paper-sheet hover:border-ink'}`}>
              <span className="block text-xs font-semibold truncate">{SECTION_NAMES[item.sectionId]}</span>
              <span className={`block tabular-figures text-lg sm:text-2xl font-bold ${item.isOpen && time <= 300 ? 'text-pen-red' : 'text-ink'}`}>{formatClockMMSS(time)}</span>
              <span className="hidden sm:flex items-center gap-1 text-[11px] text-ink-secondary">{(item.isLocked || time <= 0) && <IconLock size={11} />}{status}</span>
            </button>
          )
        })}
      </nav>
      </div>

      <div className={layout.body}>
        <main className="question-oly-surface min-w-0" role="tabpanel" aria-label={SECTION_NAMES[section]}>
          <div className={`mx-auto px-4 sm:px-8 py-5 ${layout.width}`}>
            {message && <div className="mb-4"><Notice tone={message.tone} testId="simulation-notice">{message.text}</Notice></div>}
            {locked && <div className="mb-4"><Notice tone="info">Phần thi này đã hết giờ. Bạn chỉ xem lại được, không sửa câu trả lời.</Notice></div>}
            {slot && (
              <div className={slot.stimulus?.content?.length ? layout.split : ''}>
                {slot.stimulus?.content?.length ? (
                  <section aria-label="Đoạn văn" className={`bg-paper-sheet border border-rule-strong rounded-[3px] p-5 ${panel.open
                    ? 'xl:sticky xl:top-4 xl:max-h-[calc(100dvh-220px)] xl:overflow-y-auto'
                    : 'lg:sticky lg:top-4 lg:max-h-[calc(100dvh-220px)] lg:overflow-y-auto'}`}>
                    <ContentBlocks blocks={slot.stimulus.content} attemptId={view.attemptId} apiVersion="v3" className="text-[15px] leading-[1.75]" />
                  </section>
                ) : null}
                <article className="flex min-w-0">
                  <div className="w-10 sm:w-12 shrink-0 notebook-margin-double pt-1 text-center tabular-figures text-xs font-bold">C.{String(position + 1).padStart(2, '0')}</div>
                  <div className="flex-1 min-w-0 pl-4 sm:pl-6">
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-rule">
                      <p className="text-sm text-ink-secondary"><span className="tabular-figures font-semibold text-ink">{position + 1}/{slots.length}</span> · {KIND_LABELS[slot.interaction.type]}</p>
                      <FlagMark attemptId={view.attemptId} slotId={slot.slotId} render={(flagged, toggle) => (
                        <button type="button" aria-pressed={flagged} onClick={toggle} className={`inline-flex items-center gap-2 px-3 min-h-[40px] text-xs font-semibold border rounded-[3px] cursor-pointer ${flagged ? 'border-ochre bg-ochre-wash' : 'border-rule-strong bg-paper-sheet text-ink-secondary'}`}>
                          <IconFlag size={13} /> {flagged ? 'Đã đánh dấu' : 'Đánh dấu'}
                        </button>
                      )} />
                    </div>
                    <section id="question-title" tabIndex={-1} aria-label={`Câu ${position + 1}`} className="mt-5 text-[17px] font-semibold leading-[1.6]">
                      <ContentBlocks blocks={slot.content} attemptId={view.attemptId} apiVersion="v3" />
                    </section>
                    <div className="mt-5">
                      <AnswerControl key={slot.slotId} slot={slot} saved={answers.get(slot.slotId)} disabled={busy || locked}
                        attemptId={view.attemptId} apiVersion="v3" onSave={save} />
                    </div>
                    <p className="mt-4 tabular-figures text-xs text-ink-secondary" role="status" data-testid="save-status">
                      {busy ? 'Đang lưu…' : isAnswered(slot, answers.get(slot.slotId)) ? 'Đã lưu' : 'Chưa có câu trả lời được lưu'}
                    </p>
                  </div>
                </article>
              </div>
            )}
          </div>
        </main>
        <aside className={`border-t lg:border-t-0 lg:border-l border-ink bg-paper px-4 py-5 ${layout.aside}`} aria-label="Bảng câu hỏi của phần">
          <p className="text-sm font-semibold">{SECTION_NAMES[section]}</p>
          <ol className="mt-3 grid grid-cols-8 lg:grid-cols-5 gap-1.5">
            {slots.map((item, itemIndex) => {
              const done = isAnswered(item, answers.get(item.slotId))
              return (
                <li key={item.slotId}>
                  <button type="button" onClick={() => setIndex(itemIndex)} aria-current={itemIndex === position ? 'step' : undefined}
                    aria-label={`Câu ${itemIndex + 1}${done ? ', đã làm' : ''}`}
                    className={`w-full aspect-square min-h-[34px] tabular-figures text-[11px] font-bold border rounded-[2px] cursor-pointer ${done ? 'bg-ink text-paper-sheet border-ink' : 'bg-paper-sheet border-rule-strong'} ${itemIndex === position ? 'outline-2 outline-pen-red outline-offset-1' : ''}`}>
                    {String(itemIndex + 1).padStart(2, '0')}
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>
      </div>

      <footer className="sticky bottom-0 z-20 bg-paper border-t border-ink flex items-center justify-between gap-2 px-4 sm:px-6 py-2.5">
        <button type="button" className={buttonClass.secondary} disabled={position === 0} onClick={() => setIndex(position - 1)} data-testid="question-previous"><IconArrowLeft /> Câu trước</button>
        <span className="tabular-figures text-sm font-semibold">{position + 1} / {slots.length}</span>
        <button type="button" className={buttonClass.secondary} disabled={position >= slots.length - 1} onClick={() => setIndex(position + 1)} data-testid="question-next">Câu sau <IconArrowRight /></button>
      </footer>

      <dialog ref={submitDialog} aria-labelledby="sim-submit-title" className="m-auto w-[min(440px,calc(100%-32px))] p-6 bg-paper-sheet border border-ink rounded-[4px] backdrop:bg-ink/45">
        <h2 id="sim-submit-title" className="font-display text-2xl font-semibold">Nộp cả 100 câu?</h2>
        <p className="mt-2 text-sm text-ink-secondary">Bạn đã làm <span className="tabular-figures font-semibold text-ink">{answeredTotal}/100</span> câu. Sau khi nộp, mọi phần thi đều khóa và không sửa được.</p>
        <div className="mt-5 grid gap-2">
          <button type="button" className={buttonClass.primary} disabled={busy} data-testid="submit-confirm"
            onClick={() => run(async () => { await simulationApi.submit(view.attemptId); submitDialog.current?.close(); await load(view.attemptId) })}>Xác nhận nộp</button>
          <button type="button" className={buttonClass.secondary} onClick={() => submitDialog.current?.close()}>Tiếp tục làm</button>
        </div>
      </dialog>
    </div>
  )
}
