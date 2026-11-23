import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AdminError, adminImageUrl, adminLogin, adminLogout, adminSession, changeQuestion, generate, loadInbox, loadOverview, loadQuestion, loadQuestions,
  refreshBank, retryRejected, runInbox, runPublish, saveFigure, saveInboxFile, SECTION_NAMES, SECTIONS, setupPool,
  type GenerateResult, type InboxFile, type InboxListing, type JobResult, type Overview, type QuestionAction, type QuestionDetail,
  type QuestionSummary, type Section,
} from '@/api/admin'
import { ContentBlocks } from '@/content/ContentBlocks'
import { buttonClass, Notice } from '@/ui/Shell'
import type { ContentBlock } from '@/api/types'

// The owner's admin page on the local demo: the whole Bank, the question inbox, publication and AI questions.
// It is in English (owner-facing); question text stays as written.

const messageOf = (error: unknown) => (error as AdminError)?.message || 'The request did not complete.'
const sessionLost = (error: unknown) => [401, 403].includes((error as AdminError)?.status)
const inputClass = 'min-h-[44px] px-3 text-sm bg-paper-sheet text-ink border border-rule-strong rounded-[3px] focus:border-ink'
const PAGE_SIZE = 50
const STATES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'QUARANTINED', 'RETIRED']

type Tab = 'questions' | 'inbox' | 'ai'

export function AdminScreen() {
  const [state, setState] = useState<'loading' | 'login' | 'in'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    document.title = 'TSA Practice · Admin'
    adminSession().then((ok) => setState(ok ? 'in' : 'login'), (error) => { setMessage(messageOf(error)); setState('login') })
  }, [])
  const lost = useCallback((text = 'Your admin session ended. Sign in again.') => { setMessage(text); setState('login') }, [])
  if (state === 'loading') return <main className="flex-1 px-8 py-16 text-sm text-ink-secondary" role="status">Opening the admin page…</main>
  if (state === 'login') return <AdminLogin message={message} onSignedIn={() => { setMessage(null); setState('in') }} />
  return <AdminWorkspace onSessionLost={lost} onSignedOut={() => { setMessage('Signed out.'); setState('login') }} />
}

function AdminLogin({ message, onSignedIn }: { message: string | null; onSignedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(null)
    try { await adminLogin(username, password); setPassword(''); onSignedIn() }
    catch (failure) { setError(messageOf(failure)) }
    finally { setBusy(false) }
  }
  return (
    <main className="flex-1 px-5 py-10 sm:px-10 sm:py-14 max-w-[560px]">
      <p className="text-xs font-semibold text-ink-secondary mb-3">Local demo · this computer only</p>
      <h1 className="font-display text-[32px] leading-[1.1] font-semibold text-ink">Admin sign-in</h1>
      <p className="mt-3 text-sm text-ink-secondary">Students do not need an account. The admin page is not available on the public site.</p>
      {(error || message) && <div className="mt-6"><Notice tone={error ? 'error' : 'info'} testId="admin-login-message">{error ?? message}</Notice></div>}
      <form onSubmit={submit} className="mt-6 grid gap-4" data-testid="admin-login">
        <label className="grid gap-1 text-sm font-semibold">Username
          <input className={inputClass} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} data-testid="admin-username" required />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Password
          <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="admin-password" required />
        </label>
        <div><button type="submit" disabled={busy} className={buttonClass.ink} data-testid="admin-submit">Sign in</button></div>
      </form>
    </main>
  )
}

