// Client for the local admin routes (/local/admin/*). They exist only on the loopback demo.
import type { ContentBlock } from './types'

export type Section = 'MATH' | 'READING' | 'SCIENCE'
export const SECTIONS: Section[] = ['MATH', 'READING', 'SCIENCE']
export const SECTION_NAMES: Record<Section, string> = { MATH: 'Math', READING: 'Reading', SCIENCE: 'Science' }

export interface QuestionSummary {
  versionId: string; questionId: string; versionNo: number; section: Section; state: string; eligible: boolean
  interactionType: string; domainId: string; taxonomy: string; taxonomyName: string; exchangeId: string | null
  hasPassage: boolean; hasKey: boolean; preview: string; createdAt: string
}

export interface QuestionDetail extends Omit<QuestionSummary, 'hasPassage' | 'hasKey' | 'preview'> {
  schemaVersion: string; quarantineReason: string | null; skillIds: string[]; cognitiveLevel: string | null
  difficulty: { target?: string | null } | null
  content: ContentBlock[]; interaction: Record<string, any>; passage: ContentBlock[] | null
  answerKey: Record<string, any> | null; explanation: ContentBlock[]; origin: string; createdBy: string
  taxonomyVersionId: string; batchId: string | null; sources: string[]
}

export interface Overview {
  contentMode: 'PUBLISHED' | 'REHEARSAL'; readAt: string; total: number
  counts: Partial<Record<Section, Record<string, number>>>; practicePoolTaxonomyId: string | null
  jobs: { available: boolean; running: string | null }; generation: { configured: boolean; model: string }; canRefresh: boolean
}

export interface JobResult { ok: boolean; code?: string; exitCode?: number; output: string; confirmation: string | null }

export interface InboxFile { name: string; bytes: number; modifiedAt: string; errors?: string | null }
export type InboxListing = Record<Section, Record<'pending' | 'imported' | 'rejected', { count: number; items: InboxFile[] }>>

export interface GenerateResult {
  ok: boolean; code?: string; message?: string; status?: number; file?: string; batchId?: string; model?: string
  questions?: number; problems?: string[]; report?: string
}

export class AdminError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message) }
}

let csrf = ''

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const headers: Record<string, string> = { accept: 'application/json' }
  if (method === 'POST') { headers['content-type'] = 'application/json'; if (csrf) headers['x-admin-csrf'] = csrf }
  let response: Response
  try {
    response = await fetch(`/local/admin/${path}`, { method, headers, credentials: 'same-origin', cache: 'no-store',
      ...(method === 'POST' ? { body: JSON.stringify(init.body ?? {}) } : {}) })
  } catch {
    throw new AdminError('The local demo server is not reachable.', 'NETWORK', 0)
  }
  const data = await response.json().catch(() => null) as any
  if (!response.ok && !(path === 'generate' && data && typeof data.ok === 'boolean')) {
    const code = typeof data?.error === 'string' ? data.error : 'REQUEST_FAILED'
    const message = typeof data?.message === 'string' ? data.message
      : response.status === 404 ? 'The admin page exists only on the local demo (npm start on this computer).'
      : response.status === 401 || response.status === 403 ? 'Your admin session ended. Sign in again.' : `Request failed (${code}).`
    throw new AdminError(message, code, response.status)
  }
  return data as T
}

export async function adminSession(): Promise<boolean> {
  const data = await call<{ authenticated: boolean; csrf?: string }>('session')
  csrf = data.csrf ?? ''
  return data.authenticated
}

export async function adminLogin(username: string, password: string): Promise<void> {
  const data = await call<{ csrf: string }>('login', { method: 'POST', body: { username, password } })
  csrf = data.csrf
}

export async function adminLogout(): Promise<void> {
  try { await call('logout', { method: 'POST' }) } finally { csrf = '' }
}

export const loadOverview = () => call<Overview>('overview')
export const loadQuestions = () => call<{ readAt: string; items: QuestionSummary[] }>('questions')
export const loadQuestion = (id: string) => call<QuestionDetail>(`question?id=${encodeURIComponent(id)}`)
export const adminImageUrl = (assetVersionId: string) => `/local/admin/image?id=${encodeURIComponent(assetVersionId)}`
export const loadInbox = () => call<InboxListing>('inbox')
export const saveInboxFile = (section: Section, fileName: string, text: string) =>
  call<{ ok: true; name: string }>('inbox/file', { method: 'POST', body: { section, fileName, text } })
export const runInbox = (confirm?: string) => call<JobResult>('inbox/run', { method: 'POST', body: confirm ? { confirm } : {} })
export const setupPool = (confirm?: string) => call<JobResult>('pool/setup', { method: 'POST', body: confirm ? { confirm } : {} })
export const runPublish = (options: { section: Section | null; keepOneOfTwins: boolean; confirm?: string }) =>
  call<JobResult>('publish', { method: 'POST', body: { ...options, ...(options.section ? {} : { section: undefined }) } })
export const refreshBank = () => call<Overview>('refresh', { method: 'POST' })
export const generate = (section: Section, topic: string, count: number) =>
  call<GenerateResult>('generate', { method: 'POST', body: { section, topic, count } })
