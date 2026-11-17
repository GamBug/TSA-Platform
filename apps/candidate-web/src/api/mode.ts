import { createPersistentApi } from '@legacy/persistent-api.js'
import type { StudentApi } from './types'

// Each practice mode maps to one existing API version; nothing here changes server behavior.
export type PracticeMode = 'practice' | 'numeric' | 'interactions' | 'simulation'

export const MODES: Record<PracticeMode, { label: string; description: string; apiVersion: 'v1' | 'v2' | 'v4' | 'v3' }> = {
  practice: { label: 'Luyện tập theo phần', description: 'Toán học, Đọc hiểu và Khoa học — trắc nghiệm và đúng/sai.', apiVersion: 'v1' },
  numeric: { label: 'Điền đáp án số', description: 'Câu hỏi trả lời bằng một số thập phân.', apiVersion: 'v2' },
  interactions: { label: 'Điền khuyết & ghép nối', description: 'Điền vào chỗ trống và kéo thả ghép hai cột.', apiVersion: 'v4' },
  simulation: { label: 'Thi thử đầy đủ', description: '100 câu, ba phần thi với đồng hồ riêng.', apiVersion: 'v3' },
}

export function readMode(search = window.location.search): PracticeMode {
  const value = new URLSearchParams(search).get('mode')
  return value === 'numeric' || value === 'interactions' || value === 'simulation' ? value : 'practice'
}

export function modeHref(mode: PracticeMode): string {
  return mode === 'practice' ? '/student/' : `/student/?mode=${mode}`
}

const apis = new Map<string, StudentApi>()

/** One client per API version, so its identity and revision caches stay consistent for the page. */
export function apiFor(mode: PracticeMode): StudentApi {
  const version = MODES[mode].apiVersion
  const clientVersion = version === 'v3' ? 'v1' : version
  let api = apis.get(clientVersion)
  if (!api) {
    api = createPersistentApi({ apiVersion: clientVersion })
    apis.set(clientVersion, api)
  }
  return api
}
