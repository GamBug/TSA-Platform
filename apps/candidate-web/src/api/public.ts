// Guest start: the demo notice says where a visitor's synthetic guest starts. The public demo sends
// publicDemo.guestPath; the local demo sends localGuests.guestPath and the admin page path.
export interface PublicDemo { enabled: boolean; guestPath: string; localGuestPath?: string; adminPath?: string }

const LOCAL: PublicDemo = { enabled: false, guestPath: '' }
let cached: Promise<PublicDemo> | null = null

export function loadPublicDemo(): Promise<PublicDemo> {
  cached ??= (async () => {
    try {
      const response = await fetch('/local/demo-notice', { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok) return LOCAL
      const notice = await response.json()
      const flag = notice?.publicDemo
      if (flag?.enabled === true && typeof flag.guestPath === 'string' && flag.guestPath.startsWith('/local-auth/')) {
        return { enabled: true, guestPath: flag.guestPath }
      }
      const local = notice?.localGuests
      if (typeof local?.guestPath === 'string' && local.guestPath.startsWith('/local-auth/')) {
        return { ...LOCAL, localGuestPath: local.guestPath,
          ...(typeof local.adminPath === 'string' && local.adminPath.startsWith('/student/') ? { adminPath: local.adminPath } : {}) }
      }
    } catch { /* an unreachable notice means local mode */ }
    return LOCAL
  })()
  return cached
}

export class GuestError extends Error {
  constructor(message: string, public code: string) { super(message) }
}

const csrfCookie = () => document.cookie.split(';').map((part) => part.trim())
  .find((part) => part.startsWith('tsa_local_csrf='))?.slice('tsa_local_csrf='.length) ?? ''

/** Start (or resume) this browser's guest session. */
export async function startGuest(guestPath: string): Promise<void> {
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' }
  const csrf = csrfCookie()
  if (csrf) headers['x-csrf-token'] = csrf
  let response: Response
  try {
    response = await fetch(guestPath, { method: 'POST', headers, body: '{}', cache: 'no-store', credentials: 'same-origin' })
  } catch {
    throw new GuestError('Chưa kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.', 'NETWORK')
  }
  if (response.ok) return
  const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null
  const code = typeof body?.error === 'string' ? body.error : 'REQUEST_FAILED'
  if (code === 'GUEST_POOL_EXHAUSTED') {
    throw new GuestError(typeof body?.message === 'string' ? body.message : 'Bản demo đã đủ lượt truy cập, vui lòng thử lại sau.', code)
  }
  if (code === 'GUEST_RATE_LIMITED') {
    const seconds = Number(response.headers.get('retry-after'))
    const wait = Number.isFinite(seconds) && seconds > 0 ? ` Hãy thử lại sau khoảng ${Math.max(1, Math.ceil(seconds / 60))} phút.` : ' Hãy thử lại sau ít phút.'
    throw new GuestError(`Thiết bị hoặc mạng của bạn đã mở quá nhiều phiên trong một giờ.${wait}`, code)
  }
  throw new GuestError('Chưa bắt đầu được phiên luyện tập. Hãy thử lại.', code)
}
