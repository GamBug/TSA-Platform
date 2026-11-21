import { createPersistentApi } from '@legacy/persistent-api.js'
import type { StudentApi } from './types'

// Students choose a single-section test (v1) or the full 40/20/40 test (v3); nothing here changes server behavior.
export type PracticeMode = 'practice' | 'simulation'

export const MODES: Record<PracticeMode, { label: string; description: string; apiVersion: 'v1' | 'v3' }> = {
  practice: { label: 'Thi từng phần', description: 'Ba phần thi riêng, đúng số câu và thời gian như bài thi thật.', apiVersion: 'v1' },
  simulation: { label: 'Thi thử đầy đủ', description: '100 câu, ba phần thi với đồng hồ riêng.', apiVersion: 'v3' },
}

/** Retired mode links (numeric, cloze/matching) open the section tests. */
export function readMode(search = window.location.search): PracticeMode {
  return new URLSearchParams(search).get('mode') === 'simulation' ? 'simulation' : 'practice'
}

export function modeHref(mode: PracticeMode): string {
  return mode === 'practice' ? '/student/' : `/student/?mode=${mode}`
}

let api: StudentApi | null = null

/** One v1 client for the page: sign-in, the session and section tests. The full test uses its own client. */
export function apiFor(_mode: PracticeMode): StudentApi {
  api ??= createPersistentApi({ apiVersion: 'v1' })
  return api
}
