import React, { useCallback, useEffect, useState } from 'react'
import { apiFor, MODES, readMode } from '@/api/mode'
import type { ApiError, Attempt, CatalogProfile } from '@/api/types'
import { LoginScreen } from '@/screens/LoginScreen'
import { CatalogScreen } from '@/screens/CatalogScreen'
import { AttemptScreen } from '@/screens/AttemptScreen'
import { Masthead, PageFooter } from '@/ui/Shell'

type View =
  | { name: 'loading' }
  | { name: 'login'; message: string | null }
  | { name: 'catalog'; message: string | null }
  | { name: 'attempt'; attempt: Attempt }

const mode = readMode()
const api = apiFor(mode)

function messageOf(error: unknown): string {
  return (error as ApiError)?.message || 'Yêu cầu chưa hoàn tất. Hãy thử lại.'
}

function isAuthError(error: unknown): boolean {
  const code = (error as ApiError)?.code
  return code === 'UNAUTHENTICATED' || code === 'FORBIDDEN'
}

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' })
  const [profiles, setProfiles] = useState<CatalogProfile[] | null>(null)
  const [actor, setActor] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.documentElement.lang = 'vi'
  }, [])

  const showCatalog = useCallback(async (message: string | null = null) => {
    setView({ name: 'catalog', message })
    setProfiles(null)
    try {
      const { domains } = await api.loadCatalog()
      setProfiles(domains)
    } catch (error) {
      if (isAuthError(error)) setView({ name: 'login', message: messageOf(error) })
      else { setProfiles([]); setView({ name: 'catalog', message: messageOf(error) }) }
    }
  }, [])

  // Resume an open attempt first; otherwise land on the catalog. Never auto-select an account.
  const restore = useCallback(async () => {
    try {
      const { attempt } = await api.openDemoSession()
      if (attempt && ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED'].includes(attempt.state)) {
        setView({ name: 'attempt', attempt })
      } else await showCatalog()
    } catch (error) {
      if (isAuthError(error)) setView({ name: 'login', message: null })
      else setView({ name: 'login', message: messageOf(error) })
    }
  }, [showCatalog])

  useEffect(() => { void restore() }, [restore])

  const login = async (actorKey: 'studentA' | 'studentB') => {
    setBusy(true)
    try {
      await api.loginCandidate(actorKey)
      setActor(actorKey === 'studentA' ? 'A' : 'B')
      await restore()
    } catch (error) {
      setView({ name: 'login', message: messageOf(error) })
    } finally { setBusy(false) }
  }

  const logout = async () => {
    setBusy(true)
    try { await api.logout() } catch { /* the session is cleared locally either way */ }
    setActor(undefined)
    setBusy(false)
    setView({ name: 'login', message: 'Đã đăng xuất.' })
  }

  const start = async (profile: CatalogProfile) => {
    setBusy(true)
    try {
      const { attempt } = await api.startDemo(profile.domain, profile.blueprintVersionId)
      setView({ name: 'attempt', attempt })
    } catch (error) {
      const existing = (error as ApiError)?.details?.existingAttemptId
      if ((error as ApiError)?.code === 'CONCURRENT_ATTEMPT_EXISTS' && typeof existing === 'string') {
        try {
          const { attempt } = await api.readAttempt(existing)
          const resumed = attempt.state === 'CREATED' ? (await api.startReservedAttempt(existing)).attempt : attempt
          setView({ name: 'attempt', attempt: resumed })
        } catch (inner) {
          // The open attempt belongs to another practice mode (for example numeric answers), which this mode cannot show.
          setView({ name: 'catalog', message: isAuthError(inner) ? messageOf(inner)
            : 'Bạn đang có một bài luyện tập khác chưa nộp ở chế độ khác. Hãy mở lại chế độ đó (ví dụ “Điền đáp án số”) để làm tiếp hoặc nộp bài, rồi quay lại đây.' })
        }
      } else if (isAuthError(error)) setView({ name: 'login', message: messageOf(error) })
      else setView({ name: 'catalog', message: messageOf(error) })
    } finally { setBusy(false) }
  }

  const signedIn = view.name === 'catalog' || view.name === 'attempt'
  return (
    <div className="min-h-dvh flex flex-col bg-paper text-ink">
      {view.name !== 'attempt' && <Masthead mode={mode} actorLabel={actor} onLogout={signedIn ? logout : undefined} />}
      {view.name === 'loading' && <main className="flex-1 px-8 py-16 text-sm text-ink-secondary" role="status">Đang mở phiên luyện tập…</main>}
      {view.name === 'login' && <LoginScreen busy={busy} message={view.message} onLogin={login} />}
      {view.name === 'catalog' && <CatalogScreen mode={mode} profiles={profiles} busy={busy} message={view.message} onStart={start} />}
      {view.name === 'attempt' && (
        <AttemptScreen
          api={api}
          apiVersion={MODES[mode].apiVersion}
          initial={view.attempt}
          onExit={(message) => void showCatalog(message ?? null)}
          onSessionLost={(message) => setView({ name: 'login', message })}
        />
      )}
      {view.name !== 'attempt' && <PageFooter />}
    </div>
  )
}
