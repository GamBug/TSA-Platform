import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createChat, deleteChat, loadAgents, loadChat, loadChats, publishBatch, retryChat, reviewDrafts, SECTION_NAMES, SECTIONS, sendChat, stopChat,
  studioFileUrl, updateChat,
  type AgentProvider, type AgentSetting, type BatchQuestion, type DraftReview, type Overview, type Review, type Section, type StudioBatch, type StudioMessage,
  type StudioSession, type StudioSettings, type StudioSummary,
} from '@/api/admin'
import { ContentBlocks } from '@/content/ContentBlocks'
import { buttonClass, Notice } from '@/ui/Shell'
import type { ContentBlock } from '@/api/types'

// The AI studio: a chat with a writer agent for TSA questions. The server checks, repairs and AI-reviews each batch;
// the owner publishes it with one click (or the chat's auto-publish switch does).

const inputClass = 'min-h-[40px] px-2 text-sm bg-paper-sheet text-ink border border-rule-strong rounded-[3px] focus:border-ink'
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 24 * 1024 * 1024
const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.csv,.json'
const IDEAS: Record<Section, string[]> = {
  MATH: ['10 câu Toán mức TSA: hàm số, xác suất, hình học không gian (4 dễ, 3 vừa, 3 khó)', '5 câu khó về tối ưu hóa trong thực tế, có số liệu', 'Chuyển các câu trong ảnh đính kèm thành câu hỏi (giữ nguyên đề và đáp án)'],
  READING: ['1 bài đọc 900 từ về năng lượng tái tạo, 10 câu hỏi', '1 bài đọc 500 từ về y học, 5 câu: suy luận, đánh giá lập luận', 'Chép bài đọc trong ảnh đính kèm cùng các câu hỏi của nó'],
  SCIENCE: ['2 tình huống thí nghiệm (Vật lý, Sinh học), mỗi tình huống 5 câu, có bảng số liệu', '1 tình huống Hóa học về cân bằng, 5 câu, mức khó', 'Chép các câu Khoa học trong PDF đính kèm'],
}

const messageOf = (error: unknown) => (error as Error)?.message || 'The request did not complete.'

/** The writer's report with its light Markdown shown as text: **bold**, `code` and [label](https://link). No HTML is read. */
function ReportText({ text }: { text: string }) {
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g
  const parts: React.ReactNode[] = []
  let last = 0, key = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push(text.slice(last, match.index))
    if (match[1] !== undefined) parts.push(<strong key={key++}>{match[1]}</strong>)
    else if (match[2] !== undefined) parts.push(<code key={key++} className="font-mono text-[12px] bg-paper-recessed px-1 rounded-[2px]">{match[2]}</code>)
    else parts.push(<a key={key++} href={match[4]} target="_blank" rel="noreferrer noopener" className="underline">{match[3]}</a>)
    last = match.index! + match[0].length
  }
  parts.push(text.slice(last))
  return <>{parts}</>
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

/** Exchange-format blocks (what the writer produced) as the student renderer's blocks; figures point at the studio. */
function toBlocks(blocks: any[] | undefined, figure: (key: string) => string | null): ContentBlock[] {
  return (blocks ?? []).map((block): ContentBlock | null => {
    if (block?.type === 'text') return { type: 'text', text: String(block.content ?? '') }
    if (block?.type === 'math') return { type: 'math', tex: String(block.content ?? ''), display: block.display === true }
    if (block?.type === 'table') return { type: 'table', caption: block.caption, headers: block.headers, rows: block.rows }
    if (block?.type === 'image_request') {
      const url = figure(block.request_id)
      return url ? { type: 'image', assetVersionId: url, alt: block.alt ?? '', caption: block.request_id } : { type: 'text', text: `[Figure missing: ${block.description ?? block.request_id}]` }
    }
    return null
  }).filter((block): block is ContentBlock => block !== null)
}

