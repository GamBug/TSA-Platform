import React from 'react'
import { buttonClass, DemoNoticePanel, Notice } from '@/ui/Shell'
import { IconArrowRight } from '@/components/Icons'

const ACCOUNTS = [
  { key: 'studentA' as const, label: 'Hồ sơ tổng hợp A' },
  { key: 'studentB' as const, label: 'Hồ sơ tổng hợp B' },
]

export function LoginScreen({ busy, message, publicDemo, onLogin, onGuest }: {
  busy: boolean
  message: string | null
  publicDemo: boolean
  onLogin: (actor: 'studentA' | 'studentB') => void
  onGuest: () => void
}) {
  return (
    <main className="flex-1 grid grid-cols-1 lg:grid-cols-[176px_1fr]">
      <div className="hidden lg:block notebook-margin-lg px-5 py-10 text-xs font-semibold text-ink-secondary">{publicDemo ? 'Trang 01 · Chào mừng' : 'Trang 01 · Đăng nhập'}</div>
      <section className="px-5 py-10 sm:px-10 sm:py-14 max-w-[760px]" data-testid="login">
        <p className="text-xs font-semibold text-ink-secondary mb-3">Vở luyện tập đánh giá tư duy bậc THPT</p>
        <h1 tabIndex={-1} className="font-display text-[32px] sm:text-[48px] leading-[1.1] font-semibold text-ink tracking-[-0.02em]">
          {publicDemo ? 'Luyện tập TSA, không cần đăng ký' : 'Chọn hồ sơ để bắt đầu luyện tập'}
        </h1>
        {publicDemo ? (
          <ul className="mt-4 text-[16px] leading-[1.68] text-ink-secondary max-w-[60ch] list-disc pl-5 space-y-1" data-testid="landing-intro">
            <li>Đây là trang luyện tập không chính thức, phi lợi nhuận, dành cho học sinh THPT tự ôn bài đánh giá tư duy.</li>
            <li>Bạn có thể làm một bài thi thử đầy đủ 100 câu (Toán, Đọc hiểu, Khoa học) hoặc luyện riêng từng phần; mỗi phần có đồng hồ do máy chủ tính.</li>
            <li>Không cần tài khoản hay thông tin cá nhân. Phiên luyện tập là tạm thời: bài làm không được lưu lâu dài và có thể mất khi máy chủ khởi động lại.</li>
          </ul>
        ) : (
          <p className="mt-4 text-[16px] leading-[1.68] text-ink-secondary max-w-[60ch]">
            Bản demo cục bộ dùng tài khoản kiểm thử tổng hợp. Đồng hồ và câu trả lời do máy chủ ghi nhận; không có tài khoản thật nào được tạo.
          </p>
        )}
        {message && <div className="mt-6"><Notice tone="info" testId="login-message">{message}</Notice></div>}
        <div className="mt-8 flex flex-wrap gap-3">
          {publicDemo ? (
            <button type="button" disabled={busy} data-testid="guest-start" onClick={onGuest} className={buttonClass.primary}>
              Bắt đầu luyện tập <IconArrowRight size={14} />
            </button>
          ) : ACCOUNTS.map((account) => (
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
