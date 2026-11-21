import React, { useCallback, useEffect, useState } from 'react'
import { apiFor, MODES, readMode } from '@/api/mode'
import type { ApiError, Attempt, CatalogProfile } from '@/api/types'
import { LoginScreen } from '@/screens/LoginScreen'
import { CatalogScreen } from '@/screens/CatalogScreen'
import { AttemptScreen } from '@/screens/AttemptScreen'
import { SimulationScreen } from '@/screens/SimulationScreen'
import { AboutScreen } from '@/screens/AboutScreen'
import { loadPublicDemo, startGuest, type PublicDemo } from '@/api/public'
import { Masthead, PageFooter } from '@/ui/Shell'

type View =
  | { name: 'loading' }
  | { name: 'login'; message: string | null }
  | { name: 'catalog'; message: string | null }
  | { name: 'attempt'; attempt: Attempt }
  | { name: 'simulation' }

const mode = readMode()
const aboutPage = new URLSearchParams(window.location.search).get('page') === 'about'
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
  const [publicDemo, setPublicDemo] = useState<PublicDemo | null>(null)

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
    // The simulation screen reads its own attempts and reports a missing session itself.
    if (mode === 'simulation') { setView({ name: 'simulation' }); return }
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

  // Learn whether this server is the public demo before deciding which sign-in to offer.
  useEffect(() => {
    if (aboutPage) { void loadPublicDemo().then(setPublicDemo); return }
    let alive = true
    void loadPublicDemo().then((value) => { if (alive) { setPublicDemo(value); void restore() } })
    return () => { alive = false }
  }, [restore])

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

  const guest = async () => {
    if (!publicDemo?.enabled) return
    setBusy(true)
    try {
      await startGuest(publicDemo.guestPath)
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
          // The open attempt belongs to another mode (for example the full test), which this screen cannot show.
          setView({ name: 'catalog', message: isAuthError(inner) ? messageOf(inner)
            : 'Bạn đang có một bài thi khác chưa nộp (ví dụ bài thi thử đầy đủ). Hãy mở lại bài đó để làm tiếp hoặc nộp bài, rồi quay lại đây.' })
        }
      } else if (isAuthError(error)) setView({ name: 'login', message: messageOf(error) })
      else setView({ name: 'catalog', message: messageOf(error) })
    } finally { setBusy(false) }
  }

  const isPublic = publicDemo?.enabled === true
  const signedIn = view.name === 'catalog' || view.name === 'attempt' || view.name === 'simulation'
  if (aboutPage) {
    return (
      <div className="min-h-dvh flex flex-col bg-paper text-ink">
        <Masthead mode={mode} />
        <AboutScreen />
        <PageFooter />
      </div>
    )
  }
  return (
    <div className="min-h-dvh flex flex-col bg-paper text-ink">
      {view.name !== 'attempt' && <Masthead mode={mode} actorLabel={actor} onLogout={signedIn && !isPublic ? logout : undefined} sticky={view.name !== 'simulation'} />}
      {view.name === 'loading' && <main className="flex-1 px-8 py-16 text-sm text-ink-secondary" role="status">Đang mở phiên luyện tập…</main>}
      {view.name === 'login' && <LoginScreen busy={busy} message={view.message} publicDemo={isPublic} onLogin={login} onGuest={guest} />}
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
      {view.name === 'simulation' && <SimulationScreen onSessionLost={(message) => setView({ name: 'login', message })} />}
      {view.name !== 'attempt' && view.name !== 'simulation' && <PageFooter />}
    </div>
  )
}