function Verdict({ review }: { review: Review | null | undefined }) {
  if (!review) return <span className="text-[11px] px-1.5 py-0.5 rounded-[3px] border border-rule text-ink-secondary">not reviewed</span>
  const tone = review.verdict === 'PASS' ? 'border-ink-green text-ink-green bg-ink-green-wash' : 'border-pen-red text-pen-red bg-pen-red-wash'
  return <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] border ${tone}`} data-testid="studio-verdict">{review.verdict === 'PASS' ? 'AI-checked ✓' : review.verdict}</span>
}

// ---------------------------------------------------------------- agent pickers

function AgentPicker({ label, value, providers, allowNone, onChange, testId }: {
  label: string; value: AgentSetting | null; providers: AgentProvider[]; allowNone?: boolean; onChange: (value: AgentSetting | null) => void; testId: string
}) {
  const available = providers.filter((provider) => provider.available)
  const current = available.find((provider) => provider.id === value?.provider) ?? null
  const model = current?.models.find((item) => item.id === value?.model) ?? null
  const efforts = model?.efforts?.length ? model.efforts : current?.models[0]?.efforts ?? []
  return (
    <fieldset className="grid gap-1.5 border border-rule rounded-[3px] p-2" data-testid={testId}>
      <legend className="text-xs font-semibold px-1">{label}</legend>
      <select className={inputClass} aria-label={`${label} agent`} value={current?.id ?? ''} onChange={(event) => {
        const id = event.target.value
        onChange(id ? { provider: id, model: '', effort: '' } : null)
      }}>
        {allowNone && <option value="">No AI review</option>}
        {!current && !allowNone && <option value="">Choose…</option>}
        {available.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
      </select>
      {current && current.models.length > 0 && (
        <select className={inputClass} aria-label={`${label} model`} value={value?.model ?? ''} onChange={(event) => onChange({ ...value!, model: event.target.value, effort: '' })}>
          <option value="">Default model</option>
          {current.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      )}
      {current && efforts.length > 0 && (
        <select className={inputClass} aria-label={`${label} effort`} value={value?.effort ?? ''} onChange={(event) => onChange({ ...value!, effort: event.target.value })}>
          <option value="">Default effort</option>
          {efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
        </select>
      )}
      {current?.note && <p className="text-[11px] text-ink-secondary">{current.note}</p>}
    </fieldset>
  )
}

function SettingsPanel({ settings, providers, disabled, onChange }: {
  settings: StudioSettings; providers: AgentProvider[]; disabled: boolean; onChange: (settings: Partial<StudioSettings>) => void
}) {
  const toggle = (key: 'web' | 'bankExamples' | 'autoPublish', text: string, hint: string) => (
    <label className="flex gap-2 items-start text-sm cursor-pointer">
      <input type="checkbox" className="mt-1" checked={settings[key]} disabled={disabled} onChange={(event) => onChange({ [key]: event.target.checked })} data-testid={`studio-${key}`} />
      <span><span className="font-semibold">{text}</span><span className="block text-[11px] text-ink-secondary">{hint}</span></span>
    </label>
  )
  return (
    <div className={`grid gap-3 ${disabled ? 'opacity-70' : ''}`} data-testid="studio-settings">
      <label className="grid gap-1 text-xs font-semibold">Subject
        <select className={inputClass} value={settings.section} disabled={disabled} onChange={(event) => onChange({ section: event.target.value as Section })} data-testid="studio-section">
          {SECTIONS.map((section) => <option key={section} value={section}>{SECTION_NAMES[section]}</option>)}
        </select>
      </label>
      <AgentPicker label="Writer" value={settings.writer} providers={providers} onChange={(writer) => onChange({ writer })} testId="studio-writer" />
      <AgentPicker label="Reviewer" value={settings.reviewer} providers={providers} allowNone onChange={(reviewer) => onChange({ reviewer })} testId="studio-reviewer" />
      {settings.reviewer && settings.writer && settings.reviewer.provider === settings.writer.provider && (
        <p className="text-[11px] text-ink-secondary">Tip: a different agent as reviewer catches more mistakes.</p>
      )}
      {toggle('web', 'Web research', 'The writer searches the web for TSA style and checks facts.')}
      {toggle('bankExamples', 'Learn from the Bank', 'The writer sees matching real questions from the Bank as style examples.')}
      {toggle('autoPublish', 'Auto-publish', 'Publish a batch as soon as every question passes the checks and the AI review. Off: you press Publish.')}
    </div>
  )
}

// ---------------------------------------------------------------- batch view

function QuestionView({ question, figure }: { question: any; figure: (owner: string, request: string) => string | null }) {
  const blocks = (value: any[] | undefined) => <ContentBlocks blocks={toBlocks(value, (request) => figure(question.question_id, request))} attemptId="" apiVersion="v1" imageSource={(url) => url} />
  const answer = question.answer ?? {}
  const correct = new Set<string>(answer.option_id ? [answer.option_id] : answer.option_ids ?? [])
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 text-sm min-w-0">
      <div className="leading-relaxed">{blocks(question.content_blocks)}</div>
      {Array.isArray(question.options) && (
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {question.options.map((option: any) => (
            <li key={option.option_id} className={`flex gap-2 border rounded-[3px] px-2 py-1 ${correct.has(option.option_id) ? 'border-ink-green bg-ink-green-wash' : 'border-rule'}`}>
              <span className="font-semibold">{option.option_id}{correct.has(option.option_id) ? ' ✓' : ''}</span>
              <div className="min-w-0 flex-1">{blocks(option.content_blocks)}</div>
            </li>
          ))}
        </ol>
      )}
      {Array.isArray(question.response_config?.statements) && (
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {question.response_config.statements.map((statement: any) => {
            const value = answer.values?.[statement.statement_id]
            return (
              <li key={statement.statement_id} className="flex gap-2 border border-rule rounded-[3px] px-2 py-1">
                <span className="font-semibold">{statement.statement_id}</span>
                <div className="min-w-0 flex-1">{blocks(statement.content_blocks)}</div>
                <span className={`font-semibold ${value ? 'text-ink-green' : 'text-pen-red'}`}>{value ? 'Đúng' : 'Sai'}</span>
              </li>
            )
          })}
        </ol>
      )}
      {Array.isArray(question.explanation) && question.explanation.length > 0 && (
        <div className="text-[13px] bg-paper-recessed border border-rule rounded-[3px] p-2"><span className="font-semibold">Lời giải. </span>{blocks(question.explanation)}</div>
      )}
    </div>
  )
}

function BatchCard({ session, message, busy, onPublish }: { session: StudioSession; message: StudioMessage; busy: boolean; onPublish: (draftsOnly: boolean) => void }) {
  const batch = message.batch as StudioBatch
  const [open, setOpen] = useState<string | null>(null)
  const figureFile = (owner: string, request: string) => {
    const name = batch.figures.find((file) => file.replace(/\.[a-z]+$/i, '') === `${owner}_${request}`)
    return name ? studioFileUrl(session.id, 'figure', batch.messageId, name) : null
  }
  const byId = useMemo(() => new Map((batch.document?.questions ?? []).map((question: any) => [question.question_id, question])), [batch])
  const passages = new Map((batch.document?.passages ?? []).map((passage: any) => [passage.passage_id, passage]))
  const passed = batch.questions.filter((question) => question.review?.verdict === 'PASS').length
  const groups: { passage: string | null; questions: BatchQuestion[] }[] = []
  for (const question of batch.questions) {
    const last = groups.at(-1)
    if (last && last.passage === question.passageRef) last.questions.push(question)
    else groups.push({ passage: question.passageRef, questions: [question] })
  }
  const status = { READY: 'Ready', SAVED: 'Saved as drafts', PUBLISHED: `Published · ${batch.publishedCount ?? batch.questions.length} question(s)`, REPLACED: 'Replaced by a newer version' }[batch.status]
  return (
    <div className="mt-2 min-w-0 border border-rule-strong rounded-[3px] bg-paper-sheet" data-testid="studio-batch" data-status={batch.status}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-rule">
        <span className="font-mono text-xs">{batch.batchId}</span>
        <span className="text-xs text-ink-secondary">{batch.kind === 'TRANSCRIBE' ? 'transcription' : 'new questions'} · {batch.questions.length} question(s){Object.keys(batch.passages).length ? ` in ${Object.keys(batch.passages).length} passage(s)` : ''}</span>
        <span className="text-xs text-ink-secondary">· {batch.reviewed ? `${passed}/${batch.questions.length} AI-checked` : 'not AI-reviewed'}{batch.rounds ? ` · ${batch.rounds} automatic fix round(s)` : ''}</span>
        <span className={`ml-auto text-xs font-semibold ${batch.status === 'PUBLISHED' ? 'text-ink-green' : ''}`} data-testid="studio-batch-status">{status}</span>
      </div>
      {batch.reviewNote && <div className="px-3 pt-2"><Notice tone="info">{batch.reviewNote}</Notice></div>}
      {batch.autoNote && <div className="px-3 pt-2"><Notice tone="info">{batch.autoNote}</Notice></div>}
      {batch.dropped.length > 0 && (
        <details className="px-3 pt-2 text-xs">
          <summary className="cursor-pointer text-pen-red">{batch.dropped.length} question(s) were dropped because they could not be fixed</summary>
          <ul className="mt-1 grid gap-1">{batch.dropped.map((item) => <li key={item.id}><span className="font-mono">{item.id}</span>: {item.reason}</li>)}</ul>
        </details>
      )}
      <div className="px-3 py-2 grid grid-cols-[minmax(0,1fr)] gap-3">
        {groups.map((group, index) => (
          <div key={`${group.passage}-${index}`} className={`min-w-0 ${group.passage ? 'border-l-[3px] border-l-ochre pl-3' : ''}`}>
            {group.passage && (
              <details className="mb-1">
                <summary className="cursor-pointer text-sm font-semibold">{batch.passages[group.passage]?.title || 'Passage'} <span className="font-normal text-xs text-ink-secondary">· {batch.passages[group.passage]?.words ?? 0} words · {group.questions.length} question(s)</span></summary>
                <div className="mt-2 text-[14px] leading-relaxed max-h-[420px] overflow-y-auto">
                  <ContentBlocks blocks={toBlocks(passages.get(group.passage)?.content_blocks, (request) => figureFile(group.passage!, request))} attemptId="" apiVersion="v1" imageSource={(url) => url} />
                </div>
              </details>
            )}
            <ol className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {group.questions.map((question) => (
                <li key={question.id} className="min-w-0 border border-rule rounded-[3px]">
                  <button type="button" className="w-full text-left flex flex-wrap items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-paper-recessed" onClick={() => setOpen(open === question.id ? null : question.id)}>
                    <span className="font-mono text-[11px]">{question.id.split('-').at(-1)}</span>
                    <span className="text-[11px] text-ink-secondary">{question.type.replace(/_/g, ' ').toLowerCase()} · {(question.difficulty ?? '').toLowerCase()}</span>
                    <span className="text-sm flex-1 min-w-[12rem] truncate">{question.preview}</span>
                    <Verdict review={question.review} />
                  </button>
                  {open === question.id && byId.get(question.id) && (
                    <div className="px-3 pb-3 pt-1 border-t border-rule grid gap-2">
                      <QuestionView question={byId.get(question.id)} figure={figureFile} />
                      {question.review && (question.review.issues.length > 0 || question.review.myAnswer) && (
                        <p className="text-xs text-ink-secondary">Reviewer ({question.review.reviewer}){question.review.myAnswer ? `, solved: ${question.review.myAnswer}` : ''}{question.review.issues.length ? ` — ${question.review.issues.join(' ')}` : ''}</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {(batch.status === 'READY' || batch.status === 'SAVED') && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-rule">
          <button type="button" className={buttonClass.primary} disabled={busy} onClick={() => onPublish(false)} data-testid="studio-publish">
            Publish {batch.questions.length} question(s)
          </button>
          {batch.status === 'READY' && <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => onPublish(true)} data-testid="studio-save-drafts">Save as drafts only</button>}
          <span className="text-[11px] text-ink-secondary">{batch.reviewed && passed === batch.questions.length ? 'Every question passed the checks and the AI review.' : 'Check the questions not marked AI-checked before publishing.'}</span>
        </div>
      )}
      {batch.status === 'PUBLISHED' && (
        <p className="px-3 py-2 border-t border-rule text-xs text-ink-secondary">In the Bank now. Students on this computer see them after the demo restarts; the live site after the Bank is uploaded (bash infra/server/upload-bank.sh).{batch.heldBack?.length ? ` ${batch.heldBack.length} question(s) stay drafts because they copy a question already in the Bank.` : ''}</p>
      )}
    </div>
  )
}

function DraftReviewCard({ review, busy, onPublish }: { review: DraftReview; busy: boolean; onPublish: () => void }) {
  const passed = review.items.filter((item) => item.review?.verdict === 'PASS').length
  return (
    <div className="mt-2 border border-rule-strong rounded-[3px] bg-paper-sheet" data-testid="studio-draft-review">
      <div className="px-3 py-2 border-b border-rule text-xs">{SECTION_NAMES[review.section]} drafts · {passed}/{review.items.length} passed{review.status === 'PUBLISHED' ? ` · published ${review.publishedCount}` : ''}</div>
      <ol className="px-3 py-2 grid grid-cols-[minmax(0,1fr)] gap-1">
        {review.items.map((item) => (
          <li key={item.versionId} className="flex flex-wrap items-start gap-2 text-sm border-b border-rule last:border-b-0 py-1">
            <span className="font-mono text-[11px] pt-0.5">{item.displayId}</span>
            <span className="flex-1 min-w-[12rem]">{item.preview}{item.review?.issues?.length ? <span className="block text-xs text-ink-secondary">{item.review.issues.join(' ')}</span> : null}</span>
            <Verdict review={item.review} />
          </li>
        ))}
      </ol>
      {review.status === 'READY' && passed > 0 && (
        <div className="px-3 py-2 border-t border-rule"><button type="button" className={buttonClass.primary} disabled={busy} onClick={onPublish}>Publish the passed passages</button></div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- messages

function MessageItem({ session, message, busy, onAction }: {
  session: StudioSession; message: StudioMessage; busy: boolean; onAction: (action: string, message: StudioMessage, draftsOnly?: boolean) => void
}) {
  if (message.role === 'user') {
    return (
      <li className="self-end max-w-[85%] bg-ink text-paper-sheet rounded-[6px] px-3 py-2" data-testid="studio-user-message">
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{message.text}</p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => attachment.kind === 'image'
              ? <img key={attachment.name} src={studioFileUrl(session.id, 'attachment', message.id, attachment.name)} alt={attachment.name} className="h-16 rounded-[3px] border border-paper-sheet/40" />
              : <span key={attachment.name} className="text-[11px] px-2 py-1 rounded-[3px] bg-paper-sheet/15">{attachment.name}</span>)}
          </div>
        )}
      </li>
    )
  }
  if (message.role === 'notice') {
    return (
      <li className="min-w-0 max-w-[90%] self-start [overflow-wrap:anywhere]" data-testid="studio-notice">
        <Notice tone={message.tone === 'error' ? 'error' : 'info'}>
          <span className="whitespace-pre-wrap">{message.text}</span>
          {message.actions && message.actions.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-2">
              {message.actions.includes('retry') && <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => onAction('retry', message)}>Try again</button>}
              {message.actions.includes('fix') && message.fix && <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => onAction('fix', message)}>Let the writer fix it</button>}
              {message.actions.includes('publish') && message.messageId && <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => onAction('publish', message)}>Publish again</button>}
              {message.actions.includes('settings') && <button type="button" className={buttonClass.secondary} onClick={() => onAction('settings', message)}>Choose another agent</button>}
            </span>
          )}
        </Notice>
      </li>
    )
  }
  return (
    <li className="w-full min-w-0 max-w-[95%] self-start" data-testid="studio-assistant-message">
      <p className="text-[11px] text-ink-secondary mb-1">{message.author ?? 'AI'}</p>
      {message.text && <div className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm bg-paper-sheet border border-rule rounded-[6px] px-3 py-2"><ReportText text={message.text} /></div>}
      {message.batch && <BatchCard session={session} message={message} busy={busy} onPublish={(draftsOnly) => onAction('publish-batch', message, draftsOnly)} />}
      {message.draftReview && <DraftReviewCard review={message.draftReview} busy={busy} onPublish={() => onAction('publish-batch', message)} />}
    </li>
  )
}

function TurnStatus({ session, onStop }: { session: StudioSession; onStop: () => void }) {
  const [, tick] = useState(0)
  useEffect(() => { const timer = setInterval(() => tick((value) => value + 1), 1000); return () => clearInterval(timer) }, [])
  const turn = session.turn!
  const seconds = Math.max(0, Math.round((Date.now() - new Date(turn.startedAt).getTime()) / 1000))
  return (
    <li className="max-w-[95%] border border-rule rounded-[6px] bg-paper-recessed px-3 py-2" role="status" data-testid="studio-working">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-ochre animate-pulse" aria-hidden="true" />
        <span className="flex-1">{turn.note}</span>
        <span className="text-xs tabular-figures text-ink-secondary">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
        <button type="button" className={buttonClass.secondary} onClick={onStop} data-testid="studio-stop">Stop</button>
      </div>
      {turn.steps.length > 1 && (
        <details className="mt-1 text-xs text-ink-secondary"><summary className="cursor-pointer">Steps</summary>
          <ol className="mt-1 grid gap-0.5">{turn.steps.map((step, index) => <li key={index}>{new Date(step.at).toLocaleTimeString()} · {step.note}</li>)}</ol>
        </details>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- the studio

export function AiStudio({ overview, onError, onBankChanged }: { overview: Overview; onError: (error: unknown) => void; onBankChanged: () => Promise<void> }) {
  const [providers, setProviders] = useState<AgentProvider[] | null>(null)
  const [chats, setChats] = useState<StudioSummary[]>([])
  const [session, setSession] = useState<StudioSession | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showSettings, setShowSettings] = useState(true)
  const [draftLimit, setDraftLimit] = useState(20)
  const listRef = useRef<HTMLOListElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const wasWorking = useRef(false)

  const refreshChats = useCallback(async () => { try { setChats(await loadChats()) } catch (failure) { onError(failure) } }, [onError])
  useEffect(() => {
    loadAgents().then(setProviders, onError)
    loadChats().then(async (list) => {
      setChats(list)
      if (list[0]) setSession(await loadChat(list[0].id))
    }, onError)
  }, [onError])

  // While a chat works, read it every 1.5 s; when it stops, the Bank may have changed.
  useEffect(() => {
    if (!session?.turn) {
      if (wasWorking.current) { wasWorking.current = false; void onBankChanged(); void refreshChats() }
      return
    }
    wasWorking.current = true
    const timer = setTimeout(() => { loadChat(session.id).then(setSession, () => {}) }, 1500)
    return () => clearTimeout(timer)
  }, [session, onBankChanged, refreshChats])

  useEffect(() => { listRef.current?.lastElementChild?.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'smooth' }) }, [session?.messages.length, session?.turn?.note])

  const act = async (work: () => Promise<StudioSession | void>) => {
    setProblem(null)
    try { const next = await work(); if (next) setSession(next); void refreshChats() } catch (failure) { setProblem(messageOf(failure)) }
  }

  const newChat = (section?: Section) => act(async () => createChat({ section: section ?? session?.settings.section ?? 'MATH' }))
  const changeSettings = (patch: Partial<StudioSettings>) => {
    if (!session) return
    setSession({ ...session, settings: { ...session.settings, ...patch } })
    void act(() => updateChat(session.id, patch))
  }

  const addFiles = (list: FileList | null) => {
    const next = [...files]
    for (const file of Array.from(list ?? [])) {
      if (file.size > MAX_FILE_BYTES) { setProblem(`${file.name} is larger than 20 MB.`); continue }
      if (next.length >= 10) { setProblem('Attach at most 10 files at once.'); break }
      if (next.reduce((sum, item) => sum + item.size, 0) + file.size > MAX_TOTAL_BYTES) { setProblem('Attach at most 24 MB in one message; send the rest in the next one.'); break }
      next.push(file)
    }
    setFiles(next)
  }

  const send = async (override?: string) => {
    let target = session
    const message = (override ?? text).trim()
    if (!message && files.length === 0) return
    setSending(true); setProblem(null)
    try {
      if (!target) target = await createChat({ section: 'MATH' })
      const attachments = await Promise.all(files.map(async (file) => ({ name: file.name, base64: await fileBase64(file) })))
      const next = await sendChat(target.id, message, attachments)
      setSession(next); setText(''); setFiles([])
      void refreshChats()
    } catch (failure) { setProblem(messageOf(failure)) } finally { setSending(false) }
  }

  const onAction = (action: string, message: StudioMessage, draftsOnly = false) => {
    if (!session) return
    if (action === 'retry') void act(() => retryChat(session.id))
    else if (action === 'fix' && message.fix) void send(message.fix)
    else if (action === 'publish' && message.messageId) void act(() => publishBatch(session.id, message.messageId!))
    else if (action === 'publish-batch') void act(() => publishBatch(session.id, message.id, draftsOnly))
    else if (action === 'settings') setShowSettings(true)
  }

  if (!providers) return <p role="status" className="text-sm text-ink-secondary">Looking for AI agents on this computer…</p>
  const anyAgent = providers.some((provider) => provider.available)
  const busy = Boolean(session?.turn) || sending

  return (
    <section className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]" data-testid="admin-ai">
      <aside className="grid gap-3 content-start min-w-0">
        <button type="button" className={buttonClass.primary} onClick={() => newChat()} data-testid="studio-new-chat">+ New chat</button>
        {chats.length > 0 && (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-1 max-h-[260px] overflow-y-auto" data-testid="studio-chats">
            {chats.map((chat) => (
              <li key={chat.id} className="flex items-stretch gap-1 min-w-0">
                <button type="button" onClick={() => act(() => loadChat(chat.id))}
                  className={`flex-1 min-w-0 text-left text-xs px-2 py-1.5 rounded-[3px] border cursor-pointer ${session?.id === chat.id ? 'border-ink bg-paper-sheet' : 'border-rule hover:border-ink'}`}>
                  <span className="block truncate font-semibold">{chat.working ? '● ' : ''}{chat.title}</span>
                  <span className="text-ink-secondary">{new Date(chat.updatedAt).toLocaleString()}</span>
                </button>
                <button type="button" aria-label={`Delete ${chat.title}`} className="px-2 text-xs text-pen-red border border-rule rounded-[3px] hover:border-pen-red cursor-pointer"
                  onClick={() => { if (window.confirm('Delete this chat? Questions already saved in the Bank stay.')) void act(async () => { await deleteChat(chat.id); if (session?.id === chat.id) setSession(null) }) }}>×</button>
              </li>
            ))}
          </ul>
        )}
        {session && (
          <div className="border border-rule-strong rounded-[3px] bg-paper-sheet p-3">
            <button type="button" className="text-xs font-semibold cursor-pointer" onClick={() => setShowSettings(!showSettings)} aria-expanded={showSettings}>{showSettings ? '▾' : '▸'} Chat settings</button>
            {showSettings && <div className="mt-2"><SettingsPanel settings={session.settings} providers={providers} disabled={busy} onChange={changeSettings} /></div>}
          </div>
        )}
        {session && overview.jobs.available && (
          <div className="border border-rule rounded-[3px] p-3 grid gap-2 text-xs">
            <p className="font-semibold">Check drafts already in the Bank</p>
            <p className="text-ink-secondary">The reviewer checks unreviewed {SECTION_NAMES[session.settings.section]} drafts of the practice pool; you publish the passed ones.</p>
            <div className="flex gap-2 items-center">
              <input type="number" min={1} max={40} value={draftLimit} onChange={(event) => setDraftLimit(Math.max(1, Math.min(40, Number(event.target.value) || 1)))} className={`${inputClass} w-16`} aria-label="How many drafts" />
              <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => act(() => reviewDrafts(session.id, session.settings.section, draftLimit))} data-testid="studio-review-drafts">Review drafts</button>
            </div>
          </div>
        )}
      </aside>

      <div className="grid gap-3 min-w-0 content-start">
        {!anyAgent && (
          <Notice tone="error">No AI agent was found on this computer. Install and sign in to one of: Claude Code (<code>claude</code>), Codex (<code>codex</code>) or Antigravity (<code>agy</code>), then press <button type="button" className="underline" onClick={() => loadAgents(true).then(setProviders, onError)}>check again</button>.</Notice>
        )}
        {!overview.jobs.available && <Notice tone="info">Rehearsal mode: you can write and review questions, but saving them needs the real Bank (npm start).</Notice>}
        <div className="border border-rule-strong rounded-[3px] bg-paper-recessed min-h-[420px] max-h-[calc(100dvh-16rem)] overflow-y-auto overflow-x-hidden p-3">
          {!session || session.messages.length === 0 ? (
            <div className="grid gap-3 text-sm text-ink-secondary p-2" data-testid="studio-empty">
              <p className="text-ink font-semibold">Ask for TSA questions in your own words, in Vietnamese or English.</p>
              <p>The writer reads matching questions from the Bank{session?.settings.web === false ? '' : ' and researches the web'}, then the platform checks the batch, sends every problem back to the writer and has the reviewer solve each question. You only press Publish.</p>
              <p>Attach exam pages, photos or a PDF to have them copied into questions with their answer key.</p>
              <div className="flex flex-wrap gap-2">
                {IDEAS[session?.settings.section ?? 'MATH'].map((idea) => (
                  <button key={idea} type="button" className="text-left text-xs px-2 py-1.5 rounded-[3px] border border-rule-strong bg-paper-sheet hover:border-ink cursor-pointer" onClick={() => setText(idea)}>{idea}</button>
                ))}
              </div>
            </div>
          ) : (
            <ol ref={listRef} className="flex flex-col gap-3" data-testid="studio-messages">
              {session.messages.map((message) => <MessageItem key={message.id} session={session} message={message} busy={busy} onAction={onAction} />)}
              {session.turn && <TurnStatus session={session} onStop={() => act(() => stopChat(session.id))} />}
            </ol>
          )}
        </div>
        {problem && <Notice tone="error">{problem}</Notice>}
        <div className="border border-rule-strong rounded-[3px] bg-paper-sheet p-2 grid gap-2"
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }}>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file, index) => (
                <span key={`${file.name}-${index}`} className="text-xs px-2 py-1 rounded-[3px] border border-rule bg-paper-recessed">
                  {file.name} <button type="button" aria-label={`Remove ${file.name}`} className="ml-1 text-pen-red cursor-pointer" onClick={() => setFiles(files.filter((_, other) => other !== index))}>×</button>
                </span>
              ))}
            </div>
          )}
          <textarea className="w-full min-h-[84px] p-2 text-sm bg-paper-sheet text-ink border border-rule rounded-[3px] focus:border-ink resize-y"
            placeholder={`Message the writer (${session ? SECTION_NAMES[session.settings.section] : 'Math'}) — Ctrl+Enter sends. Drop files here.`}
            value={text} onChange={(event) => setText(event.target.value)} data-testid="studio-input"
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!busy) void send() } }}
            onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); addFiles(event.clipboardData.files) } }} />
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
            <button type="button" className={buttonClass.secondary} onClick={() => fileInput.current?.click()} data-testid="studio-attach">Attach files</button>
            <span className="text-[11px] text-ink-secondary flex-1">Pictures, PDF or text · up to 10 files, 24 MB per message</span>
            <button type="button" className={buttonClass.primary} disabled={busy || !anyAgent || (!text.trim() && files.length === 0)} onClick={() => send()} data-testid="studio-send">
              {sending ? 'Sending…' : session?.turn ? 'Working…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
