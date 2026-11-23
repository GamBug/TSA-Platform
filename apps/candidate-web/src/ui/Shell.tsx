import React, { useEffect, useState } from 'react'
import { loadDemoNotice, type DemoNotice } from '@legacy/demo-notice.js'
import { MODES, modeHref, type PracticeMode } from '@/api/mode'
import { IconGrid } from '@/components/Icons'

export function Masthead({ mode, actorLabel, onLogout, sticky = true }: { mode: PracticeMode; actorLabel?: string; onLogout?: () => void; sticky?: boolean }) {
  return (
    <header className={`${sticky ? 'sticky top-0' : 'relative'} z-30 bg-paper border-b border-ink`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <a href={modeHref('practice')} className="inline-flex items-center min-h-[44px] font-display text-lg sm:text-xl font-bold text-ink tracking-tight">TSA Practice</a>
          <span className="hidden sm:inline text-xs text-ink-secondary border-l border-rule-strong pl-3">Bản luyện tập không chính thức</span>
        </div>
        <nav aria-label="Chế độ luyện tập" className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(MODES) as PracticeMode[]).map((key) => (
            <a
              key={key}
              href={modeHref(key)}
              aria-current={key === mode ? 'page' : undefined}
              data-testid={`mode-${key}`}
              className={`px-3 min-h-[44px] inline-flex items-center text-xs font-semibold border rounded-[3px] transition-colors ${
                key === mode ? 'bg-ink text-paper-sheet border-ink' : 'bg-paper-sheet text-ink border-rule-strong hover:border-ink'
              }`}
            >
              {MODES[key].label}
            </a>
          ))}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              data-testid="logout"
              className="ml-1 px-3 min-h-[44px] text-xs font-semibold text-pen-red border border-pen-red bg-paper-sheet hover:bg-pen-red-wash rounded-[3px] cursor-pointer"
            >
              Đăng xuất{actorLabel ? ` · ${actorLabel}` : ''}
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

/** Unofficial, non-profit and content-source notice, shown only when the demo server supplies one. */
export function DemoNoticePanel() {
  const [notice, setNotice] = useState<DemoNotice | null>(null)
  useEffect(() => {
    let alive = true
    loadDemoNotice().then((value) => { if (alive) setNotice(value) }, () => {})
    return () => { alive = false }
  }, [])
  if (!notice) return null
  const rehearsal = notice.contentMode === 'REHEARSAL'
  return (
    <aside data-testid="demo-notice" aria-label="Thông tin về trang luyện tập"
      className={`${rehearsal ? 'demo-notice--rehearsal ' : ''}border border-rule border-l-[3px] border-l-ochre bg-ochre-wash px-4 py-3 text-[13px] leading-relaxed text-ink rounded-[3px]`}>
      {rehearsal && <strong data-testid="demo-notice-mode" className="block mb-1 text-xs tracking-wide">DIỄN TẬP · NỘI DUNG TỔNG HỢP</strong>}
      <ul className="list-disc pl-5">
        <li data-testid="demo-notice-unofficial">Luyện tập không chính thức — không liên kết với Đại học Bách khoa Hà Nội (HUST).</li>
        <li data-testid="demo-notice-nonprofit">Dự án phi lợi nhuận: không quảng cáo, không thu phí.</li>
        <li data-testid="demo-notice-source">Nguồn nội dung: {notice.sourceCredit.vi}</li>
      </ul>
    </aside>
  )
}

export function PageFooter() {
  return (
    <footer className="mt-auto border-t border-rule bg-paper px-4 sm:px-8 py-4 flex flex-wrap justify-between gap-2 text-xs text-ink-secondary">
      <span>TSA Practice — bản luyện tập không chính thức cho học sinh THPT tự ôn tập. <a href="/student/?page=about" data-testid="about-link" className="underline underline-offset-2 text-ink inline-flex items-center min-h-[44px] px-1">Giới thiệu</a></span>
      <span className="tabular-figures text-ink-muted">Phím tắt khi làm bài: A–D chọn · N câu sau · P câu trước · F đánh dấu</span>
    </footer>
  )
}

export function Notice({ tone = 'info', children, testId }: { tone?: 'info' | 'error' | 'success'; children: React.ReactNode; testId?: string }) {
  const styles = {
    info: 'border-l-ochre bg-ochre-wash',
    error: 'border-l-pen-red bg-pen-red-wash',
    success: 'border-l-ink-green bg-ink-green-wash',
  }[tone]
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} data-testid={testId}
      className={`border border-rule border-l-[3px] ${styles} px-4 py-3 text-sm text-ink rounded-[3px]`}>
      {children}
    </p>
  )
}

export const buttonClass = {
  primary: 'inline-flex items-center justify-center gap-2 px-5 min-h-[44px] text-sm font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  ink: 'inline-flex items-center justify-center gap-2 px-5 min-h-[44px] text-sm font-semibold bg-ink text-paper-sheet border border-ink hover:bg-ink-secondary rounded-[3px] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  secondary: 'inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-sm font-semibold bg-paper-sheet text-ink border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
}

/** Shows or hides the question grid on wide screens; on phones the grid sits below the question and stays. */
export function PanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={!open} onClick={onToggle} data-testid="panel-toggle"
      className="hidden lg:inline-flex items-center gap-2 px-3 min-h-[44px] text-xs font-semibold border border-rule-strong bg-paper-sheet text-ink hover:border-ink rounded-[3px] cursor-pointer">
      <IconGrid size={14} /> {open ? 'Ẩn bảng câu hỏi' : 'Hiện bảng câu hỏi'}
    </button>
  )
}

/** Layout classes for a test screen: the question area, the optional passage split and the grid column. */
export function testLayout(open: boolean, passage: boolean) {
  return {
    body: open ? 'flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] min-h-0' : 'flex-1 grid grid-cols-1 min-h-0',
    width: passage ? 'max-w-[1440px]' : 'max-w-[960px]',
    // With the grid hidden there is room for passage and question side by side from 1024 px; otherwise from 1280 px.
    split: open ? 'grid grid-cols-1 gap-6 xl:grid-cols-2 items-start' : 'grid grid-cols-1 gap-6 lg:grid-cols-2 items-start',
    aside: open ? '' : 'lg:hidden',
  }
}