function AdminWorkspace({ onSessionLost, onSignedOut }: { onSessionLost: (text?: string) => void; onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('questions')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bankVersion, setBankVersion] = useState(0)
  const fail = useCallback((failure: unknown) => { if (sessionLost(failure)) onSessionLost(); else setError(messageOf(failure)) }, [onSessionLost])
  const reloadOverview = useCallback(async () => {
    try { setOverview(await loadOverview()) } catch (failure) { fail(failure) }
  }, [fail])
  useEffect(() => { void reloadOverview() }, [reloadOverview])
  const bankChanged = useCallback(async () => { await reloadOverview(); setBankVersion((value) => value + 1) }, [reloadOverview])
  const signOut = async () => { try { await adminLogout() } catch { /* the session ends either way */ } onSignedOut() }

  return (
    <main className="flex-1 px-4 sm:px-8 py-6 w-full max-w-[1400px] mx-auto" data-testid="admin-workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink">Admin</h1>
          {overview && (
            <p className="text-xs text-ink-secondary" data-testid="admin-overview">
              {overview.total} question versions · {overview.contentMode === 'REHEARSAL' ? 'rehearsal content' : 'real Bank'} · read {new Date(overview.readAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['questions', 'inbox', 'ai'] as Tab[]).map((key) => (
            <button key={key} type="button" aria-pressed={tab === key} data-testid={`admin-tab-${key}`} onClick={() => setTab(key)}
              className={`px-3 min-h-[40px] text-xs font-semibold border rounded-[3px] cursor-pointer ${tab === key ? 'bg-ink text-paper-sheet border-ink' : 'bg-paper-sheet text-ink border-rule-strong hover:border-ink'}`}>
              {key === 'questions' ? 'All questions' : key === 'inbox' ? 'Import & publish' : 'AI questions'}
            </button>
          ))}
          <button type="button" onClick={signOut} data-testid="admin-logout"
            className="px-3 min-h-[40px] text-xs font-semibold text-pen-red border border-pen-red bg-paper-sheet hover:bg-pen-red-wash rounded-[3px] cursor-pointer">Sign out · AdminBao</button>
        </div>
      </div>
      {overview && <CountsTable overview={overview} />}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-6">
        {tab === 'questions' && <QuestionsTab bankVersion={bankVersion} canChange={overview?.jobs.available === true} onError={fail} onBankChanged={bankChanged} />}
        {tab === 'inbox' && overview && <InboxTab overview={overview} onError={fail} onBankChanged={bankChanged} />}
        {tab === 'ai' && overview && <AiTab overview={overview} onError={fail} onGoToInbox={() => setTab('inbox')} />}
      </div>
    </main>
  )
}

function CountsTable({ overview }: { overview: Overview }) {
  const states = STATES.filter((stateName) => SECTIONS.some((section) => overview.counts[section]?.[stateName]))
  if (states.length === 0) return null
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="text-xs border-collapse" data-testid="admin-counts">
        <thead><tr><th className="px-2 py-1 text-left" />{states.map((name) => <th key={name} className="px-2 py-1 text-right font-semibold">{name}</th>)}</tr></thead>
        <tbody>{SECTIONS.map((section) => (
          <tr key={section} className="border-t border-rule">
            <th scope="row" className="px-2 py-1 text-left">{SECTION_NAMES[section]}</th>
            {states.map((name) => <td key={name} className="px-2 py-1 text-right tabular-figures">{overview.counts[section]?.[name] ?? 0}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- All questions

function QuestionsTab({ bankVersion, canChange, onError, onBankChanged }: {
  bankVersion: number; canChange: boolean; onError: (error: unknown) => void; onBankChanged: () => Promise<void>
}) {
  const [items, setItems] = useState<QuestionSummary[] | null>(null)
  const [section, setSection] = useState<'' | Section>('')
  const [stateName, setStateName] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  // Re-read after every Bank change; the open question stays open (an older version shows as superseded).
  useEffect(() => { loadQuestions().then((data) => setItems(data.items), onError) }, [onError, bankVersion])
  const types = useMemo(() => [...new Set((items ?? []).map((item) => item.interactionType))].sort(), [items])
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (items ?? []).filter((item) => (!section || item.section === section) && (!stateName || item.state === stateName)
      && (!type || item.interactionType === type)
      && (!needle || item.preview.toLowerCase().includes(needle) || (item.exchangeId ?? '').toLowerCase().includes(needle)
        || item.versionId.includes(needle) || item.taxonomy.toLowerCase().includes(needle)))
  }, [items, section, stateName, type, search])
  useEffect(() => { setPage(0) }, [section, stateName, type, search])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  if (!items) return <p role="status" className="text-sm text-ink-secondary">Loading the Bank…</p>
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
      <section aria-label="Question list" className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <select aria-label="Section" className={inputClass} value={section} onChange={(e) => setSection(e.target.value as Section | '')} data-testid="admin-filter-section">
            <option value="">All sections</option>{SECTIONS.map((value) => <option key={value} value={value}>{SECTION_NAMES[value]}</option>)}
          </select>
          <select aria-label="State" className={inputClass} value={stateName} onChange={(e) => setStateName(e.target.value)} data-testid="admin-filter-state">
            <option value="">All states</option>{STATES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select aria-label="Type" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>{types.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input aria-label="Search" placeholder="Search text, id, taxonomy" className={`${inputClass} flex-1 min-w-[12rem]`} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="admin-search" />
        </div>
        <p className="mt-3 text-xs text-ink-secondary" data-testid="admin-result-count">{filtered.length} of {items.length} versions</p>
        <ul className="mt-2 divide-y divide-rule border border-rule rounded-[3px] bg-paper-sheet" data-testid="admin-question-list">
          {shown.map((item) => (
            <li key={item.versionId}>
              <button type="button" onClick={() => setSelected(item.versionId)} aria-current={selected === item.versionId ? 'true' : undefined}
                data-testid="admin-question-item"
                className={`w-full text-left px-3 py-2 cursor-pointer hover:bg-paper ${selected === item.versionId ? 'bg-ochre-wash' : ''}`}>
                <span className="flex flex-wrap gap-2 text-[11px] font-semibold text-ink-secondary">
                  <span>{SECTION_NAMES[item.section]}</span><StateBadge state={item.state} eligible={item.eligible} />
                  <span>{item.interactionType}</span><span>v{item.versionNo}</span>
                  {item.exchangeId && <span className="font-mono">{item.exchangeId}</span>}
                  {!item.hasKey && <span className="text-pen-red">no key</span>}
                </span>
                <span className="block mt-1 text-sm text-ink line-clamp-2">{item.preview || '(no text)'}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-4 text-sm text-ink-secondary">No question matches these filters.</li>}
        </ul>
        {pages > 1 && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button type="button" className={buttonClass.secondary} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="tabular-figures">Page {page + 1} of {pages}</span>
            <button type="button" className={buttonClass.secondary} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} data-testid="admin-next-page">Next</button>
          </div>
        )}
      </section>
      <section aria-label="Question" className="min-w-0">
        {selected ? <QuestionPanel key={selected} versionId={selected} bankVersion={bankVersion} canChange={canChange} onError={onError} onBankChanged={onBankChanged} />
          : <p className="text-sm text-ink-secondary">Choose a question to see it with its answer key and explanation.</p>}
      </section>
    </div>
  )
}

function StateBadge({ state, eligible }: { state: string; eligible: boolean }) {
  const tone = state === 'APPROVED' ? 'text-ink-green' : state === 'DRAFT' || state === 'IN_REVIEW' ? 'text-ochre' : 'text-pen-red'
  return <span className={tone}>{state}{state === 'APPROVED' && !eligible ? ' (superseded)' : ''}</span>
}

const ACTION_LABELS: Record<QuestionAction, string> = { PUBLISH: 'Publish', WITHHOLD: 'Withhold', RESTORE: 'Restore', MOVE: 'Move' }

// One question at a time: check (writes nothing), then confirm with the printed phrase. Versions are immutable, so a
// move adds a new version; the Bank is backed up before every change.
function QuestionActions({ detail, onError, onBankChanged }: { detail: QuestionDetail; onError: (error: unknown) => void; onBankChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState<Section>(SECTIONS.find((value) => value !== detail.section) ?? 'MATH')
  const [pending, setPending] = useState<{ action: QuestionAction; section?: Section; reason?: string } | null>(null)
  const [result, setResult] = useState<JobResult | null>(null)
  const active = ['DRAFT', 'IN_REVIEW', 'APPROVED'].includes(detail.state)
  const run = async (request: { action: QuestionAction; section?: Section; reason?: string }, confirm?: string) => {
    setBusy(true)
    try {
      const outcome = await changeQuestion({ versionId: detail.versionId, ...request, ...(confirm ? { confirm } : {}) })
      setResult(outcome); setPending(confirm ? null : request)
      if (confirm && outcome.ok) await onBankChanged()
    } catch (failure) { onError(failure) } finally { setBusy(false) }
  }
  const phrase = result?.ok && pending ? result.confirmation : null
  return (
    <section className="mt-4 border border-rule rounded-[3px] p-3" aria-label="Change status or section" data-testid="admin-question-actions">
      <h2 className="text-xs font-semibold text-ink-secondary">Change status or section</h2>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {['DRAFT', 'IN_REVIEW'].includes(detail.state) && (
          <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => run({ action: 'PUBLISH' })} data-testid="admin-action-publish">Publish</button>
        )}
        {detail.state === 'QUARANTINED' && (
          <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => run({ action: 'RESTORE' })} data-testid="admin-action-restore">Restore (publish again)</button>
        )}
        {active && (
          <>
            <label className="grid gap-1 text-xs font-semibold">Move to
              <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value as Section)} data-testid="admin-action-section">
                {SECTIONS.filter((value) => value !== detail.section).map((value) => <option key={value} value={value}>{SECTION_NAMES[value]}</option>)}
              </select>
            </label>
            <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => run({ action: 'MOVE', section: target })} data-testid="admin-action-move">Move</button>
          </>
        )}
      </div>
      {active && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold flex-1 min-w-[12rem]">Reason to withhold
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="for example: the key needs checking" data-testid="admin-action-reason" />
          </label>
          <button type="button" className={buttonClass.secondary} disabled={busy || reason.trim().length < 5} onClick={() => run({ action: 'WITHHOLD', reason })} data-testid="admin-action-withhold">Withhold</button>
        </div>
      )}
      {busy && <p role="status" className="mt-2 text-sm text-ink-secondary">Working… (a change can take a minute)</p>}
      {phrase && pending && (
        <button type="button" className={`${buttonClass.primary} mt-2`} disabled={busy} onClick={() => run(pending, phrase)} data-testid="admin-action-confirm">
          Confirm {ACTION_LABELS[pending.action].toLowerCase()} ({phrase})
        </button>
      )}
      <JobOutput result={result} testId="admin-action-output" />
      {result?.ok && !pending && <p className="mt-2 text-xs text-ink-secondary">Students see the change after the demo restarts (or after the Bank is uploaded to the server).</p>}
    </section>
  )
}

function QuestionPanel({ versionId, bankVersion, canChange, onError, onBankChanged }: {
  versionId: string; bankVersion: number; canChange: boolean; onError: (error: unknown) => void; onBankChanged: () => Promise<void>
}) {
  const [detail, setDetail] = useState<QuestionDetail | null>(null)
  // The panel is keyed by version; after a Bank change the details are re-read in place, keeping the change's result.
  useEffect(() => { loadQuestion(versionId).then(setDetail, onError) }, [versionId, bankVersion, onError])
  if (!detail) return <p role="status" className="text-sm text-ink-secondary">Loading the question…</p>
  const blocks = (value: ContentBlock[] | null | undefined) => <ContentBlocks blocks={value} attemptId="" apiVersion="v1" imageSource={adminImageUrl} />
  return (
    <article className="border border-rule-strong rounded-[3px] bg-paper-sheet p-4 sm:p-5 xl:sticky xl:top-20 max-h-none xl:max-h-[calc(100dvh-6rem)] overflow-y-auto" data-testid="admin-question">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="font-semibold">State</dt><dd><StateBadge state={detail.state} eligible={detail.eligible} />{detail.quarantineReason ? ` · ${detail.quarantineReason}` : ''}</dd>
        <dt className="font-semibold">Section</dt><dd>{SECTION_NAMES[detail.section]} · {detail.domainId} · {detail.skillIds.join(', ')}</dd>
        <dt className="font-semibold">Type</dt><dd>{detail.interactionType} · {detail.schemaVersion}{detail.difficulty?.target ? ` · ${detail.difficulty.target}` : ''}</dd>
        <dt className="font-semibold">Taxonomy</dt><dd>{detail.taxonomy}</dd>
        {detail.exchangeId && <><dt className="font-semibold">Exchange id</dt><dd className="font-mono">{detail.exchangeId} ({detail.batchId})</dd></>}
        <dt className="font-semibold">Sources</dt><dd>{detail.sources.join('; ') || '—'}</dd>
        <dt className="font-semibold">Version</dt><dd className="font-mono break-all">v{detail.versionNo} · {detail.versionId}</dd>
      </dl>
      {canChange && <QuestionActions detail={detail} onError={onError} onBankChanged={onBankChanged} />}
      {detail.passage && (
        <section className="mt-4 border-l-[3px] border-l-ochre pl-3">
          <h2 className="text-xs font-semibold text-ink-secondary mb-2">Passage</h2>
          <div className="text-[15px] leading-relaxed">{blocks(detail.passage)}</div>
        </section>
      )}
      <section className="mt-4">
        <h2 className="text-xs font-semibold text-ink-secondary mb-2">Question</h2>
        <div className="text-[15px] leading-relaxed">{blocks(detail.content)}</div>
      </section>
      <AnswerView detail={detail} />
      <section className="mt-4">
        <h2 className="text-xs font-semibold text-ink-secondary mb-2">Explanation</h2>
        {detail.explanation?.length ? <div className="text-sm leading-relaxed">{blocks(detail.explanation)}</div> : <p className="text-sm text-ink-secondary">No explanation.</p>}
      </section>
    </article>
  )
}

function AnswerView({ detail }: { detail: QuestionDetail }) {
  const key = detail.answerKey
  const interaction = detail.interaction
  const options: { id: string; content: ContentBlock[] }[] = Array.isArray(interaction.options) ? interaction.options : []
  const blocks = (value: ContentBlock[]) => <ContentBlocks blocks={value} attemptId="" apiVersion="v1" imageSource={adminImageUrl} />
  const correct = new Set<string>(key?.type === 'SINGLE_CHOICE' ? [key.optionId] : key?.type === 'MULTIPLE_CHOICE' ? key.optionIds : [])
  return (
    <section className="mt-4" data-testid="admin-answer">
      <h2 className="text-xs font-semibold text-ink-secondary mb-2">Answer {key ? '' : '(no key stored)'}</h2>
      {options.length > 0 && (
        <ol className="grid gap-2">
          {options.map((option) => (
            <li key={option.id} data-correct={correct.has(option.id) ? 'true' : undefined}
              className={`flex gap-3 border rounded-[3px] px-3 py-2 ${correct.has(option.id) ? 'border-ink-green bg-ink-green-wash' : 'border-rule'}`}>
              <span className="font-semibold uppercase">{option.id}{correct.has(option.id) ? ' ✓' : ''}</span>
              <div className="min-w-0 flex-1 text-sm">{blocks(option.content)}</div>
            </li>
          ))}
        </ol>
      )}
      {interaction.type === 'TRUE_FALSE_GROUP' && Array.isArray(interaction.statements) && (
        <ol className="grid gap-2">
          {interaction.statements.map((statement: any) => {
            const value = key?.values?.[statement.id]
            return (
              <li key={statement.id} className="flex gap-3 border border-rule rounded-[3px] px-3 py-2">
                <span className="font-semibold">{statement.label ?? statement.id}</span>
                <div className="min-w-0 flex-1 text-sm">{statement.content ? blocks(statement.content) : statement.text}</div>
                <span className={`font-semibold ${value === true ? 'text-ink-green' : value === false ? 'text-pen-red' : ''}`}>{value === true ? 'Đúng' : value === false ? 'Sai' : '?'}</span>
              </li>
            )
          })}
        </ol>
      )}
      {key && options.length === 0 && interaction.type !== 'TRUE_FALSE_GROUP' && (
        <pre className="text-xs bg-paper-recessed border border-rule rounded-[3px] p-3 overflow-x-auto" data-testid="admin-answer-key">{JSON.stringify(key, null, 2)}</pre>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Import & publish

function JobOutput({ result, testId }: { result: JobResult | null; testId: string }) {
  if (!result) return null
  return (
    <div className="mt-3">
      <Notice tone={result.ok ? 'success' : 'error'}>{result.ok ? 'Finished.' : `Stopped${result.code ? ` (${result.code})` : ''}.`}</Notice>
      <pre className="mt-2 text-xs whitespace-pre-wrap bg-paper-recessed border border-rule rounded-[3px] p-3 max-h-[24rem] overflow-y-auto" data-testid={testId}>{result.output || '(no output)'}</pre>
    </div>
  )
}

function InboxTab({ overview, onError, onBankChanged }: { overview: Overview; onError: (error: unknown) => void; onBankChanged: () => Promise<void> }) {
  const [inbox, setInbox] = useState<InboxListing | null>(null)
  const [section, setSection] = useState<Section>('MATH')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [check, setCheck] = useState<JobResult | null>(null)
  const [publish, setPublish] = useState<JobResult | null>(null)
  const [publishSection, setPublishSection] = useState<'' | Section>('')
  const [keepOneOfTwins, setKeepOneOfTwins] = useState(false)
  const reload = useCallback(() => loadInbox().then(setInbox, onError), [onError])
  useEffect(() => { void reload() }, [reload])
  const available = overview.jobs.available

  const work = async (action: () => Promise<void>) => {
    setBusy(true); setNotice(null)
    try { await action() } catch (failure) { onError(failure) } finally { setBusy(false) }
  }
  const upload = (files: FileList | null) => work(async () => {
    for (const file of Array.from(files ?? [])) await saveInboxFile(section, file.name, await file.text())
    setNotice(`Saved ${files?.length ?? 0} file(s) to the ${SECTION_NAMES[section]} inbox. Press "Check the inbox" next.`)
    setCheck(null); await reload()
  })
  // Figures: ChatGPT names its PNG downloads the way the inbox expects; an own crop is saved under a named slot.
  const uploadFigures = (target: Section, files: FileList | null, slotName?: string) => work(async () => {
    const list = Array.from(files ?? [])
    for (const file of list) {
      const name = slotName ? slotName.replace(/\.[a-z]+$/i, `.${(file.name.split('.').pop() ?? 'png').toLowerCase()}`) : file.name
      await saveFigure(target, name, await fileBase64(file))
    }
    setNotice(`Saved ${list.length} figure(s) to the ${SECTION_NAMES[target]} inbox.`); setCheck(null); await reload()
  })
  const retry = (target: Section, name: string) => work(async () => {
    const moved = await retryRejected(target, name)
    setNotice(`${moved.name} is back in the ${SECTION_NAMES[target]} inbox. Press "Check the inbox" next.`); setCheck(null); await reload()
  })
  const savePaste = () => work(async () => {
    const saved = await saveInboxFile(section, 'pasted.json', pasted)
    setPasted(''); setNotice(`Saved as ${saved.name}. Press "Check the inbox" next.`); setCheck(null); await reload()
  })
  const runCheck = (confirm?: string) => work(async () => {
    const result = await runInbox(confirm)
    setCheck(result); await reload()
    if (confirm && result.ok) { setPublish(null); await onBankChanged() }
  })
  const runSetup = (confirm?: string) => work(async () => {
    const result = await setupPool(confirm)
    setCheck(result)
    if (confirm && result.ok) await onBankChanged()
  })
  const runPublishJob = (confirm?: string) => work(async () => {
    const result = await runPublish({ section: publishSection || null, keepOneOfTwins, confirm })
    setPublish(result)
    if (confirm && result.ok) await onBankChanged()
  })
  const refresh = () => work(async () => { await refreshBank(); await onBankChanged(); setNotice('Re-read the Bank.') })
  const checkedImport = check?.ok && check.confirmation?.startsWith('IMPORT') ? check.confirmation : null
  const checkedSetup = check?.ok && check.confirmation === 'REGISTER TAXONOMY' ? check.confirmation : null
  const confirmedPublish = publish?.ok && publish.confirmation?.startsWith('PUBLISH') ? publish.confirmation : null

  if (!available) {
    return <Notice tone="info" testId="admin-no-bank">This demo runs on rehearsal content, so there is no real Bank to import into. Start the real demo with <code>npm start</code> to import and publish.</Notice>
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="admin-inbox">
      <section className="border border-rule-strong rounded-[3px] bg-paper-sheet p-4">
        <h2 className="font-semibold">1. Add question files</h2>
        <p className="mt-1 text-sm text-ink-secondary">ChatGPT answers in the <code>tsa-question-set/1</code> format (.json, .txt or .md). They go to <code>question-inbox/</code> on this computer.</p>
        <label className="mt-3 grid gap-1 text-sm font-semibold max-w-[16rem]">Subject
          <select className={inputClass} value={section} onChange={(e) => setSection(e.target.value as Section)} data-testid="admin-inbox-section">
            {SECTIONS.map((value) => <option key={value} value={value}>{SECTION_NAMES[value]}</option>)}
          </select>
        </label>
        <label className="mt-3 grid gap-1 text-sm font-semibold">Upload files
          <input type="file" multiple accept=".json,.txt,.md,application/json,text/plain,text/markdown" disabled={busy}
            onChange={(e) => { void upload(e.target.files); e.target.value = '' }} data-testid="admin-inbox-upload" />
        </label>
        <label className="mt-3 grid gap-1 text-sm font-semibold">…or paste one answer
          <textarea className={`${inputClass} min-h-[8rem] py-2 font-mono text-xs`} value={pasted} onChange={(e) => setPasted(e.target.value)} data-testid="admin-inbox-paste" />
        </label>
        <button type="button" className={`${buttonClass.secondary} mt-2`} disabled={busy || !pasted.trim()} onClick={savePaste} data-testid="admin-inbox-save-paste">Save pasted answer</button>
        <label className="mt-4 grid gap-1 text-sm font-semibold">Upload figures
          <span className="font-normal text-ink-secondary">PNG, JPEG or WebP named like <code>MATH-S261122A-000031_NEW-IMG-001.png</code>, as ChatGPT names them. Figures of a rejected file can also be added one by one below.</span>
          <input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={busy}
            onChange={(e) => { void uploadFigures(section, e.target.files); e.target.value = '' }} data-testid="admin-figure-upload" />
        </label>
        {notice && <div className="mt-3"><Notice tone="success" testId="admin-inbox-notice">{notice}</Notice></div>}
        {inbox && <InboxFiles inbox={inbox} busy={busy} onFigure={uploadFigures} onRetry={retry} />}
      </section>

      <section className="border border-rule-strong rounded-[3px] bg-paper-sheet p-4">
        <h2 className="font-semibold">2. Check and import as drafts</h2>
        <p className="mt-1 text-sm text-ink-secondary">The check writes nothing. Import backs up the Bank first, imports good files as DRAFTs into the practice pool and moves rejected files aside with a message to paste back into ChatGPT.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => runCheck()} data-testid="admin-inbox-check">Check the inbox</button>
          {checkedImport && <button type="button" className={buttonClass.primary} disabled={busy} onClick={() => runCheck(checkedImport)} data-testid="admin-inbox-import">Import ({checkedImport})</button>}
          {!overview.practicePoolTaxonomyId && <button type="button" className={buttonClass.secondary} disabled={busy} onClick={() => runSetup()}>Register the practice pool</button>}
          {checkedSetup && <button type="button" className={buttonClass.primary} disabled={busy} onClick={() => runSetup(checkedSetup)}>Confirm: register the pool</button>}
        </div>
        {busy && <p role="status" className="mt-3 text-sm text-ink-secondary">Working… (a job can take a minute)</p>}
        <JobOutput result={check} testId="admin-inbox-output" />

        <h2 className="mt-6 font-semibold">3. Approve and publish</h2>
        <p className="mt-1 text-sm text-ink-secondary">Read the drafts in "All questions" first. Publishing approves every eligible draft of the practice pool, after a backup. Students see them after you restart the demo (or upload the Bank to the server).</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-semibold">Section
            <select className={inputClass} value={publishSection} onChange={(e) => setPublishSection(e.target.value as Section | '')}>
              <option value="">All sections</option>{SECTIONS.map((value) => <option key={value} value={value}>{SECTION_NAMES[value]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" checked={keepOneOfTwins} onChange={(e) => setKeepOneOfTwins(e.target.checked)} /> Keep one of exact twins</label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass.secondary} disabled={busy || !overview.practicePoolTaxonomyId} onClick={() => runPublishJob()} data-testid="admin-publish-check">Check what would be published</button>
          {confirmedPublish && <button type="button" className={buttonClass.primary} disabled={busy} onClick={() => runPublishJob(confirmedPublish)} data-testid="admin-publish-confirm">Publish ({confirmedPublish})</button>}
          {overview.canRefresh && <button type="button" className={buttonClass.secondary} disabled={busy} onClick={refresh}>Re-read the Bank</button>}
        </div>
        <JobOutput result={publish} testId="admin-publish-output" />
      </section>
    </div>
  )
}

/** Read a chosen file as base64 for the JSON upload route. */
function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(new AdminError('The file could not be read.', 'FILE_UNREADABLE', 0))
    reader.readAsDataURL(file)
  })
}

const figureKey = (name: string) => name.replace(/\.[a-z]+$/i, '').toUpperCase()

function InboxFiles({ inbox, busy, onFigure, onRetry }: {
  inbox: InboxListing; busy: boolean; onFigure: (section: Section, files: FileList | null, slotName?: string) => void
  onRetry: (section: Section, name: string) => void
}) {
  return (
    <div className="mt-5 grid gap-3 text-sm" data-testid="admin-inbox-files">
      {SECTIONS.map((section) => {
        const folder = inbox[section]
        const present = new Set(folder.figures.items.map((file) => figureKey(file.name)))
        return (
          <div key={section}>
            <h3 className="font-semibold">{SECTION_NAMES[section]}: {folder.pending.count} waiting · {folder.figures.count} figure(s) · {folder.imported.count} imported · {folder.rejected.count} rejected</h3>
            <ul className="mt-1 text-xs text-ink-secondary">
              {folder.pending.items.map((file) => (
                <li key={file.name} className="mt-1">
                  <span className="font-mono">waiting · {file.name}</span>
                  <FigureSlots section={section} figures={file.figures ?? []} present={present} busy={busy} onFigure={onFigure} />
                </li>
              ))}
              {folder.rejected.items.slice(0, 10).map((file) => (
                <RejectedFile key={file.name} section={section} file={file} present={present} busy={busy} onFigure={onFigure} onRetry={onRetry} />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** One line per figure the answer needs: added (✓) or not, with a picker that saves the chosen image under that name. */
function FigureSlots({ section, figures, present, busy, onFigure }: {
  section: Section; figures: string[]; present: Set<string>; busy: boolean
  onFigure: (section: Section, files: FileList | null, slotName?: string) => void
}) {
  if (figures.length === 0) return null
  return (
    <ul className="mt-1 ml-3 grid gap-1">
      {figures.map((name) => {
        const added = present.has(figureKey(name))
        return (
          <li key={name} className="flex flex-wrap items-center gap-2">
            <span className={`font-mono ${added ? 'text-ink-green' : ''}`}>{added ? '✓' : '·'} {name}</span>
            <label className="text-ink underline cursor-pointer">{added ? 'replace' : 'add image'}
              <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={busy}
                onChange={(e) => { void onFigure(section, e.target.files, name); e.target.value = '' }} data-testid="admin-figure-slot" />
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function RejectedFile({ section, file, present, busy, onFigure, onRetry }: {
  section: Section; file: InboxFile; present: Set<string>; busy: boolean
  onFigure: (section: Section, files: FileList | null, slotName?: string) => void; onRetry: (section: Section, name: string) => void
}) {
  const figures = file.figures ?? []
  const missing = figures.filter((name) => !present.has(figureKey(name)))
  return (
    <li className="mt-1" data-testid="admin-rejected-file">
      <details><summary className="cursor-pointer font-mono text-pen-red">rejected · {file.name}{figures.length ? ` · ${figures.length - missing.length}/${figures.length} figures added` : ''}</summary>
        <pre className="mt-1 whitespace-pre-wrap bg-paper-recessed border border-rule rounded-[3px] p-2">{file.errors ?? '(no message)'}</pre>
        <FigureSlots section={section} figures={figures} present={present} busy={busy} onFigure={onFigure} />
        <button type="button" className={`${buttonClass.secondary} mt-2`} disabled={busy} onClick={() => onRetry(section, file.name)} data-testid="admin-inbox-retry">
          Back to the inbox{missing.length ? ` (${missing.length} figure(s) still missing)` : ''}
        </button>
      </details>
    </li>
  )
}

// ---------------------------------------------------------------- AI questions

function AiTab({ overview, onError, onGoToInbox }: { overview: Overview; onError: (error: unknown) => void; onGoToInbox: () => void }) {
  const [section, setSection] = useState<Section>('MATH')
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(10)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  if (!overview.generation.configured) return <ChatGptSteps />
  const run = async () => {
    setBusy(true); setResult(null)
    try { setResult(await generate(section, topic, count)) } catch (failure) { onError(failure) } finally { setBusy(false) }
  }
  return (
    <section className="border border-rule-strong rounded-[3px] bg-paper-sheet p-4 max-w-[760px]" data-testid="admin-ai">
      <h2 className="font-semibold">Write new questions with OpenAI</h2>
      <p className="mt-1 text-sm text-ink-secondary">Uses OPENAI_API_KEY (model {overview.generation.model}). Each run is one CREATE batch of up to 10 original questions, written with the same instructions as the ChatGPT Projects. The answer is saved to the inbox; nothing is imported or published until you check, import and publish it.</p>
      {!overview.jobs.available && <div className="mt-3"><Notice tone="info">Rehearsal mode has no real Bank; start the real demo with npm start.</Notice></div>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold">Subject
          <select className={inputClass} value={section} onChange={(e) => setSection(e.target.value as Section)}>
            {SECTIONS.map((value) => <option key={value} value={value}>{SECTION_NAMES[value]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold flex-1 min-w-[12rem]">Topic (optional, a topic code from SUBJECT_*.md)
          <input className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="for example CALCULUS" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">Questions
          <input className={`${inputClass} w-20`} type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
        </label>
        <button type="button" className={buttonClass.primary} disabled={busy || !overview.jobs.available} onClick={run} data-testid="admin-ai-generate">Generate</button>
      </div>
      {busy && <p role="status" className="mt-3 text-sm text-ink-secondary">Waiting for OpenAI… this can take a few minutes.</p>}
      {result && (
        <div className="mt-4 grid gap-2">
          {result.ok ? (
            <Notice tone={result.problems?.length ? 'info' : 'success'}>
              Saved {result.questions} question(s) as <code>question-inbox/{result.file}</code> ({result.batchId}).
              {result.problems?.length ? ` The validator found ${result.problems.length} problem(s); the inbox check will list them.` : ' The validator found no problem.'}
            </Notice>
          ) : (
            <Notice tone="error">{result.code === 'PROVIDER_ERROR' ? `OpenAI refused the request (${result.status}): ${result.message}` : `${result.code}${result.message ? `: ${result.message}` : ''}`}</Notice>
          )}
          {result.report && <pre className="text-xs whitespace-pre-wrap bg-paper-recessed border border-rule rounded-[3px] p-3">{result.report}</pre>}
          {result.problems && result.problems.length > 0 && <pre className="text-xs whitespace-pre-wrap bg-paper-recessed border border-rule rounded-[3px] p-3">{result.problems.join('\n')}</pre>}
          {result.ok && <div><button type="button" className={buttonClass.secondary} onClick={onGoToInbox}>Go to Import & publish</button></div>}
        </div>
      )}
    </section>
  )
}

function ChatGptSteps() {
  return (
    <section className="border border-rule-strong rounded-[3px] bg-paper-sheet p-4 max-w-[860px] text-sm leading-relaxed" data-testid="admin-ai-steps">
      <h2 className="font-semibold text-base">No API key: use a ChatGPT Project in the browser</h2>
      <p className="mt-1 text-ink-secondary">AI generation through the API needs an OpenAI API key. Set it before starting the demo, then restart:
        <code className="block mt-1 p-2 bg-paper-recessed border border-rule rounded-[3px]">OPENAI_API_KEY=sk-... npm start</code>
        (optional: <code>OPENAI_MODEL=...</code>). Without a key you can do the same work for free with your ChatGPT subscription:</p>
      <ol className="mt-3 list-decimal pl-5 grid gap-2">
        <li>In ChatGPT, create three Projects: "TSA Math", "TSA Reading" and "TSA Science".</li>
        <li>In each Project's settings, paste the whole of <code>docs/guides/chatgpt-projects/INSTRUCTIONS_&lt;SUBJECT&gt;.txt</code> into <strong>Instructions</strong>.</li>
        <li>Upload these Project files: <code>AGENT.md</code> and <code>SUBJECT_&lt;SUBJECT&gt;.md</code> from that folder; <code>AI_QUESTION_GENERATION_PROMPT.md</code> and <code>question-set.schema.json</code> from <code>docs/question-bank/</code>; and the examples in <code>docs/question-bank/examples/valid/</code>.</li>
        <li>Start a new chat for each batch and type, for example: <code>CREATE · topic CALCULUS · 10 questions · default 4/3/3 mix · batch letter A</code>. Use a new batch letter for every batch on the same day.</li>
        <li>To convert your own pictures or PDF instead, attach them and type <code>TRANSCRIBE · batch letter B</code>; send <code>CONTINUE</code> for the next part.</li>
        <li>Copy the answer (the ```json block) and add it in <strong>Import &amp; publish</strong>: choose the subject, paste or upload, then "Check the inbox". If a file is rejected, paste its message back into the same ChatGPT chat and save the corrected answer.</li>
      </ol>
      <p className="mt-3 text-ink-secondary">The full guide is <code>docs/guides/chatgpt-projects/README.md</code>.</p>
    </section>
  )
}
