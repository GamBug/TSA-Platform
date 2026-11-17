// Type declarations for the existing, tested browser modules this app reuses unchanged.

declare module '@legacy/persistent-api.js' {
  import type { StudentApi } from '@/api/types'
  export function createPersistentApi(options?: { apiVersion?: 'v1' | 'v2' | 'v4' }): StudentApi
}

declare module '@legacy/demo-notice.js' {
  export interface DemoNotice { contentMode: 'PUBLISHED' | 'REHEARSAL'; sourceCredit: { vi: string; en: string } }
  export function loadDemoNotice(): Promise<DemoNotice | null>
}
