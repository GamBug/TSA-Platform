// Client for the existing full-simulation API (/api/v3), following the same request rules as the
// current app: CSRF header from the session cookie, one idempotency key per intended mutation (kept
// for retries after an uncertain acknowledgement), and session-change detection.
import type { AnswerValue, Slot } from './types'

export type SectionId = 'math' | 'reading' | 'science'

export interface SectionClock {
  sectionId: SectionId
  remainingSeconds: number
  isOpen: boolean
  isLocked: boolean
  firstOpenedAt: string | null
}

export interface SimulationView {
  attemptId: string
  state: 'CREATED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'GRADED' | 'CANCELLED' | 'INVALIDATED'
  activeSectionId: SectionId | null
  sections: SectionClock[]
  slots: (Slot & { sectionId: SectionId })[]
  answers: { slotId: string; value: RawValue; revision: number }[]
}

export type RawValue =
  | { type: 'SINGLE_CHOICE'; optionId: string | null }
  | { type: 'MULTIPLE_CHOICE'; optionIds: string[] }
  | { type: 'TRUE_FALSE_GROUP'; values: Record<string, boolean | null> }
  | { type: 'NUMERIC_RESPONSE'; value: string | null }
  | { type: 'CLOZE'; values: Record<string, string | null> }
  | { type: 'MATCHING'; assignments: Record<string, string | null> }

export interface SimulationResult {
  correctCount: number
  totalCount: number
  sections: { sectionId: SectionId; correctCount: number; totalCount: number }[]
}

export interface SimulationOffer { blueprintVersionId: string; name?: string }
export interface SimulationHistoryItem { attemptId: string; state: SimulationView['state']; score?: { correctCount: number } | null }

export class SimulationError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message) }
}

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Phiên đăng nhập đã thay đổi. Hãy đăng nhập lại.',
  ATTEMPT_CLOSED: 'Bài thi đã khép lại; thay đổi chưa được ghi nhận.',
  SECTION_LOCKED: 'Phần thi này đã hết giờ và chỉ còn xem lại.',
  REVISION_CONFLICT: 'Câu trả lời đã thay đổi ở nơi khác. Đã tải lại trạng thái mới nhất.',
  RATE_LIMITED: 'Bạn đang thao tác quá nhanh. Hãy đợi rồi thử lại.',
  NETWORK: 'Chưa nhận được xác nhận từ máy chủ. Hãy thử lại đúng thao tác vừa làm.',
}

const csrf = () => document.cookie.split(';').map((part) => part.trim())
  .find((part) => part.startsWith('tsa_local_csrf='))?.slice('tsa_local_csrf='.length) ?? ''

const pendingKeys = new Map<string, string>()

async function request<T>(path: string, body?: unknown, explicitKey?: string): Promise<T> {
  const nonce = csrf()
  const headers: Record<string, string> = { accept: 'application/json' }
  const signature = path + JSON.stringify(body ?? null)
  let key: string | undefined
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    headers['x-csrf-token'] = nonce
    key = explicitKey ?? pendingKeys.get(signature) ?? crypto.randomUUID()
    pendingKeys.set(signature, key)
    headers['idempotency-key'] = key
  }
  let response: Response
  let data: { error?: { code?: string } } & Record<string, unknown>
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : path.includes('/answers/') ? 'PUT' : 'POST',
      headers, cache: 'no-store', credentials: 'same-origin',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    data = await response.json()
  } catch {
    throw new SimulationError(MESSAGES.NETWORK, 'NETWORK', 0)
  }
  if (csrf() !== nonce) throw new SimulationError(MESSAGES.UNAUTHENTICATED, 'UNAUTHENTICATED', 401)
  if (!response.ok) {
    if (response.status < 500 && response.status !== 429) pendingKeys.delete(signature)
    const code = data.error?.code ?? 'REQUEST_FAILED'
    throw new SimulationError(MESSAGES[code] ?? 'Yêu cầu chưa hoàn tất. Hãy thử lại.', code, response.status)
  }
  pendingKeys.delete(signature)
  return data as T
}

export const simulationApi = {
  catalog: () => request<{ items: SimulationOffer[] }>('/api/v3/catalog?limit=100').then((value) => value.items),
  history: () => request<{ items: SimulationHistoryItem[] }>('/api/v3/attempts?limit=100').then((value) => value.items),
  read: (id: string) => request<SimulationView>(`/api/v3/attempts/${encodeURIComponent(id)}`),
  result: (id: string) => request<SimulationResult>(`/api/v3/attempts/${encodeURIComponent(id)}/result`),
  create: (blueprintVersionId: string) => request<{ attemptId: string }>('/api/v3/attempts', { blueprintVersionId }),
  start: (id: string) => request<unknown>(`/api/v3/attempts/${encodeURIComponent(id)}/start`, {}),
  switchSection: (id: string, sectionId: SectionId) => request<unknown>(`/api/v3/attempts/${encodeURIComponent(id)}/section`, { sectionId }),
  save: (id: string, slotId: string, expectedRevision: number, value: RawValue) =>
    request<unknown>(`/api/v3/attempts/${encodeURIComponent(id)}/answers/${encodeURIComponent(slotId)}`, { expectedRevision, value }),
  submit: (id: string) => request<unknown>(`/api/v3/attempts/${encodeURIComponent(id)}/submit`, {}),
}

/** Raw server values to the shape the shared answer controls read. */
export function toAnswerValue(slotId: string, value: RawValue | undefined, revision: number): AnswerValue | undefined {
  if (!value) return undefined
  if (value.type === 'TRUE_FALSE_GROUP') {
    return { slotId, type: value.type, revision, statementValues: Object.entries(value.values)
      .filter(([, item]) => typeof item === 'boolean').map(([statementId, item]) => ({ statementId, value: item as boolean })) }
  }
  return { slotId, revision, ...value } as AnswerValue
}

/** Shared answer-control input to the raw value the simulation API stores. */
export function toRawValue(slot: Slot, input: unknown): RawValue {
  const value = input as Record<string, unknown>
  switch (slot.interaction.type) {
    case 'SINGLE_CHOICE': return { type: 'SINGLE_CHOICE', optionId: (value.optionId as string | null) ?? null }
    case 'MULTIPLE_CHOICE': return { type: 'MULTIPLE_CHOICE', optionIds: (value.optionIds as string[]) ?? [] }
    case 'TRUE_FALSE_GROUP': {
      const chosen = new Map(((value.statementValues as { statementId: string; value: boolean }[]) ?? []).map((item) => [item.statementId, item.value]))
      return { type: 'TRUE_FALSE_GROUP', values: Object.fromEntries(slot.interaction.statements.map(({ id }) => [id, chosen.get(id) ?? null])) }
    }
    default: return value as RawValue
  }
}
