import React from 'react'
import type { CatalogProfile } from '@/api/types'
import { MODES, type PracticeMode } from '@/api/mode'
import { buttonClass, DemoNoticePanel, Notice } from '@/ui/Shell'
import { IconArrowRight } from '@/components/Icons'

const DOMAIN_NAMES: Record<string, string> = { MATH: 'Tư duy Toán học', READING: 'Tư duy Đọc hiểu', SCIENCE: 'Tư duy Khoa học' }

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes >= 1 ? `${minutes} phút` : `${seconds} giây`
}

export function CatalogScreen({ mode, profiles, busy, message, onStart }: {
  mode: PracticeMode
  profiles: CatalogProfile[] | null
  busy: boolean
  message: string | null
  onStart: (profile: CatalogProfile) => void
}) {
  return (
    <main className="flex-1 grid grid-cols-1 lg:grid-cols-[176px_1fr]">
      <div className="hidden lg:block notebook-margin-lg px-5 py-10 text-xs font-semibold text-ink-secondary">Trang 02 · Mục lục</div>
      <section className="px-5 py-8 sm:px-10 sm:py-12 max-w-[1040px]" data-testid="catalog">
        <p className="text-xs font-semibold text-pen-red tracking-wide uppercase mb-2">{MODES[mode].label}</p>
        <h1 tabIndex={-1} className="font-display text-[30px] sm:text-[42px] leading-[1.1] font-semibold text-ink tracking-[-0.02em]">
          Mục lục bài luyện tập
        </h1>
        <p className="mt-3 text-[15px] leading-[1.68] text-ink-secondary max-w-[62ch]">{MODES[mode].description} Đồng hồ chạy liên tục sau khi bắt đầu; tải lại trang không dừng đồng hồ.</p>
        <div className="mt-6"><DemoNoticePanel /></div>
        {message && <div className="mt-4"><Notice tone="error" testId="catalog-message">{message}</Notice></div>}

        <div className="mt-8 border-t border-ink">
          {profiles === null && <p className="py-6 text-sm text-ink-secondary" role="status">Đang tải mục lục…</p>}
          {profiles?.length === 0 && (
            <p className="py-6 text-sm text-ink-secondary" data-testid="catalog-empty">Chưa có bài luyện tập nào được phát hành cho chế độ này.</p>
          )}
          <ol className="divide-y divide-rule">
            {profiles?.map((profile, index) => (
              <li key={profile.blueprintVersionId} className="grid grid-cols-[40px_1fr] sm:grid-cols-[48px_1fr_auto] gap-x-4 gap-y-3 py-5 items-center" data-testid="catalog-item">
                <span className="tabular-figures text-sm font-bold text-pen-red self-start pt-1">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <h2 className="font-display text-[22px] font-semibold text-ink leading-tight">{profile.name || DOMAIN_NAMES[profile.domain]}</h2>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-secondary">
                    <span>{DOMAIN_NAMES[profile.domain]}</span>
                    <span aria-hidden="true" className="flex-1 min-w-8 border-b border-dotted border-rule-strong translate-y-[-3px]" />
                    <span className="tabular-figures text-ink">{profile.questionCount} câu · {formatDuration(profile.durationSeconds)}</span>
                  </p>
                  {!profile.available && <p className="mt-1 text-xs text-ochre">Chưa mở hoặc đã đóng</p>}
                </div>
                <button type="button" disabled={busy || !profile.available} onClick={() => onStart(profile)}
                  data-testid={`start-${profile.domain}`} className={`${buttonClass.primary} col-start-2 sm:col-start-3 justify-self-start`}>
                  Bắt đầu <IconArrowRight size={14} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  )
}
