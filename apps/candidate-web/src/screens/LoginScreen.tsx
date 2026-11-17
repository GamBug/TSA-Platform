import React from 'react'
import { buttonClass, DemoNoticePanel, Notice } from '@/ui/Shell'

const ACCOUNTS = [
  { key: 'studentA' as const, label: 'Hồ sơ tổng hợp A' },
  { key: 'studentB' as const, label: 'Hồ sơ tổng hợp B' },
]

export function LoginScreen({ busy, message, onLogin }: {
  busy: boolean
  message: string | null
  onLogin: (actor: 'studentA' | 'studentB') => void
}) {
  return (
    <main className="flex-1 grid grid-cols-1 lg:grid-cols-[176px_1fr]">
      <div className="hidden lg:block notebook-margin-lg px-5 py-10 text-xs font-semibold text-ink-secondary">Trang 01 · Đăng nhập</div>
      <section className="px-5 py-10 sm:px-10 sm:py-14 max-w-[760px]" data-testid="login">
        <p className="text-xs font-semibold text-ink-secondary mb-3">Vở luyện tập đánh giá tư duy bậc THPT</p>
        <h1 tabIndex={-1} className="font-display text-[32px] sm:text-[48px] leading-[1.1] font-semibold text-ink tracking-[-0.02em]">
          Chọn hồ sơ để bắt đầu luyện tập
        </h1>
        <p className="mt-4 text-[16px] leading-[1.68] text-ink-secondary max-w-[60ch]">
          Bản demo cục bộ dùng tài khoản kiểm thử tổng hợp. Đồng hồ và câu trả lời do máy chủ ghi nhận; không có tài khoản thật nào được tạo.
        </p>
        {message && <div className="mt-6"><Notice tone="info" testId="login-message">{message}</Notice></div>}
        <div className="mt-8 flex flex-wrap gap-3">
          {ACCOUNTS.map((account) => (
            <button key={account.key} type="button" disabled={busy} data-testid={`login-${account.key}`}
              onClick={() => onLogin(account.key)} className={buttonClass.secondary}>
              Đăng nhập · {account.label}
            </button>
          ))}
        </div>
        <div className="mt-10"><DemoNoticePanel /></div>
      </section>
    </main>
  )
}
